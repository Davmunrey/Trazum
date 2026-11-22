#!/usr/bin/env node
/**
 * The one place the MCP server's install snippets are written, for every MCP
 * client, and the names of the files a release carries.
 *
 *   node scripts/install-snippets.mjs           print the table `docs/agents.md` holds
 *   node scripts/install-snippets.mjs --write   rewrite that table in `docs/agents.md`
 *   node scripts/install-snippets.mjs --check   exit 1 when `docs/agents.md` is behind
 *
 * Three readers, one source. `docs/agents.md` carries the table between two
 * markers, `scripts/prepare-release.mjs` rewrites it when the version moves,
 * and `scripts/build-site-pages.mjs` hands the same records to `/download`.
 * `packages/core/test/install-snippets.test.js` holds every snippet to the
 * package name and the version in `packages/mcp/package.json`, so a snippet
 * cannot say a version the package does not carry, and cannot float: an
 * `npx` line without `@<version>` is the shape that would fetch whatever npm
 * calls newest on the day it is run.
 *
 * Nothing here reads a network, and nothing here is a listing. These are
 * the lines a person pastes into a client they already have.
 *
 * No dependencies, like everything else here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { recordedVersion } from './npm-channel.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REPOSITORY_URL = 'https://github.com/TrazumAPP/Trazum';

/** The server's server name inside every client's own config. */
export const SERVER_KEY = 'trazum';

/**
 * The package a client starts, and the version the repository is at: the
 * release on latest, which on a `next` tree is not the prerelease its
 * manifests carry (npm-channel.mjs). A page never tells a reader to install a test build.
 */
export function mcpPackage(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'packages/mcp/package.json'), 'utf8'));
  return { name: manifest.name, version: recordedVersion(manifest.version, root) };
}

/**
 * The names of what a release carries, from the version alone. One scheme: the
 * version is in each name, and an address is built from the tag of the same
 * version, so a link never points at the newest release's file by accident.
 */
export function assetNames(version) {
  return {
    vsix: `trazum-vscode-${version}.vsix`,
    mcpb: `trazum-mcp-${version}.mcpb`,
    sums: 'SHA256SUMS',
    sbom: `trazum-v${version}.cdx.json`,
    pricing: `trazum-pricing-${version}.json`,
  };
}

/** Where a release's file is, on the release of the same version. */
export const assetUrl = (version, name) => `${REPOSITORY_URL}/releases/download/v${version}/${name}`;

/** The page of a release, which lists every file it carries. */
export const releaseUrl = (version) => `${REPOSITORY_URL}/releases/tag/v${version}`;

/** The line that starts the server, pinned: package, `@`, exact version. */
export const spec = ({ name, version }) => `${name}@${version}`;

/** Two-space JSON with the `args` array on one line, as a client's own docs write it. */
const json = (value) => JSON.stringify(value, null, 2).replace(/\[\n\s+("[^\n]*"),\n\s+("[^\n]*")\n\s+\]/g, '[$1, $2]');

/**
 * One record per client. `code` is what to paste, whole; `command` is true
 * when it is one line to run rather than a file's content; `where` says which
 * file or place it goes in, and `file` the path alone where it is a file, so a
 * page in another language can say "where it goes" in its own words; `pinnedBy` is set where the version is held by a
 * file in this repository instead of by the snippet itself.
 *
 * The order is the order the page and the table show them in.
 */
export function clients({ name, version } = mcpPackage()) {
  const pinned = spec({ name, version });
  const standard = { mcpServers: { [SERVER_KEY]: { command: 'npx', args: ['-y', pinned] } } };
  const names = assetNames(version);
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      where: 'a terminal',
      language: 'bash',
      command: true,
      code: `claude mcp add ${SERVER_KEY} -- npx -y ${pinned}`,
    },
    {
      id: 'claude-desktop-bundle',
      label: 'Claude Desktop, one-click bundle',
      where: 'download the file, then open it with Claude Desktop',
      language: 'text',
      command: false,
      code: assetUrl(version, names.mcpb),
    },
    {
      id: 'claude-desktop-json',
      label: 'Claude Desktop, JSON',
      where: 'claude_desktop_config.json',
      file: 'claude_desktop_config.json',
      language: 'json',
      command: false,
      code: json(standard),
    },
    {
      id: 'cursor',
      label: 'Cursor',
      where: '.cursor/mcp.json',
      file: '.cursor/mcp.json',
      language: 'json',
      command: false,
      code: json(standard),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      where: '.vscode/mcp.json',
      file: '.vscode/mcp.json',
      language: 'json',
      command: false,
      code: json({ servers: { [SERVER_KEY]: { type: 'stdio', command: 'npx', args: ['-y', pinned] } } }),
    },
    {
      id: 'codex-command',
      label: 'Codex, command',
      where: 'a terminal',
      language: 'bash',
      command: true,
      code: `codex mcp add ${SERVER_KEY} -- npx -y ${pinned}`,
    },
    {
      id: 'codex-toml',
      label: 'Codex, TOML',
      where: '~/.codex/config.toml',
      file: '~/.codex/config.toml',
      language: 'toml',
      command: false,
      code: [`[mcp_servers.${SERVER_KEY}]`, 'command = "npx"', `args = ["-y", "${pinned}"]`].join('\n'),
    },
    {
      id: 'gemini-cli',
      label: 'Gemini CLI',
      where: 'a terminal; the version is the one gemini-extension.json names',
      language: 'bash',
      command: true,
      pinnedBy: 'gemini-extension.json',
      code: `gemini extensions install ${REPOSITORY_URL}`,
    },
  ];
}

export const BEGIN = '<!-- install-table:begin -->';
export const END = '<!-- install-table:end -->';

/**
 * The block `docs/agents.md` holds: a table of what to do in each client, then
 * the whole snippet for every client whose answer is not one line.
 */
export function block(source = mcpPackage()) {
  const rows = clients(source);
  const table = [
    '| Client | Where | What to run or paste |',
    '|---|---|---|',
    ...rows.map((row) => `| ${row.label} | ${row.where} | ${row.command ? `\`${row.code}\`` : `the ${row.language === 'text' ? 'address' : 'snippet'} under "${row.label}" below`} |`),
  ];
  const sections = rows
    .filter((row) => !row.command)
    .flatMap((row) => [`### ${row.label}`, '', `Where: ${row.where}.`, '', `\`\`\`${row.language}`, row.code, '```', '']);
  return [BEGIN, '', ...table, '', ...sections, END].join('\n');
}

/** `text` with the block between the markers replaced by the one for `source`. */
export function replaceBlock(text, source = mcpPackage()) {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from === -1 || to === -1 || to < from) {
    throw new Error('docs/agents.md has no install table between its markers');
  }
  return `${text.slice(0, from)}${block(source)}${text.slice(to + END.length)}`;
}

function main() {
  const file = join(ROOT, 'docs/agents.md');
  const text = readFileSync(file, 'utf8');
  const wanted = replaceBlock(text);
  const mode = process.argv[2];
  if (mode === '--write') {
    writeFileSync(file, wanted, 'utf8');
    console.log('docs/agents.md: the install table is written');
  } else if (mode === '--check') {
    if (wanted !== text) {
      console.error('docs/agents.md: the install table is behind the package; run node scripts/install-snippets.mjs --write');
      process.exit(1);
    }
    console.log('docs/agents.md: the install table is current');
  } else {
    console.log(block());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
