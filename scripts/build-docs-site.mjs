/**
 * Build the site's documentation from the repository's own documents.
 *
 * ## What it does, and when
 *
 * `/docs` publishes documents this repository already keeps, so nothing on it
 * is written twice (`scripts/build-wiki.mjs` makes the same trade for the
 * GitHub wiki, and for the same reason). This reads the list in
 * `apps/web/lib/docs/manifest.ts`, reads each file, turns it into the tree
 * `scripts/docs-markdown.mjs` describes, resolves every link, and writes what
 * the pages import:
 *
 * - `apps/web/lib/docs/generated/`: one module per document, the search
 *   index, and the descriptions and task table `/docs` shows.
 * - `apps/web/public/docs-assets/`: the images the documents use, copied
 *   from where they are in the repository, so a page loads them from its own
 *   origin and nothing is hot-linked.
 *
 * - `apps/web/public/llms.txt` and `llms-full.txt`: the documents as an index
 *   and as one file for a model to read (`scripts/llms-txt.mjs`). Ignored by git
 *   like the two above, and `llms-txt.test.js` holds what the builder makes
 *   to the documents.
 *
 * It runs before `next build`, `next dev`, the web app's tests and its type
 * check, because the pages cannot be built without it. These outputs
 * are ignored by git: they are made from the documents, and a committed copy would
 * be the second copy this script exists to prevent.
 *
 * It runs at build time and never in a request. Nothing a visitor sends
 * reaches it, and the pages are made of what it wrote.
 *
 * ## Links
 *
 * - A relative link between two published documents becomes a link between
 *   their pages, with its anchor, and the anchor must exist in the target.
 * - A relative link to anything else in the repository becomes an absolute
 *   link to GitHub (`blob/main` for a file, `tree/main` for a directory).
 * - An absolute link is kept.
 * - An image is copied and served from the site. An image on another host is
 *   not loaded, ever: the page shows its description, as a link when the
 *   image was one (the README's badges are the case).
 * - A link that is none of those, or an anchor that does not exist, is an
 *   error and the build stops.
 *
 * Whether a target outside the published documents exists is not checked
 * here, because the container image this runs in holds only part of the
 * repository. `docs.test.mjs` checks it, against the whole of it.
 *
 * Usage:
 *   node scripts/build-docs-site.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BLOB,
  DOCS,
  SITE_PAGES,
  TREE,
  docByPath,
  docHref,
  notPublishedKind,
} from '../apps/web/lib/docs/manifest.ts';
import { safeHref } from '../apps/web/lib/docs/safe.ts';
import { writeLlms } from './llms-txt.mjs';
import { UnknownConstruct, inlineText, parseMarkdown, walkBlocks, walkInlines } from './docs-markdown.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');
export const GENERATED = join(ROOT, 'apps/web/lib/docs/generated');
export const PUBLIC_ASSETS = join(ROOT, 'apps/web/public/docs-assets');

/** Where a document's images are served from. */
export const ASSET_PREFIX = '/docs-assets/';

/** The repository's own index of its documents, which `/docs` replaces. */
export const INDEX_PATH = 'docs/README.md';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** An image extension the site serves. Anything else a document names is an error. */
const IMAGE = /\.(?:svg|png|jpe?g|gif|webp|avif)$/i;

/**
 * Where a relative link from `from` goes.
 * @param {string} from @param {string} href
 * @returns {{ path: string, fragment: string } | { error: string }}
 */
export function targetOf(from, href) {
  const hash = href.indexOf('#');
  const rawPath = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? '' : href.slice(hash + 1);
  let decoded = rawPath;
  try {
    decoded = decodeURI(rawPath);
  } catch {
    return { error: `an address that is not valid: ${href}` };
  }
  if (decoded.startsWith('/')) return { error: `an absolute path, which names no file of the repository: ${href}` };
  const joined = posix.normalize(posix.join(posix.dirname(from), decoded === '' ? posix.basename(from) : decoded));
  if (joined.startsWith('..')) return { error: `a path that leaves the repository: ${href}` };
  return { path: joined.replace(/\/$/, ''), fragment };
}

/**
 * The first paragraph of a document, as plain text, trimmed to a sentence or
 * so: what a search result and a link preview say the page is.
 * @param {import('./docs-markdown.mjs').Block[]} blocks @param {string} title
 */
