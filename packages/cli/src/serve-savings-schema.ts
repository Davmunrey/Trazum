/** OpenAPI 3.1 schemas for the text-only savings lifecycle. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
const amount = { type: 'number', minimum: 0 };
const text = { type: 'string' };
const count = { type: 'integer', minimum: 0 };
const log = { type: 'string', minLength: 1, maxLength: 1_000_000, description: 'Non-whitespace normalized usage JSONL text, never a path. Whole request is limited to 1,000,000 UTF-8 bytes.' };
const pair = object({ before: amount, after: amount });
export const SAVINGS_SCHEMAS = {
  SavingsPlanRequest: object({ log }),
  SavingsVerifyRequest: object({ log, plan: { ...log, description: 'Serialized Trazum PlanDocument JSON text, never a path or response envelope. Subject to defensive nested validation and the shared whole-body byte cap.' } }),
  SavingsEvidence: object({
    basis: text, pricedCalls: count, pricedUsd: amount, unpricedCalls: count,
    unpricedModels: { type: 'array', items: text }, skippedLines: { type: 'array', items: { type: 'integer', minimum: 1 } },
    span: nullable(ref('Window')), pricingLastReviewed: text, pricingOverlay: { type: 'boolean' },
    complete: { type: 'boolean', description: 'No unpriced calls or skipped lines; not proof of a complete invoice, comparable periods or task quality.' },
  }),
  SavingsAssumption: { oneOf: [
    object({ kind: { const: 'model-capability' }, model: text }),
    object({ kind: { enum: ['batch-window', 'retry-pattern-real', 'max-tokens-fits', 'traffic-pattern-holds'] } }),
  ] },
  SavingsAction: object({
    kind: { enum: ['route', 'batch', 'route+batch', 'fix-truncation', 'fix-caching'] }, label: text, model: text,
    savingUsd: nullable(amount), stakeUsd: nullable(amount), assumes: { type: 'array', items: ref('SavingsAssumption') },
    check: nullable(text), detail: object({
      routeTo: object({ id: text, displayName: text }),
      measured: { type: 'object', additionalProperties: amount },
      baseline: object({ calls: amount, usd: amount, inputPerCallTokens: amount, outputPerCallTokens: amount }),
    }, []),
  }),
  SavingsPlan: object({
    schemaVersion: { const: 1 }, span: nullable(ref('Window')), pricingLastReviewed: text,
    actions: { type: 'array', items: ref('SavingsAction') }, projectedSavingUsd: amount, measuredStakeUsd: amount, totalUsd: amount,
    createdAt: text,
  }, ['schemaVersion', 'span', 'pricingLastReviewed', 'actions', 'projectedSavingUsd', 'measuredStakeUsd', 'totalUsd']),
  SavingsVerifiedAction: object({
    action: ref('SavingsAction'), outcome: { enum: ['arrived', 'not-arrived', 'cannot-tell'] },
    reason: { enum: ['workload-vanished', 'fields-stopped', 'tier-not-recorded', null] },
    observed: { type: 'object', additionalProperties: { type: ['number', 'string', 'null'] } },
    attribution: nullable(object({ calls: pair, inputPerCallTokens: pair, outputPerCallTokens: pair }, [])),
    gateFailing: { type: 'boolean' },
  }),
  SavingsVerification: object({
    schemaVersion: { const: 1 }, planCreatedAt: nullable(text), planPricing: text, currentPricing: text,
    pricesChanged: { type: 'boolean' }, actions: { type: 'array', items: ref('SavingsVerifiedAction') },
    arrived: count, notArrived: count, cannotTell: count, gateFailures: count,
  }),
  SavingsPlanAnswer: object({ schemaVersion: { const: 1 }, plan: ref('SavingsPlan'), evidence: ref('SavingsEvidence'), limitations: { type: 'array', items: text } }),
  SavingsVerifyAnswer: object({ schemaVersion: { const: 1 }, verification: ref('SavingsVerification'), evidence: ref('SavingsEvidence'), limitations: { type: 'array', items: text } }),
};
