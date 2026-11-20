/**
 * What the gateway has counted since it started, for Prometheus to scrape.
 *
 * **A second port, not a path on the first.** The proxy's port answers the
 * paths `UPSTREAMS` names and nothing else, and `route` is the one reader of a
 * caller's URL there. A `/metrics` beside `/v1/messages` would be a second
 * opinion about what that port does. So the counts are served on their own
 * loopback port, given with `--metrics-port`, and that port forwards nothing:
 * it has no upstream, no `fetch` and no credential in reach.
 *
 * **Counts only.** Every value here is a number the gateway already had: the
 * provider's own token counts, a call's cost at the catalogue's list rates, and
 * how many calls were refused, substituted, forwarded free or left unmeasured.
 * The labels are the provider, the model, the caller's own `trazum_label`, a
 * refusal's reason and an unmeasured call's cause. No prompt, no response and
 * no session reach this module: `trazum_session` is used to judge and is never
 * recorded, and it is not recorded here either.
 *
 * **Counters reset when the gateway restarts.** They are this process's, as
 * the live budget is. Prometheus reads a fall in a counter as a reset, and
 * `trazum_gateway_start_time_seconds` says when this process began.
 *
 * **The label set is bounded.** A model name and a `trazum_label` are both the
 * caller's text, so a caller sending a new one on every call would grow the
 * series without limit, in this process and in Prometheus. Past
 * `MAX_SERIES_KEYS` distinct model and label pairs, and as many substitution
 * pairs, a call with a new one is left out of every figure whole and counted in
 * `trazum_gateway_calls_dropped_total` instead, so the totals say they are
 * short rather than look complete.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { prometheusLabelValue } from '@trazum/core';
import { refuseHost } from './loopback-guard.js';
import type { GatewayCount, UnmeasuredCause } from './gateway-server.js';

/** Distinct model and label pairs kept, and as many substitution pairs, before a call with a new one is left out. */
export const MAX_SERIES_KEYS = 1000;

/** What every cost sample says about itself: the list rates, not an invoice. */
export const COST_BASIS = 'api-equivalent';

const UNMEASURED_CAUSES: readonly UnmeasuredCause[] = ['stream-broke', 'no-usage-event', 'no-usage-in-body'];

/** A call the gateway forwarded and measured, as `record` receives it: counts, no text. */
export interface MeasuredCall {
  model: string;
  label: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  substituted: boolean;
}

type Labels = Readonly<Record<string, string>>;

/** One counter: a value per label set. The bound is `GatewayMetrics.admit`'s. */
class Counter {
  private values = new Map<string, { labels: Labels; value: number }>();

  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  add(labels: Labels, by: number): void {
    const key = JSON.stringify(labels);
    const entry = this.values.get(key);
    if (entry === undefined) this.values.set(key, { labels, value: by });
    else entry.value += by;
  }

  lines(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const { labels, value } of this.values.values()) out.push(`${this.name}${render(labels)} ${value}`);
    return out;
  }
}

const render = (labels: Labels): string => {
  const pairs = Object.entries(labels);
  return pairs.length === 0 ? '' : `{${pairs.map(([key, value]) => `${key}="${prometheusLabelValue(value)}"`).join(',')}}`;
};

export class GatewayMetrics {
  private dropped = 0;
  private readonly seen = new Set<string>();
  private readonly swaps = new Set<string>();
  private readonly calls = new Counter('trazum_gateway_calls_measured_total', 'Calls forwarded whose usage the provider reported.');
  private readonly tokens = new Counter('trazum_gateway_tokens_total', 'Tokens the provider reported, by kind.');
  private readonly cost = new Counter('trazum_gateway_cost_usd_total', 'Cost of measured calls at the catalogue list rates (API-equivalent), in USD.');
  private readonly unpriced = new Counter('trazum_gateway_calls_unpriced_total', 'Measured calls that could not be priced at list rates (a model the catalogue does not carry, or counts it cannot price); in no cost sample.');
  private readonly unmeasuredCalls = new Counter('trazum_gateway_calls_unmeasured_total', 'Calls forwarded whose cost could not be measured, by cause. Spent, and in no other figure.');
  private readonly refused = new Counter('trazum_gateway_calls_refused_total', 'Calls answered 402 and not forwarded, by reason.');
  private readonly substituted = new Counter('trazum_gateway_calls_substituted_total', 'Calls forwarded with the model the config substitutes.');
  private readonly free = new Counter('trazum_gateway_calls_free_total', 'Calls to a path that spends nothing, forwarded without a budget decision.');
  private readonly unreachable = new Counter('trazum_gateway_upstream_unreachable_total', 'Calls the provider could not be reached for, answered 502.');

