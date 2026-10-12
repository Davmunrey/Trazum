/** Opt-in stdin log filter. No subprocess execution and no provider access. */
import { constants } from 'node:fs';
import { mkdir, lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { compactToolOutput, EFFICIENT_OUTPUT_INSTRUCTIONS, type ToolOutputView } from '@trazum/core';

const MAX_BYTES = 1024 * 1024;
const HELP = `Usage:
  trazum filter compact --recovery-dir <private-directory> [--stats]
  trazum filter restore <sha256> --recovery-dir <private-directory>
  trazum filter instructions                          print optional output guidance

Experimental, opt-in display filter. Only consecutive repeated log lines are
compacted. Errors and unique lines are kept. Not for source files or data pipes.
Use Bash pipefail to preserve the producing command's failure status.
Original logs may contain sensitive data: --recovery-dir explicitly opts into local
retention. Delete that directory when the originals are no longer needed.
Token counts are estimates, not billing or subscription-quota measurements.
--stats writes one JSON record to stderr, without log content or recovery paths.
`;

/** Report only the view actually emitted, including recovery-instruction overhead. */
function reportStats(inputBytes: number, outputBytes: number, view: ToolOutputView | null,
  reason: string, applied = false): void {
  const before = view?.estimatedTokensBefore ?? null;
  const after = applied ? view?.estimatedTokensAfter ?? null : before;
  const saved = before === null || after === null ? null : before - after;
  process.stderr.write(`${JSON.stringify({
    schemaVersion: 1, kind: 'trazum-tool-filter', estimateOnly: true, applied, reason,
    inputBytes, outputBytes, estimatedTokensBefore: before, estimatedTokensAfter: after,
    estimatedTokensSaved: saved,
    estimatedReductionPercent: saved === null || before === null ? null
      : before === 0 ? 0 : Math.round(saved / before * 10000) / 100,
    repeatedLines: applied ? view?.repeatedLines ?? 0 : 0,
  })}\n`);
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
async function emit(bytes: Buffer | string): Promise<void> {
  if (!process.stdout.write(bytes)) await once(process.stdout, 'drain');
}
async function privateDirectory(path: string, create: boolean): Promise<void> {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Store must be a real directory.');
  if (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) {
    throw new Error('Store must be owned by you and have mode 0700.');
  }
}
async function readOriginal(store: string, key: string): Promise<Buffer> {
  const file = await open(join(store, `${key}.log`), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Invalid recovery file.');
    const bytes = await file.readFile();
    if (bytes.length > MAX_BYTES || digest(bytes) !== key) throw new Error('Recovery integrity check failed.');
    return bytes;
  } finally { await file.close(); }
}
async function saveOriginal(store: string, key: string, bytes: Buffer): Promise<void> {
  await privateDirectory(store, true);
  let file;
  try { file = await open(join(store, `${key}.log`), 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readOriginal(store, key);
    if (!existing.equals(bytes)) throw new Error('Recovery integrity check failed.');
    return;
  }
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}
async function compact(store: string, stats: boolean): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  let passthrough = false;
  for await (const value of process.stdin) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (passthrough) { await emit(chunk); continue; }
    if (size > MAX_BYTES) {
      passthrough = true;
      for (const buffered of chunks) await emit(buffered);
      chunks.length = 0;
      await emit(chunk);
    } else { chunks.push(chunk); }
  }
  if (passthrough) {
    if (stats) reportStats(size, size, null, 'stream-limit');
    return;
  }
  const bytes = Buffer.concat(chunks);
  const input = bytes.toString('utf8');
  // Invalid UTF-8 must pass byte-for-byte rather than acquire replacement chars.
  if (!Buffer.from(input).equals(bytes)) {
    await emit(bytes);
    if (stats) reportStats(size, size, null, 'invalid-utf8');
    return;
  }
  const key = digest(bytes);
  const view = compactToolOutput(input, `trazum filter restore ${key} --recovery-dir ${quote(store)}`);
  if (!view.applied) {
    await emit(bytes);
    if (stats) reportStats(size, size, view, view.reason);
    return;
  }
  try { await saveOriginal(store, key, bytes); }
  catch {
    // A filter must not swallow a tool's output because local persistence failed.
    if (!stats) process.stderr.write('Trazum: original could not be retained; passing log through unchanged.\n');
    await emit(bytes);
    if (stats) reportStats(size, size, view, 'storage-failed');
    return;
  }
  await emit(view.text);
  if (stats) reportStats(size, Buffer.byteLength(view.text), view, view.reason, true);
}
export async function runFilter(args: string[]): Promise<void> {
  let stats = false;
  if (args[0] === 'compact' && args.length === 4) {
    const index = args[1] === '--stats' ? 1 : args[3] === '--stats' ? 3 : -1;
    if (index !== -1) { stats = true; args = args.filter((_, i) => i !== index); }
  }
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]!))) {
    await emit(HELP); return;
  }
  if (args.length === 1 && args[0] === 'instructions') {
    await emit(`${EFFICIENT_OUTPUT_INSTRUCTIONS}\n`); return;
  }
  const restoring = args[0] === 'restore';
  const offset = restoring ? 2 : 1;
  if ((!restoring && args[0] !== 'compact') || args.length !== offset + 2 ||
      args[offset] !== '--recovery-dir' || !args[offset + 1] || /[\r\n]/.test(args[offset + 1]!)) {
    throw new Error('Invalid arguments. Run trazum filter --help.');
  }
  const store = resolve(args[offset + 1]!);
  if (restoring) {
    const key = args[1]!;
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Expected a SHA-256 recovery identifier.');
    await privateDirectory(store, false);
    await emit(await readOriginal(store, key));
  } else {
    if (process.stdin.isTTY) throw new Error('Pipe a tool log into stdin; interactive tools are not supported.');
    await compact(store, stats);
  }
}
