/**
 * Build the site's history and catalogue pages from the repository's own
 * files: `/changelog`, `/roadmap` and the part of `/models` that is not the
 * price catalogue.
 *
 * ## What it does, and when
 *
 * Three questions a visitor asks before trusting a tool that prints a bill are
 * answered by files this repository already keeps, so nothing on these pages
 * is written twice:
 *
 * - `CHANGELOG.md`, newest first, one anchor per release;
 * - `.github/milestones.json` for the milestones in order, and the
 *   `## Under consideration` section of `ROADMAP.md` for what is not
 *   scheduled;
 * - `packages/core/src/pricing.ts` for where each provider's prices were read.
 *
 * The prices themselves are not read here. `/models` draws them from
 * `@trazum/core`, the module the product prices with, when the site is built.
 *
 * Like `scripts/build-docs-site.mjs`, which it uses for the Markdown reader
 * and for resolving links, it writes modules the pages import, into a folder
 * git ignores (`apps/web/lib/history/generated/`), before the web app builds,
 * runs, type-checks or is tested. It runs at build time and never in a
 * request, and no part of it touches a network: issue titles are read from
 * the table `ROADMAP.md` already holds, and an issue that is not in it is a
 * number.
 *
 * ## The changelog is not one page
 *
 * `CHANGELOG.md` is a million bytes and nearly a hundred and fifty releases.
 * One page of all of it would send the browser a document nobody reads to the
 * end. So `/changelog` lists every release, newest first, each with its own
 * anchor, and draws in full the unreleased changes and the newest
 * `FEATURED` releases; every release has a page of its own at
 * `/changelog/<version>`, and the list links each one that is not drawn in
 * full. A heading in the file is read as `<version>` and then either a date
 * or a title (`## 2.5.1 — A bill for a period`); a title is shown as a title
 * and no date is ever made up for it. A heading that is neither fails the
 * build.
 *
 * ## And the brand page
 *
 * `/brand` is the same kind of page: nothing on it is typed. The colour
 * values are read from `apps/web/app/globals.css`, by the custom property each
 * row of `DESIGN.md`'s token table names; the typeface from where the
 * stylesheet declares it and the font package it imports; the voice and the
 * list of what not to do from `DESIGN.md`, by heading; and the downloadable
 * files from the list `scripts/brand-files.mjs` draws them from, with the size
 * of each file as it is on disk. A file the script writes and the disk lacks
 * stops the build and says which command writes it.
 *
 * Usage:
 *   node scripts/build-site-pages.mjs
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPOSITORY } from '../apps/web/lib/docs/manifest.ts';
import { UnknownConstruct, inlineText, parseMarkdown, walkBlocks, walkInlines } from './docs-markdown.mjs';
import { buildDocs, literal, moduleOf } from './build-docs-site.mjs';
import { BRAND_FILES, pngSize } from './brand-files.mjs';
import { fontPath } from './wordmark.mjs';
import { assetNames, assetUrl, clients as installClients, mcpPackage, releaseUrl } from './install-snippets.mjs';
import { recordedVersion } from './npm-channel.mjs';
import { DELIBERATELY_UNPRICED } from './price-drift.mjs';
import { FILE as MILESTONES_FILE, milestoneUrl, problemsWithFile } from './milestones.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');
export const GENERATED = join(ROOT, 'apps/web/lib/history/generated');

/** What a release's number may be. It becomes a file name, an address and a key. */
export const VERSION = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

const WRITER = "scripts/build-site-pages.mjs from CHANGELOG.md, ROADMAP.md, .github/milestones.json, DESIGN.md, globals.css, the catalogue's source, the install snippets and the setup guide";

/** How many releases, besides the unreleased changes, `/changelog` draws in full. */
export const FEATURED = 3;

/** The anchor of the unreleased changes. */
export const UNRELEASED = 'unreleased';

/** A date, and only a date: four digits, two, two, and a day that exists. */
function isDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

/** `2.7.12` as a part of a file name or an id: `2-7-12`. */
export const keyOf = (version) => version.replaceAll('.', '-');

