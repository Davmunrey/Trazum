import {
  BUNDLED_CATALOGUE,
  MAX_PRICING_BYTES,
  SLOTS,
  SLOT_IDS,
  PRICING_LAST_REVIEWED,
  PricingOverlayError,
  UNLABELLED,
  assemble,
  billLevers,
  cacheEconomics,
  cacheHitRate,
  catalogueFromOverlay,
  coverageDrift,
  driversBetween,
  formatUsd,
  guardSpend,
  interview,
  nearestName,
  reviewAgeDays,
  listModels,
  optimize,
  contextPressure,
  parseLimits,
  parseUsageLine,
  parseWaive,
  positionReport,
  profileUsage,
  repriceProfile,
  slot,
  MAX_INPUT_CHARS,
} from '@trazum/core';
import type { RuleLevel } from '@trazum/core';

import { SLOT_QUESTIONS } from './questions.js';
import { InvalidArguments } from './rpc.js';
import type { ToolDefinition } from './rpc.js';

/**
 * The tools, kept in one file so the whole surface an agent can reach reads in one
 * pass.
 *
 * **Three deliberate absences, and they are the security design.**
 *
 * *No paths.* Every tool takes prompt text. A tool that accepted a filename would
 * be a file-read primitive reachable by whatever the model decided to ask for, and
 * "we reviewed it" is not a durable defence against one being added later. This
 * package imports `@trazum/core`, the browser-safe entry point, and never
 * `@trazum/core/node` — so the capability is *absent* rather than unused, and a
 * test enforces that.
 *
 * *No network.* Nothing here calls a model. `--suggest` and `eval` exist in the
 * CLI and are deliberately not exposed: they spend the caller's money, and a tool
 * an agent can invoke in a loop must not be able to do that. Everything below is
 * arithmetic on text.
 *
 * *No writes.* The tools return figures. Applying them is the agent's job, in its
 * own context, where a human can see the diff.
 */

/**
 * The same cap every other door uses, read from the one place it is written.
 *
 * An agent in a loop is exactly the caller that hands you a 40 MB string by
 * accident. Refusing early with a number beats an unbounded pass over it.
 */
export const MAX_PROMPT_CHARS = MAX_INPUT_CHARS;

/** Every figure this server prints descends from the estimator, so it says so. */
const BAND_NOTE =
  'token counts are estimates (±10% on prose, calibrated on Claude); prices reviewed '
  + PRICING_LAST_REVIEWED;

function promptFrom(args: Record<string, unknown>): string {
  const prompt = args.prompt;
  if (typeof prompt !== 'string') throw new InvalidArguments('prompt must be a string');
  if (prompt.length === 0) throw new InvalidArguments('prompt is empty');
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new InvalidArguments(
      `prompt is ${prompt.length} characters, over the ${MAX_PROMPT_CHARS} limit`,
    );
  }
  return prompt;
}

function levelFrom(args: Record<string, unknown>): RuleLevel {
  const level = args.level ?? 'safe';
  if (level !== 'safe' && level !== 'aggressive') {
    throw new InvalidArguments('level must be "safe" or "aggressive"');
  }
  return level;
}

/**
 * A positive integer, or the default.
 *
 * Written out rather than reached for from a validation library, and bounded on
 * both ends: `callsPerMonth: 1e308` would otherwise produce an Infinity in
 * somebody's budget, which is worse than a refusal because it looks like an
 * answer.
 */
function intFrom(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const raw = args[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new InvalidArguments(`${key} must be an integer`);
  }
  if (raw < min || raw > max) {
    throw new InvalidArguments(`${key} must be between ${min} and ${max}`);
  }
  return raw;
}

const PROMPT_PROPERTY = {
  type: 'string',
  minLength: 1,
  maxLength: MAX_PROMPT_CHARS,
  description: 'The prompt text itself. This server never reads files.',
};

const LEVEL_PROPERTY = {
  type: 'string',
  enum: ['safe', 'aggressive'],
  default: 'safe',
  description: 'safe leaves meaning untouched; aggressive also rewords, and wants reading',
};

const OPTIMIZE: ToolDefinition = {
  name: 'optimize_prompt',
  title: 'Optimise a prompt and price the difference',
  description:
    "Applies Trazum's deterministic rules to a prompt and returns the shorter text, the "
    + 'token counts either side, what the difference is worth per month, and any advisories. '
    + 'Offline and free: no model is called.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: PROMPT_PROPERTY,
      level: LEVEL_PROPERTY,
      model: {
        type: 'string',
        default: 'claude-opus-5',
        description: 'Model id used for pricing. Call list_models for what is known.',
      },
      callsPerMonth: {
        type: 'integer',
        minimum: 1,
        maximum: 1_000_000_000,
        default: 1000,
        description: 'Used only to scale the figures',
      },
      avgOutputTokens: { type: 'integer', minimum: 0, maximum: 1_000_000, default: 500 },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  run: (args) => {
    const model = args.model ?? 'claude-opus-5';
    if (typeof model !== 'string') throw new InvalidArguments('model must be a string');
    const callsPerMonth = intFrom(args, 'callsPerMonth', 1000, { min: 1, max: 1_000_000_000 });
    const avgOutputTokens = intFrom(args, 'avgOutputTokens', 500, { min: 0, max: 1_000_000 });

    const result = optimize(promptFrom(args), {
      level: levelFrom(args),
      usage: { model, callsPerMonth, avgOutputTokens },
    });

    const lines = [
      `tokens: ${result.tokensBefore} → ${result.tokensAfter}`
        + ` (${result.tokensBefore - result.tokensAfter} fewer)`,
      `monthly saving at ${callsPerMonth.toLocaleString('en-US')} calls:`
        + ` ${formatUsd(result.savings.monthlySavingsUsd)}`,
      BAND_NOTE,
      '',
      '--- optimised prompt ---',
      result.optimized,
    ];

    if (result.advisories.length > 0) {
      lines.push('', '--- advisories ---');
      for (const advisory of result.advisories) {
        const money =
          advisory.estimatedMonthlyUsd === null
            ? ''
            : ` (~${formatUsd(advisory.estimatedMonthlyUsd)}/month)`;
        lines.push(`[${advisory.id}] ${advisory.title}${money}`);
      }
    }

    return lines.join('\n');
  },
};

const CHECK: ToolDefinition = {
  name: 'check_prompt',
  title: 'Check a prompt against a token budget',
  description:
    'Answers whether a prompt fits a maximum, and if not, whether optimising it would. '
    + 'This is the one to call before sending a prompt you are unsure about.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: PROMPT_PROPERTY,
      maxTokens: {
        type: 'integer',
        minimum: 1,
        description: 'The budget. Required: a check with no maximum is not a check.',
      },
      level: LEVEL_PROPERTY,
    },
    required: ['prompt', 'maxTokens'],
    additionalProperties: false,
  },
  run: (args) => {
    if (args.maxTokens === undefined) throw new InvalidArguments('maxTokens is required');
    const maxTokens = intFrom(args, 'maxTokens', 0, { min: 1, max: Number.MAX_SAFE_INTEGER });
    const level = levelFrom(args);
    const result = optimize(promptFrom(args), { level });

    /**
     * Three outcomes, not two, and the third is why this tool exists.
     *
     * "Over budget" and "over budget but the rules would fix it" are different
     * instructions to whoever asked: one means cut content, the other means run
     * the rules. A boolean throws away the actionable half.
     */
    const verdict =
      result.tokensBefore <= maxTokens
        ? `PASS — ${result.tokensBefore} tokens, budget ${maxTokens}`
        : result.tokensAfter <= maxTokens
          ? `OVER BUDGET — ${result.tokensBefore} tokens against ${maxTokens}, but the ${level}`
            + ` rules bring it to ${result.tokensAfter}, which fits. Optimise rather than cut.`
          : `OVER BUDGET — ${result.tokensBefore} tokens against ${maxTokens}. Even optimised it`
            + ` is ${result.tokensAfter}: content has to be cut.`;

    return [
      verdict,
      'token counts are estimates (±10% on prose, calibrated on Claude), so a prompt within'
        + ' a few percent of its budget should be treated as uncertain',
    ].join('\n');
  },
};

