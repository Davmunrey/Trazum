import type { TerminalBlock } from './landing-terminal';

/**
 * When each thing in the landing's story happens, as a fraction of the
 * story's scroll: 0 when the stage pins, 1 when it lets go.
 *
 * The story is short and told once: the desk comes up, the laptop lands on
 * it, the objects arrive around it, `bill` runs on its screen and the receipt
 * prints out of its side. Then the stage lets go and the same desk is the one
 * the visitor presses objects on. Nothing here runs on a clock: the scroll
 * position is the story's only time, so scrolling back plays it back.
 *
 * The layers arrive over overlapping stretches, each at its own rate, so the
 * desk, the laptop and the objects move past each other as they come in: the
 * scene has depth because its planes do not move together.
 *
 * This file only says where on that line each moment sits, and it says it
 * once: `story-motion.ts` writes the keyframes from it, and the tests read the
 * same numbers.
 */

export type Range = readonly [start: number, end: number];

export const PHASES = {
  /** The desk rises under where the laptop will stand, and the words above it settle. */
  desk: [0, 0.24],
  /** The laptop comes down onto the desk and lands. */
  land: [0.02, 0.3],
  /** The objects arrive on the desk, each a little after the one before it. */
  objects: [0.06, 0.36],
  /** The plate comes up beside the laptop: the bill's, the object pressed by default. */
  plate: [0.26, 0.34],
  /** `bill` is typed on the screen, a character at a time... */
  type: [0.32, 0.4],
  /** ...and its output prints a line at a time. */
  print: [0.42, 0.66],
  /** The receipt prints out of the laptop's side and comes to rest on the desk. */
  receipt: [0.64, 0.86],
} as const satisfies Record<string, Range>;

/** How much of `PHASES.objects` each object takes to arrive; the rest is how far behind the one before it each starts. */
export const OBJECT_ARRIVAL = 0.2;

/** How long before its typing starts the command's prompt is already on the screen. */
export const PROMPT_LEAD = 0.02;

/** The one command the story runs by scroll: the bill, on the object pressed by default. */
export const STORY_BLOCK: TerminalBlock['id'] = 'bill';

export interface TimedLine {
  /** When it appears. */
  readonly at: number;
}

export interface TimedBlock {
  readonly block: TerminalBlock;
  readonly command: TimedLine & { readonly typed: Range };
  readonly lines: readonly TimedLine[];
}

/** The story's command with the moment each of its lines appears: its prompt, then its output at an even rate across `PHASES.print`. */
export function timeLines(block: TerminalBlock): TimedBlock {
  const [start, end] = PHASES.print;
  const n = block.lines.length;
  return {
    block,
    command: { at: PHASES.type[0] - PROMPT_LEAD, typed: PHASES.type },
    lines: block.lines.map((_, j) => ({ at: start + ((end - start) * j) / Math.max(1, n) })),
  };
}

/** How far through a range the story is, from 0 to 1. */
export function progress(p: number, [start, end]: Range): number {
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

/** When the object at `index` (of `count`) arrives: staggered across `PHASES.objects`, each over `OBJECT_ARRIVAL`. */
export function objectArrival(index: number, count: number): Range {
  const [start, end] = PHASES.objects;
  const lead = count > 1 ? ((end - start - OBJECT_ARRIVAL) * index) / (count - 1) : 0;
  return [start + lead, start + lead + OBJECT_ARRIVAL];
}
