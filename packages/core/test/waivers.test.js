import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isWaiverUse, waiverDay, waiverHistory } from '../dist/index.js';

/**
 * Waivers get their history, and it is a record rather than a reconstruction.
 *
 * 1.40 named this gap and refused to fill it by inference, which was right: a
 * config says what is waived now, and a past invented from it would be a guess
 * presented as evidence. Everything here rests on the opposite move — the use
 * is written down when it happens, and this reads it back.
 *
 * Doctrine: [Record, do not reconstruct](../../../docs/doctrine.md#record-do-not-reconstruct)
 */

const use = (over = {}) => ({
  schemaVersion: 1,
  day: '2026-01-01',
  gate: 'maxUsd',
  reason: 'the migration lands in March',
  until: '2026-04-01',
  commit: null,
  measuredUsd: 120,
  limitUsd: 100,
  ...over,
});

const gateOf = (history, gate) => history.habits.find((h) => h.gate === gate);

describe('waiverHistory', () => {
  it('says nothing about a project that has recorded nothing', () => {
    // And says it as an absence, not as a zero. "No waiver has ever fired" and
    // "recording started yesterday" are different sentences.
    const history = waiverHistory([], []);
    assert.equal(history.since, null);
    assert.equal(history.totalUses, 0);
    assert.deepEqual(history.habits, []);
  });

  it('states the day the record starts, so two uses can be read in proportion', () => {
    const history = waiverHistory([use({ day: '2026-03-04' }), use({ day: '2026-01-09' })]);
    assert.equal(history.since, '2026-01-09');
  });

  it('counts uses and distinct days apart', () => {
    // A gate hit twice by two CI jobs on one afternoon is one day of a team
    // living with a finding, and two uses. Collapsing them would understate
    // how often the build hits it; merging them would overstate how long.
    const history = waiverHistory([
      use({ day: '2026-01-01' }),
      use({ day: '2026-01-01' }),
      use({ day: '2026-02-01' }),
    ]);
    const habit = gateOf(history, 'maxUsd');
    assert.equal(habit.uses, 3);
    assert.equal(habit.days, 2);
    assert.equal(habit.firstDay, '2026-01-01');
    assert.equal(habit.lastDay, '2026-02-01');
  });

  it('calls one use one use, and nothing more', () => {
    assert.equal(gateOf(waiverHistory([use()]), 'maxUsd').verdict, 'used-once');
  });

  it('names a waiver that keeps firing under one unchanging decision', () => {
    const history = waiverHistory([
      use({ day: '2026-01-01' }),
      use({ day: '2026-01-08' }),
      use({ day: '2026-01-15' }),
    ]);
    assert.equal(gateOf(history, 'maxUsd').verdict, 'recurring');
  });

  it('separates an expiry pushed forward from a reason that was rethought', () => {
    /**
     * The distinction the whole module exists for.
     *
     * The same sentence carried past its own deadline is a decision nobody
     * revisited. A different sentence is somebody looking again. Counting
     * both as "waived four times" would flatten the one signal worth having.
     */
    const renewed = waiverHistory([
      use({ day: '2026-01-01', until: '2026-02-01' }),
      use({ day: '2026-02-02', until: '2026-03-01' }),
      use({ day: '2026-03-02', until: '2026-04-01' }),
    ]);
    const habit = gateOf(renewed, 'maxUsd');
    assert.equal(habit.verdict, 'renewed-without-revisiting');
    assert.deepEqual(habit.expiries, ['2026-02-01', '2026-03-01', '2026-04-01']);

    const rethought = waiverHistory([
      use({ day: '2026-01-01', reason: 'the migration lands in March' }),
      use({ day: '2026-02-02', reason: 'the migration slipped; the vendor contract ends in June' }),
    ]);
    assert.equal(gateOf(rethought, 'maxUsd').verdict, 'reason-changed');
  });

  it('lists reasons and expiries in the order they were first seen', () => {
    // Chronological, not alphabetical: "the reason changed" is a story, and a
    // sorted list tells it in the wrong order or in no order at all.
    const history = waiverHistory([
      use({ day: '2026-02-01', reason: 'zebra' }),
      use({ day: '2026-03-01', reason: 'aardvark' }),
    ]);
    assert.deepEqual(gateOf(history, 'maxUsd').reasons, ['zebra', 'aardvark']);
  });

  it('never invents a use from the config', () => {
    // The 1.40 refusal, held. A waiver written down and never hit is not a
    // team living with a finding; it is a line in a file.
    const history = waiverHistory([], [
      { gate: 'maxUsd', reason: 'the migration lands in March', until: '2026-04-01' },
    ]);
    assert.deepEqual(history.habits, []);
    assert.deepEqual(history.neverUsed, ['maxUsd']);
    assert.equal(history.totalUses, 0);
  });

  it('tells a gate still being waived from one somebody stopped waiving', () => {
    const history = waiverHistory(
      [use({ gate: 'maxUsd' }), use({ gate: 'maxCacheLossUsd' })],
      [{ gate: 'maxUsd', reason: 'still true', until: '2026-04-01' }],
    );
    assert.equal(gateOf(history, 'maxUsd').stillConfigured, true);
    // Fired in the past, gone from the config: the decision was reversed, and
    // the record keeps it rather than the config erasing it.
    assert.equal(gateOf(history, 'maxCacheLossUsd').stillConfigured, false);
  });

  it('ranks by how often, so the habit worth talking about is first', () => {
    const history = waiverHistory([
      use({ gate: 'maxUsd' }),
      use({ gate: 'maxDayUsd', day: '2026-01-02' }),
      use({ gate: 'maxDayUsd', day: '2026-01-03' }),
      use({ gate: 'maxDayUsd', day: '2026-01-04' }),
    ]);
    assert.equal(history.habits[0].gate, 'maxDayUsd');
  });

  it('handles a per-label gate the same as any other', () => {
    const history = waiverHistory([use({ gate: 'byLabel:support-rag' })]);
    assert.equal(gateOf(history, 'byLabel:support-rag').uses, 1);
  });
});

describe('isWaiverUse', () => {
  it('accepts what this module writes', () => {
    assert.equal(isWaiverUse(use()), true);
  });

  it('refuses anything that is not one, rather than repairing it', () => {
    // A malformed line in an append-only file is a fact about the file. A
    // reader that quietly coerces it produces a history wrong by an unknown
    // amount, which is the failure this repository refuses everywhere.
    for (const bad of [
      null,
      [],
      'a string',
      {},
      { ...use(), schemaVersion: 2 },
      { ...use(), gate: 7 },
      { ...use(), day: undefined },
      { ...use(), reason: null },
      { ...use(), until: 20260401 },
    ]) {
      assert.equal(isWaiverUse(bad), false, JSON.stringify(bad));
    }
  });

  it('does not require the optional halves', () => {
    // A use outside a repository has no commit; a gate with no dollar figure
    // behind it has no measurement. Neither makes it not a use.
    assert.equal(isWaiverUse({ ...use(), commit: null, measuredUsd: null, limitUsd: null }), true);
  });
});

describe('waiverDay', () => {
  it('is UTC, like every other day boundary in this product', () => {
    // A waiver used at 23:00 in Madrid and one used at 01:00 in Denver must
    // not land on different days depending on who ran the build.
    assert.equal(waiverDay(new Date('2026-01-01T23:59:59Z')), '2026-01-01');
    assert.equal(waiverDay(new Date('2026-01-02T00:00:00Z')), '2026-01-02');
  });
});
