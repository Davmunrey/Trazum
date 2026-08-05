import type { CliMessages } from './i18n/index.js';
import type { Locale, PromptComparison, RuleLevel } from '@trazum/core';
import { formatSignedUsd, getMessages, getModel } from '@trazum/core';

/**
 * Markdown for the places a pull request is actually read.
 *
 * One renderer, two destinations. The GitHub step summary and a PR comment want
 * the same numbers with different framing, and the numbers come from the same
 * verdicts the terminal report prints — so a discrepancy between what a
 * reviewer reads on the pull request and what the job log said is impossible by
 * construction rather than by care.
 *
 * Nothing here knows the name `GITHUB_STEP_SUMMARY`. The CLI writes a file; the
 * Action decides what that file is for. That keeps `trazum` a tool you can run
 * on your laptop and read the output of.
 */

/** GitHub rejects a comment body over 65,536 characters. */
export const MAX_COMMENT_CHARS = 60_000;

/** A step summary is capped at 1 MiB. Well under it, and honest when it trims. */
export const MAX_SUMMARY_CHARS = 900_000;

/**
 * A value fit to sit in a table cell.
 *
 * Three separate hazards, all of which turn a report into a broken table or a
 * lie about a filename:
 *
 * - A `|` ends the cell. It has to be escaped **even inside a code span** — GFM
 *   splits the row on pipes before it looks for spans.
 * - A backtick ends the code span, so the fence has to be longer than the
 *   longest run of backticks in the value.
 * - A newline ends the row. Anything vertical becomes a single space.
 *
 * Paths come from a repository, and on a pull request that means from whoever
 * opened it. `prompts/a|b\`\`.txt` is a legal filename.
 */
