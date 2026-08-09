import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The Postgres prompt driver, against a recording tagged template.
 *
 * Written because the route tests next door run entirely on the memory driver,
 * which means the SQL in `prompts-postgres.ts` was, until this file existed,
 * executed by nothing at all. Every ownership assertion in that suite passes
 * against a Postgres driver that selects by id alone.
 *
 * So the assertion that matters here is mechanical and applies to every
 * statement: **any query that names a prompt must also bind the owner.** Not
 * "the driver checks the owner somewhere" — in the `where` clause, in the same
 * statement, so there is no window in which the code holds a row it has not
 * proved belongs to the caller.
 *
 * Same limits as the accounts driver: this catches a missing predicate, a
 * mistyped column and a value bound in the wrong place. It cannot catch SQL
 * Postgres would reject, because nothing here parses SQL.
 */

register('./helpers/loader.mjs', import.meta.url);

let promptsInPostgres;
let MAX_PROMPTS_PER_OWNER;
let MAX_VERSIONS_PER_PROMPT;

before(async () => {
  ({ promptsInPostgres } = await import('../lib/store/prompts-postgres.ts'));
  ({ MAX_PROMPTS_PER_OWNER, MAX_VERSIONS_PER_PROMPT } = await import('../lib/store/prompts.ts'));
});

function recorder(responses = []) {
  const queries = [];
  let call = 0;
  const sql = (strings, ...values) => {
    queries.push({ text: strings.join(' ? '), values });
    return Promise.resolve(responses[call++] ?? []);
  };
  sql.end = async () => {};
  sql.queries = queries;
  return sql;
}

const flat = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const PROMPT = '33333333-3333-4333-8333-333333333333';

const PROMPT_ROW = {
  id: PROMPT,
  owner_id: OWNER,
  name: 'support triage',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
};

const VERSION_ROW = {
  id: '44444444-4444-4444-8444-444444444444',
  prompt_id: PROMPT,
  version: 2,
  text: 'the current text',
  note: null,
  author_id: OWNER,
  created_at: '2026-08-02T00:00:00.000Z',
  version_count: 2,
};

/**
 * Every call the driver can make, so the sweep below cannot miss one.
 *
 * A list of statements is only as complete as the list of methods that produced
 * it, so this drives all six rather than a chosen few.
 */
async function everyStatement() {
  const sql = recorder([
    [PROMPT_ROW], // listPrompts
    [{ total: 0 }], // createPrompt: count
    [PROMPT_ROW], // createPrompt: insert
    [], // createPrompt: version insert
    [PROMPT_ROW], // getPrompt: prompt
    [], // getPrompt: versions
    [VERSION_ROW], // addVersion: latest
    [VERSION_ROW], // addVersion: insert
    [], // addVersion: touch updated_at
    [{ id: PROMPT }], // renamePrompt
    [{ id: PROMPT }], // deletePrompt
  ]);

  const store = promptsInPostgres(sql);
  const now = new Date('2026-08-09T00:00:00Z');

  await store.listPrompts(OWNER);
  await store.createPrompt({ ownerId: OWNER, name: 'n', text: 't', note: null, now });
  await store.getPrompt(PROMPT, OWNER);
  await store.addVersion({
    promptId: PROMPT,
    ownerId: OWNER,
    authorId: OWNER,
    text: 'new text',
    note: null,
    now,
  });
  await store.renamePrompt(PROMPT, OWNER, 'renamed', now);
  await store.deletePrompt(PROMPT, OWNER);

  return sql.queries;
}

// ---------------------------------------------------------------------------

