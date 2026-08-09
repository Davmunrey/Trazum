import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The parts of signing in that can be checked without a browser or a database.
 *
 * Written against the real modules — no fakes except the two things that leave
 * the process, `fetch` and the SQL client, both of which the code takes as
 * arguments precisely so a test can supply them.
 *
 * The questions worth stating in advance, because they are the ones that decide
 * whether this feature is safe rather than merely working:
 *
 * - Can a `?next=` take somebody off this site?
 * - Does a rejected code exchange that arrives as HTTP 200 look like success?
 * - Does the `__Host-` cookie survive a sign-out that thinks it is insecure?
 * - Does a second sign-in reset the date the account was created?
 */

register('./helpers/loader.mjs', import.meta.url);

let auth;
let cookies;
let github;
let session;
let store;
let storeIndex;

before(async () => {
  auth = await import('../lib/auth/config.ts');
  cookies = await import('../lib/auth/cookies.ts');
  github = await import('../lib/auth/github.ts');
  session = await import('../lib/auth/session.ts');
  store = await import('../lib/store/memory.ts');
  storeIndex = await import('../lib/store/index.ts');
});

const CREDENTIALS = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
};

// ---------------------------------------------------------------------------

describe('authConfig', () => {
  it('is disabled, with a reason, when no GitHub app is configured', () => {
    const config = auth.authConfig({});
    assert.equal(config.enabled, false);
    assert.match(config.reason, /TRAZUM_GITHUB_CLIENT_ID/);
  });

  it('is disabled when only half the credentials are present', () => {
    assert.equal(auth.authConfig({ TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc' }).enabled, false);
    assert.equal(auth.authConfig({ TRAZUM_GITHUB_CLIENT_SECRET: 'shhh' }).enabled, false);
  });

  it('demands a public URL rather than inferring one', () => {
    const config = auth.authConfig({ ...CREDENTIALS });
    assert.equal(config.enabled, false);
    assert.match(config.reason, /TRAZUM_PUBLIC_URL/);
  });

  it('derives the callback from the configured origin and nothing else', () => {
    const config = auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'https://trazum.example/' });
    assert.equal(config.enabled, true);
    assert.equal(config.publicUrl, 'https://trazum.example');
    assert.equal(config.redirectUri, 'https://trazum.example/api/auth/github/callback');
    assert.equal(config.secure, true);
  });

  it('allows http on localhost and refuses it anywhere else', () => {
    const local = auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'http://localhost:3000' });
    assert.equal(local.enabled, true);
    assert.equal(local.secure, false);

    const remote = auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'http://trazum.example' });
    assert.equal(remote.enabled, false);
    assert.match(remote.reason, /https/);
  });

  it('refuses a public URL that is not a URL, and one that is not http', () => {
    assert.equal(auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'nonsense' }).enabled, false);
    assert.equal(
      auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'javascript:alert(1)' }).enabled,
      false,
    );
  });
});

// ---------------------------------------------------------------------------

describe('safeNextPath', () => {
  it('keeps an ordinary path, including query, fragment and hyphens', () => {
    // The hyphen is in here because an earlier draft of the control-character
    // filter was written as a character class that happened to include `-`,
    // which silently sent every page with a hyphen in its name back to `/`.
    assert.equal(github.safeNextPath('/library/my-prompt?tab=diff#L4'), '/library/my-prompt?tab=diff#L4');
  });

  it('refuses anything that could leave this origin', () => {
    for (const hostile of [
      '//evil.example',
      '/\\evil.example',
      'https://evil.example',
      'http://evil.example',
      '../up',
      'evil.example',
    ]) {
      assert.equal(github.safeNextPath(hostile), '/', hostile);
    }
  });

  it('refuses control characters, which browsers strip before navigating', () => {
    const tab = '/' + String.fromCharCode(9) + '/evil.example';
    const newline = '/' + String.fromCharCode(10) + '/evil.example';
    const nul = '/' + String.fromCharCode(0) + 'x';
    const del = '/' + String.fromCharCode(127) + 'x';
    for (const hostile of [tab, newline, nul, del]) {
      assert.equal(github.safeNextPath(hostile), '/');
    }
  });

  it('refuses absurd lengths and falls back for nothing at all', () => {
    assert.equal(github.safeNextPath('/' + 'a'.repeat(600)), '/');
    assert.equal(github.safeNextPath(null), '/');
    assert.equal(github.safeNextPath(''), '/');
  });
});

