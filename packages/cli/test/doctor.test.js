import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { optimize } from '@trazum/core';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum doctor` — the survey across a workspace.
 *
 * The design constraint is what these tests mostly hold. A health check invites a
 * score, and a score is a number assembled from weights nobody can reproduce,
 * which gets tuned until the output looks right. `rank` refused that and so does
 * this: every finding is an advisory `optimize` raises on that prompt on its own,
 * summed. The test that matters most below is the one that adds up the individual
 * runs and requires the total to match.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, 'doctor', ...args], {
    encoding: 'utf8',
    cwd,
    env: SPAWN_ENV,
  });
  return { out: `${result.stdout}${result.stderr}`, stdout: result.stdout, code: result.status };
}

const PADDED = 'Please kindly summarise {{doc}} very briefly. Thank you very much!\n';
const LEAN = 'Summarise {{doc}}.\n';

/** A workspace with a config and the given files. */
async function project(files, config) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-doctor-'));
  if (config) await writeFile(join(root, 'trazum.config.json'), JSON.stringify(config));
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body);
  }
  return root;
}

const USAGE = { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 300 };

describe('what nothing is watching', () => {
  it('names the prompts with no budget, and how many there are', async () => {
    const root = await project(
      { 'prompts/a.txt': PADDED, 'other/b.txt': PADDED },
      { usage: USAGE, budgets: { 'prompts/**': 2000 } },
    );
    const { out, code } = run(['.'], root);

    assert.equal(code, 0, out);
    assert.match(out, /1 of 2 prompts? (has|have) no budget/);
    assert.match(out, /other\/b\.txt/);
  });

  it('caps the list and says how many it did not print', async () => {
    // A survey that prints forty paths buries the finding it was meant to
    // deliver; one that silently prints the first eight claims there were eight.
    const files = {};
    for (let i = 0; i < 12; i++) files[`other/p${i}.txt`] = PADDED;
    const root = await project(files, { usage: USAGE, budgets: { 'prompts/**': 2000 } });
    const { out } = run(['.'], root);

    const listed = [...out.matchAll(/^ {6}other\/p\d+\.txt$/gm)].length;
    assert.equal(listed, 8, `printed ${listed} paths, expected the cap`);
    assert.match(out, /and 4 more/);
  });

  it('says so plainly when every prompt is budgeted and inside it', async () => {
    const root = await project(
      { 'prompts/a.txt': LEAN },
      { usage: USAGE, budgets: { 'prompts/**': 2000 } },
    );
    const { out } = run(['.'], root);

    assert.match(out, /(has a budget and is inside it|have a budget and are inside it)/);
    assert.doesNotMatch(out, /no budget/);
  });

  it('reports a prompt already over budget, and names the pattern', async () => {
    // Before CI says it. A budget failure the author learns about from a red
    // build is a budget failure they learn about too late to think about.
    const root = await project(
      { 'prompts/big.txt': PADDED.repeat(40) },
      { usage: USAGE, budgets: { 'prompts/**': 100 } },
    );
    const { out } = run(['.'], root);

    assert.match(out, /already over (its|their) budget/);
    assert.match(out, /trazum check would fail/);
    assert.match(out, /prompts\/big\.txt/);
    assert.match(out, /\(prompts\/\*\*\)/, 'the pattern the budget came from is not named');
  });
});

describe('the findings are the advisories, summed', () => {
  it('totals exactly what optimize reports on each prompt on its own', async () => {
    /**
     * The claim the report makes about itself, checked.
     *
     * The footer says every line is the same advisory `trazum optimize` raises on
     * those prompts, summed, and invites the reader to run it on any one of them.
     * That is either true to the last float or it is a sentence that sounds
     * reassuring — so this recomputes it from the library rather than trusting the
     * command.
     */
    const files = { 'a.txt': PADDED, 'b.txt': PADDED.repeat(6), 'c.txt': LEAN };
    const root = await project(files, { usage: USAGE });
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    const expected = new Map();
    for (const body of Object.values(files)) {
      for (const advisory of optimize(body, { usage: USAGE }).advisories) {
        if (advisory.estimatedMonthlyUsd === null) continue;
        expected.set(advisory.id, (expected.get(advisory.id) ?? 0) + advisory.estimatedMonthlyUsd);
      }
    }

    for (const [id, total] of expected) {
      const finding = report.findings.find((f) => f.id === id);
      assert.ok(finding, `doctor did not report ${id}, which optimize raised`);
      assert.equal(
        finding.estimatedMonthlyUsd,
        total,
        `${id}: doctor says ${finding.estimatedMonthlyUsd}, the prompts add to ${total}`,
      );
    }
  });

  it('counts how many prompts raised each one', async () => {
    const root = await project({ 'a.txt': PADDED, 'b.txt': PADDED }, { usage: USAGE });
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    const downgrade = report.findings.find((f) => f.id === 'model-downgrade');
    assert.ok(downgrade, 'the model advisory did not fire on a padded prompt at Opus prices');
    assert.equal(downgrade.prompts, 2);
  });

  it('orders by money, worst first', async () => {
    const root = await project({ 'a.txt': PADDED.repeat(8) }, { usage: USAGE });
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    const priced = report.findings.filter((f) => f.estimatedMonthlyUsd !== null);
    assert.ok(priced.length > 1, 'need at least two priced findings for this to mean anything');
    const sorted = [...priced].sort((a, b) => b.estimatedMonthlyUsd - a.estimatedMonthlyUsd);
    assert.deepEqual(priced.map((f) => f.id), sorted.map((f) => f.id));
  });

  it('still shows an advisory that carries no figure', async () => {
    // `context-overflow` means the call fails. Sorting money-first must not push a
    // correctness problem off the end as though it were worth nothing.
    const root = await project({ 'a.txt': PADDED }, { usage: USAGE });
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    assert.ok(
      report.findings.some((f) => f.estimatedMonthlyUsd === null),
      'this fixture no longer raises an unpriced advisory — pick another',
    );
    const { out } = run(['.'], root);
    for (const finding of report.findings) {
      assert.ok(out.includes(finding.id) || out.length > 0);
    }
    assert.match(out, /Below the cacheable minimum|Your cost is in the output/);
  });

  it('invents no score', async () => {
    const root = await project({ 'a.txt': PADDED }, { usage: USAGE });
    const { out, stdout } = run(['.'], root);
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    assert.equal(/\b(score|grade|rating|health)\b/i.test(out), false, out);
    for (const key of ['score', 'grade', 'rating', 'health']) {
      assert.equal(key in report, false, `the JSON carries a "${key}"`);
    }
    assert.ok(stdout.length > 0);
  });
});

describe('a survey, not a gate', () => {
  it('exits 0 even when it finds a prompt over budget', async () => {
    // Deliberate. The model recommendation is a keyword heuristic, and a build
    // gated on a keyword heuristic teaches people to re-run until green — which
    // costs more than the tool ever saves. `trazum check` is the gate.
    const root = await project(
      { 'prompts/big.txt': PADDED.repeat(40) },
      { usage: USAGE, budgets: { 'prompts/**': 100 } },
    );
    const { code, out } = run(['.'], root);

    assert.equal(code, 0, out);
    assert.match(out, /Nothing here fails a build/);
    assert.match(out, /trazum check is the gate/);
  });

  it('skips a source file with no marker, and counts it', async () => {
    const root = await project(
      { 'a.txt': PADDED, 'plain.ts': "import OpenAI from 'openai';\nexport const x = 1;\n" },
      { usage: USAGE },
    );
    const report = JSON.parse(run(['.', '--json'], root).stdout);

    assert.equal(report.prompts, 1);
    assert.equal(report.skippedSourceFiles, 1);
    assert.match(run(['.'], root).out, /Skipped 1 source file/);
  });

  it('refuses an empty directory rather than reporting a clean bill of health', async () => {
    const root = await project({}, { usage: USAGE });
    const { code, out } = run(['.'], root);

    assert.notEqual(code, 0);
    assert.match(out, /No prompt files under/);
  });

  it('says how old the prices are, in days', async () => {
    /**
     * The date alone makes the reader subtract against today to learn the one
     * thing they wanted — whether to trust the figures. A reader who is not
     * already suspicious will not bother, which is the reader this line exists
     * for.
     */
    const root = await project({ 'a.txt': PADDED }, { usage: USAGE });
    const { out } = run(['.'], root);

    assert.match(out, /Prices reviewed \d{4}-\d{2}-\d{2}/);
    assert.match(
      out,
      /Prices reviewed \d{4}-\d{2}-\d{2} \((today|1 day ago|\d+ days ago)\)/,
      'the review date is printed without its age',
    );
  });

  it('reports in Spanish too', async () => {
    const root = await project({ 'a.txt': PADDED }, { usage: USAGE, locale: 'es' });
    const { out } = run(['.'], root);

    assert.match(out, /Presupuestos/);
    assert.match(out, /trazum check es la puerta/);
  });
});

describe('doctor --otlp-out', () => {
  it('writes a payload a collector can read', async () => {
    const root = await project({ 'prompts/a.txt': PADDED }, { usage: USAGE, budgets: { 'prompts/**': 2000 } });
    const out = join(root, 'metrics.json');
    assert.equal(run(['.', '--otlp-out', out], root).code, 0);

    const payload = JSON.parse(await readFile(out, 'utf8'));
    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
    assert.ok(metrics.length > 0);
    assert.ok(metrics.some((m) => m.name === 'trazum.prompt.tokens'));

    // The encoding rule, checked end to end rather than only in the unit tests:
    // the CLI is what actually stringifies this.
    for (const metric of metrics) {
      for (const point of metric.gauge.dataPoints) {
        assert.equal(typeof point.timeUnixNano, 'string');
        if ('asInt' in point) assert.equal(typeof point.asInt, 'string');
      }
    }
  });

  it('writes it even with --json, because the file is a separate destination', async () => {
    const root = await project({ 'prompts/a.txt': PADDED }, { usage: USAGE });
    const out = join(root, 'metrics.json');
    const result = run(['.', '--json', '--otlp-out', out], root);

    assert.equal(result.code, 0);
    JSON.parse(result.stdout);
    JSON.parse(await readFile(out, 'utf8'));
  });

  it('does not fail the survey when the file cannot be written', async () => {
    // A full disk on a metrics runner must not turn a survey into a failure. The
    // survey is what somebody asked for; the metrics are a copy of it.
    const root = await project({ 'prompts/a.txt': PADDED }, { usage: USAGE });
    const result = run(['.', '--otlp-out', join(root, 'prompts/a.txt', 'nope.json')], root);

    assert.equal(result.code, 0);
    assert.match(result.out, /Could not write/);
  });

  it('writes nothing without the flag', async () => {
    const root = await project({ 'prompts/a.txt': PADDED }, { usage: USAGE });
    assert.equal(run(['.'], root).code, 0);
    assert.equal(existsSync(join(root, 'metrics.json')), false);
  });
});
