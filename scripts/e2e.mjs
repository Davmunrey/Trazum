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
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every text on the page against the ground it sits on: 4.5:1, or 3:1 for text
 * 24px and larger or bold at 18.66px and larger (WCAG 2, 1.4.3). The words that
 * fall short, with their ratio, or the empty string. Read the same way for every
 * page whose flow asks.
 */
const unreadableText = (page) =>
  page.evaluate(() => {
    const channels = (value) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]) => {
      const f = (channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ground = (element) => {
      for (let at = element; at !== null; at = at.parentElement) {
        const value = channels(getComputedStyle(at).backgroundColor);
        if (value.length === 3 || (value.length === 4 && value[3] === 1)) return value.slice(0, 3);
      }
      return channels(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const found = [];
    for (const element of document.querySelectorAll('main *')) {
      const own = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim() !== '');
      const box = element.getBoundingClientRect();
      if (!own || box.width <= 1 || box.height <= 1) continue;
      const style = getComputedStyle(element);
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const [a, b] = [luminance(channels(style.color)), luminance(ground(element))].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < (large ? 3 : 4.5)) found.push(`${element.textContent.trim().slice(0, 40)} ${ratio.toFixed(2)}:1`);
    }
    return found.join(' | ');
  });

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
 * The landing's story, read the way a visitor sees it.
 *
 * `toStory(page, p)` scrolls to a point of the story (0 as the hero scrolls
 * out, half a window before the section's top reaches the top of the window,
 * and 1 when the stage lets go: the stylesheet's `entry 50% contain 100%`)
 * and waits two frames, so the scroll timeline or the fallback script has
 * drawn it. `toChapter(page, id, f)` scrolls to a fraction `f` of a chapter:
 * a chapter is current while its slot's top is above the middle of the
 * window, the line the timeline uses. `seen(page, text)` says whether an
 * element holding exactly that text, or a line of the screen holding it, is
 * on screen: inside the viewport and, with every ancestor's opacity
 * multiplied in, at least 0.9 opaque, and not cut away by a clip or hidden
 * behind something (it is found by a hit test at its middle). `lidAngle(page)`
 * is the lid's rotation about its hinge, in degrees, read back from the
 * computed transform: 0 open, about -103 closed.
 */
async function toStory(page, p) {
  await page.evaluate(async (p) => {
    const story = document.querySelector('.story');
    const top = story.getBoundingClientRect().top + window.scrollY;
    const lead = window.innerHeight / 2;
    window.scrollTo(0, top - lead + p * (story.offsetHeight - window.innerHeight + lead));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, p);
}

async function toChapter(page, id, f = 0.6) {
  await page.evaluate(
    async ([id, f]) => {
      const slot = document.querySelector(`.story [data-ch="${id}"]`);
      const top = slot.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - window.innerHeight / 2 + f * slot.offsetHeight);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    [id, f],
  );
  // The chapter is read by an observer, which reports after the frame; then two frames for what it changed to be drawn.
  await page.waitForFunction((id) => document.querySelector('.story').dataset.chapter === id, id);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const seen = (page, text) =>
  page.evaluate((text) => {
    const owners = [...document.querySelectorAll('.story .tl, .story li, .story p, .story h2, .story h3, .story span')].filter(
      (element) => element.textContent.trim() === text || (element.classList.contains('tl') && element.textContent.includes(text)),
    );
    for (const element of owners) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) continue;
      let opacity = 1;
      for (let at = element; at !== null; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
      if (opacity < 0.9 || getComputedStyle(element).visibility !== 'visible') continue;
      // Not cut away and not behind anything: a clip removes what it hides from hit testing, so the element must be
      // found at the middle of its visible part.
      const x = (Math.max(box.left, 0) + Math.min(box.right, window.innerWidth)) / 2;
      const y = (Math.max(box.top, 0) + Math.min(box.bottom, window.innerHeight)) / 2;
      if (document.elementsFromPoint(x, y).includes(element)) return true;
    }
    return false;
  }, text);

const lidAngle = (page) =>
  page.evaluate(() => {
    const transform = getComputedStyle(document.querySelector('.lt-lid')).transform;
    const m = transform.match(/matrix3d\(([^)]*)\)/);
    if (m === null) return 0;
    const v = m[1].split(',').map(Number);
    return Math.round((Math.atan2(v[6], v[5]) * 180) / Math.PI);
  });

/**
 * What the story shows, in the order it shows it, by scroll alone, each
 * worked out from the commands the generator runs
 * (`scripts/draw-landing-terminal.mjs`) or the copy: the arrival's words, the
 * bill's total on the screen, the receipt's total on the desk (on a wide
 * screen; a phone keeps the receipt in the laptop until it comes forward),
 * each object's own output, the page the receipt's first rate was read from,
 * the model the example keeps out of the total, what never leaves, and the
 * closing.
 */
const STORY_MARKS = [
  ['the arrival’s words', 'Scroll, and each object takes its turn. Press one, and the screen shows what it does.'],
  ['the bill’s total, on the screen', '$12.70 across 126 priced call(s)'],
  ['the receipt’s total, on the desk', 'Total'],
  ['the gate’s verdict', 'All 3 within budget.'],
  ['the breaker’s stop', 'Trazum: stopped.'],
  ['the clock’s first week', '2026-W36'],
  ['the trimming’s counts', '326 → 202'],
  ['the calendar’s cut', 'rows shown: the models the receipt priced.'],
  ['the page a rate was read from', 'platform.claude.com'],
  ['the model kept out of the total', 'Not in the total: 2 call(s) to llama-3.3-70b-instruct'],
  ['what never leaves', 'Credentials'],
  ['the closing', 'No provider key needed to get started.'],
];

/** Scroll the story from top to bottom a step at a time; return where each mark was first seen. */
async function readStory(page, marks, steps = 200) {
  const first = new Map();
  for (let step = 0; step <= steps; step += 1) {
    await toStory(page, step / steps);
    for (const [what, text] of marks) if (!first.has(what) && (await seen(page, text))) first.set(what, step);
  }
  return first;
}

/** The story, top to bottom and back: each mark in its turn, and gone again on the way back up. */
async function storyInOrder({ page, is }, marks = STORY_MARKS) {
  const first = await readStory(page, marks);
  for (const [what] of marks) if (!first.has(what)) throw new Error(`scrolled the whole story and never saw ${what}`);
  const order = marks.map(([what]) => first.get(what));
  for (let at = 1; at < order.length; at += 1) {
    if (order[at] <= order[at - 1]) throw new Error(`${marks[at][0]} appeared at step ${order[at]}, not after ${marks[at - 1][0]} at ${order[at - 1]}`);
  }
  // Back up: the lid open again, and nothing after the bill on the screen.
  await toStory(page, 0.12);
  for (const [what, text] of marks.slice(3)) is(await seen(page, text), false, `${what}, gone again on the way back up`);
  await toStory(page, 0);
  is(await lidAngle(page), 0, 'the lid at the top of the story');
}

/**
 * Each chapter that is an object's turn, the object it lifts, and a line from
 * the end of its output (worked out from the commands each runs), which is
 * on the screen once it has printed: the screen scrolls up as a terminal does,
 * so the first lines of a long output have gone by then. The bill and the
 * clock end alike; which of them is showing is read from the screen itself.
 */
const CHAPTER_TURNS = [
  ['bill', 'bill', 'whoever pays: --pdf-out bill.pdf.'],
  ['check', 'check', 'Monthly cost $11.88 → $11.88 ($0)'],
  ['guard', 'guard', 'Trazum: stopped.'],
  ['clock', 'clock', 'whoever pays: --pdf-out bill.pdf.'],
  ['optimize', 'optimize', 'and it never contains prompt text.'],
  ['models', 'models', 'rows shown: the models the receipt priced.'],
];

/** The stage as a visitor reads it: the outputs showing, the objects pressed, and how many laptops. */
const stage = (page) =>
  page.evaluate(() => {
    const shown = [...document.querySelectorAll('.story .cap-out')].filter((element) => Number(getComputedStyle(element).opacity) > 0.99);
    const lines = shown.flatMap((element) => [...element.querySelectorAll('.tl')]);
    return {
      outputs: shown.map((element) => element.dataset.cap),
      text: shown.map((element) => element.textContent).join('\n'),
      allLinesShown: lines.length > 0 && lines.every((line) => getComputedStyle(line).opacity === '1'),
      pressed: [...document.querySelectorAll('.story .obj')].filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.dataset.obj),
      // The pressed look a visitor sees: the acid face, fully shown.
      lifted: [...document.querySelectorAll('.story .obj')].filter((button) => Number(getComputedStyle(button.querySelector('.obj-skin')).opacity) > 0.99).map((button) => button.dataset.obj),
      laptops: document.querySelectorAll('.lt-device').length,
    };
  });

