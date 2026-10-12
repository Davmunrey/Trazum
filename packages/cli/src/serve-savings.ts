/** Pure HTTP savings handlers. Text only; never paths, provider calls or writes. */
import { BUNDLED_CATALOGUE, profileUsage, billLevers, buildPlan, parsePlanDocument, verifyPlan } from '@trazum/core';
import type { PricingCatalogue } from '@trazum/core';

export class SavingsInputError extends Error {}
export interface SavingsPlanPayload { log: string }
export interface SavingsVerifyPayload extends SavingsPlanPayload { plan: string }

export function validateSavingsPayload(value: unknown, verify: false): asserts value is SavingsPlanPayload;
export function validateSavingsPayload(value: unknown, verify: true): asserts value is SavingsVerifyPayload;
export function validateSavingsPayload(value: unknown, verify: boolean): asserts value is SavingsPlanPayload | SavingsVerifyPayload;
export function validateSavingsPayload(value: unknown, verify: boolean): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SavingsInputError('The body must be a JSON object.');
  const payload = value as Record<string, unknown>;
  const fields = verify ? ['log', 'plan'] : ['log'];
  if (Object.keys(payload).some((key) => !fields.includes(key))) throw new SavingsInputError('Unknown properties are not accepted for savings requests.');
  for (const key of fields) {
    if (typeof payload[key] !== 'string' || payload[key].trim() === '') throw new SavingsInputError(`${key} must be non-empty text, not a file path.`);
  }
}

function savingsReport(log: string, catalogue: PricingCatalogue) {
  const report = profileUsage(log, { catalogue });
  if (report.total.calls + report.unpriced.calls === 0) {
    throw new SavingsInputError('log contains no readable usage records; pass normalized JSONL text with model and token counts');
  }
  if (!Number.isFinite(report.total.totalUsd)) throw new SavingsInputError('log totals exceed finite pricing bounds');
  return report;
}

function savingsEvidence(report: ReturnType<typeof profileUsage>, catalogue: PricingCatalogue) {
  return {
    basis: 'Recorded token counts priced with the selected catalogue; not a reconciled provider invoice.',
    pricedCalls: report.total.calls,
    pricedUsd: report.total.totalUsd,
    unpricedCalls: report.unpriced.calls,
    unpricedModels: report.unpricedModels,
    skippedLines: report.skippedLines,
    span: report.span,
    pricingLastReviewed: catalogue.lastReviewed,
    pricingOverlay: catalogue !== BUNDLED_CATALOGUE,
    complete: report.unpriced.calls === 0 && report.skippedLines.length === 0,
  };
}

