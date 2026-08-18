import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { PRICING_LAST_REVIEWED, reviewAgeDays } from '../../core/dist/index.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The price table's age, said out loud when it matters.
 *
 * These tests pin the rule, not the calendar: whether the line appears is
 * derived from the bundled table's own review date at run time, so a freshly
 * reviewed table passes the same suite a stale one does — asserting the
 * opposite behaviour, which is the point.
 */

const AGE = reviewAgeDays(PRICING_LAST_REVIEWED, new Date());
const STALE = AGE !== null && AGE > 45;

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-stale-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { path, dir };
};

const call = { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } };

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

describe('the price table behind every dollar', () => {
  it(`terminal ${STALE ? 'warns past 45 days' : 'stays quiet inside 45 days'}, per the table's own date`, async () => {
    const { path } = await write([call]);
    const result = run([path]);
    assert.equal(result.status, 0);
    const text = `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
    if (STALE) {
      assert.match(text, new RegExp(`last reviewed ${PRICING_LAST_REVIEWED}`));
      assert.match(text, /past the 45/);
      assert.match(text, /wrong by exactly that change/);
    } else {
      assert.doesNotMatch(text, /past the 45/);
    }
  });

  it('rides --json as provenance data either way', async () => {
    const { path } = await write([call]);
    const result = run([path, '--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.pricing.lastReviewed, PRICING_LAST_REVIEWED);
    assert.equal(report.pricing.ageDays, AGE);
  });

  it('reaches the markdown with the same threshold', async () => {
    const { path, dir } = await write([call]);
    const out = join(dir, 'report.md');
    const result = run([path, '--markdown-out', out]);
    assert.equal(result.status, 0);
    const markdown = await readFile(out, 'utf8');
    if (STALE) {
      assert.match(markdown, /> ⚠️ .*past the 45/);
    } else {
      assert.doesNotMatch(markdown, /past the 45/);
    }
  });

  it('speaks Spanish', async () => {
    const { path } = await write([call]);
    const result = spawnSync(process.execPath, [CLI, 'profile', path, '--locale', 'es'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    const text = `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
    if (STALE) {
      assert.match(text, /más de los 45 que esta herramienta considera vigentes/);
    } else {
      assert.doesNotMatch(text, /más de los 45/);
    }
  });
});
