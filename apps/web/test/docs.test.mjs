import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The documentation on the site: which documents are published, that each
 * one renders and every link in it lands, that nothing a document says can
 * run, that search finds what the documents have, and that every word around
 * them exists in every language.
 *
 * Rendered wherever the claim is about what a visitor gets. The build
 * (`scripts/build-docs-site.mjs`) is called in memory, so these tests read
 * the documents as they are now and not a copy somebody generated earlier.
 */

register('./helpers/loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const web = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

let manifest, builder, md, safe, searchLib, copy, site, locales, metadata, landing, React, server, built;
let DocBody, DocsShell, DocsIndex, DocsSearch;

before(async () => {
  manifest = await import('../lib/docs/manifest.ts');
  safe = await import('../lib/docs/safe.ts');
  searchLib = await import('../lib/docs/search.ts');
  copy = await import('../lib/docs/copy.ts');
  site = await import('../lib/site.ts');
  locales = await import('../lib/marketing-locales.ts');
  metadata = await import('../lib/site-metadata.ts');
  landing = await import('../lib/landing-copy.ts');
  builder = await import('../../../scripts/build-docs-site.mjs');
  md = await import('../../../scripts/docs-markdown.mjs');
  React = await import('react');
  server = await import('react-dom/server');
  ({ DocBody } = await import('../components/docs/DocBody.tsx'));
  ({ DocsShell } = await import('../components/docs/DocsShell.tsx'));
  ({ DocsIndex } = await import('../components/docs/DocsIndex.tsx'));
  ({ DocsSearch } = await import('../components/docs/DocsSearch.tsx'));
  built = builder.buildDocs();
});

const render = (element) => server.renderToStaticMarkup(element);
const h = (...args) => React.createElement(...args);

/** Every markdown file under a directory of the repository, as paths from the root. */
function markdownUnder(dir) {
  const found = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownUnder(rel));
    else if (entry.name.endsWith('.md')) found.push(rel);
  }
  return found;
}

/** The local links of `docs/README.md`, with the section (heading) each is under. */
function readmeLinks() {
  const { blocks } = md.parseMarkdown(read('docs/README.md'), { file: 'docs/README.md' });
  const links = [];
  let section = null;
  for (const block of blocks) {
    if (block.t === 'h' && block.depth === 2) section = md.inlineText(block.c);
    md.walkInlines([block], (node) => {
      if (node.t !== 'a' || /^[a-z][a-z0-9+.-]*:/i.test(node.href) || node.href.startsWith('#')) return;
      const target = builder.targetOf('docs/README.md', node.href);
      if ('path' in target && target.path.endsWith('.md')) links.push({ path: target.path, section });
    });
  }
  return links;
}

