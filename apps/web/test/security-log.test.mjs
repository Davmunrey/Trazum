import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The security log: every decision recorded, nothing secret in the record.
 *
 * Written for the compliance readiness pack (SOC 2 CC7.2, ISO 27001 8.15,
 * OWASP ASVS V7). Two halves, held together because each is worthless without
 * the other: a log that misses a sign-in cannot reconstruct an incident, and a
 * log that holds a session token is the incident.
 *
 * The flow below walks one account through everything that writes a line,
 * with a secret planted in every value that must never be written: the OAuth
 * code and state, the session token and its hash, the GitHub login, name and
 * avatar, the client's IP address, a share token and the prompt text.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
  TRAZUM_OPEN_SIGNUP: '1',
  TRAZUM_ADMINS: 'someone-else',
};

const SECRETS = {
  code: 'oauth-code-7c1e',
  ip: '198.51.100.77',
  login: 'secret-login-4b2d',
  name: 'Secret Name 4b2d',
  avatar: 'https://avatars.example/secret-4b2d.png',
  githubToken: 'gho_secret_4b2d',
  prompt: 'SECRET PROMPT TEXT 4b2d',
};

let mod;
const saved = {};
const realFetch = globalThis.fetch;
let lines = [];
let restore;

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);
  mod = {
    log: await import('../lib/security-log.ts'),
    signIn: (await import('../app/api/auth/github/route.ts')).GET,
    callback: (await import('../app/api/auth/github/callback/route.ts')).GET,
    signOut: (await import('../app/api/auth/signout/route.ts')).POST,
    deleteAccount: (await import('../app/api/account/route.ts')).DELETE,
    shares: await import('../app/api/shares/route.ts'),
    share: await import('../app/api/shares/[token]/route.ts'),
    prompts: await import('../app/api/prompts/route.ts'),
    admin: (await import('../app/api/admin/overview/route.ts')).GET,
    store: await import('../lib/store/index.ts'),
    session: await import('../lib/auth/session.ts'),
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

const headers = (extra = {}) => ({ 'x-forwarded-for': SECRETS.ip, ...extra });

async function signIn() {
  globalThis.fetch = async (url) => {
    if (String(url).includes('access_token')) return Response.json({ access_token: SECRETS.githubToken });
    return Response.json({ id: 424242, login: SECRETS.login, name: SECRETS.name, avatar_url: SECRETS.avatar });
  };
  const started = await mod.signIn(new Request(`${ORIGIN}/api/auth/github`, { headers: headers() }));
  const stateCookie = started.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_oauth='));
  const packed = stateCookie.slice(stateCookie.indexOf('=') + 1, stateCookie.indexOf(';'));
  const nonce = packed.slice(0, packed.indexOf('.'));
  const finished = await mod.callback(
    new Request(`${ORIGIN}/api/auth/github/callback?code=${SECRETS.code}&state=${nonce}`, {
      headers: headers({ cookie: `__Host-trazum_oauth=${packed}` }),
    }),
  );
  const sessionCookie = finished.headers.getSetCookie().find((c) => c.startsWith('__Host-trazum_session='));
  const token = sessionCookie.slice(sessionCookie.indexOf('=') + 1, sessionCookie.indexOf(';'));
  const store = await mod.store.getStore();
  const { user } = await store.findSession(mod.session.hashToken(token), new Date());
  return { user, token, packed, nonce, cookie: `__Host-trazum_session=${token}` };
}

const parsed = () => lines.map((line) => JSON.parse(line));
const events = () => parsed().map((line) => `${line.event}:${line.outcome}${line.reason ? `:${line.reason}` : ''}`);

describe('every security decision writes one line', () => {
  it('records an account from sign-in to deletion, and every refusal on the way', async () => {
    const me = await signIn();

    // A callback whose state does not match is refused and recorded.
    await mod.callback(
      new Request(`${ORIGIN}/api/auth/github/callback?code=${SECRETS.code}&state=wrong`, {
        headers: headers({ cookie: `__Host-trazum_oauth=${me.packed}` }),
      }),
    );

    // A share made, then revoked; then a revoke of a link this account does not own.
    const made = await mod.shares.POST(
      new Request(`${ORIGIN}/api/shares`, {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json', cookie: me.cookie }),
        body: JSON.stringify({ before: SECRETS.prompt, after: `${SECRETS.prompt}!`, ttl: '7' }),
      }),
    );
    assert.equal(made.status, 201, await made.clone().text());
    const { token: shareToken } = await made.json();
    SECRETS.shareToken = shareToken;
    const revoke = (token) =>
      mod.share.DELETE(new Request(`${ORIGIN}/api/shares/${token}`, { method: 'DELETE', headers: headers({ cookie: me.cookie }) }), {
        params: Promise.resolve({ token }),
      });
    assert.equal((await revoke(shareToken)).status, 204);
    assert.equal((await revoke(shareToken)).status, 404);

    // The library refuses a stranger, and a cross-origin write.
    await mod.prompts.GET(new Request(`${ORIGIN}/api/prompts`, { headers: headers() }));
    await mod.prompts.POST(
      new Request(`${ORIGIN}/api/prompts`, {
        method: 'POST',
        headers: headers({ cookie: me.cookie, origin: 'https://evil.example', 'content-type': 'application/json' }),
        body: JSON.stringify({ name: 'x', text: SECRETS.prompt }),
      }),
    );

    // The admin overview turns away somebody who is not on the list.
    await mod.admin(new Request(`${ORIGIN}/api/admin/overview`, { headers: headers({ cookie: me.cookie }) }));

    // Signed out, signed back in, and the account deleted.
    await mod.signOut(new Request(`${ORIGIN}/api/auth/signout`, { method: 'POST', headers: headers({ cookie: me.cookie }) }));
    const again = await signIn();
    SECRETS.secondToken = again.token;
    const deleted = await mod.deleteAccount(
      new Request(`${ORIGIN}/api/account`, {
        method: 'DELETE',
        headers: headers({ cookie: again.cookie, 'content-type': 'application/json' }),
        body: JSON.stringify({ confirm: SECRETS.login }),
      }),
    );
    assert.equal(deleted.status, 204);

    assert.deepEqual(events(), [
      'auth.sign_in:success',
      'auth.sign_in:failure:state_mismatch',
      'share.created:success',
      'share.revoked:success',
      'share.revoked:failure:not_owner',
      'access.refused:failure:not_signed_in',
      'access.refused:failure:cross_origin',
      'admin.access:failure:not_admin',
      'auth.sign_out:success',
      'auth.sign_in:success',
      'account.deleted:success',
    ]);
    const ids = parsed().filter((line) => line.userId).map((line) => line.userId);
    assert.ok(ids.every((id) => id === me.user.id), 'every line names the same internal id');

    // ...and nothing secret in any of it.
    const all = lines.join('\n');
    const planted = {
      ...SECRETS,
      token: me.token,
      tokenHash: mod.session.hashToken(me.token),
      secondTokenHash: mod.session.hashToken(SECRETS.secondToken),
      state: me.nonce,
    };
    for (const [what, value] of Object.entries(planted)) {
      assert.ok(!all.includes(value), `the security log carries the ${what}`);
    }
    for (const line of parsed()) {
      assert.deepEqual(
        Object.keys(line).filter((key) => !['type', 'event', 'outcome', 'at', 'userId', 'reason', 'route'].includes(key)),
        [],
        'a line carries a field the vocabulary does not declare',
      );
      assert.ok(!line.route || !line.route.includes('?'), 'a route kept its query');
    }
  });
});

describe('the route a line records', () => {
  it('drops the query and replaces every capability token', () => {
    const route = (url) => mod.log.routeOf(new Request(url));
    assert.equal(route(`${ORIGIN}/api/auth/github/callback?code=x&state=y`), '/api/auth/github/callback');
    assert.equal(route(`${ORIGIN}/api/shares/abc123`), '/api/shares/:token');
    assert.equal(route(`${ORIGIN}/c/abc123?ref=mail`), '/c/:token');
  });

  it('never lets a broken sink break the request that wrote to it', () => {
    restore?.();
    restore = mod.log.captureSecurityLog(() => {
      throw new Error('disk full');
    });
    assert.doesNotThrow(() => mod.log.securityEvent('auth.sign_in', 'success'));
  });
});

describe('the last-resort error line', () => {
  /**
   * What `instrumentation.ts` writes for an error nothing caught. Planted in
   * the error and the request: everything a message from a parser or a driver
   * could quote, and everything a URL or a header could carry.
   */
  const SHARE_TOKEN = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
  const planted = () => {
    const error = new Error(`Unexpected token in JSON at position 4: "${SECRETS.prompt}" for ${SECRETS.login}`);
    error.digest = '2834617703';
    error.stack = `Error: ${SECRETS.prompt}\n    at ${SECRETS.githubToken}`;
    return error;
  };
  const request = {
    path: `/c/${SHARE_TOKEN}?code=${SECRETS.code}`,
    method: 'GET',
    headers: { cookie: `__Host-trazum_session=${SECRETS.githubToken}`, 'x-forwarded-for': SECRETS.ip },
  };

  it('records the route pattern, the method, the kind and the digest the error page shows', () => {
    mod.log.unhandledError(planted(), request, { routePath: '/c/[token]', routeType: 'render' }, new Date('2026-11-05T12:00:00Z'));
    assert.deepEqual(parsed(), [
      { type: 'error', at: '2026-11-05T12:00:00.000Z', route: '/c/[token]', method: 'GET', kind: 'render', digest: '2834617703' },
    ]);
  });

  it('writes nothing from the message, the stack, the path or the headers', () => {
    mod.log.unhandledError(planted(), request, { routePath: '/c/[token]', routeType: 'render' });
    const written = lines.join('\n');
    for (const value of [...Object.values(SECRETS), SHARE_TOKEN, 'Unexpected token']) {
      assert.ok(!written.includes(value), `the error line carries ${value}`);
    }
  });

  it('writes "unknown" for anything that is not the shape the framework promised', () => {
    const odd = Object.assign(new Error('x'), { digest: `${SECRETS.prompt} with spaces` });
    mod.log.unhandledError(odd, { method: 'get; drop' }, { routePath: `/c/${SHARE_TOKEN}?code=${SECRETS.code}`, routeType: 'telepathy' });
    mod.log.unhandledError('a thrown string', {}, {});
    const [first, second] = parsed();
    assert.deepEqual(
      { route: first.route, method: first.method, kind: first.kind, digest: first.digest },
      { route: 'unknown', method: 'unknown', kind: 'unknown', digest: undefined },
    );
    assert.equal(second.route, 'unknown');
    assert.ok(!lines.join('\n').includes(SECRETS.prompt));
  });

  it('is what instrumentation.ts calls', async () => {
    const { onRequestError } = await import('../instrumentation.ts');
    onRequestError(planted(), request, { routePath: '/api/prompts/[id]', routeType: 'route' });
    assert.equal(parsed()[0].route, '/api/prompts/[id]');
    assert.equal(parsed()[0].digest, '2834617703');
  });
});

