import type { BlockOwner, TerminalBlock } from './landing-terminal';
import {
  BEATS,
  CHAPTERS,
  CROSSFADE,
  LEAD,
  STORY_HEIGHT,
  type ChapterId,
  NOTE_DRAW,
  type ObjectId,
  type Range,
  objectArrival,
  progress,
  staggered,
  timeOutput,
  within,
} from './story-timeline';

/**
 * The landing story's motion, as CSS keyframes of `transform`, `opacity` and
 * `clip-path`, one set per moving element, written from the timeline.
 *
 * ## Why keyframes, and why written here
 *
 * A first version computed every position in the stylesheet from one custom
 * property animated by the scroll. Measured at 4x CPU throttle, every frame
 * recomputed the style of about 460 elements, 50 to 180 ms a frame, because a
 * changing custom property makes the browser restyle what lies beneath it.
 * Animating the properties themselves restyles only the element that moves,
 * and lets the browser hand a transform or an opacity to the compositor.
 *
 * So each moving element gets keyframes over the whole story (0% as the hero
 * scrolls out, 100% when the stage lets go), sampled through each eased beat
 * finely enough that the straight lines between samples follow the curve. The
 * distances stay in the stylesheet as custom properties of the desk, which
 * never change while scrolling (`var(--rise-laptop)` and so on), so one set of
 * keyframes serves the desktop and the phone.
 *
 * The same keyframes run two ways: on the section's scroll timeline where the
 * browser has one, and, where it has not, paused, with `Story.tsx` setting
 * each animation's current time to the scroll position. Either way, the
 * scroll position is the only clock.
 *
 * ## What each chapter moves
 *
 * The arrival brings the desk, the laptop and each object in over their own
 * stretch and from their own distance, so they pass each other as layers.
 * Then each chapter lifts its own object, types its command over what the
 * chapter before left on the screen, which gives way to it, and prints the
 * output a line at a time, the screen scrolling up as a terminal does once
 * the output is taller than it; as it ends it settles the object back. Only
 * the receipt moves sideways: out of the laptop's side, never over its screen
 * while it prints, forward in front of it with a note of each rate's page,
 * and back onto the desk. The lid closes last.
 */

/** The lid's angle, closed: onto the deck, which lies at `DECK_ANGLE`, short of touching it by a degree. */
export const DECK_ANGLE = 76;
export const LID_CLOSED = -(180 - DECK_ANGLE - 1);

const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const n = (value: number) => Number(value.toFixed(5)).toString();

/** Points through a range: its two ends and `count` between. */
function through([start, end]: Range, count: number): number[] {
  return Array.from({ length: count + 2 }, (_, i) => start + ((end - start) * i) / (count + 1));
}

type Frame = Readonly<Record<string, string>>;

/**
 * The stretch of the story each moving element moves in, by its keyframes'
 * name: from its first stop to its last, as a fraction of the story. Outside
 * it the element holds still (`animation-fill-mode: both`), so each element
 * runs only over its own stretch rather than over the whole story: measured
 * at 4x CPU throttle, about ninety animations each active over the whole
 * story dropped a frame in five at 1440x900, because the browser samples
 * every animation in its active interval on every frame.
 */
export type Span = readonly [start: number, end: number];

/** Where a point of the story is on the section's `cover` range, in percent: the stylesheet's `animation-range` for it. */
export function coverOf(p: number): number {
  return ((LEAD + p * (STORY_HEIGHT - 100 + LEAD)) / (STORY_HEIGHT + 100)) * 100;
}

/**
 * One `@keyframes` rule over its own stretch, its stops in order, each stop
 * the values `at(p)` gives; the stretch is recorded in `spans`. Every value
 * holds still outside the stretch, which the stops are chosen to cover.
 */
