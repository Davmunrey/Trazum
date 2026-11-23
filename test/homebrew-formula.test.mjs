import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  EXACT,
  FORMULA_PATH,
  MIN_RELEASE_AGE_MS,
  ROOT,
  formula,
  formulaFromTarball,
  readFormula,
  registryDocumentUrl,
  sha256Of,
  tarballUrl,
  tooYoung,
} from '../scripts/homebrew-formula.mjs';

/**
 * The Homebrew formula (#781) is generated from a tarball and held to it.
 *
 * No test here reaches a network. The fixture is a 193-byte tarball made for
 * the purpose, `test/fixtures/cli-9.9.9.tgz`, and its digest below was taken
 * from `sha256sum` and written down, not computed by the code under test: a
 * script that hashed the wrong thing would agree with itself.
 */

const FIXTURE = join(ROOT, 'test/fixtures/cli-9.9.9.tgz');
const FIXTURE_SHA256 = '59eca0c5163fbbf39d445824a21b7d31db4bf0bd3e04a36fbed93ab9f3534093';
const committed = readFileSync(join(ROOT, FORMULA_PATH), 'utf8');
const cliVersion = JSON.parse(readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8')).version;

const older = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let at = 0; at < 3; at++) if (x[at] !== y[at]) return x[at] < y[at];
  return false;
};

describe('the formula the script writes from a tarball', () => {
  it('states the version and the digest of the tarball it was given', () => {
    const bytes = readFileSync(FIXTURE);
    assert.equal(sha256Of(bytes), FIXTURE_SHA256, 'the fixture is not the file whose digest is written here');
    const text = formulaFromTarball({ version: '9.9.9', bytes });
    assert.deepEqual(readFormula(text), { url: 'https://registry.npmjs.org/@trazum/cli/-/cli-9.9.9.tgz', sha256: FIXTURE_SHA256, version: '9.9.9' });
  });

  it('follows the pattern docs.brew.sh gives an npm CLI: Homebrew\'s node, std_npm_args, the executables linked', () => {
    const text = formula({ version: '9.9.9', sha256: FIXTURE_SHA256 });
    assert.match(text, /^ {2}depends_on "node"$/m);
    assert.match(text, /^ {4}system "npm", "install", \*std_npm_args$/m);
    assert.match(text, /^ {4}bin\.install_symlink libexec\.glob\("bin\/\*"\)$/m);
    assert.match(text, /assert_match version\.to_s, shell_output\("#\{bin\}\/trazum --version"\)/);
    assert.doesNotMatch(text, /ignore_scripts: false/, 'install scripts were switched back on');
  });

  it('is the same bytes every time', () => {
    assert.equal(formula({ version: '9.9.9', sha256: FIXTURE_SHA256 }), formula({ version: '9.9.9', sha256: FIXTURE_SHA256 }));
  });

  it('refuses a version that is not three plain numbers, so nothing floating reaches the url', () => {
    for (const version of ['latest', 'next', '^2.7.12', '~2.7', '2.7', '2.7.12-beta.1', '2.7.x', '', '2.7.12 ']) {
      assert.throws(() => formula({ version, sha256: FIXTURE_SHA256 }), /not an exact version/, JSON.stringify(version));
    }
  });

  it('refuses a digest that is not a SHA-256', () => {
    for (const sha256 of ['', 'abc', FIXTURE_SHA256.toUpperCase(), `${FIXTURE_SHA256}0`, 'sha256-xyz']) {
      assert.throws(() => formula({ version: '9.9.9', sha256 }), /not a SHA-256 digest/, JSON.stringify(sha256));
    }
  });

  it('writes the address from the version, so the two cannot disagree', () => {
    assert.equal(tarballUrl('2.7.12'), 'https://registry.npmjs.org/@trazum/cli/-/cli-2.7.12.tgz');
  });
});

/**
 * The digest of each tarball the formula has named, taken from `sha256sum` on
 * the file npm served and written here by hand: the second entry of a double
 * entry. The script computes the digest from the bytes and cannot be checked
 * against itself, and no test here has a network, so this is what a formula
 * whose digest is not its tarball's fails against. A release that updates the
 * formula adds its line, from `sha256sum` on the tarball it fetched.
 */
const SERVED = {
  '2.7.12': '0a75291b4e6099bd7c44e3732d53ace96da18a4b1c5192040490eda2aebfd510',
  '3.0.0': 'd334f005d3d4eaad49ed1c89722246bfcb25a1e2c43a62d04811b303150d8fea',
  '3.0.1': '59eb2a96c430896ba55000a6004f19eac1c30c00ea107f999ebe5e6e1c39079a',
  '3.0.6': 'ed292e75551e41ffca34b02378dadf96fe362c61cd8c684a48a786de1ea974fc',
};