/** Walk the story's chapters forward, then back: each object's chapter lifts it and only it, and puts its output on the one screen. */
async function chaptersTakeTurns({ page, is }) {
  const walk = async (turns) => {
    for (const [chapter, object, mark] of turns) {
      // The chapter and what it presses are drawn together: by the frame after the observer reports, both are there.
      await toChapter(page, chapter);
      const now = await stage(page);
      is(now.pressed.join(' '), object, `the ${chapter} chapter: the object pressed`);
      is(now.lifted.join(' '), object, `the ${chapter} chapter: the object lifted, as seen`);
      is(now.outputs.join(' '), object, `the ${chapter} chapter: the output on the screen`);
      is(await seen(page, mark), true, `the ${chapter} chapter: "${mark}" on the screen`);
      is(now.laptops, 1, 'the laptops on the page');
    }
  };
  await walk(CHAPTER_TURNS);
  await toChapter(page, 'close', 0.9);
  is((await stage(page)).pressed.join(' '), 'lid', 'the closing: the lid pressed');
  is((await lidAngle(page)) < -95, true, 'the closing: the lid shut');
  // Scrolling back walks back.
  await walk(CHAPTER_TURNS.toReversed());
  await toChapter(page, 'arrival', 0.3);
  is((await stage(page)).pressed.join(' '), '', 'the arrival: nothing pressed yet');
}

