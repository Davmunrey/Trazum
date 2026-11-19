#!/usr/bin/env node
/**
 * Add the MCP bundle to the listing `mcp-publisher` is about to send, with the
 * digest of the file the release actually carries.
 *
 *   node scripts/mcpb-registry-entry.mjs --file trazum-mcp-2.7.12.mcpb \
 *     --sums SHA256SUMS --server packages/mcp/server.json
 *
 * **Why the entry is not in the committed `server.json`.** The registry wants
 * the bundle's address and its SHA-256, and the digest of a file built after
 * the release PR merged cannot be in that PR. Writing a digest in a follow-up
 * would name the release before this one, and the next release PR would
 * carry it forward stale: the entry would be true on one day in the cycle.
 * So the committed file lists the npm package only, and the `mcp-registry` job
 * of `release.yml`, which runs after the `assets` job has attached the bundle,
 * downloads the bundle and `SHA256SUMS` from the release, runs this on its own
 * copy of `server.json` and publishes that. The registry's listing for a
 * version is whatever its publisher sent, and this is what it sends.
 *
 * It refuses, writing nothing, when: the file is not named for the version
 * `server.json` carries, its digest differs from the one `SHA256SUMS` holds
 * for it, or `server.json` already lists a bundle.
 *
 * The entry is exactly the fields the registry's package-types document gives
 * an MCPB package: `registryType`, `identifier` (the release address),
 * `fileSha256` and `transport`.
 *
 * No dependencies, like everything else here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assetNames, assetUrl } from './install-snippets.mjs';
import { parseSums, sha256 } from './release-assets.mjs';

/** `server` with the bundle's entry added. Throws, naming why, instead of adding an entry that would not be true. */
export function withMcpbEntry(server, { file, sums }) {
  const version = server.version;
  const wanted = assetNames(version).mcpb;
  if (basename(file) !== wanted) throw new Error(`${basename(file)} is not the bundle of ${version}: expected ${wanted}`);
  if ((server.packages ?? []).some((entry) => entry.registryType === 'mcpb')) throw new Error('server.json already lists a bundle');
  const digest = sha256(file);
  const listed = parseSums(sums)[wanted];
  if (listed === undefined) throw new Error(`SHA256SUMS does not list ${wanted}`);
  if (listed !== digest) throw new Error(`${wanted} hashes to ${digest} and SHA256SUMS says ${listed}`);
  return {
    ...server,
    packages: [
      ...(server.packages ?? []),
      { registryType: 'mcpb', identifier: assetUrl(version, wanted), fileSha256: digest, transport: { type: 'stdio' } },
    ],
  };
}

function main() {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const [file, sums, path] = [value('--file'), value('--sums'), value('--server')];
  if (file === undefined || sums === undefined || path === undefined) {
    console.error('usage: node scripts/mcpb-registry-entry.mjs --file BUNDLE --sums SHA256SUMS --server server.json');
    process.exit(2);
  }
  const next = withMcpbEntry(JSON.parse(readFileSync(path, 'utf8')), { file, sums: readFileSync(sums, 'utf8') });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${path}: lists ${basename(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
