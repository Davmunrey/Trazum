import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { after, before, describe, it } from 'node:test';

/**
 * One contract, every driver: what the store promises, checked against the
 * memory driver always and against a real Postgres whenever there is one.
 *
 * ## Why this exists
 *
 * `store-postgres.test.mjs` checks the driver's SQL against a recording
 * tagged template: it catches a mistyped column, a value bound in the wrong
 * position and a `DELETE` whose predicate is too wide. It cannot catch SQL
 * that Postgres would reject, because nothing in it parses SQL. The accounts
 * guide said so, and the compliance readiness pack listed it as the first
 * thing a pull request could still do. This is that pull request.
 *
 * Set `TRAZUM_TEST_DATABASE_URL` to an empty database and the same assertions
 * run against Postgres too, after the migrations in `db/` are applied from
 * scratch. CI does this with a Postgres 16 service on every run. Without the
 * variable the Postgres half says it was skipped, rather than passing.
 *
 * Every assertion is one the routes rely on. A driver that disagrees with
 * another on any of them is a bug in one of the two, and the contract does not
 * care which.
 */

register('./helpers/loader.mjs', import.meta.url);

const PG_URL = process.env.TRAZUM_TEST_DATABASE_URL?.trim();

// CI asks for Postgres by name, so a misconfigured job fails instead of
// quietly reporting the Postgres half as skipped.
if (process.env.TRAZUM_REQUIRE_POSTGRES === '1' && !PG_URL) {
  throw new Error('TRAZUM_REQUIRE_POSTGRES is set and TRAZUM_TEST_DATABASE_URL is not');
}
const DB_DIR = new URL('../db/', import.meta.url);

let memoryStore;
let postgresStore;
let pg;

before(async () => {
  ({ memoryStore } = await import('../lib/store/memory.ts'));
  ({ postgresStore } = await import('../lib/store/postgres.ts'));
  if (PG_URL) {
    const { default: postgres } = await import('postgres');
    pg = postgres(PG_URL, { max: 2, prepare: false, onnotice: () => {} });
  }
});

after(async () => {
  await pg?.end({ timeout: 5 });
});

