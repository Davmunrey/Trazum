import type { CliMessages } from './i18n/index.js';
import type { Revision } from './git.js';
import type {
  BaselineBreach,
  BaselineComparison,
  Locale,
  PromptComparison,
  PromptProfile,
  RuleLevel,
} from '@trazum/core';
import { TTL_1H_MS, UNLABELLED, formatSignedUsd, formatUsd, getMessages, getModel, sharesOf } from '@trazum/core';
import { dayOf, formatGap, median, spanDays } from './time.js';
import type { AgainstDriver, BillLevers, CacheEconomics, ContextPressure, RepriceReport, UsageProfileReport } from '@trazum/core';

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
 * Paths come from a repository, and on a pull request that means from whoever
 * opened it. `prompts/a|b``c\|d.txt` is a legal POSIX filename, and each of
 * those characters breaks a markdown table in its own way.
 *
 * **This emits `<code>` with HTML entities rather than a backtick span, and the
 * reason is that the entity version has no failure mode to reason about.** The
 * first version did the obvious thing — wrap in backticks, escape `|` as `\|`,
 * widen the fence past the longest backtick run — and CodeQL was right to flag
 * it: it did not handle a backslash. Given `a\|b.txt` it emitted `` `a\\|b.txt` ``,
 * and whether that survives depends on whether the row splitter reads `\\|` as
 * an escaped pipe or as an escaped backslash followed by a live one. It happens
 * to work in cmark-gfm today. An escaper whose correctness rests on that is not
 * an escaper.
 *
 * With entities there is **no `|` character in the output at all**, so the row
 * cannot split under any scanner; backticks inside `<code>` are literal, so the
 * fence arithmetic disappears; and a backslash needs no treatment. Three hazard
 * classes collapse into one rule: encode `&`, `<`, `>` and `|`.
 *
 * Newlines still have to go — anything vertical ends the row — so they become a
 * single space.
 */
