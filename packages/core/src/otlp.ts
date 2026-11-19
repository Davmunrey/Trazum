/**
 * Prompt cost as OpenTelemetry metrics, in the OTLP/HTTP JSON encoding.
 *
 * **Trazum writes the payload; it does not send it.** That is a decision, not a
 * missing feature. Pushing to a collector would mean holding an endpoint and a
 * credential, and this repository has twice shipped an SSRF where a URL reached
 * `fetch` without being the URL that was checked. A command that writes a file
 * has no such failure mode, and `curl --data-binary @metrics.json $OTLP_ENDPOINT`
 * is one line in the pipeline that already has the credential.
 *
 * No dependency on `@opentelemetry/*` either — the JSON encoding is a stable,
 * documented wire format, and this package has no runtime dependencies by design.
 *
 * The two encoding rules that are easy to get wrong and silently produce a
 * payload a collector drops:
 *
 * - **64-bit integers are strings.** `timeUnixNano` and `asInt` are `int64` in
 *   the protobuf, and JSON numbers cannot hold one exactly, so the JSON mapping
 *   specifies strings. A collector reading `1786000000000000000` as a double
 *   loses the last digits of every timestamp.
 * - **A gauge is `asDouble` or `asInt`, never both**, and a money figure is a
 *   double. Sending `asInt` for `$41.20` silently reports `41`.
 *
 * The bill (`toBillOtlpMetrics`) follows the same two rules and adds three of
 * its own, which the functions below explain where they apply: a day still
 * being measured is never written as a closed one, every cost point says it is
 * API-equivalent cost, and what could not be priced is its own metric.
 */

import type { PricingCatalogue } from './pricing.js';
import { UNLABELLED, parseUsageLine, profileUsage } from './usage.js';

/** Attributes as OTLP encodes them: a list of key/value, not an object. */
export interface OtlpAttribute {
  key: string;
  value: { stringValue: string } | { intValue: string } | { doubleValue: number };
}

export interface OtlpDataPoint {
  attributes: OtlpAttribute[];
  timeUnixNano: string;
  asInt?: string;
  asDouble?: number;
}

export interface OtlpMetric {
  name: string;
  description: string;
  unit: string;
  gauge: { dataPoints: OtlpDataPoint[] };
}

export interface OtlpPayload {
  resourceMetrics: [
    {
      resource: { attributes: OtlpAttribute[] };
      scopeMetrics: [{ scope: { name: string; version: string }; metrics: OtlpMetric[] }];
    },
  ];
}

/** What `doctor` knows, in the shape this module needs. */
export interface OtlpInput {
  /** Every prompt surveyed, with the count a budget would be compared against. */
  prompts: readonly { path: string; tokens: number; overBudget: boolean; budgeted: boolean }[];
  /** Advisories rolled up by id, as the survey reports them. */
  findings: readonly { id: string; prompts: number; monthlyUsd: number | null }[];
  model: string;
  callsPerMonth: number;
}

const str = (key: string, value: string): OtlpAttribute => ({ key, value: { stringValue: value } });

/** Rounded to the nearest nanosecond as an integer string, never a float. */
function nanos(atMillis: number): string {
  return `${Math.round(atMillis)}000000`;
}

/**
 * `atMillis` is a parameter rather than a call to `Date.now()`.
 *
 * The same reason `computeSavings` takes a `Date`: a function that reads the
 * clock cannot be asserted against a fixed expectation, and every test of it
 * ends up asserting only its shape. Here the timestamp *is* half the payload.
 */
