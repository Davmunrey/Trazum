import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { CONTRACT_NAMES, outcomeReport } from '../../core/dist/index.js';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * Every contract table in `docs/json-output.md`, and the guard that holds it.
 *
 * The file opens by calling itself the contract. Its second sentence used to
 * name **one** test file — `json-contract.test.js` — and the file documents
 * fifteen documents. Nine of them were genuinely harvested by a test somewhere
 * in this repository and six were not, and nothing anywhere said which was
 * which, so the six drifted in the only direction an unguarded table can: the
 * roll-up document listed three top-level fields and the command emitted
 * nineteen.
 *
 * This is the doctrine's own rule — *put the promise next to the inventory* —
 * applied to the promise the contract file makes about itself. The inventory is
 * taken out of the document rather than typed here, so a table added tomorrow
 * arrives in it whether or not anybody remembers this file.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const DOC = join(ROOT, 'docs/json-output.md');

/** The row that opens a field table. A section with one is a contract. */
const TABLE = '| Field | What it holds |';

/** Every `##` heading in the document, in order. */
const headings = (text) => [...text.matchAll(/^## .*$/gm)].map((match) => match[0]);

/** The headings whose section actually carries a field table. */
const contracts = (text) =>
  headings(text).filter((heading) => sectionOf(text, heading).includes(TABLE));

/**
 * Which test harvests which table.
 *
 * A claim here is not taken on trust: the test below opens each file and
 * requires it to name the heading in a `sectionOf` call, so moving a harvest
 * out of a file breaks the claim rather than the silence.
 */
/**
 * Every `## ` heading this file passes to something, as an argument.
 *
 * Deliberately not `sectionOf` by name: the nine older harvests call that, the
 * six below call a helper of their own, and a check that only recognised one
 * spelling would report a table as unguarded the day somebody wrapped the call.
 */
const HARVEST = (text) =>
  [...text.matchAll(/\b\w+\(\w+, '(## [^']*)'\)/g)].map((match) => match[1]);

const CLAIMED = {
  '## Top-level fields': 'packages/cli/test/json-contract.test.js',
  '## The `--by-source` document': 'packages/cli/test/contract-coverage.test.js',
  '## The plan document': 'packages/cli/test/plan.test.js',
  '## The verification document': 'packages/cli/test/verify.test.js',
  '## The history document': 'packages/cli/test/history.test.js',
  '## The connected report document': 'packages/cli/test/connect.test.js',
  '## The cost answer document': 'packages/cli/test/serve.test.js',
  '## The spend-guard document': 'packages/mcp/test/guard.test.js',
  '## The first-run document': 'packages/cli/test/init.test.js',
  '## The outcome report document': 'packages/cli/test/contract-coverage.test.js',
  '## The annual record document': 'packages/cli/test/contract-coverage.test.js',
  '## The roll-up document': 'packages/cli/test/contract-coverage.test.js',
  '## The pulse document': 'packages/cli/test/contract-coverage.test.js',
  '## The rule-yield document': 'packages/cli/test/contract-coverage.test.js',
  '## The gateway refusal document': 'packages/cli/test/gateway-proxy.test.js',
};

describe('every contract in docs/json-output.md is claimed by a guard', () => {
  it('claims every table the document carries, and no table it does not', async () => {
    const found = contracts(await readFile(DOC, 'utf8'));
    assert.deepEqual(
      found.filter((heading) => !(heading in CLAIMED)),
      [],
      'a contract table in docs/json-output.md that no test claims — it can drift in silence',
    );
    assert.deepEqual(
      Object.keys(CLAIMED).filter((heading) => !found.includes(heading)),
      [],
      'a claim for a table that is no longer in docs/json-output.md',
    );
  });

  it('finds the harvest inside every file it claims', async () => {
    const broken = [];
    for (const [heading, file] of Object.entries(CLAIMED)) {
      const text = await readFile(join(ROOT, file), 'utf8');
      // The heading has to be an argument to a call — `sectionOf(doc, '...')`
      // in the nine older harvests, `promised(document, '...')` in the six
      // below. Mentioning it in a comment is not enforcement, and that is the
      // whole difference this file exists to make.
      if (!HARVEST(text).includes(heading)) broken.push(`${heading} -> ${file}`);
    }
    assert.deepEqual(broken, [], 'a claimed file does not harvest the table it claims');
  });

  it('tells a section with a table from one without', () => {
    /**
     * The harvest above decides what counts as a contract, so on this
     * repository it can only ever return today's answer. Handed a document
     * written for the purpose, it has to include the section that carries a
     * table and leave out the two that do not — otherwise "every table is
     * claimed" is a sentence about whatever the harvest happened to notice.
     */
    const made = [
      '# A document',
      '',
      '## The promise',
      '',
      'Prose, and no table at all.',
      '',
      '## The example document',
      '',
      TABLE,
      '| --- | --- |',
      '| `schemaVersion` | `1`. |',
      '',
      '## What it deliberately does not contain',
      '',
      'More prose.',
      '',
    ].join('\n');
    assert.deepEqual(headings(made).length, 3);
    assert.deepEqual(contracts(made), ['## The example document']);
  });

  it('has a claim for every test file in this repository that harvests one', async () => {
    /**
     * The other direction, and the one that would have caught the six.
     *
     * The map above could name a file that harvests nothing and still pass, so
     * this walks the test directories, finds every `sectionOf(..., '## ...')`
     * call anywhere in them, and requires the map to agree: a harvest this file
     * does not know about means the map is a partial picture of enforcement,
     * which is exactly what it exists to stop being.
     */
    const harvests = new Map();
    for (const pkg of ['cli', 'core', 'mcp']) {
      const dir = join(ROOT, 'packages', pkg, 'test');
      for (const entry of await readdir(dir)) {
        if (!entry.endsWith('.test.js')) continue;
        const file = `packages/${pkg}/test/${entry}`;
        const text = await readFile(join(dir, entry), 'utf8');
        for (const heading of HARVEST(text)) {
          if (!harvests.has(heading)) harvests.set(heading, new Set());
          harvests.get(heading).add(file);
        }
      }
    }
    const document = await readFile(DOC, 'utf8');
    const inDoc = new Set(contracts(document));
    const unclaimed = [...harvests]
      .filter(([heading, files]) => inDoc.has(heading) && !files.has(CLAIMED[heading]))
      .map(([heading, files]) => `${heading} harvested in ${[...files].join(', ')}`);
    assert.deepEqual(unclaimed, [], 'a contract table is harvested by a file the map does not name');
  });
});

/**
 * The six tables nobody was harvesting, held the way the other nine are.
 *
 * Two of them were wrong when this was written. The roll-up document listed
 * three top-level fields and `trazum rollup --json` emitted nineteen — the
 * merged bill, both periods, the duplicate and overlap findings and the typed
 * caveats were all absent from the contract a consumer builds against. The
 * fleet document did not mention `schemaVersion`, the one field the file's own
 * promise section says is the only thing you must branch on.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/** Every table row's first cell, whatever the field is called. */
const ROW = /^\| ((?:`[^`]+`(?:, )?)+) \|/gm;

/**
 * The top-level names a table promises.
 *
 * A row may name several (`totalUsd`, `totalCalls`) or none at this level
 * (`rollup.worst`, `contributors[].via`, `promises.arrivedUsd`) — a dotted
 * token belongs to a nested shape and is documented, not emitted at the top.
 * `[]` is a shape marker, not part of the name.
 */
const promised = (document, heading) => {
  const scope = sectionOf(document, heading);
  const rows = [...scope.matchAll(ROW)];
  assert.notEqual(rows.length, 0, `no readable row under ${heading}`);
  const names = new Set();
  for (const row of rows) {
    const tokens = [...row[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    assert.notEqual(tokens.length, 0, `a row under ${heading} names no field`);
    for (const token of tokens) {
      if (token.includes('.')) continue;
      names.add(token.replace(/\[\]$/, ''));
    }
  }
  return names;
};

const bothWays = (heading, promisedNames, emitted) => {
  assert.deepEqual(
    emitted.filter((key) => !promisedNames.has(key)),
    [],
    `fields emitted with no line under ${heading} in docs/json-output.md`,
  );
  assert.deepEqual(
    [...promisedNames].filter((key) => !emitted.includes(key)),
    [],
    `fields promised under ${heading} and not emitted`,
  );
};

/** A log rich enough that every optional finding has something to say. */
const LOG = (() => {
  const models = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'no-such-model'];
  const labels = ['chat', 'batch', 'summarise'];
  const lines = [];
  for (let day = 1; day <= 8; day += 1) {
    for (let i = 0; i < 6; i += 1) {
      lines.push(
        JSON.stringify({
          model: models[(day + i) % models.length],
          label: labels[(day + i) % labels.length],
          session: `s${(day + i) % 4}`,
          ts: `2026-08-0${day}T${String((i * 3) % 24).padStart(2, '0')}:0${i}:00Z`,
          stop_reason: i % 5 === 0 ? 'max_tokens' : 'end_turn',
          outcome: i % 3 === 0 ? 'fail' : 'ok',
          max_tokens: 1024,
          usage: {
            input_tokens: 1000 + i * 777 + day * 13,
            output_tokens: 100 + i * 37,
            cache_read_input_tokens: i * 211,
            cache_creation_input_tokens: (i % 2) * 333,
          },
        }),
      );
    }
  }
  return `${lines.join('\n')}\n`;
})();

const run = (args, cwd) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 60000,
    cwd,
  });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
  return JSON.parse(result.stdout);
};

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-coverage-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.jsonl'), LOG);
  await writeFile(join(dir, 'src', 'b.jsonl'), LOG.split('\n').slice(0, 20).join('\n') + '\n');
  return dir;
};

describe('the six contracts that had no guard', () => {
  it('holds the `--by-source` document, which never documented its schema version', async () => {
    const dir = await workspace();
    await writeFile(
      join(dir, 'trazum.config.json'),
      JSON.stringify({ sources: { alpha: ['src/a.jsonl'], beta: ['src/b.jsonl'] } }),
    );
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(run(['profile', '.', '--by-source', '--json'], dir));
    bothWays('## The `--by-source` document', promised(document, '## The `--by-source` document'), emitted);
  });

  it('holds the roll-up document, which documented three of its nineteen fields', async () => {
    const dir = await workspace();
    const one = join(dir, 'one.json');
    const profile = spawnSync(process.execPath, [CLI, 'profile', join(dir, 'src', 'a.jsonl'), '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 60000,
    });
    assert.equal(profile.status, 0, profile.stderr);
    await writeFile(one, profile.stdout);
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(run(['rollup', one, '--json']));
    bothWays('## The roll-up document', promised(document, '## The roll-up document'), emitted);
  });

  it('holds the annual record document', async () => {
    const dir = await workspace();
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(run(['report', join(dir, 'src', 'a.jsonl'), '--year', '2026', '--json']));
    bothWays('## The annual record document', promised(document, '## The annual record document'), emitted);
  });

  it('holds the pulse document', async () => {
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(run(['pulse', '--json']));
    bothWays('## The pulse document', promised(document, '## The pulse document'), emitted);
  });

  it('holds the rule-yield document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-yield-'));
    await writeFile(
      join(dir, 'a.txt'),
      'Please kindly note that you should in order to do the thing.\n\nPlease kindly note that you should in order to do the thing.\n',
    );
    await writeFile(join(dir, 'b.txt'), 'You are a helpful assistant. Very very important: be concise.\n');
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(run(['rules', '--measure', dir, '--json']));
    bothWays('## The rule-yield document', promised(document, '## The rule-yield document'), emitted);
  });

  it('holds the outcome report document, which no command emits', async () => {
    // The one contract with no command behind it: `@trazum/core` computes it so
    // somebody else's tool can produce the format. Held against the library's
    // own output, since there is nothing else to hold it against.
    const document = await readFile(DOC, 'utf8');
    const emitted = Object.keys(
      outcomeReport(
        {
          byValue: [
            { value: 'ok', calls: 3, usd: 1.5 },
            { value: 'weird', calls: 1, usd: 0.5 },
          ],
          recorded: 4,
          parsed: 6,
          unrecordedUsd: 2,
        },
        { values: ['ok', 'fail'], success: ['ok'] },
      ),
    );
    bothWays('## The outcome report document', promised(document, '## The outcome report document'), emitted);
  });

  it('reads a row that names several fields, and one that names none at this level', () => {
    /**
     * The harvest above decides what every guard in this file demands, and on
     * this repository it only ever sees rows that happen to parse. Handed the
     * two shapes that actually appear — one cell naming four fields, one naming
     * a nested field that is documented and never emitted at the top — it has
     * to return exactly the top-level names, or every "both ways" check above
     * is agreeing with a misreading.
     */
    const made = [
      '## The example document',
      '',
      TABLE,
      '| --- | --- |',
      '| `root`, `files`, `prompts`, `truncated` | Four in one cell. |',
      '| `promises.arrivedUsd` | Documented, deliberately not emitted. |',
      '| `beats[]` | A shape marker, not part of the name. |',
      '',
    ].join('\n');
    assert.deepEqual(
      [...promised(made, '## The example document')].sort(),
      ['beats', 'files', 'prompts', 'root', 'truncated'],
    );
  });
});

/**
 * `docs/format.md` is the front door of the interchange format, and it counts.
 *
 * Its first sentence states how many documents there are; its table is the list
 * a connector author works from. The page already carries a confession that the
 * count said "seven" through four additions — and the same thing had happened
 * again by the time this was written: three documents with their own contract
 * table, their own `schemaVersion` and their own emitter (`pulse`,
 * `rules --measure`, and the gateway's 402 body) were in neither the table nor
 * the count.
 *
 * So none of it is read here. The list is derived from the contract tables that
 * exist, matched by the anchors the page itself links to, and the counts in the
 * prose are derived from the list.
 */

const FORMAT = join(ROOT, 'docs/format.md');

/** GitHub's heading anchor, which is what the table's last column links to. */
const anchor = (heading) =>
  heading
    .replace(/^## /, '')
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');

const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
const ORDINALS = {
  13: 'thirteenth',
  14: 'fourteenth',
  15: 'fifteenth',
  16: 'sixteenth',
  17: 'seventeenth',
};

/** The rows of the front-door table: name, `--contract` cell, and where it links. */
const formatRows = (page) =>
  [...page.matchAll(/^\| \*\*([^*]+)\*\* \| [^|]* \| ([^|]*) \| ([^|]*) \|$/gm)].map((row) => ({
    name: row[1].trim(),
    contract: row[2].trim().replace(/`/g, ''),
    documentedIn: row[3].trim(),
  }));

