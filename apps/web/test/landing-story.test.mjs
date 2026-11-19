import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

import { render as renderTerminal } from '../../../scripts/draw-landing-terminal.mjs';

/**
 * The landing's desk: one laptop on a desk, one object per capability around
 * it, the arrival told by scrolling, and a lid that closes over what never
 * leaves the machine.
 *
 * What these hold, each because a page like this drifts in exactly that way:
 *
 * - the screen and the receipt are what the built CLI prints, regenerated and
 *   compared, so a figure typed for the page fails here, and the receipt's
 *   total is the bill's;
 * - there is one laptop on the page, and every object is a button that says
 *   whether it is pressed;
 * - every capability's output and plate is in the page as text, in order, in
 *   every language: what a reader without JavaScript gets;
 * - the story never takes the scroll from the visitor, only `transform`,
 *   `opacity` and `clip-path` change with it, and nothing moves on a clock
 *   unless a press set it off;
 * - the lid closes onto the deck and the arrival runs in the order told.
 *
 * The browser half (scrolling it top to bottom and back, the fallback script,
 * pressing every object, the phone, reduced motion, the light-first theme) is
 * in `scripts/e2e.mjs`.
 */

register('./helpers/loader.mjs', import.meta.url);

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

let React, server, terminal, timeline, landingCopy, locales, motion;

