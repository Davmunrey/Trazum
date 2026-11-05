#!/usr/bin/env node
/**
 * The software bill of materials attached to every GitHub release.
 *
 *   node scripts/sbom.mjs /tmp/sbom/trazum-v2.7.8.cdx.json
 *
 * One CycloneDX 1.5 document for the whole repository: each workspace (the four
 * packages on npm, the web app and the editor extension) and every third-party
 * package any of them needs at run time, with its version, licence, purl,
 * tarball and hash, and what depends on what. OWASP ASVS 4.0.3 14.2.5 asks for
 * one, and `docs/compliance/asvs-l2.md` points here.
 *
 * **Read from the lockfile, not from `npm sbom`.** `npm sbom --omit dev` (npm
 * 10.9) leaves out a package a runtime dependency needs when a development
 * dependency needs it too. On this tree it dropped `postcss`, which Next
 * requires, and `tslib`, which Radix's `aria-hidden` requires, while
 * `npm ls --omit dev` lists both. A bill of materials that quietly misses what
 * runs is worse than none, so this walks the lockfile itself, resolving each
 * dependency the way Node resolves a `require`, and `test/sbom.test.mjs`
 * compares the result with both npm commands on every pull request.
 *
 * The lockfile alone decides the list, so a commit gives the same components on
 * any machine. Every platform's optional binary (sharp's, Next's compiler) is
 * listed and marked optional: more than any one installation fetches, never
 * less. Development dependencies are left out, since nothing that ships runs
 * them.
 *
 * The document is checked before it is written. A failed check writes nothing,
 * names every problem and exits 1. `release.yml` runs this before anything is
 * uploaded, so a broken bill stops a release while nothing is published yet.
 *
 * No dependencies, like everything else here.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Every workspace directory, expanded from the root `workspaces` globs. */
