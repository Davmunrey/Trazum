import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The deployment overview: the only surface that reads across accounts.
 *
 * Two questions carry this file, and they pull in opposite directions.
 *
 * **Who can reach it.** The default is nobody: `TRAZUM_ADMINS` unset means the
 * route 404s for everyone, including the person who deployed it. A non-admin who
 * is signed in gets the same 404 as a stranger, because a 403 would confirm that
 * an admin dashboard exists here and that they are not on the list.
 *
 * **What it is allowed to say.** An aggregate over other people's work is a
 * privacy decision wearing a dashboard's clothes. It reports counts, names and
 * logins, and never a line of anybody's prompt — so the tests below assert the
 * absence of the text, not just the presence of the totals.
 *
 * And the numbers: every one of them has to be reproducible by running the rules
 * on the same prompt. There is no score, and a test says so.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let overviewRoute, adminConfig, buildOverview, limits;
let getStore, resetStore, issueSession;

const saved = {};
let clients = 0;

function req(init = {}) {
  clients += 1;
  return new Request(`${ORIGIN}/api/admin/overview`, {
    ...init,
    headers: { 'x-forwarded-for': `203.0.113.${clients % 250}`, ...(init.headers ?? {}) },
  });
}

before(async () => {
  for (const key of ['TRAZUM_ADMINS', ...Object.keys(ENV)]) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  overviewRoute = await import('../app/api/admin/overview/route.ts');
  adminConfig = await import('../lib/admin/config.ts');
  ({ buildOverview } = await import('../lib/admin/overview.ts'));
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

/** An account with a numeric provider id, so id-based admin lists are testable. */
async function account(login, providerId) {
  const store = await getStore();
  const now = new Date();
  const user = await store.upsertUser(
    { provider: 'github', providerId, login, name: null, avatarUrl: null },
    now,
  );
  const session = issueSession(user.id, now, true);
  await store.createSession(session.record);
  return { user, cookie: `__Host-trazum_session=${session.token}` };
}

/**
 * A prompt the rules can actually shorten.
 *
 * The first draft of this fixture was "You should always make sure to carefully
 * read the entire text below" — which reads wordy and which no rule touches, so
 * `recoverable` was zero for it and zero for the short prompt it was supposed to
 * outrank. The ranking test then compared nothing to nothing and failed on sort
 * order. A test only asks the questions its fixtures encode; this one now
 * contains phrases the dictionary knows.
 */
const WORDY =
  'Please, in order to help the user, I basically need you to analyse the query. It is important to note that you have to be very careful when classifying.';

let boss;
let dev;

beforeEach(async () => {
  Object.assign(process.env, ENV);
  delete process.env.TRAZUM_ADMINS;
  resetStore();
  boss = await account('boss', '1001');
  dev = await account('dev', '1002');

  const store = await getStore();
  await store.prompts.createPrompt({
    ownerId: dev.user.id,
    name: 'triage',
    text: WORDY,
    note: null,
    now: new Date(),
  });
  await store.prompts.createPrompt({
    ownerId: boss.user.id,
    name: 'summary',
    text: 'Summarise.',
    note: null,
    now: new Date(),
  });
});

// ---------------------------------------------------------------------------

describe('the overview does not exist unless somebody configured it', () => {
  it('404s for everyone when TRAZUM_ADMINS is unset', async () => {
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    assert.equal(response.status, 404);
  });

  it('404s for a signed-in account that is not on the list', async () => {
    process.env.TRAZUM_ADMINS = 'boss';

    const outsider = await overviewRoute.GET(req({ headers: { cookie: dev.cookie } }));
    assert.equal(outsider.status, 404);

    // Byte-identical to the not-configured case, so neither response tells a
    // stranger whether an admin dashboard exists here.
    delete process.env.TRAZUM_ADMINS;
    const absent = await overviewRoute.GET(req({ headers: { cookie: dev.cookie } }));
    assert.equal(absent.status, 404);
    assert.deepEqual(await outsider.json(), await absent.json());
  });

  it('401s a signed-out caller, which is about the session and not this route', async () => {
    process.env.TRAZUM_ADMINS = 'boss';
    const response = await overviewRoute.GET(req());
    assert.equal(response.status, 401);
  });

  it('lets in an account named by login, case-insensitively', async () => {
    process.env.TRAZUM_ADMINS = 'BOSS';
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).adminSource, 'login');
  });

  it('lets in an account named by numeric id, and says so', async () => {
    process.env.TRAZUM_ADMINS = '1001';
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    assert.equal(response.status, 200);
    // Reported so the page can warn when the weaker form was used: a login is
    // renameable and, once released, claimable by somebody else.
    assert.equal((await response.json()).adminSource, 'id');
  });

  it('prefers the id when both forms name the same person', async () => {
    process.env.TRAZUM_ADMINS = 'boss,1001';
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    assert.equal((await response.json()).adminSource, 'id');
  });

  it('does not confuse a login with an id', async () => {
    /**
     * A GitHub username may be entirely digits.
     *
     * So an operator who listed `1001` — meaning boss's numeric id — must not
     * thereby admit whoever registered the *username* `1001`. Found by mutation:
     * a version of `adminSource` that checked the id list against the login as
     * well passed every other test here, because no fixture had an account whose
     * login collided with anybody's id.
     */
    const impostor = await account('1001', '9999');
    const list = adminConfig.adminList({ TRAZUM_ADMINS: '1001' });

    assert.deepEqual(list.ids, ['1001']);
    assert.deepEqual(list.logins, []);
    assert.equal(adminConfig.isAdmin(boss.user, list), true, 'the id names boss');
    assert.equal(
      adminConfig.isAdmin(impostor.user, list),
      false,
      'a username of 1001 is not the account whose id is 1001',
    );

    // And the mirror: a login list must not match on provider id.
    const byLogin = adminConfig.adminList({ TRAZUM_ADMINS: 'dev' });
    assert.equal(adminConfig.isAdmin(dev.user, byLogin), true);
    const idOnly = adminConfig.adminList({ TRAZUM_ADMINS: 'nobody' });
    assert.equal(adminConfig.isAdmin(dev.user, idOnly), false);
  });

  it('treats blanks and stray whitespace as nothing at all', () => {
    for (const raw of ['', '   ', ',,', ' , , ']) {
      assert.equal(adminConfig.adminList({ TRAZUM_ADMINS: raw }).enabled, false, JSON.stringify(raw));
    }
    const padded = adminConfig.adminList({ TRAZUM_ADMINS: ' boss , 1001 ' });
    assert.deepEqual(padded.logins, ['boss']);
    assert.deepEqual(padded.ids, ['1001']);
  });
});

