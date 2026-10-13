import { MAX_INPUT_CHARS, parseTaskReport, type TaskComparison, type TaskFormat, type TaskReport } from '@trazum/core';

export const MAX_TASK_FILES = 16;
// A UTF-8 code unit needs at most three bytes. Check before allocating a file buffer.
export const MAX_TASK_FILE_BYTES = MAX_INPUT_CHARS * 3;

export type TaskFile = { name: string; format: TaskFormat; text: string };
export type TaskFileErrorCode = 'file-count' | 'file-size' | 'encoding' | 'empty-file' | 'read-file' | 'invalid-report' | 'export-size';

export class TaskFileError extends Error {
  readonly code: TaskFileErrorCode;
  constructor(code: TaskFileErrorCode) {
    super(code);
    this.name = 'TaskFileError';
    this.code = code;
  }
}

export async function readTaskText(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > MAX_TASK_FILE_BYTES) throw new TaskFileError('file-size');
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); }
  catch { throw new TaskFileError('read-file'); }
  if (buffer.byteLength > MAX_TASK_FILE_BYTES) throw new TaskFileError('file-size');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new TaskFileError('encoding'); }
  if (text.includes('\0')) throw new TaskFileError('encoding');
  if (text.length > MAX_INPUT_CHARS) throw new TaskFileError('file-size');
  if (!text.trim()) throw new TaskFileError('empty-file');
  return text;
}

export async function appendTaskFiles(existing: readonly TaskFile[], files: readonly File[], format: TaskFormat): Promise<TaskFile[]> {
  if (!files.length || existing.length + files.length > MAX_TASK_FILES) throw new TaskFileError('file-count');
  const next = [...existing];
  let length = existing.reduce((sum, file) => sum + file.text.length, 0);
  // Sequential reads keep peak memory bounded and reject the batch atomically.
  for (const file of files) {
    const text = await readTaskText(file);
    length += text.length;
    if (length > MAX_INPUT_CHARS) throw new TaskFileError('file-size');
    next.push({ name: file.name, format, text });
  }
  return next;
}

export async function readTaskReport(file: File): Promise<TaskReport> {
  const text = await readTaskText(file);
  try { return parseTaskReport(text); }
  catch { throw new TaskFileError('invalid-report'); }
}

export function taskDocumentJson(document: TaskReport | TaskComparison): string {
  const text = JSON.stringify(document, null, 2) + '\n';
  if (text.length > MAX_INPUT_CHARS) throw new TaskFileError('export-size');
  return text;
}

/** Invalidates pending file reads when the workspace or its inputs change. */
export function createTaskReadGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    cancel: () => { generation++; },
    current: (ticket: number) => ticket === generation,
  };
}
