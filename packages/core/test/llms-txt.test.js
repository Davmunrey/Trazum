import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * `llms.txt` and `llms-full.txt` are the documentation, not a second copy of it.
 *
 * Both files are written by `scripts/build-docs-site.mjs` (through
 * `scripts/llms-txt.mjs`) from the manifest and the documents it lists, into
 * `apps/web/public`, where the site serves static files. They are ignored by
 * git like the rest of that script's output, so this builds them in memory and
 * holds the result to the documents: the format, the links, the manifest's
 * order, and the same bytes every time.
 */

let builder;
let generator;
let manifest;
let built;
let again;
let files;

before(async () => {
  builder = await import('../../../scripts/build-docs-site.mjs');
  generator = await import('../../../scripts/llms-txt.mjs');
  manifest = await import('../../../apps/web/lib/docs/manifest.ts');
  const result = builder.buildDocs({ root });
  assert.deepEqual(result.errors, [], 'the documents do not build, so nothing can be compared with them');
  built = generator.buildLlms(result, root);
  again = generator.buildLlms(result, root);
  files = { 'llms.txt': built.llms, 'llms-full.txt': built.full };
});

const onDisk = (name) => files[name];

describe('the builder is a function of the documents', () => {
  it('gives the same bytes when it runs twice, and again from a fresh build of the documents', () => {
    assert.equal(again.llms, built.llms);
    assert.equal(again.full, built.full);
    const fresh = generator.buildLlms(builder.buildDocs({ root }), root);
    assert.equal(fresh.llms, built.llms);
    assert.equal(fresh.full, built.full);
  });

  it('writes both files, with those bytes, where the web app serves static files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llms-'));
    try {
      generator.writeLlms(builder.buildDocs({ root }), { root, publicDir: dir });
      assert.equal(readFileSync(join(dir, 'llms.txt'), 'utf8'), built.llms);
      assert.equal(readFileSync(join(dir, 'llms-full.txt'), 'utf8'), built.full);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(generator.PUBLIC_DIR, 'apps/web/public');
  });
});

describe('llms.txt follows the llmstxt.org format', () => {
  const lines = () => onDisk('llms.txt').split('\n');

  it('opens with one H1 and then a blockquote summary', () => {
    const [h1, blank, quote] = lines();
    assert.match(h1, /^# \S/);
    assert.equal(blank, '');
    assert.match(quote, /^> \S/);
    assert.equal(lines().filter((line) => /^# /.test(line)).length, 1, 'one H1 only');
  });

  it('is, after that, H2 sections of `- [name](url): notes` items, and Optional is last', () => {
    const body = lines().slice(3);
    const headings = body.filter((line) => line.startsWith('#'));
    assert.ok(headings.length > 0 && headings.every((line) => /^## \S/.test(line)), 'only H2 headings follow the summary');
    assert.equal(headings.at(-1), '## Optional');
    for (const line of body.filter((l) => l !== '' && !l.startsWith('## '))) {
      assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)\s]+\): \S/, `not a list item with a link and a note: ${line}`);
    }
  });

  it('ends with one newline', () => {
    assert.match(onDisk('llms.txt'), /[^\n]\n$/);
  });
});

describe('llms.txt and the documents agree', () => {
  it('links every published document once, to its page, and each one exists', () => {
    const links = [...onDisk('llms.txt').matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]);
    const pages = links.filter((url) => url.startsWith(`${generator.SITE}/docs/`));
    assert.deepEqual(
      pages,
      manifest.DOCS.map((doc) => generator.pageUrl(doc.slug)),
      'the pages linked are the manifest, in its order',
    );
    for (const doc of manifest.DOCS) assert.ok(existsSync(join(root, doc.path)), `${doc.path} is linked and is not there`);
    assert.deepEqual(
      links.filter((url) => !url.startsWith(`${generator.SITE}/docs/`)),
      [`${generator.SITE}/llms-full.txt`],
      'the one other link is the full text',
    );
  });

  it('puts every document, unchanged and in order, into llms-full.txt', () => {
    const full = onDisk('llms-full.txt');
    let at = 0;
    for (const doc of manifest.DOCS) {
      const text = readFileSync(join(root, doc.path), 'utf8').trim();
      const found = full.indexOf(text, at);
      assert.notEqual(found, -1, `${doc.path} is missing from llms-full.txt, or out of order`);
      at = found + text.length;
    }
  });

  it('has a page for people building on the JSON, linked from the index and the README', () => {
    assert.ok(manifest.DOCS.some((doc) => doc.path === 'docs/building-on-the-json.md'));
    assert.match(readFileSync(join(root, 'docs/README.md'), 'utf8'), /\]\(building-on-the-json\.md\)/);
    assert.match(readFileSync(join(root, 'README.md'), 'utf8'), /\]\(docs\/building-on-the-json\.md\)/);
  });
});

describe('the page for people building on the JSON', () => {
  const page = () => readFileSync(join(root, 'docs/building-on-the-json.md'), 'utf8');

  it('links every contract section of json-output.md, and each section it links exists', () => {
    const json = readFileSync(join(root, 'docs/json-output.md'), 'utf8');
    const slug = (heading) =>
      heading
        .toLowerCase()
        .replace(/[^a-z0-9 _-]/g, '')
        .replace(/ /g, '-');
    const anchors = new Set([...json.matchAll(/^#{2,3} (.*)$/gm)].map((match) => slug(match[1])));
    const linked = [...page().matchAll(/\]\(json-output\.md#([^)]+)\)/g)].map((match) => match[1]);
    assert.ok(linked.length > 0);
    for (const anchor of linked) assert.ok(anchors.has(anchor), `json-output.md has no section for #${anchor}`);

    const contracts = [...json.matchAll(/^## (.*)\n((?:(?!^## )[\s\S])*)/gm)]
      .filter((match) => match[2].includes('| Field | What it holds |'))
      .map((match) => slug(match[1]));
    assert.ok(contracts.length > 20, 'the contract tables were not found');
    for (const anchor of contracts) assert.ok(linked.includes(anchor), `the page does not link the contract #${anchor}`);
  });

  it('says what the issue asked it to say', () => {
    const text = page();
    assert.match(text, /versioned/i);
    assert.match(text, /held by tests/i);
    assert.match(text, /What is stable and what is not/);
    assert.match(text, /leaderboard/);
  });

  it('has no em-dash', () => {
    assert.ok(!page().includes('—'));
  });
});