const MODELS: ToolDefinition = {
  name: 'list_models',
  title: 'Models Trazum can price, and their rates',
  description:
    'Input and output price per million tokens, context window and cacheable minimum, for '
    + 'every model in the bundled catalogue.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: () => {
    const rows = listModels().map((model) => {
      const cache =
        model.caching === 'none' || model.cacheMinTokens === null
          ? 'no caching'
          : `cache min ${model.cacheMinTokens}`;
      return `${model.id}  in $${model.inputPerMTok}/Mtok  out $${model.outputPerMTok}/Mtok`
        + `  context ${model.contextWindow.toLocaleString('en-US')}  ${cache}`;
    });

    return [
      `prices reviewed ${BUNDLED_CATALOGUE.lastReviewed} — verify before budgeting`,
      '',
      ...rows,
    ].join('\n');
  },
};

/**
 * Larger than the prompt cap because a usage log is a different object: a month
 * of calls at one JSON line each. Two million characters is a few MB of log —
 * far beyond what an agent realistically holds in context, so the cap exists to
 * refuse the accident, not to invite the maximum.
 */
export const MAX_LOG_CHARS = 2_000_000;

/** `<1%` for a real but sub-half-percent share, never a rounded-to-zero "0%". */
const pct = (fraction: number): string =>
  fraction > 0 && fraction < 0.005 ? '<1%' : `${(fraction * 100).toFixed(0)}%`;

