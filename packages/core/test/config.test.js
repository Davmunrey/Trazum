import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CONFIG_FILENAME,
  MAX_CONFIG_BYTES,
  budgetFor,
  loadConfig,
  parseConfig,
  walkPrompts,
} from '../dist/node.js';

const scratch = () => mkdtemp(join(tmpdir(), 'trazum-config-'));

describe('a valid config', () => {
  it('reads every field it documents', () => {
    const config = parseConfig(
      JSON.stringify({
        level: 'aggressive',
        locale: 'es',
        disable: ['intensifiers'],
        usage: {
          model: 'claude-opus-5',
          callsPerMonth: 50000,
          avgOutputTokens: 300,
          cacheHitRate: 0.9,
          batchEligible: true,
        },
        budgets: { 'prompts/**': 2000 },
        maxGrowth: 25,
        extensions: ['.TXT'],
      }),
    );

    assert.equal(config.level, 'aggressive');
    assert.equal(config.locale, 'es');
    assert.deepEqual(config.disable, ['intensifiers']);
    assert.equal(config.usage.callsPerMonth, 50000);
    assert.equal(config.usage.batchEligible, true);
    assert.deepEqual(config.budgets, { 'prompts/**': 2000 });
    assert.equal(config.maxGrowth, 25);
    assert.deepEqual(config.extensions, ['.txt'], 'extensions should be case-insensitive');
  });

  it('an empty object is valid, and means "no opinions"', () => {
    assert.deepEqual(parseConfig('{}'), {});
  });

  it('leaves out what was not set, rather than filling in defaults', () => {
    // The CLI layers config under flags under defaults. A config that
    // materialised defaults would override a flag it never mentioned.
    const config = parseConfig(JSON.stringify({ level: 'safe' }));
    assert.equal(config.level, 'safe');
    assert.equal(config.usage, undefined);
    assert.equal(config.budgets, undefined);
  });
});

describe('an invalid config is loud', () => {
  // Every case here is one where a lenient parser would restore a default and
  // let CI go green for a prompt nobody measured. A config that half-applies is
  // worse than one that will not load.
  const rejects = (document, pattern) => {
    assert.throws(
      () => parseConfig(typeof document === 'string' ? document : JSON.stringify(document)),
      pattern,
    );
  };

  it('rejects malformed JSON', () => {
    rejects('{ "level": ', /not valid JSON/);
  });

  it('rejects a document that is not an object', () => {
    rejects('[]', /top level must be an object/);
    rejects('"safe"', /top level must be an object/);
    rejects('null', /top level must be an object/);
  });

  it('rejects an unknown key and names the nearest real one', () => {
    rejects({ budgts: {} }, /unknown key "budgts" — did you mean "budgets"\?/);
    rejects({ maxgrowth: 5 }, /did you mean "maxGrowth"\?/);
  });

  it('lists the known keys when nothing is close', () => {
    rejects({ somethingElse: 1 }, /Known keys: level, locale, disable/);
  });

  it('rejects an unknown key inside usage', () => {
    rejects({ usage: { callsPerMonths: 5 } }, /usage\.callsPerMonths/);
  });

  it('rejects a bad level, locale, or rule id', () => {
    rejects({ level: 'safeish' }, /"level" must be "safe" or "aggressive"/);
    rejects({ locale: 'fr' }, /not a locale Trazum ships/);
    rejects({ disable: ['intensifier'] }, /did you mean "intensifiers"\?/);
    rejects({ disable: ['nonsense'] }, /Run "trazum rules"/);
    rejects({ disable: 'intensifiers' }, /must be an array/);
  });

  it('rejects an unknown model', () => {
    rejects({ usage: { model: 'gpt-9' } }, /Unknown model/);
  });

  it('rejects numbers that cannot mean what they say', () => {
    rejects({ maxGrowth: -1 }, /0 or more/);
    rejects({ maxGrowth: 'lots' }, /must be a number/);
    rejects({ usage: { cacheHitRate: 90 } }, /fraction between 0 and 1/);
    rejects({ budgets: { 'a/**': 2000.5 } }, /whole number of tokens/);
    rejects({ budgets: { 'a/**': '2000' } }, /must be a number/);
  });

  it('rejects a budget pattern that points outside the project', () => {
    rejects({ budgets: { '/etc/**': 1 } }, /relative path inside the project/);
    rejects({ budgets: { '../other/**': 1 } }, /relative path inside the project/);
    rejects({ budgets: { '': 1 } }, /empty pattern/);
  });

  it('rejects extensions that are not extensions', () => {
    rejects({ extensions: [] }, /non-empty array/);
    rejects({ extensions: ['txt'] }, /look like "\.txt"/);
    rejects({ extensions: ['.'] }, /look like "\.txt"/);
  });

  it('names the file it could not read', () => {
    assert.throws(() => parseConfig('{ bad', 'prompts/trazum.config.json'), /prompts\/trazum\.config\.json/);
  });
});

