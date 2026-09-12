import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adoptionFigures, adoptionLine } from '../../../scripts/adoption.mjs';

/**
 * The adoption line, without a network.
 *
 * What is tested is the one property that matters: a counter that could not
 * be read is printed as unavailable and never as zero. A zero says the
 * product has no users, which is a claim; an unavailable is a fact about the
 * run.
 */

const answering = (bodies) => async (url) => {
  const body = bodies[Object.keys(bodies).find((key) => url.includes(key))];
  if (body === undefined) throw new Error('connect_rejected');
  if (body === 'http-500') return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => body };
};

describe('the adoption figures, read for RELEASES.md', () => {
  it('reads the three counters off their published shapes', async () => {
    const figures = await adoptionFigures(
      answering({
        'api.npmjs.org': { downloads: 212, start: '2026-08-12', end: '2026-09-10', package: '@trazum/cli' },
        'api.github.com': { stargazers_count: 17 },
        'registry.modelcontextprotocol.io': { servers: [{ server: { version: '2.3.0' } }] },
      }),
    );
    assert.equal(figures.downloads.value, 212);
    assert.equal(figures.stars.value, 17);
    assert.equal(figures.registry.value, '2.3.0');
    assert.match(adoptionLine(figures), /212 downloads of @trazum\/cli in the last 30 days, 17 GitHub stars, MCP registry latest 2\.3\.0\./);
  });

  it('prints a counter it could not read as unavailable, never as zero', async () => {
    const figures = await adoptionFigures(
      answering({
        'api.github.com': 'http-500',
        'registry.modelcontextprotocol.io': { servers: [] },
      }),
    );
    const line = adoptionLine(figures);
    assert.match(line, /downloads of @trazum\/cli in the last 30 days: unavailable \(connect_rejected\)/);
    assert.match(line, /GitHub stars: unavailable \(HTTP 500\)/);
    assert.match(line, /MCP registry latest unavailable \(the answer had no such field\)/);
    assert.equal(/\b0 /.test(line), false, 'an unread counter was printed as zero');
  });
});
