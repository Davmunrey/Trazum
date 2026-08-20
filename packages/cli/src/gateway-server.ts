/**
 * The proxy that stands in the path, and does as little as possible there.
 *
 * The decision lives in `@trazum/core`'s `gatewayDecision`, which never sees a
 * prompt and cannot return a modified request. This file moves bytes: read a
 * body, ask, and either forward it **unchanged** or answer with the refusal.
 * The split is the safety property — everything that could go wrong in a
 * judgement is tested without a socket, and everything that could go wrong on
 * a socket has no judgement in it.
 *
 * **Loopback only, and the address is not a flag.** Same posture as `serve`
 * since 1.44, and more load-bearing here: this thing has somebody's provider
 * credential passing through it. `127.0.0.1` is compiled in.
 *
 * **The credential is not even borrowed.** The caller's own `authorization`
 * and `x-api-key` headers are forwarded untouched and never read, never
 * stored, never logged, and never put in a URL. Trazum holds no key for the
 * gateway and has no way to make a call of its own through it — which is a
 * stronger promise than the connector's *borrowed, never held*, and the right
 * one for a component sitting between somebody and their provider.
 *
 * **The upstream is compiled in.** A flag naming the host would turn this into
 * a credential-forwarding open proxy: anything that could rewrite a config on
 * disk could point a company's API key at a machine it chose. `checkedEndpoint`
 * has guarded Trazum's outbound calls on that principle since 1.14, and here
 * there is no caller-supplied endpoint at all.
 *
 * **Nothing about the payload is written down.** The body is read to count
 * tokens and to find the model, then forwarded and dropped. It is never
 * logged, never stored, and never included in a refusal — the store has held
 * aggregates since 1.42 and standing in the path changes nothing about that.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { estimateTokens, gatewayDecision, usageFromResponse } from '@trazum/core';
import type { GatewayDecision, GatewayPolicy, GatewayStanding, PricingCatalogue } from '@trazum/core';

/** Compiled in. See the module note. */
export const BIND_HOST = '127.0.0.1';

export const DEFAULT_GATEWAY_PORT = 7318;

/**
 * Bodies larger than this are refused unread.
 *
 * Larger than `serve`'s limit because a real request carries a real prompt,
 * and smaller than unbounded because a proxy that buffers whatever it is
 * handed is a memory exhaustion away from taking down the application it was
 * installed to protect.
 */
export const MAX_GATEWAY_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Where each provider actually is, and the one path this speaks for it.
 *
 * Deliberately narrow. A gateway that forwarded any path would be a general
 * proxy for somebody's API key, and the budget decision only has meaning for
 * the endpoint that spends tokens.
 */
export const UPSTREAMS: Readonly<Record<string, { origin: string; path: string }>> = {
  anthropic: { origin: 'https://api.anthropic.com', path: '/v1/messages' },
  openai: { origin: 'https://api.openai.com', path: '/v1/chat/completions' },
};

/**
 * Headers Trazum adds or removes. Everything else the caller sent is forwarded
 * verbatim, including their credential, which this never reads.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

export interface GatewayContext {
  provider: string;
  catalogue: PricingCatalogue;
  policy: GatewayPolicy;
  /** Where the budget stands, refreshed by the caller — never read per request. */
  standing: () => GatewayStanding | null;
  /**
   * Called after a forwarded call returns, with the provider's own counts.
   *
   * Counts only. There is no parameter here that could carry a prompt, which
   * is what makes "nothing about the payload is written down" a fact about the
   * interface rather than a discipline.
   */
  record: (measured: {
    model: string;
    label: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    substituted: boolean;
  }) => void;
  /** A line for the operator's terminal. Never given a body, ever. */
  note: (line: string) => void;
  /** Injected so the proxy is testable against a stub upstream. */
  fetchImpl?: typeof fetch;
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.length;
    if (size > MAX_GATEWAY_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * What the request is asking for, without keeping any of it.
 *
 * The token count is the heuristic estimator's — the same one every other
 * estimate in this product uses, with the same documented error band. Counting
 * exactly would mean an API call to count before the API call, which is a
 * round trip in a hot path to make a budget decision marginally sharper.
 *
 * The returned object holds no text. That is the point: everything downstream
 * of here, including the decision and the record, is structurally incapable of
 * carrying a prompt.
 */
function describe(body: string, provider: string): {
  model: string;
  inputTokens: number | null;
  maxOutputTokens: number | null;
  label: string | null;
} | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const request = parsed as Record<string, unknown>;
  if (typeof request.model !== 'string') return null;

  // Every text field the wire format puts in front of the model, counted and
  // then dropped. `JSON.stringify` of the messages over-counts by the
  // structural characters, which is the safe direction for a budget: an
  // estimate that runs high refuses slightly early rather than allowing
  // slightly late.
  const parts: string[] = [];
  if (typeof request.system === 'string') parts.push(request.system);
  if (Array.isArray(request.messages)) parts.push(JSON.stringify(request.messages));
  if (Array.isArray(request.input)) parts.push(JSON.stringify(request.input));

  const text = parts.join('\n');
  const max = provider === 'anthropic' ? request.max_tokens : request.max_completion_tokens ?? request.max_tokens;

  return {
    model: request.model,
    inputTokens: text === '' ? null : estimateTokens(text),
    maxOutputTokens: typeof max === 'number' && Number.isFinite(max) ? max : null,
    /**
     * `metadata.trazum_label`, and nothing inferred.
     *
     * A label is what makes a per-workload bill possible, and guessing one
     * from a path or a user agent would attribute somebody's spend to a
     * workload they never named.
     */
    label: labelOf(request),
  };
}