export function toOtlpMetrics(input: OtlpInput, atMillis: number): OtlpPayload {
  const { prompts, findings, model, callsPerMonth } = input;
  const time = nanos(atMillis);
  const metrics: OtlpMetric[] = [];

  const gauge = (
    name: string,
    description: string,
    unit: string,
    dataPoints: OtlpDataPoint[],
  ): void => {
    // An empty metric is not the same as a zero, and a collector charting an
    // empty series draws nothing rather than a flat line at zero. Omitted.
    if (dataPoints.length > 0) metrics.push({ name, description, unit, gauge: { dataPoints } });
  };

  gauge(
    'trazum.prompt.tokens',
    'Input tokens in a prompt as written, the figure a budget is compared against.',
    '{token}',
    prompts.map((p) => ({
      attributes: [str('prompt.path', p.path)],
      timeUnixNano: time,
      asInt: `${Math.round(p.tokens)}`,
    })),
  );

  // Per prompt rather than as one count, so a dashboard can name the offender
  // instead of showing a number that went from 2 to 3.
  gauge(
    'trazum.prompt.over_budget',
    'Whether this prompt exceeds the budget that covers it. 1 when it does.',
    '1',
    prompts
      .filter((p) => p.budgeted)
      .map((p) => ({
        attributes: [str('prompt.path', p.path)],
        timeUnixNano: time,
        asInt: p.overBudget ? '1' : '0',
      })),
  );

  gauge(
    'trazum.prompts.unbudgeted',
    'Prompts no budget pattern matches, so nothing is watching them.',
    '{prompt}',
    [
      {
        attributes: [],
        timeUnixNano: time,
        asInt: `${prompts.filter((p) => !p.budgeted).length}`,
      },
    ],
  );

  // Money is a double. Sending this as asInt would report $41.20 as 41 and the
  // chart would look plausible.
  gauge(
    'trazum.advisory.monthly_usd',
    'Estimated monthly USD an advisory would recover, summed across the prompts raising it.',
    'USD',
    findings
      .filter((f): f is typeof f & { monthlyUsd: number } => f.monthlyUsd !== null)
      .map((f) => ({
        attributes: [str('advisory.id', f.id)],
        timeUnixNano: time,
        asDouble: f.monthlyUsd,
      })),
  );

  gauge(
    'trazum.advisory.prompts',
    'How many prompts raise this advisory.',
    '{prompt}',
    findings.map((f) => ({
      attributes: [str('advisory.id', f.id)],
      timeUnixNano: time,
      asInt: `${f.prompts}`,
    })),
  );

  return {
    resourceMetrics: [
      {
        // The model and call volume are resource attributes, not metric labels:
        // every figure above was priced through them, and a dollar amount whose
        // scenario is not recorded beside it is a number nobody can check later.
        resource: {
          attributes: [
            str('service.name', 'trazum'),
            str('trazum.model', model),
            {
              key: 'trazum.calls_per_month',
              value: { intValue: `${Math.round(callsPerMonth)}` },
            },
          ],
        },
        scopeMetrics: [{ scope: { name: 'trazum', version: '1.0.0' }, metrics }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The bill
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const UNDATED = 'undated';

/** What every cost point says about itself, and the attribute that says it. */
export const OTLP_COST_BASIS_KEY = 'trazum.cost.basis';
export const OTLP_COST_BASIS = 'api-equivalent';

/** The four token kinds a call is billed in, as the `trazum.token.type` values. */
export const OTLP_TOKEN_TYPES = ['input', 'cache_read', 'cache_write', 'output'] as const;
export type OtlpTokenType = (typeof OTLP_TOKEN_TYPES)[number];

/** One day of one project's calls to one model, through one agent. */
export interface BillOtlpRow {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  /** The label the log carried, or `null` when it carried none. */
  project: string | null;
  model: string;
  /** Which coding agent's sessions the calls came from, or `null` for any other source. */
  agent: string | null;
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** Absent on an unpriced row: there is no figure to write, and a zero would be one. */
  usd?: number;
}

/** What the payload does not hold as a closed day, so the series and these add to the bill. */
export interface BillOtlpExcluded {
  calls: number;
  usd: number;
  tokens: number;
  unpricedCalls: number;
}

export interface BillOtlpInput {
  /** Priced rows of closed days only. */
  priced: readonly BillOtlpRow[];
  /** Rows of closed days the catalogue could not price. */
  unpriced: readonly BillOtlpRow[];
  /** Days still open, or cut by the window: left out of the series, counted here. */
  open: BillOtlpExcluded & { days: readonly string[] };
  /** Calls with no clock: they belong to no day, so to none of the series. */
  undated: BillOtlpExcluded;
  /** The instant "closed" was judged against, epoch milliseconds. */
  measuredAtMs: number;
}

export interface BillOtlpOptions {
  catalogue: PricingCatalogue;
  /** The window the bill was asked for, as `profileUsage` takes it. */
  sinceMs?: number;
  untilMs?: number;
  /** Now. A parameter, for the reason `toOtlpMetrics` takes its timestamp. */
  nowMs: number;
}

/**
 * Whether the bill holds all of a UTC day.
 *
 * Closed means its last millisecond has passed, and the window neither starts
 * after its first nor ends before its last. A day the window cuts is open in
 * the sense that matters to a chart: its figure is a part of a day, and a
 * series that mixes parts with wholes reads as a day that was cheap.
 */
export function dayIsClosed(day: string, nowMs: number, sinceMs?: number, untilMs?: number): boolean {
  const start = Date.parse(`${day}T00:00:00Z`);
  const end = start + DAY_MS;
  if (!Number.isFinite(start) || end > nowMs) return false;
  if (sinceMs !== undefined && sinceMs > start) return false;
  if (untilMs !== undefined && untilMs < end) return false;
  return true;
}

/**
 * Groups a bill's records by day, project, model and agent, and prices each
 * group through `profileUsage`, the function the bill itself is priced by, so
 * a figure here is the bill's figure rather than a second arithmetic.
 *
 * A record outside the window, or with no clock under a window, is left out
 * exactly as `profileUsage` leaves it out, which is what keeps the totals equal.
 */
export function billOtlpInput(
  sources: readonly { agent: string | null; lines: readonly string[] }[],
  options: BillOtlpOptions,
): BillOtlpInput {
  const { catalogue, sinceMs, untilMs, nowMs } = options;
  const windowed = sinceMs !== undefined || untilMs !== undefined;

  const groups = new Map<
    string,
    { day: string; project: string | null; model: string; agent: string | null; lines: string[] }
  >();
  for (const source of sources) {
    for (const line of source.lines) {
      const record = parseUsageLine(line);
      if (record === null) continue;
      const outside =
        record.ts === null
          ? windowed
          : (sinceMs !== undefined && record.ts < sinceMs) || (untilMs !== undefined && record.ts >= untilMs);
      if (outside) continue;
      const day = record.ts === null ? UNDATED : new Date(record.ts).toISOString().slice(0, 10);
      const project = record.label === null || record.label === UNLABELLED ? null : record.label;
      const key = JSON.stringify([day, project, record.model, source.agent]);
      const group = groups.get(key) ?? { day, project, model: record.model, agent: source.agent, lines: [] };
      group.lines.push(line);
      groups.set(key, group);
    }
  }

  const priced: BillOtlpRow[] = [];
  const unpriced: BillOtlpRow[] = [];
  const open = { days: new Set<string>(), calls: 0, usd: 0, tokens: 0, unpricedCalls: 0 };
  const undated = { calls: 0, usd: 0, tokens: 0, unpricedCalls: 0 };

  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, group] of ordered) {
    const report = profileUsage(group.lines.join('\n'), { catalogue });
    const closed = group.day !== UNDATED && dayIsClosed(group.day, nowMs, sinceMs, untilMs);
    for (const [part, isPriced] of [
      [report.total, true],
      [report.unpriced, false],
    ] as const) {
      if (part.calls === 0) continue;
      if (closed) {
        (isPriced ? priced : unpriced).push({
          day: group.day,
          project: group.project,
          model: group.model,
          agent: group.agent,
          calls: part.calls,
          inputTokens: part.inputTokens,
          cacheReadTokens: part.cacheReadTokens,
          cacheWriteTokens: part.cacheWriteTokens,
          outputTokens: part.outputTokens,
          ...(isPriced ? { usd: part.totalUsd } : {}),
        });
        continue;
      }
      const into = group.day === UNDATED ? undated : open;
      if (group.day !== UNDATED) open.days.add(group.day);
      if (isPriced) {
        into.calls += part.calls;
        into.usd += part.totalUsd;
        into.tokens += part.inputTokens + part.cacheReadTokens + part.cacheWriteTokens + part.outputTokens;
      } else {
        into.unpricedCalls += part.calls;
      }
    }
  }
  return { priced, unpriced, open: { ...open, days: [...open.days].sort() }, undated, measuredAtMs: nowMs };
}

const rowAttributes = (row: BillOtlpRow): OtlpAttribute[] => [
  str('trazum.day', row.day),
  ...(row.project !== null ? [str('trazum.project', row.project)] : []),
  str('trazum.model', row.model),
  ...(row.agent !== null ? [str('trazum.agent', row.agent)] : []),
];

/**
 * The bill as OTLP gauges, one point per day, project, model and agent.
 *
 * **Each point is that day's total, not a running one**, stamped at the day's
 * first instant and carrying `trazum.day`, so a collector that rewrites
 * timestamps cannot move a figure to another day.
 *
 * - `trazum.bill.cost` (USD, `asDouble`), every point carrying
 *   `trazum.cost.basis=api-equivalent`: the tokens at the provider's list
 *   rates, which on a subscription is not what was paid.
 * - `trazum.bill.tokens` (`asInt`), by `trazum.token.type`.
 * - `trazum.bill.calls` (`asInt`).
 * - `trazum.bill.unpriced.calls` and `trazum.bill.unpriced.tokens`: what the
 *   catalogue does not price, with no dollar figure beside it.
 *
 * **A day still being measured is not a point.** Today, and any day the
 * requested window cuts, are left out of every metric and named in the
 * resource attributes (`trazum.bill.open_days` and the figures under
 * `trazum.bill.open_*`), as are calls with no clock (`trazum.bill.undated_*`).
 * The series plus those attributes add to the bill, and a chart never draws a
 * partial day beside whole ones. The attributes are present at zero too:
 * nothing excluded and nothing recorded are different statements.
 */
export function toBillOtlpMetrics(input: BillOtlpInput): OtlpPayload {
  const metrics: OtlpMetric[] = [];
  const point = (
    row: BillOtlpRow,
    extra: OtlpAttribute[],
    value: Pick<OtlpDataPoint, 'asInt' | 'asDouble'>,
  ): OtlpDataPoint => ({
    attributes: [...rowAttributes(row), ...extra],
    timeUnixNano: nanos(Date.parse(`${row.day}T00:00:00Z`)),
    ...value,
  });
  const gauge = (name: string, description: string, unit: string, dataPoints: OtlpDataPoint[]): void => {
    if (dataPoints.length > 0) metrics.push({ name, description, unit, gauge: { dataPoints } });
  };
  const tokenPoints = (rows: readonly BillOtlpRow[]): OtlpDataPoint[] =>
    rows.flatMap((row) =>
      (
        [
          ['input', row.inputTokens],
          ['cache_read', row.cacheReadTokens],
          ['cache_write', row.cacheWriteTokens],
          ['output', row.outputTokens],
        ] as [OtlpTokenType, number][]
      ).map(([type, count]) => point(row, [str('trazum.token.type', type)], { asInt: `${Math.round(count)}` })),
    );

  gauge(
    'trazum.bill.cost',
    'API-equivalent cost of one closed UTC day: the tokens at the provider list rates, not what a subscription paid.',
    'USD',
    input.priced.map((row) => point(row, [str(OTLP_COST_BASIS_KEY, OTLP_COST_BASIS)], { asDouble: row.usd ?? 0 })),
  );
  gauge(
    'trazum.bill.tokens',
    'Tokens of one closed UTC day, by kind: input, cache_read, cache_write and output.',
    '{token}',
    tokenPoints(input.priced),
  );
  gauge(
    'trazum.bill.calls',
    'Priced calls of one closed UTC day.',
    '{call}',
    input.priced.map((row) => point(row, [], { asInt: `${row.calls}` })),
  );
  gauge(
    'trazum.bill.unpriced.calls',
    'Calls of one closed UTC day to a model the catalogue does not price. They are in no cost figure.',
    '{call}',
    input.unpriced.map((row) => point(row, [], { asInt: `${row.calls}` })),
  );
  gauge(
    'trazum.bill.unpriced.tokens',
    'Tokens of one closed UTC day on a model the catalogue does not price, by kind. They are in no cost figure.',
    '{token}',
    tokenPoints(input.unpriced),
  );

  const count = (key: string, value: number): OtlpAttribute => ({ key, value: { intValue: `${Math.round(value)}` } });
  const money = (key: string, value: number): OtlpAttribute => ({ key, value: { doubleValue: value } });
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            str('service.name', 'trazum'),
            str('trazum.bill.measured_at', new Date(input.measuredAtMs).toISOString()),
            str('trazum.bill.open_days', input.open.days.join(',')),
            count('trazum.bill.open_calls', input.open.calls),
            money('trazum.bill.open_cost_usd', input.open.usd),
            count('trazum.bill.open_tokens', input.open.tokens),
            count('trazum.bill.open_unpriced_calls', input.open.unpricedCalls),
            count('trazum.bill.undated_calls', input.undated.calls),
            money('trazum.bill.undated_cost_usd', input.undated.usd),
            count('trazum.bill.undated_tokens', input.undated.tokens),
            count('trazum.bill.undated_unpriced_calls', input.undated.unpricedCalls),
          ],
        },
        scopeMetrics: [{ scope: { name: 'trazum', version: '1.0.0' }, metrics }],
      },
    ],
  };
}
