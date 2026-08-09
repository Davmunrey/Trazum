'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { WebMessages } from '../lib/i18n';

/**
 * "Create share link", on the Compare tab.
 *
 * The warning is rendered **before** the button and is always visible, not
 * behind a confirm dialog and not shown afterwards. Creating a link publishes
 * two prompts to anyone holding the URL, and the moment that matters is the
 * moment before the click. A dialog that appears on click is a thing people
 * dismiss; a sentence above the button is a thing they read while deciding.
 *
 * Absent entirely for a signed-out reader, like the Library tab, and for the
 * same reason: a control that answers 401 is worse than no control.
 */

interface Share {
  token: string;
  url: string;
  preview?: string;
  createdAt?: string;
  expiresAt: string | null;
}

const TTLS = ['7', '30', '90', 'never'] as const;

export function ShareControl({
  t,
  before,
  after,
  settings,
}: {
  t: WebMessages;
  before: string;
  after: string;
  /** Exactly what the Compare tab ran, so the link shows what the sharer saw. */
  settings: Record<string, unknown>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [ttl, setTtl] = useState<(typeof TTLS)[number]>('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/shares', { credentials: 'same-origin' });
    if (!response.ok) return;
    setEnabled(true);
    setShares((await response.json()).shares);
  }

  useEffect(() => {
    // A 401 leaves `enabled` false and renders nothing, which is the same answer
    // as "this deployment has no accounts". The reader does not need to know
    // which; both mean there is no link to make.
    void refresh().catch(() => {});
  }, []);

  if (!enabled) return null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ before, after, settings, ttl }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError((body as { error?: string }).error ?? t.errors.requestFailed);
        return;
      }
      await refresh();
    } catch {
      setError(t.errors.unreachable);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      await fetch(`/api/shares/${token}`, { method: 'DELETE', credentials: 'same-origin' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked. The URL is on screen and selectable, which is the
      // fallback that has always worked.
    }
  }

  /**
   * The markdown somebody pastes into a README.
   *
   * The image points at `/badge/<token>.svg` and the link at the page, so a
   * reader who wants the detail can click through — and both are revoked by the
   * same action, because they are the same capability. The badge URL is derived
   * from the share URL rather than sent separately: two fields that must agree
   * are two fields that can disagree.
   */
  const badgeMarkdown = (share: Share) =>
    `[![Trazum](${share.url.replace('/c/', '/badge/')}.svg)](${share.url})`;

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(t.numberLocale, { dateStyle: 'medium' });

  return (
    <section className="mt-6 rounded-lg border p-3">
      <h3 className="text-sm font-medium">{t.share.heading}</h3>

      {/* Before the control, always. */}
      <p className="mt-1.5 max-w-[62ch] text-xs text-muted-foreground">{t.share.warning}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">
          {t.share.expiryLabel}{' '}
          <select
            value={ttl}
            onChange={(event) => setTtl(event.target.value as (typeof TTLS)[number])}
            className="rounded-md border bg-transparent px-1.5 py-1 text-xs"
          >
            <option value="7">{t.share.expiry7}</option>
            <option value="30">{t.share.expiry30}</option>
            <option value="90">{t.share.expiry90}</option>
            <option value="never">{t.share.expiryNever}</option>
          </select>
        </label>

        <Button
          type="button"
          size="sm"
          onClick={create}
          disabled={busy || !before.trim() || !after.trim()}
        >
          {busy ? t.share.working : t.share.button}
        </Button>
      </div>

      {error && (
        <p role="status" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {shares.length > 0 && (
        <>
          <h4 className="mt-4 text-xs font-medium text-muted-foreground">{t.share.existing}</h4>
          <p className="mt-1 max-w-[62ch] text-xs text-muted-foreground">{t.share.badgeHint}</p>
          <ul className="mt-1.5 grid gap-1.5">
            {shares.map((share) => (
              <li key={share.token} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono">
                  {share.url}
                </code>
                <span className="text-muted-foreground">
                  {share.expiresAt ? t.share.expiresOn(when(share.expiresAt)) : t.share.neverExpires}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => copy(share.url)}
                >
                  {copied === share.url ? t.share.copied : t.share.copy}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copy(badgeMarkdown(share))}
                >
                  {copied === badgeMarkdown(share) ? t.share.copied : t.share.badge}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={busy}
                  onClick={() => revoke(share.token)}
                >
                  {t.share.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
