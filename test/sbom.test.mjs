import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { buildSbom, checkSbom, hashesOf, licensesOf, purlOf, REPO_ROOT, workspacesOf } from '../scripts/sbom.mjs';

/**
 * The software bill of materials attached to every release (OWASP ASVS 4.0.3
 * 14.2.5), made here on every pull request so that it cannot break unnoticed
 * between releases.
 *
 * `scripts/sbom.mjs` walks the lockfile itself rather than calling
 * `npm sbom --omit dev`, because that command leaves out runtime packages a
 * development dependency shares. Both npm commands are therefore the
 * independent witness here: everything `npm ls --omit dev` finds installed, and
 * everything `npm sbom` lists, has to be in this one.
 */

const PATH = 'cdx:npm:package:path';
const pathsOf = (bom) =>
  new Set(bom.components.flatMap((c) => c.properties.filter((p) => p.name === PATH).map((p) => p.value)));
const byRef = (bom) => new Map(bom.components.map((c) => [c['bom-ref'], c]));
const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')).packages;
const scratch = mkdtempSync(join(tmpdir(), 'trazum-sbom-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('the bill of materials for this repository', () => {
  const bom = buildSbom();

  it('checks clean, and holds every workspace and more than a hundred packages', () => {
    assert.deepEqual(checkSbom(bom), []);
    const workspaces = workspacesOf();
    assert.ok(workspaces.length >= 6, `only ${workspaces.length} workspaces: has the layout changed?`);
    for (const path of workspaces) assert.ok(pathsOf(bom).has(path), `${path} is missing`);
    assert.ok(bom.components.length > 100, `only ${bom.components.length} components`);
  });

  it('is the same document every time, apart from its serial number and its time', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const serial = '00000000-0000-4000-8000-000000000000';
    assert.deepEqual(buildSbom({ now, serial }), buildSbom({ now, serial }));
  });

  it('lists every package `npm ls --omit dev` finds installed', () => {
    // npm ls exits 1 over an extraneous package, so its status says nothing
    // here; its output does.
    const listed = spawnSync('npm', ['ls', '--all', '--omit', 'dev', '--parseable'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).stdout.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${REPO_ROOT}/`))
      .map((line) => line.slice(REPO_ROOT.length + 1));
    assert.ok(listed.length > 100, `npm ls found only ${listed.length} packages: is node_modules installed?`);
    const ours = pathsOf(bom);
    // A workspace appears to npm ls as its link under node_modules.
    const missing = listed.map((path) => (lock[path]?.link ? lock[path].resolved : path)).filter((path) => !ours.has(path));
    assert.deepEqual(missing, [], 'installed for run time and not in the bill');
  });

  it('lists every package `npm sbom` lists, the same way, and the ones it misses', () => {
    const theirs = JSON.parse(
      execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev', '--package-lock-only', '--workspaces'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    const ours = byRef(bom);
    const workspaces = new Set(workspacesOf());
    let compared = 0;
    for (const component of theirs.components) {
      const path = component.properties?.find((p) => p.name === PATH)?.value;
      if (workspaces.has(path)) continue;
      const mine = ours.get(component['bom-ref']);
      assert.ok(mine, `npm sbom lists ${component['bom-ref']} and this bill does not`);
      for (const field of ['version', 'purl', 'licenses', 'hashes']) {
        assert.deepEqual(mine[field], component[field], `${component['bom-ref']}: ${field} differs from npm's`);
      }
      compared += 1;
    }
    assert.ok(compared > 100, `only ${compared} packages compared`);
    // What npm sbom 10.9 leaves out on this tree although a runtime package
    // needs it: Next requires postcss, and Radix's aria-hidden requires tslib.
    for (const name of ['postcss', 'tslib']) {
      assert.ok(
        bom.components.some((c) => c.name === name && c.scope === 'required'),
        `${name} is needed at run time and missing`,
      );
    }
  });

  it('leaves out what only development needs', () => {
    for (const name of ['typescript', 'tailwindcss', '@types/node']) {
      assert.ok(!bom.components.some((c) => (c.group ? `${c.group}/${c.name}` : c.name) === name), `${name} is listed`);
    }
    for (const path of pathsOf(bom)) assert.notEqual(lock[path]?.dev, true, `${path} is development only`);
  });

  it('marks each platform binary optional and what the app always loads required', () => {
    const scope = (full) => bom.components.find((c) => (c.group ? `${c.group}/${c.name}` : c.name) === full)?.scope;
    for (const name of ['next', 'react', 'react-dom', 'postgres', 'js-tiktoken']) assert.equal(scope(name), 'required', name);
    const binaries = bom.components.filter((c) => c.group === '@next' && c.name.startsWith('swc-'));
    assert.ok(binaries.length >= 2, 'no compiler binaries listed');
    for (const c of binaries) assert.equal(c.scope, 'optional', `${c.group}/${c.name}`);
  });

  it('names a published package by its purl and a private workspace by none', () => {
    const ours = byRef(bom);
    const core = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/core/package.json'), 'utf8'));
    assert.equal(ours.get(`@trazum/core@${core.version}`).purl, `pkg:npm/%40trazum/core@${core.version}`);
    const web = JSON.parse(readFileSync(join(REPO_ROOT, 'apps/web/package.json'), 'utf8'));
    assert.equal(ours.get(`@trazum/web@${web.version}`).purl, undefined);
  });
});

