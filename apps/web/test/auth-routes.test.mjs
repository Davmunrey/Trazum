import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

/**
 * The sign-in routes, called for real.
 *
 * The unit file next door checks the pieces; this one checks the order they run
 * in, which is where the security actually lives. The single most important
 * assertion in either file is in here and is easy to miss: **the callback must
 * not talk to GitHub until the state has matched.** It is asserted by counting
 * calls to a `fetch` that records them, because a route that verified state
 * *after* exchanging the code would pass every other test in this file.
 *
 * `fetch` is replaced on the global for the duration, which is the one fake
 * here. The store is the real memory driver, and every response is read the way
 * a browser would read it: status, `Location`, `Set-Cookie`.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let signIn;
let callback;
let signOut;
let sessionRoute;
let getStore;
let resetStore;
let hashToken;
let packState;
let unpackState;

const saved = {};
const realFetch = globalThis.fetch;

/** Calls made to `fetch` during a test, so absence can be asserted. */
let calls = [];

/**
 * A distinct client address per request.
 *
 * The rate limiter is module state keyed on the caller's address, and every
 * `Request` built here would otherwise look like the same machine — so a suite
 * of thirty sign-ins trips a limit that no real user would. Found by writing
 * the suite: eleven tests failed with 429 before any of them reached an
 * assertion about sign-in at all.
 */
let clientCounter = 0;
function freshClient() {
  clientCounter += 1;
  return { 'x-forwarded-for': `203.0.113.${clientCounter % 250}` };
}

/** A request from a client the limiter has not seen. */
function req(url, init = {}) {
  return new Request(url, { ...init, headers: { ...freshClient(), ...(init.headers ?? {}) } });
}