describe('every statement binds the owner', () => {
  it('names trazum_prompts only in statements that also bind the owner id', async () => {
    const queries = await everyStatement();

    // The two statements that legitimately do not mention the owner are the ones
    // that touch a prompt already proved to be theirs by the statement before —
    // and both are keyed on `prompt_id`, which is not a value the caller supplies
    // without having passed the check.
    const exempt = (text) =>
      text.startsWith('insert into trazum_prompt_versions') ||
      text.startsWith('select id, prompt_id, version, text, note, author_id, created_at from trazum_prompt_versions') ||
      text.startsWith('update trazum_prompts set updated_at');

    const offenders = queries
      .map((q) => ({ text: flat(q.text), values: q.values }))
      .filter((q) => q.text.includes('trazum_prompt'))
      .filter((q) => !exempt(q.text))
      .filter((q) => !q.values.includes(OWNER));

    assert.deepEqual(
      offenders.map((q) => q.text.slice(0, 70)),
      [],
      'a statement reaches a prompt without binding an owner',
    );
  });

  it('puts the owner in the where clause, not merely in the values', async () => {
    const queries = await everyStatement();
    for (const query of queries) {
      const text = flat(query.text);
      if (!query.values.includes(OWNER)) continue;
      // An `insert` binds the owner to *establish* ownership; it has nothing to
      // compare against yet. Everything else that binds it must be filtering by
      // it — which is the difference between a predicate and a decoration.
      if (text.startsWith('insert into')) continue;
      assert.ok(
        text.includes('owner_id = ?'),
        `owner is bound but not compared: ${text.slice(0, 90)}`,
      );
    }
  });

  it('scopes the list, the read, the rename and the delete', async () => {
    const queries = await everyStatement();
    const find = (fragment) => queries.find((q) => flat(q.text).includes(fragment));

    assert.ok(flat(find('from trazum_prompts p').text).includes('where p.owner_id = ?'));
    assert.ok(flat(find('select id, owner_id, name').text).includes('where id = ? and owner_id = ?'));
    assert.ok(flat(find('update trazum_prompts set name').text).includes('owner_id = ?'));
    assert.ok(flat(find('delete from trazum_prompts').text).includes('owner_id = ?'));
  });
});

// ---------------------------------------------------------------------------