function frames(spans: Map<string, Span>, name: string, stops: readonly number[], at: (p: number) => Frame, timing?: (p: number) => string | null): string {
  const points = stops.map((q) => Math.min(1, Math.max(0, q)));
  const lo = Math.min(...points);
  const hi = Math.max(lo + 1e-4, ...points);
  spans.set(name, [lo, hi]);
  // Each stop as written (to five decimals of a percent), with the point it was asked for, so that a value read at a
  // stop is the value at the moment the timeline names, not at a rounding of it.
  const asked = new Map<number, number>();
  for (const p of [lo, hi, ...points]) {
    const written = Number((((p - lo) / (hi - lo)) * 100).toFixed(5));
    if (!asked.has(written)) asked.set(written, p);
  }
  const body = [...asked.entries()]
    .sort(([a], [b]) => a - b)
    .map(([written, p]) => {
      const frame = Object.entries(at(p)).map(([property, value]) => `${property}: ${value};`);
      const easing = timing?.(p);
      if (easing) frame.push(`animation-timing-function: ${easing};`);
      return `  ${n(written)}% { ${frame.join(' ')} }`;
    })
    .join('\n');
  return `@keyframes ${name} {\n${body}\n}`;
}

/** A layer that rises into place over `range`, from `var(<distance>)` below where it rests. */
function rising(spans: Map<string, Span>, name: string, range: Range, distance: string, ease: (t: number) => number = smooth, extra?: (e: number) => Frame): string {
  return frames(spans, name, through(range, 10), (p) => {
    const e = ease(progress(p, range));
    return { transform: `translateY(calc(${n(1 - e)} * var(${distance})))`, ...extra?.(e) };
  });
}

/** The objects on the desk, in the order they lie: the six that run a command, and the lid. */
export const OBJECTS: readonly ObjectId[] = ['bill', 'check', 'guard', 'clock', 'optimize', 'models', 'lid'];
/** How many objects lie on the desk. */
export const OBJECT_COUNT = OBJECTS.length;

/** The chapter after this one, or none for the last. */
function next(id: ChapterId): ChapterId | null {
  const index = CHAPTERS.findIndex((chapter) => chapter.id === id);
  return CHAPTERS[index + 1]?.id ?? null;
}

/** The chapter in which an object takes its turn. */
export function chapterOfObject(object: ObjectId): ChapterId {
  const chapter = CHAPTERS.find((candidate) => candidate.object === object);
  if (chapter === undefined) throw new Error(`no chapter is the ${object}'s turn`);
  return chapter.id;
}

/**
 * How far an object is lifted, from 0 on the desk to 1 lifted and pressed:
 * up through its chapter's lift, held, and down as its chapter ends (the last
 * chapter's, the lid's, stays up).
 */
export function lifted(object: ObjectId, p: number): number {
  const chapter = chapterOfObject(object);
  const up = smooth(progress(p, within(chapter, BEATS.lift)));
  const down = next(chapter) === null ? 0 : smooth(progress(p, within(chapter, BEATS.settle)));
  return up * (1 - down);
}

/** The stretch over which a lift happens, for sampling: up, and down. */
function liftStops(object: ObjectId): number[] {
  const chapter = chapterOfObject(object);
  return [...through(within(chapter, BEATS.lift), 8), ...(next(chapter) === null ? [] : through(within(chapter, BEATS.settle), 8))];
}

/** The chapters that show a screen, in order. */
const showingOf = (screen: BlockOwner | 'never') => CHAPTERS.filter((chapter) => chapter.screen === screen).map((chapter) => chapter.id);

/** When a screen comes on: its prompt (what never leaves, its first line), as a short range. */
function comesOn(screen: BlockOwner | 'never', blocks: readonly TerminalBlock[]): Range {
  if (screen === 'never') return within(showingOf('never')[0], [BEATS.never[0] - 0.02, BEATS.never[0]]);
  const at = timeOutput(screen, blocks).prompt;
  return [at - 0.0015, at];
}

/** The screen that comes on after this one has had its chapters, if any: the output it gives way to. */
function nextScreen(screen: BlockOwner | 'never'): BlockOwner | 'never' | null {
  const last = CHAPTERS.findIndex((chapter) => chapter.id === showingOf(screen).at(-1));
  const after = CHAPTERS.slice(last + 1).find((chapter) => chapter.screen !== null && chapter.screen !== screen);
  return after === undefined ? null : (after.screen as BlockOwner | 'never');
}

