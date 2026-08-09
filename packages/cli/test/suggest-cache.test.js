import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SUGGEST_SYSTEM_PROMPT, estimateTokens, suggestRewrites } from '@trazum/core';

import {
  DEFAULT_TTL_DAYS,
  SCHEMA,
  cacheDir,
  cacheKey,
  cacheStats,
  cachingProvider,
  clearCache,
  readEntry,
  writeEntry,
} from '../dist/suggest-cache.js';

/**
 * The cache that answers `--suggest` from disk, and the measurement that
 * explains why it exists instead of the API feature that was asked for.
 */

const scratch = () => mkdtempSync(join(tmpdir(), 'trazum-cache-'));

/** A provider that counts calls, so "did not ask" is checkable. */
function counting(response = '[]') {
  let calls = 0;
  return {
    name: 'fake',
    model: 'fake-1',
    get calls() {
      return calls;
    },
    async complete() {
      calls += 1;
      return typeof response === 'function' ? response(calls) : response;
    },
  };
}

// ---------------------------------------------------------------------------

describe('why this is not the API feature that was asked for', () => {
  /**
   * The published minimum cacheable prefix, per model tier.
   *
   * A prefix shorter than the minimum is not cached and *does not say so* —
   * `cache_creation_input_tokens` comes back zero, no error is raised. That
   * silence is the whole reason this test exists: marking the suggest prompt
   * with `cache_control` would have looked like a saving, cost one line, and
   * changed nothing measurable.
   */
  const MINIMUMS = {
    'claude-opus-5': 512,
    'claude-fable-5': 512,
    'claude-opus-4-8': 1024,
    'claude-sonnet-5': 1024,
    'claude-sonnet-4-6': 1024,
    'claude-opus-4-7': 2048,
    'claude-opus-4-6': 4096,
    'claude-haiku-4-5': 4096,
  };

  it('the suggest system prompt is below every model’s cacheable minimum', () => {
    const tokens = estimateTokens(SUGGEST_SYSTEM_PROMPT);
    const smallest = Math.min(...Object.values(MINIMUMS));

    assert.ok(
      tokens < smallest,
      `the suggest prompt is ${tokens} tokens and the smallest cacheable prefix is ${smallest} — ` +
        'API prompt caching has become possible, and the comment in suggest-cache.ts saying it ' +
        'cannot work is now wrong',
    );

    // Pinned so a rewrite that halves it, or one that doubles it, is visible in
    // the diff rather than only in a comment.
    assert.ok(tokens > 100, `unexpectedly small: ${tokens}`);
    assert.ok(tokens < 400, `unexpectedly large: ${tokens}`);
  });

  it('and the only other candidate prefix is the caller’s own prompt', async () => {
    /**
     * Render order is tools, then system, then messages. Trazum sends no tools,
     * so the sole stable prefix is the system prompt measured above; everything
     * after it is the author's text, which differs on every call by
     * construction. There is no placement of `cache_control` that helps — this
     * is not a tuning problem.
     *
     * Checked by watching what `suggestRewrites` actually sends rather than by
     * probing the prompt's text. The first version of this test asserted
     * `!SUGGEST_SYSTEM_PROMPT.includes('{{')` as a stand-in for "no
     * interpolation", which fails against the prompt as written — it *documents*
     * placeholder syntax, in the line telling the model never to touch `{{x}}`.
     * A test that reads a constant's contents to guess at how it is used was
     * asking the wrong question anyway.
     */
    const seen = [];
    const provider = {
      name: 'fake',
      model: 'fake-1',
      async complete({ system, user }) {
        seen.push({ system, user });
        return '[]';
      },
    };

    await suggestRewrites('the first prompt', provider);
    await suggestRewrites('a different prompt', provider);

    assert.equal(seen.length, 2);
    // Byte-identical across calls, and identical to the exported constant: no
    // per-request interpolation happens on the way to the provider.
    assert.equal(seen[0].system, SUGGEST_SYSTEM_PROMPT);
    assert.equal(seen[1].system, SUGGEST_SYSTEM_PROMPT);
    // And the part after it is the caller's, which is what makes the prefix the
    // only cacheable candidate — and the whole request the only worthwhile unit
    // to cache locally.
    assert.notEqual(seen[0].user, seen[1].user);
  });
});

// ---------------------------------------------------------------------------

