import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
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

const run = (b, args, input, env = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: JSON.stringify(input),
    timeout: 30000,
    env: { ...SPAWN_ENV, TRAZUM_BIN: b.bin, TRAZUM_STATUSLINE_CACHE: b.cache, ...env },
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

  it('counts the session’s subagents, whose transcripts are not the one Claude Code names', () => {
    /*
      Claude Code writes each subagent's transcript into a folder named after
      the session, and `transcript_path` is only the session's own. The line
      left every subagent out: a quarter of the cost on this repository's own
      sessions.
    */
    const b = bench();
    const agents = join(b.transcript.replace(/\.jsonl$/, ''), 'subagents', 'workflows', 'wf_1');
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(agents, 'agent-a.jsonl'), assistantLine('req-sub-1', 10) + '\n');
    writeFileSync(join(agents, 'agent-a.meta.json'), '{}');

    const refresh = run(b, ['--refresh'], payload(b));
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.match(run(b, [], payload(b)).stdout, /3 calls/, 'the subagent’s call is not in the line');
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

  describe('the plan’s limits, as Claude Code sends them (#823)', () => {
    /*
      Claude Code hands the status line `rate_limits` on a Pro, Max or Ultra
      plan, or behind a gateway that sets a spend limit: each window's
      `used_percentage` and its `resets_at` in epoch seconds
      (https://code.claude.com/docs/en/statusline, read on 2026-11-20). On a
      subscription the question is when the window runs out, not what a call
      cost. The line shows what was sent and nothing else: no table of plan
      limits, no counter worked out from tokens. Times are read in UTC here so
      the clock the line prints is the one the test expects.
    */
    // 2100-01-01T00:00Z, a Friday; the next day; and 2100-02-01.
    const FIVE = 4102444800;
    const SEVEN = 4102531200;
    const MONTH = 4105123200;
    const UTC = { TZ: 'UTC' };
    const plan = (rate_limits) => (b) => payload(b, { rate_limits });

    it('shows each window Claude Code sent, how much is used and when it resets', () => {
      const b = bench();
      const out = run(
        b,
        [],
        plan({
          five_hour: { used_percentage: 23.5, resets_at: FIVE },
          seven_day: { used_percentage: 41.2, resets_at: SEVEN },
          spend_limit: { used_percentage: 112.4, resets_at: MONTH, used_usd: 562, limit_usd: 500, period: 'monthly' },
        })(b),
        UTC,
      ).stdout;
      assert.equal(
        out,
        'Sonnet  $0.0123 (Claude Code)  |  5h 23%, resets 00:00 · 7d 41%, resets Sat 00:00 · spend 112% of $500/month, resets Feb 1',
      );
    });

    it('beside Trazum’s own figure, once the hook has computed it', () => {
      const b = bench();
      const input = plan({ five_hour: { used_percentage: 80, resets_at: FIVE } })(b);
      assert.equal(run(b, ['--refresh'], input, UTC).status, 0);
      const out = run(b, [], input, UTC).stdout;
      assert.match(out, /^Sonnet {2}\$\d+\.\d{4} · 2 calls · cache \d+%.* {2}\| {2}5h 80%, resets 00:00$/);
    });

    it('shows no plan figure when Claude Code sends none: an API key, or before the first response', () => {
      const b = bench();
      for (const input of [payload(b), plan({})(b), plan(null)(b)]) {
        assert.equal(run(b, [], input, UTC).stdout, 'Sonnet  $0.0123 (Claude Code)', `a plan figure from ${JSON.stringify(input.rate_limits)}`);
      }
    });

    it('shows only the windows that were sent, and none whose reset has passed', () => {
      const b = bench();
      const out = run(
        b,
        [],
        plan({
          // Reset an hour ago: what it says about the window is no longer true.
          five_hour: { used_percentage: 99, resets_at: Math.floor(Date.now() / 1000) - 3600 },
          seven_day: { used_percentage: 12, resets_at: SEVEN },
        })(b),
        UTC,
      ).stdout;
      assert.equal(out, 'Sonnet  $0.0123 (Claude Code)  |  7d 12%, resets Sat 00:00');
    });

    it('works nothing out: a window without its percentage or its reset is not shown', () => {
      const b = bench();
      const out = run(
        b,
        [],
        plan({
          five_hour: { resets_at: FIVE },
          seven_day: { used_percentage: '41', resets_at: SEVEN },
          spend_limit: { used_percentage: 50, used_usd: 250, limit_usd: 500 },
        })(b),
        UTC,
      ).stdout;
      assert.equal(out, 'Sonnet  $0.0123 (Claude Code)', 'a window shown from less than Claude Code sends for it');
    });

    it('rounds a window down, so one at 99.6% is not shown as used up', () => {
      const b = bench();
      const out = run(b, [], plan({ five_hour: { used_percentage: 99.6, resets_at: FIVE } })(b), UTC).stdout;
      assert.match(out, /5h 99%,/);
    });

    it('a spend limit without its figure in dollars says only how much of it is used', () => {
      const b = bench();
      const out = run(b, [], plan({ spend_limit: { used_percentage: 62.8, resets_at: MONTH } })(b), UTC).stdout;
      assert.match(out, /\| {2}spend 62%, resets Feb 1$/);
    });
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

// GHSA-qrgc-pfrm-49qv: the cache lived in a shared /tmp directory that another
// user could create first, plant links in, or write the status line's text to.
describe('where the status line keeps its cache', () => {
  it('is the user’s own cache directory by default, kept at 700', () => {
    const b = bench();
    const home = join(b.dir, 'home');
    mkdirSync(home);
    const env = { TRAZUM_STATUSLINE_CACHE: '', HOME: home, XDG_CACHE_HOME: '', TMPDIR: b.dir };
    assert.equal(run(b, ['--refresh'], payload(b), env).status, 0);
    const dir = join(home, '.cache', 'trazum', 'statusline');
    assert.ok(existsSync(join(dir, 'sess-1.txt')), 'the cache is not under ~/.cache/trazum/statusline');
    assert.equal(statSync(dir).mode & 0o777, 0o700, 'the cache directory is readable by others');
    assert.ok(!existsSync(join(b.dir, 'trazum-statusline')), 'the cache still went to TMPDIR');
  });

  it('narrows a directory others can read to 700 before writing in it', () => {
    const b = bench();
    mkdirSync(b.cache, { mode: 0o777 });
    chmodSync(b.cache, 0o777);
    assert.equal(run(b, ['--refresh'], payload(b)).status, 0);
    assert.equal(statSync(b.cache).mode & 0o777, 0o700);
  });

  it('writes nothing through a cache directory that is a link, and reads nothing from it', () => {
    const b = bench();
    const elsewhere = join(b.dir, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, 'sess-1.txt'), 'planted');
    symlinkSync(elsewhere, b.cache);

    assert.equal(run(b, ['--refresh'], payload(b)).status, 0);
    assert.deepEqual(readdirSync(elsewhere), ['sess-1.txt'], 'the refresh wrote through the link');
    assert.doesNotMatch(run(b, [], payload(b)).stdout, /planted/, 'the status line read through the link');
  });

  it('drops control characters from what it prints', () => {
    const b = bench();
    mkdirSync(b.cache, { mode: 0o700 });
    writeFileSync(join(b.cache, 'sess-1.txt'), '$1.0000\u001b]0;owned\u0007\u001b[2J');
    const out = run(b, [], payload(b)).stdout;
    assert.match(out, /\$1\.0000/);
    assert.doesNotMatch(out, /[\u0000-\u001f\u007f]/, 'an escape sequence reached the terminal');
  });

  it('keeps a session id from naming a path outside the cache directory', () => {
    const b = bench();
    assert.equal(run(b, ['--refresh'], payload(b, { session_id: '../../escaped' })).status, 0);
    assert.ok(!existsSync(join(b.dir, 'escaped.txt')), 'the session id climbed out of the cache directory');
    assert.ok(readdirSync(b.cache).some((name) => name.endsWith('escaped.txt')));
  });
});
