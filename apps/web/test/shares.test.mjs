import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * Share links, which are the only thing in Trazum that serves one person's
 * prompt to a stranger.
 *
 * That inverts what the other suites check. There, the question is *can Mallory
 * reach Alice's data* and the answer must be no. Here the answer is deliberately
 * yes — for anyone holding the token — so the questions worth asking are
 * different:
 *
 * - Is the token actually unguessable, and does anything shorter get refused
 *   before it reaches the store?
 * - Does an expired link become indistinguishable from one that never existed?
 * - Can a stranger cause a **write**? (No: reading a share must not count views,
 *   touch a timestamp, or do anything else that makes an anonymous request a
 *   lever.)
 * - Can a stranger revoke, or list, or create?
 * - Do the settings that get replayed on every future view come from a
 *   whitelist, or from whatever the client sent?
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let sharesRoute, shareToken, api, limits;
let getStore, resetStore, issueSession;

const saved = {};
let clients = 0;

function req(url, init = {}) {
  clients += 1;
  return new Request(url, {
    ...init,
    headers: { 'x-forwarded-for': `192.0.2.${clients % 250}`, ...(init.headers ?? {}) },
  });
}

const post = (body, cookie) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  sharesRoute = await import('../app/api/shares/route.ts');
  shareToken = await import('../app/api/shares/[token]/route.ts');
  api = await import('../lib/shares/api.ts');
  limits = await import('../lib/store/shares.ts');
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
  ({ issueSession } = await import('../lib/auth/session.ts'));
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

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

const BEFORE = 'You should always make sure to answer politely.';
const AFTER = 'Always answer politely.';

