#!/usr/bin/env node
/**
 * The files a GitHub release carries besides its notes and its bill of
 * materials, built from the commit that was just published.
 *
 *   node scripts/release-assets.mjs build [--out DIR]   the pricing dataset, the .vsix and the .mcpb
 *   node scripts/release-assets.mjs vsix  [--out DIR]   the editor extension only
 *   node scripts/release-assets.mjs mcpb  [--out DIR]   the MCP bundle only
 *   node scripts/release-assets.mjs pricing [--out DIR] the pricing dataset only
 *   node scripts/release-assets.mjs sums DIR            DIR/SHA256SUMS over the files in it
 *
 * The pricing dataset is not made here. It is the document the site already
 * serves for this version (`scripts/pricing-dataset.mjs`, #784), checked to
 * be byte for byte what the catalogue at this commit builds, and copied under
 * the release's name for it: one file at two addresses, under one digest.
 * A document that is not the catalogue stops the build.
 *
 * `build` needs the workspaces built first (`npm run build`). Nothing here
 * publishes: not to a marketplace, not to a registry. The files are attached
 * to the release by the `assets` job of `.github/workflows/release.yml`,
 * which runs after npm serves every package, and `RELEASES.md` says how a
 * person checks them.
 *
 * **What goes in a bundle is what the lockfile names.** The extension and the
 * MCP server run on `@trazum/core`, which has no dependencies, so a bundle
 * holds that package's built files and nothing else of anybody's. The set is
 * not typed here: `runtimeClosure` walks `package-lock.json` from the
 * workspace, the way `scripts/sbom.mjs` does, and a dependency the lockfile
 * does not hold stops the build. A third-party package that one day joins the
 * closure is copied from `node_modules` at the lockfile's version, and
 * `test/release-assets.test.mjs` holds the staged tree to the closure, so a
 * file that is not in it fails there.
 *
 * **The two packagers are the tools' own, at an exact version.** `vsce`
 * and `mcpb pack` are fetched by `npx` for the one run, as `npm run
 * package:vscode` always did, and never installed: this repository does not
 * keep a tool in its tree to learn whether its own manifest is valid. The
 * versions are below, and `test/release-assets.test.mjs` fails on a tag
 * (`latest`), a range or no version at all. A bump is a change to this file.
 *
 * No dependencies, like everything else here.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REPOSITORY_URL, assetNames } from './install-snippets.mjs';
import { checkPublished, loadCatalogue } from './pricing-dataset.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The packagers, `name@exact-version`. `@vscode/vsce` 4.1.1 was published on
 * 2026-11-12 and `@anthropic-ai/mcpb` 2.1.2 on 2025-12-04, both read from the
 * registry's own `time` field on 2026-11-19.
 */
export const TOOLS = Object.freeze({
  vsce: '@vscode/vsce@4.1.1',
  mcpb: '@anthropic-ai/mcpb@2.1.2',
});

/** The manifest version the bundle is written to, from the format's MANIFEST.md (current version 0.3). */
export const MCPB_MANIFEST_VERSION = '0.3';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------------------------ */
/* What the lockfile names                                              */
/* ------------------------------------------------------------------ */

/**
 * Where `name`, required from the lockfile entry at `from`, is found: the way
 * Node walks it, as `scripts/sbom.mjs` does. A workspace appears under
 * `node_modules` as a link to its own folder, which is followed.
 */
function resolveEntry(packages, from, name) {
  let base = from;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return packages[candidate].link ? { key: packages[candidate].resolved, link: true } : { key: candidate, link: false };
    if (!base) return null;
    const up = base.lastIndexOf('/node_modules/');
    base = up === -1 ? '' : base.slice(0, up);
  }
}

/**
 * The workspace at `directory` and everything it needs at run time, read from
 * the lockfile: `[{ key, name, version, workspace }]`, the workspace first,
 * then each dependency once, in a fixed order. A dependency the lockfile does
 * not hold throws, naming it.
 */
export function runtimeClosure(root, directory) {
  const packages = readJson(join(root, 'package-lock.json')).packages;
  if (!packages[directory]) throw new Error(`package-lock.json has no entry for ${directory}`);
  const seen = new Map();
  const visit = (key) => {
    if (seen.has(key)) return;
    const entry = packages[key];
    const workspace = !key.includes('node_modules/');
    const name = workspace ? readJson(join(root, key, 'package.json')).name : (entry.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length));
    seen.set(key, { key, name, version: entry.version, workspace });
    const wanted = { ...(entry.dependencies ?? {}), ...(entry.optionalDependencies ?? {}) };
    for (const dependency of Object.keys(wanted).sort()) {
      const found = resolveEntry(packages, key, dependency);
      if (found === null) {
        if (dependency in (entry.optionalDependencies ?? {})) continue;
        throw new Error(`${key} needs ${dependency} and package-lock.json does not hold it`);
      }
      visit(found.key);
    }
  };
  visit(directory);
  return [...seen.values()];
}

