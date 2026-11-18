'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * The one command, with a control that copies it.
 *
 * The clipboard is written from the click, on this origin, which is the one
 * thing the browser lets a page do with it unasked; nothing is read and
 * nothing is sent anywhere. Where the clipboard refuses (an insecure origin,
 * a browser that asks), the command is still on screen to select by hand, and
 * the control simply does not say it copied.
 *
 * The confirmation is spoken through a status region as well as drawn, so a
 * screen reader hears it without the focus moving.
 */
export function CommandLine({
  command,
  copyLabel,
  copiedLabel,
  className = '',
  size = 'large',
}: {
  command: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
  size?: 'large' | 'small';
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Refused: the command is still there to select by hand.
    }
  }

  return (
    <div data-command="" className={`flex min-w-0 items-stretch border-2 border-foreground bg-background ${className}`}>
      <code
        className={`flex min-w-0 flex-1 items-center overflow-x-auto px-4 font-mono whitespace-nowrap ${
          size === 'large' ? 'py-3.5 text-[15px] sm:text-[18px]' : 'py-2.5 text-[14px]'
        }`}
      >
        <span aria-hidden="true" className="mr-2.5 text-muted-foreground select-none">
          $
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copyLabel}
        title={copyLabel}
        className="flex w-12 shrink-0 items-center justify-center border-l-2 border-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-foreground"
      >
        {copied ? <Check className="size-[18px]" aria-hidden="true" /> : <Copy className="size-[18px]" aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </div>
  );
}
