/**
 * The weekly summary as Markdown.
 *
 * `@trazum/core` decides what the week holds (`buildWeeklySummary`); this
 * writes it down in the reader's language. Two rules shape the text, and
 * `weekly.test.js` holds both:
 *
 * - **Every name is code.** A workload, a model and a command sit between
 *   backticks. GitHub does not turn an `@name` inside one into a mention, a
 *   label that happens to hold a `%` or a `$` is not read as a figure, and
 *   `strayFigures` skips code when it reads the finished text back.
 * - **The marker is the last line.** It is what the Action finds a week's
 *   summary by, so a second run on the same day replaces the first instead of
 *   adding another.
 */

import { UNLABELLED, formatSignedUsd, formatUsd, strayFigures, weeklyMarker } from '@trazum/core';
import type { BillFigures, WeeklyChange, WeeklySummary } from '@trazum/core';
import type { CliMessages } from './i18n/types.js';

/** A name from a log, made safe to sit in a code span on one line. */
const code = (name: string): string => `\`${name.replace(/[`<>\r\n]+/g, ' ').trim()}\``;

const sign = (value: number): string => (value > 0 ? '+' : value < 0 ? '-' : '');

function changeLines(change: WeeklyChange, t: CliMessages, unlabelled: string): string[] {
  const label = code(change.label === UNLABELLED ? unlabelled : change.label);
  const action = t.plan.action(change.kind, label, code(change.model));
  const title = change.routeTo === null ? action : `${action} ${t.plan.routeTo(code(change.routeTo), change.kind === 'route+batch')}`;
  const lines: string[] = [];
  const money =
    change.projectedSavingUsd !== null
      ? t.weekly.projected(formatUsd(change.projectedSavingUsd))
      : t.weekly.stake(formatUsd(change.measuredStakeUsd ?? 0));
  lines.push(`${change.rank}. **${title}.** ${money}`);
  if (change.sliceUsd !== null && change.sliceCalls !== null) {
    lines.push(`   - ${t.weekly.measuredBefore(formatUsd(change.sliceUsd), change.sliceCalls.toLocaleString(t.numberLocale))}`);
  }
  for (const assumption of change.assumes) lines.push(`   - ${t.plan.assume(assumption)}`);
  return lines;
}

/** The sentence a desktop notification carries: figures from the summary and no name from the logs. */
export function weeklyHeadline(summary: WeeklySummary, t: CliMessages): string {
  const cmp = summary.comparison;
  const pct = cmp === null || cmp.deltaPct === null ? null : `${sign(cmp.deltaPct)}${Math.abs(cmp.deltaPct).toFixed(1)}%`;
  return t.weekly.headline(
    formatUsd(summary.totalUsd),
    summary.calls.toLocaleString(t.numberLocale),
    cmp === null ? null : formatSignedUsd(cmp.deltaUsd),
    pct,
  );
}

export function renderWeekly(summary: WeeklySummary, t: CliMessages): string {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const { current, previous } = summary;
  const out: string[] = [];

  out.push(`## ${t.weekly.heading(current.firstDay, current.lastDay)}`, '');

  out.push(`### ${t.weekly.billHeading()}`, '');
  if (summary.calls === 0 && summary.unpricedCalls === 0) {
    out.push(t.weekly.noCalls(current.firstDay, current.lastDay));
  } else {
    out.push(t.weekly.billTotal(formatUsd(summary.totalUsd), n(summary.calls)));
    if (summary.models.length > 0) {
      out.push('', `| ${t.weekly.colModel()} | ${t.weekly.colCalls()} | ${t.weekly.colUsd()} |`, '| --- | ---: | ---: |');
      for (const row of summary.models) out.push(`| ${code(row.model)} | ${n(row.calls)} | ${formatUsd(row.usd)} |`);
      if (summary.moreModels > 0) out.push('', t.weekly.moreModels(n(summary.moreModels)));
    }
  }
  if (summary.unpricedCalls > 0) {
    out.push('', t.weekly.unpriced(summary.unpricedModels.map(code).join(', '), n(summary.unpricedCalls)));
  }
  if (summary.undatedExcluded > 0) out.push('', t.weekly.undated(n(summary.undatedExcluded)));

  out.push('', `### ${t.weekly.movedHeading(previous.firstDay, previous.lastDay)}`, '');
  const cmp = summary.comparison;
  if (cmp === null) {
    out.push(t.weekly.noWeekBefore());
  } else {
    if (cmp.deltaUsd === 0) {
      out.push(t.weekly.unchanged(formatUsd(summary.totalUsd), formatUsd(cmp.previousUsd)));
    } else {
      const pct = cmp.deltaPct === null ? null : `${sign(cmp.deltaPct)}${Math.abs(cmp.deltaPct).toFixed(1)}%`;
      out.push(
        t.weekly.moved(formatSignedUsd(cmp.deltaUsd), pct, formatUsd(summary.totalUsd), formatUsd(cmp.previousUsd), n(cmp.previousCalls)),
      );
    }
    if (cmp.movers.length > 0) {
      out.push('', t.weekly.moversHeading(), '');
      for (const row of cmp.movers) {
        out.push(`- ${t.weekly.mover(code(row.model), formatUsd(row.previousUsd), formatUsd(row.currentUsd), formatSignedUsd(row.deltaUsd))}`);
      }
    }
  }

  out.push('', `### ${t.weekly.changesHeading()}`, '');
  if (summary.changes.length === 0) {
    out.push(t.weekly.noChanges());
  } else {
    summary.changes.forEach((change, index) => {
      if (index > 0) out.push('');
      out.push(...changeLines(change, t, t.profile.unlabelled()));
    });
    const more = summary.changesAvailable - summary.changes.length;
    if (more > 0) out.push('', t.weekly.moreChanges(n(more)));
    out.push('', t.weekly.verifyHow());
  }

  out.push('', `_${t.weekly.footer()}_`, '', weeklyMarker(current.lastDay), '');
  return out.join('\n');
}

/**
 * The summary and its notification line, or a refusal.
 *
 * Both are read back against `figures`, the dollar amounts and percentages the
 * two weeks' bills hold. One that is in neither throws, naming it, and the
 * caller writes nothing: a number nobody can find in the bill is not printed.
 */
export function checkedWeekly(
  summary: WeeklySummary,
  figures: BillFigures,
  t: CliMessages,
): { markdown: string; headline: string } {
  const markdown = renderWeekly(summary, t);
  const headline = weeklyHeadline(summary, t);
  const stray = [...strayFigures(markdown, figures), ...strayFigures(headline, figures)];
  if (stray.length > 0) throw new Error(t.weekly.strayFigures([...new Set(stray)].join(', ')));
  return { markdown, headline };
}