/**
 * The one contract with a page of its own.
 *
 * The plan is documented twice — a section in `json-output.md` and
 * `plan-format.md`, which the front-door table links to instead of the anchor.
 * Listed here rather than special-cased silently, and the entry is checked: the
 * page has to exist, carry a field table, and be what the row actually links
 * to. Moving another contract to its own page fails the anchor check first,
 * which is the loud outcome.
 */
const ELSEWHERE = { '## The plan document': 'docs/plan-format.md' };

describe('docs/format.md counts what exists', () => {
  it('has a row for every contract table in docs/json-output.md, matched by the anchor it links to', async () => {
    const page = await readFile(FORMAT, 'utf8');
    const document = await readFile(DOC, 'utf8');
    const linked = formatRows(page)
      .map((row) => row.documentedIn.match(/json-output\.md#([a-z0-9-]+)/))
      .filter(Boolean)
      .map((match) => match[1]);
    for (const [heading, file] of Object.entries(ELSEWHERE)) {
      const own = await readFile(join(ROOT, file), 'utf8');
      assert.ok(own.includes(TABLE), `${file} carries no field table`);
      const row = formatRows(page).find((entry) => entry.documentedIn.includes(file.replace('docs/', '')));
      assert.ok(row, `no row in docs/format.md links to ${file}`);
      linked.push(anchor(heading));
    }
    const exists = contracts(document).map(anchor);
    assert.deepEqual(
      exists.filter((slug) => !linked.includes(slug)),
      [],
      'a contract documented in docs/json-output.md that the interchange page does not list — a connector author reading format.md would not know it is there',
    );
    assert.deepEqual(
      linked.filter((slug) => !exists.includes(slug)),
      [],
      'the interchange page links to a section of docs/json-output.md that carries no contract table',
    );
  });

  it('says the same count in README.md that the front door says', async () => {
    /**
     * `interchange.test.js` already holds `docs/format.md`'s sentence to the
     * table under it, and has since the count said seven with ten rows. It did
     * not catch these three, and could not have: **both halves it compares are
     * written by hand**, so a document missing from the table and missing from
     * the sentence leaves the two agreeing. The check above is the half that
     * was absent — the table against the contracts that exist.
     *
     * This is the other place the same sentence is written. `README.md` said
     * twelve in the section a reader lands on from the feature list, and one
     * page being derived from the table is no help to the other.
     */
    const rows = formatRows(await readFile(FORMAT, 'utf8'));
    const emitted = rows.length - 1; // the outcome report is defined, never emitted
    const readme = (await readFile(join(ROOT, 'README.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.ok(
      readme.includes(
        `Trazum emits ${WORDS[emitted]} documents, defines a ${ORDINALS[rows.length]} it does not emit`,
      ),
      `README.md does not say ${WORDS[emitted]} and a ${ORDINALS[rows.length]}`,
    );
  });

  it('agrees with `--contract` about which documents it can check, and how many', async () => {
    /*
      Stronger than the two checks `interchange.test.js` already makes, in one
      place each: that file requires every contract name to appear *somewhere*
      on the page, which prose satisfies, and requires every cell it finds to be
      a name the CLI accepts. Neither notices a contract named in a paragraph
      and missing from the column, so this compares the column to the list.
    */
    const raw = await readFile(FORMAT, 'utf8');
    const page = raw.replace(/\s+/g, ' ');
    const named = formatRows(raw)
      .map((row) => row.contract)
      .filter((cell) => cell !== '—' && cell !== '');
    assert.deepEqual(
      named.slice().sort(),
      CONTRACT_NAMES.slice().sort(),
      'the table names a different set of checkable contracts than `--contract` accepts',
    );
    assert.ok(
      page.includes(`**\`--contract\` names ${WORDS[CONTRACT_NAMES.length]} of them.**`),
      `the prose does not say ${WORDS[CONTRACT_NAMES.length]}, and --contract accepts ${CONTRACT_NAMES.length}`,
    );
  });

  it('keeps the plan\'s two tables agreeing on what the document holds', async () => {
    /**
     * Documented twice is documented twice: `plan-format.md` breaks the actions
     * out into a table of their own, so the comparison is at the top level,
     * where both pages claim to list the same document.
     */
    const own = await readFile(join(ROOT, 'docs/plan-format.md'), 'utf8');
    const shared = promised(await readFile(DOC, 'utf8'), '## The plan document');
    const here = promised(own, '## What it holds');
    assert.deepEqual([...here].sort(), [...shared].sort(), 'the plan is documented twice and the two disagree');
  });

  it('builds the anchor GitHub builds, including the one with backticks and dashes', () => {
    /**
     * The whole match above runs through `anchor`, so a slug rule that quietly
     * disagreed with GitHub's would report every row as missing or none. The
     * awkward one is real: `## The \`--by-source\` document` has to become
     * `the---by-source-document`, backticks gone and the dashes kept.
     */
    assert.equal(anchor('## Top-level fields'), 'top-level-fields');
    assert.equal(anchor('## The `--by-source` document'), 'the---by-source-document');
    assert.equal(anchor('## The roll-up document'), 'the-roll-up-document');
  });
});
