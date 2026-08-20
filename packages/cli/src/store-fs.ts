/**
 * Where the store actually lives.
 *
 * The core decides what a record is and when two are the same; this decides
 * where the bytes go. Split that way for the reason every module here is:
 * `@trazum/core` stays browser-safe, and the CLI keeps its monopoly on I/O.
 *
 * **Append-only, one buffer per write.** A pull appends a single block and
 * never rewrites what is already there. Two consequences worth stating: a
 * crash during a write loses the tail of one block rather than a year of
 * measurements, and two runs writing at once interleave whole blocks rather
 * than half-lines. Compaction is a separate, explicit errand — `store
 * --prune` — because collapsing a log is the one operation that destroys
 * something, and it should never happen as a side effect of a pull.
 *
 * **A line that will not parse is kept, counted and skipped.** The store is a
 * file a human may open, a backup may truncate and a merge may mangle. Losing
 * the whole month because one line is broken would be the worst possible
 * response; so would silently pretending the month is complete.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveStore } from '@trazum/core';
import type { ResolvedStore, StoreRecord } from '@trazum/core';

/** The directory name, relative to wherever the caller roots the store. */
export const STORE_DIR = '.trazum/store';

/** Records are filed by the UTC month their window starts in. */
function monthOf(record: StoreRecord): string {
  return new Date(record.fromMs).toISOString().slice(0, 7);
}

export interface StoreReadResult {
  resolved: ResolvedStore;
  /** Lines that would not parse: counted and named by file, never dropped quietly. */
  unreadable: { file: string; line: number }[];
  /** Files read, so an empty store can be told from an unread one. */
  files: string[];
}

/**
 * Reads every record in the store.
 *
 * Returns an empty result rather than throwing when the store does not exist:
 * "you have not stored anything yet" is a state, not an error, and the caller
 * says so in a sentence that names `trazum connect`.
 */
export async function readStore(root: string): Promise<StoreReadResult> {
  const dir = join(root, STORE_DIR);
  const records: StoreRecord[] = [];
  const unreadable: { file: string; line: number }[] = [];
  const files: string[] = [];

  let providers: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    providers = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { resolved: resolveStore([]), unreadable, files };
  }

  for (const provider of providers.sort()) {
    const providerDir = join(dir, provider);
    let months: string[];
    try {
      months = (await readdir(providerDir)).filter((name) => name.endsWith('.jsonl')).sort();
    } catch {
      continue;
    }
    for (const month of months) {
      const path = join(providerDir, month);
      files.push(join(STORE_DIR, provider, month));
      const text = await readFile(path, 'utf8');
      for (const [index, line] of text.split('\n').entries()) {
        if (line.trim() === '') continue;
        try {
          const parsed = JSON.parse(line) as StoreRecord;
          if (typeof parsed?.provider === 'string' && typeof parsed?.fromMs === 'number') {
            records.push(parsed);
          } else {
            unreadable.push({ file: join(STORE_DIR, provider, month), line: index + 1 });
          }
        } catch {
          unreadable.push({ file: join(STORE_DIR, provider, month), line: index + 1 });
        }
      }
    }
  }

  return { resolved: resolveStore(records), unreadable, files };
}

/**
 * Appends records, grouped into one write per month file.
 *
 * Nothing already on disk is read, rewritten or resolved here: convergence
 * happens when the store is *read*, which is what keeps a write cheap enough
 * to run on a schedule and impossible to corrupt by racing.
 */
export async function appendRecords(root: string, records: readonly StoreRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const byFile = new Map<string, StoreRecord[]>();
  for (const record of records) {
    const key = join(record.provider, `${monthOf(record)}.jsonl`);
    const list = byFile.get(key) ?? [];
    list.push(record);
    byFile.set(key, list);
  }

  for (const [relative, list] of byFile) {
    const path = join(root, STORE_DIR, relative);
    await mkdir(join(path, '..'), { recursive: true });
    const block = `${list.map((record) => JSON.stringify(record)).join('\n')}\n`;
    await writeFile(path, block, { flag: 'a', mode: 0o600 });
  }
  return records.length;
}

/**
 * Rewrites the store with exactly the records given.
 *
 * The one operation that destroys something, so it is only ever reached from
 * an explicit `--prune`. Each month file is written whole, and a month left
 * with nothing is written empty rather than removed — a missing file and an
 * empty one say different things to whoever looks next.
 */
export async function rewriteStore(root: string, records: readonly StoreRecord[]): Promise<void> {
  const dir = join(root, STORE_DIR);
  const existing = new Set<string>();
  try {
    for (const provider of await readdir(dir)) {
      for (const month of await readdir(join(dir, provider)).catch(() => [])) {
        if (month.endsWith('.jsonl')) existing.add(join(provider, month));
      }
    }
  } catch {
    // Nothing stored yet: the writes below create what is needed.
  }

  const byFile = new Map<string, StoreRecord[]>();
  for (const record of records) {
    const key = join(record.provider, `${monthOf(record)}.jsonl`);
    const list = byFile.get(key) ?? [];
    list.push(record);
    byFile.set(key, list);
  }

  for (const relative of new Set([...existing, ...byFile.keys()])) {
    const list = byFile.get(relative) ?? [];
    const path = join(dir, relative);
    await mkdir(join(path, '..'), { recursive: true });
    const block = list.length === 0 ? '' : `${list.map((r) => JSON.stringify(r)).join('\n')}\n`;
    await writeFile(path, block, { mode: 0o600 });
  }
}
