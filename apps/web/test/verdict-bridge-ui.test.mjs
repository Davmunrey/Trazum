import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_CATALOGUE,
  UNLABELLED,
  billLevers,
  profileUsage,
  readDroppedVerdict,
  verdictMatchesSlice,
} from '@trazum/core';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * The verdict bridge in the Bill tab: quality standing beside cost.
 *
 * The functional half runs the exact pairing the tab runs, on a bill the tab
 * would build from a log, so a verdict that matched nothing would be caught
 * here rather than on screen. The structural half pins the arm into the
 * component, including the two things a rewrite could quietly drop: the
 * match check on the render, and the caveat printed on the good verdict.
 */

const LOG = (() => {
  const lines = [];
  for (let day = 1; day <= 6; day += 1) {
    for (let i = 0; i < 5; i += 1) {
      lines.push(
        JSON.stringify({
          model: 'claude-opus-5',
          label: i % 2 === 0 ? 'chat' : 'summarise',
          ts: `2026-08-0${day}T0${i}:00:00Z`,
          usage: { input_tokens: 400_000, output_tokens: 20_000 },
        }),
      );
    }
  }
  return `${lines.join('\n')}\n`;
})();

/** A `trazum route --json` document for one of the bill's own slices. */
const measurement = (slice, over = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    slice: {
      label: slice.label,
      model: slice.model,
      modelName: slice.modelName,
      calls: slice.calls,
      spentUsd: slice.spentUsd,
      route: slice.route,
      batch: slice.batch,
      combinedUsd: slice.combinedUsd,
      shareOfBill: slice.shareOfBill,
    },
    evaluation: {
      provider: 'anthropic',
      model: slice.model,
      candidateModel: slice.route.candidate.id,
      verdict: 'indistinguishable',
      selfAgreement: 0.94,
      crossAgreement: 0.92,
      callsMade: 12,
      cases: [
        { selfSimilarity: 0.94, crossSimilarity: 0.92 },
        { selfSimilarity: 0.95, crossSimilarity: 0.91 },
      ],
      ...(over.evaluation ?? {}),
    },
  });

describe('the Bill tab sets a dropped verdict beside the route it measured', () => {
  const report = profileUsage(LOG, { catalogue: BUNDLED_CATALOGUE });
  const levers = billLevers(report, { catalogue: BUNDLED_CATALOGUE });
  const routed = levers.slices.filter((slice) => slice.route !== null);

  it('the fixture is a bill with more than one slice offering the same route', () => {
    // Without this the pairing test below would pass on a bill that could not
    // have shown the fault it exists to catch.
    assert.ok(routed.length >= 2, `only ${routed.length} routed slices in the fixture`);
    assert.equal(new Set(routed.map((slice) => slice.model)).size, 1, 'the slices differ by model, not label');
  });

  it('pairs with the slice it names and with no other', () => {
    const first = routed[0];
    const reading = readDroppedVerdict(measurement(first));
    assert.equal(reading?.kind, 'verdict');
    const paired = routed.filter((slice) => verdictMatchesSlice(reading.verdict, slice));
    assert.equal(paired.length, 1, 'a verdict paired with more than one slice of the same bill');
    assert.equal(paired[0].label, first.label);
  });

  it('pairs with nothing when the bill has no such route', () => {
    const first = routed[0];
    const elsewhere = readDroppedVerdict(
      measurement({ ...first, label: 'a-workload-this-log-does-not-carry' }),
    );
    assert.equal(
      routed.some((slice) => verdictMatchesSlice(elsewhere.verdict, slice)),
      false,
      'a measurement from another log paired with this bill',
    );
  });

  it('an unlabelled measurement pairs with the unlabelled slice, not with a named one', () => {
    const lines = [];
    for (let i = 0; i < 20; i += 1) {
      lines.push(
        JSON.stringify({
          model: 'claude-opus-5',
          ts: `2026-08-0${1 + (i % 6)}T00:0${i % 10}:00Z`,
          usage: { input_tokens: 400_000, output_tokens: 20_000 },
        }),
      );
    }
    const bare = profileUsage(`${lines.join('\n')}\n`, { catalogue: BUNDLED_CATALOGUE });
    const bareSlice = billLevers(bare, { catalogue: BUNDLED_CATALOGUE }).slices.find(
      (slice) => slice.route !== null,
    );
    assert.ok(bareSlice, 'the unlabelled fixture offers no route');
    assert.equal(bareSlice.label, UNLABELLED);
    const reading = readDroppedVerdict(measurement(bareSlice));
    assert.equal(verdictMatchesSlice(reading.verdict, bareSlice), true);
    assert.equal(
      routed.some((slice) => verdictMatchesSlice(reading.verdict, slice)),
      false,
      'an unlabelled verdict paired with a named workload',
    );
  });
});

describe('the arm in the component', () => {
  const bill = readFileSync(join(web, 'components/Bill.tsx'), 'utf8');
  const code = bill.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('still never fetches, with the bridge inside the same file', () => {
    assert.equal(/\bfetch\s*\(/.test(code), false, 'Bill.tsx contains a fetch call');
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(code), false);
  });

  it('reads the drop, holds the verdict, and names a file it could not read', () => {
    assert.match(code, /readDroppedVerdict\(/);
    assert.match(code, /setVerdict\(/);
    assert.match(code, /t\.bill\.verdictRefused\(/);
  });

  it('renders no verdict without the match check beside it', () => {
    /**
     * The one thing a rewrite could drop silently. Every render of a verdict
     * caption is guarded by the core's matcher; without it the tab would show
     * one workload's measurement against another workload's saving, which is
     * the fault this repository keeps finding in itself.
     */
    const captions = [...code.matchAll(/t\.bill\.verdict(Holds|Diverges|Inconclusive)\(/g)];
    assert.ok(captions.length >= 3, `only ${captions.length} verdict captions found`);
    assert.match(code, /verdict !== null && verdictMatchesSlice\(verdict, slice\)/);
    // And the unmatched banner is the other side: a loaded verdict that
    // describes no route here is said out loud rather than dropped.
    assert.match(code, /t\.bill\.verdictUnmatched\(/);
    assert.match(code, /!levers\.slices\.some\(\(slice\) => verdictMatchesSlice\(verdict, slice\)\)/);
  });

  it('prints the caveat on every verdict, the good one included', () => {
    // Agreement is not correctness, and a green caption that let somebody
    // forget it would be the tool overstating what it knows. The caveat sits
    // outside the three-way branch, so no verdict can be rendered without it.
    assert.match(code, /t\.bill\.verdictCaveat/);
    const branch = code.slice(code.indexOf('t.bill.verdictInconclusive('));
    const caveatAt = branch.indexOf('t.bill.verdictCaveat');
    const holdsAt = branch.indexOf('t.bill.verdictHolds(');
    assert.ok(caveatAt > holdsAt && holdsAt !== -1, 'the caveat is inside a branch rather than after it');
  });
});