before(async () => {
  React = await import('react');
  server = await import('react-dom/server');
  terminal = await import('../lib/landing-terminal.ts');
  timeline = await import('../lib/story-timeline.ts');
  landingCopy = await import('../lib/landing-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
  motion = await import('../lib/story-motion.ts');
});

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
    ]);
    assert.deepEqual([...new Set(terminal.TERMINAL.map((b) => b.cap))], [...landingCopy.DESK_COMMANDS], 'an object with no output, or output with no object');
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

  it('the paper receipt on the page shows the receipt’s figures, and its total once, on the acid', async () => {
    const html = await landingHtml('en');
    const paper = html.slice(html.indexOf('class="receipt-paper"'), html.indexOf('class="receipt-curl"'));
    assert.match(paper, new RegExp(`<span class="receipt-figure">${terminal.RECEIPT.total.replace('$', '\\$')}</span>`), 'the receipt’s total on the page is not the CLI’s');
    assert.equal((paper.match(/class="receipt-figure"/g) ?? []).length, 1);
    for (const line of terminal.RECEIPT.lines) {
      assert.ok(paper.includes(`>${line.usd}</span>`), `the receipt on the page does not show ${line.model} at ${line.usd}`);
      assert.ok(decode(paper).includes(line.reviewedOn), `the receipt on the page does not say when ${line.model}’s rate was read`);
    }
  });

  it('the huge figure behind the laptop is the receipt’s total, the bill’s, and is hidden from assistive technology', async () => {
    const html = await landingHtml('en');
    const figures = [...html.matchAll(/<p aria-hidden="true" class="desk-figure"[^>]*>([^<]*)<\/p>/g)].map((match) => match[1]);
    assert.deepEqual(figures, [terminal.RECEIPT.total], 'the figure behind the laptop is not the receipt’s total, or there is more than one');
    const mark = block('bill').lines.flat().find(([, style]) => style.includes('m'));
    assert.equal(figures[0], mark[0], 'the figure behind the laptop is not the bill’s total');
    // Behind the laptop, the receipt and the plate: lower in the stacking order than each.
    const css = read('app/landing.css');
    const z = (selector) => Number(css.match(new RegExp(`:root\\[data-desk\\] ${selector.replace('.', '\\.')} \\{[^}]*z-index: (\\d+);`))[1]);
    for (const nearer of ['.desk-scene', '.desk-plate', '.desk-objects']) assert.ok(z('.desk-figure') < z(nearer), `the figure is in front of ${nearer}`);
    assert.ok(z('.desk-plane') < z('.desk-figure'), 'the figure is behind the desk');
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
      assert.equal((html.match(/<pre class="term"/g) ?? []).length, landingCopy.DESK_COMMANDS.length, `${locale}: a terminal outside the laptop`);
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
      assert.match(html, new RegExp(`class="cap-out" data-cap="${id}" aria-labelledby="desk-plate-${id}"`));
      assert.match(html, new RegExp(`<h3 id="desk-plate-${id}" class="plate-title">`));
    }
    assert.match(html, /<h3 id="desk-plate-lid" class="plate-title">/);
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
        ['the desk’s heading', t.desk.title],
        ['the bill’s total', '$12.70 across 126 priced call(s)'],
        ['the gate’s verdict', 'All 3 within budget.'],
        ['the breaker’s stop', 'Trazum: stopped.'],
        ['the clock’s first week', '2026-W36'],
        ['the trimming’s counts', '326 → 202'],
        ['the calendar’s cut', 'rows shown: the models the receipt priced.'],
        ...t.neverItems.map((item) => [`the never item "${item}"`, item]),
        ['the receipt’s total', `${t.desk.receipt.total}${terminal.RECEIPT.total}`],
        ...landingCopy.DESK_COMMANDS.map((id) => [`the ${id} plate`, t.desk.caps[id].title]),
        ['what never leaves', t.neverTitle],
        ['what leaves', t.leaves],
        ['why the number holds up', t.reasonsTitle],
        ['the closing', t.closeTitle],
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
    assert.match(story, /window\[method\]\('scroll', request, \{ passive: true \}/, 'the scroll listener is not passive');
    assert.equal(/passive: false/.test(story), false, 'a listener that may hold the scroll');
    assert.match(story, /requestAnimationFrame\(write\)/);
    assert.match(story, /new IntersectionObserver/);
    assert.equal((story.match(/getBoundingClientRect/g) ?? []).length, 1, 'more than one layout read per frame');
    assert.match(story, /root\.dataset\.motion !== 'scroll'/, 'the script runs for a reader who asked for less motion');
    assert.match(story, /for \(const animation of animations\) animation\.currentTime = time;/, 'the fallback does not move the story');
    const css = read('app/landing.css');
    assert.match(css, /\[data-story='script'\] \.story \[data-mv\] \{\s*animation-timeline: auto;\s*animation-duration: 1s;\s*animation-play-state: paused;/);
  });

  it('nothing moves on its own: the scroll is the arrival’s only clock, and a press the only other', () => {
    const css = read('app/landing.css');
    assert.equal(/\banimation\s*:|\btransition\s*:/.test(css), false, 'a shorthand, which hides what it sets');
    assert.match(css, /view-timeline: --story block;/);
    assert.match(css, /\.story \[data-mv\] \{\s*animation-duration: auto;\s*animation-timing-function: linear;\s*animation-fill-mode: both;\s*animation-timeline: --story;\s*animation-range: contain 0% contain 100%;/);
    // Every rule that starts something on a clock is one a press set off, and only for a reader who did not ask for less motion.
    const gate = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    assert.ok(gate !== -1);
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2], at: match.index }));
    let clocks = 0;
    for (const { selector, body, at } of rules) {
      const starts = /animation-name:\s*(?!none)/.test(body) || /transition-property:/.test(body) || /animation-delay:/.test(body);
      if (!starts) continue;
      clocks += 1;
      assert.ok(at > gate, `${selector} moves things for a reader who asked for less motion`);
      assert.ok(/\[data-used\]|\[data-closed\]|\.obj\b/.test(selector), `${selector} moves things nobody pressed for`);
    }
    assert.ok(clocks >= 3, 'the press’s reveal, the lid and the receipt are gone');
    // The one clock keyframes the stylesheet holds: a line of output appearing, by opacity.
    const keyframes = [...css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n {2}\}/g)];
    assert.deepEqual(keyframes.map((match) => match[1]), ['desk-line']);
    assert.equal(/[a-z-]+:/.test(keyframes[0][2].replace(/opacity:/g, '')), false, 'the press reveal changes more than opacity');
    assert.equal(/setTimeout|setInterval/.test(codeOf('components/landing/Story.tsx')), false);
    // A press or focus inside the desk ends the arrival, so a control is never reached half-arrived.
    assert.match(css, /\.story\[data-used\] \[data-mv\],\s*:root\[data-motion='scroll'\] \.story:focus-within \[data-mv\] \{\s*animation-name: none !important;/);
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
    const written = motion.storyMotion(terminal.TERMINAL);
    const defined = new Set([...written.matchAll(/@keyframes ([\w-]+) \{/g)].map((match) => match[1]));
    const html = await landingHtml('en');
    const used = [...html.matchAll(/animation-name:([\w-]+)/g)].map((match) => match[1]);
    assert.ok(used.length >= 15 && used.length <= 30, `${used.length} moving elements`);
    for (const name of used) assert.ok(defined.has(name), `${name} is used and never written`);
    for (const name of defined) assert.ok(used.includes(name), `${name} is written and never used`);
    assert.equal(/class="tl[^"]*" style="[^"]*animation-name/.test(html), false, 'a line of the terminal animates with the scroll');
    assert.equal((html.match(/data-mv=""/g) ?? []).length, used.length, 'an element marked as moving names no keyframes');
    // A line's place in its output is a constant, for the press's reveal; nothing changes it.
    assert.equal(/@property|--i:\s*var/.test(css + written), false);
  });

  it('only transform, opacity and clip-path change with the scroll', () => {
    const written = motion.storyMotion(terminal.TERMINAL);
    const properties = new Set([...written.matchAll(/([a-z-]+): [^;]+;/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(['transform', 'opacity', 'clip-path', 'animation-timing-function'].includes(property), `${property} changes with the scroll`);
    }
    assert.ok(properties.has('transform') && properties.has('opacity') && properties.has('clip-path'));
    assert.equal(/--[a-z-]+:/.test(written.replace(/var\(--[a-z-]+\)/g, '')), false, 'a keyframe animates a custom property');
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
    assert.match(css, /#landing-title \{\s*font-family: 'Space Grotesk Variable', 'Trazum Grotesk Fallback', sans-serif;/);
    assert.match(read('components/Landing.tsx'), /id="landing-title"/);
  });

  it('the bill is typed a character at a time and printed a line at a time', () => {
    const written = motion.storyMotion(terminal.TERMINAL);
    const bill = block('bill');
    const typed = written.match(/@keyframes st-type \{[\s\S]*?\n\}/)[0];
    assert.match(typed, new RegExp(`animation-timing-function: steps\\(${bill.command.length}, end\\)`));
    const printed = written.match(/@keyframes st-print \{[\s\S]*?\n\}/)[0];
    assert.match(printed, /\n {2}0% \{ clip-path: inset\(0 0 calc\(100% - 0 \* 1\.5em\) 0\);/, 'the output is on the screen before it is typed');
    assert.match(printed, /\n {2}100% \{ clip-path: inset\(0 0 0% 0\);/, 'the output is not whole at the end');
    // Measured from the top: the lines shown never outnumber the lines printed, however a narrow screen wraps them.
    const shown = [...printed.matchAll(/calc\(100% - (\d+) \* 1\.5em\)/g)].map((match) => Number(match[1]));
    for (let at = 1; at < shown.length; at += 1) assert.equal(shown[at], shown[at - 1] + 1, 'the output does not print a line at a time');
  });

  it('the receipt is behind the laptop until it prints, and on the desk at the end', () => {
    const written = motion.storyMotion(terminal.TERMINAL);
    const receipt = written.match(/@keyframes st-receipt \{[\s\S]*?\n\}/)[0];
    const frames = receipt.split('\n').filter((line) => /^\s+[\d.]+% /.test(line)).map((line) => [Number(line.match(/([\d.]+)%/)[1]) / 100, line]);
    for (const [p, line] of frames) {
      if (p < timeline.PHASES.receipt[0]) assert.match(line, /opacity: 0;/, `the receipt shows before it prints: ${line}`);
    }
    assert.match(frames.at(-1)[1], /translateX\(calc\(0 \* var\(--receipt-from\)\)\); opacity: 1;/);
  });

  it('desk, laptop, objects, plate, typing, printing, receipt', () => {
    const { PHASES } = timeline;
    assert.ok(PHASES.desk[0] <= PHASES.land[0], 'the laptop arrives before the desk under it');
    assert.ok(PHASES.land[1] <= PHASES.type[0], 'the bill is typed before the laptop has landed');
    assert.ok(PHASES.objects[1] <= PHASES.type[1], 'the objects are still arriving as the bill prints');
    assert.ok(PHASES.type[1] <= PHASES.print[0] && PHASES.print[0] < PHASES.print[1]);
    assert.ok(PHASES.print[1] <= PHASES.receipt[0] + 0.03, 'the receipt prints long before the bill has');
    assert.ok(PHASES.receipt[1] < 1, 'the receipt is still printing when the stage lets go');
    const arrivals = Array.from({ length: motion.OBJECT_COUNT }, (_, i) => timeline.objectArrival(i, motion.OBJECT_COUNT));
    for (let i = 1; i < arrivals.length; i += 1) assert.ok(arrivals[i][0] > arrivals[i - 1][0], 'two objects arrive together: the layers do not pass each other');
    assert.ok(arrivals.at(-1)[1] <= PHASES.objects[1] + 1e-9);
    const timed = timeline.timeLines(block('bill'));
    for (let at = 1; at < timed.lines.length; at += 1) assert.ok(timed.lines[at].at > timed.lines[at - 1].at, 'a line arrives before the one above it');
  });
});
