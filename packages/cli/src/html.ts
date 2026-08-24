import { UNLABELLED, formatUsd, sharesOf } from '@trazum/core';
import type { UsageBreakdown } from '@trazum/core';
import type { ProfileMarkdownInput } from './markdown.js';
import { dayOf, spanDays } from './time.js';

/**
 * HTML for the person who does not run CLIs.
 *
 * One self-contained file: inline CSS, no scripts, no external assets — a
 * mail client, a wiki upload and a double-click all render it the same. It
 * is a **projection of the document `--json` prints**, taking the exact same
 * input object as the Markdown renderer: no second computation exists to
 * disagree with the first, and the parity guard in the suite walks every
 * figure here back to that document.
 *
 * The design rule this repository applies to its terminal output is applied
 * here where a designer would be tempted to grey it out: **the caveats are
 * furniture, not footnotes.** Unpriced models, skipped lines and the absent
 * fields render inside a bordered block ahead of the detail tables, at the
 * same visual weight as the totals they qualify — a forwarded report whose
 * limits can be cropped out is a lie by omission wearing this tool's name.
 *
 * Escaping is not optional politeness: labels, model ids and file paths come
 * from somebody's log, and a label is exactly where `<script>` would arrive.
 * Everything interpolated goes through `esc()`, tested with hostile labels.
 */

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * A single committed look, print-first: explicit colours on everything, a
 * caveat block that a printer and a dark-mode mail client both keep legible.
 * No media-query theming — this file's job is to look the same everywhere,
 * including on paper.
 */
