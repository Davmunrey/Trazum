import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  publishablePackages,
  servedVersion,
  tarballServed,
  tarballUrl,
  waitingFor,
} from '../../../scripts/npm-serves.mjs';

/**
 * The check that a release actually reached the registry, checked itself.
 *
 * ## Why this script exists
 *
 * 1.83.0's release job reported success. `npm publish` printed
 * `+ @trazum/cli@1.83.0`, signed a provenance statement and wrote it to the
 * transparency log. Fifteen minutes later `@trazum/core` and `@trazum/mcp` --
 * published seconds apart in the same job -- were being served at 1.83.0, and
 * `@trazum/cli` was still 1.82.0 on every endpoint the registry has.
 *
 * Nothing noticed, because nothing was looking. So `RELEASES.md` said three
 * packages were on npm at 1.83.0 while `npm install @trazum/cli` gave a
 * stranger the previous one.
 *
 * ## What can be checked here, and what cannot
 *
 * Not the waiting: that needs the registry, and this suite makes no network
 * calls -- `offline.test.js` holds that for the whole product and a test file
 * would be a poor place to break it.
 *
 * **The first version of this file broke it anyway.** The script had no main
 * check, so importing it ran the whole loop and made three HTTPS calls. The
 * suite gave it away by finishing in under a second with the script's own
 * output printed among the results.
 *
 * What is checkable offline is the part that was actually wrong in the workflow
 * before: **which packages get looked at**.
 *
 * The script derives them from the root `workspaces` globs, the same way
 * `publish.test.js` does, because a fourth package added later and not added to
 * a hand-kept list would be a package this check is blind to -- which is the
 * exact shape of the defect it was written to catch. That derivation is what
 * these tests hold, plus the reading of a registry answer, with the fetch
 * handed in.
 */

describe('the release check knows what this repository publishes', () => {
  it('finds every publishable package, from the workspace globs', () => {
    const packages = publishablePackages();
    const names = packages.map((entry) => entry.name).sort();
    assert.deepEqual(names, [
      '@trazum/cli',
      '@trazum/core',
      '@trazum/mcp',
      '@trazum/tokenizer-openai',
    ]);
  });

  it('carries the version each one is publishing, not the root version by proxy', () => {
    /**
     * They are the same today and `publish.test.js` fails the build if they
     * ever drift. Read per package anyway: if that lockstep were ever
     * deliberately broken, a check reading the root version would wait for a
     * number no package was publishing and time out on a correct release.
     */
    const packages = publishablePackages();
    for (const entry of packages) {
      // A release, or a next prerelease (scripts/npm-channel.mjs): the two shapes that publish.
      assert.match(entry.version, /^\d+\.\d+\.\d+(?:-next\.\d+)?$/, `${entry.name} has no version to wait for`);
    }
  });

  it('never looks for a private package, which npm would not have', () => {
    // `apps/web` is a workspace and is not published. Waiting for it would fail
    // every release, forever, on a package that was never meant to be there.
    const names = publishablePackages().map((entry) => entry.name);
    assert.equal(names.includes('@trazum/web'), false);
  });
});

describe('the script does nothing on import', () => {
  it('is importable without contacting anything', () => {
    /**
     * Pinned by the fact that this file imported it above and the suite ran
     * offline. A weak assertion on its own, which is why the shape it guards is
     * stated: the wait is behind a main check, so `node scripts/npm-serves.mjs`
     * runs it and `import` does not.
     */
    const source = readFileSync(
      new URL('../../../scripts/npm-serves.mjs', import.meta.url),
      'utf8',
    );
    assert.match(source, /if \(invokedDirectly\) await main\(\);/);
    assert.equal(
      /^await main\(\);$/m.test(source),
      false,
      'the wait runs at module scope, so importing this script talks to the registry',
    );
  });
});

describe('reading what the registry says is latest', () => {
  const answering = (body, ok = true) => async () => ({
    ok,
    json: async () => body,
  });

  it('reads the latest dist-tag, which is what an install resolves', async () => {
    /*
     * Written as `() => async function () {...}` first, which returns a
     * function nobody calls: it passed, asserted nothing, and would have gone
     * on passing through any defect in the thing it names.
     */
    assert.equal(await servedVersion('@trazum/cli', answering({ latest: '1.83.0' })), '1.83.0');
  });

  it('returns null when the registry refuses, rather than treating it as served', async () => {
    /**
     * The direction that matters. A 404 or a 500 read as "fine" would make the
     * whole check pass on the day the registry is broken, which is the day it
     * is most needed.
     */
    assert.equal(await servedVersion('@trazum/cli', answering({}, false)), null);
  });

  it('returns null when the answer carries no latest tag at all', async () => {
    assert.equal(await servedVersion('@trazum/cli', answering({ beta: '2.0.0' })), null);
  });

  it('asks the dist-tags endpoint for the right package, url-encoded', async () => {
    /**
     * A scoped name contains a slash, and an unencoded one addresses a
     * different path on the registry. The failure would be a 404 read as "not
     * served yet" and a release that waited ten minutes and then failed for the
     * wrong reason.
     */
    let asked = null;
    await servedVersion('@trazum/cli', async (url) => {
      asked = url;
      return { ok: true, json: async () => ({ latest: '1.83.0' }) };
    });
    assert.equal(asked, 'https://registry.npmjs.org/-/package/%40trazum%2Fcli/dist-tags');
  });

  it('sends a no-cache header, because a cached answer is the failure mode', async () => {
    // The whole question is whether something published seconds ago is visible.
    // An intermediary's cached copy answers the question this is not asking.
    let headers = null;
    await servedVersion('@trazum/core', async (_url, options) => {
      headers = options?.headers ?? null;
      return { ok: true, json: async () => ({ latest: '1.83.0' }) };
    });
    assert.equal(headers?.['cache-control'], 'no-cache');
  });
});