describe('the key covers everything that changes the answer', () => {
  const base = { provider: 'anthropic', model: 'claude-opus-5', system: 'sys', user: 'usr' };

  it('is stable for identical input', () => {
    assert.equal(cacheKey(base), cacheKey({ ...base }));
    assert.match(cacheKey(base), /^[0-9a-f]{64}$/);
  });

  it('changes when any field changes', () => {
    const keys = new Set([
      cacheKey(base),
      cacheKey({ ...base, provider: 'openai' }),
      cacheKey({ ...base, model: 'claude-sonnet-5' }),
      cacheKey({ ...base, system: 'different' }),
      cacheKey({ ...base, user: 'different' }),
    ]);
    assert.equal(keys.size, 5);
  });

  it('cannot be confused by a field boundary inside a prompt', () => {
    /**
     * Length-prefixed, not delimiter-joined.
     *
     * Joining on a separator means any prompt *containing that separator* can
     * impersonate a different split of the same fields — and a prompt is
     * arbitrary text, so every separator occurs in one eventually.
     *
     * The fixture has to carry the separator to say anything. An earlier version
     * used `('ab', 'c')` against `('a', 'bc')`, which a plain `join(':')` also
     * keeps apart — it produces `…:ab:c` and `…:a:bc`. It looked like a
     * boundary test and tested nothing; replacing the length prefix with a join
     * left it green. These two collide under any single-separator join.
     */
    const a = cacheKey({ ...base, system: 'a:b', user: 'c' });
    const b = cacheKey({ ...base, system: 'a', user: 'b:c' });
    assert.notEqual(a, b);
  });

  it('is derivable by hand, so the format is pinned and not merely self-consistent', () => {
    /**
     * `cacheKey` compared to itself agrees with any implementation, including
     * ones that drop a field. This spells the canonical form out independently:
     * schema, provider, model, system, user, each prefixed with its length in
     * characters, concatenated, SHA-256, hex.
     *
     * A change here is a change to every user's cache keys — every entry on
     * every machine misses once, silently. That is cheap and correct, but it
     * should be a decision somebody wrote down rather than a refactor.
     */
    const parts = [String(SCHEMA), base.provider, base.model, base.system, base.user];
    const expected = createHash('sha256')
      .update(parts.map((part) => `${part.length}:${part}`).join(''), 'utf8')
      .digest('hex');

    assert.equal(cacheKey(base), expected);
  });

  it('never contains the prompt it is a key for', () => {
    const secret = 'the unreleased product behaviour';
    assert.ok(!cacheKey({ ...base, user: secret }).includes('unreleased'));
  });
});

// ---------------------------------------------------------------------------

