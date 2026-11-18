import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { before, describe, it } from 'node:test';

import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * Vercel Speed Insights, which an operator switches on and nobody else.
 *
 * Pull request #722 added the package rendered in the layout, always on, which
 * contradicted the README: analytics is off by default, nothing records page
 * views on its own, and every URL that leaves has its share token replaced and
 * its query dropped. These hold the four things that make the switch honest:
 * the switch reads exactly `1`, off loads nothing, what goes out is cleaned by
 * the rule PostHog events go through, and the policy does not move.
 *
 * What the script Vercel serves sends cannot be read from the package, so
 * nothing here claims to test it.
 */

register('./helpers/loader.mjs', import.meta.url);

const WEB = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(WEB, '..', '..');
const VARIABLE = 'NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
/** Source with its comments removed, so a sentence about a thing is not mistaken for the thing. */
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Run a snippet of module code in a fresh Node with the web app's loader, and return what it printed. */
function run(source, env) {
  const loader = new URL('./helpers/loader.mjs', import.meta.url).href;
  const base = { ...process.env };
  for (const name of [VARIABLE, 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST']) delete base[name];
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import { register } from 'node:module'; register(${JSON.stringify(loader)}); ${source}`],
    { cwd: WEB, env: { ...base, ...env }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

describe('the switch', () => {
  const on = (value) => {
    const env = value === undefined ? {} : { [VARIABLE]: value };
    const analytics = new URL('../lib/analytics.ts', import.meta.url).href;
    return run(`const { SPEED_INSIGHTS } = await import(${JSON.stringify(analytics)}); process.stdout.write(String(SPEED_INSIGHTS));`, env);
  };

  it('is off when the variable is not set, which is the default', () => {
    assert.equal(on(undefined), 'false');
  });

  it('is on for exactly 1', () => {
    assert.equal(on('1'), 'true');
  });

  it('is off for anything else, including what reads as yes', () => {
    for (const value of ['', '0', 'true', 'TRUE', 'yes', 'on', ' 1', '1 ', '01', '11', 'false']) {
      assert.equal(on(value), 'false', `${JSON.stringify(value)} switched it on`);
    }
  });

  it('is read in lib/analytics and nowhere else', () => {
    for (const path of walk(WEB, /\.(tsx?|mjs|js|jsx)$/)) {
      const relative = path.slice(WEB.length);
      if (relative.startsWith('test/') || relative === 'lib/analytics.ts') continue;
      assert.ok(!code(`apps/web/${relative}`).includes(VARIABLE), `${relative} reads ${VARIABLE} itself`);
    }
    assert.match(code('apps/web/lib/analytics.ts'), new RegExp(`process\\.env\\.${VARIABLE} === '1'`));
  });
});

/** Every file under a directory that matches, skipping what is installed or built. */
function walk(dir, pattern, found = []) {
  for (const name of readdirSync(dir)) {
    // `generated` is the documents turned into modules: their text is the repository's, not this app's source.
    if (name === 'node_modules' || name === '.next' || name === 'generated') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, pattern, found);
    else if (pattern.test(path)) found.push(path);
  }
  return found;
}

describe('off loads nothing', () => {
  const PACKAGE = '@vercel/speed-insights';

  it('no file under apps/web imports the package statically', () => {
    const importers = [];
    for (const path of walk(WEB, /\.(tsx?|mjs|js|jsx)$/)) {
      const relative = path.slice(WEB.length);
      if (relative.startsWith('test/')) continue;
      const source = code(`apps/web/${relative}`);
      if (!source.includes(PACKAGE)) continue;
      importers.push(relative);
      assert.ok(
        !new RegExp(`(import|export)[^;]*?from\\s*['"]${PACKAGE}`).test(source),
        `${relative} imports ${PACKAGE} statically`,
      );
      assert.ok(!new RegExp(`import\\s*['"]${PACKAGE}`).test(source), `${relative} imports ${PACKAGE} for its effects`);
      assert.ok(!new RegExp(`require\\(\\s*['"]${PACKAGE}`).test(source), `${relative} requires ${PACKAGE}`);
    }
    assert.deepEqual(importers, ['components/SpeedInsights.tsx']);
  });

  it('the one import is dynamic, and sits after the switch has been checked', () => {
    const source = code('apps/web/components/SpeedInsights.tsx');
    const dynamic = [...source.matchAll(/import\(\s*['"]@vercel\/speed-insights\/next['"]\s*\)/g)];
    assert.equal(dynamic.length, 1, 'expected exactly one dynamic import of the package');
    const guard = source.indexOf('if (!SPEED_INSIGHTS) return;');
    assert.ok(guard !== -1, 'the effect no longer returns early when the switch is off');
    assert.ok(guard < dynamic[0].index, 'the import is reached before the switch is checked');
    // The effect, and not module scope: a module-level import() starts loading on import.
    assert.match(source, /useEffect\(\(\) => \{\s*if \(!SPEED_INSIGHTS\) return;\s*import\(/);
  });

  it('renders nothing while the switch is off or the package has not loaded', () => {
    const source = code('apps/web/components/SpeedInsights.tsx');
    assert.match(source, /if \(!SPEED_INSIGHTS \|\| !Component\) return null;/);
  });

  it('hands the package nothing but the cleaning hook', () => {
    // A `dsn`, `endpoint` or `scriptSrc` would send measurements somewhere the
    // policy does not name; `route` would replace the one the package computes.
    const source = code('apps/web/components/SpeedInsights.tsx');
    const props = /<Component\b([^>]*)\/>/.exec(source)?.[1].trim();
    assert.equal(props, 'beforeSend={scrubSpeedInsightsEvent}');
  });

  it('is a client component, because it uses effects', () => {
    assert.match(read('apps/web/components/SpeedInsights.tsx'), /^'use client';/);
  });
});

describe('what goes out is cleaned by the rule PostHog events use', () => {
  let scrubSpeedInsightsEvent;
  let redactUrl;

  before(async () => {
    ({ scrubSpeedInsightsEvent, redactUrl } = await import('../lib/analytics.ts'));
  });

  const vital = (url, route) => ({ type: 'vital', url, ...(route === undefined ? {} : { route }) });

  it('replaces the share token', () => {
    const out = scrubSpeedInsightsEvent(vital('https://trazum.app/c/Xy9-secret_TOKEN'));
    assert.equal(out.url, 'https://trazum.app/c/:token');
    assert.doesNotMatch(JSON.stringify(out), /Xy9/);
  });

  it('drops the query and the fragment', () => {
    const out = scrubSpeedInsightsEvent(vital('https://trazum.app/?tab=bill&label=acme-payroll#section'));
    assert.equal(out.url, 'https://trazum.app/');
    assert.doesNotMatch(JSON.stringify(out), /acme|payroll|section/);
  });

  it('does both at once', () => {
    const out = scrubSpeedInsightsEvent(vital('https://trazum.app/c/SECRET?label=acme#x'));
    assert.equal(out.url, 'https://trazum.app/c/:token');
  });

  it('gives the same answer as the PostHog rule, because it is that rule', () => {
    for (const url of [
      'https://trazum.app/c/abc',
      'https://trazum.app/badge/abc',
      'https://trazum.app/api/shares/abc?x=1',
      'https://trazum.app/api/prompts/abc#y',
      'https://trazum.app/',
    ]) {
      assert.equal(scrubSpeedInsightsEvent(vital(url)).url, redactUrl(url));
    }
  });

  it('cleans the route as well', () => {
    assert.equal(scrubSpeedInsightsEvent(vital('https://trazum.app/c/a', '/c/[token]')).route, '/c/:token');
    assert.equal(scrubSpeedInsightsEvent(vital('https://trazum.app/c/a', '/c/SECRET?x=1')).route, '/c/:token');
    assert.equal(scrubSpeedInsightsEvent(vital('https://trazum.app/', '/')).route, '/');
  });

  it('leaves out a route there was not, and one that is not text', () => {
    assert.equal('route' in scrubSpeedInsightsEvent(vital('https://trazum.app/')), false);
    assert.equal('route' in scrubSpeedInsightsEvent({ type: 'vital', url: 'https://trazum.app/', route: 5 }), false);
  });

  it('passes on the type, and nothing the package did not document', () => {
    const out = scrubSpeedInsightsEvent({ type: 'vital', url: 'https://trazum.app/', extra: 'https://trazum.app/c/SECRET' });
    assert.deepEqual(out, { type: 'vital', url: 'https://trazum.app/' });
  });

  it('drops a measurement whose URL it cannot parse, rather than sending it raw', () => {
    for (const url of ['not a url', '', '/c/SECRET', 'c/SECRET?x=1', '//', 'http://']) {
      assert.equal(scrubSpeedInsightsEvent(vital(url)), null, `${JSON.stringify(url)} was sent`);
    }
  });

  it('drops a measurement with no URL, or no measurement', () => {
    assert.equal(scrubSpeedInsightsEvent({ type: 'vital' }), null);
    assert.equal(scrubSpeedInsightsEvent({ type: 'vital', url: 7 }), null);
    // Something that would parse if it were turned into text is still not a string.
    assert.equal(scrubSpeedInsightsEvent({ type: 'vital', url: new URL('https://trazum.app/c/SECRET') }), null);
    assert.equal(scrubSpeedInsightsEvent(null), null);
    assert.equal(scrubSpeedInsightsEvent(undefined), null);
  });

  it('does not change the event it was given', () => {
    const event = vital('https://trazum.app/c/SECRET?x=1', '/c/SECRET');
    scrubSpeedInsightsEvent(event);
    assert.deepEqual(event, vital('https://trazum.app/c/SECRET?x=1', '/c/SECRET'));
  });

  it('is the function the component hands the package', () => {
    assert.match(code('apps/web/components/SpeedInsights.tsx'), /beforeSend=\{scrubSpeedInsightsEvent\}/);
    assert.match(code('apps/web/components/SpeedInsights.tsx'), /scrubSpeedInsightsEvent \} from '@\/lib\/analytics'/);
  });

  it('reuses redactUrl rather than carrying a second rule', () => {
    const source = code('apps/web/lib/analytics.ts');
    const body = source.slice(source.indexOf('export function scrubSpeedInsightsEvent'));
    assert.match(body, /redactUrl\(event\.url\)/);
    assert.match(body, /redactUrl\(event\.route\)/);
    assert.equal((source.match(/CAPABILITY_PATH/g) ?? []).length, 2, 'the token pattern is used somewhere new');
  });
});

describe('the layout', () => {
  const layout = code('apps/web/app/layout.tsx');

  it('renders the component, after Analytics', () => {
    assert.match(layout, /import \{ SpeedInsights \} from '\.\.\/components\/SpeedInsights';/);
    const analytics = layout.indexOf('<Analytics />');
    const speed = layout.indexOf('<SpeedInsights />');
    assert.ok(analytics !== -1 && speed !== -1, 'the layout is missing one of the two');
    assert.ok(analytics < speed, 'Speed Insights is not after Analytics');
    assert.equal((layout.match(/<SpeedInsights\b/g) ?? []).length, 1);
  });

  it('does not render the package directly, which would be always on', () => {
    assert.ok(!layout.includes('@vercel/speed-insights'));
  });

  it('lists the package as a dependency of the web app only', () => {
    const web = JSON.parse(read('apps/web/package.json'));
    assert.match(web.dependencies['@vercel/speed-insights'], /^\^2\.1\.0$/);
    for (const path of ['package.json', 'packages/core/package.json', 'packages/cli/package.json', 'packages/mcp/package.json']) {
      assert.ok(!read(path).includes('@vercel/speed-insights'), `${path} depends on it`);
    }
  });
});

describe('the Content-Security-Policy is the same with it on and off', () => {
  const middleware = new URL('../middleware.ts', import.meta.url).href;

  /** The policy of one request, with the per-request nonce replaced so two can be compared. */
  const policy = (env) =>
    run(
      `const { middleware } = await import(${JSON.stringify(middleware)});
       const { NextRequest } = await import('next/server');
       const response = middleware(new NextRequest('https://trazum.example/', { headers: { 'x-forwarded-for': '203.0.113.7' } }));
       process.stdout.write(response.headers.get('content-security-policy'));`,
      env,
    ).replace(/'nonce-[^']+'/, "'nonce-X'");

  it('byte for byte, in production', () => {
    const off = policy({ NODE_ENV: 'production' });
    const on = policy({ NODE_ENV: 'production', [VARIABLE]: '1' });
    assert.equal(on, off);
    assert.match(off, /script-src 'self' 'nonce-X' 'strict-dynamic' https:;/);
    assert.match(off, /connect-src 'self';/);
  });

  it('byte for byte, outside production', () => {
    assert.equal(policy({ NODE_ENV: 'development', [VARIABLE]: '1' }), policy({ NODE_ENV: 'development' }));
  });

  it('byte for byte beside PostHog, which is the only variable that does move it', () => {
    const key = { NODE_ENV: 'production', NEXT_PUBLIC_POSTHOG_KEY: 'phc_x' };
    const withPostHog = policy(key);
    assert.match(withPostHog, /connect-src 'self' https:\/\/eu\.i\.posthog\.com;/);
    assert.equal(policy({ ...key, [VARIABLE]: '1' }), withPostHog);
  });

  it('names no Vercel host, because none is needed', () => {
    assert.doesNotMatch(policy({ NODE_ENV: 'production', [VARIABLE]: '1' }), /vercel/i);
  });

  it('is not read by the middleware or by what it builds the policy from', () => {
    assert.ok(!code('apps/web/middleware.ts').includes('SPEED_INSIGHTS'));
    const source = code('apps/web/lib/analytics.ts');
    const connect = source.slice(source.indexOf('export function analyticsConnectSrc'), source.indexOf('const CAPABILITY_PATH'));
    assert.ok(!connect.includes('SPEED_INSIGHTS'));
  });

  it('is stated beside the policy, with the reason', () => {
    // Comment lines joined, so the sentence is found wherever it wraps.
    const source = read('apps/web/middleware.ts').replace(/\n\s*\*\s?/g, ' ');
    assert.ok(
      source.includes(`\`${VARIABLE}\`: the policy is byte-for-byte the same with it set and unset`),
      'middleware.ts no longer says the policy is the same with the variable set and unset',
    );
    assert.ok(source.includes('/_vercel/speed-insights/script.js'));
  });
});

describe('the documents are held to the code', () => {
  it('the README says what it is, in the privacy section', () => {
    const section = sectionOf(read('README.md'), '## Analytics and privacy');
    assert.ok(section.includes(`${VARIABLE}=1`));
    assert.ok(section.includes('/_vercel/speed-insights/script.js'));
    assert.match(section, /Vercel Speed Insights is \*\*off by default\*\*/);
    assert.match(section, /Vercel\s+deployment/);
    assert.ok(section.includes('`/c/:token`') || section.includes('`:token`'));
    // The PostHog promise is still there, as written.
    assert.match(section, /Analytics \(PostHog\) is \*\*off by default\*\*/);
  });

  it('SECURITY.md names the switch in the analytics paragraph', () => {
    const paragraph = read('SECURITY.md')
      .split('\n\n')
      .find((text) => text.startsWith('**Analytics is off unless you switch it on**'));
    assert.ok(paragraph, 'the analytics paragraph is gone');
    assert.ok(paragraph.includes(VARIABLE));
  });

  it('every page that lists the web app variables lists this one', () => {
    for (const path of ['.env.example', 'docs/setup.md', 'docs/compliance/secret-rotation.md', 'Dockerfile']) {
      assert.ok(read(path).includes(VARIABLE), `${path} does not name ${VARIABLE}`);
    }
  });

  it('the Dockerfile leaves it empty, which is off', () => {
    assert.match(read('Dockerfile'), new RegExp(`^ARG ${VARIABLE}=""$`, 'm'));
  });

  it('.env.example leaves it unset', () => {
    assert.match(read('.env.example'), new RegExp(`^${VARIABLE}=$`, 'm'));
  });

  it('the wiki page carries the same section', () => {
    assert.ok(read('wiki/Privacy.md').includes(VARIABLE));
  });
});