/** Headings and anchors of a release's body, made unique on a page that draws several. */
function prefixIds(blocks, key) {
  walkBlocks(blocks, (block) => {
    if ((block.t === 'h' || block.t === 'anchor') && typeof block.id === 'string') block.id = `r${key}--${block.id}`;
  });
  walkInlines(blocks, (node) => {
    if (node.t === 'anchor' && typeof node.id === 'string') node.id = `r${key}--${node.id}`;
  });
}

/**
 * The lines of a Markdown document that are headings of one depth, outside
 * code fences, with the text between each and the next heading of that depth
 * or a shallower one. Read by heading and never by position.
 * @param {string} markdown @param {number} depth
 * @returns {{ heading: string, body: string }[]}
 */
export function sections(markdown, depth) {
  const lines = markdown.split('\n');
  /** @type {{ heading: string, body: string[] }[]} */
  const found = [];
  let fence = null;
  let current = null;
  for (const line of lines) {
    const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (opened !== null && opened[1][0] === fence[0] && opened[1].length >= fence.length && line.trim() === opened[1]) fence = null;
    } else if (opened !== null) fence = opened[1];
    else {
      const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
      if (heading !== null && heading[1].length <= depth) {
        current = heading[1].length === depth ? { heading: heading[2].trim(), body: [] } : null;
        if (current !== null) found.push(current);
        continue;
      }
    }
    if (current !== null) current.body.push(line);
  }
  return found.map((section) => ({ heading: section.heading, body: section.body.join('\n') }));
}

/** The text under one heading of one depth, or `null` when there is no such heading. */
export function sectionText(markdown, depth, heading) {
  return sections(markdown, depth).find((section) => section.heading === heading)?.body ?? null;
}

/* ------------------------------------------------------------------ */
/* The changelog                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every release of `CHANGELOG.md`, newest first as the file has them.
 * @param {{ root?: string, docs: ReturnType<typeof buildDocs> }} options
 */
export function buildChangelog({ root = ROOT, docs }) {
  /** @type {string[]} */
  const errors = [];
  const path = 'CHANGELOG.md';
  let parsed;
  try {
    parsed = parseMarkdown(readFileSync(join(root, path), 'utf8'), { file: path });
  } catch (error) {
    if (error instanceof UnknownConstruct) return { errors: [error.message], intro: [], releases: [] };
    throw error;
  }
  const { blocks, ids } = parsed;
  docs.resolve(path, blocks, ids);

  /** @type {any[]} */
  const intro = [];
  /** @type {any[]} */
  const releases = [];
  /** @type {any} */
  let current = null;
  const seen = new Set();
  for (const block of blocks) {
    if (block.t === 'h' && block.depth === 1) continue;
    if (block.t === 'h' && block.depth === 2) {
      const text = inlineText(block.c).replace(/\s+/g, ' ').trim();
      const found = /^(\d+\.\d+\.\d+)(?: — (.+))?$/.exec(text);
      if (text === 'Unreleased') {
        current = { version: null, unreleased: true, anchor: UNRELEASED, label: null, labelKind: 'none', slug: block.id, blocks: [] };
      } else if (found !== null && VERSION.test(found[1])) {
        const raw = found[2]?.trim();
        const label = raw === undefined ? null : raw.replace(/^["“”]+|["“”]+$/g, '').trim();
        current = {
          version: found[1],
          unreleased: false,
          anchor: found[1],
          label: label === '' ? null : label,
          labelKind: label === null || label === '' ? 'none' : isDate(label) ? 'date' : 'title',
          slug: block.id,
          blocks: [],
        };
      } else {
        errors.push(`${path}: the heading "## ${text}" is neither "Unreleased" nor a version, so it is not a release`);
        current = null;
        continue;
      }
      if (seen.has(current.anchor)) errors.push(`${path}: the release ${current.anchor} is there twice`);
      seen.add(current.anchor);
      releases.push(current);
      continue;
    }
    if (current === null) intro.push(block);
    else current.blocks.push(block);
  }

  for (const release of releases) {
    const key = release.unreleased ? UNRELEASED : keyOf(release.version);
    prefixIds(release.blocks, key);
    release.headings = [];
    walkBlocks(release.blocks, (block) => {
      if (block.t === 'h' && block.depth >= 3) {
        release.headings.push({ depth: block.depth, id: block.id, text: inlineText(block.c).replace(/\s+/g, ' ').trim() });
      }
    });
  }
  if (releases.length > 0 && !releases[0].unreleased) errors.push(`${path}: the first section is not "## Unreleased"`);
  return { errors, intro, releases };
}

