import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { join, relative } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

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

describe('a request refused for what it sent writes one line', () => {
  /**
   * OWASP ASVS 4.0.3 7.1.3: input validation and deserialization failures are
   * security events. The answers below quote what was sent on purpose, so a
   * person can see what to fix; the line records the reason and never the
   * answer, so a secret planted in the input is searched for in every line.
   */
  const SECRET_RULE = 'secret-rule-9f3a';
  const send = (url, body, type = 'application/json', extra = {}) =>
    new Request(url, {
      method: 'POST',
      headers: headers({ 'content-type': type, ...extra }),
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const reasons = () => parsed().map((line) => `${line.event}:${line.reason}:${line.route}`);

  it('on the anonymous tools: the reason and the route, and nothing that was sent', async () => {
    const bad = {
      optimize: { prompt: SECRETS.prompt, disableRules: [SECRET_RULE] },
      compare: { before: SECRETS.prompt, after: `${SECRETS.prompt}!`, disableRules: [SECRET_RULE] },
      write: { answers: { [SECRET_RULE]: SECRETS.prompt } },
    };
    const expected = [];
    for (const name of Object.keys(bad)) {
      const { POST } = await import(`../app/api/${name}/route.ts`);
      const url = `${ORIGIN}/api/${name}`;
      const answers = [
        await POST(send(url, SECRETS.prompt, 'text/plain')),
        await POST(send(url, `{"prompt": "${SECRETS.prompt}"`)),
        await POST(send(url, bad[name])),
      ];
      assert.deepEqual(answers.map((answer) => answer.status), [415, 400, 400], name);
      assert.match(await answers[2].text(), new RegExp(SECRET_RULE), `${name} no longer quotes the input, so nothing is planted`);
      expected.push(...['not_json', 'invalid_json', 'invalid_input'].map((reason) => `input.refused:${reason}:/api/${name}`));
    }
    assert.deepEqual(reasons(), expected);
    assert.ok(parsed().every((line) => line.outcome === 'failure' && !line.userId));
    for (const value of [SECRET_RULE, SECRETS.prompt, SECRETS.ip]) {
      assert.ok(!lines.join('\n').includes(value), `an input refusal carries ${value}`);
    }
  });

  it('on the library, the shares and the account: the account it came from too', async () => {
    const me = await signIn();
    const cookie = { cookie: me.cookie };
    const created = await mod.prompts.POST(send(`${ORIGIN}/api/prompts`, { name: 'kept', text: SECRETS.prompt }, 'application/json', cookie));
    assert.equal(created.status, 201);
    const { prompt } = await created.json();
    const one = await import('../app/api/prompts/[id]/route.ts');
    const params = { params: Promise.resolve({ id: prompt.id }) };
    lines = [];

    await mod.prompts.POST(send(`${ORIGIN}/api/prompts`, SECRETS.prompt, 'text/plain', cookie));
    await mod.prompts.POST(send(`${ORIGIN}/api/prompts`, '{not json', 'application/json', cookie));
    await mod.prompts.POST(send(`${ORIGIN}/api/prompts`, { name: '', text: SECRETS.prompt }, 'application/json', cookie));
    await one.PATCH(new Request(`${ORIGIN}/api/prompts/${prompt.id}`, { method: 'PATCH', headers: headers({ 'content-type': 'application/json', ...cookie }), body: '{"name": ' }), params);
    await one.POST(send(`${ORIGIN}/api/prompts/${prompt.id}`, { text: '' }, 'application/json', cookie), params);
    await mod.shares.POST(send(`${ORIGIN}/api/shares`, { before: SECRETS.prompt, after: `${SECRETS.prompt}!`, ttl: SECRET_RULE }, 'application/json', cookie));
    const account = (body) =>
      mod.deleteAccount(new Request(`${ORIGIN}/api/account`, { method: 'DELETE', headers: headers({ 'content-type': 'application/json', ...cookie }), body }));
    assert.equal((await account(JSON.stringify({ confirm: SECRET_RULE }))).status, 400);
    assert.equal((await account('{"confirm": ')).status, 400);

    assert.deepEqual(reasons(), [
      'input.refused:not_json:/api/prompts',
      'input.refused:invalid_json:/api/prompts',
      'input.refused:invalid_input:/api/prompts',
      // The id is redacted like a token: a line names the kind of route, not the record.
      'input.refused:invalid_json:/api/prompts/:token',
      'input.refused:invalid_input:/api/prompts/:token',
      'input.refused:invalid_input:/api/shares',
      'input.refused:invalid_input:/api/account',
      'input.refused:invalid_json:/api/account',
    ]);
    assert.ok(parsed().every((line) => line.userId === me.user.id), 'a refusal on a signed-in route does not name the account');
    for (const value of [SECRET_RULE, SECRETS.prompt, SECRETS.login, SECRETS.ip, me.token, prompt.id]) {
      assert.ok(!lines.join('\n').includes(value), `an input refusal carries ${value}`);
    }
  });

  it('and nothing for a request it took, or turned away for another reason', async () => {
    const { POST } = await import('../app/api/optimize/route.ts');
    assert.equal((await POST(send(`${ORIGIN}/api/optimize`, { prompt: 'Summarise this.' }))).status, 200);
    const me = await signIn();
    const make = () => mod.prompts.POST(send(`${ORIGIN}/api/prompts`, { name: 'twice', text: 'x' }, 'application/json', { cookie: me.cookie }));
    assert.equal((await make()).status, 201);
    assert.equal((await make()).status, 409, 'a name already taken');
    await mod.prompts.POST(send(`${ORIGIN}/api/prompts`, '{not json'));
    assert.deepEqual(events(), ['auth.sign_in:success', 'access.refused:failure:not_signed_in']);
  });
});

describe('a session cookie that opens nothing', () => {
  /**
   * OWASP ASVS 4.0.3 7.2.1: every authentication decision is logged, and a
   * presented cookie that resolves to no live session is one. A visitor with
   * no cookie is not, and writes nothing.
   */
  const FORGED = 'forged-cookie-value-5e1d';
  const ask = async (cookie) => {
    const { GET } = await import('../app/api/auth/session/route.ts');
    return GET(new Request(`${ORIGIN}/api/auth/session`, { headers: headers(cookie ? { cookie } : {}) }));
  };

  it('writes nothing for a visitor, and one line for a cookie no session has', async () => {
    await ask(null);
    assert.deepEqual(lines, [], 'a visitor with no cookie was recorded');
    const answer = await ask(`__Host-trazum_session=${FORGED}`);
    assert.equal((await answer.json()).user, null);
    assert.deepEqual(events(), ['auth.session:failure:unknown_session']);
    assert.equal(parsed()[0].route, '/api/auth/session');
    assert.equal(parsed()[0].userId, undefined);
    assert.ok(!lines.join('\n').includes(FORGED), 'the cookie reached the log');
    assert.ok(!lines.join('\n').includes(mod.session.hashToken(FORGED)), 'its hash reached the log');
  });

  it('names the account when policy ended the session, and ends it', async () => {
    const me = await signIn();
    const issued = mod.session.issueSession(me.user.id, new Date(Date.now() - 2 * 3600_000), true);
    const store = await mod.store.getStore();
    await store.createSession(issued.record);
    process.env.TRAZUM_SESSION_MAX_HOURS = '1';
    try {
      lines = [];
      await ask(`__Host-trazum_session=${issued.token}`);
    } finally {
      delete process.env.TRAZUM_SESSION_MAX_HOURS;
    }
    assert.deepEqual(events(), ['auth.session:failure:session_ended']);
    assert.equal(parsed()[0].userId, me.user.id);
    assert.equal(await store.findSession(mod.session.hashToken(issued.token), new Date()), null);
    assert.ok(!lines.join('\n').includes(issued.token));
  });

  it('clears that cookie where sessions are durable, and leaves it where another instance may hold it', async () => {
    const cleared = (answer) => answer.headers.getSetCookie().some((c) => c.startsWith('__Host-trazum_session=;'));
    assert.equal(cleared(await ask(`__Host-trazum_session=${FORGED}`)), false, 'the memory store cleared a cookie another instance may know');
    const store = await mod.store.getStore();
    store.ephemeral = false;
    try {
      assert.equal(cleared(await ask(`__Host-trazum_session=${FORGED}`)), true, 'a durable store left a dead cookie in place');
      const me = await signIn();
      assert.equal(cleared(await ask(me.cookie)), false, 'a live session was signed out');
      assert.equal(cleared(await ask(null)), false);
    } finally {
      store.ephemeral = true;
    }
  });
});

describe('every route that can refuse its input records the refusal', () => {
  /**
   * The wrapper is what makes the record complete: it writes the line for
   * any refusal its handler returns, so a refusal added later needs nobody to
   * remember. That holds only while every such route uses it, and only while
   * each body that will not parse is marked as one.
   */
  const API = fileURLToPath(new URL('../app/api/', import.meta.url));
  const routeFiles = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return routeFiles(path);
      return name === 'route.ts' ? [path] : [];
    });
  const routes = routeFiles(API).map((path) => ({ route: relative(API, path), source: readFileSync(path, 'utf8') }));
  const refusing = routes.filter(({ source }) => /[\s,:](413|415|422)\b/.test(source) || source.includes('request.json()'));

  it('finds the routes at all', () => {
    assert.ok(refusing.length >= 7, `only ${refusing.length} routes refuse input: has app/api moved?`);
  });

  it('and a 400 anywhere else is a decision already written down just above it', () => {
    /**
     * The GitHub callback reads no body and answers 400 to a sign-in it could
     * not verify. Each of those is an `auth.sign_in` failure with its reason,
     * written on the line before; wrapping the route would record it twice.
     * Any other 400 outside the wrapper has to be recorded the same way.
     */
    let checked = 0;
    for (const { route, source } of routes.filter((r) => !refusing.includes(r))) {
      const lines = source.split('\n');
      lines.forEach((line, i) => {
        if (!/[\s,:]400\b/.test(line)) return;
        checked += 1;
        const above = lines.slice(Math.max(0, i - 15), i).join('\n');
        assert.match(above, /securityEvent\(/, `${route}:${i + 1} answers 400 and records nothing`);
      });
    }
    assert.ok(checked >= 2, 'the callback no longer answers 400: is this check still looking at anything?');
  });

  it('exports every handler of such a route through logsRefusedInput', () => {
    for (const { route, source } of refusing) {
      assert.doesNotMatch(source, /^export async function (GET|POST|PUT|PATCH|DELETE)\(/m, `${route} exports a handler that logs nothing`);
      const exported = [...source.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE) = (.*)$/gm)];
      assert.ok(exported.length > 0, `${route} exports no handler`);
      for (const [, method, value] of exported) assert.match(value, /^logsRefusedInput\(\w+\);$/, `${route} ${method}`);
    }
  });

  it('and marks each body that will not parse', () => {
    for (const { route, source } of refusing) {
      const reads = source.split('request.json()').length - 1;
      const marks = source.split('unreadableBody(').length - 1;
      assert.equal(marks, reads, `${route}: ${reads} bodies read, ${marks} parse failures marked`);
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

