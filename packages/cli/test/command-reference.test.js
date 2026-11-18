import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const REFERENCE = new URL('../../../docs/commands.md', import.meta.url).pathname;

/**
 * `docs/commands.md` opens "The command reference", and for six of the 55
 * commands it had no chapter: `init`, `where`, `schema`, `rules`, `filter` and
 * `models`. Four of them had one line in the README and little else. Nothing compared
 * the page with the list the CLI prints, so a command added to `--help` was
 * documented when somebody remembered.
 *
 * The list is the CLI's own: every `trazum <name>` its help prints under USAGE.
 */
const help = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });
const commands = [...new Set([...help.stdout.matchAll(/^\s+trazum ([a-z][a-z-]+)/gm)].map((match) => match[1]))];
const reference = readFileSync(REFERENCE, 'utf8');

describe('the command reference', () => {
  it('reads the CLI\'s own list of commands', () => {
    assert.equal(help.status, 0, help.stderr);
    assert.ok(commands.length >= 56, `only ${commands.length} commands read from --help`);
    for (const known of ['bill', 'plan', 'init', 'filter']) assert.ok(commands.includes(known), `${known} is not in --help`);
  });

  it('has a chapter that names every command the CLI lists', () => {
    const headings = [...reference.matchAll(/^#{2,3} (.+)$/gm)].map((match) => match[1]);
    /** The text of one chapter: from its heading to the next heading of any level. */
    const chapter = (heading) => {
      const start = reference.indexOf(`\n### ${heading}\n`) >= 0 ? reference.indexOf(`\n### ${heading}\n`) : reference.indexOf(`\n## ${heading}\n`);
      if (start < 0) return null;
      const next = reference.slice(start + 1).search(/\n#{2,3} /);
      return reference.slice(start, next < 0 ? undefined : start + 1 + next);
    };
    const named = (command) =>
      headings.some((heading) => new RegExp(`\`(?:trazum )?${command}\\b[^\`]*\``).test(heading));
    /**
     * Four commands are documented under a chapter named for the job, not for
     * the command. Each is listed with that chapter, which must still exist
     * and must show the command being run.
     */
    const under = {
      optimize: 'The multiplication stops guessing: `--from-log`',
      check: 'The CI gate: a budget is a ceiling, a baseline is a gate',
      baseline: 'The CI gate: a budget is a ceiling, a baseline is a gate',
      eval: 'Does the shorter prompt still work?',
    };
    const missing = [];
    for (const command of commands) {
      if (named(command)) continue;
      const home = under[command];
      if (home === undefined) missing.push(`${command}: no chapter names it`);
      else if (chapter(home) === null) missing.push(`${command}: its chapter is gone ("${home}")`);
      else if (!new RegExp(`trazum ${command}\\b`).test(chapter(home))) missing.push(`${command}: "${home}" no longer runs it`);
    }
    assert.deepEqual(missing, [], 'docs/commands.md does not document a command the CLI lists');
    // The list of exceptions does not outlive its reasons.
    for (const command of Object.keys(under)) {
      assert.ok(commands.includes(command), `${command} is excepted and is no longer a command`);
      assert.ok(!named(command), `${command} has a chapter of its own now: drop the exception`);
    }
  });

  it('links every chapter it lists, and lists none that is not there', () => {
    const slug = (heading) =>
      heading.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');
    const anchors = new Set([...reference.matchAll(/^#{2,3} (.+)$/gm)].map((match) => slug(match[1])));
    const broken = [...new Set([...reference.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1]))].filter(
      (anchor) => !anchors.has(anchor),
    );
    assert.deepEqual(broken, [], 'a link on the page points at a chapter that does not exist');
  });
});