export function describe(blocks, title) {
  let found = '';
  walkBlocks(blocks, (block) => {
    if (found !== '' || block.t !== 'p') return;
    const text = inlineText(block.c).replace(/\s+/g, ' ').trim();
    // A breadcrumb line ("Documentation / Title") is a paragraph too, and is
    // not what the page says: a description is a sentence or more.
    if (text.length >= 60) found = text;
  });
  if (found === '') return title;
  if (found.length <= 200) return found;
  const cut = found.slice(0, 200);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 120 ? space : 200).replace(/[\s,;:.(-]+$/, '')}…`;
}

/**
 * Parse, resolve and describe every published document.
 *
 * Nothing is written: tests call this and look at what comes back, and
 * `main` writes it.
 *
 * @param {{ root?: string, docs?: readonly import('../apps/web/lib/docs/manifest.ts').DocEntry[] }} [options]
 */
export function buildDocs(options = {}) {
  const root = options.root ?? ROOT;
  const entries = options.docs ?? DOCS;
  /** @type {string[]} */
  const errors = [];
  /** @type {Map<string, { entry: typeof entries[number], blocks: any[], ids: Set<string> }>} */
  const parsed = new Map();

  for (const entry of entries) {
    const file = join(root, entry.path);
    if (!existsSync(file)) {
      errors.push(`${entry.path}: the manifest lists a file that is not there`);
      continue;
    }
    try {
      const { blocks, ids } = parseMarkdown(readFileSync(file, 'utf8'), { file: entry.path });
      parsed.set(entry.path, { entry, blocks, ids: new Set(ids) });
    } catch (error) {
      if (error instanceof UnknownConstruct) errors.push(error.message);
      else throw error;
    }
  }

  /** The images the documents use, and the repository path each came from. */
  const images = new Set();
  /** Links to the repository's own files: what `docs.test.mjs` checks exist. */
  /** @type {{ from: string, path: string, fragment: string, line?: number }[]} */
  const repoLinks = [];
  let remoteImages = 0;
  let inSiteLinks = 0;

  /** @type {Map<string, Set<string>>} */
  const idsOf = new Map([...parsed].map(([path, doc]) => [path, doc.ids]));

  /**
   * Resolve every link and image of one parsed document, in place.
   * @param {string} path @param {any[]} blocks @param {Set<string>} ids
   */
  function resolve(path, blocks, ids) {
    const fail = (message) => errors.push(`${path}: ${message}`);

    walkInlines(blocks, (node, parent) => {
      if (node.t === 'a') {
        const raw = node.href.trim();
        if (SCHEME.test(raw)) {
          const scheme = raw.slice(0, raw.indexOf(':')).toLowerCase();
          if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return fail(`a ${scheme}: link: ${raw}`);
          if (safeHref(raw) === null) return fail(`an address that is not safe: ${raw}`);
          node.href = raw;
          if (scheme !== 'mailto') node.ext = true;
          return;
        }
        if (raw.startsWith('#')) {
          const fragment = raw.slice(1);
          if (!ids.has(fragment)) return fail(`the link ${raw} points at a heading this document does not have`);
          node.href = raw;
          return;
        }
        const target = targetOf(path, raw);
        if ('error' in target) return fail(target.error);
        // The index the site replaces: its readers are sent to `/docs`.
        if (target.path === INDEX_PATH && target.fragment === '') {
          node.href = '/docs';
          inSiteLinks += 1;
          return;
        }
        // A file that is a page of the site of its own (the changelog, the
        // roadmap): the page, unless the link names a heading, which the page
        // does not carry one for each of.
        const own = SITE_PAGES.find((candidate) => candidate.path === target.path);
        if (own !== undefined && target.fragment === '') {
          node.href = own.href;
          inSiteLinks += 1;
          return;
        }
        const page = docByPath(target.path);
        if (page !== undefined) {
          const known = idsOf.get(target.path);
          if (target.fragment !== '' && !known?.has(target.fragment)) {
            return fail(`the link ${raw} points at ${target.path}#${target.fragment}, which has no such heading`);
          }
          node.href = docHref(page.slug, target.fragment);
          inSiteLinks += 1;
          return;
        }
        const looksLikeDirectory = /\/$/.test(raw.split('#')[0]) || (existsSync(join(root, target.path)) && statSync(join(root, target.path)).isDirectory());
        node.href = `${looksLikeDirectory ? TREE : BLOB}${target.path}${target.fragment === '' ? '' : `#${target.fragment}`}`;
        node.ext = true;
        repoLinks.push({ from: path, path: target.path, fragment: target.fragment });
        return;
      }
      if (node.t === 'img') {
        const raw = node.src.trim();
        if (/^https?:\/\//i.test(raw)) {
          // Never loaded: the page shows what the image says. An image inside
          // a link leaves the link, with the description as its text.
          remoteImages += 1;
          const at = parent.indexOf(node);
          if (at !== -1) parent[at] = node.alt === '' ? '' : node.alt;
          return;
        }
        const resolved = assetOf(path, raw);
        if ('error' in resolved) return fail(resolved.error);
        node.src = resolved.src;
      }
    });

    walkBlocks(blocks, (block) => {
      if (block.t !== 'picture') return;
      for (const key of ['src', 'dark']) {
        const resolved = assetOf(path, block[key]);
        if ('error' in resolved) fail(resolved.error);
        else block[key] = resolved.src;
      }
    });
  }

  /** @param {string} from @param {string} raw */
  function assetOf(from, raw) {
    if (SCHEME.test(raw) || raw.startsWith('//')) return { error: `an image from outside the repository: ${raw}` };
    const target = targetOf(from, raw);
    if ('error' in target) return target;
    if (!IMAGE.test(target.path)) return { error: `an image this site does not serve: ${raw}` };
    if (!existsSync(join(root, target.path))) return { error: `an image that is not in the repository: ${target.path}` };
    images.add(target.path);
    return { src: `${ASSET_PREFIX}${target.path}` };
  }

  /** The table of tasks that opens `docs/README.md`, with its links resolved. */
  let tasks = null;
  if (existsSync(join(root, INDEX_PATH))) {
    try {
      const { blocks, ids } = parseMarkdown(readFileSync(join(root, INDEX_PATH), 'utf8'), { file: INDEX_PATH });
      const table = blocks.find((block) => block.t === 'table');
      if (table !== undefined) {
        idsOf.set(INDEX_PATH, new Set(ids));
        resolve(INDEX_PATH, [table], new Set(ids));
        tasks = table;
      }
    } catch (error) {
      if (error instanceof UnknownConstruct) errors.push(error.message);
      else throw error;
    }
  }

  /** @type {any[]} */
  const documents = [];
  for (const { entry, blocks, ids } of parsed.values()) {
    resolve(entry.path, blocks, ids);
    /** @type {{ depth: number, id: string, text: string }[]} */
    const headings = [];
    let h1 = 0;
    walkBlocks(blocks, (block) => {
      if (block.t !== 'h') return;
      if (block.depth === 1) h1 += 1;
      else headings.push({ depth: block.depth, id: block.id, text: inlineText(block.c).replace(/\s+/g, ' ').trim() });
    });
    if (h1 !== 1) errors.push(`${entry.path}: ${h1} top-level headings; a page has exactly one`);
    documents.push({
      slug: entry.slug,
      path: entry.path,
      title: entry.title,
      group: entry.group,
      description: describe(blocks, entry.title),
      headings,
      blocks,
    });
  }

  /**
   * The search index: each document's title and every heading below its own,
   * as `[slug, text, anchor, depth]`. Titles and headings only, so it stays
   * small enough to send in one piece on first use.
   */
  const search = [];
  for (const doc of documents) {
    search.push([doc.slug, doc.title, '', 1]);
    for (const heading of doc.headings) search.push([doc.slug, heading.text, heading.id, heading.depth]);
  }

  return {
    /**
     * Resolve the links and images of a document that is not one of the
     * published ones (the changelog and the roadmap are pages of their own),
     * with the same rules, and with its problems and its repository links
     * added to this result's. Called by `scripts/build-site-pages.mjs`.
     * @param {string} path @param {any[]} blocks @param {string[]} ids
     */
    resolve(path, blocks, ids) {
      idsOf.set(path, new Set(ids));
      resolve(path, blocks, new Set(ids));
    },
    documents,
    tasks,
    search,
    images: [...images].sort(),
    repoLinks,
    remoteImages,
    inSiteLinks,
    errors,
    unpublished: countUnpublished(root),
  };
}