describe('reading and writing', () => {
  const entry = (at) => ({
    schema: 2,
    at,
    provider: 'fake',
    model: 'fake-1',
    response: '[{"before":"x","after":"y"}]',
  });

  it('round-trips an entry', () => {
    const dir = scratch();
    const now = Date.UTC(2026, 7, 9);
    writeEntry(dir, 'a'.repeat(64), entry(now));

    const read = readEntry(dir, 'a'.repeat(64), now, DEFAULT_TTL_DAYS);
    assert.equal(read.response, '[{"before":"x","after":"y"}]');
  });

  it('refuses an entry past its lifetime', () => {
    const dir = scratch();
    const written = Date.UTC(2026, 7, 1);
    writeEntry(dir, 'b'.repeat(64), entry(written));

    const withinWindow = written + (DEFAULT_TTL_DAYS - 1) * 86_400_000;
    assert.ok(readEntry(dir, 'b'.repeat(64), withinWindow, DEFAULT_TTL_DAYS));

    // Exactly at the limit still counts, so the window is inclusive rather than
    // "seven days, give or take a millisecond depending on which comparison
    // somebody typed".
    const atWindow = written + DEFAULT_TTL_DAYS * 86_400_000;
    assert.ok(readEntry(dir, 'b'.repeat(64), atWindow, DEFAULT_TTL_DAYS));

    const pastWindow = written + (DEFAULT_TTL_DAYS + 1) * 86_400_000;
    assert.equal(readEntry(dir, 'b'.repeat(64), pastWindow, DEFAULT_TTL_DAYS), null);
  });

  it('has a default lifetime somebody chose', () => {
    /**
     * Pinned as a number, not read back from the export the code uses.
     *
     * Every other test here takes `DEFAULT_TTL_DAYS` from the module, so raising
     * it to two years would move both sides of every comparison and change no
     * result. The value matters on its own: it is how long a model alias that
     * started pointing somewhere new keeps answering with the old model's words.
     */
    assert.equal(DEFAULT_TTL_DAYS, 7);
  });

  it('refuses an entry from an older schema', () => {
    const dir = scratch();
    const now = Date.now();
    writeEntry(dir, 'c'.repeat(64), { ...entry(now), schema: 1 });
    assert.equal(readEntry(dir, 'c'.repeat(64), now, DEFAULT_TTL_DAYS), null);
  });

  it('treats a truncated file as a miss rather than an error', () => {
    // An interrupted run leaves half a JSON document. The answer is one API
    // call away; refusing to run because a cache file is corrupt would be worse
    // than the problem it reports.
    const dir = scratch();
    writeFileSync(join(dir, `${'d'.repeat(64)}.json`), '{"schema": 2, "at"');
    assert.equal(readEntry(dir, 'd'.repeat(64), Date.now(), DEFAULT_TTL_DAYS), null);
  });

  it('treats a well-formed file with the wrong shape as a miss too', () => {
    /**
     * Parsing is not checking. A file that is valid JSON can still be a JSON
     * document that is not one of ours — hand-edited, written by a future
     * version, or a collision with something else that likes this directory.
     *
     * `at` matters most: a non-number makes `now - entry.at` NaN, and every
     * comparison against NaN is false, so an unchecked reader treats it as
     * never expiring. The entry answers forever.
     */
    const dir = scratch();
    const now = Date.now();

    const cases = {
      g: { ...entry(now), at: 'yesterday' },
      h: { ...entry(now), at: null },
      i: { ...entry(now), response: 42 },
      j: { ...entry(now), response: { before: 'x' } },
    };

    for (const [letter, value] of Object.entries(cases)) {
      const key = letter.repeat(64);
      writeFileSync(join(dir, `${key}.json`), JSON.stringify(value));
      assert.equal(readEntry(dir, key, now, DEFAULT_TTL_DAYS), null, JSON.stringify(value));
    }
  });

  it('writes files nobody else on the machine can read', () => {
    /**
     * The cache holds prompt text — the most sensitive thing this tool touches.
     * A default-permission file in a shared home directory publishes somebody's
     * unreleased product behaviour to every other account.
     *
     * Written into a directory `writeEntry` has to create. The first version
     * wrote into the scratch directory, which `mkdtemp` had already made 0700 —
     * so `mkdirSync`'s mode argument was never used, and setting it to 0755 kept
     * the test green. The permission that matters is the one on a directory
     * this code creates on a real machine, under whatever umask it finds.
     */
    const dir = join(scratch(), 'made-by-us');
    writeEntry(dir, 'e'.repeat(64), entry(Date.now()));

    assert.equal(statSync(join(dir, `${'e'.repeat(64)}.json`)).mode & 0o777, 0o600);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
  });

  it('does not fail a command when it cannot write', () => {
    /**
     * Read-only home, full disk, hostile umask. None of them are reasons to
     * fail a command that was going to work.
     *
     * The unwritable path is a regular file used as a parent directory, which
     * fails with ENOTDIR on every platform. The first version of this test
     * pointed at `/proc/nonexistent/...`, where `mkdirSync({recursive: true})`
     * does not fail — it *hangs*, in this container at least. A test that
     * chooses a platform-dependent path to be sure of an error is a test that
     * hangs CI on the one platform that behaves differently.
     */
    const dir = scratch();
    const notADirectory = join(dir, 'file');
    writeFileSync(notADirectory, 'regular file');

    assert.doesNotThrow(() =>
      writeEntry(join(notADirectory, 'nested'), 'f'.repeat(64), entry(Date.now())),
    );
  });
});

// ---------------------------------------------------------------------------

