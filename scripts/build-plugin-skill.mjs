#!/usr/bin/env node
/**
 * Derives the plugin's skill from the project's skill — one text, two homes.
 *
 * `.claude/skills/trazum/SKILL.md` teaches an agent working *in this
 * repository*, where the CLI is built from source. The plugin ships the same
 * doctrine to an agent working in *any* repository, where the CLI arrives
 * from npm. The only honest differences are the invocation and the build
 * step, so those are the only transforms — everything else is copied, and
 * `claude-plugin.test.js` fails the build if the two files drift apart in
 * any other way. Edit the project skill; run this to update the plugin's.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PROJECT_SKILL = '.claude/skills/trazum/SKILL.md';
export const PLUGIN_SKILL = 'plugin/skills/trazum/SKILL.md';

/** The in-repo build preamble, replaced because npx needs no build. */
export const BUILD_SECTION = `## Before anything else

Build once per session:

\`\`\`bash
npm install && npm run build
\`\`\`

Then \`node packages/cli/dist/index.js\` is the entry point. If Trazum is
installed globally the command is just \`trazum\`.`;

export const PLUGIN_SECTION = `## Before anything else

Nothing to build: every command below runs through \`npx -y @trazum/cli\`,
which fetches the published CLI on first use. If Trazum is installed
globally the command is just \`trazum\`.`;

/** The whole derivation. Exported so the guard runs the same code. */
export function derivePluginSkill(projectSkill) {
  if (!projectSkill.includes(BUILD_SECTION)) {
    throw new Error(
      'the project skill no longer contains the build section this derivation replaces — update scripts/build-plugin-skill.mjs',
    );
  }
  return projectSkill
    .replace(BUILD_SECTION, PLUGIN_SECTION)
    .replaceAll('node packages/cli/dist/index.js', 'npx -y @trazum/cli');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const derived = derivePluginSkill(readFileSync(join(root, PROJECT_SKILL), 'utf8'));
  writeFileSync(join(root, PLUGIN_SKILL), derived);
  console.log(`wrote ${PLUGIN_SKILL} from ${PROJECT_SKILL}`);
}
