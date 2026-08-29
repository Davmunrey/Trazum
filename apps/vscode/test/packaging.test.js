import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../../packages/cli/test/env.mjs';
import { CELLS, FILLED, PALETTE, SIZE, png } from '../../../scripts/draw-icon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/**
 * Whether this extension can actually be packaged, checked without `vsce`.
 *
 * The first version of this workspace could not be. It was named
 * `@trazum/vscode`, which is a fine npm workspace name and an impossible
 * extension name: a marketplace identifier is `publisher.name`, and a slash
 * cannot appear in one. Nothing caught it, because nothing had tried to ship
 * it — the code was written, the tests passed, and the artefact a person
 * installs could not be built at all.
 *
 * **The rules are checked here rather than by taking the dependency.**
 * `@vscode/vsce` is a large tree that exists to produce one zip on demand, and
 * this repository does not install a tool to find out whether its own manifest
 * is valid. `npm run package:vscode` runs it through `npx` when somebody wants
 * the file; these tests are what stop the manifest drifting in between.
 */

describe('the extension can be packaged', () => {
  it('has a name that can be half of a marketplace identifier', () => {
    /*
      `publisher.name` is the identifier. A scoped npm name puts a slash and an
      at-sign in it, which is how this workspace shipped in its first commit.
    */
    assert.match(manifest.name, /^[a-z0-9][a-z0-9-]*$/, 'the name cannot appear in publisher.name');
    assert.doesNotMatch(manifest.name, /[@/]/);
  });

  it('names a publisher, since the identifier has no other half', () => {
    assert.match(manifest.publisher, /^[A-Za-z0-9][A-Za-z0-9-]*$/);
  });

  it('declares the editor version it needs, not only the Node one', () => {
    assert.match(manifest.engines?.vscode ?? '', /^\^?\d+\.\d+\.\d+$/, 'engines.vscode is what makes it an extension');
  });

  it('points at an entry point the build actually produces', () => {
    assert.ok(manifest.main, 'no main: the editor would activate nothing');
    assert.ok(existsSync(join(root, manifest.main)), `${manifest.main} is not there — build first`);
  });

  it('contributes something a user can see, and declares a category', () => {
    assert.ok((manifest.categories ?? []).length > 0);
    assert.ok(Object.keys(manifest.contributes ?? {}).length > 0);
  });

  it('carries the licence and the repository, because a listing shows both', () => {
    assert.equal(manifest.license, 'MIT');
    assert.ok(existsSync(join(root, 'LICENSE')));
    assert.ok(existsSync(join(root, 'README.md')), 'the README is the marketplace page');
    assert.equal(manifest.repository?.directory, 'apps/vscode');
  });

  it('keeps the sources and the tests out of what ships', () => {
    const ignore = readFileSync(join(root, '.vscodeignore'), 'utf8');
    for (const pattern of ['src/**', 'test/**', 'tsconfig.json']) {
      assert.ok(ignore.includes(pattern), `.vscodeignore does not exclude ${pattern}`);
    }
  });

  it('is still private to npm, which is a different registry with a different answer', () => {
    /*
      An extension is distributed by a marketplace. `private: true` is what
      keeps `publish.test.js` from treating it as something npm should carry,
      and `vsce` has no opinion about the field.
    */
    assert.equal(manifest.private, true);
  });
});

describe('the icon is generated, and is what the generator produces', () => {
  const path = join(root, manifest.icon ?? '');

  it('is declared and present', () => {
    assert.ok(manifest.icon, 'no icon: the listing gets a placeholder');
    assert.ok(existsSync(path));
  });

  it('is a 128×128 PNG, which is what the marketplace asks for', () => {
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(bytes.readUInt32BE(16), SIZE);
    assert.equal(bytes.readUInt32BE(20), SIZE);
    assert.equal(SIZE, 128);
  });

  it('is byte-identical to a fresh run, so it was generated and not edited', () => {
    /*
      The same claim `architecture-image.test.js` makes about the boundary
      picture, for the same reason: a binary somebody touched by hand is a
      binary nobody can review or reproduce.
    */
    assert.deepEqual(readFileSync(path), png());
  });

  it('and the generator is reachable from a script somebody can run', () => {
    const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;
    assert.ok(scripts['draw:icon'], 'no npm script regenerates it');
  });

  it('draws the product’s own proportion bar, in the product’s own palette', () => {
    assert.ok(FILLED > 0 && FILLED < CELLS, 'a bar that is empty or full is not a bar');

    /*
      Held against the file the generator says it took the colours from, not
      against a copy of them written here. `draw-icon.mjs` claims the palette is
      *"the product's own, taken from `docs/assets/demo.svg`"*, and until this
      assertion existed that sentence was a comment beside a hardcoded triple in
      the guard — two copies of the same number, agreeing with each other and
      with nothing. A colour changed in the demo now changes the icon or fails
      here; it can no longer do neither.
    */
    const demo = readFileSync(join(repoRoot, 'docs', 'assets', 'demo.svg'), 'utf8');
    const hex = ([r, g, b]) =>
      `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    for (const [role, channels] of Object.entries(PALETTE)) {
      assert.ok(
        demo.toLowerCase().includes(hex(channels)),
        `the icon's ${role} colour ${hex(channels)} is in no other surface of this product`,
      );
    }
  });
});

describe('the packaging command exists and says what it does', () => {
  const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;

  it('builds before it packages, so the entry point is there', () => {
    const command = scripts['package:vscode'];
    assert.ok(command, 'nothing produces a .vsix');
    assert.match(command, /npm run build -w trazum-vscode/, 'packaging a stale dist ships yesterday');
  });

  it('takes vsce on demand rather than as a dependency of this repository', () => {
    assert.match(scripts['package:vscode'], /npx/, 'vsce should not be installed to check a manifest');
    const own = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    for (const block of ['dependencies', 'devDependencies']) {
      assert.ok(!(own[block] ?? {})['@vscode/vsce'], 'vsce is in the tree after all');
    }
  });

  it('and what it writes cannot be swept into a commit', () => {
    /*
      `git add -A` before a commit takes whatever the last command left behind.
      That is how sixty waiver records reached `main` and sat there for two
      releases, which `publish.test.js` documents — and its guard checks the
      tracked tree, deliberately, because an untracked file is a local mess
      rather than everybody's problem. This is the other half: the artefact the
      documented command produces is ignored, so running it cannot make the
      mess in the first place.
    */
    const probe = join(root, `trazum-vscode-${manifest.version}.vsix`);
    const ignored = execFileSync('git', ['check-ignore', '--no-index', probe], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SPAWN_ENV,
    });
    assert.match(ignored.trim(), /\.vsix$/, 'the packaged extension is not ignored');
  });

  it('and the extension still builds and passes on its own', () => {
    /*
      The workspace was renamed once already, from `@trazum/vscode` to something
      a marketplace can hold. A rename that left the root scripts pointing at
      the old name would fail here rather than in somebody's release.
    */
    const out = execFileSync('npm', ['run', 'build', '-w', manifest.name], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 120000,
    });
    assert.match(out, /tsc/, `the workspace ${manifest.name} did not build`);
  });
});