/** Every migration, in order, onto an empty schema: the path a new deployment takes. */
async function freshPostgres() {
  await pg.unsafe('drop schema if exists public cascade; create schema public;');
  for (const file of readdirSync(DB_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    await pg.unsafe(readFileSync(new URL(file, DB_DIR), 'utf8'));
  }
  return postgresStore(pg);
}

const DRIVERS = [
  { name: 'memory', make: async () => memoryStore(), skip: false },
  {
    name: 'postgres',
    make: freshPostgres,
    skip: PG_URL ? false : 'set TRAZUM_TEST_DATABASE_URL to an empty database to run the contract against Postgres',
  },
];

const T0 = new Date('2026-11-05T12:00:00Z');
const later = (ms) => new Date(T0.getTime() + ms);
const DAY = 86_400_000;
const identity = (n) => ({
  provider: 'github',
  providerId: String(100 + n),
  login: `person-${n}`,
  name: `Person ${n}`,
  avatarUrl: null,
});
const session = (userId, n, expiresAt = later(30 * DAY)) => ({
  tokenHash: `hash-${userId}-${n}`.padEnd(64, '0'),
  userId,
  createdAt: T0,
  expiresAt,
});

for (const driver of DRIVERS) {
  describe(`the store contract, on ${driver.name}`, { skip: driver.skip }, () => {
    it('keeps one user per identity, refreshing the profile on each sign-in', async () => {
      const store = await driver.make();
      const first = await store.upsertUser(identity(1), T0);
      const again = await store.upsertUser({ ...identity(1), login: 'renamed', name: 'New Name' }, later(1000));
      assert.equal(again.id, first.id, 'a second sign-in made a second user');
      assert.equal(again.login, 'renamed');
      assert.equal(again.name, 'New Name');
      const other = await store.upsertUser(identity(2), T0);
      assert.notEqual(other.id, first.id);
    });

    it('finds a live session, never an expired one, and ends them one at a time or all at once', async () => {
      const store = await driver.make();
      const user = await store.upsertUser(identity(1), T0);
      await store.createSession(session(user.id, 1));
      await store.createSession(session(user.id, 2));
      await store.createSession(session(user.id, 3, later(-1000)));

      const found = await store.findSession(session(user.id, 1).tokenHash, T0);
      assert.equal(found?.user.id, user.id);
      assert.equal(found?.session.expiresAt.getTime(), later(30 * DAY).getTime());
      assert.equal(await store.findSession('no-such-hash'.padEnd(64, '0'), T0), null);

      // The sweep first: presenting an expired session reaps that row on its own.
      assert.equal(await store.deleteExpiredSessions(T0), 1);
      assert.equal(await store.findSession(session(user.id, 3).tokenHash, T0), null, 'an expired session authenticated');
      await store.deleteSession(session(user.id, 1).tokenHash);
      assert.equal(await store.findSession(session(user.id, 1).tokenHash, T0), null);
      assert.ok(await store.findSession(session(user.id, 2).tokenHash, T0));
      await store.deleteSessionsForUser(user.id);
      assert.equal(await store.findSession(session(user.id, 2).tokenHash, T0), null);
    });

    it('moves a live session\'s end, and never brings a dead one back', async () => {
      const store = await driver.make();
      const user = await store.upsertUser(identity(1), T0);
      await store.createSession(session(user.id, 1, later(DAY)));
      await store.createSession(session(user.id, 2, later(-1000)));

      // Pushed out: alive past its old end, found with the new one.
      assert.equal(await store.touchSession(session(user.id, 1).tokenHash, later(3 * DAY), T0), true);
      const moved = await store.findSession(session(user.id, 1).tokenHash, later(2 * DAY));
      assert.equal(moved?.session.expiresAt.getTime(), later(3 * DAY).getTime(), 'the new end did not stick');

      // Pulled in, which is what a shorter idle window does at the next use.
      assert.equal(await store.touchSession(session(user.id, 1).tokenHash, later(2 * DAY + 1000), later(2 * DAY)), true);
      assert.equal(await store.findSession(session(user.id, 1).tokenHash, later(2 * DAY + 1000)), null);

      // Already over at `now`: refused, and still over.
      assert.equal(await store.touchSession(session(user.id, 2).tokenHash, later(DAY), T0), false, 'a dead session was revived');
      assert.equal(await store.findSession(session(user.id, 2).tokenHash, T0), null);
      assert.equal(await store.touchSession('no-such-hash'.padEnd(64, '0'), later(DAY), T0), false);
    });

    it('counts each bucket and window on its own, atomically, and sweeps the windows that ended', async () => {
      const store = await driver.make();
      const w0 = T0;
      const w1 = later(60_000);
      const end = (start) => new Date(start.getTime() + 60_000);

      // Twenty at once on one bucket: an atomic count hands out 1 to 20, each once.
      const counts = await Promise.all(Array.from({ length: 20 }, () => store.limits.hit('auth:a', w0, end(w0))));
      assert.deepEqual([...counts].sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1), 'two requests got the same count');

      assert.equal(await store.limits.hit('auth:b', w0, end(w0)), 1, 'buckets share a count');
      assert.equal(await store.limits.hit('session:a', w0, end(w0)), 1, 'limits share a count');
      assert.equal(await store.limits.hit('auth:a', w1, end(w1)), 1, 'a new window kept the old count');

      // The first window has ended at w1; the second has not.
      assert.equal(await store.limits.sweep(w1), 3);
      assert.equal(await store.limits.sweep(w1), 0);
      assert.equal(await store.limits.hit('auth:a', w1, end(w1)), 2, 'the sweep took a live window');
    });

    it('keeps every version of a prompt, oldest first by number, and only for its owner', async () => {
      const store = await driver.make();
      const alice = await store.upsertUser(identity(1), T0);
      const bob = await store.upsertUser(identity(2), T0);
      const prompt = await store.prompts.createPrompt({ ownerId: alice.id, name: 'Triage', text: 'v1', note: 'first', now: T0 });
      assert.ok(prompt);

      const saved = await store.prompts.addVersion({ promptId: prompt.id, ownerId: alice.id, authorId: alice.id, text: 'v2', note: null, now: later(1000) });
      assert.equal(saved.status, 'saved');
      assert.equal(saved.version.version, 2);
      const same = await store.prompts.addVersion({ promptId: prompt.id, ownerId: alice.id, authorId: alice.id, text: 'v2', note: null, now: later(2000) });
      assert.equal(same.status, 'unchanged', 'identical text made a new version');
      const stranger = await store.prompts.addVersion({ promptId: prompt.id, ownerId: bob.id, authorId: bob.id, text: 'mine now', note: null, now: later(3000) });
      assert.equal(stranger.status, 'not-found', 'another account wrote a version');

      const [summary] = await store.prompts.listPrompts(alice.id);
      assert.equal(summary.versionCount, 2);
      assert.equal(summary.latestText, 'v2');
      assert.deepEqual(await store.prompts.listPrompts(bob.id), []);

      const full = await store.prompts.getPrompt(prompt.id, alice.id);
      assert.deepEqual([...full.versions].map((v) => v.version).sort(), [1, 2]);
      assert.equal(full.versions.find((v) => v.version === 1).note, 'first');
      assert.equal(await store.prompts.getPrompt(prompt.id, bob.id), null, 'another account read a prompt');

      assert.equal(await store.prompts.renamePrompt(prompt.id, bob.id, 'stolen', later(4000)), false);
      assert.equal(await store.prompts.renamePrompt(prompt.id, alice.id, 'Renamed', later(4000)), true);
      assert.equal((await store.prompts.getPrompt(prompt.id, alice.id)).name, 'Renamed');
      assert.equal(await store.prompts.deletePrompt(prompt.id, bob.id), false);
      assert.equal(await store.prompts.deletePrompt(prompt.id, alice.id), true);
      assert.equal(await store.prompts.getPrompt(prompt.id, alice.id), null);
    });

    it('serves a live share link to anyone, an expired or revoked one to nobody', async () => {
      const store = await driver.make();
      const alice = await store.upsertUser(identity(1), T0);
      const bob = await store.upsertUser(identity(2), T0);
      const base = { ownerId: alice.id, ownerLogin: alice.login, beforeText: 'before text', afterText: 'after', settings: { level: 'safe' }, now: T0 };
      await store.shares.createShare({ ...base, token: 'live-token', expiresAt: later(7 * DAY) });
      await store.shares.createShare({ ...base, token: 'old-token', expiresAt: later(-1000) });
      await store.shares.createShare({ ...base, token: 'forever-token', expiresAt: null });

      const live = await store.shares.findShare('live-token', T0);
      assert.equal(live?.beforeText, 'before text');
      assert.deepEqual(live?.settings, { level: 'safe' });
      assert.equal(await store.shares.findShare('old-token', T0), null, 'an expired link was served');
      assert.ok(await store.shares.findShare('forever-token', later(3650 * DAY)));
      assert.deepEqual((await store.shares.listShares(alice.id, T0)).map((s) => s.token).sort(), ['forever-token', 'live-token']);

      assert.equal(await store.shares.revokeShare('live-token', bob.id), false, 'another account revoked a link');
      assert.equal(await store.shares.revokeShare('live-token', alice.id), true);
      assert.equal(await store.shares.findShare('live-token', T0), null);
    });

    it('counts the library for the admin overview, across accounts', async () => {
      const store = await driver.make();
      const alice = await store.upsertUser(identity(1), T0);
      const bob = await store.upsertUser(identity(2), T0);
      await store.prompts.createPrompt({ ownerId: alice.id, name: 'A', text: 'a', note: null, now: T0 });
      await store.prompts.createPrompt({ ownerId: bob.id, name: 'B', text: 'b', note: null, now: later(1000) });
      const census = await store.admin.census(10);
      assert.equal(census.totalPrompts, 2);
      assert.equal(census.totalAccounts, 2);
      assert.deepEqual(census.entries.map((e) => e.ownerLogin).sort(), ['person-1', 'person-2']);
    });

    it('deletes an account with everything that belonged to it, and nothing else', async () => {
      const store = await driver.make();
      const alice = await store.upsertUser(identity(1), T0);
      const bob = await store.upsertUser(identity(2), T0);
      for (const user of [alice, bob]) {
        await store.createSession(session(user.id, 1));
        const prompt = await store.prompts.createPrompt({ ownerId: user.id, name: 'P', text: 'one', note: null, now: T0 });
        await store.prompts.addVersion({ promptId: prompt.id, ownerId: user.id, authorId: user.id, text: 'two', note: null, now: later(1000) });
        await store.shares.createShare({ token: `share-${user.login}`, ownerId: user.id, ownerLogin: user.login, beforeText: 'b', afterText: 'a', settings: {}, now: T0, expiresAt: null });
      }

      assert.equal(await store.deleteUser(alice.id), true);
      assert.equal(await store.deleteUser(alice.id), false, 'deleting twice reported a deletion');
      assert.equal(await store.findSession(session(alice.id, 1).tokenHash, T0), null);
      assert.deepEqual(await store.prompts.listPrompts(alice.id), []);
      assert.equal(await store.shares.findShare('share-person-1', T0), null);

      assert.ok(await store.findSession(session(bob.id, 1).tokenHash, T0), "deleting one account ended another's session");
      assert.equal((await store.prompts.listPrompts(bob.id)).length, 1);
      assert.ok(await store.shares.findShare('share-person-2', T0));
      assert.equal((await store.admin.census(10)).totalAccounts, 1);
    });
  });
}