/**
 * How many documents of each family of unpublished ones the repository has,
 * counted rather than typed, for the sentence on `/docs` that says they exist.
 * @param {string} root
 */
export function countUnpublished(root) {
  /** @type {Record<string, number>} */
  const counts = {};
  const walk = (dir) => {
    if (!existsSync(join(root, dir))) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.md')) {
        const kind = notPublishedKind(rel);
        if (kind !== null) counts[kind] = (counts[kind] ?? 0) + 1;
      }
    }
  };
  walk('docs');
  return counts;
}

/**
 * What a slug may be. It becomes a file name, an address and a key in a
 * generated module, so it is held to one shape before it becomes any of them.
 */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ESCAPED = { '<': '\\u003C', '>': '\\u003E', '\u2028': '\\u2028', '\u2029': '\\u2029' };

/**
 * A string as a literal in a generated module.
 *
 * `JSON.stringify` is not an escaper for code. It leaves `<`, `>` and the two
 * Unicode line separators as they are, and those are what end a script or a
 * line when text built this way is later put inside a page. These modules
 * are compiled and never inlined, so nothing could be broken out of today.
 * The escapes mean the same string, cost nothing, and keep that true if the
 * text is ever used somewhere less forgiving.
 */
export function literal(text) {
  return JSON.stringify(text).replace(/[<>\u2028\u2029]/g, (character) => ESCAPED[character]);
}