describe('the lockfile walk, on a lockfile made for the purpose', () => {
  const root = join(scratch, 'fixture');
  const sha = (text) => `sha512-${Buffer.from(text.padEnd(64, '.')).toString('base64')}`;
  const pkg = (version, extra = {}) => ({
    version,
    resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`,
    integrity: sha(version),
    license: 'MIT',
    ...extra,
  });
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(value, null, 2));
  };
  const a = {
    name: '@fx/a',
    version: '1.0.0',
    license: 'MIT',
    dependencies: { x: '^1', 'alias-y': 'npm:y@^3' },
    optionalDependencies: { bin: '1' },
    devDependencies: { tool: '1' },
  };
  // b reaches m first as an optional dependency and only later as k's plain
  // one, so m, and n beneath it, have to be walked again as required.
  const b = {
    name: 'b',
    version: '1.0.0',
    license: 'ISC',
    private: true,
    dependencies: { '@fx/a': '1.0.0', k: '1' },
    optionalDependencies: { m: '1' },
  };
  const packages = {
    '': { name: 'fixture', version: '1.0.0', workspaces: ['packages/*'] },
    'packages/a': a,
    'packages/b': b,
    'node_modules/@fx/a': { resolved: 'packages/a', link: true },
    'node_modules/b': { resolved: 'packages/b', link: true },
    // x needs y ^2, so it gets its own copy rather than the hoisted y 1, which
    // only a development tool uses.
    'node_modules/x': pkg('1.2.0', { dependencies: { y: '^2', z: '1' }, peerDependencies: { p: '*', q: '*' }, peerDependenciesMeta: { q: { optional: true } } }),
    'node_modules/x/node_modules/y': pkg('2.0.0'),
    'node_modules/y': pkg('1.0.0', { dev: true }),
    'node_modules/alias-y': pkg('3.0.0', { name: 'y' }),
    'node_modules/p': pkg('1.0.0'),
    'node_modules/bin': pkg('1.0.0', { optional: true, dependencies: { z: '1', w: '1' } }),
    'node_modules/z': pkg('1.0.0'),
    'node_modules/w': pkg('1.0.0', { optional: true }),
    'node_modules/tool': pkg('1.0.0', { dev: true, dependencies: { y: '^1' } }),
    'node_modules/k': pkg('1.0.0', { dependencies: { m: '1' } }),
    'node_modules/m': pkg('1.0.0', { dependencies: { n: '1' } }),
    'node_modules/n': pkg('1.0.0'),
  };
  write('package.json', { name: 'fixture', version: '1.0.0', license: 'MIT', workspaces: ['packages/*'], repository: { url: 'git+https://example.invalid/fixture.git' } });
  write('packages/a/package.json', a);
  write('packages/b/package.json', b);
  write('package-lock.json', { lockfileVersion: 3, packages });

  const bom = buildSbom({ root });
  const ours = byRef(bom);

  it('takes what each package needs from where Node would find it, and nothing development uses', () => {
    assert.deepEqual([...ours.keys()].sort(), ['@fx/a@1.0.0', 'b@1.0.0', 'bin@1.0.0', 'k@1.0.0', 'm@1.0.0', 'n@1.0.0', 'p@1.0.0', 'w@1.0.0', 'x@1.2.0', 'y@2.0.0', 'y@3.0.0', 'z@1.0.0']);
    const graph = new Map(bom.dependencies.map((d) => [d.ref, d.dependsOn]));
    assert.deepEqual(graph.get('x@1.2.0'), ['p@1.0.0', 'y@2.0.0', 'z@1.0.0']);
    assert.deepEqual(graph.get('b@1.0.0'), ['@fx/a@1.0.0', 'k@1.0.0', 'm@1.0.0']);
    assert.deepEqual(graph.get('fixture@1.0.0'), ['@fx/a@1.0.0', 'b@1.0.0']);
    assert.deepEqual(checkSbom(bom, { root }), []);
  });

  it('marks what is reached only through an optional edge optional, and anything also needed plainly required', () => {
    assert.equal(ours.get('bin@1.0.0').scope, 'optional');
    assert.equal(ours.get('w@1.0.0').scope, 'optional');
    assert.equal(ours.get('z@1.0.0').scope, 'required', 'z is optional under bin but plain under x');
    assert.equal(ours.get('x@1.2.0').scope, 'required');
    assert.equal(ours.get('m@1.0.0').scope, 'required', 'm was reached optionally first, then plainly through k');
    assert.equal(ours.get('n@1.0.0').scope, 'required', 'and what m needs is required with it');
  });

  it('names an aliased package by what it really is', () => {
    const aliased = ours.get('y@3.0.0');
    assert.equal(aliased.purl, 'pkg:npm/y@3.0.0');
    assert.deepEqual(aliased.properties, [{ name: PATH, value: 'node_modules/alias-y' }]);
  });

  it('carries the scope as a group, the hash in hex and the tarball', () => {
    const own = ours.get('@fx/a@1.0.0');
    assert.equal(own.group, '@fx');
    assert.equal(own.name, 'a');
    assert.equal(own.purl, 'pkg:npm/%40fx/a@1.0.0');
    assert.equal(ours.get('b@1.0.0').purl, undefined, 'b is private');
    const x = ours.get('x@1.2.0');
    assert.deepEqual(x.hashes, [{ alg: 'SHA-512', content: Buffer.from('1.2.0'.padEnd(64, '.')).toString('hex') }]);
    assert.deepEqual(x.externalReferences, [{ type: 'distribution', url: 'https://registry.npmjs.org/x/-/x-1.2.0.tgz' }]);
  });

  it('refuses a lockfile missing something a package needs, and names it', () => {
    const broken = { ...packages };
    delete broken['node_modules/p'];
    write('package-lock.json', { lockfileVersion: 3, packages: broken });
    try {
      assert.throws(() => buildSbom({ root }), /node_modules\/x needs p/);
    } finally {
      write('package-lock.json', { lockfileVersion: 3, packages });
    }
  });
});

describe('the check catches', () => {
  const fresh = () => structuredClone(buildSbom());
  const component = (bom, full) => bom.components.find((c) => (c.group ? `${c.group}/${c.name}` : c.name) === full);
  const typescript = lock['node_modules/typescript'];
  const faults = {
    'a document that is not CycloneDX': [(bom) => { bom.bomFormat = 'SPDX'; }, /bomFormat/],
    'a missing workspace': [(bom) => { bom.components = bom.components.filter((c) => c.name !== 'core'); }, /the workspace packages\/core/],
    'a published workspace without its purl': [(bom) => { delete component(bom, '@trazum/cli').purl; }, /@trazum\/cli@\S+ is published to npm and has no purl/],
    'a direct dependency of the web app left out': [(bom) => { bom.components = bom.components.filter((c) => c.name !== 'next'); }, /apps\/web depends on next, which is not listed/],
    'a component without a version': [(bom) => { delete component(bom, 'react').version; }, /react@\S+ has no version/],
    'a component without a licence': [(bom) => { component(bom, 'react').licenses = []; }, /react@\S+ has no licence/],
    'a component without a hash': [(bom) => { delete component(bom, 'react').hashes; }, /react@\S+ has no hash/],
    'a version the lockfile does not have': [(bom) => { component(bom, 'react').version = '0.0.1'; }, /is \S+ at node_modules\/react/],
    'a component listed twice': [(bom) => { bom.components.push(structuredClone(component(bom, 'react'))); }, /listed twice/],
    'a dependency on nothing listed': [(bom) => { bom.dependencies[0].dependsOn.push('nothing@0.0.0'); }, /depends on nothing@0.0.0, which is not a component/],
    'a component with no place in the graph': [(bom) => { bom.dependencies = bom.dependencies.filter((d) => !d.ref.startsWith('react@')); }, /react@\S+ has no entry in dependencies/],
    'a development-only package': [
      (bom) => {
        bom.components.push({
          'bom-ref': `typescript@${typescript.version}`,
          type: 'library',
          name: 'typescript',
          version: typescript.version,
          scope: 'required',
          purl: purlOf('typescript', typescript.version),
          licenses: licensesOf(typescript.license),
          hashes: hashesOf(typescript.integrity),
          properties: [{ name: PATH, value: 'node_modules/typescript' }],
        });
        bom.dependencies.push({ ref: `typescript@${typescript.version}`, dependsOn: [] });
      },
      /typescript@\S+ is only a development dependency/,
    ],
  };
  for (const [name, [plant, expected]] of Object.entries(faults)) {
    it(name, () => {
      const bom = fresh();
      plant(bom);
      const problems = checkSbom(bom);
      assert.ok(problems.some((problem) => expected.test(problem)), `not caught; the check said: ${problems.join(' | ') || 'nothing'}`);
    });
  }
});

describe('the command', () => {
  it('writes the document and says what it holds', () => {
    const out = join(scratch, 'out', 'trazum-v0.0.0.cdx.json');
    const run = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/sbom.mjs'), out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^trazum-v0\.0\.0\.cdx\.json: \d+ components: \d+ workspaces of this repository and \d+ third-party packages/);
    assert.deepEqual(checkSbom(JSON.parse(readFileSync(out, 'utf8'))), []);
  });

  it('refuses to run without somewhere to write it', () => {
    const run = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/sbom.mjs')], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage/);
  });
});

describe('the release', () => {
  /**
   * The bill is made before anything is uploaded, on every run including the
   * dry run, and both ways of creating the GitHub release attach it. Read
   * from the workflow's text, step by step.
   */
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
  // Each step's text without its comments, which mention the commands too.
  const steps = workflow
    .split(/\n(?=\s+- name: )/)
    .map((step) => step.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n'));
  const made = steps.findIndex((step) => step.includes('node scripts/sbom.mjs'));

  it('makes the bill on every run, before the first upload', () => {
    assert.ok(made !== -1, 'no step runs scripts/sbom.mjs');
    assert.doesNotMatch(steps[made], /\n\s+if:/, 'the bill is made only on some runs');
    const firstPublish = steps.findIndex((step) => /run:\s*npm publish/.test(step));
    assert.ok(firstPublish !== -1 && made < firstPublish, 'the bill is made after something is uploaded');
    assert.match(steps[made], /node scripts\/sbom\.mjs "\/tmp\/sbom\/trazum-v\$version\.cdx\.json"/);
  });

  it('attaches it to the GitHub release, whichever way the release is created', () => {
    const creating = steps.filter((step) => step.includes('gh release create'));
    assert.equal(creating.length, 2, 'expected a release from a tag and one from main');
    for (const step of creating) {
      const lines = step.slice(step.indexOf('gh release create')).split('\n');
      const command = lines.slice(0, lines.findIndex((line) => !line.trimEnd().endsWith('\\')) + 1).join('\n');
      assert.match(command, /"\/tmp\/sbom\/trazum-(v\$version|\$GITHUB_REF_NAME)\.cdx\.json"/, `${step.match(/- name: (.*)/)[1]} attaches no bill`);
    }
  });
});