describe('Postgres rows written before the settings fix', { skip: PG_URL ? false : 'needs TRAZUM_TEST_DATABASE_URL' }, () => {
  it('still replay the settings their author saw', async () => {
    // The old write stored the settings as a JSON string inside jsonb. A
    // deployment that ran it has such rows, and they must keep working.
    const store = await freshPostgres();
    const alice = await store.upsertUser(identity(1), T0);
    await pg`
      insert into trazum_shares (token, owner_id, owner_login, before_text, after_text, settings, created_at, expires_at)
      values ('legacy-token', ${alice.id}, ${alice.login}, 'b', 'a', to_jsonb(${JSON.stringify({ level: 'aggressive' })}::text), ${T0}, null)
    `;
    const [{ kind }] = await pg`select jsonb_typeof(settings) as kind from trazum_shares where token = 'legacy-token'`;
    assert.equal(kind, 'string', 'the fixture does not reproduce the old encoding');
    assert.deepEqual((await store.shares.findShare('legacy-token', T0)).settings, { level: 'aggressive' });
  });
});

describe('rate limits shared through a real PostgreSQL', { skip: PG_URL ? false : 'needs TRAZUM_TEST_DATABASE_URL' }, () => {
  it('refuses two instances together, and the table never holds the address', async () => {
    const store = await freshPostgres();
    const { createSharedRateLimiter } = await import('../lib/shared-limit.ts');
    const warnings = [];
    const deps = { store: async () => store, secret: () => 'github-client-secret', warn: (m) => warnings.push(m) };
    const a = createSharedRateLimiter('auth', { windowMs: 60_000, max: 30 }, deps);
    const b = createSharedRateLimiter('auth', { windowMs: 60_000, max: 30 }, deps);
    const request = () => new Request('https://trazum.example/api/auth/github', { headers: { 'x-forwarded-for': '203.0.113.7' } });

    const now = T0.getTime();
    let refused = 0;
    for (let i = 0; i < 20; i += 1) if (await a(request(), now + i)) refused += 1;
    for (let i = 0; i < 20; i += 1) if (await b(request(), now + 20 + i)) refused += 1;
    assert.equal(refused, 10, 'each instance counted alone');
    assert.deepEqual(warnings, [], 'the shared count fell back');

    const rows = await pg`select bucket, hits from trazum_rate_limits`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hits, 40);
    assert.ok(!rows[0].bucket.includes('203.0.113.7'), 'the address reached the database');
  });
});

