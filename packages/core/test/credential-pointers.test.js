import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { CONNECTORS } from '../dist/index.js';

const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * A pointer to a credential has to land where the credential is named.
 *
 * `docs/usage-logs.md` ended its connector paragraph with *"See
 * [accounts.md](accounts.md) for the key"*. `docs/accounts.md` is about signing
 * in to the **web app** — GitHub OAuth, the prompt library, share links — and
 * contains no provider key, no admin API and no mention of `trazum connect`. A
 * reader who wanted the Anthropic Admin key was sent to a page that could not
 * answer, with no sign that it was the wrong page.
 *
 * The root was one row above it in the documentation index, which described
 * `accounts.md` as *"Provider accounts — Connecting a provider so usage arrives
 * on its own"*. That description was wrong about what the file is, and the
 * cross-reference was written trusting it. **A mislabelled index does not stay
 * one mistake**: it propagates into every document that consults it.
 *
 * There is no mechanical way to assert that a one-line summary describes a file
 * honestly. There is a mechanical way to assert the consequence that actually
 * hurt: a sentence promising a credential must point at a file that names one.
 */

const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8');

/** Every environment variable any connector will read a key from. */
const credentialNames = CONNECTORS.flatMap((connector) => connector.credentialEnv);

describe('a sentence that promises a key points at a page that names one', () => {
  it('knows which names count', () => {
    assert.ok(credentialNames.length >= 2, 'CONNECTORS declares no credential environment variables');
  });

  for (const page of ['docs/usage-logs.md', 'docs/accounts.md', 'docs/ci.md', 'docs/gateway.md']) {
    it(`${page} sends readers somewhere that has the key`, () => {
      /**
       * Bounded to sentences that actually promise a credential — "for the
       * key", "the key is there", "see X for credentials". A search for every
       * link near the word "key" would flag `--exact-tokens` telling somebody
       * about `ANTHROPIC_API_KEY` in a sentence that names it inline, which is
       * correct and needs no pointer at all.
       */
      const text = read(page);
      const promises = [...text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)[^.\n]{0,40}for (the key|credentials)/g)];

      const broken = [];
      for (const [, label, target] of promises) {
        const path = target.split('#')[0];
        if (!path.endsWith('.md')) continue;
        const resolved = resolve(join(repoRoot, dirname(page)), path);
        const body = readFileSync(resolved, 'utf8');
        if (!credentialNames.some((name) => body.includes(name))) {
          broken.push(`"${label}" → ${path}, which names no connector credential`);
        }
      }
      assert.deepEqual(
        broken,
        [],
        `${page} promises a key and points somewhere that does not have it:\n  ${broken.join('\n  ')}`,
      );
    });
  }

  it('and every connector credential is named in the documentation at all', () => {
    // The other direction: a connector whose key nothing documents cannot be
    // set up by anybody who did not read the source.
    const corpus = ['README.md', 'docs/usage-logs.md'].map(read).join('\n');
    const undocumented = CONNECTORS.filter(
      (connector) => !connector.credentialEnv.some((name) => corpus.includes(name)),
    ).map((connector) => connector.id);
    assert.deepEqual(
      undocumented,
      [],
      `these connectors exist and their credential is documented nowhere: ${undocumented.join(', ')}`,
    );
  });
});