/**
 * The stretch over which a screen gives way to the next one: from the moment
 * the next is whole, so that one or the other always is, and the two cross.
 */
function goesOff(screen: BlockOwner | 'never', blocks: readonly TerminalBlock[]): Range | null {
  const following = nextScreen(screen);
  if (following === null) return null;
  const [, at] = comesOn(following, blocks);
  return [at, at + CROSSFADE];
}

/**
 * Whether the screen shows an owner's output (or what never leaves), from 0 to
 * 1: on from its prompt, and on until the next output's prompt comes on over
 * it, so that the two cross and the screen is never blank between them.
 */
export function onScreen(screen: BlockOwner | 'never', p: number, blocks: readonly TerminalBlock[]): number {
  if (showingOf(screen).length === 0) return 0;
  const off = goesOff(screen, blocks);
  return progress(p, comesOn(screen, blocks)) * (1 - (off === null ? 0 : progress(p, off)));
}

function screenStops(screen: BlockOwner | 'never', blocks: readonly TerminalBlock[]): number[] {
  const off = goesOff(screen, blocks);
  const on = comesOn(screen, blocks);
  return [...on, ...(off === null ? [] : through(off, 2))];
}

/** Where the receipt is: 0 still in the laptop, 1 on the desk, 2 forward in front of the laptop. */
export function receiptPose(p: number): { out: number; forward: number } {
  const out = smooth(progress(p, within('bill', BEATS.receipt)));
  const forward = smooth(progress(p, within('sources', BEATS.forward))) * (1 - smooth(progress(p, within('sources', BEATS.back))));
  return { out, forward };
}

/** Every keyframe set the story uses, by the element that uses it, and the stretch of the story each runs over. */
export function storyMotion(blocks: readonly TerminalBlock[], receiptLines: number, narrow?: readonly TerminalBlock[]): string {
  return motionOf(blocks, receiptLines, narrow).css;
}

/** The prefix of the narrow screen's own keyframes: its lines and bars are not the wide screen's. */
export const NARROW_PREFIX = 'n-';

/**
 * The keyframes, and the stretch each runs over. `narrow`, when given, is the
 * same commands as the narrow screen shows them (`TERMINAL_NARROW`): its lines
 * print over the same stretch as the wide screen's, a line at a time, under
 * names of their own.
 */