const count = (n: number, word: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;

const PROFILE: ToolDefinition = {
  name: 'profile_usage',
  title: 'Where the money went, from a usage log',
  description:
    'Reads a usage log — one JSON object per line, each with a "model" and the "usage" object '
    + 'the API returned — and says where the money went: the spend split, per label and per '
    + 'model, whether caching paid for itself, and which levers would actually move the bill. '
    + 'These are the provider\'s own billed token counts, not estimates. Pass the log text '
    + 'itself: this server never reads files. Add "label", "session" and "ts" fields to the '
    + 'records to unlock the per-workload findings, conversation growth, the period the log '
    + 'covers, and whether the cache TTL fits how fast the turns arrive; the session key is '
    + 'grouped by and never shown.',
  inputSchema: {
    type: 'object',
    properties: {
      log: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_LOG_CHARS,
        description: 'The usage log text, one JSON object per line. Never a file path.',
      },
      label: {
        type: 'string',
        minLength: 1,
        description:
          'Profile only the calls carrying this label — the drill-down once the full report '
          + 'named a suspect. A label matching nothing is an error naming the labels that exist.',
      },
      since: {
        type: 'string',
        minLength: 1,
        description:
          'Profile only calls at or after this moment: a UTC day (2026-08-14) or a full ISO '
          + '8601 timestamp. Calls with no "ts" cannot be placed and are excluded, counted out '
          + 'loud — never dropped silently.',
      },
      until: {
        type: 'string',
        minLength: 1,
        description:
          'Profile only calls up to this moment; a bare date includes that whole UTC day. '
          + 'A window matching nothing is an error naming what the log does cover.',
      },
      previous_log: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_LOG_CHARS,
        description:
          'A previous usage log to compare against, as text — never a file path. Positive '
          + 'means the bill grew. Drivers of the change are named per label and per model, '
          + 'appeared and vanished workloads included; label/since/until filter both logs, '
          + 'so the comparison stays one workload and one period.',
      },
      what_if: {
        type: 'string',
        minLength: 1,
        description:
          'Price these exact calls on another model id. The same token counts at a different '
          + 'rate card — multiplication, not advice: it says nothing about whether that model '
          + 'could do the work. Calls larger than that model\'s context window are named as '
          + 'impossible rather than priced as cheap, and spend already on that model stays out '
          + 'of the difference. An id this catalogue cannot price is an error, never silence.',
      },
      pricing_overlay: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_PRICING_BYTES,
        description:
          'The same JSON document a --pricing overlay file holds, passed as text — never a '
          + 'file path. Adds models the bundled catalogue does not know and overrides prices '
          + 'for ones it does; every figure in the report, including what_if, is then priced '
          + 'under it, and the report says the overlay is in effect. Requires "lastReviewed" '
          + 'and a non-empty "models" object; a malformed overlay is an error naming the '
          + 'problem, never a report silently priced from the bundled table.',
      },
    },
    required: ['log'],
    additionalProperties: false,
  },
  run: (args) => {
    const log = args.log;
    if (typeof log !== 'string') throw new InvalidArguments('log must be a string');
    if (log.length === 0) throw new InvalidArguments('log is empty');
    if (log.length > MAX_LOG_CHARS) {
      throw new InvalidArguments(
        `log is ${log.length} characters, over the ${MAX_LOG_CHARS} limit`,
      );
    }
    const onlyLabel = args.label;
    if (onlyLabel !== undefined && typeof onlyLabel !== 'string') {
      throw new InvalidArguments('label must be a string');
    }
    /**
     * The window, under the CLI's rules: a bare day is that whole UTC day —
     * since its first instant, until its last — and the window is half-open
     * `[since, until)` internally, so adjacent windows share no record.
     */
    const parseWhen = (key: 'since' | 'until'): number | undefined => {
      const value = args[key];
      if (value === undefined) return undefined;
      if (typeof value !== 'string') throw new InvalidArguments(`${key} must be a string`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const midnight = Date.parse(`${value}T00:00:00Z`);
        if (Number.isFinite(midnight)) return key === 'until' ? midnight + 86_400_000 : midnight;
      }
      const exact = Date.parse(value);
      if (Number.isFinite(exact)) return exact;
      throw new InvalidArguments(
        `${key} could not be read: "${value}". Pass a UTC day (2026-08-14) or a full ISO 8601 timestamp.`,
      );
    };
    const sinceMs = parseWhen('since');
    const untilMs = parseWhen('until');
    if (sinceMs !== undefined && untilMs !== undefined && sinceMs >= untilMs) {
      throw new InvalidArguments('since is at or after until, so the window contains no time at all');
    }
    const windowed = sinceMs !== undefined || untilMs !== undefined;

    /**
     * The catalogue for this run: the caller's overlay applied over the
     * bundled table, or the bundled table alone — the same layering as the
     * CLI's `--pricing`, minus the file. The overlay travels as text because
     * this server takes no paths, and a bad one is refused with the parser's
     * own reason rather than priced from the bundled table as if nothing had
     * been asked.
     */
    const overlayRaw = args.pricing_overlay;
    let catalogue = BUNDLED_CATALOGUE;
    if (overlayRaw !== undefined) {
      if (typeof overlayRaw !== 'string') throw new InvalidArguments('pricing_overlay must be a string');
      if (overlayRaw.length > MAX_PRICING_BYTES) {
        throw new InvalidArguments(
          `pricing_overlay is ${overlayRaw.length} characters, over the ${MAX_PRICING_BYTES} limit`,
        );
      }
      try {
        catalogue = catalogueFromOverlay(overlayRaw, 'pricing_overlay');
      } catch (error) {
        if (error instanceof PricingOverlayError) throw new InvalidArguments(error.message);
        throw error;
      }
    }

    const report = profileUsage(log, { catalogue, label: onlyLabel, sinceMs, untilMs });
    /**
     * The drill-downs' one rule, same as the CLI: a filter matching nothing is
     * an error naming what exists, never a silent report over zero calls that
     * an agent would read as "this workload is free" or "this period is free".
     */
    if ((onlyLabel !== undefined || windowed) && report.total.calls === 0 && report.unpriced.calls === 0) {
      const unfiltered = profileUsage(log, { catalogue });
      if (unfiltered.total.calls > 0 || unfiltered.unpriced.calls > 0) {
        if (onlyLabel !== undefined && !unfiltered.byLabel.some((e) => e.label === onlyLabel)) {
          const available = unfiltered.byLabel
            .map((e) => (e.label === UNLABELLED ? '(no label)' : e.label))
            .join(', ');
          throw new InvalidArguments(
            `no call in this log carries the label "${onlyLabel}". The labels here are: ${available || '—'}`,
          );
        }
        if (windowed) {
          if (unfiltered.span === null) {
            throw new InvalidArguments(
              'no record in this log carries a timestamp, so since/until have nothing to filter by. '
                + 'Add "ts" to the records.',
            );
          }
          const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
          throw new InvalidArguments(
            `no record falls inside this window. The log covers ${day(unfiltered.span.fromMs)} → ${day(unfiltered.span.toMs)}.`,
          );
        }
      }
    }
    const { total } = report;
    const lines: string[] = [];

    const gaps = (): void => {
      if (report.unpricedModels.length > 0) {
        lines.push(
          `${count(report.unpriced.calls, 'call')} are not in these totals — the pricing `
            + `catalogue does not know: ${report.unpricedModels.join(', ')}. `
            + (catalogue === BUNDLED_CATALOGUE
              ? 'A pricing_overlay argument can price them.'
              : 'The overlay in effect does not name them either.'),
        );
      }
      if (report.skippedLines.length > 0) {
        const shown = report.skippedLines.slice(0, 10).join(', ');
        const more = report.skippedLines.length > 10 ? ', …' : '';
        lines.push(
          `${count(report.skippedLines.length, 'line')} could not be read and`
            + ` ${report.skippedLines.length === 1 ? 'was' : 'were'} left out`
            + ` (line${report.skippedLines.length === 1 ? '' : 's'} ${shown}${more}).`,
        );
      }
    };

    if (total.calls === 0) {
      lines.push(
        report.unpriced.calls > 0
          ? 'None of the models in that log are in the pricing catalogue, so there is no bill '
            + 'to report.'
          : 'No usage records in that log.',
      );
      gaps();
      return lines.join('\n');
    }

    // The one Trazum surface whose figures are NOT estimates, said out loud
    // because every sibling tool here carries the ±10% band.
    lines.push(
      `${count(total.calls, 'call')} · ${formatUsd(total.totalUsd)} — exact billed token`
        + ` counts from the log, not estimates; prices reviewed ${catalogue.lastReviewed}.`,
    );
    /**
     * The overlay is part of the answer, not plumbing: every dollar above was
     * priced under it, so a reader comparing this report against one priced
     * from the bundled table must be able to see they are not the same table.
     */
    if (catalogue !== BUNDLED_CATALOGUE) {
      const added = catalogue.addedModels.length;
      const overridden = catalogue.overriddenModels.length;
      lines.push(
        `A pricing overlay is in effect: ${count(added, 'model')} added, `
          + `${overridden} overridden. Figures are priced under it, not the bundled table.`,
      );
    }
    /**
     * Said only when old enough to matter, and loud then: a stale table
     * qualifies every dollar above, and unlike a skipped line it does not
     * name its own size — the error is exactly whatever the provider changed.
     */
    const pricingAge = reviewAgeDays(catalogue.lastReviewed, new Date());
    if (pricingAge !== null && pricingAge > 45) {
      lines.push(
        `That review was ${pricingAge} days ago, past the 45 this tool considers current. If the`
          + ' provider changed prices since, every figure here is off by exactly that change —'
          + ' the CLI can fetch current prices (trazum profile --pricing-live).',
      );
    }
    if (report.span !== null) {
      const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
      const days = ((report.span.toMs - report.span.fromMs) / 86_400_000).toFixed(1);
      const parsed = total.calls + report.unpriced.calls;
      const partial =
        report.span.calls < parsed
          ? ` Only ${count(report.span.calls, 'call')} of ${parsed} carry a timestamp; the span describes those.`
          : '';
      lines.push(
        `This log covers ${day(report.span.fromMs)} → ${day(report.span.toMs)} (${days} days).`
          + ' The span is stated, never extrapolated — the monthly arithmetic is yours to do.'
          + partial,
      );
    } else {
      lines.push(
        'Figures are "on this bill" — the log carries no timestamps, so no period is known'
          + ' and nothing here is per-month. Add "ts" to the record and the span is stated.',
      );
    }
    // The window before any figure is trusted as "the log", with the undated
    // count said out loud: those calls' spend is in the log and not here.
    if (report.timeWindow !== null) {
      lines.push('Everything below describes the since/until window, not the whole log.');
      if (report.timeWindow.undatedExcluded > 0) {
        lines.push(
          `${count(report.timeWindow.undatedExcluded, 'call')} carry no timestamp and cannot be`
            + ' placed inside or outside the window, so they were left out. The window\'s figures'
            + ' are a floor on the period.',
        );
      }
    }
    lines.push(
      `input ${formatUsd(total.inputUsd)} · cache reads ${formatUsd(total.cacheReadUsd)}`
        + ` · cache writes ${formatUsd(total.cacheWriteUsd)}`
        + ` · output ${formatUsd(total.outputUsd)} (${pct(total.outputUsd / total.totalUsd)})`,
    );

    const name = (label: string): string => (label === UNLABELLED ? '(no label)' : label);
    const table = (heading: string, rows: Array<{ key: string; usd: number; calls: number }>) => {
      lines.push('', `--- ${heading} ---`);
      for (const row of rows.slice(0, 10)) {
        lines.push(
          `${formatUsd(row.usd).padStart(11)}  ${pct(row.usd / total.totalUsd).padStart(4)}`
            + `  ${row.key}  (${count(row.calls, 'call')})`,
        );
      }
      if (rows.length > 10) lines.push(`…and ${rows.length - 10} more.`);
    };
    table('by label', report.byLabel.map((e) => ({
      key: name(e.label), usd: e.breakdown.totalUsd, calls: e.breakdown.calls,
    })));
    table('by model', report.byModel.map((e) => ({
      key: e.model, usd: e.breakdown.totalUsd, calls: e.breakdown.calls,
    })));

    lines.push('', '--- did caching pay for itself? ---');
    const cache = cacheEconomics(total);
    /**
     * The verdict is unsettled when the TTL assumption alone flips it: neither
     * end may be stated as the answer, and the flattering half least of all.
     * Same gate as the CLI and the web viewer.
     */
    const unsettled = cache.worstCaseVerdict !== cache.verdict && total.assumedWriteTtlCalls > 0;
    if (unsettled) {
      lines.push(
        `This log cannot say whether caching paid for itself. ${count(total.assumedWriteTtlCalls, 'call')}`
          + ' did not record which cache-write TTL was used: at the 5-minute rate caching took'
          + ` ${formatUsd(Math.abs(cache.deltaUsd))} off this bill, and at the 1-hour rate the`
          + ` same calls added ${formatUsd(Math.abs(cache.worstCaseDeltaUsd))} to it. Neither is`
          + ' the answer. Record the "cache_creation" object the API returns and this settles itself.',
      );
    } else if (cache.verdict === 'not-attempted') {
      lines.push(
        'Caching was never used on these calls. If any prefix repeats, that is the largest '
          + 'saving available.',
      );
    } else if (cache.verdict === 'unpriced') {
      lines.push('Cache tokens exist on models the catalogue cannot price; no comparison to make.');
    } else if (cache.verdict === 'lost-money') {
      lines.push(
        `Caching added ${formatUsd(cache.deltaUsd)} to this bill instead of taking it off — a`
          + ' write costs 1.25x plain input (2x at the 1-hour TTL), so a prefix that changes'
          + ' faster than it is reused pays that premium for nothing.',
      );
    } else if (cache.verdict === 'paid-off') {
      lines.push(
        `Caching took ${formatUsd(Math.abs(cache.deltaUsd))} off this bill, against the same`
          + ' tokens uncached.',
      );
    } else {
      lines.push('Caching came out level: it charged what the same tokens cost as plain input.');
    }
    if (!unsettled && total.assumedWriteTtlCalls > 0) {
      lines.push(
        `That figure is a bound, not a measurement: ${count(total.assumedWriteTtlCalls, 'call')}`
          + ' did not record a cache-write TTL.',
      );
    }
    const losing = report.byLabel.filter(
      (e) => cacheEconomics(e.breakdown).verdict === 'lost-money',
    );
    if (cache.verdict !== 'lost-money' && losing.length > 0) {
      lines.push(`The total hides a loss: caching loses money on ${losing.map((e) => name(e.label)).join(', ')}.`);
    }
    const hit = cacheHitRate(total);
    if (hit !== null) lines.push(`Cache hit rate ${pct(hit)} of billable input.`);
    /**
     * Whether the TTL fits how fast the turns arrive — the mechanism behind the
     * verdict above. Four verdicts plus "could not be measured": the same
     * three-state discipline as truncation, because for an agent acting on this
     * report "no data" and "fits" are different instructions.
     */
    const gapOf = (ms: number): string => {
      if (ms < 90_000) return `${Math.round(ms / 1000)}s`;
      if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)}m`;
      return `${(ms / 3_600_000).toFixed(1)}h`;
    };
    for (const fit of report.cacheTtlFit.slice(0, 3)) {
      const who = `${name(fit.label)} on ${fit.modelName}`;
      const gap = gapOf(fit.medianGapMs);
      if (fit.verdict === 'expires-before-reuse') {
        lines.push(
          `${who}: turns arrive a median of ${gap} apart and the cache entry is gone by then —`
            + ' writes expire before the next turn reads them. Use the 1-hour TTL if it survives'
            + ' these gaps, or turn caching off here.',
        );
      } else if (fit.verdict === 'overlong-ttl') {
        lines.push(
          `${who}: turns arrive a median of ${gap} apart — inside the 5-minute window — and these`
            + ` writes pay the 1-hour rate (2x input) for endurance they never use. The same writes`
            + ` at the 5-minute TTL are ${formatUsd(fit.overpayUsd)} cheaper on this log, exactly.`,
        );
      } else if (fit.verdict === 'unsettled') {
        lines.push(
          `${who}: median gap ${gap} — a 5-minute entry is gone by then, a 1-hour one survives,`
            + ' and the log did not record which these writes were. Record the "cache_creation"'
            + ' object and this settles itself.',
        );
      } else {
        lines.push(`${who}: median gap ${gap}, inside the lifetime these writes use. The TTL fits.`);
      }
    }
    if (total.cacheWriteTokens > 0 && report.cacheTtlFit.length === 0) {
      lines.push(
        'Whether the cache TTL fits how fast the turns arrive could not be measured — it needs'
          + ' both "session" and "ts" on the record.',
      );
    }
    /**
     * Conversations that never came back. The same two-claim split as the CLI:
     * a fact when the slice recorded zero cache reads (nothing read those
     * writes at all), a ceiling named as one otherwise — the provider's cache
     * is keyed by prefix, and the log cannot see whose write a read hit.
     */
    const readsBySlice = new Map(
      report.byLabelAndModel.map((e) => [`${e.label}\n${e.model}`, e.breakdown.cacheReadTokens]),
    );
    for (const row of report.singleTurnCacheWrites.slice(0, 3)) {
      const who = `${name(row.label)} on ${row.modelName}`;
      const opening =
        `${who}: ${count(row.singleTurnSessions, 'conversation')} of ${row.sessions} ended after`
        + ` the first turn and spent ${formatUsd(row.singleTurnWriteUsd)} on cache writes their`
        + ' own conversation never read back.';
      if ((readsBySlice.get(`${row.label}\n${row.model}`) ?? 0) === 0) {
        lines.push(
          `${opening} Nothing in this log ever read this slice's cache at all, so those writes`
            + ' bought nothing — stop marking one-shot calls with cache_control.',
        );
      } else {
        lines.push(
          `${opening} Another conversation sharing the same prefix within the TTL could have read`
            + ' them; the log cannot see whose write a read hit, so that figure is a ceiling on'
            + ' the waste, not a bill.',
        );
      }
    }

    lines.push('', '--- what would actually move this bill ---');
    const levers = billLevers(report, { catalogue });
    if (report.byLabel.length === 1 && report.byLabel[0]!.label === UNLABELLED) {
      lines.push(
        'None of these calls carried a label, so this is every workload in one row. Add "label" '
          + 'to the record and the levers split by workload, the grouping a decision is made at.',
      );
    }
    if (levers.slices.length === 0) {
      lines.push(
        'Nothing here clears 1% of the bill: these calls are already on the cheapest model of '
          + 'their family, or their provider has no batch API. A real answer, not an empty section.',
      );
    }
    for (const slice of levers.slices.slice(0, 5)) {
      lines.push(
        `${name(slice.label)} on ${slice.modelName} — up to ${formatUsd(slice.combinedUsd)}`
          + ` (${pct(slice.shareOfBill)}); ${count(slice.calls, 'call')}, ${formatUsd(slice.spentUsd)} spent`,
      );
      if (slice.route !== null) {
        lines.push(
          `  route to ${slice.route.candidate.displayName}: ${formatUsd(slice.route.savingUsd)}`
            + ' — an evaluation question, not arithmetic; the CLI measures it: trazum route',
        );
      }
      if (slice.batch !== null) {
        lines.push(`  batch API: ${formatUsd(slice.batch.savingUsd)}`);
      }
    }
    lines.push(
      `For comparison, shortening prompt text can touch ${formatUsd(levers.promptCeilingUsd)}`
        + ` at the very most (${pct(levers.promptCeilingShare)}) — a ceiling, and the real figure`
        + ' is far below it: most input tokens are context, history and tool results no prompt'
        + ' file contains.',
    );

    lines.push('', '--- conversations ---');
    if (!report.hasSessions) {
      lines.push(
        'No call carried a session, so re-sending-the-conversation costs could not be measured '
          + '— usually the largest line on a chat or agent bill. Add "session" to the record; '
          + 'it is grouped by and never shown.',
      );
    }
    for (const growth of report.conversations.slice(0, 3)) {
      lines.push(
        `${name(growth.label)} on ${growth.modelName}: at most ${formatUsd(growth.growthUsd)}`
          + ` of this bill is conversation growth (${pct(growth.shareOfBill)}) — a ceiling, not a`
          + " saving; part is the user's own new messages. Input runs"
          + ` ${Math.round(growth.minTurnTokens).toLocaleString('en-US')} to`
          + ` ${Math.round(growth.maxTurnTokens).toLocaleString('en-US')} tokens per turn over`
          + ` conversations up to ${growth.longestSession} turns.`,
      );
    }

    /**
     * What one conversation costs — median against p95, the figure a per-seat
     * price or a quota is set from. A mean is refused for the reason it is
     * refused everywhere: one runaway loop hides the ordinary case.
     */
    for (const shape of report.sessionCosts.slice(0, 3)) {
      lines.push(
        `${name(shape.label)} on ${shape.modelName}: across ${shape.sessions} conversations the`
          + ` median costs ${formatUsd(shape.medianUsd)} over ${shape.medianTurns} turns, 95% come`
          + ` in under ${formatUsd(shape.p95Usd)}, the dearest was ${formatUsd(shape.maxUsd)}.`
          + ' Exact billed counts per conversation; one that started before this log or continues'
          + ' after it counts only for the turns recorded here.',
      );
      if (shape.medianUsd > 0 && shape.p95Usd > 10 * shape.medianUsd) {
        lines.push(
          `That p95 is ${(shape.p95Usd / shape.medianUsd).toFixed(0)}x the median — a tail a quota`
            + ' can catch, rather than a workload that is uniformly expensive.',
        );
      }
    }
    /**
     * The figure that survives a small log: the percentiles above refuse thin
     * slices, but a maximum is a fact at any count — and it is the number a
     * per-conversation budget judges.
     */
    if (report.sessionCosts.length === 0 && report.sessionSpend !== null) {
      lines.push(
        `${report.sessionSpend.sessions} conversation${report.sessionSpend.sessions === 1 ? '' : 's'}`
          + ` in this log; the most expensive cost ${formatUsd(report.sessionSpend.maxUsd)}. Too few`
          + ' per workload for a percentile — a maximum is a fact at any count, and it is the figure'
          + ' a per-conversation budget (--max-session-usd) judges.',
      );
    }

    lines.push('', '--- truncation ---');
    if (total.stopReasonCalls === 0) {
      lines.push(
        'Whether any answers were cut off could not be measured — no call carries a stop '
          + 'reason. Add "stop_reason" (Anthropic) or "finish_reason" (OpenAI) to the record.',
      );
    } else if (total.truncatedCalls > 0) {
      lines.push(
        `${count(total.truncatedCalls, 'call')} hit the max_tokens ceiling:`
          + ` ${formatUsd(total.truncatedOutputUsd)} of output`
          + ` (${pct(total.outputUsd > 0 ? total.truncatedOutputUsd / total.outputUsd : 0)})`
          + ' bought answers cut off mid-generation — paid in full and frequently retried.',
      );
      /**
       * Which workloads pay for it, at a rate over calls that **recorded a
       * stop reason** — never over every call, because a workload logging
       * the field half the time is not one whose other half completed.
       */
      const truncating = report.byLabel
        .filter((entry) => entry.breakdown.truncatedCalls > 0)
        .sort((a, b) => b.breakdown.truncatedOutputUsd - a.breakdown.truncatedOutputUsd);
      if (truncating.length > 0 && report.byLabel.length > 1) {
        for (const entry of truncating.slice(0, 3)) {
          lines.push(
            `${name(entry.label)}: ${entry.breakdown.truncatedCalls} of`
              + ` ${entry.breakdown.stopReasonCalls} calls that recorded a stop reason were cut off`
              + ` (${pct(entry.breakdown.truncatedCalls / entry.breakdown.stopReasonCalls)}),`
              + ` ${formatUsd(entry.breakdown.truncatedOutputUsd)} of output. The denominator is`
              + ' the calls that measured, not every call.',
          );
        }
      }
      const ceiling = report.outputShapes.find((shape) => shape.p95WithinTokens !== null);
      if (ceiling !== undefined) {
        lines.push(
          `95% of the answers that finished fit within ${ceiling.p95WithinTokens} output tokens —`
            + ' the number a max_tokens cap wants. Measured on these calls, promised for nothing.',
        );
      }
    } else {
      lines.push('Stop reasons were recorded, and no answer hit the max_tokens ceiling.');
    }

    /**
     * This bill against the previous one. The same section the CLI prints,
     * over the same shared `driversBetween` — appeared and vanished workloads
     * named, the model split only when more than one model is involved, and a
     * previous log with nothing priced reported as its own answer rather than
     * as zero growth.
     */
    const previousLog = args.previous_log;
    if (previousLog !== undefined) {
      if (typeof previousLog !== 'string') throw new InvalidArguments('previous_log must be a string');
      if (previousLog.length > MAX_LOG_CHARS) {
        throw new InvalidArguments(
          `previous_log is ${previousLog.length} characters, over the ${MAX_LOG_CHARS} limit`,
        );
      }
      // The same filters on both sides: a windowed or drilled-down bill
      // against the whole previous log would call every sibling workload a
      // vanished saving.
      const previous = profileUsage(previousLog, {
        catalogue,
        label: onlyLabel,
        sinceMs,
        untilMs,
      });
      lines.push('', '--- against the previous log ---');
      if (previous.total.calls === 0) {
        lines.push(
          'The previous log has nothing the pricing catalogue knows (under the same filters), '
            + 'so there is no comparison to make — a different answer from zero growth.',
        );
      } else {
        const delta = total.totalUsd - previous.total.totalUsd;
        const growthPct =
          previous.total.totalUsd > 0
            ? ` (${delta >= 0 ? '+' : ''}${((delta / previous.total.totalUsd) * 100).toFixed(1)}%)`
            : '';
        lines.push(
          `Positive means the bill grew. ${formatUsd(previous.total.totalUsd)} → `
            + `${formatUsd(total.totalUsd)}: ${delta >= 0 ? '+' : '-'}${formatUsd(Math.abs(delta))}${growthPct}, `
            + `over ${count(previous.total.calls, 'call')} then and ${count(total.calls, 'call')} now `
            + '— judge the call counts before the money.',
        );
        const describe = (d: { key: string; was: number | null; now: number | null; delta: number }, shown: string): string =>
          d.was === null
            ? `${d.delta >= 0 ? '+' : '-'}${formatUsd(Math.abs(d.delta))} ${shown} (new since the previous log)`
            : d.now === null
              ? `${d.delta >= 0 ? '+' : '-'}${formatUsd(Math.abs(d.delta))} ${shown} (gone since the previous log)`
              : `${d.delta >= 0 ? '+' : '-'}${formatUsd(Math.abs(d.delta))} ${shown} (${formatUsd(d.was)} → ${formatUsd(d.now)})`;
        for (const d of driversBetween(
          previous.byLabel.map((e) => ({ key: e.label, usd: e.breakdown.totalUsd })),
          report.byLabel.map((e) => ({ key: e.label, usd: e.breakdown.totalUsd })),
        ).slice(0, 5)) {
          lines.push(describe(d, name(d.key)));
        }
        const modelsInvolved = new Set([
          ...previous.byModel.map((e) => e.model),
          ...report.byModel.map((e) => e.model),
        ]);
        const modelDrivers = driversBetween(
          previous.byModel.map((e) => ({ key: e.model, usd: e.breakdown.totalUsd })),
          report.byModel.map((e) => ({ key: e.model, usd: e.breakdown.totalUsd })),
        );
        if (modelDrivers.length > 0 && modelsInvolved.size > 1) {
          lines.push('The same change, by model — where the mix moved:');
          for (const d of modelDrivers.slice(0, 3)) lines.push(describe(d, d.key));
        }

        /**
         * What the comparison stopped being able to see. The dollars render a
         * fixed finding and a blinded log identically; only coverage tells
         * them apart, and an agent relaying "spend flat, all clear" off a log
         * that stopped recording a field would be relaying a claim nobody
         * could check.
         */
        const silenced: Record<string, string> = {
          label: 'per-workload spend, the drill-down, and levers that describe a decision rather than a mixture',
          session: 'conversation growth, per-conversation cost, repeated turns, truncation retries and the cache-TTL fit',
          ts: 'the period, the per-day and per-hour shape, the model mix drift, and the cache-TTL question entirely',
          stopReason: 'answers cut off at max_tokens, and the retries billed after them',
        };
        const fieldName: Record<string, string> = {
          label: 'label',
          session: 'session',
          ts: 'timestamp',
          stopReason: 'stop reason',
        };
        for (const drift of coverageDrift(previous.fieldCoverage, report.fieldCoverage)) {
          const was = `${(drift.was * 100).toFixed(1)}%`;
          const now = `${(drift.now * 100).toFixed(1)}%`;
          if (drift.delta < 0) {
            lines.push(
              `Coverage moved: ${fieldName[drift.field]} was on ${was} of records and is now on `
                + `${now}. A field the log stopped recording is not a finding that got fixed — gone `
                + `quiet with it: ${silenced[drift.field]}. Reported from a 20-point move.`,
            );
          } else {
            lines.push(
              `Coverage moved: ${fieldName[drift.field]} was on ${was} of records and is now on `
                + `${now} — this report can see what the previous one could not.`,
            );
          }
        }
      }
    }

    /**
     * The retry bill of truncation — the "billed again" half, measured.
     */
    for (const row of report.truncationRetries.slice(0, 3)) {
      const shown = row.label === UNLABELLED ? 'unlabelled' : row.label;
      lines.push('');
      lines.push(
        `${shown} on ${row.modelName}: ${row.retried} of ${row.truncatedCalls} truncated answers `
          + `were followed within ${Math.round(row.withinMs / 1000)} seconds by another call in the `
          + `same conversation — ${formatUsd(row.wastedUsd)} spent on the cut attempts, plus `
          + `${formatUsd(row.retryUsd)} on the follow-ups. The pair is the shape a retry has; the `
          + 'log cannot see content. The fix either way is a max_tokens the answers actually fit in.',
      );
    }

    /**
     * The mix moving inside the log. Same fifteen-point threshold as the
     * CLI; the exact shares are in the report for an agent that wants them.
     */
    if (report.modelMixDrift !== null) {
      const drift = report.modelMixDrift;
      const moved = drift.models.filter((m) => Math.abs(m.lastShare - m.firstShare) >= 0.15);
      if (moved.length > 0) {
        lines.push('');
        lines.push('The mix moved inside this log:');
        for (const m of moved.slice(0, 3)) {
          lines.push(
            `  ${m.model} went from ${Math.round(m.firstShare * 100)}% of the spend in the first `
              + `${drift.firstDays} days to ${Math.round(m.lastShare * 100)}% in the last ${drift.lastDays} `
              + `(${formatUsd(m.lastUsd)} of the recent half). A bill can grow with no workload growing. `
              + 'Where the mix goes next is not in this log.',
          );
        }
      }
    }

    /**
     * The ceiling in sight. An agent budgeting its own prompts is exactly
     * the caller that can stop growing before the window refuses a call.
     */
    {
      const pressures = contextPressure(report, catalogue);
      if (pressures.length > 0) {
        lines.push('');
        lines.push('Approaching the context window:');
        for (const row of pressures.slice(0, 3)) {
          const shown = row.label === UNLABELLED ? 'unlabelled' : row.label;
          lines.push(
            `  ${shown} on ${row.modelName}: the largest call carried `
              + `${row.maxCallInputTokens.toLocaleString('en-US')} input tokens against a `
              + `${row.contextWindow.toLocaleString('en-US')}-token window — `
              + `${Math.round(row.share * 100)}% of the ceiling. At 100% the call fails outright. `
              + 'When it crosses is not predicted here: the share is a fact, the trajectory is not.',
          );
        }
      }
    }

    /**
     * The same request sent again a moment later — the pattern an agent
     * harness produces when a step retries or loops. Named as a pattern:
     * this reads counts and cannot see content.
     */
    if (report.repeatedTurns.length > 0) {
      lines.push('');
      lines.push('The same request, sent again:');
      for (const row of report.repeatedTurns.slice(0, 3)) {
        const shown = row.label === UNLABELLED ? 'unlabelled' : row.label;
        lines.push(
          `  ${shown} on ${row.model}: ${row.repeats} of ${row.checkedCalls} calls re-sent the `
            + `previous call's exact input size within ${Math.round(row.withinMs / 1000)} seconds, `
            + `in the same conversation, costing ${formatUsd(row.usd)}. A conversation's input `
            + 'grows with every turn, so that is usually a retry, an agent step repeating, or a '
            + 'loop — the log cannot see content, so the pattern is the claim and not the cause.',
        );
      }
    }

    /**
     * How big the calls are, and how uneven that is.
     *
     * The agent asking "why is input 63% of this bill" needs the shape, not
     * the share: an even slice wants a shorter prompt and a skewed one wants
     * a cap on whatever is growing. Both figures are bucket ceilings, so the
     * ratio is stated as approximate.
     */
    if (report.inputShapes.length > 0) {
      lines.push('');
      lines.push('How big these calls are:');
      for (const shape of report.inputShapes.slice(0, 3)) {
        const shown = shape.label === UNLABELLED ? 'unlabelled' : shape.label;
        if (shape.medianWithinTokens === null || shape.p95WithinTokens === null || shape.p95OverMedian === null) {
          lines.push(
            `  ${shown} on ${shape.model}: every call is larger than this tool measures precisely `
              + `(${formatUsd(shape.inputUsd)} of input spend). That size is itself the finding.`,
          );
          continue;
        }
        const cached = `${Math.round(shape.cachedShare * 100)}% of those tokens were cache reads`;
        lines.push(
          `  ${shown} on ${shape.model}: half its calls fit within `
            + `${shape.medianWithinTokens.toLocaleString('en-US')} input tokens and 95% within `
            + `${shape.p95WithinTokens.toLocaleString('en-US')} — about `
            + `${shape.p95OverMedian.toFixed(1)}x the ordinary call, over `
            + `${formatUsd(shape.inputUsd)} of input spend. ${cached}.`,
        );
        lines.push(
          shape.p95OverMedian >= 4
            ? '    Past four times the median the ordinary call is fine and something is growing on '
              + 'top of it — a conversation nobody truncates, a retrieval with no cap. The fix is a '
              + 'limit on the large calls, not a rewrite of the prompt every call sends.'
            : '    The large calls are not much larger than the ordinary one, so there is no tail to '
              + 'cap: the prompt is simply big.',
        );
      }
    }

    /**
     * `what_if`: the same tokens at another model's rates.
     *
     * The caveat leads, because an agent relaying only the dollar figure would
     * turn multiplication into a recommendation. What cannot move is stated
     * next to what would: calls over the target's context window would fail
     * rather than cost less, and money already on the target is not a saving.
     */
    const whatIfModel = args.what_if;
    if (whatIfModel !== undefined) {
      if (typeof whatIfModel !== 'string') throw new InvalidArguments('what_if must be a string');
      const whatIf = repriceProfile(report, whatIfModel, catalogue);
      if (whatIf === null) {
        throw new InvalidArguments(
          `what_if names a model this catalogue cannot price: "${whatIfModel}". Priced models: `
            + catalogue.models.map((m) => m.id).join(', '),
        );
      }
      lines.push('');
      lines.push(
        `These exact calls on ${whatIf.target.displayName}. This is multiplication, not advice: `
          + 'the same token counts at another rate card. It says nothing about whether that '
          + 'model could do the work, and a model that answers at greater length or gets '
          + 'retried would not send these counts at all.',
      );
      if (whatIf.slices.length === 0) {
        lines.push(
          'Nothing to compare: every priced call is already on that model, or too large for '
            + 'its context window.',
        );
      } else {
        const direction = whatIf.deltaUsd < 0 ? 'less' : 'more';
        lines.push(
          `${formatUsd(whatIf.currentUsd)} of movable spend would have been `
            + `${formatUsd(whatIf.targetUsd)} — ${formatUsd(Math.abs(whatIf.deltaUsd))} ${direction}.`,
        );
        // The decision's other half: the same move batched, discounted on
        // the target's rates and never summed with the move. Whether the
        // calls can wait is not in the log, and the sentence says so.
        if (whatIf.batchOnTarget !== null) {
          lines.push(
            `If those calls can also wait, the target's Batch API takes the moved bill from `
              + `${formatUsd(whatIf.targetUsd)} to ${formatUsd(whatIf.batchOnTarget.targetUsd)}. `
              + 'Whether they can wait is not in the log; that half of the decision is the caller\'s.',
          );
        }
        for (const slice of whatIf.slices.slice(0, 5)) {
          const shown = slice.label === UNLABELLED ? 'unlabelled' : slice.label;
          lines.push(
            `  ${shown} on ${slice.model}: ${formatUsd(slice.currentUsd)} → ${formatUsd(slice.targetUsd)}`,
          );
          // Cache traffic the target's minimum would refuse: the row above
          // grants discounted rates to entries that could not form — an error
          // in the flattering direction, so it is corrected in place.
          if (slice.cacheBeyondTarget !== null) {
            lines.push(
              `  Its cache traffic could not exist there: the largest call is `
                + `${slice.maxCallInputTokens.toLocaleString('en-US')} tokens against the target's `
                + `${slice.cacheBeyondTarget.minTokens.toLocaleString('en-US')}-token cache minimum, so no call in `
                + `this slice could create an entry. Without the cache the same tokens cost `
                + `${formatUsd(slice.cacheBeyondTarget.noCacheUsd)} — the figure the target would actually bill.`,
            );
          }
        }
      }
      for (const slice of whatIf.overContext.slice(0, 3)) {
        const shown = slice.label === UNLABELLED ? 'unlabelled' : slice.label;
        lines.push(
          `${shown} cannot move: its largest call carries ${slice.maxCallInputTokens.toLocaleString('en-US')} `
            + `input tokens and that model's window is ${whatIf.target.contextWindow.toLocaleString('en-US')}. `
            + `Those calls would fail, not cost less, so their ${formatUsd(slice.currentUsd)} is excluded above.`,
        );
      }
      if (whatIf.alreadyOnTarget.calls > 0) {
        lines.push(
          `Already on that model: ${whatIf.alreadyOnTarget.calls} calls worth `
            + `${formatUsd(whatIf.alreadyOnTarget.usd)}, left out of the figures above — money that `
            + 'cannot move would make the difference look smaller than it is.',
        );
      }
      if (whatIf.unpricedCalls > 0) {
        lines.push(
          `Excluded: ${whatIf.unpricedCalls} calls whose model has no price here `
            + `(${whatIf.unpricedModels.join(', ')}). Their cost on the target is knowable; the `
            + 'difference is not, because there is no current figure to subtract from.',
        );
      }
    }

    /**
     * What this log cannot answer yet — the fields that unlock the findings
     * an agent would otherwise ask for and not receive. Counts rather than
     * booleans: twelve labelled records out of forty thousand is not a
     * labelled log, and an agent told "labelled" would stop asking.
     */
    const coverage = report.fieldCoverage;
    if (coverage.parsed > 0) {
      const missing: string[] = [];
      const seen = (count_: number): string => `${count_}/${coverage.parsed}`;
      if (coverage.label < coverage.parsed) {
        missing.push(`"label" on ${seen(coverage.label)} records — per-workload spend and the drill-down`);
      }
      if (coverage.session < coverage.parsed) {
        missing.push(`"session" on ${seen(coverage.session)} records — conversation growth, per-conversation cost, cache-TTL fit (grouped by, never shown)`);
      }
      if (coverage.ts < coverage.parsed) {
        missing.push(`"ts" on ${seen(coverage.ts)} records — the period, the per-day and per-hour shape, and the cache-TTL question`);
      }
      if (coverage.stopReason < coverage.parsed) {
        missing.push(`"stop_reason"/"finish_reason" on ${seen(coverage.stopReason)} records — answers cut off at max_tokens`);
      }
      if (coverage.cacheWrites > 0 && coverage.cacheTtl < coverage.cacheWrites) {
        missing.push(`the "cache_creation" object on ${coverage.cacheTtl}/${coverage.cacheWrites} of the records that wrote to the cache — otherwise the cheaper rate is assumed and those totals are a floor`);
      }
      if (missing.length > 0) {
        lines.push('', '--- what this log cannot answer yet ---');
        for (const line of missing) lines.push(line);
      }
    }

    if (report.unpricedModels.length > 0 || report.skippedLines.length > 0) {
      lines.push('', '--- gaps ---');
      gaps();
    }

    return lines.join('\n');
  },
};

