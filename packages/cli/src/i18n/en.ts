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
  trazum init [dir] [--dry-run | --yes]
  trazum optimize <file|-> [options]
  trazum check <file|dir|-> --max-tokens <n> [options]
  trazum baseline [dir] [options]
  trazum eval <file> --cases <file> [options]
  trazum eval <file> --cases <file> --export promptfoo -o suite.json
  trazum route <log.jsonl> --prompt-file <file> --cases <file> --yes
  trazum plan <log.jsonl|dir> [options]
  trazum verify <plan.json> --against <newer.jsonl|dir> [options]
  trazum profile <log.jsonl|dir> [options]
  trazum history <dir-of-stored-reports> [options]
  trazum connect <provider> [options]
  trazum store [--prune] [options]
  trazum watch [--once | --interval 15m] [options]
  trazum serve [--port <n> | --socket <path>]
  trazum diff <before> <after> [options]
  trazum diff --all <dir> <dir> [options]
  trazum rank <dir> [options]
  trazum doctor [dir] [options]
  trazum blame <file> [options]
  trazum prune <file> --cases <file> --yes
  trazum where [file]
  trazum conform <file|-> [--contract <name>]
  trazum schema <contract>
  trazum rollup <document...|dir> [--json] [--html-out <file>]
  trazum position <usage.jsonl>
  trazum pulse [--max-stale-hours <n>]
  trazum bench [--workload <id>] [--record <file>] [--against <file> --max-ratio <n>] [--json]
  trazum write [--answers <file>] [--json] [-o <file>]
  trazum models
  trazum rules [--measure <dir>] [--level <safe|aggressive>]
  trazum gateway <provider> --on-cannot-tell <fail-open|fail-closed>
  trazum experiment <log> --a <label> --b <label> --min-outcomes <n>
  trazum quality <log> --label <name> --at <iso> [--gate]
  trazum semantic <prompt> [--yes]
  trazum commitment <log> --floor <usd> --discount <pct> [--months 12]
  trazum report <log> --year <yyyy>
  trazum owners <log>
  trazum ladder <log>
  trazum feedback
  trazum --version

${bold('OPTIONS FOR init')}
  --dry-run                   Print the config it would write and write nothing.
  --yes                       Replace a trazum.config.json that is already there.
                              Without it an existing config is left alone.
  --json                      The proposal as data, including every key it
                              declined and why. Writes nothing.

  The first five minutes: finds your prompts, reads your code for which provider
  it calls, finds a usage log or a credential for one, and writes a config out of
  what it can actually justify. Then it prints the single most valuable thing it
  found, arithmetic first.

  It never invents a threshold. A budget is a policy, so init hands you the
  measured figure and leaves the limit to you — a generated config full of
  guessed numbers is one nobody trusts.

${bold('OPTIONS FOR conform')}
  --contract <name>           Check against a named contract instead of
                              detecting one: ${d.contracts.join(', ')}.
  --json                      The report as data.

  Answers two questions and keeps them apart. Does this document conform —
  required fields, present and the right type, exits 1 when not. And what can a
  valid document of this shape not answer, with the field that would unlock
  each.

  The second never gates. Choosing not to log sessions is a decision, not a
  defect. See docs/format.md.

