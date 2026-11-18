import type { TerminalBlock } from './landing-terminal';

/**
 * When each thing in the landing's story happens, as a fraction of the
 * story's scroll.
 *
 * The story is one number, `--p`, from 0 when the stage pins to 1 when it
 * lets go. Everything that moves is a function of it, written in the
 * stylesheet, so scrolling back plays the story back and nothing runs on a
 * clock. This file only says where on that line each moment sits, and it
 * says it once: the stylesheet reads the phases through the custom
 * properties `Story.tsx` writes from here, and the tests read the same
 * numbers.
 *
 * The arc: the laptop arrives, the camera pushes into its screen until the
 * terminal fills the window, three commands run inside it, the camera pulls
 * back out, and the lid closes over what never leaves the machine.
 */

export type Range = readonly [start: number, end: number];

export const PHASES = {
  /** The laptop rises into place and grows to its resting size. */
  approach: [0, 0.04],
  /** The camera pushes in until the screen is the width of the window. */
  dive: [0.04, 0.14],
  /** The screen opens to the whole window. */
  expand: [0.14, 0.17],
  /** And back: the window narrows to the screen... */
  unexpand: [0.76, 0.79],
  /** ...and the camera pulls out to the whole laptop. */
  undive: [0.79, 0.86],
  /** The device moves aside for the last scene's words. */
  aside: [0.8, 0.86],
  /** The terminal clears. */
  clear: [0.85, 0.87],
  /** What never leaves settles onto the screen. */
  settle: [0.86, 0.9],
  /** The lid closes over it. */
  close: [0.9, 0.97],
  /** What does leave comes out beside the closed machine. */
  leaves: [0.95, 0.99],
} as const satisfies Record<string, Range>;

/** The four scenes, and the stretch of scroll in which each one is the subject. */
export const SCENES = [
  { id: 'bill', range: [0.12, 0.36] },
  { id: 'check', range: [0.36, 0.55] },
  { id: 'trim', range: [0.55, 0.78] },
  { id: 'never', range: [0.8, 1] },
] as const satisfies readonly { id: string; range: Range }[];

export type SceneId = (typeof SCENES)[number]['id'];

/**
 * Each command: when it is typed, and when its output prints. Output prints a
 * line at a time at an even rate across its range, the way a long report
 * arrives on a real terminal; a command is typed a character at a time.
 */
export const RUNS: Readonly<Record<TerminalBlock['id'], { type: Range; print: Range }>> = {
  bill: { type: [0.02, 0.09], print: [0.17, 0.33] },
  check: { type: [0.37, 0.41], print: [0.41, 0.47] },
  status: { type: [0.5, 0.515], print: [0.52, 0.525] },
  optimize: { type: [0.56, 0.6], print: [0.6, 0.745] },
};

/** How long before its typing starts a command's prompt is already on the screen. */
export const PROMPT_LEAD = 0.03;

/** Which scene a command belongs to. */
export const SCENE_OF: Readonly<Record<TerminalBlock['id'], Exclude<SceneId, 'never'>>> = {
  bill: 'bill',
  check: 'check',
  status: 'check',
  optimize: 'trim',
};

export interface TimedLine {
  /** Index on the whole screen, counting each command's own line. */
  readonly index: number;
  /** When it appears. */
  readonly at: number;
}

export interface TimedBlock {
  readonly block: TerminalBlock;
  readonly command: TimedLine & { readonly typed: Range };
  readonly lines: readonly TimedLine[];
}

/** Every line on the screen with the moment it appears. */
export function timeLines(blocks: readonly TerminalBlock[]): TimedBlock[] {
  let index = 0;
  return blocks.map((block) => {
    const { type, print } = RUNS[block.id];
    const command = { index: index++, at: type[0] - PROMPT_LEAD, typed: type };
    const n = block.lines.length;
    const lines = block.lines.map((_, j) => ({
      index: index++,
      at: print[0] + ((print[1] - print[0]) * j) / Math.max(1, n),
    }));
    return { block, command, lines };
  });
}

/** How far through a range the story is, from 0 to 1. */
export function progress(p: number, [start, end]: Range): number {
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

/**
 * How many lines the screen holds at a given moment: over every command, its
 * own line arriving just before typing starts and its output arriving at an
 * even rate across its range. The terminal scrolls by the part of that which
 * no longer fits, so scrolling is as continuous as the scroll that drives
 * it, in either direction.
 */
export function lineCount(blocks: readonly TerminalBlock[], p: number): number {
  return blocks.reduce((sum, block) => {
    const { type, print } = RUNS[block.id];
    return sum + progress(p, [type[0] - PROMPT_LEAD, type[0] - PROMPT_LEAD + 0.004]) + block.lines.length * progress(p, print);
  }, 0);
}