// ---------------------------------------------------------------------------

describe('what it is allowed to say about other people', () => {
  beforeEach(() => {
    process.env.TRAZUM_ADMINS = '1001';
  });

  it('never sends the text of anybody’s prompt', async () => {
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    const body = await response.text();

    // The name is there, so an admin can say which prompt to fix.
    assert.ok(body.includes('triage'));
    // The prompt is not, in whole or in part.
    assert.ok(!body.includes(WORDY));
    assert.ok(!body.includes('carefully read'));
    assert.ok(!body.includes('latestText'));
  });

  it('counts both accounts and both prompts', async () => {
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    const body = await response.json();
    assert.equal(body.accounts, 2);
    assert.equal(body.prompts, 2);
    assert.equal(body.measured, 2);
    assert.equal(body.truncated, false);
  });

  it('is never cacheable', async () => {
    const response = await overviewRoute.GET(req({ headers: { cookie: boss.cookie } }));
    assert.match(response.headers.get('cache-control'), /no-store/);
  });
});

// ---------------------------------------------------------------------------

describe('the numbers are measured, not modelled', () => {
  const census = (entries) => ({
    entries: entries.map((entry, index) => ({
      id: `id-${index}`,
      name: entry.name,
      ownerId: `owner-${entry.login}`,
      ownerLogin: entry.login,
      latestText: entry.text,
      versionCount: 1,
      updatedAt: new Date(2026, 0, index + 1),
    })),
    totalPrompts: entries.length,
    totalAccounts: new Set(entries.map((e) => e.login)).size,
  });

  it('agrees with running the rules on the same prompt', async () => {
    const { optimize } = await import('@trazum/core');
    const expected = optimize(WORDY);

    const overview = buildOverview(census([{ name: 'a', login: 'dev', text: WORDY }]));
    assert.equal(overview.tokensBefore, expected.tokensBefore);
    assert.equal(overview.tokensAfter, expected.tokensAfter);
    assert.equal(overview.recoverable, expected.tokensSaved);
  });

  it('totals equal the sum of the rows they are a total of', async () => {
    const overview = buildOverview(
      census([
        { name: 'a', login: 'dev', text: WORDY },
        { name: 'b', login: 'dev', text: `${WORDY} And please be brief.` },
        { name: 'c', login: 'boss', text: 'Summarise.' },
      ]),
    );

    const rows = overview.top;
    assert.equal(overview.recoverable, rows.reduce((sum, row) => sum + row.recoverable, 0));
    assert.equal(overview.tokensBefore, rows.reduce((sum, row) => sum + row.tokensBefore, 0));
    // And the per-account breakdown adds up to the same thing.
    assert.equal(
      overview.byAccount.reduce((sum, account) => sum + account.tokens, 0),
      overview.tokensBefore,
    );
  });

  it('ranks by what would actually be recovered, not by size', async () => {
    /**
     * The long prompt here is deliberately the one with nothing to cut.
     *
     * Ranking by `tokensBefore` gives the same order as ranking by `recoverable`
     * whenever the biggest prompt is also the most wasteful, which is the
     * ordinary case and was the only case the first version of this test
     * encoded. The mutant that sorted by size survived it. A long prompt full of
     * unique prose and a short one full of known filler tell the two apart —
     * and telling them apart is the entire value of the ranking, because the
     * long prompt is the one an admin would have guessed.
     */
    const bigButLean = `Analyse the following support ticket and classify it. ${'Unique domain detail number one. '.repeat(20)}`;

    const overview = buildOverview(
      census([
        { name: 'big-but-lean', login: 'dev', text: bigButLean },
        { name: 'small-but-wasteful', login: 'dev', text: WORDY },
      ]),
    );

    const lean = overview.top.find((row) => row.name === 'big-but-lean');
    const wasteful = overview.top.find((row) => row.name === 'small-but-wasteful');
    assert.ok(lean.tokensBefore > wasteful.tokensBefore, 'the lean prompt is the bigger one');

    assert.equal(overview.top[0].name, 'small-but-wasteful');
    assert.ok(overview.top[0].recoverable > overview.top[1].recoverable);
  });

  it('publishes no score', async () => {
    const overview = buildOverview(census([{ name: 'a', login: 'dev', text: WORDY }]));
    const keys = Object.keys(overview.top[0]);
    for (const forbidden of ['score', 'complexity', 'grade', 'rating']) {
      assert.ok(!keys.some((key) => key.toLowerCase().includes(forbidden)), forbidden);
    }
  });

  it('survives a deployment with nothing in it', () => {
    const overview = buildOverview({ entries: [], totalPrompts: 0, totalAccounts: 0 });
    assert.equal(overview.tokensBefore, 0);
    assert.equal(overview.recoverable, 0);
    assert.equal(overview.truncated, false);
    assert.deepEqual(overview.top, []);
    // No division by zero anywhere it would surface as NaN.
    assert.ok(!JSON.stringify(overview).includes('null'));
  });
});

