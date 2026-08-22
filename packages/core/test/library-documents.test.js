import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUNDLED_CATALOGUE,
  CONTRACT_NAMES,
  conform,
  profileUsage,
  rollUp,
} from '../dist/index.js';

/**
 * A document the library builds must conform without the CLI touching it.
 *
 * `docs/format.md` promises that **every document carries `schemaVersion`**, and
 * `conform` rejects one that does not. The profile did not carry it: the field
 * was stamped by `trazum profile --json` on its way out, so `profileUsage()` —
 * the function in the package whose whole job is emitting this format —
 * returned a document `trazum conform` refuses.
 *
 * Nobody would have noticed from inside. Every test that checked a profile
 * against the contract added `schemaVersion` first, because the CLI does, and a
 * fixture built the way the CLI builds it can never catch the CLI doing the
 * work. **A connector author reading `docs/format.md` and using `@trazum/core`
 * would have found out from a rejection.**
 *
 * Same shape as #290 on this project's record, where `outcome-report` was a
 * contract whose only implementation failed it for nine releases. So this
 * checks the class rather than the instance: the library's own output, handed
 * straight to the library's own checker.
 */

const LOG = [
  {
    model: 'claude-opus-5',
    label: 'chat',
    ts: '2026-08-01T10:00:00.000Z',
    usage: { input_tokens: 1000, output_tokens: 100 },
  },
  {
    model: 'claude-opus-5',
    label: 'batch',
    ts: '2026-08-02T11:00:00.000Z',
    usage: { input_tokens: 4000, output_tokens: 250 },
  },
]
  .map((record) => JSON.stringify(record))
  .join('\n');

const OPTIONS = { catalogue: BUNDLED_CATALOGUE };

/** Documents this package can build with nothing but its own exports. */
const built = () => {
  const profile = profileUsage(`${LOG}\n`, OPTIONS);
  return [
    ['profile', profile],
    // The roll-up takes contributors as text, the way it would read them off
    // disk — so this hands it exactly what the library just produced.
    ['roll-up', rollUp([{ name: 'a', text: JSON.stringify(profile) }])],
  ];
};

describe('what the library builds, the library accepts', () => {
  it('conforms every document it can build, exactly as built', () => {
    const rejected = [];
    for (const [contract, document] of built()) {
      const report = conform(JSON.stringify(document), { contract });
      if (report.problems.length > 0) {
        rejected.push(
          `${contract}: ${report.problems.map((p) => `${p.at} ${p.kind}`).join(', ')}`,
        );
      }
    }
    assert.deepEqual(
      rejected,
      [],
      `the package emits documents its own checker refuses:\n  ${rejected.join('\n  ')}`,
    );
  });

  it('stamps the version on the document rather than on the way out', () => {
    // The specific defect, named: `schemaVersion` belongs to whatever builds
    // the document, not to the command that happens to print it.
    for (const [contract, document] of built()) {
      assert.equal(document.schemaVersion, 1, `${contract} carries no schemaVersion`);
    }
  });

  it('would refuse the same document with its version removed', () => {
    /**
     * The check above only ever sees a build where the field is present, so on
     * this repository it cannot fail. Handed the document the library used to
     * return — the same object with `schemaVersion` gone — `conform` must
     * reject it, which is what makes the assertion above worth having.
     */
    const [, profile] = built()[0];
    const { schemaVersion, ...withoutVersion } = profile;
    assert.equal(schemaVersion, 1);
    const report = conform(JSON.stringify(withoutVersion), { contract: 'profile' });
    assert.ok(
      report.problems.some((problem) => problem.at === 'schemaVersion'),
      `conform accepted a profile with no schemaVersion: ${JSON.stringify(report.problems)}`,
    );
  });

  it('names the contracts it cannot reach, rather than implying it covers all ten', () => {
    /**
     * Eight of the ten contracts need something this test cannot make from the
     * package alone — a log on disk, a plan and a later log to verify it
     * against, a connector's credentials. Listing them is the difference
     * between "two documents check out" and "the format checks out", and
     * silence about incompleteness reads as completeness.
     */
    const covered = built().map(([contract]) => contract);
    const uncovered = CONTRACT_NAMES.filter((name) => !covered.includes(name));
    assert.deepEqual(uncovered.sort(), [
      'annual-record',
      'connected',
      'cost-answer',
      'history',
      'outcome-report',
      'plan',
      'usage-log',
      'verification',
    ]);
  });
});