/** The shapes the changelog pages read, and the modules that carry them. */
export function changelogModules(changelog) {
  const released = changelog.releases.filter((release) => !release.unreleased);
  const featured = [changelog.releases.find((release) => release.unreleased), ...released.slice(0, FEATURED)].filter(Boolean);
  const summary = (release) => ({
    anchor: release.anchor,
    version: release.version,
    unreleased: release.unreleased,
    label: release.label,
    labelKind: release.labelKind,
    slug: release.slug,
  });
  const index = {
    intro: changelog.intro,
    releases: changelog.releases.map(summary),
    featured: featured.map((release) => ({ ...summary(release), headings: release.headings, blocks: release.blocks })),
  };
  const pages = released.map((release, at) => ({
    ...summary(release),
    newer: released[at - 1] === undefined ? null : summary(released[at - 1]),
    older: released[at + 1] === undefined ? null : summary(released[at + 1]),
    headings: release.headings,
    blocks: release.blocks,
  }));
  /** GitHub's own address of each heading: where an old link to the file's heading goes. */
  const anchors = Object.fromEntries(changelog.releases.map((release) => [release.slug, release.anchor]));
  return { index, pages, anchors };
}

/* ------------------------------------------------------------------ */
/* The roadmap                                                        */
/* ------------------------------------------------------------------ */

/**
 * Issue titles that ROADMAP.md's own table of open work already carries.
 * Empty when the file has no such table, which is not an error: a number is
 * what an issue is called then.
 * @returns {Map<number, string>}
 */
export function issueTitles(markdown, file = 'ROADMAP.md') {
  const text = sectionText(markdown, 3, 'Open work, as issues');
  /** @type {Map<number, string>} */
  const titles = new Map();
  if (text === null) return titles;
  const { blocks } = parseMarkdown(text, { file });
  walkBlocks(blocks, (block) => {
    if (block.t !== 'table') return;
    for (const row of block.rows) {
      const number = /^#(\d+)$/.exec(inlineText(row[0] ?? []).trim());
      const title = inlineText(row[1] ?? []).replace(/\s+/g, ' ').trim();
      if (number !== null && title !== '') titles.set(Number(number[1]), title);
    }
  });
  return titles;
}

/**
 * The milestones in the order the file states them, and what is under
 * consideration.
 * @param {{ root?: string, docs: ReturnType<typeof buildDocs> }} options
 */
export function buildRoadmap({ root = ROOT, docs }) {
  /** @type {string[]} */
  const errors = [];
  let stated;
  try {
    stated = JSON.parse(readFileSync(join(root, MILESTONES_FILE), 'utf8'));
  } catch (error) {
    return { errors: [`${MILESTONES_FILE} could not be read: ${error.message}`], milestones: [], consideration: [], hasConsideration: false };
  }
  for (const problem of problemsWithFile(stated)) errors.push(problem);
  if (errors.length > 0) return { errors, milestones: [], consideration: [], hasConsideration: false };

  const markdown = readFileSync(join(root, 'ROADMAP.md'), 'utf8');
  let titles = new Map();
  try {
    titles = issueTitles(markdown);
  } catch (error) {
    if (error instanceof UnknownConstruct) errors.push(error.message);
    else throw error;
  }
  const milestones = stated.map((entry, at) => ({
    position: at + 1,
    title: entry.title,
    description: entry.description,
    url: milestoneUrl(entry.title),
    issues: entry.issues.map((number) => ({
      number,
      url: `${REPOSITORY}/issues/${number}`,
      title: titles.get(number) ?? null,
    })),
  }));

  let consideration = [];
  const text = sectionText(markdown, 2, 'Under consideration');
  if (text !== null) {
    try {
      const parsedSection = parseMarkdown(text, { file: 'ROADMAP.md' });
      // A link to another heading of the file is a link to GitHub's copy of
      // it, unless the heading is on this page: the page carries this section
      // and nothing else of the file.
      const here = new Set(parsedSection.ids);
      walkInlines(parsedSection.blocks, (node) => {
        if (node.t === 'a' && typeof node.href === 'string' && node.href.startsWith('#') && !here.has(node.href.slice(1))) {
          node.href = `ROADMAP.md${node.href}`;
        }
      });
      docs.resolve('ROADMAP.md', parsedSection.blocks, parsedSection.ids);
      consideration = parsedSection.blocks;
    } catch (error) {
      if (error instanceof UnknownConstruct) errors.push(error.message);
      else throw error;
    }
  }
  return { errors, milestones, consideration, hasConsideration: text !== null };
}

