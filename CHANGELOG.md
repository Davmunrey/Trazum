# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

## 0.10.0

`trazum.config.json` and directory mode. Two of the three items left over from
0.9.0; PR comment mode for the Action is still open.

**`trazum check prompts/`** checks every prompt under a directory against
per-pattern budgets from the config file — one CI step for a repository of
prompts rather than one step per file.

**The config parser refuses anything it cannot validate, including an unknown
key.** That is the design, not strictness for its own sake: a lenient parser
restores defaults silently, and for a budget the default is *no budget* — a
green build for a prompt nobody measured. Same reasoning as `--max-growh` being
rejected rather than ignored in 0.9.0.

- `trazum.config.json`: `level`, `locale`, `disable`, `usage`, `budgets`,
  `maxGrowth`, `extensions`. Found by walking up from the working directory and
  stopping at the repository root, so a subdirectory inherits the project's
  settings and nothing above the checkout is ever read. `--config <file>` skips
  the search.
- **Flags beat the config; the config beats the defaults.** A config able to
  override an explicit flag would make every flag a suggestion.
- New `--no-<flag>` for booleans, so a setting the config switched on is not one
  you have to edit the repository to escape. `--no-max-tokens` is refused rather
  than silently accepted, and an unknown `--no-x` is quoted the way it was typed
  instead of as `--x`.
- Budgets resolve to the most specific matching pattern, with "specific" given a
  stated definition — most literal characters wins, longest pattern breaks a
  tie. Pattern order in the file never matters. The JSON report names the
  pattern each budget came from.
- A file no pattern covers is listed as `(no budget)`, not skipped; and a run
  where nothing at all was budgeted is an error. "Checked 40 files, 0 failures"
  from a run that measured nothing is the most misleading output this tool could
  produce.
- `maxGrowth` in the config arms the `diff` gate exactly as the flag does.
  Absent both, growth alone still exits 0.
- `locale` in the config is outranked by the environment — the only setting
  where that is true. A repository choosing the language of its CI logs should
  not choose the language of a contributor's terminal.
- New glob matcher, written as a segment-wise dynamic program rather than a
  regex translation. `**` compiled to `(?:[^/]*\/)*` is the nested-quantifier
  shape that backtracks exponentially, and these patterns come from a file in
  the repository — on a pull request, from whoever opened it. Bounded in pattern
  and path length, with a time-budget test over the shapes that break the regex
  version.
- The directory walk **does not follow symlinks**, caps depth and file count,
  and reports when a cap stopped it early. A link to `/etc` would turn "check
  the prompts folder" into printing token counts for files outside the project;
  a link loop would turn it into a hang.
- New security invariant: only `config.ts` and `walk.ts` may touch the
  filesystem. The web app exposes `optimize()` over HTTP with a prompt from the
  request body, so a file read appearing on that path would be path traversal
  reachable by anyone who can reach the API.
- `editDistance` moves into core as `nearestName` and is now shared between the
  unknown-flag and unknown-key suggestions rather than duplicated.
- Tests grow from 228 to 298.

## 0.9.0

New `trazum diff` command and `comparePrompts()` API: compare two versions of a
prompt and report what the edit cost. `optimize()` answers "how much fat is in
this prompt"; this answers the question a pull request actually raises —
somebody edited this, did it get worse?

**The design decision that keeps it honest.** Every other figure Trazum prints
is a *saving*: before minus after, positive is good. Every figure here is a
*delta*: after minus before, positive is **bad**. Mixing those two conventions
in one report is the easiest way to make a cost tool lie, so the comparison
lives in its own module, nothing in it is named a saving, and the negation
happens exactly once, at the boundary.

- Reports what the edit broke, not only what it cost: advisories that appeared
  and rules that started firing, plus the same in reverse when the edit
  improved things.
- Measures the text **as written** by default, not what the rules would leave.
  A pull request changed the file on disk, so the file on disk is what the
  reviewer is being asked about — otherwise a prompt that doubled in length but
  happened to double in courtesy would report no change. `--optimized` switches
  the figures to the post-rules text.
- **The gate is opt-in.** Growth alone exits 0; `--max-growth 10` is what makes
  it exit 1. A tool that fails a build nobody armed gets removed from the
  pipeline rather than fixed.
- `--max-growh` is rejected with "Did you mean --max-growth?" rather than
  ignored — a silently-swallowed gate flag means CI green while the author
  believes a limit is set.
- New `formatSignedUsd()`: `+$9.25` and `-$9.25`, because `formatUsd` renders a
  negative as `$-9.25`, which reads as a typo. Negative zero is collapsed, so a
  change that did not happen is never shown with a direction.
