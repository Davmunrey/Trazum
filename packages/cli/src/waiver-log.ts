/**
 * Where a waiver's uses are written down.
 *
 * The core decides what a use means and what a run of them adds up to; this
 * decides where the bytes go — the same split every module here follows, so
 * `@trazum/core` stays browser-safe and the CLI keeps its monopoly on I/O.
 *
 * **Append-only, and never rewritten.** There is deliberately no prune, no
 * compaction and no `--clear`: a record of decisions that the tool can erase
 * is a record nobody can rely on, and the one thing a waiver history is for is
 * being awkward six months later. Deleting the file is a thing a person does
 * with `rm`, on purpose, having seen it.
 *
 * **A write that fails never fails the run.** The gate's job is the exit code.
 * A read-only checkout, a full disk or a directory somebody's CI cannot create
 * must not turn a passing build red on account of bookkeeping — the failure is
 * reported and the gate's own verdict stands.
 *
 * **A line that will not parse is counted and skipped**, exactly as in the
 * store. Losing the whole history because one line is broken would be the
 * worst possible response; pretending the history is complete would be the
 * second worst.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isWaiverUse } from '@trazum/core';
import type { WaiverUse } from '@trazum/core';

/** One file, not one per month: a waiver history is small and read whole. */
export const WAIVER_LOG = '.trazum/waivers.jsonl';

export interface WaiverReadResult {
  uses: WaiverUse[];
  /** 1-based positions of lines that would not parse. Named, never dropped quietly. */
  unreadable: number[];
  /** False when the file does not exist — "nothing recorded" is not "no file". */
  present: boolean;
}

export async function readWaiverLog(root: string): Promise<WaiverReadResult> {
  let raw: string;
  try {
    raw = await readFile(join(root, WAIVER_LOG), 'utf8');
  } catch {
    // Absent is the normal state of a repository that has never waived
    // anything, and it is not an error.
    return { uses: [], unreadable: [], present: false };
  }

  const uses: WaiverUse[] = [];
  const unreadable: number[] = [];
  raw.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isWaiverUse(parsed)) uses.push(parsed);
      else unreadable.push(index + 1);
    } catch {
      unreadable.push(index + 1);
    }
  });
  return { uses, unreadable, present: true };
}

/**
 * Appends one use, and swallows any failure after reporting it.
 *
 * Returns the error message rather than throwing, so the caller can print it
 * beside the gate's own output without the gate ever depending on the write.
 */
export async function appendWaiverUse(root: string, use: WaiverUse): Promise<string | null> {
  const path = join(root, WAIVER_LOG);
  try {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `${JSON.stringify(use)}\n`, { flag: 'a', mode: 0o600 });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
