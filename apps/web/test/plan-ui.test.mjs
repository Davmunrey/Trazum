import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const read = (relative) => readFileSync(join(web, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The plan and the verification, in the tab.
 *
 * Same promise as the bill it sits under, and one more: the document this
 * panel writes is the document the terminal reads. A browser tool whose output
 * the CLI will not accept is a second product wearing the first one's name.
 */
describe('the plan panel', () => {
  const plan = codeOf('components/Plan.tsx');

  it('never fetches — the log and the plan both stay in the page', () => {
    // The plan is built from a report that came from a log that was never
    // uploaded. Sending the plan anywhere would leak the same facts one level
    // up: which workloads exist, what they cost, which models they use.
    assert.equal(/\bfetch\s*\(/.test(plan), false, 'Plan.tsx contains a fetch call');
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket/.test(plan), false);
  });

  it('saves a file rather than offering a link', () => {
    /**
     * A link means this page storing somebody's bill somewhere, which is an
     * access-control question nobody has designed — the same call the store
     * made in 1.42, for the same reason. A `Blob` the browser writes locally
     * needs no such answer.
     */
    assert.match(plan, /new Blob\(/);
    assert.match(plan, /URL\.createObjectURL/);
    assert.match(plan, /URL\.revokeObjectURL/, 'the object URL must be released');
    assert.equal(/\/api\/|https?:\/\//.test(plan), false, 'no endpoint is referenced');
  });

  it('uses the one shared validator rather than a second copy of the check', () => {
    // Two validators for one document format is a guarantee they drift, and
    // the drift shows up as a plan the terminal accepts and the browser
    // rejects — or worse, the other way round.
    assert.match(plan, /parsePlanDocument\(/);
    assert.equal(
      /schemaVersion\s*[!=]==?\s*1/.test(plan),
      false,
      'Plan.tsx is checking the schema version itself instead of asking the validator',
    );
  });

  it('renders a refusal rather than an empty verification', () => {
    // "0 arrived, 0 did not, 0 cannot be told" reads as a clean result. A file
    // that is not a plan must be named as one that is not.
    assert.match(plan, /setRefusal\(parsed\.why\)/);
    assert.match(plan, /setVerification\(null\)/);
    const refusal = plan.indexOf('refusal !== null');
    const verification = plan.indexOf('verification !== null');
    assert.ok(refusal !== -1 && verification !== -1);
    assert.ok(refusal < verification, 'the refusal renders before the verification block');
  });

  it('keeps the projection and the measured stake apart', () => {
    // A prediction and a measurement summed is a figure that is neither, and
    // the plan has kept them in two fields since it shipped in 1.38. A
    // rendering that adds them undoes that in the only place a reader looks.
    assert.match(plan, /t\.plan\.projected\(/);
    assert.match(plan, /t\.plan\.staked\(/);
    assert.match(plan, /t\.plan\.neverSummed/);
    assert.equal(
      /projectedSavingUsd\s*\+\s*|.*\+\s*plan\.measuredStakeUsd/.test(plan),
      false,
      'the two totals must never be added together',
    );
  });

  it('carries the three outcomes and their reasons, never two', () => {
    assert.match(plan, /'arrived'/);
    assert.match(plan, /'not-arrived'/);
    assert.match(plan, /t\.plan\.cannotTell\(/);
  });

  it('renders what each action assumes, beside the money', () => {
    // The assumption is the reason the figure is a projection rather than a
    // promise. A saving shown without it is a number somebody will commit to.
    assert.match(plan, /action\.assumes\.map/);
    assert.match(plan, /t\.plan\.assumes\(/);
  });

  it('reports shape to analytics and never content', () => {
    // The rule this app has held since the Bill tab shipped: how many, never
    // which. A label name in a telemetry payload is the log leaving the page
    // by another door.
    for (const call of plan.matchAll(/track\((.*?)\)\s*;/gs)) {
      assert.equal(
        /label|model|Usd|\.name|slice/.test(call[1]),
        false,
        `a track() call carries content: ${call[1]}`,
      );
    }
  });
});

describe('the plan panel is reachable from the bill', () => {
  it('renders inside the report, where a bill has already been read', () => {
    // A plan with no bill behind it is a plan about nothing, and a tab that
    // offers one before a log is opened teaches people to distrust the rest.
    const bill = codeOf('components/Bill.tsx');
    assert.match(bill, /<Plan\s/);
    const reportStart = bill.indexOf('function Report(');
    assert.ok(reportStart !== -1);
    assert.ok(bill.indexOf('<Plan ') > reportStart, 'the Plan panel renders inside the report');
  });
});