export function workspacesOf(root = REPO_ROOT) {
  return readJson(join(root, 'package.json'))
    .workspaces.flatMap((pattern) => {
      if (!pattern.endsWith('/*')) throw new Error(`workspace pattern "${pattern}" is not of the form dir/*`);
      const parent = pattern.slice(0, -2);
      return readdirSync(join(root, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
        .map((entry) => `${parent}/${entry.name}`);
    })
    .sort();
}

/**
 * The package a lockfile entry installs. Usually whatever follows the path's
 * last `node_modules/`; under an alias (`"web-vitals-soft-navs":
 * "npm:web-vitals@6.2.1"`) the folder has the alias's name and the entry
 * carries the real one.
 */
export const nameAt = (path, entry = {}) =>
  entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** `pkg:npm/%40scope/name@1.2.3`, as the purl specification and npm both write it. */
export const purlOf = (name, version) => `pkg:npm/${name.replace(/^@/, '%40')}@${encodeURIComponent(version)}`;

/** A licence field as CycloneDX holds it: one SPDX id, an expression, or a name. */
export function licensesOf(field) {
  const value = typeof field === 'string' ? field.trim() : '';
  if (!value) return [];
  if (/^[A-Za-z0-9.+-]+$/.test(value)) return [{ license: { id: value } }];
  if (/\s(AND|OR|WITH)\s/.test(value)) return [{ expression: value }];
  return [{ license: { name: value } }];
}

const ALGORITHMS = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

/** A lockfile `integrity` (`sha512-<base64>`, possibly several) as CycloneDX hashes. */
export function hashesOf(integrity) {
  return String(integrity ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((entry) => {
      const cut = entry.indexOf('-');
      const algorithm = ALGORITHMS[entry.slice(0, cut)];
      const digest = entry.slice(cut + 1).split('?')[0];
      return cut > 0 && algorithm && digest
        ? [{ alg: algorithm, content: Buffer.from(digest, 'base64').toString('hex') }]
        : [];
    });
}

/**
 * Where `name`, required from the package at lockfile path `from`, is found:
 * its own `node_modules`, then each enclosing one, then the root's. The same
 * walk Node makes, which is what decides which of two copies a package gets.
 */
export function resolveFrom(packages, from, name) {
  let base = from;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const up = base.lastIndexOf('/node_modules/');
    base = up === -1 ? '' : base.slice(0, up);
  }
}

/**
 * What a package needs at run time: its dependencies, its optional
 * dependencies and its peers, each with whether it may be absent. An optional
 * dependency wins over a plain one of the same name, which is how npm reads a
 * manifest that lists both. An optional peer counts when the lockfile installs
 * it, as optional: whatever installed it, the package uses it when it is
 * there, and `npm ls --omit dev` lists it too.
 */
function edgesOf(entry) {
  const edges = new Map();
  const peerMeta = entry.peerDependenciesMeta ?? {};
  for (const name of Object.keys(entry.peerDependencies ?? {})) edges.set(name, peerMeta[name]?.optional === true);
  for (const name of Object.keys(entry.dependencies ?? {})) edges.set(name, false);
  for (const name of Object.keys(entry.optionalDependencies ?? {})) edges.set(name, true);
  return [...edges].map(([name, optional]) => ({ name, optional }));
}

const byRef = (a, b) => (a['bom-ref'] < b['bom-ref'] ? -1 : a['bom-ref'] > b['bom-ref'] ? 1 : 0);

function namePart(name) {
  return name.startsWith('@') ? { group: name.split('/')[0], name: name.split('/').slice(1).join('/') } : { name };
}

/**
 * The bill of materials for the repository at `root`, built from its
 * `package-lock.json`. Throws, naming each one, if a dependency something
 * needs at run time is not in the lockfile.
 */
export function buildSbom({ root = REPO_ROOT, now = new Date(), serial = randomUUID() } = {}) {
  const manifest = readJson(join(root, 'package.json'));
  const packages = readJson(join(root, 'package-lock.json')).packages;
  const repository = String(manifest.repository?.url ?? manifest.repository ?? '');
  const workspaces = workspacesOf(root);
  const real = (path) => (packages[path]?.link ? packages[path].resolved : path);

  // Breadth first from every workspace. A package reached along a path of
  // plain dependencies is required; one reached only through an optional edge
  // somewhere is optional. A package first reached optionally is walked again
  // if a required path to it turns up later, so its own needs become required
  // too.
  const reached = new Map();
  const edges = new Map();
  const missing = [];
  const queue = workspaces.map((path) => ({ path, optional: false }));
  while (queue.length > 0) {
    const { path, optional } = queue.shift();
    const before = reached.get(path);
    if (before !== undefined && (before === false || optional)) continue;
    reached.set(path, optional);
    const entry = packages[path] ?? {};
    for (const edge of edgesOf(entry)) {
      const found = resolveFrom(packages, path, edge.name);
      if (!found) {
        if (!edge.optional) missing.push(`${path || 'the root'} needs ${edge.name}, which the lockfile does not install`);
        continue;
      }
      const target = real(found);
      if (!edges.has(path)) edges.set(path, new Set());
      edges.get(path).add(target);
      queue.push({ path: target, optional: optional || edge.optional });
    }
  }
  if (missing.length > 0) throw new Error(missing.join('\n'));

  const workspaceManifests = new Map(workspaces.map((path) => [path, readJson(join(root, path, 'package.json'))]));
  const refOf = (path) => {
    const own = workspaceManifests.get(path);
    return own ? `${own.name}@${own.version}` : `${nameAt(path, packages[path])}@${packages[path].version}`;
  };

  const components = new Map();
  for (const [path, optional] of reached) {
    const ref = refOf(path);
    const existing = components.get(ref);
    if (existing) {
      // The same name and version installed at two paths is one component.
      existing.properties.push({ name: 'cdx:npm:package:path', value: path });
      if (!optional) existing.scope = 'required';
      continue;
    }
    const own = workspaceManifests.get(path);
    const entry = packages[path];
    const name = own ? own.name : nameAt(path, entry);
    const version = own ? own.version : entry.version;
    const component = {
      'bom-ref': ref,
      type: own && path.startsWith('apps/') ? 'application' : 'library',
      ...namePart(name),
      version,
      scope: optional ? 'optional' : 'required',
    };
    // A private workspace was never uploaded anywhere, so a pkg:npm purl
    // would name a registry entry that is not this code, or someone else's.
    if (!own || own.private !== true) component.purl = purlOf(name, version);
    component.licenses = licensesOf(own ? own.license : entry.license);
    if (own) {
      component.externalReferences = [{ type: 'vcs', url: repository }];
    } else {
      component.hashes = hashesOf(entry.integrity);
      if (entry.resolved) component.externalReferences = [{ type: 'distribution', url: entry.resolved }];
    }
    component.properties = [{ name: 'cdx:npm:package:path', value: path }];
    components.set(ref, component);
  }
  for (const component of components.values()) component.properties.sort((a, b) => (a.value < b.value ? -1 : 1));

  const rootRef = `${manifest.name}@${manifest.version}`;
  const dependsOn = new Map([[rootRef, new Set(workspaces.map(refOf))]]);
  for (const ref of components.keys()) dependsOn.set(ref, new Set());
  for (const [from, targets] of edges) {
    for (const to of targets) dependsOn.get(refOf(from)).add(refOf(to));
  }

  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${serial}`,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      lifecycles: [{ phase: 'build' }],
      tools: {
        components: [
          { type: 'application', group: manifest.name, name: 'scripts/sbom.mjs', version: manifest.version },
        ],
      },
      component: {
        'bom-ref': rootRef,
        type: 'application',
        name: manifest.name,
        version: manifest.version,
        licenses: licensesOf(manifest.license),
        externalReferences: [{ type: 'vcs', url: repository }],
      },
    },
    components: [...components.values()].sort(byRef),
    dependencies: [...dependsOn]
      .map(([ref, targets]) => ({ ref, dependsOn: [...targets].sort() }))
      .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0)),
  };
}

/**
 * Every reason `bom` is not a bill of materials for the repository at `root`,
 * or an empty list. Checked against the manifests and the lockfile rather
 * than against how `buildSbom` happens to work, so a mistake in one is not
 * repeated by the other.
 */
export function checkSbom(bom, { root = REPO_ROOT } = {}) {
  const problems = [];
  const say = (problem) => problems.push(problem);

  if (bom?.bomFormat !== 'CycloneDX') say('bomFormat is not CycloneDX');
  if (!/^1\.\d+$/.test(String(bom?.specVersion))) say(`specVersion "${bom?.specVersion}" is not a CycloneDX 1.x version`);
  if (!/^urn:uuid:[0-9a-f-]{36}$/.test(String(bom?.serialNumber))) say('serialNumber is not a urn:uuid');
  if (Number.isNaN(Date.parse(bom?.metadata?.timestamp))) say('metadata has no timestamp');
  if (!(bom?.metadata?.tools?.components?.length > 0)) say('metadata names no tool that made it');
  if (!bom?.metadata?.component?.['bom-ref']) say('metadata names no component the document describes');

  const components = Array.isArray(bom?.components) ? bom.components : [];
  if (components.length === 0) say('no components');

  const refs = new Map();
  for (const component of components) {
    const label = component?.['bom-ref'] ?? JSON.stringify(component).slice(0, 80);
    if (refs.has(component?.['bom-ref'])) say(`${label} is listed twice`);
    refs.set(component?.['bom-ref'], component);
    if (!component?.name) say(`${label} has no name`);
    if (!component?.version) say(`${label} has no version`);
    if (!['required', 'optional'].includes(component?.scope)) say(`${label} has no scope`);
    const licences = component?.licenses ?? [];
    if (
      licences.length === 0 ||
      !licences.every((entry) => entry?.expression || entry?.license?.id || entry?.license?.name)
    ) {
      say(`${label} has no licence`);
    }
  }

  // Each workspace, at the version its manifest carries; and a purl for
  // every published one, since that is how a scanner matches it.
  const workspaces = workspacesOf(root);
  const fullName = (component) => (component.group ? `${component.group}/${component.name}` : component.name);
  for (const path of workspaces) {
    const own = readJson(join(root, path, 'package.json'));
    const ref = `${own.name}@${own.version}`;
    const component = refs.get(ref);
    if (!component || fullName(component) !== own.name || component.version !== own.version) {
      say(`the workspace ${path} (${ref}) is missing`);
      continue;
    }
    if (own.private !== true && component.purl !== purlOf(own.name, own.version)) {
      say(`${ref} is published to npm and has no purl naming it`);
    }
    for (const [key, spec] of Object.entries(own.dependencies ?? {})) {
      // `"alias": "npm:real@^1"` installs `real`.
      const name = String(spec).startsWith('npm:') ? String(spec).slice(4).replace(/(.)@.*$/, '$1') : key;
      if (!components.some((candidate) => fullName(candidate) === name)) say(`${path} depends on ${name}, which is not listed`);
    }
  }

  // Every third-party component, as the lockfile has it: a purl, a hash and
  // a version that match what is installed, and never a development-only
  // package.
  const packages = readJson(join(root, 'package-lock.json')).packages;
  for (const component of components) {
    const paths = (component?.properties ?? [])
      .filter((property) => property?.name === 'cdx:npm:package:path')
      .map((property) => property.value);
    if (paths.length === 0) {
      say(`${component?.['bom-ref']} names no path in the lockfile`);
      continue;
    }
    if (workspaces.includes(paths[0])) continue;
    for (const path of paths) {
      const entry = packages[path];
      if (!entry) say(`${component['bom-ref']} is at ${path}, which the lockfile does not have`);
      else if (entry.version !== component.version) say(`${component['bom-ref']} is ${entry.version} at ${path}`);
      else if (entry.dev === true) say(`${component['bom-ref']} is only a development dependency`);
    }
    if (component.purl !== purlOf(fullName(component), component.version)) say(`${component['bom-ref']} has no purl naming it`);
    if (!(component.hashes?.length > 0)) say(`${component['bom-ref']} has no hash`);
  }

  // The graph: every component has an entry, and every edge lands on one.
  const graph = new Map((Array.isArray(bom?.dependencies) ? bom.dependencies : []).map((entry) => [entry?.ref, entry]));
  for (const ref of refs.keys()) if (!graph.has(ref)) say(`${ref} has no entry in dependencies`);
  const known = new Set([...refs.keys(), bom?.metadata?.component?.['bom-ref']]);
  for (const [ref, entry] of graph) {
    if (!known.has(ref)) say(`dependencies names ${ref}, which is not a component`);
    for (const target of entry?.dependsOn ?? []) {
      if (!refs.has(target)) say(`${ref} depends on ${target}, which is not a component`);
    }
  }

  return problems;
}

/** One line saying what the document holds. */
export function summarise(bom) {
  const own = bom.components.filter((component) => !component.hashes).length;
  const optional = bom.components.filter((component) => component.scope === 'optional').length;
  return `${bom.components.length} components: ${own} workspaces of this repository and ${bom.components.length - own} third-party packages, ${optional} of them optional. CycloneDX ${bom.specVersion}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: sbom.mjs <file to write>');
    process.exit(2);
  }
  let bom;
  try {
    bom = buildSbom();
  } catch (error) {
    console.error(`No bill of materials: the lockfile is incomplete.\n${error.message}`);
    process.exit(1);
  }
  const problems = checkSbom(bom);
  if (problems.length > 0) {
    console.error(`No bill of materials written. ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify(bom, null, 2)}\n`);
  console.log(`${basename(out)}: ${summarise(bom)}`);
}