- `deltaPct` is 0 rather than `Infinity` when the original was empty.
- Tests grow from 196 to 228.

## 0.8.0

New `trazum eval` command and `evaluate()` API: run both prompt versions over a
set of inputs and report whether the optimisation changed the answers. Every
other number Trazum reports is arithmetic; this is the one question arithmetic
cannot answer.

**The design decision that makes it worth anything.** A model asked the same
question twice does not answer identically, so "the optimised prompt diverged
on 3 of 10 cases" means nothing on its own — it might be better than the
original manages against itself. The original therefore runs **twice** per case
first, and that self-agreement is the yardstick the rewrite is judged against.
It costs a third call per case and it is the only reason the verdict means
anything.

- Four verdicts: `indistinguishable`, `within-noise`, `diverges`, and
  `inconclusive` — the last for when the original cannot agree with itself
  often enough to judge anything against. A confident verdict off an
  inconsistent baseline would be worse than admitting the test does not work.
- Exits 1 on `diverges`, so it can gate a pull request the same way
  `trazum check` gates a token budget.
- Prints the call count before spending anything.
- A template gets its first placeholder filled rather than the input appended:
  appending would test a prompt nobody runs.
- Cases come from a file, one per line (`#` comments and blanks ignored) or a
  JSON array. A file that merely starts with `[` falls back to line mode rather
  than erroring.
- Bounded concurrency, default 3. The baseline pair stays sequential within a
  case: issuing both at once invites a provider to serve one from cache and
  report a variance of zero.
- Tests grow from 179 to 196.

## 0.7.0

- New `reviewExamples`: the paraphrase case the deterministic detector refuses
  to guess at. Two examples teaching the same lesson in different words score
  around 0.54 on word overlap — close enough to two genuinely distinct examples
  (~0.20) that catching them by similarity would mean flagging examples that
  teach different things. Deciding that "arrived quickly" and "arrived fast"
  demonstrate the same pattern needs a model, so this sits behind the optional
  LLM layer, costs a call, and never runs during an ordinary `optimize()`.
- Returns `null` below two examples, so the caller does not pay for a foregone
  answer.
- **The response is treated as untrusted input, because it is.** Indices are
  range-checked against the examples that exist, self-references dropped,
  overlapping groups collapsed so the same tokens are never counted twice, and
  the model's stated reason truncated. A model answering with prose produces an
  empty review — not a crash, and not a saving the prompt could not deliver.
- A provider **error** still throws. A bad answer is the model's problem and
  gets absorbed; a broken endpoint is the caller's configuration and hiding it
  would waste their afternoon.
- The CLI runs it under `--llm`, reports it as a suggestion to read rather than
  a change made, and includes it in `--json`.
- Shortens the GitHub Action's description to 113 characters: the Marketplace
  rejects anything over 125, which blocked publishing.
- Tests grow from 164 to 179.

## 0.6.0

**Fixes a rule that left a broken sentence behind.** `self-check` matched
"double-check your answer before responding" but not the subject and modal in
front of it, so `"You MUST double-check your answer before responding."` became
`"You must."` — a sentence that says nothing, in place of one that said
something. Whatever can open one of these instructions is now listed ahead of
the bare form, in both languages.

That bug had been there since the rule shipped. It surfaced within a minute of
the feature below existing, which is the argument for the feature.

- `RuleResult.changes`: each rule now reports a short list of what it actually
  changed, as before/after pairs. `hits` still carries the true total.
  `aggressive` has always come with the advice "read the diff", and the diff
  was one undifferentiated block for every rule at once — not review, a wall of
  text with a warning attached. Now an aggressive run is judged rule by rule,
  and a single rule you disagree with is disabled with `--disable` instead of
  abandoning the level that saves the most.
- Empty rather than truncated when a change is too large to summarise. An empty
  list reads as "nothing to show here"; a truncated one would read as "this is
  all that happened", which would be a lie.
- Bounded by construction, like everything else that touches untrusted text:
  the common prefix and suffix are trimmed in linear time, and anything still
  too large is skipped rather than diffed. Covered by the same adversarial
  fixtures as the ReDoS suite.
- Shown in the CLI and the web app for aggressive rules, and for every rule
  under `--diff`.
- New public API: `extractChanges`, `DEFAULT_CHANGE_LIMIT`, and the
  `RuleChange` type.
- Tests grow from 145 to 164.

## 0.5.0

A third structural finding, same posture as the first two: it reports, it does
not cut.

- New `restated-output-format` advisory. A prompt that shows its schema in a
  code block and then walks the same fields in prose is paying for the schema
  twice; the block is the version worth keeping, since it is unambiguous and
  the protection pass guarantees Trazum never edits it. Priced per month.
