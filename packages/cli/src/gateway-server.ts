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

import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { estimateTokens, gatewayDecision, streamingUsageReader, usageFromResponse } from '@trazum/core';
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
  /**
   * DeepSeek's host is not a new fact: `scripts/measure-token-band.mjs` has
   * sent a real API key to `https://api.deepseek.com/chat/completions` since
   * the band harness learned a second provider. Reusing the endpoint this
   * repository already trusts with a credential is the difference between
   * adding an upstream and inventing one — and the path has no `/v1`, which is
   * the kind of detail recall gets wrong.
   */
  deepseek: { origin: 'https://api.deepseek.com', path: '/chat/completions' },
};

/**
 * Headers Trazum adds or removes. Everything else the caller sent is forwarded
 * verbatim, including their credential, which this never reads.
 */
/** Why a forwarded call's cost could not be measured. */
export type UnmeasuredCause = 'stream-broke' | 'no-usage-event';

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
  /**
   * A call that was forwarded and whose cost could not be measured.
   *
   * The money is spent either way — the provider generated what it generated —
   * and the period's total will be lower than the bill by however much these
   * came to. Naming them is the only honest option: a zero would be a
   * measurement, and inventing an estimate would merge the two halves this
   * product spent an arc separating.
   *
   * Two causes, and the second is not a failure at all:
   *
   * - `stream-broke` — the connection died before the event carrying the
   *   counts. Rare, and a real error.
   * - `no-usage-event` — the stream simply carried no counts. On OpenAI that is
   *   **every streaming call** unless the caller passed `stream_options:
   *   {include_usage: true}`, so this is the common case rather than the
   *   exception, and an operator who is not told will read a total that is
   *   quietly missing most of their traffic.
   */
  unmeasured?: (cause: UnmeasuredCause) => void;
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

      const back: Record<string, string> = {};
      upstreamResponse.headers.forEach((value, name) => {
        if (!HOP_BY_HOP.has(name.toLowerCase())) back[name] = value;
      });

      /** Counts only ever reach `record`; the body is never kept, either way. */
      const recordUsage = (usage: ReturnType<typeof usageFromResponse>): void => {
        if (usage === null) return;
        context.record({
          model: decision.kind === 'substitute' ? decision.to.id : described.model,
          label: described.label,
          substituted: decision.kind === 'substitute',
          ...usage,
        });
      };

      /**
       * A streamed answer is relayed as it arrives.
       *
       * Until 1.52 this method read `await upstreamResponse.text()` for every
       * response, which for `"stream": true` — nearly all production traffic —
       * held the entire answer and then delivered it at once. Time to first
       * token became the total generation time. This page argues that reading a
       * budget file per request would put Trazum's latency between the caller
       * and their provider; buffering a stream was a far larger version of that
       * in the same file.
       *
       * The provider decides, not the request: a body asking to stream can
       * still come back whole, and `content-type` is what actually arrived.
       */
      const streaming = (upstreamResponse.headers.get('content-type') ?? '').includes(
        'text/event-stream',
      );

      if (!streaming || upstreamResponse.body === null) {
        const text = await upstreamResponse.text();
        let measured: unknown;
        try {
          measured = JSON.parse(text);
        } catch {
          measured = null;
        }
        recordUsage(usageFromResponse(context.provider, measured));
        response.writeHead(upstreamResponse.status, back);
        response.end(text);
        return;
      }

      response.writeHead(upstreamResponse.status, back);

      const reader = streamingUsageReader(context.provider);
      const decoder = new TextDecoder();
      try {
        for await (const chunk of upstreamResponse.body as AsyncIterable<Uint8Array>) {
          // Counted on the way past, then forwarded unchanged. The bytes the
          // caller receives are the bytes the provider sent.
          reader.push(decoder.decode(chunk, { stream: true }));
          if (!response.write(chunk)) {
            await once(response, 'drain');
          }
        }
        reader.push(decoder.decode());
      } catch (error) {
        /**
         * The stream broke partway. The head is already sent, so there is no
         * status left to change and no refusal to render — destroying the
         * socket is the only way to tell the caller the answer is incomplete
         * rather than short.
         *
         * The money is spent and unmeasured: the provider generated whatever it
         * generated, and the counts ride the event this stream never reached.
         * Recorded as a broken stream rather than as the partial counts, which
         * would be a measurement of the part that arrived and read as the cost.
         */
        context.note(
          `stream broke before its usage event: ${error instanceof Error ? error.message : String(error)} — this call is unmeasured`,
        );
        context.unmeasured?.('stream-broke');
        response.destroy();
        return;
      }

      const streamed = reader.done();
      if (streamed === null) {
        /**
         * The stream ended cleanly and carried no counts. Not an error, and on
         * OpenAI not even unusual — but the call is still unmeasured, and the
         * operator has to hear it from here rather than infer it from a total
         * that looks too small.
         */
        context.unmeasured?.('no-usage-event');
      }
      recordUsage(streamed);
      response.end();
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
