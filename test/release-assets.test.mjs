import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { assetNames } from '../scripts/install-snippets.mjs';
import { withMcpbEntry } from '../scripts/mcpb-registry-entry.mjs';
import {
  MCPB_MANIFEST_VERSION,
  ROOT,
  TOOLS,
  filesUnder,
  parseSums,
  runtimeClosure,
  sha256,
  stageMcpb,
  stageVsix,
  sumsText,
} from '../scripts/release-assets.mjs';

/**
 * What a release carries besides its notes (#780, #640): the editor extension
 * as a `.vsix`, the MCP server as a `.mcpb`, and a `SHA256SUMS` over them.
 *
 * The packagers themselves (`vsce`, `mcpb pack`) are fetched from npm at their
 * pinned versions and are not run here, because a test with a network is a
 * test that fails for a reason that is not the code's. What they are given is
 * laid out here, in a temporary folder, and held to the lockfile; the packagers
 * run in the release workflow's manual dry run and in the release itself.
 */

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const mcp = readJson('packages/mcp/package.json');
const scratch = mkdtempSync(join(tmpdir(), 'trazum-assets-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('the packagers are pinned', () => {
  it('each is a package at three plain numbers: not a tag, not a range, not a bare name', () => {
    assert.deepEqual(Object.keys(TOOLS).sort(), ['mcpb', 'vsce']);
    for (const [name, spec] of Object.entries(TOOLS)) {
      assert.match(spec, /^@[a-z0-9-]+\/[a-z0-9.-]+@\d+\.\d+\.\d+$/, `${name} is "${spec}"`);
    }
  });

  it('and nothing else in the repository fetches either one at a version that can move', () => {
    const files = ['package.json', 'scripts/release-assets.mjs', '.github/workflows/release.yml', 'CONTRIBUTING.md', 'RELEASES.md', 'docs/releasing.md'];
    for (const path of files) {
      const text = read(path);
      for (const [, tool, version] of text.matchAll(/(@vscode\/vsce|@anthropic-ai\/mcpb)(@[^\s'"`)]*)?/g)) {
        if (path === 'scripts/release-assets.mjs') continue;
        assert.ok(version === undefined || /^@\d+\.\d+\.\d+$/.test(version), `${path} names ${tool}${version}, which is not an exact version`);
      }
    }
    assert.doesNotMatch(read('package.json'), /"@vscode\/vsce"|"@anthropic-ai\/mcpb"/, 'a packager became a dependency of the repository');
    assert.doesNotMatch(read('scripts/release-assets.mjs'), /@(latest|next|beta)\b/);
  });

  it('is what the MANIFEST.md of the bundle format names as its version', () => {
    assert.equal(MCPB_MANIFEST_VERSION, '0.3');
  });
});

describe('what the lockfile names', () => {
  it('the server runs on core and the extension on core: one package each, no third party', () => {
    assert.deepEqual(runtimeClosure(ROOT, 'packages/mcp').map((entry) => entry.name), ['@trazum/mcp', '@trazum/core']);
    assert.deepEqual(runtimeClosure(ROOT, 'apps/vscode').map((entry) => entry.name), ['trazum-vscode', '@trazum/core']);
    assert.ok(runtimeClosure(ROOT, 'packages/mcp').every((entry) => entry.workspace), 'a third-party package joined the closure: look at what it is');
  });

  it('a dependency the lockfile does not hold stops the build, naming it', () => {
    const root = join(scratch, 'lock');
    mkdirSync(join(root, 'packages/a'), { recursive: true });
    writeFileSync(join(root, 'packages/a/package.json'), '{"name":"a"}');
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({ packages: { '': {}, 'packages/a': { version: '1.0.0', dependencies: { missing: '1.0.0' } } } }),
    );
    assert.throws(() => runtimeClosure(root, 'packages/a'), /packages\/a needs missing and package-lock\.json does not hold it/);
    assert.throws(() => runtimeClosure(root, 'packages/none'), /no entry for packages\/none/);
  });

  it('a third-party package that is in the lockfile is part of the closure, found the way Node finds it', () => {
    const root = join(scratch, 'lock-third');
    mkdirSync(join(root, 'packages/a'), { recursive: true });
    writeFileSync(join(root, 'packages/a/package.json'), '{"name":"a"}');
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({
        packages: {
          '': {},
          'packages/a': { version: '1.0.0', dependencies: { left: '1.0.0' } },
          'node_modules/left': { version: '1.0.0', dependencies: { right: '2.0.0' } },
          'node_modules/left/node_modules/right': { version: '2.0.0' },
        },
      }),
    );
    assert.deepEqual(
      runtimeClosure(root, 'packages/a').map((entry) => `${entry.name}@${entry.version}`),
      ['a@1.0.0', 'left@1.0.0', 'right@2.0.0'],
    );
  });
});

describe('the MCP bundle, laid out for `mcpb pack`', () => {
  const stage = join(scratch, 'mcpb');
  let manifest;
  let files;

  it('is laid out from the built server and the closure', async () => {
    manifest = await stageMcpb(stage);
    files = filesUnder(stage);
    assert.ok(files.includes('manifest.json'));
  });

  it('holds the server, the core package it imports, the licence and the icon, and nothing else', () => {
    const outside = files.filter((file) => !file.startsWith('node_modules/') && !file.startsWith('server/'));
    assert.deepEqual(outside, ['LICENSE', 'icon.png', 'manifest.json', 'package.json']);
    const server = files.filter((file) => file.startsWith('server/')).sort();
    assert.deepEqual(
      server,
      ['index.js', 'questions.js', 'rpc.js', 'tools.js'].map((name) => `server/${name}`),
      'the server folder is not the built output of packages/mcp',
    );
    const modules = new Set(files.filter((file) => file.startsWith('node_modules/')).map((file) => file.split('/').slice(1, 3).join('/')));
    assert.deepEqual([...modules], ['@trazum/core'], 'something the lockfile does not name is in the bundle');
  });

  it('carries no source, no test, no map, no declaration and no document of the repository', () => {
    for (const file of files) {
      assert.doesNotMatch(file, /\.(map|ts|tsx|md)$|(^|\/)(src|test|tests)\//, `${file} is in the bundle`);
    }
  });

  it('carries core as the built files of the workspace at the lockfile version', () => {
    const core = readJson('packages/core/package.json');
    assert.deepEqual(JSON.parse(readFileSync(join(stage, 'node_modules/@trazum/core/package.json'), 'utf8')).version, core.version);
    assert.equal(core.version, mcp.dependencies['@trazum/core'], 'the server asks for a core the repository is not at');
    const dist = files.filter((file) => file.startsWith('node_modules/@trazum/core/dist/'));
    assert.ok(dist.length > 50 && dist.every((file) => file.endsWith('.js')), `${dist.length} files of core's dist`);
  });

  it('has a manifest of fields MANIFEST.md names, at the version of the package it bundles', () => {
    // Transcribed from MANIFEST.md, "Required Fields" and "Optional Fields" (spec 0.3).
    const named = new Set([
      'manifest_version', 'name', 'version', 'description', 'author', 'server', 'icon', 'icons', 'display_name', 'long_description',
      'repository', 'homepage', 'documentation', 'support', 'screenshots', 'tools', 'tools_generated', 'prompts', 'prompts_generated',
      'keywords', 'license', 'privacy_policies', 'compatibility', 'user_config', '_meta', 'localization',
    ]);
    for (const key of Object.keys(manifest)) assert.ok(named.has(key), `manifest.json has "${key}", which MANIFEST.md does not name`);
    for (const key of ['manifest_version', 'name', 'version', 'description', 'author', 'server']) assert.ok(key in manifest, `required "${key}" is missing`);
    assert.equal(manifest.manifest_version, MCPB_MANIFEST_VERSION);
    assert.equal(manifest.version, mcp.version);
    assert.equal(typeof manifest.author.name, 'string');
    assert.deepEqual(JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8')), manifest);
  });

  it('starts the server by a file that is in the bundle, with `${__dirname}`, and says no platform works that was not tried', () => {
    assert.equal(manifest.server.type, 'node');
    assert.equal(manifest.server.entry_point, 'server/index.js');
    assert.ok(files.includes(manifest.server.entry_point));
    assert.deepEqual(manifest.server.mcp_config, { command: 'node', args: ['${__dirname}/server/index.js'] });
    assert.deepEqual(manifest.compatibility, { runtimes: { node: mcp.engines.node } }, 'compatibility says more than the package declares');
    assert.equal(manifest.compatibility.platforms, undefined);
  });

  it('lists the tools the server lists, by the names it answers to', () => {
    const asked = spawnSync(process.execPath, [join(stage, 'server/index.js')], {
      input: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]
        .map((message) => `${JSON.stringify(message)}\n`)
        .join(''),
      encoding: 'utf8',
      cwd: stage,
      timeout: 30000,
    });
    const replies = asked.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const [initialize, list] = replies;
    assert.equal(initialize.result.serverInfo.version, mcp.version, 'the unpacked bundle does not start as the version it names');
    assert.deepEqual(
      manifest.tools.map((tool) => tool.name),
      list.result.tools.map((tool) => tool.name),
      'manifest.json lists other tools than the server',
    );
  });
});

describe('the extension, laid out for `vsce package`', () => {
  const stage = join(scratch, 'vsix');
  let files;

  it('is laid out', () => {
    stageVsix(stage);
    files = filesUnder(stage);
  });

  it('carries its built files and the core package they import, which the first .vsix did not', () => {
    assert.ok(files.includes('dist/extension.js') && files.includes('dist/reading.js'));
    assert.ok(files.includes('node_modules/@trazum/core/package.json'));
    assert.ok(files.includes('node_modules/@trazum/core/dist/node.js'), '`@trazum/core/node` is what extension.js imports');
    assert.ok(files.includes('.vscodeignore'));
    for (const file of files) assert.doesNotMatch(file, /\.(map|ts)$|(^|\/)(src|test)\//, `${file} is laid out for the extension`);
  });

  it('is not excluded again by the ignore file, which lets exactly that package through', () => {
    const ignore = read('apps/vscode/.vscodeignore');
    assert.match(ignore, /^node_modules\/\*\*$/m);
    for (const kept of ['package.json', 'LICENSE', 'dist/**/*.js']) {
      assert.ok(ignore.includes(`!node_modules/@trazum/core/${kept}`), `.vscodeignore does not keep core's ${kept}`);
    }
  });
});

describe('SHA256SUMS', () => {
  const dir = join(scratch, 'sums');
  const fixture = join(ROOT, 'test/fixtures/cli-9.9.9.tgz');
  const names = assetNames('9.9.9');

  it('is the form `sha256sum -c` reads: a digest, two spaces, a name, sorted', () => {
    mkdirSync(dir, { recursive: true });
    copyFileSync(fixture, join(dir, names.mcpb));
    writeFileSync(join(dir, names.vsix), 'the extension');
    const text = sumsText([join(dir, names.vsix), join(dir, names.mcpb)]);
    const lines = text.trimEnd().split('\n');
    assert.deepEqual(lines.map((line) => line.slice(66)), [names.mcpb, names.vsix]);
    assert.equal(lines[0], `59eca0c5163fbbf39d445824a21b7d31db4bf0bd3e04a36fbed93ab9f3534093  ${names.mcpb}`, 'the digest is not the one sha256sum gave the fixture');
    assert.ok(text.endsWith('\n'));
    writeFileSync(join(dir, 'SHA256SUMS'), text);
    const checked = spawnSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: dir, encoding: 'utf8' });
    if (checked.error?.code !== 'ENOENT') assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  });

  it('is read back into the same digests, and a changed file is the one that fails', () => {
    const sums = parseSums(readFileSync(join(dir, 'SHA256SUMS'), 'utf8'));
    assert.equal(sums[names.mcpb], sha256(join(dir, names.mcpb)));
    writeFileSync(join(dir, names.vsix), 'the extension, altered');
    assert.notEqual(sums[names.vsix], sha256(join(dir, names.vsix)));
  });

  it('refuses a line that is not a digest and a name', () => {
    for (const text of ['abc  file\n', `${'0'.repeat(64)} file\n`, `${'0'.repeat(64)}  ../file\n`, `${'G'.repeat(64)}  file\n`]) {
      assert.throws(() => parseSums(text), /not a line of SHA256SUMS/, JSON.stringify(text));
    }
  });
});

describe('the names a release carries are built from its version, one way', () => {
  it('has the version in each file and in the tag the address points at', () => {
    assert.deepEqual(assetNames('2.7.12'), {
      vsix: 'trazum-vscode-2.7.12.vsix',
      mcpb: 'trazum-mcp-2.7.12.mcpb',
      sums: 'SHA256SUMS',
      sbom: 'trazum-v2.7.12.cdx.json',
      pricing: 'trazum-pricing-2.7.12.json',
    });
  });

  it('is the .vsix name `package:vscode` has always written, and the one RELEASES.md promises', () => {
    assert.equal(assetNames(readJson('apps/vscode/package.json').version).vsix, `trazum-vscode-${readJson('apps/vscode/package.json').version}.vsix`);
  });
});

describe('the registry entry for the bundle', () => {
  const dir = join(scratch, 'registry');
  const server = { name: 'io.github.Davmunrey/trazum', version: '9.9.9', packages: [{ registryType: 'npm', identifier: '@trazum/mcp', version: '9.9.9', transport: { type: 'stdio' } }] };
  const file = join(dir, assetNames('9.9.9').mcpb);
  const digest = '59eca0c5163fbbf39d445824a21b7d31db4bf0bd3e04a36fbed93ab9f3534093';

  it('adds the registry\'s own fields, with the release address and the digest of the file', () => {
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(ROOT, 'test/fixtures/cli-9.9.9.tgz'), file);
    const next = withMcpbEntry(server, { file, sums: `${digest}  ${assetNames('9.9.9').mcpb}\n` });
    assert.equal(next.packages.length, 2);
    assert.deepEqual(next.packages[1], {
      registryType: 'mcpb',
      identifier: 'https://github.com/Davmunrey/Trazum/releases/download/v9.9.9/trazum-mcp-9.9.9.mcpb',
      fileSha256: digest,
      transport: { type: 'stdio' },
    });
    assert.equal(server.packages.length, 1, 'the input was changed');
  });

  it('refuses a digest the sums do not hold, a file of another version, a missing line and a second entry', () => {
    const sums = `${digest}  ${assetNames('9.9.9').mcpb}\n`;
    assert.throws(() => withMcpbEntry(server, { file, sums: `${'0'.repeat(64)}  ${assetNames('9.9.9').mcpb}\n` }), /hashes to .* and SHA256SUMS says/);
    assert.throws(() => withMcpbEntry({ ...server, version: '9.9.8' }, { file, sums }), /is not the bundle of 9\.9\.8/);
    assert.throws(() => withMcpbEntry(server, { file, sums: `${digest}  other.mcpb\n` }), /does not list/);
    const twice = withMcpbEntry(server, { file, sums });
    assert.throws(() => withMcpbEntry(twice, { file, sums }), /already lists a bundle/);
  });

  it('is not in the committed server.json, which lists what exists before a release: the npm package', () => {
    const committed = readJson('packages/mcp/server.json');
    assert.deepEqual(committed.packages.map((entry) => entry.registryType), ['npm']);
    assert.equal(committed.version, mcp.version);
  });
});

