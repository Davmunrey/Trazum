import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * The Claude Code status line, run rather than read.
 *
 * The whole claim of this script is that it shows what a session costs and
 * charges nothing for it, and that claim has two halves. The first is about
 * Claude Code and cannot be tested here: the status line's stdout is drawn in
 * the terminal and a `Stop` hook's stdout goes to the debug log, so neither is
 * context and neither is tokens. What *can* be tested is that the wiring the
 * documentation tells people to use is the wiring that has that property, so
 * the last test below refuses `SessionStart` by name, the one hook whose
 * stdout Claude Code hands to the model, and therefore the one that would turn
 * a free status line into a billed one.
 *
 * The second half is latency, and it is testable and load-bearing. Claude Code
 * runs the status line on every assistant message and **cancels the script if
 * another update arrives while it is still running**, so a status line that
 * reads a 212 MB transcript does not show a stale number, it shows nothing at
 * all. That is why the work lives in the hook and the status line only reads a
 * file. `never computes` below plants a `trazum` that fails loudly and proves
 * the status line never reaches for it.
 */

const SCRIPT = new URL('../../../plugin/statusline/trazum-statusline.sh', import.meta.url).pathname;
const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const assistantLine = (requestId, output) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-10T10:00:00.000Z',
    sessionId: 'sess-1',
    requestId,
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'hello' }],
      usage: {
        input_tokens: 100,
        output_tokens: output,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 25,
        cache_creation: { ephemeral_5m_input_tokens: 25, ephemeral_1h_input_tokens: 0 },
      },
    },
  });

/** A working directory with a transcript, a cache directory and a `trazum`. */
const bench = ({ trazum } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-statusline-'));
  const transcript = join(dir, 'session.jsonl');
  writeFileSync(transcript, [assistantLine('req-1', 200), assistantLine('req-2', 30)].join('\n') + '\n');

  const bin = join(dir, 'trazum');
  writeFileSync(bin, trazum ?? `#!/usr/bin/env bash\nexec ${process.execPath} ${CLI} "$@"\n`);
  chmodSync(bin, 0o755);

  return { dir, transcript, bin, cache: join(dir, 'cache') };
};

const run = (b, args, input) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: JSON.stringify(input),
    timeout: 30000,
    env: { ...SPAWN_ENV, TRAZUM_BIN: b.bin, TRAZUM_STATUSLINE_CACHE: b.cache },
  });

const payload = (b, extra = {}) => ({
  session_id: 'sess-1',
  model: { display_name: 'Sonnet' },
  transcript_path: b.transcript,
  cost: { total_cost_usd: 0.0123 },
  ...extra,
});

describe('the Claude Code status line', () => {
  it('falls back to Claude Code’s own figure, and says whose it is', () => {
    // The normal state of a first turn, and of an install that took the status
    // line without the hook. Printing nothing would look broken; printing
    // Claude Code's number unlabelled would be this product presenting
    // somebody else's estimate as its own, which is the one thing it does not
    // do. So it is shown, attributed.
    const b = bench();
    const out = run(b, [], payload(b)).stdout;

    assert.match(out, /\$0\.0123/, 'the fallback drops the figure it was handed');
    assert.match(out, /\(Claude Code\)/, 'the fallback does not say whose number it is');
    assert.match(out, /Sonnet/, 'the model is gone from the line');
  });

  it('the hook computes, and then the status line reports Trazum’s number', () => {
    const b = bench();

    const refresh = run(b, ['--refresh'], payload(b));
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.ok(existsSync(join(b.cache, 'sess-1.txt')), 'the hook wrote no cache');

    const out = run(b, [], payload(b)).stdout;
    assert.doesNotMatch(out, /\(Claude Code\)/, 'still attributing the fallback with a cache present');
    assert.match(out, /\$\d+\.\d{4}/, 'no cost in the line');
    assert.match(out, /2 calls/, 'the two requests were not collapsed to one figure');
    assert.match(out, /cache \d+%/, 'the cache hit rate is gone');
  });

  it('never computes: the status line does not run trazum at all', () => {
    /**
     * The property the whole design exists for, proved the only way that
     * distinguishes it from "it happened to be fast": `trazum` is replaced by
     * a script that fails and writes a marker. The hook is expected to reach
     * it, and the status line must not, cache or no cache.
     *
     * Without this, moving the computation back into the status line would
     * pass every other test in this file.
     */
    const dir = mkdtempSync(join(tmpdir(), 'trazum-statusline-probe-'));
    const marker = join(dir, 'called');
    const b = bench({ trazum: `#!/usr/bin/env bash\ntouch ${marker}\nexit 1\n` });

    const cold = run(b, [], payload(b));
    assert.equal(cold.status, 0, 'the status line failed with no cache');
    assert.ok(!existsSync(marker), 'the status line ran trazum with no cache present');

    // And with a cache, which is the path that would be tempting to "refresh
    // if stale" inside the status line.
    mkdirSync(b.cache, { recursive: true });
    writeFileSync(join(b.cache, 'sess-1.txt'), '$1.0000 · 1 calls · cache 0%');
    const warm = run(b, [], payload(b));
    assert.match(warm.stdout, /\$1\.0000/, 'the cached line was not used');
    assert.ok(!existsSync(marker), 'the status line ran trazum with a cache present');
  });

  it('a missing transcript costs the hook nothing and breaks nothing', () => {
    // A brand new session has no transcript on disk yet, and a resumed one can
    // point at a path that was cleaned up. Neither is an error worth a red
    // status line.
    const b = bench();
    const missing = payload(b, { transcript_path: join(b.dir, 'gone.jsonl') });

    const refresh = run(b, ['--refresh'], missing);
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.ok(!existsSync(join(b.cache, 'sess-1.txt')), 'the hook wrote a cache from nothing');

    assert.match(run(b, [], missing).stdout, /\(Claude Code\)/);
  });

  it('the cache is written whole or not at all', () => {
    // The status line reads this file at a moment nobody chose. A partial
    // write is a garbled status line, which reads as a bug in Trazum rather
    // than as a race in a shell script.
    const script = readFileSync(SCRIPT, 'utf8');
    assert.match(script, /\.tmp['"]? && mv /, 'the cache is written in place rather than renamed into place');
  });

  it('is documented onto the two hooks whose output is not context', () => {
    /**
     * `SessionStart` is the hook whose stdout Claude Code adds as context the
     * model can see, so a refresh wired to it would put this line in the
     * prompt and bill for it every session. The status line and `Stop` both
     * write where the model never looks.
     *
     * Asserted on the script's own documentation, which is what somebody
     * copies: a correct script beside an install snippet naming the wrong hook
     * is an install that costs money.
     */
    const script = readFileSync(SCRIPT, 'utf8');
    const readme = readFileSync(new URL('../../../plugin/README.md', import.meta.url).pathname, 'utf8');

    for (const [where, text] of [
      ['the script', script],
      ['plugin/README.md', readme],
    ]) {
      assert.ok(text.includes('"Stop"'), `${where} does not show the Stop hook`);
      assert.ok(text.includes('statusLine'), `${where} does not show the statusLine setting`);
      assert.ok(
        !/"SessionStart"/.test(text),
        `${where} wires the refresh to SessionStart, whose stdout the model is charged for`,
      );
    }
  });
});
