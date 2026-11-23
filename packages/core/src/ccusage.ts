/**
 * ccusage's JSON report, read as a usage log.
 *
 * ccusage is how most people already read their coding agents' usage: it
 * walks Claude Code's session folders (and, since version 18, sixteen other
 * agents'), sums the tokens per day, month or session and per model, and
 * prices them from its own table. Somebody who already runs it has no reason
 * to read their sessions a second time. What they may want is what it does
 * not do: prices read from the provider's page with the date they were read,
 * budgets, a gate, and the ranked changes. This reads the file `ccusage
 * --json` wrote. It never runs ccusage, never installs it, and never looks
 * for its output on the machine: the person passes the file.
 *
 * ## Written against ccusage's own source
 *
 * Every field below is read from ccusage 20.0.51 (tag v20.0.51, commit
 * 225896dbc139164ef6580144fbafea77fd6cd9d6), not from a description of it:
 *
 * - The per-model figures are `ModelBreakdown` in
 *   `rust/crates/ccusage-core/src/types.rs`: `modelName`, `inputTokens`,
 *   `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, the optional
 *   `cacheCreation1hTokens` ("part of cacheCreationTokens written with the
 *   1-hour cache TTL; the rest was billed at the 5-minute rate. Absent when
 *   no entry reported the split"), `cost`, and `missingPricing`, present
 *   only when true.
 * - A report focused on Claude Code (`ccusage claude daily|weekly|monthly|
 *   session --json`, and the whole of ccusage before version 18) is
 *   `rust/crates/ccusage/src/commands/mod.rs`: `{"daily": [...]}`,
 *   `{"weekly": [...]}`, `{"monthly": [...]}` or `{"sessions": [...]}`, each
 *   beside `"totals"`, and `{"projects": {"<project>": [...]}}` for `daily
 *   --instances`. A row is `summary_json` or `session_summary_json` in
 *   `rust/crates/ccusage-report/src/output.rs`: `date`, `week` or `month`;
 *   or `sessionId`, `projectPath`, `firstActivity` and `lastActivity`.
 * - The report across every agent ccusage found (`ccusage daily|weekly|
 *   monthly|session --json`, the default since version 18) is
 *   `rust/crates/ccusage-adapter-all/src/report.rs`: rows under `daily`,
 *   `weekly`, `monthly` or `session`, each with `period`, `agent`,
 *   `metadata` and the same `modelBreakdowns`. `--sections` writes several
 *   of those keys into one file.
 * - A model ran in fast mode is named with `-fast` appended to its id, and
 *   only by the Claude Code reader (`rust/adapters/claude/src/lib.rs`, the
 *   one caller of `suffix_string(model, "-fast")`).
 *
 * The fixtures are real output of that version, run on synthetic sessions:
 * `test/fixtures/ccusage/README.md` has the commands.
 *
 * ## The counts are kept and ccusage's dollars are not
 *
 * A record is one model on one row: its four token counts, under the model's
 * id, at the row's start. ccusage's `cost` is never written into a record and
 * never added to anything priced. It is read only to be shown beside what
 * the catalogue makes of the same counts (`compareCcusage`): two price tables
 * summed into one number is how a report becomes quietly wrong, and a reader
 * is entitled to both figures and the gap.
 *
 * ## A row is not a call
 *
 * Every record says `requests: null`, the usage log's way of saying "a sum,
 * count not given" (`UsageRecord.requests`). A day's total is the sum of
 * every request that day, and ccusage's JSON does not say how many there
 * were. Read as one call, it would be priced as one prompt the size of the
 * whole day on a model priced by prompt length, and every per-call figure
 * downstream (the largest call, a session's growth) would describe a call
 * that never happened. So nothing here carries a session either: a session
 * report's row is the session's total, and a conversation of one turn the
 * size of the whole session is not what happened.
 *
 * ## A row covers a stretch of time, and is not cut
 *
 * A record is dated at its row's start, or a session's last activity, and a
 * bill reads that date as an instant. So each row's span is returned beside
 * the records (`spans`), and `ccusageRowsCut` says which rows a window edge
 * or a split by day, week or month would fall inside: a bill refuses those
 * rather than put a month's total on its first day. ccusage cut its days in
 * the zone it ran in, which its JSON does not say, so a bill does not move
 * them to another zone either.
 *
 * ## What does not cross
 *
 * A project as ccusage names it is the folder Claude Code made from a working
 * directory, `-home-dana-acme-payroll`, which is a path. It reaches the output
 * only as the label a person wrote for it in `labelByProject`, matched
 * exactly; with no rule naming it, a row is unlabelled, or carries `label`.
 * Session ids, `versions`, `credits` and every other field are read by
 * nothing here.
 *
 * ## What it counts and does not price
 *
 * - A breakdown with no model name, or a count that is not a whole number of
 *   tokens, or a row with tokens and no breakdown: left out and counted.
 * - A model ccusage named `-fast` whose catalogue row has no fast rate: left
 *   out and named, never priced at the standard rate, the rule
 *   `anthropic-usage.ts` follows for the same case.
 * - `totalTokens` beyond the four counts: tokens ccusage counted and did not
 *   say the kind of. Counted, not priced.
 * - Cache writes on a breakdown with no `cacheCreation1hTokens`: written with
 *   no lifetime, so the profile assumes the 5-minute rate and says so.
 *
 * And what ccusage's report never carried: US-only inference (`inference_geo`)
 * and web searches (`server_tool_use`), both billed by Anthropic and both in
 * Claude Code's own transcripts. A bill from ccusage's report is a floor on
 * those; `from-claude-code` on the sessions themselves is the figure with them.
 */

