#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = (directory) => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
const release = manifest(root);
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this check with npm run verify:packages.');
const packages = release.workspaces.flatMap((pattern) => {
  assert.ok(pattern.endsWith('/*'), 'Unsupported workspace pattern');
  const parent = join(root, pattern.slice(0, -2));
  return readdirSync(parent, { withFileTypes: true }).filter((item) => item.isDirectory())
    .map((item) => manifest(join(parent, item.name))).filter((item) => item.private !== true);
});
const temporary = mkdtempSync(join(tmpdir(), 'trazum-packed-release-'));
const artifacts = join(temporary, 'artifacts');
const install = join(temporary, 'install');

function command(args, cwd, env = process.env, timeout = 120000) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr.slice(-6000) || result.stdout.slice(-6000));
  return result.stdout;
}

try {
  mkdirSync(artifacts); mkdirSync(install);
  const packed = JSON.parse(command([npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', artifacts,
    ...packages.flatMap((item) => ['--workspace', item.name])], root));
  assert.equal(packed.length, packages.length);
  for (const item of packed) {
    assert.equal(item.version, release.version);
    assert.equal(basename(item.filename), item.filename);
    for (const required of ['package.json', 'README.md', 'dist/index.js']) {
      assert.ok(item.files.some((file) => file.path === required), `${item.name} is missing ${required}`);
    }
  }
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: 'trazum-synthetic-release-check', private: true }));
  command([npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
    ...packed.map((item) => join(artifacts, item.filename))], install);
  for (const item of packages) {
    const directory = join(install, 'node_modules', item.name);
    assert.equal(lstatSync(directory).isSymbolicLink(), false, `${item.name} must be unpacked, not a workspace link`);
    assert.equal(manifest(directory).version, release.version);
  }
  const result = command(['--test', 'test/task-stress.test.mjs'], root,
    { ...process.env, TRAZUM_STRESS_INSTALL_ROOT: install }, 60000);
  process.stdout.write(result);
  console.log(`Verified ${packages.length} packed packages at ${release.version} in an isolated installation.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
