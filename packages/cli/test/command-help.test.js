import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

import { getCliMessages } from '../dist/i18n/index.js';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum <command> --help` is that command's part of the help (#865).
 *
 * The README, `docs/commands.md` and `docs/quick-start.md` all say it explains
 * the command's flags. It printed the whole help, 1,332 lines, for every
 * command but `task`, so the promise was held by nothing. Run, not read: each
 * command the help lists, in each language the CLI speaks.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 }).stdout;
const isHeading = (line) => line.length > 0 && !/^\s/.test(line);

for (const locale of ['en', 'es']) {
  describe(`trazum <command> --help, in ${locale}`, () => {
    const full = run(['--help', '--locale', locale]);
    const lines = full.split('\n');
    // The commands the help itself lists, from its usage lines.
    const commands = [...new Set(lines.map((line) => /^ {2}trazum ([a-z][a-z-]*)\b/.exec(line)?.[1]).filter(Boolean))];
    const headings = lines.filter(isHeading);
    // The usage section: the one with the most lines that open with `trazum` (START HERE has a few too).
    const starts = lines.flatMap((line, i) => (isHeading(line) ? [i] : []));
    const usage = starts
      .map((start, k) => ({ start, end: starts[k + 1] ?? lines.length }))
      .map((section) => ({ ...section, count: lines.slice(section.start, section.end).filter((line) => line.startsWith('  trazum ')).length }))
      .reduce((best, section) => (section.count > best.count ? section : best));
    const more = getCliMessages(locale).commandHelpMore;

    it('found the commands to ask about', () => {
      assert.ok(commands.length >= 40, `only ${commands.length} commands found in the help`);
    });

    it("prints each command's usage and its own sections, and no other command's", () => {
      const wrong = [];
      for (const command of commands) {
        if (command === 'task' || command === 'filter') continue; // Each has a grammar and a help of its own.
        const own = run([command, '--help', '--locale', locale]);
        const ownLines = own.split('\n');
        if (ownLines.length * 5 > lines.length) wrong.push(`${command}: ${ownLines.length} lines, the whole help is ${lines.length}`);
        if (!ownLines.some((line) => line === `  trazum ${command}` || line.startsWith(`  trazum ${command} `))) wrong.push(`${command}: no usage line`);
        // A long usage line goes on over the lines indented under it, and all of it is the usage (bill's runs to three).
        for (let i = usage.start + 1; i < usage.end; i += 1) {
          if (!(lines[i] === `  trazum ${command}` || lines[i].startsWith(`  trazum ${command} `))) continue;
          for (let j = i + 1; j < usage.end && /^ {3,}\S/.test(lines[j]); j += 1) {
            if (!ownLines.includes(lines[j])) wrong.push(`${command}: the usage line's continuation "${lines[j].trim().slice(0, 40)}" missing`);
          }
          break;
        }
        for (const heading of headings.filter((h) => h.endsWith(` ${command}`))) {
          if (!ownLines.includes(heading)) wrong.push(`${command}: "${heading}" missing`);
        }
        for (const heading of ownLines.filter(isHeading)) {
          const another = commands.find((other) => other !== command && heading.endsWith(` ${other}`));
          if (another !== undefined) wrong.push(`${command}: carries "${heading}"`);
        }
        if (own.trimEnd().split('\n').at(-1) !== more) wrong.push(`${command}: does not end by saying where the rest is`);
      }
      assert.deepEqual(wrong, []);
    });

    it('and trazum --help is still the whole help', () => {
      assert.ok(lines.length > 1000, `trazum --help printed ${lines.length} lines`);
      assert.ok(!full.includes(more), 'the whole help ends with the line that points at itself');
    });
  });
}

it('a command the help does not list still gets the whole help, not nothing', () => {
  const lines = run(['no-such-command', '--help']).split('\n').length;
  assert.ok(lines > 1000, `printed ${lines} lines`);
});
