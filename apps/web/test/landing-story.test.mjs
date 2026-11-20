import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

import { render as renderTerminal } from '../../../scripts/draw-landing-terminal.mjs';

/**
 * The landing's story: one laptop on a desk, pinned from the desk's arrival to
 * the end while the chapters scroll past, one object per capability around
 * it, each taking its turn, and a lid that closes over what never leaves the
 * machine.
 *
 * What these hold, each because a page like this drifts in exactly that way:
 *
 * - the screen and the receipt are what the built CLI prints, regenerated and
 *   compared, so a figure typed for the page fails here; the receipt's total
 *   is the bill's, and each line's page and date are the core's;
 * - every chapter's output is a block the generator wrote, the model kept out
 *   of the total is the one the CLI named, on a file in this repository;
 * - each chapter lifts its own object and no other, each object once, in the
 *   order they lie;
 * - there is one laptop on the page, and every object is a button that says
 *   whether it is pressed;
 * - every chapter's words and every output are in the page as text, in order,
 *   in every language: what a reader without JavaScript gets;
 * - the story never takes the scroll from the visitor, only `transform`,
 *   `opacity` and `clip-path` change with it, and nothing moves on a clock
 *   unless a press set it off.
 *
 * The browser half (scrolling it top to bottom and back, the fallback script,
 * pressing objects in the middle of the story, the phone, reduced motion,
 * focus, the light-first theme) is in `scripts/e2e.mjs`.
 */

register('./helpers/loader.mjs', import.meta.url);

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

let React, server, terminal, timeline, landingCopy, locales, motion, pricing;

