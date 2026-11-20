import type { BlockOwner, TerminalBlock } from './landing-terminal';

/**
 * When each thing in the landing's story happens, as a fraction of the
 * story's scroll: 0 as the hero scrolls out and the desk begins to arrive, 1
 * when the stage lets go.
 *
 * The story is told once, in chapters, while one stage stays pinned: the desk
 * with its one laptop. The chapters' words scroll past beside it (under it, on
 * a phone), and each chapter changes the stage: the desk arrives; `bill`
 * prints and the receipt comes out of the laptop's side; each object takes
 * its turn, lifts and puts its command's output on the screen; the receipt
 * comes forward with each rate's page and date; a model with no published
 * price is named and kept out; what never leaves the machine goes on the
 * screen; the lid closes over it. Nothing runs on a clock: the scroll position
 * is the story's only time, so scrolling back walks it back, and nothing is
 * shown twice.
 *
 * ## Where a chapter is
 *
 * Each chapter's words sit in a slot of the column, `height` tall in `svh`,
 * one after another, so the column is as tall as the story. A chapter is
 * current while its slot's top is above the middle of the window (`LINE`) and
 * the next one's is not. The story begins `LEAD` before the column's top
 * reaches the top of the window, while the hero is still scrolling out, and
 * ends when the column's foot reaches the window's: `animation-range: entry
 * 50% contain 100%` on the section, the same line in the fallback script.
 * So a chapter's window, as a fraction of the story, is arithmetic on these
 * heights, and the page sets each slot's height from them: the words and the
 * stage cannot drift apart.
 *
 * This file only says where on that line each moment sits, and it says it
 * once: `story-motion.ts` writes the keyframes from it, `Story.tsx` sizes the
 * slots and reads the current chapter from it, and the tests read the same
 * numbers.
 */

export type Range = readonly [start: number, end: number];

/** The objects on the desk, in the order they lie: the six that run a command, and the lid. */
export type ObjectId = 'bill' | 'check' | 'guard' | 'clock' | 'optimize' | 'models' | 'lid';

/** What the screen shows during a chapter: a block's output, what never leaves, or nothing yet. */
export type ScreenId = BlockOwner | 'never' | null;

export interface Chapter {
  readonly id: string;
  /** The object that takes its turn: lifted and pressed while the chapter is current. */
  readonly object: ObjectId | null;
  /** What the screen shows once the chapter has begun. */
  readonly screen: ScreenId;
  /** The slot's height in the column, in `svh`: how much scroll the chapter lasts. */
  readonly height: number;
}

/**
 * The chapters, in order. Each object takes its turn once, in the order the
 * objects lie, and the lid last; the receipt's chapter is the bill's.
 */
export const CHAPTERS = [
  { id: 'arrival', object: null, screen: null, height: 60 },
  { id: 'bill', object: 'bill', screen: 'bill', height: 140 },
  { id: 'check', object: 'check', screen: 'check', height: 100 },
  { id: 'guard', object: 'guard', screen: 'guard', height: 110 },
  { id: 'clock', object: 'clock', screen: 'clock', height: 110 },
  { id: 'optimize', object: 'optimize', screen: 'optimize', height: 120 },
  { id: 'models', object: 'models', screen: 'models', height: 100 },
  { id: 'sources', object: null, screen: null, height: 130 },
  { id: 'unpriced', object: null, screen: 'unpriced', height: 110 },
  { id: 'never', object: null, screen: 'never', height: 90 },
  { id: 'close', object: 'lid', screen: 'never', height: 120 },
] as const satisfies readonly Chapter[];

export type ChapterId = (typeof CHAPTERS)[number]['id'];

/** How far before the column's top reaches the window's top the story begins, in `svh`: half a window, as the hero scrolls out. */
export const LEAD = 50;
/** The line a slot's top crosses to make its chapter current, in `svh` from the top of the window. */
export const LINE = 50;

/** The column's height, in `svh`: the story's. */
export const STORY_HEIGHT = CHAPTERS.reduce((sum, chapter) => sum + chapter.height, 0);

/** A scroll position, in `svh` past the column's top reaching the window's top, as a fraction of the story. */
export function fraction(s: number): number {
  return (s + LEAD) / (STORY_HEIGHT - 100 + LEAD);
}

/** Where each slot starts in the column, in `svh`. */
const TOPS = CHAPTERS.map((_, index) => CHAPTERS.slice(0, index).reduce((sum, chapter) => sum + chapter.height, 0));

/** The stretch of the story during which a chapter is current. The last runs to the end. */
export function chapterWindow(id: ChapterId): Range {
  const index = CHAPTERS.findIndex((chapter) => chapter.id === id);
  if (index === -1) throw new Error(`no chapter ${id}`);
  const start = fraction(TOPS[index] - LINE);
  const end = index === CHAPTERS.length - 1 ? 1 : fraction(TOPS[index + 1] - LINE);
  return [start, end];
}

/** A stretch inside a chapter's window, given as fractions of that window. */
export function within(id: ChapterId, [from, to]: Range): Range {
  const [start, end] = chapterWindow(id);
  return [start + (end - start) * from, start + (end - start) * to];
}

/** The chapter current at a point of the story. */
export function chapterAt(p: number): ChapterId {
  let current: ChapterId = CHAPTERS[0].id;
  for (const chapter of CHAPTERS) if (p >= chapterWindow(chapter.id)[0] - 1e-9) current = chapter.id;
  return current;
}

