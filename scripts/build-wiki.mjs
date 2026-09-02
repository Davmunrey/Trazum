/**
 * Build the GitHub wiki from the repository's own documentation.
 *
 * ## Why a wiki at all, and why it is generated
 *
 * GitHub indexes a wiki separately from code, so a reader searching for
 * "cache TTL" or "which models are priced" reaches a page rather than a line
 * of a 1,200-line README. That is the whole argument for having one.
 *
 * The argument against having one is stronger and is the reason this script
 * exists: **a hand-written wiki is a second copy of the documentation**, and a
 * second copy is a copy that drifts. This repository has paid for that lesson
 * repeatedly -- a count in three files, a table nothing bound to the thing it
 * described -- and a wiki is the worst place for it, because a reader who
 * lands there from a search has no way of knowing they are reading last
 * month's answer.
 *
 * So no page here is written. Every one is a **section of a file this
 * repository already keeps**, copied verbatim, and `wiki.test.js` fails when
 * the checked-in pages are not what this script produces. Editing a page in
 * GitHub's wiki editor is therefore pointless: the next build overwrites it.
 * The page says so, at the top, in the one sentence a reader arriving from a
 * search needs.
 *
 * ## Why the links are rewritten
 *
 * A wiki is served from `/wiki/<Page>`, not from the repository tree, so every
 * relative link in a copied section is broken there -- `docs/commands.md`
 * resolves to a wiki page nobody wrote. They are rewritten to absolute
 * `blob/main` URLs, and `wiki.test.js` asserts no relative link survives.
 * That is a correctness requirement of the wiki and not a concession to a
 * test: the same rewrite would be needed if nothing checked it.
 *
 * ## What this script will not do
 *
 * **It never pushes.** A wiki lives in a second git repository
 * (`<repo>.wiki.git`) with its own credentials, and a build script that
 * carried a credential is a build script that can leak one. It prints the two
 * commands instead, and whoever owns the repository runs them.
 *
 * Usage:
 *   node scripts/build-wiki.mjs           # write wiki/
 *   node scripts/build-wiki.mjs --check   # fail if wiki/ is not what it would write
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'wiki');

/** Where a relative link has to point once the text is served from a wiki. */
const BLOB = 'https://github.com/Davmunrey/Trazum/blob/main/';
const RAW = 'https://raw.githubusercontent.com/Davmunrey/Trazum/main/';
const WIKI = 'https://github.com/Davmunrey/Trazum/wiki/';

const read = (path) => readFileSync(join(root, path), 'utf8');

/**
 * One section of a document, bounded by the next heading at the same level.
 *
 * Bounded by *level*, not by the next `##` of any depth: a section with
 * subheadings would otherwise stop at its own first subheading and the page
 * would silently carry a fifth of what it claims to.
 */
function sectionOf(text, heading) {
  /*
    A heading may be given as a pattern, and one is: the commands page is
    titled with how many commands there are, and a literal here would be a
    second copy of a count the product decides. It went stale the first time a
    command was added, which is exactly the defect this repository spends its
    guards on, one script along.
  */
  const found =
    heading instanceof RegExp
      ? new RegExp(`^${heading.source}$`, 'm').exec(text)?.[0]
      : heading;
  if (found === undefined) throw new Error(`no section matching ${heading} — has the document changed?`);
  const from = text.indexOf(`\n${found}\n`);
  if (from === -1) throw new Error(`no section "${found}" — has the document changed?`);
  const level = found.match(/^#+/)[0].length;
  const rest = text.slice(from + 1);
  const next = [...rest.matchAll(/^(#{1,6}) .+$/gm)].find(
    (match) => match.index > 0 && match[1].length <= level,
  );
  return (next === undefined ? rest : rest.slice(0, next.index)).trimEnd();
}

/**
 * Relative links made absolute, because a wiki is not served from the tree.
 *
 * Anchors are left alone when they point inside the same page and rewritten to
 * the README when they do not: `#getting-started` in a section copied onto its
 * own page is a link to a heading that is no longer above it.
 */
function absolute(text) {
  return text
    .replaceAll(/<img([^>]+)src="(?!https?:)([^"]+)"/g, (_, before, path) => `<img${before}src="${RAW}${path}"`)
    .replaceAll(/\]\((?!https?:|mailto:)([^)\s]+)\)/g, (_, target) =>
      target.startsWith('#') ? `](${BLOB}README.md${target})` : `](${BLOB}${target})`);
}