${bold('OPTIONS FOR rollup')}
  --json                      The roll-up document as data. See docs/format.md.
  --html-out <file>           Also write the roll-up as one self-contained HTML
                              file — the team-facing report, for whoever pays
                              the bill. Each contributor's gaps stay under that
                              contributor, and what no merge can measure is in
                              the caveat block, impossible to crop.

  Several people's bills, one roll-up. Each contributor runs
  \`trazum profile --json\` where their traffic already is; this merges the
  documents. A format and a merge, not a service: nothing is uploaded and there
  is no account — the documents arrive however your team already moves files.

  Most of the output is what the merge could not do. Each contributor's own
  gaps stay with that contributor rather than being averaged into one figure,
  the findings that need individual calls are named instead of dropped, and
  every roll-up of more than one document says that overlap between
  contributors is unmeasurable — two people exporting the same traffic double
  the bill and no merge of summaries can see it.

  Exits 1 when a contribution was handed over and could not be merged.

${bold('OPTIONS FOR write')}
  --answers <file>            A JSON object of slot ids and answers. Without it,
                              the questions are asked one at a time; an empty
                              line declines one, which is an answer.
  --json                      The prompt-draft document, refusals included.
  -o, --out <file>            Where to write the prompt. Defaults to stdout,
                              with everything else on stderr.
  --calls <n>                 Calls per month, for the estimate.
  --avg-output <n>            Average output tokens per call, for the estimate.

${bold('OPTIONS FOR pulse')}
  --max-stale-hours <n>       Exit 1 when something that runs here has not run
                              in over n hours. Without it, the ages are
                              reported and nothing is judged.
  --json                      The report as data.

  Did the things that are supposed to run, run? \`watch --once\` is built for a
  scheduler, and its state file is read by exactly one thing — the next cycle.
  So nothing could tell you the watcher had stopped, because the thing that
  would tell you was the thing that stopped.

  It runs nothing and hosts nothing. Something has to notice, and the something
  is your CI: a step running this on the schedule you already have turns a dead
  cron into a red build, without Trazum holding anybody's metrics.

  Never gates on a first run that never happened — that has no cadence to be
  late against — and never on how far the measurements reach, which is a
  provider reporting on its own schedule rather than a job that failed.

${bold('OPTIONS FOR bench')}
  --workload <id>             Run one standard workload instead of all of them.
                              An unknown id is refused with the known ones named.
  --record <file>             Also write the measured ratios as a baseline, to
                              commit. The file --against reads.
  --against <file>            Judge this run's ratios against a recorded
                              baseline. Exits 1 when any measured workload is
                              past its recorded ratio times --max-ratio.
  --max-ratio <n>             The stated factor, at least 1. Required with
                              --against: how much regression is too much is a
                              policy, and this tool does not write yours.
  --json                      The measurements as data. The shape never changes
                              with the gate flags — a verdict is the exit code
                              and sentences on stderr, the way check gates.

  Measures this machine: the standard workloads, one shot each, wall time and
  peak RSS. The wall clock is for a person with a change in hand; the gate
  holds the ratio of workload to an in-process calibration loop, because a CI
  runner lies about wall time to both by the same amount and the lie cancels
  out. Each workload runs in its own child process, so a peak is that
  workload's own; the inputs are generated, deterministic and never written to
  your project.

${bold('OPTIONS FOR rules')}
  --measure <dir>             Measure what each rule actually recovers over the
                              prompts in that directory, instead of listing what
                              each one does.
  --level <safe|aggressive>   Which rules to measure. Default: safe.
  --json                      The measurement as data.

  Without --measure it lists the rules and what each is for. With it, the
  optimiser is run once per rule alone and once per rule removed, and both
  figures are printed: where two rules find the same tokens they diverge, and
  either one on its own would be wrong in a different direction.

  The floor is separated out. The optimiser normalises whitespace whether or not
  a rule is enabled, and crediting that to the rules is how a headline
  percentage survives on a corpus where the rules recover nothing.

  "Inert" is always said about the corpus. A rule that finds nothing in these
  files has not been shown to find nothing anywhere.

${bold('OPTIONS FOR feedback')}
  (none)

  Prints where to report a wrong optimisation, a bug, a question or a security
  problem — and a blank issue with the version, runtime and platform already
  filled in, printed in full first so nothing travels you have not read.

  It sends nothing. Trazum has no telemetry: no ping, no install hook, no
  anonymous counter, and a test fails the build if this command ever reaches
  the network.

${bold('OPTIONS FOR gateway')}
  --on-cannot-tell <policy>   Required, no default: fail-open or fail-closed.
                              What happens when the gateway cannot judge a call
                              — no budget, nothing measured, an unpriced model.
  --port <n> | --socket <p>   Where to listen. Loopback only, always.
  --log <usage.jsonl>         The usage log the limits policy is measured
                              against, read once at start — same flag as
                              serve's, same reason: label and session spend
                              live in a usage log, not in the store.

  Stands between your SDK and the provider, speaking their wire format, so no
  code changes. Usage is measured from the provider's own response as it comes
  back — no export, no connector lag, no missing day.

  It refuses and never substitutes: a call over budget gets HTTP 402 with the
  cheaper alternatives named. Substitution happens only where you wrote it down
  in spend.substitute, with your reason, and every substituted call is marked.

  Your credential is forwarded untouched and never read. See docs/gateway.md.

${bold('OPTIONS FOR experiment')}
  --a <label>, --b <label>    The two workloads to compare.
  --min-outcomes <n>          Required: how many outcomes each arm must record
                              before the result may be read. A stopping rule
                              declared after looking at the numbers is not a
                              stopping rule, and the report says whether it was
                              honoured.

  Judges recorded outcomes and cost together. Three-valued: A wins, B wins, or
  not separable — with the number of outcomes per arm that would settle it, so
  "run it longer" is an instruction rather than a shrug. Nothing is promoted.

${bold('OPTIONS FOR quality')}
  --label <name>              The workload to judge. Required: a mixture would
                              average a regression away.
  --at <iso>                  When the change landed. Required: without a
                              boundary there is nothing to compare across, and
                              picking one would be this tool choosing which
                              change to blame.
  --gate                      Exit 1 on a measured drop, 2 on "cannot tell".
                              Three outcomes, never two.

  A before-and-after rather than an experiment, so it reports "cannot tell"
  whenever the model mix, the call volume or the outcome coverage moved across
  the boundary — the prompt is not the only variable and it says so.

${bold('OPTIONS FOR semantic')}
  --yes                       Required to send anything. Without it the command
                              prints what the call would cost and stops.
  --model <id>                Which model to ask. Priced from the catalogue.

  Finds what a dictionary cannot: the same rule taught twice in different
  words, an instruction restated far away, a policy a later clause contradicts.
  Every quoted passage is checked character for character against the prompt,
  pairs the rules engine already catches are dropped, and every token figure is
  counted rather than believed. Optional, and always will be.

${bold('OPTIONS FOR commitment')}
  --floor <usd>               What you commit to spending each month, after
                              the discount. Required.
  --discount <pct>            What you get off list. 20 and 0.2 both work.
  --months <n>                How long the deal runs. Defaults to 12.

  Replays measured whole months against the deal's terms. Both directions are
  priced: the months that cleared the floor, and what the floor cost in the
  months that fell short — kept as its own figure, because netted into the
  saving it disappears. An as-if calculation about the past, never a forecast.

${bold('OPTIONS FOR report')}
  --year <yyyy>               Required. Which year to assemble.
  --json                      The record as data.

  Everything comes from the store and the plans you already keep — nothing is
  computed that cannot be checked against a document that already exists.
  Months with no record are named rather than filled, promises are kept in
  three outcomes rather than two, and the report lists what it cannot say.

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

  Runs both prompt versions over your cases and reports whether the
  optimisation changed the answers. Costs THREE provider calls per case: the
  original twice, to measure the model's own run-to-run variance, and the
  optimised once. That baseline is the yardstick — without it, a divergence
  figure means nothing. Exits with code 1 when the answers genuinely diverge.

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
  --exact-tokens              Count tokens with Anthropic's endpoint, not the heuristic.
                              Claude models only: it is Claude's tokenizer.
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
  --max-input <chars>         Raise (or lower) the prompt-input ceiling, per run.
                              Above it a prompt door refuses with the size and
                              the limit named rather than grinding. Logs and
                              documents are never held to it.
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

${bold('OPTIONS FOR ladder')}
  --since <when>              Read only calls in this window. A UTC day
  --until <when>              (2026-08-14), a full ISO 8601 timestamp, a
                              relative window (7d, 24h) or "now". Calls with no
                              "ts" cannot be placed and are left out — counted
                              out loud, never dropped silently.
  --label <name>              Judge one workload's ladder rather than the whole
                              log. A label that matches nothing is an error
                              naming the labels that exist.

${bold('OPTIONS FOR owners')}
  --since <when>              Read only calls in this window, in the same forms
  --until <when>              the other commands take. What no owner claims is
                              reported as unallocated and never spread across
                              the ones that are known.

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
  --html-out <file>           Also write the report as one self-contained HTML
                              file — the one to email to whoever pays the bill.
                              Same figures as --json, caveats rendered as
                              prominently as the totals they qualify.
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

${bold('OPTIONS FOR plan')}
  --min-usd <n>               Leave out actions worth less than n dollars. How
                              many were left out is stated, never silent.
  -o, --out <file>            Save the plan as dated JSON — the file
                              "trazum verify" will later hold it to.
  --markdown-out <file>       Also write the plan as Markdown, for a CI job
                              summary or a pull request comment.
  --pricing <file>            Local price overlay, as everywhere else.
  --json                      The plan as data.

  Reads a usage log and turns the report's findings into a ranked plan: route
  this, batch that, fix the truncation pair, look at the cache. The money is
  composed correctly — route and batch on the same slice arrive combined,
  never summed — and every action names what the log cannot confirm, because
  a plan that hides its assumptions is advice pretending to be arithmetic.
  Projected savings and money already spent are separate totals throughout.

${bold('OPTIONS FOR serve')}
  --port <n>                  Port on 127.0.0.1. Default: 7317.
  --socket <path>             Listen on a Unix socket instead of a port.
  --log <usage.jsonl>         The usage log the limits policy is measured
                              against, read once at start. Per-label and
                              per-session spend live in a usage log, not in
                              the store; without this, every ceiling in
                              "limits" answers cannot-tell.

  Answers the two questions that matter at call time — what will this cost,
  and is there budget left — in single-digit milliseconds, so an agent or a
  wrapper can ask before it spends rather than reading a report afterwards.

  POST /cost with {"model": "...", "inputTokens": n, "outputTokens": n};
  GET /health says it is up. Every answer keeps the measured half and the
  estimated half apart: the budget consumed comes from the provider's billed
  counts, the cost of the call being asked about is an estimate of something
  that has not happened, and the verdict says which of the two it rests on.

  It listens on 127.0.0.1 and nowhere else, and there is no flag to change
  that: a cost oracle on a network interface holds a company's spend, its
  model mix and its budgets, and answers whoever asks. There is no auth for
  the same reason there is no --host — a token checked over loopback is
  theatre, and the honest posture is a surface small enough not to need one.

  With no store and no budget it still prices the call and says the budget
  half is unknown. Offline is a mode, not a failure.

${bold('OPTIONS FOR watch')}
  --once                      One cycle: measure, keep, evaluate, emit,
                              remember. What a cron entry runs. The default.
  --interval <n>m|h           Stay in the foreground and repeat. Minimum five
                              minutes: usage APIs are rate limited, and a tight
                              loop is a way to get your own key throttled.
  --webhook <url>             POST the crossings somewhere. https only, except
                              loopback; a URL carrying credentials is refused,
                              because URLs end up in logs and shell history.
  --payload <file>            Evaluate a usage payload you already have,
                              instead of the store.
  --json                      The cycle as data: crossings, abstentions, gap.

  Evaluates the spend gates from your config — maxUsd, maxDayUsd,
  maxCacheLossUsd — against what has been measured, and tells you the
  afternoon it happens rather than three weeks later. Exits 1 when something
  crossed, so cron mails it and CI fails.

  An alert fires on a measured crossing and never on a projection: "you have
  spent $412 of a $400 budget" is a fact and "you will exceed" is a forecast,
  which this tool does not make at any window length. A day still being
  measured is reported as not yet judgeable rather than passed — but a day
  already over budget fires whatever the hour, because it does not become less
  over budget at midnight.

  A restart does not re-alert on a crossing already reported, and names the
  stretch it was not watching, because a watcher that resumes in silence
  implies coverage it did not have.

${bold('OPTIONS FOR store')}
  --prune                     Drop measurements older than the retention
                              policy, and compact the append log to what the
                              store already resolves to. Says what went.
  --keep <n>d                 Retention for this run, when the config has none.
  --dry-run                   With --prune: say what would go, and delete
                              nothing.
  --json                      The inventory as data.

  Says what the local store holds: how many measurements, over what span, per
  provider, and what a prune would take. The store keeps aggregates and
  billing fields — never prompt text, never completion text, never a
  credential — so it is a file a team can back up without a privacy review.

  Pruning is the one operation here that destroys something, so it refuses to
  run without a retention policy: set "store": {"keepDays": 90} in the config
  or pass --keep. Deleting measurements on a policy nobody wrote down is not a
  default anybody should get by accident.

${bold('OPTIONS FOR connect')}
  --since <when>              The window to pull. A UTC day, an ISO timestamp,
  --until <when>              a relative window (7d, 24h) or "now". Defaults to
                              the last 30 days.
  --dry-run                   Say what would be called and which environment
                              variable the key would come from. Sends nothing
                              and needs no credential.
  --payload <file>            Price a usage payload you already have, instead of
                              pulling one. No credential, no network — the same
                              arithmetic on the same shape.
  --store                     Keep what was pulled in the local store, so the
                              next run does not download it again and "trazum
                              history --store" has a series.
  -o, --out <file>            Save the priced report as JSON.
  --markdown-out <file>       Also write it as Markdown, for a CI job summary.
  --json                      The report as data.

  Reads your bill from the provider's usage API, so nothing has to be exported
  by hand. The credential is read from the environment at the moment of the
  call and never stored, never printed and never written to a config: set
  TRAZUM_ANTHROPIC_ADMIN_KEY or TRAZUM_OPENAI_ADMIN_KEY. Each provider needs
  the narrowest key that can read a usage report, and an ordinary API key
  cannot.

  These APIs serve sums over a window, not one row per call, so a connected
  report is a restricted one and says so: the totals, the model split, the day
  series and the cache verdict are all available, and the per-call findings —
  input shapes, truncation retries, conversations, context pressure — are
  listed as unavailable with what would unlock them. A rate limit, a page cap
  or an expired cursor returns what arrived with the gap named, never a total
  that quietly describes less traffic than you asked about.

${bold('OPTIONS FOR history')}
  --store                     Build the series from the local store instead of
                              a directory of stored reports. Bucketed sources
                              carry no label, so the label series is absent and
                              said to be — the model-share and cache-share
                              series are what a series exists for, and both
                              work.
  --markdown-out <file>       Also write the series as Markdown, for a CI job
                              summary or a pull request comment.
  --json                      The history as data.

  Takes a directory of stored reports — the --json documents profile already
  writes — plus any saved plans beside them, and builds the series no
  pairwise comparison can see: a workload climbing a little every period, a
  model share rising since a date, a cache share decaying slowly enough that
  no single week's report called it a finding, and the same action planned
  again and again with nothing executing it. Derived from stored reports,
  never re-parsed logs, so a year of JSON is enough and the raw logs can be
  thrown away. Shapes are named; nothing is forecast.

${bold('OPTIONS FOR verify')}
  --against <log|dir>         The newer usage log the plan is held to. Required.
  --gate                      Exit 1 when an action did not produce what the
                              plan promised, or its fields stopped being
                              recorded — "not recorded" must not read as
                              "fixed". A vanished workload fails nothing.
  --markdown-out <file>       Also write the verdicts as Markdown, for a CI
                              job summary or a pull request comment.
  --pricing <file>            Local price overlay, as everywhere else.
  --json                      The verification as data.

  Holds a saved plan to the log that came after it, with three outcomes and
  never two: the change arrived, it did not, or it cannot be told — because
  the workload vanished, the fields the detection needs stopped being
  recorded, or tokens cannot say which tier billed them. Differences carry
  the world's measured movement (calls, output per call) from the plan's own
  baseline, and a plan priced under a different catalogue says so rather
  than blaming a team for a saving that arithmetic revoked.

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

    level, locale, disable, maxGrowth, extensions, ignore
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
    limits    { "dayUsd": 25, "sessionUsd": 1.5, "byLabel": { "chat": 5 } } —
              the enforcement policy: USD ceilings judged before a call is
              made, at whichever door it arrives (the gateway's 402, "serve",
              spend_guard over MCP). Separate from "spend" because a report
              gate and a call refusal are read at different moments; every
              ceiling must be a positive number, because a ceiling of 0 is an
              outage written as a policy
    owners    { "patterns": { "payments": ["billing-*"] },
              "shared": { "search": { "payments": 0.6, "support": 0.4 } },
              "budgets": { "payments": 400 } } — whose budget each workload
              lands on. Spend matching no owner is its own line and is NEVER
              divided between the others; a shared split must sum to 1, and the
              rule travels with the report so the argument is about the rule
    ladders   { "support": { "tiers": ["claude-haiku-4-5", "claude-opus-5"],
              "escalateOn": ["escalated"] } } — cheap model first, escalate a
              recorded failure to a dearer one. Both fields required.
              "trazum ladder <log>" prints the break-even escalation rate
              beside the measured one: an escalation pays twice, so above that
              rate the ladder costs more than never having built it
    outcomes  { "values": ["resolved", "escalated"], "success": ["resolved"] } —
              your own vocabulary for what happened, and which of it counts as
              a win. Both required: which words mean success is a judgement
              about your product rather than your bill, and this tool has no
              standing to make it. Use [] if none of them are successes. A
              value in a log that "values" never declares is named as
              undeclared, never counted as a failure
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
    inputTooLarge: (source, size, limit) =>
      `${source} is ${count(size)} characters, past the ${count(limit)}-character ceiling for a prompt. Raise it deliberately with --max-input <chars> if this input really is one.`,
    badMaxInput: (raw) => `--max-input must be a positive number of characters (received: "${raw}").`,
    fractionFlag: (name, raw) =>
      `--${name} is a fraction between 0 and 1 (received: ${raw}). The config refuses the same value the same way.`,
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
    /**
     * Named, and told what it cannot do rather than merely that it will not.
     *
     * The alternative on offer has to be somebody else's tooling, because
     * Trazum has none for this family — saying so is the whole refusal. A
     * refusal never arrives bare.
     */
    exactTokensWrongFamily: (model, provider) =>
      `--exact-tokens counts with Anthropic's endpoint, which counts Claude's tokenizer${
        provider === null
          ? `, and the catalogue records no provider for "${model}" — so which tokenizer it uses is not something Trazum knows`
          : `, and ${model} is a model from ${provider}`
      }. Counting it there would either be refused upstream or return a number for a different tokenizer, and this tool will not label that exact. Drop --exact-tokens for the estimate — which is honest about being one — or count with ${
        provider === null ? "that model's" : provider + "'s"
      } own tooling.`,
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
    dictionaryUnreviewed: (languages) =>
      `  Of those, ${languages} carry entries nobody here reads: written by the same `
      + 'process that wrote the rules, never agreed by a speaker of the language.',
    dictionaryAppliedUnreviewed: (language) =>
      `  These changes came from the ${language} dictionary, which nobody here reads. `
      + 'Its entries were written by the same process that wrote the rules and never '
      + 'agreed by a speaker — read the diff before trusting it.',
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

  init: {
    heading: () => 'What is here',
    host: (name) => `Running inside ${name}.`,
    prompts: (count) =>
      `${count} prompt ${count === 1 ? 'file' : 'files'} found.`,
    noPrompts: () =>
      'No prompt files found. Directory mode reads .txt, .md, .prompt and .tmpl by default — set "extensions" if yours are named otherwise.',
    sourcesTruncated: (cap) =>
      `Stopped after ${cap} source files, so a provider named further down was not seen.`,
    usageFound: (kind, where) =>
      kind === 'connector-credential'
        ? `Usage can be pulled: a credential is in ${where}. Run trazum connect.`
        : kind === 'store'
          ? `A local store of past measurements is in ${where}.`
          : `Usage log found: ${where}.`,
    noUsage: () =>
      'No usage found. Point trazum at a log (trazum profile <log.jsonl>) or pull one (trazum connect anthropic) — every money figure in this tool comes from one.',
    usageUnreadable: (where, because) =>
      `${where} is there and could not be read: ${because}. That is a different problem from having no usage, and it is the one to fix first.`,

    configHeading: () => 'What the config would say',
    nothingJustified: () =>
      'Nothing. Every key below needs evidence this run did not find, and a guessed config is worse than none.',
    whyLocale: (locale) => `your environment asks for ${locale}`,
    whyExtensions: (extensions, files) => `${files} prompt files use ${extensions}`,
    whyModelMeasured: (model, sharePct) => `${sharePct}% of the measured bill went to ${model}`,
    whyModelSource: (model, file, line) => `${file}:${line} names ${model}`,
    whyCalls: (perMonth, calls, days) =>
      `${calls} calls over ${days} days, stated as ${perMonth} a month`,
    whyOutput: (average, outputTokens, calls) =>
      `${outputTokens} output tokens over ${calls} calls averages ${average}`,
    whyCache: (rate, cacheReadTokens, inputTokens) =>
      `${cacheReadTokens} cached against ${inputTokens} fresh input is a hit rate of ${rate}`,

    noModelEvidence: () => 'nothing measured or written in the source names one model',
    modelConflict: (files) => `these files name more than one provider: ${files}`,
    modelProviderOnly: (provider, file) =>
      `${file} names ${provider} and no model — a provider default would read as your decision six weeks from now`,
    nothingMeasured: () => 'nothing has been measured yet',
    windowTooShort: (days, minimum) =>
      `${days} days measured; ${minimum} are needed before that is a monthly rate rather than a forecast`,
    undatedCalls: (undated, calls) =>
      `${undated} of ${calls} calls carry no timestamp, so they cannot be placed inside the window a rate would divide by`,
    cacheNotRecorded: () =>
      'this log has no cache columns at all, which is not the same as a hit rate of zero',
    batchOnlyYouKnow: () =>
      'whether the work can wait for a batch window is a product decision, and no log records it',
    labelsUnprovable: (labels) =>
      `${labels} ${labels === 1 ? 'label' : 'labels'} in the log, and nothing here proves which prompt file sends which`,
    budgetIsPolicy: () => 'a budget is a policy, and there is no measured figure to write one against yet',
    budgetIsPolicyMeasured: (usd, days) =>
      `a budget is a policy, so it is yours to set — the measured figure is $${usd} over ${days} days`,

    findingHeading: () => 'The most valuable thing found',
    noFinding: (why) =>
      why === 'nothing-measured'
        ? 'Nothing, because nothing has been measured. Every figure this tool prints as money comes from a usage log.'
        : why === 'nothing-could-be-priced'
          ? 'Nothing: the log was read, and no model in it is in the price catalogue. Run trazum models to see what is priced.'
          : 'Nothing worth a line: no single slice of this bill can be moved by more than one per cent of it.',
    findingCalls: (calls, label, model, days) =>
      `${calls} calls labelled "${label}" went to ${model} over ${days} days.`,
    findingSpent: (usd) => `They cost $${usd}.`,
    findingRoute: (model) => `The same work fits ${model}, which is cheaper per token.`,
    findingBatch: () => 'The Batch API halves both halves of the bill, for work that can wait.',
    findingTotal: (usd, days) => `Together: $${usd} over the same ${days} days.`,
    findingNext: () =>
      'trazum plan <your log> ranks every action, not just this one. If a figure here looks wrong, trazum feedback says where to tell us — it sends nothing on its own.',

    wouldOverwrite: (keys) => `This replaces keys you already set: ${keys}. Pass --yes to write anyway.`,
    nothingToWrite: () => 'No config written: nothing above could be justified from what is here.',
    wouldWrite: (path) => `Would write ${path}:`,
    wrote: (path) => `Written to ${path}.`,
    existingRefused: (path) =>
      `${path} already exists and was left alone. Pass --dry-run to see what would go in it, or --yes to replace it.`,
    existingUnparseable: (path) =>
      `${path} exists and could not be parsed, so nothing was written over it. Fix or move it first.`,
  },

  annual: {
    heading: (year) => `The year ${year}, from what was already written down`,
    needsYear: () => '--year is required, as four digits: trazum report <log> --year 2026.',
    spent: (usd, calls, months) => `${usd} across ${calls} calls, over ${months} recorded months.`,
    missing: (months) =>
      `No record at all for ${months}. Those months are named rather than filled: a year that quietly covers part of itself and prints an annual total is wrong by the rest and says nothing about it.`,
    promises: (planned, arrived, notArrived, cannotTell) =>
      `${planned} actions planned. ${arrived} arrived, ${notArrived} did not, and ${cannotTell} could not be judged. Three outcomes, never two \u2014 the third is the one an ordinary annual report folds into the flattering one.`,
    projected: (usd) => `The plans projected ${usd} of savings.`,
    noArrivedFigure: () =>
      'There is deliberately no figure beside it for what arrived. A verification says WHETHER each action landed; it has never carried a per-action dollar figure for the saving. Assembling one here would mean deciding which of several observed numbers is "the saving" \u2014 a judgement the verification refused to make, and exactly the annual-report arithmetic this document replaces.',
    outcomes: (recorded, parsed, unrecordedUsd) =>
      `${recorded} of ${parsed} calls recorded an outcome; ${unrecordedUsd} of the year\u2019s spend did not.`,
    noOutcomes: () =>
      'No outcome was recorded this year, so nothing here says what the money bought. That is not a success rate of zero \u2014 an uninstrumented year and a failing year are different sentences.',
    cannotSayHeading: () => 'What this record cannot say',
    cannotSay: (kind) =>
      kind === 'months-missing'
        ? 'what happened in the months with no record'
        : kind === 'nothing-was-planned'
          ? 'whether anything was promised, because no plan was made'
          : kind === 'nothing-was-verified'
            ? 'whether the promises were kept, because no plan was verified'
            : kind === 'some-promises-unjudgeable'
              ? 'whether some promises were kept \u2014 they could not be judged from the logs that exist'
              : kind === 'arrived-savings-not-quantified'
                ? 'how many dollars the kept promises were worth'
                : kind === 'no-outcomes-recorded'
                  ? 'what any of the money bought'
                  : 'what the uninstrumented share of the traffic did',
    noNewData: () =>
      'Every figure above comes from the store and the plans you already keep. Nothing was computed here that cannot be checked against a document that already exists \u2014 which is the only reason an annual report is worth trusting, since it is the document most likely to be quoted out of the room it was written in.',
  },

  commitment: {
    heading: (floor, discount, months) =>
      `A ${months}-month commitment: ${floor} a month at ${discount} off`,
    needsTerms: () =>
      '--floor and --discount are required, and --months defaults to 12. Take them from the contract the provider is offering you: the floor is what you commit to spending each month after the discount, and the discount is what you get off list.',
    asIf: () =>
      'This is what the deal WOULD HAVE done on the traffic you actually had. It is a measurement of the past, not a prediction \u2014 every month below happened.',
    columns: { month: 'month', list: 'list', paid: 'would pay', saving: 'saving' },
    net: (usd, months) => `Net over ${months} measured months: ${usd}.`,
    good: (usd) => `The months that cleared the floor saved ${usd}.`,
    lost: (usd, months) =>
      `${months} of them fell short, and the floor you would have paid for capacity nobody used comes to ${usd}. That figure is kept separate on purpose: netted into the line above it disappears, and the disappearing is what a vendor\u2019s slide relies on.`,
    noShortfall: () => 'No measured month would have fallen short of the floor.',
    breakEven: (usd) =>
      `Break-even is ${usd} of monthly spend. Below it you pay the floor for less usage than it buys; above it the saving grows.`,
    spread: (low, high, median) =>
      `Measured spread: ${low} to ${high}, median ${median}. That is the shortfall risk in the only form a log can state it \u2014 a count of real months and the range they covered, rather than a probability from a distribution nobody fitted.`,
    shortTerm: (covered, term) =>
      `This replays ${covered} months against a ${term}-month commitment. It is a real answer about ${covered} months and not about ${term}.`,
    cannotTell: (why, needed) =>
      why === 'no-history'
        ? 'Nothing to replay: this log has no whole months in it.'
        : `Cannot judge this from ${needed === '0' ? 'what exists' : `what exists \u2014 ${needed} more whole month(s) would settle it`}. A commitment is signed for a year, and an answer from one month is a year-long decision made on a fortnight of evidence.`,
    neverAForecast: () =>
      'Nothing here is annualised, extrapolated or fitted to a trend. If next quarter looks nothing like last quarter, this arithmetic says nothing about it \u2014 which is the honest limit of what a log can tell you about a contract.',
  },

  owners: {
    heading: () => 'Whose money',
    noOwners: () =>
      'No owners configured. Add "owners" to trazum.config.json to attribute spend, for example {"patterns": {"payments": ["billing-*"]}, "budgets": {"payments": 400}}.',
    columns: { owner: 'owner', spend: 'spend', budget: 'budget', calls: 'calls' },
    verdict: (kind) =>
      kind === 'over' ? 'over' : kind === 'within' ? 'within' : kind === 'not-measured' ? 'not measured' : '\u2014',
    unallocated: (usd, share, labels) =>
      `Unallocated: ${usd} (${share} of the bill), from ${labels}.`,
    neverSpread: () =>
      'It is not divided between the owners above, and it never will be. Spreading unattributed spend proportionally is the most common lie in cost reporting: it makes every line add up and every team\u2019s number wrong by an amount nobody can see \u2014 hardest on whoever instruments best, because their known spend is largest and they absorb the biggest share of somebody else\u2019s mystery. Claim it with a pattern.',
    nothingUnallocated: () => 'Every workload in this log has an owner.',
    sharedHeading: () => 'Shared, by a rule somebody wrote',
    sharedRule: (label, rule) => `${label}: ${rule}`,
    problemsHeading: () => 'This ownership config will not do what it looks like it does',
    problem: (kind, detail) =>
      kind === 'split-does-not-sum'
        ? `${detail} \u2014 a split that does not sum to 1 loses money or invents it, silently. That workload is left whole in the unallocated line until this is fixed.`
        : kind === 'split-names-unknown-owner'
          ? `${detail} names an owner that "owners.patterns" does not declare.`
          : kind === 'split-has-one-owner'
            ? `${detail} is "shared" with one owner \u2014 that is a pattern written the long way, and reading it as a share invites a second owner to be added without the first being adjusted.`
            : kind === 'negative-share'
              ? `${detail} has a negative share.`
              : `${detail} has a budget but no patterns, so nothing can ever land on it.`,
    notMeasured: (owner) =>
      `${owner} has a budget and no measured calls. That is NOT under budget \u2014 a team whose logs never arrived passes every budget it has, forever, and a green tick beside their name says the opposite of the truth.`,
  },

  semantic: {
    heading: (path) => `Semantic pass on ${path}`,
    willCost: (usd, input, output, model) =>
      `This will send the prompt to ${model}: about ${input} tokens in and ${output} out, roughly ${usd}. Estimated, not measured \u2014 a tool that spends your money to tell you how to spend less should be the first thing audited by its own arithmetic. Pass --yes to run it.`,
    needsYes: () => 'Nothing was sent. Add --yes once you have read the price above.',
    finding: (kind, because) =>
      `${kind === 'contradiction' ? 'Contradiction' : kind === 'restated-instruction' ? 'Restated' : 'Same thing, different words'}: ${because}`,
    span: (line, text) => `line ${line}: ${text}`,
    ceiling: (tokens) =>
      `At most ${tokens} tokens \u2014 a ceiling, not a saving. Merging these two means writing one passage that does the work of both, and nobody knows yet how long that is.`,
    noCeiling: () =>
      'No tokens attached. A contradiction is worth fixing because the prompt is wrong, not because it is long, and putting a figure on it would sell the wrong reason.',
    nothingFound: () => 'Nothing survived checking. That is a real answer.',
    rejected: (count) => `${count} proposals did not survive checking against the prompt.`,
    rejectedLine: (reason, span) =>
      reason === 'span-not-found'
        ? `paraphrased its own evidence: ${span}`
        : reason === 'already-detected'
          ? `already found without a model: ${span}`
          : reason === 'contradiction-of-a-copy'
            ? `called a near-copy a contradiction: ${span}`
            : reason === 'spans-identical' || reason === 'spans-overlap'
              ? `quoted the same passage twice: ${span}`
              : `covers ground an accepted finding covers: ${span}`,
    disposes: () =>
      'The model proposes and the deterministic layer disposes: every quoted passage is checked character for character against the prompt, pairs the rules engine already catches are dropped, and every token figure is counted here rather than believed.',
    optIn: () =>
      'This pass is optional and always will be. Trazum works with no key, no network and no model \u2014 that has been true since 0.1.0 and this does not change it.',
  },

  quality: {
    heading: (label) => `Quality across the change: ${label}`,
    needsLabel: () => 'Name the workload with --label: this compares one label before and after a change, and a mixture of workloads would average a regression away.',
    needsAt: () =>
      '--at is required: give the moment the change landed, as an ISO timestamp. Without it there is no boundary to compare across, and picking one from the log would be this tool choosing which change to blame.',
    sides: (beforeRate, afterRate, before, after) =>
      `before ${beforeRate} (${before} outcomes)   after ${afterRate} (${after} outcomes)`,
    dropped: (from, to, outcomes, cost) =>
      `The resolution rate moved from ${from} to ${to} on ${outcomes} measured outcomes, and this change ${cost}. Both halves are measured; neither is an estimate.`,
    held: (from, to, outcomes) =>
      `The resolution rate moved from ${from} to ${to} on ${outcomes} measured outcomes \u2014 up, measurably.`,
    cannotTell: (why, need) =>
      why === 'too-few-before'
        ? `Cannot tell: only ${need} outcomes before the change, and this gate needs 100 a side. It fails builds, so the threshold is not the one a rate uses elsewhere.`
        : why === 'too-few-after'
          ? `Cannot tell yet: only ${need} outcomes since the change, and this gate needs 100 a side. Run it again once the traffic has caught up.`
          : why === 'not-separable'
            ? 'Cannot tell: the rate did not measurably move. That is NOT the same as "it held" \u2014 a gate that spelled them the same way would pass a real regression it merely lacked the power to see.'
            : why === 'no-vocabulary'
              ? 'Cannot tell: "outcomes.success" declares nothing, so there is no resolution rate to compare.'
              : 'Cannot tell: something other than the prompt moved across the boundary. See below.',
    confoundersHeading: () => 'The prompt is not the only thing that changed',
    confounder: (kind, detail) =>
      kind === 'model-mix-moved'
        ? `The model mix moved by ${detail}. The drop may be entirely somebody else's migration, and this tool cannot separate the two.`
        : kind === 'volume-moved'
          ? `The call volume moved ${detail}. A workload whose traffic moved that much is usually a workload whose population changed \u2014 a new surface, a new customer, a campaign \u2014 and the questions being asked are not the questions from before.`
          : `Outcome coverage moved from ${detail}. The two rates describe different populations: a team that starts instrumenting its hard cases sees its measured rate fall without anything having got worse.`,
    notRandomised: () =>
      'This is a before-and-after, not an experiment. It splits traffic by time rather than at random, so everything else that changed at the same time is in the difference too \u2014 which is why it says "cannot tell" far more readily than an A/B would.',
    cannotSee: () =>
      'It cannot see anything else you deployed that day. A "dropped" verdict says the rate fell and the three things it can check did not move. That is a smaller claim than "the prompt did it", and it is the largest one the evidence supports.',
    gateFailed: () => 'Gate failed: a measured drop with nothing else to explain it.',
    gateHeldOpen: () =>
      'Gate not passed and not failed. "Cannot tell" holds the claim open rather than exiting green \u2014 the posture verify has had since 1.39.',
  },

  experiment: {
    heading: (a, b) => `Experiment: ${a} against ${b}`,
    needsTwo: () =>
      'Name two labels to compare, for example: trazum experiment <log> --a prompt-v1 --b prompt-v2',
    needsRule: () =>
      '--min-outcomes is required, and it is the point: a stopping rule declared after looking at the numbers is not a stopping rule. Say how many outcomes each arm must record before the result may be read.',
    arm: (name, rate, successes, recorded, interval) =>
      `${name}  ${rate}  (${successes} of ${recorded} recorded)  95% ${interval}`,
    wins: (name, low, high) =>
      `${name} wins. The difference is between ${low} and ${high} at 95% confidence \u2014 the whole interval is on one side of zero, which is what "wins" means here.`,
    notSeparable: (why, needed) =>
      why === 'no-difference-observed'
        ? 'Not separable: both arms recorded the same rate. No sample size separates a difference of zero, so there is no "run it longer" to offer \u2014 there is nothing here to find.'
        : why === 'nothing-recorded'
          ? 'Not separable: an arm recorded no outcomes at all, so there is no rate to compare.'
          : `Not separable on this traffic: the 95% interval on the difference includes zero. One number is larger, and that is not a finding. About ${needed} outcomes per arm would settle the difference observed so far.`,
    peeked: (short, declared, recorded) =>
      `Read early. The declared rule was ${declared} outcomes per arm and ${short} has ${recorded}. Nothing can stop a number being read early; this line exists so whoever reads the result later can see that it was.`,
    honoured: (declared) => `Stopping rule honoured: both arms cleared ${declared} recorded outcomes.`,
    marginalDearer: (better, usd) =>
      `${better} resolves more and costs more. One extra success costs ${usd} \u2014 that figure, not the rate, is what the decision turns on.`,
    marginalCheaper: (better) => `${better} resolves more AND costs less per call. Nothing is being traded.`,
    neverPromotes: () =>
      'Nothing was changed. A winner is a finding; taking it is a decision with a name attached, and it belongs in the plan like everything else.',
  },

  ladder: {
    heading: () => 'Escalation ladders',
    noLadders: () =>
      'No ladders configured. A ladder sends a workload to a cheap model first and escalates a recorded failure to a dearer one — add "ladders" to trazum.config.json, for example {"support": {"tiers": ["claude-haiku-4-5", "claude-opus-5"], "escalateOn": ["escalated"]}}.',
    workload: (label) => label,
    arithmetic: (cheap, dear, breakEven) =>
      `${cheap} a call cheap, ${dear} dear. Break-even escalation rate: ${breakEven}.`,
    measured: (rate, escalations, calls) =>
      `Measured: ${rate} (${escalations} of ${calls} calls escalated).`,
    saving: (delta) => `Saving ${delta} a call against never having built it.`,
    costing: (delta) =>
      `Costing ${delta} a call MORE than never having built it. Escalating above the break-even rate means paying for the cheap attempt and the dear one on most calls.`,
    atBreakEven: (band) =>
      `Within ${band} of break-even, so no sign is claimed. Inside that band the answer flips on ordinary week-to-week variation, and "saving" on Monday and "costing" on Thursday from the same policy teaches a reader to ignore the figure.`,
    cannotTell: (why, calls) =>
      why === 'too-few-calls'
        ? `Cannot tell yet: ${calls} calls carried a declared outcome, and a rate over that few moves more from one more call than from anything you could do about it.`
        : why === 'no-outcomes-recorded'
          ? 'Cannot tell: nothing in this log recorded an outcome for this workload, so there is no escalation rate to compare against.'
          : why === 'tier-unpriced'
            ? 'Cannot tell: one of the tiers is not in the price catalogue, so the break-even rate cannot be computed.'
            : 'Cannot tell: this ladder declares no escalation values.',
    problemsHeading: (label) => `${label} — this ladder will not do what it looks like it does`,
    problem: (kind, detail) =>
      kind === 'escalate-on-a-success'
        ? `escalateOn names "${detail}", which "outcomes.success" declares a SUCCESS. This ladder pays twice for work that already worked, on every call, while looking exactly like a cost-saving measure.`
        : kind === 'escalate-on-undeclared'
          ? `escalateOn names "${detail}", which "outcomes.values" does not declare. This ladder never fires, silently.`
          : kind === 'tiers-not-cheapest-first'
            ? `"${detail}" is cheaper than the tier before it. That is not a ladder; it is a routing rule that escalates to something cheaper and reports a saving for it.`
            : kind === 'duplicate-tier'
              ? `"${detail}" appears twice in tiers.`
              : kind === 'unknown-model'
                ? `"${detail}" is not in the price catalogue.`
                : `a ladder needs at least two tiers; this one has ${detail}.`,
    theDoubleSpend: () =>
      'An escalation pays twice: the cheap attempt is not refunded. So a ladder saves money only below its break-even escalation rate, and above it costs more than never having built one — which is why the rate is printed beside the measurement rather than left to be worked out in somebody\u2019s head.',
    notExecuted: () =>
      'Trazum does not run the escalation. A ladder escalates after a failure is known, which is after the answer came back and usually after something downstream judged it, so the retry belongs in your own loop. What is here is the policy and the arithmetic that says whether the policy is worth running.',
  },

  gateway: {
    badProvider: (given, known) =>
      given === ''
        ? `Name the provider to stand in front of. Known: ${known}.`
        : `"${given}" is not a provider this gateway speaks for. Known: ${known}.`,
    pricedNotFronted: (given, known) =>
      `Trazum prices ${given} but this gateway does not stand in front of it yet — it fronts ${known}. That is a real gap and it is on the roadmap, not a typo on your part. Until then: "trazum profile" prices a ${given} log you export, and its --max-usd gate fails a build on the bill after the fact. What you do not get is a refusal before the money is spent, which is the whole point of the gateway and the reason this is worth saying rather than listing ${given} as unknown.`,
    needsPolicy: (policies) =>
      `--on-cannot-tell is required, and there is no default: ${policies}. When the gateway cannot judge a call — no budget, nothing measured, an unpriced model — one of these happens, and only you know which failure your product can survive. fail-open keeps it working and lets the bill run; fail-closed stops the bill and takes it down with it. Picking one for you would be the most consequential decision in your architecture, made silently at install time.`,
    listening: (where, provider) => `Gateway on ${where}, in front of ${provider}`,
    /**
     * One sentence per cause, and no `else`.
     *
     * This was a two-branch ternary whose second arm explained OpenAI's
     * `stream_options`. A third cause added later would have inherited that
     * sentence and told a Gemini user about a setting that does not exist in
     * their SDK — a message bounded by its neighbour rather than by its
     * subject, which is this project's most repeated mistake.
     */
    unmeasured: (cause, sofar) => {
      if (cause === 'stream-broke') {
        return `unmeasured: the stream broke before its usage event — the provider billed this call and this session cannot see it (${sofar} unmeasured so far)`;
      }
      if (cause === 'no-usage-event') {
        return `unmeasured: the stream carried no usage event — on OpenAI that is every streaming call without stream_options.include_usage, so the total below is short by these (${sofar} unmeasured so far)`;
      }
      return `unmeasured: the provider answered without any usage in the body — the call was made and its cost is not knowable from the response, so the total below is short by these (${sofar} unmeasured so far)`;
    },
    pointYourSdk: (where) =>
      `Point your SDK's base URL at ${where} and change nothing else. It speaks the provider's own wire format, so no code changes and no new client.`,
    credential: () =>
      'Your credential is forwarded untouched and never read, never stored, never logged and never put in a URL. Trazum holds no key here and cannot make a call of its own through this.',
    neverSubstitutes: () =>
      'A call over budget is refused with HTTP 402 and the cheaper alternatives named — never silently swapped, trimmed or downgraded. 402 rather than 429 on purpose: every provider SDK retries a 429, which would turn one refusal into a retry storm.',
    standing: (consumed, limit) =>
      `Judging against ${consumed} of ${limit}, measured, read once at start — a file read in the request path would put this tool's latency between you and your provider on every call.`,
    noStanding: () =>
      'Nothing measured for this period, so every call is unjudged and the failure policy below decides. Set spend.monthlyUsd and pull with trazum connect.',
    policy: (policy) =>
      policy === 'fail-open'
        ? 'When it cannot judge: the call goes through, and the record says it was unjudged rather than within budget.'
        : 'When it cannot judge: the call is refused. Nothing gets through unmeasured.',
    measured: (model, label, input, output, substituted) =>
      `  ${model}${label === null ? '' : ` [${label}]`}: ${input} in, ${output} out${substituted ? ' (substituted — marked, and never counted as the call that was asked for)' : ''}`,
  },

  feedback: {
    heading: () => 'Telling us something',
    sendsNothing: () =>
      'This command sends nothing, and neither does anything else here. Trazum has no telemetry: no ping, no install hook, no anonymous counter. A tool whose whole argument is that it reads your bill without uploading it cannot also be quietly reporting on you, and a test fails the build if this command ever reaches the network.',
    whereHeading: () => 'Where',
    wrongOptimisation: () =>
      'A rule changed what a prompt asks for — the report that matters most, and the failure this product exists to avoid:',
    bug: () => 'Anything else that is wrong:',
    question: () => 'A question, or an idea you are not sure about:',
    security: () => 'A security problem — privately, never a public issue:',
    environmentHeading: () => 'What a maintainer will ask for',
    environmentOnly: () =>
      'That is the whole of it. Nothing about your work is here — not the config, not a prompt, not a label, not a figure. Those are what a good report needs and what only you can decide to share.',
    linkHeading: () => 'A blank issue with the above already filled in',
  },

  conform: {
    noTarget: () =>
      'Pass a file to check — a usage log, or any document Trazum emits. Use "-" to read from stdin.',
    badContract: (given, known) => `"${given}" is not a contract. Known contracts: ${known}.`,
    unrecognised: (path) => `${path} does not match any contract Trazum knows.`,
    /**
     * The article follows the name's **sound**, not its first letter.
     *
     * Every contract that existed when this line was written began with a
     * consonant letter, so a bare `a` was right every time it ran; then
     * `outcome-report` and `annual-record` became reachable by name and it
     * started saying "a outcome-report".
     *
     * `u` is excluded on purpose and the first attempt got it wrong: a
     * letter-only rule turned "a usage-log" into "an usage-log", because
     * `usage` opens on /juː/. Bounded to the closed set of contract names, all
     * of which begin `a`, `c`, `h`, `o`, `p`, `u` or `v`, and `contract-article`
     * in the test suite fails if a new one arrives that this rule cannot judge.
     */
    heading: (path, contract) =>
      `${path} reads as ${/^[aeio]/.test(contract) ? 'an' : 'a'} ${contract} document`,
    headingLog: (path, contract, records) =>
      `${path} reads as ${/^[aeio]/.test(contract) ? 'an' : 'a'} ${contract}: ${records} ${records === 1 ? 'record' : 'records'}`,
    conforms: () => 'It conforms. Every required field is present and the right type.',
    problem: (at, kind, detail) => `${at}: ${detail} (${kind})`,
    moreProblems: (count) => `…and ${count} more. Fix these first; they are often the same mistake.`,
    unavailableHeading: () => 'What this cannot answer, and what would unlock it',
    unavailable: (finding, because, unlockedBy) => `${finding} — ${because}. Add ${unlockedBy}.`,
    unavailableNeverGates: () =>
      'None of those failed anything. Choosing not to record a field is a decision, not a defect, and a gate that failed on it would be this tool telling you what to log.',
  },

  rollup: {
    noTargets: () =>
      'Pass the profile documents to roll up — each one written by `trazum profile --json` — or a directory of them.',
    noSuchTarget: (path) => `${path} is not there. A roll-up never guesses at a contribution it could not read.`,
    emptyDirectory: (path) =>
      `${path} holds no .json documents. An empty folder rolled up silently would report a team that spent nothing.`,
    heading: (contributors, usd, calls) =>
      `Roll-up of ${plural(contributors, 'contributor')} — ${usd} over ${plural(calls, 'call')}`,
    span: (from, to) => `Covering ${from} to ${to}, stated and never extrapolated from.`,
    noSpan: () => 'No contributor carried a clock, so this roll-up covers no stated period.',
    contributorsHeading: () => 'Contributors, and what each one could not see',
    contributor: (name, usd, calls, spanDays) =>
      `${name} — ${usd}, ${plural(calls, 'call')}${spanDays === null ? ', no clock' : `, ${plural(spanDays, 'day')}`}`,
    claimedSpan: (from, to, contributors) =>
      `Asked for ${from} to ${to} by ${plural(contributors, 'contributor')} — a claim about what was gone looking for, kept apart from what the records showed.`,
    claimedRow: (from, to) => `asked for ${from} to ${to}`,
    silentRuns: (runs) => runs,
    undated: (count) =>
      `${plural(count, 'record')} this contributor's own window could not place, because they carried no clock`,
    rejectedHeading: () => 'Handed over and not merged',
    rejected: (name, because) => `${name} — ${because}`,
    via: (rollup) => `via ${rollup}`,
    rejectedVia: (name, via, because) => `${name}, via ${via} — ${because}`,
    repeated: (names) =>
      `Handed over more than once, by name: ${names}. Its money is counted every time. Two machines genuinely sharing a name is possible, so nothing was subtracted — check whether a roll-up and one of the machines inside it were both handed over.`,
    identical: (names) => `The same document arrived more than once: ${names}.`,
    identicalUsd: (usd) =>
      `${usd} of the total above is the repeat. It is counted, not discarded — whether it is one export handed over twice or two machines that agreed exactly is yours to know.`,
    byLabelHeading: () => 'The merged bill, per workload',
    labelRow: (label, usd, calls) => `${label} — ${usd}, ${plural(calls, 'call')}`,
    notMergedHeading: () => 'Findings that do not roll up',
    notMerged: (finding, because) => `${finding} — ${because}.`,
    presentIn: (names) => `Present in: ${names}. Read it there.`,
    cannotSayHeading: () => 'What this roll-up cannot say about itself',
    caveat: (code) => {
      switch (code) {
        case 'overlap-invisible':
          return 'Overlap between contributors is unmeasurable here. Two people exporting the same traffic double the bill, and a merge of summaries cannot see it — the raw lines a duplicate check needs are in no document.';
        case 'mismatched-spans':
          return 'The contributors cover meaningfully different periods. The sum is a sum; reading a share of it as a comparison of rates is the mistake this names.';
        case 'contributor-without-clock':
          return 'A contributor carried no timestamp at all, so none of its spend is in any day above.';
        case 'day-top-label-unknown':
          return "A day drew from more than one contributor, so its dearest label is unknown: each contributor knows its own, and the merged answer needs per-label-per-day spend no document carries.";
        case 'no-claimed-period':
          return 'A contributor stated no window, so its span is all that is known of it — and a log whose latest record is the 5th may be a log of a quiet week or a log that stopped being written on the 5th.';
        case 'silence-inside-a-claim':
          return 'A contributor recorded nothing on days it asked for. Whether that is a quiet stretch or an export that stopped is yours to know; the days are named above.';
        case 'claim-not-bounded':
          return 'A contributor claimed one end of a window and not the other, so its silence cannot be measured against it.';
        case 'claim-too-long-to-enumerate':
          return 'A claimed window was too long to walk day by day and was not walked. The claim is kept; only its silence is unmeasured.';
        case 'contributor-named-twice':
          return 'A contributor name appears more than once, so its money may be counted twice. Handing over a roll-up and one of the machines inside it does exactly that, and the documents differ so the identical-document check cannot see it.';
        case 'identical-contributions':
          return 'Two contributions were the same document.';
        case 'contribution-rejected':
          return 'A contribution was not merged. That machine contributed nothing, which is a different statement from having spent nothing.';
        case 'unknown-fields-dropped':
          return 'A contribution carried a numeric field this version cannot classify, so it was left out rather than combined the wrong way.';
        default:
          return code;
      }
    },
  },

  position: {
    heading: (month) => `Where ${month} stands, measured`,
    scopeMonth: () => 'the month',
    scopeDay: () => 'today',
    scopeLabel: (label) => `"${label}"`,
    within: (scope, measured, limit, remaining, days, elapsed) =>
      `${scope}: ${measured} of ${limit} measured — ${remaining} left (${days} of ${elapsed} elapsed days measured)`,
    over: (scope, measured, limit, overBy) =>
      `${scope}: over — ${measured} measured against ${limit}, ${overBy} past the ceiling`,
    cannotTell: (scope) => `${scope}: cannot tell — nothing measured in this window`,
    distance: (days, rate, overDays) =>
      `at ${rate}/day over ${overDays} measured days, the ceiling is ${days} days away — division on the past, not a forecast`,
    unmeasuredHeading: () => 'Configured and not measurable from this log',
    unmeasured: (scope, why) => `${scope}: ${why}`,
    why: (reason) =>
      reason === 'no-clock'
        ? 'no record carries a timestamp, so no window can be measured'
        : reason === 'no-labels'
          ? 'no record carries a label, so per-label spend is unknowable here'
          : reason === 'nothing-recorded'
            ? 'the log is empty — nothing was recorded'
            : 'the log records labels and has never seen this one this month — possibly renamed, possibly idle, and neither is "under budget"',
    cannotSayHeading: () => 'What this deliberately does not answer',
    unpriced: (count) =>
      `${count} record(s) name a model the catalogue cannot price. They contribute nothing to any figure above — money nobody can see, said here rather than hidden.`,
    source: () =>
      'Measured from this log alone, priced record by record. The store\'s provider-billed monthly standing is a different measurement — "trazum store" prints it — and the two are never merged into one figure.',
    noLog: () => 'position needs a usage log: trazum position usage.jsonl',
  },
  pulse: {
    heading: () => 'Did the things that are supposed to run, run?',
    kind: (kind) => {
      switch (kind) {
        case 'watch-cycle':
          return 'last watch cycle';
        case 'store-pull':
          return 'last pull into the store';
        case 'store-coverage':
          return 'measurements reach up to';
        default:
          return kind;
      }
    },
    neverRun: (name) => `${name}: never here. Not late — there is no cadence to be late against.`,
    age: (name, when, hours) => `${name}: ${when}Z, ${plural(hours, 'hour')} ago`,
    noThreshold: () =>
      'Nothing was judged. Pass --max-stale-hours <n> to make a run that stopped a failing exit code; how stale is too stale is a policy, and this tool does not write yours.',
    within: (hours) => `Everything that has run here ran within ${plural(hours, 'hour')}.`,
    stale: (hours) =>
      `Something that runs here has not run in over ${plural(hours, 'hour')}. Silence from a scheduled job and silence from a job with nothing to report look identical; this is which.`,
    notAService: () =>
      'This command runs nothing and hosts nothing. Something has to notice, and the something is your CI: a step that runs this on the schedule you already have turns a dead cron into a red build, without Trazum holding anybody\'s metrics. How far the measurements reach is reported and never judged — that is a provider reporting on its own schedule, not a job that failed.',
  },

  html: {
    caveatsHeading: () => 'What this report cannot say',
    noClock: () => 'No record carried a timestamp, so days, rates and drift are not in this report — a total is still a total.',
    noSessions: () => 'No record carried a session, so conversation growth and per-conversation costs are not in this report.',
    byLabelHeading: () => 'By workload',
    byModelHeading: () => 'By model',
    findingsHeading: () => 'What would move this bill',
    colLabel: () => 'workload',
    colModel: () => 'model',
    colContributor: () => 'contributor',
    colSpanDays: () => 'days',
    colCalls: () => 'calls',
    colInput: () => 'input',
    colCacheRead: () => 'cache reads',
    colCacheWrite: () => 'cache writes',
    colOutput: () => 'output',
    sharesLine: (input, cacheRead, cacheWrite, output) =>
      `Where the money goes: ${input} plain input, ${cacheRead} cache reads, ${cacheWrite} cache writes, ${output} output.`,
    footer: () =>
      'Generated by trazum from a usage log, offline. Every figure derives from that log and the pricing table the run named; nothing here was sent anywhere to be computed.',
    written: (path) => `HTML report written to ${path}.`,
  },

  schema: {
    noTarget: (known) =>
      `Name a contract to print its JSON Schema. Known: ${known}. The schema validates with any draft 2020-12 validator — no Trazum required.`,
    unknown: (name, known) => `"${name}" is not a contract. Known: ${known}.`,
  },

  bench: {
    heading: () => 'This machine, measured',
    machine: (node, platform, cpuCount, cpuModel) =>
      `node ${node} on ${platform}, ${plural(cpuCount, 'CPU')}${cpuModel === null ? '' : ` (${cpuModel})`}`,
    colWorkload: () => 'workload',
    colWall: () => 'wall ms',
    colRatio: () => 'ratio',
    colPeakRss: () => 'peak RSS',
    note: () =>
      'One shot each, this machine, today. The wall clock is for a person reading two tables side by side; the ratio — workload over an in-process calibration loop — is the number a gate can hold, because the machine cancels out of it. Record one with --record, hold a build to it with --against and a stated --max-ratio.',
    unknownWorkload: (id, known) => `Unknown workload "${id}". Known: ${known}.`,
    recorded: (path) => `Baseline written to ${path}. Commit it; --against reads it.`,
    needsMaxRatio: () =>
      '--against needs --max-ratio <n>. How much regression is too much is a policy, and this tool does not write yours.',
    maxRatioNeedsAgainst: () => '--max-ratio judges against a baseline; pass --against <file> too.',
    badMaxRatio: (raw) =>
      `--max-ratio must be a finite number of at least 1 (received: ${raw}). It multiplies the recorded ratio; below 1 it would demand the code got faster.`,
    recordAndAgainst: () =>
      '--record and --against together would gate a run against the baseline it is writing. Record, commit, then gate.',
    unreadableBaseline: (path) => `Could not read a baseline from ${path}. Re-record it with --record.`,
    badBaseline: (path, version) =>
      `${path} is not a baseline this version knows (schemaVersion: ${version}). Re-record it with --record rather than letting a misread number gate the build.`,
    notInBaseline: (id, path) =>
      `${path} records no ratio for "${id}", and silently passing an unrecorded workload would read as coverage. Re-record with --record.`,
    gateOver: (id, ratio, allowed) =>
      `✗ ${id}: ratio ${ratio} is past the allowed ${allowed} (baseline × --max-ratio).`,
    gateWithin: (factor) => `Every measured workload is within ${factor}× its recorded ratio.`,
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
    measureHeading: (root, prompts, level) =>
      `What each rule recovers in ${root} — ${plural(prompts, 'prompt')}, level ${level}`,
    measureTotals: (before, saved, floor) =>
      `${before} tokens before. The rules recover ${saved}; normalisation recovers ${floor} whether a rule is enabled or not, and that is not the rules' work.`,
    measureRow: (id, marginal, alone, prompts) =>
      `${id.padEnd(22)} lost if removed ${marginal.padStart(6)}   alone ${alone.padStart(6)}   ${plural(prompts, 'prompt')}`,
    measureOverlap: (sumOfAlone, saved) =>
      `The rules recover ${sumOfAlone} between them one at a time and ${saved} together. The gap is the overlap — two rules finding the same tokens — and it is stated rather than resolved into a total, because a single figure here is the one number that cannot be true.`,
    measureRedundant: (ids) =>
      `Every token these find, something else finds too, here: ${ids}. An overlap, not a defect — and not a reason to delete one without deciding which is the better to keep.`,
    measureFiredWithoutSaving: (ids) =>
      `These changed the prompt and recovered no tokens: ${ids}. Not the same as inert — they were exercised, and they are altering somebody's instruction for no measured benefit.`,
    measureInert: (ids) =>
      `These changed nothing in this corpus: ${ids}. That is a fact about these files, not about the rules: a rule that finds nothing here has not been shown to find nothing anywhere.`,
    measureBand: (source) =>
      source === 'heuristic'
        ? 'Counted with the built-in estimator, so every figure above carries its documented band. A rule whose yield is a handful of tokens is inside the noise.'
        : 'Counted with an external tokenizer.',
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
    needsOutcome: (seen) =>
      `an "outcome" — ${seen}. The one field that changes what every other figure here means: without it this tool can say a workload got 40% cheaper and cannot say whether it stopped working. Record your own word for what happened and declare the vocabulary under "outcomes".`,
    dryRunOutcomes: (share) =>
      `cost per outcome and a success rate (${share} of records carry an "outcome")`,
    outcomeHeading: () => 'Outcomes',
    outcomeRate: (rate, ofUsd) =>
      `${rate} of ${ofUsd} in declared outcomes succeeded \u2014 by spend rather than by call, because the two diverge exactly when the expensive half is the half that fails.`,
    outcomeNoRate: (why) =>
      why === 'nothing-recorded'
        ? 'No success rate: nothing in this log recorded an outcome. That is not a rate of zero \u2014 a rate of zero is a real and terrible measurement, and this is nobody having told us.'
        : 'No success rate: "outcomes.success" declares no values, so nothing here counts as one. A legitimate thing to declare, and it means the rate is not this tool\u2019s to compute.',
    outcomeUnrecorded: (share, usd) =>
      `${share} of the bill (${usd}) carried no outcome, and is in neither half of the rate above.`,
    outcomeUndeclared: (values) =>
      `Not declared in "outcomes.values": ${values}. Named rather than counted as failures \u2014 a typo in an exporter should look like a typo, not like a product regression.`,
    perOutcomeHeading: () => 'What an outcome costs',
    perOutcomeRow: (key, perCall, perOutcome, coverage) => `${key} ${perCall} ${perOutcome} ${coverage}`,
    perOutcomeColumns: {
      workload: 'workload',
      perCall: 'per call',
      perOutcome: 'per success',
      recorded: 'recorded',
    },
    perOutcomeWithheld: (why, successes, coverage) =>
      why === 'too-few-outcomes'
        ? `${successes} so far`
        : why === 'too-little-coverage'
          ? `${coverage} covered`
          : why === 'no-successes-recorded'
            ? 'none succeeded'
            : why === 'nothing-recorded'
              ? 'not recorded'
              : 'no vocabulary',
    perOutcomeNumerator: () =>
      'Per success divides the spend on calls that recorded an outcome, never the whole bill \u2014 dividing everything would charge your uninstrumented traffic to your measured successes and report a figure too high by exactly the uncovered share, silently, in the direction that gets a working feature killed. "recorded" is what share of each workload\u2019s spend the figure covers.',
    perOutcomeDisagreement: (key, callRank, outcomeRank) =>
      `${key} is #${callRank} by cost per call and #${outcomeRank} by cost per success.`,
    perOutcomeBothOrders: () =>
      'Cheapest per call and cheapest per success are different orders, and both are printed rather than one being picked. A workload can move up one while moving down the other, and somebody optimising on the first number would be moving the wrong one.',
    outcomeColumns: { outcome: 'outcome', calls: 'calls', spend: 'spend' },
    verdictSuccess: () => 'success',
    verdictOther: () => '\u2014',
    verdictUndeclared: () => 'undeclared',
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
    waiveNotRecorded: (path, because) =>
      `  (This waiver was not written to ${path}: ${because}. The gate's verdict above is unaffected.)`,
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

  plan: {
    noTarget: () =>
      'Point this at a usage log or a directory of them: trazum plan usage.jsonl. It turns the report into a ranked plan — what to do first, what each action is worth, and what the log cannot confirm about it.',
    nothingPriced: () =>
      'This log priced nothing — no call in it matched a model in the catalogue. A plan over zero dollars would be advice about nothing; check the log with "trazum profile" first.',
    heading: (actions, total) => `The plan: ${actions} actions against a ${total} bill`,
    totals: (projected, staked) =>
      `${projected} projected savings, on assumptions listed below. ${staked} already spent on problems this plan names — measured, not projected.`,
    noClock: () =>
      'No timestamps in this log, so every figure is per this log, not per any period.',
    projected: (usd) => `${usd} projected`,
    staked: (usd) => `${usd} already spent`,
    action: (kind, label, model) => {
      const verb =
        kind === 'route'
          ? 'Route'
          : kind === 'batch'
            ? 'Batch'
            : kind === 'route+batch'
              ? 'Route and batch'
              : kind === 'fix-truncation'
                ? 'Fix the truncation retries on'
                : 'Look at the cache on';
      return `${verb} ${label} (${model})`;
    },
    routeTo: (model) => `to ${model} — combined with batching where both apply, never summed`,
    assume: (assumption) => {
      switch (assumption.kind) {
        case 'model-capability':
          return `assumes ${assumption.model} can do this work — the log prices the move, it cannot judge the answers`;
        case 'batch-window':
          return 'assumes these calls can wait for a batch window';
        case 'retry-pattern-real':
          return 'assumes the retry pattern is real — the log sees shapes, not content';
        case 'max-tokens-fits':
          return 'assumes a max_tokens the answers fit in removes the pair';
        case 'traffic-pattern-holds':
          return 'assumes the traffic pattern holds — a cache that lost money on this log may pay on different traffic';
      }
    },
    check: (command) => `check it: ${command}`,
    filtered: (count, minUsd, worth) =>
      `${count} actions under ${minUsd}, worth ${worth} together, left out by --min-usd — left out of this document entirely, not disproved.`,
    footer: () =>
      'Ranked by money, projected or already spent alike. The assumptions are yours to answer: this plan is arithmetic over the log, not knowledge of your product.',
    wrote: (path) =>
      `Plan written to ${path}, dated. Keep it: a prediction nobody wrote down is a prediction nobody can be held to.`,
  },

  serve: {
    listening: (where) => `Answering on ${where}`,
    limitsNoLog: () =>
      'A limits policy is configured and no --log was given, so every ceiling will answer cannot-tell: per-label and per-session spend live in a usage log, not in the store. Point --log at your usage log to make the ceilings judgeable.',
    limitsUnpriced: (count) =>
      `${count} record(s) in the --log name a model the catalogue cannot price. They contribute nothing to any measured figure — money the limits policy cannot see, said here rather than hidden.`,
    loopbackOnly: () =>
      'Loopback only, and there is no flag to change that: this holds your spend, your model mix and your budgets, and would answer whoever asked. There is no auth for the same reason — a token checked over loopback is theatre.',
    measuredFrom: (usd) =>
      `Budget answers are measured against ${usd} from the store, read once at start. Every answer carries the window that figure covers rather than implying it is current to the second — restart to refresh it.`,
    nothingMeasured: (dir) =>
      `Nothing is measured yet (the store at ${dir} is empty), so the budget half of every answer will say so. The cost half still answers from the catalogue: offline is a mode, not a failure.`,
    noBudget: () =>
      'No spend.monthlyUsd is configured, so "is there budget left" has no subject and every answer says so rather than guessing one. spend.maxUsd is deliberately not read here: it gates whatever period a log covers, and reading it as a monthly limit is how two surfaces of this tool come to disagree.',
    partialCoverage: (measuredDays, elapsedDays, period) =>
      `Only ${measuredDays} of the ${elapsedDays} elapsed days of ${period} carry any measurement, so the consumed figure is a floor on the period rather than the period. Pull the missing days with trazum connect before treating what is left as headroom.`,
    badPort: (value) => `"${value}" is not a port. Give a whole number from 0 to 65535, or use --socket.`,
  },

  watch: {
    noThresholds: () =>
      'Watching needs something to watch for. Set spend.maxUsd, spend.maxDayUsd or spend.maxCacheLossUsd in trazum.config.json — a watcher with no threshold is a green light nobody earned.',
    nothingToWatch: (dir) =>
      `Nothing has been measured yet: the store at ${dir} is empty. Fill it with "trazum connect <provider> --store" first — watching nothing would report that everything is fine.`,
    intervalTooTight: () =>
      '--interval must be at least 5m. Usage APIs are rate limited, and a tight loop is a way to get your own key throttled by a tool that exists to save you money.',
    badWebhook: (reason) =>
      reason === 'credentials-in-url'
        ? 'That webhook URL carries credentials. URLs end up in logs, shell history and error messages, so this one is refused — put the secret in a header your receiver checks, or in the receiver itself.'
        : reason === 'insecure-scheme'
          ? 'A webhook must be https, except on loopback. An alert carries your spend figures, and sending them in the clear across a network is a leak you did not ask for.'
          : 'That webhook is not a URL this tool can parse.',
    crossed: (gate, measured, limit, day) => {
      const what =
        gate === 'maxUsd'
          ? 'Total spend'
          : gate === 'maxDayUsd'
            ? `Spend on ${day}`
            : 'Money lost to caching';
      return `CROSSED — ${what} is ${measured} against a limit of ${limit}. Measured, not projected.`;
    },
    stillOver: (gate, measured, limit, day) => {
      const what =
        gate === 'maxUsd'
          ? 'Total spend'
          : gate === 'maxDayUsd'
            ? `Spend on ${day}`
            : 'Money lost to caching';
      return `STILL OVER — ${what} is ${measured} against a limit of ${limit}, and was already reported. Quiet is not clean.`;
    },
    notJudgeable: (gate, reason, covered) =>
      reason === 'window-too-short'
        ? `${gate} cannot be judged yet: this period is ${covered ?? 'partly'} measured, and a threshold over part of a day is a threshold over something else. Not a pass — it will be judged when the day is in.`
        : `${gate} cannot be judged on this source, which does not serve what the gate is written against. Not a pass: a gate silently skipped reads exactly like a gate that keeps passing.`,
    gap: (from, to) =>
      `Nothing was watching between ${from} and ${to}. Whatever crossed in that stretch was not seen, and this line exists so a resumed watcher does not imply coverage it did not have.`,
    allWithin: (gates) => `Within every threshold: ${gates} gates evaluated against measured spend.`,
    webhookFailed: (status) =>
      `The webhook did not deliver (${status}). The crossing is still in the exit code and in the output above — a receiver being down must not be the quietest failure in the room.`,
    watching: (minutes) => `Watching every ${minutes} minutes. Ctrl-C stops it.`,
  },

  store: {
    appended: (count, dir) => `Kept ${count} measurements in ${dir}.`,
    empty: (dir) =>
      `The store at ${dir} is empty. Fill it with "trazum connect <provider> --store" — that is a state, not an error.`,
    heading: (records, usd, from, to) =>
      `The store: ${records} measurements · ${usd} · ${from} → ${to}`,
    providerRow: (provider, records, span, models) =>
      `${provider}  ${records} measurements · ${span} · ${models} models`,
    holds: (files) =>
      `Held in ${files} files: token counts, billed dollars and the account's own workspace and key identifiers. Never prompt text, never completion text, never a credential — this is a file you can back up without a privacy review.`,
    possiblyDouble: (count) =>
      `${count} records could not be told apart from another — a window of no length, or a record naming no model. They are kept whole rather than merged, so a total built on them may count the same spend twice. Saying so beats a smaller number nobody can check.`,
    unknownVersion: (count) =>
      `${count} records come from a newer schema than this version knows, so they are kept and left out of the figures above rather than guessed at. Upgrade to read them.`,
    unreadable: (file, line) =>
      `${file} line ${line} would not parse, so it is not in the figures above. The rest of the file was read — one broken line must not lose a month.`,
    retention: (days) => `Retention: ${days} days, from "store.keepDays". Run "trazum store --prune" to apply it.`,
    noRetention: () =>
      'No retention policy is configured, so nothing is ever deleted on its own. Set "store": {"keepDays": 90} when you want one.',
    pruneNeedsPolicy: () =>
      'Pruning needs a retention policy: set "store": {"keepDays": 90} in trazum.config.json, or pass --keep 90d for this run. Deleting measurements on a policy nobody wrote down is not a default you should get by accident.',
    pruneDryRun: (count, days, span, usd) =>
      span === null
        ? `Nothing is older than ${days} days, so a prune would delete nothing.`
        : `A prune would delete ${count} measurements older than ${days} days, covering ${span} and ${usd} of measured spend. Nothing was deleted — this was --dry-run.`,
    pruned: (count, days, span, usd, kept) =>
      span === null
        ? `Nothing was older than ${days} days. ${kept} measurements kept, and the append log compacted.`
        : `Deleted ${count} measurements older than ${days} days, covering ${span} and ${usd} of measured spend. ${kept} kept, and the append log compacted to what the store already resolved to.`,
    budgetHeading: (period) => `Budget for ${period}`,
    budgetStanding: (consumed, limit, share, measuredDays, periodDays) =>
      `${consumed} of ${limit} (${share}), measured over ${measuredDays} of the month's ${periodDays} days.`,
    budgetShape: (shape, elapsedPct, coverage) =>
      shape === 'ahead'
        ? `The money is going faster than the calendar: ${elapsedPct}% of the month has elapsed.`
        : shape === 'behind'
          ? `The money is going slower than the calendar: ${elapsedPct}% of the month has elapsed.`
          : shape === 'on-pace'
            ? `Tracking the calendar: ${elapsedPct}% of the month has elapsed.`
            : coverage === 'partial'
              ? 'Whether that is fast or slow for the month cannot be told from a floor: the unmeasured days spent something, and only an overrun would be unarguable.'
              : 'There is nothing to compare the spend against yet.',
    budgetNeverForecast: () =>
      'That is a shape, not a forecast. Where this goes next depends on what you do next, and no arithmetic here knows that.',
    budgetNothingMeasured: (elapsedDays) =>
      `Nothing has been measured this month, across ${elapsedDays} elapsed ${elapsedDays === 1 ? 'day' : 'days'}. That is not a budget under control — it is a budget nobody is watching. Run trazum connect to pull what the provider has.`,
    budgetPartial: (measuredDays, elapsedDays, days) =>
      `Only ${measuredDays} of ${elapsedDays} elapsed days carry any measurement, so the figure below is a floor on the month rather than the month. Missing: ${days}.`,
    budgetScopesUnmeasured: (count) =>
      `${count} budgeted ${count === 1 ? 'scope' : 'scopes'} (per label or per service) cannot be answered from the store: a store record carries a provider and a model, not a workload label. Gate those with trazum profile against a per-call log.`,
  },

  connect: {
    noTarget: (providers) =>
      `Name a provider to read your bill from: trazum connect anthropic. Available: ${providers}. The credential comes from the environment and is never stored — add --dry-run to see exactly what would be called and which variable it would be read from.`,
    unknownProvider: (id, providers) =>
      `There is no connector for "${id}". The ones that exist are: ${providers}.`,
    pricedNoConnector: (id, providers) =>
      `Trazum prices ${id} but has no connector for it yet — it connects to ${providers}. Either that provider publishes no usage API, or one has not been written; both are gaps rather than mistakes of yours. Until then, export a log and run "trazum profile" on it: every figure works except the ones a usage API would supply on its own.`,
    dryRun: (provider, from, to, envVars, keyKind) =>
      `Would read ${provider} usage from ${from} to ${to}, using ${keyKind} taken from ${envVars}. Nothing was sent and no credential was needed to print this.`,
    heading: (provider, from, to, usd, calls) =>
      calls === null
        ? `${provider} · ${from} → ${to} · ${usd}`
        : `${provider} · ${from} → ${to} · ${usd} · ${calls} calls`,
    modelRow: (model, usd, share, calls) =>
      calls === null ? `${model}  ${usd}  ${share}` : `${model}  ${usd}  ${share} · ${calls} calls`,
    nothingBilled: () =>
      'The provider billed nothing in this window. That is a measurement, not an error — widen it with --since if you expected traffic.',
    cachePaid: (saved) => `Caching paid for itself: ${saved} less than these tokens would have cost as ordinary input.`,
    cacheLost: (added) => `Caching added ${added} to this bill against what the same tokens would have cost as ordinary input.`,
    cacheUnsettled: () =>
      'This source did not say which TTL the cache writes used, so the cheaper rate was assumed and the verdict moves under the other one. Unsettled, not settled in your favour.',
    noCallCount: (provider) =>
      `${provider}'s usage report serves token sums and no request count, so there is no call count here and no per-call average. A zero would read as "no traffic", so nothing is printed instead.`,
    unpriced: (model, tokens) =>
      `${model} is not in the price catalogue, so its ${tokens} tokens are counted and its money is not. Add it with --pricing rather than reading the total as complete.`,
    gap: (detail) => `This window is incomplete: ${detail}.`,
    unavailable: (findings) =>
      `Findings this source cannot support: ${findings}. They need one row per call, and a sum has lost the rows — a per-call log still answers them.`,
    wrote: (path) => `Report written to ${path}.`,
    footer: () =>
      'Every figure here is the provider\u2019s own billed token count at the catalogue\u2019s rates. Nothing was estimated, and nothing the provider did not serve was filled in.',
  },

  history: {
    noTarget: () =>
      'Point this at a directory of stored reports: trazum history reports/. It reads the --json documents "trazum profile" writes (and any saved plans beside them) and builds the series no pairwise comparison can see.',
    needsThree: (count) =>
      `A series needs at least three dated reports, and this directory has ${count}. Two reports is a comparison, and "trazum profile --against" already does that better.`,
    heading: (periods, from, to) => `The long run: ${periods} periods, ${from} → ${to}`,
    periodRow: (name, usd, calls, days) =>
      calls === null ? `${name}  ${usd} · ${days} days` : `${name}  ${usd} · ${calls} calls · ${days} days`,
    runLabel: (label, periods, sinceName, from, to) =>
      `${label} has climbed for ${periods} consecutive periods since ${sinceName}: ${from} → ${to}. A shape, not a forecast.`,
    runModel: (model, periods, sinceName, from, to) =>
      `${model}'s share of the bill has climbed for ${periods} consecutive periods since ${sinceName}: ${from} → ${to}. The totals can look flat while the mix moves under them.`,
    runCache: (periods, sinceName, from, to) =>
      `The cache share has decayed for ${periods} consecutive periods since ${sinceName}: ${from} → ${to} — slowly enough that no single report called it a finding, which is exactly why a series exists.`,
    repeated: (kind, label, model, appearances, first, last) => {
      const what =
        kind === 'route'
          ? `Routing ${label} (${model})`
          : kind === 'batch'
            ? `Batching ${label} (${model})`
            : kind === 'route+batch'
              ? `Routing and batching ${label} (${model})`
              : kind === 'fix-truncation'
                ? `Fixing the truncation retries on ${label} (${model})`
                : `Fixing the cache on ${label} (${model})`;
      const span = first !== null && last !== null ? ` (${first} → ${last})` : '';
      return `${what} has been planned ${appearances} times${span} and is still in the newest plan — a decision nobody is revisiting.`;
    },
    storeNoLabels: () =>
      'This series comes from the store, and a usage API groups by model and workspace rather than by workload — so there is no label series here at all. Absent, not empty: nothing above says a workload did or did not move.',
    unmeasured: (days, from, to, after, before) =>
      `Nothing covers ${from} to ${to} — ${plural(days, 'day')} between ${after} and ${before}.`,
    unmeasuredTotal: (days) =>
      `${plural(days, 'day')} of this stretch are covered by no report. A series with a hole in it and a shorter series read identically; this is which.`,
    overlap: (a, b, days) =>
      `${a} and ${b} both cover ${plural(days, 'day')}. Named, never merged — which is the better measurement is not knowable from here, and adding both totals counts those days twice.`,
    runHole: (days) => ` — ${plural(days, 'day')} of this run are covered by no report`,
    undated: (name) => `${name} carries no span, so it is on no timeline above — named, never silently absorbed.`,
    unrecognized: (name) => `${name} is neither a stored report nor a saved plan, so it is in no series above.`,
    footer: () =>
      'A series names shapes, not futures. Twenty points make a trend visible; they do not make next month knowable — where these lines go next is yours to judge.',
    waiverHeading: () => 'What this repository has been living with',
    waiverSince: (day, uses) =>
      `${uses} recorded ${uses === 1 ? 'use' : 'uses'} since ${day}, when recording started.`,
    waiverNoneRecorded: () =>
      'No waiver has silenced a gate since recording started. Nothing here is inferred from the config — a waiver written down and never hit is not a decision anyone is living with.',
    waiverHabit: (gate, uses, days, firstDay, lastDay) =>
      `${gate}: ${uses} ${uses === 1 ? 'use' : 'uses'} across ${days} ${days === 1 ? 'day' : 'days'}, ${firstDay} to ${lastDay}`,
    waiverVerdict: (verdict) =>
      verdict === 'used-once'
        ? 'Used once. Nothing to read into it yet.'
        : verdict === 'recurring'
          ? 'The same decision, holding. The gate keeps firing and the reason has not moved.'
          : verdict === 'renewed-without-revisiting'
            ? 'The expiry has moved and the reason has not. That is the shape a decision takes when nobody is revisiting it — which is sometimes exactly right, and worth saying out loud either way.'
            : 'The reason changed between uses. Somebody looked again.',
    waiverReasonNow: (reason) => `Reason: ${reason}`,
    waiverReasonsChanged: (count) => `${count} different reasons given over that time.`,
    waiverExpiriesMoved: (from, to, count) =>
      `Expiry moved ${count} ${count === 1 ? 'time' : 'times'}: ${from} → ${to}.`,
    waiverNoLongerConfigured: () =>
      'Not in the config any more. The decision was reversed; the record keeps it.',
    waiverNeverUsed: (gates) =>
      `Waived in the config and never hit by a recorded run: ${gates}. Either the gate stopped failing — good news nobody wrote down — or the waiver names a situation that does not arise. Both are worth deleting.`,
    waiverUnreadable: (count, path) =>
      `${count} ${count === 1 ? 'line' : 'lines'} in ${path} could not be read and are not counted above.`,
    waiverStartsHere: () =>
      'Nothing before that day exists. This record began when recording did, and no past was reconstructed from the config as it stands.',
  },

  verify: {
    noTarget: () =>
      'Point this at a saved plan and a newer log: trazum verify plan.json --against usage.jsonl. It says, per action, whether the change arrived, did not arrive, or cannot be told — and never fewer than those three.',
    needsAgainst: () =>
      '--against <newer.jsonl|dir> is required. A plan can only be verified against a log that came after it; without one there is nothing to hold the prediction to.',
    badPlan: (path, why) =>
      `${path} is not a plan document this tool can verify: ${why}. Expected the JSON that "trazum plan -o" writes.`,
    planRefusal: (why) =>
      why.kind === 'not-json'
        ? 'it is not valid JSON'
        : why.kind === 'not-an-object'
          ? 'the top level is not a JSON object'
          : why.kind === 'wrong-schema-version'
            ? `schemaVersion is ${JSON.stringify(why.found)} rather than 1`
            : why.kind === 'actions-not-a-list'
              ? 'there is no actions array'
              : `action ${why.index + 1} is malformed (${why.because})`,
    heading: (actions, planDate) =>
      planDate === null
        ? `Did it work? ${actions} actions from an undated plan, against this log`
        : `Did it work? ${actions} actions from the plan of ${planDate}, against this log`,
    counts: (arrived, notArrived, cannotTell) =>
      `${arrived} arrived · ${notArrived} did not arrive · ${cannotTell} cannot be told. The third is not a soft version of the second: it means this log cannot answer, which is its own finding.`,
    pricesChanged: (planReviewed, nowReviewed) =>
      `Prices were reviewed ${planReviewed} when the plan was made and ${nowReviewed} now, so every dollar comparison here is two price lists, not one measurement — a team must not be blamed for a saving that arithmetic revoked.`,
    action: (kind, label, model, outcome) => {
      const what =
        kind === 'route'
          ? `Route ${label} (${model})`
          : kind === 'batch'
            ? `Batch ${label} (${model})`
            : kind === 'route+batch'
              ? `Route and batch ${label} (${model})`
              : kind === 'fix-truncation'
                ? `Fix the truncation retries on ${label} (${model})`
                : `Fix the cache on ${label} (${model})`;
      const verdict =
        outcome === 'arrived' ? 'ARRIVED' : outcome === 'not-arrived' ? 'DID NOT ARRIVE' : 'CANNOT BE TOLD';
      return `${what} — ${verdict}`;
    },
    reason: (reason) =>
      reason === 'workload-vanished'
        ? 'the label carries no priced traffic in this log — a vanished workload is not a fixed one, and not a broken one either'
        : reason === 'fields-stopped'
          ? 'the fields the detection needs are not in this log — "not recorded" must not read as "fixed", so with --gate this fails'
          : 'the log records tokens, and tokens do not say which tier billed them — the Batch API cannot be seen from here',
    routeObserved: (dearestModel, onTargetUsd, onOldUsd) =>
      `the label's dearest model is now ${dearestModel} · ${onTargetUsd} on the target, ${onOldUsd} still on the old model`,
    batchUnobservable: () =>
      'the batch half of this action cannot be seen in token counts; the verdict above is the route half alone',
    truncationObserved: (retryBillUsd) =>
      `this log still shows ${retryBillUsd} of truncation waste and retries`,
    cacheObserved: (deltaUsd, outcome) =>
      outcome === 'arrived'
        ? `caching now pays for itself on this slice (${deltaUsd} against the no-cache bill)`
        : `caching still adds ${deltaUsd} to this slice's bill`,
    attribution: (callsBefore, callsAfter, outBefore, outAfter) =>
      `the world moved too: calls ${callsBefore} → ${callsAfter}, output/call ${outBefore} → ${outAfter} tokens — stated so the verdict is not read as the whole story`,
    gateFailed: (failures, total) =>
      `GATE FAILED — ${failures} of ${total} actions did not produce what the plan promised, or stopped being measurable by the team's own log.`,
    gateOk: () => 'Gate passed: every verifiable action arrived, and nothing became unverifiable.',
    footer: () =>
      'Arrived and did-not-arrive are measurements; cannot-be-told is the log refusing to guess. All three are the verification working, not failing.',
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

  write: {
    slots: {
      task: {
        question: 'What should the model do, in one sentence?',
        unlocks: 'the whole prompt — without it there is nothing to write',
      },
      role: {
        question: 'Who is the model being while it does that?',
        unlocks: 'the stance of the answer; left out, the model picks one for you',
      },
      inputs: {
        question: 'What changes from one call to the next?',
        unlocks: 'the varying part — without it the prompt hard-codes one case and is rewritten for the next',
      },
      'output-shape': {
        question: 'What should come back: prose, json, list or table?',
        unlocks: 'the output contract, and whether a consumer can parse the answer at all',
      },
      'output-schema': {
        question: 'Which fields or columns, and which are always present?',
        unlocks: 'field names a consumer can rely on rather than infer from one sample',
      },
      'output-length': {
        question: 'How long should the answer be, at most?',
        unlocks: 'the ceiling that stops a paid overrun nobody reads',
      },
      audience: {
        question: 'Who reads the output?',
        unlocks: 'the register — an answer for an engineer and one for a customer are different answers',
      },
      constraints: {
        question: 'What must it never do?',
        unlocks: 'the prohibitions; stated once here rather than discovered one incident at a time',
      },
      refusal: {
        question: 'What should it do when it cannot answer?',
        unlocks: 'a refusal that arrives with a reason instead of a confident guess',
      },
      examples: {
        question: 'Is there an example of a good answer?',
        unlocks: 'few-shot guidance, and the chance to check it is not repeating itself',
      },
      'example-inputs': {
        question: 'What input produced that example?',
        unlocks: 'the pairing — an example answer with no input teaches the shape and not the mapping',
      },
      'failure-modes': {
        question: 'What has gone wrong with this before?',
        unlocks: 'the corrections worth stating, which are the ones a generic prompt never has',
      },
      model: {
        question: 'Which model is this for?',
        unlocks: 'the cost estimate — this changes the report and never the prompt',
      },
      budget: {
        question: 'What is the monthly ceiling for this prompt?',
        unlocks: 'the budget check — this changes the report and never the prompt',
      },
    },
    missing: (count) =>
      count === 1
        ? 'One answer is still needed before a prompt can be written:'
        : `${count} answers are still needed before a prompt can be written:`,
    done: () => 'Nothing left worth asking.',
    answersNotAnObject: (path) =>
      `${path} must hold a JSON object of slot ids and answers.`,
    unknownSlot: (id, nearest) =>
      nearest === null
        ? `"${id}" is not a slot. Run "trazum write" with no --answers to be asked them.`
        : `"${id}" is not a slot. Did you mean "${nearest}"?`,
    answerNotText: (id) => `"${id}" must be a string, or null to decline it.`,
    tokens: (count) => `${count} tokens`,
    monthly: (usd) => `${usd} per month, estimated — nobody has sent this prompt yet`,
    budget: (verdict, limit) =>
      verdict === 'over' ? `over the budget of ${limit}` : `within the budget of ${limit}`,
    noVerdict: (reason) =>
      reason === 'no-budget'
        ? 'No budget answered, so there is nothing to check it against.'
        : reason === 'no-model'
          ? 'No model answered, so it cannot be priced.'
          : 'That model is not in the price catalogue, so it cannot be priced.',
    clean: () => 'trazum optimize recovers nothing from this.',
    notClean: (rules, tokens) =>
      `trazum optimize would still recover ${tokens} tokens here (${rules}) — from your answers, not from the structure.`,
    declined: (ids) => `Declined, and left out: ${ids}`,
  },
};