/**
 * The half the dist-tag does not answer.
 *
 * 2.7.12's release passed this check at 22:42:49 UTC on 2026-11-17 with every
 * dist-tag at 2.7.12, and `@trazum/core`'s tarball answered 404 until 22:45:55.
 * In between, the version every other package pins could not be installed. The
 * check now asks for the tarball too, and these hold the two answers apart.
 */
describe('a version is served when its tarball is, not when its name is', () => {
  /** A registry: what it calls latest, and whether it hands over a tarball. */
  const registry = ({ latest, tarball }) => {
    const asked = [];
    const fetchImpl = async (url, options = {}) => {
      asked.push({ url, method: options.method ?? 'GET', headers: options.headers ?? {} });
      if (url.endsWith('/dist-tags')) return { ok: true, json: async () => ({ latest }) };
      return { ok: tarball };
    };
    return { fetchImpl, asked };
  };

  it('asks for the address an install fetches, for a scoped name and a bare one', () => {
    assert.equal(tarballUrl('@trazum/core', '2.7.12'), 'https://registry.npmjs.org/@trazum/core/-/core-2.7.12.tgz');
    assert.equal(
      tarballUrl('@trazum/tokenizer-openai', '2.7.12'),
      'https://registry.npmjs.org/@trazum/tokenizer-openai/-/tokenizer-openai-2.7.12.tgz',
    );
    assert.equal(tarballUrl('left-pad', '1.3.0'), 'https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz');
  });

  it('asks with HEAD and no cache, because it wants to know and not to download', async () => {
    const { fetchImpl, asked } = registry({ latest: '2.7.12', tarball: true });
    assert.equal(await tarballServed('@trazum/core', '2.7.12', fetchImpl), true);
    assert.deepEqual(asked.map((call) => [call.url, call.method]), [[tarballUrl('@trazum/core', '2.7.12'), 'HEAD']]);
    assert.equal(asked[0].headers['cache-control'], 'no-cache');
  });

  it('reads a refusal as not served', async () => {
    const { fetchImpl } = registry({ latest: '2.7.12', tarball: false });
    assert.equal(await tarballServed('@trazum/core', '2.7.12', fetchImpl), false);
  });

  it('is done only when the tag names the version and the tarball is there', async () => {
    const { fetchImpl } = registry({ latest: '2.7.12', tarball: true });
    assert.equal(await waitingFor('@trazum/core', '2.7.12', fetchImpl), null);
  });

  it('keeps waiting on a tag that is right over a tarball that is not there: 2.7.12', async () => {
    const { fetchImpl } = registry({ latest: '2.7.12', tarball: false });
    const reason = await waitingFor('@trazum/core', '2.7.12', fetchImpl);
    assert.match(reason, /tarball cannot be downloaded yet/);
    assert.match(reason, /2\.7\.12/);
  });

  it('says the tag is behind, and does not ask for a tarball nobody is pointed at', async () => {
    const { fetchImpl, asked } = registry({ latest: '2.7.11', tarball: true });
    const reason = await waitingFor('@trazum/core', '2.7.12', fetchImpl);
    assert.match(reason, /served at 2\.7\.11, waiting for 2\.7\.12/);
    assert.equal(asked.some((call) => call.method === 'HEAD'), false);
  });

  it('treats a registry that does not answer as still waiting, for either question', async () => {
    const silent = async () => {
      throw new Error('connection reset');
    };
    assert.match(await waitingFor('@trazum/core', '2.7.12', silent), /served at nothing/);
    const tagOnly = async (url) => {
      if (url.endsWith('/dist-tags')) return { ok: true, json: async () => ({ latest: '2.7.12' }) };
      throw new Error('connection reset');
    };
    assert.match(await waitingFor('@trazum/core', '2.7.12', tagOnly), /tarball cannot be downloaded yet/);
  });

  it('is what the wait loop uses, and the failure names which half is missing', () => {
    const source = readFileSync(new URL('../../../scripts/npm-serves.mjs', import.meta.url), 'utf8');
    const main = source.slice(source.indexOf('async function main()'));
    assert.match(main, /await waitingFor\(name, version, fetch, tag\)/);
    assert.doesNotMatch(main, /await servedVersion\(/, 'the loop still decides on the dist-tag alone');
    assert.match(main, /\$\{why\.get\(name\)\}/);
  });
});
