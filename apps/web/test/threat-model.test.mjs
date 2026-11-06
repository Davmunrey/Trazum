import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The threat model, the secure coding checklist and the rotation procedure
 * stay true to the code (OWASP ASVS 4.0.3 1.1.5, 11.1.5, 1.1.7, 1.6.3).
 *
 * A threat model that names a limit the code no longer has, or misses one it
 * gained, is a document an auditor stops trusting at the first row they
 * check. So the limits table is read here and held both ways: every limit the
 * code sets has a row with its value, and every row names a limit the code
 * still sets. The rotation procedure is held to the variables the app reads
 * and the secrets the workflows use, and all three documents to the paths
 * they cite.
 */

register('./helpers/loader.mjs', import.meta.url);

const WEB = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(WEB, '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const DOCS = ['docs/compliance/threat-model.md', 'docs/compliance/secure-coding.md', 'docs/compliance/secret-rotation.md'];

const walk = (dir, keep) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : walk(path, keep);
    return keep(path) ? [path] : [];
  });

/** Source with its comments removed, so a variable a comment mentions is not one the code reads. */
const code = (path) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const SERVER_SOURCES = [
  ...walk(join(WEB, 'app'), (p) => /\.tsx?$/.test(p)),
  ...walk(join(WEB, 'lib'), (p) => /\.tsx?$/.test(p)),
  join(WEB, 'middleware.ts'),
];
const at = (path) => relative(ROOT, path).split('\\').join('/');

// ---------------------------------------------------------------------------
// The limits table
// ---------------------------------------------------------------------------