/** The shared parser accepts older plans. Check the nested fields verification dereferences too. */
function savingsPlan(text: string) {
  const parsed = parsePlanDocument(text);
  if (!parsed.ok) {
    const detail = parsed.why.kind === 'action-malformed'
      ? ` at action ${parsed.why.index}: ${parsed.why.because}` : '';
    throw new SavingsInputError(`plan is not a valid Trazum plan: ${parsed.why.kind}${detail}`);
  }
  const plan = parsed.plan;
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const keys = (value: object, allowed: readonly string[], field: string) => {
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new SavingsInputError(`${field} has unknown properties`);
  };
  keys(plan, ['schemaVersion', 'span', 'pricingLastReviewed', 'actions', 'projectedSavingUsd', 'measuredStakeUsd', 'totalUsd', 'createdAt'], 'plan');
  if (typeof plan.pricingLastReviewed !== 'string' || plan.pricingLastReviewed.trim() === '' ||
      !finite(plan.projectedSavingUsd) || !finite(plan.measuredStakeUsd) || !finite(plan.totalUsd)) {
    throw new SavingsInputError('plan needs pricingLastReviewed and finite non-negative projectedSavingUsd, measuredStakeUsd and totalUsd');
  }
  if (plan.span !== null && (!object(plan.span) || !finite(plan.span.fromMs) || !finite(plan.span.toMs) || plan.span.fromMs > plan.span.toMs)) {
    throw new SavingsInputError('plan.span must be null or an ordered fromMs/toMs window');
  }
  if (plan.span !== null) keys(plan.span, ['fromMs', 'toMs'], 'plan.span');
  if (plan.createdAt !== undefined && (typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)))) {
    throw new SavingsInputError('plan.createdAt must be an ISO date when supplied');
  }
  for (const [index, action] of plan.actions.entries()) {
    const fail = (why: string): never => { throw new SavingsInputError(`plan action ${index}: ${why}`); };
    keys(action, ['kind', 'label', 'model', 'savingUsd', 'stakeUsd', 'assumes', 'check', 'detail'], `plan action ${index}`);
    if (!object(action.detail)) fail('detail must be an object');
    keys(action.detail, ['routeTo', 'measured', 'baseline'], `plan action ${index} detail`);
    if (!Array.isArray(action.assumes)) fail('assumes must be a list');
    for (const assumption of action.assumes) {
      if (!object(assumption) || !['model-capability', 'batch-window', 'retry-pattern-real', 'max-tokens-fits', 'traffic-pattern-holds'].includes(assumption.kind as string)) fail('unknown assumption');
      keys(assumption, assumption.kind === 'model-capability' ? ['kind', 'model'] : ['kind'], `plan action ${index} assumption`);
      if (assumption.kind === 'model-capability' && typeof assumption.model !== 'string') fail('model-capability needs a model');
    }
    if (action.check !== null && typeof action.check !== 'string') fail('check must be text or null');
    if (action.savingUsd !== null && !finite(action.savingUsd)) fail('savingUsd must be a non-negative number or null');
    if (action.stakeUsd !== null && !finite(action.stakeUsd)) fail('stakeUsd must be a non-negative number or null');
    const projected = ['route', 'batch', 'route+batch'].includes(action.kind);
    if (projected ? action.savingUsd === null || action.stakeUsd !== null : action.stakeUsd === null || action.savingUsd !== null) {
      fail('projected savings and measured stakes must remain separate');
    }
    if (action.kind === 'route' || action.kind === 'route+batch') {
      const target = action.detail.routeTo;
      if (!object(target) || typeof target.id !== 'string' || target.id.length === 0 || typeof target.displayName !== 'string') fail('routeTo needs an id and displayName');
    }
    if (action.detail.routeTo !== undefined) {
      const target = action.detail.routeTo;
      if (!object(target) || typeof target.id !== 'string' || typeof target.displayName !== 'string') fail('routeTo must contain text id and displayName');
      keys(target, ['id', 'displayName'], `plan action ${index} routeTo`);
    }
    const baseline = action.detail.baseline;
    if (baseline !== undefined && (!object(baseline) ||
        !(['calls', 'usd', 'inputPerCallTokens', 'outputPerCallTokens'] as const).every((key) => finite(baseline[key])))) fail('baseline needs finite non-negative counts and costs');
    if (baseline !== undefined) keys(baseline, ['calls', 'usd', 'inputPerCallTokens', 'outputPerCallTokens'], `plan action ${index} baseline`);
    const measured = action.detail.measured;
    if (measured !== undefined && (!object(measured) || !Object.values(measured).every(finite))) fail('measured values must be finite non-negative numbers');
  }
  return plan;
}


export function planSavings(payload: SavingsPlanPayload, catalogue: PricingCatalogue) {
  const report = savingsReport(payload.log, catalogue);
  return {
    schemaVersion: 1 as const,
    plan: buildPlan(report, billLevers(report, { catalogue }), catalogue.lastReviewed),
    evidence: savingsEvidence(report, catalogue),
    limitations: [
      'Projected savings are not measured savings. Do not add projectedSavingUsd to measuredStakeUsd.',
      'Model capability, batch latency and other action assumptions require independent validation.',
      'Missing or unpriced records are excluded from priced totals, not free usage.',
    ],
  };
}

export function verifySavings(payload: SavingsVerifyPayload, catalogue: PricingCatalogue) {
  const plan = savingsPlan(payload.plan);
  const report = savingsReport(payload.log, catalogue);
  return {
    schemaVersion: 1 as const,
    verification: verifyPlan(plan, report, { currentPricingLastReviewed: catalogue.lastReviewed }),
    evidence: savingsEvidence(report, catalogue),
    limitations: [
      'Arrived describes the observable action, not proof of equal answer quality or realized net savings.',
      'A route+batch action only verifies routing; batch billing is not observable from token counts.',
      'Use matching workloads and comparable periods. Missing, skipped and unpriced data limit verification.',
      'Use the same pricing overlay for both runs; matching review dates do not prove identical custom rates.',
    ],
  };
}
