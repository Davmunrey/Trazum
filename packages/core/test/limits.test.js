import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { MAX_INPUT_CHARS } from '../dist/index.js';

/**
 * The refusal ceiling is written down exactly once.
 *
 * Four doors carried the same 400,000 before this: two web routes, the share
 * endpoint and the MCP server, each with its own literal — agreeing today the
 * way the flag and the config once agreed about cache-hit rates, which is to
 * say by coincidence. The number now lives in `@trazum/core`, and this guard
 * holds every other prompt-ceiling constant in the repository to *deriving*
 * from it rather than restating it.
 *
 * Deliberately not a bare literal count: `400_000` legitimately appears as a
 * context window in the pricing catalogue, and a guard that fired on model
 * data would be answered by deleting it.
 */

const repoRoot = new URL('../../../', import.meta.url).pathname;

describe('the refusal ceiling has one home', () => {
  it('is exported, and is the number the doors advertise', () => {
    assert.equal(MAX_INPUT_CHARS, 400_000);
  });

  /**
   * Constants the scan matches that are not door ceilings, each with the
   * reason — because "it is different" is the sentence that stops being true
   * without anybody noticing. A cap on what a *store* keeps is a storage
   * policy: it bounds rows and browser storage, not what a request may ask.
   */
  const NOT_A_DOOR = {
    'apps/web/components/Optimizer.tsx: HISTORY_MAX_PROMPT_CHARS':
      'whether the full prompt is kept in localStorage history, or only its excerpt — browser storage economy',
    'apps/web/lib/store/prompts.ts: MAX_PROMPT_TEXT_CHARS':
      'what the prompt library stores per version — a database row bound, deliberately tighter than the door',
    'apps/web/lib/store/prompts.ts: MAX_PROMPT_NAME_CHARS': 'a name length, not a prompt',
  };

  it('no other prompt-ceiling constant states its own number', () => {
    const files = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '*.ts', '*.tsx'],
      { cwd: repoRoot, encoding: 'utf8' },
    )
      .split('\n')
      .filter((path) => /^(packages\/(core|cli|mcp)\/src|apps\/web)\//.test(path))
      .filter((path) => !path.includes('/test/'));

    assert.ok(files.length > 50, `only ${files.length} source files found — has the layout moved?`);

    const offenders = [];
    const seen = new Set();
    for (const file of files) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      for (const match of text.matchAll(/([A-Z_]*MAX_[A-Z_]*(?:PROMPT|INPUT)[A-Z_]*CHARS)\s*=\s*([^;\n]+)/g)) {
        const [, name, value] = match;
        if (file === 'packages/core/src/limits.ts') continue;
        const key = `${file}: ${name}`;
        seen.add(key);
        if (key in NOT_A_DOOR) continue;
        if (!value.includes('MAX_INPUT_CHARS')) offenders.push(`${key} = ${value.trim()}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a prompt ceiling typed as its own number, free to disagree with the others',
    );

    // An exception must excuse something that exists, or it outlives its reason.
    const stale = Object.keys(NOT_A_DOOR).filter((key) => !seen.has(key));
    assert.deepEqual(stale, [], `exceptions for constants that are gone: ${stale.join(', ')}`);
  });

  it('and the scan can see the defect it exists for', () => {
    const planted = 'export const MAX_PROMPT_CHARS = 400_000;';
    const found = [...planted.matchAll(/(MAX_[A-Z_]*(?:PROMPT|INPUT)[A-Z_]*CHARS)\s*=\s*([^;\n]+)/g)];
    assert.equal(found.length, 1);
    assert.equal(found[0][2].includes('MAX_INPUT_CHARS'), false);

    // And the sanctioned shape passes.
    const derived = 'export const MAX_PROMPT_CHARS = MAX_INPUT_CHARS;';
    const ok = [...derived.matchAll(/(MAX_[A-Z_]*(?:PROMPT|INPUT)[A-Z_]*CHARS)\s*=\s*([^;\n]+)/g)];
    assert.equal(ok[0][2].includes('MAX_INPUT_CHARS'), true);
  });
});
