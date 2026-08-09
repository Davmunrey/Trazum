import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { adminList, adminSource } from '../../lib/admin/config';
import { buildOverview } from '../../lib/admin/overview';
import { authConfig } from '../../lib/auth/config';
import { currentUser } from '../../lib/auth/session';
import { getWebMessages, localeFromHeaders } from '../../lib/i18n';
import { CENSUS_LIMIT } from '../../lib/store/prompts';
import { getStore } from '../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * `/admin` — what this deployment's prompts add up to.
 *
 * Rendered on the server and gated before anything is read: not an admin, and
 * the page is `notFound()`. A signed-in stranger learns nothing about whether an
 * admin dashboard exists here, which a 403 page would tell them.
 *
 * What it deliberately is *not*: a spend report. Trazum has never seen a bill,
 * an API call or a token counter — it reads prompt text and estimates. So the
 * headline is **tokens**, which is a property of the prompt alone, and the
 * second figure is what running the rules would remove, which is measured by
 * running them. Nothing here is a score.
 *
 * And it shows names, never prompt text. An admin is an operator, not an auditor
 * of what their colleagues wrote, and "which prompt is expensive" is answerable
 * from a name.
 */
export default async function AdminOverview() {
  const config = authConfig();
  if (!config.enabled) notFound();

  const list = adminList();
  if (!list.enabled) notFound();

  const store = await getStore();
  const requestHeaders = await headers();
  const user = await currentUser(
    // The page has no `Request`, so one is assembled from the incoming headers.
    // Only the cookie matters, and `currentUser` reads nothing else.
    new Request(config.publicUrl, { headers: { cookie: requestHeaders.get('cookie') ?? '' } }),
    store,
    new Date(),
    config.secure,
  );
  if (!user) notFound();

  const source = adminSource(user, list);
  if (!source) notFound();

  const locale = localeFromHeaders(requestHeaders.get('accept-language'));
  const t = getWebMessages(locale);
  const overview = buildOverview(await store.admin.census(CENSUS_LIMIT));

  const n = (value: number) => value.toLocaleString(t.numberLocale);
  const pct =
    overview.tokensBefore > 0 ? Math.round((overview.recoverable / overview.tokensBefore) * 100) : 0;

  return (
    <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-16">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.heading}</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{t.admin.lede}</p>
      </header>

      {/* Before the numbers, not in a footnote. The single most misleading thing
          this page could do is let someone read "tokens" as "spend". */}
      <p className="mb-5 max-w-[68ch] rounded-lg border p-3 text-sm text-muted-foreground">
        {t.admin.notSpend}
      </p>

      {source === 'login' && (
        <p className="mb-5 max-w-[68ch] text-sm text-muted-foreground">{t.admin.loginWarning}</p>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        {(
          [
            [t.admin.accounts, n(overview.accounts)],
            [t.admin.prompts, n(overview.prompts)],
            [t.admin.tokens, n(overview.tokensBefore)],
            [t.admin.recoverable, `${n(overview.recoverable)} (${pct}%)`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-xl tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      {overview.truncated && (
        // Never a silent cap. A total describing five hundred of eight hundred
        // prompts reads as "the whole deployment" unless it says otherwise.
        <p className="mb-5 text-sm text-destructive">
          {t.admin.truncated(n(overview.measured), n(overview.prompts))}
        </p>
      )}

      <section className="mb-7">
        <h2 className="mb-2 text-sm font-medium">{t.admin.byAccount}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-normal">{t.admin.account}</th>
                <th className="py-1 pr-4 text-right font-normal">{t.admin.prompts}</th>
                <th className="py-1 pr-4 text-right font-normal">{t.admin.tokens}</th>
                <th className="py-1 text-right font-normal">{t.admin.recoverable}</th>
              </tr>
            </thead>
            <tbody>
              {overview.byAccount.map((row) => (
                <tr key={row.login} className="border-t">
                  <td className="py-1 pr-4">{row.login}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{n(row.prompts)}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{n(row.tokens)}</td>
                  <td className="py-1 text-right tabular-nums">{n(row.recoverable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">{t.admin.topHeading}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-normal">{t.admin.prompt}</th>
                <th className="py-1 pr-4 font-normal">{t.admin.account}</th>
                <th className="py-1 pr-4 text-right font-normal">{t.admin.tokens}</th>
                <th className="py-1 text-right font-normal">{t.admin.recoverable}</th>
              </tr>
            </thead>
            <tbody>
              {overview.top.map((row) => (
                <tr key={row.id} className="border-t">
                  {/* The name, never the text. */}
                  <td className="py-1 pr-4">{row.name}</td>
                  <td className="py-1 pr-4 text-muted-foreground">{row.ownerLogin}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{n(row.tokensBefore)}</td>
                  <td className="py-1 text-right tabular-nums">{n(row.recoverable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 border-t pt-3.5 text-xs text-muted-foreground">
        {t.admin.footer}
      </footer>
    </main>
  );
}