describe('finding the config file', () => {
  it('finds one in the starting directory', async () => {
    const root = await scratch();
    await writeFile(join(root, CONFIG_FILENAME), '{"level":"aggressive"}');

    const loaded = await loadConfig({ from: root });
    assert.equal(loaded.config.level, 'aggressive');
    assert.match(loaded.path, /trazum\.config\.json$/);
  });

  it('walks upward, so a subdirectory inherits the project config', async () => {
    const root = await scratch();
    const nested = join(root, 'packages', 'thing');
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, CONFIG_FILENAME), '{"maxGrowth":10}');

    assert.equal((await loadConfig({ from: nested })).config.maxGrowth, 10);
  });

  it('stops at a repository root rather than reading past it', async () => {
    // Past the checkout is whatever the CI runner happens to have above it,
    // which is not the project's business.
    const outer = await scratch();
    const repository = join(outer, 'repo');
    const nested = join(repository, 'prompts');
    await mkdir(nested, { recursive: true });
    await mkdir(join(repository, '.git'), { recursive: true });
    await writeFile(join(outer, CONFIG_FILENAME), '{"maxGrowth":999}');

    const loaded = await loadConfig({ from: nested });
    assert.equal(loaded.path, null, 'the config above the repository root should not be read');
    assert.deepEqual(loaded.config, {});
  });

  it('finding nothing is not an error', async () => {
    const root = await scratch();
    const loaded = await loadConfig({ from: root });
    assert.deepEqual(loaded.config, {});
    assert.equal(loaded.path, null);
  });

  it('an explicitly named config that does not exist is an error', async () => {
    // Somebody who names a config file is not asking for defaults.
    const root = await scratch();
    await assert.rejects(
      loadConfig({ explicit: join(root, 'nope.json') }),
      /no such config file/,
    );
  });

  it('refuses a config file past the size limit', async () => {
    const root = await scratch();
    const padding = ' '.repeat(MAX_CONFIG_BYTES + 1);
    await writeFile(join(root, CONFIG_FILENAME), `{"level":"safe"}${padding}`);

    await assert.rejects(loadConfig({ from: root }), /over the \d+-byte limit/);
  });
});

describe('resolving a budget', () => {
  const budgets = { '**': 8000, 'prompts/**': 2000, 'prompts/system.txt': 4000 };

  it('picks the most specific pattern', () => {
    assert.deepEqual(budgetFor('prompts/system.txt', budgets), {
      pattern: 'prompts/system.txt',
      maxTokens: 4000,
    });
    assert.deepEqual(budgetFor('prompts/other.txt', budgets), {
      pattern: 'prompts/**',
      maxTokens: 2000,
    });
    assert.deepEqual(budgetFor('README.md', budgets), { pattern: '**', maxTokens: 8000 });
  });

  it('reports the pattern, not just the number', () => {
    // A file failing against a budget the reader cannot find in their config is
    // a bug report rather than a fix.
    assert.equal(budgetFor('prompts/a.txt', budgets).pattern, 'prompts/**');
  });

  it('returns null when there is no config, or no match', () => {
    assert.equal(budgetFor('prompts/system.txt', undefined), null);
    assert.equal(budgetFor('src/index.ts', { 'prompts/**': 1 }), null);
  });
});

describe('walking a directory for prompts', () => {
  it('finds prompt files, sorted, relative to the root', async () => {
    const root = await scratch();
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'b.txt'), 'b');
    await writeFile(join(root, 'a.md'), 'a');
    await writeFile(join(root, 'nested', 'c.prompt'), 'c');
    await writeFile(join(root, 'ignored.ts'), 'code');

    const { files, truncated } = await walkPrompts(root);
    assert.deepEqual(files, ['a.md', 'b.txt', 'nested/c.prompt']);
    assert.equal(truncated, false);
  });

  it('honours the configured extensions and nothing else', async () => {
    const root = await scratch();
    await writeFile(join(root, 'a.txt'), 'a');
    await writeFile(join(root, 'b.md'), 'b');

    const { files } = await walkPrompts(root, { extensions: ['.md'] });
    assert.deepEqual(files, ['b.md']);
  });

  it('skips the directories that are never prompts', async () => {
    const root = await scratch();
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await mkdir(join(root, '.hidden'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'a.txt'), 'a');
    await writeFile(join(root, '.hidden', 'b.txt'), 'b');
    await writeFile(join(root, 'c.txt'), 'c');

    assert.deepEqual((await walkPrompts(root)).files, ['c.txt']);
  });

  it('does not follow a symlink', async () => {
    // A link to /etc turns "check the prompts folder" into printing token
    // counts for files outside the project; a link loop turns it into a hang.
    const root = await scratch();
    const outside = await scratch();
    await writeFile(join(outside, 'secret.txt'), 'not yours');
    await writeFile(join(root, 'own.txt'), 'mine');
    await symlink(outside, join(root, 'link'), 'dir');
    await symlink(join(outside, 'secret.txt'), join(root, 'linked.txt'));

    const { files } = await walkPrompts(root);
    assert.deepEqual(files, ['own.txt']);
  });

  it('reports truncation rather than silently returning a short list', async () => {
    // "Nothing over budget" and "I stopped looking" must not read the same.
    const root = await scratch();
    for (const name of ['a', 'b', 'c']) await writeFile(join(root, `${name}.txt`), name);

    const { files, truncated } = await walkPrompts(root, { maxFiles: 2 });
    assert.equal(files.length, 2);
    assert.equal(truncated, true);
  });

  it('reports truncation when the tree is deeper than the limit', async () => {
    const root = await scratch();
    await mkdir(join(root, 'a', 'b', 'c'), { recursive: true });
    await writeFile(join(root, 'a', 'b', 'c', 'deep.txt'), 'deep');

    const shallow = await walkPrompts(root, { maxDepth: 1 });
    assert.deepEqual(shallow.files, []);
    assert.equal(shallow.truncated, true);
  });

  it('a missing directory yields nothing rather than throwing', async () => {
    const { files } = await walkPrompts(join(await scratch(), 'nope'));
    assert.deepEqual(files, []);
  });
});
