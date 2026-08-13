import {
  BUNDLED_CATALOGUE,
  PRICING_LAST_REVIEWED,
  formatUsd,
  listModels,
  optimize,
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
  'token counts are estimates (±25% on prose, calibrated on Claude); prices reviewed '
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
      'token counts are estimates (±25% on prose, calibrated on Claude), so a prompt within'
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

/** The whole surface. An exact list, asserted as one by the tests. */
export const TOOLS: readonly ToolDefinition[] = [OPTIMIZE, CHECK, MODELS];
