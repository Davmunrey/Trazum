import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The public site: its addresses, its one header and footer, each page's
 * metadata, and every new string in every language the surface speaks.
 *
 * Rendered rather than read wherever the claim is about what a visitor gets:
 * "every public page carries the header, the GitHub button and the way into
 * the dashboard" is a statement about markup, and a grep of the source would
 * pass on a component that is imported and never drawn. The loader compiles
 * `.tsx` with Next's own SWC for that.
 */

register('./helpers/loader.mjs', import.meta.url);

let site, siteCopy, landingCopy, locales, metadata, middleware, NextRequest, React, server, i18n;

before(async () => {
  site = await import('../lib/site.ts');
  siteCopy = await import('../lib/site-copy.ts');
  landingCopy = await import('../lib/landing-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
  metadata = await import('../lib/site-metadata.ts');
  ({ middleware } = await import('../middleware.ts'));
  ({ NextRequest } = await import('next/server'));
  React = await import('react');
  server = await import('react-dom/server');
  i18n = await import('../lib/i18n/index.ts');
});

const ORIGIN = 'https://trazum.example';
const at = (path) => new URL(`${ORIGIN}${path}`);
const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

describe('the two addresses that moved, and the one that never does', () => {
  it('never redirects a bare /, nor / with a query that names no tab', () => {
    for (const path of ['/', '/?utm_source=readme', '/?lang=fr&ref=x', '/?']) {
      assert.equal(site.redirectFor(at(path)), null, `${path} was redirected`);
    }
  });

  it('sends /?tab= to /app with every parameter, in order, as it was written', () => {
    const cases = [
      ['/?tab=playground', '/app?tab=playground'],
      ['/?tab=bill&since=2026-11-01&until=2026-11-30', '/app?tab=bill&since=2026-11-01&until=2026-11-30'],
      ['/?utm=a&tab=tasks&utm=b', '/app?utm=a&tab=tasks&utm=b'],
      ['/?tab=compare&q=%2F%2Fnot-a-host&x=a%20b', '/app?tab=compare&q=%2F%2Fnot-a-host&x=a%20b'],
      ['/?tab=', '/app?tab='],
      ['/?tab=unknown-panel', '/app?tab=unknown-panel'],
    ];
    for (const [from, to] of cases) {
      const target = site.redirectFor(at(from));
      assert.ok(target !== null, `${from} was not redirected`);
      assert.equal(`${target.pathname}${target.search}`, to, from);
    }
  });

  it('sends /landing to /, keeping its query, and straight to /app when it names a tab', () => {
    assert.equal(site.redirectFor(at('/landing')).href, `${ORIGIN}/`);
    assert.equal(site.redirectFor(at('/landing?utm=x')).href, `${ORIGIN}/?utm=x`);
    assert.equal(site.redirectFor(at('/landing?tab=bill&a=1')).href, `${ORIGIN}/app?tab=bill&a=1`);
  });

  it('can only ever point at this origin', () => {
    /*
      The query is the only part a visitor writes. Each of these tries to
      turn it into an authority or a scheme; each has to land on this
      origin's /app (or /) with the query carried as a query.
    */
    const hostile = [
      '/?tab=x&@evil.example',
      '/?tab=//evil.example',
      '/?tab=%2F%2Fevil.example',
      '/?tab=https://evil.example/',
      '/?tab=x#@evil.example',
      '/?tab=\\\\evil.example',
      '/?tab=x&next=javascript:alert(1)',
      '/landing?tab=//evil.example',
      '/landing?//evil.example',
    ];
    for (const path of hostile) {
      const target = site.redirectFor(at(path));
      assert.ok(target !== null, path);
      assert.equal(target.origin, ORIGIN, `${path} redirects off this origin, to ${target.href}`);
      assert.ok(['/app', '/'].includes(target.pathname), `${path} redirects to ${target.pathname}`);
    }
  });

  it('leaves every other address where it is', () => {
    for (const path of [
      '/app',
      '/app?tab=bill',
      '/c/abcdefghijklmnop?tab=x',
      '/badge/abcdefghijklmnop.svg?tab=x',
      '/admin?tab=x',
      '/api/optimize?tab=x',
      '/landing/x?tab=y',
      '/applesauce?tab=x',
      '//evil.example/?tab=x',
    ]) {
      assert.equal(site.redirectFor(at(path)), null, `${path} was redirected`);
    }
  });

  it('is what the middleware answers, permanently, before anything else', () => {
    const moved = middleware(new NextRequest(`${ORIGIN}/?tab=playground&x=1`));
    assert.equal(moved.status, 308);
    assert.equal(moved.headers.get('location'), `${ORIGIN}/app?tab=playground&x=1`);
    const landing = middleware(new NextRequest(`${ORIGIN}/landing`));
    assert.equal(landing.status, 308);
    assert.equal(landing.headers.get('location'), `${ORIGIN}/`);
    for (const path of ['/', '/app', '/app?tab=bill', '/?utm=x']) {
      const response = middleware(new NextRequest(`${ORIGIN}${path}`));
      assert.ok(response.status < 300 || response.status >= 400, `${path} answered ${response.status}`);
      assert.equal(response.headers.get('location'), null, `${path} was redirected`);
      assert.match(response.headers.get('content-security-policy') ?? '', /connect-src 'self'/, `${path} lost its policy`);
    }
  });
});

describe('every public page carries the header, the GitHub button and the way in', () => {
  const render = (element) => server.renderToStaticMarkup(element);

  it('the addresses are the project’s, written once', () => {
    /*
      Pinned here because every other check compares against these same
      constants: a wrong one would agree with itself everywhere.
    */
    assert.equal(site.GITHUB_URL, 'https://github.com/Davmunrey/Trazum');
    assert.equal(site.DASHBOARD_PATH, '/app');
    assert.equal(site.HOME_PATH, '/');
    assert.equal(site.SITE_LINKS.docs.href, 'https://github.com/Davmunrey/Trazum/blob/main/docs/README.md');
    assert.equal(site.SITE_LINKS.npm.href, 'https://www.npmjs.com/package/@trazum/cli');
    for (const [id, file] of [['licence', 'LICENSE'], ['changelog', 'CHANGELOG.md'], ['security', 'SECURITY.md']]) {
      assert.equal(site.SITE_LINKS[id].href, `https://github.com/Davmunrey/Trazum/blob/main/${file}`, id);
      assert.ok(existsSync(new URL(`../../../${file}`, import.meta.url)), `${file} is not in the repository`);
    }
    assert.ok(site.HEADER_ENTRIES.includes('docs'), 'the header lost its Docs entry');
    const footer = site.FOOTER_GROUPS.flatMap((group) => group.links);
    for (const id of ['dashboard', ...site.HEADER_ENTRIES, 'github', 'licence', 'changelog', 'security', 'npm']) {
      assert.ok(footer.includes(id), `the footer has no ${id}`);
    }
    assert.equal(site.COMMAND, 'npx @trazum/cli bill');
  });

  it('each public page renders the shell, not something of its own', () => {
    assert.match(read('app/page.tsx'), /return <Landing initialLocale=\{locale\} \/>/);
    assert.match(read('app/not-found.tsx'), /return <NotFoundView initialLocale=\{locale\} \/>/);
    for (const file of ['components/Landing.tsx', 'components/site/NotFound.tsx']) {
      assert.match(read(file), /<SiteFrame initialLocale=\{initialLocale\}>/, `${file} is not in the site frame`);
    }
  });

  /** The attributes of every `<a>` in some markup, as objects. */
  const anchors = (html) =>
    [...html.matchAll(/<a\b([^>]*)>/g)].map(([, attrs]) =>
      Object.fromEntries([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ''])),
    );

  function assertShell(html, locale, what) {
    const copy = siteCopy.SITE_COPY[locale];
    /*
      The header on its own first: the button, the action and the way home
      have to be in it, not only somewhere on the page (the hero and the
      footer carry their own).
    */
    const header = html.slice(html.indexOf('data-site-header'), html.indexOf('</header>'));
    const inHeader = anchors(header);
    assert.ok(inHeader.some((a) => 'data-github-button' in a && a.href === site.GITHUB_URL), `${what} (${locale}): the header has no GitHub button`);
    assert.ok(inHeader.some((a) => 'data-dashboard-action' in a && a.href === site.DASHBOARD_PATH), `${what} (${locale}): the header has no way into the dashboard`);
    assert.ok(inHeader.some((a) => a.href === site.HOME_PATH && a['aria-label'] === copy.home), `${what} (${locale}): the header's wordmark does not lead home`);
    assert.equal((html.match(/data-site-header=""/g) ?? []).length, 1, `${what} (${locale}): not exactly one header`);
    assert.equal((html.match(/data-site-footer=""/g) ?? []).length, 1, `${what} (${locale}): not exactly one footer`);
    const links = anchors(html);
    const github = links.filter((a) => 'data-github-button' in a);
    assert.ok(github.length > 0, `${what} (${locale}): no GitHub button`);
    for (const button of github) {
      assert.equal(button.href, site.GITHUB_URL, `${what} (${locale}): the GitHub button goes elsewhere`);
      assert.equal(button.target, '_blank');
      assert.equal(button.rel, 'noreferrer noopener');
      assert.ok(
        (button['aria-label'] ?? '').startsWith(copy.links.github),
        `${what} (${locale}): the GitHub button has no accessible name`,
      );
    }
    const dashboard = links.filter((a) => 'data-dashboard-action' in a);
    assert.ok(dashboard.length > 0, `${what} (${locale}): no way into the dashboard`);
    for (const action of dashboard) assert.equal(action.href, site.DASHBOARD_PATH);
    assert.ok(html.includes(`>${copy.dashboardCta}<`), `${what} (${locale}): the dashboard action has no label`);
    const home = links.filter((a) => a.href === site.HOME_PATH && a['aria-label'] === copy.home);
    assert.ok(home.length >= 1, `${what} (${locale}): the wordmark does not lead home`);
    assert.ok(html.indexOf('Trazum') < html.indexOf('data-github-button'), 'the wordmark does not lead the header');
    for (const id of site.HEADER_ENTRIES) {
      assert.ok(links.some((a) => a.href === site.SITE_LINKS[id].href), `${what} (${locale}): no ${id} entry`);
      assert.ok(html.includes(copy.links[id]), `${what} (${locale}): the ${id} entry has no label`);
    }
    for (const group of site.FOOTER_GROUPS) {
      for (const id of group.links) {
        assert.ok(links.some((a) => a.href === site.SITE_LINKS[id].href), `${what} (${locale}): the footer has no ${id}`);
      }
    }
    for (const a of links.filter((link) => link.target === '_blank')) {
      assert.equal(a.rel, 'noreferrer noopener', `${what}: ${a.href} opens a tab without rel protection`);
    }
  }

  it('the landing, in each of its languages', async () => {
    const { Landing } = await import('../components/Landing.tsx');
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(React.createElement(Landing, { initialLocale: locale }));
      assertShell(html, locale, 'the landing');
      assert.ok(html.includes(site.COMMAND), `the landing (${locale}) does not show the command`);
      assert.ok(html.includes(landingCopy.COPY[locale].heroTitle), `the landing (${locale}) has no headline`);
      assert.ok(html.includes(siteCopy.SITE_COPY[locale].copyCommand), `the landing (${locale}) cannot copy the command`);
    }
  });

  it('the page an unknown address gets, with a way home', async () => {
    const { NotFoundView } = await import('../components/site/NotFound.tsx');
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(React.createElement(NotFoundView, { initialLocale: locale }));
      assertShell(html, locale, 'the not-found page');
      assert.ok(html.includes(siteCopy.SITE_COPY[locale].notFoundHome), `the not-found page (${locale}) has no way home`);
    }
    assert.ok(existsSync(new URL('../app/not-found.tsx', import.meta.url)), 'the app has no not-found page of its own');
  });

  it('the application keeps its rail, and gains the way back and the same GitHub button', async () => {
    const { App } = await import('../components/App.tsx');
    for (const locale of i18n.LOCALES) {
      const t = i18n.getWebMessages(locale);
      const html = render(React.createElement(App, { initialLocale: locale, pricingReviewed: '2026-11-05', models: [] }));
      const links = anchors(html);
      assert.ok(html.includes('trazum-rail'), `the application (${locale}) lost its rail`);
      const back = links.filter((a) => a.href === site.HOME_PATH);
      assert.ok(back.some((a) => 'data-back-to-site' in a && a['aria-label'] === t.page.backToSite), `the application (${locale}) has no way back to the site`);
      const github = links.filter((a) => 'data-github-button' in a);
      assert.ok(github.length > 0, `the application (${locale}) has no GitHub button`);
      // On the rail itself, not only in the phone bar.
      const rail = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
      assert.ok(anchors(rail).some((a) => 'data-github-button' in a), `the application's rail (${locale}) has no GitHub button`);
      for (const button of github) {
        assert.equal(button.href, site.GITHUB_URL);
        assert.ok((button['aria-label'] ?? '').startsWith(t.page.linkGitHub), `the application's GitHub button (${locale}) has no name`);
      }
    }
  });

  it('a first visit to the bill meets the sample control before anything else in the panel', async () => {
    const { Bill } = await import('../components/Bill.tsx');
    for (const locale of i18n.LOCALES) {
      const t = i18n.getWebMessages(locale);
      const html = render(React.createElement(Bill, { t }));
      const entry = html.indexOf('data-sample-entry');
      assert.ok(entry !== -1, `the bill (${locale}) has no sample control`);
      assert.ok(html.includes(`>${t.bill.sampleAction}<`), `the sample control (${locale}) has no label`);
      const firstButton = html.indexOf('<button');
      assert.ok(firstButton > entry, `something on the bill (${locale}) comes before the sample control`);
      assert.ok(html.slice(firstButton).startsWith('<button') && html.slice(firstButton, html.indexOf('</button>', firstButton)).includes(t.bill.sampleAction), `the first control on the bill (${locale}) is not the sample`);
    }
    // And the control prices the sample the tour and the Playground use, through the paste path.
    const bill = read('components/Bill.tsx');
    const block = bill.slice(bill.indexOf('data-sample-entry'), bill.indexOf('{t.bill.sampleAction}'));
    assert.match(block, /createPlaygroundFiles\(\)\.get\('usage\.jsonl'\)/);
    assert.match(block, /replaceDataset\(sample, null\)/);
  });
});

