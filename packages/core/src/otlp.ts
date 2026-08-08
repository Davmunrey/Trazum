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
 */

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
