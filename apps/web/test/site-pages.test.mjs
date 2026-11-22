import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * `/models`, `/roadmap` and `/changelog`: each page is held to the source it
 * is made from.
 *
 * - The models page is the catalogue. The expected figures are read from
 *   `MODELS` in this file and compared with what the page prints, so a model
 *   missing from the page, a rate that differs, a review date that differs, a
 *   retired model drawn as current and a model with no price drawn with one
 *   each fail here, by name.
 * - The roadmap is `.github/milestones.json`, in its order, with no date on
 *   any milestone, and `ROADMAP.md`'s section of what is under consideration.
 * - The changelog is `CHANGELOG.md`, newest first, one anchor per release.
 *
 * Nothing here copies a figure out of the page and into an expectation: the
 * page's rates are parsed back from its markup and compared with the
 * catalogue's own numbers.
 */

register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const web = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

let core, pages, changesModule, builder, md, view, locales, copy, site, metadata, manifest, React, server, built;
let ModelsPage, RoadmapPage, ChangelogIndexPage, ReleasePage, DocBody, DocsIndex, BrandPage, brandModule, brandFiles;

before(async () => {
  core = await import('@trazum/core');
  pages = await import('../../../scripts/build-site-pages.mjs');
  changesModule = await import('../../../scripts/changes.mjs');
  builder = await import('../../../scripts/build-docs-site.mjs');
  md = await import('../../../scripts/docs-markdown.mjs');
  view = await import('../lib/models/view.ts');
  locales = await import('../lib/marketing-locales.ts');
  copy = await import('../lib/pages-copy.ts');
  site = await import('../lib/site.ts');
  metadata = await import('../lib/site-metadata.ts');
  manifest = await import('../lib/docs/manifest.ts');
  React = await import('react');
  server = await import('react-dom/server');
  ({ ModelsPage } = await import('../components/models/ModelsPage.tsx'));
  ({ RoadmapPage } = await import('../components/history/RoadmapPage.tsx'));
  ({ ChangelogIndexPage, ReleasePage } = await import('../components/history/ChangelogPages.tsx'));
  ({ DocBody } = await import('../components/docs/DocBody.tsx'));
  ({ BrandPage } = await import('../components/brand/BrandPage.tsx'));
  brandFiles = await import('../../../scripts/brand-files.mjs');
  brandModule = await import('../../../scripts/brand.mjs');
  ({ DocsIndex } = await import('../components/docs/DocsIndex.tsx'));
  built = pages.buildSitePages();
});

const h = (...args) => React.createElement(...args);
const render = (element) => server.renderToStaticMarkup(element);
const extra = () => ({ sources: built.sources, unpriced: built.unpriced });
const modelsHtml = (catalogue, locale = 'en') => render(h(ModelsPage, { initialLocale: locale, catalogue }));
const catalogueHtml = (locale = 'en') => modelsHtml(view.catalogueView(extra()), locale);

/** The text of some markup, tags and entities gone. */
const textOf = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    // The ampersand last: decoded first, `&amp;lt;` would come out as `<`.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** The markup of one model's body in the models page. */
const bodyOf = (html, id) => {
  const start = html.indexOf(`<tbody id="model-${id}"`);
  assert.notEqual(start, -1, `${id} is not on the page`);
  return html.slice(start, html.indexOf('</tbody>', start));
};

/** `$1,234.50` and `$0.7500` as the number they print. */
const dollars = (text) => Number(text.replace(/[$,]/g, ''));

