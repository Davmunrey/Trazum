import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The prompt library, called through its routes with two real accounts.
 *
 * Two accounts is the whole point of the fixture. A library that works is easy;
 * a library where Mallory cannot read Alice's prompts is the feature, and a
 * suite with one user cannot tell the difference — every assertion passes
 * whether the owner predicate is there or not.
 *
 * So every route is exercised twice: once by the owner, once by somebody else
 * holding the same id. The second must be indistinguishable from asking for an
 * id that does not exist, because a 403 confirms the id is real and turns the
 * route into an oracle for enumerating other people's work.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let list, create, one, promptsInMemory, limits;
let getStore, resetStore, issueSession;

const saved = {};

let clients = 0;
/** A distinct address per request, so the rate limiter is not the thing under test. */
function req(url, init = {}) {
  clients += 1;
  return new Request(url, {
    ...init,
    headers: { 'x-forwarded-for': `198.51.100.${clients % 250}`, ...(init.headers ?? {}) },
  });
}

const json = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  ({ GET: list, POST: create } = await import('../app/api/prompts/route.ts'));
  one = await import('../app/api/prompts/[id]/route.ts');
  ({ promptsInMemory } = await import('../lib/store/prompts-memory.ts'));
  limits = await import('../lib/store/prompts.ts');
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
  ({ issueSession } = await import('../lib/auth/session.ts'));
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * A signed-in account, built through the store rather than through GitHub.
 *
 * The OAuth flow has its own file. What this suite needs is two cookies
 * belonging to two different people, and going through the callback for each
 * would test the callback again and this feature less.
 */
async function account(login) {
  const store = await getStore();
  const now = new Date();
  const user = await store.upsertUser(
    { provider: 'github', providerId: `id-${login}`, login, name: null, avatarUrl: null },
    now,
  );
  const session = issueSession(user.id, now, true);
  await store.createSession(session.record);
  return { user, cookie: `__Host-trazum_session=${session.token}` };
}

let alice;
let mallory;

beforeEach(async () => {
  Object.assign(process.env, ENV);
  resetStore();
  alice = await account('alice');
  mallory = await account('mallory');
});

/** Save a prompt as Alice and return the created body. */
async function savePrompt(name = 'support triage', text = 'You should always be polite.') {
  const response = await create(
    req(`${ORIGIN}/api/prompts`, { ...json({ name, text }), headers: { 'content-type': 'application/json', cookie: alice.cookie } }),
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).prompt;
}

/** Route handlers take params as a promise in this Next version. */
const params = (id) => ({ params: Promise.resolve({ id }) });

// ---------------------------------------------------------------------------