// ---------------------------------------------------------------------------

describe('a capped overview says it is capped', () => {
  it('reports the real total, not the number it read', async () => {
    const store = await getStore();
    // Six prompts, an overview that reads two.
    for (let i = 0; i < 4; i++) {
      await store.prompts.createPrompt({
        ownerId: dev.user.id,
        name: `extra ${i}`,
        text: WORDY,
        note: null,
        now: new Date(),
      });
    }

    const census = await store.admin.census(2);
    assert.equal(census.entries.length, 2);
    assert.equal(census.totalPrompts, 6, 'the total counts everything, not the slice');

    const overview = buildOverview(census);
    assert.equal(overview.measured, 2);
    assert.equal(overview.prompts, 6);
    assert.equal(overview.truncated, true, 'a partial total must announce itself');
  });

  it('reads the most recently touched prompts when it has to choose', async () => {
    const store = await getStore();
    const newest = await store.prompts.createPrompt({
      ownerId: dev.user.id,
      name: 'newest',
      text: WORDY,
      note: null,
      now: new Date(Date.now() + 60_000),
    });

    const census = await store.admin.census(1);
    assert.equal(census.entries[0].id, newest.id);
  });

  it('names the owner of every prompt it read', async () => {
    const store = await getStore();
    const census = await store.admin.census(limits.CENSUS_LIMIT);
    // Not the raw owner id: an overview that lists UUIDs is unusable.
    assert.deepEqual(census.entries.map((e) => e.ownerLogin).sort(), ['boss', 'dev']);
  });
});