function labelOf(request: Record<string, unknown>): string | null {
  const metadata = request.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  const label = (metadata as Record<string, unknown>).trazum_label;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}

/** The refusal, as the caller's SDK will receive it. */
function refusalBody(decision: Extract<GatewayDecision, { kind: 'refuse' }>): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      error: { type: 'trazum_budget_refusal', message: decision.because },
      reason: decision.reason,
      cause: decision.cause,
      restsOn: decision.restsOn,
      standing: decision.standing,
      estimatedUsd: decision.estimatedUsd,
      alternatives: decision.alternatives,
    },
    null,
    2,
  )}\n`;
}

export function buildGateway(context: GatewayContext): Server {
  const upstream = UPSTREAMS[context.provider];
  const doFetch = context.fetchImpl ?? fetch;

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      if (upstream === undefined) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(`${JSON.stringify({ error: 'no upstream configured for this provider' })}\n`);
        return;
      }
      if (request.method !== 'POST' || request.url !== upstream.path) {
        // Only the one path that spends tokens. A gateway forwarding anything
        // else is a general proxy for somebody's API key.
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(`${JSON.stringify({ error: 'not a path this gateway forwards' })}\n`);
        return;
      }

      const body = await readBody(request);
      if (body === null) {
        response.writeHead(413, { 'content-type': 'application/json' });
        response.end(`${JSON.stringify({ error: 'request body too large' })}\n`);
        return;
      }

      const described = describe(body, context.provider);
      if (described === null) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(`${JSON.stringify({ error: 'could not read a model out of this request' })}\n`);
        return;
      }

      const decision = gatewayDecision(
        { provider: context.provider, ...described },
        context.standing(),
        { catalogue: context.catalogue, policy: context.policy },
      );

      if (decision.kind === 'refuse') {
        /**
         * **402, deliberately, and never 429.**
         *
         * Every provider SDK retries a 429 automatically — that is what the
         * code means to them — so answering a budget refusal with one turns a
         * single refusal into a retry storm against a gateway that will refuse
         * every time. 402 Payment Required is both literally correct and in
         * nobody's default retry list.
         */
        response.writeHead(402, { 'content-type': 'application/json' });
        response.end(refusalBody(decision));
        context.note(`refused ${described.model}: ${decision.reason}`);
        return;
      }

      const outgoing = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (HOP_BY_HOP.has(name.toLowerCase()) || value === undefined) continue;
        outgoing.set(name, Array.isArray(value) ? value.join(', ') : value);
      }

      /**
       * The body forwarded is the body received, **byte for byte**, except on
       * a configured substitution — which replaces exactly one field and says
       * so in the record.
       */
      let forwarded = body;
      if (decision.kind === 'substitute') {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed.model = decision.to.id;
        forwarded = JSON.stringify(parsed);
        context.note(`substituted ${described.model} → ${decision.to.id}: ${decision.configuredReason}`);
      } else if (decision.unjudged !== null) {
        context.note(`forwarded unjudged (${decision.unjudged}): fail-open`);
      }

      let upstreamResponse: Response;
      try {
        upstreamResponse = await doFetch(`${upstream.origin}${upstream.path}`, {
          method: 'POST',
          headers: outgoing,
          body: forwarded,
        });
      } catch (error) {
        /**
         * The upstream is unreachable. This is **not** a budget refusal and
         * must not look like one: the caller needs to tell "your provider is
         * down" from "you are out of money", and a proxy that blurs them sends
         * somebody to fix the wrong thing.
         */
        response.writeHead(502, { 'content-type': 'application/json' });
        response.end(
          `${JSON.stringify({
            error: { type: 'trazum_upstream_unreachable', message: error instanceof Error ? error.message : String(error) },
          })}\n`,
        );
        return;
      }

      const text = await upstreamResponse.text();

      // Measured at the moment of the call, from the provider's own counts —
      // the reason this beats a connector, which reports the runaway after it
      // ran. Counts only reach `record`; the body is dropped here.
      let measured: unknown;
      try {
        measured = JSON.parse(text);
      } catch {
        measured = null;
      }
      const usage = usageFromResponse(context.provider, measured);
      if (usage !== null) {
        context.record({
          model: decision.kind === 'substitute' ? decision.to.id : described.model,
          label: described.label,
          substituted: decision.kind === 'substitute',
          ...usage,
        });
      }

      const back: Record<string, string> = {};
      upstreamResponse.headers.forEach((value, name) => {
        if (!HOP_BY_HOP.has(name.toLowerCase())) back[name] = value;
      });
      response.writeHead(upstreamResponse.status, back);
      response.end(text);
    })();
  });
}

export function listenGateway(
  server: Server,
  where: { port: number } | { socket: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    if ('socket' in where) {
      server.listen(where.socket, () => resolve(where.socket));
      return;
    }
    server.listen(where.port, BIND_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : where.port;
      resolve(`http://${BIND_HOST}:${port}`);
    });
  });
}
