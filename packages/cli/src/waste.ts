/**
 * `trazum waste`: the files it reads, and nothing else.
 *
 * The analysis is `analyzeSessionWaste` in the core and is pure. This is the
 * part that touches the disk, kept small so what it touches can be said in one
 * place: the session's transcript, the transcripts of its subagents in the
 * folder beside it (as `session-guard` and the status line read them), and the
 * size in bytes of one CLAUDE.md. A `stat` for the size. The content of that
 * file is never opened, and no file is written.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { jsonlFiles } from './session-guard.js';

export type SessionRead =
  | { ok: true; texts: string[] }
  | { ok: false; cause: 'not-found' | 'unreadable' };

/** The transcript first, then its subagents' transcripts in a stable order. */
export async function readSession(target: string): Promise<SessionRead> {
  const info = await stat(target).catch(() => null);
  if (info === null || !info.isFile()) return { ok: false, cause: 'not-found' };
  const subagents = await jsonlFiles(join(target.replace(/\.jsonl$/, ''), 'subagents'));
  if (subagents === null) return { ok: false, cause: 'unreadable' };
  const texts: string[] = [];
  for (const file of [target, ...subagents]) {
    try {
      texts.push(await readFile(file, 'utf8'));
    } catch {
      return { ok: false, cause: 'unreadable' };
    }
  }
  return { ok: true, texts };
}

/** A file's size in bytes, or null when it is not a regular file here. Never its content. */
export async function sizeOf(path: string): Promise<{ path: string; bytes: number } | null> {
  const absolute = resolve(path);
  const info = await stat(absolute).catch(() => null);
  return info !== null && info.isFile() ? { path: absolute, bytes: info.size } : null;
}