describe('the library refuses anyone it cannot identify', () => {
  it('answers 401 to a visitor, on every route', async () => {
    const prompt = await savePrompt();

    const responses = [
      await list(req(`${ORIGIN}/api/prompts`)),
      await create(req(`${ORIGIN}/api/prompts`, json({ name: 'x', text: 'y' }))),
      await one.GET(req(`${ORIGIN}/api/prompts/${prompt.id}`), params(prompt.id)),
      await one.POST(req(`${ORIGIN}/api/prompts/${prompt.id}`, json({ text: 'z' })), params(prompt.id)),
      await one.PATCH(req(`${ORIGIN}/api/prompts/${prompt.id}`, json({ name: 'z' })), params(prompt.id)),
      await one.DELETE(req(`${ORIGIN}/api/prompts/${prompt.id}`, { method: 'DELETE' }), params(prompt.id)),
    ];

    for (const response of responses) assert.equal(response.status, 401);
  });

  it('answers 503 when the deployment has no accounts at all', async () => {
    delete process.env.TRAZUM_GITHUB_CLIENT_ID;
    const response = await list(req(`${ORIGIN}/api/prompts`));
    assert.equal(response.status, 503);
  });

  it('refuses a cross-origin write and allows a cross-origin read', async () => {
    // A cross-origin GET cannot read the response without CORS headers this app
    // never sends. Refusing it would break scripts and stop nothing.
    const read = await list(
      req(`${ORIGIN}/api/prompts`, { headers: { cookie: alice.cookie, origin: 'https://evil.example' } }),
    );
    assert.equal(read.status, 200);

    const write = await create(
      req(`${ORIGIN}/api/prompts`, {
        ...json({ name: 'x', text: 'y' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie, origin: 'https://evil.example' },
      }),
    );
    assert.equal(write.status, 403);
  });
});

// ---------------------------------------------------------------------------

describe('one account cannot reach another account’s prompts', () => {
  it('does not list them', async () => {
    await savePrompt();
    const response = await list(req(`${ORIGIN}/api/prompts`, { headers: { cookie: mallory.cookie } }));
    assert.deepEqual((await response.json()).prompts, []);
  });

  it('answers 404, not 403, for a prompt that exists and is not theirs', async () => {
    const prompt = await savePrompt();

    const theirs = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    assert.equal(theirs.status, 200);

    const stranger = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: mallory.cookie } }),
      params(prompt.id),
    );
    const absent = await one.GET(
      req(`${ORIGIN}/api/prompts/11111111-1111-4111-8111-111111111111`, {
        headers: { cookie: mallory.cookie },
      }),
      params('11111111-1111-4111-8111-111111111111'),
    );

    assert.equal(stranger.status, 404);
    assert.equal(absent.status, 404);
    // Byte-identical, so the status and the body are both useless as an oracle.
    assert.deepEqual(await stranger.json(), await absent.json());
  });

  it('cannot write a version into it', async () => {
    const prompt = await savePrompt();

    const response = await one.POST(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ text: 'Mallory was here.' }),
        headers: { 'content-type': 'application/json', cookie: mallory.cookie },
      }),
      params(prompt.id),
    );
    assert.equal(response.status, 404);

    // And the history is untouched, which the status code alone does not prove.
    const after = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    const body = await after.json();
    assert.equal(body.prompt.versions.length, 1);
    assert.ok(!JSON.stringify(body).includes('Mallory was here'));
  });

  it('cannot rename it or delete it', async () => {
    const prompt = await savePrompt();

    const renamed = await one.PATCH(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ name: 'mine now' }),
        headers: { 'content-type': 'application/json', cookie: mallory.cookie },
      }),
      params(prompt.id),
    );
    assert.equal(renamed.status, 404);

    const deleted = await one.DELETE(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        method: 'DELETE',
        headers: { cookie: mallory.cookie },
      }),
      params(prompt.id),
    );
    assert.equal(deleted.status, 404);

    const survivor = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    assert.equal(survivor.status, 200);
    assert.equal((await survivor.json()).prompt.name, 'support triage');
  });

  it('lets two accounts use the same name without colliding', async () => {
    await savePrompt('support triage');
    const response = await create(
      req(`${ORIGIN}/api/prompts`, {
        ...json({ name: 'support triage', text: 'Different prompt, same name.' }),
        headers: { 'content-type': 'application/json', cookie: mallory.cookie },
      }),
    );
    assert.equal(response.status, 201);
  });
});

// ---------------------------------------------------------------------------

