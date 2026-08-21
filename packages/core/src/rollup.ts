/**
 * Several records, one roll-up, and every contributor's gaps still visible.
 *
 * Everything else in this repository assumes one operator with files on disk.
 * `--by-source` and `owners` divide a bill somebody already collected;
 * `fleetRollup` compares services whose logs one machine could open. None of
 * them answers the question a team actually has: **four people measured four
 * things, and nobody wants to email logs around.**
 *
 * So this module merges *documents*, not logs. Each contributor runs
 * `trazum profile --json` wherever their traffic already is, and hands over a
 * profile document — which carries no prompt text, no completion text, no
 * session keys and no credentials, and never has. The roll-up is a format and
 * a merge rather than a service: the transport is somebody else's problem,
 * deliberately, because a tool whose argument is that it reads your bill
 * without uploading it cannot also be the place everybody's bill is uploaded.
 *
 * **The merge is the easy half.** The half worth building carefully is what
 * *cannot* be merged, and this module refuses in four different ways:
 *
 * - **Findings that need the records.** Percentile shapes, conversation
 *   growth, repeated turns, truncation retries — every one of them is computed
 *   from individual calls, and a summary of a summary cannot reproduce them.
 *   They are named, with the contributors that had them, rather than dropped.
 * - **A day's dearest label.** Each contributor states its own; the merged
 *   answer needs per-label-per-day figures no document carries. Where two
 *   contributors share a day the answer is `null` with the reason attached,
 *   not the louder contributor's.
 * - **Overlap between contributors.** Two people exporting the same traffic
 *   double the bill, and nothing here can see it: the roll-up never sees a raw
 *   line, so the duplicate detection a single profile does is structurally out
 *   of reach. Every roll-up of more than one contributor says so.
 * - **Each contributor's own blind spots.** Unreadable lines, unpriced calls,
 *   a log with no clock. Summing them into one figure would say "3% of this
 *   roll-up is unpriced" when the truth is "one of your four machines is 90%
 *   unpriced and the other three are clean" — the same averaging-away this arc
 *   exists to refuse. They stay per contributor.
 *
 * No I/O: the caller hands over text it read, so this stays browser-safe and
 * the CLI keeps its monopoly on the filesystem.
 */

import { conform } from './conform.js';
import type { OutcomeTally } from './outcome.js';
import type { FieldCoverage, UsageBreakdown } from './usage.js';

/** A document somebody handed over, under the name it should answer to. */
export interface RollupInput {
  /** How this contributor is named in the roll-up. The caller's choice. */
  name: string;
  /** The profile document, as text — parsed and checked here, never trusted. */
  text: string;
}

/**
 * One contributor's own gap, kept whole.
 *
 * `usd` and `calls` are `null` where the kind does not have one, never `0`: a
 * gap with no money attached and a gap that cost nothing are different
 * statements, and the second one is a measurement.
 */
export interface ContributorGap {
  kind:
    /** Lines this contributor's parser could not read at all. */
    | 'unreadable-lines'
    /** Calls whose model the price catalogue does not know. */
    | 'unpriced-calls'
    /** No record carried a timestamp, so this contributor is in no day. */
    | 'no-clock'
    /** Some records carried a timestamp and some did not. */
    | 'partial-clock'
    /** No record carried a session. */
    | 'no-sessions'
    /** No record carried a label. */
    | 'no-labels'
    /** Duplicate lines this contributor found inside its own log. */
    | 'duplicate-lines';
  detail: string;
  usd: number | null;
  calls: number | null;
}

export interface RollupContributor {
  name: string;
  totalUsd: number;
  calls: number;
  /** The period this contributor's log covers, or null when it carried no clock. */
  span: { fromMs: number; toMs: number; calls: number } | null;
  /** The same span in days, or null. Stated, never extrapolated from. */
  spanDays: number | null;
  gaps: ContributorGap[];
}

/** A finding that exists per contributor and does not roll up. */
export interface UnmergedFinding {
  finding: string;
  because: string;
  /** The contributors that had one, so the reader knows where to go and look. */
  presentIn: string[];
}

/**
 * What a roll-up cannot say about itself.
 *
 * String codes rather than prose, so a consumer can branch on them and the
 * renderings can carry the sentences. `annual-record` established the shape.
 */