async function share(cookie = alice.cookie, body = {}) {
  const response = await sharesRoute.POST(
    req(`${ORIGIN}/api/shares`, post({ before: BEFORE, after: AFTER, ...body }, cookie)),
  );
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

const params = (token) => ({ params: Promise.resolve({ token }) });

// ---------------------------------------------------------------------------

describe('creating a link is a deliberate publication', () => {
  it('requires a signed-in caller', async () => {
    const response = await sharesRoute.POST(
      req(`${ORIGIN}/api/shares`, post({ before: BEFORE, after: AFTER })),
    );
    assert.equal(response.status, 401);
  });

  it('refuses a cross-origin request', async () => {
    const response = await sharesRoute.POST(
      req(`${ORIGIN}/api/shares`, {
        ...post({ before: BEFORE, after: AFTER }, alice.cookie),
        headers: {
          'content-type': 'application/json',
          cookie: alice.cookie,
          origin: 'https://evil.example',
        },
      }),
    );
    assert.equal(response.status, 403);
  });

  it('returns an absolute URL built from the configured origin', async () => {
    const created = await share();
    assert.equal(created.url, `${ORIGIN}/c/${created.token}`);
  });

  it('builds it from configuration even when the request says otherwise', async () => {
    /**
     * The one mutation the rest of this file cannot kill.
     *
     * Every other request here is built on `ORIGIN`, which is also
     * `TRAZUM_PUBLIC_URL` — so a share URL derived from the request's own host
     * comes out identical and the assertion above passes either way. This is the
     * request that separates them, and it is worth having because the failure
     * mode is not cosmetic: a link built from a client-supplied host is a link
     * that points wherever the client said, handed to a colleague by somebody
     * who trusted it.
     */
    const response = await sharesRoute.POST(
      new Request('https://evil.example/api/shares', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alice.cookie,
          'x-forwarded-for': '192.0.2.201',
          // No `origin` header, so the same-origin check does not refuse this
          // first — the point is what the URL is built from, not whether a
          // browser sent it.
          host: 'evil.example',
        },
        body: JSON.stringify({ before: BEFORE, after: AFTER }),
      }),
    );

    assert.equal(response.status, 201);
    const created = await response.json();
    assert.ok(
      created.url.startsWith(`${ORIGIN}/c/`),
      `share URL followed the request host: ${created.url}`,
    );
    assert.ok(!created.url.includes('evil.example'));
  });

  it('mints a 256-bit token, and a different one each time', async () => {
    const a = await share();
    const b = await share();
    assert.notEqual(a.token, b.token);
    assert.equal(Buffer.from(a.token, 'base64url').length, 32);
    assert.ok(api.isShareToken(a.token));
    // Not derived from the content: two shares of the same comparison differ.
    assert.ok(!a.token.includes('politely'));
  });

  it('expires in thirty days unless told otherwise', async () => {
    const created = await share();
    const days = (new Date(created.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days < 30.1, `expected ~30 days, got ${days}`);
  });

  it('honours an explicit lifetime, including never', async () => {
    const week = await share(alice.cookie, { ttl: '7' });
    const days = (new Date(week.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 6.9 && days < 7.1);

    const forever = await share(alice.cookie, { ttl: 'never' });
    assert.equal(forever.expiresAt, null);
  });

  it('refuses a lifetime it does not offer', async () => {
    const response = await sharesRoute.POST(
      req(`${ORIGIN}/api/shares`, post({ before: BEFORE, after: AFTER, ttl: '3650' }, alice.cookie)),
    );
    assert.equal(response.status, 400);
  });

  it('refuses an empty side and an oversized one', async () => {
    for (const body of [
      { before: '', after: AFTER },
      { before: BEFORE, after: '   ' },
      { before: 'a'.repeat(api.MAX_SHARE_PROMPT_CHARS + 1), after: AFTER },
    ]) {
      const response = await sharesRoute.POST(req(`${ORIGIN}/api/shares`, post(body, alice.cookie)));
      assert.equal(response.status, 400);
    }
  });

  it('refuses the hundred and first link rather than dropping the first', async () => {
    const store = await getStore();
    for (let i = 0; i < limits.MAX_SHARES_PER_OWNER; i++) {
      await store.shares.createShare({
        token: api.mintShareToken(),
        ownerId: alice.user.id,
        ownerLogin: 'alice',
        beforeText: BEFORE,
        afterText: AFTER,
        settings: { level: 'safe', optimizeBoth: false, disableRules: [], model: 'm', callsPerMonth: 1, avgOutputTokens: 1, cacheHitRate: 0, batchEligible: false },
        now: new Date(),
        expiresAt: null,
      });
    }

    const response = await sharesRoute.POST(
      req(`${ORIGIN}/api/shares`, post({ before: BEFORE, after: AFTER }, alice.cookie)),
    );
    assert.equal(response.status, 409);
    assert.equal((await store.shares.listShares(alice.user.id, new Date())).length, limits.MAX_SHARES_PER_OWNER);
  });
});

// ---------------------------------------------------------------------------

describe('the settings a link replays come from a whitelist', () => {
  it('keeps only the keys it declares', async () => {
    await share(alice.cookie, {
      settings: {
        level: 'aggressive',
        optimizeBoth: true,
        model: 'claude-opus-5',
        callsPerMonth: 5000,
        // Not a field. Must not survive into the stored object, because whatever
        // is stored is handed back to the core on every future view.
        __proto__: { polluted: true },
        somethingElse: 'nope',
      },
    });

    const store = await getStore();
    const [summary] = await store.shares.listShares(alice.user.id, new Date());
    const record = await store.shares.findShare(summary.token, new Date());

    assert.deepEqual(Object.keys(record.settings).sort(), [
      'avgOutputTokens',
      'batchEligible',
      'cacheHitRate',
      'callsPerMonth',
      'disableRules',
      'level',
      'model',
      'optimizeBoth',
    ]);
    assert.equal(record.settings.level, 'aggressive');
    assert.equal(record.settings.callsPerMonth, 5000);
  });

  it('rejects an unknown model and an unknown rule rather than falling back', async () => {
    // A silent fallback would price the comparison against something the sharer
    // did not pick, on a page they cannot see.
    for (const settings of [{ model: 'gpt-imaginary' }, { disableRules: ['no-such-rule'] }]) {
      const response = await sharesRoute.POST(
        req(`${ORIGIN}/api/shares`, post({ before: BEFORE, after: AFTER, settings }, alice.cookie)),
      );
      assert.equal(response.status, 400);
    }
  });

  it('clamps a nonsensical number instead of refusing the link', async () => {
    // The numbers come from whatever the Compare tab happened to hold; refusing
    // the whole publication over a call volume of −1 helps nobody.
    const parsed = api.parseSettings({ callsPerMonth: -1, cacheHitRate: 9, avgOutputTokens: 1e12 });
    assert.equal(parsed.value.callsPerMonth, 0);
    assert.equal(parsed.value.cacheHitRate, 1);
    assert.equal(parsed.value.avgOutputTokens, 1_000_000);
  });

  it('reads level as safe for anything that is not the literal word', async () => {
    for (const level of ['aggressive ', 'AGGRESSIVE', true, 1, null]) {
      assert.equal(api.parseSettings({ level }).value.level, 'safe', String(level));
    }
    assert.equal(api.parseSettings({ level: 'aggressive' }).value.level, 'aggressive');
  });
});

// ---------------------------------------------------------------------------

describe('a link is a bearer capability, and nothing more', () => {
  it('is readable by anyone holding the token', async () => {
    const created = await share();
    const store = await getStore();
    const record = await store.shares.findShare(created.token, new Date());

    assert.ok(record, 'no owner was needed to read it');
    assert.equal(record.beforeText, BEFORE);
    assert.equal(record.ownerLogin, 'alice');
  });

  it('reading it writes nothing', async () => {
    const created = await share();
    const store = await getStore();

    const first = await store.shares.findShare(created.token, new Date());
    const second = await store.shares.findShare(created.token, new Date());

    // Every field identical across two reads. A view counter or a last-seen
    // timestamp would make an unauthenticated request a lever, which is exactly
    // what this asserts is not the case.
    assert.deepEqual(first, second);
  });

  it('becomes indistinguishable from a link that never existed once it expires', async () => {
    const created = await share(alice.cookie, { ttl: '7' });
    const store = await getStore();

    const past = new Date(Date.now() + 6 * 86_400_000);
    assert.ok(await store.shares.findShare(created.token, past), 'still live on day six');

    const future = new Date(Date.now() + 8 * 86_400_000);
    assert.equal(await store.shares.findShare(created.token, future), null);
    assert.equal(await store.shares.findShare(api.mintShareToken(), future), null);
  });

  it('cannot be revoked by anyone but its owner', async () => {
    const created = await share();

    const stranger = await shareToken.DELETE(
      req(`${ORIGIN}/api/shares/${created.token}`, {
        method: 'DELETE',
        headers: { cookie: mallory.cookie },
      }),
      params(created.token),
    );
    const absent = await shareToken.DELETE(
      req(`${ORIGIN}/api/shares/x`, { method: 'DELETE', headers: { cookie: mallory.cookie } }),
      params(api.mintShareToken()),
    );

    assert.equal(stranger.status, 404);
    assert.equal(absent.status, 404);

    const store = await getStore();
    assert.ok(await store.shares.findShare(created.token, new Date()), 'the link survived');
  });

  it('is gone the moment its owner revokes it', async () => {
    const created = await share();
    const response = await shareToken.DELETE(
      req(`${ORIGIN}/api/shares/${created.token}`, {
        method: 'DELETE',
        headers: { cookie: alice.cookie },
      }),
      params(created.token),
    );
    assert.equal(response.status, 204);

    const store = await getStore();
    assert.equal(await store.shares.findShare(created.token, new Date()), null);
  });

  it('refuses a malformed token before it reaches the store', async () => {
    const store = await getStore();
    const real = store.shares.revokeShare.bind(store.shares);
    const asked = [];
    store.shares.revokeShare = async (token, ownerId) => {
      asked.push(token);
      return real(token, ownerId);
    };

    try {
      for (const token of ['short', '../../etc/passwd', 'a'.repeat(200), "' or 1=1 --"]) {
        const response = await shareToken.DELETE(
          req(`${ORIGIN}/api/shares/x`, { method: 'DELETE', headers: { cookie: alice.cookie } }),
          params(token),
        );
        assert.equal(response.status, 404, token);
      }
      assert.deepEqual(asked, [], 'a value that is not a token reached the store');
    } finally {
      store.shares.revokeShare = real;
    }
  });
});

// ---------------------------------------------------------------------------

describe('the owner’s list of links', () => {
  it('never carries the prompts, only a preview', async () => {
    const long = 'secret detail '.repeat(100);
    await share(alice.cookie, {});
    const store = await getStore();
    await store.shares.createShare({
      token: api.mintShareToken(),
      ownerId: alice.user.id,
      ownerLogin: 'alice',
      beforeText: long,
      afterText: long,
      settings: api.parseSettings({}).value,
      now: new Date(),
      expiresAt: null,
    });

    const response = await sharesRoute.GET(
      req(`${ORIGIN}/api/shares`, { headers: { cookie: alice.cookie } }),
    );
    const body = await response.json();

    assert.equal(body.shares.length, 2);
    for (const entry of body.shares) {
      assert.ok(entry.preview.length <= limits.SHARE_PREVIEW_CHARS);
    }
    assert.ok(JSON.stringify(body).length < long.length, 'the whole prompt is not in the list');
  });

  it('shows only this account’s links, and only live ones', async () => {
    await share(alice.cookie);
    await share(mallory.cookie);

    const store = await getStore();
    await store.shares.createShare({
      token: api.mintShareToken(),
      ownerId: alice.user.id,
      ownerLogin: 'alice',
      beforeText: BEFORE,
      afterText: AFTER,
      settings: api.parseSettings({}).value,
      now: new Date(),
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await sharesRoute.GET(
      req(`${ORIGIN}/api/shares`, { headers: { cookie: alice.cookie } }),
    );
    assert.equal((await response.json()).shares.length, 1, 'one live link, not two and not three');
  });

  it('requires a signed-in caller and is never cacheable', async () => {
    assert.equal((await sharesRoute.GET(req(`${ORIGIN}/api/shares`))).status, 401);

    const response = await sharesRoute.GET(
      req(`${ORIGIN}/api/shares`, { headers: { cookie: alice.cookie } }),
    );
    assert.match(response.headers.get('cache-control'), /no-store/);
  });
});

// ---------------------------------------------------------------------------

describe('the shared page keeps itself out of search results', () => {
  const source = readFileSync(new URL('../app/c/[token]/page.tsx', import.meta.url), 'utf8');

  /**
   * Code only.
   *
   * The page's own comment explains, at length, that nothing here may reach for
   * `dangerouslySetInnerHTML` — which meant the test asserting the file does not
   * contain that string failed on the sentence saying so. Second time this
   * repository has made that mistake; the first was a comment about `force row
   * level security` in a schema.
   */
  const page = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const robots = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8');

  it('declares noindex in its own metadata', () => {
    assert.match(page, /robots: \{ index: false, follow: false, nocache: true \}/);
  });

  it('sends no referrer, because the token is in the path', () => {
    assert.match(page, /referrer: 'no-referrer'/);
  });

  it('is disallowed in robots.txt as well', () => {
    // Two independent defences that fail differently: robots.txt stops the
    // fetch, the meta tag stops the indexing of a fetch that happened anyway.
    assert.match(robots, /'\/c\/'/);
  });

  it('is never prerendered or cached', () => {
    assert.match(page, /export const dynamic = 'force-dynamic'/);
  });

  it('never reaches for dangerouslySetInnerHTML', () => {
    // The content is attacker-supplied by construction: the sharer chose it and
    // the reader did not.
    assert.ok(!page.includes('dangerouslySetInnerHTML'));
  });

  it('recomputes the comparison rather than rendering a stored one', () => {
    assert.match(page, /comparePrompts\(share\.beforeText, share\.afterText/);
    // And takes the delta from the core rather than subtracting again, which is
    // how a second consumer ends up with the opposite sign convention.
    assert.match(page, /const \{ tokenDelta, deltaPct, monthlyDeltaUsd \} = comparison;/);
  });

  it('checks the token before asking the store', () => {
    const guard = page.indexOf('isShareToken');
    const lookup = page.indexOf('findShare');
    assert.ok(guard > 0 && guard < lookup, 'the token is validated first');
  });
});

// ---------------------------------------------------------------------------

describe('the share control warns before it publishes', () => {
  const control = readFileSync(new URL('../components/ShareControl.tsx', import.meta.url), 'utf8');

  it('renders the warning above the button, not behind a dialog', () => {
    const warning = control.indexOf('t.share.warning');
    const button = control.indexOf('t.share.button');
    assert.ok(warning > 0 && warning < button, 'the warning comes first');
  });

  it('says the link is readable without signing in', () => {
    const en = readFileSync(new URL('../lib/i18n/en.ts', import.meta.url), 'utf8');
    const warning = /warning:\s*\n?\s*'([^']+)'/.exec(en)?.[1] ?? '';
    assert.match(warning, /anyone who has the URL/i);
    assert.match(warning, /no sign-in required/i);
  });

  it('renders nothing at all for a signed-out reader', () => {
    assert.match(control, /if \(!enabled\) return null;/);
  });

  it('sends cookies deliberately on every call', () => {
    const fetches = control.match(/fetch\(/g) ?? [];
    const credentialled = control.match(/credentials: 'same-origin'/g) ?? [];
    assert.equal(fetches.length, credentialled.length);
  });
});

// ---------------------------------------------------------------------------

describe('the schema matches the driver', () => {
  const source = readFileSync(new URL('../db/003_shares.sql', import.meta.url), 'utf8');
  const schema = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  it('declares every column the driver reads or writes', () => {
    for (const column of ['token', 'owner_id', 'owner_login', 'before_text', 'after_text', 'settings', 'expires_at']) {
      assert.ok(schema.includes(column), `missing ${column}`);
    }
  });

  it('has no view counter, so an anonymous read stays a read', () => {
    assert.ok(!schema.includes('view_count'));
    assert.ok(!schema.includes('last_viewed'));
  });

  it('cascades when the owner is deleted', () => {
    assert.ok(schema.includes('on delete cascade'));
  });

  it('enables row level security without forcing it', () => {
    assert.ok(schema.includes('alter table trazum_shares enable row level security'));
    assert.ok(!schema.includes('force row level security'));
  });

  it('can be applied twice', () => {
    for (const statement of source.split(';').filter((s) => /create (table|index)/i.test(s))) {
      assert.match(statement, /if not exists/i);
    }
  });
});