const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 2.5rem 1.25rem; background: #f7f6f3; color: #1f2328;
         font: 16px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 860px; margin: 0 auto; background: #ffffff; border: 1px solid #d9d5cc;
         border-radius: 6px; padding: 2.25rem 2.5rem; }
  h1 { font-size: 1.45rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; border-bottom: 1px solid #e4e0d8; padding-bottom: .3rem; }
  .headline { font-size: 1.8rem; font-weight: 700; margin: .75rem 0 .1rem; font-variant-numeric: tabular-nums; }
  .muted { color: #59606a; }
  .gate-fail { border: 2px solid #b42318; background: #fdf1f0; color: #7a1a12;
               padding: .7rem 1rem; border-radius: 6px; margin: 1rem 0; font-weight: 600; }
  .gate-pass { color: #365f37; margin: 1rem 0; }
  .caveats { border: 2px solid #8a6d1a; background: #fbf6e9; border-radius: 6px;
             padding: 1rem 1.25rem; margin: 1.5rem 0; }
  .caveats h2 { margin: 0 0 .5rem; border: 0; padding: 0; font-size: 1.05rem; color: #6d5510; }
  .caveats ul { margin: 0; padding-left: 1.2rem; }
  .caveats li { margin: .3rem 0; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 600; border-bottom: 2px solid #d9d5cc; padding: .35rem .6rem .35rem 0; }
  td { border-bottom: 1px solid #ece9e2; padding: .35rem .6rem .35rem 0; }
  td.n, th.n { text-align: right; }
  ul.findings { padding-left: 1.2rem; } ul.findings li { margin: .35rem 0; }
  footer { margin-top: 2rem; padding-top: .75rem; border-top: 1px solid #e4e0d8;
           font-size: .85rem; color: #59606a; }
  @media print { body { background: #ffffff; padding: 0; } main { border: 0; padding: 0; } }
`;

interface Row {
  name: string;
  breakdown: UsageBreakdown;
}

function breakdownTable(rows: Row[], totalUsd: number, t: ProfileMarkdownInput['t'], nameHeading: string): string {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const body = rows
    .map(({ name, breakdown: b }) => {
      const share = totalUsd > 0 ? `${((b.totalUsd / totalUsd) * 100).toFixed(1)}%` : '—';
      return `<tr><td>${esc(name)}</td><td class="n">${n(b.calls)}</td><td class="n">${n(b.inputTokens)}</td><td class="n">${n(b.cacheReadTokens)}</td><td class="n">${n(b.cacheWriteTokens)}</td><td class="n">${n(b.outputTokens)}</td><td class="n">${esc(formatUsd(b.totalUsd))}</td><td class="n">${share}</td></tr>`;
    })
    .join('\n');
  return `<table><thead><tr><th>${esc(nameHeading)}</th><th class="n">${esc(t.html.colCalls())}</th><th class="n">${esc(t.html.colInput())}</th><th class="n">${esc(t.html.colCacheRead())}</th><th class="n">${esc(t.html.colCacheWrite())}</th><th class="n">${esc(t.html.colOutput())}</th><th class="n">USD</th><th class="n">%</th></tr></thead><tbody>\n${body}\n</tbody></table>`;
}

/** The profile as one self-contained page. Same input as the Markdown door. */
export function renderProfileHtml(input: ProfileMarkdownInput): string {
  const { report, levers, cache, t, gates, window, stalePricing } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;
  const showLabel = (label: string): string => (label === UNLABELLED ? t.profile.unlabelled() : label);
  const shares = sharesOf(report.total);
  const parts: string[] = [];

  parts.push(`<h1>${esc(t.profile.heading())}</h1>`);
  parts.push(
    `<p class="headline">${esc(t.profile.spent(t.profile.calls(report.total.calls), formatUsd(report.total.totalUsd)))}</p>`,
  );
  if (report.span !== null) {
    parts.push(
      `<p class="muted">${esc(t.profile.spanLine(dayOf(report.span.fromMs), dayOf(report.span.toMs), spanDays(report.span.fromMs, report.span.toMs)))}</p>`,
    );
  }
  if (window !== undefined) {
    parts.push(`<p class="muted">${esc(t.profile.windowLine(window.since, window.until))}</p>`);
  }

  if (gates !== undefined && gates.lines.length > 0) {
    const box = gates.failed ? 'gate-fail' : 'gate-pass';
    parts.push(`<div class="${box}">${gates.lines.map((line) => esc(line)).join('<br>')}</div>`);
  }

  /**
   * The caveats, ahead of every detail table. What this report cannot say is
   * part of what it says, and it renders before the part a skimmer stops at.
   */
  const caveats: string[] = [];
  if (report.unpricedModels.length > 0) {
    caveats.push(esc(t.profile.unpriced(report.unpricedModels.join(', '), report.unpriced.calls)));
  }
  if (report.skippedLines.length > 0) {
    const shown = report.skippedLines.slice(0, 5).join(', ');
    caveats.push(
      esc(t.profile.skipped(report.skippedLines.length, report.skippedLines.length > 5 ? `${shown}…` : shown)),
    );
  }
  if (report.span === null) caveats.push(esc(t.html.noClock()));
  if (!report.hasSessions) caveats.push(esc(t.html.noSessions()));
  if (report.total.assumedWriteTtlCalls > 0) {
    caveats.push(
      esc(
        t.profile.cacheTtlUnsettled(
          report.total.assumedWriteTtlCalls,
          formatUsd(-cache.deltaUsd),
          formatUsd(cache.worstCaseDeltaUsd),
        ),
      ),
    );
  }
  if (stalePricing !== undefined) {
    caveats.push(esc(t.profile.pricesStale(stalePricing.date, stalePricing.days)));
  }
  if (caveats.length > 0) {
    parts.push(
      `<div class="caveats"><h2>${esc(t.html.caveatsHeading())}</h2><ul>${caveats
        .map((caveat) => `<li>${caveat}</li>`)
        .join('')}</ul></div>`,
    );
  }

  parts.push(`<h2>${esc(t.html.byLabelHeading())}</h2>`);
  parts.push(
    breakdownTable(
      report.byLabel.map((row) => ({ name: showLabel(row.label), breakdown: row.breakdown })),
      report.total.totalUsd,
      t,
      t.html.colLabel(),
    ),
  );

  parts.push(`<h2>${esc(t.html.byModelHeading())}</h2>`);
  parts.push(
    breakdownTable(
      report.byModel.map((row) => ({ name: row.model, breakdown: row.breakdown })),
      report.total.totalUsd,
      t,
      t.html.colModel(),
    ),
  );

  // The findings, as the sentences the terminal already says — the copy is
  // the product's, not this file's, so the two surfaces cannot drift apart.
  const findings: string[] = [];
  for (const lever of levers.slices.slice(0, 5)) {
    findings.push(
      esc(t.profile.leverSlice(showLabel(lever.label), lever.modelName, formatUsd(lever.combinedUsd), pct(lever.shareOfBill))),
    );
  }
  if (report.total.cacheReadTokens + report.total.cacheWriteTokens > 0) {
    if (cache.deltaUsd > 0) {
      findings.push(
        esc(t.profile.cacheLost(formatUsd(cache.deltaUsd), n(report.total.cacheWriteTokens), n(report.total.cacheReadTokens))),
      );
    } else {
      findings.push(esc(t.profile.cachePaidOff(formatUsd(-cache.deltaUsd))));
    }
  }
  if (findings.length > 0) {
    parts.push(`<h2>${esc(t.html.findingsHeading())}</h2>`);
    parts.push(`<ul class="findings">${findings.map((finding) => `<li>${finding}</li>`).join('')}</ul>`);
  }

  parts.push(
    `<p class="muted">${esc(t.html.sharesLine(pct(shares.input), pct(shares.cacheRead), pct(shares.cacheWrite), pct(shares.output)))}</p>`,
  );

  parts.push(`<footer>${esc(t.html.footer())}</footer>`);

  return [
    '<!doctype html>',
    `<html lang="${esc(t.locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(t.profile.heading())}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    ...parts,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
