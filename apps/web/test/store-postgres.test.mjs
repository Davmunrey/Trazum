import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The Postgres driver, against a tagged template that records instead of connecting.
 *
 * Be clear about what this can and cannot establish, because the shape of the
 * fixture decides the shape of the answer.
 *
 * It **can** catch: a column named differently on the two sides of a query, a
 * value bound in the wrong position, an `on conflict` clause that would reset
 * `created_at`, a `delete` whose predicate is wider than intended, and an
 * interpolation that ended up concatenated into the SQL text instead of bound.
 *
 * It **cannot** catch SQL that Postgres would reject, because nothing here
 * parses SQL. Applying `db/001_accounts.sql` to a real database and running the
 * app against it is a step a human has to take, and no test in this repository
 * replaces it. That is stated in the driver's own comment too, so the claim
 * lives next to the code making it.
 */

register('./helpers/loader.mjs', import.meta.url);

let postgresStore;

before(async () => {
  ({ postgresStore } = await import('../lib/store/postgres.ts'));
});

/**
 * A stand-in for `postgres`.
 *
 * Records every statement with its interpolated values kept separate, which is
 * the property being asserted: if a value ever reaches `strings`, it was
 * concatenated rather than bound.
 */
function recorder(responses = []) {
  const queries = [];
  let call = 0;

  const sql = (strings, ...values) => {
    queries.push({ text: strings.join('?'), values });
    return Promise.resolve(responses[call++] ?? []);
  };
  sql.end = async () => {};
  sql.queries = queries;
  return sql;
}

/** Normalised whitespace, so assertions do not depend on indentation. */
const flat = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

const IDENTITY = {
  provider: 'github',
  providerId: '583231',
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: null,
};

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  provider: 'github',
  provider_id: '583231',
  login: 'octocat',
  name: 'The Octocat',
  avatar_url: null,
  created_at: '2024-01-01T00:00:00.000Z',
};

