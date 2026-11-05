import { slimUsageLine } from '@trazum/core';

/**
 * A dropped usage file as text, in the browser, whatever its size.
 *
 * `File.text()` builds one string, and a browser cannot hold a string much
 * past 512 MiB any more than Node can: a Claude Code session that read large
 * files grows past that, and the Bill tab failed on it with the engine's own
 * message. Past {@link WHOLE_READ_MAX_BYTES} the file is streamed line by
 * line instead, each line passed through `slimUsageLine` from
 * `@trazum/core`, the same function the CLI uses: long strings (prompts,
 * replies, tool results) are set aside, and every field a converter reads is
 * kept, so the bill is the one a whole read would give.
 *
 * Nothing leaves the page either way; this only changes how much of the file
 * is held in memory at once.
 */
export const WHOLE_READ_MAX_BYTES = 256 * 1024 * 1024;

/** What one read may hold after slimming: under the engine's string ceiling. */
export const SLIMMED_MAX_CHARS = 500 * 1024 * 1024;

export interface UsageFileText {
  text: string;
  /** Lines whose content was set aside; 0 when the file was read whole. */
  slimmed: number;
  /** Whether the file was streamed rather than read whole. */
  inParts: boolean;
}

export class UsageFileTooLarge extends Error {
  readonly code = 'file-too-large';
  readonly fileName: string;
  readonly bytes: number;
  constructor(fileName: string, bytes: number) {
    super(`${fileName} is too large to read in this tab, even with its message text set aside.`);
    this.fileName = fileName;
    this.bytes = bytes;
  }
}

export async function readUsageFile(
  file: Pick<File, 'name' | 'size' | 'text' | 'stream'>,
  limits: { wholeReadMaxBytes?: number; slimmedMaxChars?: number } = {},
): Promise<UsageFileText> {
  const wholeMax = limits.wholeReadMaxBytes ?? WHOLE_READ_MAX_BYTES;
  const slimmedMax = limits.slimmedMaxChars ?? SLIMMED_MAX_CHARS;
  if (file.size <= wholeMax) return { text: await file.text(), slimmed: 0, inParts: false };

  const kept: string[] = [];
  let held = 0;
  let slimmed = 0;
  let pending = '';
  const keep = (line: string): void => {
    // A carriage return before the newline belongs to the line ending, not the line.
    const bare = line.endsWith('\r') ? line.slice(0, -1) : line;
    const next = slimUsageLine(bare);
    if (next !== bare) slimmed += 1;
    held += next.length + 1;
    if (held > slimmedMax) throw new UsageFileTooLarge(file.name, file.size);
    kept.push(next);
  };
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        keep(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      // One line longer than the ceiling cannot be held at all.
      if (pending.length > slimmedMax) throw new UsageFileTooLarge(file.name, file.size);
    }
    if (pending !== '') keep(pending);
  } catch (error) {
    if (error instanceof RangeError) throw new UsageFileTooLarge(file.name, file.size);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { text: kept.join('\n'), slimmed, inParts: true };
}