/* ------------------------------------------------------------------ */
/* Where each provider's prices were read                             */
/* ------------------------------------------------------------------ */

/**
 * The page each provider's review date was written against, as the catalogue
 * names it: the first address in the comment above that provider's date in
 * `PROVIDER_REVIEWED`. Read from the source because the catalogue states it
 * only there; none is typed here, and a provider whose comment names none is
 * an error and not a guess.
 * @param {string} pricingSource the text of packages/core/src/pricing.ts
 * @returns {Record<string, { url: string, label: string }>}
 */
export function providerSources(pricingSource) {
  const start = pricingSource.indexOf('export const PROVIDER_REVIEWED');
  const end = pricingSource.indexOf('});', start);
  if (start === -1 || end === -1) throw new Error('packages/core/src/pricing.ts has no PROVIDER_REVIEWED any more');
  /** @type {Record<string, { url: string, label: string }>} */
  const found = {};
  let comment = [];
  let inComment = false;
  for (const line of pricingSource.slice(start, end).split('\n').slice(1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/*')) inComment = true;
    if (inComment) comment.push(trimmed.replace(/^\/?\*+\/?\s?/, ''));
    if (trimmed.endsWith('*/')) {
      inComment = false;
      continue;
    }
    const entry = /^([a-z][a-z0-9_]*): '\d{4}-\d{2}-\d{2}',$/.exec(trimmed);
    if (entry !== null && !inComment) {
      const candidate = /[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\/[A-Za-z0-9_./-]*[A-Za-z0-9_-]/.exec(comment.join(' '));
      if (candidate !== null) {
        let url = null;
        try {
          url = new URL(`https://${candidate[0]}`);
        } catch {
          url = null;
        }
        // Only an address whose host is the one the comment wrote, as a host.
        if (url !== null && candidate[0].startsWith(`${url.hostname}/`)) found[entry[1]] = { url: url.href, label: `${url.hostname}${url.pathname}` };
      }
      comment = [];
    }
  }
  return found;
}

/** What the catalogue leaves unpriced on purpose, flattened, from the drift check's own list. */
export function deliberatelyUnpriced() {
  return Object.entries(DELIBERATELY_UNPRICED).flatMap(([provider, models]) =>
    Object.entries(models).map(([id, reason]) => ({ provider, id, reason })),
  );
}

/* ------------------------------------------------------------------ */
/* The brand                                                          */
/* ------------------------------------------------------------------ */

/**
 * The custom property each role of `DESIGN.md`'s token table is declared as in
 * `globals.css`. This is the one place a role is tied to a name; the values
 * are never written here. A role the table has and this lacks, or the reverse,
 * stops the build.
 */
export const TOKEN_VARIABLES = {
  Canvas: '--paper',
  Raised: '--paper-raised',
  Sunken: '--paper-sunken',
  Text: '--ink',
  Secondary: '--ink-soft',
  'Muted text': '--ink-faint',
  Rule: '--rule',
  'Strong rule': '--rule-strong',
  'Primary fill': '--acid',
  'Accent text': '--terracotta',
  'Accent wash': '--terracotta-wash',
};

/** The declarations of one block of `globals.css`: the text from its opening to its closing brace. */
function blockOf(css, opening) {
  const start = css.indexOf(opening);
  if (start === -1) return null;
  const end = css.indexOf('\n}', start);
  return end === -1 ? null : css.slice(start, end);
}

/** The six-digit colour a custom property is given in a block, or `null`. */
export function declared(block, variable) {
  const found = new RegExp(`${variable.replaceAll('-', '\\-')}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block ?? '');
  return found === null ? null : found[1].toLowerCase();
}

/** The sentences of a paragraph, each ending at its full stop. */
export function sentencesOf(text) {
  return text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence !== '');
}

/**
 * Everything `/brand` draws.
 * @param {{ root?: string }} options
 */
export function buildBrand({ root = ROOT } = {}) {
  /** @type {string[]} */
  const errors = [];
  const design = readFileSync(join(root, 'DESIGN.md'), 'utf8');
  const css = readFileSync(join(root, 'apps/web/app/globals.css'), 'utf8');

  // The colours: the roles DESIGN.md names, the values globals.css declares.
  const light = blockOf(css, ':root {');
  const dark = blockOf(css, ":root[data-theme='dark'] {");
  if (light === null || dark === null) errors.push('apps/web/app/globals.css no longer opens with a light block and an explicit dark one');
  const table = sectionText(design, 2, 'Tokens');
  const roles = [];
  if (table === null) errors.push('DESIGN.md has no "## Tokens" section');
  else {
    for (const line of table.split('\n')) {
      const cells = line.split('|').map((cell) => cell.trim());
      if (cells.length >= 4 && /^#[0-9a-f]{6}$/i.test(cells[2])) roles.push(cells[1]);
    }
  }
  const tokens = [];
  for (const role of roles) {
    const variable = Object.hasOwn(TOKEN_VARIABLES, role) ? TOKEN_VARIABLES[role] : null;
    if (variable === null) {
      errors.push(`DESIGN.md's token table has a role, "${role}", that scripts/build-site-pages.mjs does not know a custom property for`);
      continue;
    }
    const lightValue = declared(light, variable);
    // A token the dark theme does not redeclare is the light one, as the cascade has it.
    const darkValue = declared(dark, variable) ?? lightValue;
    if (lightValue === null || darkValue === null) errors.push(`globals.css declares no ${variable} in one of its themes, which is the token DESIGN.md calls "${role}"`);
    else tokens.push({ role, variable, light: lightValue, dark: darkValue });
  }
  for (const role of Object.keys(TOKEN_VARIABLES)) if (!roles.includes(role)) errors.push(`${role} is named here and is not a row of DESIGN.md's token table`);

  // The typeface: where the stylesheet declares it, and the package it imports.
  const family = /--font-display:\s*'([^']+)'/.exec(css);
  const mono = /--font-mono:\s*([^;]+);/.exec(css);
  let typeface = null;
  if (family === null || mono === null) errors.push('globals.css declares no --font-display or --font-mono');
  else {
    const folder = dirname(dirname(fontPath()));
    let metadata = {};
    let manifest = {};
    try {
      metadata = JSON.parse(readFileSync(join(folder, 'metadata.json'), 'utf8'));
      manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    } catch (error) {
      errors.push(`the font package could not be read: ${error.message}`);
    }
    const axis = metadata.variable?.wght;
    typeface = {
      family: family[1],
      name: family[1].replace(/ Variable$/, ''),
      mono: mono[1].trim(),
      weights: axis === undefined ? null : { min: Number(axis.min), max: Number(axis.max) },
      license: typeof manifest.license === 'string' ? manifest.license : null,
      packageName: typeof manifest.name === 'string' ? manifest.name : null,
    };
  }

  // The voice and what not to do: DESIGN.md's own words.
  const voiceText = sectionText(design, 3, 'Voice');
  const dontText = sectionText(design, 3, 'What not to do');
  let voice = [];
  let dont = [];
  try {
    if (voiceText === null) errors.push('DESIGN.md has no "### Voice" section');
    else {
      const { blocks } = parseMarkdown(voiceText, { file: 'DESIGN.md' });
      voice = sentencesOf(blocks.filter((block) => block.t === 'p').map((block) => inlineText(block.c).replace(/\s+/g, ' ').trim()).join(' '));
      if (voice.length !== 3) errors.push(`DESIGN.md's "### Voice" is ${voice.length} sentences, and the brand page says it in three`);
    }
    if (dontText === null) errors.push('DESIGN.md has no "### What not to do" section');
    else {
      const { blocks } = parseMarkdown(dontText, { file: 'DESIGN.md' });
      const list = blocks.find((block) => block.t === 'ul');
      dont = list === undefined ? [] : list.c.map((item) => inlineText(item.c.flatMap((block) => (block.t === 'p' ? block.c : []))).replace(/\s+/g, ' ').trim());
      if (dont.length === 0) errors.push('DESIGN.md\'s "### What not to do" has no list');
    }
  } catch (error) {
    if (error instanceof UnknownConstruct) errors.push(error.message);
    else throw error;
  }

  // The files, from the list the script that writes them uses, as they are on disk.
  const files = [];
  for (const file of BRAND_FILES) {
    let bytes = null;
    try {
      bytes = statSync(join(root, file.path)).size;
    } catch {
      errors.push(`${file.path} is not there: node scripts/draw-icon.mjs writes it`);
      continue;
    }
    const size = file.format === 'png' ? pngSize(file.mark) : null;
    files.push({ mark: file.mark, ground: file.ground, format: file.format, name: file.name, href: `/brand/${file.name}`, bytes, width: size?.width ?? null, height: size?.height ?? null });
  }
  return { errors, tokens, typeface, voice, dont, files };
}

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

