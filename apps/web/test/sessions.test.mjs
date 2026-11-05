import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * Seeing and ending your own sessions (OWASP ASVS 4.0.3 3.3.4).
 *
 * The account menu lists every live session an account has and ends any one
 * of them. Ending another session, or all of them, needs a sign-in in the last
 * fifteen minutes, which is GitHub's credentials entered again; a stolen
 * cookie is older than that and cannot make itself younger.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
  TRAZUM_OPEN_SIGNUP: '1',
};
const MINUTE = 60_000;

let mod;
const saved = {};
const realFetch = globalThis.fetch;
let lines = [];
let restore;
let address = 0;

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);
  mod = {
    sessions: await import('../app/api/auth/sessions/route.ts'),
    signOut: (await import('../app/api/auth/signout/route.ts')).POST,
    signIn: (await import('../app/api/auth/github/route.ts')).GET,
    callback: (await import('../app/api/auth/github/callback/route.ts')).GET,
    store: await import('../lib/store/index.ts'),
    session: await import('../lib/auth/session.ts'),
    log: await import('../lib/security-log.ts'),
  };
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = realFetch;
  restore?.();
});

beforeEach(() => {
  Object.assign(process.env, ENV);
  mod.store.resetStore();
  lines = [];
  restore?.();
  restore = mod.log.captureSecurityLog((line) => lines.push(line));
});

// A fresh address each request, so no limiter is what a test ends up measuring.
const headers = (extra = {}) => ({ 'x-forwarded-for': `198.51.100.${(address += 1) % 250}`, ...extra });
const cookieOf = (token) => `__Host-trazum_session=${token}`;

/** Signs in through the real callback, with GitHub stubbed. */
async function signIn(login = 'someone', previous = null) {
  globalThis.fetch = async (url) => {
    if (String(url).includes('access_token')) return Response.json({ access_token: 'gho_x' });
    return Response.json({ id: login === 'someone' ? 4242 : 5353, login, name: null, avatar_url: null });
  };
  const started = await mod.signIn(new Request(`${ORIGIN}/api/auth/github`, { headers: headers() }));
  const stateCookie = started.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_oauth='));
  const packed = stateCookie.slice(stateCookie.indexOf('=') + 1, stateCookie.indexOf(';'));
  const nonce = packed.slice(0, packed.indexOf('.'));
  const cookies = [`__Host-trazum_oauth=${packed}`, ...(previous ? [cookieOf(previous)] : [])].join('; ');
  const finished = await mod.callback(
    new Request(`${ORIGIN}/api/auth/github/callback?code=c&state=${nonce}`, { headers: headers({ cookie: cookies }) }),
  );
  const set = finished.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_session='));
  const token = set.slice(set.indexOf('=') + 1, set.indexOf(';'));
  const store = await mod.store.getStore();
  const { user } = await store.findSession(mod.session.hashToken(token), new Date());
  return { user, token };
}

/** A session for `userId` that started `minutesAgo` minutes ago, still alive. */
async function olderSession(userId, minutesAgo) {
  const issued = mod.session.issueSession(userId, new Date(Date.now() - minutesAgo * MINUTE), true);
  const store = await mod.store.getStore();
  await store.createSession(issued.record);
  return issued.token;
}

const list = async (token) =>
  mod.sessions.GET(new Request(`${ORIGIN}/api/auth/sessions`, { headers: headers({ cookie: cookieOf(token) }) }));