describe('which documents are published', () => {
  it('is one list, and every row of it is a file that is there', () => {
    assert.ok(manifest.DOCS.length >= 30, `only ${manifest.DOCS.length} documents are published`);
    for (const doc of manifest.DOCS) assert.ok(existsSync(join(ROOT, doc.path)), `${doc.path} is listed and is not in the repository`);
    assert.equal(new Set(manifest.DOCS.map((doc) => doc.slug)).size, manifest.DOCS.length, 'two documents share a slug');
    assert.equal(new Set(manifest.DOCS.map((doc) => doc.path)).size, manifest.DOCS.length, 'a document is listed twice');
    assert.equal(new Set(manifest.DOCS.map((doc) => doc.title)).size, manifest.DOCS.length, 'two documents share a title');
    for (const doc of manifest.DOCS) {
      assert.match(doc.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${doc.slug} is not an address`);
      assert.ok(manifest.DOC_GROUPS.includes(doc.group), `${doc.path} is in a group that does not exist`);
      assert.ok(doc.title.trim() !== '' && !doc.title.includes('—'));
    }
  });

  it('has a page for every document docs/README.md links as documentation', () => {
    const links = readmeLinks();
    assert.ok(links.length >= 40, `only ${links.length} links read from docs/README.md`);
    const missing = [...new Set(links.map((link) => link.path))].filter(
      (path) => manifest.docByPath(path) === undefined && manifest.notPublishedKind(path) === null,
    );
    assert.deepEqual(missing, [], `docs/README.md links these as documentation and the site neither publishes nor leaves them out: ${missing.join(', ')}`);
  });

  it('has every file under docs/ in the published list or in the list of what is left out', () => {
    const files = markdownUnder('docs');
    assert.ok(files.length > 50, `only ${files.length} documents found under docs/`);
    const neither = files.filter((path) => manifest.docByPath(path) === undefined && manifest.notPublishedKind(path) === null);
    assert.deepEqual(neither, [], `these files are in neither list: ${neither.join(', ')}`);
    for (const path of files) {
      assert.ok(!(manifest.docByPath(path) && manifest.notPublishedKind(path)), `${path} is both published and left out`);
    }
  });

  it('leaves out the plans, the audit and the compliance records, and says where they are', () => {
    for (const doc of manifest.DOCS) {
      assert.ok(!/^docs\/plan-\d/.test(doc.path), `${doc.path} is a plan and is published`);
      assert.ok(!doc.path.startsWith('docs/compliance/') && !doc.path.startsWith('docs/audit'), `${doc.path} is a record and is published`);
    }
    const plans = markdownUnder('docs').filter((path) => /^docs\/plan-\d/.test(path));
    assert.ok(plans.length >= 20, 'the plans this checks were not found');
    for (const path of plans) assert.equal(manifest.notPublishedKind(path), 'plan', path);
    assert.equal(manifest.docByPath('docs/plan-format.md')?.slug, 'plan-format', 'plan-format is the plan document users read, and is published');
    assert.ok((built.unpublished.plan ?? 0) >= 20, 'the build did not count the plans');
    for (const item of manifest.KEPT) {
      const [path, anchor] = item.path.split('#');
      assert.ok(existsSync(join(ROOT, path)), `${item.id} links ${path}, which is not there`);
      if (anchor) assert.ok(md.parseMarkdown(read(path), { file: path }).ids.includes(anchor), `${item.id}: no heading ${anchor} in ${path}`);
    }
  });

  it('puts each document in a group docs/README.md links it from, and each docs/ document in docs/README.md', () => {
    const links = readmeLinks();
    for (const doc of manifest.DOCS) {
      const sections = links.filter((link) => link.path === doc.path).map((link) => link.section);
      if (doc.path === 'README.md' || sections.length > 0) {
        const wanted = manifest.README_SECTIONS[doc.group];
        assert.ok(
          sections.some((section) => wanted.includes(section)),
          `${doc.path} is in "${doc.group}" but docs/README.md links it under ${JSON.stringify(sections)}`,
        );
      } else {
        assert.fail(`docs/README.md does not link ${doc.path}`);
      }
    }
  });

  it('orders neighbours within a group and nowhere else', () => {
    for (const group of manifest.DOC_GROUPS) {
      const docs = manifest.docsOf(group);
      assert.ok(docs.length > 0, `${group} is empty`);
      assert.equal(manifest.neighbours(docs[0].slug).previous, null);
      assert.equal(manifest.neighbours(docs.at(-1).slug).next, null);
      for (let i = 1; i < docs.length; i += 1) assert.equal(manifest.neighbours(docs[i].slug).previous.slug, docs[i - 1].slug);
    }
  });
});

describe('every published document renders', () => {
  it('without a construct the reader does not know', () => {
    assert.deepEqual(built.errors, []);
    assert.equal(built.documents.length, manifest.DOCS.length);
    for (const doc of built.documents) {
      const html = render(h(DocBody, { blocks: doc.blocks }));
      assert.ok(html.length > 500, `${doc.path} rendered almost nothing`);
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${doc.path} has not exactly one h1`);
      assert.ok(doc.headings.length >= 2, `${doc.path} has ${doc.headings.length} headings`);
      assert.ok(doc.description.length >= 20 && doc.description.length <= 201, `${doc.path}: description of ${doc.description.length} characters`);
    }
  });

  it('and stops, naming the line, at one it does not know', () => {
    const fails = (source, pattern) =>
      assert.throws(() => md.parseMarkdown(source, { file: 'x.md' }), (error) => error.name === 'UnknownConstruct' && pattern.test(error.message), source);
    fails('# T\n\ntext\n\n<script>alert(1)</script>\n', /^x\.md:5: .*<script>/);
    fails('# T\n\ntext with <iframe src="x"></iframe> in it\n', /^x\.md:3: .*iframe/);
    fails('# T\n\n<div class="x">\n\nbody\n\n</div>\n', /^x\.md:3: .*class/);
    fails('# T\n\n<div align="center" onclick="x()">\n\nbody\n\n</div>\n', /onclick/);
    fails('# T\n\n<details>\n\nnever closed\n', /never closed/);
    fails('# T\n\n[ref]: https://example.com\n', /reference definition/);
    fails('# T\n\n```js\nnever closed\n', /never closed/);
    fails('# T\n\nthree\nlines\nof text\n---\n', /followed by a line of -/);
    fails('# T\n\nan unknown &notanentity; here\n', /character reference/);
    fails('# T\n\n<a href="x">link</a> block\n', /<a> with an attribute this reader does not know: href/);
    assert.deepEqual(md.parseMarkdown('# T\n\none line\n---\n\ntext\n').blocks.map((b) => b.t), ['h', 'h', 'p'], 'a one-line setext heading is a heading');
  });

  it('draws a strikethrough, and leaves a lone pair of tildes as the characters they are', () => {
    const inline = (source) => md.parseMarkdown(`# T\n\n${source}\n`, { file: 'x.md' }).blocks[1].c;
    assert.deepEqual(inline('a ~~struck~~ b'), ['a ', { t: 'del', c: ['struck'] }, ' b']);
    assert.deepEqual(inline('~~**both**~~'), [{ t: 'del', c: [{ t: 'strong', c: ['both'] }] }]);
    assert.deepEqual(inline('about ~~ nothing ~~ here'), ['about ~~ nothing ~~ here'], 'a space inside the tildes is not a strikethrough');
    assert.deepEqual(inline('an unclosed ~~ pair'), ['an unclosed ~~ pair']);
    assert.match(render(h(DocBody, { blocks: md.parseMarkdown('# T\n\n~~<b>~~\n', { file: 'x.md', onUnknown: 'escape' }).blocks })), /<del>&lt;b&gt;<\/del>/);
  });

  it('does not rewrite the two documents that ran a paragraph into a rule, beyond the blank line', () => {
    // GitHub reads a paragraph followed directly by `---` as a heading of the
    // whole paragraph. The fix was one blank line; nothing else changed.
    for (const path of ['README.md', 'docs/commands.md']) {
      const { blocks } = md.parseMarkdown(read(path), { file: path });
      const long = [];
      md.walkBlocks(blocks, (b) => b.t === 'h' && md.inlineText(b.c).length > 150 && long.push(md.inlineText(b.c).slice(0, 40)));
      assert.deepEqual(long, [], `${path} has a heading that is a paragraph`);
    }
  });
});

