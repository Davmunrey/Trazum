import type { TerminalBlock } from './landing-terminal';
import { PHASES, PROMPT_LEAD, RUNS, SCENES, SCENE_OF, lineCount, progress, timeLines, type Range } from './story-timeline';

/**
 * The landing story's motion, as CSS keyframes of `transform`, `opacity` and
 * `clip-path`, one set per moving element, written from the timeline.
 *
 * ## Why keyframes, and why written here
 *
 * The first version computed every position in the stylesheet from one
 * custom property, `--p`, animated by the scroll. It read well and cost a
 * great deal: measured at 4x CPU throttle, every frame recomputed the style
 * of about 460 elements (each line and run of the terminal, each key of the
 * keyboard), 50 to 180 ms a frame, because a changing custom property makes
 * the browser restyle what lies beneath it, inherited or not. Animating the
 * properties themselves restyles only the element that moves, and lets the
 * browser hand a transform or an opacity to the compositor.
 *
 * So each moving element gets keyframes over the whole story (0% when the
 * stage pins, 100% when it lets go), sampled through each eased phase finely
 * enough that the straight lines between samples follow the curve. The
 * geometry stays in the stylesheet as custom properties of the stage, which
 * never change while scrolling (`var(--cy)`, `var(--lam)` and so on), so one
 * set of keyframes serves the desktop and the phone.
 *
 * The same keyframes run two ways: on the section's scroll timeline where the
 * browser has one, and, where it has not, paused, with `Story.tsx` setting
 * each element's `animation-delay` to the scroll position. Either way, the
 * scroll position is the only clock.
 */

/** The lid's angle, closed: onto the deck, which lies at `DECK_ANGLE`, short of touching it by a degree. */
export const DECK_ANGLE = 76;
export const LID_CLOSED = -(180 - DECK_ANGLE - 1);

const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const n = (value: number) => Number(value.toFixed(5)).toString();

/** The eased phases at a point of the story. */
export function phasesAt(p: number) {
  const A = smooth(progress(p, PHASES.approach));
  const D = smoother(progress(p, PHASES.dive)) * (1 - smoother(progress(p, PHASES.undive)));
  const X = smooth(progress(p, PHASES.expand)) * (1 - smooth(progress(p, PHASES.unexpand)));
  const S = smooth(progress(p, PHASES.aside));
  const CL = progress(p, PHASES.clear);
  const T = progress(p, PHASES.settle);
  const C = smooth(progress(p, PHASES.close));
  const V = smooth(progress(p, PHASES.leaves));
  return { A, D, X, S, CL, T, C, V };
}

/** Points through a range: its two ends and `count` between. */
function through([start, end]: Range, count: number): number[] {
  return Array.from({ length: count + 2 }, (_, i) => start + ((end - start) * i) / (count + 1));
}

/** The moments at which the camera's eased phases are sampled. */
const CAMERA_STOPS = [
  ...through(PHASES.approach, 6),
  ...through(PHASES.dive, 14),
  ...through(PHASES.expand, 5),
  ...through(PHASES.unexpand, 5),
  ...through(PHASES.undive, 12),
  ...through(PHASES.aside, 6),
  ...through(PHASES.clear, 2),
  ...through(PHASES.close, 10),
];

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

function cameraTransform(p: number, layer: boolean): string {
  const { A, D, X, S, C } = phasesAt(p);
  const k0 = 0.9 + 0.1 * A;
  const zoom = `${n(k0)} * (1 + (1 / var(--lam) - 1) * ${n(D)}) * ${n(1 - 0.24 * S)}`;
  const y = `${n(1 - A)} * (4cqh - var(--top)) + ${n(D)} * (50cqh - var(--cy)) + ${n(S)} * var(--aside-y) - ${n(C)} * var(--close-y)`;
  const x = `${n(S)} * var(--aside-x)`;
  return layer
    ? `translate(calc(${x}), calc(var(--cy) - 50cqh + ${y})) scale(calc(${zoom} * var(--lam)))`
    : `translate(calc(${x}), calc(${y})) scale(calc(${zoom} * ${n(1 + 0.32 * X)}))`;
}

/**
 * Where one scene's plate gives way to the next's: the plate going fades over the last 0.015 of its scene and the
 * one coming over the first 0.015 of its own (`windowed` below).
 */
const SWAP_AT = [SCENES[1].range[0], SCENES[2].range[0]] as const;
const SWAP = 0.015;

/**
 * The top of the free part of the scene that is showing, as a CSS length, from each scene's (`--ft-<scene>`, which
 * the stylesheet sets). Across a swap it moves from one scene's top to the next's while only the plate it moves away
 * from is up: down to a lower top while the plate going fades (the one coming is not up yet), up to a higher one while
 * the plate coming fades in (the one going is gone). Either way it is the larger of the two paths, so no line of
 * output is ever under a plate that is up at all.
 */
