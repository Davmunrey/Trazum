import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * *The deterministic core stays free and offline.*
 *
 * The first of the two rules `ROADMAP.md` opens with, and the one a reader is
 * most likely to be checking when they open `SUPPORT.md`: **no feature may make
 * a network call a prerequisite for optimising a prompt.**
 *
 * `outbound-surfaces.test.js` already derives every module that *can* reach the
 * network and requires each to be named in the prose. That is a disclosure
 * rule and a good one. It is not this rule: a module can be disclosed, listed,
 * documented — and still be on the path of `trazum optimize`.
 *
 * So this proves the rule the only way it can honestly be proved, by removing
 * the network and running the command. `fetch` is replaced with a thrower
 * before the CLI loads, and the deterministic commands have to produce
 * **byte-identical output** to a run with the network intact.
 *
 * **The half that makes it mean anything** is the last test: a command that
 * genuinely needs the network has to fail under the same stub. Without it, a
 * stub that silently failed to install would leave every assertion above
 * passing and nothing proved.
 */

/** Installed with `--import`, so it is in place before any module is loaded. */
const STUB = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-offline-'));
  const path = join(dir, 'no-network.mjs');
  writeFileSync(
    path,
    "globalThis.fetch = () => { throw new Error('TRAZUM_TEST_NETWORK_USED'); };\n",
  );
  return path;
})();

const run = (args, { offline }) =>
  spawnSync(
    process.execPath,
    offline ? ['--import', STUB, CLI, ...args] : [CLI, ...args],
    { cwd: repoRoot, encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 },
  );

/** The prompt this repository ships, so the corpus is not invented here. */
const PROMPT = 'examples/sample-prompt.en.txt';

describe('optimising a prompt needs no network', () => {
  it('produces the same report with the network removed', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'trazum-offline-out-')), 'out.txt');
    const online = run(['optimize', PROMPT, '-o', out], { offline: false });
    const offline = run(['optimize', PROMPT, '-o', out], { offline: true });

    assert.equal(online.status, 0, `the ordinary run failed:\n${online.stdout}${online.stderr}`);
    assert.equal(
      offline.status,
      0,
      `optimising needed the network:\n${offline.stdout}${offline.stderr}`,
    );
    assert.equal(offline.stdout, online.stdout, 'the network changed the report');
    assert.doesNotMatch(`${offline.stdout}${offline.stderr}`, /TRAZUM_TEST_NETWORK_USED/);
  });

  it('gates a directory on tokens with the network removed', () => {
    // `check` is the command CI runs, on a runner that may have no egress at
    // all. A build that fails because the gate wanted the network would be this
    // rule broken where it costs the most.
    const result = run(['check', 'examples', '--max-tokens', '5000'], { offline: true });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /within budget/);
  });

  it('lists its rules with the network removed', () => {
    const result = run(['rules'], { offline: true });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /duplicate-blocks/);
  });

  it('and the stub bites, or none of the above proves anything', () => {
    /**
     * `--pricing-live` fetches a price list on purpose. Under the same stub it
     * has to fail, **and the failure has to carry the stub's own marker** — a
     * command that failed for some other reason would look identical from the
     * exit code alone.
     */
    const result = run(['optimize', PROMPT, '--pricing-live'], { offline: true });
    assert.notEqual(result.status, 0, 'a command that needs the network passed without it');
    assert.match(`${result.stdout}${result.stderr}`, /TRAZUM_TEST_NETWORK_USED/);
  });
});
