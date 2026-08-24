import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUILD_SECTION,
  PLUGIN_SKILL,
  PROJECT_SKILL,
  derivePluginSkill,
} from '../../../scripts/build-plugin-skill.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

/**
 * The Claude Code plugin is a door onto the published packages, and like
 * every other door it must not drift: the version is the manifests' version,
 * the skill is the project skill with only the invocation changed, and the
 * MCP config reaches the registry — never a path on somebody's disk, never a
 * credential.
 */
describe('the plugin is the published product, not a fork of it', () => {
  const plugin = JSON.parse(read('plugin/.claude-plugin/plugin.json'));
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  const mcp = JSON.parse(read('plugin/.mcp.json'));

  it('carries the manifests’ version, in lockstep', () => {
    // Five manifests already move together under publish.test.js; the plugin
    // joins them here. A plugin claiming 1.68.0 over a CLI at 1.70.0 would
    // describe commands that behave differently than its skill says.
    const rootManifest = JSON.parse(read('package.json'));
    assert.equal(plugin.version, rootManifest.version);
  });

  it('is listed by the marketplace at its real path', () => {
    const entry = marketplace.plugins.find((p) => p.name === 'trazum');
    assert.ok(entry, 'marketplace.json lists no trazum plugin');
    assert.equal(entry.source, './plugin');
    // One description, stated twice: the marketplace card and the plugin
    // manifest must not tell two stories.
    assert.equal(entry.description, plugin.description);
  });

  it('reaches the MCP server through the registry, cleanly', () => {
    const server = mcp.mcpServers.trazum;
    assert.equal(server.command, 'npx');
    assert.deepEqual(server.args, ['-y', '@trazum/mcp']);
    // No env block at all: there is no secret this server needs, and a
    // committed env value is how a credential ends up in a marketplace.
    assert.equal(server.env, undefined);
    assert.equal(Object.keys(mcp.mcpServers).length, 1);
  });

  it('ships the project skill with only the invocation changed', () => {
    // The derivation is code, and the guard runs the same code: the plugin
    // skill must equal derive(project skill) byte for byte. Editing the
    // plugin copy by hand fails here; the fix is editing the project skill
    // and running scripts/build-plugin-skill.mjs.
    assert.equal(read(PLUGIN_SKILL), derivePluginSkill(read(PROJECT_SKILL)));
  });

  it('the derivation replaces the build section and every repo path', () => {
    const derived = derivePluginSkill(read(PROJECT_SKILL));
    assert.ok(!derived.includes('packages/cli/dist/index.js'), 'a repo path survived the derivation');
    assert.ok(!derived.includes(BUILD_SECTION), 'the in-repo build section survived');
    assert.match(derived, /npx -y @trazum\/cli/);
    // And the derivation refuses a project skill it no longer understands,
    // rather than silently shipping the build section to strangers.
    assert.throws(() => derivePluginSkill('# some other document'), /no longer contains the build section/);
  });

  it('names no model, no key and no local path in its manifests', () => {
    const texts = [JSON.stringify(plugin), JSON.stringify(marketplace), JSON.stringify(mcp)];
    for (const text of texts) {
      assert.ok(!/ANTHROPIC_API_KEY|TRAZUM_LLM|sk-[a-zA-Z0-9]/.test(text), 'a credential-shaped value in a plugin manifest');
      assert.ok(!/\/home\/|\/Users\/|C:\\\\/.test(text), 'a local path in a plugin manifest');
    }
  });
});
