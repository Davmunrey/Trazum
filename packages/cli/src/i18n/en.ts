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
  trazum check <file|dir|-> --max-tokens <n> [options]
  trazum eval <file> --cases <file> [options]
  trazum diff <before> <after> [options]
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
  --max-tokens <n>            Input token budget. Required unless a config budget covers the file.
  --level <safe|aggressive>   Level used to work out whether the optimised prompt would fit.
  --exact-tokens              Exact count (needs ANTHROPIC_API_KEY).
  --json                      Result as JSON.

  Built for CI: exits with code 1 when the prompt busts the budget, so a
  template that grows unchecked breaks the build instead of the bill.

  Given a directory it checks every prompt inside it against the "budgets"
  patterns in ${bold('trazum.config.json')} — one CI step for a whole repository of
  prompts. A file no pattern covers is listed as unbudgeted rather than
  skipped quietly, and a run where nothing at all was budgeted is an error:
  "0 failures" from a check that measured nothing is the most misleading
  thing this tool could tell you.

${bold('OPTIONS FOR eval')}
  --cases <file>              Inputs to test, one per line or a JSON array. Required.
  --level <safe|aggressive>   Level to optimise with before comparing.
  --concurrency <n>           Cases in flight at once. Default: 3.
  --json                      Result as JSON.

  Runs both prompt versions over your cases and reports whether the
  optimisation changed the answers. Costs THREE provider calls per case: the
  original twice, to measure the model's own run-to-run variance, and the
  optimised once. That baseline is the yardstick — without it, a divergence
  figure means nothing. Exits with code 1 when the answers genuinely diverge.

${bold('OPTIONS FOR diff')}
  --max-growth <n>            Fail if the prompt grew by more than n tokens.
  --optimized                 Measure what the rules would leave, not what is written.
  --level <safe|aggressive>   Level used for the rule and advisory findings.
  --model <id>                Model used to price the change.
  --calls <n>                 Calls per month, for the cost figure.
  --json                      Result as JSON.

  Compares two versions of a prompt: how the token count moved, what that
  costs, which advisories the edit introduced or resolved. Every figure is a
  delta and positive means worse. It reports and exits 0 unless --max-growth
  is given: deciding that growth is unacceptable is your call, not ours.

${bold('CONFIG FILE')}
  ${bold('trazum.config.json')}, found by walking up from the working directory and
  stopping at the repository root. Every key is optional:

    level, locale, disable, maxGrowth, extensions
    usage     { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible }
    budgets   { "prompts/**": 2000, "prompts/system.txt": 4000 }

  Flags beat the config; the config beats the defaults. Budgets resolve to the
  most specific matching pattern — most literal characters wins. A boolean the
  config switched on comes back off with --no-<flag>, e.g. --no-batch.

  A config that will not validate is an error, including an unknown key. A
  lenient parser would silently restore defaults, and for a budget the default
  is "no budget" — a green build for a prompt nobody measured.

  --config <file>             Use this config instead of searching for one.

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
  The report language follows --locale, then TRAZUM_LOCALE, then LANG, and last
  the config file — so a project can set the language its CI logs read in
  without overriding the language of whoever is at the keyboard. It changes the
  report only: the same prompt always optimises the same way.

