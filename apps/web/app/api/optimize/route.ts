import { NextResponse } from 'next/server';

import {
  RULES,
  anthropicProvider,
  getModel,
  listModels,
  openAiCompatible,
  optimize,
  providerFromEnv,
  refineWithLlm,
  reorderForCache,
  resolveLocale,
  validateLlmEndpoint,
} from '@trazum/core';
import type {
  Locale,
  LlmProvider,
  ReorderResult,
  RuleId,
  RuleLevel,
  UsageProfile,
} from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
import type { WebMessages } from '../../../lib/i18n';

export const runtime = 'nodejs';

/** Size cap: stops an open tab from taking the process down. */
const MAX_PROMPT_CHARS = 400_000;

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------

/**
 * In-memory sliding window per IP. On serverless each instance keeps its own
 * counter, so the real limit can be somewhat looser: this is a barrier against
 * accidental abuse, not a billing quota.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    // Take the chance to purge expired entries so the map cannot grow forever.
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets) {
        if (now >= value.resetAt) rateBuckets.delete(key);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  bucket.count++;
  return bucket.count > RATE_MAX_REQUESTS;
}

// --------------------------------------------------------------------------
// SSRF protection
// --------------------------------------------------------------------------

/**
 * The endpoint accepts an LLM URL chosen by the client. Without this filter
 * anyone could use the deployed server to reach the internal network or the
 * cloud metadata service (SSRF).
 *
 * The decision itself lives in `@trazum/core`, where it is unit-tested; this
 * only turns the reason code into a sentence in the reader's language. In
 * development http and local hosts are allowed so you can test against an LLM
 * on your own machine — note that this is keyed off the build-time NODE_ENV
 * and never off anything in the request.
 */
function validateBaseUrl(raw: string, t: WebMessages): string | null {
  const rejection = validateLlmEndpoint(raw, {
    allowInsecure: process.env.NODE_ENV === 'development',
  });

  switch (rejection) {
    case null:
      return null;
    case 'invalid-url':
    case 'credentials-in-url':
      return t.api.invalidEndpointUrl;
    case 'insecure-scheme':
      return t.api.endpointMustBeHttps;
    case 'private-host':
      return t.api.endpointMustBePublic;
  }
}

interface RequestBody {
  prompt?: unknown;
  level?: unknown;
  locale?: unknown;
  usage?: Partial<UsageProfile>;
  disableRules?: unknown;
  /**
   * Rearrange the prompt so its stable instructions reach the cacheable prefix.
   *
   * Opt-in over HTTP for the same reason it is opt-in on the command line, and
   * the reason is worth stating rather than leaving in the diff: every other
   * transformation this endpoint performs deletes text whose absence is local,
   * and this one *moves* text, where order carries meaning. The caller has to
   * ask, and the response carries what was declined so they can judge it.
   *
   * Nothing about it is less safe here than in the CLI — it runs on the same
   * deterministic core, sends nothing anywhere, and returns the prompt
   * byte-identical when it cannot act — but "the browser did it quietly" is not
   * a thing this endpoint should ever be able to do.
   */
  reorder?: unknown;
  llm?: {
    enabled?: boolean;
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Locale for this request: what the caller asked for, falling back to the
 * browser's `Accept-Language`. Applies to the report and to this route's own
 * error messages, so a failure never arrives in a language the caller did not
 * choose.
 */
function localeOf(request: Request, body?: RequestBody): Locale {
  const requested = typeof body?.locale === 'string' ? body.locale : null;
  return resolveLocale(requested ?? request.headers.get('accept-language'));
}

/**
 * Builds the LLM provider for this request.
 *
 * Priority: whatever comes in the body (so endpoints can be tried from the
 * UI), otherwise the server's environment configuration. Keys arriving in the
 * body are used and discarded: never logged, never stored.
 */
function buildProvider(config: NonNullable<RequestBody['llm']>): LlmProvider | null {
  const { provider, baseUrl, model, apiKey } = config;

  if (provider === 'anthropic') {
    const key = apiKey || process.env.TRAZUM_LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return providerFromEnv();
    return anthropicProvider({ apiKey: key, ...(model ? { model } : {}) });
  }

  if (baseUrl && model) {
    return openAiCompatible({
      baseUrl,
      model,
      ...(apiKey || process.env.TRAZUM_LLM_API_KEY
        ? { apiKey: apiKey || process.env.TRAZUM_LLM_API_KEY! }
        : {}),
      name: 'llm',
    });
  }

  return providerFromEnv();
}

export async function POST(request: Request) {
  if (rateLimited(request)) {
    // No body has been read yet, so the header is all we have to go on.
    const t = getWebMessages(localeOf(request));
    return NextResponse.json({ error: t.api.rateLimited }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest(getWebMessages(localeOf(request)).api.invalidJson);
  }

  const locale = localeOf(request, body);
  const t = getWebMessages(locale);

  const { prompt } = body;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return badRequest(t.api.missingPrompt);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return badRequest(t.api.promptTooLong(MAX_PROMPT_CHARS.toLocaleString(t.numberLocale)));
  }

  const level: RuleLevel = body.level === 'aggressive' ? 'aggressive' : 'safe';

  const disableRules = Array.isArray(body.disableRules)
    ? body.disableRules.filter((id): id is string => typeof id === 'string')
    : [];
  const unknownRule = disableRules.find((id) => !RULES.some((r) => r.id === id));
  if (unknownRule) return badRequest(t.api.unknownRule(unknownRule));

  const usage = body.usage ?? {};
  if (usage.model && !listModels().some((m) => m.id === usage.model)) {
    return badRequest(t.api.unknownModel(usage.model));
  }

  try {
    // Before the rules, as in the CLI: the rearrangement is decided on the
    // prompt the author wrote, which is the one they will review it against.
    const reorder: ReorderResult | null =
      body.reorder === true
        ? reorderForCache(prompt, {
            minPrefixTokens: getModel(usage.model ?? '').cacheMinTokens,
          })
        : null;

    let result = optimize(reorder?.text ?? prompt, {
      level,
      usage,
      locale,
      disableRules: disableRules as RuleId[],
    });

    // The diff the browser draws compares `original` with `optimized`. Leaving
    // `original` as the rearrangement would show only the deletions and hide
    // the one change the caller has to make a judgement about.
    if (reorder !== null && reorder.moved.length > 0) {
      result = { ...result, original: prompt };
    }

    if (body.llm?.enabled) {
      if (body.llm.baseUrl) {
        const urlError = validateBaseUrl(body.llm.baseUrl, t);
        if (urlError) return badRequest(urlError);
      }
      const provider = buildProvider(body.llm);
      if (!provider) {
        return badRequest(t.api.llmNotConfigured);
      }
      result = await refineWithLlm(result, provider, { locale });
    }

    // `reorder` goes in whenever it was asked for, including when nothing
    // moved: a caller reading `optimized` is reading text in an order the author
    // did not write, and must not have to infer that from the diff.
    return NextResponse.json(reorder === null ? result : { ...result, reorder });
  } catch (error) {
    const message = error instanceof Error ? error.message : t.api.unexpected;
    // The failure usually comes from the external LLM, not from our code.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Metadata the UI needs to render its dropdowns. */
export async function GET() {
  return NextResponse.json({
    models: listModels(),
    llmConfiguredOnServer: providerFromEnv() !== null,
  });
}
