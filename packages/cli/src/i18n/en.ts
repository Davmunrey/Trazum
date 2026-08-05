import type { CliMessages } from './types.js';

/**
 * English catalogue — the source of truth.
 *
 * When a message changes here, the other catalogues need the same change.
 * `test/i18n.test.js` in the core enforces the equivalent guarantee for the
 * library's catalogues.
 */
export const en: CliMessages = {
  locale: 'en',
  numberLocale: 'en-US',

  help: (d, bold) => `${bold('trazum')} — cut the cost of your prompts without losing what they ask for.

${bold('USAGE')}
  trazum optimize <file|-> [options]
  trazum check <file|-> --max-tokens <n> [options]
  trazum models
  trazum rules

${bold('OPTIONS FOR optimize')}
  --level <safe|aggressive>   How hard the rules push. Default: safe.
  --model <id>                Model used to price the prompt. Default: ${d.model}.
  --calls <n>                 Calls per month. Default: ${d.callsPerMonth}.
  --output-tokens <n>         Average output tokens. Default: ${d.avgOutputTokens}.
  --cache-hit-rate <0-1>      Estimated cache hit rate. Default: ${d.cacheHitRate}.
  --batch                     The work tolerates latency (Batch API, 50% off).
  --disable <id,id>           Turn off specific rules (see "trazum rules").
  --llm                       Add a pass through the LLM configured by environment.
  --exact-tokens              Count tokens with the official API instead of the heuristic.
  --diff                      Show the line-by-line diff.
  --json                      Dump the full report as JSON.
  --locale <${d.locales.join('|')}>            Language of the report. Default: the system language.
  -o, --out <file>            Write the optimised prompt to a file.
  -h, --help                  This help.

${bold('OPTIONS FOR check')}
  --max-tokens <n>            Input token budget. Required.
  --level <safe|aggressive>   Level used to work out whether the optimised prompt would fit.
  --exact-tokens              Exact count (needs ANTHROPIC_API_KEY).
  --json                      Result as JSON.

  Built for CI: exits with code 1 when the prompt busts the budget, so a
  template that grows unchecked breaks the build instead of the bill.

${bold('OPTIONAL LLM')}
  The core is deterministic and free. --llm adds a semantic compression pass
  using whichever provider you configure by environment:

    TRAZUM_LLM_PROVIDER   openai | anthropic          (default: openai)
    TRAZUM_LLM_BASE_URL   https://your-llm/v1
    TRAZUM_LLM_API_KEY    your key
    TRAZUM_LLM_MODEL      model identifier

  The LLM's answer is only accepted when it is shorter and leaves code, URLs
  and template placeholders untouched.

${bold('LANGUAGE')}
  The report language follows --locale, then TRAZUM_LOCALE, then LANG. It
  changes the report only: the same prompt always optimises the same way.

${bold('EXAMPLES')}
  trazum optimize prompt.txt --calls 50000 --diff
  cat prompt.md | trazum optimize - --level aggressive --json
  trazum optimize prompt.txt --llm -o prompt.optimised.txt
`,

  errors: {
    optionNeedsValue: (name) => `Option --${name} needs a value.`,
    mustBeNonNegative: (name, raw) =>
      `--${name} must be a non-negative number (received: "${raw}").`,
    badLevel: (received) => `--level must be "safe" or "aggressive" (received: "${received}").`,
    unknownRuleInDisable: (id) => `Unknown rule in --disable: "${id}". Full list: trazum rules`,
    unknownCommand: (command) => `Unknown command: "${command}". Try "trazum --help".`,
    missingInputFile: () => 'Missing input file. Use "-" to read from standard input.',
    llmNotConfigured: () =>
      'You asked for --llm but no provider is configured.\n' +
      'Set TRAZUM_LLM_BASE_URL and TRAZUM_LLM_MODEL (OpenAI-compatible endpoint),\n' +
      'or TRAZUM_LLM_PROVIDER=anthropic with TRAZUM_LLM_API_KEY.',
    exactTokensNeedsKey: () => '--exact-tokens needs ANTHROPIC_API_KEY in the environment.',
    checkNeedsMaxTokens: () => 'trazum check needs --max-tokens <n>.',
    errorLabel: () => 'Error',
  },

  report: {
    inputTokens: () => 'Input tokens',
    estimated: () => ' (estimated, ±15%)',
    exactCount: () => ' (exact count)',
    rulesApplied: () => 'Rules applied',
    nothingToTrim: () => '  No rule found anything to trim.',
    levelAggressive: () => '[aggressive]',
    levelSafe: () => '[safe]',
    ruleHits: (hits, tokensSaved) => `(${hits}×, ~${tokensSaved} tokens)`,
    llmPass: () => 'LLM pass',
    llmApplied: (provider, model, before, after) =>
      `applied via ${provider}/${model}: ${before} → ${after} tokens`,
    llmRejected: (reason) => `rejected: ${reason}`,
    costWith: (modelName) => `Cost with ${modelName}`,
    usageLine: (calls, outputTokens, batch) =>
      `${calls} calls/month · ${outputTokens} output tokens per call${batch ? ' · Batch API' : ''}`,
    perMonthSaving: (saving, pct) => `saving ${saving}/month (${pct}%)`,
    beyondShortening: () => 'Beyond shortening the prompt',
    perMonthSuffix: (amount) => ` ~${amount}/month`,
    diff: () => 'Diff',
    wroteTo: (path) => `Optimised prompt written to ${path}`,
  },

  models: {
    title: () => 'Models and pricing',
    unit: () => '  (USD per million tokens)',
    reviewedOn: (date) => `  Table reviewed on ${date}. Verify before budgeting.`,
    columns: {
      model: 'model',
      input: 'input',
      output: 'output',
      context: 'context',
      cacheMin: 'cache min.',
    },
    promoNote: () => '  Prices in brackets are the price once the promotion ends.',
    cacheNote: () =>
      '  Cache: reading costs 10% of input; writing, 125% (5 min) or 200% (1 h).',
    batchNote: () => '  Batch API: 50% off input and output.',
  },

  rules: {
    title: () => 'Available rules',
    disableHint: () => '  Turn off the ones you do not want with --disable id1,id2',
  },

  check: {
    okLabel: () => 'OK',
    failedLabel: () => 'FAILED',
    ok: (tokens, budget) => `${tokens} tokens, within the budget of ${budget}.`,
    failed: (tokens, budget) => `${tokens} tokens busts the budget of ${budget}.`,
    wouldFit: (level, optimizedTokens) =>
      `  Optimised with "trazum optimize --level ${level}" it would land at ~${optimizedTokens} tokens and fit.`,
    stillTooBig: (optimizedTokens) =>
      `  Even optimised it does not fit (~${optimizedTokens} tokens): content has to be cut by hand.`,
  },
};