const end = (token, body, extra = {}) =>
  mod.sessions.DELETE(
    new Request(`${ORIGIN}/api/auth/sessions`, {
      method: 'DELETE',
      headers: headers({ cookie: cookieOf(token), 'content-type': 'application/json', origin: ORIGIN, ...extra }),
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const alive = async (token) => {
  const store = await mod.store.getStore();
  return Boolean(await store.findSession(mod.session.hashToken(token), new Date()));
};
const events = () => lines.map((line) => JSON.parse(line)).map((l) => `${l.event}:${l.outcome}${l.reason ? `:${l.reason}` : ''}`);

describe('the list of your sessions', () => {
  it('holds every live session the account has, newest first, and marks this one', async () => {
    const me = await signIn();
    const laptop = await olderSession(me.user.id, 90);
    const phone = await olderSession(me.user.id, 30);
    const stranger = await signIn('stranger');

    const response = await list(me.token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.deepEqual(body.sessions.map((s) => s.current), [true, false, false]);
    assert.ok(Date.parse(body.sessions[1].startedAt) > Date.parse(body.sessions[2].startedAt), 'not newest first');
    assert.equal(body.sessions.length, 3, 'another account\'s session is listed');
    assert.ok(Date.parse(body.endOthersUntil) > Date.now(), 'a session just signed in cannot end the others');

    // Opaque: never the token, never the hash the table is keyed by.
    const text = JSON.stringify(body);
    for (const token of [me.token, laptop, phone, stranger.token]) {
      assert.ok(!text.includes(token), 'a token is in the list');
      assert.ok(!text.includes(mod.session.hashToken(token)), 'a token hash is in the list');
    }
    for (const session of body.sessions) {
      assert.match(session.id, /^[0-9a-f]{32}$/);
      // Nor any part of either: an id cut from the hash is the hash's prefix.
      for (const token of [me.token, laptop, phone, stranger.token]) {
        assert.ok(!token.includes(session.id) && !mod.session.hashToken(token).includes(session.id), 'an id is cut from a token or its hash');
      }
    }
    assert.deepEqual((await (await list(me.token)).json()).sessions.map((s) => s.id), body.sessions.map((s) => s.id), 'ids are not stable');
  });

  it('says when each was last used, within the window the table can say', async () => {
    const policy = { maxSeconds: 30 * 86400, idleSeconds: 86400 };
    const createdAt = new Date('2026-11-05T10:00:00Z');
    const now = new Date('2026-11-05T12:00:00Z');
    const lastUse = new Date('2026-11-05T11:30:00Z');
    const record = { tokenHash: 'x', userId: 'u', createdAt, expiresAt: new Date(lastUse.getTime() + 86400_000) };
    assert.equal(mod.session.lastActiveAt(record, policy, now).toISOString(), lastUse.toISOString());
    // Never before the sign-in, never after now.
    assert.equal(mod.session.lastActiveAt({ ...record, expiresAt: new Date(createdAt.getTime() + 1000) }, policy, now).toISOString(), createdAt.toISOString());
    assert.equal(mod.session.lastActiveAt({ ...record, expiresAt: new Date(now.getTime() + 2 * 86400_000) }, policy, now).toISOString(), now.toISOString());
  });

  it('counts a sign-in as recent for fifteen minutes and not a moment longer', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    const at = (ms) => ({ tokenHash: 'x', userId: 'u', createdAt: new Date(now.getTime() - ms), expiresAt: now });
    assert.equal(mod.session.signedInRecently(at(0), now), true);
    assert.equal(mod.session.signedInRecently(at(15 * MINUTE - 1), now), true);
    assert.equal(mod.session.signedInRecently(at(15 * MINUTE), now), false);
    assert.equal(mod.session.signedInRecently(at(-MINUTE), now), false, 'a session from the future is not recent');
  });

  it('is refused to somebody signed out', async () => {
    const response = await mod.sessions.GET(new Request(`${ORIGIN}/api/auth/sessions`, { headers: headers() }));
    assert.equal(response.status, 401);
    assert.deepEqual(events(), ['access.refused:failure:not_signed_in']);
  });
});

describe('ending one session', () => {
  it('ends another session after a recent sign-in, and only that one', async () => {
    const me = await signIn();
    const laptop = await olderSession(me.user.id, 90);
    const phone = await olderSession(me.user.id, 30);
    const { sessions } = await (await list(me.token)).json();
    const laptopId = sessions.find((s) => !s.current && Date.parse(s.startedAt) < Date.now() - 60 * MINUTE).id;
    lines = [];

    const ended = await end(me.token, { id: laptopId });
    assert.equal(ended.status, 204);
    assert.equal(ended.headers.getSetCookie().length, 0, 'ending another session signed this one out');
    assert.equal(await alive(laptop), false);
    assert.equal(await alive(phone), true);
    assert.equal(await alive(me.token), true);
    assert.deepEqual(events(), ['auth.sign_out:success']);
  });

  it('asks an older session to sign in again first, and ends nothing', async () => {
    const me = await signIn();
    const stale = await olderSession(me.user.id, 20);
    const { sessions, endOthersUntil } = await (await list(stale)).json();
    assert.equal(endOthersUntil, null);
    const other = sessions.find((s) => !s.current);
    lines = [];

    const refused = await end(stale, { id: other.id });
    assert.equal(refused.status, 403);
    assert.deepEqual(await refused.json(), { error: 'sign in again to end another session', reauth: true });
    assert.equal(await alive(me.token), true, 'a stale session ended another');
    assert.deepEqual(events(), ['auth.sign_out:failure:reauth_required']);

    // Its own session, though, it may end: that is only signing out.
    const own = sessions.find((s) => s.current);
    const signedOut = await end(stale, { id: own.id });
    assert.equal(signedOut.status, 204);
    assert.ok(signedOut.headers.getSetCookie().some((c) => c.startsWith('__Host-trazum_session=;')), 'the cookie was not cleared');
    assert.equal(await alive(stale), false);
  });

  it('cannot reach another account\'s session, whatever id it sends', async () => {
    const me = await signIn();
    const stranger = await signIn('stranger');
    const theirs = (await (await list(stranger.token)).json()).sessions[0].id;
    const response = await end(me.token, { id: theirs });
    assert.equal(response.status, 404);
    assert.equal(await alive(stranger.token), true);
  });

  it('refuses another origin, a body that is not JSON, and an id that is not one', async () => {
    const me = await signIn();
    const id = (await (await list(me.token)).json()).sessions[0].id;
    lines = [];
    assert.equal((await end(me.token, { id }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await end(me.token, JSON.stringify({ id }), { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await end(me.token, '{"id": ')).status, 400);
    assert.equal((await end(me.token, { id: 'not-a-session' })).status, 400);
    assert.equal(await alive(me.token), true);
    assert.deepEqual(events(), [
      'auth.sign_out:failure:cross_origin',
      'input.refused:failure:not_json',
      'input.refused:failure:invalid_json',
      'input.refused:failure:invalid_input',
    ]);
  });
});

describe('signing out everywhere', () => {
  const everywhere = (token) =>
    mod.signOut(
      new Request(`${ORIGIN}/api/auth/signout?all=1`, { method: 'POST', headers: headers({ cookie: cookieOf(token), origin: ORIGIN }) }),
    );

  it('asks an older session to sign in again first, and ends nothing', async () => {
    const me = await signIn();
    const stale = await olderSession(me.user.id, 60);
    const refused = await everywhere(stale);
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).reauth, true);
    assert.equal(await alive(me.token), true);
    assert.equal(await alive(stale), true);
    assert.ok(events().includes('auth.sign_out:failure:reauth_required'));
  });

  it('ends every session after a recent sign-in', async () => {
    const me = await signIn();
    const stale = await olderSession(me.user.id, 60);
    assert.equal((await everywhere(me.token)).status, 204);
    assert.equal(await alive(me.token), false);
    assert.equal(await alive(stale), false);
  });
});

describe('signing in again from the same browser', () => {
  it('replaces that browser\'s session instead of leaving it in the list', async () => {
    const me = await signIn();
    const again = await signIn('someone', me.token);
    assert.equal(await alive(me.token), false, 'the old session outlived the sign-in that replaced it');
    const { sessions, endOthersUntil } = await (await list(again.token)).json();
    assert.equal(sessions.length, 1);
    assert.ok(endOthersUntil, 'signing in again did not count as a recent sign-in');
  });
});