describe('links and images', () => {
  const allLinks = () => {
    const found = [];
    for (const doc of built.documents) md.walkInlines(doc.blocks, (node) => node.t === 'a' && found.push({ doc, href: node.href }));
    return found;
  };

  it('leave no relative link unresolved', () => {
    const links = allLinks();
    assert.ok(links.length > 500, `only ${links.length} links in the published documents`);
    for (const { doc, href } of links) {
      assert.match(href, /^(?:https?:\/\/|mailto:|#|\/docs(?:\/|$)|\/(?:changelog|roadmap)$)/, `${doc.path} still has the link ${href}`);
      assert.equal(safe.safeHref(href), href, `${doc.path}: ${href} is not a link the renderer would draw`);
    }
    assert.ok(built.inSiteLinks > 150, `only ${built.inSiteLinks} links between published documents`);
  });

  it('turn a link between two published documents into a link between their pages, with its anchor', () => {
    const quick = built.documents.find((doc) => doc.slug === 'commands');
    const hrefs = [];
    md.walkInlines(quick.blocks, (node) => node.t === 'a' && hrefs.push(node.href));
    for (const wanted of ['/docs/quick-start', '/docs/setup', '/docs/usage-logs', '/docs/json-output', '/docs/overview#the-61-commands', '/docs']) {
      assert.ok(hrefs.includes(wanted), `the command reference has no link to ${wanted}`);
    }
    const tasks = JSON.stringify(built.tasks);
    assert.ok(tasks.includes('"/docs/commands#find-a-command"') && tasks.includes('"/docs/task-efficiency#dashboard"'), 'the task table did not resolve its anchors');
    assert.ok(tasks.includes('"/docs/contributing"'), 'the task table links CONTRIBUTING.md');
  });

  it('turn a link to anything else in the repository into an absolute GitHub link, to a file that is there', () => {
    assert.ok(built.repoLinks.length > 80, `only ${built.repoLinks.length} links to the repository`);
    for (const link of built.repoLinks) {
      const absolute = join(ROOT, link.path);
      assert.ok(existsSync(absolute), `${link.from} links ${link.path}, which is not in the repository`);
      if (link.fragment !== '' && link.path.endsWith('.md')) {
        const { ids } = md.parseMarkdown(readFileSync(absolute, 'utf8'), { file: link.path, onUnknown: 'escape' });
        assert.ok(ids.includes(link.fragment), `${link.from} links ${link.path}#${link.fragment}, which has no such heading`);
      }
    }
    const kinds = new Set();
    for (const { doc, href } of allLinks()) {
      if (href.startsWith('https://github.com/TrazumAPP/Trazum/')) kinds.add(href.split('/')[5]);
      assert.ok(!/\/blob\/main\/\//.test(href), `${doc.path}: ${href}`);
    }
    assert.ok(kinds.has('blob') && kinds.has('tree'), `a file and a directory should both appear: ${[...kinds]}`);
  });

  it('point every in-site anchor at a heading the target has', () => {
    const idsBySlug = new Map(built.documents.map((doc) => [doc.slug, new Set()]));
    for (const doc of built.documents) {
      md.walkBlocks(doc.blocks, (b) => (b.t === 'h' || b.t === 'anchor') && idsBySlug.get(doc.slug).add(b.id));
      md.walkInlines(doc.blocks, (n) => n.t === 'anchor' && idsBySlug.get(doc.slug).add(n.id));
    }
    let checked = 0;
    for (const { doc, href } of allLinks()) {
      let slug = doc.slug;
      let anchor = null;
      if (href.startsWith('#')) anchor = href.slice(1);
      else if (href.startsWith('/docs/')) [slug, anchor] = [href.slice(6).split('#')[0], href.split('#')[1] ?? null];
      else continue;
      assert.ok(idsBySlug.has(slug), `${doc.path}: ${href} names a page that is not published`);
      if (anchor !== null) {
        checked += 1;
        assert.ok(idsBySlug.get(slug).has(anchor), `${doc.path}: ${href} names a heading ${slug} does not have`);
      }
    }
    assert.ok(checked > 250, `only ${checked} anchors were checked`);
  });

  it('serve every image from this origin, and never load one from another host', () => {
    assert.ok(built.images.includes('docs/assets/bill.svg') && built.images.length >= 5, `images: ${built.images}`);
    assert.ok(built.remoteImages >= 8, 'the README badges were not seen');
    for (const doc of built.documents) {
      md.walkInlines(doc.blocks, (n) => {
        if (n.t === 'img') assert.match(n.src, /^\/docs-assets\/[\w./-]+$/, `${doc.path}: ${n.src}`);
      });
      md.walkBlocks(doc.blocks, (b) => b.t === 'picture' && assert.match(b.src + b.dark, /\/docs-assets\/.*\/docs-assets\//));
      const html = render(h(DocBody, { blocks: doc.blocks }));
      assert.ok(!/<img[^>]+src="https?:/i.test(html), `${doc.path} loads an image from another host`);
    }
    for (const image of built.images) assert.ok(statSync(join(ROOT, image)).isFile(), image);
    // The badges are text now, and still links.
    const overview = built.documents.find((doc) => doc.slug === 'overview');
    const text = render(h(DocBody, { blocks: overview.blocks }));
    assert.ok(text.includes('>CodeQL</a>') && text.includes('>npm downloads</a>'), 'the badges did not become links with their names');
  });

  it('are copied to the public folder and written as modules, from a build that can be repeated', () => {
    const generated = mkdtempSync(join(tmpdir(), 'docs-gen-'));
    const assets = mkdtempSync(join(tmpdir(), 'docs-img-'));
    try {
      builder.writeDocs(built, { generated, assets, root: ROOT });
      for (const doc of manifest.DOCS) assert.ok(existsSync(join(generated, 'docs', `${doc.slug}.ts`)), `${doc.slug} was not written`);
      for (const file of ['loaders.ts', 'search.ts', 'index.ts']) assert.ok(existsSync(join(generated, file)), file);
      for (const image of built.images) assert.ok(existsSync(join(assets, image)), image);
      assert.deepEqual(JSON.parse(JSON.stringify(builder.buildDocs().search)), JSON.parse(JSON.stringify(built.search)), 'two builds differ');
    } finally {
      rmSync(generated, { recursive: true, force: true });
      rmSync(assets, { recursive: true, force: true });
    }
  });

  it('writes text into a module as a literal nothing can end early, and means the same string', () => {
    const hostile = 'a</script><script>alert(1)</script> b\u2028c\u2029d "quoted" \\ back';
    const written = builder.literal(hostile);
    assert.ok(!/[<>\u2028\u2029]/.test(written), written);
    assert.equal(JSON.parse(written), hostile);

    const generated = mkdtempSync(join(tmpdir(), 'docs-gen-'));
    const assets = mkdtempSync(join(tmpdir(), 'docs-img-'));
    try {
      builder.writeDocs(built, { generated, assets, root: ROOT });
      let angled = 0;
      for (const doc of built.documents) {
        const module = readFileSync(join(generated, 'docs', `${doc.slug}.ts`), 'utf8');
        const body = module.slice(module.indexOf('export default'));
        assert.ok(!/[<>\u2028\u2029]/.test(body), `${doc.slug}.ts carries a raw angle bracket or line separator`);
        if (JSON.stringify(doc.blocks).includes('<')) angled += 1;
      }
      assert.ok(angled > 0, 'no document has an angle bracket in it, so this proved nothing');
      const loaders = readFileSync(join(generated, 'loaders.ts'), 'utf8');
      const entries = loaders.slice(loaders.indexOf('= {') + 3, loaders.lastIndexOf('};')).trim().split('\n');
      assert.equal(entries.length, built.documents.length);
      for (const entry of entries) assert.match(entry, /^\s*"[a-z0-9-]+": \(\) => import\("\.\/docs\/[a-z0-9-]+"\),$/, entry);
    } finally {
      rmSync(generated, { recursive: true, force: true });
      rmSync(assets, { recursive: true, force: true });
    }
  });

  it('refuses a slug that is not a plain name before it becomes a file or a key', () => {
    for (const doc of manifest.DOCS) assert.match(doc.slug, builder.SLUG);
    for (const slug of ['../outside', 'a/b', 'a"b', 'A', 'a--b', '-a', 'a\u2028b', '', '__proto__']) {
      const generated = mkdtempSync(join(tmpdir(), 'docs-gen-'));
      const assets = mkdtempSync(join(tmpdir(), 'docs-img-'));
      try {
        const forged = { ...built, documents: [{ ...built.documents[0], slug }] };
        assert.throws(() => builder.writeDocs(forged, { generated, assets, root: ROOT }), /cannot be a slug/, JSON.stringify(slug));
        assert.deepEqual(readdirSync(join(generated, 'docs')), [], `${JSON.stringify(slug)} was written before it was refused`);
      } finally {
        rmSync(generated, { recursive: true, force: true });
        rmSync(assets, { recursive: true, force: true });
      }
    }
  });
});

describe('the address of a heading is GitHub’s', () => {
  /** The address each heading gets on GitHub, worked out by hand from its rule: lower case, drop what is not a letter, number, hyphen, underscore or space, spaces to hyphens. */
  const CASES = [
    ['## Find a command', 'find-a-command'],
    ['### The multiplication stops guessing: `--from-log`', 'the-multiplication-stops-guessing---from-log'],
    ['## Project defaults: `trazum.config.json`', 'project-defaults-trazumconfigjson'],
    ['## The live budget: `spend.monthlyUsd`', 'the-live-budget-spendmonthlyusd'],
    ['## Using a subscription?', 'using-a-subscription'],
    ['# `trazum profile --json`', 'trazum-profile---json'],
    ['## The CI gate: a budget is a ceiling, a baseline is a gate', 'the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate'],
    ['## 1. Get a first result', '1-get-a-first-result'],
    ['## Why 402 and not 429', 'why-402-and-not-429'],
    ['## The [gateway](gateway.md) is **fast** and _small_', 'the-gateway-is-fast-and-small'],
    ['## Setup — and more', 'setup--and-more'],
    ['## Café résumé', 'café-résumé'],
    ['## snake_case_name', 'snake_case_name'],
    ['## Costs (and savings) & more', 'costs-and-savings--more'],
  ];

  it('for a set of real and awkward headings', () => {
    for (const [source, expected] of CASES) {
      const { blocks } = md.parseMarkdown(`${source}\n`);
      assert.equal(blocks[0].id, expected, source);
    }
  });

  it('numbers a repeat in the order the headings come, and skips an address that is taken', () => {
    const { blocks } = md.parseMarkdown('## Install\n\n## Install\n\n## Install\n\n## A\n\n## A-1\n\n## A\n');
    assert.deepEqual(blocks.filter((b) => b.t === 'h').map((b) => b.id), ['install', 'install-1', 'install-2', 'a', 'a-1', 'a-2']);
  });

  it('agrees with every anchor the documents already link to', () => {
    // The corpus is the check: more than two hundred links written for GitHub
    // land on a heading this rule gave an address, or the build above fails.
    assert.ok(built.inSiteLinks > 150 && built.errors.length === 0);
    const ids = built.documents.flatMap((doc) => doc.headings.map((heading) => heading.id));
    assert.ok(ids.includes('token-counting') && ids.includes('find-a-command') && ids.includes('limitations-stated-plainly'));
  });

  it('keeps an old anchor the README wrote by hand', () => {
    const overview = built.documents.find((doc) => doc.slug === 'overview');
    const html = render(h(DocBody, { blocks: overview.blocks }));
    for (const id of ['the-51-commands', 'the-52-commands', 'the-53-commands', 'the-55-commands']) assert.ok(html.includes(`id="${id}"`), id);
  });

  it('never collides with an address the site itself uses', () => {
    const reserved = new Set(['content', 'docs-title', 'docs-tasks', 'docs-also', 'docs-kept']);
    for (const doc of built.documents) for (const heading of doc.headings) assert.ok(!reserved.has(heading.id), `${doc.path}: ${heading.id}`);
  });
});

describe('what a document says never runs', () => {
  const HOSTILE = [
    '<script>alert(1)</script>',
    'text <script>alert(1)</script> text',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](java\tscript:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD4=)',
    '[click](vbscript:msgbox(1))',
    '[click](//evil.example/x)',
    '[click](\\\\evil.example\\x)',
    '[click](<javascript:alert(1)>)',
    '[click](https://ok.example\\\\@evil.example/)',
    '![x](javascript:alert(1))',
    '![x](https://evil.example/p.png)',
    '![x](//evil.example/p.png)',
    '![x" onerror="alert(1)](/docs-assets/a.png)',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)" onclick="alert(2)">x</a>',
    '<div onclick="alert(1)">x</div>',
    '<div align="center" onmouseover="alert(1)">\n\nx\n\n</div>',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)>',
    '<details open ontoggle=alert(1)><summary>x</summary>y</details>',
    '<style>body{display:none}</style>',
    '<object data="x"></object>',
    '<form action="https://evil.example"><input name=p></form>',
    '[x](https://ok.example "t\\" onmouseover=\\"alert(1)")',
    '# Heading <script>alert(1)</script>',
    '| a | b |\n|---|---|\n| <script>alert(1)</script> | [x](javascript:alert(1)) |',
    '```html\n<script>alert(1)</script>\n```',
    '```"><script>alert(1)</script>\n```',
    '- item <img src=x onerror=alert(1)>',
    '> quote <script>alert(1)</script>',
    '<picture><source media="(prefers-color-scheme: dark)" srcset="javascript:alert(1)"><img src="javascript:alert(2)" onerror="alert(3)"></picture>',
    '<a id="x" onclick="alert(1)"></a>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '<!-- --><script>alert(1)</script>',
  ];

  /** Every tag in some markup, with its attributes. */
  const tags = (html) =>
    [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g)].map(([, name, attrs]) => ({
      name: name.toLowerCase(),
      attrs: [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? '']),
    }));

  const ALLOWED = new Set(['p', 'a', 'span', 'code', 'pre', 'em', 'strong', 'del', 'sub', 'sup', 'kbd', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'img', 'blockquote', 'hr', 'details', 'summary', 'br']);

  function assertInert(html, what) {
    for (const { name, attrs } of tags(html)) {
      assert.ok(ALLOWED.has(name), `${what}: emitted <${name}>`);
      for (const [key, value] of attrs) {
        assert.ok(!/^on/i.test(key), `${what}: emitted the attribute ${key}`);
        if (key === 'data-lang') assert.match(value, /^[A-Za-z0-9+#_-]{1,20}$/, `${what}: a code language ${value}`);
        assert.ok(['href', 'src', 'alt', 'id', 'class', 'data-lang', 'data-external', 'data-align', 'tabindex', 'aria-hidden', 'aria-label', 'loading', 'decoding', 'width', 'scope', 'open', 'start', 'title'].includes(key), `${what}: emitted the attribute ${key}`);
        if (key === 'href') assert.match(value, /^(?:https?:\/\/[^\s\\]+|mailto:[^\s]+|#[^\s]*|\/docs[^\s]*)$/i, `${what}: href ${value}`);
        if (key === 'src') assert.match(value, /^\/[^/\\\s]/, `${what}: src ${value}`);
        if (key === 'id') assert.match(value, /^[\p{L}\p{N}_-]+$/u, `${what}: id ${value}`);
      }
    }
    assert.ok(!/javascript:/i.test(html.replace(/&amp;|&lt;|&gt;|&quot;/g, '')) || !/(?:href|src)="[^"]*javascript:/i.test(html), `${what}: a javascript: address`);
  }

  it('is text, whatever the Markdown says, when the reader is told to escape', () => {
    for (const source of HOSTILE) {
      const { blocks } = md.parseMarkdown(`# T\n\n${source}\n`, { file: 'hostile.md', onUnknown: 'escape' });
      assertInert(render(h(DocBody, { blocks })), JSON.stringify(source));
    }
  });

  it('and the same documents fail the build when they are real files', () => {
    let failed = 0;
    for (const source of HOSTILE) {
      try {
        const { blocks } = md.parseMarkdown(`# T\n\n${source}\n`, { file: 'hostile.md' });
        // Parsed: then it has to be something the build refuses to resolve, or inert in the renderer.
        assertInert(render(h(DocBody, { blocks })), JSON.stringify(source));
      } catch (error) {
        if (error.name === 'UnknownConstruct') failed += 1;
        else throw error;
      }
    }
    assert.ok(failed >= 15, `only ${failed} of ${HOSTILE.length} hostile documents were refused`);
  });

  it('is shown as the characters it is', () => {
    const { blocks } = md.parseMarkdown('# T\n\ntext <script>alert(1)</script> text\n', { onUnknown: 'escape' });
    const html = render(h(DocBody, { blocks }));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), html);
    assert.ok(!html.includes('<script'));
  });

  it('is refused by the renderer itself, whatever tree it is handed', () => {
    const hostile = [
      { t: 'p', c: [{ t: 'a', href: 'javascript:alert(1)', c: ['x'] }] },
      { t: 'p', c: [{ t: 'a', href: ' javascript:alert(1)', c: ['x'] }] },
      { t: 'p', c: [{ t: 'a', href: 'JAVASCRIPT:alert(1)', c: ['x'] }] },
      { t: 'p', c: [{ t: 'a', href: '//evil.example', c: ['x'] }] },
      { t: 'p', c: [{ t: 'a', href: 'https://ok.example\\@evil.example/', c: ['x'] }] },
      { t: 'p', c: [{ t: 'a', href: 'data:text/html,<script>', c: ['x'] }] },
      { t: 'p', c: [{ t: 'img', src: 'javascript:alert(1)', alt: 'a"><script>' }] },
      { t: 'p', c: [{ t: 'img', src: 'https://evil.example/x.png', alt: 'remote' }] },
      { t: 'p', c: [{ t: 'img', src: '//evil.example/x.png', alt: 'remote' }] },
      { t: 'h', depth: 2, id: 'x" onload="alert(1)', c: ['h'] },
      { t: 'code', lang: '" onfocus="alert(1)', v: '<script>alert(1)</script>' },
      { t: 'anchor', id: '"><script>' },
      { t: 'picture', dark: 'javascript:alert(1)', src: 'https://evil.example/x', alt: 'p' },
      { t: 'p', c: ['<script>alert(1)</script>', { t: 'code', v: '<img src=x onerror=alert(1)>' }] },
    ];
    const html = render(h(DocBody, { blocks: hostile }));
    assertInert(html, 'a hand-made tree');
    assert.ok(!html.includes('<script'), html);
    assert.ok(!/evil\.example/.test(html.replace(/&lt;[\s\S]*?&gt;/g, '')) || !/(?:href|src)="[^"]*evil/.test(html));
  });
});

describe('search', () => {
  it('has every title and heading in its index, once', () => {
    const entries = new Set(built.search.map((entry) => entry.join('\u0000')));
    assert.equal(entries.size, built.search.length, 'the index has a repeated entry');
    let headings = 0;
    for (const doc of built.documents) {
      assert.ok(entries.has([doc.slug, doc.title, '', 1].join('\u0000')), `${doc.slug}: its title is not in the index`);
      for (const heading of doc.headings) {
        headings += 1;
        assert.ok(entries.has([doc.slug, heading.text, heading.id, heading.depth].join('\u0000')), `${doc.slug}: "${heading.text}" is not in the index`);
      }
    }
    assert.equal(built.search.length, headings + built.documents.length, 'the index holds more than titles and headings');
    assert.ok(built.search.length > 400, `only ${built.search.length} entries`);
    assert.ok(JSON.stringify(built.search).length < 90_000, 'the index is no longer small');
  });

  it('finds a heading by the words of it, with the exact one first', () => {
    let tried = 0;
    for (const [slug, text, anchor, depth] of built.search) {
      if (depth === 1) continue;
      tried += 1;
      const hits = searchLib.searchEntries(built.search, Object.fromEntries(manifest.DOCS.map((d) => [d.slug, d.title])), text, 1000);
      assert.ok(hits.some((hit) => hit.entry[0] === slug && hit.entry[2] === anchor), `"${text}" does not find itself in ${slug}`);
      assert.equal(searchLib.fold(hits[0].entry[1]), searchLib.fold(text), `"${text}": the first result is "${hits[0].entry[1]}"`);
    }
    assert.ok(tried > 400);
  });

  const titles = new Proxy({}, { get: (_, slug) => manifest.DOCS.find((d) => d.slug === slug)?.title });

  it('ranks a word that starts a word above one found inside it, and a title above a heading', () => {
    // Worked by hand: "CI gates" is the title of the ci page (depth 1: 6 for the word starting a word, +2 for a title);
    // a heading that only contains the letters "ci" inside another word scores 1 to 3.
    const hits = searchLib.searchEntries(built.search, titles, 'ci', 5);
    assert.equal(hits[0].entry[0], 'ci');
    assert.equal(hits[0].entry[3], 1);
  });

  it('ignores case and accents, wants every word, and says nothing for an empty query', () => {
    assert.equal(searchLib.fold('  Café   RÉSUMÉ '), 'cafe resume');
    const a = searchLib.searchEntries(built.search, titles, 'BASELINE Gate', 50);
    const b = searchLib.searchEntries(built.search, titles, 'baseline gate', 50);
    assert.deepEqual(a, b);
    assert.ok(a.length > 0);
    assert.deepEqual(searchLib.searchEntries(built.search, titles, 'baseline zzzzqqqq', 50), []);
    assert.deepEqual(searchLib.searchEntries(built.search, titles, '   ', 50), []);
    assert.ok(searchLib.searchEntries(built.search, titles, 'a', 1000).length <= 1000);
    assert.ok(searchLib.searchEntries(built.search, titles, '.*+?^${}()|[]\\', 50).length === 0, 'a query is text, not a pattern');
  });

  it('sends nothing, stores nothing and puts nothing in the address', () => {
    const source = `${web('components/docs/DocsSearch.tsx')}\n${web('lib/docs/search.ts')}`;
    for (const forbidden of [/\bfetch\s*\(/, /sendBeacon/, /XMLHttpRequest/, /WebSocket/, /\btrack\s*\(/, /posthog/i, /analytics/i, /localStorage/, /sessionStorage/, /history\.(?:push|replace)State/, /location\.(?:search|hash)\s*=/, /document\.cookie/]) {
      assert.ok(!forbidden.test(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), `search uses ${forbidden}`);
    }
    // The only place it goes is the page the reader picked.
    assert.ok(source.includes('window.location.assign(docHref('));
  });

  it('is a labelled search field, with a status that is read out', () => {
    const t = copy.DOCS_COPY.en;
    const html = render(h(DocsSearch, { copy: t }));
    assert.match(html, /role="search"/);
    assert.match(html, /<label[^>]*>Search the documentation<\/label>/);
    assert.match(html, /type="search"/);
    assert.match(html, /role="status"/);
  });
});

describe('the pages', () => {
  const doc = () => built.documents.find((d) => d.slug === 'commands');
  const metaOf = (d, extra = {}) => {
    const { previous, next } = manifest.neighbours(d.slug);
    return {
      slug: d.slug,
      title: d.title,
      path: d.path,
      group: d.group,
      headings: d.headings,
      previous: previous && { slug: previous.slug, title: previous.title },
      next: next && { slug: next.slug, title: next.title },
      ...extra,
    };
  };
  const anchorsIn = (html) =>
    [...html.matchAll(/<a\b([^>]*)>/g)].map(([, attrs]) => Object.fromEntries([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ''])));

  it('carry the header and the footer, in each language, with the document in English', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const d = doc();
      const html = render(h(DocsShell, { initialLocale: locale, meta: metaOf(d), body: h(DocBody, { blocks: d.blocks }) }));
      const links = anchorsIn(html);
      assert.equal((html.match(/data-site-header=""/g) ?? []).length, 1, locale);
      assert.equal((html.match(/data-site-footer=""/g) ?? []).length, 1, locale);
      assert.ok(links.some((a) => a.href === site.GITHUB_URL && 'data-github-button' in a), `${locale}: no GitHub button`);
      assert.ok(html.includes('lang="en" class="doc-body"'), `${locale}: the document is not marked English`);
      const note = copy.DOCS_COPY[locale].englishNote;
      assert.equal(html.includes(note), locale !== 'en', `${locale}: the note that the documents are in English`);
      // The header's Docs entry is the current one.
      assert.match(html, /<a href="\/docs" aria-current="page"/, `${locale}: Docs is not marked current`);
    }
  });

  it('have a table of contents with every heading of the document, linked to its anchor', () => {
    const d = doc();
    // Without the document, so every `#address` link left is the contents list's.
    const shell = render(h(DocsShell, { initialLocale: 'en', meta: metaOf(d), body: null }));
    const body = render(h(DocBody, { blocks: d.blocks }));
    const hrefs = new Set(anchorsIn(shell).map((a) => a.href));
    let shown = 0;
    for (const heading of d.headings.filter((x) => x.depth <= 3)) {
      shown += 1;
      assert.ok(hrefs.has(`#${heading.id}`), `the contents list has no "${heading.text}"`);
      assert.ok(body.includes(`id="${heading.id}"`), `the document has no heading with the address ${heading.id}`);
    }
    assert.ok(shown > 60, `only ${shown} headings in the contents of the command reference`);
    const listed = [...hrefs].filter((href) => href.startsWith('#') && href !== '#content').length;
    assert.equal(listed, shown, 'the contents list holds something that is not a heading of the document');
    const html = shell;
    // Sticky where it is wide, a disclosure where it is narrow.
    assert.match(html, /<aside[^>]*xl:block[^>]*>[\s\S]*sticky/);
    assert.match(html, /xl:hidden[\s\S]*<details/);
  });

  it('link the previous and next document of the group, and View on GitHub to the same file', () => {
    for (const d of built.documents) {
      const html = render(h(DocsShell, { initialLocale: 'en', meta: metaOf(d), body: null }));
      const links = anchorsIn(html);
      const { previous, next } = manifest.neighbours(d.slug);
      if (previous) assert.ok(links.some((a) => a.href === `/docs/${previous.slug}` && a.rel === 'prev'), `${d.slug}: no previous`);
      if (next) assert.ok(links.some((a) => a.href === `/docs/${next.slug}` && a.rel === 'next'), `${d.slug}: no next`);
      const github = links.filter((a) => 'data-view-on-github' in a);
      assert.ok(github.length >= 1);
      for (const a of github) {
        assert.equal(a.href, `https://github.com/TrazumAPP/Trazum/blob/main/${d.path}`);
        assert.equal(a.target, '_blank');
        assert.equal(a.rel, 'noreferrer noopener');
      }
      for (const other of manifest.DOCS) assert.ok(links.some((a) => a.href === `/docs/${other.slug}`), `${d.slug}'s sidebar has no ${other.slug}`);
    }
  });

  it('the index lists every published document under its group, and says what is kept out', () => {
    const data = { descriptions: Object.fromEntries(built.documents.map((d) => [d.slug, d.description])), tasks: built.tasks, unpublished: built.unpublished };
    for (const locale of locales.MARKETING_LOCALES) {
      const html = render(h(DocsIndex, { initialLocale: locale, ...data }));
      const links = anchorsIn(html);
      const t = copy.DOCS_COPY[locale];
      assert.ok(html.includes(`>${t.indexTitle}</h1>`));
      for (const d of manifest.DOCS) assert.ok(links.some((a) => a.href === `/docs/${d.slug}`), `${locale}: the index has no ${d.slug}`);
      for (const group of manifest.DOC_GROUPS) assert.ok(html.includes(t.groups[group].title), `${locale}: no ${group}`);
      for (const item of manifest.KEPT) assert.ok(links.some((a) => a.href === `https://github.com/TrazumAPP/Trazum/blob/main/${item.path}`), `${locale}: ${item.id} is not linked on GitHub`);
      assert.ok(html.includes('role="search"'));
      assert.ok(html.includes('/docs/quick-start'), 'the task table is not drawn');
      assert.match(html, new RegExp(`>${built.unpublished.plan}<`), 'the count of plans is not shown');
    }
  });

  it('draw a code block and a table that scroll inside themselves, with a focus state', () => {
    const { blocks } = md.parseMarkdown('# T\n\n```bash\nnpx @trazum/cli bill --a-very-long-flag=some-very-long-value-that-goes-on-and-on-and-on-and-on-and-on\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
    const html = render(h(DocBody, { blocks }));
    assert.match(html, /<pre tabindex="0" data-lang="bash">/);
    assert.match(html, /<div class="doc-table" tabindex="0"><table>/);
    const css = web('app/globals.css');
    assert.match(css, /\.doc-body pre \{[^}]*overflow-x: auto/);
    assert.match(css, /\.doc-body pre \{[^}]*max-width: 100%/);
    assert.match(css, /\.doc-body \.doc-table \{[^}]*overflow-x: auto/);
    assert.match(css, /\.doc-body pre:focus-visible, \.doc-body \.doc-table:focus-visible \{ outline/);
    assert.match(css, /\.doc-body pre \{[^}]*font-family: var\(--font-mono\)/);
    assert.ok(!/gradient/.test(css.slice(css.indexOf('The documentation: one document'))), 'a gradient in the documentation styles');
  });

  it('draw a picture in both schemes and let the page’s appearance choose', () => {
    const setup = built.documents.find((d) => d.slug === 'setup');
    const html = render(h(DocBody, { blocks: setup.blocks }));
    assert.match(html, /class="doc-light" src="\/docs-assets\/docs\/assets\/web-light\.png"/);
    assert.match(html, /class="doc-dark" src="\/docs-assets\/docs\/assets\/web-dark\.png"/);
  });

  it('open a disclosure that holds the page’s headings, and leave a small one closed', () => {
    const overview = render(h(DocBody, { blocks: built.documents.find((d) => d.slug === 'overview').blocks }));
    assert.match(overview, /<details open=""><summary>Explore advanced workflows/);
    const setup = render(h(DocBody, { blocks: built.documents.find((d) => d.slug === 'setup').blocks }));
    assert.match(setup, /<details><summary>From source/);
  });
});

describe('each page has its own title, description, address and card', () => {
  it('for every document', () => {
    for (const d of built.documents) {
      const meta = metadata.docMetadata(d);
      assert.equal(meta.title.absolute, `${d.title} · Trazum docs`);
      assert.equal(meta.description, d.description);
      assert.equal(meta.alternates.canonical, `/docs/${d.slug}`);
      assert.equal(meta.openGraph.url, `/docs/${d.slug}`);
      assert.equal(meta.twitter.card, 'summary_large_image');
    }
    assert.equal(new Set(built.documents.map((d) => metadata.docMetadata(d).title.absolute)).size, built.documents.length, 'two pages, one title');
  });

  it('takes the description from the first paragraph of the document, trimmed', () => {
    const overview = built.documents.find((d) => d.slug === 'overview');
    assert.ok(overview.description.startsWith('One command reads the sessions Claude Code, Codex and Gemini CLI'), overview.description);
    assert.ok(overview.description.endsWith('…') && overview.description.length <= 201);
    const commands = built.documents.find((d) => d.slug === 'commands');
    assert.ok(commands.description.startsWith('Start with the quick start'), 'a breadcrumb line is not a description');
    assert.equal(builder.describe([{ t: 'p', c: ['Short.'] }], 'The title'), 'The title');
  });

  it('for the index, in each language', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const meta = metadata.docsIndexMetadata(locale);
      assert.equal(meta.title.absolute, `${copy.DOCS_COPY[locale].indexTitle} · Trazum`);
      assert.equal(meta.alternates.canonical, '/docs');
    }
  });

  it('are asked for by the pages, which also draw a card of their own', () => {
    for (const page of ['app/docs/page.tsx', 'app/docs/[slug]/page.tsx']) assert.match(web(page), /export async function generateMetadata\(/, page);
    assert.match(web('app/docs/[slug]/page.tsx'), /docMetadata\(/);
    assert.match(web('app/docs/page.tsx'), /docsIndexMetadata\(/);
    for (const card of ['app/docs/opengraph-image.tsx', 'app/docs/[slug]/opengraph-image.tsx']) assert.match(web(card), /socialCard\(/, card);
  });

  it('reads nothing at request time, and finds no page for a name that is not a document', async () => {
    const generated = join(ROOT, 'apps/web/lib/docs/generated');
    if (!existsSync(join(generated, 'loaders.ts'))) builder.writeDocs(built);
    const { loadDoc } = await import('../lib/docs/load.ts');
    for (const slug of ['constructor', '__proto__', 'toString', '../../etc/passwd', 'README', 'plan-2.4', 'audit-rea-2026-11', '']) {
      assert.equal(await loadDoc(slug), null, slug);
    }
    assert.equal((await loadDoc('quick-start')).path, 'docs/quick-start.md');
    for (const file of ['lib/docs/load.ts', 'app/docs/[slug]/page.tsx', 'app/docs/page.tsx', 'components/docs/DocBody.tsx']) {
      assert.ok(!/from 'node:fs'|require\('fs'\)|readFile/.test(web(file)), `${file} reads a file`);
    }
    assert.ok(!/dangerouslySetInnerHTML|innerHTML/.test(web('components/docs/DocBody.tsx')), 'the renderer has a way to emit markup');
  });
});

describe('the header, the footer and the landing lead to the docs on the site', () => {
  it('the Docs entry is /docs, here and nowhere else', () => {
    assert.equal(site.SITE_LINKS.docs.href, '/docs');
    assert.equal(site.SITE_LINKS.docs.external, false);
    assert.ok(site.HEADER_ENTRIES.includes('docs'));
    assert.ok(site.FOOTER_GROUPS.flatMap((group) => group.links).includes('docs'), 'the footer lost Docs');
    assert.ok(!('DOCS_URL' in site), 'the old address of the docs on GitHub came back');
    for (const file of ['components/App.tsx', 'components/site/SiteHeader.tsx', 'components/site/SiteFooter.tsx']) {
      assert.ok(!/docs\/README\.md/.test(web(file)), `${file} points at the docs on GitHub`);
    }
    assert.match(web('components/App.tsx'), /href: DOCS_PATH, label: t\.page\.linkDocs, Icon: BookOpen, external: false/);
  });

  it('the landing’s links to documents lead to their pages', () => {
    assert.equal(landing.MORE_LINKS.ci.href, '/docs/ci');
    assert.equal(landing.MORE_LINKS.mcp.href, '/docs/agents');
    for (const key of ['ci', 'mcp']) assert.equal(landing.MORE_LINKS[key].external, false);
    assert.ok(manifest.docBySlug('ci') && manifest.docBySlug('agents'));
  });

  it('the header marks Docs as the current entry on a docs page', async () => {
    const { SiteFrame } = await import('../components/site/SiteFrame.tsx');
    const html = render(h(SiteFrame, { initialLocale: 'en', current: 'docs' }, () => null));
    assert.match(html, /<a href="\/docs" aria-current="page"/);
    const plain = render(h(SiteFrame, { initialLocale: 'en' }, () => null));
    assert.ok(!plain.includes('aria-current'));
  });
});

describe('every new string, in every language', () => {
  function leaves(value, path, out) {
    if (typeof value === 'function') out.push([path, value(126)]);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) leaves(child, `${path}.${key}`, out);
    else out.push([path, value]);
    return out;
  }

  it('the same strings exist in all five, none of them empty', () => {
    const reference = leaves(copy.DOCS_COPY.en, '', []).map(([path]) => path);
    assert.ok(reference.length > 30, `only ${reference.length} strings`);
    for (const locale of locales.MARKETING_LOCALES) {
      const found = leaves(copy.DOCS_COPY[locale], '', []);
      assert.deepEqual(found.map(([path]) => path), reference, `${locale} has a different set of strings`);
      for (const [path, text] of found) {
        assert.equal(typeof text, 'string', `${locale}${path}`);
        assert.ok(text.trim().length > 0, `${locale}${path} is empty`);
        assert.ok(!text.includes('—'), `${locale}${path} has an em-dash`);
      }
    }
    for (const locale of ['es', 'fr', 'de', 'pt']) {
      assert.notEqual(copy.DOCS_COPY[locale].indexLede, copy.DOCS_COPY.en.indexLede, locale);
      assert.notEqual(copy.DOCS_COPY[locale].englishNote, copy.DOCS_COPY.en.englishNote, locale);
      assert.notEqual(copy.DOCS_COPY[locale].searchLabel, copy.DOCS_COPY.en.searchLabel, locale);
    }
  });

  it('cover every group, every kept record, and count results', () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const t = copy.DOCS_COPY[locale];
      for (const group of manifest.DOC_GROUPS) assert.ok(t.groups[group]?.title && t.groups[group]?.lede, `${locale}/${group}`);
      for (const item of manifest.KEPT) assert.ok(t.kept[item.id], `${locale}/${item.id}`);
      assert.ok(t.searchResults(1) !== t.searchResults(5));
    }
  });

  it('and the new prose carries no em-dash', () => {
    for (const file of [
      'lib/docs/manifest.ts', 'lib/docs/copy.ts', 'lib/docs/search.ts', 'lib/docs/safe.ts', 'lib/docs/types.ts', 'lib/docs/load.ts',
      'components/docs/DocBody.tsx', 'components/docs/DocsShell.tsx', 'components/docs/DocsIndex.tsx', 'components/docs/DocsSearch.tsx',
      'app/docs/page.tsx', 'app/docs/[slug]/page.tsx', 'app/docs/opengraph-image.tsx', 'app/docs/[slug]/opengraph-image.tsx',
    ]) assert.ok(!web(file).includes('—'), `${file} has an em-dash`);
    for (const file of ['scripts/build-docs-site.mjs', 'scripts/docs-markdown.mjs']) assert.ok(!read(file).includes('—'), `${file} has an em-dash`);
  });
});

describe('the build is wired in, and ignored', () => {
  it('runs before the build, the dev server, the tests and the type check, and is not committed', () => {
    const pkg = JSON.parse(web('package.json'));
    for (const hook of ['predev', 'prebuild', 'pretest', 'pretypecheck']) assert.match(pkg.scripts[hook], /build-docs-site\.mjs/, hook);
    const ignore = read('.gitignore');
    assert.ok(ignore.includes('/apps/web/lib/docs/generated/') && ignore.includes('/apps/web/public/docs-assets/'));
    const docker = read('Dockerfile');
    assert.ok(docker.includes('COPY docs docs') && docker.includes('build-docs-site.mjs') && docker.includes('/repo/apps/web/public'));
    assert.ok(read('.dockerignore').includes('!docs'));
  });

  it('adds no dependency', () => {
    const pkg = JSON.parse(web('package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) assert.ok(!/markdown|remark|rehype|mdx|marked|micromark|unified/i.test(name), name);
  });

  it('does not loosen the Content-Security-Policy', () => {
    const middleware = web('middleware.ts');
    for (const needle of ["`default-src 'self'`", "`img-src 'self' data: https://avatars.githubusercontent.com`", "`font-src 'self'`", "`object-src 'none'`"]) {
      assert.ok(middleware.includes(needle), needle);
    }
    for (const file of ['components/docs/DocBody.tsx', 'components/docs/DocsShell.tsx', 'components/docs/DocsIndex.tsx', 'components/docs/DocsSearch.tsx']) {
      assert.ok(!/\son[A-Z][a-zA-Z]*="/.test(web(file)), `${file} has an inline handler attribute`);
      const code = web(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Each address is parsed and its host compared whole: a pattern that only looks for the name would pass `github.com.example`.
      for (const [address] of code.matchAll(/\bhttps?:[^\s'"`)]*/g)) {
        const url = URL.canParse(address) ? new URL(address) : null;
        assert.ok(url !== null && url.host === 'github.com' && url.pathname.startsWith('/TrazumAPP/'), `${file} names another host: ${address}`);
      }
    }
  });
});
