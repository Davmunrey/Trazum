import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * `DELETE /api/account`, and the cascade underneath it.
 *
 * Two things are being proved here and they are not the same thing. One is that
 * the route refuses everything it should refuse, which is ordinary. The other is
 * that when it does delete, **everything goes** — sessions, prompts, every
 * version of each, and every published `/c/<token>` link. Postgres gets that
 * from four `on delete cascade` clauses and the memory driver has to write it
 * out, so the interesting failure is a driver that deletes the account row and
 * leaves somebody's prompt text sitting in a map with nothing pointing at it.
 *
 * Nothing about that failure is visible from the outside: the account is gone,
 * the UI says so, and the rows stay. That is exactly the shape of bug a test
 * has to go looking for rather than stumble into.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let deleteAccount;
let signIn;
let callback;
let getStore;
let resetStore;
let hashToken;

const saved = {};
const realFetch = globalThis.fetch;

let clientCounter = 0;
const freshClient = () => {
  clientCounter += 1;
  return { 'x-forwarded-for': `203.0.113.${clientCounter % 250}` };
};

const identityOf = (n) => ({
  id: 900000 + n,
  login: `person-${n}`,
  name: `Person ${n}`,
  avatar_url: `https://avatars.example/${n}.png`,
});

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  ({ DELETE: deleteAccount } = await import('../app/api/account/route.ts'));
  ({ GET: signIn } = await import('../app/api/auth/github/route.ts'));
  ({ GET: callback } = await import('../app/api/auth/github/callback/route.ts'));
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
  ({ hashToken } = await import('../lib/auth/session.ts'));
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  Object.assign(process.env, ENV);
  resetStore();
});

/** A signed-in browser for the person `n`, through the real sign-in flow. */
async function signInAs(n) {
  const identity = identityOf(n);
  globalThis.fetch = async (url) => {
    if (String(url).includes('access_token')) return Response.json({ access_token: 'gho_x' });
    return Response.json(identity);
  };

  const started = await signIn(
    new Request(`${ORIGIN}/api/auth/github`, { headers: freshClient() }),
  );
  const stateCookie = started.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_oauth='));
  const packed = stateCookie.slice(stateCookie.indexOf('=') + 1, stateCookie.indexOf(';'));
  const nonce = packed.slice(0, packed.indexOf('.'));

  const finished = await callback(
    new Request(`${ORIGIN}/api/auth/github/callback?code=abc&state=${nonce}`, {
      headers: { ...freshClient(), cookie: `__Host-trazum_oauth=${packed}` },
    }),
  );

  const sessionCookie = finished.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_session='));
  const token = sessionCookie.slice(sessionCookie.indexOf('=') + 1, sessionCookie.indexOf(';'));

  const store = await getStore();
  const { user } = await store.findSession(hashToken(token), new Date());
  return { user, token, cookie: `__Host-trazum_session=${token}`, login: identity.login };
}

/** A prompt with two versions, and a published share. Everything an account holds. */
async function fillLibrary(store, user) {
  const prompt = await store.prompts.createPrompt({
    ownerId: user.id,
    name: 'A prompt',
    text: 'the first text',
    note: null,
    now: new Date(),
  });
  await store.prompts.addVersion({
    promptId: prompt.id,
    ownerId: user.id,
    authorId: user.id,
    text: 'the second text',
    note: null,
    now: new Date(),
  });

  const share = await store.shares.createShare({
    token: `tok-${user.id}`,
    ownerId: user.id,
    ownerLogin: user.login,
    beforeText: 'before',
    afterText: 'after',
    settings: {},
    now: new Date(),
    // Already expired, and deliberately: `listShares` filters these out, so a
    // purge written against that method would leave this row and its prompt
    // text behind with nothing to show it was there.
    expiresAt: new Date(Date.now() - 60_000),
  });

  return { prompt, share };
}