/** The one sentence a reader arriving from a search needs. */
const provenance = (source) =>
  `> Generated from [\`${source}\`](${BLOB}${source}) by \`scripts/build-wiki.mjs\`.\n`
  + '> Edit that file, not this page: an edit here is overwritten by the next build,\n'
  + '> and a wiki that has drifted from the repository is worse than no wiki.\n';

/**
 * The pages, and the sections they are.
 *
 * A table rather than a sequence of calls, so the sidebar and the Home page
 * are derived from the same list that writes the files: a page added here
 * appears in both without either being edited, which is the failure mode this
 * repository names most often.
 */
const PAGES = [
  {
    name: 'What-Trazum-Does',
    title: 'What it actually does',
    source: 'README.md',
    heading: '## What it actually does',
  },
  {
    name: 'Getting-Started',
    title: 'Getting started',
    source: 'README.md',
    heading: '## Getting started',
  },
  {
    name: 'Commands',
    title: 'The commands',
    source: 'README.md',
    heading: /## The \d+ commands/,
  },
  {
    name: 'Models-and-Prices',
    title: 'Models and prices',
    source: 'README.md',
    heading: '## Every model you pay for by the token',
  },
  {
    name: 'Where-The-Money-Went',
    title: 'Where the money actually went',
    source: 'README.md',
    heading: '## Where the money actually went: `trazum profile`',
  },
  {
    name: 'Limitations',
    title: 'Limitations, stated plainly',
    source: 'README.md',
    heading: '## Limitations, stated plainly',
  },
  {
    name: 'Privacy',
    title: 'Analytics and privacy',
    source: 'README.md',
    heading: '## Analytics and privacy',
  },
];

const pageFor = (page) =>
  `${provenance(page.source)}\n${absolute(sectionOf(read(page.source), page.heading))}\n`;

const home = () => {
  const opening = absolute(sectionOf(read('README.md'), '### Most of your LLM bill is not the prompt. Trazum finds where it is.'));
  const contents = PAGES.map((page) => `- [${page.title}](${WIKI}${page.name})`).join('\n');
  return `${provenance('README.md')}\n# Trazum\n\n${opening}\n\n## Pages\n\n${contents}\n\n`
    + `Everything else lives in the repository: the [README](${BLOB}README.md) and the\n`
    + `[documentation index](${BLOB}docs/README.md).\n`;
};

/**
 * The wiki's own navigation, which GitHub renders beside every page.
 *
 * It carries the provenance line like every other page, and for a sharper
 * reason: the sidebar is the one thing a maintainer is most tempted to edit in
 * the wiki editor, because it is short and it is nobody's section. An edit
 * there is overwritten by the next build like any other.
 */
const sidebar = () =>
  `${provenance('README.md')}\n### Trazum\n\n`
  + `${PAGES.map((page) => `- [${page.title}](${WIKI}${page.name})`).join('\n')}\n`;

const files = () => {
  const written = new Map();
  written.set('Home.md', home());
  written.set('_Sidebar.md', sidebar());
  for (const page of PAGES) written.set(`${page.name}.md`, pageFor(page));
  return written;
};

const wanted = files();

if (process.argv.includes('--check')) {
  const problems = [];
  const onDisk = new Set(
    (() => {
      try {
        return readdirSync(out).filter((name) => name.endsWith('.md'));
      } catch {
        return [];
      }
    })(),
  );
  for (const [name, body] of wanted) {
    onDisk.delete(name);
    let held = null;
    try {
      held = readFileSync(join(out, name), 'utf8');
    } catch {
      problems.push(`wiki/${name} is missing`);
      continue;
    }
    if (held !== body) problems.push(`wiki/${name} is not what this script writes`);
  }
  for (const stray of onDisk) problems.push(`wiki/${stray} is not a page this script writes`);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error('\nRun: node scripts/build-wiki.mjs');
    process.exit(1);
  }
  console.error(`wiki/ matches: ${wanted.size} pages`);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
for (const [name, body] of wanted) writeFileSync(join(out, name), body);
console.error(`Wrote ${wanted.size} pages to wiki/`);
console.error('');
console.error('To publish (the wiki is a second repository, and this script holds no credential):');
console.error('  git clone https://github.com/Davmunrey/Trazum.wiki.git /tmp/trazum-wiki');
console.error('  cp wiki/*.md /tmp/trazum-wiki/ && cd /tmp/trazum-wiki && git add -A && git commit -m "Rebuild from the repository" && git push');
console.error('');
console.error('A wiki that has never had a page cannot be cloned. Create one page in the');
console.error('web UI first, once, and every build after that is the two commands above.');