describe('each public page has its own title, description, address and card', () => {
  it('the landing, in each language, at /', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const meta = metadata.landingMetadata(locale);
      const t = landingCopy.COPY[locale];
      assert.equal(meta.title.absolute, t.metaTitle);
      assert.equal(meta.description, t.metaDescription);
      assert.equal(meta.alternates.canonical, '/');
      assert.equal(meta.openGraph.url, '/');
      assert.equal(meta.openGraph.title, t.metaTitle);
      assert.equal(meta.twitter.card, 'summary_large_image');
    }
  });

  it('the dashboard, in each of its languages, at /app', () => {
    for (const locale of i18n.LOCALES) {
      const messages = i18n.getWebMessages(locale);
      const meta = metadata.dashboardMetadata(messages);
      assert.equal(meta.alternates.canonical, '/app');
      assert.equal(meta.openGraph.url, '/app');
      assert.match(meta.title.absolute, new RegExp(`^${messages.meta.dashboardTitle} · Trazum$`));
      assert.equal(meta.description, messages.meta.description);
      assert.notEqual(meta.title.absolute, metadata.landingMetadata(locale).title.absolute, 'two pages, one title');
    }
  });

  it('the not-found page, kept out of the index', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const meta = metadata.notFoundMetadata(locale);
      assert.equal(meta.robots.index, false);
      assert.ok(meta.title.absolute.startsWith(siteCopy.SITE_COPY[locale].notFoundMetaTitle));
    }
  });

  it('each page asks for its own metadata, and draws its own card', () => {
    for (const [page, fn] of [
      ['app/page.tsx', 'landingMetadata'],
      ['app/app/page.tsx', 'dashboardMetadata'],
      ['app/not-found.tsx', 'notFoundMetadata'],
    ]) {
      const source = read(page);
      assert.match(source, /export async function generateMetadata\(\)/, `${page} has no metadata of its own`);
      assert.ok(source.includes(`${fn}(`), `${page} does not use ${fn}`);
    }
    for (const card of ['app/opengraph-image.tsx', 'app/app/opengraph-image.tsx']) {
      assert.match(read(card), /socialCard\(/, `${card} does not draw the brand's card`);
    }
    assert.ok(!existsSync(new URL('../app/landing', import.meta.url)), 'a /landing page came back; it redirects to /');
  });
});

