import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Only the methods a route serves get through (OWASP ASVS 4.0.3 14.5.1).
 *
 * The middleware refuses any other method on an API route with a 405, an
 * `Allow` header and one `input.refused` line, using the table in
 * `lib/api-methods.ts`. The table is written by hand, so the first test here
 * imports every route module and holds the table to what each one exports.
 */

register('./helpers/loader.mjs', import.meta.url);

const API = fileURLToPath(new URL('../app/api/', import.meta.url));
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ORIGIN = 'https://trazum.example';

let table, middleware, NextRequest, log;
let lines = [];
let restore;

before(async () => {
  table = await import('../lib/api-methods.ts');
  ({ middleware } = await import('../middleware.ts'));
  ({ NextRequest } = await import('next/server'));
  log = await import('../lib/security-log.ts');
  restore = log.captureSecurityLog((line) => lines.push(line));
});
after(() => restore?.());

const routeFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });

/** `/api/prompts/[id]` with a value in place of each parameter. */
const concrete = (pattern) => pattern.replace(/\[[^\]/]+\]/g, '0f8fad5b-d9cb-469f-a165-70867728950e');

describe('the table of methods', () => {
  it('is what the route modules export, every route and every method', async () => {
    const derived = {};
    for (const path of routeFiles(API)) {
      const module = await import(pathToFileURL(path).href);
      const pattern = `/api/${relative(API, dirname(path)).split('\\').join('/')}`;
      derived[pattern] = METHODS.filter((method) => typeof module[method] === 'function').sort();
    }
    assert.ok(Object.keys(derived).length >= 14, 'found too few routes: has app/api moved?');
    const written = Object.fromEntries(Object.entries(table.API_METHODS).map(([k, v]) => [k, [...v].sort()]));
    assert.deepEqual(written, derived, 'lib/api-methods.ts no longer says what the routes serve');
  });

  it('matches a literal segment before a parameter, and nothing that is not a route', () => {
    assert.equal(table.apiRoute('/api/prompts')?.pattern, '/api/prompts');
    assert.equal(table.apiRoute('/api/prompts/abc')?.pattern, '/api/prompts/[id]');
    assert.equal(table.apiRoute('/api/prompts/')?.pattern, '/api/prompts');
    assert.equal(table.apiRoute('/api/shares/tok')?.pattern, '/api/shares/[token]');
    assert.equal(table.apiRoute('/api/nothing-here'), null);
    assert.equal(table.apiRoute('/api/prompts/a/b'), null);
    // No two routes here collide yet, so the rule is held on a table that does.
    const colliding = { '/api/x/[id]': ['GET'], '/api/x/new': ['POST'] };
    assert.equal(table.apiRoute('/api/x/new', colliding)?.pattern, '/api/x/new');
    assert.equal(table.apiRoute('/api/x/42', colliding)?.pattern, '/api/x/[id]');
  });
});

describe('the middleware', () => {
  const ask = (path, method) => middleware(new NextRequest(`${ORIGIN}${path}`, { method }));

  it('lets every method a route serves through, HEAD wherever GET is, and refuses the rest', async () => {
    let refused = 0;
    for (const [pattern, served] of Object.entries(table.API_METHODS)) {
      const allow = table.allowed(served);
      for (const method of METHODS) {
        lines = [];
        const response = ask(concrete(pattern), method);
        if (allow.includes(method)) {
          assert.notEqual(response.status, 405, `${method} ${pattern} is served and was refused`);
          assert.deepEqual(lines, [], `${method} ${pattern} is served and was recorded`);
          continue;
        }
        refused += 1;
        assert.equal(response.status, 405, `${method} ${pattern} is not served and got through`);
        assert.equal(response.headers.get('allow'), allow.join(', '));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual((await response.json()), { error: 'method not allowed' });
        const [line, ...rest] = lines.map((l) => JSON.parse(l));
        assert.equal(rest.length, 0, `${method} ${pattern} wrote more than one line`);
        assert.deepEqual(
          { event: line.event, reason: line.reason, outcome: line.outcome },
          { event: 'input.refused', reason: 'method_not_allowed', outcome: 'failure' },
        );
        // The record names the route, never the id or token in the path.
        assert.equal(line.route, pattern.replace(/\[[^\]/]+\]/g, ':token'));
      }
    }
    assert.ok(refused > 50, `only ${refused} refusals checked`);
  });

  it('refuses a preflight, which this app never answers', () => {
    const response = ask('/api/prompts', 'OPTIONS');
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, POST, HEAD');
  });

  it('leaves a path no API route matches, and every page, to Next', () => {
    lines = [];
    assert.notEqual(ask('/api/nothing-here', 'PUT').status, 405);
    assert.notEqual(ask('/landing', 'POST').status, 405);
    assert.deepEqual(lines, []);
  });
});