${bold('EXAMPLES')}
  trazum optimize prompt.txt --calls 50000 --diff
  cat prompt.md | trazum optimize - --level aggressive --json
  trazum optimize prompt.txt --llm -o prompt.optimised.txt
  trazum eval prompt.txt --cases cases.txt --level aggressive
  trazum diff prompts/system.txt prompts/system.new.txt --max-growth 10
  trazum check prompts/
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
    evalNeedsCases: () => 'trazum eval needs --cases <file>.',
    evalNoCases: (path) => `No cases found in "${path}".`,
    unknownFlag: (name, allowed) =>
      `Unknown option --${name}. This command accepts: ${allowed}.`,
    unknownFlagDidYouMean: (name, suggestion) =>
      `Unknown option --${name}. Did you mean --${suggestion}?`,
    diffNeedsTwoFiles: () => 'trazum diff needs two files: trazum diff <before> <after>.',
    cannotNegate: (name) => `--no-${name} makes no sense: --${name} takes a value.`,
    noPromptsFound: (directory, extensions) =>
      `No prompt files under "${directory}". Looked for: ${extensions}.`,
    noBudgetsApply: (directory, configFile) =>
      `No budget covers anything under "${directory}". Add one to ${configFile} under "budgets", or pass --max-tokens. ` +
      'Reporting "0 failures" for files nobody measured would be worse than this error.',
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
    moreChanges: (count) => `+${count} more not shown`,
    llmPass: () => 'LLM pass',
    examplesReview: () => 'Examples the model considers redundant',
    examplesReviewNote: (provider, model, count) =>
      `${count} examples reviewed by ${provider}/${model}. A suggestion to read, not a change made.`,
    exampleRedundant: (redundant, keep) =>
      `Example ${redundant.map((i) => i + 1).join(', ')} repeats example ${keep + 1}`,
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
    diffTooLarge: (lines, max) =>
      `  Diff skipped: ${lines} lines is past the ${max}-line limit, and aligning them would cost more memory than the answer is worth.`,
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


  eval: {
    nothingToCompare: () =>
      'The rules changed nothing in this prompt, so there is nothing to compare. Try --level aggressive.',
    starting: (cases, calls, model) =>
      `Running ${cases} cases through ${model}: ${calls} calls (the original twice per case, to measure its own variance, and the optimised once).`,
    heading: () => 'Agreement',
    selfAgreement: (pct) => `${pct}  the original prompt with itself  ${'\u2190'} the yardstick`,
    crossAgreement: (pct) => `${pct}  the optimised prompt with the original`,
    verdict: (kind) =>
      ({
        indistinguishable: {
          label: 'Indistinguishable',
          detail: 'Every answer matched. On this set the optimisation changed nothing.',
        },
        'within-noise': {
          label: 'Within the model own noise',
          detail:
            'The optimised prompt disagrees with the original about as often as the original disagrees with itself, so the difference is not attributable to the rewrite. Widen the set before trusting this.',
        },
        diverges: {
          label: 'Diverges',
          detail:
            'The model is consistent with itself and markedly less so with the rewrite, so the optimisation changed what the prompt asks for. Read the cases below and the diff before shipping this.',
        },
        inconclusive: {
          label: 'Inconclusive',
          detail:
            'The original prompt does not agree with itself often enough to judge anything against. Lower the temperature, or the task may simply be too open-ended for this test.',
        },
      })[kind],
    mostChanged: () => 'Cases that changed most',
    caseAgreement: (cross, self) => `${cross} agreement with the original (which self-agreed ${self})`,
    callsMade: (count) => `${count} provider calls made.`,
  },


  diff: {
    heading: (before, after) => `${before} → ${after}`,
    measuringOptimised: () =>
      'Measuring what the rules would leave, not what is written.',
    monthly: (delta, calls, model) =>
      `${delta}/month at ${calls} calls with ${model}`,
    advisoriesAppeared: () => 'New problems',
    advisoriesResolved: () => 'Resolved',
    rulesNewlyFiring: () => 'Rules that now find something:',
    rulesNoLongerFiring: () => 'Rules that no longer find anything:',
    overLimit: (delta, max) =>
      `Grew by ${delta} tokens, past the limit of ${max}.`,
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
    directoryHeading: (directory, files) =>
      `${directory} — ${files} ${files === 1 ? 'prompt' : 'prompts'}`,
    directorySummary: (failures, files) =>
      failures === 0
        ? `All ${files} within budget.`
        : `${failures} of ${files} over budget.`,
    noBudget: () => '(no budget)',
    walkTruncated: () =>
      'Stopped early: the directory is larger than the walk limit, so this is not the whole picture.',
  },
};