const ask = (cookie, body) =>
  deleteAccount(
    new Request(`${ORIGIN}/api/account`, {
      method: 'DELETE',
      headers: { ...freshClient(), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

describe('the memory driver purges what a foreign key would', () => {
  it('takes the versions with the prompt, which no route could ever show', async () => {
    /**
     * Tested against the factory rather than through the `Store`, and that is
     * the point rather than a shortcut.
     *
     * Versions live in their own map keyed by prompt id, and every route
     * reaches one through its prompt. Delete the prompt row and forget the
     * versions and the rows are unreachable, invisible, and still holding the
     * deleted person's prompt text. That omission was planted while this suite
     * was being written and **all seven tests through the route stayed green**,
     * because there is no public call that can see it. So it is asserted here,
     * at the level where the bug lives.
     */
    const { promptTablesInMemory } = await import('../lib/store/prompts-memory.ts');
    const tables = promptTablesInMemory();
    const now = new Date();

    const prompt = await tables.prompts.createPrompt({
      ownerId: 'owner-1', name: 'A prompt', text: 'one', note: null, now,
    });
    for (const text of ['two', 'three']) {
      await tables.prompts.addVersion({
        promptId: prompt.id, ownerId: 'owner-1', authorId: 'owner-1', text, note: null, now,
      });
    }

    // Somebody else's prompt, to prove the purge is scoped and not a reset.
    await tables.prompts.createPrompt({
      ownerId: 'owner-2', name: 'Theirs', text: 'theirs', note: null, now,
    });

    const gone = await tables.purgeOwner('owner-1');
    assert.equal(gone.prompts, 1, 'the prompt was not purged');
    assert.equal(gone.versions, 3, 'the versions were left behind, unreachable and undeleted');

    assert.equal((await tables.prompts.listPrompts('owner-1')).length, 0);
    assert.equal((await tables.prompts.listPrompts('owner-2')).length, 1, 'the purge crossed owners');

    // Purging again finds nothing, so the counts above are rows that existed
    // rather than a number the function makes up.
    assert.deepEqual(await tables.purgeOwner('owner-1'), { prompts: 0, versions: 0 });
  });
});

describe('DELETE /api/account', () => {
  it('takes the account and everything in it, expired shares included', async () => {
    const store = await getStore();
    const me = await signInAs(1);
    const { prompt } = await fillLibrary(store, me.user);

    assert.equal((await store.prompts.listPrompts(me.user.id)).length, 1, 'the library never filled');

    const response = await ask(me.cookie, { confirm: me.login });
    assert.equal(response.status, 204);
    // No count of what went. A number here would be the one place this app told
    // somebody how much of their data it held, at the moment they lost the
    // ability to check.
    assert.equal(await response.text(), '');

    assert.equal(await store.findSession(hashToken(me.token), new Date()), null, 'the session survived');
    assert.equal(await store.prompts.getPrompt(prompt.id, me.user.id), null, 'the prompt survived');
    assert.equal((await store.prompts.listPrompts(me.user.id)).length, 0, 'the library survived');
    assert.equal(
      await store.shares.findShare(`tok-${me.user.id}`, new Date(0)),
      null,
      'a published share survived the deletion of the account that made it',
    );
  });

  it('clears the cookie, so the browser does not look signed in to a row that is gone', async () => {
    const me = await signInAs(2);
    const response = await ask(me.cookie, { confirm: me.login });

    const cleared = response.headers.getSetCookie();
    assert.ok(
      cleared.some((c) => c.startsWith('__Host-trazum_session=') && /Max-Age=0/i.test(c)),
      'the session cookie was left in place',
    );
  });

  it('deletes only the account that asked', async () => {
    const store = await getStore();
    const me = await signInAs(3);
    const them = await signInAs(4);
    await fillLibrary(store, them.user);

    await ask(me.cookie, { confirm: me.login });

    assert.ok(await store.findSession(hashToken(them.token), new Date()), 'another account lost its session');
    assert.equal((await store.prompts.listPrompts(them.user.id)).length, 1, 'another account lost its library');
  });

  it('refuses a confirmation that is not exactly the login', async () => {
    const store = await getStore();
    const me = await signInAs(5);

    for (const confirm of [undefined, '', 'PERSON-5', `${me.login} `, 'yes', 'delete', 42, null]) {
      const response = await ask(me.cookie, confirm === undefined ? undefined : { confirm });
      assert.equal(response.status, 400, `"${String(confirm)}" was accepted as a confirmation`);
      assert.ok(
        await store.findSession(hashToken(me.token), new Date()),
        `"${String(confirm)}" deleted the account`,
      );
    }

    // And the right one still works, so the refusals above are the check doing
    // its job rather than the route being broken.
    assert.equal((await ask(me.cookie, { confirm: me.login })).status, 204);
  });

  it('refuses a caller with no session, and one from another origin', async () => {
    const anonymous = await ask(null, { confirm: 'person-6' });
    assert.equal(anonymous.status, 401);

    const me = await signInAs(6);
    const crossOrigin = await deleteAccount(
      new Request(`${ORIGIN}/api/account`, {
        method: 'DELETE',
        headers: { ...freshClient(), cookie: me.cookie, origin: 'https://evil.example' },
        body: JSON.stringify({ confirm: me.login }),
      }),
    );
    assert.equal(crossOrigin.status, 403);

    const store = await getStore();
    assert.ok(await store.findSession(hashToken(me.token), new Date()), 'a cross-origin request deleted an account');
  });

  it('never lets a caller name whose account to delete', async () => {
    /**
     * The authorisation is an absence: the user comes from the caller's own
     * cookie and there is no parameter for a target. The test tries to supply
     * one anyway, in every spelling a future handler might plausibly read,
     * because a route that grew one would pass a test that merely checked the
     * happy path.
     */
    const store = await getStore();
    const me = await signInAs(7);
    const them = await signInAs(8);

    for (const body of [
      { confirm: me.login, userId: them.user.id },
      { confirm: me.login, user: them.user.id },
      { confirm: me.login, login: them.login },
      { confirm: them.login },
    ]) {
      const response = await deleteAccount(
        new Request(`${ORIGIN}/api/account?user=${encodeURIComponent(them.user.id)}`, {
          method: 'DELETE',
          headers: { ...freshClient(), cookie: me.cookie },
          body: JSON.stringify(body),
        }),
      );
      // Either it deleted the caller (204) or it refused (400 for the last
      // one, whose confirmation is somebody else's login). Never the target.
      assert.ok([204, 400].includes(response.status), `unexpected ${response.status}`);
      assert.ok(
        await store.findSession(hashToken(them.token), new Date()),
        `a caller deleted another account with ${JSON.stringify(body)}`,
      );
      if (response.status === 204) break;
    }
  });

  it('answers 503 rather than deleting anything when sign-in is not configured', async () => {
    const me = await signInAs(9);
    delete process.env.TRAZUM_GITHUB_CLIENT_ID;

    const response = await ask(me.cookie, { confirm: me.login });
    assert.equal(response.status, 503);
  });
});
