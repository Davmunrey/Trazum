import type { CliMessages } from './i18n/index.js';
import type { Revision } from './git.js';
import type { Locale, PromptComparison, PromptProfile, RuleLevel } from '@trazum/core';
import { formatSignedUsd, formatUsd, getMessages, getModel } from '@trazum/core';

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
