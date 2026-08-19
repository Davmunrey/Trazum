import type { CliMessages } from './types.js';

/** Counts, grouped. A log with forty thousand torn lines should say so legibly. */
const count = (value: number): string => value.toLocaleString('en-US');

/**
 * A grouped count and its noun, agreeing.
 *
 * `1 calls` and `1 prompts` were reachable on ordinary input — a one-call log, a
 * repository with a single prompt — and two messages in this file already did the
 * agreement by hand while a dozen did not. A helper rather than a dozen ternaries,
 * so the next message written gets it for free.
 */
const plural = (value: number, one: string, many = `${one}s`): string =>
  `${count(value)} ${value === 1 ? one : many}`;

/** "(46 days ago)", or nothing when the age is unknown. */
const ago = (days: number | null): string =>
  days === null ? '' : days === 0 ? ' (today)' : days === 1 ? ' (1 day ago)' : ` (${days} days ago)`;


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
  trazum baseline [dir] [options]
  trazum eval <file> --cases <file> [options]
  trazum eval <file> --cases <file> --export promptfoo -o suite.json
  trazum route <log.jsonl> --prompt-file <file> --cases <file> --yes
  trazum diff <before> <after> [options]
  trazum diff --all <dir> <dir> [options]
  trazum rank <dir> [options]
  trazum doctor [dir] [options]
  trazum blame <file> [options]
  trazum prune <file> --cases <file> --yes
  trazum where [file]
  trazum models
  trazum rules

${bold('OPTIONS FOR prune')}
  --cases <file>              One input per line, or a JSON array. Required.
  --yes                       Actually spend the calls. Without it the estimate is
                              printed and nothing is called.
  --concurrency <n>           Calls in flight at once. Default: 3.
  --json                      The measurement as data.

  Removes each few-shot example in turn and measures whether the answers move
  further than the prompt already moves on its own. The bill is
  (2 + examples) x cases, which is why this is the one command that asks first.

  It reports "no effect on these inputs" and never "delete this": an example may
  exist for a case your inputs do not contain. Nothing is edited.

${bold('OPTIONS FOR eval')}
  --cases <file>              One input per line, or a JSON array. Required.
  --level <safe|aggressive>   Which rewrite to judge. Default: safe.
  --concurrency <n>           Calls in flight at once. Default: 3.
  --export promptfoo          Write a promptfoo suite instead of running anything:
                              both prompts, every case, no API key needed and no
                              call made. The assertions are yours — this exists
                              for the question agreement cannot answer.
  -o, --out <file>            Where to write it. Defaults to stdout.

${bold('OPTIONS FOR rank')}
  --level <safe|aggressive>   Which rules to count as recoverable. Default: safe.
  --model, --calls,           Price the recoverable tokens, as in optimize.
  --output-tokens, --batch
  --prompt <name>             Which marked prompt to take from each source file.
  --by-source                 The fleet: one summary per service from the
                              config's "sources" block (name → glob patterns
                              over log paths), plus a rollup naming the source
                              where the money is. Shares compare totals, and
                              when the sources' logs cover different periods
                              the report says so rather than letting a 3-day
                              log look cheap beside a 30-day one. Budgets per
                              service live in spend.bySource and fail the run
                              naming the service. Files matching no pattern
                              are named, never silently dropped.
  --markdown-out <file>       Also write the ranking as Markdown, for a CI job
                              summary or a pull request comment.
  --json                      The ranking as data.

  There is no score. Prompts are ordered by what the rules would actually
  recover, measured by running them; the other columns explain that position.

${bold('OPTIONS FOR doctor')}
  --level <safe|aggressive>   Which rules to count. Default: safe.
  --model, --calls,           Price the findings, as in optimize.
  --output-tokens, --batch
  --prompt <name>             Which marked prompt to take from each source file.
  --otlp-out <file>           Write the survey as OpenTelemetry metrics (OTLP/HTTP
                              JSON). Trazum writes the file; your pipeline sends it.
  --json                      The survey as data.

  Surveys a whole workspace: which prompts nothing is watching, which are already
  over budget, and what the advisories add up to across all of them. Every finding
  is one trazum optimize raises on that prompt on its own, so any line can be
  checked against a single file. There is no score.

  It exits 0 even when it finds things. trazum check is the gate.

${bold('OPTIONS FOR blame')}
  --limit <n>                 Revisions to walk. Default: 20, maximum 500.
  --prompt <name>             Track one marked prompt inside a source file, so a
                              refactor of the imports is not read as growth.
  --model, --calls,           Price the movement, exactly as in optimize.
  --output-tokens, --batch
  --markdown-out <file>       Also write the history as Markdown, for a CI job
                              summary or a pull request comment.
  --json                      The history as data.

  Paths are taken literally after "--": trazum blame -- --odd-name.txt

${bold('OPTIONS FOR optimize')}
  --level <safe|aggressive>   How hard the rules push. Default: safe.
  --model <id>                Model used to price the prompt. Default: ${d.model}.
  --calls <n>                 Calls per month. Default: ${d.callsPerMonth}.
  --output-tokens <n>         Average output tokens. Default: ${d.avgOutputTokens}.
  --cache-hit-rate <0-1>      Estimated cache hit rate. Default: ${d.cacheHitRate}.
  --all-labels                With --from-log: every prompt in the config's
                              "labels" map, optimised and priced against its
                              own measured traffic, ranked by what the change
                              is worth — plus the mismatches in both
                              directions (mapped prompts with no traffic,
                              traffic with no mapped prompt).
  --from-log <usage.jsonl>    Measure the three figures above from a usage log
                              instead of typing them: real call count, real
                              output size, real cache share, and the model the
                              calls actually went to. Refuses the typed flags
                              beside it, scales to a month only past a full
                              week of data, and says which figures are
                              measured. Pair with --label, or map the prompt
                              under "labels" in trazum.config.json.
  --batch                     The work tolerates latency (Batch API, 50% off).
  --disable <id,id>           Turn off specific rules (see "trazum rules").
  --suggest                   Ask the LLM for phrase-level rewrites and list them
                              with what each saves. Changes nothing on its own —
                              every proposal is checked against your prompt first
                              and dropped if it does not survive.
  --apply-suggestions         Take them. Only with --suggest; alone it is an error
                              rather than a flag that runs and does nothing.
  --cache-suggestions         Answer --suggest from a local cache when the same
                              prompt was asked about before, instead of paying for
                              the call again. Off by default: a hit is what the
                              model said last time, and that should be a choice.
                              Kept in $XDG_CACHE_HOME/trazum, 0600, for 7 days.
  --reorder                   Move stable instructions ahead of the first placeholder,
                              so prompt caching can reach them. This MOVES text rather
                              than deleting it: read the diff and decide whether the
                              order mattered. Refuses on any block that refers
                              backwards ("the text above"), and says which phrase.
  --llm                       Add a pass through the LLM configured by environment.
  --exact-tokens              Count tokens with the official API instead of the heuristic.
  --tokens-only               Report the token saving and no money at all. The
                              default inside Claude Code, Codex or Cursor, where
                              a subscription means there is no bill to reduce.
  --cost                      Show the money even there — the host says where
                              Trazum runs, not where your prompt goes.
  --prompt <name>             Which marked prompt to optimise, when a source file
                              holds more than one. See "trazum where".
  --diff                      Show the line-by-line diff.
  --json                      Dump the full report as JSON.
  --locale <${d.locales.join('|')}>            Language of the report. Default: the system language.
  -o, --out <file>            Write the optimised prompt to a file.
  -h, --help                  This help.
  --clear-suggestion-cache    Empty the --cache-suggestions cache and say how much
                              went. An errand rather than a mode: it needs no
                              command and reads no config.

${bold('OPTIONS FOR check')}
  --max-tokens <n>            Input token budget. Required unless a config budget covers the file.
  --level <safe|aggressive>   Level used to work out whether the optimised prompt would fit.
  --exact-tokens              Exact count (needs ANTHROPIC_API_KEY).
  --json                      Result as JSON.
  --markdown-out <file>       Also write the report as Markdown, for a CI job summary
                              or a pull request comment.
  --baseline                  Gate on the recorded cost baseline. On by default whenever
                              the config declares one, so CI needs no argument; the useful
                              spelling is --no-baseline, which skips it for one run.

  Built for CI: exits with code 1 when the prompt busts the budget, so a
  template that grows unchecked breaks the build instead of the bill.

${bold('OPTIONS FOR baseline')}
  Records what the prompts in a directory cost right now, to a file you commit.
  Then "check" fails the build when the repository drifts past it — the question
  budgets cannot answer, because a repository at 95% of every budget passes
  forever while a pull request adds four hundred tokens across a dozen files.

  -o, --out <file>            Where to write it. Default: the config's baseline.path,
                              or trazum.baseline.json.
  --model, --calls, --output-tokens, --cache-hit-rate, --batch
                              The scenario the monthly figure is recorded under. It is
                              recorded so a later comparison can say whether the money is
                              comparable — the gate itself is in tokens, so a repriced
                              model never fails a build on its own.
  --exact-tokens              Exact counts (needs ANTHROPIC_API_KEY).
  --json                      Result as JSON.

  It never fails. Recording is not a verdict, and a command that could fail while
  writing the thing you would fix the failure with is a loop.

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

