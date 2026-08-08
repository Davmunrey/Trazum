import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { RULES } from '../dist/index.js';

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

describe('the record agrees with itself', () => {
  /**
   * ROADMAP.md filed five versions under "Released" that were never released.
   *
   * No git tag existed, the `@trazum` scope did not exist, and CHANGELOG.md —
   * which states at the top that `Unreleased` means merged-but-untagged — held
   * every one of them under `Unreleased`. Two documents, one of them wrong, and
   * nothing checking either against the other.
   *
   * It matters beyond tidiness: "Released" is what somebody reads before
   * deciding whether they can install this. The discipline in this repository is
   * not claiming what has not been checked, and this was the least-checked claim
   * in it.
   */
  const roadmap = readFileSync(join(repoRoot, 'ROADMAP.md'), 'utf8');
  const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');

  /** Version headings under one `##` section of the roadmap. */
  const versionsUnder = (heading) => {
    const start = roadmap.indexOf(`\n## ${heading}`);
    if (start === -1) return null;
    const rest = roadmap.slice(start + 1);
    const end = rest.indexOf('\n## ');
    const body = end === -1 ? rest : rest.slice(0, end);
    return [...body.matchAll(/^### (\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
  };

  const releasedInChangelog = [
    ...changelog.matchAll(/^## (\d+\.\d+\.\d+)/gm),
  ].map((m) => m[1]);

  it('every version the roadmap calls released has a changelog entry', () => {
    const claimed = versionsUnder('Released');
    assert.ok(claimed, 'the roadmap has no "Released" section any more');
    assert.ok(claimed.length > 0, 'the "Released" section lists no versions');

    const unbacked = claimed.filter((version) => !releasedInChangelog.includes(version));
    assert.deepEqual(
      unbacked,
      [],
      `ROADMAP.md calls these released and CHANGELOG.md has not: ${unbacked.join(', ')}`,
    );
  });

  it('and nothing merged-but-unreleased is claimed as released', () => {
    // The other direction, so moving an entry between the two sections cannot
    // silently promote it.
    const merged = versionsUnder('Merged into `main`, not yet released') ?? [];
    assert.ok(merged.length > 0, 'the merged-not-released section lists no versions');

    const wrong = merged.filter((version) => releasedInChangelog.includes(version));
    assert.deepEqual(
      wrong,
      [],
      `these sit under "not yet released" but CHANGELOG.md has released them: ${wrong.join(', ')}`,
    );
  });

  it('the manifests carry the newest version the changelog has released', () => {
    // 1.0.0 in every manifest was *correct*: the changelog's newest release is
    // 1.0.0 and everything since is unreleased. Asserted so it stays true in
    // both directions — a publish bumps the manifests and cuts a changelog
    // section, or it does neither.
    const newest = releasedInChangelog[0];
    assert.ok(newest, 'the changelog has no released version at all');
    assert.equal(
      manifestOf('.').version,
      newest,
      'the manifests and the changelog disagree about what the last release was',
    );
  });
});

describe('a count written in prose is a claim like any other', () => {
  /**
   * Two of them had drifted, silently, because nothing compared them to the code.
   *
   * `RELEASES.md` said **thirteen** deterministic rules where there are twelve,
   * and listed "restated output formats" among what they cut — which is an
   * advisory that is deliberately never cut, so the sentence was wrong twice. The
   * README, separately, advertised **580** tests while the real figure had reached
   * 798.
   *
   * The README's number is gone: a total across four suites cannot be checked
   * from here without running all four, and a number nobody maintains is worse
   * than no number. The rule count is one property away and is checked.
   *
   * Written as words rather than digits in that file, so this reads words.
   */
  const NUMBERS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  };

  it('the rule count in RELEASES.md is the number of rules', () => {
    const releases = readFileSync(join(repoRoot, 'RELEASES.md'), 'utf8');
    const claim = releases.match(/\*\*([A-Za-z]+) deterministic rules\*\*/);

    assert.ok(claim, 'RELEASES.md no longer states a rule count — if it never does again, delete this test');
    const claimed = NUMBERS[claim[1].toLowerCase()];
    assert.ok(claimed !== undefined, `"${claim[1]}" is not a number this test knows`);
    assert.equal(
      claimed,
      RULES.length,
      `RELEASES.md claims ${claim[1]} (${claimed}) deterministic rules; there are ${RULES.length}`,
    );
  });

  it('and no advisory is described as something the rules cut', () => {
    // The other half of that sentence. `restated-output-format` is advisory only
    // — the schema and the prose walking through it are both defensible, and
    // which to keep is the author's call — so listing it as a cut is a promise
    // Trazum deliberately does not keep.
    const releases = readFileSync(join(repoRoot, 'RELEASES.md'), 'utf8');
    const sentence = releases.match(/\*\*[A-Za-z]+ deterministic rules\*\*[^.]*\./);
    assert.ok(sentence, 'the rule sentence has moved');

    for (const phrase of ['restated output format', 'contradictor', 'redundant example']) {
      assert.equal(
        sentence[0].toLowerCase().includes(phrase),
        false,
        `"${phrase}" is advisory only and is listed among what the rules cut`,
      );
    }
  });

  it('the README states no test total, because nothing here can check one', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const claim = readme.match(/#\s*(\d[\d,]*)\s+tests/);
    assert.equal(
      claim,
      null,
      `README.md advertises "${claim?.[1]}" tests again — that number drifted from 580 to 798 unnoticed`,
    );
  });
});

describe('a release cannot ship without notes', () => {
  /**
   * `RELEASES.md` is the human-facing counterpart to the changelog, and the
   * release workflow builds the GitHub release body from it.
   *
   * Before that, publishing to npm created **no GitHub release at all**: the tag
   * existed, the page behind it was empty, and anyone following a "what changed?"
   * link arrived at a file list. Writing the notes in a pull request and letting
   * the workflow read them beats typing them into a web form at the moment of
   * releasing, which is the moment least suited to writing anything carefully.
   *
   * These tests are what make the file load-bearing rather than decorative.
   */
  const releases = readFileSync(join(repoRoot, 'RELEASES.md'), 'utf8');
  const sections = [...releases.matchAll(/^## (\S+)/gm)].map((m) => m[1]);

  it('the version in the manifests has a section', () => {
    // The check that matters: a version can be tagged only once somebody has
    // said, in prose, what is in it.
    const version = manifestOf('.').version;
    assert.ok(
      sections.includes(version),
      `RELEASES.md has no "## ${version}" section — write the notes before tagging`,
    );
  });

  it('the newest section is either the pending release or the current version', () => {
    // Nothing is published yet, so the top section is `Unreleased`. Once a
    // version ships it becomes that version, and the next unreleased work opens
    // a new `Unreleased` above it. Anything else means the file drifted from
    // what is actually installable.
    const newest = sections[0];
    const version = manifestOf('.').version;
    assert.ok(
      newest === 'Unreleased' || newest === version,
      `the newest section is "${newest}", which is neither Unreleased nor ${version}`,
    );
  });

  it('states that nothing is published, while nothing is published', () => {
    // The claim this repository got wrong once already, in ROADMAP.md. A file
    // whose whole job is announcing releases is the likeliest place to imply one
    // happened.
    const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
    const released = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
    const somethingIsPublished = released.includes(manifestOf('.').version) && sections[0] !== 'Unreleased';

    if (!somethingIsPublished) {
      assert.match(
        releases,
        /Nothing has been published yet/,
        'RELEASES.md no longer says that nothing is published, and nothing is published',
      );
    }
  });

  it('the extractor returns that section and nothing after it', () => {
    // The workflow pipes this into `gh release create`. A bug that swallows the
    // next section publishes one release under another release's notes.
    const version = manifestOf('.').version;
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts/release-notes.mjs'), version], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    // `startsWith`, not a regex built from the version. Doing the latter here
    // is what CodeQL flagged in the script, and repeating it in the test that
    // guards the script would have been funny in the wrong way.
    assert.ok(
      result.stdout.startsWith(`## ${version}`),
      `the notes do not start with the version heading: ${result.stdout.slice(0, 60)}`,
    );
    assert.equal(
      (result.stdout.match(/^## /gm) ?? []).length,
      1,
      'the extracted notes contain more than one release',
    );
  });

  it('and fails loudly for a version it has never heard of', () => {
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts/release-notes.mjs'), '9.9.9'], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no section for 9\.9\.9/);
    assert.equal(result.stdout, '', 'it printed something as well as failing');
  });

  it('treats the argument as a version, never as a pattern', () => {
    /**
     * The first version of the extractor built a regex out of `process.argv[2]`,
     * and CodeQL raised three alerts that were all correct: regex injection, and
     * incomplete escaping twice over. `(a+)+$` was a ReDoS pattern handed
     * straight to a matcher, and `(((((` threw before the file was read.
     *
     * The fix was to stop treating a version number as a pattern at all.
     *
     * What this test pins is the *property*, not that choice: these payloads are
     * rejected, produce no output, and never reach a matcher. A correctly escaped
     * regex would satisfy all three, and I checked — reintroducing one with a
     * complete escape keeps this test green. That is the right outcome rather
     * than a gap: a complete escape is safe, and a test that failed on it would
     * be enforcing my preference instead of the requirement.
     *
     * Empty stdout is the assertion doing the real work. The release step
     * redirects this into a file and publishes it, so exiting non-zero while
     * having already written something is how a blank release ships anyway.
     */
    for (const argument of ['(((((', '(a+)+$', '.*', '1.0.0\\', '1.0.0 --notes-file /etc/passwd']) {
      const result = spawnSync(
        process.execPath,
        [join(repoRoot, 'scripts/release-notes.mjs'), argument],
        { encoding: 'utf8', timeout: 5000 },
      );

      assert.notEqual(result.status, 0, `"${argument}" was accepted`);
      assert.equal(result.stdout, '', `"${argument}" produced output`);
      assert.doesNotMatch(
        result.stderr,
        /Invalid regular expression|SyntaxError/,
        `"${argument}" still reaches a regex`,
      );
    }
  });
});
