import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src');
const sourceOf = (name) => readFileSync(join(srcDir, name), 'utf8');
const sources = readdirSync(srcDir).filter((name) => name.endsWith('.ts'));

/**
 * The two promises the arc made when it scheduled this, held by tests.
 *
 * From `docs/plan-1.83-2.0.md`, chapter 4: *"Send the buffer anywhere, in any
 * form, ever"* is what the extension refuses to do, and *"the extension runs
 * `@trazum/core` in the editor's own process against text that is already on
 * the machine"* is how. An extension that uploaded a prompt to price it would
 * be the exact inversion of this product, which makes the promise worth more
 * than a paragraph.
 *
 * The rest of the repository holds the same rule the same way: `security.test.js`
 * permits `fetch` only in the two modules that exist to make calls, and names
 * them. Here the permitted set is empty.
 */

describe('nothing the editor sees leaves the machine', () => {
  it('has sources to read, so this suite cannot pass by finding none', () => {
    assert.ok(sources.length >= 2, `only ${sources.length} source files — has the layout moved?`);
  });

  for (const name of sources) {
    it(`${name} opens no socket of any kind`, () => {
      const source = sourceOf(name);
      /*
        Every way out this repository knows about, in one alternation. Named
        rather than pattern-matched on "http" alone, because a comment
        explaining that nothing is sent should not fail the check that nothing
        is sent — and the comments here say exactly that.
      */
      const ways =
        /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connect)\s*\(|from '(node:)?(https?|net|dgram|dns|tls)'|require\('(node:)?(https?|net|dgram|dns|tls)'\)/;
      const found = ways.exec(source);
      assert.equal(found, null, `${name} can reach the network: ${found?.[0]}`);
    });
  }

  it('and the check is not one that can never fire', () => {
    const planted = "const answer = await fetch('https://example.com', { method: 'POST' });";
    assert.match(planted, /\bfetch\s*\(/, 'the detector cannot see the thing it forbids');
  });

  it('imports nothing from the core that reaches out', () => {
    /*
      `@trazum/core/node` exports `openrouterOverlay` and `checkedEndpoint`,
      which exist to make calls. Importing one here would put a network path in
      the editor's process without a `fetch` anywhere in this package's source,
      which is precisely the shape a textual check misses.
    */
    const reaching = /\b(openrouterOverlay|checkedEndpoint|SAFE_FETCH_INIT)\b/;
    for (const name of sources) {
      assert.doesNotMatch(sourceOf(name), reaching, `${name} imports a core module that makes calls`);
    }
  });

  it('declares no runtime dependency but the core', () => {
    const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ['@trazum/core']);
  });
});

describe('the shim carries the editor, never the judgement', () => {
  const shim = sourceOf('extension.ts');

  /**
   * The source with its comments and string literals removed.
   *
   * All three have to go before anything looks for arithmetic, and each was
   * found by the check reporting a fault that was not one. Comments first: the
   * comments here explain that nothing is computed. Then string literals, or
   * `from 'node:fs/promises'` reads as the division `s/p`. Then the imports
   * themselves, or `import * as vscode` reads as the multiplication `t * a`.
   *
   * A guard that cries wolf on three ordinary lines is a guard the next person
   * deletes, which is worse than not having written it.
   */
  const code = shim
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    .replace(/^import[\s\S]*?;$/gm, '');

  it('computes no figure of its own', () => {
    /*
      The status bar showing a percentage it worked out itself would be a second
      implementation of a number the rest of the repository holds to one. Every
      figure on screen comes off a `Reading`, so the shim needs no arithmetic at
      all — and the one number it does own, the settle delay, is a named
      constant rather than a literal in a call.
    */
    const body = code;
    const arithmetic = /[^/*\s]\s*[*/%]\s*[^/*\s=]|\btoLocaleString\b|\btoFixed\b|Math\.(round|floor|ceil)/;
    const found = arithmetic.exec(body);
    assert.equal(found, null, `extension.ts computes something: ${found?.[0]}`);
  });

  it('renders only strings the reading module produced', () => {
    const body = shim.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const assignments = [...body.matchAll(/item\.(text|tooltip)\s*=\s*([^;]+);/g)].map(([, , value]) => value);
    assert.ok(assignments.length > 0, 'the shim sets nothing on the status bar — has it moved?');

    for (const value of assignments) {
      assert.match(
        value,
        /statusText\(|detailText\(|\bdetail\b/,
        `the shim writes its own status text: ${value.trim()}`,
      );
    }
  });

  it('and the reading module never reaches for the editor', () => {
    assert.doesNotMatch(sourceOf('reading.ts'), /from 'vscode'|require\('vscode'\)/);
  });
});
