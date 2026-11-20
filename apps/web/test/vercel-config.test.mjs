import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * `apps/web/vercel.json`, read by Vercel from the project's root directory.
 *
 * After each merge the agent's working branch is reset to `main` and pushed,
 * and Vercel built that same commit a second time as a preview: two of the
 * nine deployments in the 24 hours to 2026-11-20 13:06 UTC (#849). The file
 * turns off deployments for `claude/**` branches, with the key Vercel
 * documents for it (vercel.com/docs/project-configuration/git-configuration,
 * read 2026-11-20), and does nothing else: the build stays the project's.
 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('apps/web/vercel.json', () => {
  it('turns off deployments of the agent working branches', () => {
    assert.equal(config.git?.deploymentEnabled?.['claude/**'], false);
  });

  it('leaves every other branch, main included, to deploy', () => {
    const off = Object.entries(config.git.deploymentEnabled).filter(([, on]) => on === false).map(([branch]) => branch);
    assert.deepEqual(off, ['claude/**']);
  });

  it('sets nothing but that, so the build and its routes stay the project settings', () => {
    assert.deepEqual(Object.keys(config), ['git']);
    assert.deepEqual(Object.keys(config.git), ['deploymentEnabled']);
  });
});
