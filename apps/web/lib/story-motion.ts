import type { TerminalBlock } from './landing-terminal';
import { PHASES, STORY_BLOCK, objectArrival, progress, timeLines, type Range } from './story-timeline';

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
 * So each moving element gets keyframes over the whole story (0% when the
 * stage pins, 100% when it lets go), sampled through each eased phase finely
 * enough that the straight lines between samples follow the curve. The
 * distances stay in the stylesheet as custom properties of the desk, which
 * never change while scrolling (`var(--rise-laptop)` and so on), so one set of
 * keyframes serves the desktop and the phone.
 *
 * The same keyframes run two ways: on the section's scroll timeline where the
 * browser has one, and, where it has not, paused, with `Story.tsx` setting
 * each animation's current time to the scroll position. Either way, the
 * scroll position is the only clock.
 *
 * ## The layers
 *
 * The desk, the laptop and each object come in over their own stretch of the
 * scroll and from their own distance, so they pass each other as they arrive
 * and the scene reads as planes at different depths. The desk rises least,
 * the laptop most, the objects in between and one after another. Nothing
 * moves sideways but the receipt, which comes out of the laptop's side.
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

/** One `@keyframes` rule, its stops in order, each stop the values `at(p)` gives. */
function keyframes(name: string, stops: readonly number[], at: (p: number) => Frame, timing?: (p: number) => string | null): string {
  const points = [...new Set([0, 1, ...stops.map((p) => Math.min(1, Math.max(0, p)))].map((p) => Number(p.toFixed(5))))].sort((a, b) => a - b);
  const body = points
    .map((p) => {
      const frame = Object.entries(at(p)).map(([property, value]) => `${property}: ${value};`);
      const easing = timing?.(p);
      if (easing) frame.push(`animation-timing-function: ${easing};`);
      return `  ${n(p * 100)}% { ${frame.join(' ')} }`;
    })
    .join('\n');
  return `@keyframes ${name} {\n${body}\n}`;
}

/** A layer that rises into place over `range`, from `var(<distance>)` below where it rests. */
function rise(name: string, range: Range, distance: string, ease: (t: number) => number = smooth, extra?: (e: number) => Frame): string {
  return keyframes(name, through(range, 10), (p) => {
    const e = ease(progress(p, range));
    return { transform: `translateY(calc(${n(1 - e)} * var(${distance})))`, ...extra?.(e) };
  });
}

/** How many objects lie on the desk: the six that run a command and the lid. */
export const OBJECT_COUNT = 7;

/** Every keyframe set the story uses, by the element that uses it. */
export function storyMotion(blocks: readonly TerminalBlock[]): string {
  const rules: string[] = [];

  // The words over the desk settle a little; the desk comes up under them; the laptop lands on it.
  rules.push(rise('st-head', PHASES.desk, '--rise-head'));
  // The far plane: the bill's total, set huge behind the laptop, moves least of all.
  rules.push(rise('st-figure', PHASES.desk, '--rise-figure'));
  rules.push(rise('st-desk', PHASES.desk, '--rise-desk', smooth, (e) => ({ opacity: n(e) })));
  rules.push(
    keyframes('st-laptop', through(PHASES.land, 12), (p) => {
      const e = smoother(progress(p, PHASES.land));
      return { transform: `translateY(calc(${n(1 - e)} * var(--rise-laptop))) scale(${n(0.92 + 0.08 * e)})` };
    }),
  );

  // Each object arrives on the desk a little after the one before it, at its own rate.
  for (let i = 0; i < OBJECT_COUNT; i += 1) rules.push(rise(`st-obj-${i}`, objectArrival(i, OBJECT_COUNT), '--rise-obj'));

  // The plate beside the laptop.
  rules.push(rise('st-plate', PHASES.plate, '--rise-plate', smooth, (e) => ({ opacity: n(e) })));

  // The bill: typed a character at a time, its cursor ahead of it, then printed a line at a time.
  const block = blocks.find((candidate) => candidate.id === STORY_BLOCK);
  if (block === undefined) throw new Error(`the transcript has no ${STORY_BLOCK} block to run in the story`);
  const { command, lines } = timeLines(block);
  const [c0, c1] = command.typed;
  const chars = block.command.length;
  const typing = (p: number) => (Math.abs(p - c0) < 1e-6 ? `steps(${chars}, end)` : null);
  rules.push(keyframes('st-type', [c0, c1], (p) => ({ 'clip-path': `inset(0 calc(${p >= c1 ? 0 : chars} * 1ch) 0 0)` }), typing));
  rules.push(
    keyframes(
      'st-cursor',
      [command.at, command.at + 0.0025, c0, c1, c1 + 0.02, c1 + 0.0225],
      (p) => ({
        transform: `translateX(calc(${p >= c1 ? chars : 0} * 1ch))`,
        opacity: n(progress(p, [command.at, command.at + 0.0025]) * (1 - progress(p, [c1 + 0.02, c1 + 0.0225]))),
      }),
      typing,
    ),
  );
  // The output: shown from the top down to the last line printed, a line at a time, and whole once the last has
  // printed. Measured from the top, so a line a narrow screen wraps onto two never shows a line early. Each stop
  // holds until the next (`steps(1, end)`).
  const total = block.lines.length;
  // A stop is written to five decimals (`keyframes`), so a line counts from the stop written for it.
  const shownAt = (p: number) => (p >= command.at - 1e-5 ? 1 : 0) + lines.filter((line) => p >= line.at - 1e-5).length;
  rules.push(
    keyframes(
      'st-print',
      [command.at, ...lines.map((line) => line.at)],
      (p) => ({ 'clip-path': shownAt(p) > total ? 'inset(0 0 0% 0)' : `inset(0 0 calc(100% - ${shownAt(p)} * 1.5em) 0)` }),
      () => 'steps(1, end)',
    ),
  );
  // Each share bar fills once its row has printed.
  block.lines.forEach((runs, j) => {
    if (!runs.some(([text, style]) => style.includes('a') && /^█+$/.test(text))) return;
    const at = lines[j]?.at ?? 0;
    const fill: Range = [at + 0.004, at + 0.03];
    rules.push(keyframes(`st-bar-${j}`, through(fill, 2), (p) => ({ 'clip-path': `inset(0 calc(${n(1 - progress(p, fill))} * 100%) 0 0)` })));
  });

  // The receipt: hidden behind the laptop until it starts to print, then out of its side and onto the desk.
  const [r0] = PHASES.receipt;
  rules.push(
    keyframes('st-receipt', [r0 - 0.001, ...through(PHASES.receipt, 10)], (p) => {
      const e = smooth(progress(p, PHASES.receipt));
      return { transform: `translateX(calc(${n(1 - e)} * var(--receipt-from)))`, opacity: p >= r0 ? '1' : '0' };
    }),
  );

  return rules.join('\n');
}
