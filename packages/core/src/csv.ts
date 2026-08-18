import { UNLABELLED } from './usage.js';
import type { UsageProfileReport } from './usage.js';

/**
 * The profile as a spreadsheet.
 *
 * ## Why a file format is a feature
 *
 * The terminal report is read once and closed. The people who decide what a
 * workload is allowed to cost live in spreadsheets, and handing them a
 * screenshot of a terminal is how a finding stops at the person who ran the
 * command. `--json` is for machines; this is for the pivot table that gets
 * shown to whoever signs off the bill.
 *
 * ## One row per label and model, and no total row
 *
 * `byLabelAndModel` is the grouping a decision is actually made at — routing
 * `classify` to a cheaper model is a question about one label's calls to one
 * model — so it is the grain of the file.
 *
 * **There is deliberately no TOTAL row.** A total inside a data file is the
 * oldest spreadsheet trap there is: somebody sums the column, the total row is
 * included, and every figure downstream is exactly twice what it should be.
 * The sum of this file is the bill, and a spreadsheet can compute it.
 *
 * ## Unpriced models get empty cells, never zeros
 *
 * A model the catalogue does not know has real tokens and unknown dollars.
 * Writing `0` there would be a claim — that those calls were free — and it
 * would survive into every chart built on the file. An empty cell is the
 * absence it actually is, and spreadsheets already know how to skip one.
 */

/** Columns, in order. Exported so a test can pin the header rather than a string. */
export const PROFILE_CSV_COLUMNS = [
  'label',
  'model',
  'calls',
  'input_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'output_tokens',
  'input_usd',
  'cache_read_usd',
  'cache_write_usd',
  'output_usd',
  'total_usd',
] as const;

/**
 * One CSV field, RFC 4180.
 *
 * Labels are arbitrary strings out of somebody's log: a label containing a
 * comma would shift every column after it, and one containing a quote would
 * break the row it sits in. Both are quoted here rather than sanitised,
 * because changing the label would make the file disagree with every other
 * rendering about what the workload is called.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with an apostrophe: those are
 * how a spreadsheet is told a cell is a formula, and a label out of a log is
 * data. This is the one place a value is altered, and it is altered to stop
 * a log from executing anything when the file is opened.
 */
function field(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** A dollar figure with enough places to survive being summed. */
const usd = (value: number): string => value.toFixed(6);

export interface ProfileCsvOptions {
  /** What to call the bucket for calls carrying no label. */
  unlabelled: string;
  /**
   * Which table to write.
   *
   * `slice` is one row per label and model — the grain a routing or budget
   * decision is made at. `day` and `hour` are the time series, which is what
   * a spreadsheet gets asked to chart; keeping them behind a choice rather
   * than in extra columns means every file has one row shape, and a
   * spreadsheet that has to filter before it can sum is a spreadsheet
   * somebody sums wrong.
   */
  shape?: ProfileCsvShape;
}

export type ProfileCsvShape = 'slice' | 'day' | 'hour';

/** Columns for the per-day series. */
export const PROFILE_CSV_DAY_COLUMNS = ['day', 'usd', 'calls', 'top_label', 'top_label_usd'] as const;

/** Columns for the per-hour-of-UTC-day series. */
export const PROFILE_CSV_HOUR_COLUMNS = ['hour_utc', 'usd', 'calls'] as const;

/**
 * The report as CSV text, one row per label and model.
 *
 * Rows arrive in the report's own order — largest bill first — because a
 * spreadsheet can re-sort and a reader opening the file should see the
 * expensive workload at the top either way.
 */
export function profileToCsv(report: UsageProfileReport, options: ProfileCsvOptions): string {
  if (options.shape === 'day') {
    const rows: string[] = [PROFILE_CSV_DAY_COLUMNS.join(',')];
    for (const day of report.spendByDay) {
      rows.push(
        [
          day.day,
          usd(day.usd),
          String(day.calls),
          // A day whose calls carried no label at all has no top label, and an
          // empty cell is that absence. Naming the unlabelled bucket here
          // would claim a label the log never carried.
          day.topLabel === null
            ? ''
            : field(day.topLabel === UNLABELLED ? options.unlabelled : day.topLabel),
          day.topLabel === null ? '' : usd(day.topLabelUsd),
        ].join(','),
      );
    }
    return `${rows.join('\n')}\n`;
  }

  if (options.shape === 'hour') {
    const rows: string[] = [PROFILE_CSV_HOUR_COLUMNS.join(',')];
    for (const hour of report.spendByHour) {
      rows.push([String(hour.hour), usd(hour.usd), String(hour.calls)].join(','));
    }
    return `${rows.join('\n')}\n`;
  }

  const rows: string[] = [PROFILE_CSV_COLUMNS.join(',')];

  for (const { label, model, breakdown } of report.byLabelAndModel) {
    rows.push(
      [
        field(label === UNLABELLED ? options.unlabelled : label),
        field(model),
        String(breakdown.calls),
        String(breakdown.inputTokens),
        String(breakdown.cacheReadTokens),
        String(breakdown.cacheWriteTokens),
        String(breakdown.outputTokens),
        usd(breakdown.inputUsd),
        usd(breakdown.cacheReadUsd),
        usd(breakdown.cacheWriteUsd),
        usd(breakdown.outputUsd),
        usd(breakdown.totalUsd),
      ].join(','),
    );
  }

  /**
   * The unpriced calls, with their tokens and no dollars.
   *
   * They are absent from `byLabelAndModel` — which holds what could be priced
   * — and leaving them out of the file entirely would make its token columns
   * disagree with the log. `byModel` keeps them, so they are recovered from
   * there, with empty dollar cells rather than zeros.
   */
  for (const model of report.unpricedModels) {
    const row = report.byModel.find((entry) => entry.model === model);
    if (!row) continue;
    rows.push(
      [
        field(options.unlabelled),
        field(model),
        String(row.breakdown.calls),
        String(row.breakdown.inputTokens),
        String(row.breakdown.cacheReadTokens),
        String(row.breakdown.cacheWriteTokens),
        String(row.breakdown.outputTokens),
        '',
        '',
        '',
        '',
        '',
      ].join(','),
    );
  }

  return `${rows.join('\n')}\n`;
}