// ---------------------------------------------------------------------------

describe('cookies', () => {
  it('writes the attributes a browser will enforce', () => {
    const serialized = cookies.serializeCookie('__Host-trazum_session', 'abc', {
      maxAge: 60,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });
    assert.equal(
      serialized,
      '__Host-trazum_session=abc; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('adds a past Expires when clearing, for clients that ignore Max-Age', () => {
    const cleared = cookies.serializeCookie('trazum_session', '', { maxAge: 0, secure: false });
    assert.match(cleared, /Max-Age=0/);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  });

  it('refuses a value that would inject a second header', () => {
    assert.throws(() => cookies.serializeCookie('a', 'x\r\nSet-Cookie: admin=1', { maxAge: 1, secure: true }));
    assert.throws(() => cookies.serializeCookie('a\r\nX: y', 'v', { maxAge: 1, secure: true }));
    assert.throws(() => cookies.serializeCookie('a', 'has space', { maxAge: 1, secure: true }));
    assert.throws(() => cookies.serializeCookie('a', 'v', { maxAge: -1, secure: true }));
  });

  it('splits a cookie value on the first = only', () => {
    // base64url has no `=`, but base64 does, and a parser that splits on every
    // `=` truncates the padding and silently invalidates the session.
    const parsed = cookies.parseCookies('a=one; b=two=three');
    assert.equal(parsed.get('b'), 'two=three');
  });

  it('takes the first of a duplicated cookie', () => {
    const parsed = cookies.parseCookies('s=real; s=injected');
    assert.equal(parsed.get('s'), 'real');
  });

  it('survives a missing or malformed header', () => {
    assert.equal(cookies.parseCookies(null).size, 0);
    assert.equal(cookies.parseCookies('=novalue; ;justname').size, 0);
  });
});

// ---------------------------------------------------------------------------

describe('session tokens', () => {
  it('stores only the SHA-256 of the token', () => {
    const token = session.mintToken();
    assert.equal(session.hashToken(token), createHash('sha256').update(token).digest('hex'));
    // The stored form must not contain the token, which is the whole point.
    assert.ok(!session.hashToken(token).includes(token));
  });

  it('mints 256 bits, and not the same 256 bits twice', () => {
    const a = session.mintToken();
    const b = session.mintToken();
    assert.notEqual(a, b);
    assert.equal(Buffer.from(a, 'base64url').length, 32);
  });

  it('compares in constant time without throwing on a length mismatch', () => {
    assert.equal(session.safeEqual('abc', 'abc'), true);
    assert.equal(session.safeEqual('abc', 'abd'), false);
    assert.equal(session.safeEqual('abc', 'abcd'), false);
    assert.equal(session.safeEqual('', ''), true);
  });

  it('issues a __Host- cookie over https and a plain one over http', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    const secure = session.issueSession('user-1', now, true);
    const plain = session.issueSession('user-1', now, false);

    assert.match(secure.setCookie, /^__Host-trazum_session=/);
    assert.match(secure.setCookie, /Secure/);
    assert.match(plain.setCookie, /^trazum_session=/);
    assert.ok(!/Secure/.test(plain.setCookie));
  });

  it('sets an absolute expiry thirty days out and hashes what it stores', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    const issued = session.issueSession('user-1', now, true);

    assert.equal(issued.record.expiresAt.getTime() - now.getTime(), 30 * 24 * 60 * 60 * 1000);
    assert.equal(issued.record.tokenHash, session.hashToken(issued.token));
    assert.ok(!issued.record.tokenHash.includes(issued.token));
    // The cookie carries the token; the record must not.
    assert.ok(issued.setCookie.includes(issued.token));
  });

  it('clears the __Host- cookie as Secure even when the deployment is not', () => {
    // A `__Host-` cookie without `Secure` is rejected outright by the browser,
    // including when the rejected cookie was the one meant to delete it. Get
    // this wrong and sign-out appears to work and does nothing.
    const cleared = session.clearSessionCookies(false);
    const host = cleared.find((c) => c.startsWith('__Host-'));
    assert.ok(host, 'the prefixed cookie is cleared too');
    assert.match(host, /Secure/);
    assert.match(host, /Max-Age=0/);
    assert.equal(cleared.length, 2);
  });

  it('reads the token from whichever cookie name the deployment uses', () => {
    const request = (header) => new Request('https://x.test/', { headers: { cookie: header } });
    assert.equal(session.tokenFromRequest(request('__Host-trazum_session=aaa'), true), 'aaa');
    assert.equal(session.tokenFromRequest(request('trazum_session=bbb'), false), 'bbb');
    // The insecure name must not satisfy a secure deployment: that is the
    // cookie-tossing case the prefix exists to prevent.
    assert.equal(session.tokenFromRequest(request('trazum_session=bbb'), true), null);
  });
});

