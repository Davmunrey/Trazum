import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

import { BUNDLED_CATALOGUE, CONNECTORS } from '@trazum/core';
import { UPSTREAMS } from '../dist/gateway-server.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * A provider Trazum prices but cannot front is not a typo.
 *
 * Until 1.53 `trazum gateway mistral` and `trazum gateway bogus` got the same
 * sentence — *"is not a provider this gateway speaks for"* — though one is a
 * gap in this tool with a real workaround and the other is a misspelling. The
 * refusal told a user with a live Mistral bill to check their spelling.
 *
 * Seven providers are priced; two are fronted and two connected. That is the
 * whole subject of the 1.53 arc, and the first honest thing to do about it is
 * stop describing the gap as the user's mistake.
 *
 * Everything here is derived: the priced set from the catalogue, the supported
 * sets from `UPSTREAMS` and `CONNECTORS`. A provider that gains an upstream
 * stops being in the gap list without anyone editing this file, and one added
 * to pricing joins it the same way.
 */

const run = (args) =>
  `${spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 }).stderr}`;

const priced = [
  ...new Set(BUNDLED_CATALOGUE.models.map((m) => m.provider).filter(Boolean)),
];

describe('a priced provider without support says so', () => {
  it('has a gap to talk about at all', () => {
    // If this ever fails because every priced provider is supported, the arc
    // is finished and these tests should be deleted rather than weakened.
    const fronted = Object.keys(UPSTREAMS);
    const gap = priced.filter((p) => !fronted.includes(p));
    assert.ok(gap.length > 0, 'every priced provider is fronted — delete this suite, 1.53 is done');
  });

  for (const provider of priced.filter((p) => !Object.keys(UPSTREAMS).includes(p))) {
    it(`gateway ${provider}: names the gap, not the user`, () => {
      const said = run(['gateway', provider]);
      assert.match(said, new RegExp(`prices ${provider}`), 'does not say the provider is priced');
      assert.doesNotMatch(
        said,
        /is not a provider this gateway speaks for/,
        'a priced provider was refused as though it were a typo',
      );
      // A refusal never arrives bare: it has to leave the reader somewhere.
      assert.match(said, /trazum profile/, 'the refusal names no way forward');
    });
  }

  for (const provider of priced.filter((p) => !CONNECTORS.some((c) => c.id === p))) {
    it(`connect ${provider}: names the gap, not the user`, () => {
      const said = run(['connect', provider]);
      assert.match(said, new RegExp(`prices ${provider}`));
      assert.doesNotMatch(said, /There is no connector for/, 'refused as though it were a typo');
      assert.match(said, /trazum profile/);
    });
  }

  it('still refuses a name it has never heard, as a name it has never heard', () => {
    /**
     * The other direction, and the one that keeps this honest. A refusal that
     * greeted every unknown string as "a provider we price but do not front"
     * would be worse than the bare one it replaced: it would tell somebody who
     * mistyped that Trazum supports their imaginary provider.
     */
    const gateway = run(['gateway', 'nonesuch']);
    assert.match(gateway, /is not a provider this gateway speaks for/);
    assert.doesNotMatch(gateway, /prices nonesuch/);

    const connect = run(['connect', 'nonesuch']);
    assert.match(connect, /There is no connector for/);
    assert.doesNotMatch(connect, /prices nonesuch/);
  });
});