/** Every file under `directory`, relative, sorted, folders walked and links not followed. */
export function filesUnder(directory) {
  const found = [];
  const walk = (relative) => {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) found.push(next);
    }
  };
  walk('');
  return found;
}

/** What of a built workspace a bundle carries: its manifest, its licence and the `.js` of its `dist`. */
const BUILT = (file) => file === 'package.json' || file === 'LICENSE' || (file.startsWith('dist/') && file.endsWith('.js'));

function copyFiles(from, to, keep) {
  for (const file of filesUnder(from).filter(keep)) {
    mkdirSync(dirname(join(to, file)), { recursive: true });
    cpSync(join(from, file), join(to, file));
  }
}

/**
 * Put the closure's dependencies under `stage/node_modules`: a workspace as
 * its built files, anything else whole, from the copy installed at the
 * lockfile's version. A package that is not installed is an error, not a gap.
 */
function stageDependencies(root, closure, stage) {
  for (const entry of closure.slice(1)) {
    const target = join(stage, 'node_modules', entry.name);
    if (entry.workspace) {
      const source = join(root, entry.key);
      if (!existsSync(join(source, 'dist'))) throw new Error(`${entry.key} is not built: run npm run build first`);
      copyFiles(source, target, BUILT);
    } else {
      const source = join(root, entry.key);
      if (!existsSync(source)) throw new Error(`${entry.key} is in the lockfile and not installed: run npm ci`);
      cpSync(source, target, { recursive: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The MCP bundle                                                       */
/* ------------------------------------------------------------------ */

/**
 * `manifest.json`, from `packages/mcp/package.json` and the tools the built
 * server lists. Every field is one MANIFEST.md of github.com/modelcontextprotocol/mcpb
 * names; none is invented, and none claims a platform that was not tried:
 * `compatibility` states the Node version the package already declares and no
 * list of platforms.
 */
export function mcpbManifest({ root = ROOT, tools }) {
  const mcp = readJson(join(root, 'packages/mcp/package.json'));
  return {
    manifest_version: MCPB_MANIFEST_VERSION,
    name: 'trazum-mcp',
    display_name: 'Trazum',
    version: mcp.version,
    description: mcp.description,
    long_description:
      'Trazum prices a prompt and checks it against a budget before the call is made, and reads a usage log to show where the money went. ' +
      'It runs on this machine, answers when asked, takes text and returns figures. No tool reads a file, reaches the network or calls a model.',
    author: { name: mcp.author, url: 'https://github.com/Davmunrey' },
    repository: { type: 'git', url: `${REPOSITORY_URL}.git` },
    homepage: mcp.homepage,
    documentation: `${mcp.homepage}/docs`,
    support: mcp.bugs.url,
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/index.js',
      mcp_config: { command: 'node', args: ['${__dirname}/server/index.js'] },
    },
    tools: tools.map(({ name, description }) => ({ name, description })),
    keywords: mcp.keywords,
    license: mcp.license,
    compatibility: { runtimes: { node: mcp.engines.node } },
  };
}

/**
 * Lay the bundle out in `stage`: the manifest, the server's built files under
 * `server/`, a `package.json` that makes them ES modules, the dependencies
 * the lockfile names under `node_modules/`, the licence and the icon.
 * Returns the manifest it wrote.
 */
export async function stageMcpb(stage, { root = ROOT } = {}) {
  const closure = runtimeClosure(root, 'packages/mcp');
  const mcp = readJson(join(root, 'packages/mcp/package.json'));
  const dist = join(root, 'packages/mcp/dist');
  if (!existsSync(join(dist, 'index.js'))) throw new Error('packages/mcp is not built: run npm run build first');

  mkdirSync(join(stage, 'server'), { recursive: true });
  for (const file of readdirSync(dist).filter((name) => name.endsWith('.js'))) cpSync(join(dist, file), join(stage, 'server', file));
  stageDependencies(root, closure, stage);

  writeFileSync(
    join(stage, 'package.json'),
    `${JSON.stringify({ name: mcp.name, version: mcp.version, type: 'module', license: mcp.license, dependencies: mcp.dependencies }, null, 2)}\n`,
  );
  cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  cpSync(join(root, 'apps/vscode/icon.png'), join(stage, 'icon.png'));

  const { TOOLS: listed } = await import(pathToFileURL(join(dist, 'tools.js')).href);
  const manifest = mcpbManifest({ root, tools: listed });
  writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/* ------------------------------------------------------------------ */
/* The editor extension                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lay the extension out in `stage`: the package folder as it is in the
 * repository (built, with its `.vscodeignore`) and the dependencies the
 * lockfile names under `node_modules/`. `vsce package` is run with
 * `--no-dependencies` because it asks `npm` for the tree and npm answers for
 * a workspace with a link; this copies what the link points at.
 */
export function stageVsix(stage, { root = ROOT } = {}) {
  const closure = runtimeClosure(root, 'apps/vscode');
  const source = join(root, 'apps/vscode');
  if (!existsSync(join(source, 'dist/extension.js'))) throw new Error('apps/vscode is not built: run npm run build first');
  const keep = (file) =>
    file === 'package.json' || file === 'README.md' || file === 'LICENSE' || file === 'icon.png' || file === '.vscodeignore' || (file.startsWith('dist/') && file.endsWith('.js'));
  copyFiles(source, stage, keep);
  stageDependencies(root, closure, stage);
  return readJson(join(stage, 'package.json'));
}

/* ------------------------------------------------------------------ */
/* Checksums                                                            */
/* ------------------------------------------------------------------ */

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/**
 * `SHA256SUMS` as `sha256sum -c` reads it: the digest, two spaces, the name,
 * one line per file, sorted by name. Two spaces mean "text mode" to the
 * checker and are the form it writes.
 */
export function sumsText(files) {
  return `${files
    .map((path) => ({ name: basename(path), digest: sha256(path) }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, digest }) => `${digest}  ${name}`)
    .join('\n')}\n`;
}

/** `{ name: digest }` from the text `sumsText` wrote, throwing on a line that is neither. */
export function parseSums(text) {
  const out = {};
  for (const line of text.split('\n').filter((entry) => entry !== '')) {
    const match = /^([0-9a-f]{64}) {2}([^/\s][^/]*)$/.exec(line);
    if (match === null) throw new Error(`not a line of SHA256SUMS: ${JSON.stringify(line)}`);
    out[match[2]] = match[1];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The commands                                                         */
/* ------------------------------------------------------------------ */

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });

/** `npx --yes <tool@exact>`, with install scripts off: a packager needs none. */
const npx = (tool, args, options = {}) =>
  run('npx', ['--yes', tool, ...args], { ...options, env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_update_notifier: 'false' } });

export async function buildVsix(out, { root = ROOT } = {}) {
  const version = readJson(join(root, 'apps/vscode/package.json')).version;
  const target = join(out, assetNames(version).vsix);
  const stage = mkdtempSync(join(tmpdir(), 'trazum-vsix-'));
  try {
    stageVsix(stage, { root });
    mkdirSync(out, { recursive: true });
    npx(TOOLS.vsce, ['package', '--out', target], { cwd: stage });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return target;
}

export async function buildMcpb(out, { root = ROOT } = {}) {
  const manifest = readJson(join(root, 'packages/mcp/package.json'));
  const target = join(out, assetNames(manifest.version).mcpb);
  const stage = mkdtempSync(join(tmpdir(), 'trazum-mcpb-'));
  try {
    await stageMcpb(stage, { root });
    mkdirSync(out, { recursive: true });
    npx(TOOLS.mcpb, ['validate', join(stage, 'manifest.json')], { cwd: stage });
    npx(TOOLS.mcpb, ['pack', stage, target], { cwd: stage });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return target;
}

/**
 * The published pricing document of this version, copied into `out` as the
 * release names it, once it is checked to be what the catalogue builds.
 */
export async function buildPricing(out, { root = ROOT } = {}) {
  const catalogue = await loadCatalogue(root);
  const published = checkPublished(catalogue, { root });
  if (!published.ok) throw new Error(published.reason);
  mkdirSync(out, { recursive: true });
  const target = join(out, assetNames(catalogue.version).pricing);
  cpSync(join(root, published.path), target);
  return target;
}

export function writeSums(directory) {
  const files = readdirSync(directory)
    .filter((name) => name !== 'SHA256SUMS' && statSync(join(directory, name)).isFile())
    .map((name) => join(directory, name));
  if (files.length === 0) throw new Error(`nothing in ${directory} to sum`);
  const target = join(directory, 'SHA256SUMS');
  writeFileSync(target, sumsText(files));
  return target;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const at = rest.indexOf('--out');
  const out = at === -1 ? join(ROOT, 'release-assets') : rest[at + 1];
  if (command === 'pricing' || command === 'build') console.log(await buildPricing(out));
  if (command === 'vsix' || command === 'build') console.log(await buildVsix(out));
  if (command === 'mcpb' || command === 'build') console.log(await buildMcpb(out));
  if (command === 'sums') console.log(writeSums(rest[0]));
  if (!['vsix', 'mcpb', 'pricing', 'build', 'sums'].includes(command)) {
    console.error('usage: node scripts/release-assets.mjs build|vsix|mcpb|pricing [--out DIR] | sums DIR');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