/** Press every object in turn, by keyboard, and read what the one laptop shows. */
async function pressEveryObject({ page, is }) {
  const group = page.getByRole('group', { name: 'What Trazum does, one object each' });
  is(await group.getByRole('button').count(), 7, 'the objects on the desk');
  await group.getByRole('button', { name: /^The receipt/ }).focus();
  const order = [];
  for (let step = 0; step < 7; step += 1) {
    order.push(await page.evaluate(() => document.activeElement?.dataset.obj ?? null));
    if (step < 6) await page.keyboard.press('Tab');
  }
  is(order.join(' '), 'bill check guard clock optimize models lid', 'the order the keyboard reaches the objects in');
  for (const [, id, mark] of CHAPTER_TURNS) {
    const button = group.locator(`[data-obj="${id}"]`);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const shown = document.querySelector('.story[data-pressed] .cap-out[data-on]');
      return shown !== null && [...shown.querySelectorAll('.tl')].every((line) => getComputedStyle(line).opacity === '1');
    });
    const now = await stage(page);
    is(now.outputs.join(' '), id, `the output on the screen after pressing ${id}`);
    is(now.text.includes(mark), true, `${id}: the screen shows "${mark}"`);
    is(now.pressed.join(' '), id, `${id}: the one object pressed`);
    is(now.laptops, 1, 'the laptops on the page');
    is(await lidAngle(page), 0, `${id}: the lid open`);
  }
  // The lid closes over what never leaves; opened again, the screen has the last command it showed.
  const lid = group.locator('[data-obj="lid"]');
  await lid.press('Enter');
  is(await lid.getAttribute('aria-pressed'), 'true', 'the lid, pressed');
  await page.waitForFunction(() => {
    const m = getComputedStyle(document.querySelector('.lt-lid')).transform.match(/matrix3d\(([^)]*)\)/);
    if (m === null) return false;
    const v = m[1].split(',').map(Number);
    return (Math.atan2(v[6], v[5]) * 180) / Math.PI < -95;
  });
  await lid.press('Enter');
  // Open again: no turn about the hinge left in the lid's transform.
  await page.waitForFunction(() => !/matrix3d/.test(getComputedStyle(document.querySelector('.lt-lid')).transform));
  is(await lidAngle(page), 0, 'the lid, open again');
  is((await stage(page)).outputs.join(' '), 'models', 'the screen, open again on the last command');
}

