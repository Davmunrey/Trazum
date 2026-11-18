import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { redirectFor } from '../../../apps/web/lib/site.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Every link to the web app goes where it means to go, not through a
 * redirect.
 *
 * Since #734 the application lives at `/app` and the landing at `/`. A link
 * written as `https://trazum.vercel.app/?tab=playground` still works, because
 * the middleware redirects it, but it costs every reader a round trip, it
 * depends on a redirect nobody may remove, and it is the old address taught
 * to whoever copies it next. So every link in the repository's tracked text
 * uses the new one, and this fails on one that would only redirect.
 *
 * "Would only redirect" is decided by the redirect rule itself,
 * `redirectFor` in `apps/web/lib/site.ts`, imported rather than restated: a
 * second copy of the rule here would be the drift this file exists to stop.
 *
 * Three files are left out, by name, because they are records: they say what
 * an address was when something happened at it, and rewriting them would be
 * rewriting history.
 */
const RECORDS = new Map([
  ['CHANGELOG.md', 'each entry describes the release it is in'],
  ['RELEASES.md', 'each section describes the release it is in'],
  ['docs/audit-rea-2026-11.md', 'the audit names the address it drove on the day it ran'],
  // Not a record: this file, whose fixtures are the stale forms it looks for.
  ['packages/core/test/site-links.test.js', 'its own fixtures are the links it refuses'],
]);

const LINK = /https?:\/\/trazum\.vercel\.app(?:\/[^\s<>)\]"'`*|]*)?/g;

/** Every link to the web app in some text, with the line it is on. */
export function staleLinks(text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    for (const [link] of line.matchAll(LINK)) {
      const url = new URL(link.replace(/[.,;:]+$/, ''));
      if (redirectFor(url) !== null) found.push({ line: index + 1, link });
    }
  });
  return found;
}

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '' && /\.(md|mdx|ts|tsx|js|mjs|cjs|json|ya?ml|txt|html)$/.test(path));

describe('links to the web app use its addresses, not the ones that redirect', () => {
  it('finds a stale link when there is one, and passes the new forms', () => {
    // The check on the check: a scanner that matched nothing would pass too.
    assert.deepEqual(staleLinks('see https://trazum.vercel.app/?tab=playground.').map((s) => s.link), [
      'https://trazum.vercel.app/?tab=playground.',
    ]);
    assert.equal(staleLinks('[x](https://trazum.vercel.app/landing)').length, 1);
    assert.equal(staleLinks('<https://trazum.vercel.app/?utm=a&tab=tasks>').length, 1);
    for (const fine of [
      'https://trazum.vercel.app',
      'https://trazum.vercel.app/',
      'https://trazum.vercel.app/app?tab=playground',
      '[Tasks](https://trazum.vercel.app/app?tab=tasks)',
      'https://trazum.vercel.app/c/abcdefghijklmnop',
    ]) {
      assert.deepEqual(staleLinks(fine), [], fine);
    }
  });

  it('in every tracked text file but the records', () => {
    const files = tracked();
    assert.ok(files.length > 300, `only ${files.length} tracked files: is this a checkout?`);
    let links = 0;
    const stale = [];
    for (const path of files) {
      if (RECORDS.has(path)) continue;
      const absolute = join(ROOT, path);
      if (!existsSync(absolute)) continue;
      const text = readFileSync(absolute, 'utf8');
      links += [...text.matchAll(LINK)].length;
      for (const { line, link } of staleLinks(text)) stale.push(`${path}:${line} ${link}`);
    }
    assert.ok(links >= 8, `only ${links} links to the web app found: has the host moved?`);
    assert.deepEqual(stale, [], `these links would only redirect; write the address they reach:\n  ${stale.join('\n  ')}`);
  });

  it('and the records it leaves out are still there to be left out', () => {
    for (const [path, reason] of RECORDS) {
      assert.ok(existsSync(join(ROOT, path)), `${path} is gone; take it off the list (${reason})`);
    }
  });
});
