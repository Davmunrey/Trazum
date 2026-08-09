'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WebMessages } from '../lib/i18n';

/**
 * The saved prompts tab.
 *
 * Two rules it holds itself to, both of which are about not lying:
 *
 * **It never shows a stale list after a write.** Every mutation re-fetches
 * rather than patching local state. Patching is faster and is how a UI ends up
 * showing a version count the server does not agree with — and the whole point
 * of a history is that it is the record.
 *
 * **It says when nothing was saved.** The API answers `saved: false` for a save
 * that changed nothing, and this renders that as its own message rather than
 * the success one. A UI that says "Saved" when it did not write anything is
 * training its user to distrust it.
 */

interface Summary {
  id: string;
  name: string;
  versionCount: number;
  tokens: number;
  preview: string;
  updatedAt: string;
}

interface Version {
  id: string;
  version: number;
  text: string;
  note: string | null;
  tokens: number;
  createdAt: string;
}

interface Detail {
  id: string;
  name: string;
  versions: Version[];
}

export function Library({
  t,
  locale,
  /** The Optimise tab's current prompt, so Save puts the right thing away. */
  currentPrompt,
  /** Load a version back into the Optimise tab. */
  onRestore,
}: {
  t: WebMessages;
  locale: string;
  currentPrompt: string;
  onRestore: (text: string) => void;
}) {
  const [prompts, setPrompts] = useState<Summary[] | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [status, setStatus] = useState<{ kind: 'error' | 'note'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/prompts', { credentials: 'same-origin' });
    if (!response.ok) {
      // 401 is not an error to report: it means the header is about to render a
      // Sign in button, which is the actual answer to what the reader should do.
      setPrompts([]);
      return;
    }
    setPrompts((await response.json()).prompts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Every write goes through here, so none of them can forget to re-read. */
  async function mutate(
    input: RequestInfo,
    init: RequestInit,
    onOk?: (body: unknown) => void,
  ): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(input, { credentials: 'same-origin', ...init });
      const body = response.status === 204 ? {} : await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus({ kind: 'error', text: (body as { error?: string }).error ?? t.errors.requestFailed });
        return;
      }

      onOk?.(body);
      await refresh();
      if (open) await openPrompt(open.id, { quiet: true });
    } catch {
      setStatus({ kind: 'error', text: t.errors.unreachable });
    } finally {
      setBusy(false);
    }
  }

  async function openPrompt(id: string, { quiet = false } = {}) {
    if (!quiet) setStatus(null);
    const response = await fetch(`/api/prompts/${id}`, { credentials: 'same-origin' });
    if (!response.ok) {
      setOpen(null);
      await refresh();
      return;
    }
    setOpen((await response.json()).prompt);
  }

  async function saveNew() {
    const name = window.prompt(t.library.namePrompt);
    if (!name) return;
    await mutate('/api/prompts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, text: currentPrompt }),
    });
  }

  async function saveVersion(id: string) {
    await mutate(
      `/api/prompts/${id}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: currentPrompt }),
      },
      (body) => {
        // The one place `saved: false` is turned into words. Reported as a note
        // rather than an error, because nothing went wrong.
        const saved = (body as { saved?: boolean }).saved;
        setStatus({ kind: 'note', text: saved ? t.library.saved : t.library.unchanged });
      },
    );
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(t.library.confirmDelete(name))) return;
    if (open?.id === id) setOpen(null);
    await mutate(`/api/prompts/${id}`, { method: 'DELETE' });
  }

  const number = (value: number) => value.toLocaleString(t.numberLocale);
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(t.numberLocale, { dateStyle: 'medium' });

  if (prompts === null) return <p className="text-muted-foreground">{t.library.loading}</p>;

  return (
    <div className="grid gap-5">
      <p className="max-w-[62ch] text-muted-foreground">{t.library.lede}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={saveNew} disabled={busy || !currentPrompt.trim()}>
          {t.library.saveCurrent}
        </Button>
        {!currentPrompt.trim() && (
          // Said, rather than left as a disabled button somebody has to guess at.
          <span className="text-xs text-muted-foreground">{t.library.nothingToSave}</span>
        )}
      </div>

      {status && (
        <p
          role="status"
          className={cn('text-sm', status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')}
        >
          {status.text}
        </p>
      )}

      {prompts.length === 0 ? (
        <p className="text-muted-foreground">{t.library.empty}</p>
      ) : (
        <ul className="grid gap-2">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{prompt.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.library.meta(number(prompt.tokens), prompt.versionCount, when(prompt.updatedAt))}
                </span>

                <div className="ml-auto flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openPrompt(prompt.id)}>
                    {open?.id === prompt.id ? t.library.hideHistory : t.library.showHistory}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || !currentPrompt.trim()}
                    onClick={() => saveVersion(prompt.id)}
                  >
                    {t.library.saveVersion}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove(prompt.id, prompt.name)}
                  >
                    {t.library.delete}
                  </Button>
                </div>
              </div>

              <p className="mt-1.5 line-clamp-2 font-mono text-xs text-muted-foreground">
                {prompt.preview}
              </p>

              {open?.id === prompt.id && (
                <ol className="mt-3 grid gap-2 border-t pt-3">
                  {open.versions.map((version, index) => {
                    // Against the version below it in the list, which is the one
                    // before it in time. The newest has nothing to compare to.
                    const previous = open.versions[index + 1];
                    const delta = previous ? version.tokens - previous.tokens : null;

                    return (
                      <li key={version.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.library.versionLabel(version.version)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.library.versionTokens(number(version.tokens), when(version.createdAt))}
                        </span>
                        {delta !== null && delta !== 0 && (
                          // Signed, and coloured by direction: growth is the
                          // thing worth noticing, so it gets the warning colour.
                          <span
                            className={cn(
                              'text-xs tabular-nums',
                              delta > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                            )}
                          >
                            {delta > 0 ? '+' : '−'}
                            {number(Math.abs(delta))}
                          </span>
                        )}
                        {version.note && (
                          <span className="text-xs text-muted-foreground italic">{version.note}</span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-xs"
                          onClick={() => onRestore(version.text)}
                        >
                          {t.library.restore}
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
