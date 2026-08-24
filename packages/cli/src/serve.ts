/**
 * The endpoint that answers before the call is sent.
 *
 * **Loopback only, and the address is not a flag.** A cost oracle listening on
 * a network interface is an attack surface with a very small upside: it holds
 * a company's spend, its model mix and its budgets, and it answers anybody who
 * asks. `checkedEndpoint` has guarded Trazum's *outbound* requests since 1.14
 * on the principle that a caller selects an endpoint rather than naming one;
 * this is the inbound counterpart, and it is enforced the same way — by there
 * being no way to say otherwise. `127.0.0.1` is compiled in. A Unix socket is
 * offered for callers that would rather not use a port at all.
 *
 * **No auth, on purpose.** Anything reachable only from the machine it runs on
 * is already behind the operating system's own boundary, and a token checked
 * over loopback is theatre: whoever can reach the socket can read the token
 * out of the process that holds it. The honest posture is a surface small
 * enough not to need one.
 *
 * **It degrades rather than failing.** With no store and no budget the
 * endpoint still prices the call from the bundled catalogue and says the
 * budget half is unknown. Offline is a mode, not an error, and an oracle that
 * refuses to speak when half its inputs are missing is an oracle nobody wires
 * into a hot path.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { answerCost, judgeLimits } from '@trazum/core';
import type { CostAnswer, LimitsConfig, MeasuredPosition, PricingCatalogue, WaiveEntry } from '@trazum/core';

/** Compiled in. See the module note: this is the inbound SSRF posture. */
export const BIND_HOST = '127.0.0.1';

export const DEFAULT_PORT = 7317;

/**
 * Bodies larger than this are refused unread.
 *
 * A prompt is text and text is unbounded; a hot-path oracle that will buffer
 * whatever it is handed is a memory exhaustion away from taking the caller
 * down with it — and the caller was asking how to spend *less*.
 */
export const MAX_BODY_BYTES = 1_000_000;

export interface ServeContext {
  catalogue: PricingCatalogue;
  /**
   * Measured spend and the budget it is judged against, read once at start
   * and refreshed by the caller.
   *
   * Read once because the whole promise here is single-digit milliseconds,
   * and a file read in the request path cannot make that promise. The staleness
   * is a real cost, so the answer carries the window its measurement covers
   * rather than implying it is current to the second.
   */
  position: () => { consumedUsd?: number; limitUsd?: number; window?: { fromMs: number; toMs: number } | null };
  /** The `limits` block, when the config carries one. */
  limits?: LimitsConfig;
  /**
   * The measured position for one call's scopes — from an index built once
   * at start, same staleness posture as `position`.
   */
  measured?: (call: { label?: string; session?: string }) => MeasuredPosition;
  /** The config's `waive` list — a silenced limit answers within, on the record. */
  waivers?: readonly WaiveEntry[];
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const send = (response: ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    // Nothing here is for a browser to read across origins, and saying so
    // costs one header.
    'cache-control': 'no-store',
  });
  response.end(text);
};

export function buildServer(context: ServeContext): Server {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${BIND_HOST}`);

      if (request.method === 'GET' && url.pathname === '/health') {
        send(response, 200, { ok: true, schemaVersion: 1 });
        return;
      }

      if (request.method !== 'POST' || url.pathname !== '/cost') {
        send(response, 404, {
          error: 'not-found',
          detail: 'POST /cost, or GET /health.',
        });
        return;
      }

      let payload: Record<string, unknown>;
      try {
        const raw = await readBody(request);
        payload = raw.trim() === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
      } catch (error) {
        send(response, 400, {
          error: 'bad-request',
          detail: error instanceof Error && error.message === 'body too large'
            ? `A request body may be at most ${MAX_BODY_BYTES} bytes.`
            : 'The body must be JSON.',
        });
        return;
      }

      const position = context.position();
      const call = {
        model: typeof payload.model === 'string' ? payload.model : undefined,
        inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : undefined,
        outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : undefined,
        basis: (payload.basis === 'heuristic' ? 'heuristic' : 'token-count') as 'heuristic' | 'token-count',
        /**
         * `label` and `session` scope the limits judgement and nothing else.
         * The session value is used to look up measured spend and is never
         * echoed back — the answer's judgement names the scope, not the key.
         */
        label: typeof payload.label === 'string' && payload.label !== '' ? payload.label : undefined,
        session: typeof payload.session === 'string' && payload.session !== '' ? payload.session : undefined,
      };
      let answer: CostAnswer;
      let policy;
      try {
        answer = answerCost(
          {
            model: call.model,
            inputTokens: call.inputTokens,
            outputTokens: call.outputTokens,
            basis: call.basis,
            ...position,
          },
          { catalogue: context.catalogue },
        );
        /**
         * The limits policy, judged by the same function the gateway and the
         * spend guard call — one judge, three doors. Always present: absent
         * config answers `no-policy` rather than omitting the field, because
         * a missing field and a judged absence are different answers.
         */
        policy = judgeLimits(
          context.limits,
          context.measured?.({
            ...(call.label === undefined ? {} : { label: call.label }),
            ...(call.session === undefined ? {} : { session: call.session }),
          }) ?? { dayUsd: null, sessionUsd: null, labelUsd: null },
          call,
          {
            catalogue: context.catalogue,
            ...(context.waivers === undefined ? {} : { waivers: context.waivers }),
          },
        );
      } catch (error) {
        /*
          The core refuses a figure that cannot mean what it says — a
          negative token count, most importantly, because a negative estimate
          lowers the projected spend and buys an approval. Before this catch
          existed the refusal was an uncaught throw inside the request
          handler: `{"inputTokens": -5}` took the whole oracle down. A bad
          figure is the caller's error, and it gets the caller's status code.
        */
        send(response, 400, {
          error: 'bad-request',
          detail: error instanceof Error ? error.message : 'unjudgeable figures',
        });
        return;
      }
      send(response, 200, { ...answer, policy });
    })();
  });
}

export interface ListenTarget {
  /** A Unix socket path, when the caller would rather not use a port. */
  socket?: string;
  port?: number;
}

export function listen(server: Server, target: ListenTarget): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    if (target.socket !== undefined) {
      server.listen(target.socket, () => resolve(target.socket!));
      return;
    }
    // The host is not a parameter. See the module note.
    server.listen(target.port ?? DEFAULT_PORT, BIND_HOST, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? `${BIND_HOST}:${address.port}` : String(address));
    });
  });
}
