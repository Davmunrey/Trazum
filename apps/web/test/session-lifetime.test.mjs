import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

/**
 * How long a sign-in lasts: a lifetime counted from the sign-in, and an idle
 * window counted from the last request, whichever runs out first.
 *
 * Until this file a session lasted thirty days from issue however long it sat
 * unused, which is what OWASP ASVS 4.0.3 V3.3.2 accepts at level 1 and nothing
 * more. The questions that decide whether the idle window is real rather than
 * decorative:
 *
 * - Does a session in use outlive its first idle window, and one left alone
 *   end at the next one?
 * - Does use ever carry a session past its lifetime?
 * - Is every request a write? (It must not be.)
 * - Does a session written before the window existed get a free pass? (It
 *   must not: nobody knows how long it sat unused.)
 * - Does a configuration typo silently run on the defaults? (It must not.)
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
  TRAZUM_OPEN_SIGNUP: '1',
};
const POLICY_VARS = ['TRAZUM_SESSION_MAX_HOURS', 'TRAZUM_SESSION_IDLE_MINUTES'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = new Date('2026-11-05T09:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);

let auth;
let session;
let memoryStore;
let signIn;
let callback;
let sessionRoute;
let getStore;
let resetStore;

const saved = {};
const realFetch = globalThis.fetch;

before(async () => {
  for (const key of [...Object.keys(ENV), ...POLICY_VARS]) saved[key] = process.env[key];
  auth = await import('../lib/auth/config.ts');
  session = await import('../lib/auth/session.ts');
  ({ memoryStore } = await import('../lib/store/memory.ts'));
  ({ GET: signIn } = await import('../app/api/auth/github/route.ts'));
  ({ GET: callback } = await import('../app/api/auth/github/callback/route.ts'));
  ({ GET: sessionRoute } = await import('../app/api/auth/session/route.ts'));
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
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
  for (const key of POLICY_VARS) delete process.env[key];
  resetStore();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const DEFAULTS = { maxSeconds: 30 * 24 * 3600, idleSeconds: 24 * 3600 };
const LEVEL_2 = { maxSeconds: 12 * 3600, idleSeconds: 30 * 60 };

// ---------------------------------------------------------------------------

describe('the session policy, read from the environment', () => {
  const policy = (env) => auth.sessionPolicy(env);

  it('is thirty days of lifetime and one day idle when nothing is set', () => {
    assert.deepEqual(policy({}), DEFAULTS);
    assert.deepEqual(auth.authConfig({ ...ENV }).session, DEFAULTS);
  });

  it('takes ASVS level 2 numbers as given', () => {
    assert.deepEqual(policy({ TRAZUM_SESSION_MAX_HOURS: '12', TRAZUM_SESSION_IDLE_MINUTES: '30' }), LEVEL_2);
  });

  it('shortens the default idle window to fit a short lifetime, rather than refusing it', () => {
    assert.deepEqual(policy({ TRAZUM_SESSION_MAX_HOURS: '12' }), { maxSeconds: 12 * 3600, idleSeconds: 12 * 3600 });
  });

  it('accepts the edges of each range', () => {
    assert.equal(policy({ TRAZUM_SESSION_MAX_HOURS: '720' }).maxSeconds, 720 * 3600);
    assert.equal(policy({ TRAZUM_SESSION_MAX_HOURS: '1' }).maxSeconds, 3600);
    assert.equal(policy({ TRAZUM_SESSION_IDLE_MINUTES: '5' }).idleSeconds, 300);
    assert.equal(policy({ TRAZUM_SESSION_MAX_HOURS: '1', TRAZUM_SESSION_IDLE_MINUTES: '60' }).idleSeconds, 3600);
  });

  it('turns sign-in off for a value it cannot honour, naming the variable and never echoing the value', () => {
    const refused = [
      ['TRAZUM_SESSION_MAX_HOURS', 'twelve-ish'],
      ['TRAZUM_SESSION_MAX_HOURS', '0'],
      ['TRAZUM_SESSION_MAX_HOURS', '721'],
      ['TRAZUM_SESSION_MAX_HOURS', '1.5'],
      ['TRAZUM_SESSION_MAX_HOURS', '-12'],
      ['TRAZUM_SESSION_IDLE_MINUTES', 'thirty-ish'],
      ['TRAZUM_SESSION_IDLE_MINUTES', '4'],
      ['TRAZUM_SESSION_IDLE_MINUTES', '1e3'],
    ];
    for (const [name, value] of refused) {
      const config = auth.authConfig({ ...ENV, [name]: value });
      assert.equal(config.enabled, false, `${name}=${value} was accepted`);
      assert.match(config.reason, new RegExp(name));
    }
    // The reason is served to anybody by /api/auth/session. Checked with values
    // no range in the message could contain by accident.
    for (const name of POLICY_VARS) {
      const reason = auth.authConfig({ ...ENV, [name]: 'operator-typed-this' }).reason;
      assert.ok(!reason.includes('operator-typed-this'), `${name}: the reason repeats the configured value`);
    }
  });

  it('refuses an idle window longer than the lifetime it sits inside', () => {
    const config = auth.authConfig({ ...ENV, TRAZUM_SESSION_MAX_HOURS: '1', TRAZUM_SESSION_IDLE_MINUTES: '61' });
    assert.equal(config.enabled, false);
    assert.match(config.reason, /TRAZUM_SESSION_IDLE_MINUTES/);
  });
});

// ---------------------------------------------------------------------------

describe('renewal: what one request does to the session it found', () => {
  const row = (createdAt, expiresAt) => ({ tokenHash: 'h', userId: 'u', createdAt, expiresAt });

  it('keeps a session whose end is less than one refresh step behind', () => {
    const verdict = session.renewal(row(T0, at(DAY)), at(4 * MINUTE), DEFAULTS);
    assert.deepEqual(verdict, { kind: 'keep' });
  });

  it('moves the end one idle window on once it has fallen a step behind', () => {
    const verdict = session.renewal(row(T0, at(DAY)), at(5 * MINUTE), DEFAULTS);
    assert.equal(verdict.kind, 'refresh');
    assert.equal(verdict.expiresAt.getTime(), at(5 * MINUTE + DAY).getTime());
  });

  it('never moves it past the lifetime', () => {
    const verdict = session.renewal(row(T0, at(29 * DAY + 12 * HOUR)), at(29 * DAY + 13 * HOUR), DEFAULTS);
    assert.equal(verdict.kind, 'refresh');
    assert.equal(verdict.expiresAt.getTime(), at(30 * DAY).getTime());
  });

  it('ends a session whose lifetime is over, however recently it was used', () => {
    assert.deepEqual(session.renewal(row(T0, at(30 * DAY + HOUR)), at(30 * DAY), DEFAULTS), { kind: 'end' });
  });

  it('ends a session whose end lies further out than one idle window: its idle time is unknown', () => {
    // The shape of every row written before idle timeouts: thirty days from issue.
    assert.deepEqual(session.renewal(row(T0, at(30 * DAY)), at(2 * HOUR), DEFAULTS), { kind: 'end' });
  });

  it('tolerates a few seconds of clock difference between two instances', () => {
    // Written by an instance whose clock runs ten seconds ahead of this one.
    const verdict = session.renewal(row(T0, at(10_000 + DAY)), T0, DEFAULTS);
    assert.notEqual(verdict.kind, 'end');
  });

  it('writes at most every five minutes, and a tenth of a short idle window', () => {
    assert.equal(session.refreshStepMs(DEFAULTS), 5 * MINUTE);
    assert.equal(session.refreshStepMs(LEVEL_2), 3 * MINUTE);
    assert.equal(session.refreshStepMs({ maxSeconds: 3600, idleSeconds: 300 }), 30_000);
  });
});

// ---------------------------------------------------------------------------

describe('currentUser keeps a session alive while it is used, and only then', () => {
  /** A signed-in browser at T0 against a fresh memory store, under `policy`. */
  async function signedIn(policy = DEFAULTS) {
    const store = memoryStore();
    const user = await store.upsertUser(
      { provider: 'github', providerId: '583231', login: 'octocat', name: null, avatarUrl: null },
      T0,
    );
    const issued = session.issueSession(user.id, T0, true, policy);
    await store.createSession(issued.record);
    const request = () => new Request(`${ORIGIN}/`, { headers: { cookie: `__Host-trazum_session=${issued.token}` } });
    const ask = async (when, config = { secure: true, session: policy }) =>
      (await session.currentUser(request(), store, when, config))?.id ?? null;
    return { store, user, issued, ask };
  }

  it('outlives its first idle window while it is used', async () => {
    const { user, ask } = await signedIn();
    for (let hours = 12; hours <= 72; hours += 12) {
      assert.equal(await ask(at(hours * HOUR)), user.id, `signed out after ${hours} hours of use`);
    }
  });

  it('ends one idle window after its last use, and the row goes with it', async () => {
    const { store, issued, user, ask } = await signedIn();
    assert.equal(await ask(at(10 * HOUR)), user.id);
    assert.equal(await ask(at(10 * HOUR + DAY)), null, 'a day unused and still signed in');
    assert.equal(await store.findSession(issued.record.tokenHash, at(10 * HOUR)), null, 'the row survived');
  });

  it('is never carried past its lifetime by use', async () => {
    const { user, ask } = await signedIn();
    for (let hours = 6; hours < 30 * 24; hours += 6) {
      assert.equal(await ask(at(hours * HOUR)), user.id, `signed out after ${hours} hours of use`);
    }
    assert.equal(await ask(at(30 * DAY)), null, 'use carried the session past thirty days');
  });

  it('writes at most once a refresh step, not on every request', async () => {
    const { store, ask } = await signedIn();
    let writes = 0;
    const touch = store.touchSession.bind(store);
    store.touchSession = async (...args) => {
      writes += 1;
      return touch(...args);
    };

    for (let seconds = 1; seconds <= 240; seconds += 1) await ask(at(seconds * 1000));
    assert.equal(writes, 0, 'four minutes of requests wrote the session');
    await ask(at(5 * MINUTE));
    assert.equal(writes, 1);
    await ask(at(5 * MINUTE + 1000));
    assert.equal(writes, 1, 'the refresh did not register');
  });

  it('ends a session written before idle timeouts at its next use', async () => {
    const { store, user, ask } = await signedIn();
    // The row every sign-in wrote before this change: thirty days from issue.
    const legacy = { tokenHash: session.hashToken('legacy-token'), userId: user.id, createdAt: T0, expiresAt: at(30 * DAY) };
    await store.createSession(legacy);
    const request = new Request(`${ORIGIN}/`, { headers: { cookie: '__Host-trazum_session=legacy-token' } });

    assert.equal(await session.currentUser(request, store, at(2 * HOUR), { secure: true, session: DEFAULTS }), null);
    assert.equal(await store.findSession(legacy.tokenHash, at(2 * HOUR)), null, 'the legacy row survived');
    assert.equal(await ask(at(2 * HOUR)), user.id, 'a current session was ended with it');
  });

  it('ends sessions older than a lifetime the operator has since shortened', async () => {
    const { ask } = await signedIn();
    assert.ok(await ask(at(10 * HOUR)));
    // `TRAZUM_SESSION_MAX_HOURS=24`, set after this sign-in. The stored end is
    // nine hours away, inside the idle window, so only the lifetime can end it.
    const shortened = { secure: true, session: { maxSeconds: DAY / 1000, idleSeconds: DAY / 1000 } };
    assert.equal(await ask(at(25 * HOUR), shortened), null, 'a session past its new lifetime was honoured');
  });

  it('signs out after thirty minutes idle under the level 2 policy', async () => {
    const { user, ask } = await signedIn(LEVEL_2);
    assert.equal(await ask(at(29 * MINUTE)), user.id);
    assert.equal(await ask(at(58 * MINUTE)), user.id);
    assert.equal(await ask(at(58 * MINUTE + 30 * MINUTE)), null);
  });

  it('answers the request when the refresh fails, and only shortens the session', async () => {
    const { store, user, ask } = await signedIn();
    store.touchSession = async () => {
      throw new Error('connection reset');
    };
    assert.equal(await ask(at(6 * HOUR)), user.id);
  });
});