describe('the formula in this repository', () => {
  const facts = readFormula(committed);

  it('names an exact version, the registry address of that version, and a digest', () => {
    assert.match(facts.version ?? '', EXACT, 'no exact version in the url');
    assert.equal(facts.url, tarballUrl(facts.version));
    assert.match(facts.sha256 ?? '', /^[0-9a-f]{64}$/);
  });

  it('carries the digest of the tarball npm served for that version, as sha256sum read it', () => {
    assert.ok(SERVED[facts.version], `no digest is written down for ${facts.version}: take it from sha256sum on the tarball npm serves, and add it to SERVED`);
    assert.equal(facts.sha256, SERVED[facts.version], 'the formula names a digest that is not the tarball\'s');
  });

  it('is what the script writes for that version and that digest, so nobody edited it', () => {
    assert.equal(committed, formula({ version: facts.version, sha256: facts.sha256 }));
  });

  it('is not ahead of the CLI this repository is at: it names a version npm already served', () => {
    /*
      The formula needs a published tarball to hash, so it can be behind the
      manifests (a release PR bumps them before npm has the version) and never
      ahead of them.
    */
    assert.ok(!older(cliVersion, facts.version), `the formula names ${facts.version}, which this repository has not reached (${cliVersion})`);
  });

  it('floats nowhere: no latest, no tag, no range, no head, no branch', () => {
    assert.doesNotMatch(committed, /latest|\bhead\b|\bbranch\b|\btag\b|@\^|@~|\bnext\b/i);
    assert.doesNotMatch(committed, /\bversion "/, 'a version line would override the one the url carries');
  });

  it('is Ruby, as far as Ruby will say without Homebrew', (context) => {
    try {
      execFileSync('ruby', ['-c', join(ROOT, FORMULA_PATH)], { stdio: 'pipe' });
    } catch (error) {
      if (error.code === 'ENOENT') return context.skip('no ruby on this machine');
      throw error;
    }
  });
});

describe("the formula waits for npm's packages to be a day old", () => {
  /*
    On 2026-11-19 `brew install davmunrey/trazum/trazum` failed on a Mac with
    "No matching version found for @trazum/core@3.0.1 with a date before ...":
    Homebrew's std_npm_args pass --min-release-age=1, and the tap had moved to a
    version npm had published seven hours earlier. The script now refuses until
    every package the install resolves from npm is a day old.
  */
  const cli = { name: '@trazum/cli', version: '3.0.1', time: '2026-11-19T11:01:10.518Z' };
  const core = { name: '@trazum/core', version: '3.0.1', time: '2026-11-19T11:01:56.703Z' };

  it('is a day, as Homebrew passes it', () => {
    assert.equal(MIN_RELEASE_AGE_MS, 86_400_000);
  });

  it('refuses while the youngest package is under a day old, naming it and the moment it may', () => {
    const refusal = tooYoung([cli, core], Date.parse('2026-11-19T18:28:47Z'));
    assert.match(refusal, /@trazum\/core@3\.0\.1 was published at 2026-11-19T11:01:56\.703Z/);
    assert.match(refusal, /cannot install before 2026-11-20T11:01:56\.703Z/);
  });

  it('refuses one millisecond before the day is up, and allows it at the mark', () => {
    const mark = Date.parse(core.time) + MIN_RELEASE_AGE_MS;
    assert.notEqual(tooYoung([cli, core], mark - 1), null);
    assert.equal(tooYoung([cli, core], mark), null);
  });

  it('refuses a package npm gives no time for, rather than guessing its age', () => {
    assert.match(tooYoung([cli, { ...core, time: undefined }], Date.parse('2027-01-01T00:00:00Z')), /no publish time for @trazum\/core@3\.0\.1/);
  });
});

describe("the registry document a package's age is read from", () => {
  it('is the scoped name, escaped, on the registry itself', () => {
    assert.equal(registryDocumentUrl('@trazum/core').href, 'https://registry.npmjs.org/@trazum%2fcore');
  });

  it('refuses a name that is not one of this project, or that could leave the registry', () => {
    for (const name of ['left-pad', '@evil/core', '@trazum/../x', '@trazum/core/../../x', '//evil.example/x', '@trazum/', '@trazum/Core']) {
      assert.throws(() => registryDocumentUrl(name), /not a package of this project/, name);
    }
  });
});