// ---------------------------------------------------------------------------

describe('oauth state', () => {
  it('round-trips the nonce and the destination', () => {
    const packed = github.packState('nonce123', '/library?tab=diff');
    const unpacked = github.unpackState(packed);
    assert.equal(unpacked.nonce, 'nonce123');
    assert.equal(unpacked.next, '/library?tab=diff');
  });

  it('produces a value a cookie can legally hold', () => {
    const packed = github.packState(github.mintNonce(), '/a b/ü');
    assert.doesNotThrow(() => cookies.serializeCookie('t', packed, { maxAge: 1, secure: true }));
  });

  it('sanitises the destination on the way out, not only on the way in', () => {
    // Belt and braces against a tampered cookie: the value is HttpOnly, but the
    // filter costs nothing and the alternative is an open redirect.
    const forged = github.packState('n', 'https://evil.example');
    assert.equal(github.unpackState(forged).next, '/');
  });

  it('matches only the nonce it issued', () => {
    const packed = github.packState('nonce123', '/');
    assert.equal(github.stateMatches(packed, 'nonce123'), true);
    assert.equal(github.stateMatches(packed, 'nonce124'), false);
    assert.equal(github.stateMatches(packed, ''), false);
    assert.equal(github.stateMatches(packed, null), false);
    assert.equal(github.stateMatches(null, 'nonce123'), false);
    assert.equal(github.stateMatches('no-dot-here', 'no-dot-here'), false);
  });

  it('puts the state, the callback and the minimum scope on the authorize URL', () => {
    const config = auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'https://trazum.example' });
    const url = new URL(github.authorizeUrl(config, 'nonce123'));

    assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), 'Iv1.abc');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://trazum.example/api/auth/github/callback');
    assert.equal(url.searchParams.get('state'), 'nonce123');
    assert.equal(url.searchParams.get('scope'), 'read:user');
    // Nothing that would let Trazum act on the account.
    assert.ok(!url.searchParams.get('scope').includes('repo'));
    assert.ok(!url.searchParams.get('scope').includes('write'));
    // And never the secret.
    assert.ok(!url.toString().includes('shhh'));
  });
});

// ---------------------------------------------------------------------------