export function mdCell(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (flat === '') return '';

  const encoded = flat
    // `&` first, or it would double-encode the entities added below.
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;');

  return `<code>${encoded}</code>`;
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

/**
 * Untrusted **prose** in a table cell.
 *
 * `mdCell` is for values that are code — a path, a sha — and it says so by
 * wrapping them in `<code>`. A commit subject and an author's name are neither.
 * Rendering `<code>David Muñoz Rey</code>` in a table typesets somebody's name as
 * a code span, and `<code>fix: the rules only trimmed in two languages</code>`
 * does the same to a sentence. Both were wrong in the first draft of the blame
 * report, and only visible once it was rendered.
 *
 * The safety is `mdCell`'s, unchanged, for the same reason: **entities, so there
 * is no `|` in the output at all** and the row cannot split under any scanner.
 * `mdText`'s backslash escaping is complete and would also survive a cell, but it
 * puts the correctness on a reader's ability to see that `\\\|` is an escaped
 * backslash followed by an escaped pipe. Nothing here should need that.
 *
 * Then the inline-markdown set on top, which `mdCell` does not need because
 * backticks make its content literal. A subject reading `fix *everything*` would
 * otherwise arrive in italics, and two backticks in one would open a code span —
 * cosmetic rather than dangerous, and still not what the author wrote.
 */
export function mdTextCell(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (flat === '') return '';

  return (
    flat
      // `&` first, or it would double-encode the entities added below.
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '&#124;')
      // Applied last, and deliberately not including `|`, `<` or `>`: those are
      // already entities by this point and have no character left to escape.
      .replace(/([\\`*_~[\]])/g, '\\$1')
  );
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

/**
 * The cost diff, when the run had a baseline to compare against.
 *
 * Everything here is already computed by the time the report is rendered; this
 * carries it rather than recomputing, so the comment on a pull request and the
 * exit code can never disagree about whether the branch got more expensive.
 */
export interface BaselineMarkdown {
  comparison: BaselineComparison;
  breached: BaselineBreach[];
  /** Recomputed monthly cost, and whether it is comparable to the baseline's. */
  money: { before: number; after: number; comparable: boolean };
  /** The file to re-record, named so the reader can act without looking it up. */
  path: string;
}

export interface CheckMarkdownInput {
  /** The directory or file the run was pointed at. */
  target: string;
  verdicts: MarkdownFileVerdict[];
  level: RuleLevel;
  tokenSource: 'heuristic' | 'external';
  /** True when a walk limit stopped the run early. */
  truncated: boolean;
  /** Absent when no baseline governed the run. */
  baseline?: BaselineMarkdown;
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
/**
 * The baseline half of a check report.
 *
 * Only the directions that cost money are itemised — a list of every file that
 * shrank buries the two rows a reviewer has to act on. Shrinking still gets its
 * headline, because a branch that made things cheaper deserves to say so.
 */
function baselineBlock(baseline: BaselineMarkdown, t: CliMessages): string[] {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const md = t.markdown;
  const { comparison, breached, money } = baseline;
  const pct = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${n(value)}`;

  const lines: string[] = [];

  const headline =
    comparison.delta === 0
      ? md.baselineUnchanged()
      : comparison.delta > 0
        ? md.baselineGrew(n(comparison.delta), pct(comparison.deltaPct))
        : md.baselineShrank(n(-comparison.delta), pct(comparison.deltaPct));

  if (breached.length > 0) {
    const limits = breached
      .map((breach) =>
        breach.kind === 'tokens'
          ? md.baselineLimitTokens(n(breach.limit))
          : md.baselineLimitPct(String(breach.limit)),
      )
      .join(', ');
    lines.push('> [!CAUTION]');
    lines.push(`> **${headline}** — ${md.baselineOverLimit(limits)}.`);
  } else {
    lines.push(`**${headline}.**`);
  }
  lines.push('');

  const moved = [...comparison.grown, ...comparison.added, ...comparison.removed];
  if (moved.length > 0) {
    lines.push(
      `| | ${md.columnFile()} | ${md.baselineColumnBefore()} | ${md.baselineColumnAfter()} | ${md.columnChange()} |`,
    );
    lines.push('|:--:|---|--:|--:|--:|');
    for (const change of comparison.grown) {
      lines.push(
        `| 📈 | ${mdCell(change.path)} | ${n(change.before)} | ${n(change.after)} | ${signed(change.delta)} |`,
      );
    }
    for (const change of comparison.added) {
      lines.push(
        `| 🆕 | ${mdCell(change.path)} | – | ${n(change.after)} | ${signed(change.delta)} |`,
      );
    }
    for (const change of comparison.removed) {
      lines.push(
        `| 🗑️ | ${mdCell(change.path)} | ${n(change.before)} | – | ${signed(change.delta)} |`,
      );
    }
    lines.push('');
  }

  // Money is shown when it means something and explained when it does not. A
  // delta across a reprice is two different measurements subtracted, which is
  // worse than no figure at all in a comment somebody will quote in a meeting.
  lines.push(
    money.comparable
      ? md.baselineMoney(
          formatUsd(money.before),
          formatUsd(money.after),
          formatSignedUsd(money.after - money.before),
        )
      : `_${md.baselineMoneyIncomparable()}_`,
  );
  lines.push('');

  if (breached.length > 0) {
    lines.push(md.baselineReRecord('trazum baseline', baseline.path));
    lines.push('');
  }

  return lines;
}

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

  /**
   * The cost diff leads.
   *
   * A reviewer reads the first two lines of a comment and scrolls past the rest.
   * "Does each file fit its ceiling" is the older question and the narrower one;
   * "did this branch make the repository more expensive" is what the pull request
   * is actually proposing, so it goes above the table rather than under it.
   */
  if (input.baseline) lines.push(...baselineBlock(input.baseline, t));

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

export interface RankMarkdownRow {
  path: string;
  profile: PromptProfile;
  /** Tokens the deterministic rules would take, at the level asked for. */
  recoverable: number;
  /** What those tokens cost per month under the usage profile. */
  recoverableUsd: number;
}

export interface RankMarkdownInput {
  /** The directory the run was pointed at. */
  root: string;
  ranked: readonly RankMarkdownRow[];
  level: RuleLevel;
  modelDisplayName: string;
  callsPerMonth: number;
  /** True when a walk limit stopped the run early. */
  truncated: boolean;
  /** Source files with no marker, skipped rather than aborting the run. */
  skipped: number;
  t: CliMessages;
}

/**
 * The ranking as markdown.
 *
 * Every string but the heading comes from `t.rank`, the same object the terminal
 * report reads. That is not tidiness — a second copy of "there is no score" is a
 * second thing to keep true, and the first time somebody softens one of these
 * sentences they will soften the copy they happened to be looking at.
 *
 * **Money and tokens stay in adjacent columns**, as in the terminal, and for the
 * reason the terminal has them: four prompts reading `$0.25` looked like four
 * equivalent jobs when three of them recovered a single token. A pull request
 * comment is where that misreading would do the most damage, because nobody
 * reading one has the file open.
 */
export function renderRankMarkdown(input: RankMarkdownInput): string {
  const { root, ranked, level, modelDisplayName, callsPerMonth, truncated, skipped, t } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const cols = t.rank.columns;

  const lines: string[] = [];
  lines.push(`### ${t.markdown.rankHeading(mdCell(root), ranked.length)}`);
  lines.push('');
  lines.push(t.rank.subheading(mdText(modelDisplayName), n(callsPerMonth)));
  lines.push('');
  lines.push(
    `| ${cols.recoverable} | ${cols.tokensBack} | ${cols.tokens} | ${cols.density} | ${cols.notes} |`,
  );
  lines.push('|--:|--:|--:|--:|---|');

  for (const entry of ranked) {
    const { profile } = entry;
    const notes: string[] = [];
    if (profile.examples > 0) {
      notes.push(t.rank.noteExamples(profile.examples, n(profile.exampleTokens)));
    }
    if (profile.formatTokens > 0) notes.push(t.rank.noteFormat(n(profile.formatTokens)));
    const protectedShare = profile.tokens === 0 ? 0 : profile.protectedTokens / profile.tokens;
    if (protectedShare >= 0.25) notes.push(t.rank.noteProtected(Math.round(protectedShare * 100)));

    // The path is `<code>`; the notes are prose in the same cell. Two escapers
    // in one cell because they are two kinds of value, and `mdCell` on a whole
    // sentence would entity-encode punctuation nobody needs encoded.
    const note = notes.length > 0 ? ` — ${mdTextCell(notes.join(', '))}` : '';
    lines.push(
      `| ${formatUsd(entry.recoverableUsd)} | ${n(entry.recoverable)} | ${n(profile.tokens)} | `
      + `${profile.tokensPerSentence.toFixed(1)} | ${mdCell(entry.path)}${note} |`,
    );
  }

  lines.push('');

  if (truncated) {
    lines.push('> [!WARNING]');
    lines.push(`> ${t.check.walkTruncated()}`);
    lines.push('');
  }

  // Named rather than silent, exactly as in the terminal: a repository where
  // most prompts live in code would otherwise show a short list and read as the
  // whole picture.
  if (skipped > 0) {
    lines.push(t.rank.skipped(skipped));
    lines.push('');
  }

  lines.push(`<sub>${mdText(t.rank.densityNote())}</sub>`);
  lines.push('');
  lines.push(`<sub>${mdText(t.rank.recoverableNote())} ${t.markdown.rankLevel(level)}</sub>`);

  return lines.join('\n');
}

export interface BlameMarkdownRow {
  revision: Revision;
  /** `null` when the file did not exist at that commit, or held no marked prompt. */
  tokens: number | null;
  /** Tokens added since the previous (older) revision. `null` for the first. */
  delta: number | null;
  /** The name the file had at that commit, when it differs from today's. */
  name: string | null;
}

export interface BlameMarkdownInput {
  repoPath: string;
  rows: readonly BlameMarkdownRow[];
  truncated: boolean;
  /** The priced movement across the history, when a model was resolved. */
  netCost: { amount: string; modelDisplayName: string; callsPerMonth: number } | null;
  t: CliMessages;
}

/**
 * The token history as markdown.
 *
 * A rise is bold and a fall is not, which is the same asymmetry the terminal
 * makes with colour: growth is the thing somebody has to act on, and a report
 * that shouts equally about both trains the reader to ignore it.
 *
 * **Author and subject are the least trusted values this repository renders.**
 * They come from commit metadata, which on a pull request from a fork is written
 * by whoever opened it, and they land in a table on a page maintainers read. Both
 * go through `mdCell`, which emits entities rather than escapes — so there is no
 * `|` in the output to split a row and no backtick arithmetic to get wrong.
 */
export function renderBlameMarkdown(input: BlameMarkdownInput): string {
  const { repoPath, rows, truncated, netCost, t } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const cols = t.blame.columns;

  const measured = rows.filter((r): r is BlameMarkdownRow & { tokens: number } => r.tokens !== null);
  const newest = measured[0];
  const oldest = measured[measured.length - 1];

  const lines: string[] = [];
  lines.push(`### ${t.markdown.blameHeading(mdCell(repoPath))}`);
  lines.push('');
  lines.push(`| ${cols.when} | ${cols.tokens} | ${cols.change} | ${cols.who} | ${cols.commit} |`);
  lines.push('|---|--:|--:|---|---|');

  for (const row of rows) {
    const tokens = row.tokens === null ? t.blame.goneAt() : n(row.tokens);
    const change =
      row.delta === null
        ? row.tokens === null
          ? ''
          : t.blame.addedAt()
        : row.delta > 0
          ? `**+${n(row.delta)}**`
          : row.delta < 0
            ? n(row.delta)
            : '·';

    lines.push(
      `| ${row.revision.date.slice(0, 10)} | ${tokens} | ${change} | `
      + `${mdTextCell(row.revision.author)} | ${mdCell(row.revision.shortSha)} `
      + `${mdTextCell(row.revision.subject)} |`,
    );
  }

  lines.push('');

  if (truncated) {
    lines.push(t.blame.truncated(rows.length));
    lines.push('');
  }

  const renamed = rows.find((row) => row.name !== null);
  if (renamed?.name) {
    lines.push(t.blame.followedRename(mdCell(renamed.name)));
    lines.push('');
  }

  if (newest && oldest && newest !== oldest) {
    const delta = newest.tokens - oldest.tokens;
    const pct =
      oldest.tokens === 0
        ? '—'
        : `${delta >= 0 ? '+' : ''}${((delta / oldest.tokens) * 100).toFixed(0)}%`;
    lines.push(
      `**${t.blame.net(
        n(oldest.tokens),
        n(newest.tokens),
        `${delta >= 0 ? '+' : ''}${n(delta)}`,
        pct,
      )}**`,
    );
    lines.push('');

    // Priced by the caller, which owns the usage profile. Recomputing it here
    // would give a comment and a job log two chances to disagree about the same
    // history.
    if (netCost !== null) {
      lines.push(
        t.blame.netCost(
          netCost.amount,
          mdText(netCost.modelDisplayName),
          n(netCost.callsPerMonth),
        ),
      );
      lines.push('');
    }
  }

  // The single worst commit, which is the question the command is really for.
  const worst = rows
    .filter((row): row is BlameMarkdownRow & { delta: number } => row.delta !== null && row.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0];
  if (worst) {
    lines.push(`#### ${t.blame.biggestRise()}`);
    lines.push('');
    lines.push(
      `- ${t.blame.biggestRiseDetail(
        n(worst.delta),
        mdTextCell(worst.revision.author),
        mdTextCell(worst.revision.subject),
        mdCell(worst.revision.shortSha),
      )}`,
    );
    lines.push('');
  }

  lines.push(`<sub>${mdText(t.blame.estimateNote())}</sub>`);

  return lines.join('\n');
}

export interface ProfileMarkdownInput {
  report: UsageProfileReport;
  levers: BillLevers;
  cache: CacheEconomics;
  t: CliMessages;
  /**
   * The gate verdicts, when any gate was armed.
   *
   * They reached the terminal on stderr and stopped there, so a CI run
   * summary carried the whole report and not the one sentence explaining why
   * the build was red — the reader had to open the raw log to find it. These
   * arrive already rendered by the caller, which owns the thresholds and the
   * copy; this is a rendering and must not decide anything a gate decides.
   */
  gates?: { failed: boolean; lines: string[] };
  /**
   * `--markdown-summary`: the short form, for a pull-request body or a weekly
   * note rather than a full report.
   *
   * The person who owns the budget usually does not run the CLI, and handing
   * them the whole report is handing them a document to skim — where the one
   * figure that changed is as easy to miss as it was in the terminal. The
   * summary states what changed, the single lever worth the most, and stops.
   *
   * It is a *view*, never a different set of figures: every number in it is
   * taken from the same report the full rendering uses, so a reader who opens
   * both cannot find them disagreeing.
   */
  summary?: boolean;
  /**
   * The `--since`/`--until` values as the user typed them, when a window was
   * applied. Passed through rather than re-derived from `timeWindow`'s epoch
   * bounds, because a bare `--until 2026-08-14` includes that whole day —
   * rendering the internal exclusive bound would print the *next* day and
   * disagree with the terminal about which window this was.
   */
  window?: { since: string; until: string };
  /**
   * Passed only when the price table is old enough to matter, so the
   * threshold lives once, beside the terminal's. Rendered loud: staleness
   * does not name its own size the way a skipped line does.
   */
  stalePricing?: { date: string; days: number };
  /**
   * The comparison, when `--against` was given — the section the terminal
   * has had since 1.11 and the markdown did not, so a CI summary reporting
   * on two logs showed only one of them. The drivers arrive computed (core's
   * `driversBetween`) rather than derived here: the sign convention has one
   * implementation, and this is a rendering.
   */
  /**
   * The repricing, when `--what-if` was given. Arrives computed from core's
   * `repriceProfile` rather than derived here: three surfaces must not
   * disagree about what a move would cost, and this is a rendering.
   */
  whatIf?: RepriceReport | null;
  /**
   * The largest call against each model's window, computed once in the CLI —
   * like `whatIf` — because the ratio's denominator lives in the (possibly
   * overlaid) catalogue and a summary must not re-derive it differently.
   */
  pressure?: ContextPressure[];
  against?: {
    previousTotalUsd: number;
    previousCalls: number;
    labelDrivers: AgainstDriver[];
    modelDrivers: AgainstDriver[];
    /** True when both spans are known and intersect. */
    overlap: { from: string; to: string } | null;
    /** Nothing in the previous log could be priced — its own answer. */
    nothingPriced: boolean;
  };
}

/**
 * `trazum profile` as GitHub-flavoured markdown, for a job summary or a
 * pull-request comment.
 *
 * The terminal report is the source of truth and this reuses its message
 * catalogue line for line, because two renderings of the same finding drift the
 * moment they are worded twice — the sign conventions here (`positive means
 * worse` on the cache delta, ceilings that must be named as ceilings) have each
 * already produced a bug when restated by hand.
 *
 * A finding that only exists in a terminal is a finding the reader's tooling
 * never surfaces; this is the other half of the `--json` lesson, for humans
 * reading CI instead of machines.
 */
export function renderProfileMarkdown(input: ProfileMarkdownInput): string {
  const { report, levers, cache, t, window, stalePricing, against, whatIf, pressure = [], gates, summary = false } = input;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;
  const shares = sharesOf(report.total);
  const showLabel = (label: string): string =>
    label === UNLABELLED ? t.profile.unlabelled() : label;

  const lines: string[] = [];
  lines.push(`### ${t.profile.heading()}`);
  lines.push('');
  /**
   * The verdict first, when a gate was armed.
   *
   * A run summary that carried the whole report and not the sentence
   * explaining why the build is red made the reader open the raw log to find
   * it — which is the same failure the explanation itself exists to fix, one
   * surface further out. A failure is quoted so it survives being skimmed; a
   * pass is stated plainly and does not shout.
   */
  /**
   * The summary: what changed, the biggest lever, and nothing else.
   *
   * Returned before the full rendering rather than filtered out of it, so a
   * section added later cannot leak into the short form by forgetting to opt
   * out. Every figure here comes from the same report the long form uses.
   */
  if (summary) {
    const short: string[] = [];
    short.push(`### ${t.profile.heading()}`);
    short.push('');
    if (gates !== undefined && gates.lines.length > 0) {
      const [verdict] = gates.lines;
      short.push(gates.failed ? `> ❌ **${mdText(verdict!)}**` : `_${mdText(verdict!)}_`);
      short.push('');
    }
    short.push(`**${mdText(t.profile.spent(t.profile.calls(report.total.calls), formatUsd(report.total.totalUsd)))}**`);
    short.push('');
    // What changed, when there is a previous log to change from. Without one
    // the summary states the bill and says so, rather than implying stability
    // nobody measured.
    if (against !== undefined) {
      const delta = report.total.totalUsd - against.previousTotalUsd;
      const growthPct =
        against.previousTotalUsd > 0
          ? `${delta >= 0 ? '+' : ''}${((delta / against.previousTotalUsd) * 100).toFixed(1)}%`
          : '—';
      short.push(
        mdText(
          t.profile.againstTotals(
            formatUsd(against.previousTotalUsd),
            formatUsd(report.total.totalUsd),
            formatSignedUsd(delta),
            growthPct,
            t.profile.calls(against.previousCalls),
            t.profile.calls(report.total.calls),
          ),
        ),
      );
      short.push('');
      // The one driver that moved most — not five, because a summary that
      // lists everything is the report again with a shorter heading.
      const [driver] = against.labelDrivers;
      if (driver !== undefined) {
        const shown = driver.key === UNLABELLED ? t.profile.unlabelled() : driver.key;
        short.push(
          `- ${mdText(
            driver.was === null
              ? t.profile.againstDriverNew(formatSignedUsd(driver.delta), shown)
              : driver.now === null
                ? t.profile.againstDriverGone(formatSignedUsd(driver.delta), shown)
                : t.profile.againstDriver(formatSignedUsd(driver.delta), shown, formatUsd(driver.was), formatUsd(driver.now)),
          )}`,
        );
        short.push('');
      }
    } else {
      short.push(`_${mdText(t.profile.summaryNoComparison())}_`);
      short.push('');
    }
    // The single lever worth the most, with the hedge every lever carries.
    const [lever] = levers.slices;
    if (lever !== undefined) {
      short.push(
        `- ${mdText(
          t.profile.leverSlice(
            showLabel(lever.label),
            lever.modelName,
            formatUsd(lever.combinedUsd),
            pct(lever.shareOfBill),
          ),
        )}`,
      );
      short.push('');
    }
    short.push(`_${mdText(t.profile.summaryFooter())}_`);
    return short.join('\n');
  }

  if (gates !== undefined && gates.lines.length > 0) {
    // One mark, on the verdict. The lines under it explain that verdict and
    // are not themselves failures — marking each would turn one red build
    // into a wall of crosses and make the actual verdict harder to find.
    const [verdict, ...rest] = gates.lines;
    lines.push(gates.failed ? `> ❌ **${mdText(verdict!)}**` : `_${mdText(verdict!)}_`);
    for (const line of rest) lines.push(gates.failed ? `> ${mdText(line)}` : `_${mdText(line)}_`);
    lines.push('');
  }
  lines.push(`**${t.profile.spent(t.profile.calls(report.total.calls), formatUsd(report.total.totalUsd))}**`);
  lines.push('');
  // The span, under the same rule as the terminal: stated, never extrapolated,
  // with partial coverage said in the same breath.
  if (report.span !== null) {
    const totalParsed = report.total.calls + report.unpriced.calls;
    const partial =
      report.span.calls < totalParsed
        ? ` ${mdText(t.profile.spanPartial(n(report.span.calls), n(totalParsed)))}`
        : '';
    lines.push(
      `_${mdText(t.profile.spanLine(dayOf(report.span.fromMs), dayOf(report.span.toMs), spanDays(report.span.fromMs, report.span.toMs)))}${partial}_`,
    );
    lines.push('');
  }
  // The window before any figure, and the undated count loud — the same order
  // and the same volume as the terminal, for the same reasons.
  if (report.timeWindow !== null) {
    lines.push(`_${mdText(t.profile.windowLine(window?.since ?? '—', window?.until ?? '—'))}_`);
    lines.push('');
    if (report.timeWindow.undatedExcluded > 0) {
      lines.push(`> ⚠️ ${mdText(t.profile.windowUndated(report.timeWindow.undatedExcluded))}`);
      lines.push('');
    }
  }
  lines.push('| | USD | % | tokens |');
  lines.push('|---|---:|---:|---:|');
  const parts: Array<[string, number, number, number]> = [
    [t.profile.partInput(), report.total.inputUsd, shares.input, report.total.inputTokens],
    [t.profile.partCacheRead(), report.total.cacheReadUsd, shares.cacheRead, report.total.cacheReadTokens],
    [t.profile.partCacheWrite(), report.total.cacheWriteUsd, shares.cacheWrite, report.total.cacheWriteTokens],
    [t.profile.partOutput(), report.total.outputUsd, shares.output, report.total.outputTokens],
  ];
  for (const [name, usd, share, tokens] of parts) {
    // Catalogue text, not user data: no escaping into a code cell needed.
    lines.push(`| ${name} | ${formatUsd(usd)} | ${pct(share)} | ${n(tokens)} |`);
  }
  lines.push('');

  /**
   * A doubled bill, said before anything above is believed. A CI summary
   * showing a total nobody can trust is worse than one showing no total.
   */
  if (report.duplicateLines.count > 0) {
    lines.push(
      `> ⚠️ ${mdText(t.profile.duplicateLines(report.duplicateLines.count, formatUsd(report.duplicateLines.usd)))}`,
    );
    lines.push('');
  }

  // The most expensive day against the median day, loud past twice it — the
  // same sentence and the same yardstick the terminal prints.
  if (report.spendByDay.length >= 2) {
    const medianUsd = median(report.spendByDay.map((d) => d.usd));
    const peak = report.spendByDay.reduce((a, b) => (b.usd > a.usd ? b : a));
    if (medianUsd > 0) {
      const sentence = t.profile.dayPeak(peak.day, formatUsd(peak.usd), (peak.usd / medianUsd).toFixed(1));
      const labelClause =
        peak.topLabel !== null && report.byLabel.length > 1
          ? ` ${t.profile.dayPeakLabel(showLabel(peak.topLabel), formatUsd(peak.topLabelUsd))}`
          : '';
      const loud = peak.usd > 2 * medianUsd;
      lines.push(loud ? `> ⚠️ ${mdText(`${sentence}${labelClause}`)}` : `_${mdText(`${sentence}${labelClause}`)}_`);
      lines.push('');
    }

    /**
     * The series itself, most recent days last — the shape the peak sentence
     * summarises, for the reader who wants to see the week. Capped at 14
     * days with the earlier ones counted out loud: silent truncation reads
     * as "covered everything" when it did not.
     */
    const DAYS_SHOWN = 14;
    const shown = report.spendByDay.slice(-DAYS_SHOWN);
    lines.push(`| ${t.profile.dayTableDay()} | USD | ${t.profile.dayTableCalls()} | ${t.profile.dayTableTop()} |`);
    lines.push('|---|---:|---:|---|');
    for (const day of shown) {
      const top = day.topLabel === null ? '—' : mdTextCell(showLabel(day.topLabel));
      lines.push(`| ${day.day} | ${formatUsd(day.usd)} | ${n(day.calls)} | ${top} |`);
    }
    if (report.spendByDay.length > DAYS_SHOWN) {
      lines.push('');
      lines.push(`_${mdText(t.profile.dayTableEarlier(report.spendByDay.length - DAYS_SHOWN))}_`);
    }
    lines.push('');
  }

  lines.push(`#### ${t.profile.leversHeading()}`);
  lines.push('');
  if (levers.slices.length === 0) {
    lines.push(mdText(t.profile.leversNone()));
  } else {
    for (const slice of levers.slices.slice(0, 5)) {
      lines.push(
        `- **${mdText(t.profile.leverSlice(showLabel(slice.label), slice.modelName, formatUsd(slice.combinedUsd), pct(slice.shareOfBill)))}** — ${mdText(t.profile.leverCalls(t.profile.calls(slice.calls), formatUsd(slice.spentUsd)))}`,
      );
      if (slice.route) {
        lines.push(`  - ${mdText(t.profile.leverRoute(slice.route.candidate.displayName, formatUsd(slice.route.savingUsd)))}`);
      }
      if (slice.batch) {
        lines.push(`  - ${mdText(t.profile.leverBatch(formatUsd(slice.batch.savingUsd)))}`);
      }
    }
  }
  lines.push('');
  lines.push(`_${mdText(t.profile.leverPromptCeiling(formatUsd(levers.promptCeilingUsd), pct(levers.promptCeilingShare)))}_`);
  lines.push('');

  /**
   * The retry bill of truncation — loud in a summary, because the fix (a
   * max_tokens the answers fit in) is a one-line PR of its own.
   */
  for (const row of report.truncationRetries.slice(0, 3)) {
    lines.push(
      `> ⚠️ ${mdText(t.profile.truncationRetryLine(showLabel(row.label), row.modelName, n(row.retried), n(row.truncatedCalls), n(Math.round(row.withinMs / 1000)), formatUsd(row.wastedUsd), formatUsd(row.retryUsd)))}`,
    );
    lines.push('');
  }
  if (report.truncationRetries.length > 0) {
    lines.push(`_${mdText(t.profile.truncationRetryNote())}_`);
    lines.push('');
  }

  /**
   * The mix moving inside the log — same fifteen-point threshold as the
   * terminal, because two surfaces disagreeing about "moved" is a second
   * opinion nobody asked for.
   */
  if (report.modelMixDrift !== null) {
    const moved = report.modelMixDrift.models.filter(
      (m) => Math.abs(m.lastShare - m.firstShare) >= 0.15,
    );
    if (moved.length > 0) {
      lines.push(`#### ${t.profile.mixDriftHeading()}`);
      lines.push('');
      for (const m of moved.slice(0, 3)) {
        lines.push(
          `> ⚠️ ${mdText(t.profile.mixDriftLine(m.model, pct(m.firstShare), pct(m.lastShare), n(report.modelMixDrift.firstDays), n(report.modelMixDrift.lastDays), formatUsd(m.lastUsd)))}`,
        );
        lines.push('');
      }
      lines.push(`_${mdText(t.profile.mixDriftNote())}_`);
      lines.push('');
    }
  }

  /**
   * The ceiling in sight — loud in a summary from 85%, because the reader of
   * a PR comment is exactly the person who can cap the retrieval today.
   */
  {
    const pressures = pressure;
    if (pressures.length > 0) {
      lines.push(`#### ${t.profile.pressureHeading()}`);
      lines.push('');
      for (const row of pressures.slice(0, 3)) {
        const sentence = mdText(
          t.profile.pressureLine(showLabel(row.label), row.modelName, n(row.maxCallInputTokens), n(row.contextWindow), pct(row.share)),
        );
        lines.push(row.share >= 0.85 ? `> ⚠️ ${sentence}` : `- ${sentence}`);
        if (row.share >= 0.85) lines.push('');
      }
      if (pressures.some((row) => row.share >= 0.85)) {
        lines.push(`_${mdText(t.profile.pressureAdvice())}_`);
      }
      lines.push('');
    }
  }

  /**
   * The same request sent again — money that bought nothing the call before
   * it had not already paid for. Loud in a summary, and hedged in the same
   * words the terminal uses.
   */
  if (report.repeatedTurns.length > 0) {
    lines.push(`#### ${t.profile.repeatsHeading()}`);
    lines.push('');
    for (const row of report.repeatedTurns.slice(0, 3)) {
      lines.push(
        `> ⚠️ ${mdText(t.profile.repeatsFound(showLabel(row.label), row.modelName, n(row.repeats), n(row.checkedCalls), n(Math.round(row.withinMs / 1000)), formatUsd(row.usd)))}`,
      );
      lines.push('');
    }
    lines.push(`_${mdText(t.profile.repeatsAdvice())}_`);
    lines.push('');
  }

  /**
   * How big the calls are — the half of the bill the totals table can only
   * name. Same threshold and same two sentences as the terminal, because a
   * CI summary that summarises differently is a second opinion nobody asked
   * for.
   */
  if (report.inputShapes.length > 0) {
    lines.push(`#### ${t.profile.inputShapeHeading()}`);
    lines.push('');
    for (const shape of report.inputShapes.slice(0, 3)) {
      const who = showLabel(shape.label);
      if (shape.medianWithinTokens === null || shape.p95WithinTokens === null || shape.p95OverMedian === null) {
        lines.push(`- ${mdText(t.profile.inputHuge(who, shape.modelName, t.profile.calls(shape.calls), formatUsd(shape.inputUsd)))}`);
        continue;
      }
      const skewed = shape.p95OverMedian >= 4;
      lines.push(
        `- **${mdText(skewed
          ? t.profile.inputSkewed(who, shape.modelName, n(shape.medianWithinTokens), n(shape.p95WithinTokens), shape.p95OverMedian.toFixed(1), formatUsd(shape.inputUsd))
          : t.profile.inputEven(who, shape.modelName, n(shape.medianWithinTokens), n(shape.p95WithinTokens), formatUsd(shape.inputUsd)))}**`,
      );
      lines.push(`  - ${mdText(skewed ? t.profile.inputSkewedAdvice() : t.profile.inputEvenAdvice())}`);
      if (shape.cachedShare >= 0.5) {
        lines.push(`  - ${mdText(t.profile.inputMostlyCached(pct(shape.cachedShare)))}`);
      } else if (shape.cachedShare < 0.1) {
        lines.push(`  - ${mdText(t.profile.inputFullRate())}`);
      }
    }
    lines.push('');
  }

  /**
   * The repricing, with the assumption above the figure here too — a pull
   * request comment is exactly where a dollar amount with the caveat
   * underneath would be read as a recommendation and merged.
   */
  if (whatIf !== undefined && whatIf !== null) {
    lines.push(`#### ${t.profile.whatIfHeading(whatIf.target.displayName)}`);
    lines.push('');
    lines.push(`_${mdText(t.profile.whatIfAssumption())}_`);
    lines.push('');
    if (whatIf.slices.length === 0) {
      lines.push(mdText(t.profile.whatIfNothingToMove()));
      lines.push('');
    } else {
      lines.push(
        `**${mdText(t.profile.whatIfTotal(formatUsd(whatIf.currentUsd), formatUsd(whatIf.targetUsd), formatUsd(Math.abs(whatIf.deltaUsd))))}**`,
      );
      lines.push('');
      // The decision's other half, on the target's rates, never summed.
      if (whatIf.batchOnTarget !== null) {
        lines.push(`_${mdText(t.profile.whatIfBatchOnTarget(formatUsd(whatIf.batchOnTarget.targetUsd), formatUsd(whatIf.targetUsd)))}_`);
        lines.push('');
      }
      for (const slice of whatIf.slices.slice(0, 5)) {
        lines.push(`- ${mdText(t.profile.whatIfSlice(showLabel(slice.label), slice.model, formatUsd(slice.currentUsd), formatUsd(slice.targetUsd)))}`);
        // The cache-minimum caveat, in place — the row above flatters the move.
        if (slice.cacheBeyondTarget !== null) {
          lines.push(
            `  - ⚠️ ${mdText(t.profile.whatIfCacheBeyond(n(slice.maxCallInputTokens), n(slice.cacheBeyondTarget.minTokens), formatUsd(slice.cacheBeyondTarget.noCacheUsd)))}`,
          );
        }
      }
      lines.push('');
    }
    for (const slice of whatIf.overContext.slice(0, 3)) {
      lines.push(
        `> ⚠️ ${mdText(t.profile.whatIfOverContext(showLabel(slice.label), n(slice.maxCallInputTokens), n(whatIf.target.contextWindow), formatUsd(slice.currentUsd)))}`,
      );
      lines.push('');
    }
    if (whatIf.alreadyOnTarget.calls > 0) {
      lines.push(`_${mdText(t.profile.whatIfAlreadyThere(t.profile.calls(whatIf.alreadyOnTarget.calls), formatUsd(whatIf.alreadyOnTarget.usd)))}_`);
      lines.push('');
    }
    if (whatIf.unpricedCalls > 0) {
      lines.push(`_${mdText(t.profile.whatIfUnpriced(t.profile.calls(whatIf.unpricedCalls), whatIf.unpricedModels.join(', ')))}_`);
      lines.push('');
    }
  }

  // The cache verdict, with the same refusal to answer an unsettled question.
  const unsettled = cache.worstCaseVerdict !== cache.verdict && report.total.assumedWriteTtlCalls > 0;
  if (unsettled) {
    lines.push(`> ⚠️ ${mdText(t.profile.cacheTtlUnsettled(report.total.assumedWriteTtlCalls, formatUsd(-cache.deltaUsd), formatUsd(cache.worstCaseDeltaUsd)))}`);
    lines.push('');
  } else if (cache.verdict === 'lost-money') {
    lines.push(`> ⚠️ ${mdText(t.profile.cacheLost(formatUsd(cache.deltaUsd), n(report.total.cacheWriteTokens), n(report.total.cacheReadTokens)))}`);
    lines.push('');
  } else if (cache.verdict === 'paid-off') {
    lines.push(mdText(t.profile.cachePaidOff(formatUsd(-cache.deltaUsd))));
    lines.push('');
  }

  // Whether the TTL fits the gaps — the mechanism behind the verdict above,
  // with the two failing verdicts loud and the rest quiet, as on the terminal.
  for (const fit of report.cacheTtlFit.slice(0, 3)) {
    const who = showLabel(fit.label);
    const gap = formatGap(fit.medianGapMs);
    const sentence =
      fit.verdict === 'expires-before-reuse'
        ? fit.medianGapMs > TTL_1H_MS
          ? t.profile.ttlFitExpiresBoth(who, fit.modelName, gap)
          : t.profile.ttlFitExpires(who, fit.modelName, gap)
        : fit.verdict === 'overlong-ttl'
          ? t.profile.ttlFitOverlong(who, fit.modelName, gap, formatUsd(fit.overpayUsd))
          : fit.verdict === 'unsettled'
            ? t.profile.ttlFitUnsettledGap(who, fit.modelName, gap)
            : t.profile.ttlFitFits(who, fit.modelName, gap);
    const loud = fit.verdict === 'expires-before-reuse' || fit.verdict === 'overlong-ttl';
    lines.push(loud ? `> ⚠️ ${mdText(sentence)}` : `_${mdText(sentence)}_`);
    lines.push('');
  }

  // Conversations that never came back: the fact loud, the ceiling quiet —
  // decided by the slice's own reads, exactly as on the terminal.
  const readsBySlice = new Map(
    report.byLabelAndModel.map((r) => [`${r.label}\n${r.model}`, r.breakdown.cacheReadTokens]),
  );
  for (const row of report.singleTurnCacheWrites.slice(0, 3)) {
    const who = showLabel(row.label);
    const reads = readsBySlice.get(`${row.label}\n${row.model}`) ?? 0;
    const sentence =
      reads === 0
        ? t.profile.singleTurnConfirmed(who, row.modelName, n(row.singleTurnSessions), n(row.sessions), formatUsd(row.singleTurnWriteUsd))
        : t.profile.singleTurnCeiling(who, row.modelName, n(row.singleTurnSessions), n(row.sessions), formatUsd(row.singleTurnWriteUsd));
    lines.push(reads === 0 ? `> ⚠️ ${mdText(sentence)}` : `_${mdText(sentence)}_`);
    lines.push('');
  }

  for (const growth of report.conversations.slice(0, 3)) {
    lines.push(
      `- ${mdText(t.profile.historyGrowth(showLabel(growth.label), growth.modelName, n(Math.round(growth.minTurnTokens)), n(Math.round(growth.maxTurnTokens)), n(growth.longestSession)))} ${mdText(t.profile.historyCeiling(formatUsd(growth.growthUsd), pct(growth.shareOfBill), formatUsd(growth.flatUsd), formatUsd(growth.inputUsd)))}`,
    );
  }
  if (report.conversations.length > 0) lines.push('');

  if (report.total.truncatedCalls > 0 && report.total.outputUsd > 0) {
    lines.push(
      `> ⚠️ ${mdText(t.profile.truncatedWaste(t.profile.calls(report.total.truncatedCalls), formatUsd(report.total.truncatedOutputUsd), pct(report.total.truncatedOutputUsd / report.total.outputUsd)))}`,
    );
    lines.push('');
    // The suspects, with the rate over calls that measured — the terminal's
    // denominator, because a workload logging the field half the time is not
    // one whose other half completed.
    const truncatedLabels = report.byLabel
      .filter((row) => row.breakdown.truncatedCalls > 0)
      .sort((a, b) => b.breakdown.truncatedOutputUsd - a.breakdown.truncatedOutputUsd);
    if (truncatedLabels.length > 0 && report.byLabel.length > 1) {
      for (const row of truncatedLabels.slice(0, 3)) {
        lines.push(
          `- ${mdText(t.profile.truncatedBy(showLabel(row.label), n(row.breakdown.truncatedCalls), n(row.breakdown.stopReasonCalls), pct(row.breakdown.truncatedCalls / row.breakdown.stopReasonCalls), formatUsd(row.breakdown.truncatedOutputUsd)))}`,
        );
      }
      lines.push('');
    }
    const truncationCeiling = report.outputShapes.find((shape) => shape.p95WithinTokens !== null);
    if (truncationCeiling !== undefined) {
      lines.push(`_${mdText(t.profile.truncatedCeiling(n(truncationCeiling.p95WithinTokens!)))}_`);
      lines.push('');
    }
  }

  /**
   * This bill against the previous one. The convention prints before the
   * first figure it governs, and the overlap warning between the figure and
   * the drivers built from it — the terminal's order, for the terminal's
   * reason: a caveat below a number is a number somebody already acted on.
   */
  if (against !== undefined) {
    lines.push(`#### ${t.profile.againstHeading()}`);
    lines.push('');
    if (against.nothingPriced) {
      lines.push(mdText(t.profile.againstNothingPriced()));
      lines.push('');
    } else {
      const delta = report.total.totalUsd - against.previousTotalUsd;
      const growthPct =
        against.previousTotalUsd > 0
          ? `${delta >= 0 ? '+' : ''}${((delta / against.previousTotalUsd) * 100).toFixed(1)}%`
          : '—';
      lines.push(
        `**${mdText(t.profile.againstTotals(formatUsd(against.previousTotalUsd), formatUsd(report.total.totalUsd), formatSignedUsd(delta), growthPct, t.profile.calls(against.previousCalls), t.profile.calls(report.total.calls)))}**`,
      );
      lines.push('');
      if (against.overlap !== null) {
        lines.push(`> ⚠️ ${mdText(t.profile.againstOverlap(against.overlap.from, against.overlap.to))}`);
        lines.push('');
      }
      const describe = (driver: AgainstDriver, shown: string): string =>
        driver.was === null
          ? t.profile.againstDriverNew(formatSignedUsd(driver.delta), shown)
          : driver.now === null
            ? t.profile.againstDriverGone(formatSignedUsd(driver.delta), shown)
            : t.profile.againstDriver(formatSignedUsd(driver.delta), shown, formatUsd(driver.was), formatUsd(driver.now));
      for (const driver of against.labelDrivers.slice(0, 5)) {
        lines.push(`- ${mdText(describe(driver, showLabel(driver.key)))}`);
      }
      if (against.modelDrivers.length > 0) {
        lines.push('');
        lines.push(`_${mdText(t.profile.againstByModel())}_`);
        for (const driver of against.modelDrivers.slice(0, 3)) {
          lines.push(`- ${mdText(describe(driver, driver.key))}`);
        }
      }
      lines.push('');
    }
  }

  // The provenance caveat before the data gaps: a stale table qualifies every
  // dollar above, and it does not name its own size the way a skipped line does.
  if (stalePricing !== undefined) {
    lines.push(`> ⚠️ ${mdText(t.profile.pricesStale(stalePricing.date, stalePricing.days))}`);
    lines.push('');
  }
  if (report.unpricedModels.length > 0) {
    lines.push(`> ⚠️ ${mdText(t.profile.unpriced(report.unpricedModels.join(', '), report.unpriced.calls))}`);
    lines.push('');
  }
  if (report.skippedLines.length > 0) {
    const shown = report.skippedLines.slice(0, 5).join(', ');
    lines.push(`_${mdText(t.profile.skipped(report.skippedLines.length, report.skippedLines.length > 5 ? `${shown}…` : shown))}_`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