export function mdCell(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (flat === '') return '';

  const longestRun = Math.max(0, ...[...flat.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longestRun + 1);
  // A code span whose content starts or ends with a backtick needs padding
  // spaces, which GFM then strips back off.
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';

  return `${fence}${pad}${flat.replace(/\|/g, '\\|')}${pad}${fence}`;
}

/**
 * A value fit to sit inline in prose.
 *
 * For values that are *words* — a model's display name. Paths go through
 * `mdCell`, because a path is code and a code span is both safer and less ugly:
 * escaping every `.` and `-` turned `a.txt` into `a\.txt`, which renders
 * correctly and reads like a bug to anyone who sees the source.
 *
 * So the escaped set is only what can change meaning **mid-line**: emphasis,
 * code spans, links, autolinks and table cells. `#`, `-`, `+` and `.` are
 * block-level constructs that need to start a line to mean anything, and the
 * newline collapse above guarantees this value never does.
 */
export function mdText(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\`*_~[\]<>|])/g, '\\$1')
    .trim();
}

/** Truncates a body to fit, saying so rather than trailing off. */
export function fitWithin(body: string, limit: number, notice: string): string {
  if (body.length <= limit) return body;
  const room = limit - notice.length - 2;
  return `${body.slice(0, Math.max(0, room))}\n\n${notice}`;
}

export interface MarkdownFileVerdict {
  path: string;
  tokens: number;
  /** null when no budget covers this file. */
  maxTokens: number | null;
  /** The config pattern the budget came from, if any. */
  pattern: string | null;
  /** Only set when the file is over budget. */
  optimizedTokens: number | null;
}

export interface CheckMarkdownInput {
  /** The directory or file the run was pointed at. */
  target: string;
  verdicts: MarkdownFileVerdict[];
  level: RuleLevel;
  tokenSource: 'heuristic' | 'external';
  /** True when a walk limit stopped the run early. */
  truncated: boolean;
  t: CliMessages;
}

const overBudget = (v: MarkdownFileVerdict): boolean =>
  v.maxTokens !== null && v.tokens > v.maxTokens;

/**
 * The check report as markdown.
 *
 * The table is the whole point, so it comes first and the prose comes after. A
 * reviewer scanning a comment reads the rows and stops.
 */
export function renderCheckMarkdown(input: CheckMarkdownInput): string {
  const { target, verdicts, level, tokenSource, truncated, t } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const md = t.markdown;

  const failures = verdicts.filter(overBudget);
  const unbudgeted = verdicts.filter((v) => v.maxTokens === null);
  // The verdict counts what was *measured*, not what was listed. "All 3 prompts
  // are within budget" over a set where one had no budget claims something about
  // that file which nobody established — and the unbudgeted note below is the
  // honest half of the same sentence.
  const measured = verdicts.length - unbudgeted.length;

  const lines: string[] = [];
  lines.push(`### ${md.checkHeading(mdCell(target))}`);
  lines.push('');
  lines.push(
    failures.length > 0
      ? `**${md.overBudget(failures.length, measured)}**`
      : md.allWithin(measured),
  );
  lines.push('');
  lines.push(`| | ${md.columnFile()} | ${md.columnTokens()} | ${md.columnBudget()} |`);
  lines.push('|:--:|---|--:|--:|');

  for (const v of verdicts) {
    const mark = v.maxTokens === null ? '–' : overBudget(v) ? '❌' : '✅';
    const budget = v.maxTokens === null ? md.noBudget() : n(v.maxTokens);
    lines.push(`| ${mark} | ${mdCell(v.path)} | ${n(v.tokens)} | ${budget} |`);
  }

  lines.push('');

  // Advice belongs under the table, once, rather than inside a cell where it
  // would either be truncated or wreck the column widths.
  const actionable = failures.filter((v) => v.optimizedTokens !== null);
  if (actionable.length > 0) {
    lines.push(`#### ${md.whatWouldHelp()}`);
    lines.push('');
    for (const v of actionable) {
      const fits = v.optimizedTokens! <= v.maxTokens!;
      lines.push(
        `- ${mdCell(v.path)} — ${
          fits
            ? md.wouldFit(level, n(v.optimizedTokens!))
            : md.stillTooBig(n(v.optimizedTokens!))
        }`,
      );
    }
    lines.push('');
  }

  if (unbudgeted.length > 0) {
    // Named, not hidden. A prompt outside every pattern is not being watched,
    // and a report that omits that reads as "everything is fine".
    lines.push(md.unbudgetedNote(unbudgeted.length));
    lines.push('');
  }

  if (truncated) {
    lines.push(`> [!WARNING]`);
    lines.push(`> ${md.truncated()}`);
    lines.push('');
  }

  lines.push(
    `<sub>${md.footer(
      tokenSource === 'external' ? md.sourceExact() : md.sourceEstimated(),
      level,
    )}</sub>`,
  );

  return lines.join('\n');
}

export interface DiffMarkdownInput {
  comparison: PromptComparison;
  beforePath: string;
  afterPath: string;
  /** True when the figures came from the optimised text rather than as written. */
  optimized: boolean;
  locale: Locale;
  t: CliMessages;
}

/**
 * The diff report as markdown.
 *
 * Carries the sign convention into the heading, because this is the one place a
 * reader arrives with no context: every number is `after - before`, and positive
 * means worse. Getting that wrong in a PR comment would be worse than not
 * commenting.
 */
export function renderDiffMarkdown(input: DiffMarkdownInput): string {
  const { comparison, beforePath, afterPath, optimized, locale, t } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const md = t.markdown;
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${n(value)}`;

  const grew = comparison.tokenDelta > 0;
  const mark = grew ? '⚠️' : comparison.tokenDelta < 0 ? '✅' : '➖';

  const lines: string[] = [];
  lines.push(`### ${md.diffHeading(mdCell(beforePath), mdCell(afterPath))}`);
  lines.push('');
  if (optimized) {
    lines.push(`_${md.measuringOptimised()}_`);
    lines.push('');
  }
  lines.push(`| | ${md.columnMetric()} | ${md.columnChange()} |`);
  lines.push('|:--:|---|--:|');
  lines.push(
    `| ${mark} | ${md.metricTokens(n(comparison.tokensBefore), n(comparison.tokensAfter))} | ${signed(
      comparison.tokenDelta,
    )} (${signed(Math.round(comparison.deltaPct))}%) |`,
  );
  lines.push(
    `| 💰 | ${mdText(
      md.metricMonthly(
        n(comparison.usage.callsPerMonth),
        getModel(comparison.usage.model).displayName,
      ),
    )} | ${formatSignedUsd(comparison.monthlyDeltaUsd)} |`,
  );
  lines.push('');
  lines.push(`<sub>${md.deltaConvention()}</sub>`);
  lines.push('');

  const copy = getMessages(locale).rules;
  const { rules, advisories } = comparison;

  if (advisories.appeared.length > 0) {
    lines.push(`> [!WARNING]`);
    lines.push(`> **${md.advisoriesAppeared()}**`);
    for (const id of advisories.appeared) lines.push(`> - \`${id}\``);
    lines.push('');
  }
  if (advisories.resolved.length > 0) {
    lines.push(`**${md.advisoriesResolved()}**`);
    for (const id of advisories.resolved) lines.push(`- \`${id}\``);
    lines.push('');
  }
  if (rules.newlyFiring.length > 0) {
    lines.push(`**${md.rulesNewlyFiring()}**`);
    for (const id of rules.newlyFiring) lines.push(`- ${mdText(copy[id].title)}`);
    lines.push('');
  }
  if (rules.noLongerFiring.length > 0) {
    lines.push(`**${md.rulesNoLongerFiring()}**`);
    for (const id of rules.noLongerFiring) lines.push(`- ${mdText(copy[id].title)}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Wraps a report for a pull request comment.
 *
 * **Collapsed when there is nothing wrong**, and that is the decision worth
 * defending. A green table that stays green on every push is the thing a
 * maintainer learns to skip — and once they skip it, they skip the red one too.
 * Expanded means something needs reading.
 *
 * The marker is an HTML comment, invisible in the rendered comment and stable
 * across pushes, so the poster can find its own previous comment and replace it
 * rather than adding another. `key` separates two runs that legitimately post
 * about different things in the same pull request.
 */
export function wrapForComment(
  body: string,
  options: { marker: string; ok: boolean; title: string; collapsedNote: string; trimNotice: string },
): string {
  const { marker, ok, title, collapsedNote, trimNotice } = options;
  const inner = fitWithin(body, MAX_COMMENT_CHARS - 400, trimNotice);

  if (!ok) return `${marker}\n\n${inner}`;

  return [
    marker,
    '',
    `<details>`,
    `<summary>✅ ${title} — ${collapsedNote}</summary>`,
    '',
    inner,
    '',
    `</details>`,
  ].join('\n');
}

/**
 * The invisible anchor a comment is found by on the next push.
 *
 * The key reaches an HTML comment, so it is reduced to alphanumerics and single
 * separators: runs collapse, edges are trimmed, and a key with nothing usable in
 * it falls back to `default`. That leaves no `--` in the output at all, which
 * takes the whole `-->` question off the table rather than reasoning about
 * whether a particular arrangement of dashes happens to be safe.
 */
export function commentMarker(key: string): string {
  const safe = key
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  const usable = /[A-Za-z0-9]/.test(safe) ? safe : 'default';
  return `<!-- trazum-report:${usable} -->`;
}