export function freeTop(p: number): string {
  const path = (shift: number) => {
    const toCheck = progress(p, [SWAP_AT[0] - SWAP + shift, SWAP_AT[0] + shift]);
    const toTrim = progress(p, [SWAP_AT[1] - SWAP + shift, SWAP_AT[1] + shift]);
    const w = { bill: 1 - toCheck, check: toCheck - toTrim, trim: toTrim };
    // Only the scenes that count: outside a swap that is one, and the length is that scene's top as it stands.
    const terms = (['bill', 'check', 'trim'] as const).filter((scene) => w[scene] > 1e-6);
    return terms.length === 1 ? `var(--ft-${terms[0]})` : terms.map((scene) => `${n(w[scene])} * var(--ft-${scene})`).join(' + ');
  };
  const [a, b] = [path(0), path(SWAP)];
  return a === b ? a : `max(${a}, ${b})`;
}

/** A window of the story in which something is shown, with short ramps at either end. */
function windowed(p: number, [start, end]: Range, ramp: number, stays = false): number {
  const rise = progress(p, [start, start + ramp]);
  return stays ? rise : rise * (1 - progress(p, [end - ramp, end]));
}

/** Every keyframe set the story uses, by the element that uses it. */
export function storyMotion(blocks: readonly TerminalBlock[]): string {
  const rules: string[] = [];

  rules.push(keyframes('st-camera', CAMERA_STOPS, (p) => ({ transform: cameraTransform(p, false) })));
  rules.push(
    keyframes('st-layer', CAMERA_STOPS, (p) => {
      const { X, CL } = phasesAt(p);
      return {
        transform: cameraTransform(p, true),
        'clip-path': `inset(calc((100cqh - var(--shownH)) / 2 * ${n(1 - X)}) calc((100cqw - var(--shown)) / 2 * ${n(1 - X)}))`,
        opacity: n(1 - CL),
      };
    }),
  );

  // The terminal: each block of output prints a line at a time and the column scrolls by what no longer fits.
  const timed = timeLines(blocks);
  const scenes = ['bill', 'check', 'trim'] as const;
  const breaks = [...through(PHASES.dive, 10), ...through(PHASES.expand, 4), ...through(PHASES.unexpand, 4), ...through(PHASES.undive, 10)];
  for (const block of blocks) {
    const { type, print } = RUNS[block.id];
    breaks.push(type[0] - PROMPT_LEAD, type[0] - PROMPT_LEAD + 0.004, ...through(print, 12));
  }
  for (const at of SWAP_AT) breaks.push(...through([at - SWAP, at + SWAP], 5));
  for (const scene of scenes) {
    const mine = timed.filter(({ block }) => SCENE_OF[block.id] === scene);
    const first = mine[0]?.command.index ?? 0;
    const count = mine.reduce((sum, { lines }) => sum + 1 + lines.length, 0);
    rules.push(
      keyframes(`st-term-${scene}`, breaks, (p) => {
        const { D, X } = phasesAt(p);
        // The free part: from the showing scene's top (`freeTop`) to its foot (`--fb`), which is the same in every scene.
        const top = `(${freeTop(p)})`;
        // The middle the column stands on: the laptop's screen while the camera is outside it, the free part's once the screen is the window.
        const free = `(${top} + var(--fb)) / 2`;
        const middle = X >= 1 ? `(${free})` : X <= 0 ? '50cqh' : `(${n(1 - X)} * 50cqh + ${n(X)} * ${free})`;
        // How many lines' height the free part holds.
        const room = `(var(--fb) - ${top})`;
        const lines = lineCount(blocks, p);
        const shown = Math.min(count, Math.max(0, lines - first));
        // Centred on the free part's middle while the lines fit; once they fill it, scrolled by what does not fit.
        const rise = `${middle} - var(--tb-top) - min(${n(lines)} * var(--lh), ${room}) / 2 - max(0px, ${n(lines)} * var(--lh) - ${room})`;
        return {
          transform: `translate(calc(var(--rest-x) * ${n(1 - D)}), calc(${rise}))`,
          'clip-path': `inset(0 -50% calc(${n(count - shown)} * 1.5em) -50%)`,
        };
      }),
    );
  }
  /*
   * What has scrolled past the free part's top is gone: a sheet of the terminal's ground over the column, its foot at
   * that top, under the plates. It moves by a transform alone. Measured for #770 at 1440x900 and 4x CPU throttle:
   * the same cut made by the blocks' own clip, its top reading the stylesheet's lengths, cost 32 to 36 tasks over
   * 50 ms (up to 270 ms) scrolling past the story; with this sheet, none in three scrolls of the whole page.
   */
  rules.push(keyframes('st-term-cut', breaks, (p) => ({ transform: `translateY(calc(${freeTop(p)} - 100cqh))` })));

  // Each command typed a character at a time, its cursor ahead of it; each share bar filling once its row prints.
  timed.forEach(({ block, command, lines }, index) => {
    const [c0, c1] = command.typed;
    const chars = block.command.length;
    const typing = (p: number) => (Math.abs(p - c0) < 1e-6 ? `steps(${chars}, end)` : null);
    rules.push(keyframes(`st-type-${index}`, [c0, c1], (p) => ({ 'clip-path': `inset(0 calc(${p >= c1 ? 0 : chars} * 1ch) 0 0)` }), typing));
    rules.push(
      keyframes(
        `st-cursor-${index}`,
        [command.at, command.at + 0.0025, c0, c1, c1 + 0.025, c1 + 0.0275],
        (p) => ({
          transform: `translateX(calc(${p >= c1 ? chars : 0} * 1ch))`,
          opacity: n(progress(p, [command.at, command.at + 0.0025]) * (1 - progress(p, [c1 + 0.025, c1 + 0.0275]))),
        }),
        typing,
      ),
    );
    block.lines.forEach((runs, j) => {
      const bar = runs.findIndex(([text, style]) => style.includes('a') && /^█+$/.test(text));
      if (bar === -1) return;
      const at = lines[j]?.at ?? 0;
      rules.push(
        keyframes(`st-bar-${index}-${j}`, [at + 0.004, at + 0.034], (p) => ({
          'clip-path': `inset(0 calc(${n(1 - progress(p, [at + 0.004, at + 0.034]))} * 100%) 0 0)`,
        })),
      );
    });
  });

  // The words: each scene's plate on the screen while it is the subject, the last scene's beside the device.
  for (const scene of SCENES) {
    const stays = scene.id === 'never';
    // The last scene's words wait until the device has moved aside, so it never slides over them.
    const settled: Range = [PHASES.aside[1] - 0.015, PHASES.aside[1] + 0.025];
    const on = (p: number) => (stays ? smooth(progress(p, settled)) : windowed(p, scene.range, 0.015));
    const stops = stays ? through(settled, 6) : [scene.range[0], scene.range[0] + 0.015, scene.range[1] - 0.015, scene.range[1]];
    rules.push(
      keyframes(`st-words-${scene.id}`, stops, (p) => ({
        opacity: n(on(p)),
        transform: `translateY(calc(var(--words-y) + ${n(1 - on(p))} * var(--words-rise, 24px)))`,
      })),
    );
    // The marker: each scene's bar fills while it plays, and its name shows.
    rules.push(keyframes(`st-mark-${scene.id}`, [scene.range[0], scene.range[1]], (p) => ({ transform: `scaleX(${n(progress(p, scene.range))})` })));
    const label = (p: number) => windowed(p, scene.range, 0.005, stays);
    rules.push(keyframes(`st-label-${scene.id}`, [scene.range[0], scene.range[0] + 0.005, scene.range[1] - 0.005, scene.range[1]], (p) => ({ opacity: n(label(p)) })));
  }

  // What never leaves, settling onto the screen one after another.
  for (let i = 0; i < 5; i += 1) {
    const from = PHASES.settle[0] + ((PHASES.settle[1] - PHASES.settle[0]) * (0.3 * i)) / 2.2;
    const to = PHASES.settle[0] + ((PHASES.settle[1] - PHASES.settle[0]) * (1 + 0.3 * i)) / 2.2;
    rules.push(
      keyframes(`st-never-${i}`, through([from, to], 4), (p) => {
        const on = smooth(progress(p, [from, to]));
        return { opacity: n(on), transform: `translateY(calc(${n(1 - on)} * -0.6em))` };
      }),
    );
  }
  const labelEnd = PHASES.settle[0] + (PHASES.settle[1] - PHASES.settle[0]) / 4;
  rules.push(keyframes('st-never-label', [PHASES.settle[0], labelEnd], (p) => ({ opacity: n(progress(p, [PHASES.settle[0], labelEnd])) })));

  // The lid closes about its hinge; the screen's light goes out; its shadow falls across the deck.
  const closing = through(PHASES.close, 12);
  rules.push(keyframes('st-lid', closing, (p) => ({ transform: `rotateX(${n(phasesAt(p).C * LID_CLOSED)}deg)` })));
  rules.push(keyframes('st-screen-off', closing, (p) => ({ opacity: n(phasesAt(p).C * 0.92) })));
  rules.push(
    keyframes('st-shade', closing, (p) => ({ transform: `scaleY(${n(phasesAt(p).C)})`, opacity: n(phasesAt(p).C * 0.18) })),
  );

  // What does leave comes up out of the closed machine.
  rules.push(
    keyframes('st-leaves', through(PHASES.leaves, 6), (p) => {
      const { V } = phasesAt(p);
      return { opacity: n(V), transform: `translateY(calc(${n(1 - V)} * var(--L) * 0.14))` };
    }),
  );

  return rules.join('\n');
}