// ---------------------------------------------------------------------------

describe('the page says what these numbers are not', () => {
  const source = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
  const page = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const en = readFileSync(new URL('../lib/i18n/en.ts', import.meta.url), 'utf8');

  it('renders the disclaimer above the first figure', () => {
    // The single most misleading thing this page could do is let a reader take
    // "tokens" for "spend", and a footnote below the numbers is read second.
    const disclaimer = page.indexOf('t.admin.notSpend');
    const figures = page.indexOf('t.admin.tokens');
    assert.ok(disclaimer > 0 && disclaimer < figures, 'the disclaimer comes first');
  });

  it('says in words that this is not spending', () => {
    const text = /notSpend:\s*\n?\s*'([^']+)'/.exec(en)?.[1] ?? '';
    assert.match(text, /not spending/i);
    assert.match(text, /never seen a bill/i);
    assert.match(text, /no score/i);
  });

  it('warns when the admin list matched a renameable login', () => {
    assert.match(page, /source === 'login' &&/);
    const warning = /loginWarning:\s*\n?\s*'([^']+)'/.exec(en)?.[1] ?? '';
    assert.match(warning, /renamed/i);
    assert.match(warning, /TRAZUM_ADMINS/);
  });

  it('gates before it reads anything', () => {
    /**
     * Named guards, not "the last `notFound()`".
     *
     * The first version asserted only that some `notFound()` preceded the census
     * call, which stayed true when the admin check was deleted — the signed-out
     * guard above it kept the ordering intact while the page happily rendered
     * everybody's totals to any signed-in account. Found by mutation. Each guard
     * is now required by name.
     */
    const read = page.indexOf('census(');
    assert.ok(read > 0, 'the page reads the census');

    for (const guard of [
      'if (!config.enabled) notFound();',
      'if (!list.enabled) notFound();',
      'if (!user) notFound();',
      'if (!source) notFound();',
    ]) {
      const at = page.indexOf(guard);
      assert.ok(at > 0, `missing guard: ${guard}`);
      assert.ok(at < read, `guard runs after the store is asked: ${guard}`);
    }
  });

  it('renders names and never prompt text', () => {
    assert.match(page, /\{row\.name\}/);
    assert.ok(!page.includes('latestText'));
    assert.ok(!page.includes('dangerouslySetInnerHTML'));
  });

  it('is kept out of search engines', () => {
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    const robots = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8');
    assert.match(robots, /'\/admin'/);
  });

  it('is never prerendered', () => {
    assert.match(page, /export const dynamic = 'force-dynamic'/);
  });
});
