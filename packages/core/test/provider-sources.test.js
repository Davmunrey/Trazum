import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MODELS, PROVIDER_REVIEWED } from '../dist/index.js';
import { PROVIDER_SOURCES } from '../dist/pricing.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The pages a provider's prices were read from, held to the prose that says
 * so (#784).
 *
 * `PROVIDER_SOURCES` is a copy of what the comment above each date in
 * `PROVIDER_REVIEWED` already says, made so the published dataset can put a
 * page beside every price without reading prose. A copy can drift from what
 * it copies, and a source page nobody read, printed beside a date, is a claim
 * this product does not make. So every page has to be named in the comment
 * above its provider's date, and every provider with a date has pages.
 */

/** The comment above each provider's date in `PROVIDER_REVIEWED`, joined into one line. */
function reviewComments(source) {
  const start = source.indexOf('export const PROVIDER_REVIEWED');
  const end = source.indexOf('});', start);
  assert.ok(start !== -1 && end !== -1, 'pricing.ts has no PROVIDER_REVIEWED');
  const found = {};
  let comment = [];
  for (const line of source.slice(start, end).split('\n').slice(1)) {
    const entry = /^\s*([a-z][a-z0-9_]*): '\d{4}-\d{2}-\d{2}',$/.exec(line);
    if (entry !== null) {
      found[entry[1]] = comment.join(' ');
      comment = [];
    } else {
      comment.push(line.trim().replace(/^\/?\*+\/?\s?/, ''));
    }
  }
  return found;
}

/**
 * Whether a comment names a page: its address without the scheme or a final
 * slash, or, the shorthand the Mistral comment uses for sibling pages
 * ("mistral.ai/news/mistral-3/, /mistral-small-4/"), its parent's address in
 * full and its last segment between slashes.
 */
function names(comment, page) {
  const url = new URL(page);
  const address = `${url.hostname}${url.pathname}`.replace(/\/$/, '');
  if (comment.includes(address)) return true;
  const segments = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (segments.length < 2) return false;
  const parent = `${url.hostname}/${segments.slice(0, -1).join('/')}/`;
  return comment.includes(parent) && comment.includes(`/${segments.at(-1)}/`);
}

describe('where each provider was read', () => {
  const comments = reviewComments(readFileSync(join(ROOT, 'packages/core/src/pricing.ts'), 'utf8'));

  it('names pages for exactly the providers that have a review date', () => {
    assert.deepEqual(Object.keys(PROVIDER_SOURCES).sort(), Object.keys(PROVIDER_REVIEWED).sort());
    assert.deepEqual(Object.keys(comments).sort(), Object.keys(PROVIDER_REVIEWED).sort(), 'a date has no comment above it');
    for (const provider of new Set(MODELS.map((model) => model.provider))) {
      assert.ok((PROVIDER_SOURCES[provider] ?? []).length > 0, `${provider} prices models and names no page`);
    }
  });

  it('gives every page as an https address, once', () => {
    for (const [provider, pages] of Object.entries(PROVIDER_SOURCES)) {
      assert.equal(new Set(pages).size, pages.length, `${provider} names a page twice`);
      for (const page of pages) assert.equal(new URL(page).protocol, 'https:', `${provider}: ${page}`);
    }
  });

  it('names only pages the comment above that provider\'s date names', () => {
    for (const [provider, pages] of Object.entries(PROVIDER_SOURCES)) {
      for (const page of pages) assert.ok(names(comments[provider], page), `${provider}: ${page} is not a page its review comment names`);
    }
  });

  it('reads a page named only by its parent and last segment, and refuses one the comment names nowhere', () => {
    const comment = 'the model cards at mistral.ai/news/mistral-3/, /mistral-small-4/ and nothing else';
    assert.ok(names(comment, 'https://mistral.ai/news/mistral-3/'));
    assert.ok(names(comment, 'https://mistral.ai/news/mistral-small-4/'));
    assert.ok(!names(comment, 'https://mistral.ai/news/mistral-large-9/'));
    assert.ok(!names(comment, 'https://mistral.ai/pricing'));
    assert.ok(!names('read at example.com/docs/pricing', 'https://other.example/docs/pricing'));
  });
});