describe('the driver behaves the way the memory one does', () => {
  it('refuses to create past the limit, without asking the database to insert', async () => {
    const sql = recorder([[{ total: MAX_PROMPTS_PER_OWNER }]]);
    const created = await promptsInPostgres(sql).createPrompt({
      ownerId: OWNER,
      name: 'n',
      text: 't',
      note: null,
      now: new Date(),
    });

    assert.equal(created, null);
    assert.equal(sql.queries.length, 1, 'the count, and nothing else');
  });

  it('answers null for a duplicate name rather than throwing a constraint', async () => {
    // `on conflict do nothing` returns no row. Relying on the constraint to
    // throw would mean matching on a driver's error string to tell "name taken"
    // from "the database fell over".
    const sql = recorder([[{ total: 0 }], []]);
    const created = await promptsInPostgres(sql).createPrompt({
      ownerId: OWNER,
      name: 'taken',
      text: 't',
      note: null,
      now: new Date(),
    });

    assert.equal(created, null);
    assert.ok(flat(sql.queries[1].text).includes('on conflict (owner_id, name) do nothing'));
    assert.equal(sql.queries.length, 2, 'no version row for a prompt that was not created');
  });

  it('writes version 1 with the prompt, so no prompt is ever textless', async () => {
    const sql = recorder([[{ total: 0 }], [PROMPT_ROW], []]);
    await promptsInPostgres(sql).createPrompt({
      ownerId: OWNER,
      name: 'n',
      text: 'first draft',
      note: 'why',
      now: new Date(),
    });

    const insert = sql.queries[2];
    assert.ok(flat(insert.text).startsWith('insert into trazum_prompt_versions'));
    assert.ok(insert.values.includes('first draft'));
    assert.ok(insert.values.includes('why'));
  });

  it('reports unchanged without writing anything', async () => {
    const sql = recorder([[VERSION_ROW]]);
    const result = await promptsInPostgres(sql).addVersion({
      promptId: PROMPT,
      ownerId: OWNER,
      authorId: OWNER,
      text: VERSION_ROW.text,
      note: null,
      now: new Date(),
    });

    assert.equal(result.status, 'unchanged');
    assert.equal(sql.queries.length, 1, 'the lookup only — nothing was inserted');
  });

  it('reports not-found when the prompt is not theirs, before any write', async () => {
    const sql = recorder([[]]);
    const result = await promptsInPostgres(sql).addVersion({
      promptId: PROMPT,
      ownerId: STRANGER,
      authorId: STRANGER,
      text: 'anything',
      note: null,
      now: new Date(),
    });

    assert.equal(result.status, 'not-found');
    assert.equal(sql.queries.length, 1);
    assert.ok(sql.queries[0].values.includes(STRANGER));
  });

  it('refuses past the version ceiling rather than pruning the oldest', async () => {
    const sql = recorder([[{ ...VERSION_ROW, version_count: MAX_VERSIONS_PER_PROMPT }]]);
    const result = await promptsInPostgres(sql).addVersion({
      promptId: PROMPT,
      ownerId: OWNER,
      authorId: OWNER,
      text: 'a new draft',
      note: null,
      now: new Date(),
    });

    assert.equal(result.status, 'too-many-versions');
    assert.equal(sql.queries.length, 1, 'nothing was deleted to make room');
  });

  it('numbers the next version one above the newest', async () => {
    const sql = recorder([[VERSION_ROW], [{ ...VERSION_ROW, version: 3, text: 'a new draft' }], []]);
    const result = await promptsInPostgres(sql).addVersion({
      promptId: PROMPT,
      ownerId: OWNER,
      authorId: OWNER,
      text: 'a new draft',
      note: null,
      now: new Date(),
    });

    assert.equal(result.status, 'saved');
    assert.ok(sql.queries[1].values.includes(3), 'version 2 is followed by version 3');
  });

  it('starts at 1 when a prompt somehow has no versions', async () => {
    // The left lateral join yields a row with null version columns rather than
    // no row: the prompt exists and is theirs, it just has no history.
    const sql = recorder([
      [{ id: null, prompt_id: null, version: null, version_count: 0 }],
      [{ ...VERSION_ROW, version: 1 }],
      [],
    ]);
    const result = await promptsInPostgres(sql).addVersion({
      promptId: PROMPT,
      ownerId: OWNER,
      authorId: OWNER,
      text: 'first',
      note: null,
      now: new Date(),
    });

    assert.equal(result.status, 'saved');
    assert.ok(sql.queries[1].values.includes(1));
  });

  it('binds every caller value instead of concatenating it', async () => {
    const hostile = "'; drop table trazum_prompts; --";
    const sql = recorder([[{ total: 0 }], [PROMPT_ROW], []]);
    await promptsInPostgres(sql).createPrompt({
      ownerId: OWNER,
      name: hostile,
      text: hostile,
      note: hostile,
      now: new Date(),
    });

    for (const query of sql.queries) {
      assert.ok(!query.text.includes('drop table'), 'a value reached the SQL text');
    }
    assert.ok(sql.queries.some((q) => q.values.includes(hostile)));
  });

  it('will not rename onto a name the owner already uses', async () => {
    const sql = recorder([[]]);
    const renamed = await promptsInPostgres(sql).renamePrompt(PROMPT, OWNER, 'taken', new Date());

    assert.equal(renamed, false);
    // The check is in the statement, not a read followed by a write: two
    // renames racing would otherwise both see the name free.
    assert.ok(flat(sql.queries[0].text).includes('not exists'));
  });

  it('orders history newest first and the list by most recently changed', async () => {
    const queries = await everyStatement();
    const versions = queries.find((q) => flat(q.text).includes('from trazum_prompt_versions where prompt_id = ?'));
    const listing = queries.find((q) => flat(q.text).includes('from trazum_prompts p'));

    assert.ok(flat(versions.text).includes('order by version desc'));
    assert.ok(flat(listing.text).includes('order by p.updated_at desc'));
  });
});
