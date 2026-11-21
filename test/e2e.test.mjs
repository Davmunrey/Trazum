import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getModel, multipliersFor } from '../packages/core/dist/index.js';
import { FLOWS, plain } from '../scripts/e2e.mjs';

/**
 * The end-to-end tests, without a browser.
 *
 * The flows need Chrome and a running build, so they run in CI as their own
 * step. What is held here is everything about them that can rot in silence: a
 * tab added with no flow, a flow that claims a tab it never opens, a step
 * taken out of CI, a runner that reports success having run nothing, and a
 * price that moved under the bill the flows price by hand.
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(path, new URL('../', import.meta.url)), 'utf8');
const runner = fileURLToPath(new URL('../scripts/e2e.mjs', import.meta.url));

/** The runner, with nothing inherited that could stand in for a flag. */
const run = (...args) => {
  const env = { ...process.env };
  delete env.CHROME_PATH;
  delete env.PLAYWRIGHT_CORE_PATH;
  return spawnSync(process.execPath, [runner, ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
};

/** The tabs the app's rail is built from, and the ones only a signed-in reader gets. */
const app = read('apps/web/components/App.tsx');
const tabs = [...app.matchAll(/\{ value: '([a-z]+)', label: t\./g)].map(([, tab]) => tab);
const signedInOnly = [...app.matchAll(/signedIn \? \[\{ value: '([a-z]+)'/g)].map(([, tab]) => tab);
const open = tabs.filter((tab) => !signedInOnly.includes(tab));

describe('every tab a visitor can open has a flow that opens it', () => {
  it('found the tabs it is about to check', () => {
    // Both lists, because either one being empty passes every assertion below.
    assert.ok(open.length >= 6, `only ${open.length} tabs found in App.tsx: has the rail moved?`);
    assert.ok(FLOWS.length >= 10, `only ${FLOWS.length} flows`);
  });

  it('a tab without a flow fails here, by name', () => {
    const covered = new Set(FLOWS.flatMap((flow) => flow.covers));
    assert.deepEqual(open.filter((tab) => !covered.has(tab)), [], 'add a flow to scripts/e2e.mjs for each of these tabs');
  });

  it('and a flow of its own, not only the one that walks the rail', () => {
    /*
      The flow that clicks through every tab opens each of them, and checks
      nothing a tab does. Counted alone it would cover the whole app. So each
      tab needs a flow named for it, which is the one that uses it.
    */
    const named = (tab) => FLOWS.some((flow) => flow.name.startsWith(`${tab}: `) && flow.covers.includes(tab));
    assert.deepEqual(open.filter((tab) => !named(tab)), [], 'each of these tabs needs a flow named "<tab>: ..." that covers it');
  });

  it('a flow claims only tabs that exist, and opens each one it claims', () => {
    for (const flow of FLOWS) {
      const source = flow.run.toString();
      for (const tab of flow.covers) {
        assert.ok(open.includes(tab), `"${flow.name}" covers ${tab}, which is not a tab a visitor can open`);
        assert.ok(
          source.includes(`'${tab}'`) || source.includes(`tab=${tab}`) || source.includes(`panel-${tab}`),
          `"${flow.name}" says it covers ${tab} and never names it`,
        );
      }
    }
  });

  it('the one tab left out is the one that needs an account, and it is still the only one', () => {
    /*
      The library is rendered only for a signed-in reader, and signing in needs
      a database and a session the build under test does not have. If a second
      tab goes behind a session, somebody decides whether it gets a flow: this
      does not decide it for them by leaving it out.
    */
    assert.deepEqual(signedInOnly, ['library']);
    assert.ok(!FLOWS.some((flow) => flow.covers.includes('library')));
  });

  it('one flow starts where a visitor starts, on the landing, and ends on a priced bill', () => {
    /*
      Every other flow opens the application at /app. This one is the path
      the site exists for: the landing at /, its way in, the sample control.
    */
    const site = FLOWS.find((flow) => flow.name.startsWith('site: '));
    assert.ok(site, 'no flow starts on the landing');
    const source = site.run.toString();
    assert.match(source, /^[\s\S]*?await open\('\/'\);/, 'the site flow does not start at /');
    for (const step of ['[data-site-header]', 'Open the dashboard', 'Load the sample month', '8 calls · $1.05', "open('/?tab=compare"]) {
      assert.ok(source.includes(step), `the site flow no longer does: ${step}`);
    }
    /*
      The documentation flow starts on the landing too, because the way to the
      docs is the header's Docs entry and a visitor starts at the front door.
    */
    const docs = FLOWS.find((flow) => flow.name.startsWith('docs: '));
    assert.ok(docs, 'no flow follows the Docs entry');
    const docsSource = docs.run.toString();
    assert.match(docsSource, /^[\s\S]*?await open\('\/'\);/, 'the docs flow does not start at /');
    for (const step of ["name: 'Docs'", '/docs/commands', 'getByRole(\'searchbox\'', '#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate']) {
      assert.ok(docsSource.includes(step), `the docs flow no longer does: ${step}`);
    }
    /*
      The models flow starts there too: the catalogue is a page of the site and
      the way to it is the header's Models entry.
    */
    const models = FLOWS.find((flow) => flow.name.startsWith('models: '));
    assert.ok(models, 'no flow follows the Models entry');
    const modelsSource = models.run.toString();
    assert.match(modelsSource, /^[\s\S]*?await open\('\/'\);/, 'the models flow does not start at /');
    for (const step of ["name: 'Models'", "'Filter models'", 'data-state="retired"', 'sent']) {
      assert.ok(modelsSource.includes(step), `the models flow no longer does: ${step}`);
    }
    /*
      And the brand flow, which starts there too: the page is in the footer,
      and a visitor finds it at the foot of the front door.
    */
    const brand = FLOWS.find((flow) => flow.name.startsWith('brand: '));
    assert.ok(brand, 'no flow follows the Brand entry');
    const brandSource = brand.run.toString();
    assert.match(brandSource, /^[\s\S]*?await open\('\/'\);/, 'the brand flow does not start at /');
    for (const step of ['[data-site-footer]', "name: 'Brand'", 'data-download', 'content-type', 'Copied: #f6f4ec', 'sent']) {
      assert.ok(brandSource.includes(step), `the brand flow no longer does: ${step}`);
    }
    /*
      And the Pro flow, which starts there too: the page is in the header, and
      what it is held to is what a visitor would rely on. The tiers as the
      owner decided them, the one mailto, and no request off the site.
    */
    const proFlow = FLOWS.find((flow) => flow.name.startsWith('pro: '));
    assert.ok(proFlow, 'no flow follows the Pro entry');
    const proSource = proFlow.run.toString();
    assert.match(proSource, /^[\s\S]*?await open\('\/'\);/, 'the pro flow does not start at /');
    for (const step of ["name: 'Pro'", "url.pathname === '/pro'", 'Not open yet', '€1,499 a month', 'mailto:', 'requested', 'unreadable', "name: 'Dark'"]) {
      assert.ok(proSource.includes(step), `the pro flow no longer does: ${step}`);
    }
    /*
      And the Download flow, which starts there too: the page is in the header.
      What it is held to is what a visitor would act on: the version the page
      says it is for, every command at that exact version, the files linked by
      one scheme and never through `latest`, no store named, and no request off
      the site.
    */
    const downloadFlow = FLOWS.find((flow) => flow.name.startsWith('download: '));
    assert.ok(downloadFlow, 'no flow follows the Download entry');
    const downloadSource = downloadFlow.run.toString();
    assert.match(downloadSource, /^[\s\S]*?await open\('\/'\);/, 'the download flow does not start at /');
    for (const step of ["name: 'Download'", "url.pathname === '/download'", 'cli,mcp,extension,action,checksums', '@trazum/cli@${version}', 'claude-code,claude-desktop-bundle', 'releases/download/v${version}', 'releases/latest', 'marketplace', 'sha256sum --check', 'requested', 'unreadable', "name: 'Dark'"]) {
      assert.ok(downloadSource.includes(step), `the download flow no longer does: ${step}`);
    }
    /*
      The landing's own flows (#744) start at / too: the story told by
      scrolling, and the public site's light-first appearance. Each says so in
      its name; any other flow opening / is a mistake this still catches.
    */
    const landing = (flow) => flow.name.startsWith('landing: ') || flow.name.startsWith('appearance: the public site');
    for (const flow of FLOWS.filter((candidate) => candidate !== site && candidate !== docs && candidate !== models && candidate !== brand && candidate !== proFlow && candidate !== downloadFlow && !landing(candidate))) {
      for (const [, path] of flow.run.toString().matchAll(/open\('([^']*)'\)/g)) {
        assert.ok(path.startsWith('/app'), `"${flow.name}" opens ${path}, which is not the application`);
      }
    }
  });

  it('the landing’s desk is scrolled top to bottom and back, in every way a reader can get it', () => {
    const named = (start) => FLOWS.filter((flow) => flow.name.startsWith(start));
    const story = named('landing: ');
    assert.ok(story.length >= 6, 'the landing lost a flow');
    const sources = story.map((flow) => flow.run.toString()).join('\n');
    for (const step of ['storyInOrder', 'addInitScript', 'noSidewaysScroll', '[data-landing-close] [data-dashboard-action]', "url.pathname === '/app'"]) {
      assert.ok(sources.includes(step), `no landing flow does: ${step}`);
    }
    assert.ok(story.some((flow) => flow.context?.reducedMotion === 'reduce'), 'no landing flow reads the page with reduced motion');
    assert.ok(story.some((flow) => flow.context?.javaScriptEnabled === false), 'no landing flow reads the page without JavaScript');
    assert.equal(named('appearance: the public site').length, 1);
    assert.equal(named('appearance: the public site')[0].context?.colorScheme, 'dark');
  });

  it('a flow presses every object on the desk, by keyboard, wide and on a phone, and counts the laptops', () => {
    const pressing = FLOWS.filter((flow) => flow.name.startsWith('landing: ') && flow.run.toString().includes('pressEveryObject'));
    const sizes = pressing.map((flow) => (flow.viewport === undefined ? 'default' : `${flow.viewport.width}x${flow.viewport.height}`));
    assert.ok(sizes.includes('1440x900') && sizes.includes('390x844'), `objects pressed only at ${sizes.join(', ')}`);
    const source = FLOWS.find((flow) => flow.run.toString().includes('pressEveryObject'))?.run.toString() ?? '';
    assert.ok(source.includes('pressEveryObject'), 'no flow presses the objects');
  });

  it('every flow has a name of its own and something to run', () => {
    const names = FLOWS.map((flow) => flow.name);
    assert.equal(new Set(names).size, names.length);
    for (const flow of FLOWS) {
      assert.equal(typeof flow.run, 'function', flow.name);
      assert.ok(Array.isArray(flow.covers), flow.name);
    }
  });
});

describe('the runner cannot report success having run nothing', () => {
  it('lists its flows without a browser', () => {
    const listed = run('--list');
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(listed.stdout.trim().split('\n'), FLOWS.map((flow) => flow.name));
  });

  it('stops with a usage error when it is given no browser to drive', () => {
    const bare = run();
    assert.equal(bare.status, 2);
    assert.match(bare.stderr, /pass --chrome <executable> and --playwright/);
  });

  it('fails when --only matches no flow, where passing would look like a green run', () => {
    const none = run('--only', 'a-flow-no-one-wrote');
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no flow's name contains "a-flow-no-one-wrote"/);
  });
});

describe('a failed step is reported in a line somebody can read', () => {
  it('keeps what timed out and what it waited for, and drops the colour codes and the retry log', () => {
    const raw = [
      'locator.click: Timeout 6000ms exceeded.',
      'Call log:',
      "\u001b[2m  - waiting for getByRole('tab', { name: 'Optimise' })\u001b[22m",
      '\u001b[2m    - retrying click action\u001b[22m',
    ].join('\n');
    assert.equal(plain(raw), "locator.click: Timeout 6000ms exceeded. It was waiting for getByRole('tab', { name: 'Optimise' }).");
  });

  it('and leaves a message of its own alone', () => {
    assert.equal(plain('the theme after a reload: "light", expected "dark"'), 'the theme after a reload: "light", expected "dark"');
  });
});

describe('CI runs the flows against the build the pull request would deploy', () => {
  const ci = read('.github/workflows/ci.yml');
  /** One step's text: from its name to the next step or job. */
  const stepOf = (name) => {
    const start = ci.indexOf(`- name: ${name}`);
    assert.notEqual(start, -1, `no step named "${name}" in ci.yml`);
    const rest = ci.slice(start + 1);
    const end = rest.search(/\n {6}- (?:name|uses): |\n {2}[a-z-]+:\n/);
    return rest.slice(0, end === -1 ? rest.length : end);
  };

  it('after the web app is built, with every flow', () => {
    const step = stepOf('End-to-end tests (the page, in a browser)');
    assert.match(step, /node scripts\/e2e\.mjs /);
    assert.ok(!step.includes('--only'), 'the CI step must run every flow');
    const built = ci.indexOf('- name: Build the web app\n        run: npm run build:web\n');
    assert.notEqual(built, -1, 'no step builds the web app');
    assert.ok(built < ci.indexOf('- name: End-to-end tests'), 'the flows run against the built app');
  });

  it('and the step can fail', () => {
    const step = stepOf('End-to-end tests (the page, in a browser)');
    assert.ok(!step.includes('continue-on-error'), 'a step that cannot fail checks nothing');
    assert.ok(!/\|\|\s*true/.test(step), 'a step that cannot fail checks nothing');
    assert.match(step, /\|\| \{ cat "\$RUNNER_TEMP\/e2e-web\.log"; exit 1; \}/);
  });

  it('with one pinned browser driver for the whole job, installed without its scripts', () => {
    // From a lockfile of its own since #874, so `npm ci` checks the hashes.
    const installs = [...ci.matchAll(/npm ci --prefix tools\/playwright-core --ignore-scripts\b/g)];
    assert.equal(installs.length, 1, 'the driver is installed once, by the privacy probe step, and reused');
    const tool = JSON.parse(readFileSync(new URL('../tools/playwright-core/package.json', import.meta.url), 'utf8'));
    assert.match(tool.dependencies['playwright-core'], /^\d+\.\d+\.\d+$/, 'the driver is not pinned to one exact version');
    assert.match(stepOf('End-to-end tests (the page, in a browser)'), /--playwright tools\/playwright-core\/node_modules\/playwright-core/);
  });

  it('on a server of its own, so it never reads a page another step left running', () => {
    const step = stepOf('End-to-end tests (the page, in a browser)');
    const [, port] = step.match(/PORT=(\d+) /) ?? [];
    assert.ok(port, 'the step starts its own server');
    assert.ok(step.includes(`--url http://127.0.0.1:${port}`), 'and drives that one');
    assert.ok(!stepOf('Privacy probe (a pasted log never leaves the browser)').includes(`PORT=${port} `), 'on a port the probe does not use');
  });
});

describe('the bill the flows expect is still the bill the price list gives', () => {
  it('Claude Opus 5 is priced as the hand arithmetic in scripts/e2e.mjs assumes', () => {
    /*
      The flows expect $1.43 and its parts, worked out by hand. When one of
      these three figures changes the flows fail in a browser with "waited for
      the total": this fails first and says why. Re-price the log in
      scripts/e2e.mjs by hand, then change the figure here.
    */
    const model = getModel('claude-opus-5');
    assert.equal(model.inputPerMTok, 5);
    assert.equal(model.outputPerMTok, 25);
    assert.equal(multipliersFor(model).cacheRead, 0.1);
  });

  it('and the hand arithmetic adds up', () => {
    const cents = (tokens, perMTok) => Math.round((tokens * perMTok) / 10_000);
    const input = cents(120_000 + 150_000, 5);
    const reads = cents(40_000 + 40_000, 0.5);
    const output = cents(800 + 800, 25);
    assert.deepEqual([input, reads, output], [135, 4, 4]);
    assert.equal(input + reads + output, 143);
    const source = read('scripts/e2e.mjs');
    // The recorded run on the Tasks tab: 300,000 in and 3,000 out, in thousandths of a dollar.
    assert.equal(100_000 + 1_000 + 200_000 + 2_000, 303_000);
    assert.equal((300_000 * 5 + 3_000 * 25) / 1_000, 1_575);
    // The sample month the landing's flow loads, in millionths of a dollar.
    const micro = (tokens, perMTok) => tokens * perMTok;
    const opus = micro(125_900, 5) + micro(6_000, 25) + micro(98_500, 0.5) + micro(17_300, 6.25);
    const sonnet = micro(38_400, 2) + micro(2_650, 10);
    const haiku = micro(5_000, 1) + micro(115, 5);
    assert.deepEqual([opus, sonnet, haiku], [936_875, 103_300, 5_575]);
    assert.equal(Math.round((opus + sonnet + haiku) / 10_000), 105, 'the sample month is not $1.05');
    for (const [id, input, output] of [['claude-sonnet-5', 2, 10], ['claude-haiku-4-5', 1, 5]]) {
      assert.equal(getModel(id).inputPerMTok, input, `${id} input moved: re-price the sample month in scripts/e2e.mjs`);
      assert.equal(getModel(id).outputPerMTok, output, `${id} output moved: re-price the sample month in scripts/e2e.mjs`);
    }
    assert.equal(multipliersFor(getModel('claude-opus-5')).cacheWrite5m, 1.25);
    for (const shown of ['2 calls · $1.43', '\\$1\\.35', '\\$0\\.0400', '270,000', '80,000', '1,600', '303,000', '$1.575', '8 calls · $1.05', '\\$0\\.1033']) {
      assert.ok(source.includes(shown), `scripts/e2e.mjs no longer expects ${shown}`);
    }
  });
});

/**
 * CI hands both browser scripts the driver as a path relative to the
 * checkout, `tools/playwright-core/node_modules/playwright-core`,
 * since #874. `createRequire` refuses a relative path, and the first run
 * failed on it: `done` passed only because it is given an absolute one. Each
 * script is run here from a directory beside a stand-in driver whose launch
 * throws a marker as it loads, so the marker means the relative path was
 * loaded.
 */
describe('the browser scripts take the driver from a path relative to where they run', () => {
  for (const script of ['scripts/privacy-probe.mjs', 'scripts/e2e.mjs']) {
    it(script, () => {
      const dir = mkdtempSync(join(tmpdir(), 'trazum-driver-'));
      try {
        const driver = join(dir, 'tools', 'playwright-core');
        mkdirSync(driver, { recursive: true });
        writeFileSync(join(driver, 'package.json'), '{"name":"playwright-core","main":"index.js"}');
        // Thrown when the module loads: both scripts load the driver before they wait for a server.
        writeFileSync(join(driver, 'index.js'), "throw new Error('STAND-IN DRIVER REACHED');\n");
        const run = spawnSync(process.execPath, [fileURLToPath(new URL(`../${script}`, import.meta.url)), '--url', 'http://127.0.0.1:9', '--chrome', '/nonexistent/chrome', '--playwright', relative(dir, driver)], {
          cwd: dir, env: process.env, encoding: 'utf8', timeout: 20_000,
        });
        const said = `${run.stdout}${run.stderr}`;
        assert.doesNotMatch(said, /ERR_INVALID_ARG_VALUE/, 'the relative path was refused');
        assert.match(said, /STAND-IN DRIVER REACHED/, `the driver was not loaded:\n${said.slice(0, 800)}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