/** A code file without its comments: what it does, not what it says. */
const codeOf = (path) =>
  web(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('/models is the catalogue', () => {
  it('has a row for every model of the catalogue, in the catalogue’s order within each provider', () => {
    const catalogue = view.catalogueView(extra());
    const html = catalogueHtml();
    assert.ok(core.MODELS.length >= 80, `only ${core.MODELS.length} models found: has the catalogue moved?`);
    for (const model of core.MODELS) assert.ok(html.includes(`<tbody id="model-${model.id}" data-model="${model.id}"`), `${model.id} is not on the page`);
    assert.equal((html.match(/<tbody id="model-/g) ?? []).length, core.MODELS.length, 'the page has a row the catalogue does not');
    for (const provider of catalogue.providers) {
      assert.deepEqual(
        provider.models.map((model) => model.id),
        core.MODELS.filter((model) => (model.provider ?? '') === provider.id).map((model) => model.id),
        `${provider.id}: the rows are not the catalogue's, in its order`,
      );
    }
    assert.equal(catalogue.counts.models, core.MODELS.length);
  });

  it('prints each model’s rates as the catalogue holds them, to the last digit', () => {
    const html = catalogueHtml();
    let checked = 0;
    for (const model of core.MODELS) {
      const body = bodyOf(html, model.id);
      const cells = [...body.matchAll(/<td class="px-3 py-3 text-right font-mono[^>]*>([^<]*)</g)].map((match) => match[1]);
      assert.equal(dollars(cells[0]), model.inputPerMTok, `${model.id}: input`);
      assert.equal(dollars(cells[1]), model.outputPerMTok, `${model.id}: output`);
      assert.equal(cells[0], core.formatUsd(model.inputPerMTok), `${model.id}: not the formatter every report uses`);
      assert.equal(cells[2], model.contextWindow.toLocaleString('en-US'), `${model.id}: context`);
      checked += 1;
    }
    assert.equal(checked, core.MODELS.length);
  });

  it('prints every conditional rate, service tier, earlier period and promotion the catalogue states', () => {
    const html = catalogueHtml();
    let figures = 0;
    for (const model of core.MODELS) {
      const body = textOf(bodyOf(html, model.id));
      const state = (rate) => {
        figures += 1;
        const text = view.rateText(rate);
        assert.ok(text !== null && body.includes(text), `${model.id}: ${rate} is not on the page`);
      };
      for (const tier of model.tiers ?? []) [tier.inputPerMTok, tier.outputPerMTok].forEach(state);
      for (const sheet of Object.values(model.serviceTiers ?? {})) {
        [sheet.inputPerMTok, sheet.outputPerMTok].forEach(state);
        for (const tier of sheet.tiers ?? []) [tier.inputPerMTok, tier.outputPerMTok].forEach(state);
      }
      for (const period of model.history ?? []) {
        [period.inputPerMTok, period.outputPerMTok].forEach(state);
        assert.ok(body.includes(period.until), `${model.id}: the period ending ${period.until} is not on the page`);
      }
      if (model.promo) {
        [model.promo.inputPerMTok, model.promo.outputPerMTok].forEach(state);
        assert.ok(body.includes(model.promo.until), `${model.id}: the promotion's end is not on the page`);
      }
    }
    assert.ok(figures > 150, `only ${figures} conditional figures checked`);
  });

  it('never writes a rate it rounded: a rate the formatter would change is written as it is', () => {
    assert.equal(view.rateText(0.000375), '$0.000375');
    assert.equal(view.rateText(0.15), core.formatUsd(0.15));
    assert.equal(view.rateText(Number.NaN), null);
    assert.equal(view.rateText(undefined), null);
    assert.equal(view.rateText(-1), null);
    for (const model of core.MODELS) {
      for (const rate of [model.inputPerMTok, model.outputPerMTok]) assert.equal(dollars(view.rateText(rate)), rate, `${model.id}: ${rate}`);
    }
  });

  it('states cache and batch as the multiple the catalogue holds, and computes no price from it', () => {
    for (const model of core.MODELS) {
      const row = view.modelView(model);
      const m = core.multipliersFor(model);
      const caches = (model.caching ?? 'explicit') === 'explicit' || model.caching === 'automatic';
      assert.equal(row.cacheRead, caches ? `${m.cacheRead}x` : null, model.id);
      assert.equal(row.batch, m.batch === null ? 'none' : `${m.batch}x`, model.id);
    }
    // No dollar figure is typed into the page's code, and none is multiplied out.
    for (const file of ['components/models/ModelsPage.tsx', 'lib/models/view.ts']) {
      const code = codeOf(file);
      assert.ok(!/\$\d/.test(code), `${file} has a dollar figure written in it`);
      assert.ok(!/\bInPerMTok\s*\*|PerMTok\s*\*\s*\w*(?:cache|batch|mult)/i.test(code), `${file} multiplies a rate`);
      assert.ok(!/\b(?:19|20)\d\d-\d\d-\d\d\b/.test(code), `${file} has a date written in it`);
    }
  });

  it('names where each provider’s prices were read, and the date, from the catalogue', () => {
    const catalogue = view.catalogueView(extra());
    const html = catalogueHtml();
    for (const provider of catalogue.providers) {
      assert.equal(provider.reviewed, core.PROVIDER_REVIEWED[provider.id] ?? null, `${provider.id}: the review date`);
      assert.ok(html.includes(`data-reviewed="${core.PROVIDER_REVIEWED[provider.id]}"`), `${provider.id}: the date is not on the page`);
      assert.ok(provider.source !== null, `${provider.id}: the catalogue names no page`);
      const url = new URL(provider.source.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(`${url.hostname}${url.pathname}`, provider.source.label);
      // The page is one the catalogue's own source names, found there and not typed.
      assert.ok(read('packages/core/src/pricing.ts').includes(provider.source.label), `${provider.id}: ${provider.source.label} is not in pricing.ts`);
      assert.ok(html.includes(`href="${provider.source.url}"`), `${provider.id}: the page is not linked`);
    }
    assert.deepEqual(Object.keys(built.sources).sort(), Object.keys(core.PROVIDER_REVIEWED).sort(), 'a provider has a date and no source, or the other way round');
    assert.equal(catalogue.reviewed, core.PRICING_LAST_REVIEWED);
    assert.ok(html.includes(`data-reviewed-oldest="${core.PRICING_LAST_REVIEWED}"`));
    for (const id of Object.keys(core.PROVIDER_REVIEWED)) assert.ok(view.PROVIDER_NAMES[id], `${id} has no display name yet`);
  });

  it('draws a retired model as retired, in form and in words, and only that model', () => {
    const html = catalogueHtml();
    const retired = core.MODELS.filter((model) => model.retired);
    assert.ok(retired.length >= 3, 'the retired models this checks were not found');
    for (const model of core.MODELS) {
      const body = bodyOf(html, model.id);
      assert.equal(body.includes('data-retired=""'), model.retired !== undefined, `${model.id}: retired state`);
      assert.equal(body.includes('data-state="retired"'), model.retired !== undefined, `${model.id}: retired tab`);
      if (model.retired) {
        const text = textOf(body);
        assert.ok(text.includes(model.retired.on) && text.includes(model.retired.because), `${model.id}: the provider's words and date are not on the page`);
      }
    }
  });

  it('draws a promotion as promotional, with its end date, and only a model that has one', () => {
    const html = catalogueHtml();
    assert.ok(core.MODELS.some((model) => model.promo), 'no promotion found to check');
    for (const model of core.MODELS) {
      const body = bodyOf(html, model.id);
      assert.equal(body.includes('data-promo=""'), model.promo !== undefined, `${model.id}`);
      assert.equal(body.includes('data-state="promo"'), model.promo !== undefined, `${model.id}: promotional tab`);
    }
  });

  it('draws a model with no finite price as unpriced, with no figure, and lists what providers leave unpriced', () => {
    const base = core.MODELS[0];
    const rows = [
      { ...base, id: 'planted-nan', displayName: 'Planted NaN', inputPerMTok: Number.NaN },
      { ...base, id: 'planted-missing', displayName: 'Planted missing', outputPerMTok: undefined },
      { ...base, id: 'planted-priced', displayName: 'Planted priced', inputPerMTok: 1, outputPerMTok: 2 },
    ];
    const catalogue = view.catalogueView({ sources: {}, unpriced: [] }, rows, { anthropic: '2026-01-01' }, '2026-01-01');
    const html = modelsHtml(catalogue);
    for (const id of ['planted-nan', 'planted-missing']) {
      const body = bodyOf(html, id);
      assert.ok(body.includes('data-unpriced=""') && body.includes('data-state="none"'), `${id} is not drawn as unpriced`);
      const rateCells = [...body.matchAll(/<td class="px-3 py-3 text-right font-mono[^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?)</g)].slice(0, 2).map((match) => match[1]);
      assert.ok(rateCells.every((cell) => !cell.includes('$')), `${id} is drawn with a price: ${rateCells}`);
    }
    assert.ok(!bodyOf(html, 'planted-priced').includes('data-unpriced'));
    assert.equal(catalogue.counts.unpricedRows, 2);

    // And what the providers' pages list that the catalogue leaves out on purpose.
    assert.ok(built.unpriced.length >= 5, 'the deliberately unpriced models were not found');
    const real = catalogueHtml();
    for (const entry of built.unpriced) {
      assert.ok(real.includes(`data-unpriced-id="${entry.id}"`), `${entry.id} is not listed`);
      assert.ok(textOf(real).includes(entry.reason), `${entry.id}: its reason is not on the page`);
      assert.ok(!core.MODELS.some((model) => model.id === entry.id), `${entry.id} is priced and also listed as unpriced`);
    }
    for (const entry of built.unpriced) {
      const at = real.indexOf(`data-unpriced-id="${entry.id}"`);
      const item = real.slice(at, real.indexOf('</li>', at));
      assert.ok(!item.includes('$'), `${entry.id} is listed with a price`);
    }
  });

  it('keeps what a model is called, and what a provider says, as text', () => {
    const base = core.MODELS[0];
    const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const rows = [{ ...base, id: 'planted-hostile', displayName: hostile, notes: hostile, aliases: [hostile], retired: { on: '2026-01-01', because: hostile } }];
    const html = modelsHtml(view.catalogueView({ sources: {}, unpriced: [{ provider: 'anthropic', id: 'x', reason: hostile }] }, rows, {}, '2026-01-01'));
    assert.ok(!/<script/i.test(html), 'a <script> reached the page');
    assert.ok(!/<img[^>]*onerror/i.test(html), 'an onerror reached the page');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the hostile name was not shown as text');
    assert.ok(!/dangerouslySetInnerHTML/.test(web('components/models/ModelsPage.tsx')));
  });

  it('has a filter by provider and by text, in the page, that sends nothing and stores nothing', () => {
    const html = catalogueHtml();
    for (const provider of Object.keys(core.PROVIDER_REVIEWED)) assert.ok(html.includes(`data-provider-filter="${provider}"`), provider);
    assert.ok(html.includes('data-provider-filter="all"') && html.includes('type="search"') && html.includes('data-filter-status'));
    assert.match(html, /aria-live="polite"/);
    const code = codeOf('components/models/ModelsPage.tsx');
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /localStorage|sessionStorage|indexedDB/, /history\.(?:push|replace)State/, /useRouter|router\./, /location\./, /document\.cookie/]) {
      assert.ok(!forbidden.test(code), `the models page uses ${forbidden}`);
    }
  });

  it('is in the header, in every language, and the header names it current on its page', () => {
    assert.ok(site.HEADER_ENTRIES.includes('models'));
    for (const locale of locales.MARKETING_LOCALES) {
      const html = catalogueHtml(locale);
      assert.match(html, /<a href="\/models" aria-current="page"/, locale);
      assert.ok(html.includes(`>${copy.MODELS_COPY[locale].title}<`), locale);
      assert.equal(metadata.modelsMetadata(locale).alternates.canonical, '/models');
    }
  });

  it('scrolls inside its own container and says so to a keyboard', () => {
    const html = catalogueHtml();
    assert.match(html, /role="region" aria-label="Anthropic models and rates" tabindex="0"/);
    assert.ok(html.includes('overflow-x-auto'));
  });
});

describe('/roadmap is .github/milestones.json and the section of ROADMAP.md that is not scheduled', () => {
  const stated = () => JSON.parse(read('.github/milestones.json'));
  const html = (roadmap = built.roadmap, locale = 'en') =>
    render(
      h(RoadmapPage, {
        initialLocale: locale,
        milestones: roadmap.milestones,
        hasConsideration: roadmap.hasConsideration,
        consideration: h(DocBody, { blocks: roadmap.consideration }),
      }),
    );

  it('lists every milestone of the file, in the file’s order, with its description and its issues', async () => {
    const { milestoneList, milestoneUrl } = await import('../../../scripts/milestones.mjs');
    const file = stated();
    assert.ok(file.length >= 5, 'the milestones this checks were not found');
    assert.deepEqual(built.roadmap.milestones.map((milestone) => milestone.title), file.map((entry) => entry.title));
    const page = html();
    const order = [...page.matchAll(/data-milestone="(\d+)"/g)].map((match) => Number(match[1]));
    assert.deepEqual(order, file.map((_, at) => at + 1), 'the page does not draw them in order');
    const text = textOf(page);
    let from = 0;
    const list = milestoneList(file);
    file.forEach((entry, at) => {
      const milestone = built.roadmap.milestones[at];
      assert.equal(milestone.description, entry.description);
      assert.equal(milestone.url, milestoneUrl(entry.title), `${entry.title}: the live milestone`);
      assert.ok(page.includes(`href="${milestone.url}"`), `${entry.title}: not linked`);
      const found = text.indexOf(entry.title, from);
      assert.ok(found >= from, `${entry.title}: missing, or out of order`);
      from = found;
      assert.ok(text.includes(entry.description), `${entry.title}: the description is not on the page`);
      assert.deepEqual(milestone.issues.map((issue) => issue.number), entry.issues);
      for (const issue of milestone.issues) {
        assert.ok(page.includes(`href="${issue.url}"`), `#${issue.number} is not linked`);
        // The same address ROADMAP.md's own list carries, from the same function.
        assert.ok(list.includes(`](${issue.url})`), `#${issue.number}: not the address ROADMAP.md's list uses`);
      }
      assert.ok(list.includes(`](${milestone.url})`), `${entry.title}: not the milestone address ROADMAP.md's list uses`);
    });
  });

  it('puts no date on a milestone', () => {
    for (const milestone of built.roadmap.milestones) {
      assert.deepEqual(Object.keys(milestone).sort(), ['description', 'issues', 'position', 'title', 'url'], 'a milestone grew a field');
      for (const issue of milestone.issues) assert.deepEqual(Object.keys(issue).sort(), ['number', 'title', 'url']);
    }
    const page = html();
    const milestones = page.slice(page.indexOf('<ol'), page.indexOf('</ol>'));
    const dated = milestones.replace(/<[^>]*>/g, ' ').match(/\b(?:19|20)\d\d-\d\d-\d\d\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b|\bQ[1-4] 20\d\d\b/);
    const sourceDated = JSON.stringify(stated()).match(/\b(?:19|20)\d\d-\d\d-\d\d\b/);
    assert.equal(dated === null ? null : dated[0], sourceDated === null ? null : sourceDated[0], 'a date is on the page that is not in the file');
    assert.match(page, /data-no-dates=""/);
  });

  it('draws what is under consideration, read by its heading, from ROADMAP.md', () => {
    const section = sectionOf(read('ROADMAP.md'), '## Under consideration');
    const { blocks } = md.parseMarkdown(section.replace('## Under consideration', ''), { file: 'ROADMAP.md' });
    const page = textOf(html()).replace(/[^\p{L}\p{N}]/gu, '');
    let items = 0;
    md.walkBlocks(blocks, (block) => {
      if (block.t !== 'p' && block.t !== 'ul') return;
      const nodes = block.t === 'p' ? [block.c] : block.c.map((item) => item.c.find((inner) => inner.t === 'p')?.c ?? []);
      for (const inline of nodes) {
        const wanted = md.inlineText(inline).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 60);
        if (wanted.length < 20) continue;
        items += 1;
        assert.ok(page.includes(wanted), `ROADMAP.md says "${wanted.slice(0, 40)}…" and the page does not`);
      }
    });
    assert.ok(items >= 5, `only ${items} entries of the section were found`);
    assert.equal(built.roadmap.hasConsideration, true);
  });

  it('reads the section by its heading, so a file that moved it, or lost the rest, still builds', () => {
    const root = mkdtempSync(join(tmpdir(), 'roadmap-736-'));
    try {
      mkdirSync(join(root, '.github'));
      writeFileSync(join(root, '.github/milestones.json'), JSON.stringify([{ title: 'T', description: 'D', issues: [1] }]));
      writeFileSync(join(root, 'ROADMAP.md'), '# Roadmap\n\n## How versions are decided\n\nx\n\n## Under consideration\n\n- **A thing** that is not scheduled and has a reason, written down here.\n\n## Next\n\n### In order\n\ntext\n');
      const result = pages.buildRoadmap({ root, docs: { resolve() {} } });
      assert.deepEqual(result.errors, []);
      assert.equal(result.hasConsideration, true);
      assert.equal(result.consideration[0].t, 'ul');
      assert.equal(result.milestones[0].issues[0].title, null, 'a title was invented for an issue');
      writeFileSync(join(root, 'ROADMAP.md'), '# Roadmap\n\n## Next\n\ntext\n');
      const gone = pages.buildRoadmap({ root, docs: { resolve() {} } });
      assert.equal(gone.hasConsideration, false);
      assert.ok(html(gone).includes(copy.ROADMAP_COPY.en.considerationMissing));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('shows an issue’s title only where the repository’s own table has it', () => {
    const titles = pages.issueTitles(read('ROADMAP.md'));
    assert.ok(titles.size >= 5, 'the table of open work was not read');
    for (const milestone of built.roadmap.milestones) {
      for (const issue of milestone.issues) assert.equal(issue.title, titles.get(issue.number) ?? null, `#${issue.number}`);
    }
  });

  it('refuses a milestones file with a date in it, as the file’s own checker does', () => {
    const root = mkdtempSync(join(tmpdir(), 'roadmap-736-'));
    try {
      mkdirSync(join(root, '.github'));
      writeFileSync(join(root, '.github/milestones.json'), JSON.stringify([{ title: 'T', description: 'D', issues: [1], due: '2026-12-01' }]));
      writeFileSync(join(root, 'ROADMAP.md'), '# Roadmap\n');
      const result = pages.buildRoadmap({ root, docs: { resolve() {} } });
      assert.ok(result.errors.some((error) => /no date/.test(error)), result.errors.join('; '));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('/changelog is CHANGELOG.md, newest first, one anchor per release', () => {
  const source = () => read('CHANGELOG.md');
  const headings = () => [...source().matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  const versionOf = (text) => /^(\d+\.\d+\.\d+)/.exec(text)?.[1] ?? null;
  const key = (version) => version.split('.').map(Number);
  const newer = (a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];
  };
  const index = (changelog = built.changelog) => {
    const modules = pages.changelogModules(changelog);
    return { modules, summaries: modules.index.releases };
  };
  const indexHtml = (changelog = built.changelog, locale = 'en') => {
    const { modules } = index(changelog);
    return render(
      h(ChangelogIndexPage, {
        initialLocale: locale,
        intro: h(DocBody, { blocks: modules.index.intro }),
        releases: modules.index.releases,
        anchors: modules.anchors,
        featured: modules.index.featured.map(({ headings: heads, blocks, ...release }) => ({ release, headings: heads, body: h(DocBody, { blocks }) })),
      }),
    );
  };

  it('has every release of the file, in the file’s order, and the file is newest first', () => {
    const versions = headings().map(versionOf).filter(Boolean);
    assert.ok(versions.length >= 140, `only ${versions.length} releases found in CHANGELOG.md`);
    for (let at = 1; at < versions.length; at += 1) assert.ok(newer(versions[at - 1], versions[at]), `${versions[at]} is not older than ${versions[at - 1]} in the file`);
    assert.equal(headings()[0], 'Unreleased');
    const { summaries } = index();
    assert.deepEqual(summaries.map((release) => release.version), [null, ...versions]);
    assert.deepEqual(built.changelog.releases.map((release) => release.version), [null, ...versions]);
  });

  it('gives each release one anchor on the page, and a page of its own', () => {
    const html = indexHtml();
    const { modules, summaries } = index();
    const ids = [...html.matchAll(/\sid="((?:unreleased|\d+\.\d+\.\d+))"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'an anchor is there twice');
    assert.deepEqual(ids.sort(), summaries.map((release) => release.anchor).sort(), 'a release has no anchor, or an anchor is not a release');
    assert.equal(modules.pages.length, summaries.length - 1);
    for (const release of summaries.filter((entry) => !entry.unreleased)) {
      assert.match(release.version, pages.VERSION);
      assert.ok(html.includes(`href="/changelog/${release.version}"`) || html.includes(`href="#${release.version}"`), `${release.version} is not linked`);
    }
    const ordered = [...html.matchAll(/data-release="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ordered, summaries.map((release) => release.anchor), 'the list is not newest first');
  });

  it('draws the unreleased changes and the newest few in full, and sends no more of the file than that', () => {
    const { modules } = index();
    assert.deepEqual(modules.index.featured.map((release) => release.anchor), ['unreleased', ...built.changelog.releases.slice(1, 1 + pages.FEATURED).map((release) => release.anchor)]);
    const html = indexHtml();
    for (const release of modules.index.featured) assert.ok(html.includes(`data-release-body="${release.anchor}"`), release.anchor);
    const bytes = Buffer.byteLength(builder.moduleOf(modules.index, 'ChangelogIndex', '../types'));
    // The file is over a megabyte; the index is a tenth of it.
    assert.ok(bytes < 250_000, `the index module is ${bytes} bytes`);
    assert.ok(bytes < Buffer.byteLength(source()) / 3, 'the index carries a third of the file or more');
    const second = modules.pages.find((page) => !modules.index.featured.some((release) => release.anchor === page.anchor));
    assert.ok(second, 'every release is drawn on the index');
  });

  it('reads each heading as a version and then a date or a title, and never makes a date up', () => {
    const find = (version) => built.changelog.releases.find((release) => release.version === version);
    assert.deepEqual([find('2.7.12').labelKind, find('2.7.12').label], ['date', '2026-11-17']);
    assert.deepEqual([find('2.5.1').labelKind, find('2.5.1').label], ['title', 'A bill for a period']);
    assert.deepEqual([find('1.83.0').labelKind, find('1.83.0').label], ['title', 'A receipt, and the surfaces that could not disagree']);
    assert.deepEqual([find('1.8.0').labelKind, find('1.8.0').label], ['none', null]);
    for (const release of built.changelog.releases) {
      if (release.labelKind === 'date') assert.match(release.label, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(release.labelKind === 'date' || !/^\d{4}-\d{2}-\d{2}$/.test(release.label ?? ''), `${release.anchor}: a date taken as a title`);
    }
    const html = indexHtml();
    const row = html.slice(html.indexOf('data-release="2.5.1"'), html.indexOf('</li>', html.indexOf('data-release="2.5.1"')));
    assert.ok(row.includes('A bill for a period') && !/<time/.test(row), 'a title was drawn as a date');
    assert.ok(indexHtml().includes('id="unreleased"'));
  });

  it('draws every release’s own notes on its page', () => {
    const { modules } = index();
    const sections = pages.sections(source(), 2);
    const bodyOfRelease = (version) => sections.find((section) => versionOf(section.heading) === version).body;
    let checked = 0;
    for (const page of modules.pages) {
      const html = render(
        h(ReleasePage, { initialLocale: 'en', release: { ...page, blocks: undefined }, newer: page.newer, older: page.older, headings: page.headings, body: h(DocBody, { blocks: page.blocks }) }),
      );
      // The first sentence of the release's own notes, read from the file by the same reader.
      const notes = md.parseMarkdown(`# T\n\n${bodyOfRelease(page.version)}`, { file: 'CHANGELOG.md', onUnknown: 'escape' }).blocks;
      let wanted;
      md.walkBlocks(notes, (block) => {
        if (wanted !== undefined || block.t !== 'p') return;
        const text = md.inlineText(block.c).replace(/[^\p{L}\p{N}]/gu, '');
        if (text.length >= 30) wanted = text;
      });
      if (wanted === undefined) continue;
      assert.ok(textOf(html).replace(/[^\p{L}\p{N}]/gu, '').includes(wanted.slice(0, 30)), `${page.version}: its notes are not on its page`);
      assert.ok(html.includes(`data-release-title="${page.version}"`));
      checked += 1;
    }
    assert.ok(checked >= 100, `only ${checked} release pages checked`);
  });

  it('links each release to its neighbours in order, and every release’s page exists to be linked', () => {
    const { modules } = index();
    modules.pages.forEach((page, at) => {
      assert.equal(page.newer?.version ?? null, modules.pages[at - 1]?.version ?? (at === 0 ? null : undefined));
      assert.equal(page.older?.version ?? null, modules.pages[at + 1]?.version ?? null);
    });
  });

  it('lands an old link: the address GitHub gave the heading, and the version, find the release', () => {
    const { modules } = index();
    for (const release of built.changelog.releases) assert.equal(modules.anchors[release.slug], release.anchor, release.slug);
    assert.equal(modules.anchors['2712--2026-11-17'], '2.7.12');
    assert.equal(Object.keys(modules.anchors).length, built.changelog.releases.length, 'two headings share an address');
    const code = codeOf('components/history/ChangelogPages.tsx');
    assert.ok(code.includes('window.location.replace(`${CHANGELOG_PATH}/${anchor}`)'), 'an anchor of a release that is not drawn has nowhere to go');
  });

  it('keeps what the file says as text, and builds from a file it can read and stops at one it cannot', () => {
    const root = mkdtempSync(join(tmpdir(), 'changelog-736-'));
    try {
      const hostile = '<script>alert(1)</script> and <img src=x onerror=alert(2)>';
      writeFileSync(
        join(root, 'CHANGELOG.md'),
        `# Changelog\n\nintro\n\n## Unreleased\n\n- ${'`'}<script>${'`'} then ${hostile.replaceAll('<', '\\<')}\n\n## 1.0.0 — "${'`'}<script>x</script>${'`'}"\n\n### Added\n\n- ${'`'}${hostile}${'`'}\n\n## 0.9.0\n\n- old\n`,
      );
      const result = pages.buildChangelog({ root, docs: { resolve() {} } });
      assert.deepEqual(result.errors, [], result.errors.join('; '));
      const html = indexHtml(result);
      assert.ok(!/<script/i.test(html) && !/<img[^>]*onerror/i.test(html), 'markup from the file reached the page');
      assert.ok(html.includes('&lt;script&gt;'), 'the hostile line was not shown as text');
      writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- <script>alert(1)</script>\n');
      assert.ok(pages.buildChangelog({ root, docs: { resolve() {} } }).errors.some((error) => /script/.test(error)), 'a raw tag in the file did not stop the build');
      writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- x\n\n## Soon\n\n- y\n');
      assert.ok(pages.buildChangelog({ root, docs: { resolve() {} } }).errors.some((error) => /Soon/.test(error)), 'a heading that is not a release was accepted');
      writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- x\n\n## 1.0.0\n\n- y\n\n## 1.0.0\n\n- z\n');
      assert.ok(pages.buildChangelog({ root, docs: { resolve() {} } }).errors.some((error) => /twice/.test(error)), 'a repeated release was accepted');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('shows what changes/ holds as Unreleased, the way the release will fold it (#847)', () => {
    const root = mkdtempSync(join(tmpdir(), 'changelog-847-'));
    try {
      writeFileSync(join(root, 'CHANGELOG.md'), `# Changelog\n\n## Unreleased\n\n${changesModule.POINTER}\n\n## 1.0.0\n\n- old\n`);
      const empty = pages.buildChangelog({ root, docs: { resolve() {} } });
      assert.deepEqual(empty.errors, [], empty.errors.join('; '));
      assert.ok(indexHtml(empty).includes('No changes yet.'), 'an empty folder is not said to be empty');
      mkdirSync(join(root, 'changes'));
      writeFileSync(join(root, 'changes', 'README.md'), 'How to add one.\n');
      writeFileSync(join(root, 'changes', '5.fixed.md'), '**A pending fix.** (#5) It works.\n');
      const built = pages.buildChangelog({ root, docs: { resolve() {} } });
      assert.deepEqual(built.errors, [], built.errors.join('; '));
      const html = indexHtml(built);
      assert.ok(html.includes('A pending fix.'), 'a file in changes/ is not on the page');
      assert.ok(!html.includes('Pending changes are files in'), 'the pointer was shown instead of the changes');
      assert.ok(!html.includes('How to add one'), 'the folder README was shown as a change');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('holds a version to a strict shape before it becomes a file name or a key', () => {
    for (const bad of ['../1.0.0', '1.0', '1.0.0.0', '01.0.0', '1.0.0/x', '__proto__', 'constructor', '1.0.0\n', 'v1.0.0']) assert.ok(!pages.VERSION.test(bad), bad);
    for (const good of ['0.1.0', '2.7.12', '10.20.30']) assert.ok(pages.VERSION.test(good), good);
    assert.ok(/Object\.hasOwn\(RELEASE_LOADERS, version\)/.test(web('lib/history/load.ts')));
  });
});

describe('what the three pages never do', () => {
  const FILES = [
    'app/models/page.tsx',
    'app/roadmap/page.tsx',
    'app/changelog/page.tsx',
    'app/changelog/[version]/page.tsx',
    'components/models/ModelsPage.tsx',
    'components/history/RoadmapPage.tsx',
    'components/history/ChangelogPages.tsx',
    'app/brand/page.tsx',
    'components/brand/BrandPage.tsx',
    'lib/models/view.ts',
    'lib/history/load.ts',
  ];

  it('fetch, or read a file, in a request', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      assert.ok(!/\bfetch\s*\(|XMLHttpRequest|axios|node:fs|node:http|readFileSync|process\.env/.test(code), `${file} reads something at request time`);
      assert.ok(!/api\.github\.com|githubusercontent/.test(code), `${file} names GitHub's API`);
    }
    for (const file of ['app/models/page.tsx', 'app/roadmap/page.tsx', 'app/changelog/page.tsx', 'app/changelog/[version]/page.tsx']) {
      for (const [, from] of web(file).matchAll(/from '([^']+)'/g)) assert.ok(!from.startsWith('node:'), `${file} imports ${from}`);
    }
  });

  it('name any address that is not the repository’s, and parse the ones they do', () => {
    for (const file of FILES) {
      const code = codeOf(file);
      for (const [address] of code.matchAll(/\bhttps?:[^\s'"`)]*/g)) {
        const url = URL.canParse(address) ? new URL(address) : null;
        assert.ok(url !== null && url.host === 'github.com' && url.pathname.startsWith('/TrazumAPP/'), `${file} names another host: ${address}`);
      }
      assert.ok(!/\son[A-Z][a-zA-Z]*="/.test(code), `${file} has an inline handler attribute`);
      assert.ok(!/dangerouslySetInnerHTML/.test(code), `${file} writes HTML`);
    }
  });

  it('loosen the Content-Security-Policy', () => {
    const middleware = web('middleware.ts');
    for (const needle of ["`default-src 'self'`", "`img-src 'self' data: https://avatars.githubusercontent.com`", "`font-src 'self'`", "`object-src 'none'`", "connect-src 'self'"]) {
      assert.ok(middleware.includes(needle), needle);
    }
  });

  it('use the build script’s escaper, and not JSON.stringify alone, for text that becomes code', () => {
    const script = read('scripts/build-site-pages.mjs');
    assert.ok(/literal\(/.test(script));
    for (const [line] of script.matchAll(/^.*JSON\.stringify.*$/gm)) {
      assert.ok(/literal\(|moduleOf|throw new Error/.test(line) || !/\$\{|`/.test(line), `JSON.stringify builds code: ${line.trim()}`);
    }
    assert.ok(!/\.includes\('https?:/.test(script), 'a host is compared with includes');
  });
});

describe('the site leads to the three pages', () => {
  it('lists them in the header and the footer, and /docs links them as pages of the site', () => {
    const footer = site.FOOTER_GROUPS.flatMap((group) => group.links);
    for (const id of ['models', 'roadmap', 'changelog']) {
      assert.equal(site.SITE_LINKS[id].external, false, id);
      assert.ok(footer.includes(id), `the footer has no ${id}`);
    }
    assert.ok(site.HEADER_ENTRIES.includes('models'));
    const html = render(h(DocsIndex, { initialLocale: 'en', descriptions: {}, tasks: null, unpublished: {} }));
    for (const id of ['models', 'roadmap', 'changelog']) assert.ok(html.includes(`data-site-page="${id}" `) || html.includes(`href="/${id}" data-site-page="${id}"`), `/docs does not link ${id}`);
    assert.ok(!manifest.KEPT.some((item) => item.id === 'changelog' || item.id === 'roadmap'), 'the index still sends the changelog or the roadmap to GitHub');
    assert.deepEqual(manifest.SITE_PAGES.map((entry) => entry.href), ['/changelog', '/roadmap']);
  });

  it('turns a link to the changelog or the roadmap in a document into a link to its page', () => {
    const hrefs = [];
    for (const doc of built.docs.documents) md.walkInlines(doc.blocks, (node) => node.t === 'a' && hrefs.push(node.href));
    assert.ok(hrefs.includes('/changelog') && hrefs.includes('/roadmap'), 'no document links the pages');
    assert.ok(!hrefs.some((href) => /blob\/main\/(?:CHANGELOG|ROADMAP)\.md$/.test(href)), 'a link to the whole file still goes to GitHub');
  });

  it('draws the pages’ links resolved and safe', () => {
    for (const link of built.docs.repoLinks.filter((entry) => entry.from === 'CHANGELOG.md' || entry.from === 'ROADMAP.md')) {
      assert.ok(read(link.path) !== undefined, `${link.from} links ${link.path}`);
    }
    assert.deepEqual(built.errors, [], built.errors.join('; '));
  });
});

describe('the words, in every language', () => {
  it('exist in all five, none of them empty, with no em-dash', () => {
    const walk = (value, path, out) => {
      if (typeof value === 'string') out.push([path, value]);
      else if (typeof value === 'function') {
        const sample = value('1', 2, true);
        assert.equal(typeof sample, 'string', path);
        out.push([path, sample]);
      } else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
    };
    for (const [name, table] of [['models', copy.MODELS_COPY], ['roadmap', copy.ROADMAP_COPY], ['changelog', copy.CHANGELOG_COPY], ['blurbs', copy.PAGE_BLURBS], ['brand', copy.BRAND_COPY]]) {
      const english = [];
      walk(table.en, name, english);
      assert.ok(english.length >= 5, name);
      for (const locale of locales.MARKETING_LOCALES) {
        const found = [];
        walk(table[locale], name, found);
        assert.deepEqual(found.map(([path]) => path), english.map(([path]) => path), `${name}/${locale}: not the same keys`);
        for (const [path, text] of found) {
          assert.ok(text.trim() !== '', `${locale}/${path} is empty`);
          assert.ok(!text.includes('\u2014'), `${locale}/${path} has an em-dash`);
        }
      }
    }
    for (const locale of locales.MARKETING_LOCALES.filter((l) => l !== 'en')) {
      assert.notEqual(copy.MODELS_COPY[locale].lede, copy.MODELS_COPY.en.lede, locale);
      assert.notEqual(copy.ROADMAP_COPY[locale].noDates, copy.ROADMAP_COPY.en.noDates, locale);
      assert.notEqual(copy.CHANGELOG_COPY[locale].lede, copy.CHANGELOG_COPY.en.lede, locale);
      assert.notEqual(site.SITE_LINKS.models.id, undefined);
    }
  });

  it('say the catalogue’s words are English, when the page is not', () => {
    for (const locale of locales.MARKETING_LOCALES.filter((l) => l !== 'en')) {
      assert.ok(catalogueHtml(locale).includes(copy.MODELS_COPY[locale].englishNote), locale);
    }
    assert.ok(!catalogueHtml('en').includes(copy.MODELS_COPY.en.englishNote));
  });
});

describe('the build is wired in, and ignored', () => {
  it('runs before the build, the dev server, the tests and the type check, and is not committed', () => {
    const pkg = JSON.parse(web('package.json'));
    for (const hook of ['predev', 'prebuild', 'pretest', 'pretypecheck']) assert.match(pkg.scripts[hook], /build-site-pages\.mjs/, hook);
    assert.ok(read('.gitignore').includes('/apps/web/lib/history/generated/'));
    const docker = read('Dockerfile');
    for (const file of ['CHANGELOG.md', 'changes', 'changes.mjs', 'ROADMAP.md', '.github/milestones.json', 'build-site-pages.mjs', 'milestones.mjs', 'ruleset.mjs', 'price-drift.mjs']) assert.ok(docker.includes(file), `the image build lacks ${file}`);
    const ignore = read('.dockerignore');
    for (const exception of ['!CHANGELOG.md', '!changes', '!ROADMAP.md', '!.github/milestones.json']) assert.ok(ignore.includes(exception), exception);
  });

  it('adds no dependency', () => {
    const pkg = JSON.parse(web('package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) assert.ok(!/markdown|remark|rehype|mdx|marked|micromark|unified|sanitize|dompurify/i.test(name), name);
  });
});


/**
 * `/brand`: the wordmark and the T to download, the colours, the typeface, the
 * voice and what not to do. Each value on it is held to the file it is read
 * from, which this reads again by itself: the colours from `globals.css`, the
 * voice and the rules from `DESIGN.md` by heading, the files from the script
 * that writes them.
 */
describe('/brand says what the files say', () => {
  const brandHtml = (brand = built.brand, locale = 'en') => render(h(BrandPage, { initialLocale: locale, brand }));
  const css = () => read('apps/web/app/globals.css').toLowerCase();
  const blockAfter = (opening) => {
    const at = css().indexOf(opening);
    assert.notEqual(at, -1, `${opening} is not in globals.css`);
    return css().slice(at, css().indexOf('\n}', at));
  };
  /** The custom property each role of DESIGN.md's token table is, written again here and not imported. */
  const VARIABLE = { Canvas: '--paper', Raised: '--paper-raised', Sunken: '--paper-sunken', Text: '--ink', Secondary: '--ink-soft', 'Muted text': '--ink-faint', Rule: '--rule', 'Strong rule': '--rule-strong', 'Primary fill': '--acid', 'Accent text': '--terracotta', 'Accent wash': '--terracotta-wash' };
  const valueIn = (block, variable) => new RegExp(`${variable}:\\s*(#[0-9a-f]{6})`).exec(block)?.[1] ?? null;

  it('builds without a problem', () => {
    assert.deepEqual(built.brand.errors, [], built.brand.errors.join('; '));
  });

  it('has a swatch for every row of the design document’s token table, with the values globals.css declares', () => {
    const table = sectionOf(read('DESIGN.md'), '## Tokens');
    const rows = [...table.matchAll(/^\| ([^|]+?) \| (#[0-9a-f]{6}) \| (#[0-9a-f]{6}) \|$/gim)].map(([, role, light, dark]) => ({ role, light, dark }));
    assert.equal(rows.length, 11, 'the token table has moved');
    const html = brandHtml();
    const lightBlock = blockAfter(':root {');
    const darkBlock = blockAfter(":root[data-theme='dark'] {");
    for (const row of rows) {
      const variable = VARIABLE[row.role];
      assert.ok(variable !== undefined, `${row.role} has no custom property here`);
      const light = valueIn(lightBlock, variable);
      const dark = valueIn(darkBlock, variable) ?? light;
      assert.equal(light, row.light.toLowerCase(), `${row.role}: globals.css says ${light}, DESIGN.md ${row.light}`);
      assert.equal(dark, row.dark.toLowerCase(), `${row.role}: globals.css says ${dark} in the dark theme, DESIGN.md ${row.dark}`);
      const at = html.indexOf(`data-token="${variable}"`);
      assert.notEqual(at, -1, `${row.role} is not on the page`);
      const item = html.slice(at, html.indexOf('</li>', at));
      assert.ok(item.includes(`data-copy="${light}"`) && item.includes(`data-copy="${dark}"`), `${row.role}: the page does not carry ${light} and ${dark}`);
      assert.ok(item.includes(`>${light}</code>`) && item.includes(`>${dark}</code>`), `${row.role}: the values are not printed`);
    }
    assert.equal((html.match(/data-token="/g) ?? []).length, rows.length, 'the page has a swatch the table does not');
  });

  it('agrees with brand.mjs wherever that names a colour', () => {
    const byRole = Object.fromEntries(built.brand.tokens.map((token) => [token.role, token]));
    const { LIGHT, DARK, ACID, INK } = brandModule;
    const pairs = [['Canvas', 'canvas'], ['Raised', 'raised'], ['Sunken', 'sunken'], ['Text', 'text'], ['Secondary', 'secondary'], ['Rule', 'rule']];
    for (const [role, key] of pairs) assert.equal(byRole[role].light, LIGHT[key], `${role} on paper`);
    for (const [role, key] of [...pairs, ['Muted text', 'muted'], ['Strong rule', 'strong'], ['Accent wash', 'wash']]) assert.equal(byRole[role].dark, DARK[key], `${role} on the dark canvas`);
    assert.equal(byRole['Primary fill'].light, ACID);
    assert.equal(byRole.Text.light, INK);
  });

  it('reads the voice and the rules from the design document, by heading, and says them as it does', () => {
    const using = sectionOf(read('DESIGN.md'), '## Using the brand');
    const parts = Object.fromEntries(using.split(/^### /m).slice(1).map((part) => [part.split('\n')[0].trim(), part.split('\n').slice(1).join('\n')]));
    const voice = parts.Voice.replace(/\s+/g, ' ').trim();
    assert.equal(built.brand.voice.join(' '), voice, 'the voice on the page is not the design document’s');
    assert.equal(built.brand.voice.length, 3, 'the voice is three sentences');
    const rules = parts['What not to do'].split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2).replace(/`/g, ''));
    assert.deepEqual(built.brand.dont, rules);
    const html = textOf(brandHtml());
    for (const sentence of built.brand.voice) assert.ok(html.includes(sentence), sentence);
    for (const rule of rules) assert.ok(html.includes(rule), rule);
    assert.ok(rules.some((rule) => /symbol/i.test(rule)), 'the list no longer says not to add a symbol');
  });

  it('names the typeface the stylesheet declares, and sets its specimen in the face the app uses', () => {
    const family = /--font-display:\s*'([^']+)'/.exec(read('apps/web/app/globals.css'))[1];
    assert.equal(built.brand.typeface.family, family);
    assert.equal(built.brand.typeface.name, family.replace(/ Variable$/, ''));
    assert.match(read('DESIGN.md'), new RegExp(`${family}`), 'the design document names another face');
    const html = brandHtml();
    assert.ok(html.includes(`data-typeface="${built.brand.typeface.name}"`));
    assert.ok(html.includes('data-specimen="name"') && codeOf('components/brand/BrandPage.tsx').includes('data-specimen="name"\n                      className="mt-2 font-display'), 'the specimen is not in the display face');
    assert.ok(html.includes(built.brand.typeface.mono.replace(/'/g, '&#x27;')) || textOf(html).includes(built.brand.typeface.mono), 'the monospace stack is not printed');
    for (const weight of [built.brand.typeface.weights.min, built.brand.typeface.weights.max]) assert.ok(html.includes(`data-weight="${weight}"`), `weight ${weight}`);
  });

  it('offers each file the script writes, links only to files that exist, and lists no other', () => {
    const html = brandHtml();
    const links = [...html.matchAll(/href="(\/brand\/[^"]+)" download/g)].map(([, href]) => href).sort();
    assert.deepEqual(links, brandFiles.BRAND_FILES.map((file) => `/brand/${file.name}`).sort());
    for (const href of links) {
      const file = join(ROOT, 'apps/web/public', href);
      assert.ok(readFileSync(file).length > 0, `${href} is a download link to a file that is not there`);
    }
    assert.equal(readdirSync(join(ROOT, 'apps/web/public/brand')).length, links.length, 'a file sits in public/brand that the page does not list');
    // Each button says the format and the ground, in its name.
    for (const file of built.brand.files) {
      const label = new RegExp(`aria-label="[^"]*${file.format.toUpperCase()}[^"]*${copy.BRAND_COPY.en.ground[file.ground].toLowerCase()} ground`);
      assert.match(html, label, file.name);
    }
    assert.ok(built.brand.files.every((file) => file.bytes === readFileSync(join(ROOT, 'apps/web/public/brand', file.name)).length), 'a size on the page is not the file’s');
  });

  it('introduces no symbol: the only pictures are the two marks the design document names', () => {
    const html = brandHtml();
    const images = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(([, src]) => src).sort();
    assert.deepEqual(images, ['/brand/trazum-t-dark.svg', '/brand/trazum-t-light.svg', '/brand/trazum-wordmark-dark.svg', '/brand/trazum-wordmark-light.svg']);
    const code = codeOf('components/brand/BrandPage.tsx');
    assert.ok(!/<path |<circle |<polygon |<rect /.test(code), 'the page draws a shape of its own');
  });

  it('states no trademark claim, and points at the licensing page for what there is to say', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const text = textOf(brandHtml(built.brand, locale)) + JSON.stringify(copy.BRAND_COPY[locale]);
      assert.ok(!/[™®©]|\(tm\)|\(r\)|registered trademark|trademark of|all rights reserved/i.test(text), `${locale}: a trademark claim`);
    }
    const html = brandHtml();
    assert.ok(html.includes('href="/docs/licensing"'), 'the page does not point at the licensing page');
    assert.match(read('docs/licensing.md'), /no trademark policy here yet/i, 'the licensing page no longer says there is no policy: this page repeats it');
    assert.ok(textOf(html).includes('no trademark policy yet'));
  });

  it('keeps what a token or a rule is called as text, whatever it holds', () => {
    const hostile = { ...built.brand, tokens: [{ role: '<img src=x onerror=alert(1)>', variable: '--<script>x</script>', light: '#000000', dark: '#ffffff' }], dont: ['<script>alert(1)</script>'] };
    const html = brandHtml(hostile);
    assert.ok(!/<script/i.test(html) && !/<img[^>]*onerror/i.test(html), 'a name reached the page as markup');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!/dangerouslySetInnerHTML/.test(web('components/brand/BrandPage.tsx')));
  });

  it('has a copy button that writes the clipboard from the click and sends nothing', () => {
    const code = codeOf('components/brand/BrandPage.tsx');
    assert.match(code, /navigator\.clipboard\.writeText\(value\)/);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/.test(code), 'the page sends or stores something');
  });

  it('is in the footer and not the header, in every language', () => {
    const footer = site.FOOTER_GROUPS.flatMap((group) => group.links);
    assert.ok(footer.includes('brand'));
    assert.ok(!site.HEADER_ENTRIES.includes('brand'));
    assert.equal(site.SITE_LINKS.brand.href, '/brand');
    assert.equal(site.SITE_LINKS.brand.external, false);
  });

  it('keeps its titles and its card in the brand', () => {
    for (const locale of locales.MARKETING_LOCALES) assert.match(metadata.brandMetadata(locale).title.absolute, /· Trazum$/);
    const page = web('app/brand/opengraph-image.tsx');
    assert.match(page, /return socialCard\(/);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(codeOf('lib/social-card.tsx')), 'the social card types a colour');
  });

  it('takes its language from the visitor, and says the rules are English when it is not', () => {
    for (const locale of locales.MARKETING_LOCALES.filter((l) => l !== 'en')) assert.ok(brandHtml(built.brand, locale).includes(copy.BRAND_COPY[locale].englishNote), locale);
    assert.ok(!brandHtml().includes(copy.BRAND_COPY.en.englishNote));
  });

  it('is built with the Docker image’s other files, from the design document', () => {
    const docker = read('Dockerfile');
    for (const file of ['DESIGN.md', 'brand.mjs', 'brand-files.mjs', 'wordmark.mjs']) assert.ok(docker.includes(file), `the image build lacks ${file}`);
    assert.ok(read('.dockerignore').includes('!DESIGN.md'));
  });
});
