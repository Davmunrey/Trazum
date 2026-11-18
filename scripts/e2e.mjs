#!/usr/bin/env node
/**
 * End-to-end tests of the web app: a real browser, the production build, and
 * the things a visitor actually does.
 *
 *   npm run build:web
 *   cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
 *   PORT=3124 HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js &
 *   node scripts/e2e.mjs --url http://127.0.0.1:3124 \
 *     --chrome /usr/bin/google-chrome --playwright /tmp/pw/node_modules/playwright-core
 *
 *   --only bill       run the flows whose name contains a word
 *   --list            print the flows and stop
 *
 * Why it exists. The web app's other tests read modules and rendered
 * components. Until this file nothing opened the page and read the bill it
 * printed: the privacy probe drives a browser, and checks one promise, that a
 * pasted log never leaves the page. A page can keep it and print the wrong
 * total.
 *
 * What a flow is. One thing a visitor does, from an empty browser, and what
 * the page then shows. Every expected figure is written down here by hand
 * from the price list, never read back from the product: a test that asks the
 * code what the answer is agrees with any answer.
 *
 * What it needs and does not bring: a Chrome-family browser and
 * `playwright-core`, both passed in, as the privacy probe does. CI installs
 * `playwright-core` pinned, with `--ignore-scripts`, into a temporary
 * directory and drives the runner's own Chrome.
 *
 * No screenshots are compared and nothing is retried. A flow that fails says
 * which step it was waiting for and what the page showed instead.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What a visitor on a laptop and on a phone sees the page at. */
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * Two calls to Claude Opus 5, priced by hand at $5 per million input tokens,
 * $25 per million output, and a cache read at a tenth of input:
 *
 *   call 1   120,000 in  $0.60   40,000 read  $0.02   800 out  $0.02   = $0.64
 *   call 2   150,000 in  $0.75   40,000 read  $0.02   800 out  $0.02   = $0.79
 *                                                                total   $1.43
 */
const LOG = [0, 30]
  .map((seconds, index) =>
    JSON.stringify({
      ts: new Date(Date.UTC(2026, 10, 1, 10, 0, seconds)).toISOString(),
      model: 'claude-opus-5',
      label: 'support',
      session: 'conversation-1',
      usage: { input_tokens: 120_000 + index * 30_000, output_tokens: 800, cache_read_input_tokens: 40_000 },
    }),
  )
  .join('\n');

/**
 * A Claude Code session of two calls to Claude Opus 5, for the Tasks tab:
 *
 *   call 1   100,000 in   1,000 out
 *   call 2   200,000 in   2,000 out
 *            300,000 in   3,000 out   = 303,000 tokens
 *            $1.50        $0.075      = $1.575
 */
const RUN = [['00', 100_000, 1_000], ['05', 200_000, 2_000]]
  .map(([minute, input, output]) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: `2026-11-01T10:${minute}:00Z`,
      sessionId: 'e2e-run',
      requestId: `req-${minute}`,
      message: {
        model: 'claude-opus-5',
        content: [{ type: 'text', text: '(synthetic: no real prompt or answer)' }],
        usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }),
  )
  .join('\n');

/**
 * The sample month the bill's first control prices: the Playground's
 * `usage.jsonl` in `apps/web/lib/playground.ts`, eight calls, priced by hand
 * from the price list (Opus 5 $5 in, $25 out, cache read a tenth of input and
 * a five-minute cache write 1.25 times it; Sonnet 5 $2 and $10; Haiku 4.5 $1
 * and $5, all per million tokens):
 *
 *   support-rag   Opus 5     3 calls   125,900 in    $0.6295
 *                                         6,000 out   $0.15
 *                                        98,500 read  $0.04925
 *                                        17,300 write $0.108125   = $0.936875
 *   summarise     Sonnet 5   3 calls    38,400 in    $0.0768
 *                                         2,650 out   $0.0265     = $0.1033
 *   classify      Haiku 4.5  2 calls     5,000 in    $0.005
 *                                           115 out   $0.000575   = $0.005575
 *                                               8 calls, total    $1.04575, shown as $1.05
 */