/** The whole surface. An exact list, asserted as one by the tests. */
/**
 * `spend_guard` — the tool that makes the arc pay off.
 *
 * The other tools tell an agent what something costs. This one tells it
 * whether it is allowed to spend, which is the only answer that changes what
 * a model does next.
 *
 * **A refusal arrives with the lever.** An agent told "denied" and nothing
 * else has two moves: send it anyway, or fail the user's request. Both are
 * worse than the call it wanted to make. So every no carries the cheaper ways
 * to make the same call — each priced for *this* call rather than for a month,
 * each naming what it assumes, and each already filtered to models the prompt
 * actually fits in.
 *
 * **It never spends to answer.** No provider call, no model call, no pull.
 * The figures come from what the caller passes and the catalogue this server
 * already holds — a cost guard that costs money to consult is a joke with a
 * bill attached.
 */
const SPEND_GUARD: ToolDefinition = {
  name: 'spend_guard',
  title: 'May I spend this? — with the cheaper way if not',
  description:
    'Answers whether a call you are about to make fits the budget: yes, no, or cannot-tell. '
    + 'A refusal carries the cheaper ways to make the same call — a smaller model the prompt '
    + 'still fits in, a batch window — each priced for this call and each naming what it '
    + 'assumes. The budget consumed is measured from real billed usage you pass in; the cost '
    + 'of your call is an estimate of something that has not happened, and the answer keeps '
    + 'the two apart and says which the verdict rests on. Nothing is called and nothing is '
    + 'spent to produce this answer.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        minLength: 1,
        description: 'Model id the call would go to. Call list_models for what is known.',
      },
      inputTokens: {
        type: 'integer',
        minimum: 0,
        description: 'Input tokens the call would send, including anything cached.',
      },
      outputTokens: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Output tokens you expect back. Left at zero, the answer prices input only and says so by carrying the figure you gave.',
      },
      consumedUsd: {
        type: 'number',
        minimum: 0,
        description:
          'Measured spend so far, in dollars — from a bill, never a guess. Omit it and the '
          + 'answer is cannot-tell rather than a yes nobody measured.',
      },
      limitUsd: {
        type: 'number',
        minimum: 0,
        description:
          'The budget this is judged against. Omit it and the answer is cannot-tell: this '
          + 'tool reports a position against a policy a human set, and never invents one.',
      },
      batchEligible: {
        type: 'boolean',
        default: false,
        description:
          'Whether this work can wait for a batch window. Only you know that, so batch '
          + 'alternatives are offered only when you say so.',
      },
      limits: {
        type: 'object',
        description:
          'The limits policy from trazum.config.json — {"dayUsd": n, "sessionUsd": n, '
          + '"byLabel": {"name": n}}, positive dollars. Judged by the same function the '
          + 'gateway and trazum serve use, so the three doors cannot disagree. Validated '
          + 'like the config file: an unknown key or a non-positive ceiling is refused '
          + 'with the reason.',
      },
      position: {
        type: 'object',
        properties: {
          dayUsd: { type: 'number', minimum: 0 },
          sessionUsd: { type: 'number', minimum: 0 },
          labelUsd: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
        description:
          'Measured spend per scope, from your own usage log — never a guess. A scope you '
          + 'omit is unmeasured and its ceiling answers cannot-tell, not "under".',
      },
      label: {
        type: 'string',
        minLength: 1,
        description: 'The workload this call belongs to, for the per-label ceiling.',
      },
      session: {
        type: 'string',
        minLength: 1,
        description:
          'The conversation this call belongs to, for the per-session ceiling. Used to '
          + 'judge and never echoed back.',
      },
      waive: {
        type: 'array',
        description:
          'The waive list from trazum.config.json — [{"gate": "limits.sessionUsd", '
          + '"reason": "...", "until": "YYYY-MM-DD"}]. A waived ceiling still reports its '
          + 'measurement, but a crossed one answers yes with the waiver attached: the '
          + 'silence rides in the record. Validated like the config file.',
      },
    },
    required: ['model', 'inputTokens'],
    additionalProperties: false,
  },
  run: (args) => {
    const model = args.model;
    if (typeof model !== 'string' || model.length === 0) {
      throw new InvalidArguments('model must be a non-empty string');
    }
    const inputTokens = args.inputTokens;
    if (typeof inputTokens !== 'number' || !Number.isFinite(inputTokens) || inputTokens < 0) {
      throw new InvalidArguments('inputTokens must be a non-negative number');
    }
    /*
      Held to the same rule as inputTokens, because it was not and that was a
      hole: `outputTokens: -500` priced the call below zero and turned the
      verdict into a **yes** — a negative estimate lowers the projected spend,
      so an agent that lies about its output tokens buys itself an approval.
      The core refuses this too now; refusing it here as well keeps the error
      an InvalidArguments the protocol knows how to carry.
    */
    const outputTokens = typeof args.outputTokens === 'number' ? args.outputTokens : 0;
    if (!Number.isFinite(outputTokens) || outputTokens < 0) {
      throw new InvalidArguments('outputTokens must be a non-negative number');
    }
    /*
      The limits policy is validated by the config file's own parser — the
      same shape, the same refusals — so a policy pasted here and a policy
      committed to the repository cannot mean different things. A ConfigError
      becomes the protocol's InvalidArguments, message intact.
    */
    let limits;
    let waive;
    try {
      if (args.limits !== undefined) limits = parseLimits(args.limits, 'spend_guard');
      if (args.waive !== undefined) waive = parseWaive(args.waive, 'spend_guard');
    } catch (error) {
      throw new InvalidArguments(error instanceof Error ? error.message : 'limits is not a valid policy');
    }
    const rawPosition =
      typeof args.position === 'object' && args.position !== null && !Array.isArray(args.position)
        ? (args.position as Record<string, unknown>)
        : {};
    const scopeUsd = (value: unknown, name: string): number | null => {
      if (value === undefined) return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new InvalidArguments(`position.${name} must be a non-negative number`);
      }
      return value;
    };
    const answer = guardSpend(
      {
        model,
        inputTokens,
        outputTokens,
        consumedUsd: typeof args.consumedUsd === 'number' ? args.consumedUsd : undefined,
        limitUsd: typeof args.limitUsd === 'number' ? args.limitUsd : undefined,
        batchEligible: args.batchEligible === true,
        ...(limits === undefined ? {} : { limits }),
        position: {
          dayUsd: scopeUsd(rawPosition.dayUsd, 'dayUsd'),
          sessionUsd: scopeUsd(rawPosition.sessionUsd, 'sessionUsd'),
          labelUsd: scopeUsd(rawPosition.labelUsd, 'labelUsd'),
        },
        ...(typeof args.label === 'string' && args.label !== '' ? { label: args.label } : {}),
        ...(typeof args.session === 'string' && args.session !== '' ? { session: args.session } : {}),
        ...(waive === undefined ? {} : { waive }),
      },
      { catalogue: BUNDLED_CATALOGUE },
    );
    return JSON.stringify(answer, null, 2);
  },
};


