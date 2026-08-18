import {
  BUNDLED_CATALOGUE,
  PRICING_LAST_REVIEWED,
  UNLABELLED,
  billLevers,
  cacheEconomics,
  cacheHitRate,
  driversBetween,
  formatUsd,
  reviewAgeDays,
  listModels,
  optimize,
  profileUsage,
} from '@trazum/core';
import type { RuleLevel } from '@trazum/core';

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
 * The same cap the web API uses, for the same reason.
 *
 * An agent in a loop is exactly the caller that hands you a 40 MB string by
 * accident. Refusing early with a number beats an unbounded pass over it.
 */
export const MAX_PROMPT_CHARS = 400_000;

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

    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE, label: onlyLabel, sinceMs, untilMs });
    /**
     * The drill-downs' one rule, same as the CLI: a filter matching nothing is
     * an error naming what exists, never a silent report over zero calls that
     * an agent would read as "this workload is free" or "this period is free".
     */
    if ((onlyLabel !== undefined || windowed) && report.total.calls === 0 && report.unpriced.calls === 0) {
      const unfiltered = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
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
            + `catalogue does not know: ${report.unpricedModels.join(', ')}. The CLI can price `
            + 'them with a pricing overlay (trazum profile --pricing).',
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
        + ` counts from the log, not estimates; prices reviewed ${PRICING_LAST_REVIEWED}.`,
    );
    /**
     * Said only when old enough to matter, and loud then: a stale table
     * qualifies every dollar above, and unlike a skipped line it does not
     * name its own size — the error is exactly whatever the provider changed.
     */
    const pricingAge = reviewAgeDays(PRICING_LAST_REVIEWED, new Date());
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
    const levers = billLevers(report, { catalogue: BUNDLED_CATALOGUE });
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
        catalogue: BUNDLED_CATALOGUE,
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
export const TOOLS: readonly ToolDefinition[] = [OPTIMIZE, CHECK, MODELS, PROFILE];