function fakeGitHub({ token = 'gho_x', identity = { id: 583231, login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.example/o.png' } } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('access_token')) return Response.json({ access_token: token });
    return Response.json(identity);
  };
}

/** Every `Set-Cookie` on a response, which `Headers.get` would join into one. */
function setCookies(response) {
  return response.headers.getSetCookie();
}

function cookieNamed(response, name) {
  return setCookies(response).find((c) => c.startsWith(`${name}=`)) ?? null;
}

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  ({ GET: signIn } = await import('../app/api/auth/github/route.ts'));
  ({ GET: callback } = await import('../app/api/auth/github/callback/route.ts'));
  ({ POST: signOut } = await import('../app/api/auth/signout/route.ts'));
  ({ GET: sessionRoute } = await import('../app/api/auth/session/route.ts'));
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
  ({ hashToken } = await import('../lib/auth/session.ts'));
  ({ packState, unpackState } = await import('../lib/auth/github.ts'));
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
  calls = [];
  resetStore();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * A signed-in browser: runs the whole flow and hands back its session cookie.
 *
 * The tests below need one and building it by hand would let them agree with
 * each other about a cookie the real routes never issue.
 */
async function signInFully(next = '/') {
  globalThis.fetch = fakeGitHub();

  const started = await signIn(req(`${ORIGIN}/api/auth/github?next=${encodeURIComponent(next)}`));
  const stateCookie = cookieNamed(started, '__Host-trazum_oauth');
  const packed = stateCookie.slice(stateCookie.indexOf('=') + 1, stateCookie.indexOf(';'));
  const nonce = packed.slice(0, packed.indexOf('.'));

  const finished = await callback(
    req(`${ORIGIN}/api/auth/github/callback?code=abc&state=${nonce}`, {
      headers: { cookie: `__Host-trazum_oauth=${packed}` },
    }),
  );

  const sessionCookie = cookieNamed(finished, '__Host-trazum_session');
  const token = sessionCookie.slice(sessionCookie.indexOf('=') + 1, sessionCookie.indexOf(';'));
  return { finished, token, cookie: `__Host-trazum_session=${token}` };
}

// ---------------------------------------------------------------------------

describe('GET /api/auth/github', () => {
  it('refuses with 503, not 404, when the deployment has no GitHub app', async () => {
    delete process.env.TRAZUM_GITHUB_CLIENT_ID;
    const response = await signIn(req(`${ORIGIN}/api/auth/github`));
    assert.equal(response.status, 503);
    // The body names the variable to set, because the reader is an operator.
    assert.match((await response.json()).error, /TRAZUM_GITHUB_CLIENT_ID/);
  });

  it('redirects to GitHub and remembers the nonce in an HttpOnly cookie', async () => {
    const response = await signIn(req(`${ORIGIN}/api/auth/github`));

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.host, 'github.com');

    const cookie = cookieNamed(response, '__Host-trazum_oauth');
    assert.ok(cookie, 'state cookie is set');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=600/);

    // The nonce in the cookie is the nonce in the URL.
    const packed = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
    assert.equal(location.searchParams.get('state'), packed.slice(0, packed.indexOf('.')));
  });

  it('never puts the client secret anywhere the browser can see', async () => {
    const response = await signIn(req(`${ORIGIN}/api/auth/github`));
    const visible = [response.headers.get('location'), ...setCookies(response)].join(' ');
    assert.ok(!visible.includes('shhh'));
  });

  it('carries a safe destination and drops a hostile one', async () => {
    const safe = await signIn(req(`${ORIGIN}/api/auth/github?next=%2Flibrary`));
    const hostile = await signIn(req(`${ORIGIN}/api/auth/github?next=https%3A%2F%2Fevil.example`));

    /**
     * Through the real parser rather than by slicing at the first dot. This
     * test used to spell the cookie's layout out a second time, so the day the
     * state gained an issue time it failed on the format instead of on the
     * destination it is about.
     */
    const decode = (response) => {
      const cookie = cookieNamed(response, '__Host-trazum_oauth');
      return unpackState(cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'))).next;
    };

    assert.equal(decode(safe), '/library');
    assert.equal(decode(hostile), '/');
  });

  it('writes nothing to the store before the user has consented', async () => {
    await signIn(req(`${ORIGIN}/api/auth/github`));
    const store = await getStore();
    // No user exists yet, so no session can resolve to one.
    assert.equal(await store.findSession('any', new Date()), null);
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/auth/github/callback', () => {
  it('does not touch GitHub when the state does not match', async () => {
    globalThis.fetch = fakeGitHub();

    const response = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=stolen&state=attacker`, {
        headers: { cookie: `__Host-trazum_oauth=${packState('victim', '/', new Date())}` },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0, 'the code was never exchanged');
  });

  it('refuses a callback with no state cookie at all', async () => {
    globalThis.fetch = fakeGitHub();
    const response = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=abc&state=anything`),
    );
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });

  it('says the same thing for a forged callback and an expired one', async () => {
    // Two different causes, one message: telling them apart tells an attacker
    // which half of the attack worked.
    const forged = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=a&state=wrong`, {
        headers: { cookie: `__Host-trazum_oauth=${packState('right', '/', new Date())}` },
      }),
    );
    const expired = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=a&state=right`),
    );
    assert.equal((await forged.json()).error, (await expired.json()).error);
  });

  it('clears the state cookie on every way out', async () => {
    globalThis.fetch = fakeGitHub();

    const rejected = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=a&state=wrong`, {
        headers: { cookie: `__Host-trazum_oauth=${packState('right', '/', new Date())}` },
      }),
    );
    assert.match(cookieNamed(rejected, '__Host-trazum_oauth'), /Max-Age=0/);

    const cancelled = await callback(
      req(`${ORIGIN}/api/auth/github/callback?error=access_denied`),
    );
    assert.equal(cancelled.status, 303);
    assert.match(cookieNamed(cancelled, '__Host-trazum_oauth'), /Max-Age=0/);

    const { finished } = await signInFully();
    assert.match(cookieNamed(finished, '__Host-trazum_oauth'), /Max-Age=0/);
  });

  it('signs the user in and stores only the hash of the token', async () => {
    const { finished, token } = await signInFully('/library');

    assert.equal(finished.status, 303);
    assert.equal(finished.headers.get('location'), '/library');

    const cookie = cookieNamed(finished, '__Host-trazum_session');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);

    const store = await getStore();
    const found = await store.findSession(hashToken(token), new Date());
    assert.equal(found.user.login, 'octocat');
    // The raw token is not what was stored.
    assert.equal(await store.findSession(token, new Date()), null);
  });

  it('never keeps GitHub’s access token', async () => {
    const { finished } = await signInFully();
    const store = await getStore();

    // Nothing in the response and nothing in the record carries it.
    assert.ok(!JSON.stringify(setCookies(finished)).includes('gho_x'));
    assert.ok(!JSON.stringify(await store.upsertUser(
      { provider: 'github', providerId: '583231', login: 'octocat', name: null, avatarUrl: null },
      new Date(),
    )).includes('gho_x'));
  });

  it('reports a refused exchange as 502 without minting a session', async () => {
    globalThis.fetch = async (url) => {
      calls.push({ url: String(url) });
      return Response.json({ error: 'bad_verification_code' });
    };

    const started = await signIn(req(`${ORIGIN}/api/auth/github`));
    const cookie = cookieNamed(started, '__Host-trazum_oauth');
    const packed = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));

    const response = await callback(
      req(`${ORIGIN}/api/auth/github/callback?code=a&state=${packed.slice(0, packed.indexOf('.'))}`, {
        headers: { cookie: `__Host-trazum_oauth=${packed}` },
      }),
    );

    assert.equal(response.status, 502);
    assert.equal(cookieNamed(response, '__Host-trazum_session'), null, 'no session cookie');
  });

  it('refuses a state that matches but carries no code', async () => {
    globalThis.fetch = fakeGitHub();
    const started = await signIn(req(`${ORIGIN}/api/auth/github`));
    const cookie = cookieNamed(started, '__Host-trazum_oauth');
    const packed = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));

    const response = await callback(
      req(`${ORIGIN}/api/auth/github/callback?state=${packed.slice(0, packed.indexOf('.'))}`, {
        headers: { cookie: `__Host-trazum_oauth=${packed}` },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  });

  it('sends a returning user back to the same account', async () => {
    const first = await signInFully();
    const second = await signInFully();

    const store = await getStore();
    const a = await store.findSession(hashToken(first.token), new Date());
    const b = await store.findSession(hashToken(second.token), new Date());
    assert.equal(a.user.id, b.user.id);
    // And the first session is still live: signing in on a second device must
    // not sign you out of the first.
    assert.ok(a);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/signout', () => {
  it('deletes the session server-side, not only the cookie', async () => {
    const { token, cookie } = await signInFully();
    const store = await getStore();
    assert.ok(await store.findSession(hashToken(token), new Date()));

    const response = await signOut(
      req(`${ORIGIN}/api/auth/signout`, { method: 'POST', headers: { cookie } }),
    );

    assert.equal(response.status, 204);
    assert.equal(await store.findSession(hashToken(token), new Date()), null);
  });

  it('clears both cookie names, keeping Secure on the prefixed one', async () => {
    const { cookie } = await signInFully();
    const response = await signOut(
      req(`${ORIGIN}/api/auth/signout`, { method: 'POST', headers: { cookie } }),
    );

    const cleared = setCookies(response);
    assert.equal(cleared.length, 2);
    assert.match(cookieNamed(response, '__Host-trazum_session'), /Secure/);
    for (const c of cleared) assert.match(c, /Max-Age=0/);
  });

  it('answers 204 whether or not there was anything to end', async () => {
    const response = await signOut(req(`${ORIGIN}/api/auth/signout`, { method: 'POST' }));
    assert.equal(response.status, 204);
  });

  it('refuses a cross-origin sign-out but allows a client with no Origin', async () => {
    const hostile = await signOut(
      req(`${ORIGIN}/api/auth/signout`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    );
    assert.equal(hostile.status, 403);

    const curl = await signOut(req(`${ORIGIN}/api/auth/signout`, { method: 'POST' }));
    assert.equal(curl.status, 204);

    const ours = await signOut(
      req(`${ORIGIN}/api/auth/signout`, { method: 'POST', headers: { origin: ORIGIN } }),
    );
    assert.equal(ours.status, 204);
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/auth/session', () => {
  it('reports the feature as off when it is off, and says why', async () => {
    /**
     * The reason is the half that was missing. An operator whose sign-in
     * never appeared had nothing to read — no button, no error — which is
     * the same silence as a deployment deliberately running anonymous, and
     * only one of those wants fixing. Variable *names* only: those are
     * public documentation, and no value is ever echoed.
     */
    delete process.env.TRAZUM_GITHUB_CLIENT_ID;
    const response = await sessionRoute(req(`${ORIGIN}/api/auth/session`));
    const body = await response.json();
    assert.equal(body.enabled, false);
    assert.equal(body.user, null);
    assert.equal(body.ephemeralSessions, false);
    assert.match(body.reason, /TRAZUM_GITHUB_CLIENT_ID/);
    // The secret's name may be named; its value must never be.
    assert.equal(/secret['":=]\s*\S/i.test(body.reason.replace(/TRAZUM_GITHUB_CLIENT_SECRET/g, '')), false);
  });

  it('returns null for a visitor and the profile for a member', async () => {
    const anonymous = await sessionRoute(req(`${ORIGIN}/api/auth/session`));
    assert.equal((await anonymous.json()).user, null);

    const { cookie } = await signInFully();
    const signedIn = await sessionRoute(
      req(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
    );
    const body = await signedIn.json();
    assert.equal(body.enabled, true);
    assert.deepEqual(body.user, {
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://avatars.example/o.png',
    });
  });

  it('returns only the three fields the header draws', async () => {
    const { cookie } = await signInFully();
    const response = await sessionRoute(
      req(`${ORIGIN}/api/auth/session`, { headers: { cookie } }),
    );
    const body = await response.json();
    assert.deepEqual(Object.keys(body.user).sort(), ['avatarUrl', 'login', 'name']);
    // The internal id and the provider id are not the browser's business.
    assert.ok(!JSON.stringify(body).includes('583231'));
  });

  it('is never cacheable, signed in or out', async () => {
    for (const headers of [{}, { cookie: (await signInFully()).cookie }]) {
      const response = await sessionRoute(req(`${ORIGIN}/api/auth/session`, { headers }));
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
  });

  /**
   * The limiter, which this route did without while `lib/auth/routes.ts`
   * exported one twenty lines away.
   *
   * A pinned address, outside the `203.0.113.x` block `freshClient` cycles
   * through, so burning a budget here cannot refuse a test somewhere else in
   * this file.
   */
  const HAMMER = { 'x-forwarded-for': '198.51.100.7' };
  const ask = (headers = {}) =>
    sessionRoute(new Request(`${ORIGIN}/api/auth/session`, { headers: { ...HAMMER, ...headers } }));

  it('refuses an unauthenticated caller who asks more than sixty times a minute', async () => {
    for (let i = 1; i <= 60; i += 1) {
      const response = await ask();
      assert.equal(response.status, 200, `call ${i} was refused inside the budget`);
    }

    const refused = await ask();
    assert.equal(refused.status, 429, 'the sixty-first call was served');
    assert.equal((await refused.json()).error, 'too many requests, try again in a minute');
    // Every other branch of this route says no-store, because a cached identity
    // is somebody else's identity served to a stranger. The refusal is the same
    // mistake with a smaller blast radius.
    assert.match(refused.headers.get('cache-control'), /no-store/);

    // Another address in the same window is untouched, which is what makes this
    // a limiter rather than a switch.
    const elsewhere = await sessionRoute(
      new Request(`${ORIGIN}/api/auth/session`, { headers: { 'x-forwarded-for': '198.51.100.8' } }),
    );
    assert.equal(elsewhere.status, 200, 'one address exhausted the limit for every other');
  });

  it('does not spend the sign-in budget, so browsing cannot lock somebody out', async () => {
    /**
     * The reason this route has its own limiter rather than reusing
     * `authRateLimited`, asserted rather than left to the comment that claims
     * it. The header asks this endpoint on every page load and a person signs
     * in twice a year, so one shared bucket means ordinary browsing spends the
     * budget the sign-in hops need and refuses somebody at the moment they
     * press the button.
     *
     * Reuse `authRateLimited` in the route and this fails: the sign-in redirect
     * comes back 429 from the same address that did nothing but read its own
     * session.
     */
    for (let i = 0; i < 61; i += 1) await ask();
    assert.equal((await ask()).status, 429, 'the session budget was not exhausted');

    const started = await signIn(
      new Request(`${ORIGIN}/api/auth/github`, { headers: { ...HAMMER } }),
    );
    assert.equal(started.status, 303, 'reading the session locked this address out of signing in');

    // Parsed rather than matched. An unanchored regular expression against a
    // URL matches anywhere in it, so `https://evil.example/?x=github.com/login/
    // oauth/authorize` would have satisfied the assertion this replaces. The
    // file already reads the redirect this way twenty lines above, and CodeQL
    // was right to say so.
    const authorize = new URL(started.headers.get('location'));
    assert.equal(authorize.host, 'github.com');
    assert.equal(authorize.pathname, '/login/oauth/authorize');
  });

  it('answers a deployment with sign-in off without spending the budget', async () => {
    /**
     * The disabled branch returns before the limiter, and that ordering is the
     * point of the test rather than an accident of where the line went. That
     * branch exists so an operator whose sign-in never appeared can curl this
     * endpoint and read why; it touches no store and costs nothing, and
     * rationing it would ration the one answer somebody debugging a deployment
     * needs.
     */
    delete process.env.TRAZUM_GITHUB_CLIENT_ID;

    // Its own address, so this fails because the limiter moved and not because
    // the two tests above already spent `HAMMER`'s budget. Without it the plant
    // still fails, on call one, for a reason that is not the one named here.
    const operator = { 'x-forwarded-for': '198.51.100.9' };
    for (let i = 0; i < 80; i += 1) {
      const response = await sessionRoute(
        new Request(`${ORIGIN}/api/auth/session`, { headers: operator }),
      );
      assert.equal(response.status, 200, `the operator was refused on call ${i + 1}`);
      assert.equal((await response.json()).enabled, false);
    }
  });

  it('admits that a memory store forgets', async () => {
    const response = await sessionRoute(req(`${ORIGIN}/api/auth/session`));
    assert.equal((await response.json()).ephemeralSessions, true);
  });

  it('ignores a session cookie that was never issued', async () => {
    const response = await sessionRoute(
      req(`${ORIGIN}/api/auth/session`, {
        headers: { cookie: '__Host-trazum_session=made-up' },
      }),
    );
    assert.equal((await response.json()).user, null);
  });
});
