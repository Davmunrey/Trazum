import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum from-claude-code --state`: read only what is new, and get exactly
 * what reading the whole thing would have given.
 *
 * The transcript is append-only and can be enormous, so re-reading it every
 * turn is waste. The obstacle is the converter's own rule: **one call arrives
 * as several lines and the last one stands.** A run that stopped at the end of
 * the file would leave the call that was still streaming recorded from its
 * first line, and the next run, starting after it, would never see the lines
 * that finished it. The bill would be short by whatever that call grew by, on
 * every turn, for ever, and nothing would look wrong.
 *
 * So every test here is the same assertion wearing different clothes: the
 * resumed output equals the full-read output, byte for byte. That is the only
 * claim worth making about an optimisation to a number somebody pays.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

/**
 * `pad` puts multibyte characters in the payload on purpose: a resume point
 * computed as a character index rather than a byte offset is correct until the
 * first accented character and silently wrong after it.
 */
const line = (requestId, output, pad = 1) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-08-10T10:00:00.000Z',
    sessionId: 'sess-1',
    requestId,
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'ñ'.repeat(pad) }],
      usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 5 },
    },
  }) + '\n';

const bench = () => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-state-'));
  return {
    dir,
    transcript: join(dir, 'session.jsonl'),
    state: join(dir, 'state.json'),
    incremental: join(dir, 'incremental.jsonl'),
    full: join(dir, 'full.jsonl'),
  };
};

/** Convert with the state file, then again from scratch, and compare. */
const bothWays = (b) => {
  const resumed = run(['from-claude-code', b.transcript, '-o', b.incremental, '--state', b.state]);
  assert.equal(resumed.status, 0, resumed.stderr);
  const whole = run(['from-claude-code', b.transcript, '-o', b.full]);
  assert.equal(whole.status, 0, whole.stderr);
  return {
    incremental: readFileSync(b.incremental, 'utf8'),
    full: readFileSync(b.full, 'utf8'),
    stderr: resumed.stderr,
  };
};

describe('resuming a transcript', () => {
  it('gives the same records as reading the whole file, across three appends', () => {
    const b = bench();

    // A finished call, and one still streaming: exactly the shape a resume
    // point has to survive.
    writeFileSync(b.transcript, line('a', 1, 3) + line('a', 90, 3) + line('b', 5, 7));
    let seen = bothWays(b);
    assert.equal(seen.incremental, seen.full, 'the first pass already disagrees with a full read');
    assert.match(seen.stderr, /in full/, 'the first pass claimed to resume from nothing');

    // `b` finishes and `c` begins.
    appendFileSync(b.transcript, line('b', 55, 7) + line('c', 9, 2));
    seen = bothWays(b);
    assert.equal(seen.incremental, seen.full, 'the call that straddled the resume point was not re-derived');
    assert.match(seen.stderr, /Resumed at byte \d+/, 'the second pass re-read the whole file');

    appendFileSync(b.transcript, line('c', 99, 2) + line('d', 1, 5));
    seen = bothWays(b);
    assert.equal(seen.incremental, seen.full, 'the third pass drifted');

    // Four calls, and `b` and `c` carry the counts their *last* line gave.
    const records = seen.incremental.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(records.length, 4);
    assert.deepEqual(
      records.map((r) => r.usage.output_tokens),
      [90, 55, 99, 1],
      'a call that finished after the resume point kept its unfinished counts',
    );
  });

  it('re-reads from the top when the transcript is not the one the state describes', () => {
    /**
     * A transcript can be truncated, rotated or replaced by a different session
     * at the same path. Resuming at a byte offset into a different file would
     * assemble a bill from two unrelated sessions and report it as one, which
     * is worse than being slow. The digest of the bytes before the offset is
     * what refuses that.
     */
    const b = bench();
    writeFileSync(b.transcript, line('a', 1, 3) + line('a', 90, 3) + line('b', 5, 7));
    bothWays(b);

    /**
     * **The replacement is deliberately longer than the offset.** The first
     * version of this test wrote a shorter file, and the length check alone
     * refused it: the digest could be deleted and the test stayed green. A
     * guard that passes for a reason other than the one it claims is not a
     * guard, so the new session is padded past the old resume point and only
     * the digest can tell the two apart.
     */
    writeFileSync(b.transcript, line('z', 7, 400) + line('y', 8, 400));
    const seen = bothWays(b);

    assert.equal(seen.incremental, seen.full, 'a replaced transcript was resumed into rather than re-read');
    assert.match(seen.stderr, /in full/, 'it claimed to resume from a file that is no longer there');
  });

  it('does not step over a line that was still being written', () => {
    /**
     * A transcript read while Claude Code is appending to it can end
     * mid-line. That half-line parses as nothing, and a resume point past it
     * would drop the call it is about to become. Nothing about the output says
     * a record is missing, which is what makes it worth a test.
     */
    const b = bench();
    writeFileSync(b.transcript, line('a', 1) + '{"type":"assist');
    bothWays(b);

    // The rest of that line arrives, and it is a call.
    writeFileSync(b.transcript, line('a', 1) + line('b', 42));
    const seen = bothWays(b);

    assert.equal(seen.incremental, seen.full);
    assert.equal(seen.incremental.trim().split('\n').length, 2, 'the half-written call never arrived');
  });

  it('drops the tail rather than writing over it', () => {
    /**
     * The unsettled tail is re-derived every pass, and the re-derived version
     * can be **shorter** than the one it replaces: a call whose counts shrank
     * between two lines is a disagreement the converter records by letting the
     * last line stand, and a smaller number is fewer bytes. Writing at the
     * offset without truncating first leaves the difference behind as trailing
     * rubbish that nothing else in the file explains.
     *
     * The first version of this suite never caught that, because every append
     * it wrote made the tail longer. So the shrink is the test.
     */
    const b = bench();
    writeFileSync(b.transcript, line('a', 1) + line('b', 1000000));
    let seen = bothWays(b);
    assert.equal(seen.incremental, seen.full);

    // `b` reports a much smaller figure on its next line. The record shrinks.
    appendFileSync(b.transcript, line('b', 9));
    seen = bothWays(b);

    assert.equal(seen.incremental, seen.full, 'the shorter re-derived tail left the longer one behind');
    assert.equal(seen.incremental.trim().split('\n').length, 2, 'the output grew a line it should not have');
  });

  it('a transcript with no calls yet does not step over its half-written line', () => {
    /**
     * The partial-line cap only bites when nothing in the chunk carried usage,
     * because otherwise the resume point is already back at the last call's
     * first line and cannot be past the end. That is exactly the case the
     * first version of this suite missed: it planted a half-line after a real
     * call, where the cap changes nothing, and the cap could be deleted with
     * every test still green.
     */
    const b = bench();
    writeFileSync(b.transcript, '{"type":"user","message":{"content":"hi"}}\n{"type":"assist');
    bothWays(b);

    // The half-line completes, and it was a call all along.
    writeFileSync(b.transcript, '{"type":"user","message":{"content":"hi"}}\n' + line('a', 42));
    const seen = bothWays(b);

    assert.equal(seen.incremental, seen.full, 'the resume point had stepped over an unfinished line');
    assert.equal(seen.incremental.trim(), seen.full.trim());
    assert.equal(seen.incremental.trim().split('\n').length, 1, 'the completed call never arrived');
  });

  it('an empty append changes nothing and moves nothing', () => {
    const b = bench();
    writeFileSync(b.transcript, line('a', 1) + line('b', 2));
    const first = bothWays(b);
    const offsetAfterFirst = JSON.parse(readFileSync(b.state, 'utf8'));

    const second = bothWays(b);
    assert.equal(second.incremental, first.incremental, 'a no-op pass rewrote the output');
    assert.deepEqual(JSON.parse(readFileSync(b.state, 'utf8')), offsetAfterFirst, 'a no-op pass moved the state');
  });

  it('refuses the two shapes it cannot be exact in', () => {
    // A folder: the state ties one transcript offset to one output length, and
    // several transcripts appending to one output have no such length.
    const b = bench();
    writeFileSync(b.transcript, line('a', 1));
    const folder = run(['from-claude-code', b.dir, '-o', b.incremental, '--state', b.state]);
    assert.equal(folder.status, 1);
    assert.match(folder.stderr, /one transcript, not a folder/);

    // stdout: nothing to truncate, so nothing to resume against.
    const noOut = run(['from-claude-code', b.transcript, '--state', b.state]);
    assert.equal(noOut.status, 1);
    assert.match(noOut.stderr, /needs --out/);
  });

  it('a corrupt state file is a cold start, not a crash', () => {
    // The state is a cache. Losing it costs a full read and nothing else, so
    // an unreadable one must not be an error somebody has to clear by hand.
    const b = bench();
    writeFileSync(b.transcript, line('a', 1) + line('b', 2));
    writeFileSync(b.state, 'not json at all');

    const seen = bothWays(b);
    assert.equal(seen.incremental, seen.full);
    assert.match(seen.stderr, /in full/);
  });
});