describe('the GitHub hops', () => {
  const config = () =>
    auth.authConfig({ ...CREDENTIALS, TRAZUM_PUBLIC_URL: 'https://trazum.example' });

  const jsonFetch = (body, init = {}) => async () => Response.json(body, init);

  it('treats a 200 carrying an error field as a failure', async () => {
    // The subtle one. GitHub answers a bad, expired or replayed code with HTTP
    // 200 and `{"error": "bad_verification_code"}`. A route that checks only the
    // status reads `undefined` as the token and carries on.
    const result = await github.exchangeCode(
      config(),
      'code',
      jsonFetch({ error: 'bad_verification_code', error_description: 'The code passed is incorrect.' }),
    );
    assert.ok('error' in result);
    assert.match(result.error, /incorrect/);
  });

  it('returns the token when there is one', async () => {
    const result = await github.exchangeCode(config(), 'code', jsonFetch({ access_token: 'gho_x' }));
    assert.deepEqual(result, { accessToken: 'gho_x' });
  });

  it('sends the code to GitHub and nowhere else', async () => {
    const calls = [];
    await github.exchangeCode(config(), 'code', async (url, init) => {
      calls.push({ url, init });
      return Response.json({ access_token: 'gho_x' });
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://github.com/login/oauth/access_token');
    assert.equal(calls[0].init.method, 'POST');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.redirect_uri, 'https://trazum.example/api/auth/github/callback');
  });

  it('reports a refusal, a network failure and a malformed body distinctly', async () => {
    const refused = await github.exchangeCode(config(), 'c', jsonFetch({}, { status: 401 }));
    assert.match(refused.error, /401/);

    const offline = await github.exchangeCode(config(), 'c', async () => {
      throw new Error('ECONNREFUSED');
    });
    assert.match(offline.error, /could not reach GitHub/);

    const garbage = await github.exchangeCode(config(), 'c', async () => new Response('<html>'));
    assert.match(garbage.error, /malformed/);
  });

  it('reads an identity, coercing the numeric id and defaulting the decoration', async () => {
    const identity = await github.fetchIdentity(
      'gho_x',
      jsonFetch({ id: 583231, login: 'octocat', name: null, avatar_url: '' }),
    );
    assert.deepEqual(identity, {
      provider: 'github',
      providerId: '583231',
      login: 'octocat',
      name: null,
      avatarUrl: null,
    });
  });

  it('refuses an identity with no id or no login', async () => {
    const noId = await github.fetchIdentity('t', jsonFetch({ login: 'octocat' }));
    assert.match(noId.error, /no id/);
    const noLogin = await github.fetchIdentity('t', jsonFetch({ id: 1 }));
    assert.match(noLogin.error, /no login/);
  });

  it('sends the token as a bearer header and never in the URL', async () => {
    let seen;
    await github.fetchIdentity('gho_secret', async (url, init) => {
      seen = { url, init };
      return Response.json({ id: 1, login: 'a' });
    });
    assert.ok(!seen.url.includes('gho_secret'));
    assert.equal(seen.init.headers.authorization, 'Bearer gho_secret');
  });
});

// ---------------------------------------------------------------------------

describe('the memory store', () => {
  const IDENTITY = {
    provider: 'github',
    providerId: '583231',
    login: 'octocat',
    name: 'The Octocat',
    avatarUrl: null,
  };

  it('keys on the provider id, so a rename keeps the account', async () => {
    const s = store.memoryStore();
    const first = await s.upsertUser(IDENTITY, new Date('2024-01-01T00:00:00Z'));
    const second = await s.upsertUser(
      { ...IDENTITY, login: 'monalisa', name: 'Mona' },
      new Date('2026-08-09T00:00:00Z'),
    );

    assert.equal(second.id, first.id, 'the same account');
    assert.equal(second.login, 'monalisa', 'the new name is picked up');
    assert.deepEqual(second.createdAt, first.createdAt, 'joining date is not reset by a rename');
  });

  it('treats a different provider id as a different account', async () => {
    const s = store.memoryStore();
    const a = await s.upsertUser(IDENTITY, new Date());
    // The same login, released and taken by someone else. Keyed on the login,
    // this person would inherit the previous holder's library.
    const b = await s.upsertUser({ ...IDENTITY, providerId: '999' }, new Date());
    assert.notEqual(a.id, b.id);
  });

  it('finds a live session and refuses an expired one', async () => {
    const s = store.memoryStore();
    const now = new Date('2026-08-09T00:00:00Z');
    const user = await s.upsertUser(IDENTITY, now);
    const issued = session.issueSession(user.id, now, true);
    await s.createSession(issued.record);

    const found = await s.findSession(issued.record.tokenHash, now);
    assert.equal(found.user.login, 'octocat');

    const later = new Date(issued.record.expiresAt.getTime() + 1);
    assert.equal(await s.findSession(issued.record.tokenHash, later), null);
  });

  it('treats the exact expiry instant as expired', async () => {
    const s = store.memoryStore();
    const now = new Date('2026-08-09T00:00:00Z');
    const user = await s.upsertUser(IDENTITY, now);
    const issued = session.issueSession(user.id, now, true);
    await s.createSession(issued.record);

    assert.equal(await s.findSession(issued.record.tokenHash, issued.record.expiresAt), null);
  });

  it('deletes an expired session rather than leaving it to accumulate', async () => {
    const s = store.memoryStore();
    const now = new Date('2026-08-09T00:00:00Z');
    const user = await s.upsertUser(IDENTITY, now);
    const issued = session.issueSession(user.id, now, true);
    await s.createSession(issued.record);

    const later = new Date(issued.record.expiresAt.getTime() + 1);
    await s.findSession(issued.record.tokenHash, later);
    // Asking again before the expiry: if the row survived, this would find it.
    assert.equal(await s.findSession(issued.record.tokenHash, now), null);
  });

  it('signs out one session, or all of them', async () => {
    const s = store.memoryStore();
    const now = new Date('2026-08-09T00:00:00Z');
    const user = await s.upsertUser(IDENTITY, now);
    const laptop = session.issueSession(user.id, now, true);
    const phone = session.issueSession(user.id, now, true);
    await s.createSession(laptop.record);
    await s.createSession(phone.record);

    await s.deleteSession(laptop.record.tokenHash);
    assert.equal(await s.findSession(laptop.record.tokenHash, now), null);
    assert.ok(await s.findSession(phone.record.tokenHash, now));

    await s.deleteSessionsForUser(user.id);
    assert.equal(await s.findSession(phone.record.tokenHash, now), null);
  });

  it('says out loud that it forgets everything', () => {
    assert.equal(store.memoryStore().ephemeral, true);
  });
});

// ---------------------------------------------------------------------------

describe('database TLS', () => {
  it('verifies the certificate by default for a remote host', () => {
    assert.equal(
      storeIndex.resolveSslMode({}, 'postgres://u:p@db.example.com:5432/trazum'),
      'verify-full',
    );
  });

  it('does not demand a certificate from your own machine', () => {
    assert.equal(storeIndex.resolveSslMode({}, 'postgres://u:p@localhost:5432/trazum'), false);
    assert.equal(storeIndex.resolveSslMode({}, 'postgres://u:p@127.0.0.1:5432/trazum'), false);
  });

  it('lets the operator downgrade, but only to a mode that exists', () => {
    const url = 'postgres://u:p@db.example.com/trazum';
    assert.equal(storeIndex.resolveSslMode({ TRAZUM_DATABASE_SSL: 'require' }, url), 'require');
    assert.equal(storeIndex.resolveSslMode({ TRAZUM_DATABASE_SSL: 'disable' }, url), false);
    assert.throws(
      () => storeIndex.resolveSslMode({ TRAZUM_DATABASE_SSL: 'yes please' }, url),
      /TRAZUM_DATABASE_SSL/,
    );
  });

  it('falls back to verifying when the URL cannot be parsed', () => {
    // An unparseable URL is going to fail to connect anyway; the point is that
    // the failure is not "connected without checking who answered".
    assert.equal(storeIndex.resolveSslMode({}, 'not a url'), 'verify-full');
  });
});
