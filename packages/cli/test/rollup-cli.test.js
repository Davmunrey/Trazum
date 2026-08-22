import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum rollup`, end to end — several people's documents, one bill.
 *
 * The command is the first one here that reads *documents* rather than logs,
 * so the round trip is the thing to prove: a log this repository profiles, a
 * document this repository writes, a roll-up this repository merges, and a
 * `conform` that recognises what came out. A merge that only ever ran on
 * hand-written fixtures would pass while the real emitter drifted.
 */

const cli = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd,
  });

const call = (over = {}) =>
  JSON.stringify({
    model: 'claude-opus-5',
    label: 'chat',
    usage: { input_tokens: 200_000, output_tokens: 0 },
    ...over,
  });

/** A directory holding profile documents written by this CLI, from real logs. */
const documentsFrom = async (logs) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-rollup-'));
  const written = [];
  for (const [name, records] of Object.entries(logs)) {
    const log = join(dir, `${name}.jsonl`);
    await writeFile(log, `${records.join('\n')}\n`);
    const profiled = cli(['profile', log, '--json'], dir);
    assert.equal(profiled.status, 0, profiled.stderr);
    const document = join(dir, `${name}.json`);
    await writeFile(document, profiled.stdout);
    written.push(document);
  }
  return { dir, documents: written };
};

describe('trazum rollup', () => {
  it('merges documents this CLI wrote, and the result conforms as a roll-up', async () => {
    const { dir, documents } = await documentsFrom({
      laptop: [call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-02T09:00:00Z' })],
      ci: [call({ ts: '2026-08-01T11:00:00Z', label: 'batch' })],
    });

    const merged = cli(['rollup', ...documents, '--json'], dir);
    assert.equal(merged.status, 0, merged.stderr);
    const document = JSON.parse(merged.stdout);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.contributors.length, 2);
    assert.ok(Math.abs(document.total.totalUsd - 3) < 1e-9, JSON.stringify(document.total));

    const path = join(dir, 'merged.json');
    await writeFile(path, merged.stdout);
    const checked = cli(['conform', path], dir);
    assert.equal(checked.status, 0, checked.stdout);
    assert.match(checked.stdout, /reads as a roll-up document/);
    assert.match(checked.stdout, /It conforms/);
  });

  it('says overlap between contributors is unmeasurable, in the rendering as well as the data', async () => {
    const { dir, documents } = await documentsFrom({
      a: [call({ ts: '2026-08-01T09:00:00Z' })],
      b: [call({ ts: '2026-08-01T10:00:00Z' })],
    });
    const rendered = cli(['rollup', ...documents], dir);
    assert.equal(rendered.status, 0, rendered.stderr);
    // The caveat that must never be one screen away from the total: a roll-up
    // is the document most likely to be pasted into a slide.
    assert.match(rendered.stdout, /Overlap between contributors is unmeasurable/);
    assert.match(rendered.stdout, /What this roll-up cannot say about itself/);
  });

  it("keeps a contributor's own gap on that contributor", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-rollup-gap-'));
    await writeFile(join(dir, 'clean.jsonl'), `${call()}\n${call()}\n`);
    await writeFile(join(dir, 'noisy.jsonl'), `${call()}\nthis line is not json\n`);
    for (const name of ['clean', 'noisy']) {
      const profiled = cli(['profile', join(dir, `${name}.jsonl`), '--json'], dir);
      await writeFile(join(dir, `${name}.json`), profiled.stdout);
    }
    const merged = cli(['rollup', join(dir, 'clean.json'), join(dir, 'noisy.json'), '--json'], dir);
    const document = JSON.parse(merged.stdout);
    const clean = document.contributors.find((row) => row.name.endsWith('clean.json'));
    const noisy = document.contributors.find((row) => row.name.endsWith('noisy.json'));
    assert.deepEqual(clean.gaps.filter((gap) => gap.kind === 'unreadable-lines'), []);
    assert.equal(noisy.gaps.filter((gap) => gap.kind === 'unreadable-lines').length, 1);
  });

  it('reads a directory of documents, so a shared folder is a roll-up', async () => {
    const { dir } = await documentsFrom({
      a: [call({ ts: '2026-08-01T09:00:00Z' })],
      b: [call({ ts: '2026-08-01T10:00:00Z' })],
    });
    const drop = join(dir, 'drop');
    await mkdir(drop);
    // The logs are in `dir` too, and only the `.json` documents may be read: a
    // roll-up that swallowed a `.jsonl` log would reject it as unconformant
    // and report a contribution nobody made.
    const inner = cli(['rollup', dir, '--json'], dir);
    assert.equal(inner.status, 0, inner.stderr);
    assert.equal(JSON.parse(inner.stdout).contributors.length, 2);

    const empty = cli(['rollup', drop], dir);
    assert.equal(empty.status, 1);
    // An empty folder must never roll up to a team that spent nothing.
    assert.match(empty.stderr, /no \.json documents/);
  });

  it('exits 1 and names a contribution it could not merge', async () => {
    const { dir, documents } = await documentsFrom({ good: [call()] });
    const broken = join(dir, 'broken.json');
    await writeFile(broken, JSON.stringify({ total: {} }));

    const result = cli(['rollup', ...documents, broken], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Handed over and not merged/);
    assert.match(result.stdout, /broken\.json/);
    // And the one that did conform is still in the total.
    assert.match(result.stdout, /1 contributor/);
  });

  it('refuses a target that is not there rather than rolling up what is left', async () => {
    const { dir, documents } = await documentsFrom({ good: [call()] });
    const result = cli(['rollup', ...documents, join(dir, 'nowhere.json')], dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not there/);
    assert.doesNotMatch(result.stdout, /Roll-up of/);
  });

  it('rejects a flag it does not have', async () => {
    const result = cli(['rollup', '--pricing-live']);
    assert.notEqual(result.status, 0);
  });
});

describe('the help text enumerates no contract by hand', () => {
  /**
   * The list of contracts in `--help` was retyped, stopped at `cost-answer`,
   * and stayed wrong through two releases that each added one — the same shape
   * as the provider enumeration the USAGE block is guarded against, one
   * section further down the same page.
   */
  it('names every contract the checker accepts', () => {
    const help = cli(['--help']).stdout;
    const section = help.slice(help.indexOf('OPTIONS FOR conform'));
    const listed = section.slice(0, section.indexOf('--json'));
    const known = cli(['conform', 'nothing.json', '--contract', 'not-a-contract']).stderr;
    const names = known.slice(known.indexOf('Known contracts:') + 'Known contracts:'.length).trim().replace(/\.$/, '').split(', ');
    assert.ok(names.length >= 9, `only ${names.length} contract names read from the refusal`);
    for (const name of names) {
      assert.ok(
        listed.includes(name),
        `--help does not name the "${name}" contract, which --contract accepts`,
      );
    }
  });

  it('and the check is not one that can never fire', () => {
    /**
     * The guard above only ever reads help that is currently correct, so on
     * this repository it passes whatever it does. Handed the exact text it was
     * written for — the list as it stood, stopping at `cost-answer` — it must
     * find the two missing names.
     */
    const planted =
      'detecting one: usage-log, profile, plan, verification, history, connected, cost-answer.';
    const names = ['usage-log', 'profile', 'outcome-report', 'annual-record'];
    assert.deepEqual(
      names.filter((name) => !planted.includes(name)),
      ['outcome-report', 'annual-record'],
    );
  });
});

describe('the roll-up asks the filesystem once', () => {
  /**
   * The first version called `stat`, branched on `isDirectory()`, and then
   * read the path — a check-then-act that CodeQL flagged as a file-system
   * race on the pull request that introduced the command. Attempting the read
   * and reading the error code has no window between the two, because there
   * is only one operation.
   *
   * Guarded at the source rather than by behaviour: both shapes behave
   * identically on a filesystem nobody is racing, which is every filesystem a
   * test runs on. The defect is the shape.
   */
  const bodyOf = (source, name) => {
    const start = source.indexOf(`async function ${name}(`);
    assert.notEqual(start, -1, `${name} must still be declared`);
    const next = source.indexOf('\nasync function ', start + 1);
    const end = source.indexOf('\nfunction ', start + 1);
    const stop = Math.min(...[next, end].filter((index) => index !== -1));
    return source.slice(start, stop === Infinity ? source.length : stop);
  };

  const statCalls = (body) => [...body.matchAll(/\bawait stat\(/g)].map((match) => match[0]);

  it('never stats a target before reading it', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const found = statCalls(bodyOf(source, 'commandRollup'));
    assert.deepEqual(
      found,
      [],
      'commandRollup stats a path and then reads it, which is the race CodeQL reported',
    );
  });

  it('and the detector is not one that can never fire', () => {
    // Handed the exact line that was there.
    assert.deepEqual(statCalls('    const entry = await stat(target).catch(() => null);'), [
      'await stat(',
    ]);
  });
});

describe('trazum rollup: a span is not a period', () => {
  it('names the days a contributor asked for and recorded nothing on', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-rollup-claim-'));
    await writeFile(
      join(dir, 'api.jsonl'),
      `${[call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-03T09:00:00Z' })].join('\n')}\n`,
    );
    // The window is the claim: profiled with --since/--until, the document
    // carries what was gone looking for as well as what was found.
    const profiled = cli(
      ['profile', join(dir, 'api.jsonl'), '--json', '--since', '2026-08-01', '--until', '2026-08-05'],
      dir,
    );
    assert.equal(profiled.status, 0, profiled.stderr);
    await writeFile(join(dir, 'api.json'), profiled.stdout);

    const merged = cli(['rollup', join(dir, 'api.json'), '--json'], dir);
    assert.equal(merged.status, 0, merged.stderr);
    const document = JSON.parse(merged.stdout);
    const [contributor] = document.contributors;
    assert.notEqual(contributor.claimed, null, 'the claim must survive into the roll-up');
    assert.equal(contributor.silence.days, 3);
    assert.deepEqual(contributor.silence.runs, [
      { from: '2026-08-02', to: '2026-08-02', days: 1 },
      { from: '2026-08-04', to: '2026-08-05', days: 2 },
    ]);
    assert.ok(document.cannotSay.includes('silence-inside-a-claim'));

    const rendered = cli(['rollup', join(dir, 'api.json')], dir);
    assert.match(rendered.stdout, /asked for 2026-08-01 to 2026-08-05/);
    assert.match(rendered.stdout, /2026-08-02, 2026-08-04 to 2026-08-05/);
  });

  it('says nobody claimed a period rather than reading a span as one', async () => {
    const { dir, documents } = await documentsFrom({
      api: [call({ ts: '2026-08-01T09:00:00Z' })],
    });
    const rendered = cli(['rollup', ...documents], dir);
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.match(rendered.stdout, /A contributor stated no window/);
    assert.doesNotMatch(rendered.stdout, /asked for/);
  });
});
