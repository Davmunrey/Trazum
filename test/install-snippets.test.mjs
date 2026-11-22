import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { ROOT, SERVER_KEY, assetNames, assetUrl, block, clients, mcpPackage, replaceBlock, spec } from '../scripts/install-snippets.mjs';
import { recordedVersion } from '../scripts/npm-channel.mjs';

/**
 * The install snippets for the MCP server (#774), each held to the package name
 * and the version in `packages/mcp/package.json`.
 *
 * A snippet that says `npx -y @trazum/mcp` fetches whatever npm calls newest on
 * the day it is run, and one that says a version the package does not carry
 * installs something the page never described. Both are the same fault, and
 * both are checked here against the file the release bumps.
 */

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const { name, version: carried } = readJson('packages/mcp/package.json');
// What a reader is told to install: the release on latest. On a `next` tree the
// package carries the prerelease and the documents keep the release (npm-channel.mjs).
const version = recordedVersion(carried);
const pinned = `${name}@${version}`;
const rows = clients();
const row = (id) => rows.find((entry) => entry.id === id);

describe('the source of the snippets', () => {
  it('reads the package name and the version from packages/mcp/package.json', () => {
    assert.deepEqual(mcpPackage(), { name, version });
    assert.equal(name, '@trazum/mcp');
    assert.equal(spec({ name, version }), pinned);
  });

  it('follows the package it is given, so no version is typed into it', () => {
    const other = clients({ name: '@trazum/mcp', version: '9.8.7' });
    assert.ok(other.every((entry) => !entry.code.includes(version) || version === '9.8.7'), 'a snippet kept the old version');
    assert.ok(other.find((entry) => entry.id === 'claude-code').code.endsWith('@trazum/mcp@9.8.7'));
    assert.equal(other.find((entry) => entry.id === 'claude-desktop-bundle').code, 'https://github.com/TrazumAPP/Trazum/releases/download/v9.8.7/trazum-mcp-9.8.7.mcpb');
  });

  it('has a row for each client the issue names, once', () => {
    assert.deepEqual(
      rows.map((entry) => entry.id),
      ['claude-code', 'claude-desktop-bundle', 'claude-desktop-json', 'cursor', 'vscode', 'codex-command', 'codex-toml', 'gemini-cli'],
    );
  });
});

describe('every snippet names the package at the exact version, or says what holds it', () => {
  it('has no `@trazum/mcp` that is not followed by @<exact version>', () => {
    for (const entry of rows) {
      for (const [at] of entry.code.matchAll(/@trazum\/mcp(?!@)/g)) assert.fail(`${entry.id} names ${at} with no version`);
      for (const [, found] of entry.code.matchAll(/@trazum\/mcp@([^\s"']*)/g)) {
        assert.equal(found, version, `${entry.id} says ${found}; packages/mcp/package.json says ${version}`);
      }
    }
  });

  it('has no floating word in any of them', () => {
    for (const entry of rows) assert.doesNotMatch(entry.code, /\blatest\b|\bnext\b|@\^|@~|@\*|\bmain\b|\bmaster\b|\bHEAD\b/i, `${entry.id} floats`);
  });

  it('starts the server the same way in every file-based client: npx -y <package>@<version>', () => {
    for (const id of ['claude-desktop-json', 'cursor']) {
      assert.deepEqual(JSON.parse(row(id).code), { mcpServers: { [SERVER_KEY]: { command: 'npx', args: ['-y', pinned] } } }, id);
    }
    assert.deepEqual(JSON.parse(row('vscode').code), { servers: { [SERVER_KEY]: { type: 'stdio', command: 'npx', args: ['-y', pinned] } } });
  });

  it('puts the same pinned command in both Codex forms', () => {
    assert.equal(row('codex-command').code, `codex mcp add ${SERVER_KEY} -- npx -y ${pinned}`);
    assert.equal(row('claude-code').code, `claude mcp add ${SERVER_KEY} -- npx -y ${pinned}`);
    assert.equal(row('codex-toml').code, [`[mcp_servers.${SERVER_KEY}]`, 'command = "npx"', `args = ["-y", "${pinned}"]`].join('\n'));
  });

  it('points the one-click bundle at the release of the same version, by the name a release carries', () => {
    assert.equal(row('claude-desktop-bundle').code, assetUrl(version, assetNames(version).mcpb));
    assert.equal(assetNames(version).mcpb, `trazum-mcp-${version}.mcpb`);
    assert.match(row('claude-desktop-bundle').code, new RegExp(`/releases/download/v${version.replaceAll('.', '\\.')}/`));
  });

  it('leaves the version of the Gemini CLI line to the file it installs, and says so', () => {
    assert.equal(row('gemini-cli').pinnedBy, 'gemini-extension.json');
    assert.equal(row('gemini-cli').code, 'gemini extensions install https://github.com/TrazumAPP/Trazum');
  });
});

describe('gemini-extension.json (#774), against Gemini CLI\'s own extension reference', () => {
  const manifest = readJson('gemini-extension.json');

  it('uses only fields the reference lists', () => {
    // From docs/extensions/reference.md of google-gemini/gemini-cli, read 2026-11-19.
    const listed = ['name', 'version', 'description', 'migratedTo', 'mcpServers', 'contextFileName', 'excludeTools', 'plan', 'settings'];
    for (const key of Object.keys(manifest)) assert.ok(listed.includes(key), `"${key}" is not a field of the reference`);
    assert.match(manifest.name, /^[a-z0-9-]+$/, 'the reference wants lowercase, numbers and dashes');
  });

  it('starts the server at the version the package carries, exactly, and is at that version itself', () => {
    assert.deepEqual(manifest.mcpServers, { [SERVER_KEY]: { command: 'npx', args: ['-y', `${name}@${carried}`] } });
    assert.equal(manifest.version, carried);
    assert.equal(manifest.version, readJson('package.json').version);
  });

  it('names the skill as its context file, and the file is there', () => {
    assert.equal(manifest.contextFileName, '.claude/skills/trazum/SKILL.md');
    assert.match(read(manifest.contextFileName), /^---\nname: trazum\n/);
  });

  it('claims no interception: the server answers when asked', () => {
    assert.match(manifest.description, /intercepts nothing/);
    assert.doesNotMatch(JSON.stringify(manifest), /hook|intercept(?!s nothing)/i);
  });
});

describe('docs/agents.md holds the same table', () => {
  const text = read('docs/agents.md');

  it('is the table the script writes for this package, so a version bump without it fails here', () => {
    assert.equal(replaceBlock(text), text, 'run node scripts/install-snippets.mjs --write');
  });

  it('holds every snippet whole', () => {
    for (const entry of rows) assert.ok(text.includes(entry.code), `docs/agents.md does not hold the ${entry.label} snippet`);
  });

  it('names the package at the version nowhere else than as the table does', () => {
    for (const [, found] of text.matchAll(/@trazum\/mcp@(\S+?)["`\s]/g)) assert.equal(found, version, `docs/agents.md says @trazum/mcp@${found}`);
    for (const line of text.split('\n').filter((each) => /\bnpx -y\b/.test(each))) assert.match(line, /@trazum\/mcp@\d/, `an npx line with no version: ${line}`);
  });

  it('refuses a document with no markers instead of writing the table somewhere', () => {
    assert.throws(() => replaceBlock('# no table here\n'), /no install table between its markers/);
    assert.ok(block().startsWith('<!-- install-table:begin -->'));
  });
});

describe('the README points at the download page', () => {
  it('has the page address and the install lines that do not float', () => {
    const readme = read('README.md');
    assert.match(readme, /https:\/\/trazum\.vercel\.app\/download/);
  });
});
