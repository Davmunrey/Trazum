import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

const manifestOf = (pkg) =>
  JSON.parse(readFileSync(join(repoRoot, pkg, 'package.json'), 'utf8'));

/**
 * Every workspace, expanded from the root `workspaces` globs.
 *
 * Listed by hand until now, which made this whole file blind to a workspace
 * added after it was written — the failure mode every other derived guard here
 * exists to avoid. Only the `dir/*` form is used in this repository.
 */
const WORKSPACES = manifestOf('.')
  .workspaces.flatMap((pattern) => {
    const parent = pattern.replace(/\/\*$/, '');
    return readdirSync(join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`)
      .filter((pkg) => existsSync(join(repoRoot, pkg, 'package.json')));
  })
  .sort();

/** The ones npm would upload: publishable unless the manifest says otherwise. */
const PACKAGES = WORKSPACES.filter((pkg) => manifestOf(pkg).private !== true);

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

  it('is published publicly, which a scoped package is not by default', () => {
    /**
     * **A scoped package is private unless it says otherwise.** `npm publish`
     * on `@trazum/core` without `--access public` or
     * `publishConfig.access: "public"` does one of two things, and both are
     * wrong for a project whose entire point is that anyone can install it: it
     * fails on a free account, or on a paid one it *succeeds* and uploads a
     * restricted package nobody outside the org can fetch.
     *
     * The second is the one worth a test. It is silent, it looks exactly like a
     * successful release, and npm allows unpublishing for 72 hours and then
     * never again.
     *
     * Both belts are asserted — the manifest here, the flag in the workflow
     * below — because they fail in different places. A dropped `publishConfig`
     * is invisible to the workflow, and a workflow rewritten to publish some
     * other way is invisible to the manifest.
     */
    for (const pkg of PACKAGES) {
      assert.equal(
        manifestOf(pkg).publishConfig?.access,
        'public',
        `${pkg} would upload as a restricted package`,
      );
    }
  });

  it('nothing is publishable by accident', () => {
    // Derived from the workspace globs, so a workspace added later has to make
    // the choice rather than inherit one. `apps/web` is an application: it has
    // dependencies, it is deployed rather than installed, and uploading it
    // would put a Next app on a registry as though it were a library.
    assert.ok(WORKSPACES.length >= 3, `only found ${WORKSPACES}`);
    assert.deepEqual(PACKAGES, ['packages/cli', 'packages/core']);
  });

  it('the release workflow publishes exactly those, and publicly', () => {
    /**
     * The manifest and the workflow have to agree about the *set*, not only
     * about the flag. A package that is publishable and never published is a
     * release that ships half of itself — and `@trazum/cli` pins
     * `@trazum/core` at an exact version, so the half that shipped would not
     * install.
     */
    const workflow = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');
    const published = [...workflow.matchAll(/npm publish -w (\S+)([^\n]*)/g)];

    assert.equal(
      published.length,
      PACKAGES.length,
      `${PACKAGES.length} publishable packages, ${published.length} publish steps`,
    );

    for (const pkg of PACKAGES) {
      const { name } = manifestOf(pkg);
      const step = published.find((match) => match[1] === name);
      assert.ok(step, `the release workflow never publishes ${name}`);
      assert.match(step[2], /--access public/, `${name} is published without --access public`);
      // Provenance is what lets somebody verify the tarball was built from this
      // repository at this commit — most of what "open source" is worth to a
      // person deciding whether to install it.
      assert.match(step[2], /--provenance/, `${name} is published without provenance`);
    }
  });

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

  it('and no milestone that never shipped under its own number is called released', () => {
    /**
     * The other direction, so moving an entry between the two sections cannot
     * silently promote it.
     *
     * The section was called "Merged into `main`, not yet released" until 1.8.0
     * was published; it is now "Collapsed into 1.8.0", because those milestones
     * *have* shipped — inside 1.8.0, never under their own numbers, and never
     * onto npm. The property is unchanged and so is the test: a version listed
     * there must not have its own `## X.Y.Z` heading in the changelog.
     *
     * The rename is the reason this failed rather than passing quietly, and
     * that is the design: `versionsUnder` returns null for a section that is
     * not there, and an empty list of subjects is refused rather than treated
     * as an empty list of findings.
     */
    const merged = versionsUnder('Collapsed into 1.8.0') ?? [];
    assert.ok(merged.length > 0, 'the collapsed-milestones section lists no versions');

    const wrong = merged.filter((version) => releasedInChangelog.includes(version));
    assert.deepEqual(
      wrong,
      [],
      `these are listed as collapsed but CHANGELOG.md released them separately: ${wrong.join(', ')}`,
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

  it('the command count in the README is the number of commands', () => {
    /**
     * The third count to drift, caught while adding the tenth command.
     *
     * `doctor` landed and the README went on saying "nine commands" in two places
     * and "the other eight" in a third — the same failure as the 580 tests and the
     * thirteen rules, in a file that had just been corrected for both. Correcting a
     * count without checking it only resets the clock.
     */
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const block = cli.slice(
      cli.indexOf('const COMMAND_FLAGS'),
      cli.indexOf('};', cli.indexOf('const COMMAND_FLAGS')),
    );
    const commands = [...block.matchAll(/^ {2}([a-z]+):/gm)].map((m) => m[1]);
    assert.ok(commands.length > 5, 'COMMAND_FLAGS could not be parsed — has it moved?');

    /**
     * Both prose files, not just the README.
     *
     * The fourth time this count drifted, and the first time the guard was
     * standing right next to it: `RELEASES.md` said "Nine commands now, up from
     * four" for two merges after `doctor` made it ten, because the test that
     * exists to catch exactly this read one file. Fixing a count in the file the
     * guard covers is not the same as fixing the count.
     */
    const prose = ['README.md', 'RELEASES.md'];

    // Two different claims share the shape `<number> commands`. "ten commands" is
    // the whole set; "the other nine commands" is the set minus `optimize`, and is
    // correct prose. Reading both as the total made this test fail on a sentence
    // that was right — a guard that cries wolf gets deleted, so it distinguishes
    // them rather than banning the phrasing.
    for (const file of prose) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      /**
         * Case-insensitive, which is not a detail.
         *
         * The lowercase-only version of this pattern could not see "Nine
         * commands now, up from four" at the top of `RELEASES.md`, because the
         * sentence starts there and the word is capitalised. Widening the guard
         * to a second file and then checking that it caught the drift it was
         * written for is what surfaced it: the count was wrong, the guard ran
         * green, and both were true at once.
         */
      for (const match of text.matchAll(/\b(other )?([a-z]+) commands\b( that | which )?/gi)) {
        const claimed = NUMBERS[match[2].toLowerCase()];
        if (claimed === undefined) continue; // "these commands", "the other commands"

        /**
         * A restrictive relative clause makes the phrase a subset, not a total.
         *
         * Widening this guard to `RELEASES.md` immediately failed on "the two
         * commands that answer *which prompt is worth an afternoon* and *who
         * made this one expensive*" — a sentence that is entirely correct and
         * counts two of the ten. `that` and `which` are what mark it, the same
         * way `other` marks "the other nine".
         */
        if (match[3]) continue;

        const expected = match[1] ? commands.length - 1 : commands.length;
        assert.equal(
          claimed,
          expected,
          `${file} says "${match[0]}" — expected ${expected} of ${commands.length}: ${commands.join(', ')}`,
        );
      }
    }
  });

  it('every command is mentioned in the README', () => {
    // A command nobody documented is a command nobody runs.
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const block = cli.slice(
      cli.indexOf('const COMMAND_FLAGS'),
      cli.indexOf('};', cli.indexOf('const COMMAND_FLAGS')),
    );
    const missing = [...block.matchAll(/^ {2}([a-z]+):/gm)]
      .map((m) => m[1])
      .filter((id) => !readme.includes(`trazum ${id}`) && !readme.includes(`\`${id}`));

    assert.deepEqual(missing, [], `undocumented commands: ${missing.join(', ')}`);
  });

  it('every route the web app serves is named in the roadmap', () => {
    /**
     * The drift this catches actually happened.
     *
     * `ROADMAP.md` listed **Prompt library** under "Under consideration" —
     * *"storing prompts is a different product, and one that would mean sending
     * them to a server. Trazum's privacy story is that it never does."* By then
     * the web app had shipped a prompt library with version history, an admin
     * overview, share links and a badge, and the roadmap said none of it
     * existed while explaining why one piece deliberately never would.
     *
     * A changelog records what happened; a roadmap says what the product is.
     * The second is the one somebody reads before opening a pull request, and
     * it is the one nothing was checking.
     *
     * Derived from the filesystem rather than a list kept here, for the reason
     * every other derived guard in this file exists: a hardcoded list stops
     * covering the thing that was added after it was written.
     */
    const roadmap = readFileSync(join(repoRoot, 'ROADMAP.md'), 'utf8');
    const appDir = join(repoRoot, 'apps/web/app');

    /** Every directory holding a `route.ts` or `page.tsx`, as a URL path. */
    const routes = [];
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path, `${prefix}/${entry.name}`);
        } else if (entry.name === 'route.ts' || entry.name === 'page.tsx') {
          routes.push(prefix === '' ? '/' : prefix);
        }
      }
    };
    walk(appDir, '');

    assert.ok(routes.length > 8, `only ${routes.length} routes found — has the app moved?`);

    // The root page and the two endpoints it calls are the original product and
    // are described throughout rather than by path. Everything else is a surface
    // added later, which is exactly what a roadmap goes stale about.
    const ORIGINAL = ['/', '/api/optimize', '/api/compare'];

    /**
     * Collapsed to the capability, not the endpoint.
     *
     * A dynamic segment is `[token]` on disk and `<token>` in prose, so the
     * guard asks about the segment before it. API paths collapse to their first
     * segment, so `/api/auth/github/callback` is asked about as `/api/auth`: a
     * roadmap that had to name an OAuth callback URL would be a roadmap written
     * to satisfy a test, and a guard that demands noise is a guard somebody
     * deletes.
     *
     * What this proves is narrow and worth stating: the roadmap *knows the
     * surface exists*. It cannot check that what the roadmap says about it is
     * true — nothing mechanical can — but the failure it caught was not a
     * subtle mischaracterisation, it was a whole subsystem the document denied
     * having built.
     */
    const capability = (route) =>
      route.startsWith('/api/')
        ? `/api/${route.split('/')[2]}`
        : route.replace(/\/\[[^\]]+\].*$/, '');

    /**
     * A whole path, not a substring — which the first version got wrong twice.
     *
     * `roadmap.includes('/admin')` was satisfied by the `/api/admin` written two
     * paragraphs away, so deleting every mention of the admin *page* left the
     * guard green. And `/c` — the share page — is two characters that occur
     * inside almost any path, so that route counted as documented by accident
     * from the start.
     *
     * A capability therefore has to start where a path starts: preceded by
     * something that is neither a path character nor a word character. What
     * follows it may be `/`, since `/badge` appears in prose as
     * `/badge/<token>.svg`.
     */
    const mentioned = (route) => {
      const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\w/])${escaped}($|[^\\w-])`).test(roadmap);
    };

    const missing = routes
      .filter((route) => !ORIGINAL.includes(route))
      .map(capability)
      .filter((route, index, all) => all.indexOf(route) === index)
      .filter((route) => !mentioned(route))
      .sort();

    assert.deepEqual(missing, [], `routes the roadmap never mentions: ${missing.join(', ')}`);
  });

  it('every in-page link in the README goes somewhere', () => {
    /**
     * A table of contents is only useful if it arrives somewhere, and a dead
     * anchor is invisible to every other check here — it renders as ordinary
     * text and silently does nothing when clicked.
     *
     * One was already broken before this test existed:
     * `#reordering-for-the-cache-reorder`, pointing at a heading whose real slug
     * is `…cache---reorder`, because GitHub turns `cache: --reorder` into three
     * hyphens and not one. Nothing noticed, because nothing was looking.
     *
     * The slug rule is GitHub's: lowercase, drop backticks and punctuation, keep
     * hyphens, spaces become hyphens — which is why runs of them survive.
     */
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const slug = (text) =>
      text
        .toLowerCase()
        .replace(/`/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

    const anchors = new Set(
      [...readme.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1])),
    );
    const links = [...readme.matchAll(/\]\(#([^)]+)\)/g)].map((match) => match[1]);

    assert.ok(links.length > 10, `only ${links.length} in-page links — has the contents gone?`);
    const dead = [...new Set(links)].filter((target) => !anchors.has(target));
    assert.deepEqual(dead, [], `README links to headings that do not exist: ${dead.join(', ')}`);
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
    /**
     * The claim this repository got wrong once already, in ROADMAP.md. A file
     * whose whole job is announcing releases is the likeliest place to imply one
     * happened — and it did happen again, in the commit that prepared 1.8.0.
     *
     * **The signal was wrong, which is why the guard let it through.** It read
     * "is there a `## X.Y.Z` heading in the changelog for the manifest version",
     * which is *a release cut in this repository* and not *a package on npm*.
     * Preparing 1.8.0 satisfied it, the assertion stopped running, and
     * RELEASES.md went out saying "1.8.0 is the first version on npm, and it is
     * the first one anybody can install" while `npm view` returned 404.
     *
     * A tag is the honest local proxy. `release.yml` triggers on `v*.*.*` and
     * publishes on nothing else, so no tag means nothing was ever uploaded —
     * checkable without the network, which a test in CI should not have.
     *
     * It needs the tags to be there. CI fetches full history for the action-pin
     * guard, which is the same requirement; a clone without them reports no tag
     * and asks for the sentence, which is the safe direction to be wrong in.
     */
    const version = manifestOf('.').version;
    const tagged = spawnSync('git', ['tag', '--list', `v${version}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const somethingIsPublished = tagged.status === 0 && tagged.stdout.trim() !== '';

    /**
     * Both directions, and every file that makes the claim.
     *
     * The package READMEs open with `npm install @trazum/…`, and they *are* the
     * npm page — so while nothing is published that line is an instruction that
     * 404s, and once something is published the warning above it becomes the
     * lie instead. A note that has to be removed by hand at release time is a
     * note that survives three releases.
     */
    const claimants = {
      'RELEASES.md': releases,
      'packages/core/README.md': readFileSync(join(repoRoot, 'packages/core/README.md'), 'utf8'),
      'packages/cli/README.md': readFileSync(join(repoRoot, 'packages/cli/README.md'), 'utf8'),
    };

    for (const [name, text] of Object.entries(claimants)) {
      const says = /[Nn]ot(hing has been)? published yet/.test(text);
      assert.equal(
        says,
        !somethingIsPublished,
        somethingIsPublished
          ? `${name} still says nothing is published, and v${version} is tagged`
          : `${name} no longer says that nothing is published, and nothing is published`,
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
