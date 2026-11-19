#!/usr/bin/env node
/**
 * Record which model every recommendation names, from the catalogue as built.
 *
 *   npm run build
 *   node scripts/record-recommendations.mjs           write the fixture
 *   node scripts/record-recommendations.mjs --check   exit 1 when it differs
 *
 * `packages/core/test/fixtures/recommendations.json` is what
 * `tier-removed.test.js` holds the catalogue to: the cheapest model of each
 * capability, over the whole catalogue and by provider, and the cheaper model each
 * catalogue model is offered at three prompts. It was first written from the
 * tree before 3.0.0 removed `tier` from a model (#764), which is how that
 * removal was shown to change no answer, and again when `recommendTier` began
 * to answer in `small`, `mid` and `large`, which changed the names in it and
 * nothing else.
 *
 * A change to the catalogue can move an answer, and then the test fails and
 * names the model. That is the test working: a price that changes which model
 * Trazum recommends is worth one look. Run this, read the diff of the fixture,
 * and say in the commit which answers moved and why. Do not run it to make a
 * failure go away without reading what it changed.
 *
 * The date and the prompts are kept from the file that is there, so a run
 * records the same questions and only the answers can differ. It reads the
 * build, writes one file and talks to nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../packages/core/test/fixtures/recommendations.json', import.meta.url));
const CAPABILITIES = ['small', 'mid', 'large', 'frontier', 'unknown'];

const idOf = (find) => {
  try {
    return find().id;
  } catch {
    return null;
  }
};

/** The model a `model-downgrade` advisory names: the longest name of its provider that the text carries. */
function candidateIn(advisory, model, models) {
  if (!advisory) return null;
  const named = models
    .filter((m) => m.provider === model.provider && m.id !== model.id && advisory.detail.includes(m.displayName))
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const [first] = named;
  if (!first) throw new Error(`${model.id}: the advisory names no model of its provider`);
  return first.id;
}

export function record(core, { on: day, prompts }) {
  const on = new Date(`${day}T12:00:00Z`);
  const { models } = core.BUNDLED_CATALOGUE;
  const providers = [...new Set(models.map((m) => m.provider))].sort();
  const fixture = { on: day, prompts, recommendTier: {}, cheapestOfCapability: {}, cheapestOfCapabilityIn: {}, downgrade: {} };
  for (const [name, [prompt, tokens]] of Object.entries(prompts)) {
    fixture.recommendTier[name] = core.recommendTier(prompt, tokens);
  }
  for (const capability of CAPABILITIES) {
    fixture.cheapestOfCapability[capability] = idOf(() => core.cheapestOfCapability(capability));
    fixture.cheapestOfCapabilityIn[capability] = {};
    for (const provider of ['*', ...providers]) {
      fixture.cheapestOfCapabilityIn[capability][provider] = idOf(() =>
        core.cheapestOfCapabilityIn(core.BUNDLED_CATALOGUE, capability, on, provider === '*' ? undefined : provider),
      );
    }
  }
  for (const model of models) {
    fixture.downgrade[model.id] = {};
    for (const [name, [prompt, tokens]] of Object.entries(prompts)) {
      const usage = { model: model.id, callsPerMonth: 10_000, avgOutputTokens: 400, batchEligible: false };
      const advisory = core.buildAdvisories(prompt, tokens, usage, { on, locale: 'en' }).find((a) => a.id === 'model-downgrade');
      fixture.downgrade[model.id][name] = candidateIn(advisory, model, models);
    }
  }
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

async function main(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    console.error(`record-recommendations: unknown argument ${unknown[0]}. It takes --check and nothing else.`);
    return 2;
  }
  const before = readFileSync(FIXTURE, 'utf8');
  const core = await import(new URL('../packages/core/dist/index.js', import.meta.url).href);
  const after = record(core, JSON.parse(before));
  if (after === before) {
    console.log('recommendations.json is what the built catalogue answers.');
    return 0;
  }
  if (check) {
    console.error('recommendations.json is not what the built catalogue answers. Run this without --check and read the diff.');
    return 1;
  }
  writeFileSync(FIXTURE, after);
  console.log('wrote packages/core/test/fixtures/recommendations.json. Read its diff before committing it.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
