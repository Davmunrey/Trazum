import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * `/pro`: a page about a service that is not open, held to the one module it
 * reads and to what the repository says about itself.
 *
 * - The tiers on the page are `lib/pro.ts`'s, parsed back out of the rendered
 *   table in every language and compared as numbers, and the module's are the
 *   owner's decision, written again here so that changing one is deliberate.
 * - The page says it is not open while `PRO_OPEN` says so, and claims nothing
 *   an open service would: no buying, no customers.
 * - The one call to action mails the one address the repository publishes.
 * - The page is in the header, the footer and the sitemap.
 * - Every pair of text and ground it uses reads at 4.5:1 or better in both
 *   themes, worked out from `globals.css` here.
 * - It sends nothing, and says nothing `docs/licensing.md` does not.
 */

register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const web = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
/** A code file without its comments: what it does, not what it says. */
const codeOf = (path) =>
  web(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

let pro, proCopy, site, siteCopy, locales, metadata, React, server, ProPage, Landing, sitemap, md;

before(async () => {
  pro = await import('../lib/pro.ts');
  ({ PRO_COPY: proCopy } = await import('../lib/pro-copy.ts'));
  site = await import('../lib/site.ts');
  siteCopy = await import('../lib/site-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
  metadata = await import('../lib/site-metadata.ts');
  React = await import('react');
  server = await import('react-dom/server');
  ({ ProPage } = await import('../components/pro/ProPage.tsx'));
  ({ Landing } = await import('../components/Landing.tsx'));
  ({ default: sitemap } = await import('../app/sitemap.ts'));
  md = await import('../../../scripts/docs-markdown.mjs');
});

const render = (locale = 'en') => server.renderToStaticMarkup(React.createElement(ProPage, { initialLocale: locale }));

/** The text of some markup, tags and entities gone. */
const textOf = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** One tier's row, and one of its cells' text. */
const rowOf = (html, id) => {
  const start = html.indexOf(`<tr data-tier="${id}"`);
  assert.notEqual(start, -1, `${id} is not on the page`);
  return html.slice(start, html.indexOf('</tr>', start));
};
const cellOf = (row, cell) => {
  const match = new RegExp(`data-cell="${cell}" data-value="([^"]*)">([^<]*)<`).exec(row);
  assert.ok(match, `no ${cell} cell`);
  return { value: match[1], text: match[2] };
};
/** The number a cell prints, whatever the language's separators: `€1,499 a month` and `1.499 € al mes` are both 1499. */
const amountIn = (text) => Number((/\d[\d.,  ]*/.exec(text)?.[0] ?? 'NaN').replace(/[.,  ]/g, ''));
const shareIn = (text) => Number((/\d+[.,]\d\d/.exec(text)?.[0] ?? 'NaN').replace(',', '.'));

describe('the tiers are the owner’s decision, from one module, in every language', () => {
  it('are the tiers Trazum Pro’s docs/pricing.md decided', () => {
    /*
      Written again here and not imported: the table of `docs/pricing.md` in
      the Trazum Pro repository, which is private and so cannot be read by
      this test. Team €149 up to €5,000 a month, Growth €499 up to €25,000,
      Scale €1,499 up to €100,000, Enterprise by agreement, shares 2.98%,
      2.00% and 1.50%. A change to the module that is not a change there
      fails here first.
    */
    assert.deepEqual(
      pro.PRO_TIERS.map((tier) => [tier.id, tier.name, tier.priceEur, tier.ceilingEur, tier.sharePct]),
      [
        ['team', 'Team', 149, 5000, 2.98],
        ['growth', 'Growth', 499, 25000, 2],
        ['scale', 'Scale', 1499, 100000, 1.5],
        ['enterprise', 'Enterprise', null, null, null],
      ],
    );
    assert.equal(pro.PRO_BREAK_EVEN_TIER, 'growth');
    assert.equal(pro.PRO_FREE_MEMBERS, 1);
  });

  it('states each share as the price over the ceiling, to two places', () => {
    for (const tier of pro.PRO_TIERS.filter((entry) => entry.priceEur !== null)) {
      assert.equal(Math.round((tier.priceEur / tier.ceilingEur) * 10_000) / 100, tier.sharePct, tier.id);
    }
    // And the ceilings rise, so "above the last one" means something.
    const ceilings = pro.PRO_TIERS.map((tier) => tier.ceilingEur).filter((value) => value !== null);
    assert.deepEqual([...ceilings].sort((a, b) => a - b), ceilings);
  });

  it('prints each tier’s price, ceiling and share as the module holds them, in every language', () => {
    let checked = 0;
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      const t = proCopy[locale];
      assert.equal((html.match(/<tr data-tier="/g) ?? []).length, pro.PRO_TIERS.length, `${locale}: a row the module does not have`);
      pro.PRO_TIERS.forEach((tier, at) => {
        const row = rowOf(html, tier.id);
        assert.ok(row.includes(`>${tier.name}</th>`), `${locale}/${tier.id}: the name`);
        const price = cellOf(row, 'price');
        const spend = cellOf(row, 'spend');
        const part = cellOf(row, 'share');
        if (tier.priceEur === null) {
          assert.equal(price.text, t.byAgreement, `${locale}/${tier.id}: a price was printed for a tier by agreement`);
          assert.equal(price.value, '');
        } else {
          assert.equal(amountIn(price.text), tier.priceEur, `${locale}/${tier.id}: the page says ${price.text}`);
          assert.equal(Number(price.value), tier.priceEur, `${locale}/${tier.id}: data-value`);
          assert.ok(price.text.includes('€'), `${locale}/${tier.id}: no currency`);
        }
        if (tier.ceilingEur === null) {
          assert.equal(amountIn(spend.text), pro.PRO_TIERS[at - 1].ceilingEur, `${locale}/${tier.id}: the floor is not the last ceiling`);
        } else {
          assert.equal(amountIn(spend.text), tier.ceilingEur, `${locale}/${tier.id}: the page says ${spend.text}`);
        }
        if (tier.sharePct === null) assert.equal(part.text, t.byAgreement);
        else assert.equal(shareIn(part.text), tier.sharePct, `${locale}/${tier.id}: the page says ${part.text}`);
        checked += 1;
      });
      const growth = pro.PRO_TIERS.find((tier) => tier.id === pro.PRO_BREAK_EVEN_TIER);
      assert.ok(textOf(html).includes(textOf(t.breakEven(growth.name, pro.shareInProse(growth.sharePct, locale)))), `${locale}: the break-even sentence`);
      assert.ok(textOf(html).includes(t.freeLine(pro.PRO_FREE_MEMBERS)), `${locale}: the free line`);
    }
    assert.equal(checked, pro.PRO_TIERS.length * locales.MARKETING_LOCALES.length);
  });

  it('types no figure of its own: every amount on the page is formatted from the module', () => {
    for (const file of ['components/pro/ProPage.tsx', 'lib/pro-copy.ts']) {
      const code = codeOf(file);
      assert.ok(!/€\s*\d|\d\s*€/.test(code), `${file} has an amount written in it`);
      for (const tier of pro.PRO_TIERS) {
        // A share of 2 would match every `2` in the file; the decimal shares and every price and ceiling cannot.
        for (const figure of [tier.priceEur, tier.ceilingEur, tier.sharePct].filter((value) => value !== null && String(value).length >= 3)) {
          assert.ok(!new RegExp(`(?<![\\w.-])${String(figure).replace('.', '\\.')}(?![\\w.%-]|px)`).test(code.replace(/className="[^"]*"/g, '')), `${file} writes ${figure}`);
        }
      }
    }
    assert.equal(pro.euros(1499, 'en'), '€1,499');
    assert.equal(pro.euros(100000, 'es'), '100.000 €');
    assert.equal(pro.share(2, 'en'), '2.00%');
    assert.equal(pro.shareInProse(2, 'en'), '2%');
    assert.equal(pro.shareInProse(2.98, 'de'), '2,98 %');
  });
});

describe('it says it is not open, while it is not', () => {
  it('is not open: Pro’s billing is not built', () => {
    // Pinned. Opening it is the owner's decision, and comes with a page for an open service.
    assert.equal(pro.PRO_OPEN, false);
  });

  it('says so above the title and in its own section, in every language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      const t = proCopy[locale];
      assert.ok(html.includes('data-pro-status=""') && html.includes(`>${t.status}<`), `${locale}: the status above the title`);
      assert.ok(html.includes('data-pro-not-open=""'), `${locale}: the section that says it is not open`);
      assert.ok(textOf(html).includes(textOf(t.notOpen)), `${locale}: the sentence that says it is not open`);
      assert.ok(html.indexOf('data-pro-status') < html.indexOf('id="pro-title"'), `${locale}: the status comes after the title`);
    }
    const code = codeOf('components/pro/ProPage.tsx');
    assert.equal((code.match(/!PRO_OPEN && \(/g) ?? []).length, 2, 'the status is not drawn from the flag');
  });

  it('claims nothing an open service would, in any language', () => {
    const forbidden = /available now|now available|sign up|subscribe|free trial|buy now|customers? (?:say|use|trust)|trusted by|testimonial|\d[\d,.]* (?:users|teams|organisations|organizations)\b/i;
    for (const locale of locales.MARKETING_LOCALES) {
      const text = textOf(render(locale)) + JSON.stringify(proCopy[locale]);
      assert.ok(!forbidden.test(text), `${locale}: ${forbidden.exec(text)?.[0]}`);
    }
    const html = render();
    assert.ok(!/<form|<input|<img/i.test(html), 'the page has a form, a field or a picture');
  });
});

describe('the call to action mails the address the repository publishes', () => {
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

  it('is the one address in CODE_OF_CONDUCT.md, and no other file publishes another', () => {
    const conduct = [...read('CODE_OF_CONDUCT.md').matchAll(ADDRESS)].map(([address]) => address);
    assert.deepEqual([...new Set(conduct)], [pro.PRO_CONTACT]);
    for (const file of ['README.md', 'SECURITY.md', 'SUPPORT.md', 'CONTRIBUTING.md']) {
      const found = [...read(file).matchAll(ADDRESS)].map(([address]) => address).filter((address) => !/noreply|example|@trazum\//.test(address));
      for (const address of found) assert.equal(address, pro.PRO_CONTACT, `${file} publishes ${address}`);
    }
  });

  it('is one mailto link, with the subject filled in and nothing else, in every language', () => {
    const expected = `mailto:${pro.PRO_CONTACT}?subject=${encodeURIComponent(pro.PRO_MAIL_SUBJECT)}`;
    assert.equal(pro.PRO_MAILTO, expected);
    assert.ok(!/[?&]body=/.test(pro.PRO_MAILTO));
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(locale);
      const links = [...html.matchAll(/href="(mailto:[^"]*)"/g)].map(([, href]) => href.replace(/&amp;/g, '&'));
      assert.deepEqual(links, [expected], `${locale}: not exactly the one mailto`);
      assert.match(html, /<a href="mailto:[^"]*" data-pro-cta=""/);
      assert.ok(textOf(html).includes(textOf(proCopy[locale].ctaNote(pro.PRO_CONTACT))), `${locale}: what happens to the email`);
      assert.ok(html.includes(`href="${site.GITHUB_URL}/releases"`), `${locale}: the releases`);
    }
  });
});

describe('the site leads to it', () => {
  it('is in the header and the footer, and the header names it current on its page', () => {
    assert.ok(site.HEADER_ENTRIES.includes('pro'));
    assert.deepEqual(site.SITE_LINKS.pro, { id: 'pro', href: '/pro', external: false });
    assert.ok(site.FOOTER_GROUPS.flatMap((group) => group.links).includes('pro'));
    for (const locale of locales.MARKETING_LOCALES) {
      assert.match(render(locale), /<a href="\/pro" aria-current="page"/, locale);
      assert.ok(siteCopy.SITE_COPY[locale].links.pro, `${locale}: no label`);
      const landing = server.renderToStaticMarkup(React.createElement(Landing, { initialLocale: locale }));
      const header = landing.slice(landing.indexOf('data-site-header'), landing.indexOf('</header>'));
      assert.ok(header.includes('href="/pro"'), `${locale}: the landing's header has no Pro`);
      const footer = landing.slice(landing.indexOf('data-site-footer'));
      assert.ok(footer.includes('href="/pro"'), `${locale}: the landing's footer has no Pro`);
    }
  });

  it('is in the sitemap, which is drawn from the site’s list of pages, and robots.txt names the sitemap', () => {
    assert.ok(site.SITEMAP_PATHS.includes('/pro'));
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    assert.deepEqual(urls, [...site.SITEMAP_PATHS]);
    for (const id of site.HEADER_ENTRIES.filter((entry) => !site.SITE_LINKS[entry].href.includes('?'))) {
      assert.ok(urls.includes(site.SITE_LINKS[id].href), `${id} is in the header and not the sitemap`);
    }
    assert.match(web('app/robots.ts'), /sitemap: new URL\('\/sitemap\.xml', SITE_ORIGIN\)\.href/);
  });

  it('has its own title, description, address and card', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const meta = metadata.proMetadata(locale);
      assert.equal(meta.alternates.canonical, '/pro');
      assert.equal(meta.openGraph.url, '/pro');
      assert.equal(meta.title.absolute, 'Trazum Pro');
      assert.equal(meta.description, proCopy[locale].metaDescription);
    }
    assert.match(web('app/pro/page.tsx'), /export async function generateMetadata\(\)[\s\S]*proMetadata\(/);
    assert.match(web('app/pro/opengraph-image.tsx'), /return socialCard\(/);
  });
});

/**
 * WCAG 2's relative luminance and contrast ratio, worked here rather than
 * trusted, over the colours `globals.css` declares for each theme.
 */
describe('every text it sets reads on the ground it sets it on, in both themes', () => {
  const css = () => web('app/globals.css');
  const blockAfter = (opening) => {
    const at = css().indexOf(opening);
    assert.notEqual(at, -1, `${opening} is not in globals.css`);
    return css().slice(at, css().indexOf('\n}', at));
  };
  /** A custom property's colour in a theme, following `var()` to the end. */
  const resolve = (name, blocks) => {
    for (const block of blocks) {
      const found = new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(block);
      if (found === null) continue;
      const value = found[1].trim();
      const alias = /^var\((--[\w-]+)\)$/.exec(value);
      return alias ? resolve(alias[1], blocks) : value.toLowerCase();
    }
    throw new Error(`${name} is not declared`);
  };
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /** What each utility the page uses paints, as a custom property. */
  const TEXT = { 'text-foreground': '--foreground', 'text-muted-foreground': '--muted-foreground', 'text-terracotta': '--terracotta', 'text-primary-foreground': '--primary-foreground' };
  const GROUND = { 'bg-background': '--background', 'bg-layer': '--layer', 'bg-layer-hover': '--layer-hover', 'bg-primary': '--primary' };
  /** The pairs the page sets: each text on each ground it can sit on, a quiet button's ink on its hover wash, and the acid fill with its own ink. */
  const PAIRS = [
    ...['text-foreground', 'text-muted-foreground', 'text-terracotta'].flatMap((text) => ['bg-background', 'bg-layer'].map((ground) => [text, ground])),
    ['text-foreground', 'bg-layer-hover'],
    ['text-primary-foreground', 'bg-primary'],
  ];

  it('uses no text colour or ground the pairs below do not check', () => {
    const code = codeOf('components/pro/ProPage.tsx');
    const texts = new Set([...code.matchAll(/(?<![\w-])text-[a-z][a-z-]*/g)].map(([name]) => name).filter((name) => !/^text-(?:left|right|center)$/.test(name)));
    assert.ok(texts.size >= 3, 'the page’s text colours were not found');
    for (const name of texts) assert.ok(name in TEXT, `the page sets ${name}, which nothing here checks`);
    const grounds = new Set([...code.matchAll(/(?<![\w-])bg-[a-z][a-z-]*/g)].map(([name]) => name));
    for (const name of grounds) assert.ok(name in GROUND, `the page sets ${name}, which nothing here checks`);
  });

  it('reads at 4.5:1 or better on paper and on the dark canvas', () => {
    const light = [blockAfter(':root {')];
    const dark = [blockAfter(":root[data-theme='dark'] {"), ...light];
    let pairs = 0;
    for (const [theme, blocks] of [['light', light], ['dark', dark]]) {
      for (const [text, ground] of PAIRS) {
        const ratio = contrast(resolve(TEXT[text], blocks), resolve(GROUND[ground], blocks));
        assert.ok(ratio >= 4.5, `${theme}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
        pairs += 1;
      }
    }
    assert.equal(pairs, PAIRS.length * 2);
  });
});

describe('it sends nothing, and says what the repository says', () => {
  it('makes no request, stores nothing and names no host but the repository’s', () => {
    for (const file of ['components/pro/ProPage.tsx', 'lib/pro.ts', 'lib/pro-copy.ts', 'app/pro/page.tsx']) {
      const code = codeOf(file);
      for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /localStorage|sessionStorage|indexedDB/, /document\.cookie/, /\btrack\(/, /<form/, /<img/, /process\.env/, /node:/]) {
        assert.ok(!forbidden.test(code), `${file} uses ${forbidden}`);
      }
      for (const [address] of code.matchAll(/\bhttps?:[^\s'"`)]*/g)) {
        const url = new URL(address);
        assert.ok(url.host === 'github.com' && url.pathname.startsWith('/TrazumAPP/Trazum'), `${file} names ${address}`);
      }
      assert.ok(!/dangerouslySetInnerHTML/.test(code), `${file} writes HTML`);
    }
  });

  it('agrees with docs/licensing.md: no analysis leaves the open set, and Pro relicenses nothing', () => {
    const licensing = read('docs/licensing.md').replace(/\s+/g, ' ');
    assert.match(licensing, /No analysis this repository can perform today will move out of the open set/);
    assert.match(licensing, /ships proprietary from its first commit\*\* under the stated policy; that does not relicense any existing repository code or remove an existing analysis from the open set/);
    const html = render();
    assert.ok(html.includes('href="/docs/licensing"'), 'the page does not point at the licensing page');
    assert.match(proCopy.en.promise, /No analysis moves out of the open set/);
    assert.match(proCopy.en.promise, /relicenses nothing in this repository/);
  });

  it('points at the receipt’s documentation and at the test that holds what it leaves out', () => {
    const ids = [];
    md.walkBlocks(md.parseMarkdown(read('docs/commands.md'), { file: 'docs/commands.md' }).blocks, (block) => block.t === 'h' && ids.push(block.id));
    assert.ok(ids.includes('a-figure-that-still-answers-elsewhere-trazum-receipt'), 'the receipt section of docs/commands.md moved');
    const html = render();
    assert.ok(html.includes('href="/docs/commands#a-figure-that-still-answers-elsewhere-trazum-receipt"'));
    assert.ok(html.includes(`href="${site.GITHUB_URL}/blob/main/packages/core/test/receipt-redaction.test.js"`));
    // The four things the page says the test plants are the four it plants.
    const test = read('packages/core/test/receipt-redaction.test.js');
    for (const plant of ['prompt:', 'path:', 'branch:', 'credential:']) assert.ok(test.includes(plant), `the test no longer plants ${plant}`);
  });
});

describe('the words, in every language', () => {
  it('have the same keys in all five, none of them empty, with no em-dash', () => {
    const walk = (value, path, out) => {
      if (typeof value === 'string') out.push([path, value]);
      else if (typeof value === 'function') out.push([path, value('X', 1)]);
      else if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, out);
      return out;
    };
    const english = walk(proCopy.en, 'pro', []);
    assert.ok(english.length >= 30, 'the copy has almost nothing in it');
    for (const locale of locales.MARKETING_LOCALES) {
      const found = walk(proCopy[locale], 'pro', []);
      assert.deepEqual(found.map(([path]) => path), english.map(([path]) => path), `${locale}: not the same keys`);
      for (const [path, text] of found) {
        assert.ok(text.trim() !== '', `${locale}${path} is empty`);
        assert.ok(!text.includes('—'), `${locale}${path} has an em-dash`);
      }
      if (locale !== 'en') assert.notEqual(proCopy[locale].lede, proCopy.en.lede, locale);
    }
    for (const file of ['lib/pro.ts', 'lib/pro-copy.ts', 'components/pro/ProPage.tsx', 'app/pro/page.tsx', 'app/pro/opengraph-image.tsx', 'app/sitemap.ts', 'lib/site-origin.ts']) {
      assert.ok(!web(file).includes('—'), `${file} has an em-dash`);
    }
  });
});