import { BUNDLED_CATALOGUE, reviewedForModels } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import { profileUsage } from './usage.js';

/** One project as ccusage names it, and the label the person gives it. Exact match. */
export interface CcusageProjectLabel {
  project: string;
  label: string;
}

/** The four report kinds ccusage writes as JSON. */
export type CcusageReportKind = 'daily' | 'weekly' | 'monthly' | 'session';

export interface CcusageRecord {
  model: string;
  ts: string;
  label?: string;
  /** Always `null`: a row sums requests and ccusage does not say how many. */
  requests: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    /** Present when ccusage reported the 1-hour part of the writes. */
    cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number };
    /** Present when ccusage named the model with `-fast`. */
    speed?: 'fast';
  };
}

/**
 * The stretch of time one row's total covers, half-open, in milliseconds.
 *
 * A day, week or month runs from its start to the start of the next one, as
 * ccusage cut it: in the zone ccusage ran in, which the report does not say,
 * and which is read here as UTC (the fixtures were written with `--timezone
 * UTC`). A session runs from its first activity to its last, inclusive.
 * `fromMs` is `null` for a session whose report names only its last activity
 * (the report across every agent): where it began is not known.
 */
export interface CcusageRowSpan {
  fromMs: number | null;
  toMs: number;
  /** The instant the row's records carry: its period's start, or a session's last activity. */
  atMs: number;
}

/** ccusage's own figures for one model as it named it, over the rows read. */
export interface CcusageModelFigure {
  /** The model as ccusage named it, `-fast` included. */
  name: string;
  /** The id the records carry. */
  model: string;
  fast: boolean;
  /** Records written for this name. */
  records: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** ccusage's `cost`, summed. `null` when no breakdown carried one (`--no-cost`). */
  ccusageUsd: number | null;
  /** ccusage said it had no price for this model on at least one row. */
  ccusageUnpriced: boolean;
}

