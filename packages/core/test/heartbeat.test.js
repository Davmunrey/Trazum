import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heartbeats } from '@trazum/core';

/**
 * Did the things that are supposed to run, run?
 *
 * The rule this exists to hold: a dead cron produces silence, and so does a
 * watcher with nothing to report. Only the age of the last run tells them
 * apart — and the three refusals below are what stop that from becoming a
 * tool that nags.
 */

const NOW = Date.parse('2026-08-22T12:00:00Z');
const hoursAgo = (n) => NOW - n * 3_600_000;
const beat = (report, kind) => report.beats.find((entry) => entry.kind === kind);

describe('heartbeats', () => {
  it('reports the age of each run in whole hours, floored', () => {
    const report = heartbeats(
      {
        watchCycleMs: hoursAgo(5) - 1_000,
        storePulledMs: hoursAgo(30),
        storeCoveredToMs: hoursAgo(48),
      },
      { nowMs: NOW },
    );
    // Floored: an age this reports as five hours is at least five hours.
    assert.equal(beat(report, 'watch-cycle').ageHours, 5);
    assert.equal(beat(report, 'store-pull').ageHours, 30);
    assert.equal(beat(report, 'store-coverage').ageHours, 48);
  });

  it('judges nothing without a stated threshold', () => {
    const report = heartbeats(
      { watchCycleMs: hoursAgo(500), storePulledMs: hoursAgo(500), storeCoveredToMs: hoursAgo(500) },
      { nowMs: NOW },
    );
    // Five hundred hours is a dead cron by anybody's reckoning, and this
    // module still declines to say so: how stale is too stale is a policy.
    for (const entry of report.beats) assert.equal(entry.verdict, 'not-judged');
    assert.equal(report.stale, false);
    assert.equal(report.maxStaleHours, null);
  });

  it('gates on a run that is past the threshold', () => {
    const report = heartbeats(
      { watchCycleMs: hoursAgo(50), storePulledMs: hoursAgo(2), storeCoveredToMs: hoursAgo(2) },
      { nowMs: NOW, maxStaleHours: 36 },
    );
    assert.equal(beat(report, 'watch-cycle').verdict, 'stale');
    assert.equal(beat(report, 'store-pull').verdict, 'within');
    assert.equal(report.stale, true);
  });

  it('does not fire on the threshold itself, only past it', () => {
    const exactly = heartbeats(
      { watchCycleMs: hoursAgo(36), storePulledMs: null, storeCoveredToMs: null },
      { nowMs: NOW, maxStaleHours: 36 },
    );
    assert.equal(beat(exactly, 'watch-cycle').verdict, 'within');
    assert.equal(exactly.stale, false);
  });

  it('never calls something that has never run stale', () => {
    const report = heartbeats(
      { watchCycleMs: null, storePulledMs: null, storeCoveredToMs: null },
      { nowMs: NOW, maxStaleHours: 1 },
    );
    for (const entry of report.beats) {
      assert.equal(entry.verdict, 'never-run');
      // Absence, not zero: no age exists for something that never happened.
      assert.equal(entry.ageHours, null);
      assert.equal(entry.lastMs, null);
    }
    // A gate that fired on "you have not adopted this feature" would be a tool
    // nagging rather than measuring.
    assert.equal(report.stale, false);
  });

  it('reports how far the measurements reach and never judges it', () => {
    /**
     * A store whose newest record covers up to two days ago is a provider
     * reporting on its own schedule, not a job that failed. Judging it by the
     * same threshold would produce a red build for somebody else's latency.
     */
    const report = heartbeats(
      { watchCycleMs: hoursAgo(1), storePulledMs: hoursAgo(1), storeCoveredToMs: hoursAgo(400) },
      { nowMs: NOW, maxStaleHours: 6 },
    );
    const coverage = beat(report, 'store-coverage');
    assert.equal(coverage.ageHours, 400);
    assert.equal(coverage.verdict, 'not-judged');
    assert.equal(report.stale, false);
  });

  it('treats a future instant as no age rather than a negative one', () => {
    // A clock that disagrees with the file's is somebody else's problem; a
    // negative age would be this module's.
    const report = heartbeats(
      { watchCycleMs: NOW + 10 * 3_600_000, storePulledMs: null, storeCoveredToMs: null },
      { nowMs: NOW, maxStaleHours: 1 },
    );
    assert.equal(beat(report, 'watch-cycle').ageHours, 0);
    assert.equal(beat(report, 'watch-cycle').verdict, 'within');
  });

  it('ignores a threshold that is not a number', () => {
    const report = heartbeats(
      { watchCycleMs: hoursAgo(500), storePulledMs: null, storeCoveredToMs: null },
      { nowMs: NOW, maxStaleHours: Number.NaN },
    );
    assert.equal(report.maxStaleHours, null);
    assert.equal(beat(report, 'watch-cycle').verdict, 'not-judged');
  });
});
