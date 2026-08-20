/**
 * The fetch half of the connector: credentials, pagination, and what went
 * missing.
 *
 * The transformation lives in `@trazum/core`, where it is testable without a
 * network. This module does the part that touches the outside world, and it
 * is written under three rules the rest of the product does not need:
 *
 * **A credential is borrowed, never held.** Keys are read from the environment
 * at the moment of the call and never written to a config, a cache, a report
 * or an error message. `redact` runs over everything that can reach a terminal
 * — a key pasted into a CI log by an error handler is a key that has to be
 * rotated, and the tool that leaked it is the tool that promised to save money.
 *
 * **The endpoint is not user-supplied.** Each provider has one fixed base URL
 * compiled in. Trazum's SSRF story has been, since 1.14, that a request body
 * must never *name* a host — it selects one. A usage connector that accepted
 * `--base-url` would hand that property back for the convenience of a
 * self-hosted proxy nobody has asked for yet.
 *
 * **A partial pull is a partial pull, out loud.** Rate limits, page caps and
 * windows the provider has aged out all return what was gathered, with the
 * gap named. A bill quietly short by an unknown amount is the failure this
 * repository refuses everywhere it can occur, and a paginated API is exactly
 * where it occurs.
 */

import { SAFE_FETCH_INIT } from '@trazum/core/node';
import { normalizeAnthropicUsage, normalizeOpenAIUsage } from '@trazum/core';
import type { ConnectorDescriptor, ConnectorPull, PullGap } from '@trazum/core';

/** Fixed, compiled in, never taken from the caller. See the module note. */
const ENDPOINTS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/organizations/usage_report/messages',
  openai: 'https://api.openai.com/v1/organizations/usage/completions',
};

/**
 * How many pages a single pull will walk before it stops and says so.
 *
 * A cap rather than an unbounded loop: a wrong window against a busy
 * organisation is otherwise a request storm against somebody's rate limit,
 * paid for by them. Reaching it is reported as a gap, never as a complete
 * bill.
 */
const MAX_PAGES = 50;

/** Requests in flight is always one: usage endpoints are strictly rate limited. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface CredentialSource {
  /** The environment variable the key came from — the *name*, never the value. */
  variable: string;
}

/**
 * Finds the credential without ever returning it to a caller that might print
 * it: the key stays inside this module, and the caller gets the variable name.
 */
export function findCredential(
  descriptor: ConnectorDescriptor,
  env: Record<string, string | undefined>,
): { key: string; source: CredentialSource } | null {
  for (const variable of descriptor.credentialEnv) {
    const value = env[variable];
    if (typeof value === 'string' && value.trim() !== '') {
      return { key: value.trim(), source: { variable } };
    }
  }
  return null;
}

/**
 * Removes credential material from anything on its way to a terminal.
 *
 * Two layers on purpose. The exact key is redacted because we hold it; the
 * shapes are redacted because an error body may quote a *different* key —
 * the one the caller mistyped, a key from a proxy's log line — and a leak
 * through somebody else's error message is still a leak through Trazum's
 * output.
 */
export function redact(text: string, key?: string): string {
  let out = text;
  if (key !== undefined && key.length >= 8) {
    out = out.split(key).join('[redacted]');
  }
  return out
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]');
}

function headersFor(provider: string, key: string): Record<string, string> {
  if (provider === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01', accept: 'application/json' };
  }
  return { authorization: `Bearer ${key}`, accept: 'application/json' };
}