${bold('OPTIONS FOR profile')}
  --against <log.jsonl>       Compare this bill to a previous log. Positive
                              means the bill grew; drivers are ranked by their
                              contribution to the change. No period is assumed —
                              judge the call counts before judging the money.
  --label <name>              Profile only the calls carrying this label — the
                              drill-down once the full report named a suspect.
                              A label that matches nothing is an error naming
                              the labels that exist. With --against, both logs
                              are filtered, so the comparison stays one workload.
  --max-usd <n>               Exit 1 when this log spent more than n dollars.
                              The budget applies to exactly the log handed in:
                              profile yesterday's log nightly and this is a
                              daily budget without Trazum guessing what a day is.
  --max-growth-usd <n>        With --against: exit 1 when the bill grew more
                              than n dollars over the previous log. Alone it is
                              an error, not a flag that silently gates nothing.
  --max-cache-loss-usd <n>    Exit 1 when caching added more than n dollars to
                              this bill. Reads the worst case when the log did
                              not record the write TTL — a gate reading the
                              flattering half would pass the bills it exists
                              to catch — and says which claim fired.
  --max-day-usd <n>           Fail when any single UTC day inside the log spent
                              more than this. A month under budget can hide the
                              afternoon a loop burned a quarter of it. A log
                              with no timestamps fails: not measured is not
                              under budget.
  --max-session-usd <n>       Fail when any single conversation in the log
                              cost more than this — the unit an agent product
                              blows up in. A log with no sessions fails: not
                              measured is not under budget.
  --since <when>              Profile only calls at or after this moment. A UTC
  --until <when>              day (2026-08-14), a full ISO 8601 timestamp, a
                              relative window (7d, 24h) or "now";
                              --until with a bare date includes that whole day.
                              Calls with no "ts" cannot be placed and are left
                              out — counted out loud, never dropped silently.
                              With --against, both logs get the same window.
  --what-if <model>           Price these exact calls on another model. The
                              same token counts at a different rate card —
                              multiplication, not advice, and it says so.
                              Calls larger than that model's context window
                              are named as impossible, not priced as cheap.
  --markdown-out <file>       Also write the report as Markdown, for a CI job
                              summary or a pull request comment.
  --csv-shape <shape>         Which table --csv-out writes: slice (default),
                              day, hour, or model-day (one row per day and
                              model — charts the mix moving). One row shape
                              per file, so nothing has to be filtered before
                              it can be summed.
  --csv-out <file>            Also write the report as CSV, one row per label
                              and model. No total row, on purpose: a total
                              inside a data file gets summed with the data.
                              Unpriced models keep their tokens and get empty
                              dollar cells, never zeros.
  --pricing <file>            Local price overlay, as everywhere else.
  --json                      The full report as data, including the levers.

  Takes a log file or a directory of them — rotated daily logs are read in
  name order as one bill, and how many were read is stated. Gzipped files
  (.jsonl.gz and the rest) are read too, because that is what a rotated log
  looks like a day later; one that will not decompress is an error naming the
  file, never a bill quietly missing a day.

  Reads what the provider actually charged. Optional fields unlock findings:
  "label" (which workload), "session" (which conversation — grouped by, never
  printed), "stop_reason"/"finish_reason" (answers cut off at max_tokens).

${bold('OPTIONS FOR route')}
  --prompt-file <file>        The prompt those calls send. Not --prompt, which
                              names a marked prompt inside a source file.
  --cases <file>              One input per line, or a JSON array. Required.
  --label <name>              Measure this workload instead of the costliest one.
  --concurrency <n>           Calls in flight at once. Default: 3.
  --yes                       Actually spend the calls. Without it the count is
                              printed and nothing is called.
  --json                      The slice and the measurement as data.

  Reads a usage log, finds the slice where routing to a cheaper model is worth
  the most, and measures whether that model still does the job. The same prompt
  goes to both, and the original runs twice per case — so the verdict is judged
  against that model's own variance rather than a threshold somebody picked.

  Costs three provider calls per case and needs TRAZUM_LLM_* configured.

${bold('OPTIONS FOR diff')}
  --max-growth <n>            Fail if the prompt grew by more than n tokens.
  --all                       Compare two directories of prompts, paired by relative
                              path. Prompts on only one side are named, never
                              counted: a deletion is a question, not a saving.
                              --max-growth then applies per prompt, not to the
                              total, so one prompt doubling cannot hide behind
                              another shrinking.
  --optimized                 Measure what the rules would leave, not what is written.
  --level <safe|aggressive>   Level used for the rule and advisory findings.
  --model <id>                Model used to price the change.
  --calls <n>                 Calls per month, for the cost figure.
  --json                      Result as JSON.
  --markdown-out <file>       Also write the report as Markdown, for a CI job summary
                              or a pull request comment.

  Compares two versions of a prompt: how the token count moved, what that
  costs, which advisories the edit introduced or resolved. Every figure is a
  delta and positive means worse. It reports and exits 0 unless --max-growth
  is given: deciding that growth is unacceptable is your call, not ours.

${bold('trazum where')}
  Says which provider a file's prompts are actually sent to, and how it knows —
  an SDK import, a base URL, a quoted model id, or "model=" on a trazum:prompt
  marker. Every answer names the line it came from.

  It refuses when a file names two providers rather than picking one. Two
  answers is not a weaker version of one answer, and picking silently is how
  somebody budgets against the wrong provider for a month.

  A base URL beats the SDK it was pointed at: Moonshot, DeepSeek, xAI and Groq
  are all called through the OpenAI SDK with a different base_url, so treating
  that as a contradiction would refuse to price an ordinary client.

  With no file, it reports only which tool Trazum is running inside — and warns
  when that tool bills by subscription, because a monthly saving is arithmetic
  about tokens there, not money you get back.

${bold('CONFIG FILE')}
  ${bold('trazum.config.json')}, found by walking up from the working directory and
  stopping at the repository root. Every key is optional:

    level, locale, disable, maxGrowth, extensions
    usage     { model, callsPerMonth, avgOutputTokens, cacheHitRate, batchEligible }
    budgets   { "prompts/**": 2000, "prompts/system.txt": 4000 }
    baseline  { "path": "trazum.baseline.json", "maxGrowthTokens": 0, "maxGrowthPct": 5 }
    pricing   "./prices.json"   — local price corrections, see below
    labels    { "support-rag": "prompts/support.txt" } — which prompt file each
              usage-log label sends, so "trazum profile" can read the file and
              say why a failing cache fails
    spend     { "maxUsd": 200, "byLabel": { "chat": 40 } } — money budgets for
              "trazum profile", in dollars. A budgeted label with no calls in
              the log is reported as not measured, never as a pass
    waive     [{ "gate": "maxUsd", "reason": "August migration", "until":
              "2026-09-15" }] — a gate failure decided about, on the record.
              All three fields required: a waiver with no end date is a
              finding deleted with extra steps. Waived failures still print,
              and the day the waiver expires the gate fails again

  Flags beat the config; the config beats the defaults. Budgets resolve to the
  most specific matching pattern — most literal characters wins. A boolean the
  config switched on comes back off with --no-<flag>, e.g. --no-batch.

  ${bold('budgets')} is a ceiling; ${bold('baseline')} is a gate. One asks whether a file fits,
  the other whether the repository got worse than the commit somebody recorded
  with "trazum baseline". A repository at 95% of every budget passes forever
  while a pull request adds four hundred tokens across a dozen files. With
  baseline in the config, "check" on a directory reads it and gates on it — no
  flag, because a gate you have to remember to pass an argument to runs in the
  author's terminal and not in CI. Thresholds are in tokens, never dollars: a
  repriced model would otherwise fail a build for a change nobody made.

  A config that will not validate is an error, including an unknown key. A
  lenient parser would silently restore defaults, and for a budget the default
  is "no budget" — a green build for a prompt nobody measured.

  --config <file>             Use this config instead of searching for one.

${bold('PRICES')}
  Prices change on someone else's schedule, so correcting one does not require
  upgrading Trazum. A pricing overlay is a JSON file layered over the bundled
  catalogue:

    { "lastReviewed": "2027-01-15",
      "models": { "claude-opus-5": { "inputPerMTok": 6 } } }

  Only the fields you name change. A model the bundled catalogue does not have
  must be complete, because a half-defined model would price at nothing and
  report a saving that is not there. "promo": null withdraws a promotion.

  Every report says when overlaid prices were used and which models they cover:
  a figure from the bundled catalogue and a figure from your JSON file otherwise
  look identical.

  --pricing <file>            Use this overlay, ahead of the config's own.
  --pricing-live              Take prices from OpenRouter instead of the bundled
                              table: today's figures for hundreds of models across
                              dozens of providers. Opt-in, because it is a network
                              call — the deterministic core never makes one.
                              A --pricing file wins over this.

                              What that source does not publish is whether a model
                              has prompt caching or the minimum prefix it caches
                              at. Models it adds therefore get no caching advice
                              at all, rather than a guess: claiming caching works
                              would offer a saving nobody can buy, and claiming it
                              does not would hide the largest saving there is.

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
  trazum optimize prompt.txt --reorder --diff
  trazum optimize prompt.txt --llm -o prompt.optimised.txt
  trazum eval prompt.txt --cases cases.txt --level aggressive
  trazum diff prompts/system.txt prompts/system.new.txt --max-growth 10
  trazum check prompts/