/**
 * What `/download` is made of, read from the files that hold each fact: the
 * install snippets from `scripts/install-snippets.mjs` (the source
 * `docs/agents.md` is held to), the names of the release's files from the same
 * module, the version from `package.json`, and the Action's pinned line from
 * the setup guide, the first place a reader is told to copy it. Every pin the
 * setup guide documents must be the same one, or the build stops and says so.
 */
export function buildDownload({ root = ROOT } = {}) {
  const errors = [];
  const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  // The release on latest: on a next's tree, not the prerelease its manifests carry (npm-channel.mjs).
  const version = recordedVersion(readJson('package.json').version, root);
  const mcp = mcpPackage(root);
  if (mcp.version !== version) errors.push(`packages/mcp/package.json is at ${mcp.version} and package.json at ${version}`);
  const names = assetNames(version);
  const file = (name) => ({ name, url: assetUrl(version, name) });

  const PIN = /Davmunrey\/Trazum@([0-9a-f]{40}) {2}# (\d+\.\d+\.\d+)/g;
  const setup = readFileSync(join(root, 'docs/setup.md'), 'utf8');
  const pins = new Set([...setup.matchAll(PIN)].map((match) => `${match[1]} ${match[2]}`));
  if (pins.size !== 1) errors.push(`docs/setup.md pins the Action ${pins.size} different ways; the download page shows one`);
  const [sha, label] = [...pins][0]?.split(' ') ?? ['', ''];

  return {
    errors,
    data: {
      version,
      mcpPackage: mcp.name,
      cliPackage: readJson('packages/cli/package.json').name,
      clients: installClients(mcp),
      files: { vsix: file(names.vsix), mcpb: file(names.mcpb), sums: file(names.sums), sbom: file(names.sbom) },
      releaseUrl: releaseUrl(version),
      action: { sha, label },
    },
  };
}

