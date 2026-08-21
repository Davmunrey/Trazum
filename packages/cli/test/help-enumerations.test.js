import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

import { BUNDLED_CATALOGUE, CONNECTORS } from '@trazum/core';
import { UPSTREAMS } from '../dist/gateway-server.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--help` may not enumerate providers, because such a list cannot be kept true.
 *
 * The USAGE block said `trazum gateway <anthropic|openai>` while the command's
 * own refusal — with no argument — answered *"Known: anthropic, openai,
 * deepseek, google."* The product contradicted itself in two places a reader
 * meets within one minute of each other, and the wrong one was the first.
 *
 * It went stale in the release whose entire subject was that list. Nothing
 * checked it, because the check that existed was pointed at `docs/gateway.md`
 * and the same sentence lived in the product too.
 *
 * The fix is not a longer list kept in sync. It is `<provider>`, with the
 * enumeration coming from the one place that derives it — which is what the
 * refusal has always done. This suite exists to keep the list out.
 */

const help = (args = ['--help']) =>
  `${spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 }).stdout}`;

/** Every provider name this repository knows, from wherever it is defined. */
const providers = [
  ...new Set([
    ...BUNDLED_CATALOGUE.models.map((m) => m.provider).filter(Boolean),
    ...Object.keys(UPSTREAMS),
    ...CONNECTORS.map((c) => c.id),
  ]),
].sort();

/** A USAGE line that lists two or more of them, in `<a|b>` form. */
const enumerationsIn = (text) => {
  const usage = text.slice(text.indexOf('USAGE'), text.indexOf('\n\n', text.indexOf('USAGE')));
  return usage
    .split('\n')
    .filter((line) => {
      const angled = [...line.matchAll(/<([^>]*\|[^>]*)>/g)].map((m) => m[1]);
      return angled.some((group) => group.split('|').filter((p) => providers.includes(p)).length >= 2);
    })
    .map((line) => line.trim());
};

describe('the USAGE block names no provider', () => {
  const text = help();

  it('read a USAGE block at all', () => {
    assert.match(text, /USAGE\n/);
    assert.ok(providers.length >= 5, `only ${providers.length} provider names found`);
  });

  it('lists none of them', () => {
    const listing = enumerationsIn(text);
    assert.deepEqual(
      listing,
      [],
      'these USAGE lines enumerate providers, which goes stale the next time one is ' +
        `added — use <provider> and let the command's own refusal name them:\n  ${listing.join('\n  ')}`,
    );
  });

  it('and the detector is not one that can never fire', () => {
    /**
     * Handed the exact line this suite was written for. A scan run only over
     * today's corrected help proves nothing — the fourth time this session that
     * an assertion over known-good values turned out to be unable to fail.
     */
    const planted = 'USAGE\n  trazum gateway <anthropic|openai> --on-cannot-tell <fail-open|fail-closed>\n\n';
    assert.deepEqual(enumerationsIn(planted), [
      'trazum gateway <anthropic|openai> --on-cannot-tell <fail-open|fail-closed>',
    ]);

    // And it does not fire on the shapes that are not provider lists.
    const innocent =
      'USAGE\n  trazum gateway <provider> --on-cannot-tell <fail-open|fail-closed>\n' +
      '  trazum init [dir] [--dry-run | --yes]\n' +
      '  trazum check <file|dir|-> --max-tokens <n> [options]\n\n';
    assert.deepEqual(enumerationsIn(innocent), []);
  });
});

describe('and the commands still name their providers where it is derived', () => {
  /**
   * The other half. Removing the list from USAGE would be a regression if
   * nothing else told a reader what to pass — the refusal is where that belongs,
   * because it is generated from the code rather than typed beside it.
   */
  it('trazum gateway names every provider it fronts', () => {
    const said = `${spawnSync(process.execPath, [CLI, 'gateway'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    }).stderr}`;
    const missing = Object.keys(UPSTREAMS).filter((p) => !said.includes(p));
    assert.deepEqual(missing, [], `the gateway refusal does not name: ${missing.join(', ')}`);
  });

  it('trazum connect names every connector it has', () => {
    const said = `${spawnSync(process.execPath, [CLI, 'connect'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    }).stderr}`;
    const missing = CONNECTORS.map((c) => c.id).filter((p) => !said.includes(p));
    assert.deepEqual(missing, [], `the connect refusal does not name: ${missing.join(', ')}`);
  });
});