export type RollupCaveat =
  /** More than one contributor, so overlap between them is unmeasurable. */
  | 'overlap-invisible'
  /** Contributors cover meaningfully different periods. */
  | 'mismatched-spans'
  /** Some contributor carried no clock at all. */
  | 'contributor-without-clock'
  /** A day drew from more than one contributor, so its dearest label is unknown. */
  | 'day-top-label-unknown'
  /** Two contributions were the same document. */
  | 'identical-contributions'
  /** A contribution was handed over and not merged. */
  | 'contribution-rejected'
  /** A contribution carried a numeric field this version cannot classify. */
  | 'unknown-fields-dropped';

export interface RollupDay {
  /** `YYYY-MM-DD`, UTC — the contributors' own bucketing, never re-derived. */
  day: string;
  usd: number;
  calls: number;
  /** How many contributors saw traffic on this day. */
  contributors: number;
  byModel: Array<{ model: string; usd: number; calls: number }>;
  /**
   * The dearest label of the day, or **null** when more than one contributor
   * covered it.
   *
   * A profile knows its own day's dearest label; the merged answer needs each
   * contributor's per-label-per-day spend, which no document carries. Picking
   * the larger of two contributors' answers is what a helpful implementation
   * would do, and it is wrong whenever a runner-up in both adds up to more
   * than either winner.
   */
  topLabel: string | null;
  topLabelUsd: number | null;
}

export interface RollupDocument {
  schemaVersion: 1;
  contributors: RollupContributor[];
  /** Handed over and not merged, each with why. Never dropped in silence. */
  rejected: Array<{ name: string; because: string }>;
  /**
   * Contributions that were the same document, grouped, and what the repeats
   * added to the total.
   *
   * Merged rather than discarded, and stated rather than repaired — the rule a
   * single profile already applies to duplicate lines. Whether it is one export
   * handed over twice or two machines that genuinely produced identical
   * documents is the reader's to know, and this tool does not decide it by
   * throwing money away.
   *
   * The comparison is over the whole text, not a hash of it: a hash collision
   * would report a duplicate that is not one, and this figure exists to make
   * somebody distrust a total.
   */
  identicalContributions: { groups: string[][]; usd: number };
  total: UsageBreakdown;
  unpriced: UsageBreakdown;
  unpricedModels: string[];
  byLabel: Array<{ label: string; breakdown: UsageBreakdown }>;
  byModel: Array<{ model: string; breakdown: UsageBreakdown }>;
  byLabelAndModel: Array<{ label: string; model: string; breakdown: UsageBreakdown }>;
  spendByDay: RollupDay[];
  /** Earliest start to latest end, over contributors that carried a clock. */
  span: { fromMs: number; toMs: number; calls: number } | null;
  fieldCoverage: FieldCoverage;
  outcomeTally: OutcomeTally;
  /** Summed **within-contributor** duplicates. Overlap between them is elsewhere. */
  duplicateLines: { count: number; usd: number };
  notMerged: UnmergedFinding[];
  cannotSay: RollupCaveat[];
}

/**
 * Every numeric field of a breakdown, and how two of them combine.
 *
 * Listed rather than inferred, because both mistakes here are silent. A field
 * left out of both lists would vanish from every merged breakdown — a finding
 * present in each contribution and absent from the roll-up. And
 * `maxCallInputTokens` summed would report a fleet whose largest call is the
 * sum of four machines' largest calls, which is a number no call ever had, in
 * the direction that makes a context window look tight.
 *
 * `rollup.test.js` derives the field names from `usage.ts` and fails the build
 * when one is in neither list, so the next field added upstream cannot be
 * quietly dropped here.
 */
const BREAKDOWN_SUM = [
  'calls',
  'inputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'cacheWrite5mTokens',
  'cacheWrite1hTokens',
  'outputTokens',
  'assumedWriteTtlCalls',
  'inputUsd',
  'cacheReadUsd',
  'cacheWriteUsd',
  'outputUsd',
  'totalUsd',
  'cachedTokensAtInputRateUsd',
  'cacheWriteUsdIfAssumed1h',
  'truncatedCalls',
  'truncatedOutputUsd',
  'stopReasonCalls',
] as const;

/** Fields whose combination is a maximum, because a sum would invent a call. */
const BREAKDOWN_MAX = ['maxCallInputTokens'] as const;

/** Every counter of a coverage tally. All of them sum. */
const COVERAGE_FIELDS = [
  'label',
  'session',
  'outcome',
  'ts',
  'stopReason',
  'cacheTtl',
  'cacheWrites',
  'parsed',
] as const;

