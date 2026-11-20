import { indexUsage, parseUsageLine, usageFromResponse } from '@trazum/core';
import type { GatewayCall, GatewayDecision, GatewayStanding, MeasuredPosition, PricingCatalogue } from '@trazum/core';

export type GatewayUsage = NonNullable<ReturnType<typeof usageFromResponse>>;

/**
 * One measured call's cost at the catalogue's list rates, or `null` when it
 * cannot be priced honestly: a model the catalogue does not carry, a count
 * that is not a finite non-negative number, or a flat cache-write count with
 * no TTL split (assuming 5m would undercharge a 1h write).
 *
 * The live budget and `--metrics-port` both price from here, so the figure a
 * refusal rests on and the figure Prometheus shows cannot disagree.
 */
export function priceGatewayUsage(catalogue: PricingCatalogue, model: string, usage: GatewayUsage, nowMs: number): number | null {
  const writesKnown = usage.cacheWriteTokens === 0 ||
    (usage.cacheWrite5mTokens !== undefined && usage.cacheWrite1hTokens !== undefined &&
     usage.cacheWrite5mTokens + usage.cacheWrite1hTokens === usage.cacheWriteTokens);
  if (!writesKnown ||
      Object.values(usage).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
    return null;
  }
  const record = parseUsageLine(JSON.stringify({
    model, ts: new Date(nowMs).toISOString(),
    input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    cache_read_input_tokens: usage.cacheReadTokens,
    cache_creation_input_tokens: usage.cacheWriteTokens,
    cache_creation: {
      ephemeral_5m_input_tokens: usage.cacheWrite5mTokens ?? 0,
      ephemeral_1h_input_tokens: usage.cacheWrite1hTokens ?? 0,
    },
    // Fast mode bills at a multiple of standard; the response said which ran.
    ...(usage.speed === undefined ? {} : { speed: usage.speed }),
    // So does OpenAI's service tier, each priced from its own table.
    ...(usage.serviceTier === undefined ? {} : { service_tier: usage.serviceTier }),
    // And US-only inference, 1.1x on Claude 4.6 and later.
    ...(usage.inferenceGeo === undefined ? {} : { inference_geo: usage.inferenceGeo }),
    // And the searches, $10 per 1,000 on top of the tokens.
    ...(usage.webSearchRequests === undefined
      ? {}
      : { server_tool_use: { web_search_requests: usage.webSearchRequests } }),
  }));
  const index = record === null ? null : indexUsage([record], { catalogue, on: new Date(nowMs) });
  if (index === null || index.unpriced > 0 || index.dayUsd === null) return null;
  return index.dayUsd;
}

type Admitted = Exclude<GatewayDecision, { kind: 'refuse' }>;
const DAY_MS = 86_400_000;
const empty = (): MeasuredPosition => ({ dayUsd: null, sessionUsd: null, labelUsd: null });

/** Process-local additions to a startup snapshot. Reservations are never measured spend. */
export class GatewaySpend {
  private usd = 0;
  private unknown = false;
  private days = new Map<number, number>();
  private labels = new Map<string, number>();
  private sessions = new Map<string, number>();
  private pending = new Map<symbol, { call: GatewayCall; usd: number | null }>();
  private started = Date.now();

  constructor(private catalogue: PricingCatalogue) {}

  standing(base: GatewayStanding | null): GatewayStanding | null {
    // A new month's imported balance is unknown until the operator reloads it.
    const start = new Date(this.started);
    const now = new Date();
    if (this.unknown || start.getUTCMonth() !== now.getUTCMonth() || start.getUTCFullYear() !== now.getUTCFullYear()) return null;
    return base === null ? null : { ...base, consumedUsd: base.consumedUsd + this.usd };
  }