const model = read('docs/compliance/threat-model.md');
const limitsSection = model.split('## The limits, and the risk behind each')[1]?.split('\n## ')[0] ?? '';
const rows = limitsSection
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.startsWith('| Limit ') && !line.startsWith('| ---'))
  .map((line) => {
    const cells = line.split(' | ').map((cell) => cell.replace(/^\| ?| ?\|$/g, '').trim());
    const [limit, value, risk, setIn] = cells;
    return { line, cells, limit, value, risk, setIn, names: [...(value ?? '').matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map((m) => m[1]) };
  });

/** The number as the table writes it, standing alone: `30`, not the 30 in `300` or `1,300`. */
const escapeRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
const shows = (text, number) =>
  new RegExp(`(?<![\\d.])(?<!\\d,)${escapeRegExp(number.toLocaleString('en-US'))}(?!\\d)(?!,\\d)(?!\\.\\d)`).test(text);

/** Every rate limiter the server sets: inline per route, or shared and named. */
function rateLimiters() {
  const found = [];
  for (const path of SERVER_SOURCES) {
    const source = code(path);
    for (const m of source.matchAll(/createRateLimiter\(\{\s*windowMs:\s*([\d_]+),\s*max:\s*(\d+)\s*\}\)/g)) {
      found.push({ file: at(path), name: null, windowMs: Number(m[1].replaceAll('_', '')), max: Number(m[2]) });
    }
    for (const m of source.matchAll(/export const (\w+) = createSharedRateLimiter\('\w+', \{\s*windowMs:\s*([\d_]+),\s*max:\s*(\d+)\s*\}\)/g)) {
      found.push({ file: at(path), name: m[1], windowMs: Number(m[2].replaceAll('_', '')), max: Number(m[3]) });
    }
  }
  return found;
}

const LIMIT_NAME = /\b(?:export\s+)?const\s+((?:MAX|MIN)_[A-Z0-9_]+|[A-Z0-9_]+_(?:LIMIT|LIMITS|CEILING|FLOOR|WINDOW_MS|TTL_SECONDS|TTL_DAYS|POLICY))\s*[:=]/g;

/** Every named limit in the server's sources and in core's limits. */
function namedLimits() {
  const found = [];
  for (const path of [...SERVER_SOURCES, join(ROOT, 'packages/core/src/limits.ts')]) {
    for (const m of code(path).matchAll(LIMIT_NAME)) found.push({ file: at(path), name: m[1] });
  }
  return found;
}

/** A constant's value from its declaration, for the two the module does not export. */
function declared(file, name) {
  const m = code(join(ROOT, file)).match(new RegExp(`const ${escapeRegExp(name)} = ([\\d_ *+]+);`));
  assert.ok(m, `${name} in ${file} is not a plain arithmetic constant any more: teach this test to read it`);
  return m[1].replaceAll('_', '').split('+').reduce((sum, term) => sum + term.split('*').reduce((p, f) => p * Number(f), 1), 0);
}

let values;
before(async () => {
  const [core, prompts, shares, sharesApi, schemas, usage, session, config, tasks] = await Promise.all([
    import('@trazum/core'),
    import('../lib/store/prompts.ts'),
    import('../lib/store/shares.ts'),
    import('../lib/shares/api.ts'),
    import('../lib/body-schemas.ts'),
    import('../lib/usage-input.ts'),
    import('../lib/auth/session.ts'),
    import('../lib/auth/config.ts'),
    import('../lib/task-workflow.ts'),
  ]);
  values = {
    ...prompts,
    ...shares,
    ...sharesApi,
    MAX_ANSWER_CHARS: schemas.MAX_ANSWER_CHARS,
    USAGE_LIMITS: usage.USAGE_LIMITS,
    REAUTH_WINDOW_MS: session.REAUTH_WINDOW_MS,
    OAUTH_STATE_TTL_SECONDS: session.OAUTH_STATE_TTL_SECONDS,
    DEFAULT_SESSION_POLICY: config.DEFAULT_SESSION_POLICY,
    MAX_HOURS_CEILING: declared('apps/web/lib/auth/config.ts', 'MAX_HOURS_CEILING'),
    IDLE_MINUTES_FLOOR: declared('apps/web/lib/auth/config.ts', 'IDLE_MINUTES_FLOOR'),
    MAX_INPUT_CHARS: core.MAX_INPUT_CHARS,
    MAX_TASK_FILES: tasks.MAX_TASK_FILES,
    MAX_TASK_FILE_BYTES: tasks.MAX_TASK_FILE_BYTES,
  };
});

/**
 * What the Value cell must say for each limit. A plain number is written as
 * itself; the rest are in units a reader uses, and say which.
 */
const EXPECTED = {
  REAUTH_WINDOW_MS: (v) => [`${v / 60_000} minutes`],
  OAUTH_STATE_TTL_SECONDS: (v) => [`${v / 60} minutes`],
  MAX_HOURS_CEILING: (v) => [`${v} hours`],
  IDLE_MINUTES_FLOOR: (v) => [`${v} minutes`],
  USAGE_LIMITS: (v) => [v.callsPerMonth, v.avgOutputTokens],
  SHARE_TTL_DAYS: (v) => Object.values(v).map((days) => (days === null ? 'never' : days)),
};

describe('the limits table', () => {
  it('is there, with four cells in every row', () => {
    assert.ok(rows.length >= 25, `only ${rows.length} rows: has the section moved?`);
    for (const row of rows) assert.equal(row.cells.length, 4, row.line);
  });

  it('has a row for every rate limit, with its number a minute', () => {
    const limiters = rateLimiters();
    assert.ok(limiters.length >= 7, `found ${limiters.length} rate limiters: has the shape changed?`);
    for (const limiter of limiters) {
      const label = limiter.name ?? `the limiter in ${limiter.file}`;
      assert.equal(limiter.windowMs, 60_000, `${label}: the table says "a minute"`);
      const row = rows.find((r) => r.setIn.includes(`\`${limiter.file}\``) && (limiter.name ? r.names.includes(limiter.name) : r.names.length === 0));
      assert.ok(row, `${label} has no row in the threat model's limits table`);
      assert.ok(shows(row.value, limiter.max) && row.value.includes('a minute'), `${label} is ${limiter.max} a minute; the table says "${row.value}"`);
    }
  });

  it('has a row for every named limit, saying its value, in the file that sets it', () => {
    const limits = namedLimits();
    assert.ok(limits.length >= 18, `found ${limits.length} named limits: has the shape changed?`);
    for (const { file, name } of limits) {
      const row = rows.find((r) => r.names.includes(name));
      assert.ok(row, `${name} (${file}) has no row in the threat model's limits table`);
      assert.ok(row.setIn.includes(`\`${file}\``), `${name} is set in ${file}; its row says ${row.setIn}`);
      assert.ok(name in values, `${name} is new: read its value in this test's \`before\``);
      const value = values[name];
      const wanted = EXPECTED[name]?.(value) ?? (typeof value === 'number' ? [value] : null);
      if (name === 'DEFAULT_SESSION_POLICY') continue;
      assert.ok(wanted, `${name} is not a number: say in EXPECTED what its row must show`);
      for (const piece of wanted) {
        const ok = typeof piece === 'number' ? shows(row.value, piece) : row.value.includes(piece);
        assert.ok(ok, `${name} is ${JSON.stringify(value)}; its row says "${row.value}", without ${piece}`);
      }
    }
  });

  it('says both of the default session policy\u2019s numbers', () => {
    const policy = values.DEFAULT_SESSION_POLICY;
    const policyRows = rows.filter((r) => r.names.includes('DEFAULT_SESSION_POLICY')).map((r) => r.value);
    const days = (seconds) => seconds / 86_400;
    assert.ok(policyRows.some((v) => v.startsWith(`${days(policy.maxSeconds)} days`)), `lifetime: ${policyRows}`);
    assert.ok(policyRows.some((v) => v.startsWith(`${days(policy.idleSeconds)} day`)), `idle: ${policyRows}`);
  });

  it('names only limits the code still sets, in files that still set them', () => {
    const named = new Set(namedLimits().map((l) => l.name));
    const shared = new Set(rateLimiters().map((l) => l.name).filter(Boolean));
    for (const row of rows) {
      for (const name of row.names) assert.ok(named.has(name) || shared.has(name), `the table names ${name}, which the code no longer sets`);
      const files = [...row.setIn.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      assert.ok(files.length > 0, `${row.limit}: no file`);
      for (const file of files) assert.ok(existsSync(join(ROOT, file)), `${row.limit}: ${file} does not exist`);
    }
  });

  it('would notice a limit that changed and one that was added', () => {
    const changed = rows.find((r) => r.names.includes('MAX_PROMPTS_PER_OWNER'));
    assert.ok(!shows(changed.value, values.MAX_PROMPTS_PER_OWNER + 1));
    assert.ok(!shows('1,200 bytes', 200), 'the 200 in 1,200 counted as 200');
    assert.ok(!shows('300 a minute', 30), 'the 30 in 300 counted as 30');
    assert.ok(shows('7, 30 or 90 days', 7) && shows('7, 30 or 90 days', 30), 'a number before a list comma was missed');
    assert.ok(!rows.some((r) => r.names.includes('MAX_SOMETHING_NEW')));
  });
});

describe('every API route', () => {
  it('is rate-limited, as the threat model says', () => {
    /**
     * The table above lists the limits; this holds that no route escapes them.
     * Sign-out did, until it was found writing the threat model's own sentence
     * that every route was limited.
     */
    const routes = walk(join(WEB, 'app', 'api'), (p) => p.endsWith('route.ts'));
    assert.ok(routes.length >= 14, `found ${routes.length} routes: has app/api moved?`);
    for (const path of routes) {
      const source = code(path);
      assert.match(
        source,
        /\b(?:rateLimited|authRateLimited|sessionRateLimited|libraryRateLimited)\(|\brequireCaller\(/,
        `${at(path)} answers without any rate limit`,
      );
    }
    assert.match(model, /a per-address rate limit on every API route \(/, 'the threat model no longer says every route is limited');
  });
});

// ---------------------------------------------------------------------------
// What the three documents cite
// ---------------------------------------------------------------------------

describe('the three documents', () => {
  it('cite only paths that exist', () => {
    let cited = 0;
    for (const doc of DOCS) {
      const text = read(doc);
      const inline = [...text.matchAll(/`((?:apps|packages|docs|test|scripts|\.github)\/[^`\s]+)`/g)].map((m) => m[1]);
      const links = [...text.matchAll(/\]\(((?:\.\.\/|\.\/)?[^)#:\s]+)(?:#[^)]*)?\)/g)].map((m) => join(dirname(doc), m[1]));
      for (const path of [...inline, ...links]) {
        cited += 1;
        assert.ok(existsSync(join(ROOT, path)), `${doc} cites ${path}, which does not exist`);
      }
    }
    assert.ok(cited >= 60, `only ${cited} paths cited: is this reading the documents?`);
  });

  it('give every checklist item something that holds it', () => {
    const checklist = read('docs/compliance/secure-coding.md');
    const items = checklist.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| When you') && !l.startsWith('| ---'));
    assert.ok(items.length >= 20, `only ${items.length} checklist rows`);
    for (const item of items) {
      const held = item.split(' | ').at(-1).replace(/ \|$/, '').trim();
      assert.ok(held === 'Review' || /`[^`]+`/.test(held), `nothing holds: ${item}`);
    }
  });
});

describe('the rotation procedure', () => {
  const rotation = read('docs/compliance/secret-rotation.md');

  it('covers every variable the web app reads, as a secret or as not one', () => {
    const sources = [...SERVER_SOURCES, ...walk(join(WEB, 'components'), (p) => /\.tsx?$/.test(p)), join(WEB, 'next.config.mjs'), join(WEB, 'instrumentation.ts')];
    const variables = new Set(sources.flatMap((p) => [...code(p).matchAll(/\b(TRAZUM_[A-Z_]+|NEXT_PUBLIC_[A-Z_]+|VERCEL_URL)\b/g)].map((m) => m[1])));
    assert.ok(variables.size >= 15, `found ${variables.size} variables: is this reading the code?`);
    for (const name of variables) assert.ok(rotation.includes(`\`${name}\``), `the app reads ${name}; the rotation page does not say what it is`);
  });

  it('gives each of the app\u2019s two secrets a procedure of its own', () => {
    for (const name of ['TRAZUM_GITHUB_CLIENT_SECRET', 'TRAZUM_DATABASE_URL']) {
      const section = rotation.split(`### \`${name}\``)[1]?.split('\n### ')[0] ?? '';
      assert.match(section, /\n1\. /, `${name} has no steps`);
      assert.match(section, /Check it/, `${name} says nothing about how to tell it worked`);
    }
  });

  it('covers every secret a workflow reads', () => {
    const workflows = walk(join(ROOT, '.github/workflows'), (p) => /\.ya?ml$/.test(p));
    const secrets = new Set(workflows.flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])));
    assert.ok(secrets.size >= 3, `found ${secrets.size} workflow secrets`);
    for (const name of secrets) assert.ok(rotation.includes(`\`${name}\``), `a workflow reads ${name}; the rotation page does not cover it`);
  });
});