/** Every link and button in the chapters, focused one by one: none of them is behind the pinned stage. */
async function focusNeverBehindTheStage({ page, is }) {
  const count = await page.locator('.story .chapter-card :is(a, button)').count();
  is(count > 4, true, 'the links and buttons in the chapters');
  for (let index = 0; index < count; index += 1) {
    await page.locator('.story .chapter-card :is(a, button)').nth(index).focus();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const found = await page.evaluate(() => {
      const element = document.activeElement;
      const box = element.getBoundingClientRect();
      const x = Math.min(Math.max(box.left + box.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(box.top + box.height / 2, 0), window.innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return element === top || element.contains(top);
    });
    is(found, true, `focus on the chapters' control ${index + 1} of ${count}, in view and not behind the stage`);
  }
}

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
    name: 'brand: from the footer, follow Brand, see the wordmark on both grounds, copy a colour, and fetch every file offered',
    covers: [],
    async run({ page, open, see, is }) {
      await open('/');
      await page.locator('[data-site-footer]').getByRole('link', { name: 'Brand', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/brand');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      await see(page.getByRole('heading', { level: 1, name: 'Brand' }), 'the brand page');
      await see(page.locator('[data-mark="wordmark"][data-ground="light"] img'), 'the wordmark for a light ground');
      await see(page.locator('[data-mark="wordmark"][data-ground="dark"] img'), 'the wordmark for a dark ground');

      /*
        The files: the wordmark and the T, each light and dark, each as SVG and
        PNG, is 2 x 2 x 2 = 8. Each link is fetched and has to answer with the
        kind of file its name says.
      */
      await see(page.locator('[data-download="trazum-wordmark-dark.png"]'), 'a download button');
      is(await page.locator('[data-download]').count(), 8, 'how many files the page offers');
      const links = await page.locator('[data-download]').evaluateAll((anchors) => anchors.map((anchor) => [anchor.getAttribute('href'), anchor.getAttribute('data-download')]));
      for (const [href, name] of links) {
        const response = await page.request.get(new URL(href, page.url()).href);
        is(response.status(), 200, `the answer for ${name}`);
        is(response.headers()['content-type'].split(';')[0], name.endsWith('.svg') ? 'image/svg+xml' : 'image/png', `the kind of file ${name} is`);
      }

      /*
        A colour: the canvas on paper is #f6f4ec, the first row of the design
        document's table. Copying it changes the button and sends nothing.
      */
      const sent = [];
      page.on('request', (request) => sent.push(request.url()));
      await see(page.locator('[data-token="--paper"] [data-swatch="light"] code'), 'the canvas row');
      is(await page.locator('[data-token="--paper"] [data-swatch="light"] code').textContent(), '#f6f4ec', 'the canvas on paper');
      is(await page.locator('[data-token="--paper"] [data-swatch="dark"] code').textContent(), '#1c211b', 'the canvas on the dark ground');
      await page.locator('[data-copy="#f6f4ec"]').first().click();
      await see(page.getByRole('status').filter({ hasText: 'Copied: #f6f4ec' }), 'the copy confirmed');
      is(sent.join(' '), '', 'the requests the page made when a colour was copied');
    },
  },
  {
    name: 'pro: from the landing, follow Pro, read the tiers and that it is not open, find the one mailto, and send nothing off the site',
    covers: [],
    async run({ page, open, see, is }) {
      // Every request from the first one: none may leave the site.
      const requested = [];
      page.on('request', (request) => requested.push(request.url()));
      await open('/');
      const origin = new URL(page.url()).origin;
      await page.locator('[data-site-header]').getByRole('link', { name: 'Pro', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/pro');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      await see(page.getByRole('heading', { level: 1, name: 'Trazum Pro' }), 'the Pro page');
      await see(page.getByText('In development. Not open yet.', { exact: true }), 'the status above the title');
      await see(page.getByRole('heading', { level: 2, name: 'Not open yet' }), 'the section that says it is not open');

      /*
        The tiers, as Trazum Pro's docs/pricing.md decided them, written here
        by hand: Team €149 a month up to €5,000 of managed spend, Growth €499
        up to €25,000, Scale €1,499 up to €100,000, Enterprise by agreement
        above that. The share is the price over the ceiling: 149 / 5,000 is
        2.98%, 499 / 25,000 is 1.996%, stated as 2.00%, and 1,499 / 100,000
        is 1.499%, stated as 1.50%.
      */
      const rows = await page.locator('[data-tier]').evaluateAll((trs) =>
        trs.map((tr) => [tr.getAttribute('data-tier'), ...[...tr.querySelectorAll('th, td')].map((cell) => cell.textContent.trim())]),
      );
      is(
        JSON.stringify(rows),
        JSON.stringify([
          ['team', 'Team', '€149 a month', 'Up to €5,000', '2.98%'],
          ['growth', 'Growth', '€499 a month', 'Up to €25,000', '2.00%'],
          ['scale', 'Scale', '€1,499 a month', 'Up to €100,000', '1.50%'],
          ['enterprise', 'Enterprise', 'By agreement', 'Above €100,000', 'By agreement'],
        ]),
        'the tiers',
      );

      // One way to say you want it: a message to the address CODE_OF_CONDUCT.md publishes, the subject filled in.
      const cta = page.getByRole('link', { name: 'Tell me when it opens' });
      await see(cta, 'the call to action');
      is(await cta.getAttribute('href'), 'mailto:davidmunozrey@protonmail.com?subject=Trazum%20Pro%3A%20tell%20me%20when%20it%20opens', 'where the call to action goes');
      is(await page.locator('a[href^="mailto:"]').count(), 1, 'how many mailto links the page has');
      is(await page.locator('form, input, textarea, iframe').count(), 0, 'forms, fields and frames on the page');

      /*
        Every text on the page against the ground it sits on, in the light
        theme and then the dark one: 4.5:1, or 3:1 for text 24px and larger
        or bold at 18.66px and larger (WCAG 2, 1.4.3).
      */
      const unreadable = () => unreadableText(page);
      is(await unreadable(), '', 'text below its contrast on paper');
      await page.locator('[data-site-header]').getByRole('button', { name: 'Dark', exact: true }).first().click();
      await page.locator('html[data-theme="dark"]').waitFor({ state: 'attached' });
      is(await unreadable(), '', 'text below its contrast on the dark canvas');

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');
      is(requested.filter((url) => !url.startsWith(`${origin}/`) && !url.startsWith('data:')).join(' '), '', 'the requests that left the site');
      is(await page.evaluate(() => document.cookie), '', 'the cookies the page can read');
    },
  },
  {
    name: 'download: from the landing, follow Download, read each section against the release it names, and send nothing off the site',
    covers: [],
    async run({ page, open, see, is }) {
      // Every request from the first one: none may leave the site.
      const requested = [];
      page.on('request', (request) => requested.push(request.url()));
      // The version the repository is at, read from its own manifest and not from the page: the page is what is checked.
      const version = JSON.parse(readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'package.json'), 'utf8')).version;
      await open('/');
      const origin = new URL(page.url()).origin;
      await page.locator('[data-site-header]').getByRole('link', { name: 'Download', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/download');
      await page.locator('html[data-started="true"]').waitFor({ state: 'attached' });
      await see(page.getByRole('heading', { level: 1, name: 'Download Trazum' }), 'the Download page');
      is(await page.locator('[data-download-version]').evaluate((element) => element.textContent), `This page is for version ${version}.`, 'the version the page says it is for');

      // The five sections, in order.
      is(
        await page.locator('[data-download-section]').evaluateAll((sections) => sections.map((section) => section.getAttribute('data-download-section')).join(',')),
        'cli,mcp,extension,action,checksums',
        'the sections, in order',
      );

      // The command line: three ways, each at the exact version, and the tap.
      const commands = await page.locator('[data-cli] [data-command] code').evaluateAll((codes) => codes.map((code) => code.textContent.replace(/^\$\s*/, '').trim()));
      is(
        JSON.stringify(commands),
        JSON.stringify([`npx @trazum/cli@${version} bill`, `npm install -g @trazum/cli@${version}`, 'brew install Davmunrey/trazum/trazum']),
        'the command line section',
      );

      // The MCP server: each client once, and every snippet that starts it names the package at the exact version.
      is(
        await page.locator('[data-client]').evaluateAll((items) => items.map((item) => item.getAttribute('data-client')).join(',')),
        'claude-code,claude-desktop-bundle,claude-desktop-json,cursor,vscode,codex-command,codex-toml,gemini-cli',
        'the clients, in order',
      );
      const pinned = `@trazum/mcp@${version}`;
      is(
        await page.locator('[data-client="claude-code"] [data-command] code').evaluate((code) => code.textContent.replace(/^\$\s*/, '').trim()),
        `claude mcp add trazum -- npx -y ${pinned}`,
        'the Claude Code line',
      );
      is(
        await page.locator('[data-client="codex-command"] [data-command] code').evaluate((code) => code.textContent.replace(/^\$\s*/, '').trim()),
        `codex mcp add trazum -- npx -y ${pinned}`,
        'the Codex line',
      );
      is(
        await page.locator('[data-client="codex-toml"] [data-snippet] code').textContent(),
        `[mcp_servers.trazum]\ncommand = "npx"\nargs = ["-y", "${pinned}"]`,
        'the Codex TOML',
      );
      const cursor = JSON.parse(await page.locator('[data-client="cursor"] [data-snippet] code').textContent());
      is(JSON.stringify(cursor.mcpServers.trazum.args), JSON.stringify(['-y', pinned]), 'the Cursor arguments');
      const vscode = JSON.parse(await page.locator('[data-client="vscode"] [data-snippet] code').textContent());
      is(JSON.stringify(vscode.servers.trazum), JSON.stringify({ type: 'stdio', command: 'npx', args: ['-y', pinned] }), 'the VS Code entry');
      is(
        await page.locator('[data-client="gemini-cli"] [data-command] code').evaluate((code) => code.textContent.replace(/^\$\s*/, '').trim()),
        'gemini extensions install https://github.com/Davmunrey/Trazum',
        'the Gemini CLI line',
      );

      // The files: one release, one scheme. The extension, the bundle, the sums and the bill of materials.
      const release = `https://github.com/Davmunrey/Trazum/releases/download/v${version}`;
      const files = await page.locator('a[data-download-file]').evaluateAll((links) => links.map((link) => [link.getAttribute('data-download-file'), link.getAttribute('href')]));
      is(
        JSON.stringify(files),
        JSON.stringify([
          ['mcpb', `${release}/trazum-mcp-${version}.mcpb`],
          ['vsix', `${release}/trazum-vscode-${version}.vsix`],
          ['sums', `${release}/SHA256SUMS`],
          ['sbom', `${release}/trazum-v${version}.cdx.json`],
        ]),
        'the files the page links, and where',
      );
      is(await page.locator('a[href*="releases/latest"]').count(), 0, 'links through a movable address');
      is(
        await page.locator('[data-download-section="extension"] [data-command] code').evaluate((code) => code.textContent.replace(/^\$\s*/, '').trim()),
        `code --install-extension trazum-vscode-${version}.vsix`,
        'the terminal line for the extension',
      );

      // The Action: one pinned commit, as the setup guide writes it.
      const action = await page.locator('[data-snippet="action"] code').textContent();
      is(/^- uses: Davmunrey\/Trazum@[0-9a-f]{40} {2}# \d+\.\d+\.\d+$/.test(action), true, `the Action line (${action})`);

      // Checksums, and that they are not a signature.
      await see(page.locator('[data-download-sums-note]'), 'what a checksum does not show');
      await see(page.locator('[data-download-section="checksums"]').getByText('sha256sum --check --ignore-missing SHA256SUMS'), 'the command that checks the files');

      // No listing is claimed: no store is named anywhere on the page.
      const text = await page.locator('main').textContent();
      is(/marketplace|open ?vsx|homebrew-core|app store/i.test(text), false, 'a store named on the page');
      is(await page.locator('form, input, textarea, iframe').count(), 0, 'forms, fields and frames on the page');

      // Every text at its contrast, on paper and then on the dark canvas.
      const unreadable = () => unreadableText(page);
      is(await unreadable(), '', 'text below its contrast on paper');
      await page.locator('[data-site-header]').getByRole('button', { name: 'Dark', exact: true }).first().click();
      await page.locator('html[data-theme="dark"]').waitFor({ state: 'attached' });
      is(await unreadable(), '', 'text below its contrast on the dark canvas');

      // It fits a phone without scrolling sideways.
      await page.setViewportSize(PHONE);
      is(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the page scrolls sideways on a phone');

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');
      is(requested.filter((url) => !url.startsWith(`${origin}/`) && !url.startsWith('data:')).join(' '), '', 'the requests that left the site');
      is(await page.evaluate(() => document.cookie), '', 'the cookies the page can read');
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
    name: 'landing: scrolling tells the whole story on one pinned stage, in order and back, and the last action leads to /app',
    covers: [],
    viewport: { width: 1440, height: 900 },
    async run({ page, open, is, noSidewaysScroll }) {
      await open('/');
      is(await page.locator('html').getAttribute('data-motion'), 'scroll', 'the story mode, set before paint');
      is(await page.locator('html').getAttribute('data-desk'), 'on', 'the desk, set before paint');
      is(await page.locator('.lt-device').count(), 1, 'the laptops on the page');
      await storyInOrder({ page, is });
      await noSidewaysScroll('at the top of the story');
      await chaptersTakeTurns({ page, is });
      const close = page.locator('[data-landing-close] [data-dashboard-action]');
      await close.focus();
      is(await close.evaluate((element) => element === document.activeElement), true, 'the last call to action, reached by focus');
      await close.click();
      await page.waitForURL((url) => url.pathname === '/app');
    },
  },
  {
    name: 'landing: every object puts its own output on the one laptop, by keyboard, after the story and in the middle of it, and the next chapter takes over again',
    covers: [],
    viewport: { width: 1440, height: 900 },
    async run({ page, open, is }) {
      await open('/');
      await toStory(page, 1);
      await pressEveryObject({ page, is });
      // In the middle of the breaker's chapter, the calendar pressed: its output over the story's.
      await toChapter(page, 'guard');
      await page.locator('.obj[data-obj="models"]').click();
      await page.waitForFunction(() => document.querySelector('.story').dataset.pressed === 'models');
      let now = await stage(page);
      is(now.outputs.join(' '), 'models', 'pressed mid-story: the output on the screen');
      is(now.pressed.join(' '), 'models', 'pressed mid-story: the one object pressed');
      // Into the next chapter: the press is let go and the story shows the clock.
      await toChapter(page, 'clock');
      await page.waitForFunction(() => document.querySelector('.story').dataset.pressed === undefined);
      now = await stage(page);
      is(now.outputs.join(' '), 'clock', 'the next chapter, taking over again: the output');
      is(now.pressed.join(' '), 'clock', 'the next chapter, taking over again: the object pressed');
      is(await seen(page, 'whoever pays: --pdf-out bill.pdf.'), true, 'the next chapter, taking over again: its output, seen');
    },
  },
  {
    name: 'landing: without scroll-driven animation the script tells the same story',
    covers: [],
    viewport: { width: 1440, height: 900 },
    async run({ page, open, is }) {
      await page.addInitScript(() => {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = (...args) => (String(args.join(' ')).includes('animation-timeline') ? false : supports(...args));
      });
      await open('/');
      is(await page.locator('html').getAttribute('data-story'), 'script', 'the fallback, in charge');
      await storyInOrder({ page, is });
      await chaptersTakeTurns({ page, is });
    },
  },
  {
    name: 'landing: on a phone the same story, the chapters under the stage, focus never behind it, and nothing scrolls sideways',
    covers: [],
    viewport: PHONE,
    async run({ page, open, see, is, noSidewaysScroll }) {
      await open('/');
      await page.locator('[data-site-header]').getByRole('button', { name: 'Menu' }).click();
      await see(page.locator('[data-site-header]').getByRole('link', { name: /^Docs/ }), 'the phone menu, above the story');
      await page.locator('[data-site-header]').getByRole('button', { name: 'Close' }).click();
      for (const p of [0, 0.1, 0.25, 0.5, 0.7, 0.9, 1]) {
        await toStory(page, p);
        await noSidewaysScroll(`at ${p * 100}% of the story`);
      }
      const row = await page.locator('.story .obj').evaluateAll((all) => all.map((button) => button.getBoundingClientRect()).every((box) => box.left >= 0 && box.right <= window.innerWidth));
      is(row, true, 'the seven objects, all inside the window');
      const laptop = await page.locator('.lt-device').boundingBox();
      is(laptop.width >= 280 && laptop.width <= 390 - 2 * 16, true, `the laptop inside the window's gutters (${laptop.width}px)`);
      await toStory(page, 0);
      // A phone keeps the receipt in the laptop until it comes forward.
      await storyInOrder({ page, is }, STORY_MARKS.filter(([what]) => what !== 'the receipt’s total, on the desk'));
      await chaptersTakeTurns({ page, is });
      await focusNeverBehindTheStage({ page, is });
      await toStory(page, 1);
      await pressEveryObject({ page, is });
      await noSidewaysScroll('after pressing every object');
    },
  },
  {
    name: 'landing: reduced motion gets each chapter’s last state at once, in order, and a press shows its output and shuts the lid at once',
    covers: [],
    context: { reducedMotion: 'reduce' },
    async run({ page, open, is }) {
      await open('/');
      is(await page.locator('html').getAttribute('data-motion'), null, 'the story mode, which reduced motion never gets');
      is(await page.locator('html').getAttribute('data-desk'), 'on', 'the desk, which reduced motion keeps');
      is(await page.evaluate(() => document.querySelector('.story').getAnimations({ subtree: true }).length), 0, 'animations running');
      // Each chapter, as it becomes current: its object pressed and its output whole, with nothing moving.
      for (const [chapter, object, mark] of CHAPTER_TURNS) {
        await toChapter(page, chapter);
        const now = await stage(page);
        is(now.pressed.join(' '), object, `${chapter}: the object pressed`);
        is(now.outputs.join(' '), object, `${chapter}: the output on the screen`);
        is(now.allLinesShown, true, `${chapter}: every line of it, at once`);
        is(await seen(page, mark), true, `${chapter}: "${mark}" on the screen`);
      }
      await toChapter(page, 'close');
      is((await lidAngle(page)) < -95, true, 'the closing: the lid shut, at once');
      const group = page.getByRole('group', { name: 'What Trazum does, one object each' });
      await group.getByRole('button', { name: /^The CI gate/ }).click();
      await page.waitForFunction(() => document.querySelector('.obj[data-obj="check"]').getAttribute('aria-pressed') === 'true');
      // No wait beyond the press itself: nothing is animated, so what it shows is there in the same frame.
      const now = await stage(page);
      is(now.outputs.join(' '), 'check', 'the output, at once');
      is(now.allLinesShown, true, 'every line of it, at once');
      is(await lidAngle(page), 0, 'the lid, open at once');
      await group.getByRole('button', { name: /^The lid/ }).click();
      await page.waitForFunction(() => document.querySelector('.obj[data-obj="lid"]').getAttribute('aria-pressed') === 'true');
      // At once: by the next frame (the site's own rule for reduced motion leaves every transition a hundredth of a millisecond).
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      is((await lidAngle(page)) < -95, true, 'the lid, shut at once');
    },
  },
  {
    name: 'landing: without JavaScript every output, the receipt and every chapter are on the page, in reading order',
    covers: [],
    context: { javaScriptEnabled: false },
    async run({ page, read, is }) {
      await read('/');
      is(await page.locator('html').getAttribute('data-desk'), null, 'the desk, which needs a script');
      const text = (await page.locator('.story').allInnerTexts()).join('\n');
      let at = -1;
      for (const [id, , mark] of CHAPTER_TURNS) {
        const found = text.indexOf(mark, at + 1);
        if (found === -1) throw new Error(`the ${id} output is not on the still page after the one before it`);
        at = found;
      }
      for (const mark of [
        'EXAMPLE FILE',
        'Not in the total',
        'Credentials',
        'platform.claude.com',
        'TOTAL',
        'Scroll, and each object takes its turn.',
        'What your agents cost, by project and by model.',
        'Why the number holds up',
        'Nothing is guessed.',
        'Your files stay where they are.',
        'No provider key needed to get started.',
        'A receipt, a report, a gate verdict.',
      ]) {
        const found = text.indexOf(mark, at + 1);
        if (found === -1) throw new Error(`"${mark}" is not on the still page, in its place`);
        at = found;
      }
      is(await page.locator('.story .obj').evaluateAll((all) => all.every((button) => button.getClientRects().length === 0)), true, 'the objects, which would do nothing, not drawn');
      is(await page.locator('.story .tl').evaluateAll((lines) => lines.every((line) => line.getClientRects().length > 0)), true, 'every line of every output, shown');
      is(await page.locator('.lt-device').count(), 1, 'the laptops on the page');
    },
  },
  {
    name: 'appearance: the public site is light on a dark system until Dark is chosen; the application follows the system',
    covers: [],
    context: { colorScheme: 'dark' },
    async run({ page, open, is }) {
      await open('/');
      is(await page.locator('html').getAttribute('data-theme'), 'light', 'the landing on a dark system, nothing chosen');
      const header = page.locator('[data-site-header]');
      is(await header.getByRole('button', { name: 'Light', exact: true }).first().getAttribute('aria-pressed'), 'true', 'the control, saying Light');
      await open('/app');
      is(await page.locator('html').getAttribute('data-theme'), 'dark', 'the application on a dark system, nothing chosen');
      await open('/');
      await header.getByRole('button', { name: 'Dark', exact: true }).first().click();
      is(await page.locator('html').getAttribute('data-theme'), 'dark', 'the landing after choosing Dark');
      await open('/');
      is(await page.locator('html').getAttribute('data-theme'), 'dark', 'the landing after a reload');
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
        // A flow about the reader's own settings (a dark system, reduced motion) says so here.
        ...flow.context,
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
        /** Open a path and wait for nothing a script does: a page read without JavaScript, which `open` would wait on for ever. */
        async read(path) {
          await page.goto(new URL(path, base).href, { waitUntil: 'load' });
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