export interface CcusageConversion {
  records: CcusageRecord[];
  /** Which report the rows came from, or `null` when the file held none. */
  report: CcusageReportKind | null;
  /** The report across every agent ccusage found, rather than one focused on Claude Code. */
  unified: boolean;
  /** The agents a unified report says it read, sorted. Empty for a focused one. */
  agents: string[];
  /** Rows read: days, weeks, months or sessions. A row is a total, not a call. */
  rows: number;
  /**
   * The time each row that became records covers, one per row, in the order
   * read. A bill cuts its windows and its days, weeks and months at instants,
   * and a row is a total over a stretch of time: `ccusageRowsCut` says which
   * rows a cut would fall inside.
   */
  spans: CcusageRowSpan[];
  /**
   * Other reports in the same file (`--sections`), not read. They are the
   * same usage cut another way, and adding them would count it twice.
   */
  sectionsLeftAside: CcusageReportKind[];
  /** ccusage's figures per model name, for the models that became records. */
  byModel: CcusageModelFigure[];
  /** ccusage's `totalCost`, summed over the rows read. `null` when no row carried one. */
  reportedUsd: number | null;
  /** Breakdowns with no model name. */
  unnamedModel: number;
  /** Breakdowns with a count that is not a whole number of tokens. */
  unreadable: number;
  /** Rows with tokens and no per-model breakdown to price them by. */
  rowsWithoutBreakdown: number;
  /** Rows whose day, week, month or last activity could not be read. */
  undatedRows: number;
  /** `totalTokens` beyond the four counts, summed over the rows read: counted, not priced. */
  unsplitTokens: number;
  /** Records whose cache writes carry no 1-hour split. */
  writeTtlUnsplit: number;
  /** Breakdowns named `-fast` on a model with no fast rate, left out. */
  fastUnpriced: number;
  fastUnpricedModels: string[];
  /** Session rows whose first and last activity fall on different UTC days. */
  sessionsAcrossDays: number;
  labelledByProject: number;
  /** Rows that named a project no rule names. */
  unruledProject: number;
  /** Rules were given and no row named a project. */
  projectNotGrouped: boolean;
  /** The input was not a ccusage JSON report. */
  unparseable: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** A token count: absent is zero, present and not a whole number is unreadable. */
const tokens = (value: unknown): number | null => {
  if (value === undefined || value === null) return 0;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
};

const money = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** The start of a `YYYY-MM-DD` day or a `YYYY-MM` month, in UTC, or `null`. */
function periodStart(period: unknown): string | null {
  if (typeof period !== 'string') return null;
  const at = DAY.test(period) ? `${period}T00:00:00.000Z` : MONTH.test(period) ? `${period}-01T00:00:00.000Z` : null;
  if (at === null) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const DAY_MS = 86_400_000;

/** Where a day, week or month that starts at `startMs` ends: the start of the next one. */
function periodEnd(kind: Exclude<CcusageReportKind, 'session'>, startMs: number): number {
  if (kind === 'daily') return startMs + DAY_MS;
  if (kind === 'weekly') return startMs + 7 * DAY_MS;
  const start = new Date(startMs);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
}

/** An instant ccusage wrote (an ISO timestamp, or a bare day in versions before 18), or `null`. */
function instant(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** The keys a report's rows sit under, in the order one is chosen when a file holds several. */
const SECTIONS: ReadonlyArray<{ key: string; kind: CcusageReportKind }> = [
  { key: 'daily', kind: 'daily' },
  { key: 'projects', kind: 'daily' },
  { key: 'weekly', kind: 'weekly' },
  { key: 'monthly', kind: 'monthly' },
  { key: 'sessions', kind: 'session' },
  { key: 'session', kind: 'session' },
];

/** The id a `-fast` name prices as. Only Claude Code's reader writes the suffix. */
function fastBase(name: string): string | null {
  return name.startsWith('claude-') && name.endsWith('-fast') && name.length > '-fast'.length ? name.slice(0, -'-fast'.length) : null;
}

export function ccusageRecords(
  text: string,
  options: {
    label?: string;
    labelByProject?: readonly CcusageProjectLabel[];
    /**
     * Where a model's fast rate is looked for. A `-fast` breakdown whose model
     * has no fast rate here is left out and named.
     */
    catalogue?: PricingCatalogue;
  } = {},
): CcusageConversion {
  const empty: CcusageConversion = {
    records: [],
    report: null,
    unified: false,
    agents: [],
    rows: 0,
    spans: [],
    sectionsLeftAside: [],
    byModel: [],
    reportedUsd: null,
    unnamedModel: 0,
    unreadable: 0,
    rowsWithoutBreakdown: 0,
    undatedRows: 0,
    unsplitTokens: 0,
    writeTtlUnsplit: 0,
    fastUnpriced: 0,
    fastUnpricedModels: [],
    sessionsAcrossDays: 0,
    labelledByProject: 0,
    unruledProject: 0,
    projectNotGrouped: false,
    unparseable: 0,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: 1 };
  }
  const report = asObject(parsed);
  if (report === null) return { ...empty, unparseable: 1 };
  const present = SECTIONS.filter(({ key }) =>
    key === 'projects' ? asObject(report[key]) !== null : Array.isArray(report[key]),
  );
  const chosen = present[0];
  if (chosen === undefined) return { ...empty, unparseable: 1 };

  /* Each row with the project it names, if any: the key of `--instances`, a
     focused session's `projectPath`, a unified session's `metadata.projectPath`. */
  const rowsFound: Array<{ row: Record<string, unknown>; project: string | null }> = [];
  if (chosen.key === 'projects') {
    for (const [project, list] of Object.entries(asObject(report.projects) ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const found of list) {
        const row = asObject(found);
        if (row !== null) rowsFound.push({ row, project });
      }
    }
  } else {
    for (const found of report[chosen.key] as unknown[]) {
      const row = asObject(found);
      if (row === null) continue;
      const metadata = asObject(row.metadata);
      const project =
        typeof row.projectPath === 'string' ? row.projectPath
        : typeof metadata?.projectPath === 'string' ? metadata.projectPath
        : null;
      rowsFound.push({ row, project });
    }
  }

  const catalogue = options.catalogue ?? BUNDLED_CATALOGUE;
  const hasFastRate = (model: string): boolean =>
    catalogue.byId.get(model)?.tiers?.some((tier) => tier.when.kind === 'speed' && tier.when.speed === 'fast') === true;
  const rules = options.labelByProject;

  const records: CcusageRecord[] = [];
  const spans: CcusageRowSpan[] = [];
  const figures = new Map<string, CcusageModelFigure>();
  const agents = new Set<string>();
  const fastUnpricedModels = new Set<string>();
  let unified = false;
  let rows = 0;
  let reportedUsd: number | null = null;
  let unnamedModel = 0;
  let unreadable = 0;
  let rowsWithoutBreakdown = 0;
  let undatedRows = 0;
  let unsplitTokens = 0;
  let writeTtlUnsplit = 0;
  let fastUnpriced = 0;
  let sessionsAcrossDays = 0;
  let labelledByProject = 0;
  let unruledProject = 0;
  let anyProject = false;

  for (const { row, project } of rowsFound) {
    const metadata = asObject(row.metadata);
    if (typeof row.agent === 'string') {
      unified = true;
      if (row.agent !== 'all') agents.add(row.agent);
      if (Array.isArray(metadata?.agents)) {
        for (const agent of metadata.agents) if (typeof agent === 'string') agents.add(agent);
      }
    }

    /* The row's instant: the start of its day, week or month, or a session's
       last activity, which is where a session that crossed midnight lands. */
    let ts: string | null;
    let first: string | null = null;
    if (chosen.kind === 'session') {
      ts = instant(row.lastActivity) ?? instant(metadata?.lastActivity);
      first = instant(row.firstActivity) ?? instant(metadata?.firstActivity);
      if (ts !== null && first !== null && first.slice(0, 10) !== ts.slice(0, 10)) sessionsAcrossDays += 1;
    } else {
      ts = periodStart(row.date ?? row.week ?? row.month ?? row.period);
    }
    if (ts === null) {
      undatedRows += 1;
      continue;
    }
    const atMs = Date.parse(ts);
    const span: CcusageRowSpan =
      chosen.kind === 'session'
        ? { fromMs: first === null ? null : Math.min(Date.parse(first), atMs), toMs: atMs + 1, atMs }
        : { fromMs: atMs, toMs: periodEnd(chosen.kind, atMs), atMs };
    const recordsBefore = records.length;
    rows += 1;
    const rowCost = money(row.totalCost);
    if (rowCost !== null) reportedUsd = (reportedUsd ?? 0) + rowCost;

    const four = [row.inputTokens, row.outputTokens, row.cacheCreationTokens, row.cacheReadTokens].map(tokens);
    const counted = four.every((n) => n !== null) ? four.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
    const total = tokens(row.totalTokens);
    if (counted !== null && total !== null && total > counted) unsplitTokens += total - counted;

    const breakdowns = Array.isArray(row.modelBreakdowns) ? row.modelBreakdowns : [];
    if (breakdowns.length === 0) {
      if ((counted ?? 0) > 0) rowsWithoutBreakdown += 1;
      continue;
    }

    let label = options.label;
    if (rules !== undefined && project !== null) {
      anyProject = true;
      const named = rules.find((rule) => rule.project === project);
      if (named !== undefined) {
        label = named.label;
        labelledByProject += 1;
      } else {
        unruledProject += 1;
      }
    }

    for (const found of breakdowns) {
      const breakdown = asObject(found);
      if (breakdown === null) continue;
      const name = typeof breakdown.modelName === 'string' ? breakdown.modelName : '';
      if (name === '') {
        unnamedModel += 1;
        continue;
      }
      const input = tokens(breakdown.inputTokens);
      const output = tokens(breakdown.outputTokens);
      const write = tokens(breakdown.cacheCreationTokens);
      const read = tokens(breakdown.cacheReadTokens);
      const write1h = breakdown.cacheCreation1hTokens === undefined ? undefined : tokens(breakdown.cacheCreation1hTokens);
      if (input === null || output === null || write === null || read === null || write1h === null) {
        unreadable += 1;
        continue;
      }
      const base = fastBase(name);
      const model = base ?? name;
      if (base !== null && !hasFastRate(base)) {
        fastUnpriced += 1;
        fastUnpricedModels.add(name);
        continue;
      }

      const figure = figures.get(name) ?? {
        name,
        model,
        fast: base !== null,
        records: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        ccusageUsd: null,
        ccusageUnpriced: false,
      };
      figure.inputTokens += input;
      figure.outputTokens += output;
      figure.cacheCreationTokens += write;
      figure.cacheReadTokens += read;
      const cost = money(breakdown.cost);
      if (cost !== null) figure.ccusageUsd = (figure.ccusageUsd ?? 0) + cost;
      if (breakdown.missingPricing === true) figure.ccusageUnpriced = true;
      figures.set(name, figure);

      /* Nothing to price: ccusage's figure for it stays in the comparison. */
      if (input + output + write + read === 0) continue;

      /* The split only when ccusage gave it and it fits inside the writes. */
      const split = write1h !== undefined && write1h <= write;
      if (!split && write > 0) writeTtlUnsplit += 1;
      records.push({
        model,
        ts,
        ...(label === undefined ? {} : { label }),
        requests: null,
        usage: {
          input_tokens: input,
          output_tokens: output,
          cache_read_input_tokens: read,
          cache_creation_input_tokens: write,
          ...(split ? { cache_creation: { ephemeral_5m_input_tokens: write - write1h, ephemeral_1h_input_tokens: write1h } } : {}),
          ...(base !== null ? { speed: 'fast' as const } : {}),
        },
      });
      figure.records += 1;
    }
    if (records.length > recordsBefore) spans.push(span);
  }

  return {
    records,
    report: chosen.kind,
    unified,
    agents: [...agents].sort(),
    rows,
    spans,
    sectionsLeftAside: present.slice(1).map(({ kind }) => kind).filter((kind) => kind !== chosen.kind),
    byModel: [...figures.values()],
    reportedUsd,
    unnamedModel,
    unreadable,
    rowsWithoutBreakdown,
    undatedRows,
    unsplitTokens,
    writeTtlUnsplit,
    fastUnpriced,
    fastUnpricedModels: [...fastUnpricedModels].sort(),
    sessionsAcrossDays,
    labelledByProject,
    unruledProject,
    projectNotGrouped: rules !== undefined && !anyProject,
    unparseable: 0,
  };
}

/** The calendar unit a bill is split by; the same as `BillPeriodUnit`. Weeks are ISO weeks, Monday first, UTC. */
type CutUnit = 'day' | 'week' | 'month';

/** The start of the UTC day, ISO week or month an instant falls in. */
function bucketOf(ms: number, unit: CutUnit): number {
  const day = Math.floor(ms / DAY_MS) * DAY_MS;
  if (unit === 'day') return day;
  if (unit === 'week') return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
  const at = new Date(ms);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
}

/** Rows a cut falls inside, and how many of those are sessions whose start is not known. */
export interface CcusageCut {
  rows: number;
  startUnknown: number;
}

/**
 * The rows a bill's window, or its split by day, week or month, would fall
 * inside (#786).
 *
 * A row is a total over its whole span and says nothing of how it was spread
 * across it. A window edge strictly inside a row would bill all of it or none
 * of it as if it fell on one side; a split by day of a month's row would put
 * the month on its first day. Either presents the counts as more precise than
 * the report is, so a bill refuses the cut instead, and this is how it knows.
 *
 * The window is half-open, `[sinceMs, untilMs)`, the profile's own: an edge
 * on a row's start or end cuts nothing. A session whose start is not known is
 * counted as cut by any edge at or before its last activity and by any split,
 * because whether it began before the edge cannot be told.
 */
export function ccusageRowsCut(
  spans: readonly CcusageRowSpan[],
  cut: { sinceMs?: number; untilMs?: number; unit?: CutUnit },
): CcusageCut {
  let rows = 0;
  let startUnknown = 0;
  const inside = (span: CcusageRowSpan, edge: number | undefined): boolean =>
    edge !== undefined && (span.fromMs === null ? edge <= span.atMs : span.fromMs < edge && edge < span.toMs);
  for (const span of spans) {
    const split =
      cut.unit !== undefined && (span.fromMs === null || bucketOf(span.fromMs, cut.unit) !== bucketOf(span.toMs - 1, cut.unit));
    if (split || inside(span, cut.sinceMs) || inside(span, cut.untilMs)) {
      rows += 1;
      if (span.fromMs === null) startUnknown += 1;
    }
  }
  return { rows, startUnknown };
}

/**
 * What the rows inside a window cover, from the first one's start to the last
 * moment of the last one, or `null` when none is inside. A row is inside when
 * the instant its records carry is: the same test the profile applies, so this
 * is the span of the rows the bill priced, stated by what each row covers
 * rather than by the instant it is dated at.
 */
export function ccusageCoverage(
  spans: readonly CcusageRowSpan[],
  window: { sinceMs?: number; untilMs?: number } = {},
): { fromMs: number; toMs: number } | null {
  let fromMs = Number.POSITIVE_INFINITY;
  let toMs = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    if (window.sinceMs !== undefined && span.atMs < window.sinceMs) continue;
    if (window.untilMs !== undefined && span.atMs >= window.untilMs) continue;
    fromMs = Math.min(fromMs, span.fromMs ?? span.atMs);
    toMs = Math.max(toMs, span.toMs - 1);
  }
  return fromMs === Number.POSITIVE_INFINITY ? null : { fromMs, toMs };
}

/**
 * Whether this text is a ccusage JSON report. `modelBreakdowns` holding
 * `modelName` is ccusage's own vocabulary and no other shape's.
 */
export function looksLikeCcusage(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  return head.includes('"modelBreakdowns"') && head.includes('"modelName"');
}

/** ccusage's figure for one model beside the catalogue's, for the same counts. */
export interface CcusageComparison {
  /** The model as ccusage named it. */
  name: string;
  /** The id the catalogue priced. */
  model: string;
  /** ccusage's figure, or `null` when the report carried none. */
  ccusageUsd: number | null;
  /** ccusage said it had no price for this model on at least one row. */
  ccusageUnpriced: boolean;
  /** The catalogue's figure for the records, or `null` when it does not price the model. */
  trazumUsd: number | null;
  /**
   * The same records at the cheaper rate, when some were billed at the dearer
   * of two because a row sums requests on a model priced by prompt length.
   * `null` when no row needed it.
   */
  trazumFloorUsd: number | null;
  /** When the catalogue's price for this model was read, or `null` when unpriced. */
  reviewedOn: string | null;
  /** `trazumUsd - ccusageUsd` when both exist. */
  differenceUsd: number | null;
  /** The two agree to a millionth of a dollar. */
  agrees: boolean;
}

/**
 * What the catalogue makes of each model's counts, beside what ccusage made of
 * them. Each model is priced through `profileUsage`, the same as a bill of the
 * records, so the figure here is the figure the bill prints for that model.
 * ccusage's number is only ever on the other side of the comparison.
 */
export function compareCcusage(conversion: CcusageConversion, catalogue: PricingCatalogue = BUNDLED_CATALOGUE): CcusageComparison[] {
  return conversion.byModel.map((figure) => {
    const own = conversion.records.filter(
      (record) => record.model === figure.model && (record.usage.speed === 'fast') === figure.fast,
    );
    const priced = catalogue.byId.get(figure.model);
    let trazumUsd: number | null = null;
    let trazumFloorUsd: number | null = null;
    if (priced !== undefined) {
      const report = profileUsage(own.map((record) => JSON.stringify(record)).join('\n'), { catalogue });
      trazumUsd = report.total.totalUsd;
      if (report.total.tierCeilingCalls > 0) {
        trazumFloorUsd = report.total.totalUsd - report.total.tierCeilingUsd + report.total.tierFloorUsd;
      }
    }
    const differenceUsd = trazumUsd !== null && figure.ccusageUsd !== null ? trazumUsd - figure.ccusageUsd : null;
    return {
      name: figure.name,
      model: figure.model,
      ccusageUsd: figure.ccusageUsd,
      ccusageUnpriced: figure.ccusageUnpriced,
      trazumUsd,
      trazumFloorUsd,
      reviewedOn: priced === undefined ? null : reviewedForModels([priced.id], catalogue),
      differenceUsd,
      agrees: differenceUsd !== null && Math.abs(differenceUsd) < 0.000_001,
    };
  });
}