describe('every new string, in every language its surface speaks', () => {
  /** Every leaf of a copy object, functions called with sample arguments. */
  function leaves(value, path, out) {
    if (typeof value === 'function') {
      out.push([path, value(126, '2026-09-01', '2026-09-14')]);
    } else if (Array.isArray(value) || (value && typeof value === 'object')) {
      for (const [key, child] of Object.entries(value)) leaves(child, `${path}.${key}`, out);
    } else {
      out.push([path, value]);
    }
    return out;
  }

  function parity(table, name) {
    const reference = leaves(table.en, '', []).map(([path]) => path);
    assert.ok(reference.length > 10, `${name} has almost nothing in it`);
    for (const locale of locales.MARKETING_LOCALES) {
      const found = leaves(table[locale], '', []);
      assert.deepEqual(found.map(([path]) => path), reference, `${name}.${locale} has a different set of strings`);
      for (const [path, text] of found) {
        assert.equal(typeof text, 'string', `${name}.${locale}${path} is not text`);
        assert.ok(text.trim().length > 0, `${name}.${locale}${path} is empty`);
      }
    }
  }

  it('the site shell, in five', () => parity(siteCopy.SITE_COPY, 'SITE_COPY'));
  it('the landing, in five', () => parity(landingCopy.COPY, 'COPY'));

  it('a non-English language says something other than English', () => {
    for (const locale of ['es', 'fr', 'de', 'pt']) {
      assert.notEqual(landingCopy.COPY[locale].heroTitle, landingCopy.COPY.en.heroTitle, locale);
      assert.notEqual(siteCopy.SITE_COPY[locale].dashboardCta, siteCopy.SITE_COPY.en.dashboardCta, locale);
    }
  });

  it('the application’s new strings, in its two', () => {
    for (const locale of i18n.LOCALES) {
      const t = i18n.getWebMessages(locale);
      for (const [name, text] of [
        ['meta.dashboardTitle', t.meta.dashboardTitle],
        ['page.backToSite', t.page.backToSite],
        ['bill.sampleLead', t.bill.sampleLead],
        ['bill.sampleAction', t.bill.sampleAction],
      ]) {
        assert.ok(typeof text === 'string' && text.trim() !== '', `${locale}: ${name} is missing`);
      }
    }
    for (const key of ['backToSite']) {
      assert.notEqual(i18n.getWebMessages('es').page[key], i18n.getWebMessages('en').page[key], key);
    }
    for (const key of ['sampleLead', 'sampleAction']) {
      assert.notEqual(i18n.getWebMessages('es').bill[key], i18n.getWebMessages('en').bill[key], key);
    }
    assert.notEqual(i18n.getWebMessages('es').meta.dashboardTitle, i18n.getWebMessages('en').meta.dashboardTitle);
  });

  it('a header entry or a footer link cannot exist without a label', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      for (const id of Object.keys(site.SITE_LINKS)) {
        assert.ok(siteCopy.SITE_COPY[locale].links[id], `${locale}: ${id} has no label`);
      }
      for (const group of site.FOOTER_GROUPS) assert.ok(siteCopy.SITE_COPY[locale].footerGroups[group.id]);
    }
  });

  it('the new prose carries no em-dash', () => {
    for (const file of [
      'lib/site.ts',
      'lib/site-copy.ts',
      'lib/landing-copy.ts',
      'lib/site-metadata.ts',
      'lib/social-card.tsx',
      'lib/marketing-locales.ts',
      'components/Landing.tsx',
      'components/site/GitHub.tsx',
      'components/site/SiteHeader.tsx',
      'components/site/SiteFooter.tsx',
      'components/site/SiteFrame.tsx',
      'components/site/CommandLine.tsx',
      'components/site/NotFound.tsx',
    ]) {
      assert.ok(!read(file).includes('—'), `${file} has an em-dash`);
    }
  });
});