- Reads *illustrative* schemas, not only valid JSON. Prompts routinely contain
  trailing commas, `...` and `<placeholders>`, and refusing to parse those
  would skip exactly the prompts worth checking — so key extraction is a
  depth-aware scan rather than `JSON.parse`.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification ("set `escalate` to true when the customer asks for a human")
  and flagging it would turn the advisory into noise.
- New public API: `findRestatedFormat`, and the `RestatedFormat` type.
- Tests grow from 138 to 145.

### Dependencies

- `next` 15 → 16, which is what finally cleared the three high-severity
  `postcss` and `sharp` advisories. Bumping the direct dependency was not
  enough on its own: the lockfile kept the vulnerable transitives, and the
  blocking audit is scoped to the published packages so it never saw them.
  `npm audit` over the whole tree now reports 0 vulnerabilities. The lesson is
  recorded in `SECURITY.md`.
- `actions/checkout` and `actions/setup-node` 4 → 7, clearing the Node 20
  deprecation warning every run was printing.
- `actions/dependency-review-action` 4 → 5.

## 0.4.0

Structural analysis: findings that live in the *relationship* between two
places in a prompt, which no phrase dictionary can see because neither place is
wrong on its own. Both are advisory — Trazum points, it does not cut.

- **Fixes a corruption bug in `duplicate-lines`.** The rule was deleting the
  shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often exactly why both are there. Labelled example fields (`Input:`,
  `Output:`, `Q:`, `A:`, and Spanish equivalents) are now exempt from
  line deduplication. This affected the `safe` level, so it could silently
  damage a prompt anyone ran through Trazum.
- New `contradictory-instructions` advisory across four axes: response
  language, output format, response length, and whether to show the reasoning.
  Reported as a **warning** with both conflicting sentences quoted. It carries
  no dollar figure — being wrong has no price tag.
- New `redundant-examples` advisory: few-shot examples that are near-copies of
  an earlier one, with the tokens they cost per month. It detects copy-paste
  accumulation (~0.89 similarity for a copied example with one field changed),
  and deliberately **not** paraphrases (~0.54), which sit too close to
  genuinely distinct examples (~0.20) to separate without a model.
- **Advisories now sort by severity before money.** Sorting purely on the
  dollar figure buried an overflowing context window — and now a contradiction
  — underneath a saving of a few dollars.
- New public API: `findContradictions`, `analyzeExamples`, `findExamples`, and
  the `jaccard` / `normalizeForCompare` similarity helpers, which moved to a
  shared module so the duplicate rules and the structural analysis cannot
  disagree about what "near-duplicate" means.
- Adding a contradiction axis now fails to compile until every catalogue names
  it, the same guarantee `RuleId` gives rules.
- Tests grow from 75 to 94.

### Security

Hardening for an open repository taking outside contributions. Full reasoning
in [SECURITY.md](SECURITY.md).

- **Fixes four SSRF filter bypasses.** The web app's private-host blocklist
  allowed `https://[::ffff:169.254.169.254]` — the IPv4-mapped IPv6 form of the
  cloud metadata address, which Node normalises to `[::ffff:a9fe:a9fe]` and the
  old patterns did not match. Also allowed: a trailing-dot hostname
  (`localhost.`), the carrier-grade NAT range (`100.64.0.0/10`), and
  credentials embedded in the URL, which would have been forwarded to whatever
  the host resolved to and written into any log recording the endpoint.
- The filter moved from the Next.js route into `@trazum/core` as
  `validateLlmEndpoint` / `isPrivateHost`, so the most security-sensitive code
  in the project is unit-tested instead of living untested in an API handler.
  It returns a reason code rather than a message, so callers localise it and
  tests assert on the decision.
- **Fixes two ReDoS denial-of-service bugs**, both reachable from the public
  HTTP endpoint, both found by CodeQL after the first round of ReDoS tests had
  passed:
  - `whitespace` — a **`safe`-level rule present since 0.1.0**. Its
    trailing-whitespace pattern restarted at every position inside a whitespace
    run and failed from each one when the run did not end the line: 17 seconds
    on a 100 KB line of spaces, well inside the 400 KB the API accepts.
    Anchored to the start of a run, it is now 3 ms at 400 KB.
  - The few-shot label patterns added in this release ended in three adjacent
    unbounded quantifiers, measured at O(n²) — 651 ms at 40 000 spaces, about a
    minute at the size cap. Their quantifiers are now bounded.
  - The ReDoS suite gained the fixture shape it was missing. The original
    fixtures were all *repeated tokens*, which exercise the happy path over and
    over; neither bug needed that, they needed a plausible prefix followed by a
    long run that never completes the match.