/**
 * A value as the text of a TypeScript module that parses it at load.
 * `writer` names the script and what it wrote from, for the first line.
 */
export function moduleOf(value, type, typesPath, writer = "scripts/build-docs-site.mjs from the repository's documents") {
  return [
    `// Written by ${writer}. Not edited by hand; not committed.`,
    `import type { ${type.replace('[]', '')} } from '${typesPath}';`,
    '',
    `export default JSON.parse(${literal(JSON.stringify(value))}) as ${type};`,
    '',
  ].join('\n');
}

/** Write what `buildDocs` returned, replacing what a previous run wrote. */
export function writeDocs(result, { generated = GENERATED, assets = PUBLIC_ASSETS, root = ROOT } = {}) {
  rmSync(generated, { recursive: true, force: true });
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(join(generated, 'docs'), { recursive: true });

  const loaders = [];
  for (const doc of result.documents) {
    const { blocks, headings, ...meta } = doc;
    if (typeof doc.slug !== 'string' || !SLUG.test(doc.slug)) {
      throw new Error(`${doc.path}: ${JSON.stringify(doc.slug)} cannot be a slug. A slug is lower-case letters, digits and single hyphens.`);
    }
    writeFileSync(join(generated, 'docs', `${doc.slug}.ts`), moduleOf({ ...meta, headings, blocks }, 'DocData', '../../types'));
    loaders.push(`  ${literal(doc.slug)}: () => import(${literal(`./docs/${doc.slug}`)}),`);
  }
  writeFileSync(
    join(generated, 'loaders.ts'),
    [
      "// Written by scripts/build-docs-site.mjs. Not edited by hand; not committed.",
      "import type { DocData } from '../types';",
      '',
      'export const DOC_LOADERS: Readonly<Record<string, () => Promise<{ default: DocData }>>> = {',
      ...loaders,
      '};',
      '',
    ].join('\n'),
  );
  writeFileSync(join(generated, 'search.ts'), moduleOf(result.search, 'SearchEntry[]', '../types'));
  writeFileSync(
    join(generated, 'index.ts'),
    moduleOf(
      {
        descriptions: Object.fromEntries(result.documents.map((doc) => [doc.slug, doc.description])),
        tasks: result.tasks,
        unpublished: result.unpublished,
      },
      'DocsIndexData',
      '../types',
    ),
  );

  for (const image of result.images) {
    const to = join(assets, image);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(root, image), to);
  }
}

function main() {
  const result = buildDocs();
  if (result.errors.length > 0) {
    console.error(`docs: ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}, nothing written:`);
    for (const message of result.errors) console.error(`  ${message}`);
    process.exit(1);
  }
  writeDocs(result);
  writeLlms(result, { root: ROOT });
  console.log(
    `docs: ${result.documents.length} documents, llms.txt and llms-full.txt, ${result.search.length} search entries, ${result.images.length} images copied, ${result.remoteImages} remote images left unloaded`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
