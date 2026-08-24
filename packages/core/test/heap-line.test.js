import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

/**
 * Memory holds a line — chapter four of the 1.63 arc.
 *
 * The 25MB log profiles within a stated heap ceiling. The number was measured
 * once by hand during the stress session and nothing held it there; this
 * asserts it the only way that is honest on any machine: the child runs with
 * V8's old space **capped at the ceiling**, so "fits" is enforced by the
 * engine rather than inferred from an RSS reading that a memory-rich runner
 * would inflate by collecting lazily. A profile that needs more than the line
 * does not come back slower — it does not come back, and the test names the
 * promise that broke.
 *
 * The ceiling is a statement, not a measurement: ~230MB of RSS was observed
 * for a 26MB log, and the line is set with room for an engine's worth of
 * weather but far below the point where "reads a 25MB file" has quietly
 * become "holds many copies of a 25MB file". Moving it is a release-notes
 * decision, the same as the token band.
 */
const HEAP_CEILING_MB = 384;

const CHILD = new URL('./fixtures/profile-25mb-child.mjs', import.meta.url).pathname;

describe('the 25MB log profiles within the stated heap line', () => {
  it(`completes with old space capped at ${HEAP_CEILING_MB}MB, and parses everything`, () => {
    const result = spawnSync(
      process.execPath,
      [`--max-old-space-size=${HEAP_CEILING_MB}`, CHILD],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 },
    );
    assert.equal(
      result.status,
      0,
      `the 25MB profile broke the ${HEAP_CEILING_MB}MB heap line:\n${(result.stderr ?? '').slice(-500)}`,
    );
    const verdict = JSON.parse(result.stdout);
    assert.ok(verdict.logBytes >= 25 * 1024 * 1024, `the probe log is ${verdict.logBytes} bytes — not 25MB`);
    assert.equal(verdict.skipped, 0, 'the generated log should have no unreadable lines');
    assert.equal(verdict.calls, verdict.lines, 'every line should have parsed as a call');
    assert.ok(Number.isInteger(verdict.maxRssBytes) && verdict.maxRssBytes > 0);
  });

  it('and the line is one the engine actually enforces', () => {
    /**
     * The ceiling proves nothing if the flag is decoration. A child asked to
     * hold far more than the cap allows must die the V8 death — otherwise
     * the assertion above is "the profile ran", with the ceiling as prose.
     */
    const hog =
      'const held = []; for (let i = 0; i < 1e6; i += 1) held.push(new Array(4096).fill(i)); console.log(held.length);';
    const result = spawnSync(process.execPath, ['--max-old-space-size=48', '-e', hog], {
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.notEqual(result.status, 0, 'the memory hog survived a 48MB old space — the cap is not binding');
  });
});
