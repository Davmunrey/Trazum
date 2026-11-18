import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

import { render as renderTerminal } from '../../../scripts/draw-landing-terminal.mjs';

/**
 * The landing's story (#744): a laptop, the CLI at work on its screen, and a
 * lid that closes over what never leaves the machine.
 *
 * What these hold, each because a page like this drifts in exactly that way:
 *
 * - the screen is what the built CLI prints, regenerated and compared, so a
 *   figure typed for the page fails here;
 * - every scene is in the page as text, in order, in every language, with the
 *   laptop: what a reader without motion or without JavaScript gets;
 * - the story never takes the scroll from the visitor, and only
 *   `transform`, `opacity` and `clip-path` change with it;
 * - the lid closes onto the deck and the timeline runs in the order told.
 *
 * The browser half (scrolling it top to bottom and back, the fallback script,
 * the phone, reduced motion, the light-first theme) is in `scripts/e2e.mjs`.
 */

register('./helpers/loader.mjs', import.meta.url);

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

let React, server, terminal, timeline, landingCopy, locales;

before(async () => {
  React = await import('react');
  server = await import('react-dom/server');
  terminal = await import('../lib/landing-terminal.ts');
  timeline = await import('../lib/story-timeline.ts');
  landingCopy = await import('../lib/landing-copy.ts');
  locales = await import('../lib/marketing-locales.ts');
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

describe('the laptop’s screen is what the CLI prints', () => {
  it('lib/landing-terminal.ts is what scripts/draw-landing-terminal.mjs writes from the built CLI today', () => {
    assert.equal(read('lib/landing-terminal.ts'), renderTerminal(), 'run: node scripts/draw-landing-terminal.mjs');
  });

  it('the page shows every line of it, in order, once, and nothing else', async () => {
    const expected = terminal.TERMINAL.flatMap((block) => [`$ ${block.command}`, ...block.lines.map((runs) => runs.map(([text]) => text).join(''))]);
    for (const locale of locales.MARKETING_LOCALES) {
      assert.deepEqual(screenLines(await landingHtml(locale)), expected, `the screen (${locale}) is not the transcript`);
    }
  });

  it('runs the commands the README and the docs name, on files in this repository', () => {
    const commands = terminal.TERMINAL.map((block) => block.command);
    assert.deepEqual(commands, [
      'npx @trazum/cli bill examples/claude-projects',
      'npx @trazum/cli check examples/',
      'echo $?',
      'npx @trazum/cli optimize examples/support-prompt.txt',
    ]);
    const status = terminal.TERMINAL.find((block) => block.id === 'status');
    assert.match(status.lines[0][0][0], /^\d+$/, 'echo $? printed something other than a status');
  });

  it('carries no figure of its own: the story component writes no words', () => {
    // Every word in the story is the copy table's or the transcript's. The only
    // literal text is the prompt's `$`, the scene numbers and the wordmark.
    const story = codeOf('components/landing/Story.tsx');
    const literals = [...story.matchAll(/>([^<>{}]+)<\//g)].map((match) => match[1].trim()).filter((text) => text !== '');
    for (const text of literals) assert.ok(['$', 'Trazum', '04'].includes(text), `Story.tsx writes its own text: ${JSON.stringify(text)}`);
    for (const number of ['"01"', '"02"', '"03"']) assert.ok(story.includes(`number=${number}`));
  });
});

describe('every scene is there as text, in order, with the laptop', () => {
  it('in each of the five languages', async () => {
    for (const locale of locales.MARKETING_LOCALES) {
      const html = await landingHtml(locale);
      const t = landingCopy.COPY[locale];
      const text = decode(html);
      const marks = [
        ['the headline', t.heroTitle],
        ['the bill’s heading', t.billTitle],
        ['the bill’s total', '$12.70 across 126 priced call(s)'],
        ['the gate’s heading', t.more.ci.title],
        ['the gate’s verdict', 'All 3 within budget.'],
        ['the trimming’s heading', t.more.trim.title],
        ['the trimming’s counts', '326 → 202'],
        ['what never leaves', t.neverTitle],
        ...t.neverItems.map((item) => [`the never item "${item}"`, item]),
        ['what leaves', t.leaves],
        ['why the number holds up', t.reasonsTitle],
        ['the closing', t.closeTitle],
      ];
      let at = -1;
      for (const [what, mark] of marks) {
        const found = text.indexOf(mark, at + 1);
        assert.ok(found > at, `${locale}: ${what} is missing or out of order`);
        at = found;
      }
      assert.match(html, /class="lt-device"/, `${locale}: no laptop`);
      assert.match(html, /class="lt-face lt-back"[^>]*><span>Trazum<\/span>/, `${locale}: the lid carries no wordmark`);
      assert.equal((html.match(/class="scene"/g) ?? []).length, 3, `${locale}: not three scenes on the screen`);
      assert.match(html, /data-scene="never"/);
    }
  });

  it('no word the story shows is left in English in another language', () => {
    const shown = (t) => [
      t.billKicker, t.billTitle, t.heroLede, t.billCaveat, t.moreTitle, t.more.ci.title, t.more.ci.body, t.more.trim.title, t.more.trim.body,
      t.neverLabel, t.neverTitle, t.neverLede, ...t.neverItems, t.leavesLabel, t.leaves,
    ];
    const english = shown(landingCopy.COPY.en);
    for (const locale of ['es', 'fr', 'de', 'pt']) {
      shown(landingCopy.COPY[locale]).forEach((text, index) => {
        assert.notEqual(text, english[index], `${locale}: "${text}" is the English`);
      });
    }
  });

  it('the pinned stage holds no control a keyboard could land on behind it', async () => {
    const html = await landingHtml('en');
    const story = html.slice(html.indexOf('class="story"'), html.indexOf('data-landing-close') === -1 ? undefined : html.indexOf('<p class="mx-auto'));
    assert.equal(/<a\b|<button\b|<input\b|tabindex=/.test(story.slice(0, story.indexOf('</ol>'))), false, 'a control inside the story');
  });

  it('the last call to action leads to the dashboard, and the source of the bill is linked outside the stage', async () => {
    const html = await landingHtml('en');
    const close = html.slice(html.indexOf('data-landing-close'));
    assert.match(close, /<a href="\/app" data-dashboard-action=""/);
    assert.ok(html.indexOf('examples/claude-projects</a>') === -1 || html.indexOf('tree/main/examples/claude-projects') > html.indexOf('</ol>'));
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
      assert.equal(/scrollTo\s*\(|scrollBy\s*\(|scrollIntoView/.test(code), false, `${file} moves the scroll itself`);
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

  it('nothing on a timer: the scroll is the story’s only clock', () => {
    const css = read('app/landing.css');
    assert.equal(/animation\s*:/.test(css), false, 'an animation shorthand, which would put the story back on a clock');
    assert.match(css, /view-timeline: --story block;/);
    assert.match(css, /\.story \[data-mv\] \{\s*animation-duration: auto;\s*animation-timing-function: linear;\s*animation-fill-mode: both;\s*animation-timeline: --story;\s*animation-range: contain 0% contain 100%;/);
    assert.equal(/transition\s*:/.test(css), false, 'a transition in the story');
    assert.equal(/setTimeout|setInterval/.test(codeOf('components/landing/Story.tsx')), false);
  });

  it('only the elements that move are animated, and never a line of text', async () => {
    /*
     * Measured: driven by an animated custom property, every frame at 4x CPU
     * throttle restyled about 460 elements (every line and run of the
     * terminal, every key of the keyboard), 50 to 180 ms a frame. Keyframes of
     * the properties themselves restyle only the element that moves.
     */
    const css = read('app/landing.css');
    assert.equal(/var\(--p\)|@property|@keyframes/.test(css), false, 'the stylesheet changes with the scroll');
    const { storyMotion } = await import('../lib/story-motion.ts');
    const motion = storyMotion(terminal.TERMINAL);
    const defined = new Set([...motion.matchAll(/@keyframes ([\w-]+) \{/g)].map((match) => match[1]));
    const html = await landingHtml('en');
    const used = [...html.matchAll(/style="animation-name:([\w-]+)"/g)].map((match) => match[1]);
    assert.ok(used.length >= 30 && used.length <= 60, `${used.length} moving elements`);
    for (const name of used) assert.ok(defined.has(name), `${name} is used and never written`);
    for (const name of defined) assert.ok(used.includes(name), `${name} is written and never used`);
    assert.equal(/class="tl[^"]*" style=|class="t-[bdgyr ]*"[^>]*animation-name/.test(html), false, 'a line of the terminal animates');
    assert.equal((html.match(/data-mv=""/g) ?? []).length, used.length, 'an element marked as moving names no keyframes');
  });

  it('only transform, opacity and clip-path change with the scroll', async () => {
    const { storyMotion } = await import('../lib/story-motion.ts');
    const motion = storyMotion(terminal.TERMINAL);
    const properties = new Set([...motion.matchAll(/([a-z-]+): [^;]+;/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(['transform', 'opacity', 'clip-path', 'animation-timing-function'].includes(property), `${property} changes with the scroll`);
    }
    assert.ok(properties.has('transform') && properties.has('opacity') && properties.has('clip-path'));
  });
});

describe('the lid, the dive and the order of the story', () => {
  it('the lid closes onto the deck, about its hinge, and opens at the top', async () => {
    const { DECK_ANGLE, LID_CLOSED, storyMotion } = await import('../lib/story-motion.ts');
    const css = read('app/landing.css');
    assert.equal(Number(css.match(/\.lt-deck \{[^}]*rotateX\((\d+)deg\)/)[1]), DECK_ANGLE, 'the deck is not where the lid closes to');
    assert.match(css, /\.lt-lid \{[^}]*transform-origin: 50% 100%/, 'the lid does not turn on its hinge');
    const gap = 180 - DECK_ANGLE + LID_CLOSED;
    assert.ok(gap >= 0 && gap <= 3, `closed, the lid stands ${gap}deg off the deck`);
    const lid = storyMotion(terminal.TERMINAL).match(/@keyframes st-lid \{([^}]*(?:\}[^}@]*)*)\}/)[0];
    assert.match(lid, /\n {2}0% \{ transform: rotateX\(0deg\); \}/, 'the lid is not open at the top');
    assert.match(lid, new RegExp(`\\n {2}100% \\{ transform: rotateX\\(${LID_CLOSED}deg\\); \\}`), 'the lid is not closed at the end');
    assert.match(css, /\.lt-back \{[^}]*transform: rotateX\(180deg\)/, 'the wordmark side does not face out when closed');
    assert.match(css, /\.lt-face \{[^}]*backface-visibility: hidden/);
  });

  it('the terminal reaches a scale of exactly 1 inside the screen: its text is never scaled up', async () => {
    const { phasesAt, storyMotion } = await import('../lib/story-motion.ts');
    const inside = timeline.PHASES.expand[0];
    const at = phasesAt(inside);
    assert.deepEqual([at.A, at.D, at.S], [1, 1, 0], 'not all the way in when the screen opens to the window');
    const layer = storyMotion(terminal.TERMINAL).match(/@keyframes st-layer \{[\s\S]*?\n\}/)[0];
    const frame = layer.split('\n').find((line) => line.startsWith(`  ${Number((inside * 100).toFixed(5))}% `));
    assert.ok(frame, 'no keyframe where the screen opens');
    assert.match(frame, /scale\(calc\(1 \* \(1 \+ \(1 \/ var\(--lam\) - 1\) \* 1\) \* 1 \* var\(--lam\)\)\)/);
    for (const line of layer.split('\n').filter((l) => l.includes('scale('))) {
      const [, k0, d, s] = line.match(/scale\(calc\(([\d.]+) \* \(1 \+ \(1 \/ var\(--lam\) - 1\) \* ([\d.]+)\) \* ([\d.]+) \* var\(--lam\)\)\)/);
      assert.ok(Number(k0) <= 1 && Number(d) <= 1 && Number(s) <= 1, `the terminal scaled past 1: ${line}`);
    }
  });

  it('the headline keeps its place when its face arrives', () => {
    // Measured: the swap from Arial Bold to Space Grotesk was the page's whole
    // layout shift (0.036). The fallback is sized by Next's capsize metrics.
    const css = read('app/landing.css');
    assert.match(css, /@font-face \{\s*font-family: 'Trazum Grotesk Fallback';[^}]*size-adjust: 102\.09%;/);
    assert.match(css, /#landing-title \{\s*font-family: 'Space Grotesk Variable', 'Trazum Grotesk Fallback', sans-serif;/);
    assert.match(read('components/Landing.tsx'), /id="landing-title"/);
  });

  it('a command types a character at a time', async () => {
    const { storyMotion } = await import('../lib/story-motion.ts');
    const motion = storyMotion(terminal.TERMINAL);
    terminal.TERMINAL.forEach((block, index) => {
      const rule = motion.match(new RegExp(`@keyframes st-type-${index} \\{[\\s\\S]*?\\n\\}`))[0];
      assert.match(rule, new RegExp(`animation-timing-function: steps\\(${block.command.length}, end\\)`), `${block.command} is not typed a character at a time`);
    });
  });

  it('approach, dive, the three commands, the pull out, the clear, the close, what leaves', () => {
    const { PHASES, RUNS, SCENES } = timeline;
    const order = [
      PHASES.approach,
      PHASES.dive,
      PHASES.expand,
      RUNS.bill.print,
      RUNS.check.type,
      RUNS.check.print,
      RUNS.status.type,
      RUNS.optimize.type,
      RUNS.optimize.print,
      PHASES.unexpand,
      PHASES.undive,
      PHASES.settle,
      PHASES.close,
    ];
    for (let at = 1; at < order.length; at += 1) assert.ok(order[at][0] >= order[at - 1][1] - 1e-9, `step ${at} starts before step ${at - 1} ends`);
    assert.ok(PHASES.leaves[0] > PHASES.close[0] && PHASES.leaves[1] <= 1);
    assert.ok(PHASES.clear[0] >= PHASES.unexpand[1], 'the terminal clears while it still fills the window');
    assert.ok(RUNS.bill.type[1] <= PHASES.expand[1], 'the bill is still being typed once inside');
    for (const scene of SCENES) assert.ok(scene.range[0] < scene.range[1]);
    const timed = timeline.timeLines(terminal.TERMINAL).flatMap((block) => [block.command, ...block.lines]);
    for (let at = 1; at < timed.length; at += 1) assert.ok(timed[at].at >= timed[at - 1].at, 'a line arrives before the one above it');
    assert.ok(timed.at(-1).at <= PHASES.unexpand[0], 'output still printing as the camera pulls out');
  });
});
