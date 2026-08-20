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

      it('declares a bin npm will not rewrite on the way to the registry', () => {
        /**
         * **npm silently corrects a manifest as it publishes it.** Both of these
         * shipped `"./dist/index.js"`, and every publish answered
         * `"bin[trazum]" script name was cleaned` — npm stripping the `./` and
         * uploading a manifest that differs from the one in the repository. On
         * npm 12 the same warning reads "was invalid and removed", which would
         * put a package with a `bin` field and no executable on the registry.
         *
         * The registry copy is the one users install, so what it says is not a
         * cosmetic matter. Asserted here rather than trusted to a warning nobody
         * reads in a wall of `npm notice` lines during the one command this
         * repository cannot take back.
         */
        for (const [name, target] of Object.entries(manifest.bin ?? {})) {
          assert.doesNotMatch(
            target,
            /^\.\//,
            `bin["${name}"] starts with "./", which npm rewrites while publishing`,
          );
          assert.ok(
            existsSync(join(repoRoot, pkg, target)) || manifest.files.includes(target.split('/')[0]),
            `bin["${name}"] points at ${target}, which is not in the tarball`,
          );
        }
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

  it("the README's front page names every workspace", () => {
    /**
     * The architecture diagram at the top of the README is the first thing a
     * visitor reads, and it silently omitted `@trazum/mcp` for the whole day
     * that package existed — the same drift, in the same file, as the prompt
     * library the roadmap denied and the privacy sentence the schema
     * contradicted. Derived from the workspace manifests rather than a list
     * here, so the next package added has to appear or this fails.
     */
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const missing = WORKSPACES.map((pkg) => manifestOf(pkg).name).filter(
      (name) => !readme.includes(name),
    );
    assert.deepEqual(missing, [], `the README never mentions: ${missing.join(', ')}`);
  });

  it('the counts the README claims are the counts the code has', () => {
    /**
     * The front page now leads with "thirteen findings" and "twelve
     * deterministic rules". Those are the load-bearing numbers of the pitch —
     * the whole argument is that the advisories outnumber and outweigh the
     * trimming — and a rule or an advisory added later would leave the headline
     * quietly wrong to every visitor.
     *
     * `RULES` is imported. The advisories have no runtime array to count, so
     * the `AdvisoryId` union is counted from source: the alternative is
     * hardcoding a second number here, which is the thing being guarded
     * against.
     */
    // Collapsed, because the phrase this looks for is wrapped across a line
    // break in the hero and a literal match would depend on where the wrap
    // happens to fall.
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8').replace(/\s+/g, ' ');
    const words = {
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
    };

    const union = readFileSync(join(repoRoot, 'packages/core/src/types.ts'), 'utf8')
      .split('export type AdvisoryId =')[1]
      ?.split(';')[0];
    assert.ok(union, 'the AdvisoryId union moved — this guard can no longer find it');
    const advisoryCount = [...union.matchAll(/'[a-z-]+'/g)].length;
    assert.ok(advisoryCount >= 5, `only parsed ${advisoryCount} advisories out of the union`);

    for (const [claimed, expected] of [
      [`${Object.keys(words).find((w) => words[w] === advisoryCount)} findings`, advisoryCount],
      [`${Object.keys(words).find((w) => words[w] === RULES.length)} deterministic rules`, RULES.length],
    ]) {
      assert.ok(
        readme.includes(claimed),
        `the README should say "${claimed}" (the code has ${expected})`,
      );
    }
  });

  it('every image the README points at is actually in the repository', () => {
    /**
     * A README image is the one part of the front page that fails silently:
     * GitHub renders a broken-image placeholder to every visitor and says
     * nothing to the person who moved the file. Both the hero terminal and the
     * web-app screenshots are local paths, and a rename that misses one is a
     * commit that looks clean in review.
     *
     * Only repository-relative paths are checked. An absolute URL is somebody
     * else's uptime and not something a test here can assert.
     */
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const referenced = [...readme.matchAll(/(?:src|srcset)="([^"]+)"/g)]
      .map((match) => match[1].trim())
      .filter((path) => !/^(?:https?:)?\/\//.test(path) && !path.startsWith('data:'));

    assert.ok(referenced.length > 0, 'no local images found — has the syntax changed?');

    const broken = referenced.filter((path) => !existsSync(join(repoRoot, path)));
    assert.deepEqual(broken, [], `the README points at files that do not exist: ${broken}`);
  });

  it('nothing is publishable by accident', () => {
    // Derived from the workspace globs, so a workspace added later has to make
    // the choice rather than inherit one. `apps/web` is an application: it has
    // dependencies, it is deployed rather than installed, and uploading it
    // would put a Next app on a registry as though it were a library.
    assert.ok(WORKSPACES.length >= 3, `only found ${WORKSPACES}`);
    assert.deepEqual(PACKAGES, ['packages/cli', 'packages/core', 'packages/mcp']);
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
  /**
   * The words this guard can check.
   *
   * It stopped at sixteen for five releases while the command count went to
   * twenty-one, and an unknown word is skipped rather than failed — so the
   * claim in the README went unchecked exactly when it was changing most. A
   * guard that quietly stops guarding is worse than no guard, because it
   * still reads like one. Extended well past where the counts are, and
   * hyphenated forms included, since that is how English writes them.
   */
  const NUMBERS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
    'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
    'twenty-nine': 29, thirty: 30, 'thirty-one': 31, 'thirty-two': 32,
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
      const whole = readFileSync(join(repoRoot, file), 'utf8');

      /**
       * In `RELEASES.md`, only the standing header is a live claim.
       *
       * **The second guard today to need this distinction**, after the one on the
       * published error band. Below the first `## <version>` heading the file is a
       * record: "Twelve commands now, up from four" is a true statement about
       * 1.8.0, and rewriting it to say thirteen would be falsifying history to
       * satisfy a test. The drift this guard was written for lived in the standing
       * header — "Nine commands now" at the top, two merges after `doctor` made it
       * ten — and that half is still checked.
       *
       * `README.md` has no such split. Every word of it describes the present.
       */
      const firstRelease = whole.search(/^## \d+\.\d+\.\d+/m);
      const text =
        file === 'RELEASES.md' && firstRelease > 0 ? whole.slice(0, firstRelease) : whole;
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
      for (const match of text.matchAll(/\b(other )?([a-z]+(?:-[a-z]+)?) commands\b( that | which )?/gi)) {
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

  it('every prose surface names the current version', () => {
    /**
     * The standing rule this repository was given out loud: a release is not
     * cut until the documentation says so — all of it. `RELEASES.md` is
     * enforced above. These are the two that actually drifted: `ROADMAP.md`
     * stopped at 1.9.0 for sixteen releases while npm moved to 1.25.0, and a
     * roadmap whose "Released" section ends fifteen versions ago reads as a
     * project that stalled, to exactly the visitor deciding whether to
     * depend on it.
     *
     * `CHANGELOG.md` needs the version as a heading — the fold from
     * `Unreleased` is a release-prep step, not an afterthought. `ROADMAP.md`
     * needs the version named anywhere, so a range entry ("1.10.0 through
     * 1.25.0") satisfies it without forcing a full section per release —
     * the point is that the file was *touched with intent*, not that it has
     * a particular shape.
     */
    const version = manifestOf('.').version;
    // Line comparison rather than a regex built from data — a version string
    // is trusted here, but CodeQL is right that escaping only the dots is the
    // habit that goes wrong the day the input is not.
    const changelogText = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8');
    const hasHeading = changelogText
      .split('\n')
      .some((line) => line === `## ${version}` || line.startsWith(`## ${version} `));
    assert.ok(
      hasHeading,
      `CHANGELOG.md has no "## ${version}" heading — fold Unreleased into the version before tagging`,
    );

    const roadmap = readFileSync(join(repoRoot, 'ROADMAP.md'), 'utf8');
    assert.ok(
      roadmap.includes(version),
      `ROADMAP.md never mentions ${version} — carry the release into the Released section (a range entry counts)`,
    );
  });

  it('every flag the help shows taking a value is registered as taking one', () => {
    /**
     * **A value flag missing from `VALUE_FLAGS` is silently a boolean.**
     *
     * `--contract profile` shipped that way for the length of one release
     * branch: the parser stored `contract: true` and dropped `profile` into
     * the positionals, so the command read `undefined`, ignored the flag it
     * had been given, and produced a confident answer about the wrong thing.
     * Nothing errored. `rejectUnknownFlags` was happy — the flag *is* known —
     * and the only symptom was an answer that looked right.
     *
     * The help text is the checkable source: a line reading `--x <value>`
     * documents a flag that takes one. That is a promise to a reader, and this
     * holds the parser to it.
     *
     * Deliberately one-directional. A flag in `VALUE_FLAGS` with no help line
     * is a separate question — some are internal, some are aliases — and
     * failing on it would make this guard about documentation coverage rather
     * than about the parser lying.
     */
    const cli = readFileSync(join(repoRoot, 'packages/cli/src/index.ts'), 'utf8');
    const block = cli.slice(cli.indexOf('const VALUE_FLAGS'), cli.indexOf('\n]);', cli.indexOf('const VALUE_FLAGS')));
    const registered = new Set([...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]));
    assert.ok(registered.size > 10, 'VALUE_FLAGS could not be parsed — has it moved?');

    const help = readFileSync(join(repoRoot, 'packages/cli/src/i18n/en.ts'), 'utf8');
    /**
     * The OPTIONS blocks only, never the USAGE synopsis.
     *
     * `trazum diff --all <dir> <dir>` in the synopsis reads exactly like a
     * flag taking a value, and the two directories are positionals — the
     * first version of this guard failed on it and was right about the shape
     * and wrong about the meaning. An OPTIONS line is unambiguous: the value
     * is what follows the flag on that line or nothing does.
     */
    const helpStart = help.indexOf("OPTIONS FOR");
    const helpEnd = help.indexOf('\n  where: {', helpStart);
    const helpText = help.slice(helpStart, helpEnd === -1 ? undefined : helpEnd);

    // `--x <value>` and `-o, --out <file>`: the long name is what the parser
    // stores under, so that is what has to be registered.
    const documented = new Set(
      [...helpText.matchAll(/--([a-z][a-z-]*)\s+<[^>]+>/g)].map((m) => m[1]),
    );
    assert.ok(documented.size > 10, 'no value-taking flags found in the help — has it moved?');

    const unregistered = [...documented].filter((flag) => !registered.has(flag)).sort();
    assert.deepEqual(
      unregistered,
      [],
      'these are documented as taking a value and would be parsed as booleans, silently',
    );
  });

  it('every workspace depending on @trazum/core pins the version being published', () => {
    /**
     * **The web app was pinned to 1.36.0 for ten releases and nothing noticed.**
     *
     * `packages/cli` and `packages/mcp` pin an exact `@trazum/core` version,
     * which is deliberate: a published CLI must depend on the exact core it
     * was built and tested against. The release recipe bumps those two along
     * with the manifests. `apps/web` pins one too — and it was never in the
     * recipe, because it is not published, so nobody thought of it.
     *
     * npm honours an exact pin that does not match the workspace by installing
     * a **real copy from the registry** into `apps/web/node_modules`, which
     * shadows the workspace symlink. So the web app built, tested and type-
     * checked green against `@trazum/core@1.36.0` while the repository moved to
     * 1.46.0 — the fleet, the plan, verification, the series, the connector,
     * the store, the watch, the endpoint, the guard and `init`, all invisible
     * to the browser, with every check passing. Nothing was broken; the wrong
     * thing was being checked.
     *
     * The rule is one line and covers every workspace, published or not: if
     * you depend on this repository's core, you depend on *this* core.
     */
    const version = manifestOf('.').version;
    const roots = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).workspaces;
    const workspaces = roots.flatMap((pattern) => {
      const parent = pattern.replace(/\/\*$/, '');
      return readdirSync(join(repoRoot, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${parent}/${entry.name}`);
    });

    const wrong = [];
    for (const workspace of workspaces) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, workspace, 'package.json'), 'utf8'));
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const pinned = manifest[field]?.['@trazum/core'];
        if (pinned !== undefined && pinned !== version) {
          wrong.push(`${workspace} ${field} pins ${pinned}`);
        }
      }
    }
    assert.deepEqual(
      wrong,
      [],
      `these depend on a @trazum/core that is not this one (${version}), so they resolve a registry copy instead of the workspace`,
    );
  });

  it("the version RELEASES.md says is on npm is the version being published", () => {
    /**
     * **This claim was wrong for seventeen releases and nothing noticed.**
     *
     * The header of `RELEASES.md` is the first line a stranger reads about
     * what `npm install @trazum/cli` actually gives them, and it said 1.28.0
     * while the manifests moved to 1.45.0. Every other live claim in this
     * repository has a guard; this one had none, so it drifted the moment
     * somebody stopped hand-editing it — which is the whole argument this
     * product makes about numbers, failing inside the product's own notes.
     *
     * The rule is checkable because publication is not a separate decision:
     * `release.yml` publishes on the tag that the release PR's merge creates,
     * so the merge that makes the manifests say X is the merge that puts X on
     * the registry. Anyone reading `main` at X can install X. The two numbers
     * are the same number, or the file is lying.
     */
    const version = manifestOf('.').version;
    const claim = releases.match(/\*\*All three packages are on npm at ([0-9]+\.[0-9]+\.[0-9]+)\*\*/);
    assert.ok(
      claim,
      'RELEASES.md no longer states which version is on npm — if that is deliberate, delete this test rather than loosening it',
    );
    assert.equal(
      claim[1],
      version,
      `RELEASES.md says ${claim[1]} is on npm; the manifests publish ${version} on merge`,
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

  it('no file still says nothing is published, because it is', () => {
    /**
     * **This guard used to key on a git tag, and the first publish broke that.**
     *
     * The reasoning was sound and the proxy was not. `release.yml` publishes on
     * `v*.*.*` and nothing else, so "no tag" meant "nothing uploaded" — checkable
     * without a network call, which a test in CI should not need. But the *first*
     * publish could never go that way: a trusted publisher is configured on a
     * package's settings page, and that page does not exist until the package
     * does. So 1.8.0 went up by hand on 2026-08-13, no tag was pushed, and the
     * repository went on telling every visitor that nothing was installable while
     * three packages sat on the registry.
     *
     * That is the second time this claim has been wrong and the second signal to
     * fail. The first read "is there a `## X.Y.Z` heading in the changelog",
     * which is *a release cut here* rather than *a package on npm*.
     *
     * There is no third proxy. Publication is not reversible — npm allows
     * unpublishing for 72 hours and then the version is permanent — so "something
     * is published" is now a fact about the world that cannot go back to being
     * false. The honest assertion is the one-directional one: no file may claim
     * otherwise. If this project ever starts over under a new scope, delete this
     * test rather than inventing a fourth way to guess.
     */
    const claimants = {
      'RELEASES.md': releases,
      'README.md': readFileSync(join(repoRoot, 'README.md'), 'utf8'),
      'packages/core/README.md': readFileSync(join(repoRoot, 'packages/core/README.md'), 'utf8'),
      'packages/cli/README.md': readFileSync(join(repoRoot, 'packages/cli/README.md'), 'utf8'),
      'packages/mcp/README.md': readFileSync(join(repoRoot, 'packages/mcp/README.md'), 'utf8'),
    };

    for (const [name, text] of Object.entries(claimants)) {
      assert.doesNotMatch(
        text,
        /[Nn]ot(hing has been)? published yet|[Nn]ot on npm yet/,
        `${name} says nothing is published; @trazum/core has been on npm since 2026-08-13`,
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

describe('a privacy claim is a claim like any other', () => {
  /**
   * The README said prompts are **never stored on any server**, full stop, while
   * `trazum_prompt_versions.text` had been storing prompt text since the library
   * shipped. The library is off by default, so the sentence was true in the
   * configuration everybody develops in and false in the one an operator opts
   * into — the same shape as the Content-Security-Policy that blocked analytics
   * nobody had switched on, found the same day.
   *
   * It is worse than that one in a way worth naming: a broken policy breaks
   * visibly, eventually, to the operator who enabled it. A privacy sentence is
   * read once, by somebody deciding whether to trust the thing, and nothing ever
   * tells them it was wrong.
   *
   * So the claim is derived from the schema rather than trusted. Nothing here
   * asks whether the wording is *nice*; it asks whether the file that stores
   * prompts and the file that describes what is stored still agree.
   */
  const schemaDir = join(repoRoot, 'apps/web/db');

  /** Every `.sql` in the schema directory, concatenated. */
  const schema = readdirSync(schemaDir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(join(schemaDir, name), 'utf8'))
    .join('\n');

  /** The privacy section, and nothing after it. */
  const privacySection = () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    const start = readme.indexOf('## Analytics and privacy');
    assert.notEqual(start, -1, 'the privacy section has been renamed or removed');
    const next = readme.indexOf('\n## ', start + 1);
    return readme.slice(start, next === -1 ? undefined : next);
  };

  it('the schema still stores prompt text, which is what makes the claim conditional', () => {
    /**
     * Asserted rather than branched on. A conditional that skips when the
     * premise disappears is how a test goes quiet at the exact moment it had
     * something to say — if prompt text stops being persisted the claim can be
     * absolute again, and that should arrive as a failing test telling somebody
     * to simplify the README, not as silence.
     */
    const stores = /create table[^;]*prompt_versions[\s\S]*?\n\s+text\s+text\s+not null/.test(schema);
    assert.ok(
      stores,
      'no table stores prompt text any more — the README may state the absolute again, ' +
        'and this test should be deleted rather than made to pass',
    );
  });

  it('the privacy section does not claim prompts are never stored', () => {
    // The exact sentence that was wrong, and the reason it is matched literally:
    // it is short, quotable, and the one a reader carries away.
    const section = privacySection();
    assert.ok(
      !/never stored on any server[^.]*\./.test(section.replace(/^.*was wrong.*$/gm, '')),
      'the privacy section still states the unqualified claim',
    );
  });

  it('and names both configurations, because one of them does store them', () => {
    const section = privacySection();

    // Signed out: what the default actually is, and what switches it off.
    assert.match(section, /TRAZUM_GITHUB_CLIENT_ID/, 'the default configuration is not identified');
    // Signed in: the column, so the claim points at the thing rather than gesturing.
    assert.match(section, /trazum_prompt_versions/, 'the table that stores prompt text is not named');
    // Where the whole story lives.
    assert.match(section, /docs\/accounts\.md/, 'the section does not link the full account');
  });
});

describe('the publish preflight', () => {
  /**
   * The checks that would have caught 1.9.0 before it cost anything.
   *
   * That release was tagged, passed everything, and failed on the last step with
   * `E404 Not Found - PUT` because the trusted publisher had not been configured.
   * npm reports a write you are not authorised for as "not found", so the error
   * named the wrong problem. Nothing was published — but the tag was spent and
   * the release went out by hand, which means no provenance.
   *
   * Two questions, and they are gated differently on purpose. Whether a version
   * is already spent is read from the public registry API and is not a maybe, so
   * it fails the job. Whether npm will accept the OIDC token is read from npm's
   * internal token-exchange plumbing, so it only reports: a gate built on an
   * undocumented endpoint would one day block a release that would have worked,
   * which is worse than the failure it prevents.
   */

  const script = join(repoRoot, 'scripts/npm-publish-preflight.mjs');

  /**
   * The script against a registry under this test's control.
   *
   * `spawn` and not `spawnSync`, which is not a style preference: the fake
   * registry runs in this process, and `spawnSync` blocks the event loop, so the
   * server can never accept the connection the child is waiting on. Written that
   * way first and every test in here timed out at twenty seconds against a
   * script that works.
   */
  const run = async (mode, registry, env = {}) => {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [script, mode], {
      env: {
        ...process.env,
        TRAZUM_NPM_REGISTRY: registry,
        // Cleared so a real runner's credentials can never reach this test, and
        // so `auth` takes its no-token path unless a case supplies one.
        ACTIONS_ID_TOKEN_REQUEST_URL: '',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: '',
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));

    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`${mode} did not finish in 20s`));
      }, 20000);
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    return { status, stdout, stderr };
  };

  /** A registry that answers however the test needs, on a real socket. */
  const withRegistry = async (handler, body) => {
    const { createServer } = await import('node:http');
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      return await body(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  };

  it('passes when every version is free, and names all of them', async () => {
    const asked = [];
    const result = await withRegistry(
      (req, res) => {
        asked.push(req.url);
        res.writeHead(404).end('{}');
      },
      async (url) => await run('versions', url),
    );

    assert.equal(result.status, 0, result.stdout + result.stderr);

    // Derived from the root `workspaces` globs rather than a list typed in the
    // script — the failure mode every other guard in this file exists to avoid,
    // and the one that left `packages/mcp` unmentioned for a whole day.
    const publishable = PACKAGES.map((pkg) => manifestOf(pkg).name);
    assert.ok(publishable.length >= 3, 'fewer publishable packages than expected');
    for (const name of publishable) {
      assert.ok(
        // Decoded, because the scope slash reaches the wire as `%2f` and
        // asserting on the encoding would pin npm's spelling rather than ours.
        asked.some((path) => decodeURIComponent(path).includes(name)),
        `${name} was never checked against the registry`,
      );
    }
  });

  it('fails, and publishes nothing, when a version is already spent', async () => {
    // The expensive shape this prevents: core uploads, the CLI fails, and core's
    // number is gone. npm never reuses a version, so the whole set has to move.
    const taken = manifestOf('packages/core').name;
    const result = await withRegistry(
      (req, res) => {
        if (decodeURIComponent(req.url).includes(taken)) res.writeHead(200).end('{"version":"x"}');
        else res.writeHead(404).end('{}');
      },
      async (url) => await run('versions', url),
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::/);
    assert.match(result.stdout, new RegExp(taken.replace('/', '\\/')));
  });

  it('tells a finished release apart from a collision, and skips rather than failing', async () => {
    /**
     * Every version already on the registry is a release that shipped and is
     * missing only its tag. 1.10.0 was exactly that: the trusted publisher
     * refused this workflow three tags running, the packages went out by hand,
     * and the tag was the last thing left.
     *
     * Failing there would have refused the GitHub release for a version already
     * installable — and the failure step would then have printed the
     * authentication diagnosis, sending the reader to fix credentials that were
     * not the problem. A confident wrong diagnosis costs more than none.
     *
     * So it passes, tells the workflow not to publish, and says out loud that
     * those tarballs carry no provenance: provenance is signed by whatever
     * uploads, and this workflow did not.
     */
    const { mkdtempSync, readFileSync: read } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = join(mkdtempSync(join(tmpdir(), 'trazum-output-')), 'output.txt');

    const result = await withRegistry(
      (_req, res) => res.writeHead(200).end('{"version":"x"}'),
      async (url) => await run('versions', url, { GITHUB_OUTPUT: outputPath }),
    );

    assert.equal(result.status, 0, `a finished release was treated as a collision: ${result.stdout}`);
    assert.equal(read(outputPath, 'utf8').trim(), 'publish=false');
    assert.match(result.stdout, /NO provenance/, 'skipped the upload without saying the tarballs are unattested');
  });

  it('never tells the workflow to publish over a half-finished release', async () => {
    /**
     * The dangerous shape, and the reason the skip above is gated on *every*
     * version being taken rather than any. Some spent and some free means an
     * earlier run uploaded part of the set and died — those numbers are gone for
     * good, npm never reuses one, and publishing the remainder would ship a
     * release whose packages disagree about what version they are.
     *
     * Asserting on the absence of `publish=true` and not only on the exit code:
     * an output written before the failure would leave the workflow's condition
     * true while the step went red, which is the one combination that publishes
     * anyway.
     */
    const { mkdtempSync, readFileSync: read, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = join(mkdtempSync(join(tmpdir(), 'trazum-output-')), 'output.txt');

    const taken = manifestOf('packages/core').name;
    const result = await withRegistry(
      (req, res) => {
        if (decodeURIComponent(req.url).includes(taken)) res.writeHead(200).end('{"version":"x"}');
        else res.writeHead(404).end('{}');
      },
      async (url) => await run('versions', url, { GITHUB_OUTPUT: outputPath }),
    );

    assert.equal(result.status, 1, 'a half-finished release was allowed through');
    const written = existsSync(outputPath) ? read(outputPath, 'utf8') : '';
    assert.doesNotMatch(written, /publish=true/, 'told the workflow to publish over a spent version');
  });

  it('clears the workflow to publish when every version is free', async () => {
    const { mkdtempSync, readFileSync: read } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const outputPath = join(mkdtempSync(join(tmpdir(), 'trazum-output-')), 'output.txt');

    const result = await withRegistry(
      (_req, res) => res.writeHead(404).end('{}'),
      async (url) => await run('versions', url, { GITHUB_OUTPUT: outputPath }),
    );

    assert.equal(result.status, 0, result.stdout);
    assert.equal(read(outputPath, 'utf8').trim(), 'publish=true');
  });

  it('treats an unreachable registry as unknown, never as free', async () => {
    /**
     * The direction that matters. A registry that will not answer is not
     * evidence a version is available, and publishing on that assumption is the
     * mistake this whole file exists to prevent — so a 500 fails the job exactly
     * as a taken version does.
     */
    const result = await withRegistry(
      (_req, res) => res.writeHead(500).end('nope'),
      async (url) => await run('versions', url),
    );

    assert.equal(result.status, 1, 'a broken registry was treated as permission to publish');
    assert.match(result.stdout, /Could not check/);
  });

  it('the auth check reports and never fails the job', async () => {
    /**
     * Deliberate, and the comment in the script argues it at length: the
     * exchange endpoint is npm's internal plumbing. If npm moves it, a gate
     * would block releases that would have worked. It reports; the upload is
     * still the authority.
     *
     * Both paths asserted — no OIDC token available, and a registry refusing
     * the exchange — because "never fails" is the property, not "never fails
     * for the reason I happened to test".
     */
    const noToken = await withRegistry(
      (_req, res) => res.writeHead(404).end('{}'),
      async (url) => await run('auth', url),
    );
    assert.equal(noToken.status, 0, 'a missing OIDC token failed the job');
    assert.match(noToken.stdout, /::warning::/, 'it failed quietly instead of reporting');

    const refused = await withRegistry(
      (req, res) => {
        // Stand in for the runner's token endpoint and for npm, in one server.
        if (req.url.includes('audience=')) res.writeHead(200).end('{"value":"a.b.c"}');
        else res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
        }),
    );
    assert.equal(refused.status, 0, 'npm refusing the token failed the job');
    assert.match(refused.stdout, /::warning::/);
    // The message has to name the field people actually leave blank.
    assert.match(refused.stdout, /environment/i);
  });

  it('and says so plainly when npm accepts the token', async () => {
    // The green case is the one that answers the open question in a dry run, so
    // it needs to be unmistakable rather than silence.
    const accepted = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) res.writeHead(200).end('{"value":"a.b.c"}');
        else res.writeHead(200).end('{"token":"npm_shortlived"}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
        }),
    );

    assert.equal(accepted.status, 0);
    assert.match(accepted.stdout, /::notice::/);
    assert.doesNotMatch(accepted.stdout, /::warning::/, 'it warned about a working configuration');
  });

  it('names which packages are configured when only some of them are', async () => {
    /**
     * The reason this stopped asking about one package. It checked the first
     * name alphabetically on the reasoning that a misconfiguration is
     * all-or-nothing — and it is not: the trusted publisher is set per package,
     * on three separate settings pages, so doing two of them is the easiest
     * mistake available.
     *
     * Reporting `@trazum/cli` while saying nothing about the others answers the
     * wrong question, and the release publishes core first, so the package that
     * actually fails need not be the one that was asked about.
     */
    const configured = manifestOf('packages/core').name;
    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) return res.writeHead(200).end('{"value":"a.b.c"}');
        const forConfigured = decodeURIComponent(req.url).includes(configured);
        if (forConfigured) res.writeHead(200).end('{"token":"npm_shortlived"}');
        else res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
        }),
    );

    assert.equal(result.status, 0, 'a partial configuration failed the job');

    // Every package accounted for, not just the one that was asked about.
    for (const pkg of PACKAGES) {
      assert.match(
        result.stdout,
        new RegExp(manifestOf(pkg).name.replace('/', '\\/')),
        `${pkg} is missing from the report`,
      );
    }

    // And the message has to say that the setting is per package, or the reader
    // fixes the one it named and tags again into the same failure.
    assert.match(result.stdout, /::warning::/);
    assert.match(result.stdout, /per\s+package/i, 'it does not say the setting is per package');
  });

  it('reports what npm must match from this run, and never the token', async () => {
    /**
     * The diagnosis has to name a field, not a category — "a claim does not
     * match" leaves the reader comparing four settings against nothing.
     *
     * But the values printed come from **this run's environment**, not from the
     * token, which is the second thing CodeQL was right about. Sanitising the
     * claim strings addressed how they could rearrange a rendered summary and not
     * the plainer fact underneath: a value fetched over HTTP was being written to
     * a file. `GITHUB_REPOSITORY` answers "what is this job" from the runner; the
     * token is a statement about it made elsewhere, and it is reduced to one
     * computed word.
     *
     * So this asserts three things: the expected values are reported, a
     * disagreement is still visible, and nothing the token said is quoted.
     */
    const claims = {
      repository: 'Davmunrey/Trazum',
      repository_owner: 'Davmunrey',
      // Deliberately not what the environment below says, so `DIFFERS` is exercised.
      workflow_ref: 'Davmunrey/Trazum/.github/workflows/SOMETHING-ELSE.yml@refs/heads/main',
      // Absent on purpose: it appears only when the job declares an environment,
      // and that absence against a rule requiring one is the likeliest cause of
      // the refusal this block exists to explain.
      a_secret_looking_claim: 'must-not-be-printed',
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const token = `header.${payload}.signature`;

    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) {
          return res.writeHead(200).end(JSON.stringify({ value: token }));
        }
        res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
          GITHUB_REPOSITORY: 'Davmunrey/Trazum',
          GITHUB_REPOSITORY_OWNER: 'Davmunrey',
          GITHUB_WORKFLOW_REF: 'Davmunrey/Trazum/.github/workflows/release.yml@refs/heads/main',
        }),
    );

    assert.equal(result.status, 0);

    // What to type into npm, sourced from the runner.
    assert.match(result.stdout, /Repository: Davmunrey\/Trazum/, 'the repository to configure is not named');
    assert.match(result.stdout, /release\.yml/, 'the workflow to configure is not named');

    // The token agreeing and disagreeing are both visible, as one word each.
    assert.match(result.stdout, /token agrees/, 'agreement is not reported');
    assert.match(result.stdout, /DIFFERS/, 'a disagreeing claim is not flagged');
    assert.match(result.stdout, /ABSENT/, 'an absent environment claim is not called out');

    const printed = result.stdout + result.stderr;
    // Nothing the token said is quoted — not the off-list claim, and not the
    // disagreeing value whose text would otherwise be the obvious thing to show.
    assert.doesNotMatch(printed, /must-not-be-printed/, 'an off-list claim was printed');
    assert.doesNotMatch(printed, /SOMETHING-ELSE/, 'a claim value from the token was quoted');
    assert.ok(!printed.includes(token), 'it printed the OIDC token itself');
    assert.ok(!printed.includes(payload), 'it printed the raw token payload');
  });
  it('refuses to build a URL out of a manifest that does not look like one', async () => {
    /**
     * CodeQL raised this and was right to: both halves of every URL here come
     * out of a file, and a manifest is trusted by convention rather than by
     * anything enforced — it is whatever is on disk when the release runs. This
     * script turns those values into a request to a host that holds publish
     * rights, so they are checked at the boundary, the same way
     * `checkedEndpoint` checks an LLM endpoint in `net.ts`.
     *
     * Driven through the real script with a real manifest rather than by
     * importing the regex, because the property is "a bad name never reaches
     * the network", and a test that asserts the pattern would still pass if
     * nothing called it.
     */
    const { mkdtempSync, writeFileSync, mkdirSync, cpSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');

    const cases = [
      ['a name that escapes its path segment', { name: '@trazum/core/../../evil', version: '1.0.0' }],
      ['a name that is a whole URL', { name: 'https://evil.example/x', version: '1.0.0' }],
      ['a version that is a path', { name: '@trazum/core', version: '../../etc/passwd' }],
      ['a version that is not one', { name: '@trazum/core', version: 'latest' }],
    ];

    for (const [label, manifest] of cases) {
      // A whole fake repository, so the script reads these values the way it
      // reads the real ones rather than through a seam built for the test.
      const root = mkdtempSync(join(tmpdir(), 'trazum-preflight-'));
      mkdirSync(join(root, 'packages', 'one'), { recursive: true });
      mkdirSync(join(root, 'scripts'), { recursive: true });
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'root', version: '1.0.0', workspaces: ['packages/*'] }),
      );
      writeFileSync(
        join(root, 'packages', 'one', 'package.json'),
        JSON.stringify({ ...manifest, publishConfig: { access: 'public' } }),
      );
      cpSync(script, join(root, 'scripts', 'npm-publish-preflight.mjs'));

      const child = spawnSync(process.execPath, [join(root, 'scripts/npm-publish-preflight.mjs'), 'versions'], {
        encoding: 'utf8',
        timeout: 20000,
        // A registry that would answer, so a pass here would mean the value
        // genuinely reached the network rather than the request merely failing.
        env: { ...process.env, TRAZUM_NPM_REGISTRY: 'https://registry.npmjs.org' },
      });

      assert.notEqual(child.status, 0, `${label} was accepted`);
      assert.match(child.stderr, /implausible (package name|version)/, `${label}: wrong refusal`);
      assert.equal(child.stdout, '', `${label} produced output before refusing`);
    }
  });

  it('writes its verdict where it can actually be read', async () => {
    /**
     * Found the hard way. This step runs before `verify`, which then prints
     * thousands of lines of TAP output — so the verdicts and the claims, the
     * whole point of the diagnostic, sit above a wall of test results. The logs
     * API returns the *tail* of a job, and thirty thousand lines of it still did
     * not reach this step. The first real refusal could not be diagnosed because
     * the diagnosis was unreachable.
     *
     * The job summary is a separate document, so it is written there too.
     */
    const { mkdtempSync, readFileSync: read } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const summaryPath = join(mkdtempSync(join(tmpdir(), 'trazum-summary-')), 'summary.md');

    await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) return res.writeHead(200).end('{"value":"a.b.c"}');
        res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
          GITHUB_STEP_SUMMARY: summaryPath,
        }),
    );

    const written = read(summaryPath, 'utf8');
    for (const pkg of PACKAGES) {
      assert.ok(written.includes(manifestOf(pkg).name), `${pkg} is missing from the summary`);
    }
    assert.match(written, /rejected/, 'the summary does not carry the verdict');
  });

  it('is honest about its own standing without talking down its finding', async () => {
    /**
     * The endpoint is undocumented, so the check says so — but the caveat used to
     * close with "believe your settings over this check", and that was wrong the
     * one time anything tested it. v1.9.1 was tagged against settings that had
     * just been filled in; the check said rejected; the publish failed the same
     * way, twice.
     *
     * A caveat that talks the reader out of a true finding is worse than no
     * caveat. It records that it has been right once and asks to be believed
     * until it is not.
     */
    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) return res.writeHead(200).end('{"value":"a.b.c"}');
        res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
        }),
    );

    assert.match(result.stdout, /does not document/, 'it does not admit the endpoint is undocumented');
    /**
     * It used to close with "believe your settings over this check", and that
     * advice was wrong the one time it was tested: v1.9.1 was tagged against
     * settings that had just been filled in, the check said rejected, and the
     * publish failed the same way. A caveat that talks the reader out of a true
     * finding is worse than no caveat.
     */
    assert.match(result.stdout, /until it is wrong/, 'it still argues against its own finding');
    assert.doesNotMatch(result.stdout, /believe your settings/, 'the disproved advice is back');
  });

  it('a claim cannot rearrange the summary it is written into', async () => {
    /**
     * CodeQL's third finding on this script, and the same class as the first two:
     * a value that arrives over the network reaching somewhere it can do more
     * than be read. The job summary is *rendered markdown*, and the claims are
     * decoded from a JWT fetched from the runner's token endpoint — so a claim
     * carrying a backtick fence closes the code block it was meant to sit inside
     * and everything after it renders as page rather than as data.
     *
     * A garbled summary is the mild version. One that reads as if it says
     * something it does not is the reason to bother.
     */
    const { mkdtempSync, readFileSync: read } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const summaryPath = join(mkdtempSync(join(tmpdir(), 'trazum-claim-')), 'summary.md');

    const hostile = '```\n\n## Everything is fine\n\n<script>alert(1)</script>';
    const payload = Buffer.from(
      JSON.stringify({ repository: hostile, workflow_ref: 'a'.repeat(500), environment: 'release' }),
    ).toString('base64url');

    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) {
          return res.writeHead(200).end(JSON.stringify({ value: `h.${payload}.s` }));
        }
        res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
          GITHUB_STEP_SUMMARY: summaryPath,
        }),
    );

    assert.equal(result.status, 0);
    const written = read(summaryPath, 'utf8');

    /**
     * The invariant, not a sample of it.
     *
     * This asserted `doesNotMatch(/<script>/)` first, and CodeQL was right to
     * call that a bad filter: it pins one spelling of one payload, so it would
     * pass against `<SCRIPT>` and against every other thing a hostile value
     * could open. The property is that **nothing the token said reaches the
     * summary at all** — the block is built from this run's environment and
     * one-word verdicts — so the check is for the characters that could
     * restructure the document, whatever they spell.
     */
    assert.doesNotMatch(written, /[<>]/, 'the summary contains markup characters');
    assert.doesNotMatch(written, /Everything is fine/, 'a claim reached the summary');
    assert.equal(
      (written.match(/```/g) ?? []).length % 2,
      0,
      'the summary has an unbalanced code fence',
    );
  });

  it('writes no value that arrived over the network', async () => {
    /**
     * The finding CodeQL raised twice, and the second time after a fix that had
     * only addressed the claims. The summary is a document this script composes;
     * every word in it should be one this file chose.
     *
     * A status npm invents is the case that slipped through — `rejected (599)`
     * interpolates a number from a response into a rendered file. Narrowing it to
     * an integer was not enough and should not have been: the flow is the
     * finding, not the shape of the value.
     */
    const { mkdtempSync, readFileSync: read } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const summaryPath = join(mkdtempSync(join(tmpdir(), 'trazum-net-')), 'summary.md');

    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) return res.writeHead(200).end('{"value":"a.b.c"}');
        // A status outside every case the script names, so an interpolated one
        // would be unmistakable in the file.
        res.writeHead(599).end('{}');
      },
      async (url) =>
        await run('auth', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
          GITHUB_STEP_SUMMARY: summaryPath,
        }),
    );

    assert.equal(result.status, 0);
    const written = read(summaryPath, 'utf8');
    assert.doesNotMatch(written, /599/, "npm's status code was written into the summary");
    assert.match(written, /unknown/, 'the summary does not report the outcome at all');
    // It is still diagnosable — the number reaches the log, which is not a
    // document this script is composing.
    assert.match(result.stdout, /599/, 'the status is nowhere, so nobody can diagnose it');
  });

  it('repeats the diagnosis at the end of a failed job', async () => {
    /**
     * The auth check runs before `verify`, and `verify` prints thousands of lines
     * after it. GitHub's logs API returns the tail of a job, so this diagnosis was
     * unreachable **three separate times while a release was actually failing** —
     * once when the preflight first reported a refusal, and twice more during
     * v1.9.1. The job summary fixed it for anyone on the run page and not for
     * anyone reading the log, which is where a failure gets read.
     *
     * So the failure step repeats it. A diagnosis printed where the reader is not
     * looking is the same as no diagnosis.
     */
    const payload = Buffer.from(JSON.stringify({ repository: 'Davmunrey/Trazum' })).toString(
      'base64url',
    );
    const result = await withRegistry(
      (req, res) => {
        if (req.url.includes('audience=')) {
          return res.writeHead(200).end(JSON.stringify({ value: `h.${payload}.s` }));
        }
        res.writeHead(404).end('{}');
      },
      async (url) =>
        await run('claims', url, {
          ACTIONS_ID_TOKEN_REQUEST_URL: `${url}/token?x=1`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner',
          GITHUB_REPOSITORY: 'Davmunrey/Trazum',
        }),
    );

    assert.equal(result.status, 0, 'the claims mode failed the job it is diagnosing');
    assert.match(result.stdout, /npm must match/, 'it printed no diagnosis');
    assert.match(result.stdout, /Davmunrey\/Trazum/, 'it did not name what to configure');
  });

  it('the failure step prints the diagnosis where the log tail reaches', () => {
    const release = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');
    const failureStep = release.slice(release.indexOf('if: failure()'));
    assert.match(
      failureStep.slice(0, 1200),
      /preflight\.mjs claims/,
      'the failure step explains the error and not what to compare it against',
    );
  });

  it('the release workflow runs both, gated the way each needs', () => {
    const release = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');
    const steps = release.split(/^      - /m);

    const authStep = steps.find((s) => /preflight\.mjs auth/.test(s));
    const versionStep = steps.find((s) => /preflight\.mjs versions/.test(s));

    assert.ok(authStep, 'the release does not check whether it can authenticate');
    assert.ok(versionStep, 'the release does not check whether a version is spent');

    // The auth check has to run on `workflow_dispatch` too, or the open question
    // stays open: before this, a dry run proved the environment gate existed and
    // nothing about npm, so testing a trusted publisher cost a version number.
    assert.doesNotMatch(
      authStep,
      /if:\s*startsWith\(github\.ref/,
      'the auth check is tag-gated, so a dry run still cannot answer it',
    );

    // The version check must run before anything is uploaded, or it is a
    // post-mortem rather than a preflight. It runs on every push — a tag or a
    // merge to main — because both can publish now; only the dry run skips it.
    assert.match(versionStep, /if:\s*github\.event_name == 'push'/);
    assert.ok(
      release.indexOf('preflight.mjs versions') < release.indexOf('run: npm publish'),
      'the version check runs after a publish, which is not a preflight',
    );

    // And the failure note, because npm's 404 names the wrong problem.
    assert.match(release, /if:\s*failure\(\)/, 'nothing explains a failed publish');
    assert.match(release, /E404/, 'the failure note does not name the error it explains');
  });
});
