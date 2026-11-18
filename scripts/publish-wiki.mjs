#!/usr/bin/env node
/**
 * Puts the pages of `wiki/` into a checkout of the wiki's repository, and says
 * how the two differ. It commits nothing, pushes nothing and holds no
 * credential.
 *
 *   node scripts/publish-wiki.mjs --into DIR           copy the pages that differ, then report
 *   node scripts/publish-wiki.mjs --check --into DIR   report only; exit 1 if a page differs or is missing
 *
 * **Why it exists.** `scripts/build-wiki.mjs` builds `wiki/` and then prints
 * two commands for the owner to run, so the published wiki was only ever as
 * current as the last time somebody remembered. The `Wiki` workflow runs this
 * on every merge to `main` that changes the pages, and every week in
 * `--check` mode, so a page edited in GitHub's editor, or a merge that was
 * never published, is noticed.
 *
 * **Why the push is not here.** A wiki is a second git repository
 * (`<repo>.wiki.git`) and pushing to it needs a credential. The workflow holds
 * the job's own token for the length of two steps and does the clone, the
 * commit and the push with git. This script is the part that decides, and it
 * is kept to what can be tested without a network: it reads two directories
 * and writes into one of them. `wiki-publish.test.js` holds it to that, and
 * SECURITY.md says why it matters.
 *
 * **A page that is only on the wiki is left alone.** The pages here are the
 * ones the repository writes. A page somebody added in the wiki's editor, or
 * one the repository has since stopped writing, is reported and not deleted:
 * deleting it would be a decision about somebody's text, the same reason
 * `Labels` leaves a label that is only on GitHub. Remove it by hand once
 * nobody wants it.
 *
 * **It refuses to publish what the build script would not accept.** A page
 * edited by hand in `wiki/` would otherwise reach readers who have no way of
 * knowing it was never in the documents, which is the drift the wiki is
 * generated to avoid. So the first thing it does is run
 * `node scripts/build-wiki.mjs --check`.
 *
 * The decisions are functions of plain values; `main` is the only part that
 * reads a directory, runs a program or writes a file.
 *
 * Exit codes: 0 done (or in agreement), 1 `--check` found a difference,
 * 2 refused.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = 'Usage: node scripts/publish-wiki.mjs [--check] --into <a checkout of the wiki\'s repository>';

const asMap = (pages) => (pages instanceof Map ? pages : new Map(Object.entries(pages)));

/**
 * What to do about each page.
 *
 * `local` is the pages in `wiki/` and `published` the pages in a checkout of
 * the wiki's repository, each a map (or an object) of page name to content.
 * A page is written when the wiki lacks it or holds other text, unchanged
 * when the text is identical, and `onlyPublished` when only the wiki has it.
 * Nothing here ever asks for a deletion.
 */
export function plan(local, published) {
  const have = asMap(local);
  const there = asMap(published);
  const added = [];
  const changed = [];
  const unchanged = [];
  for (const [name, body] of have) {
    if (!there.has(name)) added.push(name);
    else if (there.get(name) !== body) changed.push(name);
    else unchanged.push(name);
  }
  const onlyPublished = [...there.keys()].filter((name) => !have.has(name));
  return {
    write: [...added, ...changed].sort(),
    added: added.sort(),
    changed: changed.sort(),
    unchanged: unchanged.sort(),
    onlyPublished: onlyPublished.sort(),
  };
}

/** The arguments, or the sentence that says what is wrong with them. */
export function parseArguments(argv) {
  let check = false;
  let into;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      check = true;
    } else if (argument === '--into') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: '--into needs the path of a checkout of the wiki\'s repository.' };
      }
      if (into !== undefined) return { error: '--into was given twice.' };
      into = value;
      index += 1;
    } else {
      return { error: `Unknown argument: ${argument}.` };
    }
  }
  if (into === undefined) {
    return { error: '--into is missing: say which checkout of the wiki\'s repository to read and write.' };
  }
  return { check, into };
}

const pages = (count) => `${count} ${count === 1 ? 'page' : 'pages'}`;

/** The lines the script prints. Plain text, one fact on each. */
export function report(result, { check }) {
  const lines = [];
  for (const name of result.added) lines.push(check ? `missing on the wiki: ${name}` : `wrote: ${name} (new)`);
  for (const name of result.changed) lines.push(check ? `differs from the wiki: ${name}` : `wrote: ${name}`);
  for (const name of result.unchanged) lines.push(`unchanged: ${name}`);
  for (const name of result.onlyPublished) lines.push(`only on the wiki, left alone: ${name}`);
  if (check) {
    lines.push(
      result.write.length === 0
        ? `The published wiki agrees with wiki/: ${pages(result.unchanged.length)}.`
        : `${pages(result.write.length)} of wiki/ differ from the published wiki. A merge to main that changes wiki/ publishes it again; to publish now, re-run the Wiki workflow's last run on main, or follow the commands build-wiki.mjs prints.`,
    );
  } else {
    lines.push(
      result.write.length === 0
        ? `Nothing to do: the wiki already has every page of wiki/ as it is (${pages(result.unchanged.length)}).`
        : `Wrote ${pages(result.write.length)}, left ${result.unchanged.length} unchanged and ${result.onlyPublished.length} alone. Nothing was committed or pushed.`,
    );
  }
  return lines;
}

/** The `.md` files directly inside a directory, by name. Anything else a wiki holds is not a page here. */
function pagesIn(directory) {
  const found = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) found.set(entry.name, readFileSync(join(directory, entry.name), 'utf8'));
  }
  return found;
}

/** Whether `wiki/` is what the build script writes, which is the only thing worth publishing. */
function wikiIsBuilt() {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-wiki.mjs'), '--check'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Whether `directory` is the top of a git working tree. */
function isCheckout(directory) {
  try {
    const top = execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return realpathSync(top) === realpathSync(directory);
  } catch {
    return false;
  }
}

function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed.error !== undefined) {
    console.error(`publish-wiki: ${parsed.error}\n${USAGE}`);
    return 2;
  }
  if (!wikiIsBuilt()) {
    console.error(
      'publish-wiki: wiki/ is not what `node scripts/build-wiki.mjs --check` accepts, so nothing was published or compared. '
        + 'A page edited by hand must not reach readers: change the document it comes from and run `node scripts/build-wiki.mjs`.',
    );
    return 2;
  }
  if (!isCheckout(parsed.into)) {
    console.error(`publish-wiki: ${parsed.into} is not a git checkout (the top of a working tree), so there is no wiki to compare with. Clone the wiki's repository and pass that directory.`);
    return 2;
  }

  const local = pagesIn(join(ROOT, 'wiki'));
  const result = plan(local, pagesIn(parsed.into));
  if (!parsed.check) for (const name of result.write) writeFileSync(join(parsed.into, name), local.get(name));
  for (const line of report(result, { check: parsed.check })) console.log(line);
  return parsed.check && result.write.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`publish-wiki: ${String(error.message).trim()}`);
    process.exitCode = 2;
  }
}
