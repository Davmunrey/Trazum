/**
 * An OTLP metrics payload in the Prometheus text exposition format.
 *
 * Written from the payload `otlp.ts` builds rather than from the records a
 * second time, so the two files cannot disagree: every sample here is a data
 * point there, with the same value and the same attributes as labels. The bill's
 * rules carry over with it: a cost sample says it is API-equivalent
 * (`trazum_cost_basis="api-equivalent"`), what could not be priced is its own
 * metric and in no cost sample, and a day still being measured is not a sample.
 *
 * **Nothing is pushed.** The text is written to a file, the shape the node
 * exporter's textfile collector reads, so Prometheus scrapes it the way it
 * scrapes everything else. Trazum holds no endpoint and no credential.
 *
 * **No timestamps.** A bill's point is one closed day, and its OTLP point is
 * stamped at that day's first instant. Prometheus refuses a scraped sample that
 * far in the past, so a sample here carries no timestamp: each day is its own
 * series, told apart by its `trazum_day` label, and its value is that day's
 * total. A chart sums by that label, as the Grafana dashboard in
 * `docs/grafana/trazum-bill.json` does.
 *
 * The format (https://prometheus.io/docs/instrumenting/exposition_formats/):
 * a `# HELP` and a `# TYPE` line once per metric, then one line per sample,
 * `name{label="value",...} value`. Names and label names are
 * `[a-zA-Z_][a-zA-Z0-9_]*`, so each `.` becomes `_`; a label value escapes `\`,
 * `"` and a line break, and a help text escapes `\` and a line break.
 */

import type { OtlpAttribute, OtlpPayload } from './otlp.js';

/** A metric or label name as Prometheus accepts it: dots and anything else outside the set become `_`. */
export function prometheusName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(safe) ? safe : `_${safe}`;
}

/** A metric's name with its unit, where the unit is a currency: `trazum.bill.cost` in USD is `trazum_bill_cost_usd`. */
function metricName(name: string, unit: string): string {
  const base = prometheusName(name);
  return unit === 'USD' && !base.endsWith('_usd') ? `${base}_usd` : base;
}

/** Whether a text is an instant exactly as `toISOString` writes one: read back and written again, it is the same text. */
function isInstant(text: string): boolean {
  const at = Date.parse(text);
  return Number.isFinite(at) && new Date(at).toISOString() === text;
}

const labelValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const helpText = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

/** An attribute's value as text, whichever of the three OTLP encodings it has. */
function attributeText(attribute: OtlpAttribute): string {
  const value = attribute.value;
  if ('stringValue' in value) return value.stringValue;
  if ('intValue' in value) return value.intValue;
  return String(value.doubleValue);
}

const labels = (attributes: readonly OtlpAttribute[]): string =>
  attributes.length === 0 ? '' : `{${attributes.map((a) => `${prometheusName(a.key)}="${labelValue(attributeText(a))}"`).join(',')}}`;

/** A number as Prometheus reads it: finite numbers as JavaScript writes them, the rest by name. */
function sampleValue(value: number | string): string {
  if (typeof value === 'string') return value;
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '+Inf' : '-Inf';
  return String(value);
}

/**
 * The payload as Prometheus text. Each gauge is a gauge; the resource's numeric
 * attributes (for the bill, what a day still being measured and what had no
 * date held) are each a gauge of their own, an instant among its text
 * attributes is a gauge in seconds, and the rest of its text attributes are
 * the labels of one `<service>_info` sample of value 1, the convention for
 * facts that are not numbers. Ends with a line break, as the format requires.
 */
export function toPrometheusText(payload: OtlpPayload): string {
  const out: string[] = [];
  const [resourceMetrics] = payload.resourceMetrics;
  const resource = resourceMetrics.resource.attributes;
  const service = resource.find((a) => a.key === 'service.name');
  const prefix = service === undefined ? 'otlp' : prometheusName(attributeText(service));

  for (const metric of resourceMetrics.scopeMetrics[0].metrics) {
    const name = metricName(metric.name, metric.unit);
    out.push(`# HELP ${name} ${helpText(metric.description)}`, `# TYPE ${name} gauge`);
    for (const point of metric.gauge.dataPoints) {
      const value = point.asDouble ?? point.asInt;
      if (value === undefined) continue;
      out.push(`${name}${labels(point.attributes)} ${sampleValue(value)}`);
    }
  }

  const numeric = resource.filter((a) => !('stringValue' in a.value));
  for (const attribute of numeric) {
    const name = prometheusName(attribute.key);
    out.push(
      `# HELP ${name} ${helpText(`The payload's resource attribute ${attribute.key}.`)}`,
      `# TYPE ${name} gauge`,
      `${name} ${sampleValue(attributeText(attribute))}`,
    );
  }
  /*
    An instant is a number, not a label: a label that changes on every write
    starts a new series on every write, which Prometheus keeps until it ages
    out. So `trazum.bill.measured_at` is `trazum_bill_measured_at_seconds`,
    seconds since the epoch, and only text that stays the same for a day or
    more (the open days) is a label.
  */
  const instants = resource.filter((a) => 'stringValue' in a.value && isInstant(a.value.stringValue));
  for (const attribute of instants) {
    const name = `${prometheusName(attribute.key)}_seconds`;
    out.push(
      `# HELP ${name} ${helpText(`The payload's resource attribute ${attribute.key}, in seconds since the epoch.`)}`,
      `# TYPE ${name} gauge`,
      `${name} ${sampleValue(Date.parse(attributeText(attribute)) / 1000)}`,
    );
  }
  const text = resource.filter((a) => 'stringValue' in a.value && a.key !== 'service.name' && !instants.includes(a));
  const info = `${prefix}_info`;
  out.push(
    `# HELP ${info} ${helpText("The payload's text resource attributes, as labels.")}`,
    `# TYPE ${info} gauge`,
    `${info}${labels(text)} 1`,
  );

  return `${out.join('\n')}\n`;
}
