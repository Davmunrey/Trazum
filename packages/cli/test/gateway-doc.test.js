import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { UPSTREAMS } from '../dist/gateway-server.js';

/**
 * The gateway's page, against the upstream table compiled into it.
 *
 * `docs/gateway.md` named `anthropic` in its opening command and never
 * mentioned `openai` — which the gateway has fronted since 1.50.3, in the same
 * commit that wrote the page. The command's own refusal says *"Known:
 * anthropic, openai"*, so the product named both and the documentation named
 * one. A reader on OpenAI could read the page end to end and conclude the
 * gateway was Anthropic-only.
 *
 * The page also said it *"forwards exactly one path"*. That was the security
 * argument — not a general proxy — and the property held: one path **per
 * provider**, two in total. The sentence was counting the wrong subject.
 *
 * `UPSTREAMS` is the source of truth for both, so both are asserted from it.
 * Membership and the exact strings, never a count.
 */

const doc = readFileSync(new URL('../../../docs/gateway.md', import.meta.url), 'utf8');

describe('docs/gateway.md describes every upstream the gateway speaks for', () => {
  it('names each provider', () => {
    /**
     * Matched as a word anywhere in the page, not as inline code.
     *
     * The first draft required `` `name` `` and so failed on `anthropic` too,
     * which the original page named perfectly well inside its opening `bash`
     * block. That would have been a guard firing on a correct page — the
     * failure mode that gets a guard deleted. Naming a provider in an example
     * command is naming it.
     */
    const missing = Object.keys(UPSTREAMS).filter(
      (name) => !new RegExp('(?<![A-Za-z0-9_])' + name + '(?![A-Za-z0-9_])').test(doc),
    );
    assert.deepEqual(
      missing,
      [],
      `the gateway fronts these and docs/gateway.md does not name them: ${missing.join(', ')}`,
    );
  });

  it('prints each origin and the one path it forwards', () => {
    /**
     * The path is the security claim in this page — "a gateway that forwarded
     * any path would be a general proxy for your API key" — so the page has to
     * say which path, per provider, rather than assert the property abstractly.
     */
    const wrong = [];
    for (const [name, { origin, path }] of Object.entries(UPSTREAMS)) {
      if (!doc.includes(origin)) wrong.push(`${name}: ${origin} is not in the page`);
      if (!doc.includes(path)) wrong.push(`${name}: the forwarded path ${path} is not in the page`);
    }
    assert.deepEqual(wrong, [], `docs/gateway.md is missing:\n  ${wrong.join('\n  ')}`);
  });

  it('does not claim a single forwarded path while there is more than one provider', () => {
    // Bounded to the sentence making the claim, not to the words "one path"
    // wherever they appear — the page uses that phrase correctly in the table.
    const sentence = doc
      .split(/(?<=\.)\s+/)
      .find((s) => /forwards exactly\s+\n?one path/.test(s.replace(/\s+/g, ' ')));
    if (!sentence) return;
    if (Object.keys(UPSTREAMS).length <= 1) return;
    assert.match(
      sentence.replace(/\s+/g, ' '),
      /per provider/,
      'the page says it forwards exactly one path, and there is more than one provider',
    );
  });
});