describe('the wrapper asks once', () => {
  it('answers the second identical question from disk', async () => {
    const dir = scratch();
    const inner = counting('[{"before":"a","after":"b"}]');
    const provider = cachingProvider(inner, { dir });

    const first = await provider.complete({ system: 's', user: 'u' });
    const second = await provider.complete({ system: 's', user: 'u' });

    assert.equal(first, second);
    assert.equal(inner.calls, 1, 'the model was asked once');
    assert.equal(provider.hits, 1);
    assert.equal(provider.misses, 1);
  });

  it('asks again when the prompt changed', async () => {
    const dir = scratch();
    const inner = counting();
    const provider = cachingProvider(inner, { dir });

    await provider.complete({ system: 's', user: 'one' });
    await provider.complete({ system: 's', user: 'two' });

    assert.equal(inner.calls, 2);
    assert.equal(provider.hits, 0);
  });

  it('does not remember a failed call as an answer', async () => {
    const dir = scratch();
    let calls = 0;
    const flaky = {
      name: 'fake',
      model: 'fake-1',
      async complete() {
        calls += 1;
        if (calls === 1) throw new Error('rate limited');
        return '[]';
      },
    };

    const provider = cachingProvider(flaky, { dir });
    await assert.rejects(() => provider.complete({ system: 's', user: 'u' }), /rate limited/);
    assert.equal(cacheStats(dir).entries, 0, 'nothing was written');

    // And the error propagated untouched rather than being swallowed into a miss.
    assert.equal(await provider.complete({ system: 's', user: 'u' }), '[]');
    assert.equal(calls, 2);
  });

  it('caches the model’s words, not the checked result', async () => {
    /**
     * The stored value is the raw response.
     *
     * Everything `suggestRewrites` does afterwards — checking each `before`
     * appears byte for byte, refusing anything touching protected content,
     * dropping overlaps — is deterministic and lives in the core. Caching the
     * text means a hit is re-checked by today's rules rather than replaying a
     * verdict an older version reached.
     */
    const dir = scratch();
    const raw = '[{"before":"You should always make sure to","after":"Always"}]';
    await cachingProvider(counting(raw), { dir }).complete({ system: 's', user: 'u' });

    const [name] = readdirSync(dir);
    const stored = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    assert.equal(stored.response, raw);
    assert.ok(!('suggestions' in stored), 'no parsed verdict is stored');
    assert.ok(!('tokensSaved' in stored));
  });

  it('keeps two models’ answers apart', async () => {
    const dir = scratch();
    const opus = cachingProvider({ ...counting('["opus"]'), model: 'a' }, { dir });
    const sonnet = cachingProvider({ ...counting('["sonnet"]'), model: 'b' }, { dir });

    assert.equal(await opus.complete({ system: 's', user: 'u' }), '["opus"]');
    assert.equal(await sonnet.complete({ system: 's', user: 'u' }), '["sonnet"]');
    assert.equal(cacheStats(dir).entries, 2);
  });

  it('reports its own hit rate, so a hit is never silent', async () => {
    const dir = scratch();
    const provider = cachingProvider(counting(), { dir });
    await provider.complete({ system: 's', user: 'a' });
    await provider.complete({ system: 's', user: 'a' });
    await provider.complete({ system: 's', user: 'b' });

    assert.equal(provider.hits, 1);
    assert.equal(provider.misses, 2);
  });
});

// ---------------------------------------------------------------------------

describe('clearing', () => {
  it('removes its own entries and counts them', async () => {
    const dir = scratch();
    const provider = cachingProvider(counting(), { dir });
    await provider.complete({ system: 's', user: 'a' });
    await provider.complete({ system: 's', user: 'b' });

    assert.equal(cacheStats(dir).entries, 2);
    assert.equal(clearCache(dir), 2);
    assert.equal(cacheStats(dir).entries, 0);
  });

  it('touches nothing it did not write', () => {
    /**
     * Only files matching the 64-hex-plus-.json shape.
     *
     * A clear that deletes whatever it finds is a clear somebody eventually
     * points at a directory that is not this one — `XDG_CACHE_HOME` is a
     * user-settable path, and the last two segments are appended by us.
     */
    const dir = scratch();
    writeFileSync(join(dir, 'notes.txt'), 'not ours');
    writeFileSync(join(dir, 'short.json'), '{}');
    writeFileSync(join(dir, `${'a'.repeat(64)}.json`), '{}');

    assert.equal(clearCache(dir), 1);
    assert.deepEqual(readdirSync(dir).sort(), ['notes.txt', 'short.json']);
  });

  it('counts nothing it did not write either', () => {
    /**
     * The same filter, on the other function. `cacheStats` is what `doctor`
     * prints and what the clear message reports, so a stats call that counted
     * every file in the directory would tell somebody their cache holds
     * documents it never wrote and cannot remove.
     */
    const dir = scratch();
    writeFileSync(join(dir, 'notes.txt'), 'x'.repeat(1000));
    writeFileSync(join(dir, `${'a'.repeat(64)}.json`), '{}');

    const stats = cacheStats(dir);
    assert.equal(stats.entries, 1);
    assert.equal(stats.bytes, 2, 'the stray file’s thousand bytes are not counted');
  });

  it('is quiet about a directory that was never created', () => {
    assert.equal(clearCache(join(scratch(), 'never-made')), 0);
    assert.deepEqual(cacheStats(join(scratch(), 'never-made')), { entries: 0, bytes: 0 });
  });
});

// ---------------------------------------------------------------------------

describe('where it lives', () => {
  it('honours XDG_CACHE_HOME', () => {
    assert.equal(cacheDir({ XDG_CACHE_HOME: '/x/cache' }), '/x/cache/trazum/suggestions');
  });

  it('falls back to ~/.cache', () => {
    const dir = cacheDir({});
    assert.match(dir, /\.cache[/\\]trazum[/\\]suggestions$/);
  });

  it('is not the project directory', () => {
    // Two checkouts of the same repository ask the same questions; a
    // per-checkout cache answers neither of them from the other.
    assert.ok(!cacheDir({}).startsWith(process.cwd()));
  });

  it('ignores a blank XDG_CACHE_HOME rather than rooting at /', () => {
    assert.match(cacheDir({ XDG_CACHE_HOME: '   ' }), /\.cache[/\\]trazum/);
  });
});