describe('the release workflow', () => {
  const workflow = read('.github/workflows/release.yml');
  const jobs = workflow.split(/^  (?=[a-z][a-z-]*:$)/m);
  const job = (name) => jobs.find((candidate) => candidate.startsWith(`${name}:`));
  const code = (text) => text.replace(/^\s*#.*$/gm, '');
  const release = code(job('release'));
  const assets = code(job('assets') ?? '');
  const listing = code(job('mcp-registry'));

  it('builds the files in a job of their own, after the one that publishes and creates the release', () => {
    assert.ok(job('assets'), 'no job attaches the files');
    assert.match(assets, /needs: \[decide, release\]/, 'the files are built without waiting for the release job');
    assert.ok(workflow.indexOf('\n  assets:\n') > workflow.indexOf('\n  release:\n'), 'the assets job is above the release job');
    assert.match(assets, /release-assets\.mjs build/);
  });

  it('builds the pricing dataset from the commit it publishes, with core built in the same job before it (#784)', () => {
    const built = assets.indexOf('npm run build -w @trazum/core');
    const made = assets.indexOf('release-assets.mjs build');
    assert.ok(built !== -1 && built < made, 'the dataset would be checked against a core this job did not build');
    assert.match(read('scripts/release-assets.mjs'), /command === 'pricing' \|\| command === 'build'/, '`build` does not make the dataset');
  });

  it('and not in the job that publishes: no packager, no bundle, no upload there', () => {
    for (const forbidden of ['release-assets', '.vsix', '.mcpb', 'vsce', 'mcpb', 'gh release upload', 'SHA256SUMS']) {
      assert.ok(!release.includes(forbidden), `the release job mentions ${forbidden}, so a packager can run before npm serves the packages`);
    }
    const serves = release.indexOf('node scripts/npm-serves.mjs');
    assert.ok(serves !== -1 && serves > release.indexOf('run: npm publish'), 'the wait for npm to serve every package moved');
  });

  it('holds no credential but the release token, in the one step that attaches', () => {
    assert.match(assets, /permissions:\n {6}contents: write\n/);
    assert.equal((assets.match(/contents: write/g) ?? []).length, 1);
    for (const forbidden of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'id-token', 'environment:', 'VSCE_PAT', 'OVSX_PAT', 'vsce publish', 'ovsx', 'secrets.']) {
      assert.ok(!assets.includes(forbidden), `the assets job has ${forbidden}`);
    }
    const steps = assets.split(/^ {6}- /m);
    const holders = steps.filter((step) => /GH_TOKEN|github\.token/.test(step));
    assert.equal(holders.length, 1, 'more than one step holds the release token');
    assert.match(holders[0], /gh release upload/);
    assert.match(holders[0], /if: github\.event_name == 'push'/, 'a manual run could attach');
    // The packagers run in a step that does not hold it.
    const building = steps.find((step) => step.includes('release-assets.mjs build'));
    assert.doesNotMatch(building, /GH_TOKEN|github\.token|secrets/);
  });

  it('attaches the three files and the sums, naming each, and builds the sums before the upload', () => {
    const upload = assets.slice(assets.indexOf('gh release upload'));
    for (const name of ['trazum-vscode-$version.vsix', 'trazum-mcp-$version.mcpb', 'trazum-pricing-$version.json', '/tmp/assets/SHA256SUMS']) assert.ok(upload.includes(name), `${name} is not uploaded`);
    assert.ok(assets.indexOf('release-assets.mjs sums', assets.indexOf('Attach them')) < assets.indexOf('gh release upload'), 'the sums are written after the upload');
    assert.match(assets, /gh release download "v\$version" --pattern "trazum-v\$version\.cdx\.json"/, 'the bill of materials is not in the sums');
  });

  it('is a dry run when started by hand: it makes the files and attaches nothing', () => {
    assert.match(job('assets'), /github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
    assert.match(assets, /Dry run: nothing attached/);
  });

  it('is waited for by the registry listing, which then lists the bundle from the release before it publishes', () => {
    assert.match(listing, /needs: \[decide, release, assets\]/);
    const entry = listing.indexOf('mcpb-registry-entry.mjs');
    const published = listing.indexOf('mcp-publisher" publish');
    assert.ok(entry !== -1 && published !== -1 && entry < published, 'the bundle is added after the listing is sent, or not at all');
    assert.match(listing, /releases\/download\/v\$version/, 'the bundle is not read from the release');
    assert.match(listing, /--sums \/tmp\/bundle\/SHA256SUMS/, 'the digest is not checked against the release\'s own sums');
  });
});

/**
 * Who made the files on the release page (#875). One build-provenance
 * attestation over every file the release carries, signed with the run's OIDC
 * identity in a job that runs no third-party code, and attached to the release
 * as a Sigstore bundle under the name Scorecard's Signed-Releases reads.
 */
describe('the release workflow attests what it attaches', () => {
  const workflow = read('.github/workflows/release.yml');
  const jobs = workflow.split(/^ {2}(?=[a-z][a-z-]*:$)/m);
  const job = (name) => jobs.find((candidate) => candidate.startsWith(`${name}:`));
  const code = (text) => text.replace(/^\s*#.*$/gm, '');
  const attest = code(job('attest') ?? '');
  const files = ['trazum-vscode-$version.vsix', 'trazum-mcp-$version.mcpb', 'trazum-pricing-$version.json', 'trazum-v$version.cdx.json', 'SHA256SUMS'];
  // The workflow names the version with an Actions expression in `with:`; it is
  // joined here so the source holds no `${` a reader could take for a template.
  const stepVersion = ['$', '{{ steps.files.outputs.version }}'].join('');
  const asStep = (name) => name.replaceAll('$version', stepVersion);
  const asVerify = (name) => name.replaceAll('$version', '$VERSION');

  it('in a job of its own, after the files are attached, on a release to latest only', () => {
    assert.ok(job('attest'), 'no job attests the files');
    assert.ok(workflow.indexOf('\n  attest:\n') > workflow.indexOf('\n  assets:\n'), 'the attest job is above the assets job');
    assert.match(attest, /needs: \[decide, assets\]/, 'the attestation does not wait for the files');
    assert.match(attest, /if: github\.event_name == 'push' && needs\.decide\.outputs\.channel == 'latest'/, 'a manual run or a next could attest');
  });

  it('with the permissions signing needs and no more', () => {
    const granted = attest.slice(attest.indexOf('permissions:'), attest.indexOf('steps:')).match(/^ {6}[a-z-]+: \w+$/gm).map((line) => line.trim());
    assert.deepEqual(granted.sort(), ['attestations: write', 'contents: write', 'id-token: write']);
    for (const forbidden of ['secrets.', 'NPM_TOKEN', 'environment:', 'npx', 'npm ci', 'npm install', 'release-assets.mjs', 'setup-node']) {
      assert.ok(!attest.includes(forbidden), `the attest job has ${forbidden}, so code besides gh and GitHub's action runs where the token signs`);
    }
    const actions = attest.match(/uses: \S+/g);
    assert.deepEqual(
      actions,
      ['uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'],
      'an action other than checkout and GitHub\'s attest runs where the token signs',
    );
  });

  it('and the job that runs the packagers still cannot sign', () => {
    const assets = code(job('assets'));
    assert.ok(!assets.includes('id-token') && !assets.includes('attestations:'), 'the packagers share a job with the signing token');
  });

  it('reads every file back from the release and checks it against SHA256SUMS, with none allowed to be missing, before attesting', () => {
    const fetched = attest.slice(attest.indexOf('for name in'), attest.indexOf('done', attest.indexOf('for name in')));
    for (const name of files) assert.ok(fetched.includes(name), `${name} is not read back from the release`);
    assert.match(attest, /sha256sum --check --strict SHA256SUMS/, 'the files are not checked against the sums');
    assert.doesNotMatch(attest, /--ignore-missing/, 'a file missing from the release would pass');
    assert.ok(attest.indexOf('sha256sum --check') < attest.indexOf('uses: actions/attest'), 'the files are attested before they are checked');
  });

  it('attests each file the release carries, the sums included', () => {
    const subjects = attest.slice(attest.indexOf('subject-path: |'), attest.indexOf('- name:', attest.indexOf('subject-path: |')));
    for (const name of files) assert.ok(subjects.includes(`/tmp/release/${asStep(name)}`), `${name} is not a subject of the attestation`);
  });

  it('verifies the bundle against every file before it attaches it, under the name Scorecard reads', () => {
    const verify = attest.indexOf('gh attestation verify');
    const upload = attest.indexOf('gh release upload');
    assert.ok(verify !== -1 && upload !== -1 && verify < upload, 'the bundle is attached before it is verified, or not at all');
    const checked = attest.slice(attest.lastIndexOf('for name in'), upload);
    for (const name of files) assert.ok(checked.includes(asVerify(name)), `${name} is not verified against the bundle`);
    assert.match(checked, /--signer-workflow "\$GITHUB_REPOSITORY\/\.github\/workflows\/release\.yml"/, 'the bundle is not held to this workflow');
    assert.match(attest, /gh release upload "v\$VERSION" "\/tmp\/release\/trazum-v\$VERSION\.sigstore\.json" --clobber/);
  });

  it('and RELEASES.md tells a person how to check a file the same way', () => {
    const releases = read('RELEASES.md');
    const intro = releases.slice(0, releases.indexOf('\n## '));
    assert.match(intro, /trazum-v<version>\.sigstore\.json/, 'the bundle is not named');
    assert.match(intro, /gh attestation verify trazum-mcp-<version>\.mcpb --repo Davmunrey\/Trazum/, 'no command checks a file against GitHub');
    assert.match(intro, /--bundle trazum-v<version>\.sigstore\.json/, 'no command checks a file against the bundle on the release');
    assert.doesNotMatch(intro, /None of them is signed\s+or attested/, 'RELEASES.md still says nothing is attested');
  });
});