// ---------------------------------------------------------------------------

describe('the routes use the configured policy', () => {
  let client = 0;
  const req = (url, init = {}) => {
    client += 1;
    return new Request(url, { ...init, headers: { 'x-forwarded-for': `198.51.100.${client % 250}`, ...(init.headers ?? {}) } });
  };

  it('issues a session that ends one configured idle window out, with a cookie for the configured lifetime', async () => {
    process.env.TRAZUM_SESSION_MAX_HOURS = '12';
    process.env.TRAZUM_SESSION_IDLE_MINUTES = '30';
    globalThis.fetch = async (url) =>
      String(url).includes('access_token')
        ? Response.json({ access_token: 'gho_x' })
        : Response.json({ id: 583231, login: 'octocat', name: null, avatar_url: null });

    const started = await signIn(req(`${ORIGIN}/api/auth/github`));
    const stateCookie = started.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_oauth='));
    const packed = stateCookie.slice(stateCookie.indexOf('=') + 1, stateCookie.indexOf(';'));
    const nonce = packed.slice(0, packed.indexOf('.'));
    const before = Date.now();
    const finished = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=abc&state=${nonce}`, { headers: { cookie: `__Host-trazum_oauth=${packed}` } }),
    );

    const cookie = finished.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_session='));
    assert.match(cookie, /Max-Age=43200;/);
    const token = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    const found = await (await getStore()).findSession(session.hashToken(token), new Date());
    const ends = found.session.expiresAt.getTime();
    assert.ok(ends >= before + 30 * MINUTE && ends <= Date.now() + 30 * MINUTE, 'the row does not end thirty minutes out');
  });

  it('ends a session at /api/auth/session that the configured idle window does not allow', async () => {
    const store = await getStore();
    const user = await store.upsertUser({ provider: 'github', providerId: '1', login: 'octocat', name: null, avatarUrl: null }, new Date());
    const now = Date.now();
    const row = { tokenHash: session.hashToken('two-hours-left'), userId: user.id, createdAt: new Date(now - HOUR), expiresAt: new Date(now + 2 * HOUR) };
    const ask = async () =>
      (await (await sessionRoute(req(`${ORIGIN}/api/auth/session`, { headers: { cookie: '__Host-trazum_session=two-hours-left' } }))).json()).user;

    await store.createSession(row);
    assert.equal((await ask())?.login, 'octocat', 'two hours left is inside a one-day window');

    process.env.TRAZUM_SESSION_IDLE_MINUTES = '30';
    assert.equal(await ask(), null, 'two hours left survived a thirty-minute window');
    assert.equal(await store.findSession(row.tokenHash, new Date()), null);
  });
});