describe('history is append-only and says what moved', () => {
  it('starts at version 1 and counts up', async () => {
    const prompt = await savePrompt();

    for (const text of ['second draft', 'third draft']) {
      const response = await one.POST(
        req(`${ORIGIN}/api/prompts/${prompt.id}`, {
          ...json({ text, note: `now ${text}` }),
          headers: { 'content-type': 'application/json', cookie: alice.cookie },
        }),
        params(prompt.id),
      );
      assert.equal(response.status, 201);
      assert.equal((await response.json()).saved, true);
    }

    const response = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    const { versions } = (await response.json()).prompt;

    assert.deepEqual(versions.map((v) => v.version), [3, 2, 1], 'newest first');
    assert.equal(versions[0].text, 'third draft');
    assert.equal(versions[2].text, 'You should always be polite.', 'version 1 is unchanged');
    assert.equal(versions[0].note, 'now third draft');
    assert.equal(versions[2].note, null);
  });

  it('does not record a save that changed nothing', async () => {
    const prompt = await savePrompt();

    const response = await one.POST(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ text: 'You should always be polite.' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(prompt.id),
    );

    // 200 with saved:false, not an error: pressing Save on unedited text is a
    // reasonable thing to do, and it must not put two identical rows in a
    // history whose only job is showing what moved.
    assert.equal(response.status, 200);
    assert.equal((await response.json()).saved, false);

    const after = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    assert.equal((await after.json()).prompt.versions.length, 1);
  });

  it('treats a whitespace-only edit as a real change', async () => {
    // Trailing whitespace is part of a prompt: prompt caching is a byte-for-byte
    // prefix match, so a change nobody can see is still a change that costs money.
    const prompt = await savePrompt();

    const response = await one.POST(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ text: 'You should always be polite.\n' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(prompt.id),
    );
    assert.equal((await response.json()).saved, true);
  });

  it('prices every version with today’s estimator, not the day it was saved', async () => {
    const prompt = await savePrompt('sizes', 'one two three four five six seven eight');
    await one.POST(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ text: 'short' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(prompt.id),
    );

    const response = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    const { versions } = (await response.json()).prompt;

    // Both counts are numbers produced by the same function on the same day, so
    // the comparison between them means something.
    assert.ok(versions[0].tokens > 0);
    assert.ok(versions[1].tokens > versions[0].tokens, 'the shorter version is cheaper');
  });

  it('deleting a prompt takes its history with it', async () => {
    const prompt = await savePrompt();
    const deleted = await one.DELETE(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { method: 'DELETE', headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    assert.equal(deleted.status, 204);

    const gone = await one.GET(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
      params(prompt.id),
    );
    assert.equal(gone.status, 404);

    const store = await getStore();
    assert.deepEqual(await store.prompts.listPrompts(alice.user.id), []);
  });
});

// ---------------------------------------------------------------------------

describe('what the library refuses to store', () => {
  it('rejects a missing or blank name and text', async () => {
    for (const body of [
      { text: 'x' },
      { name: '   ', text: 'x' },
      { name: 'x' },
      { name: 'x', text: '   ' },
      { name: 5, text: 'x' },
      { name: 'x', text: 5 },
    ]) {
      const response = await create(
        req(`${ORIGIN}/api/prompts`, {
          ...json(body),
          headers: { 'content-type': 'application/json', cookie: alice.cookie },
        }),
      );
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });

  it('rejects text, a name and a note past their limits', async () => {
    const cases = [
      { name: 'a'.repeat(limits.MAX_PROMPT_NAME_CHARS + 1), text: 'x' },
      { name: 'ok', text: 'a'.repeat(limits.MAX_PROMPT_TEXT_CHARS + 1) },
      { name: 'ok', text: 'x', note: 'a'.repeat(limits.MAX_NOTE_CHARS + 1) },
    ];
    for (const body of cases) {
      const response = await create(
        req(`${ORIGIN}/api/prompts`, {
          ...json(body),
          headers: { 'content-type': 'application/json', cookie: alice.cookie },
        }),
      );
      assert.equal(response.status, 400);
    }
  });

  it('refuses the two hundred and first prompt rather than evicting the first', async () => {
    const store = await getStore();
    for (let i = 0; i < limits.MAX_PROMPTS_PER_OWNER; i++) {
      await store.prompts.createPrompt({
        ownerId: alice.user.id,
        name: `prompt ${i}`,
        text: 'x',
        note: null,
        now: new Date(),
      });
    }

    const response = await create(
      req(`${ORIGIN}/api/prompts`, {
        ...json({ name: 'one too many', text: 'x' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
    );
    assert.equal(response.status, 409);

    // Nothing was evicted to make room.
    const remaining = await store.prompts.listPrompts(alice.user.id);
    assert.equal(remaining.length, limits.MAX_PROMPTS_PER_OWNER);
    assert.ok(remaining.some((p) => p.name === 'prompt 0'));
  });

  it('refuses a duplicate name from the same account', async () => {
    await savePrompt('support triage');
    const response = await create(
      req(`${ORIGIN}/api/prompts`, {
        ...json({ name: 'support triage', text: 'different text' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
    );
    assert.equal(response.status, 409);
  });

  it('refuses a rename onto a name the account already uses', async () => {
    await savePrompt('first');
    const second = await savePrompt('second', 'other text');

    const response = await one.PATCH(
      req(`${ORIGIN}/api/prompts/${second.id}`, {
        ...json({ name: 'first' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(second.id),
    );
    assert.equal(response.status, 409);

    // 409 and not 404: the prompt is theirs and exists, so the honest answer
    // names the actual problem.
    const unchanged = await one.GET(
      req(`${ORIGIN}/api/prompts/${second.id}`, { headers: { cookie: alice.cookie } }),
      params(second.id),
    );
    assert.equal((await unchanged.json()).prompt.name, 'second');
  });

  it('renames when the new name is free', async () => {
    const prompt = await savePrompt('first');
    const response = await one.PATCH(
      req(`${ORIGIN}/api/prompts/${prompt.id}`, {
        ...json({ name: 'renamed' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(prompt.id),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).prompt.name, 'renamed');
  });

  it('treats an id that is not a UUID as a prompt that does not exist', async () => {
    for (const id of ['../../etc/passwd', 'null', "' or 1=1 --", '']) {
      const response = await one.GET(
        req(`${ORIGIN}/api/prompts/x`, { headers: { cookie: alice.cookie } }),
        params(id),
      );
      assert.equal(response.status, 404, id);
    }
  });

  it('refuses a malformed id before it becomes a bound parameter', async () => {
    /**
     * The status assertion above passes with the UUID check removed, because the
     * memory driver answers `null` for any key it does not hold — so the outcome
     * is 404 either way and the guard looks decorative. It is not: bind
     * `'../../etc/passwd'` to a `uuid` column and Postgres raises, which is a 500
     * where the caller should have had a 404.
     *
     * Found by mutation. What distinguishes the two is not the answer but
     * whether the store was asked at all, so that is what this watches.
     */
    // Saved before the spy is installed: `POST /api/prompts` re-reads the prompt
    // it just created, so creating one while watching would record an id this
    // test never asked for.
    const prompt = await savePrompt();

    const store = await getStore();
    const real = store.prompts.getPrompt.bind(store.prompts);
    const asked = [];
    store.prompts.getPrompt = async (id, ownerId) => {
      asked.push(id);
      return real(id, ownerId);
    };

    try {
      await one.GET(
        req(`${ORIGIN}/api/prompts/x`, { headers: { cookie: alice.cookie } }),
        params('../../etc/passwd'),
      );
      assert.deepEqual(asked, [], 'the store was asked about a value that is not an id');

      await one.GET(
        req(`${ORIGIN}/api/prompts/${prompt.id}`, { headers: { cookie: alice.cookie } }),
        params(prompt.id),
      );
      assert.deepEqual(asked, [prompt.id], 'and a real id still gets through');
    } finally {
      store.prompts.getPrompt = real;
    }
  });

  it('rejects a body that is not JSON', async () => {
    const response = await create(
      req(`${ORIGIN}/api/prompts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
        body: '{not json',
      }),
    );
    assert.equal(response.status, 400);
  });
});

// ---------------------------------------------------------------------------

describe('the list is a list, not the whole library', () => {
  it('sends a preview rather than every prompt in full', async () => {
    const long = 'word '.repeat(400);
    await savePrompt('long one', long);

    const response = await list(req(`${ORIGIN}/api/prompts`, { headers: { cookie: alice.cookie } }));
    const [summary] = (await response.json()).prompts;

    assert.ok(summary.preview.length <= 240);
    assert.ok(summary.preview.length < long.length);
    assert.equal(summary.versionCount, 1);
    assert.ok(summary.tokens > 0, 'the count is of the whole prompt, not the preview');
  });

  it('puts the most recently changed prompt first', async () => {
    const first = await savePrompt('first');
    await savePrompt('second', 'other');

    await one.POST(
      req(`${ORIGIN}/api/prompts/${first.id}`, {
        ...json({ text: 'first, edited' }),
        headers: { 'content-type': 'application/json', cookie: alice.cookie },
      }),
      params(first.id),
    );

    const response = await list(req(`${ORIGIN}/api/prompts`, { headers: { cookie: alice.cookie } }));
    assert.equal((await response.json()).prompts[0].name, 'first');
  });

  it('is never cacheable', async () => {
    const response = await list(req(`${ORIGIN}/api/prompts`, { headers: { cookie: alice.cookie } }));
    assert.match(response.headers.get('cache-control'), /no-store/);
  });
});

// ---------------------------------------------------------------------------

describe('the store makes leaking existence unrepresentable', () => {
  const source = readFileSync(new URL('../lib/store/prompts.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export interface PromptStore'));

  it('gives no method a way to name a prompt without naming an owner', () => {
    /**
     * The property behind the 404s above, pinned where it actually lives.
     *
     * Trying to mutate the route into answering 403 for somebody else's prompt
     * does not compile into anything meaningful: to tell "not yours" from "not
     * there" the handler would need a lookup that takes an id and no owner, and
     * `PromptStore` does not have one. That makes the mistake unrepresentable
     * rather than merely untested — which is worth a guard of its own, because
     * the way it comes back is somebody adding a convenience method here.
     */
    const methods = [...body.matchAll(/^  (\w+)\(([\s\S]*?)\): Promise/gm)];
    assert.ok(methods.length >= 6, 'PromptStore could not be parsed — has it moved?');

    const leaky = methods
      .filter(([, name]) => name !== 'listPrompts' && name !== 'createPrompt')
      .filter(([, , args]) => !/ownerId/.test(args))
      .map(([, name]) => name);

    assert.deepEqual(leaky, [], 'a store method can reach a prompt without an owner');
  });

  it('and no method returns a prompt the caller did not prove it owns', () => {
    // `listPrompts` and `createPrompt` are exempt above because neither takes an
    // id — but both still take the owner, and a version of either that did not
    // would be the same hole by another route.
    for (const name of ['listPrompts', 'createPrompt']) {
      const signature = body.slice(body.indexOf(`  ${name}(`));
      assert.match(signature.slice(0, signature.indexOf('Promise')), /ownerId/);
    }
  });
});

describe('the schema matches the driver', () => {
  const source = readFileSync(new URL('../db/002_prompts.sql', import.meta.url), 'utf8');
  const schema = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  it('declares every column the Postgres driver reads or writes', () => {
    for (const column of ['owner_id', 'prompt_id', 'author_id', 'updated_at', 'note', 'version']) {
      assert.ok(schema.includes(column), `missing ${column}`);
    }
  });

  it('scopes name uniqueness to the owner', () => {
    assert.ok(schema.includes('unique (owner_id, name)'));
  });

  it('numbers versions within a prompt, not globally', () => {
    assert.ok(schema.includes('unique (prompt_id, version)'));
  });

  it('cascades versions when a prompt or a user goes', () => {
    const cascades = schema.split('on delete cascade').length - 1;
    assert.equal(cascades, 2, 'both prompts->users and versions->prompts cascade');
  });

  it('stores no token count, so the history stays comparable', () => {
    assert.ok(!schema.includes('tokens'));
  });

  it('enables row level security without forcing it', () => {
    assert.ok(schema.includes('alter table trazum_prompts enable row level security'));
    assert.ok(schema.includes('alter table trazum_prompt_versions enable row level security'));
    assert.ok(!schema.includes('force row level security'));
  });

  it('can be applied twice', () => {
    for (const statement of source.split(';').filter((s) => /create (table|index)/i.test(s))) {
      assert.match(statement, /if not exists/i);
    }
  });
});