function urlFor(provider: string, fromMs: number, toMs: number, page: string | null): string {
  const url = new URL(ENDPOINTS[provider]!);
  if (provider === 'anthropic') {
    url.searchParams.set('starting_at', new Date(fromMs).toISOString());
    url.searchParams.set('ending_at', new Date(toMs).toISOString());
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.append('group_by[]', 'model');
  } else {
    url.searchParams.set('start_time', String(Math.floor(fromMs / 1000)));
    url.searchParams.set('end_time', String(Math.floor(toMs / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.append('group_by[]', 'model');
    url.searchParams.set('limit', '31');
  }
  if (page !== null) url.searchParams.set('page', page);
  return url.toString();
}

export interface FetchUsageOptions {
  descriptor: ConnectorDescriptor;
  fromMs: number;
  toMs: number;
  env: Record<string, string | undefined>;
  /** Injected so the whole path is testable without a network. */
  fetchImpl?: typeof fetch;
}

export interface FetchUsageResult {
  pull: ConnectorPull;
  source: CredentialSource;
  pages: number;
}

/**
 * Pulls a window of usage, page by page, and reports what it could not get.
 *
 * Returns whatever was gathered when a page fails partway through: half a
 * month with the gap named beats an exception that throws away the half that
 * arrived, and beats a total that silently describes less traffic than the
 * caller asked about.
 */
export async function fetchProviderUsage(options: FetchUsageOptions): Promise<FetchUsageResult> {
  const { descriptor, fromMs, toMs, env, fetchImpl = fetch } = options;
  const found = findCredential(descriptor, env);
  if (found === null) {
    throw new Error(
      `No credential for ${descriptor.displayName}. Trazum reads it from the environment and never stores it — set ${descriptor.credentialEnv.join(' or ')} to ${descriptor.keyKind}. See ${descriptor.docs}.`,
    );
  }

  const gaps: PullGap[] = [];
  const payloads: unknown[] = [];
  let page: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const url = urlFor(descriptor.id, fromMs, toMs, page);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...SAFE_FETCH_INIT,
        method: 'GET',
        headers: headersFor(descriptor.id, found.key),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      gaps.push({
        kind: 'rate-limited',
        detail: `the request for page ${pages + 1} did not complete (${redact(message, found.key)}), so everything after it is missing from this window`,
      });
      break;
    }
    pages += 1;

    if (response.status === 429) {
      gaps.push({
        kind: 'rate-limited',
        detail: `the provider rate-limited page ${pages}, so this window stops early and the rest of it was not measured`,
      });
      break;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `${descriptor.displayName} refused the credential in ${found.source.variable} (HTTP ${response.status}). This endpoint needs ${descriptor.keyKind}; an ordinary API key cannot read the usage report.`,
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `${descriptor.displayName} returned HTTP ${response.status}: ${redact(body.slice(0, 400), found.key) || '(no body)'}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      gaps.push({
        kind: 'unreadable-entry',
        detail: `page ${pages} was not readable JSON, so its buckets are missing from this window`,
      });
      break;
    }
    payloads.push(payload);

    const more = (payload as { has_more?: unknown }).has_more === true;
    const next = (payload as { next_page?: unknown }).next_page;
    if (!more) break;
    if (typeof next !== 'string' || next === '') {
      gaps.push({
        kind: 'cursor-expired',
        detail: 'the provider said there was more and served no cursor to reach it, so this window is short by an unknown amount',
      });
      break;
    }
    page = next;
  }

  if (pages >= MAX_PAGES) {
    gaps.push({
      kind: 'page-limit',
      detail: `the pull stopped at ${MAX_PAGES} pages, so this window is incomplete — narrow it with --since and --until`,
    });
  }

  const normalize = descriptor.id === 'anthropic' ? normalizeAnthropicUsage : normalizeOpenAIUsage;
  const pulls = payloads.map((payload) => normalize(payload));
  const pull: ConnectorPull = {
    provider: descriptor.id,
    granularity: descriptor.granularity,
    buckets: pulls.flatMap((p) => p.buckets),
    window:
      pulls.length === 0
        ? null
        : {
            fromMs: Math.min(...pulls.filter((p) => p.window).map((p) => p.window!.fromMs), Infinity),
            toMs: Math.max(...pulls.filter((p) => p.window).map((p) => p.window!.toMs), -Infinity),
          },
    gaps: [...pulls.flatMap((p) => p.gaps), ...gaps],
    unavailable: descriptor.unavailable,
  };
  if (pull.window !== null && !Number.isFinite(pull.window.fromMs)) pull.window = null;

  return { pull, source: found.source, pages };
}
