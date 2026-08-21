import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const repoRoot = new URL('../../../', import.meta.url).pathname;

/**
 * The page that says what Trazum can read, against what it reads.
 *
 * `docs/usage-logs.md` exists to answer one question — *what do I put in the
 * log, and what does each field buy me?* It named nine of the fourteen keys
 * `parseUsageLine` accepts. The omissions were not cosmetic:
 *
 * - **`outcome` and `trazum_outcome` appeared nowhere in the file.** The
 *   profile report tells the user, in the product, that this is *"the one field
 *   that changes what every other figure here means"* — and the page they are
 *   sent to in order to act on that never mentioned it. A reader could record
 *   every field the document named and still get the warning.
 * - **`conversation_id`, `created_at`, `created`, `ts` and `finish_reason`**
 *   are aliases the parser has always accepted. Omitting them does not break a
 *   log; it makes somebody rewrite one that already worked, or conclude that
 *   truncation detection is Anthropic-only because their OpenAI records say
 *   `finish_reason`.
 *
 * Derived from `parseUsageLine` and bounded to it. The normalised `UsageRecord`
 * uses several of the same names further down the file, so a harvest over the
 * whole module would assert the output shape while claiming to assert the
 * input one.
 */

const source = readFileSync(new URL('../src/usage.ts', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../../../docs/usage-logs.md', import.meta.url), 'utf8');

/** Every `record.<key>` inside `parseUsageLine`, and nothing outside it. */
const acceptedKeys = () => {
  const start = source.indexOf('export function parseUsageLine');
  assert.notEqual(start, -1, 'parseUsageLine has been renamed or moved');
  const after = source.slice(start + 10);
  const next = after.search(/\n(export )?function \w+/);
  const body = next === -1 ? after : after.slice(0, next);
  const keys = [...new Set([...body.matchAll(/\brecord\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
  assert.ok(keys.length > 8, `only ${keys.length} keys found in parseUsageLine — has it changed shape?`);
  return keys.sort();
};

describe('docs/usage-logs.md names every key the parser accepts', () => {
  it('names each one as a field, not merely as a word', () => {
    /**
     * Matched as inline code or as a JSON key in an example, because that is
     * how the page names a field — and because a bare substring search was
     * wrong in both directions when it was tried: `ts` matched the ```ts
     * language tag on a code fence, so a genuinely undocumented alias passed.
     */
    const named = (key) =>
      new RegExp('`' + key + '`').test(doc) || new RegExp('"' + key + '"\\s*:').test(doc);

    const missing = acceptedKeys().filter((key) => !named(key));
    assert.deepEqual(
      missing,
      [],
      `parseUsageLine accepts these and docs/usage-logs.md does not name them: ${missing.join(', ')}`,
    );
  });

  it('says what the outcome field buys, since the product sends people here for it', () => {
    // Not just present: the row exists to answer "why would I record this?",
    // and the answer is the only one that is not about cost.
    const row = doc.split('\n').find((line) => /^\| `outcome` \|/.test(line));
    assert.ok(row, 'the outcome row has been removed from the field table');
    assert.match(
      row,
      /cheaper and cannot say whether it stopped working/,
      'the outcome row no longer says what recording it buys',
    );
  });
});