describe('the Postgres driver', () => {
  it('binds every caller value instead of concatenating it', async () => {
    const sql = recorder([[ROW]]);
    const now = new Date('2026-08-09T00:00:00Z');
    await postgresStore(sql).upsertUser({ ...IDENTITY, login: "o'; drop table trazum_users; --" }, now);

    const [query] = sql.queries;
    assert.ok(!query.text.includes('drop table'), 'the login never reaches the SQL text');
    assert.ok(query.values.includes("o'; drop table trazum_users; --"));
  });

  it('does not reset created_at when an existing account signs in again', async () => {
    const sql = recorder([[ROW]]);
    await postgresStore(sql).upsertUser(IDENTITY, new Date());

    const text = flat(sql.queries[0].text);
    // Bounded at `returning`, which lists `created_at` legitimately. The first
    // version of this test read to the end of the statement and failed on a
    // column the update clause does not contain.
    const update = text.slice(text.indexOf('do update set'), text.indexOf('returning'));
    assert.ok(update.includes('login'), 'the rename is picked up');
    assert.ok(update.includes('avatar_url'));
    assert.ok(!update.includes('created_at'), 'the joining date is left alone');
  });

  it('conflicts on the provider pair, not on the login', async () => {
    const sql = recorder([[ROW]]);
    await postgresStore(sql).upsertUser(IDENTITY, new Date());
    assert.ok(flat(sql.queries[0].text).includes('on conflict (provider, provider_id)'));
  });

  it('maps a row back to a record, including the nulls', async () => {
    const sql = recorder([[{ ...ROW, name: null, avatar_url: null }]]);
    const user = await postgresStore(sql).upsertUser(IDENTITY, new Date());

    assert.equal(user.id, ROW.id);
    assert.equal(user.providerId, '583231');
    assert.equal(user.name, null);
    assert.equal(user.avatarUrl, null);
    assert.ok(user.createdAt instanceof Date);
    assert.equal(user.createdAt.toISOString(), '2024-01-01T00:00:00.000Z');
  });

  it('refuses to carry on when an upsert returns nothing', async () => {
    // `returning` on an upsert always yields a row. If it somehow did not, the
    // caller is one line away from minting a session for a user that does not
    // exist, so this throws rather than returning something shaped like a user.
    const sql = recorder([[]]);
    await assert.rejects(() => postgresStore(sql).upsertUser(IDENTITY, new Date()), /no row/);
  });

  it('asks the database to judge expiry, not JavaScript', async () => {
    const sql = recorder([[]]);
    const now = new Date('2026-08-09T00:00:00Z');
    await postgresStore(sql).findSession('deadbeef', now);

    const select = flat(sql.queries[0].text);
    assert.ok(select.includes('expires_at > ?'), 'the window is in the query');
    assert.deepEqual(sql.queries[0].values, ['deadbeef', now]);
  });

  it('sweeps only the row it just found to be expired', async () => {
    const sql = recorder([[]]);
    const now = new Date('2026-08-09T00:00:00Z');
    assert.equal(await postgresStore(sql).findSession('deadbeef', now), null);

    assert.equal(sql.queries.length, 2, 'a select, then a delete');
    const del = flat(sql.queries[1].text);
    assert.ok(del.startsWith('delete from trazum_sessions'));
    // Without the second predicate, a lookup that raced a sign-in would delete
    // a session that had just become valid.
    assert.ok(del.includes('expires_at <= ?'), 'the delete cannot reach a live session');
    assert.deepEqual(sql.queries[1].values, ['deadbeef', now]);
  });

  it('returns the session and its owner from one round trip', async () => {
    const sql = recorder([
      [
        {
          ...ROW,
          token_hash: 'deadbeef',
          user_id: ROW.id,
          session_created_at: '2026-08-01T00:00:00.000Z',
          expires_at: '2026-08-31T00:00:00.000Z',
        },
      ],
    ]);

    const found = await postgresStore(sql).findSession('deadbeef', new Date('2026-08-09T00:00:00Z'));
    assert.equal(sql.queries.length, 1, 'no delete when a row matched');
    assert.equal(found.user.login, 'octocat');
    assert.equal(found.session.userId, ROW.id);
    // The two `created_at` columns are aliased apart; conflating them would give
    // the session the account's age.
    assert.equal(found.session.createdAt.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(found.user.createdAt.toISOString(), '2024-01-01T00:00:00.000Z');
  });

  it('deletes one session by hash and all of them by user', async () => {
    const sql = recorder();
    const store = postgresStore(sql);
    await store.deleteSession('deadbeef');
    await store.deleteSessionsForUser(ROW.id);

    assert.ok(flat(sql.queries[0].text).includes('where token_hash = ?'));
    assert.deepEqual(sql.queries[0].values, ['deadbeef']);
    assert.ok(flat(sql.queries[1].text).includes('where user_id = ?'));
    assert.deepEqual(sql.queries[1].values, [ROW.id]);
  });

  it('does not claim to be ephemeral', () => {
    assert.equal(postgresStore(recorder()).ephemeral, false);
    assert.equal(postgresStore(recorder()).kind, 'postgres');
  });
});

describe('the schema the driver expects', () => {
  const source = readFileSync(new URL('../db/001_accounts.sql', import.meta.url), 'utf8');

  /**
   * The statements only.
   *
   * The comments in that file explain, at length, why `force row level
   * security` is the wrong word — which meant the test asserting the file does
   * not say `force row level security` failed on the sentence saying so. A
   * prose mention of a statement is not the statement.
   */
  const schema = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  it('declares every column the driver reads or writes', () => {
    for (const column of [
      'provider_id',
      'avatar_url',
      'created_at',
      'token_hash',
      'user_id',
      'expires_at',
    ]) {
      assert.ok(schema.includes(column), `schema is missing ${column}`);
    }
  });

  it('has the unique constraint the upsert conflicts on', () => {
    // Without this, `on conflict (provider, provider_id)` is a runtime error on
    // every second sign-in, and nothing in the fake-SQL tests above would know.
    assert.ok(flat(schema).includes('unique (provider, provider_id)'));
  });

  it('cascades sessions when a user is deleted', () => {
    assert.ok(flat(schema).includes('on delete cascade'));
  });

  it('enables row level security without forcing it', () => {
    // `enable` blocks the REST layer that platforms like Supabase put in front
    // of `public`; `force` would additionally block the table owner, which is
    // Trazum, and take the deployment down. The stricter-looking word is the
    // wrong one, so pin the right one.
    assert.ok(flat(schema).includes('alter table trazum_users enable row level security'));
    assert.ok(flat(schema).includes('alter table trazum_sessions enable row level security'));
    assert.ok(!flat(schema).includes('force row level security'));
  });

  it('can be applied twice', () => {
    const statements = schema.split(';').filter((s) => /create (table|index)/i.test(s));
    assert.ok(statements.length >= 3);
    for (const statement of statements) {
      assert.match(statement, /if not exists/i);
    }
  });
});