/** Per answer. An interview is short fields, not a pasted corpus. */
export const MAX_ANSWER_CHARS = 20_000;

/**
 * The interview, for something that is not a person.
 *
 * An agent asked to "write a prompt for X" has the same problem a person has:
 * it does not know what it has not been told. This hands it the questions
 * instead of the answers — call it with what you know, get back the next
 * question and whatever can be assembled so far, call it again.
 *
 * **Stateless, like the HTTP route.** The caller holds the answers and sends
 * all of them every time. A server that remembered would be a server that
 * knows what somebody is halfway through writing.
 */
const WRITER: ToolDefinition = {
  name: 'prompt_writer',
  title: 'Interviews you, then writes the prompt',
  description:
    'Asks what a good prompt needs and assembles one from your answers. Call it with the '
    + 'answers you have; it returns the next question worth asking, what is still missing, '
    + 'and the prompt once the required answers are in. Nothing is generated — the questions '
    + 'are fixed and the words in the prompt are yours, so the same answers always produce '
    + 'the same text. An answer of null is a decline, which is an answer: it is recorded and '
    + 'the follow-up it would have opened is not asked. The draft carries what it costs '
    + '(estimated, and it says so), whether it fits a budget you state, and what '
    + 'trazum optimize can still recover from it — which should be nothing. It does not '
    + 'claim the prompt is good: that is a judgement about text nobody has run.',
  inputSchema: {
    type: 'object',
    properties: {
      answers: {
        type: 'object',
        description:
          'What you know so far, keyed by question id. Start with {} to be asked the first '
          + 'one. A value of null declines that question. Unknown ids are refused rather '
          + 'than ignored.',
        additionalProperties: { type: ['string', 'null'], maxLength: MAX_ANSWER_CHARS },
      },
      callsPerMonth: {
        type: 'integer',
        minimum: 1,
        description: 'Calls per month, for the cost estimate. Nothing is priced without it.',
      },
      avgOutputTokens: {
        type: 'integer',
        minimum: 0,
        description: 'Output tokens you expect back per call, for the same estimate.',
      },
    },
    required: ['answers'],
    additionalProperties: false,
  },
  run: (args) => {
    const sent = args.answers;
    if (sent === null || typeof sent !== 'object' || Array.isArray(sent)) {
      throw new InvalidArguments('answers must be an object of question ids and answers');
    }

    /*
      Refused first, then built by iterating the catalogue.

      The property written is always a `SLOTS` id and never a key the caller
      chose, and the map has no prototype — the same shape CodeQL called a
      remote property injection on the HTTP route, fixed here before it could
      be written twice.
    */
    const given = sent as Record<string, unknown>;
    for (const id of Object.keys(given)) {
      if (slot(id) === undefined) {
        const nearest = nearestName(id, [...SLOT_IDS]);
        throw new InvalidArguments(
          nearest === null
            ? `"${id}" is not one of the questions this interview asks`
            : `"${id}" is not a question this interview asks. Did you mean "${nearest}"?`,
        );
      }
    }

    const answers: Record<string, string | null> = Object.create(null) as Record<string, string | null>;
    for (const entry of SLOTS) {
      if (!Object.prototype.hasOwnProperty.call(given, entry.id)) continue;
      const value = given[entry.id];
      if (value === null) {
        answers[entry.id] = null;
        continue;
      }
      if (typeof value !== 'string') {
        throw new InvalidArguments(`the answer to "${entry.id}" must be text, or null to decline it`);
      }
      if (value.length > MAX_ANSWER_CHARS) {
        throw new InvalidArguments(`the answer to "${entry.id}" is over ${MAX_ANSWER_CHARS} characters`);
      }
      answers[entry.id] = value;
    }

    /*
      The schema says `minimum: 1` and the runtime did not enforce it, so
      `callsPerMonth: -100` priced a prompt at −$1.26 a month. A schema the
      runtime does not enforce is documentation wearing a guard's clothes.
      The core now refuses negatives as well; refusing here keeps the message
      an InvalidArguments rather than a silent discard.
    */
    for (const name of ['callsPerMonth', 'avgOutputTokens'] as const) {
      const value = args[name];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
        throw new InvalidArguments(`${name} must be a positive number`);
      }
    }
    const draft = assemble(answers, {
      callsPerMonth: typeof args.callsPerMonth === 'number' ? args.callsPerMonth : undefined,
      avgOutputTokens: typeof args.avgOutputTokens === 'number' ? args.avgOutputTokens : undefined,
    });
    const state = interview(answers);

    /**
     * `nextQuestion` is the wording, not just the id.
     *
     * An agent that had to look the wording up somewhere would either invent it
     * or skip it, and a question nobody asks is a slot nobody fills. `next` is
     * also **not** derivable from `missing`: that holds only the required
     * questions, and the interview carries on through the optional ones.
     */
    const next = state.next === null ? null : {
      id: state.next,
      question: SLOT_QUESTIONS[state.next] ?? state.next,
      required: slot(state.next)?.required === true,
    };

    return JSON.stringify({ draft, next, done: state.done, open: state.open }, null, 2);
  },
};

