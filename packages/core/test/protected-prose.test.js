import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

/**
 * What the masker protects, and what the documents say it protects, read from
 * the same place.
 *
 * Two protections were added in one night — email addresses and indented code
 * blocks — and every document that enumerated the list kept the old five. The
 * README told a reader their addresses were not protected while the code
 * protected them; `docs/authoring-rules.md` told a rule author the same. Both
 * had been true when they were written, which is the only way a document goes
 * wrong quietly.
 *
 * The guard binds the prose to `ProtectionKind` rather than to a second copy
 * of the list, because a list written from the same list it guards agrees with
 * itself by construction — the shape of the email hole in
 * `hostile-input.test.js`, and of four other faults found the same night. Here
 * the union is parsed out of `types.ts`: a new member with no phrase fails
 * before any document is read, and a phrase absent from a document fails with
 * the file named.
 *
 * `docs/hardening.md` is deliberately not on this list. Its row states what the
 * fuzzed corpus asserts survives, which is five of the seven kinds and not the
 * protected list — holding it to this guard would make it claim coverage the
 * suite does not have.
 */

/** The union, from the type the masker and the report both compile against. */
function protectionKinds() {
  const source = read('packages/core/src/types.ts');
  const start = source.indexOf('export type ProtectionKind =');
  assert.notEqual(start, -1, 'ProtectionKind is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf(';', start));
  const kinds = [...block.matchAll(/'([a-z][a-z-]*)'/g)].map((match) => match[1]);
  assert.ok(kinds.length >= 5, `only ${kinds.length} kinds parsed out of ProtectionKind`);
  return kinds;
}

/**
 * How a document is allowed to name each kind. Prose, not identifiers — a
 * reader is owed "indented code blocks", not `indented-code`.
 */
const NAMED_AS = {
  'fenced-code': /code fences?\b/i,
  'indented-code': /indented code blocks?\b/i,
  'inline-code': /inline code\b/i,
  url: /\bURLs?\b/,
  email: /email addresses?\b/i,
  placeholder: /template placeholders?\b/i,
  'xml-tag': /XML\/HTML tags?\b/i,
};

/** Every document that tells a reader what the optimiser will not touch. */
const DOCUMENTS = [
  'README.md',
  'ROADMAP.md',
  'packages/core/README.md',
  'docs/authoring-rules.md',
  '.claude/skills/trazum/SKILL.md',
  'plugin/skills/trazum/SKILL.md',
];

describe('what the documents promise the masker protects', () => {
  const kinds = protectionKinds();

  it('names every kind the union carries, and no kind it does not', () => {
    assert.deepEqual(
      kinds.filter((kind) => !(kind in NAMED_AS)),
      [],
      'a protection was added to ProtectionKind with no prose for it — add the phrase here, then to every document below',
    );
    assert.deepEqual(
      Object.keys(NAMED_AS).filter((kind) => !kinds.includes(kind)),
      [],
      'this guard requires a protection the code no longer has',
    );
  });

  for (const document of DOCUMENTS) {
    it(`${document} enumerates all ${kinds.length}`, () => {
      /*
        Read with the hard wraps collapsed. These are wrapped Markdown, so
        "indented code blocks" is genuinely written across two lines in three
        of the six — matching the raw file would fail on line width rather
        than on meaning, which is the wrong thing for a guard to notice.
      */
      const prose = read(document).replace(/\s+/g, ' ');
      const missing = kinds.filter((kind) => !NAMED_AS[kind].test(prose));
      assert.deepEqual(missing, [], `${document} does not name: ${missing.join(', ')}`);
    });
  }
});