/**
 * The flows. `covers` names the tabs a flow opens; `e2e.test.mjs` requires
 * every tab the app renders to be covered by one, so a new tab arrives with
 * its flow or fails the build.
 */
export const FLOWS = [
  {
    name: 'bill: a pasted log is priced, to the cent, by part and by label',
    covers: ['bill'],
    async run({ page, open, panel, see }) {
      await open('/app?tab=bill');
      const bill = panel('bill');
      await bill.getByRole('textbox', { name: 'Usage log to analyse' }).fill(LOG);
      await bill.getByRole('button', { name: 'Read the bill' }).click();
      await see(bill.getByText('2 calls · $1.43'), 'the total over the two calls');
      await see(bill.getByRole('row', { name: /^Input\s+\$1\.35\s+94%\s+270,000$/ }), 'the input line: $1.35 on 270,000 tokens');
      await see(bill.getByRole('row', { name: /^Cache reads\s+\$0\.0400\s+3%\s+80,000$/ }), 'the cache reads: $0.04 on 80,000 tokens');
      await see(bill.getByRole('row', { name: /^Output\s+\$0\.0400\s+3%\s+1,600$/ }), 'the output line: $0.04 on 1,600 tokens');
      await see(bill.getByRole('row', { name: /^support\s+\$1\.43\s+100%\s+2$/ }), 'the label, with all of the spend and both calls');
      await see(bill.getByRole('row', { name: /^claude-opus-5\s+\$1\.43\s+100%\s+2$/ }), 'the model, with all of the spend and both calls');
      await see(page.getByText(/^Calls with a price\s*2 \/ 2$/), 'both calls priced, of two');
    },
  },
  {
    name: 'bill: a paste that is not a log is refused in words, with the lines it could not read',
    covers: ['bill'],
    async run({ open, panel, see }) {
      await open('/app?tab=bill');
      const bill = panel('bill');
      await bill.getByRole('textbox', { name: 'Usage log to analyse' }).fill('this is not a usage log\nnor is this');
      await bill.getByRole('button', { name: 'Read the bill' }).click();
      await see(bill.getByText('No usage records in that log.'), 'the refusal');
      await see(bill.getByText('2 lines could not be read and were left out (lines 1, 2).'), 'which lines were left out');
    },
  },
  {
    name: 'bill: on a phone the same log gives the same total, and the page does not scroll sideways',
    covers: ['bill'],
    viewport: PHONE,
    async run({ page, open, panel, see, noSidewaysScroll }) {
      await open('/app?tab=bill');
      await noSidewaysScroll('before a log is read');
      const bill = panel('bill');
      await bill.getByRole('textbox', { name: 'Usage log to analyse' }).fill(LOG);
      await bill.getByRole('button', { name: 'Read the bill' }).click();
      await see(bill.getByText('2 calls · $1.43'), 'the total over the two calls');
      await noSidewaysScroll('with the report on the page');
      await see(page.getByRole('button', { name: 'Open menu' }), 'the menu the tabs are behind at this width');
    },
  },
  {
    name: 'optimise: a prompt comes back shorter, with the count and the rule that did it',
    covers: ['optimise'],
    async run({ open, panel, see, gone }) {
      await open('/app?tab=optimise');
      const optimise = panel('optimise');
      await see(optimise.getByRole('heading', { name: 'Nothing priced yet' }), 'the empty state');
      await optimise.getByRole('textbox', { name: 'Prompt to optimise' }).fill('Please summarise this text.');
      await optimise.getByRole('button', { name: 'Optimise', exact: true }).click();
      await see(optimise.getByText('8 → 6 input tokens'), 'the count before and after');
      await see(optimise.getByText('Summarise this text.', { exact: true }), 'the optimised prompt');
      await see(optimise.getByText(/Politeness formulas \(1×/), 'the rule that fired, once');
      await gone(optimise.getByRole('heading', { name: 'Nothing priced yet' }), 'the empty state, once there is a result');
    },
  },
  {
    name: 'compare: two versions of a prompt are compared after minus before',
    covers: ['compare'],
    async run({ open, panel, see }) {
      await open('/app?tab=compare');
      const compare = panel('compare');
      await see(compare.getByRole('heading', { name: 'Nothing compared yet' }), 'the empty state');
      await compare.getByRole('textbox', { name: 'Before' }).fill('Please summarise this text for me, thank you very much indeed.');
      await compare.getByRole('textbox', { name: 'After' }).fill('Summarise this text.');
      await compare.getByRole('button', { name: 'Compare', exact: true }).click();
      await see(compare.getByText('18 → 6 input tokens'), 'the count before and after');
      await see(compare.getByText('-12 tokens (-67%)'), 'the difference, negative because the prompt shrank');
      await see(compare.getByText('Politeness formulas'), 'the rule that no longer finds anything');
    },
  },
  {
    name: 'write: answering a question asks the next one and says how many are left',
    covers: ['write'],
    async run({ page, open, panel, see, gone }) {
      await open('/app?tab=write');
      const write = panel('write');
      await see(write.getByText('What should the model do, in one sentence?').first(), 'the first question');
      await write.getByRole('textbox').first().fill('Summarise a support ticket in two sentences.');
      await write.getByRole('button', { name: 'Answer' }).click();
      await see(write.getByText('Who is the model being while it does that?').first(), 'the second question');
      await see(write.getByText('3 answers are still needed before a prompt can be written.'), 'how many answers are left');
      // The first question is asked once, when the panel opens. Asked again
      // when the language changes, it would put the reader back at the start.
      await page.getByRole('button', { name: 'Español', exact: true }).click();
      await see(write.getByText('¿Quién es el modelo mientras lo hace?').first(), 'the same question, in Spanish, after the language changes');
      await see(write.getByText('Faltan 3 respuestas antes de poder escribir un prompt.'), 'the same count of answers left, in Spanish');
      await gone(write.getByText('¿Qué debe hacer el modelo, en una frase?'), 'the first question, which was already answered');
    },
  },
  {
    name: 'playground: help lists the commands, and one of them runs on the loaded sample',
    covers: ['playground'],
    async run({ open, panel, see }) {
      await open('/app?tab=playground');
      const playground = panel('playground');
      const line = playground.getByRole('textbox', { name: 'Playground command line' });
      await line.fill('help');
      await line.press('Enter');
      await see(playground.getByText(/trazum optimize prompt\.txt\s+apply the rules, count what they save/), 'the command list');
      await line.fill('trazum rules');
      await line.press('Enter');
      await see(playground.getByText('$ trazum rules'), 'the command echoed back');
      await see(playground.getByText(/politeness/).first(), 'the rule list it prints');
    },
  },
  {
    name: 'tasks: a recorded run becomes a report, with its tokens counted and priced',
    covers: ['tasks'],
    async run({ open, panel, see }) {
      await open('/app?tab=tasks');
      const tasks = panel('tasks');
      await see(tasks.getByRole('heading', { name: '01 / Recorded run' }), 'the first step');
      await tasks.locator('input[type="file"]').setInputFiles({ name: 'e2e-run.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(RUN) });
      await see(tasks.getByText('1. e2e-run.jsonl'), 'the file, listed');
      await tasks.getByLabel('Run ID').fill('e2e-run-1');
      await tasks.getByLabel('Task type').fill('bugfix');
      await tasks.getByLabel('Acceptance criterion').fill('npm test passes');
      await tasks.getByRole('button', { name: 'Analyze run' }).click();
      await see(tasks.getByText('Run report'), 'the report');
      await see(tasks.getByText('303,000', { exact: true }), 'the tokens the two calls recorded');
      await see(tasks.getByText('$1.575', { exact: true }), 'what those tokens cost at list price');
      await see(tasks.getByText('e2e-run-1 / bugfix'), 'the run as it was named');
      await see(tasks.getByText(/^No supported repeated results found\./), 'that nothing was repeated, said in words');
    },
  },
  {
    name: 'tabs: each one opens by click and by address, one panel at a time',
    covers: ['bill', 'tasks', 'playground', 'optimise', 'write', 'compare'],
    async run({ page, open, see, is }) {
      await open('/app');
      await see(page.getByRole('tab', { name: 'Your bill', selected: true }), 'the bill, which is where a first visit lands');
      await see(page.locator('[data-tour="panel-bill"]'), 'the bill panel');
      const tabs = [
        ['Tasks', 'tasks'], ['Playground', 'playground'], ['Optimise', 'optimise'], ['Write', 'write'], ['Compare', 'compare'],
      ];
      for (const [name, tab] of tabs) {
        await page.getByRole('tab', { name }).click();
        await see(page.locator(`[data-tour="panel-${tab}"]`), `the ${name} panel`);
        is(new URL(page.url()).searchParams.get('tab'), tab, `the address after opening ${name}`);
        const shown = await page.locator('[data-tour^="panel-"]').evaluateAll((panels) =>
          panels.filter((panel) => panel.offsetParent !== null).map((panel) => panel.dataset.tour),
        );
        is(shown.join(','), `panel-${tab}`, `the only panel shown after opening ${name}`);
      }
      await open('/app?tab=compare');
      await see(page.getByRole('tab', { name: 'Compare', selected: true }), 'the tab an address names');
    },
  },
  {
    name: 'site: a visitor lands on the landing, follows the way in, loads the sample and reads a bill',
    covers: ['bill'],
    async run({ page, open, panel, see, gone, is }) {
      await open('/');
      await see(page.getByRole('heading', { level: 1, name: /^Know what your AI agents cost, per project/ }), 'the headline');
      await see(page.locator('[data-command]').filter({ hasText: 'npx @trazum/cli bill' }).first(), 'the command, with its copy control');
      is(
        await page.locator('[data-site-header] [data-github-button]').first().getAttribute('href'),
        'https://github.com/Davmunrey/Trazum',
        'where the header’s GitHub button goes',
      );
      await page.locator('[data-site-header]').getByRole('link', { name: 'Open the dashboard' }).click();
      await page.waitForURL((url) => url.pathname === '/app');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      const bill = panel('bill');
      await bill.getByRole('button', { name: 'Load the sample month' }).click();
      await see(bill.getByText('8 calls · $1.05'), 'the sample month: eight calls, $1.05');
      await see(bill.getByRole('row', { name: /^summarise\s+\$0\.1033\s+10%\s+3$/ }), 'the summarise label: $0.1033 on three calls');
      await gone(bill.getByRole('button', { name: 'Load the sample month' }), 'the sample control, once there is a bill');
      // And an address written before the move still lands on the panel it named.
      await open('/?tab=compare&from=readme');
      is(new URL(page.url()).pathname + new URL(page.url()).search, '/app?tab=compare&from=readme', 'where the old address went');
      await see(page.getByRole('tab', { name: 'Compare', selected: true }), 'the panel the old address named');
    },
  },
  {
    name: 'docs: from the landing, follow Docs, search a term, open a result and land on its heading',
    covers: [],
    async run({ page, open, see, is }) {
      await open('/');
      await page.locator('[data-site-header]').getByRole('link', { name: 'Docs', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/docs');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      await see(page.getByRole('heading', { level: 1, name: 'Documentation' }), 'the documentation index');
      await page.getByRole('searchbox', { name: 'Search the documentation' }).fill('baseline gate');
      /*
        The result is the heading "The CI gate: a budget is a ceiling, a
        baseline is a gate" in the command reference. GitHub's address for it,
        worked out by hand: lower case, the colon and the comma dropped, each
        space a hyphen.
      */
      const result = page.getByRole('link', { name: /The CI gate: a budget is a ceiling, a baseline is a gate/ }).first();
      await see(result, 'a result for the heading');
      await result.click();
      await page.waitForURL((url) => url.pathname === '/docs/commands');
      is(new URL(page.url()).hash, '#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate', 'the heading the result names');
      const heading = page.getByRole('heading', { level: 3, name: /^The CI gate: a budget is a ceiling, a baseline is a gate/ });
      await see(heading, 'the heading, on its page');
      /*
        The page scrolls to the heading once it has arrived, which is after the
        heading exists: the document streams in and the scroll follows it. So
        the position is read until it is right or five seconds have passed. One
        read straight away failed once in a run on a loaded machine, on
        2026-11-18, with the page still at the top.
      */
      let top = Number.NaN;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        top = await heading.evaluate((element) => Math.round(element.getBoundingClientRect().top));
        if (top >= 0 && top < 400) break;
        await page.waitForTimeout(100);
      }
      is(top >= 0 && top < 400, true, 'whether the heading is scrolled into view, not left below the fold');
      is(await page.locator('[data-doc="commands"]').getAttribute('lang'), 'en', 'the language the document is marked in');
      is(
        await page.locator('[data-view-on-github]').first().getAttribute('href'),
        'https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md',
        'where View on GitHub goes',
      );
    },
  },
  {
    name: 'models: from the landing, follow Models, filter by provider and by name, see a retired model drawn as retired, and send nothing',
    covers: [],
    async run({ page, open, see, gone, is }) {
      await open('/');
      await page.locator('[data-site-header]').getByRole('link', { name: 'Models', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/models');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      await see(page.getByRole('heading', { level: 1, name: 'Models and prices' }), 'the catalogue page');
      const rows = () => page.locator('[data-model]').count();
      const all = await rows();
      await see(page.getByRole('status').filter({ hasText: `Showing ${all} of ${all} models` }), 'the count of every model before a filter');
      await see(page.getByRole('button', { name: new RegExp(`^All providers\\s*${all}$`) }), 'the same count on the filter for every provider');

      // Nothing typed or clicked from here on may leave the page.
      const sent = [];
      page.on('request', (request) => sent.push(request.url()));
      await page.getByRole('button', { name: /^DeepSeek/ }).click();
      is(await page.locator('[data-provider-section]').count(), 1, 'the provider sections left after choosing one provider');
      is(await page.locator('[data-model]').evaluateAll((rows) => rows.every((row) => row.getAttribute('data-provider') === 'deepseek')), true, 'whether every row left is that provider’s');
      await page.getByRole('searchbox', { name: 'Filter models' }).fill('v4 pro');
      await see(page.locator('[data-model="deepseek-v4-pro"]'), 'the model the words name');
      await gone(page.locator('[data-model="deepseek-flash"]'), 'a model of the same provider the words do not name');
      await page.getByRole('searchbox', { name: 'Filter models' }).fill('zzzz-no-such-model');
      await see(page.locator('[data-no-match]'), 'the sentence for a filter nothing matches');
      is(await page.getByRole('searchbox', { name: 'Filter models' }).evaluate(() => window.location.search + window.location.hash), '', 'what the filter wrote to the address');

      // A retired model is drawn as retired, in a tab of its own and not by colour alone.
      await page.getByRole('button', { name: /^All providers/ }).click();
      await page.getByRole('searchbox', { name: 'Filter models' }).fill('gemini-2.5-pro');
      const retired = page.locator('[data-model="gemini-2.5-pro"]');
      await see(retired.locator('[data-state="retired"]'), 'the Retired tab on a model the provider refused');
      is(await retired.getAttribute('data-retired'), '', 'whether the row is marked retired');
      is(sent.join(' '), '', 'the requests the page made while it was filtered');
    },
  },
  {
    name: 'tour: each page it visits runs its own demo, once',
    covers: [],
    async run({ page, open, see, is }) {
      await open('/app');
      await page.getByRole('button', { name: 'Start the tour' }).click();
      const tour = page.getByRole('dialog');
      /** Next, and then the step the tour says it is on. */
      const step = async (number) => {
        if (number > 1) await tour.getByRole('button', { name: 'Next', exact: true }).click();
        await see(tour.getByText(`${number} of 10`), `step ${number} of the tour`);
      };
      await step(1);
      await step(2);
      await see(page.locator('[data-tour="panel-bill"]').getByText('Catalogue-priced spend'), 'the sample month, priced in the bill');
      await step(3);
      await see(page.locator('[data-tour="panel-optimise"]').getByText(/^\d+ → \d+ input tokens$/), 'the sample prompt, optimised');
      await step(4);
      await see(page.locator('[data-tour="panel-write"]').getByText('What should the model do, in one sentence?').first(), 'the first question of the prompt writer');
      await step(5);
      await see(page.locator('[data-tour="panel-compare"]').getByText(/^\d+ → \d+ input tokens$/), 'the pair on screen, compared');
      await step(6);
      const terminal = page.locator('[data-tour="panel-playground"]');
      // The typing hand writes each command and runs it. Subscribed twice, it would type and run each one twice.
      const typed = ['trazum profile usage.jsonl', 'trazum optimize prompt.txt', 'trazum position usage.jsonl'];
      for (const [index, command] of typed.entries()) {
        await step(7 + index);
        await see(terminal.getByText(`$ ${command}`, { exact: true }), `the hand's command, run: ${command}`);
      }
      await step(10);
      for (const command of typed) is(await terminal.getByText(`$ ${command}`, { exact: true }).count(), 1, `how many times the hand ran ${command}`);
      await tour.getByRole('button', { name: 'Done', exact: true }).click();
      is(await tour.count(), 0, 'the number of tour dialogs left open after Done');
    },
  },
  {
    name: 'appearance: dark is applied at once and is still there after a reload',
    covers: [],
    async run({ page, open, is }) {
      await open('/app');
      is(await page.locator('html').getAttribute('data-theme'), 'light', 'the theme a light system starts in');
      await page.getByRole('button', { name: 'Dark', exact: true }).click();
      is(await page.locator('html').getAttribute('data-theme'), 'dark', 'the theme after choosing Dark');
      await open('/app');
      is(await page.locator('html').getAttribute('data-theme'), 'dark', 'the theme after a reload');
      await page.getByRole('button', { name: 'Light', exact: true }).click();
      is(await page.locator('html').getAttribute('data-theme'), 'light', 'the theme after choosing Light');
    },
  },
  {
    name: 'language: Spanish changes the page, its lang attribute, and survives a reload',
    covers: [],
    async run({ page, open, see, is }) {
      await open('/app');
      await page.getByRole('button', { name: 'Español', exact: true }).click();
      await see(page.getByRole('tab', { name: 'Tu factura' }), 'the bill tab, in Spanish');
      is(await page.locator('html').getAttribute('lang'), 'es', 'the lang attribute after choosing Spanish');
      await open('/app');
      await see(page.getByRole('tab', { name: 'Tu factura' }), 'the bill tab, still in Spanish after a reload');
      await see(page.getByRole('button', { name: 'Leer la factura' }), 'the button that reads a bill, in Spanish');
    },
  },
  {
    name: 'phone: the tabs are behind a menu, and the menu reaches them',
    covers: ['optimise'],
    viewport: PHONE,
    async run({ page, open, see, is }) {
      await open('/app');
      const visibleTabs = () => page.getByRole('tab').evaluateAll((tabs) => tabs.filter((tab) => tab.offsetParent !== null).length);
      is(await visibleTabs(), 0, 'the number of tabs showing before the menu is opened');
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('tab', { name: 'Optimise' }).click();
      await see(page.locator('[data-tour="panel-optimise"]'), 'the Optimise panel');
      await see(page.getByRole('textbox', { name: 'Prompt to optimise' }), 'the prompt box');
    },
  },
];

const HELP = 'e2e: pass --chrome <executable> and --playwright <path to playwright-core>.';

/**
 * A driver error as one readable line: what timed out and what it was waiting
 * for, without the colour codes and the retry log the driver appends.
 */
export const plain = (message) => {
  const lines = message.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const waiting = lines.find((line, index) => index > 0 && line.startsWith('- waiting for '));
  return waiting === undefined ? lines[0] : `${lines[0]} It was ${waiting.slice(2)}.`;
};

/** One line of the page's visible text, for the message of a step that failed. */
const excerpt = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 400);

async function main(argv) {
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? fallback : argv[at + 1];
  };
  const only = flag('only', null);
  const chosen = FLOWS.filter((flow) => only === null || flow.name.includes(only));
  if (argv.includes('--list')) {
    for (const flow of FLOWS) console.log(flow.name);
    return 0;
  }
  if (chosen.length === 0) throw new Error(`no flow's name contains "${only}"`);

  const base = new URL(flag('url', 'http://127.0.0.1:3124'));
  const chrome = flag('chrome', process.env.CHROME_PATH);
  const playwrightPath = flag('playwright', process.env.PLAYWRIGHT_CORE_PATH);
  const timeout = Number(flag('timeout-ms', '20000'));
  if (!chrome || !playwrightPath) {
    console.error(HELP);
    return 2;
  }
  const { chromium } = createRequire(join(playwrightPath, 'package.json'))('./index.js');

  // The server may still be starting: ask until it answers, then stop asking.
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(base, { redirect: 'manual' })).status < 500) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`no answer from ${base.origin} within a minute`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    // Root in a container cannot have Chrome's sandbox; a CI runner is not root and keeps it.
    chromiumSandbox: typeof process.getuid === 'function' ? process.getuid() !== 0 : true,
  });

  const failures = [];
  try {
    for (const flow of chosen) {
      const started = Date.now();
      // An empty browser for every flow: no theme, language or history from the one before.
      const context = await browser.newContext({
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
        viewport: flow.viewport ?? DESKTOP,
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(timeout);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      /**
       * What the open panel says, or the page when no panel is showing: the
       * text a failed step was looking in. The rendered text, which is what a
       * visitor reads: a panel that is in the page and hidden says nothing.
       */
      const shown = async () => {
        const panels = await page.locator('[data-tour^="panel-"]').filter({ visible: true }).allInnerTexts();
        if (panels.length > 0) return `The panel shows: ${excerpt(panels.join(' '))}`;
        return `The page shows: ${excerpt((await page.locator('body').allInnerTexts()).join(' '))}`;
      };
      const tools = {
        page,
        panel: (tab) => page.locator(`[data-tour="panel-${tab}"]`),
        async open(path) {
          const address = new URL(path, base).href;
          await page.goto(address, { waitUntil: 'networkidle' });
          // Set once every first-render effect has run: before it, a click can land on a page that is not listening.
          try {
            await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
          } catch {
            throw new Error(`${address} loaded and never said it had started: its scripts did not run. Is the build's static directory beside the server?`);
          }
        },
        async see(locator, what) {
          try {
            await locator.first().waitFor({ state: 'visible' });
          } catch {
            throw new Error(`waited for ${what} and it did not appear. ${await shown()}`);
          }
        },
        async gone(locator, what) {
          try {
            await locator.first().waitFor({ state: 'hidden' });
          } catch {
            throw new Error(`${what} is still on the page`);
          }
        },
        is(actual, expected, what) {
          if (actual !== expected) throw new Error(`${what}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
        },
        async noSidewaysScroll(when) {
          const [content, viewport] = await page.evaluate(() => [
            document.scrollingElement.scrollWidth, document.scrollingElement.clientWidth,
          ]);
          if (content > viewport) throw new Error(`the page is ${content}px wide in a ${viewport}px viewport ${when}`);
        },
      };
      try {
        await flow.run(tools);
        if (errors.length > 0) throw new Error(`the page threw: ${errors.join(' | ').slice(0, 400)}`);
        console.log(`ok      ${flow.name}  (${Date.now() - started} ms)`);
      } catch (error) {
        failures.push(flow.name);
        console.log(`not ok  ${flow.name}\n        ${plain(error.message)}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${chosen.length - failures.length} of ${chosen.length} flows passed.`);
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`e2e: ${error.message}`);
      process.exit(1);
    },
  );
}