`,

  cache: {
    cleared: (entries: number, bytes: number, dir: string) =>
      entries === 0
        ? `No cached suggestions to remove (${dir}).`
        : `Removed ${entries} cached ${entries === 1 ? 'answer' : 'answers'} (${(bytes / 1024).toFixed(1)} KB) from ${dir}.`,
    used: (hits: number, misses: number) =>
      `Suggestions: ${hits} from cache, ${misses} asked. Cached answers are what the model said last time; --clear-suggestion-cache to start over.`,
  },

  errors: {
    livePricingFailed: (url: string, detail: string) =>
      `Could not load live prices from ${url}: ${detail}. The bundled prices are still there — drop --pricing-live to use them.`,
    optionNeedsValue: (name) => `Option --${name} needs a value.`,
    mustBeNonNegative: (name, raw) =>
      `--${name} must be a non-negative number (received: "${raw}").`,
    badLevel: (received) => `--level must be "safe" or "aggressive" (received: "${received}").`,
    allLabelsNeedsLog: () =>
      '--all-labels ranks prompts by measured traffic, so it needs --from-log <usage.jsonl>. Without a log every saving would be multiplied by the same typed guess, which ranks prompts by length and calls it a priority.',
    allLabelsNeedsMap: () =>
      '--all-labels reads the "labels" map in trazum.config.json — label to prompt file — and this config has none. Map at least one workload to its prompt.',
    fromLogConflict: (flag) =>
      `--from-log measures the figure --${flag} types, and merging a measurement with a guess produces a number that is neither. Pass one or the other.`,
    fromLogNeedsLabel: (available) =>
      `--from-log needs to know which workload this prompt is: pass --label, or map the prompt file under "labels" in trazum.config.json. Labels with traffic in this log: ${available}.`,
    fromLogAmbiguousLabel: (target, labels) =>
      `${target} is mapped to more than one label in trazum.config.json (${labels}), so --from-log cannot pick one silently. Pass --label.`,
    fromLogLabelEmpty: (label, available) =>
      `No priced call in this log carries the label "${label}", so there is nothing to measure — a zero-call profile would price this change as worthless rather than as unmeasured. Labels with traffic: ${available}.`,
    unknownRuleInDisable: (id) => `Unknown rule in --disable: "${id}". Full list: trazum rules`,
    unknownCommand: (command) => `Unknown command: "${command}". Try "trazum --help".`,
    missingInputFile: () => 'Missing input file. Use "-" to read from standard input.',
    applyNeedsSuggest: () =>
      '--apply-suggestions has nothing to apply without --suggest. On its own it would have '
      + 'run silently and changed nothing, which is not an answer.',
    llmNotConfigured: () =>
      'You asked for --llm but no provider is configured.\n' +
      'Set TRAZUM_LLM_BASE_URL and TRAZUM_LLM_MODEL (OpenAI-compatible endpoint),\n' +
      'or TRAZUM_LLM_PROVIDER=anthropic with TRAZUM_LLM_API_KEY.',
    exactTokensNeedsKey: () => '--exact-tokens needs ANTHROPIC_API_KEY in the environment.',
    checkNeedsMaxTokens: () => 'trazum check needs --max-tokens <n>.',
    evalNeedsCases: () => 'trazum eval needs --cases <file>.',
    unknownExportFormat: (received, allowed) =>
      `Unknown export format "${received}". Available: ${allowed}.`,
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
    baselineMissing: (path) =>
      `The config declares a baseline at "${path}" and it is not there. Record one with "trazum baseline" and commit it. This is an error rather than a skipped check: a gate the config asked for and could not run is not a pass.`,
    baselineTooBig: (path, limit) =>
      `"${path}" is over the ${limit}-byte limit for a baseline. Something other than a baseline is at that path.`,
    errorLabel: () => 'Error',
  },

  report: {
    inputTokens: () => 'Input tokens',
    estimated: (offFamily) =>
      offFamily === null
        ? ' (estimated, ±10%)'
        : ` (estimated — the counter is calibrated on Claude, not ${offFamily})`,
    exactCount: () => ' (exact count)',
    rulesApplied: () => 'Rules applied',
    nothingToTrim: () => '  No rule found anything to trim.',
    // Printed only when nothing fired, which is exactly when the reader would
    // otherwise conclude their prompt is already efficient. Stated rather than
    // detected: guessing the prompt's language is one more thing to get wrong,
    // and naming the coverage cannot be wrong.
    dictionaryCoverage: (languages) =>
      `  The phrase dictionaries cover ${languages}. A prompt in another language `
      + 'is not necessarily efficient — it may just be one Trazum cannot read yet.',
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
    allLabelsHeading: (count) => `Every mapped prompt against its own measured traffic — ${count} ranked by what the change is worth`,
    allLabelsRow: (saving) => `${saving}/month if optimised`,
    allLabelsRowPeriod: (saving) => `${saving} over the measured period if optimised`,
    allLabelsFooter: () =>
      'Ranked by measured traffic, not by prompt length: a big prompt on a dead workload is worth less than a small one on a busy one. Each figure is this prompt\'s token delta at its own label\'s measured rate.',
    allLabelsUnmapped: (label, usd) =>
      `${label} carries ${usd} of measured spend and no prompt file is mapped to it — the workload nobody can optimise because nobody said where it lives. Map it under "labels" in trazum.config.json.`,
    allLabelsDead: (label, path) =>
      `${label} is mapped to ${path} and has no traffic in this log — a retired workload, a renamed label, or a typo that has been silently doing nothing.`,
    allLabelsUnreadable: (label, path) =>
      `${label} is mapped to ${path}, which could not be read. The mapping exists; the file does not.`,
    usageLineMeasured: (calls, days, scaled, outputTokens, batch) =>
      `${calls} calls measured over ${days} days — ${scaled}/month at that rate · ${outputTokens} output tokens per call, measured${batch ? ' · Batch API' : ''}`,
    usageLineMeasuredPeriod: (calls, days, outputTokens, batch) =>
      `${calls} calls measured${days === null ? ' (the log carries no clock)' : ` over ${days} days`} · ${outputTokens} output tokens per call, measured${batch ? ' · Batch API' : ''}`,
    measuredModelShare: (model, share, count) =>
      `This label ran on ${count} models; the figures use ${model}, which carried ${share} of its spend.`,
    measuredNoOutput: () =>
      'No call in this slice recorded output tokens, so the output half of every figure below is $0 measured — not $0 assumed.',
    perPeriodSaving: (saving, pct) => `saving ${saving} over the measured period (${pct}%)`,
    periodNotScaled: (days) =>
      days === null
        ? 'Not scaled to a month: the log carries no clock, so there is no rate to scale. These figures cover exactly the calls measured.'
        : `Not scaled to a month: ${days} days is under the week a scaling needs — shorter than one weekly cycle multiplies whichever part of the cycle it caught. These figures cover exactly the period measured.`,
    perMonthSaving: (saving, pct) => `saving ${saving}/month (${pct}%)`,
    beyondShortening: () => 'Beyond shortening the prompt',
    biggestLever: () => 'Start here:',
    biggestLeverDetail: (title, amount, times) =>
      // The title keeps its case: lowercasing it turned "Claude Opus 5" into
      // "claude opus 5", which is a product name mangled to fit a sentence.
      `"${title}" — ${amount}/month` +
      (times !== null && times >= 2 ? `, ${times}× what the rules saved.` : '.'),
    perMonthSuffix: (amount) => ` ~${amount}/month`,
    diff: () => 'Diff',
    tokensOnlyHeading: (host) => `What this buys on ${host}`,
    tokensOnlyWhy: (host) =>
      `${host} bills by subscription, so there is no bill to reduce and no monthly figure to print.`,
    tokensOnlyAsked: () => 'Costs hidden because you asked for tokens only.',
    // `tokens` arrives already formatted for the locale, so the singular is
    // decided on the string rather than on a number that is no longer here.
    tokensSaved: (tokens) => `${tokens} token${tokens === '1' ? '' : 's'} back, every call.`,
    windowNegligible: (tokens, model, window) =>
      `${tokens} tokens of ${model}'s ${window}-token window — under a tenth of a percent, so the window is not what constrains this prompt.`,
    windowUnmoved: (share, model, window) =>
      `${share} of ${model}'s ${window}-token window, before and after: this change is too small to move it.`,
    beyondThisPromptTokensOnly: () =>
      'Shortening a prompt is the smallest lever there is: measured on an ordinary support prompt, the rules recover about 1% of a monthly bill. If any of your prompts go to a metered API, "trazum profile <usage.jsonl>" reads what the provider actually charged and prices the levers that are not the prompt. Recording that log is a few lines and it never contains prompt text.',
    beyondThisPrompt: () =>
      'Shortening a prompt is the smallest lever there is: measured on an ordinary support prompt, the rules recover about 1% of a monthly bill. On a metered API the things that move 40% to 80% are which model the call goes to, the Batch API, prompt caching, and what re-sending the conversation costs — and "trazum profile <usage.jsonl>" prices all four from what the provider actually charged. Recording that log is a few lines and it never contains prompt text.',
    windowUse: (before, after, model, window) =>
      `Context window: ${before} → ${after} of ${model}'s ${window} tokens — room the conversation gets instead.`,
    tokensOnlyAskedFor: () =>
      'You named a scenario, and it was not priced: Trazum is running somewhere that bills by subscription, so there is no bill here to reduce. Add --cost to price it anyway — the host says where Trazum runs, not where your prompt goes.',
    tokensOnlyCost: () => 'Pass --cost if this prompt is bound for a metered API.',
    pricingOverlaid: (models, lastReviewed) =>
      `Prices for ${models} came from a local overlay reviewed ${lastReviewed}, not from the bundled catalogue.`,
    reorderHeading: () => 'Reordered for caching',
    reorderMoved: (blocks, tokens) =>
      `Moved ${blocks} ${blocks === 1 ? 'block' : 'blocks'} (~${tokens} tokens) ahead of the first placeholder.`,
    reorderPrefix: (before, after) => `Cacheable prefix ${before} → ${after} tokens.`,
    reorderDeclined: (count) =>
      count === 1 ? 'Left 1 block where it was:' : `Left ${count} blocks where they were:`,
    reorderDeclinedRef: (phrase, excerpt) => `refers back ("${phrase}"): ${excerpt}`,
    reorderDeclinedAfter: (excerpt) => `after a block that had to stay: ${excerpt}`,
    reorderDeclinedScript: (script) =>
      `this prompt is written in ${script}, and Trazum has no backward-reference phrases ` +
      `for it. It cannot tell "summarise the text above" from an instruction that is safe ` +
      `to move, so it moved nothing. Adding a language is adding an array to phrases.ts.`,
    reorderDeclinedMore: (count) => `…and ${count} more, in the output file.`,
    reorderPiped: (moved, tokens, declined) => {
      const head =
        moved === 0
          ? 'nothing could safely move'
          : `moved ${moved} ${moved === 1 ? 'block' : 'blocks'} (~${tokens} tokens) into the cacheable prefix`;
      const tail =
        declined === 0 ? '' : `; ${declined} ${declined === 1 ? 'block' : 'blocks'} left in place`;
      return `trazum: ${head}${tail}. Run without redirecting output for the reasons.`;
    },
    reorderNothing: () => 'Nothing could safely move.',
    suggestHeading: () => 'Suggested rewrites',
    suggestOffered: (count, tokens) =>
      `${count} ${count === 1 ? 'phrase' : 'phrases'} could say the same in ~${tokens} fewer tokens:`,
    suggestApplied: (count, tokens) =>
      `Applied ${count} ${count === 1 ? 'rewrite' : 'rewrites'} (~${tokens} tokens). Read the diff.`,
    suggestNothing: (provider, model) =>
      `${provider} (${model}) found nothing worth rewriting that the rules had not already taken.`,
    suggestRejected: (count) =>
      `${count} ${count === 1 ? 'proposal' : 'proposals'} did not survive checking against your prompt.`,
    suggestRemoved: () => '(removed)',
    suggestHowToApply: () => 'Nothing was changed. Add --apply-suggestions to take them.',
    reorderReview: () =>
      'Read the diff: this moved text rather than deleting it, so the question is whether the order mattered.',
    diffTooLarge: (lines, max) =>
      `  Diff skipped: ${lines} lines is past the ${max}-line limit, and aligning them would cost more memory than the answer is worth.`,
    wroteTo: (path) => `Optimised prompt written to ${path}`,
  },

  where: {
    hostHeading: () => 'Running inside',
    subscription: (host) =>
      `${host} bills by subscription, not by the token. A monthly saving below is arithmetic about tokens, not money you get back — what you gain is context window and rate-limit headroom.`,
    noTarget: () => 'Pass a source file to see which provider its prompts are sent to.',
    sourceHeading: (path) => `Prompts in ${path} go to`,
    conflict: () => 'Cannot tell: the file names more than one provider.',
    conflictFallback: () =>
      'Nothing was assumed. Set "usage.model" in trazum.config.json, or pass --model.',
    nothingFound: () => 'Nothing in this file says which provider it calls.',
    providerOnly: () => ' (provider only — nothing named a model)',
    evidenceLine: (line, kind, detail) => `line ${line}  ${kind}: ${detail}`,
    pricedAs: () => 'Priced as',
    fromConfig: () => '(from trazum.config.json)',
    fromDetection: () => '(read from the source)',
    fromProviderDefault: (provider) =>
      `(${provider} was read from the source; nothing named a model, so this is theirs)`,
    fromDefault: () => '(the built-in default — nothing said otherwise)',
  },

  pricing: {
    liveLoaded: (added: number, refreshed: number, skipped: number) =>
      `Live prices: ${refreshed} refreshed, ${added} models added, ${skipped} skipped for having no usable price or context window. Caching minimums are not published by this source, so caching advice is withheld for the added models.`,
  },

  models: {
    title: () => 'Models and pricing',
    unit: () => '  (USD per million tokens)',
    reviewedOn: (date, days) =>
      `  Table reviewed on ${date}${ago(days)}. Verify before budgeting.`,
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

  rank: {
    heading: (root, count) =>
      `${count} ${count === 1 ? 'prompt' : 'prompts'} under ${root}, most recoverable first`,
    subheading: (model, calls) => `Priced on ${model} at ${calls} calls a month.`,
    columns: {
      recoverable: 'Recover',
      tokensBack: 'Tokens',
      tokens: 'Size',
      density: 'Tok/sen',
      notes: 'Prompt',
    },
    noteExamples: (count, tokens) => `${count} examples, ~${tokens} tokens`,
    noteFormat: (tokens) => `~${tokens} tokens restating the output format`,
    noteProtected: (pct) => `${pct}% is code or URLs, which cannot be trimmed`,
    skipped: (count) =>
      `Skipped ${count} source ${count === 1 ? 'file' : 'files'} with no \`// trazum:prompt\` marker — `
      + 'their prompts are not in this ranking.',
    densityNote: () =>
      'Tok/sen is tokens per sentence: verbosity independent of length. There is no score — every column is a measurement you can check against the file.',
    recoverableNote: () =>
      'Recover is what the deterministic rules would take at this level, priced by the usage profile, with the token count beside it — a saving of one token is twenty-five cents and no work worth doing. It is measured by running the rules, not by a formula.',
  },

  blame: {
    heading: (path, revisions) =>
      `${path} — ${revisions} ${revisions === 1 ? 'revision' : 'revisions'}`,
    notARepository: () =>
      'blame reads a file\'s history from git, and this directory is not inside a repository.',
    outsideRepository: (path) =>
      `${path} is outside the repository, so there is no history to read.`,
    noHistory: (path) => `git has no commits touching ${path}.`,
    gitMissing: () => 'git is not on PATH, and blame has nothing to read the history from.',
    columns: { when: 'Date', tokens: 'Tokens', change: 'Change', who: 'Author', commit: 'Commit' },
    net: (first, last, delta, pct) =>
      `Net across this history: ${first} → ${last} tokens (${delta}, ${pct}).`,
    netCost: (amount, model, calls) =>
      `That movement is ${amount} a month on ${model} at ${calls} calls.`,
    biggestRise: () => 'Biggest single increase',
    biggestRiseDetail: (tokens, author, subject, sha) =>
      `+${tokens} tokens — ${author}, "${subject}" (${sha})`,
    addedAt: () => 'added',
    goneAt: () => 'not present',
    truncated: (shown) =>
      `Showing the most recent ${shown}. Pass --limit for more.`,
    followedRename: (from) => `Followed a rename: earlier revisions are ${from}.`,
    estimateNote: () =>
      'Token counts are estimates (±10%). The trend is the point; the absolute figures are not.',
  },

  languages: {
    and: 'and',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
    nl: 'Dutch',
  },

  rules: {
    title: () => 'Available rules',
    disableHint: () => '  Turn off the ones you do not want with --disable id1,id2',
  },


  doctor: {
    heading: (root, prompts) =>
      `${root} — ${prompts} ${prompts === 1 ? 'prompt' : 'prompts'}`,
    subheading: (model, calls) => `Priced on ${model} at ${calls} calls a month.`,
    pricesReviewed: (date, days) => `Prices reviewed ${date}${ago(days)}.`,
    budgetsHeading: () => 'Budgets',
    everyPromptBudgeted: (count) =>
      count === 1
        ? 'The prompt has a budget and is inside it.'
        : `All ${count} prompts have a budget and are inside it.`,
    unbudgeted: (count, total) =>
      `${count} of ${total} ${count === 1 ? 'prompt has' : 'prompts have'} no budget, so nothing is watching ${count === 1 ? 'it' : 'them'}`,
    overBudget: (count) =>
      count === 1
        ? '1 prompt is already over its budget — trazum check would fail on it'
        : `${count} prompts are already over their budget — trazum check would fail on them`,
    andMore: (count) => `and ${count} more`,
    findingsHeading: () => 'What it would be worth fixing',
    acrossPrompts: (count) => `${count} ${count === 1 ? 'prompt' : 'prompts'}`,
    findingsNote: () =>
      'Each line is the same advisory trazum optimize raises on those prompts, summed. '
      + 'Run it on any one of them to see the figure on its own.',
    notAGate: () =>
      'Nothing here fails a build. trazum check is the gate; this is the survey — the '
      + 'model recommendation is a keyword heuristic, and a build gated on one teaches '
      + 'people to re-run until green.',

    sharedPrefixHeading: () => 'Preambles that could share a cache entry and do not',
    sharedPrefixGroup: (count, tokens, drift) =>
      `${count} prompts open with the same ${tokens}-token preamble, `
      + (drift === 'whitespace'
        ? 'differing only in whitespace'
        : 'differing in wording, capitalisation or punctuation'),
    sharedPrefixFix: (drift) =>
      drift === 'whitespace'
        ? 'A formatter fixes this: the text already agrees, only the spacing does not.'
        : 'Someone has to pick one wording — the text itself differs, not just its spacing.',
    sharedPrefixNoFigure: () =>
      'No figure is attached, deliberately. Caching matches bytes, so these prompts hold '
      + 'one cache entry each instead of one between them — but what that costs depends on '
      + 'how the calls are spread across the group, and Trazum applies a single '
      + '--cache-hit-rate to every prompt. Pricing it would mean inventing your traffic.',
  },

  prune: {
    needsExamples: () =>
      'This prompt has fewer than two few-shot examples, so there is nothing to compare.',
    estimate: (examples, cases, calls) =>
      `${examples} examples × ${cases} cases: ${calls} provider calls `
      + `(2 baselines per case, then one per example removed).`,
    needsConsent: () =>
      'Nothing was called. Add --yes to spend it. This is the only command that asks, '
      + 'because it is the only one whose bill grows with the length of your prompt.',
    heading: (model) => `What each example is doing, measured on ${model}`,
    selfAgreement: (pct) =>
      `The prompt agrees with itself ${pct} of the time. That is the yardstick: a removal `
      + 'that moves the answer less than this moved nothing attributable to the example.',
    line: (n, tokens, pct) => `example ${n} — ${tokens} tokens, ${pct} agreement without it`,
    verdictNeeded: () => 'needed here',
    verdictRecoverable: () => 'no effect on these inputs',
    verdictUnknown: () => 'inconclusive',
    recoverable: (tokens) =>
      `${tokens} tokens sit in examples whose removal changed nothing measurable here.`,
    caveat: () =>
      'Which is not the same as "delete them". An example may exist for a case these '
      + 'inputs do not contain — the boundary condition somebody hit in production and '
      + 'added a demonstration for. This measures the inputs you gave it, and only you '
      + 'know whether they cover what matters. Nothing was edited.',
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
    exportWarnings: (count) =>
      `${count} ${count === 1 ? 'thing' : 'things'} to know before you trust the run:`,
    exportWrote: (path, cases, assertions) =>
      `Wrote ${path}: two prompts, ${cases} ${cases === 1 ? 'case' : 'cases'}, ` +
      `${assertions === 0 ? 'no assertions' : `${assertions} assertion${assertions === 1 ? '' : 's'} (the prompt asks for JSON)`}. ` +
      `Add yours, then run: npx promptfoo eval -c ${path}`,
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
    someOverLimit: (count, max) =>
      `${count} ${count === 1 ? 'prompt grew' : 'prompts grew'} past the per-prompt limit of ${max} tokens:`,
    allSubheading: (prompts) =>
      `${prompts} ${prompts === 1 ? 'prompt' : 'prompts'} on both sides.`,
    allTotal: (delta, prompts) =>
      `${delta} tokens across ${prompts} ${prompts === 1 ? 'prompt' : 'prompts'}`,
    signConvention: () =>
      'Every figure is after minus before, so positive means worse — the opposite of the rest of Trazum.',
    onlyBefore: () => 'only before',
    onlyAfter: () => 'only after ',
    onlyOneSideNote: () =>
      'Not counted in the totals. A prompt that vanished is a question, not a saving.',
  },

  markdown: {
    checkHeading: (target) => `Trazum — token budgets for ${target}`,
    baselineGrew: (delta, pct) => `This branch adds ${delta} tokens (${pct}) to the prompts here`,
    baselineShrank: (delta, pct) => `This branch removes ${delta} tokens (${pct}) from the prompts here`,
    baselineUnchanged: () => 'No change against the recorded baseline',
    baselineOverLimit: (limits) => `over the limit of ${limits}`,
    baselineLimitTokens: (limit) => `${limit} tokens`,
    baselineLimitPct: (limit) => `${limit}%`,
    baselineColumnBefore: () => 'Baseline',
    baselineColumnAfter: () => 'Now',
    baselineMoney: (before, after, delta) => `Monthly cost **${before} \u2192 ${after}** (${delta})`,
    baselineMoneyIncomparable: () =>
      'The scenario or the price list moved since the baseline was recorded, so the two monthly figures are not the same measurement and are not subtracted here. The token comparison above is unaffected.',
    baselineReRecord: (command, path) =>
      `If this growth is intended, re-record with \`${command}\` and commit \`${path}\`.`,
    diffHeading: (before, after) => `Trazum — ${before} → ${after}`,
    rankHeading: (root, count) =>
      `Trazum — what to fix first in ${root} (${count} ${count === 1 ? "prompt" : "prompts"})`,
    blameHeading: (path) => `Trazum — token history for ${path}`,
    rankLevel: (level) => `Measured at rule level \`${level}\`.`,
    columnFile: () => 'Prompt',
    columnTokens: () => 'Tokens',
    columnBudget: () => 'Budget',
    columnMetric: () => 'Metric',
    columnChange: () => 'Change',
    allWithin: (budgeted) =>
      budgeted === 1
        ? 'The prompt is within budget.'
        : `All ${budgeted} budgeted prompts are within budget.`,
    overBudget: (failures, budgeted) => `${failures} of ${budgeted} over budget`,
    noBudget: () => '—',
    unbudgetedNote: (count) =>
      count === 1
        ? '1 prompt is not covered by any budget pattern, so nothing is watching it.'
        : `${count} prompts are not covered by any budget pattern, so nothing is watching them.`,
    whatWouldHelp: () => 'What would help',
    wouldFit: (level, optimizedTokens) =>
      `optimising at \`${level}\` would land at ~${optimizedTokens} tokens, which fits`,
    stillTooBig: (optimizedTokens) =>
      `even optimised it does not fit (~${optimizedTokens} tokens): content has to be cut by hand`,
    truncated: () =>
      'Stopped early: the directory is larger than the walk limit, so this is not the whole picture.',
    footer: (source, level) => `Token counts ${source} · rule level \`${level}\``,
    pricingOverlaid: (count, lastReviewed) =>
      `Prices for ${count} ${count === 1 ? 'model' : 'models'} came from a local overlay reviewed ${lastReviewed}.`,
    sourceEstimated: () => 'estimated, ±10%',
    sourceExact: () => 'counted exactly',
    measuringOptimised: () =>
      'Measuring what the rules would leave, not what is written in the file.',
    metricTokens: (before, after) => `Input tokens (${before} → ${after})`,
    metricMonthly: (calls, model) => `Cost per month at ${calls} calls with ${model}`,
    deltaConvention: () =>
      'Every figure is a delta: after minus before, so <strong>positive means worse</strong>. ' +
      'This is the opposite of the rest of Trazum, where every figure is a saving.',
    advisoriesAppeared: () => 'Problems this edit introduced',
    advisoriesResolved: () => 'Problems this edit resolved',
    rulesNewlyFiring: () => 'Rules that now find something',
    rulesNoLongerFiring: () => 'Rules that no longer find anything',
    collapsedNote: () => 'nothing over budget, expand for the numbers',
    trimNotice: () =>
      '_Trimmed to fit a comment. The full report is in the workflow run summary._',
    commentTitle: () => 'Trazum',
  },

  check: {
    okLabel: () => 'OK',
    embeddedHeading: (path, count) =>
      `${path} — ${count} marked ${count === 1 ? 'prompt' : 'prompts'}`,
    declinedHeading: (count) =>
      `${count} ${count === 1 ? 'marker' : 'markers'} could not be read:`,
    declinedAt: (line, detail) => `line ${line}: ${detail}`,
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
    exactCountsCost: (files) =>
      `Counting ${files} ${files === 1 ? 'file' : 'files'} through the API, one call each. This takes a moment.`,
  },
  profile: {
    noTarget: () =>
      'Point this at a usage log: trazum profile usage.jsonl — one JSON object per line, each with a "model" and the "usage" object the API returned. Add "label" (which workload), "session" (which conversation) and "ts" (when) while you are there: without them every call looks alike, and the largest findings this command makes — conversation growth, and whether the cache TTL fits how fast your turns come — cannot be made at all. Recording it is four lines in your own code, it never contains prompt text, and the session key is grouped by and never printed.',
    heading: () => 'Where the money went',
    calls: (n) => plural(n, 'call'),
    spent: (calls, total) => `${calls} · ${total}`,
    part: (name, usd, pct, tokens) => `${name.padEnd(13)}${usd.padStart(11)}  ${pct.padStart(5)}   ${tokens} tokens`,
    partInput: () => 'Input',
    partCacheRead: () => 'Cache reads',
    partCacheWrite: () => 'Cache writes',
    partOutput: () => 'Output',
    byLabelHeading: () => 'By label',
    byModelHeading: () => 'By model',
    row: (name, usd, pct, calls) => `${usd.padStart(11)}  ${pct.padStart(5)}   ${name}  (${calls})`,
    // Parenthesised so a real label named "unlabelled" cannot read identically
    // beside it — the data already keeps them apart; the display should too.
    unlabelled: () => '(no label)',
    cacheHit: (pct) => `Cache hit rate ${pct} of billable input.`,
    cacheNever: () => 'Caching was never used on these calls. If any prefix repeats, that is the largest saving available.',
    cacheLost: (usd, writes, reads) =>
      `Caching added ${usd} to this bill instead of taking it off. ${writes} tokens were written to the cache and ${reads} read back — and a write costs 1.25x plain input, or 2x at the 1-hour TTL. A prefix that changes faster than it is reused pays that premium for nothing. Either cache a prefix that holds still, or turn caching off here.`,
    cachePaidOff: (usd) => `Caching took ${usd} off this bill, against the same tokens uncached.`,
    cacheNoDifference: () =>
      'Caching came out level on this bill: what it charged for these tokens is what they would have cost as ordinary input. It is neither paying for itself nor costing you anything.',
    cacheLostBy: (labels) => `The loss is in: ${labels}.`,
    cacheLostHidden: (usd, labels) =>
      `The total above hides a loss: caching costs ${usd} across ${labels}.`,
    andMoreLabels: (n) => `and ${count(n)} more`,
    cacheTtlUnsettled: (calls, asRecorded, atLongTtl) =>
      `This log cannot say whether caching paid for itself. ${count(calls)} ${calls === 1 ? 'call' : 'calls'} did not record which cache-write TTL was used: at the 5-minute rate caching took ${asRecorded} off this bill, and at the 1-hour rate the same calls added ${atLongTtl} to it. Neither is reported as the answer. Record the "cache_creation" object the API returns and this settles itself.`,
    cacheTtlBound: (calls, atLongTtl) =>
      `That figure is a bound, not a measurement: ${count(calls)} ${calls === 1 ? 'call' : 'calls'} did not record a cache-write TTL, and at the 1-hour rate it is ${atLongTtl}.`,
    cacheTtlUnsettledLabels: (labels) =>
      `These would be losing money if their unrecorded writes used the 1-hour TTL: ${labels}.`,
    biggestPart: (name, pct) => `${name} is ${pct} of this bill.`,
    outputDominates: (pct) =>
      `Output is ${pct} of this bill, so shortening prompts has a low ceiling here. What moves it is asking for shorter answers and capping max_tokens.`,
    unpriced: (models, calls) =>
      `${count(calls)} ${calls === 1 ? 'call is' : 'calls are'} not in these totals — the pricing catalogue does not know: ${models}. Add them with a pricing overlay (--pricing) to include them.`,
    skipped: (lineCount, lines) =>
      `${count(lineCount)} ${lineCount === 1 ? 'line' : 'lines'} could not be read and ${lineCount === 1 ? 'was' : 'were'} left out (${lineCount === 1 ? 'line' : 'lines'} ${lines}).`,
    empty: () => 'No usage records in that file.',
    nothingPriced: () =>
      'None of the models in that log are in the pricing catalogue, so there is no bill to report. Add them with a pricing overlay (--pricing) and run this again.',
    leversHeading: () => 'What would actually move this bill',
    leverSlice: (label, model, usd, pct) =>
      `${label} on ${model} — up to ${usd} of this bill (${pct})`,
    leverRoute: (candidate, usd) => `route it to ${candidate}, ${usd}`,
    leverRouteVerify: (candidate) =>
      `Whether that holds is an evaluation question, not an arithmetic one, and nothing here has seen a single answer. Measure it: trazum route <log> --prompt-file <prompt> --cases <cases> --yes`,
    leverBatch: (usd) => `send it through the Batch API, ${usd}`,
    leverCalls: (calls, spent) => `${calls}, ${spent} spent`,
    leverPromptCeiling: (usd, pct) =>
      `For comparison: shortening the prompt text can touch ${usd} at the very most — ${pct} of this bill, and only if you deleted every input token. The real figure is far below that, because most of those tokens are retrieved context, conversation history and tool results that no prompt file contains.`,
    historyHeading: () => 'What re-sending the conversation costs',
    historyGrowth: (label, model, first, last, turns) =>
      `${label} on ${model}: input ranges from ${first} tokens on the smallest turn to ${last} on the largest, over conversations of up to ${turns} turns.`,
    historyCeiling: (usd, pct, flat, spent) =>
      `If every turn had been the size of its smallest one, that input would have cost ${flat} instead of ${spent} — so at most ${usd} of this bill is conversation growth (${pct}). It is a ceiling and not a saving: some of that is the user's own new messages, which nothing can truncate away, and this reads counts rather than content so it cannot tell the two apart. What moves it is capping the history you replay, or summarising it.`,
    truncatedWaste: (calls, usd, pct) =>
      `${calls} hit the max_tokens ceiling: ${usd} of the output spend (${pct}) bought answers that were cut off mid-generation — paid in full, frequently retried and billed again. Where the answer genuinely needs the room, raise max_tokens; where it does not, ask for less. Either way this is the one slice of a bill that is waste without a counterpart.`,
    againstHeading: () => 'Against the previous log',
    againstTotals: (before, after, delta, pct, callsBefore, callsAfter) =>
      `${before} → ${after}   ${delta} (${pct})   ${callsBefore} → ${callsAfter}. Positive means the bill grew. Both figures are exactly what each file holds — no period is assumed, so judge the call counts before judging the money.`,
    againstDriver: (delta, label, before, after) => `${delta}  ${label}  (${before} → ${after})`,
    againstDriverNew: (delta, label) => `${delta}  ${label}  (new since the previous log)`,
    againstDriverGone: (delta, label) => `${delta}  ${label}  (gone since the previous log)`,
    againstByModel: () =>
      'The same change, by model — where the mix moved:',
    labelPrefixBelowMinimum: (file, prefix, minimum, model) =>
      `${file} (as it is today — the log may predate it): the stable prefix is ${prefix} tokens and ${model} caches nothing under ${minimum}. Setting cache_control there does not error, it simply never caches — which is what a cache that only writes looks like from the bill.`,
    labelPrefixMovable: (file, movable, prefix) =>
      `${file} (as it is today — the log may predate it): ~${movable} stable tokens sit after the first placeholder, where caching cannot reach them; the cacheable prefix is ${prefix}. "trazum optimize ${file} --reorder" moves them in front and shows the diff.`,
    labelPrefixHealthy: (file, prefix, minimum) =>
      `${file} (as it is today — the log may predate it): the stable prefix is ${prefix} tokens, over the ${minimum} minimum. The prompt file is not the problem; look at whether the prefix is byte-identical between calls.`,
    labelFileMissing: (label, file) =>
      `labels["${label}"] points at ${file}, which does not exist — the mapping was skipped.`,
    againstNothingPriced: () =>
      'The previous log has nothing the pricing catalogue knows, so there is no comparison to make.',
    truncatedNotRecorded: () =>
      'Whether any answers were cut off could not be measured — no call in this log carries a stop reason. Add "stop_reason" (Anthropic) or "finish_reason" (OpenAI) to the record; the API already returns it beside "usage".',
    historyNoSessions: () =>
      'No call in this log carried a session, so what re-sending the conversation costs could not be measured — usually the largest line on a chat or agent bill. Add "session" (or "conversation_id") to the record and run this again. Trazum groups by it and never prints it.',
    leversUnlabelled: () =>
      'None of these calls carried a label, so this is every workload in one row — a classifier and a RAG pipeline merged into a single figure, with one route suggested for both. Add "label" to the record and the levers split by workload, which is the grouping a decision is actually made at.',
    outputShapeHeading: () => 'Where the output spend concentrates',
    outputTail: (label, model, callPct, spendPct, above, usd) =>
      `${label} on ${model}: ${callPct} of calls hold ${spendPct} of the output spend — the ones answering with more than ${above} tokens, out of ${usd} of output on this slice.`,
    outputTailAdvice: () =>
      'That is a tail, and a tail has a cause: a path through the prompt that invites an essay, a call with no max_tokens, a retrieval that returned a book. Finding it is a morning; it is not "make everything shorter".',
    outputFlat: (label, model, callPct, spendPct, usd) =>
      `${label} on ${model}: the output spend sits where the calls are — ${callPct} of them hold ${spendPct} of ${usd}. There is no tail to hunt.`,
    outputFlatAdvice: () =>
      'The answer length is the task here, so the levers are the blunt ones: ask for shorter answers in the prompt, and cap max_tokens.',
    outputPercentiles: (p50, p95) =>
      `Half the measured answers fit within ${p50} output tokens, and 95% within ${p95} — the number a max_tokens cap actually wants. Measured on these calls, promised for nothing.`,
    inputShapeHeading: () => 'How big these calls are',
    inputSkewed: (label, model, p50, p95, ratio, usd) =>
      `${label} on ${model} is uneven: half its calls fit within ${p50} input tokens and 95% within ${p95} — about ${ratio}x the ordinary call, over ${usd} of input spend.`,
    inputSkewedAdvice: () =>
      'Past four times the median, the ordinary call is fine and something is growing on top of it: a conversation nobody truncates, a retrieval with no cap, a tool result pasted in whole. The fix is a limit on the large calls, not a rewrite of the prompt every call sends.',
    inputEven: (label, model, p50, p95, usd) =>
      `${label} on ${model} is even: half its calls fit within ${p50} input tokens and 95% within ${p95}, over ${usd} of input spend.`,
    inputEvenAdvice: () =>
      'The large calls are not much larger than the ordinary one, so there is no tail to cap — the prompt is simply big. The levers are fewer retrieved documents, a shorter system block, and caching if the prefix repeats.',
    inputHuge: (label, model, calls, usd) =>
      `${label} on ${model}: every one of its ${calls} is larger than this tool measures precisely, over ${usd} of input spend. No ceiling is named because there is none to name honestly — that size is itself the finding.`,
    repeatsHeading: () => 'The same request, sent again',
    repeatsFound: (label, model, repeats, checked, seconds, usd) =>
      `${label} on ${model}: ${repeats} of ${checked} calls re-sent the previous call's exact input size within ${seconds} seconds, in the same conversation, costing ${usd}.`,
    pressureHeading: () => 'Approaching the context window',
    pressureLine: (label, model, tokens, window, share) =>
      `${label} on ${model}: the largest call carried ${tokens} input tokens against a ${window}-token window — ${share} of the ceiling.`,
    mixDriftHeading: () => 'The mix moved inside this log',
    mixDriftLine: (model, firstShare, lastShare, firstDays, lastDays, lastUsd) =>
      `${model} went from ${firstShare} of the spend in the first ${firstDays} days to ${lastShare} in the last ${lastDays} — ${lastUsd} of the recent half.`,
    truncationRetryLine: (label, model, retried, truncated, seconds, wasted, retry) =>
      `${label} on ${model}: ${retried} of ${truncated} truncated answers were followed within ${seconds} seconds by another call in the same conversation — ${wasted} spent on the cut attempts, plus ${retry} on the follow-ups.`,
    truncationRetryNote: () =>
      'The pair is the shape a retry has; the log cannot see content, so whether each was one is yours to know. Both sides of it are real money, and the fix is the same either way: a max_tokens the answers actually fit in.',
    mixDriftNote: () =>
      'A bill can grow with no workload growing: traffic migrating between models, a deploy that flipped a default, a fallback that became the main path. Shown past fifteen points of movement. Where the mix goes next is not in this log, so it is not said here.',
    pressureAdvice: () =>
      'At 100% the call fails outright, and nothing on the bill changes until that day. The levers are a cap on retrieved context, truncating conversation history, or a larger-window model. When it crosses is not predicted here: the share is a fact, the trajectory is yours to know.',
    repeatsAdvice: () =>
      'A conversation\'s input grows with every turn, so the same size twice in a row seconds apart is usually a retry after a timeout, an agent step repeating, or a loop — this reads counts and cannot see content, so it names the pattern and stops. Whatever it is, the money bought nothing the call before it had not already paid for.',
    inputMostlyCached: (share) =>
      `${share} of those tokens were cache reads, billed at a tenth of the input rate — the size is real and most of it is cheap.`,
    inputFullRate: () =>
      'Almost none of that was a cache read, so every one of those tokens was billed at the full input rate. If any prefix repeats across these calls, caching is the lever with the largest ceiling here.',
    leversNone: () =>
      'Nothing here clears 1% of the bill: these calls are already on the cheapest model of their family, or their provider has no batch API. That is a real answer, not an empty section.',
    assumedWriteTtl: (calls) =>
      `${count(calls)} ${calls === 1 ? 'call did' : 'calls did'} not say which cache-write TTL was used, so the cheaper 5-minute rate was assumed. A 1-hour entry costs 2x input rather than 1.25x, so this total is a floor for those calls. Record the "cache_creation" object the API returns to remove the assumption.`,
    spanLine: (from, to, days) =>
      `This log covers ${from} → ${to} (${days} days). The span is stated, never extrapolated — the monthly arithmetic is yours to do, and now it is valid.`,
    spanPartial: (withTs, total) =>
      `Only ${withTs} of ${total} calls carry a timestamp; the span describes those.`,
    ttlFitExpires: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart and the 5-minute entry is gone by then — writes expire before the next turn reads them, which from the bill is a cache that only writes. The 1-hour TTL costs 2x input to write and would survive these gaps; the other honest option is caching switched off here.`,
    ttlFitExpiresBoth: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart, and no cache entry lives that long — even the 1-hour TTL is gone by the next turn. Caching cannot work at this pace; turn it off here and stop paying the write premium.`,
    ttlFitOverlong: (label, model, gap, usd) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart — comfortably inside the 5-minute window — and these writes pay the 1-hour rate, 2x input against 1.25x, for endurance the gaps never use. The same writes at the 5-minute TTL are ${usd} cheaper on this log, and that figure is exact: the same tokens at the other published rate.`,
    ttlFitUnsettledGap: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart — a 5-minute entry is gone by then and a 1-hour one survives — and the log did not record which these writes were, so whether they ever get read back cannot be settled. Record the "cache_creation" object the API returns and it settles itself.`,
    ttlFitFits: (label, model, gap) =>
      `${label} on ${model}: turns arrive a median of ${gap} apart, inside the lifetime these writes use. The TTL is not the problem here.`,
    ttlFitUnmeasured: () =>
      'Whether the cache TTL fits how fast the turns arrive could not be measured — it needs both "session" and "ts" on the record. A 5-minute entry on a workload whose turns come nine minutes apart expires unread on every write, and only the clock can see it. Trazum groups by the session and never shows it.',
    dayPeak: (day, usd, xMedian) =>
      `The most expensive day in this log was ${day}: ${usd}, ${xMedian}x the median day.`,
    dayPeakLabel: (label, usd) => `Most of it was ${label} (${usd}).`,
    maxUsdOk: (total, max) => `Within budget: ${total} spent against --max-usd ${max}.`,
    maxUsdFailed: (total, max) =>
      `FAILED — this log spent ${total} against a --max-usd of ${max}. The figures are the provider's own billed counts over exactly this log; no period was assumed.`,
    maxGrowthUsdFailed: (delta, max) =>
      `FAILED — the bill grew ${delta} against the previous log, over the --max-growth-usd limit of ${max}.`,
    maxGrowthNeedsAgainst: () =>
      '--max-growth-usd has nothing to compare without --against <previous.jsonl>. On its own it would have run silently and gated nothing, which is not an answer.',
    maxCacheLossOk: (worst, max) =>
      `Cache within budget: caching cost at most ${worst} against --max-cache-loss-usd ${max}, worst case included.`,
    maxCacheLossFailed: (delta, max) =>
      `FAILED — caching added ${delta} to this bill (the same tokens as plain input would have cost less), over the --max-cache-loss-usd limit of ${max}. The counterfactual is exact: the same tokens at the published input rate.`,
    maxDayOk: (day, usd, max) =>
      `No single day over budget: the worst was ${day} at ${usd}, against --max-day-usd ${max}.`,
    maxDayFailed: (day, usd, max) =>
      `FAILED — ${day} spent ${usd}, over the --max-day-usd limit of ${max}. A total under budget can hide a single runaway day, which is what this gate exists to catch.`,
    maxDayNoClock: () =>
      'FAILED — --max-day-usd was asked for and no record in this log carries a timestamp, so there are no days to judge. That is not a pass: a bill nobody could measure by day is not a bill that stayed under a daily budget. Add "ts" to the record and the gate arms.',
    maxSessionOk: (worst, max, sessions) =>
      `No conversation over budget: the most expensive of ${sessions} cost ${worst}, against --max-session-usd ${max}. A conversation that started before this log is counted only for the turns recorded here, so this is a floor.`,
    maxSessionFailed: (worst, max, sessions) =>
      `FAILED — the most expensive of ${sessions} conversations cost ${worst}, over the --max-session-usd limit of ${max}. A month's budget and a day's budget both pass while one conversation loops its way through this; the per-conversation figure is the one that catches it.`,
    maxSessionNoSessions: () =>
      'FAILED — --max-session-usd was asked for and no record in this log carries a session, so there are no conversations to judge. That is not a pass. Add "session" (or "conversation_id") to the record and the gate arms; Trazum groups by it and never prints it.',
    maxDayUndated: (calls) =>
      `${calls} calls carry no timestamp, so they are in the bill and in none of the days above — the worst day is a floor by whatever they held. A failure would stand regardless; this pass is over the part that could be dated.`,
    maxCacheLossWorstCase: (calls, worst, max) =>
      `FAILED — ${count(calls)} ${calls === 1 ? 'call' : 'calls'} did not record which cache-write TTL was paid, and at the 1-hour rate caching added up to ${worst}, over the --max-cache-loss-usd limit of ${max}. The gate reads the worst case on purpose: a gate reading the flattering half would pass exactly the bills it exists to catch. Record the "cache_creation" object the API returns and the ceiling becomes a figure.`,
    pricesStale: (date, days) =>
      `The price table behind every dollar here was last reviewed ${date} — ${count(days)} days ago, past the 45 this tool considers current. If the provider changed prices since, this report is wrong by exactly that change. --pricing-live fetches today's prices; --pricing overlays your own.`,
    dayTableDay: () => 'Day (UTC)',
    dayTableCalls: () => 'calls',
    dayTableTop: () => 'biggest that day',
    dayTableEarlier: (days) =>
      `…and ${count(days)} earlier ${days === 1 ? 'day' : 'days'} not shown here. The full series rides --json as spendByDay.`,
    gateOnFloor: (reasons) =>
      `Note: the gated figure is a floor, not the bill — ${reasons}. Whatever those calls cost is not in the number the gate just judged, so a pass here means "the part I could read fits", never "the bill fits".`,
    floorSkipped: (lines) =>
      `${count(lines)} ${lines === 1 ? 'line was' : 'lines were'} unreadable and left out`,
    floorUnpriced: (calls) =>
      `${count(calls)} ${calls === 1 ? 'call is' : 'calls are'} on models the price table does not know`,
    floorUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'call carries' : 'calls carry'} no timestamp and fell outside the window`,
    sessionCost: (label, model, sessions, median, medianTurns, p95, max) =>
      `${label} on ${model}: across ${sessions} conversations, the median one costs ${median} over ${medianTurns} turns, 95% come in under ${p95}, and the most expensive was ${max}. Exact billed counts, per conversation — the figure a per-seat price or a quota is set from. A conversation that started before this log or continues after it is counted only for the turns recorded here.`,
    labelBudgetOk: (label, usd, max) => `Within budget: ${label} spent ${usd} against ${max}.`,
    labelBudgetFailed: (label, usd, max) =>
      `FAILED — ${label} spent ${usd} against its budget of ${max} in trazum.config.json.`,
    labelBudgetMissing: (label) =>
      `${label} has a budget in trazum.config.json and no calls in this log, so nothing was measured for it. Not a pass: a workload that did not appear is not a workload that came in under budget.`,
    labelBudgetWindowed: () =>
      'Per-label budgets in trazum.config.json were not applied: --since/--until make "what this label spent" mean a slice, and a budget written for the whole period would be gating against something it does not describe.',
    duplicateLines: (calls, usd) =>
      `${plural(calls, 'line is an exact duplicate', `lines are exact duplicates`)} of an earlier line — same counts, same label and session, same millisecond — and that adds ${usd} to the total above. If a log was exported twice or two files in a directory overlap, this bill is overstated by that much. Two real calls colliding on all of that is possible; it is just unlikely.`,
    budgetVsWire: (label, file, budget, perCall, share) =>
      `The budget on ${file} is ${budget} tokens, and calls labelled ${label} carry about ${perCall} input tokens each — so that gate governs roughly ${share} of what actually goes up the wire. The rest is retrieved context, conversation history and tool results, which no prompt file contains and no budget on one can see. The budget is not wrong; it is just smaller than the bill.`,
    badCsvShape: (value) =>
      `--csv-shape does not know "${value}". It takes "slice" (one row per label and model, the default), "day", "hour" or "model-day" (one row per day and model — the long format a pivot table wants).`,
    whatIfHeading: (model) => `These exact calls on ${model}`,
    whatIfAssumption: () =>
      'This is multiplication, not advice: the same token counts at another rate card. It says nothing about whether that model could do the work, and a model that answers at greater length or gets retried would not send these counts at all.',
    whatIfTotal: (current, target, delta) =>
      `${current} of movable spend would have been ${target} — a difference of ${delta}.`,
    whatIfCheaper: () =>
      'Verify before you move anything: trazum route measures one prompt against both models on your own examples.',
    whatIfDearer: () => 'That direction costs more. The arithmetic is here so the number is not a guess.',
    whatIfBatchOnTarget: (batched, moved) =>
      `If those calls can also wait, the target's Batch API takes the moved bill from ${moved} to ${batched} — the discount applies to the target's rates, not the ones you left. Whether they can wait is not in the log; that half of the decision is yours.`,
    whatIfCacheBeyond: (largest, min, noCache) =>
      `Its cache traffic could not exist there: the largest call is ${largest} tokens against the target's ${min}-token cache minimum, so no call in this slice could create an entry. Without the cache the same tokens cost ${noCache} — that is the figure the target would actually bill, and the row above flatters the move.`,
    whatIfSlice: (label, model, current, target) => `${label} on ${model}: ${current} → ${target}`,
    whatIfOverContext: (label, tokens, window, usd) =>
      `${label} cannot move: its largest call carries ${tokens} input tokens and that model's window is ${window}. Those calls would fail, not cost less, so their ${usd} is excluded from the figures above.`,
    whatIfAlreadyThere: (calls, usd) =>
      `Already on that model: ${calls} worth ${usd}, left out of the figures above — money that cannot move would make the difference look smaller than it is.`,
    whatIfUnpriced: (calls, models) =>
      `Excluded: ${calls} whose model has no price here (${models}). Their cost on the target is knowable; the difference is not, because there is no current figure to subtract from.`,
    whatIfNothingToMove: () =>
      'Nothing to compare: every priced call in this log is already on that model, or too large for its context window.',
    whatIfUnknown: (value, available) =>
      `--what-if does not know "${value}". Priced models: ${available}. Add it with --pricing if you have its rates.`,
    badGzip: (file, detail) =>
      `${file} is gzipped and would not decompress: ${detail}. Reading the rest and saying nothing would report a bill missing whatever that file held, so this stops instead. Check the file, or move it out of the directory.`,
    dryRunHeading: () => 'What this log can answer — no bill was produced',
    dryRunParsed: (parsed, skipped) =>
      `${parsed} records parse; ${skipped} lines could not be read. A dry run prices nothing: the point is what the gates you are about to wire would stand on.`,
    dryRunUnpriced: (models) =>
      `Models the price table does not know: ${models}. Their tokens parse; their dollars need a --pricing overlay.`,
    dryRunTotals: () => 'The bill itself: totals, per-model split, cache economics, the levers.',
    dryRunLabels: (share) =>
      `Per-workload findings and label budgets — "label" on ${share} of records.`,
    dryRunClock: (share) =>
      `The period, per-day and per-hour shape, --max-day-usd, --since/--until — a timestamp on ${share} of records.`,
    dryRunSessions: (share) =>
      `Conversation growth, per-conversation cost, --max-session-usd — a session on ${share} of records. Grouped by, never printed.`,
    dryRunStopReason: (share) =>
      `Truncated answers and their retry bill — a stop reason on ${share} of records.`,
    dryRunCacheTtl: (ttl, writes) =>
      `Settled cache verdicts — the "cache_creation" split on ${ttl} of ${writes} cache-writing records.`,
    dryRunNoCacheTraffic: () =>
      'Cache verdicts: nothing wrote to the cache in this log, so there is nothing to settle — not a missing field.',
    dryRunFooter: () =>
      'A ✗ is not a defect in the log; it is a finding this log cannot support yet. The README\'s recording recipe carries every field above.',
    dryRunNoGates: () =>
      '--dry-run produces no bill, so a gate beside it would exit green having judged nothing. Run the gates without --dry-run.',
    bySourceNeedsConfig: () =>
      '--by-source reads the "sources" block in trazum.config.json — a name per service, each with glob patterns over log paths — and this config has none. Name at least one source.',
    bySourceNothingMatched: (sources) =>
      'No log file matched any source pattern. The sources configured: ${sources}. Patterns match the paths as given on the command line.'.replace('${sources}', sources),
    fleetHeading: (count, total, calls) => `The fleet: ${count} sources · ${total} · ${calls}`,
    fleetRow: (name, usd, share, calls, span) => `${name}  ${usd}  ${share} of the fleet · ${calls} · ${span}`,
    fleetSpan: (days) => `${days} days`,
    fleetNoClock: () => 'no clock',
    fleetWorst: (name, usd, share) =>
      `${name} is where the money is: ${usd}, ${share} of the fleet's total.`,
    fleetMismatchedSpans: () =>
      'These sources cover different periods, so the shares above compare totals, not rates — a 3-day log looks cheap next to a 30-day one for reasons that have nothing to do with cost. Each row states its own span.',
    fleetSplitBrain: (label, detail) =>
      `The same workload runs on different models in different sources — ${label}: ${detail}. Same job, different rate cards; whether that is a decision or an accident is not in the logs.`,
    fleetCacheUnderwater: (name, usd) =>
      `Caching pays for the fleet overall but loses ${usd} in ${name} — the aggregate verdict was hiding it.`,
    fleetUnmatched: (file) =>
      `${file} matched no source pattern, so it is in no report above — spend missing from every bill until a pattern covers it.`,
    fleetFooter: () =>
      'Summaries per source; the full report for one service is "trazum profile <its logs>". Same thresholds, same findings, one source at a time.',
    fleetBudgetOk: (name, usd, max) => `Within budget: ${name} spent ${usd} against its ${max} in spend.bySource.`,
    fleetBudgetFailed: (name, usd, max) =>
      `FAILED — ${name} spent ${usd} against its budget of ${max} in spend.bySource. The fleet total can be fine while one service bleeds; this gate names which.`,
    fleetBudgetMissing: (name) =>
      `${name} has a budget in spend.bySource and no logs matched it in this run, so nothing was measured for it. Not a pass: a service that did not appear is not a service under budget.`,
    coverageHeading: () => 'What this log cannot answer yet',
    needsLabel: (seen) =>
      `"label" on ${seen} records: without it every workload is one row, so no per-workload spend, no drill-down, and the levers describe a mixture rather than a decision.`,
    needsSession: (seen) =>
      `"session" on ${seen} records: without it there is no conversation growth, no per-conversation cost, and no cache-TTL fit. It is grouped by and never printed.`,
    needsTs: (seen) =>
      `"ts" on ${seen} records: without it the log has no period, no per-day or per-hour shape, and the cache-TTL question cannot be asked at all.`,
    needsStopReason: (seen) =>
      `"stop_reason" (Anthropic) or "finish_reason" (OpenAI) on ${seen} records: without it, answers cut off at max_tokens are invisible — and silence there is not the same as none.`,
    needsCacheTtl: (seen) =>
      `the "cache_creation" object on ${seen} of the records that wrote to the cache: without it the 5-minute rate is assumed, so those totals are a floor and some cache verdicts cannot be settled.`,
    hoursConcentrated: (hours, list) =>
      `80% of this spend lands in ${hours} hours of the UTC day (${list}) — interactive traffic somebody is waiting on, where the Batch API's 24-hour turnaround does not fit. Hours are UTC; shift them yourself if your traffic sits in one region.`,
    hoursFlat: (hours) =>
      `The spend is spread across the day: it takes ${hours} hours of the UTC day to cover 80% of it. That is the shape background work has, and background work is what the Batch API halves the price of — see the levers above for what it would be worth here. Whether these calls can wait is yours to say; the log only shows when they happened.`,
    truncatedBy: (label, calls, measured, rate, usd) =>
      `${label}: ${calls} of ${measured} calls that recorded a stop reason were cut off (${rate}), ${usd} of output. The denominator is the calls that measured, not every call — a workload logging the field half the time is not a workload whose other half completed.`,
    truncatedCeiling: (p95) =>
      `95% of the answers that finished fit within ${p95} output tokens, so a cap around there would stop cutting them off. Measured on these calls, promised for nothing.`,
    readFiles: (files, directory) =>
      `Read ${count(files)} log files from ${directory}, in name order, as one bill. Every figure below covers all of them.`,
    noLogsInDirectory: (directory, extensions) =>
      `No usage logs in "${directory}". Looked for files ending in ${extensions}. A directory with nothing readable in it is an error rather than an empty report, which would read as "you spent nothing".`,
    sessionCostTail: (ratio) =>
      `The 95th percentile is ${ratio}x the median there: most conversations are cheap and a few are not, which is a tail a quota can catch. Where median and p95 sit close together the workload is simply expensive and there is no tail to hunt.`,
    sessionSpendOnly: (sessions, max) =>
      `${sessions} ${sessions === '1' ? 'conversation' : 'conversations'} in this log; the most expensive cost ${max}. Too few per workload for a percentile — a maximum is a fact at any count, and it is the figure --max-session-usd judges.`,
    waiveActive: (gate, reason, until, daysLeft) =>
      `WAIVED — the ${gate} failure above is on the record and silenced until ${until} (${daysLeft} days left): "${reason}". The bill still counts it; only the exit code is quiet, and the day the waiver expires this gate fails again.`,
    waiveExpired: (gate, until, reason) =>
      `The waiver on ${gate} expired on ${until} and no longer silences anything. It was written for: "${reason}". Renew it with a new date and a current reason, or fix what it was covering — an expired waiver left in place is a finding deleted with extra steps.`,
    summaryNoComparison: () =>
      'No previous log was given, so nothing here says whether the bill moved — a summary without a comparison states the bill, not its stability.',
    summaryFooter: () =>
      'The short form: what changed and the largest lever, nothing else. Run trazum profile for the full report — every figure here comes from it.',
    gateLargest: (label, model, usd, share) =>
      `Most of it is ${label} on ${model}: ${usd}, ${share} of the bill. That is where the money is, not necessarily where the fix is.`,
    gateLever: (label, action, saving, overage, covers) =>
      `The largest lever the report priced would save ${saving} on ${label} by ${action} — ${covers ? `enough to cover the ${overage} this is over by` : `short of the ${overage} this is over by, so it is part of the answer rather than all of it`}. Whether that is the right call for this workload is yours to judge; the figure is arithmetic, not advice.`,
    gateLeverRoute: (model) => `moving it to ${model}`,
    gateLeverBatch: () => 'sending it through the Batch API',
    gateLeverBoth: (model) => `moving it to ${model} and sending it through the Batch API`,
    gateMarginTight: (margin, room) =>
      `Passed with ${margin} of the budget left — ${room}. Under a tenth is close enough that an ordinary week crosses it; a pass this tight is worth knowing about before it becomes a failure.`,
    maxGrowthCoverageLost: (fields, was, now) =>
      `FAILED — this log stopped recording ${fields} (${was} of records before, ${now} now), so the comparison cannot be made. That is not a pass: a bill whose growth nobody could measure is not a bill that stayed flat, and every finding that needed the field went quiet for a reason that has nothing to do with spend.`,
    coverageField: (field) =>
      ({ label: 'label', session: 'session', ts: 'timestamp', stopReason: 'stop reason' })[field] ?? field,
    coverageSilenced: (field) =>
      ({
        label: 'Gone quiet with it: per-workload spend, the drill-down, and levers that describe a decision rather than a mixture.',
        session: 'Gone quiet with it: conversation growth, per-conversation cost, repeated turns, truncation retries and the cache-TTL fit.',
        ts: 'Gone quiet with it: the period, the per-day and per-hour shape, the model mix drift, and the cache-TTL question entirely.',
        stopReason: 'Gone quiet with it: answers cut off at max_tokens, and the retries billed after them.',
      })[field] ?? '',
    coverageDrift: (field, was, now) =>
      `Coverage moved: ${field} was on ${was} of records and is now on ${now}.`,
    coverageDriftWhy: () =>
      'A field the log stopped recording is not a finding that got fixed — every finding that needed it has gone quiet for a reason that has nothing to do with the bill. Reported from a 20-point move in either direction; a field that appeared means this report can see what the previous one could not.',
    againstOverlap: (from, to) =>
      `These two logs both cover ${from} → ${to}, so some of the same calls sit on both sides of this subtraction and part of the change is the same money counted twice. Compare periods that do not overlap — or window both logs with --since/--until.`,
    windowLine: (since, until) =>
      `Filtered to --since ${since} --until ${until}. Everything below describes this window, not the whole log; a bare date means the whole of that UTC day.`,
    windowUndated: (calls) =>
      `${count(calls)} ${calls === 1 ? 'call carries' : 'calls carry'} no timestamp and cannot be placed inside or outside this window, so ${calls === 1 ? 'it was' : 'they were'} left out. Their spend is in the log and not in this report — the window's figures are a floor on the period.`,
    windowRelative: () =>
      'That window is relative to this machine\'s clock, not to the log\'s last record — a log exported a month ago will answer "the last 7 days" with nothing.',
    windowRelativeEmpty: () =>
      'A relative window is measured from this machine\'s clock: if this log was exported earlier, ask for the dates it covers instead.',
    windowNeedsClock: () =>
      'No record in this log carries a timestamp, so --since/--until have nothing to filter by. A time window over a clockless log would gate nothing, which is not an answer. Add "ts" to the records — the recipe in the README shows where.',
    windowMatchesNothing: (from, to) =>
      `No record falls inside this window. The log covers ${from} → ${to}. A window matching nothing must not become a $0 report — under --max-usd it would pass a budget gate over a period the log does not cover.`,
    sinceAfterUntil: () =>
      '--since is at or after --until, so the window contains no time at all. Check the two dates.',
    badWhen: (flag, value) =>
      `--${flag} could not read "${value}". It takes a UTC day (2026-08-14) or a full ISO 8601 timestamp (2026-08-14T09:30:00Z).`,
    singleTurnCeiling: (label, model, single, sessions, usd) =>
      `${label} on ${model}: ${single} of ${sessions} conversations ended after their first turn, and their cache writes — ${usd} — paid for reuse their own conversation never made. Another conversation sharing the same prefix within the TTL could have read them; the log cannot see whose write a read hit, so that figure is a ceiling on the waste, not a bill.`,
    singleTurnConfirmed: (label, model, single, sessions, usd) =>
      `${label} on ${model}: ${single} of ${sessions} conversations ended after their first turn and spent ${usd} writing a cache that nothing in this log ever read. Within the conversation, across conversations — no read anywhere, so those writes bought nothing. Caching a one-shot call is pure write premium; stop marking these calls with cache_control.`,
  },

  route: {
    noTarget: () =>
      'Point this at a usage log and a prompt: trazum route usage.jsonl --prompt-file prompts/support.txt --cases cases.txt --yes. It finds the slice worth the most, then measures whether the cheaper model still does the job. The flag is --prompt-file and not --prompt, because --prompt names a marked prompt inside a source file everywhere else in this tool.',
    needsPrompt: () =>
      '--prompt and --cases are both required. The log says which route is worth money; only the prompt and the cases can say whether it works.',
    labelNotFound: (label, available) =>
      `No call in this log carries the label "${label}". The labels here are: ${available}.`,
    noRoute: () =>
      'No route on this log clears 1% of the bill. These calls are already on the cheapest model of their family, or the catalogue has nothing below them.',
    picked: (label, model, candidate, usd, pct) =>
      `${label} on ${model} → ${candidate}, worth ${usd} of this bill (${pct}).`,
    willSpend: (calls, model, candidate) =>
      `This will make ${count(calls)} provider calls: two per case on ${model} to measure its own variance, one per case on ${candidate}. Nothing has been spent yet — add --yes to run it.`,
    dryRun: () => 'Nothing was called.',
    running: (cases) => `Running ${count(cases)} cases...`,
    agreement: (cross, self) =>
      `The cheaper model agrees with the original ${cross} of the time. The original agrees with itself ${self} of the time — that is the yardstick, not 100%.`,
    holds: (usd) =>
      `HOLDS — the difference is inside the original model's own noise. On this bill that route is worth ${usd}.`,
    diverges: (usd) =>
      `DIVERGES — the cheaper model gives materially different answers. The ${usd} is real and so is the change in behaviour; this one is not free money.`,
    inconclusive: () =>
      'INCONCLUSIVE — the original model was too inconsistent with itself on these cases to judge anything against. Add cases, or pick ones with less room for the model to wander.',
    unlabelledSlice: () =>
      'These calls carry no label, so Trazum cannot tell whether they are all this prompt. If they are not, the figure above covers calls this measurement never touched — add "label" to the record and the slice becomes one workload, which is what makes the number attributable.',
    yours: () =>
      'Agreement is not correctness. This measures whether the answers moved, not whether they were ever right — the decision is still yours.',
  },

  baseline: {
    recorded: (path, files, tokens) =>
      `Recorded ${files} prompts, ${tokens} tokens, to ${path}. Commit it — the gate compares the tree against what is committed.`,
    recordedMoney: (monthly, model, calls) =>
      `That is ${monthly} per month with ${model} at ${calls} calls. Reported, not gated on: thresholds are in tokens, so a repriced model never fails a build on its own.`,
    heading: () => 'Against the baseline',
    unchanged: (tokens) => `unchanged at ${tokens} tokens`,
    grew: (delta, pct, tokens) => `grew by ${delta} tokens (${pct}) to ${tokens}`,
    shrank: (delta, pct, tokens) => `shrank by ${delta} tokens (${pct}) to ${tokens}`,
    entry: (path, before, after, delta) => `${path}  ${before} \u2192 ${after}  (${delta})`,
    addedHeading: (count) => `New since the baseline (${count})`,
    removedHeading: (count) => `Gone since the baseline (${count})`,
    grownHeading: (count) => `Grew (${count})`,
    breachTokens: (actual, limit) => `growth of ${actual} tokens is over the limit of ${limit}`,
    breachPct: (actual, limit) => `growth of ${actual} is over the limit of ${limit}`,
    reRecord: (path) =>
      `If the growth is intended, re-record with "trazum baseline" and commit ${path}.`,
    money: (before, after, delta) => `Monthly cost ${before} \u2192 ${after} (${delta})`,
    moneyIncomparableScenario: () =>
      'The usage scenario changed since the baseline was recorded, so the two monthly figures are not the same measurement. The token comparison is unaffected.',
    moneyIncomparablePricing: (was, now) =>
      `Prices were reviewed ${was} when the baseline was recorded and ${now} now, so the monthly figures are not the same measurement. The token comparison is unaffected.`,
  },
};
