import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

/**
 * The README badge.
 *
 * An SVG served from Trazum's own origin and embedded on pages Trazum does not
 * control, which makes the interesting questions different from every other
 * route here:
 *
 * - Is the document inert? No script, no `foreignObject`, nothing fetched.
 * - Is every interpolation escaped, including the ones that "cannot" be hostile?
 * - Does it stay 200 for an unknown, expired and malformed token alike — so a
 *   revoked link stops reporting instead of announcing a broken image to every
 *   reader of the README?
 * - Does the box fit the text? SVG has no layout, so a width that disagrees with
 *   its content is a visual bug no type system catches.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let badge, svgLib, shareApi;
let getStore, resetStore, issueSession;

const saved = {};

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);

  ({ GET: badge } = await import('../app/badge/[token]/route.ts'));
  svgLib = await import('../lib/badge/svg.ts');
  shareApi = await import('../lib/shares/api.ts');
  ({ getStore, resetStore } = await import('../lib/store/index.ts'));
  ({ issueSession } = await import('../lib/auth/session.ts'));
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const params = (token) => ({ params: Promise.resolve({ token }) });
const request = () => new Request(`${ORIGIN}/badge/x.svg`);

let owner;

beforeEach(async () => {
  resetStore();
  const store = await getStore();
  const user = await store.upsertUser(
    { provider: 'github', providerId: '1', login: 'alice', name: null, avatarUrl: null },
    new Date(),
  );
  issueSession(user.id, new Date(), true);
  owner = user;
});

async function share({ before: beforeText, after: afterText, expiresAt = null }) {
  const store = await getStore();
  const token = shareApi.mintShareToken();
  await store.shares.createShare({
    token,
    ownerId: owner.id,
    ownerLogin: 'alice',
    beforeText,
    afterText,
    settings: shareApi.parseSettings({}).value,
    now: new Date(),
    expiresAt,
  });
  return token;
}

const WORDY =
  'Please, in order to help the user, I basically need you to analyse the query. It is important to note that you have to be very careful when classifying.';

// ---------------------------------------------------------------------------

describe('the document is inert', () => {
  const source = readFileSync(new URL('../lib/badge/svg.ts', import.meta.url), 'utf8');
  // Comments discuss `<script>` and `foreignObject` at length; a prose mention
  // is not the thing. Third time this repository has had to learn that.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('emits nothing that can execute or fetch', () => {
    const rendered = svgLib.renderBadge({ label: 'trazum', message: '-42 tokens', colour: '#2f855a' });
    for (const forbidden of ['<script', 'foreignObject', 'xlink:href', 'href=', '@import', 'url(', 'onload']) {
      assert.ok(!rendered.includes(forbidden), forbidden);
      assert.ok(!code.includes(forbidden), `${forbidden} in source`);
    }
  });

  it('references no external font, image or stylesheet', () => {
    const rendered = svgLib.renderBadge({ label: 'trazum', message: 'x', colour: '#000000' });

    // Exactly one URL, and it is the namespace — which is an identifier, not
    // something any renderer fetches. The first draft of this asserted the
    // document contained no "http" at all, which the namespace itself fails.
    const urls = rendered.match(/https?:\/\/[^"']+/g) ?? [];
    assert.deepEqual(urls, ['http://www.w3.org/2000/svg']);
  });

  it('is served with headers that make navigating to it uninteresting', async () => {
    const response = await badge(request(), params('nope'));
    assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
  });
});

// ---------------------------------------------------------------------------

describe('everything interpolated is escaped', () => {
  it('escapes all five XML metacharacters', () => {
    assert.equal(svgLib.escapeXml(`<&>"'`), '&lt;&amp;&gt;&quot;&apos;');
    // Ampersand first, or the escapes of the other four get double-escaped.
    assert.equal(svgLib.escapeXml('&lt;'), '&amp;lt;');
  });

  it('cannot be closed out of, even by a label that tries', () => {
    // No caller supplies this text today. The escaping is here so that the day
    // one does, the badge is still an image.
    const rendered = svgLib.renderBadge({
      label: '"/><script>alert(1)</script><text x="0',
      message: '-1 tokens',
      colour: '#000000',
    });
    assert.ok(!rendered.includes('<script'));
    assert.ok(rendered.includes('&lt;script&gt;'));
    // Not "the document contains no `"/>`" — every `<rect>` legitimately ends
    // that way. What matters is that none of the label's own quotes survived as
    // quotes, so it cannot have terminated the attribute it sits in.
    assert.ok(!rendered.includes('x="0<'), 'the label did not reopen a tag');
    for (const fragment of rendered.split('>')) {
      const quotes = (fragment.match(/"/g) ?? []).length;
      assert.equal(quotes % 2, 0, `unbalanced quotes in: ${fragment.slice(0, 60)}`);
    }
  });

  it('escapes a hostile message, not only a hostile label', () => {
    // The label is a constant today and the message is derived from numbers, so
    // neither is hostile — which is exactly why only one of them was tested and
    // why removing the message's escape survived the first mutation pass. Both
    // are escaped; both are now asserted.
    const rendered = svgLib.renderBadge({
      label: 'trazum',
      message: '</text><script>alert(1)</script>',
      colour: '#000000',
    });
    assert.ok(!rendered.includes('<script'));
    assert.ok(!rendered.includes('</text><script'));
    assert.ok(rendered.includes('&lt;/text&gt;'));
  });

  it('escapes the colour too, though this file is the only source of one', () => {
    const rendered = svgLib.renderBadge({ label: 'a', message: 'b', colour: '"><script>' });
    assert.ok(!rendered.includes('<script'));
  });

  it('gives the image an accessible name', () => {
    const rendered = svgLib.renderBadge({ label: 'trazum', message: '-42 tokens', colour: '#000000' });
    assert.match(rendered, /role="img"/);
    assert.match(rendered, /aria-label="trazum: -42 tokens"/);
    assert.match(rendered, /<title>trazum: -42 tokens<\/title>/);
  });
});

// ---------------------------------------------------------------------------

describe('the box fits the text', () => {
  it('grows with the message', () => {
    const short = svgLib.renderBadge({ label: 'trazum', message: '-1', colour: '#000' });
    const long = svgLib.renderBadge({ label: 'trazum', message: '-1,234,567 tokens', colour: '#000' });
    const widthOf = (svg) => Number(/width="(\d+)"/.exec(svg)[1]);
    assert.ok(widthOf(long) > widthOf(short));
  });

  it('declares a total width that is the sum of its two boxes', () => {
    const rendered = svgLib.renderBadge({ label: 'trazum', message: '-42 tokens', colour: '#000' });
    const total = Number(/^<svg[^>]*width="(\d+)"/.exec(rendered)[1]);
    const boxes = [...rendered.matchAll(/<rect(?: x="(\d+)")? width="(\d+)"/g)];

    const label = Number(boxes[0][2]);
    const message = Number(boxes[1][2]);
    assert.equal(total, label + message, 'the viewBox and the rects agree');
    assert.equal(Number(boxes[1][1]), label, 'the right box starts where the left one ends');
  });

  it('leaves room for every character it was given', () => {
    // The estimate is arithmetic, not measurement, so what is pinned is that it
    // is generous rather than exact: no string may come out narrower than one
    // character's worth per character.
    for (const text of ['iiii', 'WWWW', 'trazum', '-1,234 tokens', 'no change']) {
      assert.ok(svgLib.textWidth(text) >= text.length * 3, text);
    }
    /**
     * Compared against the *same letters in lowercase*, not against narrow ones.
     *
     * `WWWW` beats `iiii` whether or not capitals get their own width, because
     * `i` is in the narrow class either way — so the first version of this
     * assertion passed with the capital branch deleted. Found by mutation.
     */
    assert.ok(svgLib.textWidth('WWWW') > svgLib.textWidth('wwww'), 'capitals are wider');
    assert.ok(svgLib.textWidth('iiii') < svgLib.textWidth('wwww'), 'and narrow letters narrower');
  });

  it('does not fall over on an empty message', () => {
    const rendered = svgLib.renderBadge({ label: '', message: '', colour: '#000' });
    assert.match(rendered, /^<svg/);
    assert.ok(!rendered.includes('NaN'));
  });
});

