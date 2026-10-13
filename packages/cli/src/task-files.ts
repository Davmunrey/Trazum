import { constants } from 'node:fs';
import { link, lstat, open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { MAX_INPUT_CHARS, TASK_POLICY_INSTRUCTIONS } from '@trazum/core';

const START = '<!-- trazum:repeat-review-v1:start -->';
const END = '<!-- trazum:repeat-review-v1:end -->';
const BLOCK = `\n\n${START}\n${TASK_POLICY_INSTRUCTIONS}\n${END}\n`;

export class TaskFileError extends Error {}

/** Read bounded, stable regular files; a FIFO must not block before fstat. */
export async function readTaskText(path: string, maxChars = MAX_INPUT_CHARS): Promise<string> {
  let file;
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new TaskFileError('Input must be a regular file, not a symlink or stream.');
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat();
    const maxBytes = maxChars * 4;
    if (!before.isFile() || before.size > maxBytes) throw new TaskFileError('Input must be a bounded regular file, not a symlink or stream.');
    if (before.dev !== entry.dev || before.ino !== entry.ino || before.mtimeMs !== entry.mtimeMs || before.size !== entry.size) {
      throw new TaskFileError('Input changed while opening; retry after other edits finish.');
    }
    const buffer = Buffer.alloc(Math.min(before.size + 1, maxBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = await file.stat();
    const currentEntry = await lstat(path);
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new TaskFileError('Input changed while reading; finish the task and retry with a stable transcript.');
    }
    if (currentEntry.isSymbolicLink() || currentEntry.dev !== before.dev || currentEntry.ino !== before.ino) {
      throw new TaskFileError('Input was replaced while reading; retry after other edits finish.');
    }
    const bytes = buffer.subarray(0, length);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes) || text.includes('\0')) throw new TaskFileError('Input must be UTF-8 text without NUL bytes.');
    if (text.length > maxChars) throw new TaskFileError(`Input exceeds ${maxChars} characters; use a smaller complete task source.`);
    return text;
  } catch (error) {
    if (error instanceof TaskFileError) throw error;
    throw new TaskFileError('Cannot read input; provide an existing, readable regular file without a symlink.');
  } finally { await file?.close(); }
}

/** Reports are explicit opt-in files. Existing data is never overwritten. */
export async function writeTaskText(path: string, text: string): Promise<void> {
  let temporary: string | undefined;
  try {
    const candidate = join(dirname(path), `.trazum-task-report-${randomUUID()}.tmp`);
    const file = await open(candidate, 'wx', 0o600);
    temporary = candidate;
    try {
      await file.writeFile(text, 'utf8');
      await file.sync();
    } finally { await file.close(); }
    // Publish a complete file atomically, without replacing an existing destination.
    await link(temporary, path);
  } catch {
    throw new TaskFileError('Cannot create output; choose a new file in an existing writable directory.');
  } finally {
    if (temporary !== undefined) await unlink(temporary).catch(() => {});
  }
}

/** Change only the exact, versioned block. No transcript content becomes instructions. */
export async function changeTaskInstructions(path: string, operation: 'apply' | 'revert'): Promise<boolean> {
  let temporary: string | undefined;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        (process.platform !== 'win32' && before.uid !== process.getuid?.())) {
      throw new TaskFileError('Instructions must be a regular file owned by you, without symlinks or hard links.');
    }
    const text = await readTaskText(path);
    const starts = text.split(START).length - 1;
    const ends = text.split(END).length - 1;
    const hasBlock = text.includes(BLOCK);
    if (starts !== ends || starts > 1 || (starts === 1 && !hasBlock)) {
      throw new TaskFileError('The managed policy block was edited or is malformed; review it manually before retrying.');
    }
    if ((operation === 'apply' && hasBlock) || (operation === 'revert' && !hasBlock)) return false;
    const updated = operation === 'apply' ? text + BLOCK : text.replace(BLOCK, '');
    if (updated.length > MAX_INPUT_CHARS) throw new TaskFileError('Instructions would exceed the input limit.');
    const candidate = join(dirname(path), `.trazum-task-${randomUUID()}.tmp`);
    const file = await open(candidate, 'wx', 0o600);
    temporary = candidate;
    try {
      await file.writeFile(updated, 'utf8');
      await file.chmod(before.mode & 0o777);
      await file.sync();
    } finally { await file.close(); }
    const current = await lstat(path);
    if (current.dev !== before.dev || current.ino !== before.ino || current.nlink !== 1 ||
        current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs ||
        await readTaskText(path) !== text) {
      throw new TaskFileError('Instructions changed while preparing the policy; retry after other edits finish.');
    }
    await rename(temporary, path);
    temporary = undefined;
    return true;
  } catch (error) {
    if (error instanceof TaskFileError) throw error;
    throw new TaskFileError('Cannot update instructions; choose an existing writable file in a writable directory.');
  } finally {
    if (temporary !== undefined) await unlink(temporary).catch(() => {});
  }
}
