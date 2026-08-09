import { comparePrompts, formatUsd, getMessages } from '@trazum/core';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { getWebMessages, localeFromHeaders } from '../../../lib/i18n';
import { isShareToken } from '../../../lib/shares/api';
import { getStore } from '../../../lib/store';

export const runtime = 'nodejs';
/** Never prerendered and never cached: the content is one person's prompt. */
export const dynamic = 'force-dynamic';

/**
 * `/c/:token` — a shared comparison, readable by anyone holding the link.
 *
 * The only page in Trazum that serves somebody's prompt to an unauthenticated
 * visitor, so the things it does not do are as much the design as the things it
 * does:
 *
 * - **It writes nothing.** No view counter, no last-seen. An anonymous request
 *   that can cause a write is a lever, and a view count is not worth being one.
 * - **It is `noindex`,** set both here in the metadata and as an
 *   `X-Robots-Tag`-shaped instruction, because an unlisted link that reaches a
 *   search index is a published prompt.
 * - **It renders the prompts as text, never as markup.** React escapes by
 *   default; the point of saying so is that nothing on this page may ever reach
 *   for `dangerouslySetInnerHTML`, because the content is attacker-supplied by
 *   construction — the sharer chose it and the reader did not.
 * - **It recomputes the comparison** rather than showing a stored one, so a link
 *   opened next year is priced by next year's rules.
 * - **An expired or unknown token is a plain 404,** identical either way.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function SharedComparison({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Checked before the store is asked, so a path segment of arbitrary text never
  // becomes a bound parameter.
  if (!isShareToken(token)) notFound();

  const store = await getStore();
  const share = await store.shares.findShare(token, new Date());
  if (!share) notFound();

  const requestHeaders = await headers();
  const locale = localeFromHeaders(requestHeaders.get('accept-language'));
  const t = getWebMessages(locale);
  const copy = getMessages(locale);

  const { settings } = share;
  const comparison = comparePrompts(share.beforeText, share.afterText, {
    level: settings.level,
    locale,
    usage: {
      model: settings.model,
      callsPerMonth: settings.callsPerMonth,
      avgOutputTokens: settings.avgOutputTokens,
      cacheHitRate: settings.cacheHitRate,
      batchEligible: settings.batchEligible,
    },
    disableRules: settings.disableRules as never,
    optimizeBoth: settings.optimizeBoth,
  });

  const number = (value: number) => value.toLocaleString(t.numberLocale);
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}`;

  // Taken from the comparison rather than recomputed. `comparePrompts` negates
  // once, in the core, so every consumer shares the sign convention; subtracting
  // again here is how a second consumer quietly ends up with the opposite one.
  const { tokenDelta, deltaPct, monthlyDeltaUsd } = comparison;

  return (
    <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-16">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trazum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.share.sharedBy(share.ownerLogin, share.createdAt.toLocaleDateString(t.numberLocale, { dateStyle: 'medium' }))}
        </p>
      </header>

      {/* The convention before the first number, as on the Compare tab. Reading
          a delta the wrong way round is worse than not seeing one. */}
      <p className="mb-5 max-w-[62ch] text-sm text-muted-foreground">{t.compare.convention}</p>

      <section className="mb-6 grid gap-1">
        <p className="text-lg">
          {t.compare.tokens(number(comparison.tokensBefore), number(comparison.tokensAfter))}
        </p>
        <p className={tokenDelta > 0 ? 'text-destructive' : 'text-muted-foreground'}>
          {t.compare.delta(signed(tokenDelta), signed(Math.round(deltaPct)))}
        </p>
        <p className="text-muted-foreground">
          {t.compare.monthly(
            formatUsd(monthlyDeltaUsd),
            number(settings.callsPerMonth),
            settings.model,
          )}
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {(
          [
            [t.compare.beforeLabel, share.beforeText],
            [t.compare.afterLabel, share.afterText],
          ] as const
        ).map(([label, text]) => (
          <section key={label}>
            <h2 className="mb-1.5 text-sm font-medium">{label}</h2>
            {/* Rendered as a text child. Never `dangerouslySetInnerHTML`. */}
            <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
              {text}
            </pre>
          </section>
        ))}
      </div>

      {comparison.rules.newlyFiring.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1.5 text-sm font-medium">{t.compare.rulesNewlyFiring}</h2>
          <ul className="grid gap-0.5 text-sm text-muted-foreground">
            {comparison.rules.newlyFiring.map((id) => (
              <li key={id}>{copy.rules[id].title}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t pt-3.5 text-xs text-muted-foreground">
        {t.share.footer}
      </footer>
    </main>
  );
}
