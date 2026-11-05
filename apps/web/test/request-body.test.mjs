import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Every route that reads a body reads JSON, and refuses a body that does not
 * say it is JSON (OWASP ASVS 4.0.3 13.1.5 and 13.2.5).
 *
 * The three content types a page on another site can send without asking the
 * browser first are `text/plain`, `application/x-www-form-urlencoded` and
 * `multipart/form-data`. Each of them used to be parsed if its body happened
 * to be JSON. Each is now a 415 before a byte is read.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const APP = fileURLToPath(new URL('../app/', import.meta.url));
const CROSS_SITE_TYPES = ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'];

let saysJson;
const routes = {};

before(async () => {
  ({ saysJson } = await import('../lib/request-body.ts'));
  for (const name of ['optimize', 'compare', 'write']) {
    routes[name] = (await import(`../app/api/${name}/route.ts`)).POST;
  }
});

function routeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

describe('saysJson', () => {
  it('accepts JSON with or without parameters, in any case', () => {
    for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', ' application/json ;charset=UTF-8']) {
      assert.equal(saysJson(new Request(ORIGIN, { method: 'POST', headers: { 'content-type': type } })), true, type);
    }
  });

  it('refuses every other type, a lookalike, and no type at all', () => {
    for (const type of [...CROSS_SITE_TYPES, 'application/jsonx', 'application/json-patch+json', 'text/json', '']) {
      assert.equal(saysJson(new Request(ORIGIN, { method: 'POST', headers: { 'content-type': type } })), false, type);
    }
    assert.equal(saysJson(new Request(ORIGIN, { method: 'POST', body: '{}' })), false, 'a body with no declared type');
  });
});

describe('every route that reads a body checks its type first', () => {
  it('in the source: each `request.json()` comes after a `saysJson(request)`', () => {
    const readers = routeFiles(APP).filter((path) => readFileSync(path, 'utf8').includes('request.json()'));
    assert.ok(readers.length >= 7, `only ${readers.length} routes read a body: has the shape changed?`);
    for (const path of readers) {
      const source = readFileSync(path, 'utf8');
      const reads = [...source.matchAll(/request\.json\(\)/g)].map((m) => m.index);
      const checks = [...source.matchAll(/saysJson\(request\)/g)].map((m) => m.index);
      assert.equal(checks.length, reads.length, `${relative(APP, path)}: ${reads.length} reads, ${checks.length} checks`);
      reads.forEach((at, i) => assert.ok(checks[i] < at, `${relative(APP, path)}: a body is read before its type is checked`));
    }
  });

  for (const name of ['optimize', 'compare', 'write']) {
    it(`/api/${name} answers 415 to a cross-site type, in the caller's language`, async () => {
      for (const type of CROSS_SITE_TYPES) {
        const response = await routes[name](
          new Request(`${ORIGIN}/api/${name}`, {
            method: 'POST',
            headers: { 'content-type': type, 'x-forwarded-for': `192.0.2.${CROSS_SITE_TYPES.indexOf(type) + 1}` },
            body: JSON.stringify({ prompt: 'Summarise this.', answers: {} }),
          }),
        );
        assert.equal(response.status, 415, `${type} was read`);
      }
      const spanish = await routes[name](
        new Request(`${ORIGIN}/api/${name}`, {
          method: 'POST',
          headers: { 'content-type': 'text/plain', 'accept-language': 'es-ES', 'x-forwarded-for': '192.0.2.50' },
          body: '{}',
        }),
      );
      assert.match((await spanish.json()).error, /Envía el cuerpo como JSON/);
    });
  }

  it('still reads JSON that declares a charset', async () => {
    const response = await routes.write(
      new Request(`${ORIGIN}/api/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-forwarded-for': '192.0.2.60' },
        body: JSON.stringify({ answers: {} }),
      }),
    );
    assert.equal(response.status, 200);
  });
});

describe('and every request the app sends with a body says it is JSON', () => {
  /**
   * The server half is no use if the page forgets the header: account
   * deletion did, and would have answered every press of the button with a
   * 415. Each `fetch(` in the components that carries a body has to carry the
   * header in the same call.
   */
  const COMPONENTS = fileURLToPath(new URL('../components/', import.meta.url));

  function fetchCalls(source) {
    const calls = [];
    for (const match of source.matchAll(/fetch\(/g)) {
      let depth = 0;
      for (let i = match.index + 'fetch'.length; i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        if (source[i] === ')' && --depth === 0) {
          calls.push(source.slice(match.index, i + 1));
          break;
        }
      }
    }
    return calls;
  }

  it('in every component', () => {
    let withBody = 0;
    for (const name of readdirSync(COMPONENTS).filter((n) => n.endsWith('.tsx'))) {
      for (const call of fetchCalls(readFileSync(join(COMPONENTS, name), 'utf8'))) {
        if (!/\bbody:/.test(call)) continue;
        withBody += 1;
        assert.match(call, /'content-type': 'application\/json'/, `${name}: ${call.split('\n')[0]} sends a body without saying it is JSON`);
      }
    }
    assert.ok(withBody >= 5, `only ${withBody} fetches with a body: has the shape changed?`);
  });
});

