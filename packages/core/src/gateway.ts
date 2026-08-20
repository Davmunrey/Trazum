/**
 * In the path of the call, and still only able to say yes or no.
 *
 * 1.44 gave a local service that *answers* and 1.45 gave an agent a guard it
 * may consult and ignore. Advice an implementation can skip is advice a budget
 * cannot rely on, and a connector that pulls usage after the fact always
 * reports the runaway after it ran. Standing in the path fixes both: usage is
 * measured at the moment of the call, and a refusal is a refusal.
 *
 * It also makes this the most dangerous module in the product, and the two
 * rules below are the whole design.
 *
 * ## It refuses; it never substitutes
 *
 * A call over budget is **rejected**, with a machine-readable reason and the
 * cheaper alternative named. Silently swapping the model, trimming the prompt
 * or downgrading a request in flight is the one behaviour this product must
 * never have. The caller asked for something specific; a proxy that quietly
 * answers a different question is worse than one that fails, because the
 * failure is visible and the substitution is not.
 *
 * That is enforced in the *type*, not in a comment. A `GatewayDecision` is
 * either `forward` — carrying nothing the caller did not send — or `refuse`,
 * carrying no body at all. There is no shape in which this module hands back a
 * modified request, so no future edit can add one without changing a type that
 * every caller and every test reads.
 *
 * Substitution exists only as an operator's configured, logged decision, and
 * even then it is a *different kind*: `substitute` names what changed and why,
 * and every call that took it is marked so no later report treats it as the
 * call the caller made.
 *
 * ## Failure is a decision made in advance
 *
 * When the gateway cannot tell — no budget, nothing measured, an unpriced
 * model — somebody has to have already decided what happens. **Fail-open** and
 * **fail-closed** are both defensible: one keeps the product working and lets
 * the bill run, the other stops the bill and takes the product down with it.
 * There is deliberately no default. A proxy that picks silently has made the
 * most consequential decision in somebody's architecture on their behalf.
 *
 * ## Nothing about the payload is recorded
 *
 * Prompt and completion pass through. The store has held aggregates since
 * 1.42 and standing in the path changes nothing about that: this module never
 * receives the body text at all — it is handed a *description* of the call,
 * and the shape of its inputs is what makes the promise checkable.
 */