// ---------------------------------------------------------------------------

describe('the colour says only what the number supports', () => {
  it('has three stops and no gradient', () => {
    assert.equal(svgLib.colourFor(50), '#c0392b', 'grew');
    assert.equal(svgLib.colourFor(-500), '#2f855a', 'meaningfully smaller');
    assert.equal(svgLib.colourFor(-5), '#6b7280', 'within the noise');
    assert.equal(svgLib.colourFor(0), '#6b7280');
    // Three distinct values, not a scale: the token estimate carries a stated
    // margin, and a shade that changed at 3% would report noise as a finding.
    const shades = new Set([-1000, -100, -21, -20, -1, 0, 1, 1000].map(svgLib.colourFor));
    assert.equal(shades.size, 3);
  });
});

// ---------------------------------------------------------------------------

describe('the route answers 200 to everything', () => {
  it('renders a neutral badge for a malformed, unknown or expired token', async () => {
    const malformed = await badge(request(), params('../../etc/passwd'));
    const unknown = await badge(request(), params(shareApi.mintShareToken()));
    const expiredToken = await share({
      before: WORDY,
      after: 'Short.',
      expiresAt: new Date(Date.now() - 1000),
    });
    const expired = await badge(request(), params(`${expiredToken}.svg`));

    for (const response of [malformed, unknown, expired]) {
      assert.equal(response.status, 200);
    }

    // Byte-identical, so a badge cannot be used to probe whether a token was
    // ever real — and a revoked link stops reporting rather than announcing a
    // broken image to every reader of the README.
    const bodies = await Promise.all([malformed.text(), unknown.text(), expired.text()]);
    assert.equal(new Set(bodies).size, 1);
    assert.match(bodies[0], /unavailable/);
  });

  it('refuses a malformed token before it reaches the store', async () => {
    /**
     * The badge that comes back is identical either way — the memory store
     * answers nothing for a key it does not hold, so the neutral badge is
     * rendered whether or not the guard exists. Same shape as the prompt
     * routes' UUID check, and the same fix: watch whether the store was asked.
     *
     * It matters for the same reason: bind `'../../etc/passwd'` to a `text`
     * primary key and Postgres is fine, but the query is a round trip an
     * unauthenticated caller triggered, and this route is the one behind a CDN
     * that anybody can hammer.
     */
    const store = await getStore();
    const real = store.shares.findShare.bind(store.shares);
    const asked = [];
    store.shares.findShare = async (token, now) => {
      asked.push(token);
      return real(token, now);
    };

    try {
      for (const bad of ['../../etc/passwd', 'short', '', 'a'.repeat(500)]) {
        const response = await badge(request(), params(bad));
        assert.equal(response.status, 200);
      }
      assert.deepEqual(asked, [], 'a value that is not a token reached the store');

      const token = await share({ before: WORDY, after: 'Short.' });
      await badge(request(), params(`${token}.svg`));
      assert.deepEqual(asked, [token], 'and a real token still gets through');
    } finally {
      store.shares.findShare = real;
    }
  });

  it('accepts the token with or without the .svg extension', async () => {
    const token = await share({ before: WORDY, after: 'Short.' });
    const withExt = await (await badge(request(), params(`${token}.svg`))).text();
    const without = await (await badge(request(), params(token))).text();
    assert.equal(withExt, without);
    assert.ok(!withExt.includes('unavailable'));
  });

  it('reports a shrunk prompt as a negative, in green', async () => {
    const token = await share({ before: WORDY, after: 'Analyse the query and classify it.' });
    const body = await (await badge(request(), params(token))).text();

    assert.match(body, /-[\d,]+ tokens/, 'signed, so the direction is readable');
    assert.ok(body.includes('#2f855a'), 'green');
  });

  it('reports a grown prompt as a positive, in red', async () => {
    const token = await share({ before: 'Analyse the query.', after: WORDY });
    const body = await (await badge(request(), params(token))).text();

    assert.match(body, /\+[\d,]+ tokens/);
    assert.ok(body.includes('#c0392b'));
  });

  it('says "no change" rather than a signed zero', async () => {
    const token = await share({ before: WORDY, after: WORDY });
    const body = await (await badge(request(), params(token))).text();
    assert.match(body, /no change/);
    assert.ok(!body.includes('+0'));
    assert.ok(!body.includes('-0'));
  });

  it('never renders a character that came from a prompt', async () => {
    const token = await share({
      before: `${WORDY} <script>alert(1)</script>`,
      after: 'Short.',
    });
    const body = await (await badge(request(), params(token))).text();

    assert.ok(!body.includes('alert'));
    assert.ok(!body.includes('analyse'));
    assert.ok(!body.includes('classifying'));
  });

  it('is cacheable, unlike the page behind the same token', async () => {
    // Safe because the token is in the URL: only somebody who already holds the
    // capability can construct the request. And a README badge is fetched by
    // every reader of the page through an image proxy.
    const token = await share({ before: WORDY, after: 'Short.' });
    const response = await badge(request(), params(token));
    assert.match(response.headers.get('cache-control'), /public/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
  });

  it('recomputes rather than reading a stored number', () => {
    const route = readFileSync(new URL('../app/badge/[token]/route.ts', import.meta.url), 'utf8');
    assert.match(route, /comparePrompts\(share\.beforeText, share\.afterText/);
    // Taken from the core's field rather than subtracted again here, so this
    // surface cannot end up with the opposite sign convention from the others.
    assert.match(route, /const delta = comparison\.tokenDelta;/);
  });
});