before(async () => {
  React = await import('react');
  server = await import('react-dom/server');
  terminal = await import('../lib/landing-terminal.ts');
  timeline = await import('../lib/story-timeline.ts');
  landingCopy = await import('../lib/landing-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
  motion = await import('../lib/story-motion.ts');
  // The core's own record of when each provider's prices were read, and from which pages.
  pricing = await import('../../../packages/core/dist/pricing.js');
});

/** The keyframes the page writes. */
const written = () => motion.storyMotion(terminal.TERMINAL, terminal.RECEIPT.lines.length, terminal.TERMINAL_NARROW);

/**
 * One `@keyframes` rule's stops, as [fraction of the story, body]: each rule
 * is written over its element's own stretch of the story, so a stop's percent
 * is read back through that stretch.
 */
function stopsOf(name) {
  const rule = written().match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(rule, `no keyframes ${name}`);
  const [lo, hi] = motion.motionOf(terminal.TERMINAL, terminal.RECEIPT.lines.length, terminal.TERMINAL_NARROW).spans.get(name);
  return rule[1]
    .split('\n')
    .filter((line) => /^\s+[\d.]+% /.test(line))
    .map((line) => [lo + (Number(line.match(/([\d.]+)%/)[1]) / 100) * (hi - lo), line]);
}

/** A number property of a keyframes rule at a point of the story, read from the stops written: linear between them. */
function valueAt(name, property, p) {
  const stops = stopsOf(name).map(([at, line]) => [at, Number(line.match(new RegExp(`${property}: ([\\d.-]+)`))[1])]);
  // Outside its stretch an element holds its first or its last value.
  const after = stops.findIndex(([at]) => at >= p);
  if (after === -1) return stops.at(-1)[1];
  if (after === 0) return stops[0][1];
  const [a, va] = stops[after - 1];
  const [b, vb] = stops[after];
  return va + ((vb - va) * (p - a)) / (b - a);
}

/**
 * The markup without its tags. Removed until none is left: one pass over
 * `<scr<b>ipt>` leaves `<script>`, put together from the pieces of two.
 */
function withoutTags(html) {
  let text = html;
  let before;
  do {
    before = text;
    text = text.replace(/<[^>]+>/g, '');
  } while (text !== before);
  return text;
}

const decode = (html) =>
  withoutTags(html)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

async function landingHtml(locale) {
  const { Landing } = await import('../components/Landing.tsx');
  return server.renderToStaticMarkup(React.createElement(Landing, { initialLocale: locale }));
}

/** The lines of every terminal on the page, as text, in order. */
function screenLines(html) {
  const pres = [...html.matchAll(/<pre class="term"[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => match[1]);
  return pres.flatMap((pre) => pre.split(/(?=<span class="tl[ "])/).filter((chunk) => chunk.startsWith('<span class="tl')).map(decode));
}

const text = (runs) => runs.map(([t]) => t).join('');
const block = (id) => terminal.TERMINAL.find((candidate) => candidate.id === id);

describe('the laptop’s screen and the receipt are what the CLI prints', () => {
  it('lib/landing-terminal.ts is what scripts/draw-landing-terminal.mjs writes from the built CLI today', async () => {
    assert.equal(read('lib/landing-terminal.ts'), await renderTerminal(), 'run: node scripts/draw-landing-terminal.mjs');
  });

  it('the page shows every line of it, in order, once, and nothing else', async () => {
    const expected = terminal.TERMINAL.flatMap((b) => [
      ...b.command.split('\n').map((line, index) => (index === 0 ? `$ ${line}` : line)),
      ...b.lines.map(text),
    ]);
    for (const locale of locales.MARKETING_LOCALES) {
      assert.deepEqual(screenLines(await landingHtml(locale)), expected, `the screen (${locale}) is not the transcript`);
    }
  });

  it('the narrow screen’s transcript is the same commands in a 60-column window: every line the CLI’s, a table never wider', async () => {
    const narrow = terminal.TERMINAL_NARROW;
    // The same blocks, the same commands, in the same order: only the window differs.
    assert.deepEqual(
      narrow.map((b) => [b.id, b.cap, b.command]),
      terminal.TERMINAL.map((b) => [b.id, b.cap, b.command]),
      'the narrow screen runs other commands than the wide one',
    );
    assert.ok(terminal.TERMINAL_NARROW_COLUMNS <= 60 && terminal.TERMINAL_NARROW_COLUMNS < terminal.TERMINAL_COLUMNS);
    // Every table row fits the narrow window: a row with a share bar, and the calendar's rows, which the script cuts.
    const narrowBlock = (id) => narrow.find((candidate) => candidate.id === id);
    for (const b of narrow) {
      for (const runs of b.lines) {
        const line = text(runs);
        if (/[█░]/.test(line)) assert.ok(line.length <= terminal.TERMINAL_NARROW_COLUMNS, `${b.id}: a table row ${line.length} columns wide on the narrow screen`);
      }
    }
    const models = narrowBlock('models').lines.map(text);
    const head = models.findIndex((line) => /^\s+model\s/.test(line));
    for (const line of models.slice(head)) assert.ok(line.length <= terminal.TERMINAL_NARROW_COLUMNS, `the calendar is ${line.length} columns wide on the narrow screen`);
    assert.match(models.join(' ').replace(/\s+/g, ' '), /Cut after output to fit 60 columns: context, cache min\. not shown\./, 'the calendar does not say what the narrow screen cut');
    // The figures are the wide screen's: the bill's total, the gate's verdict, the model kept out.
    const flat = (b) => b.lines.map(text).join(' ').replace(/\s+/g, ' ');
    assert.ok(flat(narrowBlock('bill')).includes('$12.70 across 126 priced call(s)'));
    assert.equal(flat(narrowBlock('check')).includes('All 3 within budget.'), true);
    assert.ok(flat(narrowBlock('unpriced')).includes(`Not in the total: ${terminal.UNPRICED.calls} call(s) to ${terminal.UNPRICED.models[0]}`));
    // On the page: one narrow terminal per output, in the same order, every line the narrow transcript's.
    const html = await landingHtml('en');
    const pres = [...html.matchAll(/<pre class="term term-narrow"[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => match[1]);
    assert.equal(pres.length, landingCopy.DESK_COMMANDS.length + 1);
    const lines = pres.flatMap((pre) => pre.split(/(?=<span class="tl[ "])/).filter((chunk) => chunk.startsWith('<span class="tl')).map(decode));
    assert.deepEqual(
      lines,
      narrow.flatMap((b) => [...b.command.split('\n').map((line, index) => (index === 0 ? `$ ${line}` : line)), ...b.lines.map(text)]),
    );
    // The stylesheet shows one of the two: the narrow one only on a screen too narrow for the wide one.
    const css = read('app/landing.css');
    assert.match(css, /\.term-narrow \{\s*display: none;\s*\}\s*@container \(max-width: \d+px\) \{\s*\.term:not\(\.term-narrow\) \{\s*display: none;/);
  });

  it('runs the commands each object names, on files in this repository, in the order the objects lie', () => {
    const commands = terminal.TERMINAL.map((b) => [b.cap, b.command.replace(/ \\\n {4}|\n {4}/g, ' ')]);
    assert.deepEqual(commands, [
      ['bill', 'npx @trazum/cli bill examples/claude-projects'],
      ['check', 'npx @trazum/cli check examples/'],
      ['check', 'echo $?'],
      ['guard', 'cd examples/claude-projects/-home-me-webapp'],
      ['guard', `echo '{"session_id":"demo","transcript_path":"demo-webapp.jsonl"}' | npx @trazum/cli session-guard check --warn 1 --stop 5 --on-cannot-tell fail-open`],
      ['guard', 'echo $?'],
      ['guard', `echo '{"session_id":"demo","transcript_path":"demo-webapp.jsonl"}' | npx @trazum/cli session-guard check --warn 1 --stop 3 --on-cannot-tell fail-open`],
      ['guard', 'echo $?'],
      ['clock', 'npx @trazum/cli bill examples/claude-projects --agent claude-code --timezone Europe/Madrid --by week'],
      ['optimize', 'npx @trazum/cli optimize examples/support-prompt.txt'],
      ['models', 'npx @trazum/cli models'],
      ['unpriced', 'npx @trazum/cli bill examples/unpriced-model.jsonl'],
    ]);
    assert.deepEqual([...new Set(terminal.TERMINAL.map((b) => b.cap))], [...landingCopy.DESK_COMMANDS, 'unpriced'], 'an object with no output, or output with no object');
  });

  it('every chapter that shows output shows a block the generator wrote, and every block has its chapter', () => {
    const owners = new Set(terminal.TERMINAL.map((b) => b.cap));
    const shown = timeline.CHAPTERS.map((chapter) => chapter.screen).filter((screen) => screen !== null && screen !== 'never');
    for (const screen of shown) assert.ok(owners.has(screen), `the ${screen} chapter shows output the generator did not write`);
    assert.deepEqual([...new Set(shown)], [...owners], 'output the generator wrote that no chapter shows, or shown out of order');
    // Each chapter's screen on the page is that block's lines and nothing else.
    for (const owner of owners) assert.ok(written().includes(`@keyframes st-out-${owner} {`), `nothing shows ${owner} on the screen`);
  });

  it('the model kept out of the total is the one the CLI named, on an example file in this repository', () => {
    const { UNPRICED } = terminal;
    assert.match(UNPRICED.source, /^examples\//, 'the example is not in examples/');
    assert.ok(readFileSync(new URL(`../../../${UNPRICED.source}`, import.meta.url), 'utf8').length > 0, 'the example file is not in the repository');
    assert.ok(UNPRICED.models.length > 0 && UNPRICED.calls > 0);
    const screen = block('unpriced').lines.map(text).join(' ').replace(/\s+/g, ' ');
    assert.equal(block('unpriced').command, `npx @trazum/cli bill ${UNPRICED.source}`);
    for (const model of UNPRICED.models) {
      assert.ok(screen.includes(`Not in the total: ${UNPRICED.calls} call(s) to ${model}`), `the screen does not say ${model} is kept out of the total`);
      assert.ok(screen.includes('never counted as $0'), 'the screen does not say it is never counted as $0');
    }
  });

  it('every exit status is one the process returned: the gate passes, the breaker warns at 0 and stops at 2', () => {
    assert.equal(text(block('status').lines[0]), '0');
    assert.equal(text(block('guard-warn-status').lines[0]), '0');
    assert.equal(text(block('guard-stop-status').lines[0]), '2');
    // The warning is the JSON Claude Code reads; the stop is the sentence on standard error.
    const warning = JSON.parse(text(block('guard-warn').lines[0]));
    assert.equal(typeof warning.systemMessage, 'string');
    assert.match(text(block('guard-stop').lines[0]), /^Trazum: stopped\./);
  });

  it('the calendar says on screen that it is cut, and the cut lines are the script’s, dimmed', () => {
    const lines = block('models').lines;
    const [cut, clock] = lines.slice(-2);
    assert.match(text(cut), /^ {2}… \d+ of \d+ rows shown: /);
    assert.match(text(clock), /^ {2}Run with the clock set to \d{4}-\d{2}-\d{2}, /);
    for (const runs of [cut, clock]) assert.ok(runs.filter(([t]) => t.trim() !== '').every(([, style]) => style === 'd'), 'a line the script wrote is not dimmed');
    // The rows shown are the receipt's models, so the calendar shows the rates behind the receipt.
    const rows = lines.slice(lines.findIndex((runs) => /^\s+model\s/.test(text(runs))) + 1, -2).map((runs) => text(runs).trim().split(/\s+/)[0]);
    assert.deepEqual(rows.toSorted(), terminal.RECEIPT.lines.map((line) => line.model).toSorted());
  });

  it('the receipt is the bill: its total is the bill’s mark, each line the bill’s figure for that model', () => {
    const bill = block('bill');
    const mark = bill.lines.flat().find(([, style]) => style.includes('m'));
    assert.equal(terminal.RECEIPT.total, mark[0], 'the receipt’s total is not the bill’s');
    for (const line of terminal.RECEIPT.lines) {
      const row = bill.lines.map(text).find((candidate) => candidate.trim().startsWith(`${line.model} `));
      assert.ok(row, `the bill has no row for ${line.model}`);
      const [, calls, usd] = row.trim().split(/\s+/);
      assert.deepEqual([Number(calls), usd], [line.calls, line.usd], `the receipt’s ${line.model} is not the bill’s`);
      assert.match(line.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.equal(terminal.RECEIPT.lines.reduce((sum, line) => sum + line.calls, 0), terminal.RECEIPT.calls);
  });

  it('each line of the receipt carries the page its rate was read from and the date, both the core’s', () => {
    for (const line of terminal.RECEIPT.lines) {
      assert.equal(line.reviewedOn, pricing.PROVIDER_REVIEWED[line.provider], `${line.model}: the date is not the core’s for ${line.provider}`);
      assert.ok(
        pricing.PROVIDER_SOURCES[line.provider].map((page) => page.replace(/^https:\/\//, '').replace(/\/$/, '')).includes(line.source),
        `${line.model}: ${line.source} is not a page the core says ${line.provider}’s prices were read from`,
      );
    }
  });

  it('the paper receipt on the page shows the receipt’s figures, and its total once, on the acid', async () => {
    const html = await landingHtml('en');
    const paper = html.slice(html.indexOf('class="receipt-paper"'), html.indexOf('class="receipt-curl"'));
    assert.match(paper, new RegExp(`<span class="receipt-figure">${terminal.RECEIPT.total.replace('$', '\\$')}</span>`), 'the receipt’s total on the page is not the CLI’s');
    assert.equal((paper.match(/class="receipt-figure"/g) ?? []).length, 1);
    for (const line of terminal.RECEIPT.lines) {
      assert.ok(paper.includes(`>${line.usd}</span>`), `the receipt on the page does not show ${line.model} at ${line.usd}`);
      assert.ok(decode(paper).includes(line.reviewedOn), `the receipt on the page does not say when ${line.model}’s rate was read`);
    }
    // Each line's note: the page and the date, as the data has them.
    const notes = [...paper.matchAll(/<span class="receipt-note"[^>]*>([\s\S]*?)<\/span><\/li>/g)].map((match) => decode(match[1]));
    assert.deepEqual(
      notes,
      terminal.RECEIPT.lines.map((line) => `${line.source}${landingCopy.COPY.en.desk.receipt.rateRead(line.reviewedOn)}`),
      'a note on the receipt is not its line’s page and date',
    );
  });

  it('no ghost figure stands behind the stage: the total is said by the screen and the receipt, once each', async () => {
    // A huge copy of the total behind the laptop read as a stray artefact, cut at the top of the window for the whole
    // story, and as text of 1.1:1 contrast. The receipt and the bill say it.
    const html = await landingHtml('en');
    assert.equal(/desk-figure/.test(html) || /desk-figure/.test(read('app/landing.css')), false, 'a figure behind the laptop');
    // Nothing on the stage is the total alone and hidden from assistive technology: a picture of the figure.
    const pictures = [...html.matchAll(/<(\w+) aria-hidden="true"[^>]*>([^<]*)<\/\1>/g)].filter((match) => match[2].includes(terminal.RECEIPT.total));
    assert.deepEqual(pictures.map((match) => match[0]), [], 'a picture of the total on the stage');
  });

  it('carries no figure of its own: the desk writes no words and no number', () => {
    // Every word on the desk is the copy table's, the transcript's or the receipt's. The only literal
    // text is the prompt's `$` and the wordmark.
    const story = codeOf('components/landing/Story.tsx');
    const literals = [...story.matchAll(/>([^<>{}]+)<\//g)].map((match) => match[1].trim()).filter((t) => t !== '');
    for (const t of literals) assert.ok(['$', 'Trazum'].includes(t), `Story.tsx writes its own text: ${JSON.stringify(t)}`);
    assert.equal(/\$\d|\d{4}-\d{2}-\d{2}|\d\s*(?:calls|tokens)\b/.test(story.replace(/`[^`]*\$\{/g, '')), false, 'Story.tsx carries a figure of its own');
  });
});

describe('one laptop, and one object per capability', () => {
  it('the page draws one laptop and one screen, and nothing else that looks like one', async () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = await landingHtml(locale);
      for (const part of ['lt-device', 'lt-screen', 'lt-lid', 'lt-deck', 'desk-laptop', 'story-3d']) {
        assert.equal((html.match(new RegExp(`class="${part}[" ]`, 'g')) ?? []).length, 1, `${locale}: ${part} is drawn more than once, or not at all`);
      }
      assert.equal((html.match(/<pre class="term"/g) ?? []).length, landingCopy.DESK_COMMANDS.length + 1, `${locale}: a terminal outside the laptop`);
      assert.equal((html.match(/<section class="lt-screen"/g) ?? []).length, 1, `${locale}: a second screen`);
      assert.match(html, /class="lt-face lt-back"[^>]*><span>Trazum<\/span>/, `${locale}: the lid carries no wordmark`);
    }
  });

  it('every object is a real button that says whether it is pressed, in the order they lie', async () => {
    const html = await landingHtml('en');
    const buttons = [...html.matchAll(/<button([^>]*)>/g)].map((match) => match[1]).filter((attrs) => attrs.includes('data-obj='));
    const ids = buttons.map((attrs) => attrs.match(/data-obj="([^"]+)"/)[1]);
    assert.deepEqual(ids, [...landingCopy.DESK_COMMANDS, 'lid']);
    assert.equal(ids.length, motion.OBJECT_COUNT, 'the motion writes keyframes for another number of objects');
    for (const attrs of buttons) {
      assert.match(attrs, /type="button"/);
      assert.match(attrs, /aria-pressed="(true|false)"/, `an object without aria-pressed: ${attrs}`);
    }
    assert.deepEqual(
      buttons.map((attrs) => attrs.match(/aria-pressed="(true|false)"/)[1]),
      ['true', 'false', 'false', 'false', 'false', 'false', 'false'],
      'the bill is not the object pressed when the page arrives',
    );
    assert.match(html, /<div class="desk-objects" role="group" aria-label="[^"]+">/, 'the objects are not a named group');
  });

  it('the screen is one live region, named, and each output is labelled by its plate', async () => {
    const html = await landingHtml('en');
    assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    assert.match(html, /<section class="lt-screen" aria-label="[^"]+" aria-live="polite">/);
    for (const id of landingCopy.DESK_COMMANDS) {
      assert.match(html, new RegExp(`class="cap-out" data-cap="${id}"[^>]*aria-labelledby="desk-plate-${id}"`));
      assert.match(html, new RegExp(`<h3 id="desk-plate-${id}" class="plate-title">`));
    }
    assert.match(html, /class="cap-out" data-cap="unpriced"[^>]*aria-labelledby="story-unpriced"/);
    assert.match(html, /<h3 id="story-unpriced" class="plate-title">/);
  });

  it('no small label stands alone above a heading, and the label that stays names a list', async () => {
    // A tracked capital label as its own block over a heading says what the heading says, smaller. The command a
    // chapter runs is at its prompt under the sentence instead; "what it does not do" stays, over the list it names.
    for (const locale of locales.MARKETING_LOCALES) {
      const html = await landingHtml(locale);
      assert.equal(/plate-eyebrow/.test(html), false, `${locale}: a label over a heading`);
      for (const match of html.matchAll(/<p class="plate-not">[^<]*<\/p>(<[a-z0-9]+)/g)) assert.equal(match[1], '<ul', `${locale}: the label is over ${match[1]}, not a list`);
      for (const id of landingCopy.DESK_COMMANDS) {
        const plate = html.slice(html.indexOf(`<h3 id="desk-plate-${id}"`));
        assert.match(plate, new RegExp(`^<h3[^>]*>[^<]*</h3><p class="plate-body">[^<]*</p><p class="plate-run"><span aria-hidden="true" class="plate-prompt">\\$ </span><code>${landingCopy.DESK_COMMAND_NAMES[id]}</code></p>`), `${locale}: the ${id} chapter does not give its command at its prompt under its sentence`);
      }
    }
  });

  it('the receipt’s words are 11px or larger, and its torn edge is one tooth repeated, not a drawn outline', () => {
    const css = read('app/landing.css');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => /\.receipt/.test(match[1]));
    let sized = 0;
    for (const [, selector, body] of rules) {
      for (const [, value] of body.matchAll(/font-size: ([^;]+);/g)) {
        sized += 1;
        const px = value.match(/^([\d.]+)px$/);
        const em = value.match(/^([\d.]+)em$/);
        assert.ok((px && Number(px[1]) >= 11) || (em && Number(em[1]) >= 1), `${selector.trim()}: font-size ${value}, under 11px`);
      }
    }
    assert.ok(sized >= 5, 'the receipt’s sizes are gone');
    // Measured by a detector of generated design: a clip-path polygon of many points reads as an outline traced by
    // hand. The tear is one triangle as a mask, repeated across the foot.
    for (const [, points] of css.matchAll(/polygon\(([^;]*)\)/g)) assert.ok(points.split(',').length <= 6, `a polygon of ${points.split(',').length} points`);
    assert.match(css, /mask-repeat: repeat-x;/);
  });

  it('the example’s output is labelled an example on the screen', async () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = await landingHtml(locale);
      const out = html.slice(html.indexOf('data-cap="unpriced"'));
      assert.ok(out.startsWith(`data-cap="unpriced"`) && out.includes(`<p class="screen-tag">${landingCopy.COPY[locale].desk.example}</p>`), `${locale}: the example is not labelled on the screen`);
      assert.ok(out.indexOf('screen-tag') < out.indexOf('<pre class="term"'), `${locale}: the label is not on the example's output`);
    }
  });
});

describe('each chapter is one object’s turn', () => {
  const objectChapters = () => timeline.CHAPTERS.filter((chapter) => chapter.object !== null);

  it('each object takes its turn once, in the order the objects lie, the lid last', () => {
    assert.deepEqual(objectChapters().map((chapter) => chapter.object), [...motion.OBJECTS], 'an object without a turn, with two, or out of order');
    assert.deepEqual(motion.OBJECTS, [...landingCopy.DESK_COMMANDS, 'lid']);
    // An object's chapter shows that object's command; the lid's shows what never leaves.
    for (const chapter of objectChapters()) assert.equal(chapter.screen, chapter.object === 'lid' ? 'never' : chapter.object, `the ${chapter.id} chapter shows another command than its object’s`);
  });

  it('while a chapter is current, its own object is lifted and pressed, and no other', () => {
    for (const chapter of timeline.CHAPTERS) {
      const [start, end] = timeline.chapterWindow(chapter.id);
      // Past the lift, before the next chapter: the chapter's settled state.
      const p = start + (end - start) * 0.6;
      for (const object of motion.OBJECTS) {
        const pressed = valueAt(`st-skin-${object}`, 'opacity', p);
        assert.equal(pressed, object === chapter.object ? 1 : 0, `in the ${chapter.id} chapter the ${object} is ${pressed === 1 ? '' : 'not '}pressed`);
        assert.ok(motion.lifted(object, p) === (object === chapter.object ? 1 : 0), `in the ${chapter.id} chapter the ${object} is lifted wrongly`);
      }
    }
  });

  it('nothing is shown twice: each output is on the screen in one stretch of the story, and the receipt prints once', () => {
    for (const owner of new Set(terminal.TERMINAL.map((b) => b.cap))) {
      const values = stopsOf(`st-out-${owner}`).map(([, line]) => Number(line.match(/opacity: ([\d.]+)/)[1]));
      // On once, off once: once it has started to go, it never comes back.
      const firstFall = values.findIndex((value, index) => index > 0 && value < values[index - 1]);
      assert.ok(values.some((value) => value === 1), `${owner} is never on the screen`);
      if (firstFall !== -1) assert.ok(values.slice(firstFall).every((value, index, after) => index === 0 || value <= after[index - 1]), `${owner} comes back on the screen`);
    }
    const receiptOpacity = stopsOf('st-receipt').map(([at, line]) => [at, line.match(/opacity: ([^;]+);/)[1]]);
    const firstShown = receiptOpacity.findIndex(([, value]) => value !== '0');
    assert.ok(receiptOpacity.slice(firstShown).every(([, value]) => value !== '0'), 'the receipt goes back into the laptop and prints again');
  });
});

describe('every capability is there as text, in order, with the laptop', () => {
  it('in each of the five languages', async () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = await landingHtml(locale);
      const t = landingCopy.COPY[locale];
      const page = decode(html);
      const marks = [
        ['the headline', t.heroTitle],
        ['the bill’s total', '$12.70 across 126 priced call(s)'],
        ['the gate’s verdict', 'All 3 within budget.'],
        ['the breaker’s stop', 'Trazum: stopped.'],
        ['the clock’s first week', '2026-W36'],
        ['the trimming’s counts', '326 → 202'],
        ['the calendar’s cut', 'rows shown: the models the receipt priced.'],
        ['the example’s label', t.desk.example],
        ['the model kept out', `Not in the total: ${terminal.UNPRICED.calls} call(s) to ${terminal.UNPRICED.models[0]}`],
        ...t.neverItems.map((item) => [`the never item "${item}"`, item]),
        ['the receipt’s first page', terminal.RECEIPT.lines[0].source],
        ['the receipt’s total', `${t.desk.receipt.total}${terminal.RECEIPT.total}`],
        ['the arrival', t.desk.title],
        ...landingCopy.DESK_COMMANDS.map((id) => [`the ${id} chapter`, t.desk.caps[id].title]),
        ['why the number holds up', t.reasonsTitle],
        ['the rates', t.reasons[0][0]],
        ['the billing', t.reasons[1][0]],
        ['nothing guessed', t.reasons[2][0]],
        ['the example, named', t.desk.unpricedNote(terminal.UNPRICED.source, terminal.UNPRICED.models.join(', '), terminal.UNPRICED.calls)],
        ['what never leaves', t.neverTitle],
        ['the files stay', t.reasons[3][0]],
        ['the closing', t.closeTitle],
        ['what leaves', t.leaves],
        ['the budget check, after the story', t.more.mcp.title],
      ];
      let at = -1;
      for (const [what, mark] of marks) {
        const found = page.indexOf(mark, at + 1);
        assert.ok(found > at, `${locale}: ${what} is missing or out of order`);
        at = found;
      }
      for (const id of landingCopy.DESK_COMMANDS) {
        assert.ok(page.includes(t.desk.caps[id].object), `${locale}: the ${id} object has no name`);
        for (const item of t.desk.caps[id].not) assert.ok(page.includes(item), `${locale}: the ${id} plate does not say "${item}"`);
      }
    }
  });

  it('the desk says nothing twice that the rest of the page says: the gate and the trimming are not repeated below it', async () => {
    const html = await landingHtml('en');
    const t = landingCopy.COPY.en;
    const after = decode(html.slice(html.indexOf('id="more-title"')));
    for (const said of [t.more.ci.title, t.more.trim.title, t.more.ci.body, t.more.trim.body]) assert.equal(after.includes(said), false, `said again below the desk: ${said}`);
    assert.ok(after.includes(t.more.mcp.title), 'the budget check, which has no object, is not on the page');
  });

  it('no word the desk shows is left in English in another language', () => {
    const shown = (t) => [
      t.desk.kicker, t.desk.title, t.desk.sub, t.desk.objects, t.desk.screen, t.desk.notLabel, t.desk.lid,
      t.desk.receipt.heading, t.desk.receipt.calls(7), t.desk.receipt.rateRead('2026-01-01'),
      ...landingCopy.DESK_COMMANDS.flatMap((id) => [t.desk.caps[id].object, t.desk.caps[id].title, t.desk.caps[id].body, ...t.desk.caps[id].not]),
      t.neverLabel, t.neverTitle, t.neverLede, ...t.neverItems, t.leavesLabel, t.leaves, t.billCaveat,
      t.desk.example, t.desk.unpricedNote('examples/x.jsonl', 'model-x', 2),
    ];
    const english = shown(landingCopy.COPY.en);
    for (const locale of ['es', 'fr', 'de', 'pt']) {
      shown(landingCopy.COPY[locale]).forEach((said, index) => {
        assert.notEqual(said, english[index], `${locale}: "${said}" is the English`);
      });
    }
  });

  it('the last call to action leads to the dashboard, and the source of the bill is linked outside the stage', async () => {
    const html = await landingHtml('en');
    const close = html.slice(html.indexOf('data-landing-close'));
    assert.match(close, /<a href="\/app" data-dashboard-action=""/);
    // The closing is the story's last chapter: after it, only the quiet band.
    assert.ok(html.indexOf('data-landing-close') > html.indexOf('data-ch="never"'), 'the closing is not the story’s last chapter');
    assert.ok(html.indexOf('tree/main/examples/claude-projects') > html.indexOf('class="desk-objects"'));
  });
});

describe('the story never takes the scroll from the visitor', () => {
  const sources = ['components/landing/Story.tsx', 'components/Landing.tsx', 'app/landing.css', 'app/globals.css', 'lib/story-timeline.ts'];

  it('no wheel or touch listener, no preventDefault, no scroll snapping, no programmatic scroll', () => {
    for (const file of sources) {
      const code = codeOf(file);
      assert.equal(/preventDefault/.test(code), false, `${file} calls preventDefault`);
      assert.equal(/['"](?:wheel|mousewheel|touchmove|touchstart|keydown)['"]/.test(code), false, `${file} listens to wheel, touch or keys`);
      assert.equal(/scroll-snap/.test(code), false, `${file} snaps the scroll`);
      assert.equal(/scrollTo\s*\(|scrollBy\s*\(|scrollIntoView|scrollTop\s*=/.test(code), false, `${file} moves the scroll itself`);
      assert.equal(/overscroll-behavior|touch-action\s*:\s*none/.test(code), false, `${file} holds the scroll`);
    }
  });

  it('the fallback listens passively, draws once a frame, and only while the story is on screen', () => {
    const story = codeOf('components/landing/Story.tsx');
    assert.match(story, /CSS\.supports\('animation-timeline: view\(\)'\)/, 'the script runs where CSS already drives the story');
    // The current chapter is read by an observer of the slots, never by listening to the scroll.
    assert.match(story, /new IntersectionObserver\([\s\S]*?rootMargin: '-50% 0px -50% 0px'/, 'the current chapter is not read at the timeline’s line');
    assert.equal(timeline.LINE, 50);
    assert.equal(timeline.LEAD, 50);
    assert.match(story, /window\[method\]\('scroll', request, \{ passive: true \}/, 'the scroll listener is not passive');
    assert.equal(/passive: false/.test(story), false, 'a listener that may hold the scroll');
    assert.match(story, /requestAnimationFrame\(write\)/);
    assert.match(story, /new IntersectionObserver/);
    assert.equal((story.match(/getBoundingClientRect/g) ?? []).length, 1, 'more than one layout read per frame');
    assert.match(story, /root\.dataset\.motion !== 'scroll'/, 'the script runs for a reader who asked for less motion');
    assert.match(story, /for \(const animation of animations\) animation\.currentTime = time;/, 'the fallback does not move the story');
    const css = read('app/landing.css');
    // Paused, the story a second long: each element's stretch is its delay and its duration.
    assert.match(css, /\[data-story='script'\] \.story \[data-mv\] \{\s*animation-timeline: auto;\s*animation-delay: calc\(var\(--mv-a\) \* 1s\);\s*animation-duration: calc\(\(var\(--mv-b\) - var\(--mv-a\)\) \* 1s\);\s*animation-play-state: paused;/);
  });

  it('nothing moves on its own: the scroll is the arrival’s only clock, and a press the only other', () => {
    const css = read('app/landing.css');
    assert.equal(/\banimation\s*:|\btransition\s*:/.test(css), false, 'a shorthand, which hides what it sets');
    assert.match(css, /view-timeline: --story block;/);
    // The story starts half a window before the section's top reaches the top (`LEAD`), as the hero scrolls out.
    // Each element runs over its own stretch, on the section's cover range; the story itself starts half a window
    // before the section's top reaches the top (`LEAD`), as the hero scrolls out, and ends as the stage lets go.
    assert.match(css, /\.story \[data-mv\] \{\s*animation-duration: auto;\s*animation-timing-function: linear;\s*animation-fill-mode: both;\s*animation-timeline: --story;\s*animation-range: cover calc\(var\(--mv-c0\) \* 1%\) cover calc\(var\(--mv-c1\) \* 1%\);/);
    const H = timeline.STORY_HEIGHT;
    // cover 0% is the section's top at the window's foot; the story starts with it half a window up, and ends with
    // the section's foot at the window's foot, H - 100 svh later: (50 + p * (H - 50)) / (H + 100).
    assert.equal(motion.coverOf(0), (50 / (H + 100)) * 100);
    assert.equal(motion.coverOf(1), (H / (H + 100)) * 100);
    // Every rule that starts something on a clock is one a press set off, and only for a reader who did not ask for less motion.
    const gate = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    assert.ok(gate !== -1);
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2], at: match.index }));
    let clocks = 0;
    for (const { selector, body, at } of rules) {
      // A delay on a paused animation is a place in the story, not a clock.
      const starts = /animation-name:\s*(?!none)/.test(body) || /transition-property:/.test(body) || (/animation-delay:/.test(body) && !/animation-play-state: paused/.test(body));
      if (!starts) continue;
      clocks += 1;
      assert.ok(at > gate, `${selector} moves things for a reader who asked for less motion`);
      assert.ok(/\[data-pressed\]/.test(selector), `${selector} moves things nobody pressed for`);
    }
    assert.ok(clocks >= 3, 'the press’s reveal, the lid and the receipt are gone');
    // The one clock keyframes the stylesheet holds: a line of output appearing, by opacity.
    const keyframes = [...css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n {2}\}/g)];
    assert.deepEqual(keyframes.map((match) => match[1]), ['desk-line']);
    assert.equal(/[a-z-]+:/.test(keyframes[0][2].replace(/opacity:/g, '')), false, 'the press reveal changes more than opacity');
    assert.equal(/setTimeout|setInterval/.test(codeOf('components/landing/Story.tsx')), false);
    // A press or focus inside the story completes the arrival, so a control is never reached half-arrived; a press
    // outranks the scroll's keyframes without stopping them.
    assert.match(css, /\.story\[data-pressed\] \[data-arrive\],\s*:root\[data-desk\] \.story:focus-within \[data-arrive\] \{\s*transform: none !important;\s*opacity: 1 !important;/);
    assert.equal(/animation-name: none/.test(css), false, 'a press stops the story instead of standing over it');
  });

  it('only the elements that move are animated by the scroll, and never a line of text', async () => {
    /*
     * Measured: driven by an animated custom property, every frame at 4x CPU
     * throttle restyled about 460 elements (every line and run of the
     * terminal, every key of the keyboard), 50 to 180 ms a frame. Keyframes of
     * the properties themselves restyle only the element that moves.
     */
    const css = read('app/landing.css');
    assert.equal(/var\(--p\)|@property/.test(css), false, 'the stylesheet changes with the scroll');
    const written = motion.storyMotion(terminal.TERMINAL, terminal.RECEIPT.lines.length, terminal.TERMINAL_NARROW);
    const defined = new Set([...written.matchAll(/@keyframes ([\w-]+) \{/g)].map((match) => match[1]));
    const html = await landingHtml('en');
    const used = [...html.matchAll(/animation-name:([\w-]+)/g)].map((match) => match[1]);
    assert.ok(used.length >= 40 && used.length <= 120, `${used.length} moving elements`);
    for (const name of used) assert.ok(defined.has(name), `${name} is used and never written`);
    for (const name of defined) assert.ok(used.includes(name), `${name} is written and never used`);
    assert.equal(/class="tl[^"]*" style="[^"]*animation-name/.test(html), false, 'a line of the terminal animates with the scroll');
    assert.equal((html.match(/data-mv=""/g) ?? []).length, used.length, 'an element marked as moving names no keyframes');
    // A line's place in its output is a constant, for the press's reveal; nothing changes it.
    assert.equal(/@property|--i:\s*var/.test(css + written), false);
  });

  it('only transform, opacity and clip-path change with the scroll', () => {
    const written = motion.storyMotion(terminal.TERMINAL, terminal.RECEIPT.lines.length, terminal.TERMINAL_NARROW);
    const properties = new Set([...written.matchAll(/([a-z-]+): [^;]+;/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(['transform', 'opacity', 'clip-path', 'animation-timing-function'].includes(property), `${property} changes with the scroll`);
    }
    assert.ok(properties.has('transform') && properties.has('opacity') && properties.has('clip-path'));
    assert.equal(/--[a-z-]+:/.test(written.replace(/var\(--[a-z-]+\)/g, '')), false, 'a keyframe animates a custom property');
  });
});

describe('the screen is never left blank, and the first command is typed as the laptop lands', () => {
  const screens = () => [...new Set(terminal.TERMINAL.map((b) => b.cap)), 'never'];

  it('the bill is typed as soon as the laptop has landed, not a stretch of scroll later', () => {
    const landed = timeline.within('arrival', timeline.BEATS.land)[1];
    const prompt = timeline.timeOutput('bill', terminal.TERMINAL).prompt;
    // Measured on the page before: a blank screen for about a third of a window of scroll after the laptop settled.
    const svh = (prompt - landed) * (timeline.STORY_HEIGHT - 100 + timeline.LEAD);
    assert.ok(prompt > landed && svh <= 8, `the bill's prompt comes ${svh.toFixed(1)}svh of scroll after the laptop lands`);
  });

  it('from the bill’s prompt to the end, some output is always whole on the screen: each gives way to the next as it comes on', () => {
    const start = timeline.timeOutput('bill', terminal.TERMINAL).prompt;
    for (let step = 0; step <= 4000; step += 1) {
      const p = start + ((1 - start) * step) / 4000;
      const shown = screens().map((screen) => motion.onScreen(screen, p, terminal.TERMINAL));
      assert.equal(Math.max(...shown), 1, `the screen has nothing whole on it at ${p.toFixed(4)}`);
      // Two at once only while one gives way to the next.
      assert.ok(shown.filter((value) => value > 0).length <= 2, `more than two outputs on the screen at ${p.toFixed(4)}`);
    }
    // And they cross only briefly: each transition is the crossfade and the new prompt's own fade, and no more.
    for (const screen of screens()) {
      let both = 0;
      for (let step = 0; step <= 20000; step += 1) {
        const p = step / 20000;
        const others = screens().filter((other) => other !== screen && motion.onScreen(other, p, terminal.TERMINAL) > 0);
        if (motion.onScreen(screen, p, terminal.TERMINAL) > 0 && others.length > 0) both += 1 / 20000;
      }
      assert.ok(both <= 2 * (timeline.CROSSFADE + 0.002), `${screen} shares the screen for ${both.toFixed(4)} of the story`);
    }
  });
});

describe('the lid, the depth and the order of the arrival', () => {
  it('the lid closes onto the deck, about its hinge, when pressed', () => {
    const { DECK_ANGLE, LID_CLOSED } = motion;
    const css = read('app/landing.css');
    assert.equal(Number(css.match(/\.lt-deck \{[^}]*rotateX\((\d+)deg\)/)[1]), DECK_ANGLE, 'the deck is not where the lid closes to');
    assert.match(css, /\.lt-lid \{[^}]*transform-origin: 50% 100%/, 'the lid does not turn on its hinge');
    const gap = 180 - DECK_ANGLE + LID_CLOSED;
    assert.ok(gap >= 0 && gap <= 3, `closed, the lid stands ${gap}deg off the deck`);
    assert.match(css, new RegExp(`\\.story\\[data-closed\\] \\.lt-lid \\{\\s*transform: rotateX\\(${LID_CLOSED}deg\\);`), 'the lid does not close to the deck');
    assert.match(stopsOf('st-lid').at(-1)[1], new RegExp(`rotateX\\(${LID_CLOSED}deg\\)`), 'the story ends with the lid open');
    assert.match(css, /\.lt-back \{[^}]*transform: rotateX\(180deg\)/, 'the wordmark side does not face out when closed');
    assert.match(css, /\.lt-face \{[^}]*backface-visibility: hidden/);
    // Pressed, what never leaves is on the screen as the lid comes down: over the output's ground, under the screen's light going out.
    const z = (selector) => Number(css.match(new RegExp(`:root\\[data-desk\\] ${selector.replace('.', '\\.')} \\{[^}]*z-index: (\\d+);`))[1]);
    assert.ok(z('.screen-out') < z('.lt-never') && z('.lt-never') < z('.lt-screen-off'), 'what never leaves is under the output, or over the screen going dark');
  });

  it('one light for the whole desk: every hard shadow falls down and to the right, and none is blurred', () => {
    const css = read('app/landing.css');
    const shadows = [...css.matchAll(/box-shadow:([^;]+);/g)].flatMap((match) => match[1].split(/,(?![^(]*\))/));
    let counted = 0;
    for (const shadow of shadows) {
      if (/var\(--extrude\)/.test(shadow)) continue;
      // The shadow's words at the top level: a calc() is one word, however many brackets it holds.
      const words = [];
      let depth = 0;
      let word = '';
      for (const char of `${shadow.trim()} `) {
        if (char === ' ' && depth === 0) {
          if (word !== '') words.push(word);
          word = '';
          continue;
        }
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        word += char;
      }
      const [x, y, blur] = words;
      counted += 1;
      assert.ok(!x.startsWith('-') && !y.startsWith('-'), `a shadow falls up or to the left: ${shadow.trim()}`);
      assert.equal(blur, '0', `a blurred shadow: ${shadow.trim()}`);
    }
    assert.ok(counted >= 6, 'the shadows are gone');
    assert.equal(/gradient\(|blur\(|drop-shadow|filter\s*:/.test(css), false, 'a gradient or a filter in the landing');
  });

  it('the headline keeps its place when its face arrives', () => {
    // Measured: the swap from Arial Bold to Space Grotesk was the page's whole
    // layout shift (0.036). The fallback is sized by Next's capsize metrics.
    const css = read('app/landing.css');
    assert.match(css, /@font-face \{\s*font-family: 'Trazum Grotesk Fallback';[^}]*size-adjust: 102\.09%;/);
    assert.match(css, /#landing-title,\s*\.chapter-title,\s*\.plate-title \{\s*font-family: 'Space Grotesk Variable', 'Trazum Grotesk Fallback', sans-serif;/);
    assert.match(read('components/Landing.tsx'), /id="landing-title"/);
  });

  it('the bill is typed a character at a time and printed a line at a time', () => {
    const written = motion.storyMotion(terminal.TERMINAL, terminal.RECEIPT.lines.length, terminal.TERMINAL_NARROW);
    const bill = block('bill');
    const typed = written.match(/@keyframes st-type-bill \{[\s\S]*?\n\}/)[0];
    assert.match(typed, new RegExp(`animation-timing-function: steps\\(${bill.command.length}, end\\)`));
    const printed = written.match(/@keyframes st-print-bill \{[\s\S]*?\n\}/)[0];
    assert.match(printed, /\n {2}0% \{ clip-path: inset\(0 0 calc\(100% - 0 \* 1\.5em\) 0\);/, 'the output is on the screen before it is typed');
    assert.match(printed, /\n {2}100% \{ clip-path: inset\(0 0 0% 0\);/, 'the output is not whole at the end');
    // Measured from the top: the lines shown never outnumber the lines printed, however a narrow screen wraps them.
    const shown = [...printed.matchAll(/calc\(100% - (\d+) \* 1\.5em\)/g)].map((match) => Number(match[1]));
    for (let at = 1; at < shown.length; at += 1) assert.equal(shown[at], shown[at - 1] + 1, 'the output does not print a line at a time');
  });

  it('the receipt is in the laptop until it prints, forward in its chapter, and on the desk at the end', () => {
    const frames = stopsOf('st-receipt');
    const [printed] = timeline.within('bill', timeline.BEATS.receipt);
    for (const [p, line] of frames) if (p < printed - 1e-6) assert.match(line, /opacity: 0;/, `the receipt shows before it prints: ${line}`);
    const [start, end] = timeline.chapterWindow('sources');
    assert.deepEqual(motion.receiptPose(start + (end - start) * 0.5), { out: 1, forward: 1 }, 'the receipt is not forward while its chapter is current');
    assert.deepEqual(motion.receiptPose(1), { out: 1, forward: 0 }, 'the receipt is not back on the desk at the end');
    assert.match(frames.at(-1)[1], /translate\(calc\(0 \* var\(--receipt-from-x\) \+ 0 \* var\(--receipt-fwd-x\)\)/);
  });

  it('the chapters follow one another without a gap, from the hero to the stage letting go', () => {
    const windows = timeline.CHAPTERS.map((chapter) => timeline.chapterWindow(chapter.id));
    assert.equal(windows[0][0], 0, 'the story does not start with the arrival');
    assert.equal(windows.at(-1)[1], 1, 'the story does not end with the closing');
    for (let i = 1; i < windows.length; i += 1) {
      assert.ok(Math.abs(windows[i][0] - windows[i - 1][1]) < 1e-9, `a gap or an overlap before ${timeline.CHAPTERS[i].id}`);
      assert.ok(windows[i][1] > windows[i][0], `${timeline.CHAPTERS[i].id} has no time`);
    }
    assert.deepEqual(timeline.CHAPTERS.map((chapter) => chapter.id), ['arrival', 'bill', 'check', 'guard', 'clock', 'optimize', 'models', 'sources', 'unpriced', 'never', 'close']);
    // The page sets each slot's height from the same table.
    assert.match(codeOf('components/landing/Story.tsx'), /'--ch-h': `\$\{chapterOf\(id\)\.height\}svh`/);
  });

  it('laptop, objects; then in each chapter: clear, lift, type, print', () => {
    const { BEATS } = timeline;
    // No table is drawn: the floor is the shadows' and the perspective's. The owner asked on 2026-11-20 for it to go.
    const page = `${codeOf('components/landing/Story.tsx')}${read('app/landing.css')}`;
    assert.equal(/desk-plane|desk-top|desk-edge/.test(page), false, 'a drawn desk is back');
    assert.equal('desk' in BEATS, false, 'a drawn desk still has a beat to arrive on');
    const arrivals = Array.from({ length: motion.OBJECT_COUNT }, (_, i) => timeline.objectArrival(i, motion.OBJECT_COUNT));
    for (let i = 1; i < arrivals.length; i += 1) assert.ok(arrivals[i][0] > arrivals[i - 1][0], 'two objects arrive together: the layers do not pass each other');
    assert.ok(arrivals.at(-1)[1] <= timeline.chapterWindow('arrival')[1] + 1e-9, 'an object is still arriving when the bill runs');
    assert.ok(BEATS.prompt[1] <= BEATS.type[0] && BEATS.type[1] <= BEATS.print[0] && BEATS.print[1] <= BEATS.receipt[0]);
    // A chapter settles its object as it ends, after all it shows: at the line between two chapters nothing is lifted.
    assert.ok(BEATS.receipt[1] <= 1 && BEATS.lift[1] <= BEATS.settle[0] && BEATS.settle[1] === 1);
    for (const chapter of timeline.CHAPTERS.slice(0, -1)) {
      const [, end] = timeline.chapterWindow(chapter.id);
      for (const object of motion.OBJECTS) assert.equal(motion.lifted(object, end), 0, `the ${object} is still lifted as the ${chapter.id} chapter ends`);
    }
    for (const owner of new Set(terminal.TERMINAL.map((b) => b.cap))) {
      const timed = timeline.timeOutput(owner, terminal.TERMINAL);
      const [start, end] = timeline.chapterWindow(timeline.chapterOf(owner));
      assert.ok(timed.prompt > start && timed.typed[1] < timed.lines[0].at, `${owner} prints before it is typed`);
      for (let at = 1; at < timed.lines.length; at += 1) assert.ok(timed.lines[at].at > timed.lines[at - 1].at, `${owner}: a line arrives before the one above it`);
      assert.ok(timed.lines.at(-1).at < end, `${owner} is still printing when its chapter ends`);
    }
  });
});