/** Everything the three pages are made of. Nothing is written. */
export function buildSitePages({ root = ROOT } = {}) {
  const docs = buildDocs({ root });
  const changelog = buildChangelog({ root, docs });
  const roadmap = buildRoadmap({ root, docs });
  const brand = buildBrand({ root });
  const download = buildDownload({ root });
  let sources = {};
  const errors = [...docs.errors.filter((message) => message.startsWith('CHANGELOG.md') || message.startsWith('ROADMAP.md')), ...changelog.errors, ...roadmap.errors, ...brand.errors, ...download.errors];
  try {
    sources = providerSources(readFileSync(join(root, 'packages/core/src/pricing.ts'), 'utf8'));
  } catch (error) {
    errors.push(error.message);
  }
  // The pages carry no image of their own: a document that grew one would
  // need the copying the documentation build does.
  for (const image of docs.images) {
    if (/^CHANGELOG|^ROADMAP/.test(image)) errors.push(`${image}: the changelog and the roadmap pages do not copy images`);
  }
  return { docs, changelog, roadmap, brand, download: download.data, sources, unpriced: deliberatelyUnpriced(), errors };
}

/** Write what `buildSitePages` returned, replacing what a previous run wrote. */
export function writeSitePages(result, { generated = GENERATED } = {}) {
  rmSync(generated, { recursive: true, force: true });
  mkdirSync(join(generated, 'releases'), { recursive: true });
  const { index, pages, anchors } = changelogModules(result.changelog);

  const loaders = [];
  for (const page of pages) {
    if (!VERSION.test(page.version)) throw new Error(`${JSON.stringify(page.version)} cannot be a version page`);
    const key = keyOf(page.version);
    writeFileSync(join(generated, 'releases', `${key}.ts`), moduleOf(page, 'ReleaseData', '../../types', WRITER));
    loaders.push(`  ${literal(page.version)}: () => import(${literal(`./releases/${key}`)}),`);
  }
  writeFileSync(
    join(generated, 'loaders.ts'),
    [
      '// Written by scripts/build-site-pages.mjs. Not edited by hand; not committed.',
      "import type { ReleaseData } from '../types';",
      '',
      'export const RELEASE_LOADERS: Readonly<Record<string, () => Promise<{ default: ReleaseData }>>> = {',
      ...loaders,
      '};',
      '',
    ].join('\n'),
  );
  writeFileSync(join(generated, 'changelog.ts'), moduleOf(index, 'ChangelogIndex', '../types', WRITER));
  writeFileSync(
    join(generated, 'anchors.ts'),
    [
      '// Written by scripts/build-site-pages.mjs. Not edited by hand; not committed.',
      '',
      `export default JSON.parse(${literal(JSON.stringify(anchors))}) as Record<string, string>;`,
      '',
    ].join('\n'),
  );
  writeFileSync(join(generated, 'roadmap.ts'), moduleOf({ milestones: result.roadmap.milestones, consideration: result.roadmap.consideration, hasConsideration: result.roadmap.hasConsideration }, 'RoadmapData', '../types', WRITER));
  const { tokens, typeface, voice, dont, files } = result.brand;
  writeFileSync(join(generated, 'brand.ts'), moduleOf({ tokens, typeface, voice, dont, files }, 'BrandData', '../types', WRITER));
  writeFileSync(join(generated, 'models.ts'), moduleOf({ sources: result.sources, unpriced: result.unpriced }, 'ModelsExtra', '../types', WRITER));
  writeFileSync(join(generated, 'download.ts'), moduleOf(result.download, 'DownloadData', '../types', WRITER));
  return { indexBytes: Buffer.byteLength(moduleOf(index, 'ChangelogIndex', '../types', WRITER)), pages: pages.length };
}

function main() {
  const result = buildSitePages();
  if (result.errors.length > 0) {
    console.error(`site pages: ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}, nothing written:`);
    for (const message of result.errors) console.error(`  ${message}`);
    process.exit(1);
  }
  const written = writeSitePages(result);
  const { index } = changelogModules(result.changelog);
  console.log(
    `site pages: ${result.changelog.releases.length} changelog entries (${index.featured.length} drawn in full, ${written.indexBytes} bytes of module), ${result.roadmap.milestones.length} milestones, ${Object.keys(result.sources).length} provider sources, ${result.unpriced.length} unpriced models listed, ${result.brand.tokens.length} colour tokens, ${result.brand.files.length} brand files and ${result.download.clients.length} install snippets for ${result.download.version}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
