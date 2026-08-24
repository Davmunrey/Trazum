import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { CONTRACT_NAMES, contractSchema } from '../../core/dist/index.js';

/**
 * `trazum schema`, run rather than read: the output must be exactly the
 * schema the library holds — byte-comparable, because a CLI that decorated
 * it would break the pipe the command exists for — and the refusal must name
 * every contract, derived from the same list `--contract` accepts.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const run = (args) =>
  spawnSync(process.execPath, [CLI, 'schema', ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });

describe('trazum schema', () => {
  it('prints each contract schema, parseable and identical to the library', () => {
    for (const name of CONTRACT_NAMES) {
      const result = run([name]);
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout), contractSchema(name), name);
    }
  });

  it('refuses with every contract named, in both locales', () => {
    for (const locale of ['en', 'es']) {
      for (const argv of [[], ['not-a-contract']]) {
        const result = run([...argv, '--locale', locale]);
        assert.equal(result.status, 1);
        for (const name of CONTRACT_NAMES) {
          assert.ok(result.stderr.includes(name), `${locale}: refusal does not name ${name}`);
        }
      }
    }
  });
});
