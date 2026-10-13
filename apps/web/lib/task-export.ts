export type TaskExportFile = { name: string; content: string; type: 'application/json' | 'text/markdown' };

/** A request, not evidence that the browser saved a file. */
export function requestTaskDownload(file: TaskExportFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor?.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function copyTaskExport(content: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<boolean> {
  try {
    if (!clipboard) return false;
    await clipboard.writeText(content);
    return true;
  } catch { return false; }
}