export function motionOf(
  blocks: readonly TerminalBlock[],
  receiptLines: number,
  narrow?: readonly TerminalBlock[],
): { css: string; spans: ReadonlyMap<string, Span> } {
  const spans = new Map<string, Span>();
  const rules: string[] = [];
  const keyframes = (name: string, stops: readonly number[], at: (p: number) => Frame, timing?: (p: number) => string | null) => frames(spans, name, stops, at, timing);
  const rise = (name: string, range: Range, distance: string, ease: (t: number) => number = smooth, extra?: (e: number) => Frame) => rising(spans, name, range, distance, ease, extra);
  const arrival = (beat: Range) => within('arrival', beat);

  /*
   * Shown from the top down to the last line printed, a line at a time, and whole once the last has printed;
   * the screen scrolls up as a terminal does once that is taller than it. Measured from the top, so a line a
   * narrow screen wraps onto two never shows a line early. Each stop holds until the next (`steps(1, end)`).
   * Then each share bar fills once its row has printed.
   */
  const printed = (owner: BlockOwner, source: readonly TerminalBlock[], prefix: string) => {
    const { prompt, lines } = timeOutput(owner, source);
    const own = source.filter((block) => block.cap === owner);
    const total = 1 + lines.length;
    const shownAt = (p: number) => (p >= prompt - 1e-5 ? 1 : 0) + lines.filter((line) => p >= line.at - 1e-5).length;
    rules.push(
      keyframes(
        `st-print-${prefix}${owner}`,
        [prompt - 0.0005, prompt, ...lines.map((line) => line.at)],
        (p) => {
          const shown = shownAt(p);
          if (shown >= total) return { 'clip-path': 'inset(0 0 0% 0)', transform: 'translateY(min(0px, calc(var(--rows) - 100%)))' };
          return {
            'clip-path': `inset(0 0 calc(100% - ${shown} * 1.5em) 0)`,
            transform: `translateY(min(0px, calc(var(--rows) - ${shown} * 1.5em)))`,
          };
        },
        () => 'steps(1, end)',
      ),
    );
    let at = 0;
    for (const block of own) {
      at += block.command.split('\n').length;
      block.lines.forEach((runs, j) => {
        const line = lines[at + j - 1];
        if (line === undefined || !runs.some(([text, style]) => style.includes('a') && /^█+$/.test(text))) return;
        const fill: Range = [line.at + 0.002, line.at + 0.012];
        rules.push(keyframes(`st-bar-${prefix}${block.id}-${j}`, through(fill, 2), (p) => ({ 'clip-path': `inset(0 calc(${n(1 - progress(p, fill))} * 100%) 0 0)` })));
      });
      at += block.lines.length;
    }
  };

  // The laptop comes down onto the floor and lands.
  rules.push(
    keyframes('st-laptop', through(arrival(BEATS.land), 12), (p) => {
      const e = smoother(progress(p, arrival(BEATS.land)));
      return { transform: `translateY(calc(${n(1 - e)} * var(--rise-laptop))) scale(${n(0.96 + 0.04 * e)})` };
    }),
  );

  // Each object arrives on the desk a little after the one before it; then, in its chapter, lifts and turns pressed.
  OBJECTS.forEach((object, index) => {
    rules.push(rise(`st-obj-${index}`, objectArrival(index, OBJECT_COUNT), '--rise-obj'));
    const stops = liftStops(object);
    rules.push(
      keyframes(`st-lift-${object}`, stops, (p) => {
        const e = lifted(object, p);
        return { transform: `translate3d(${n(-3 * e)}px, ${n(-4 * e)}px, ${n(16 * e)}px)` };
      }),
    );
    rules.push(keyframes(`st-skin-${object}`, stops, (p) => ({ opacity: n(lifted(object, p)) })));
  });

  // The screen: each owner's output on from its prompt and off as the next one's prompt comes on over it; typed, then printed.
  const owners = [...new Set(blocks.map((block) => block.cap))];
  for (const owner of owners) {
    rules.push(keyframes(`st-out-${owner}`, screenStops(owner, blocks), (p) => ({ opacity: n(onScreen(owner, p, blocks)) })));
    const { prompt, typed } = timeOutput(owner, blocks);
    const first = blocks.filter((block) => block.cap === owner)[0].command.split('\n')[0];
    const chars = first.length;
    const [c0, c1] = typed;
    const typing = (p: number) => (Math.abs(p - c0) < 1e-6 ? `steps(${chars}, end)` : null);
    rules.push(keyframes(`st-type-${owner}`, [c0, c1], (p) => ({ 'clip-path': `inset(0 calc(${p >= c1 ? 0 : chars} * 1ch) 0 0)` }), typing));
    rules.push(
      keyframes(
        `st-cursor-${owner}`,
        [prompt, prompt + 0.0015, c0, c1, c1 + 0.004, c1 + 0.0055],
        (p) => ({
          transform: `translateX(calc(${p >= c1 ? chars : 0} * 1ch))`,
          opacity: n(progress(p, [prompt, prompt + 0.0015]) * (1 - progress(p, [c1 + 0.004, c1 + 0.0055]))),
        }),
        typing,
      ),
    );
    printed(owner, blocks, '');
    if (narrow !== undefined) printed(owner, narrow, NARROW_PREFIX);
  }

  // What never leaves: on the screen in its chapter, a line at a time, and still there as the lid closes over it.
  rules.push(keyframes('st-out-never', screenStops('never', blocks), (p) => ({ opacity: n(onScreen('never', p, blocks)) })));
  const never = within('never', BEATS.never);
  for (let k = 0; k < 5; k += 1) {
    const range = staggered(never, k, 5, 0.25);
    rules.push(keyframes(`st-never-${k}`, through(range, 4), (p) => ({ opacity: n(smooth(progress(p, range))) })));
  }

  // The receipt: hidden in the laptop until it prints, then out of its side and onto the desk; forward in front of
  // the laptop, upright and nearer; and back. The poses are custom properties of the desk, so a phone, which has no
  // room for it on the desk, keeps it in the laptop until it comes forward. While it prints, what of it is still
  // inside the laptop is cut away at the laptop's side (`--receipt-from-x` is the slot's own width and a gap to the
  // left, and the slot rests 0.7 of a gap right of the laptop): it never lies over the screen while text is on it.
  const [r0] = within('bill', BEATS.receipt);
  const poseStops = [r0 - 0.001, ...through(within('bill', BEATS.receipt), 10), ...through(within('sources', BEATS.forward), 10), ...through(within('sources', BEATS.back), 10)];
  rules.push(
    keyframes('st-receipt', poseStops, (p) => {
      const { out, forward } = receiptPose(p);
      const x = `calc(${n(1 - out)} * var(--receipt-from-x) + ${n(forward)} * var(--receipt-fwd-x))`;
      const y = `calc(${n(1 - out)} * var(--receipt-from-y) + ${n(forward)} * var(--receipt-fwd-y))`;
      const shown = p >= r0 ? `calc(${n(1 - forward)} * var(--receipt-rest) + ${n(forward)})` : '0';
      const inside = `max(-24px, calc(${n(1 - out)} * (100% + var(--gap)) - 0.7 * var(--gap)))`;
      return { transform: `translate(${x}, ${y})`, opacity: shown, 'clip-path': `inset(-80px -400% -80px ${inside})` };
    }),
  );
  rules.push(
    keyframes('st-receipt-face', [...through(within('sources', BEATS.forward), 10), ...through(within('sources', BEATS.back), 10)], (p) => {
      const { forward } = receiptPose(p);
      const back = 1 - forward;
      return {
        transform: `perspective(900px) rotateX(calc(${n(back)} * var(--tilt))) rotate(${n(2 * back)}deg) scale(calc(1 + ${n(forward)} * (var(--receipt-fwd-scale) - 1)))`,
      };
    }),
  );
  // A note from each line, with a leader rule, of the page its rate was read from and the date: each shown whole,
  // one after another, and gone as the receipt goes back.
  const notes = within('sources', BEATS.notes);
  const gone = within('sources', [BEATS.back[0] - 0.06, BEATS.back[0]]);
  for (let k = 0; k < receiptLines; k += 1) {
    const draw = staggered(notes, k, receiptLines, NOTE_DRAW);
    rules.push(
      keyframes(`st-note-${k}`, [...through(draw, 6), ...through(gone, 2)], (p) => {
        const e = smooth(progress(p, draw));
        return { transform: `translateX(${n(-8 * (1 - e))}px)`, opacity: n(e * (1 - progress(p, gone))) };
      }),
    );
  }

  // The lid closes over what never leaves, about its hinge; the screen's light goes out and the lid's shade falls on the deck.
  const lid = within('close', BEATS.lid);
  rules.push(keyframes('st-lid', through(lid, 14), (p) => ({ transform: `rotateX(${n(LID_CLOSED * smooth(progress(p, lid)))}deg)` })));
  const dark: Range = [lid[0] + (lid[1] - lid[0]) * 0.55, lid[1]];
  rules.push(keyframes('st-screen-off', through(dark, 4), (p) => ({ opacity: n(0.92 * progress(p, dark)) })));
  rules.push(
    keyframes('st-deck-shade', through(lid, 6), (p) => {
      const e = smooth(progress(p, lid));
      return { transform: `scaleY(${n(e)})`, opacity: n(0.18 * e) };
    }),
  );

  return { css: rules.join('\n'), spans };
}