const emptyBreakdown = (): UsageBreakdown => {
  const out: Record<string, number> = {};
  for (const field of BREAKDOWN_SUM) out[field] = 0;
  for (const field of BREAKDOWN_MAX) out[field] = 0;
  return out as unknown as UsageBreakdown;
};

const emptyCoverage = (): FieldCoverage => {
  const out: Record<string, number> = {};
  for (const field of COVERAGE_FIELDS) out[field] = 0;
  return out as unknown as FieldCoverage;
};

const numberAt = (source: Record<string, unknown>, field: string): number => {
  const value = source[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Adds one contribution's breakdown into an accumulator.
 *
 * Returns the numeric fields it did not recognise, so a document from a newer
 * Trazum is reported rather than half-merged. Guessing that an unknown number
 * is additive is how a ratio becomes four times itself.
 */
function addBreakdown(into: UsageBreakdown, from: unknown): string[] {
  if (!isRecord(from)) return [];
  const target = into as unknown as Record<string, number>;
  for (const field of BREAKDOWN_SUM) target[field] = (target[field] ?? 0) + numberAt(from, field);
  for (const field of BREAKDOWN_MAX) {
    target[field] = Math.max(target[field] ?? 0, numberAt(from, field));
  }
  const known = new Set<string>([...BREAKDOWN_SUM, ...BREAKDOWN_MAX]);
  return Object.keys(from).filter((key) => !known.has(key) && typeof from[key] === 'number');
}

/** One merged slice, keyed by whatever identifies it. */
interface KeyedSlice {
  label: string | null;
  model: string | null;
  breakdown: UsageBreakdown;
}

/**
 * Merges keyed breakdowns — labels, models, or the pair — into one map.
 *
 * The identity travels in the value rather than being parsed back out of the
 * key: a label may contain any character, including whatever separator a key
 * would join on, and a pair key split on a separator the label also uses
 * silently merges two different workloads.
 */
function mergeKeyed(
  into: Map<string, KeyedSlice>,
  rows: unknown,
  identityOf: (row: Record<string, unknown>) => { label: string | null; model: string | null } | null,
): void {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const identity = identityOf(row);
    if (identity === null) continue;
    const key = JSON.stringify([identity.label, identity.model]);
    const slice = into.get(key) ?? { ...identity, breakdown: emptyBreakdown() };
    addBreakdown(slice.breakdown, row.breakdown);
    into.set(key, slice);
  }
}

/** Largest bill first, the order somebody would act in. */
const byMoney = <T>(rows: T[], usd: (row: T) => number): T[] =>
  [...rows].sort((a, b) => usd(b) - usd(a));

/** The findings a document carries per call, which no summary can reconstruct. */
const PER_RECORD_FINDINGS: Array<{ field: string; finding: string; because: string }> = [
  {
    field: 'conversations',
    finding: 'conversation growth',
    because:
      'it is measured over the turns of one session, and a document carries the growth rather than the turns',
  },
  {
    field: 'inputShapes',
    finding: 'input shape — the median and p95 call',
    because:
      'a percentile of two contributors is not a percentile of their percentiles, and the calls behind them are in neither document',
  },
  {
    field: 'outputShapes',
    finding: 'output concentration',
    because:
      'it asks what share of the calls holds what share of the output spend, and both shares need the individual calls',
  },
  {
    field: 'repeatedTurns',
    finding: 'repeated turns — the shape of a retry loop',
    because:
      'it compares consecutive calls in one session seconds apart, and consecutive calls are what a summary has already collapsed',
  },
  {
    field: 'truncationRetries',
    finding: 'truncation followed by a retry',
    because: 'it pairs a truncated answer with the call that followed it, and a document carries neither call',
  },
];

/**
 * Merges profile documents into one roll-up.
 *
 * Every input is checked against the `profile` contract before a figure of it
 * is used. A document that does not conform is **rejected with its reason and
 * not merged** — a roll-up that quietly skipped a malformed contribution would
 * report a total missing one machine's entire bill, and the reader would have
 * no way to tell that from that machine having spent nothing.
 */
export function rollUp(inputs: RollupInput[]): RollupDocument {
  const contributors: RollupContributor[] = [];
  const rejected: Array<{ name: string; because: string }> = [];
  const cannotSay = new Set<RollupCaveat>();

  const total = emptyBreakdown();
  const unpriced = emptyBreakdown();
  const unpricedModels = new Set<string>();
  const labels = new Map<string, KeyedSlice>();
  const models = new Map<string, KeyedSlice>();
  const pairs = new Map<string, KeyedSlice>();
  const coverage = emptyCoverage();
  const outcomeValues = new Map<string, { calls: number; usd: number }>();
  const outcome = { recorded: 0, parsed: 0, unrecordedUsd: 0 };
  const duplicateLines = { count: 0, usd: 0 };
  const unknownFields = new Set<string>();
  const days = new Map<
    string,
    {
      usd: number;
      calls: number;
      models: Map<string, { usd: number; calls: number }>;
      from: Set<string>;
      topLabel: string | null;
      topLabelUsd: number | null;
    }
  >();
  const findingsPresentIn = new Map<string, string[]>();
  /** The text of each accepted contribution, for the identical-document check. */
  const seenText = new Map<string, string[]>();
  let identicalUsd = 0;
  let spanFrom: number | null = null;
  let spanTo: number | null = null;
  let spanCalls = 0;

  for (const input of inputs) {
    const checked = conform(input.text, { contract: 'profile' });
    if (!checked.conforms) {
      const first = checked.problems[0];
      rejected.push({
        name: input.name,
        because:
          first === undefined
            ? (checked.because ?? 'it does not conform to the profile contract')
            : `${first.at}: ${first.detail}`,
      });
      cannotSay.add('contribution-rejected');
      continue;
    }

    // `conform` parsed it once already and reported nothing, so this cannot
    // throw — but a parse whose failure mode is a crash is a parse worth
    // guarding, and the reject path above is already the right answer.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.text.trim());
    } catch {
      rejected.push({ name: input.name, because: 'it is not valid JSON' });
      cannotSay.add('contribution-rejected');
      continue;
    }
    if (!isRecord(parsed)) {
      rejected.push({ name: input.name, because: 'a document must be a JSON object' });
      cannotSay.add('contribution-rejected');
      continue;
    }
    const doc = parsed;

    const text = input.text.trim();
    const sameAs = seenText.get(text);
    if (sameAs === undefined) {
      seenText.set(text, [input.name]);
    } else {
      sameAs.push(input.name);
      cannotSay.add('identical-contributions');
      identicalUsd += isRecord(doc.total) ? numberAt(doc.total, 'totalUsd') : 0;
    }

    for (const field of addBreakdown(total, doc.total)) unknownFields.add(field);
    addBreakdown(unpriced, doc.unpriced);
    if (Array.isArray(doc.unpricedModels)) {
      for (const model of doc.unpricedModels) {
        const name = asString(model);
        if (name !== null) unpricedModels.add(name);
      }
    }

    mergeKeyed(labels, doc.byLabel, (row) => {
      const label = asString(row.label);
      return label === null ? null : { label, model: null };
    });
    mergeKeyed(models, doc.byModel, (row) => {
      const model = asString(row.model);
      return model === null ? null : { label: null, model };
    });
    mergeKeyed(pairs, doc.byLabelAndModel, (row) => {
      const label = asString(row.label);
      const model = asString(row.model);
      return label === null || model === null ? null : { label, model };
    });

    if (isRecord(doc.fieldCoverage)) {
      const target = coverage as unknown as Record<string, number>;
      for (const field of COVERAGE_FIELDS) {
        target[field] = (target[field] ?? 0) + numberAt(doc.fieldCoverage, field);
      }
    }

    if (isRecord(doc.outcomeTally)) {
      const tally = doc.outcomeTally;
      outcome.recorded += numberAt(tally, 'recorded');
      outcome.parsed += numberAt(tally, 'parsed');
      outcome.unrecordedUsd += numberAt(tally, 'unrecordedUsd');
      if (Array.isArray(tally.byValue)) {
        for (const row of tally.byValue) {
          if (!isRecord(row)) continue;
          const value = asString(row.value);
          if (value === null) continue;
          const current = outcomeValues.get(value) ?? { calls: 0, usd: 0 };
          current.calls += numberAt(row, 'calls');
          current.usd += numberAt(row, 'usd');
          outcomeValues.set(value, current);
        }
      }
    }

    if (isRecord(doc.duplicateLines)) {
      duplicateLines.count += numberAt(doc.duplicateLines, 'count');
      duplicateLines.usd += numberAt(doc.duplicateLines, 'usd');
    }

    if (Array.isArray(doc.spendByDay)) {
      for (const row of doc.spendByDay) {
        if (!isRecord(row)) continue;
        const day = asString(row.day);
        if (day === null) continue;
        const bucket = days.get(day) ?? {
          usd: 0,
          calls: 0,
          models: new Map<string, { usd: number; calls: number }>(),
          from: new Set<string>(),
          topLabel: null,
          topLabelUsd: null,
        };
        bucket.usd += numberAt(row, 'usd');
        bucket.calls += numberAt(row, 'calls');
        bucket.from.add(input.name);
        if (bucket.from.size === 1) {
          bucket.topLabel = asString(row.topLabel);
          bucket.topLabelUsd = bucket.topLabel === null ? null : numberAt(row, 'topLabelUsd');
        } else {
          // A second contributor on this day puts the merged answer out of
          // reach, and the first contributor's answer stops being the
          // roll-up's answer.
          bucket.topLabel = null;
          bucket.topLabelUsd = null;
          cannotSay.add('day-top-label-unknown');
        }
        if (Array.isArray(row.byModel)) {
          for (const entry of row.byModel) {
            if (!isRecord(entry)) continue;
            const name = asString(entry.model);
            if (name === null) continue;
            const current = bucket.models.get(name) ?? { usd: 0, calls: 0 };
            current.usd += numberAt(entry, 'usd');
            current.calls += numberAt(entry, 'calls');
            bucket.models.set(name, current);
          }
        }
        days.set(day, bucket);
      }
    }

    for (const entry of PER_RECORD_FINDINGS) {
      const value = doc[entry.field];
      if (Array.isArray(value) && value.length > 0) {
        const list = findingsPresentIn.get(entry.field) ?? [];
        list.push(input.name);
        findingsPresentIn.set(entry.field, list);
      }
    }

    // --- this contributor, as it will be listed ---------------------------
    const totals = isRecord(doc.total) ? doc.total : {};
    const ownUnpriced = isRecord(doc.unpriced) ? doc.unpriced : {};
    const ownCoverage = isRecord(doc.fieldCoverage) ? doc.fieldCoverage : {};
    const span = isRecord(doc.span)
      ? {
          fromMs: numberAt(doc.span, 'fromMs'),
          toMs: numberAt(doc.span, 'toMs'),
          calls: numberAt(doc.span, 'calls'),
        }
      : null;

    if (span !== null) {
      spanFrom = spanFrom === null ? span.fromMs : Math.min(spanFrom, span.fromMs);
      spanTo = spanTo === null ? span.toMs : Math.max(spanTo, span.toMs);
      spanCalls += span.calls;
    }

    const gaps: ContributorGap[] = [];
    const skipped = Array.isArray(doc.skippedLines) ? doc.skippedLines.length : 0;
    if (skipped > 0) {
      gaps.push({
        kind: 'unreadable-lines',
        // The positions are deliberately absent: a line number is an offset
        // into a file only this contributor has, and a merged list of them
        // points at nothing.
        detail: `${skipped} line${skipped === 1 ? '' : 's'} of this contributor's log could not be read`,
        usd: null,
        calls: null,
      });
    }
    const unpricedCalls = numberAt(ownUnpriced, 'calls');
    if (unpricedCalls > 0) {
      gaps.push({
        kind: 'unpriced-calls',
        detail: `${unpricedCalls} call${unpricedCalls === 1 ? '' : 's'} ran on a model the catalogue does not price`,
        usd: null,
        calls: unpricedCalls,
      });
    }
    const parsedRecords = numberAt(ownCoverage, 'parsed');
    const dated = numberAt(ownCoverage, 'ts');
    if (span === null) {
      gaps.push({
        kind: 'no-clock',
        detail: 'no record carried a timestamp, so none of this contributor is in any day',
        usd: null,
        calls: null,
      });
      cannotSay.add('contributor-without-clock');
    } else if (parsedRecords > 0 && dated < parsedRecords) {
      gaps.push({
        kind: 'partial-clock',
        detail: `${parsedRecords - dated} of ${parsedRecords} records carried no timestamp`,
        usd: null,
        calls: parsedRecords - dated,
      });
    }
    if (parsedRecords > 0 && numberAt(ownCoverage, 'session') === 0) {
      gaps.push({
        kind: 'no-sessions',
        detail: 'no record carried a session, so this contributor brings no conversation findings',
        usd: null,
        calls: null,
      });
    }
    if (parsedRecords > 0 && numberAt(ownCoverage, 'label') === 0) {
      gaps.push({
        kind: 'no-labels',
        detail:
          'no record carried a label, so this contributor is unlabelled in every per-workload figure',
        usd: null,
        calls: null,
      });
    }
    if (isRecord(doc.duplicateLines)) {
      const count = numberAt(doc.duplicateLines, 'count');
      if (count > 0) {
        gaps.push({
          kind: 'duplicate-lines',
          detail: `${count} line${count === 1 ? '' : 's'} of this contributor's log repeated an earlier line exactly`,
          usd: numberAt(doc.duplicateLines, 'usd'),
          calls: count,
        });
      }
    }

    contributors.push({
      name: input.name,
      totalUsd: numberAt(totals, 'totalUsd'),
      calls: numberAt(totals, 'calls'),
      span,
      spanDays: span === null ? null : (span.toMs - span.fromMs) / 86_400_000,
      gaps,
    });
  }

  if (contributors.length > 1) cannotSay.add('overlap-invisible');
  if (unknownFields.size > 0) cannotSay.add('unknown-fields-dropped');

  /**
   * Mismatched spans, on the rule `fleetRollup` already uses: more than a day
   * apart in length, or one contributor with a clock beside one without. A
   * share of a sum stays valid either way; reading it as a comparison of
   * *rates* is the mistake this names.
   */
  const spanLengths = contributors.map((contributor) => contributor.spanDays);
  const known = spanLengths.filter((days_): days_ is number => days_ !== null);
  if (
    (spanLengths.some((length) => length === null) && known.length > 0) ||
    (known.length > 1 && Math.max(...known) - Math.min(...known) > 1)
  ) {
    cannotSay.add('mismatched-spans');
  }

  const notMerged: UnmergedFinding[] = PER_RECORD_FINDINGS.filter((entry) =>
    findingsPresentIn.has(entry.field),
  ).map((entry) => ({
    finding: entry.finding,
    because: entry.because,
    presentIn: findingsPresentIn.get(entry.field) ?? [],
  }));

  if (cannotSay.has('day-top-label-unknown')) {
    const shared = [...days.values()].filter((bucket) => bucket.from.size > 1);
    notMerged.push({
      finding: "a day's dearest label",
      because:
        'each contributor knows its own, and the merged answer needs the per-label-per-day spend that no document carries',
      presentIn: [...new Set(shared.flatMap((bucket) => [...bucket.from]))].sort(),
    });
  }

  if (unknownFields.size > 0) {
    notMerged.push({
      finding: `numeric fields this version cannot combine: ${[...unknownFields].sort().join(', ')}`,
      because:
        'a field added after this roll-up was written may be a sum, a maximum or a ratio, and combining it the wrong way is worse than leaving it out',
      presentIn: [],
    });
  }

  return {
    schemaVersion: 1,
    contributors,
    rejected,
    identicalContributions: {
      groups: [...seenText.values()].filter((names) => names.length > 1),
      usd: identicalUsd,
    },
    total,
    unpriced,
    unpricedModels: [...unpricedModels].sort(),
    byLabel: byMoney(
      [...labels.values()].map((slice) => ({ label: slice.label ?? '', breakdown: slice.breakdown })),
      (row) => row.breakdown.totalUsd,
    ),
    byModel: byMoney(
      [...models.values()].map((slice) => ({ model: slice.model ?? '', breakdown: slice.breakdown })),
      (row) => row.breakdown.totalUsd,
    ),
    byLabelAndModel: byMoney(
      [...pairs.values()].map((slice) => ({
        label: slice.label ?? '',
        model: slice.model ?? '',
        breakdown: slice.breakdown,
      })),
      (row) => row.breakdown.totalUsd,
    ),
    spendByDay: [...days.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, bucket]) => ({
        day,
        usd: bucket.usd,
        calls: bucket.calls,
        contributors: bucket.from.size,
        byModel: byMoney(
          [...bucket.models.entries()].map(([model, figures]) => ({ model, ...figures })),
          (row) => row.usd,
        ),
        topLabel: bucket.topLabel,
        topLabelUsd: bucket.topLabelUsd,
      })),
    span:
      spanFrom === null || spanTo === null ? null : { fromMs: spanFrom, toMs: spanTo, calls: spanCalls },
    fieldCoverage: coverage,
    outcomeTally: {
      byValue: byMoney(
        [...outcomeValues.entries()].map(([value, figures]) => ({ value, ...figures })),
        (row) => row.usd,
      ),
      recorded: outcome.recorded,
      parsed: outcome.parsed,
      unrecordedUsd: outcome.unrecordedUsd,
    },
    duplicateLines,
    notMerged,
    cannotSay: [...cannotSay].sort(),
  };
}
