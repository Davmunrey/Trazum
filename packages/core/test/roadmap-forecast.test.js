import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');

/**
 * The roadmap's forecast, held against what the product already does.
 *
 * ## Why this exists
 *
 * `ROADMAP.md`'s `Next` section said, for four releases after it stopped being
 * true, that the verdict bridge *"stays named and waits to be asked for, as do
 * the `from-langsmith`, `from-helicone` and `from-litellm` converters, which
 * need real exports before their formats can be read rather than guessed"*.
 * All four were in `main` by then. A reader deciding whether Trazum could read
 * their LiteLLM spend log was told, by the file whose whole job is saying what
 * exists, that it could not.
 *
 * Nothing caught it, and the reason is worth writing down: every guard in this
 * repository points at the danger of **claiming more than is built**.
 * `every-page.test.js` fails a page that shows a command the CLI does not
 * dispatch. Not one pointed the other way, at a page claiming **less** — and
 * that direction is not harmless. It is the roadmap's only job to be right
 * about it, and this project's rule is that a blocked arc stays named and is
 * never faked; the mirror of that rule is that a delivered arc stops being
 * called pending.
 *
 * ## What it does not do
 *
 * It reads the forecast sections only. `Released` is a record: *"the
 * vendor-specific converters stay named and unbuilt until a real export of
 * each is seen"* is a true statement about 1.71.0, and rewriting it to match
 * the present would be falsifying a record to satisfy a test — the same
 * objection `token-band.test.js` skips the changelog for. The boundary is read
 * off the headings rather than written down here, so a section added later is
 * covered or excluded by what it is called, not by what somebody remembered to
 * add to an array.
 */

const roadmap = readFileSync(join(ROOT, 'ROADMAP.md'), 'utf8');
const cli = readFileSync(join(ROOT, 'packages/cli/src/index.ts'), 'utf8');

/** The commands the CLI actually dispatches, from the same list every other guard reads. */
const dispatched = (() => {
  const start = cli.indexOf('const COMMAND_FLAGS');
  const block = cli.slice(start, cli.indexOf('\n};', start));
  return new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1]));
})();

/**
 * The forecast: everything under a heading that talks about the future.
 *
 * `Next` and `Under consideration` are the two, and they are matched by name
 * because they are what the file calls them. Everything else — `Released`, the
 * per-version entries, `How versions are decided` — is either a record or
 * process, and neither makes a claim about what exists today.
 */
function forecastSections() {
  const out = [];
  const headings = [...roadmap.matchAll(/^## (.+)$/gm)];
  for (const [index, heading] of headings.entries()) {
    const title = heading[1].trim();
    if (!/^(Next|Under consideration)$/i.test(title)) continue;
    const from = heading.index + heading[0].length;
    const to = headings[index + 1]?.index ?? roadmap.length;
    out.push({ title, text: roadmap.slice(from, to) });
  }
  return out;
}

describe('the roadmap does not promise what it already delivered', () => {
  it('has forecast sections to check at all', () => {
    // The failure mode this whole file has: a check that quietly measures
    // nothing because the thing it reads has been renamed.
    const sections = forecastSections();
    assert.ok(sections.length >= 1, 'no Next or Under consideration section found in ROADMAP.md');
    assert.ok(dispatched.size >= 40, `only ${dispatched.size} commands parsed out of COMMAND_FLAGS`);
  });

  it('never says a shipped command is still waiting to be built', () => {
    /**
     * The sentence shapes this project uses for named-not-built work, taken
     * from the file itself rather than invented: *"stays named"*, *"stay named
     * and unbuilt"*, *"waits to be asked for"*, *"not built"*. Any of them in
     * the same sentence as a command the CLI dispatches is the defect.
     *
     * Sentence-bounded on purpose. A paragraph mentioning `from-otel` in one
     * sentence and something unbuilt three sentences later is not a false
     * claim, and a guard that failed on it would be answered by rewriting good
     * prose to please a test.
     */
    const PENDING =
      /stays? named|waits? to be asked|not (yet )?built|unbuilt|yet to be built|still waiting/i;

    /*
      Two spellings, because the first draft of this guard only knew one and a
      live falsehood walked straight past it.

      It matched a command inside backticks, and the sentence it missed said
      *"Vendor-specific converters (LangSmith, Helicone, LiteLLM) are named as
      next but stay unbuilt"* — three shipped converters, named as the products
      they read rather than as the commands that read them, in plain prose. So
      a `from-x` command is also looked for by its subject: `from-langsmith`
      answers to "LangSmith", `from-claude-code` to "Claude Code".
    */
    const subjectOf = (command) => command.slice('from-'.length).replace(/-/g, '[- ]?');

    const wrong = [];
    for (const { title, text } of forecastSections()) {
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (!PENDING.test(sentence)) continue;

        for (const match of sentence.matchAll(/`trazum ([a-z][a-z-]*)[^`]*`|`(from-[a-z-]+)`/g)) {
          const command = match[1] ?? match[2];
          if (dispatched.has(command)) {
            wrong.push(`${title}: "${command}" is dispatched, and this calls it pending`);
          }
        }

        for (const command of dispatched) {
          if (!command.startsWith('from-')) continue;
          if (!new RegExp(`\\b${subjectOf(command)}\\b`, 'i').test(sentence)) continue;
          wrong.push(`${title}: "${command}" is dispatched, and this calls its subject pending`);
        }
      }
    }

    assert.deepEqual(
      wrong,
      [],
      'the roadmap describes shipped commands as unbuilt — a forecast that keeps ' +
        `promising delivered work is a claim nobody checks:\n  ${wrong.join('\n  ')}`,
    );
  });

  it('the released record is deliberately not checked, and still says the old thing', () => {
    /**
     * The silent half. Excluding the record is a decision, and a decision
     * nothing asserts is a decision that quietly becomes a bug the first time
     * somebody "tidies" the file: sweeping the released entries to match the
     * present is exactly the falsification this exclusion exists to allow
     * against.
     *
     * So the sentence that motivated all of this is pinned where it belongs —
     * in the record, saying what was true when it was written.
     */
    /*
      The record is *everything the forecast is not*, computed from the same
      boundary the check above uses rather than from a heading named here.

      Two earlier drafts got this wrong in the two ways this repository has a
      history of. The first ended the record at the heading that happens to
      follow it, and `publish.test.js` caught it: naming the next heading is
      the pattern that has had to be fixed nine times, because it is correct
      exactly until a section is inserted between the two. That guard reads the
      raw file, comments included, so this paragraph cannot spell the offending
      call either. The second draft reached for `sectionOf`,
      which ends at the next heading of any kind, and `## Released` is
      immediately followed by a per-version heading, so it returned the
      introduction and none of the record.
    */
    const record = forecastSections().reduce((rest, { text }) => rest.replace(text, ''), roadmap);
    assert.match(
      record,
      /converters stay named and unbuilt until a real export of each is seen/,
      'a released entry was rewritten to match the present, which falsifies the record',
    );
    // The sentence is in the record and not in the forecast, which is the
    // whole shape of this exclusion.
    for (const { title, text } of forecastSections()) {
      assert.doesNotMatch(
        text,
        /converters stay named and unbuilt/,
        `${title} carries the record's sentence`,
      );
    }
    // And it names commands that now exist, so it would fail the check above.
    assert.ok(dispatched.has('from-otel'));
    assert.ok(dispatched.has('from-otel'));
  });
});
