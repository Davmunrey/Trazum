import { profileUsage } from '@trazum/core';
import type { PricingCatalogue } from '@trazum/core';

import type { CommitTimes } from './git.js';

/**
 * `trazum bill --git-range`: what was spent in this repository's sessions
 * between the first and the last commit of a range (#777).
 *
 * It is a narrower claim than "what the change cost", and the narrowing is the
 * point. The transcripts say when each call was made and which session made it.
 * They do not say which commit the work was for, and nothing here asks them to.
 * What is measured is **everything recorded in this repository's project during
 * the span**: a morning spent on something else in the same repository is in it,
 * and work for the change done on another machine is not.
 *
 * **How "this repository's project" is told, without reading a branch or a path
 * out of a transcript.** Claude Code keeps one folder per project and names it
 * by the project's absolute path with every character that is not a letter or a
 * digit written as `-`. That encoding cannot be undone (see `projectLabelFor`
 * in `index.ts`), but it can be *done*: git says where this repository's root
 * is, the same encoding is applied to that path here, and the folder is this
 * repository's when the two names are equal. Nothing is decoded and nothing in
 * a transcript is read for it: the label every record already carries came from
 * the name of the folder the file was found in, and the root comes from git.
 * A session started in a subdirectory, or in a worktree of the repository, sits
 * in a folder of another name and is not matched; that is a miss named in the
 * documentation, not a guess.
 *
 * **Sessions that cross an edge are not added in.** A session is inside when its
 * first and last call both fall in the window, outside when neither does, and
 * straddling when it began before the first commit or went on after the last.
 * The figure is the sessions inside. Each straddling session is named, with the
 * part of it inside the window and the part outside, and none of it is added to
 * the figure, because half a session says nothing about which half the change
 * needed. The reader adds what they judge to belong.
 */

/** The span of a range of commits: the earliest time any of them was written to the latest it was committed. */
export interface RangeWindow {
  fromMs: number;
  toMs: number;
  commits: number;
}

/**
 * The span from the earliest author or commit time to the latest.
 *
 * Both times, because they differ exactly when it matters: a commit rebased
 * onto `main` yesterday was written last week, and the work happened last week.
 * `null` for an empty range, which has no span.
 */
export function windowOf(times: readonly CommitTimes[]): RangeWindow | null {
  if (times.length === 0) return null;
  const all = times.flatMap((t) => [t.authorMs, t.committerMs]);
  return { fromMs: Math.min(...all), toMs: Math.max(...all), commits: times.length };
}

/**
 * The name Claude Code gives a project folder for a repository at `root`, less
 * the leading dashes the label shows without (see `projectLabelFor`). It is an
 * encoding of a path that git supplied; it is never decoded back.
 */
export function projectLabelOfRoot(root: string): string {
  const encoded = root.replace(/[^A-Za-z0-9]/g, '-');
  const trimmed = encoded.replace(/^-+/, '');
  return trimmed !== '' ? trimmed : encoded;
}

/** One session that began before the window or went on after it, with what each side cost. */
export interface StraddlingSession {
  session: string;
  firstMs: number;
  lastMs: number;
  insideUsd: number;
  insideCalls: number;
  outsideUsd: number;
  outsideCalls: number;
}

export interface RangeBill {
  window: RangeWindow;
  /** Records of this project's folder, dated or not: none means nothing was matched at all. */
  projectRecords: number;
  /** Sessions whose every call is inside the window: the figure. */
  inside: { usd: number; calls: number; sessions: number; unpricedCalls: number };
  straddling: StraddlingSession[];
  /** Calls of sessions that were wholly before or after the window, not counted. */
  outsideCalls: number;
  /** What was read and could not be placed in this project or in this window. */
  leftOut: { otherProjects: number; otherSources: number; undated: number };
}

interface Rec {
  line: string;
  ms: number;
  session: string;
}

const priced = (lines: readonly string[], catalogue: PricingCatalogue): { usd: number; calls: number; unpriced: number } => {
  if (lines.length === 0) return { usd: 0, calls: 0, unpriced: 0 };
  const report = profileUsage(lines.join('\n'), { catalogue });
  return { usd: report.total.totalUsd, calls: report.total.calls, unpriced: report.unpriced.calls };
};

/**
 * Splits the records of one project against the window and prices each part.
 *
 * `claudeCodeLines` are the usage-log records of the Claude Code transcripts,
 * each carrying the label of its project folder. A record whose label is not
 * `project` is another project's and is counted out, not read further.
 * `otherSources` is how many records came from anywhere else (Codex, Gemini
 * CLI, a log): they carry no project folder this can match, so they are named
 * as left out and never guessed at.
 */
export function billRange(input: {
  claudeCodeLines: readonly string[];
  otherSources: number;
  project: string;
  window: RangeWindow;
  catalogue: PricingCatalogue;
}): RangeBill {
  const { window, catalogue } = input;
  const leftOut = { otherProjects: 0, otherSources: input.otherSources, undated: 0 };

  const bySession = new Map<string, Rec[]>();
  let anonymous = 0;
  let projectRecords = 0;
  for (const line of input.claudeCodeLines) {
    let record: { ts?: unknown; session?: unknown; label?: unknown };
    try {
      record = JSON.parse(line) as typeof record;
    } catch {
      continue;
    }
    if (record.label !== input.project) {
      leftOut.otherProjects += 1;
      continue;
    }
    projectRecords += 1;
    const ms = typeof record.ts === 'string' ? Date.parse(record.ts) : Number.NaN;
    if (Number.isNaN(ms)) {
      leftOut.undated += 1;
      continue;
    }
    /* A call that names no session is a session of one call: it cannot cross an edge. */
    const session = typeof record.session === 'string' && record.session !== '' ? record.session : `\u0000${anonymous++}`;
    const own = bySession.get(session) ?? [];
    own.push({ line, ms, session });
    bySession.set(session, own);
  }

  const insideLines: string[] = [];
  let insideSessions = 0;
  let outsideCalls = 0;
  const straddling: StraddlingSession[] = [];
  const within = (ms: number): boolean => ms >= window.fromMs && ms <= window.toMs;

  for (const [session, records] of bySession) {
    const firstMs = Math.min(...records.map((r) => r.ms));
    const lastMs = Math.max(...records.map((r) => r.ms));
    if (within(firstMs) && within(lastMs)) {
      insideSessions += 1;
      for (const r of records) insideLines.push(r.line);
    } else if (lastMs < window.fromMs || firstMs > window.toMs) {
      outsideCalls += records.length;
    } else {
      const inside = priced(records.filter((r) => within(r.ms)).map((r) => r.line), catalogue);
      const outside = priced(records.filter((r) => !within(r.ms)).map((r) => r.line), catalogue);
      straddling.push({
        session,
        firstMs,
        lastMs,
        insideUsd: inside.usd,
        insideCalls: inside.calls + inside.unpriced,
        outsideUsd: outside.usd,
        outsideCalls: outside.calls + outside.unpriced,
      });
    }
  }
  straddling.sort((a, b) => a.firstMs - b.firstMs || (a.session < b.session ? -1 : 1));

  const total = priced(insideLines, catalogue);
  return {
    window,
    projectRecords,
    inside: { usd: total.usd, calls: total.calls, sessions: insideSessions, unpricedCalls: total.unpriced },
    straddling,
    outsideCalls,
    leftOut,
  };
}