  position(base: MeasuredPosition, call: GatewayCall): MeasuredPosition {
    if (this.unknown) return empty();
    const day = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    const add = (base: number | null, delta: number): number | null => base === null ? null : base + delta;
    // Do not carry yesterday's spend into today's daily allowance.
    const dayBase = base.dayWindow && base.dayWindow.toMs <= day ? 0 : base.dayUsd;
    return {
      ...base,
      dayUsd: add(dayBase, this.days.get(day) ?? 0),
      dayWindow: dayBase === null ? null : { fromMs: day, toMs: day + DAY_MS },
      labelUsd: add(base.labelUsd, call.label === null ? 0 : this.labels.get(call.label) ?? 0),
      sessionUsd: add(base.sessionUsd, call.session === null ? 0 : this.sessions.get(call.session) ?? 0),
    };
  }

  /** Synchronous check + reservation: no await can admit two calls against the same remainder. */
  reserve(call: GatewayCall, decision: Admitted, standing: GatewayStanding | null, failClosed: boolean):
    { ticket: symbol; refusal?: never } | { ticket?: never; refusal: Record<string, unknown> } {
    const pending = [...this.pending.values()];
    const unknown = pending.some((entry) => entry.usd === null);
    const estimate = decision.estimatedUsd;
    const unbounded = estimate === null || !Number.isFinite(estimate) || estimate < 0 ||
      call.maxOutputTokens === null || !Number.isFinite(call.maxOutputTokens) || call.maxOutputTokens < 0;
    const sum = (matches: (entry: typeof pending[number]) => boolean): number =>
      pending.filter(matches).reduce((total, entry) => total + (entry.usd ?? 0), 0);
    const reservedUsd = sum(() => true);
    // Configured substitution explicitly permits continued spending past the monthly cap.
    const globalOver = decision.kind !== 'substitute' && standing !== null && estimate !== null &&
      standing.consumedUsd + reservedUsd + estimate > standing.limitUsd;
    const scopeOver = decision.policy.judgements.some((entry) => {
      if (entry.waived !== null || entry.measuredUsd === null || estimate === null) return false;
      const reserved = sum((pending) => entry.scope === 'day' ||
        (entry.scope === 'label' ? pending.call.label === call.label : pending.call.session === call.session));
      return entry.measuredUsd + reserved + estimate > entry.limitUsd;
    });
    if (((unknown || unbounded) && failClosed) || globalOver || scopeOver) {
      return { refusal: {
        schemaVersion: 1,
        error: { type: 'trazum_budget_refusal', message: unbounded
          ? 'This call has no bounded cost; provide a valid output-token limit before spending.'
          : unknown
          ? 'An in-flight call has no bounded cost; wait for its usage before spending again.'
          : 'In-flight calls have reserved the remaining budget.' },
        reason: unbounded ? 'call-unbounded' : unknown ? 'in-flight-unmeasured' : 'budget-reserved',
        standing, reservedUsd, estimatedUsd: estimate, policy: decision.policy,
      } };
    }
    const ticket = Symbol();
    this.pending.set(ticket, { call, usd: unbounded ? null : estimate });
    return { ticket };
  }

  settle(ticket: symbol, model: string, usage: GatewayUsage | null): void {
    const pending = this.pending.get(ticket);
    if (pending === undefined) return;
    this.pending.delete(ticket);
    const now = Date.now();
    const usd = usage === null ? null : priceGatewayUsage(this.catalogue, model, usage, now);
    if (usd === null) {
      this.unknown = true;
      return;
    }
    this.usd += usd;
    const day = Math.floor(now / DAY_MS) * DAY_MS;
    this.days.set(day, (this.days.get(day) ?? 0) + usd);
    if (pending.call.label !== null) this.labels.set(pending.call.label, (this.labels.get(pending.call.label) ?? 0) + usd);
    if (pending.call.session !== null) this.sessions.set(pending.call.session, (this.sessions.get(pending.call.session) ?? 0) + usd);
  }

  release(ticket: symbol): void { this.pending.delete(ticket); }
}
