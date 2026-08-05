import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/**
 * What actually reaches npm.
 *
 * A published package is the one artefact this repository cannot take back —
 * npm allows unpublishing for 72 hours and then it is permanent. So the things
 * that are embarrassing to get wrong are checked here rather than noticed by
 * whoever installs it first.
 */

const PACKAGES = ['packages/core', 'packages/cli'];
const manifestOf = (pkg) =>
  JSON.parse(readFileSync(join(repoRoot, pkg, 'package.json'), 'utf8'));

describe('what npm would publish', () => {
  for (const pkg of PACKAGES) {
    describe(pkg, () => {
      const manifest = manifestOf(pkg);

      it('ships a LICENSE file, not just a licence field', () => {
        // "license": "MIT" in the manifest is metadata. The tarball has to carry
        // the actual terms, or nobody who installs it has been given them.
        assert.ok(manifest.files.includes('LICENSE'), 'LICENSE is not in files');
        assert.ok(existsSync(join(repoRoot, pkg, 'LICENSE')), 'LICENSE does not exist');
      });

      it('ships a README, because the npm page is the README', () => {
        assert.ok(manifest.files.includes('README.md'), 'README.md is not in files');
        const readme = join(repoRoot, pkg, 'README.md');
        assert.ok(existsSync(readme), 'README.md does not exist');
        assert.ok(
          readFileSync(readme, 'utf8').length > 500,
          'the README is too short to tell anyone anything',
        );
      });

      it('declares the Node it needs', () => {
        // Without engines, npm installs silently on a Node too old to run it and
        // the failure surfaces as a syntax error in someone else's build.
        assert.ok(manifest.engines?.node, 'no engines.node');
      });

      it('cannot publish a stale dist', () => {
        // `files: ["dist"]` means the tarball is whatever happens to be on disk.
        // Publishing without building would ship the previous version's code
        // under the new version's number, which is the worst possible outcome and
        // completely silent.
        assert.match(
          manifest.scripts.prepublishOnly ?? '',
          /\bbuild\b/,
          'prepublishOnly does not build',
        );
        assert.match(
          manifest.scripts.prepublishOnly ?? '',
          /\btest\b/,
          'prepublishOnly does not run the tests',
        );
      });

      it('ships the sources its source maps point at', () => {
        // Every emitted .js.map references ../src/*.ts and carries no
        // sourcesContent. Shipping the maps without the sources gives a debugger
        // a file it cannot load — worse than no map at all, which would simply
        // step through the compiled output.
        assert.ok(
          manifest.files.includes('src'),
          'source maps are shipped but the sources they point at are not',
        );
      });

      it('has no runtime dependencies outside this repository', () => {
        const deps = Object.keys(manifest.dependencies ?? {});
        assert.deepEqual(
          deps.filter((name) => !name.startsWith('@trazum/')),
          [],
          'a runtime dependency appeared — see the invariant in security.test.js',
        );
      });

      it('points at the repository, so npm can link back to it', () => {
        assert.equal(manifest.repository?.directory, pkg);
        assert.ok(manifest.repository?.url?.includes('Davmunrey/Trazum'));
      });
    });
  }

  it('every manifest carries the same version', () => {
    // Released in lockstep on purpose: a version skew between the core and the
    // CLI has no useful meaning, and @trazum/cli pins core exactly.
    const versions = new Map();
    for (const pkg of ['.', ...PACKAGES, 'apps/web']) {
      versions.set(pkg, manifestOf(pkg).version);
    }
    const distinct = new Set(versions.values());
    assert.equal(
      distinct.size,
      1,
      `versions have drifted: ${[...versions].map(([p, v]) => `${p}=${v}`).join(', ')}`,
    );

    const cli = manifestOf('packages/cli');
    assert.equal(
      cli.dependencies['@trazum/core'],
      versions.get('packages/core'),
      '@trazum/cli pins a version of @trazum/core that is not the one being released',
    );
  });

  it('the source maps really do reference src', () => {
    // The premise of the "ships the sources" test above, checked against a built
    // map rather than assumed. If TypeScript ever inlines sourcesContent, the
    // `src` requirement stops being load-bearing and this says so.
    const map = join(repoRoot, 'packages/core/dist/optimize.js.map');
    if (!existsSync(map)) return; // not built yet; the build step covers this
    const parsed = JSON.parse(readFileSync(map, 'utf8'));
    assert.ok(
      parsed.sources.some((s) => s.includes('src/')),
      'maps no longer reference src — the files entry may no longer be needed',
    );
    assert.ok(
      !Array.isArray(parsed.sourcesContent),
      'maps now inline their sources, so shipping src is no longer required for them',
    );
  });
});
