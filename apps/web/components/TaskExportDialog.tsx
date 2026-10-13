'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from './ui/button';
import type { WebMessages } from '../lib/i18n';
import { copyTaskExport, requestTaskDownload, type TaskExportFile } from '../lib/task-export';

export function TaskExportDialog({ file, t, onClose, returnFocus }: {
  file: TaskExportFile; t: WebMessages; onClose: () => void; returnFocus: HTMLElement | null;
}) {
  const c = t.tasks;
  const text = useRef<HTMLTextAreaElement>(null);
  const active = useRef(true);
  const [copying, setCopying] = useState(false);
  const [status, setStatus] = useState<'downloadRequested' | 'copied' | 'copyUnavailable' | 'downloadError' | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  function selectText() { text.current?.focus(); text.current?.select(); }
  async function copy() {
    setCopying(true); setStatus(null);
    const copied = await copyTaskExport(file.content, navigator.clipboard);
    if (!active.current) return;
    setCopying(false); setStatus(copied ? 'copied' : 'copyUnavailable');
    if (!copied) selectText();
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-foreground bg-background p-4 sm:p-6"
          onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus(); }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold">{c.exportTitle}</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="sm">{c.closeExport}</Button></Dialog.Close>
          </div>
          <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.exportHint}</Dialog.Description>
          <p className="my-3 break-all font-mono text-sm">{file.name}</p>
          <label className="block text-sm font-medium">{c.exportContents}
            <textarea ref={text} readOnly value={file.content} spellCheck={false} rows={9} className="mt-2 max-h-[30dvh] min-h-24 w-full rounded-none border-2 border-input bg-background p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => { try { requestTaskDownload(file); setStatus('downloadRequested'); } catch { setStatus('downloadError'); } }}>{c.downloadFile}</Button>
            <Button variant="outline" disabled={copying} onClick={() => { void copy(); }}>{copying ? c.copying : c.copyContents}</Button>
            <Button variant="ghost" onClick={selectText}>{c.selectContents}</Button>
          </div>
          <p role="status" className="mt-3 min-h-5 text-sm leading-relaxed">{status ? c[status] : ''}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