/**
 * Inside a chapter, as fractions of its window. The arrival's layers come in
 * over overlapping stretches, each at its own rate, so the desk, the laptop
 * and the objects move past each other, and the laptop lands as the arrival
 * ends; every other chapter lifts its object and, at once, types its command
 * over what the chapter before it left on the screen, which gives way to it
 * (`CROSSFADE`): the screen is never left blank between two outputs. Each
 * chapter settles its object as it ends, so at the line between two chapters
 * nothing is lifted.
 */
export const BEATS = {
  /** The laptop comes down onto the desk and lands, as the arrival ends: the bill is typed as soon as it has. */
  land: [0, 0.92],
  /** The objects arrive on the desk, each a little after the one before it. */
  objects: [0.1, 1],
  /** The chapter's object lifts off the desk and turns pressed... */
  lift: [0.02, 0.14],
  /** ...and settles back as the chapter ends, so that at the line between two chapters nothing is lifted. */
  settle: [0.9, 1],
  /** The command's prompt is on the screen, as the chapter begins... */
  prompt: [0.015, 0.02],
  /** ...it is typed a character at a time... */
  type: [0.025, 0.11],
  /** ...and its output prints a line at a time. */
  print: [0.13, 0.55],
  /** The receipt prints out of the laptop's side and comes to rest on the desk (the bill's chapter). */
  receipt: [0.62, 0.92],
  /** The receipt comes forward, off the desk and upright, in front of the laptop (the sources' chapter). */
  forward: [0.04, 0.22],
  /** A note from each of its lines of the page the rate was read from and the date, one after another, each whole. */
  notes: [0.24, 0.56],
  /** The notes go, and the receipt goes back to the desk as the chapter ends: it is never over the screen's text after it... */
  back: [0.86, 0.98],
  /** ...and the example's command runs at once in the next chapter (the unpriced model's). */
  run: [0.02, 0.6],
  /** What never leaves goes on the screen a line at a time. */
  never: [0.04, 0.3],
  /** The lid closes over it, about its hinge. */
  lid: [0.14, 0.72],
} as const satisfies Record<string, Range>;

/**
 * How long, as a fraction of the story, the output on the screen takes to
 * give way to the next one's prompt: they cross, and the screen is never
 * blank between them.
 */
export const CROSSFADE = 0.004;

/**
 * How much of `BEATS.objects` each object takes to arrive; the rest is how far behind the one before it each starts.
 * Most of it, so the row comes up nearly as one: at 0.3 a recording at 1788x1176 (2026-11-20) showed the seven
 * strung out down a diagonal, which read as a broken staircase, not as layers.
 */
export const OBJECT_ARRIVAL = 0.9;
/** How much of `BEATS.notes` each line's leader takes. */
export const NOTE_DRAW = 0.4;

/** The chapter that runs a block on the screen, by the block's owner. */
export function chapterOf(owner: BlockOwner): ChapterId {
  const chapter = CHAPTERS.find((candidate) => candidate.screen === owner);
  if (chapter === undefined) throw new Error(`no chapter shows ${owner}`);
  return chapter.id;
}

export interface TimedLine {
  /** When it appears. */
  readonly at: number;
}

export interface TimedOutput {
  readonly owner: BlockOwner;
  /** When the prompt of its first command is on the screen. */
  readonly prompt: number;
  /** The first command's first line, typed a character at a time. */
  readonly typed: Range;
  /** Every line after it, commands and output alike, in order: the moment each appears. */
  readonly lines: readonly TimedLine[];
}

/**
 * An owner's output with the moment each of its lines appears: its first
 * command typed, then everything after it a line at a time, evenly across the
 * chapter's printing. A later command in the same chapter (`echo $?`) prints
 * as a line: only the first is typed.
 */
export function timeOutput(owner: BlockOwner, blocks: readonly TerminalBlock[]): TimedOutput {
  const chapter = chapterOf(owner);
  const own = blocks.filter((block) => block.cap === owner);
  if (own.length === 0) throw new Error(`the transcript has no output for ${owner}`);
  const count = own.reduce((sum, block) => sum + block.command.split('\n').length + block.lines.length, 0) - 1;
  const [start, end] = within(chapter, owner === 'unpriced' ? [BEATS.run[0] + 0.05, BEATS.run[1]] : BEATS.print);
  const typed = owner === 'unpriced' ? within(chapter, [BEATS.run[0] + 0.01, BEATS.run[0] + 0.045]) : within(chapter, BEATS.type);
  const prompt = owner === 'unpriced' ? within(chapter, [BEATS.run[0], BEATS.run[0]])[0] : within(chapter, BEATS.prompt)[0];
  return {
    owner,
    prompt,
    typed,
    lines: Array.from({ length: count }, (_, j) => ({ at: start + ((end - start) * j) / Math.max(1, count) })),
  };
}

/** How far through a range the story is, from 0 to 1. */
export function progress(p: number, [start, end]: Range): number {
  if (end <= start) return p >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

/** A stagger: the `index`th of `count` items over `range`, each taking `share` of it. */
export function staggered(range: Range, index: number, count: number, share: number): Range {
  const [start, end] = range;
  const span = (end - start) * share;
  const lead = count > 1 ? ((end - start - span) * index) / (count - 1) : 0;
  return [start + lead, start + lead + span];
}

/** When the object at `index` (of `count`) arrives: staggered across the arrival's `BEATS.objects`. */
export function objectArrival(index: number, count: number): Range {
  return staggered(within('arrival', BEATS.objects), index, count, OBJECT_ARRIVAL);
}
