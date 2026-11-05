import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Every body the API accepts is declared, and checked before it is used
 * (OWASP ASVS 4.0.3 5.1.4, 13.2.2).
 *
 * Three things are held here. The validator itself, kind by kind. The routes,
 * read as source: each body a route reads goes through `readBody` with the
 * schema `lib/body-schemas.ts` lists for that route and method, and nothing
 * reads a body any other way. And the bodies that used to break a route,
 * sent for real to every route that reads one: before the schemas, a body of
 * `null` answered 500 on three of them.
 */

register('./helpers/loader.mjs', import.meta.url);

const ORIGIN = 'https://trazum.example';
const ENV = {
  TRAZUM_GITHUB_CLIENT_ID: 'Iv1.abc',
  TRAZUM_GITHUB_CLIENT_SECRET: 'shhh',
  TRAZUM_PUBLIC_URL: ORIGIN,
};

let schema, bodies;
const saved = {};

before(async () => {
  for (const key of Object.keys(ENV)) saved[key] = process.env[key];
  Object.assign(process.env, ENV);
  schema = await import('../lib/schema.ts');
  bodies = await import('../lib/body-schemas.ts');
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const refused = (result) => {
  assert.equal(result.ok, false, `accepted: ${JSON.stringify(result.value)}`);
  return result.issue;
};

describe('the validator', () => {
  it('takes text as text, measured, trimmed only when asked, and never blank when it must say something', () => {
    const { check, text } = schema;
    assert.deepEqual(check(text({ max: 5 }), 'abc'), { ok: true, value: 'abc' });
    assert.equal(refused(check(text({ max: 5 }), 7)).problem, 'type');
    assert.equal(refused(check(text({ max: 5 }), 'abcdef')).problem, 'long');
    assert.equal(refused(check(text({ max: 5, nonBlank: true }), '  \n')).problem, 'blank');
    assert.deepEqual(check(text({ max: 3, trim: true }), '  abc  '), { ok: true, value: 'abc' });
    assert.deepEqual(check(text({ max: 9 }), ' ab '), { ok: true, value: ' ab ' }, 'trimmed without being asked');
    assert.equal(refused(check(text({ max: 4, pattern: /^[a-f]+$/ }), 'abcz')).problem, 'pattern');
  });

  it('takes true and false and nothing that looks like them', () => {
    const { check, flag } = schema;
    assert.deepEqual(check(flag(), false), { ok: true, value: false });
    for (const value of ['true', 'false', 1, 0, null, {}]) assert.equal(refused(check(flag(), value)).problem, 'type', String(value));
  });

  it('takes a finite number in range, and clamps only when the schema says so', () => {
    const { check, number } = schema;
    assert.deepEqual(check(number({ min: 0, max: 1 }), 0.5), { ok: true, value: 0.5 });
    for (const value of ['1', NaN, Infinity, null]) assert.equal(refused(check(number({ min: 0, max: 1 }), value)).problem, 'type');
    assert.equal(refused(check(number({ min: 0, max: 1 }), 2)).problem, 'range');
    assert.deepEqual(check(number({ min: 0, max: 1, clamp: true }), 2), { ok: true, value: 1 });
    assert.deepEqual(check(number({ min: 0, max: 1, clamp: true }), -3), { ok: true, value: 0 });
    assert.equal(refused(check(number({ min: 0, max: 1, clamp: true }), '2')).problem, 'type', 'clamped a string');
  });

  it('takes a word from its list, and not a property every object has', () => {
    const { check, oneOf } = schema;
    const ttl = oneOf(['7', '30', 'never']);
    assert.deepEqual(check(ttl, '30'), { ok: true, value: '30' });
    // `"toString" in SHARE_TTL_DAYS` is true, and the share route used `in`.
    for (const word of ['toString', 'constructor', '__proto__', '31']) {
      const issue = refused(check(ttl, word));
      assert.equal(issue.problem, 'choice');
      assert.equal(issue.got, word);
    }
    assert.equal(refused(check(ttl, 30)).problem, 'type');
  });

  it('takes a list of what it declares, up to its count, and says which entry is wrong', () => {
    const { check, list, oneOf } = schema;
    const rules = list(oneOf(['a', 'b']), { max: 2 });
    assert.deepEqual(check(rules, ['b']), { ok: true, value: ['b'] });
    assert.equal(refused(check(rules, 'a')).problem, 'type');
    assert.equal(refused(check(rules, ['a', 'b', 'a'])).problem, 'many');
    assert.deepEqual(refused(check(rules, ['a', 'c'])).path, ['1']);
  });

  it('refuses an unknown field by name, before a missing one, wherever it is', () => {
    const { check, object, optional, text } = schema;
    const body = object({ prompt: text({ max: 9 }), llm: optional(object({ apiKey: optional(text({ max: 9 })) })) });
    const misspelt = refused(check(body, { promt: 'x' }));
    assert.deepEqual([misspelt.problem, misspelt.path, misspelt.got], ['unknown', ['promt'], 'promt']);
    assert.deepEqual(misspelt.expected, { kind: 'object', fields: ['prompt', 'llm'] });
    const nested = refused(check(body, { prompt: 'x', llm: { apikey: 'k' } }));
    assert.deepEqual(nested.path, ['llm', 'apikey']);
    assert.deepEqual(refused(check(body, {})).path, ['prompt']);
    assert.equal(refused(check(body, {})).problem, 'missing');
    assert.deepEqual(refused(check(body, { prompt: 'x', llm: { apiKey: 5 } })).path, ['llm', 'apiKey']);
  });

  it('takes nothing but an object where an object goes, a body of null included', () => {
    const { check, object } = schema;
    for (const value of [null, [], 'text', 7, true]) {
      const issue = refused(check(object({}), value));
      assert.deepEqual([issue.problem, issue.path], ['type', []], JSON.stringify(value));
    }
  });

  it('reads null as left out, unless the field keeps it as an answer of its own', () => {
    const { check, object, optional, text } = schema;
    const body = object({ note: optional(text({ max: 9 })), answer: optional(text({ max: 9 }), { null: 'kept' }) });
    assert.deepEqual(check(body, { note: null, answer: null }), { ok: true, value: { answer: null } });
    assert.deepEqual(check(body, {}), { ok: true, value: {} });
    assert.equal(refused(check(object({ name: text({ max: 9 }) }), { name: null })).problem, 'missing');
  });

  it('builds what it returns from its own keys, so the input reaches nothing else', () => {
    const { check, object, optional, text } = schema;
    // `__proto__` as JSON.parse produces it: an own key, not the prototype.
    const parsed = JSON.parse('{"name": "x", "__proto__": {"polluted": true}}');
    assert.equal(refused(check(object({ name: text({ max: 9 }) }), parsed)).got, '__proto__');
    const value = check(object({ name: text({ max: 9 }), note: optional(text({ max: 9 })) }), { name: 'x' }).value;
    assert.deepEqual(Object.keys(value), ['name']);
    assert.equal({}.polluted, undefined);
  });
});

describe('the words a refusal uses', () => {
  it('name the field and what it takes, in the caller\u2019s language', async () => {
    const { getWebMessages } = await import('../lib/i18n/index.ts');
    const say = (raw, locale) => bodies.readBody(bodies.OPTIMIZE, raw, getWebMessages(locale)).message;
    assert.match(say({ prompt: 'x', level: 'medium' }, 'en'), /"level" must be one of: safe, aggressive\./);
    assert.match(say({ prompt: 'x', level: 'medium' }, 'es'), /"level" debe ser uno de: safe, aggressive\./);
    assert.match(say({ prompt: 'x', disable_rules: [] }, 'en'), /"disable_rules" is not a field .* It takes: prompt, level,/);
    assert.match(say({ prompt: 'x', llm: { apiKey: 5 } }, 'en'), /"llm\.apiKey" must be text\./);
    assert.match(say({ prompt: 'x', llm: { provider: 'ollama' } }, 'es'), /"llm\.provider" debe ser uno de: openai, anthropic\./);
    assert.match(say(null, 'en'), /^The body must be a JSON object\.$/);
    assert.match(say([], 'es'), /^El cuerpo debe ser un objeto JSON\.$/);
    // A body's own words win where it has them.
    assert.match(say({}, 'en'), /^The prompt is missing\.$/);
    assert.match(say({ prompt: 'x', disableRules: ['nope'] }, 'en'), /Unknown rule: "nope"/);
    assert.match(say({ prompt: 'x', usage: { model: 'gpt-9' } }, 'en'), /Unknown model: "gpt-9"/);
  });

  it('list a long set of words by its first twelve and a count', async () => {
    const { getWebMessages } = await import('../lib/i18n/index.ts');
    const issue = refused(schema.check(schema.oneOf(Array.from({ length: 20 }, (_, i) => `w${i}`)), 'x'));
    assert.match(getWebMessages('en').api.badInput({ ...issue, path: ['f'] }), /w11 and 8 more\.$/);
  });
});

// ---------------------------------------------------------------------------
// The routes, read as source
// ---------------------------------------------------------------------------

const API = fileURLToPath(new URL('../app/api/', import.meta.url));
const routeFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
const routes = routeFiles(API).map((path) => ({
  route: `/api/${relative(API, dirname(path)).split('\\').join('/')}`,
  source: readFileSync(path, 'utf8'),
}));

/** The top-level function a method's export wraps, from its name to the next top-level declaration. */
function handlerOf(source, method) {
  const wrapped = source.match(new RegExp(`^export const ${method} = logsRefusedInput\\((\\w+)\\);$`, 'm'));
  if (!wrapped) return null;
  const start = source.search(new RegExp(`^async function ${wrapped[1]}\\(`, 'm'));
  assert.ok(start >= 0, `${wrapped[1]} is exported and not declared`);
  const rest = source.slice(start + 1);
  const end = rest.search(/^(?:export |async function |function |const |let )/m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('every route that reads a body', () => {
  it('reads it through the schema the table names for its route and method, and only that one', () => {
    const found = {};
    for (const { route, source } of routes) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const handler = handlerOf(source, method);
        if (handler === null || !handler.includes('request.json()')) continue;
        const used = [...handler.matchAll(/readBody\((\w+), raw\b/g)].map((m) => m[1]);
        found[`${method} ${route}`] = used;
      }
    }
    const declared = Object.fromEntries(
      Object.entries(bodies.BODIES).map(([key, body]) => [key, [Object.entries(bodies).find(([, v]) => v === body)[0]]]),
    );
    assert.deepEqual(found, declared, 'lib/body-schemas.ts BODIES and the routes disagree');
    assert.ok(Object.keys(found).length >= 9, 'found too few body readers: has app/api moved?');
  });

  it('keeps the parsed JSON as unknown until the schema has passed it', () => {
    for (const { route, source } of routes) {
      if (!source.includes('request.json()')) continue;
      assert.doesNotMatch(source, /request\.json\(\)\)?\s*as\b/, `${route} casts a body it has not checked`);
      assert.doesNotMatch(source, /request\.json\(\)\)?\s*\?\./, `${route} reads into a body it has not checked`);
      const reads = source.split('request.json()').length - 1;
      const assigned = source.split('raw = await request.json();').length - 1;
      assert.equal(assigned, reads, `${route}: ${reads} reads, ${assigned} into \`raw\``);
      const checks = source.split(/readBody\(\w+, raw\b/).length - 1;
      assert.equal(checks, reads, `${route}: ${reads} reads, ${checks} checked`);
      // Nothing between the parse and the check touches `raw` but the locale.
      for (const [, between] of source.matchAll(/raw = await request\.json\(\);([\s\S]*?)readBody\(/g)) {
        const uses = [...between.matchAll(/\braw\b/g)].length;
        const forLocale = [...between.matchAll(/localeOf\(request, raw\)/g)].length;
        assert.equal(uses, forLocale, `${route} reads \`raw\` before its schema does`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The bodies that broke a route, sent to every route that reads one
// ---------------------------------------------------------------------------

describe('a body of the wrong shape, sent for real', () => {
  let store, user, cookie, prompt, clients = 0;
  const call = async (key, raw) => {
    const [method, route] = key.split(' ');
    const file = `../app/api${route.slice(4)}/route.ts`;
    const handlers = await import(file);
    clients += 1;
    const request = new Request(`${ORIGIN}${route.replace('[id]', prompt)}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${clients % 250}`,
        cookie,
      },
      body: raw,
    });
    const context = route.includes('[id]') ? { params: Promise.resolve({ id: prompt }) } : undefined;
    return handlers[method](request, context);
  };

  before(async () => {
    const { getStore, resetStore } = await import('../lib/store/index.ts');
    const { issueSession } = await import('../lib/auth/session.ts');
    resetStore();
    store = await getStore();
    const now = new Date();
    user = await store.upsertUser({ provider: 'github', providerId: 'id-shape', login: 'shape', name: null, avatarUrl: null }, now);
    const session = issueSession(user.id, now, true);
    await store.createSession(session.record);
    cookie = `__Host-trazum_session=${session.token}`;
    prompt = (await store.prompts.createPrompt({ ownerId: user.id, name: 'p', text: 'Be brief.', note: null, now })).id;
  });

  const SHAPES = ['null', '[]', '"text"', '7', 'true', '{"__proto__": {"polluted": true}}', '{"surely_not_a_field": 1}'];

  for (const shape of SHAPES) {
    it(`answers 400, never 500, to ${shape} on every route`, async () => {
      for (const key of Object.keys(bodies.BODIES)) {
        const response = await call(key, shape);
        const { error } = await response.json();
        assert.equal(response.status, 400, `${key} answered ${response.status} to ${shape}: ${error}`);
        assert.equal(typeof error, 'string');
      }
      assert.equal({}.polluted, undefined);
      // Nothing was written by a request that was refused.
      assert.equal((await store.prompts.listPrompts(user.id)).length, 1);
    });
  }

  it('answers 400 to the key that went to a provider as a key', async () => {
    const response = await call('POST /api/optimize', JSON.stringify({ prompt: 'Be brief.', suggest: true, llm: { apiKey: 5, provider: 'anthropic' } }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /"llm\.apiKey" must be text/);
  });
});