/**
 * The month's measured position, for the agent that asks "how much room is
 * left" before it spends — chapter two of the 1.67 arc: the same
 * `positionReport` the CLI and the HTML door answer with, so no surface can
 * disagree about where the month stands. Stateless like every tool here:
 * the log and the ceilings arrive as arguments, nothing is read from disk,
 * and nothing is spent to answer.
 */
const POSITION: ToolDefinition = {
  name: 'position',
  title: 'Where the month stands, measured — no forecast',
  description:
    'States the month\'s measured position against every ceiling you pass: monthly budget, '
    + 'per-day limit, per-label limits. Measured from the log text alone, priced record by '
    + 'record, with the denominator on every figure — days measured against days elapsed. '
    + 'The distance line is division on the past, labelled as such, and absent under the '
    + 'seven-day floor, on an over, and on a zero rate: this tool never forecasts. Ceilings '
    + 'the log cannot measure are named with the reason instead of skipped. Pass the log '
    + 'text itself: this server never reads files, and session keys are never shown.',
  inputSchema: {
    type: 'object',
    properties: {
      log: {
        type: 'string',
        minLength: 1,
        maxLength: MAX_LOG_CHARS,
        description: 'The usage log text, one JSON object per line. Never a file path.',
      },
      monthlyUsd: {
        type: 'number',
        exclusiveMinimum: 0,
        description: 'The calendar-month budget, in dollars — spend.monthlyUsd from the config.',
      },
      limits: {
        type: 'object',
        description:
          'The limits policy from trazum.config.json — {"dayUsd": n, "sessionUsd": n, '
          + '"byLabel": {"name": n}}. Validated like the config file itself.',
      },
    },
    required: ['log'],
    additionalProperties: false,
  },
  run: (args) => {
    const log = args.log;
    if (typeof log !== 'string' || log.length === 0) {
      throw new InvalidArguments('log must be the usage log text, one JSON object per line');
    }
    let limits;
    try {
      if (args.limits !== undefined) limits = parseLimits(args.limits, 'position');
    } catch (error) {
      throw new InvalidArguments(error instanceof Error ? error.message : 'limits is not a valid policy');
    }
    const monthlyUsd = args.monthlyUsd;
    if (monthlyUsd !== undefined && (typeof monthlyUsd !== 'number' || !Number.isFinite(monthlyUsd) || monthlyUsd <= 0)) {
      throw new InvalidArguments('monthlyUsd must be a positive number of dollars');
    }
    const records = log
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => parseUsageLine(line))
      .filter((record): record is NonNullable<ReturnType<typeof parseUsageLine>> => record !== null);
    const document = positionReport(
      records,
      {
        ...(monthlyUsd === undefined ? {} : { spend: { monthlyUsd } }),
        ...(limits === undefined ? {} : { limits }),
      },
      { catalogue: BUNDLED_CATALOGUE },
    );
    return JSON.stringify(document, null, 2);
  },
};

export const TOOLS: readonly ToolDefinition[] = [OPTIMIZE, CHECK, MODELS, PROFILE, POSITION, SPEND_GUARD, WRITER];
