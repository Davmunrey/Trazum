/**
 * Write `llms.txt` and `llms-full.txt` for the site, from the documents the
 * site already publishes.
 *
 * ## The format
 *
 * `llms.txt` follows https://llmstxt.org/, read on 2026-11-19: an H1 with the
 * name of the project (the only required part), a blockquote with a short
 * summary, then H2-delimited sections of markdown list items, each
 * `- [name](url): notes`. A section called `Optional` holds the links a reader
 * may skip when it needs a shorter context. `llms-full.txt` is not part of that
 * page's format: it is the same documents concatenated, so a reader that wants
 * all of them takes one file.
 *
 * ## Nothing is typed
 *
 * The summary, the sections, every link and every description come from
 * `apps/web/lib/docs/manifest.ts` and the documents it lists, in the
 * manifest's order. Only the fixed words of the template (the project's name,
 * the section names and the line that says where the full text is) are
 * written here. A document that is added to the manifest is in both files
 * after the next build, and one that is removed is gone from them.
 *
 * Both files are ignored by git, like the pages of `/docs`: they are rebuilt
 * with them, and a committed copy would change with every edit of a document.
 * `packages/core/test/llms-txt.test.js` holds what this produces to the
 * documents.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOC_GROUPS } from '../apps/web/lib/docs/manifest.ts';
import { inlineText, walkBlocks } from './docs-markdown.mjs';

/** Where the site is served, which is the one place the documents' pages are. */
export const SITE = 'https://trazum.vercel.app';

/** Where the two files are written: the folder the web app serves as-is. */
export const PUBLIC_DIR = 'apps/web/public';
export const LLMS = 'llms.txt';
export const LLMS_FULL = 'llms-full.txt';

/** The heading each group of the manifest has in `llms.txt`. */
export const SECTION_NAMES = {
  start: 'Start here',
  use: 'Using Trazum',
  decide: 'Deciding whether to use it',
  extend: 'Extending it',
  maintain: 'Optional',
};

/** The address of a document's page on the site. */
export const pageUrl = (slug) => `${SITE}/docs/${slug}`;

/** One line of plain text: what a list item says after its colon. */
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * The first paragraph of a document of 60 characters or more, whole. The
 * shorter ones are the breadcrumb and a tagline's fragments.
 * @param {any[]} blocks @param {string} fallback
 */
function firstParagraph(blocks, fallback) {
  let found = '';
  walkBlocks(blocks, (block) => {
    if (found !== '' || block.t !== 'p') return;
    const text = oneLine(inlineText(block.c));
    // A breadcrumb line ("Documentation / Title") is a paragraph too.
    if (text.length >= 60 && !text.startsWith('Documentation / ')) found = text;
  });
  return found === '' ? fallback : found;
}

/**
 * What a list item says about a document: its first paragraph, cut to a
 * sentence or so on a word, as the site's own description is.
 * @param {{ blocks: any[], title: string }} doc
 */
function describeLine(doc) {
  const text = firstParagraph(doc.blocks, doc.title);
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 120 ? space : 200).replace(/[\s,;:.(-]+$/, '')}\u2026`;
}

/**
 * Both files' text.
 * @param {{ documents: { path: string, slug: string, title: string, group: string, description: string, blocks: any[] }[] }} result
 *   what `buildDocs` returned.
 * @param {string} root the repository
 * @returns {{ llms: string, full: string, links: { slug: string, path: string, url: string }[] }}
 */
export function buildLlms(result, root) {
  const overview = result.documents.find((doc) => doc.path === 'README.md');
  if (overview === undefined) throw new Error('llms.txt: the manifest has no README.md to summarise the project from');
  const head = ['# Trazum', '', `> ${firstParagraph(overview.blocks, overview.description)}`, ''];

  /** @type {{ slug: string, path: string, url: string }[]} */
  const links = [];
  /** @type {string[]} */
  const sections = [];
  for (const group of DOC_GROUPS) {
    const docs = result.documents.filter((doc) => doc.group === group);
    const items = docs.map((doc) => {
      const url = pageUrl(doc.slug);
      links.push({ slug: doc.slug, path: doc.path, url });
      return `- [${doc.title}](${url}): ${describeLine(doc)}`;
    });
    // `Optional` is the last section by the format's own convention, and the
    // full text belongs in it: a reader short of context is the one who skips it.
    if (group === 'maintain') {
      items.push(`- [Every document, in one file](${SITE}/${LLMS_FULL}): the documents above in this order, concatenated`);
    }
    if (items.length > 0) sections.push([`## ${SECTION_NAMES[group]}`, '', ...items, ''].join('\n'));
  }

  const full = [
    ...head,
    'The documents below are the ones this site publishes under /docs, each unchanged, in the order of llms.txt. Links between them are paths in the repository.',
    '',
  ];
  for (const doc of result.documents) {
    full.push('---', '', `Source: ${pageUrl(doc.slug)} (${doc.path})`, '', readFileSync(join(root, doc.path), 'utf8').trim(), '');
  }

  return {
    llms: `${[...head, ...sections].join('\n').trimEnd()}\n`,
    full: `${full.join('\n').trimEnd()}\n`,
    links,
  };
}

/** Write both files into `publicDir`, and return what was written. */
export function writeLlms(result, { root, publicDir = join(root, PUBLIC_DIR) }) {
  const built = buildLlms(result, root);
  writeFileSync(join(publicDir, LLMS), built.llms);
  writeFileSync(join(publicDir, LLMS_FULL), built.full);
  return built;
}