  private readonly provider: string;
  private readonly startedMs: number;

  constructor(provider: string, startedMs: number) {
    this.provider = provider;
    this.startedMs = startedMs;
    // Present at zero: nothing went wrong and nothing was counted are different statements.
    for (const cause of UNMEASURED_CAUSES) this.unmeasuredCalls.add({ trazum_provider: provider, cause }, 0);
    this.unreachable.add({ trazum_provider: provider }, 0);
  }

  /**
   * Whether a call with this key may be counted: a key already held, or room
   * for a new one. A call refused here is counted only as dropped.
   */
  private admit(keys: Set<string>, key: string): boolean {
    if (keys.has(key)) return true;
    if (keys.size >= MAX_SERIES_KEYS) {
      this.dropped += 1;
      return false;
    }
    keys.add(key);
    return true;
  }

  /** A measured call, and its cost at list rates, or `null` when the catalogue does not price it. */
  measured(call: MeasuredCall, usd: number | null): void {
    const series = { trazum_provider: this.provider, trazum_model: call.model, trazum_label: call.label ?? '' };
    if (!this.admit(this.seen, JSON.stringify([call.model, call.label]))) return;
    this.calls.add({ ...series, substituted: String(call.substituted) }, 1);
    const kinds: Array<[string, number]> = [
      ['input', call.inputTokens],
      ['output', call.outputTokens],
      ['cache_read', call.cacheReadTokens],
      ['cache_write', call.cacheWriteTokens],
    ];
    for (const [kind, count] of kinds) this.tokens.add({ ...series, kind }, count);
    if (usd === null) this.unpriced.add(series, 1);
    else this.cost.add({ ...series, trazum_cost_basis: COST_BASIS }, usd);
  }

  unmeasured(cause: UnmeasuredCause): void {
    this.unmeasuredCalls.add({ trazum_provider: this.provider, cause }, 1);
  }

  count(event: GatewayCount): void {
    const provider = { trazum_provider: this.provider };
    if (event.kind === 'refused') this.refused.add({ ...provider, reason: event.reason }, 1);
    else if (event.kind === 'substituted') {
      if (this.admit(this.swaps, JSON.stringify([event.from, event.to]))) {
        this.substituted.add({ ...provider, from_model: event.from, to_model: event.to }, 1);
      }
    }
    else if (event.kind === 'free') this.free.add({ ...provider, path: event.path }, 1);
    else this.unreachable.add(provider, 1);
  }

  /** The Prometheus text exposition, ending with a line break as the format requires. */
  text(): string {
    const counters = [
      this.calls, this.tokens, this.cost, this.unpriced, this.unmeasuredCalls,
      this.refused, this.substituted, this.free, this.unreachable,
    ];
    const out = counters.flatMap((counter) => counter.lines());
    out.push(
      '# HELP trazum_gateway_calls_dropped_total Calls left out of every other figure here because they named a new model, label or substitution past the limit.',
      '# TYPE trazum_gateway_calls_dropped_total counter',
      `trazum_gateway_calls_dropped_total${render({ trazum_provider: this.provider })} ${this.dropped}`,
      '# HELP trazum_gateway_start_time_seconds When this gateway process started; every counter here begins there.',
      '# TYPE trazum_gateway_start_time_seconds gauge',
      `trazum_gateway_start_time_seconds${render({ trazum_provider: this.provider })} ${this.startedMs / 1000}`,
    );
    return `${out.join('\n')}\n`;
  }
}

/**
 * The scrape server: `GET /metrics` and nothing else.
 *
 * Behind the same host and origin guard as the proxy and `serve`, so a page
 * that rebound its own hostname to 127.0.0.1 cannot read which models and
 * labels this gateway has seen.
 */
export function buildMetricsServer(metrics: GatewayMetrics): Server {
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const refused = refuseHost(server, request);
    if (refused !== null) {
      response.writeHead(refused.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(`${JSON.stringify({ error: refused.error, detail: refused.detail })}\n`);
      return;
    }
    if (request.url !== '/metrics') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ error: 'this port serves GET /metrics and nothing else' })}\n`);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'application/json', allow: 'GET, HEAD' });
      response.end(`${JSON.stringify({ error: 'this port serves GET /metrics and nothing else' })}\n`);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : metrics.text());
  });
  return server;
}
