import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

import { BUNDLED_CATALOGUE, CONTRACT_NAMES, outcomeReport, profileUsage } from '@trazum/core';
import { en } from '../dist/i18n/en.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const FORMAT = new URL('../../../docs/format.md', import.meta.url).pathname;

/**
 * The interchange format, held to what it says about itself.
 *
 * `docs/format.md` is the page whose entire job is telling another tool what it
 * can build against. It opened with "Trazum emits seven documents" while its own
 * table listed ten rows, and it named neither of the two contracts added at
 * 1.50.4 and 1.51.0 — so the page was wrong about the count, wrong about the
 * membership, and nothing read it.
 */

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-interchange-'));
  const record = (day, outcome) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      session: `s${day}`,
      ts: `2026-08-0${day}T10:00:00Z`,
      stop_reason: 'end_turn',
      ...(outcome === undefined ? {} : { outcome }),
      usage: { input_tokens: 200_000, output_tokens: 100 },
    });
  await writeFile(
    join(dir, 'usage.jsonl'),
    `${[record(1, 'resolved'), record(2, 'escalated'), record(3)].join('\n')}\n`,
  );
  return dir;
};

const run = (dir, args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

describe('--json means JSON, not JSON after a report', () => {
  /**
   * `trazum report --year --json` printed the human report and *then* appended
   * the document, and its help said "Also emit". The one command emitting the
   * `annual-record` contract was the one command whose output no machine could
   * read: `| jq` and `| trazum conform -` both die on the prose in front.
   *
   * The test that covered it did `stdout.indexOf('{')` and parsed from there —
   * a step no consumer can take — so the assertion passed and the defect was
   * invisible. A guard that works around the bug it is standing next to is the
   * shape this suite keeps finding.
   *
   * **Not every `--json` command is here, and the split is now asserted.**
   * `verify`, `connect`, `store`, `watch`, `route` and `prune` need a
   * credential, a running loop or a paid call to reach their output, and a
   * fixture that fakes those would be testing the fixture. `history` needs
   * three dated reports first; it is driven end to end in `history.test.js`,
   * which parses its stdout whole, so it is covered rather than skipped.
   *
   * The five below are the ones a usage log alone can drive.
   *
   * **This sentence used to say "the six below" above a list of five, and
   * omitted `history` from both halves.** It was written in the change whose
   * whole argument was that a gap should be *named rather than counted* — and
   * it stated a count, got it wrong, and left one command in neither list. The
   * count is gone and `everyJsonCommand` below now asserts the partition, so
   * the next `--json` command cannot be quietly absent from both.
   */
  const DRIVABLE = [
    ['profile', ['profile', 'usage.jsonl']],
    ['plan', ['plan', 'usage.jsonl']],
    ['report', ['report', 'usage.jsonl', '--year', '2026']],
    ['conform', ['conform', 'usage.jsonl']],
    ['init', ['init', '--dry-run']],
    ['position', ['position', 'usage.jsonl']],
  ];

  /**
   * Commands whose `--json` output is proven somewhere other than here, and why.
   *
   * Named with the reason, because "it is tested elsewhere" is the sentence
   * that stops being true without anybody noticing.
   */
  const COVERED_ELSEWHERE = {
    history: 'history.test.js drives it on three dated reports and parses stdout whole',
    rollup:
      'rollup-cli.test.js drives it on profile documents this CLI wrote, parses stdout whole and pipes it through conform',
    pulse:
      'pulse.test.js drives it on a watch state and a store it writes, parses stdout whole and asserts the gate',
    rules:
      'rule-yield.test.js measures the arithmetic directly against fixtures whose answer is known before the harness runs; --json is the same report serialised',
    write:
      'write-cli.test.js drives it through --answers and parses stdout whole, on a draft and on a refusal; write-assembly.test.js pipes the same document through conform',
    bench:
      'bench.test.js drives one workload and the whole run, parses stdout whole, and holds the document to its json-output.md table in both directions',
  };

  /** Needs something a usage log cannot supply, so a fixture would test the fixture. */
  const NEEDS_MORE_THAN_A_LOG = ['verify', 'connect', 'store', 'watch', 'route', 'prune'];

  it('every command that accepts --json is covered here or named as an exception', () => {
    const cli = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const block = cli.slice(
      cli.indexOf('const COMMAND_FLAGS'),
      cli.indexOf('};', cli.indexOf('const COMMAND_FLAGS')),
    );
    const jsonCommands = [...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?: \[(.*?)\],$/gm)]
      .filter((m) => m[2].includes("'json'"))
      .map((m) => m[1]);
    assert.ok(jsonCommands.length > 8, `only ${jsonCommands.length} --json commands found`);

    const accounted = new Set([
      ...DRIVABLE.map(([name]) => name),
      ...Object.keys(COVERED_ELSEWHERE),
      ...NEEDS_MORE_THAN_A_LOG,
    ]);
    const unclassified = jsonCommands.filter((name) => !accounted.has(name));
    assert.deepEqual(
      unclassified,
      [],
      'these commands emit --json and appear in neither the covered list nor a named ' +
        `exception, which is how ${'`history`'} went missing from both: ${unclassified.join(', ')}`,
    );

    // The other direction, so an exception outlives the command it excuses.
    const stale = [...accounted].filter((name) => !jsonCommands.includes(name));
    assert.deepEqual(stale, [], `these are listed but no longer accept --json: ${stale.join(', ')}`);
  });

  for (const [name, args] of DRIVABLE) {
    it(`${name} --json parses as a single JSON document`, async () => {
      const dir = await workspace();
      const { stdout, status } = run(dir, [...args, '--json']);
      // `conform` exits 1 on a non-conforming document, which is not this
      // test's subject: what matters is that what it printed is a document.
      assert.ok(status === 0 || name === 'conform', `${name} exited ${status}`);
      assert.doesNotThrow(
        () => JSON.parse(stdout),
        `${name} --json printed something that is not one JSON document — ` +
          `it starts: ${JSON.stringify(stdout.slice(0, 60))}`,
      );
    });
  }

  it('the annual record survives a pipe into conform, which is the whole claim', async () => {
    const dir = await workspace();
    const { stdout } = run(dir, ['report', 'usage.jsonl', '--year', '2026', '--json']);
    const checked = spawnSync(
      process.execPath,
      [CLI, 'conform', '-', '--contract', 'annual-record'],
      { cwd: dir, encoding: 'utf8', env: SPAWN_ENV, input: stdout, timeout: 30000 },
    );
    assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`);
    assert.match(checked.stdout, /reads as an annual-record document/);
  });
});

describe('the reference producer conforms to its own contract', () => {
  /**
   * `outcome-report` was a contract whose only implementation failed it.
   *
   * `conform` requires `schemaVersion` of every document — it is the one field
   * checked outside the per-contract rules, because a consumer branches on it
   * and its absence cannot be told from a pre-contract document. `outcomeReport()`
   * did not emit one, from 1.50.4 until this test was written. Anybody
   * mirroring `@trazum/core`'s output, which is what the format page invites,
   * would have inherited the defect and looked interoperable.
   *
   * The direction matters: the other parity tests check that the *document*
   * carries what the *doc* promises. This checks that what this repository
   * actually produces passes the check it publishes.
   */
  it('an outcome report from @trazum/core conforms as an outcome-report', async () => {
    const log = [
      { outcome: 'resolved' },
      { outcome: 'escalated' },
      { outcome: 'a-value-nobody-declared' },
      {},
    ]
      .map((extra, index) =>
        JSON.stringify({
          model: 'claude-opus-5',
          label: 'chat',
          session: `s${index}`,
          ts: `2026-08-0${index + 1}T10:00:00Z`,
          ...extra,
          usage: { input_tokens: 200_000, output_tokens: 100 },
        }),
      )
      .join('\n');

    const profile = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const document = outcomeReport(profile.outcomeTally, {
      values: ['resolved', 'escalated'],
      success: ['resolved'],
    });

    const dir = await mkdtemp(join(tmpdir(), 'trazum-produced-'));
    const checked = spawnSync(
      process.execPath,
      [CLI, 'conform', '-', '--contract', 'outcome-report'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: SPAWN_ENV,
        input: JSON.stringify(document),
        timeout: 30000,
      },
    );
    assert.equal(
      checked.status,
      0,
      `@trazum/core produced a document its own contract rejects:\n${checked.stdout}${checked.stderr}`,
    );
  });
});

describe('contract-article', () => {
  /**
   * The article in "reads as a/an <contract> document" follows the name's
   * **sound**, and the first attempt used its first letter — which turned the
   * correct "a usage-log" into "an usage-log", because `usage` opens on /juː/.
   *
   * There is no general English rule short of a pronunciation dictionary, so
   * the code is bounded to the closed set of contract names and this test is
   * the bound: a name whose initial this rule cannot judge fails here rather
   * than shipping the wrong article. `u` and `h` are the two initials English
   * decides by sound, and neither is safe to guess.
   */
  const UNDECIDABLE = ['u', 'h'];
  const EXPECTED = {
    'usage-log': 'a',
    profile: 'a',
    plan: 'a',
    verification: 'a',
    history: 'a',
    connected: 'a',
    'cost-answer': 'a',
    'outcome-report': 'an',
    'annual-record': 'an',
    'roll-up': 'a',
    'prompt-draft': 'a',
    // The seven named in the 1.65 arc: consonant onsets, every one, so the
    // sound rule and the letter rule agree and 'a' is decided, not guessed.
    fleet: 'a',
    'spend-guard': 'a',
    'first-run': 'a',
    pulse: 'a',
    'rule-yield': 'a',
    'gateway-refusal': 'a',
    bench: 'a',
    // The 1.67 arc's document: consonant onset, same rule as the seven above.
    position: 'a',
  };

  it('has a decided article for every contract, and refuses to guess a new one', () => {
    const undecided = CONTRACT_NAMES.filter((name) => EXPECTED[name] === undefined);
    assert.deepEqual(
      undecided,
      [],
      `these contracts have no decided article, and the rule in en.ts would guess: ${undecided.join(', ')}`,
    );

    const risky = CONTRACT_NAMES.filter(
      (name) => UNDECIDABLE.includes(name[0]) && EXPECTED[name] === 'an',
    );
    assert.deepEqual(
      risky,
      [],
      `these start with a letter English decides by sound and are marked "an": ${risky.join(', ')}`,
    );
  });

  /**
   * Rendered directly rather than through the CLI: driving `conform` would
   * need a conforming fixture per contract, and what is under test is the
   * sentence, not nine documents.
   */
  for (const [name, article] of Object.entries(EXPECTED)) {
    it(`says "${article} ${name}"`, () => {
      assert.equal(en.conform.heading('doc.json', name), `doc.json reads as ${article} ${name} document`);
    });
  }
});

describe('the format page and the contracts it documents', () => {
  it('names every contract `--contract` accepts', async () => {
    const page = await readFile(FORMAT, 'utf8');
    const missing = CONTRACT_NAMES.filter((name) => !page.includes(`\`${name}\``));
    assert.deepEqual(
      missing,
      [],
      `docs/format.md documents no such contract, so nothing tells a tool it exists: ${missing.join(', ')}`,
    );
  });

  it('claims a count that matches the table under it', async () => {
    /**
     * The sentence said seven with ten rows beneath it, then stayed at seven
     * through two more contracts. Counting the rows is the only version of this
     * check that cannot be satisfied by editing the sentence alone.
     */
    const page = await readFile(FORMAT, 'utf8');
    const words = {
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
      twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    };
    const rows = [...page.matchAll(/^\| \*\*[^*]+\*\* \|/gm)].length;
    assert.ok(rows > 5, `only ${rows} contract rows parsed out of docs/format.md — has the table moved?`);

    const claim = page.match(/Trazum emits \*\*([a-z]+)\*\* documents/);
    assert.ok(claim, 'docs/format.md no longer opens with a document count — if it never does again, delete this test');
    const claimed = words[claim[1]];
    assert.ok(claimed !== undefined, `"${claim[1]}" is not a number this test knows`);

    /**
     * One row is defined but not emitted, and the sentence says so in the same
     * breath. The ordinal is **derived from the row count** rather than typed
     * here: the literal `twelfth` in this assertion went stale the moment a
     * thirteenth contract arrived, so the guard against a stale count was
     * itself the stale count.
     */
    const ordinals = {
      10: 'tenth', 11: 'eleventh', 12: 'twelfth',
      13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
      16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth',
    };
    const ordinal = ordinals[rows];
    assert.ok(ordinal !== undefined, `no ordinal known for ${rows} rows — add it above`);
    assert.match(
      page,
      new RegExp(`defines an? ${ordinal} it does not\\s+emit`),
      `docs/format.md has ${rows} contract rows, so the sentence must say it defines a(n) ${ordinal} it does not emit`,
    );
    assert.equal(
      claimed,
      rows - 1,
      `docs/format.md says Trazum emits ${claim[1]} (${claimed}) documents and the table has ${rows} rows, one of them not emitted`,
    );
  });

  it('offers no `--contract` name the CLI would refuse', async () => {
    const page = await readFile(FORMAT, 'utf8');
    // Bounded to the body rows: the header cell is itself `` `--contract` ``,
    // and a pattern loose enough to include it reports the column name as a
    // contract the CLI refuses. Bold first cell is what makes a row a row.
    const offered = [...page.matchAll(/^\| \*\*[^*]+\*\* \|[^|]+\| `([a-z-]+)` \|/gm)].map(
      (m) => m[1],
    );
    assert.ok(offered.length > 5, `only ${offered.length} --contract cells parsed — has the column moved?`);
    const unknown = offered.filter((name) => !CONTRACT_NAMES.includes(name));
    assert.deepEqual(
      unknown,
      [],
      `docs/format.md offers these to --contract and the CLI refuses them: ${unknown.join(', ')}`,
    );
  });
});