- New `security.test.js` enforcing four invariants on every pull request: the
  SSRF filter fails closed, the core and CLI carry zero runtime dependencies,
  `fetch` appears only in the two modules that exist to make calls, and no
  regex exhibits catastrophic backtracking under pathological input.
- Workflows run with `permissions: contents: read` by default,
  `npm ci --ignore-scripts`, and `persist-credentials: false`.
- Added CodeQL (`security-extended`), dependency review, a weekly `npm audit`,
  Dependabot, `CODEOWNERS`, and an importable branch ruleset at
  `.github/rulesets/main-branch.json`.
- `SECURITY.md` documents the threat model, private reporting, the settings an
  admin still has to switch on, and the limits that are not covered — DNS
  rebinding, per-instance rate limiting, and actions pinned to tags.

## 0.3.0

**Breaking.** `buildAdvisories()` takes an options object instead of trailing
positional arguments: `buildAdvisories(prompt, tokens, usage, { on, count, locale })`
replaces `buildAdvisories(prompt, tokens, usage, on, count)`. The `Rule`
interface no longer carries `title` or `rationale` — rules carry an `id`, and
copy is resolved from the message catalogue with `getMessages(locale).rules[id]`.
`OptimizationResult.rules` is unchanged, so consumers of the report need no
migration.

The repository is now English end to end — source, comments, tests,
documentation, CLI, web and CI. Spanish was not removed; it was moved out of
hardcoded prose into a locale, which is the only version of "add a language"
that survives a second one.

- Per-locale message catalogues in `@trazum/core`, `@trazum/cli` and
  `@trazum/web`, with English as the declared source of truth.
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` accept a `locale`, and the result carries
  the locale it was produced in.
- New `matchLocale()`, which returns `null` when its input names no locale we
  ship — that is what lets a caller fall through to the next configuration
  source instead of mistaking a fallback for a choice. `resolveLocale()` now
  walks a whole `Accept-Language` list, so `fr-FR,es;q=0.9` resolves to Spanish
  rather than defaulting to English.
- CLI: `--locale`, then `TRAZUM_LOCALE`, then the POSIX locale variables. The
  flag is read straight from argv, so even a bad-argument error is reported in
  the requested language. `trazum rules` now reads its copy from the core
  catalogue, so it can no longer drift from the report.
- Web: `Accept-Language` is negotiated on the server, so first paint already
  matches the reader; a switcher in the masthead overrides it and the choice is
  remembered. `generateMetadata` negotiates too, so link previews follow.
  The API route localises its own errors as well as the report.
- The web starter prompt now exists per language, since the phrase
  dictionaries are per-language and the example exists to show rules firing.
  Switching language never overwrites a prompt you wrote.
- `GET /api/optimize` no longer returns rule copy: it was locale-blind, and the
  report carries its own.
- Sample prompts are `examples/sample-prompt.en.txt` and
  `examples/sample-prompt.es.txt`; the action self-test runs against both.
- The GitHub Action takes a `locale` input.
- Tests grow from 47 to 75, adding catalogue-parity coverage so a locale cannot
  silently go stale, plus a CLI suite covering locale resolution. `npm test` now
  runs both packages.
- New `ROADMAP.md`, `VERSIONING.md` and `CONTRIBUTING.md`.

## 0.2.0

- Cacheable-prefix analysis (`analyzeCachePrefix`): the prompt-caching advisory
  computes its saving over the real stable prefix — everything before the first
  template placeholder — instead of over the whole prompt, which in a template
  never caches in full.
- New `cache-prefix-reorder` advisory: detects stable instructions sitting
  after the first placeholder, which today never cache, and prices moving them
  in front.
- Packaged GitHub Action (`Davmunrey/Trazum@main`) for `trazum check`: token
  budgets in CI with nothing to install, with a self-test in the repository's
  own CI.

## 0.1.0

First release.

- Deterministic core (`@trazum/core`): 12 rules across two levels, isolation of
  code/URLs/templates/XML, dependency-free token estimator, pricing catalogue
  with promotions, and savings advisories (caching, Batch API, model tier,
  context window).
- Optional, pluggable LLM layer (OpenAI-compatible endpoints, the Claude API,
  or a custom provider) with safety checks: a candidate is only accepted when
  it is shorter and preserves the protected content.
- CLI (`@trazum/cli`): `optimize`, `check` (token budgets for CI), `models` and
  `rules`; clean output when redirected, plus `--json`, `--diff` and
  `--exact-tokens`.
- Web (`@trazum/web`): Next.js interface with a word-by-word diff, local
  history, an editable cost scenario and a configurable LLM pass.