import type { PlanAssumption } from './plan.js';
import { effectivePricing, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import type { ModelPricing } from './types.js';

/**
 * What the operator has decided happens when the gateway cannot judge.
 *
 * No default, and `cannot-tell` is not one of the values: this is the answer
 * to *what do we do about* not being able to tell, which is a policy and not a
 * measurement.
 */
export type FailurePolicy = 'fail-open' | 'fail-closed';

export const FAILURE_POLICIES: readonly FailurePolicy[] = ['fail-open', 'fail-closed'];

/**
 * A call, as the gateway sees it.
 *
 * **No prompt text, and no completion text.** The model, the counts and the
 * label are everything a budget decision needs, and they are everything this
 * module is given — so "nothing about the payload is recorded" is a fact about
 * the interface rather than a discipline somebody has to maintain.
 */
export interface GatewayCall {
  provider: string;
  model: string;
  /** Input tokens the caller declared, or that the wire format made countable. */
  inputTokens: number | null;
  /** The ceiling the caller asked for, when the request named one. */
  maxOutputTokens: number | null;
  /** The workload, when the caller labelled it. */
  label: string | null;
}

/** Where the budget stands, as the gateway was told at the last refresh. */
export interface GatewayStanding {
  limitUsd: number;
  consumedUsd: number;
  /** Always measured — a gateway decision never rests on an estimate of spend. */
  provenance: 'measured';
  /** How stale the figure is, so a refusal can say what it rested on. */
  asOfMs: number;
}

export type RefuseReason =
  /** The budget is already past its limit, measured. Nothing was estimated. */
  | 'budget-exhausted'
  /** This call would take it past, on an estimate of this call. */
  | 'call-would-cross'
  /** Cannot tell, and the operator chose fail-closed. */
  | 'cannot-tell-and-closed';

export type CannotTellCause = 'no-budget' | 'nothing-measured' | 'model-unpriced';

/** A cheaper way to make the same call, named on a refusal. */
export interface GatewayAlternative {
  kind: 'route' | 'batch';
  model: { id: string; displayName: string } | null;
  savingUsd: number;
  assumes: PlanAssumption[];
}

/**
 * The decision, and the only three shapes it comes in.
 *
 * `forward` deliberately carries **nothing**. Not a rewritten model, not a
 * trimmed prompt, not a header to add — because a field for any of those is
 * how substitution arrives one refactor later, wearing a reasonable name.
 */
export type GatewayDecision =
  | {
      kind: 'forward';
      /** What this call was priced at, for the record the caller keeps. */
      estimatedUsd: number | null;
      /** Present when the gateway could not judge and the operator fails open. */
      unjudged: CannotTellCause | null;
    }
  | {
      kind: 'refuse';
      reason: RefuseReason;
      /** Which cause, when the reason is `cannot-tell-and-closed`. */
      cause: CannotTellCause | null;
      /** What the refusal rests on. Never `estimated` alone. */
      restsOn: 'measured' | 'measured+estimated' | null;
      standing: GatewayStanding | null;
      estimatedUsd: number | null;
      /** A refusal never arrives bare. Dearest saving first; may be empty. */
      alternatives: GatewayAlternative[];
      because: string;
    }
  | {
      /**
       * The operator configured a substitution, in advance, for this case.
       *
       * A separate kind rather than a `forward` with a changed model, so that
       * nothing downstream can treat a substituted call as the call the caller
       * made. `markedInStore` is not a suggestion: the marker is what stops a
       * later report from attributing this traffic to a model the caller never
       * asked for.
       */
      kind: 'substitute';
      to: { id: string; displayName: string };
      /** The operator's own words for why this rule exists. */
      configuredReason: string;
      estimatedUsd: number | null;
      markedInStore: true;
    };

export interface GatewayPolicy {
  /** Required. There is no default — see the module note. */
  onCannotTell: FailurePolicy;
  /**
   * Substitutions the operator configured in advance, by model id.
   *
   * Absent means refuse rather than swap, which is the only safe default for
   * a field whose whole risk is being switched on without anybody noticing.
   */
  substitute?: Record<string, { to: string; reason: string }>;
}

export interface GatewayOptions {
  catalogue: PricingCatalogue;
  policy: GatewayPolicy;
  on?: Date;
}

/** What this call costs at a model's rates, or null when it cannot be priced. */
function priceCall(
  model: ModelPricing | undefined,
  call: GatewayCall,
  on: Date,
): number | null {
  if (model === undefined || call.inputTokens === null) return null;
  const rates = effectivePricing(model, on);
  const output = call.maxOutputTokens ?? 0;
  return (call.inputTokens / 1_000_000) * rates.inputPerMTok + (output / 1_000_000) * rates.outputPerMTok;
}

/**
 * Cheaper models of the same provider that this call fits inside.
 *
 * Same rule as the spend guard's: a model the prompt does not fit in is not a
 * cheaper way to make the call, it is a way not to make it.
 */
function alternativesFor(
  model: ModelPricing,
  call: GatewayCall,
  catalogue: PricingCatalogue,
  on: Date,
): GatewayAlternative[] {
  const mine = priceCall(model, call, on);
  if (mine === null) return [];
  const out: GatewayAlternative[] = [];
  const here = effectivePricing(model, on);

  for (const candidate of catalogue.byId.values()) {
    if (candidate.id === model.id || candidate.provider !== model.provider) continue;
    const there = effectivePricing(candidate, on);
    if (there.inputPerMTok >= here.inputPerMTok) continue;
    if (call.inputTokens !== null && candidate.contextWindow < call.inputTokens) continue;
    const routed = priceCall(candidate, call, on);
    if (routed === null) continue;
    out.push({
      kind: 'route',
      model: { id: candidate.id, displayName: candidate.displayName },
      savingUsd: mine - routed,
      assumes: [{ kind: 'model-capability', model: candidate.displayName }],
    });
  }

  /**
   * The batch lever is offered on a refusal and **never as a substitution**.
   *
   * Moving a synchronous call onto a batch window changes when the answer
   * arrives, which is a change to what the caller asked for. It belongs in the
   * list of things a human might do, not in anything the proxy can do.
   */
  const batch = multipliersFor(model).batch;
  if (batch !== null) {
    out.push({ kind: 'batch', model: null, savingUsd: mine - mine * batch, assumes: [{ kind: 'batch-window' }] });
  }

  return out.sort((a, b) => b.savingUsd - a.savingUsd);
}

function whyCannotTell(
  standing: GatewayStanding | null,
  priced: number | null,
): CannotTellCause | null {
  if (standing === null) return 'no-budget';
  if (standing.consumedUsd === 0 && standing.provenance !== 'measured') return 'nothing-measured';
  return priced === null ? 'model-unpriced' : null;
}

/**
 * Yes, no, or the operator's pre-made decision — for one call.
 *
 * Pure, so the rule that matters most (this never rewrites a request) is
 * checkable without a socket, and so the proxy around it has nothing to do but
 * move bytes.
 */
export function gatewayDecision(
  call: GatewayCall,
  standing: GatewayStanding | null,
  options: GatewayOptions,
): GatewayDecision {
  const { catalogue, policy, on = new Date() } = options;
  const model = catalogue.byId.get(call.model);
  const estimatedUsd = priceCall(model, call, on);

  const cause = whyCannotTell(standing, estimatedUsd);
  if (cause !== null) {
    /**
     * Cannot judge. The operator decided this in advance, and a substitution
     * is **not** consulted here: swapping a model because a *budget* could not
     * be read would be answering a different question for a reason that has
     * nothing to do with the caller's request.
     */
    if (policy.onCannotTell === 'fail-open') {
      return { kind: 'forward', estimatedUsd, unjudged: cause };
    }
    return {
      kind: 'refuse',
      reason: 'cannot-tell-and-closed',
      cause,
      restsOn: null,
      standing,
      estimatedUsd,
      alternatives: [],
      because: becauseCannotTell(cause),
    };
  }

  // `cause === null` guarantees both of these, and the compiler does not know
  // it — narrowed here rather than asserted, so a change to `whyCannotTell`
  // that stopped guaranteeing them fails the build instead of the request.
  if (standing === null || estimatedUsd === null || model === undefined) {
    return { kind: 'forward', estimatedUsd, unjudged: 'no-budget' };
  }

  const already = standing.consumedUsd > standing.limitUsd;
  const wouldCross = standing.consumedUsd + estimatedUsd > standing.limitUsd;
  if (!already && !wouldCross) {
    return { kind: 'forward', estimatedUsd, unjudged: null };
  }

  const configured = policy.substitute?.[call.model];
  const target = configured === undefined ? undefined : catalogue.byId.get(configured.to);
  if (configured !== undefined && target !== undefined) {
    return {
      kind: 'substitute',
      to: { id: target.id, displayName: target.displayName },
      configuredReason: configured.reason,
      estimatedUsd: priceCall(target, call, on),
      markedInStore: true,
    };
  }

  return {
    kind: 'refuse',
    reason: already ? 'budget-exhausted' : 'call-would-cross',
    cause: null,
    // The two halves, named — the rule since 1.44. An exhausted budget needs
    // no estimate of this call; a crossing does, and says so.
    restsOn: already ? 'measured' : 'measured+estimated',
    standing,
    estimatedUsd,
    alternatives: alternativesFor(model, call, catalogue, on),
    because: already
      ? 'The budget for this period is already spent, measured.'
      : 'This call would take the budget past its limit, on an estimate of this call.',
  };
}

function becauseCannotTell(cause: CannotTellCause): string {
  return cause === 'no-budget'
    ? 'No budget is configured, so there is nothing to judge this against, and this gateway is configured to fail closed.'
    : cause === 'nothing-measured'
      ? 'Nothing has been measured for this period, so how much of the budget is gone is unknown, and this gateway is configured to fail closed.'
      : 'This model is not in the price catalogue, so the call cannot be priced, and this gateway is configured to fail closed.';
}

/**
 * The tokens a provider's own response reports, from the response body.
 *
 * This is the reason the gateway measures better than a connector: the counts
 * are the provider's, arriving with the answer, before any export exists.
 *
 * Returns null rather than zero when the body carries no usage. A response
 * whose usage could not be read is a call whose cost is unknown, and a zero
 * would make the period's total quietly too low — the flattering direction.
 */
export function usageFromResponse(
  provider: string,
  body: unknown,
): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return null;
  const u = usage as Record<string, unknown>;
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

  if (provider === 'anthropic') {
    if (typeof u.input_tokens !== 'number' && typeof u.output_tokens !== 'number') return null;
    return {
      inputTokens: num(u.input_tokens),
      outputTokens: num(u.output_tokens),
      cacheReadTokens: num(u.cache_read_input_tokens),
      cacheWriteTokens: num(u.cache_creation_input_tokens),
    };
  }
  if (provider === 'openai') {
    if (typeof u.prompt_tokens !== 'number' && typeof u.completion_tokens !== 'number') return null;
    const details = u.prompt_tokens_details;
    const cached =
      typeof details === 'object' && details !== null
        ? num((details as Record<string, unknown>).cached_tokens)
        : 0;
    return {
      // `prompt_tokens` includes the cached ones, so they are subtracted
      // before the fresh input is reported — counting them twice would put
      // the period's total above the invoice, and in the flattering
      // direction. Same correction the connector has made since 1.41.
      inputTokens: Math.max(0, num(u.prompt_tokens) - cached),
      outputTokens: num(u.completion_tokens),
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    };
  }
  return null;
}
