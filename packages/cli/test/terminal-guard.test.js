import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { terminalSafe } from '../dist/terminal-guard.js';
import { SPAWN_ENV } from './env.mjs';

/**
 * A usage log's text reaches the terminal as text, never as a command to it.
 *
 * A label in somebody else's log carried escape sequences that `bill --table`,
 * `profile` and `plan` printed as they came: clear the screen, retitle the
 * window (penetration test of 2026-11-22, finding L-8).
 */

const ESC = '\u001b';
const HOSTILE = `${ESC}]0;owned\u0007${ESC}[2J${ESC}[1;1Hrow\rover\u009b31m`;

describe('terminalSafe', () => {
  it('drops escape sequences, control characters and carriage returns', () => {
    const out = terminalSafe(HOSTILE, { terminal: false });
    assert.doesNotMatch(out, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
    assert.equal(out, ']0;owned[2J[1;1Hrowover31m');
  });

  it('keeps the colour codes the CLI paints, tabs and newlines', () => {
    const painted = `${ESC}[1m${ESC}[38;5;208mTotal${ESC}[39m${ESC}[22m\t$1.00\n`;
    assert.equal(terminalSafe(painted, { terminal: true }), painted);
  });

  it('drops the characters that reorder text on a terminal, and only there', () => {
    const label = 'cost‮gnp.exe⁦x⁩';
    assert.equal(terminalSafe(label, { terminal: true }), 'costgnp.exex');
    assert.equal(terminalSafe(label, { terminal: false }), label);
  });
});

describe('the CLI, given a log whose label carries escape sequences', () => {
  const CLI = new URL('../dist/index.js', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'trazum-terminal-'));
  const log = join(dir, 'usage.jsonl');
  writeFileSync(
    log,
    `${JSON.stringify({ timestamp: '2026-09-02T09:00:00Z', model: 'claude-haiku-5-5', label: HOSTILE, usage: { input_tokens: 42000, output_tokens: 1800 } })}\n`,
  );

  for (const args of [['bill', log, '--table'], ['bill', log], ['profile', log], ['plan', log]]) {
    it(`prints none of them: ${args.filter((a) => a !== log).join(' ')}`, () => {
      const run = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        cwd: dir,
        env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', NO_COLOR: '1', CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '' },
      });
      const out = run.stdout + run.stderr;
      assert.ok(out.length > 0, 'the command printed nothing');
      assert.doesNotMatch(out, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/, 'a control character reached the output');
    });
  }
});
