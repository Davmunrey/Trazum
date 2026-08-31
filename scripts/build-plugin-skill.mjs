#!/usr/bin/env node
/**
 * Derives the plugin's skill from the project's skill — one text, two homes.
 *
 * `.claude/skills/trazum/SKILL.md` teaches an agent working *in this
 * repository*, where the CLI is built from source. The plugin ships the same
 * doctrine to an agent working in *any* repository, where the CLI arrives
 * from npm. The only honest difference is that one row of the door table, so
 * that row is the only transform — everything else is copied, and
 * `claude-plugin.test.js` fails the build if the two files drift apart in
 * any other way. Edit the project skill; run this to update the plugin's.
 *
 * **The transform shrank when the skill stopped repeating its own
 * invocation.** Every example used to be spelled `node
 * packages/cli/dist/index.js` and rewritten fifteen times on the way out;
 * they are spelled `trazum` now, and the table at the top says how to spell
 * that for whichever door the reader has. One line changes between the two
 * files instead of fifteen, and the reader is told once instead of never.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PROJECT_SKILL = '.claude/skills/trazum/SKILL.md';
export const PLUGIN_SKILL = 'plugin/skills/trazum/SKILL.md';

/** The in-repo row of the door table, replaced because npx needs no checkout. */
export const BUILD_SECTION = `| Run a shell, in a checkout of this repository | the CLI, built from source | \`node packages/cli/dist/index.js\` — after \`npm install && npm run build\` once per session |
| Run a shell, anywhere else | the CLI, straight from npm | \`npx -y @trazum/cli\` — no install, fetched on first use |`;

export const PLUGIN_SECTION = `| Run a shell | the CLI, straight from npm | \`npx -y @trazum/cli\` — no install, fetched on first use |`;

/** The whole derivation. Exported so the guard runs the same code. */
export function derivePluginSkill(projectSkill) {
  if (!projectSkill.includes(BUILD_SECTION)) {
    throw new Error(
      'the project skill no longer contains the build section this derivation replaces — update scripts/build-plugin-skill.mjs',
    );
  }
  /*
    Belt and braces: the row is the only place a repo path should appear, and
    the guard asserts none survives. If one is ever written elsewhere this
    still removes it rather than shipping a path a stranger cannot follow.
  */
  return projectSkill
    .replace(BUILD_SECTION, PLUGIN_SECTION)
    .replaceAll('node packages/cli/dist/index.js', 'npx -y @trazum/cli');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const derived = derivePluginSkill(readFileSync(join(root, PROJECT_SKILL), 'utf8'));
  writeFileSync(join(root, PLUGIN_SKILL), derived);
  console.log(`wrote ${PLUGIN_SKILL} from ${PROJECT_SKILL}`);
}
