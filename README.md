# Trazum

[![CI](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml/badge.svg)](https://github.com/Davmunrey/Trazum/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

Prompt optimiser. Shortens what you send to the model without changing what you
ask for, and tells you what that is worth per month.

The core is **deterministic**: same rules, same result, zero cost to run. On top
of it sits an **optional LLM pass** for the compression rules cannot do, using
whichever provider you configure.

```
┌──────────────┐   ┌───────────────┐   ┌──────────────────┐
│ @trazum/core │ ← │ @trazum/cli   │   │ @trazum/web      │
│  library     │   │  terminal     │   │  Next.js         │
└──────────────┘   └───────────────┘   └──────────────────┘
```

---

## What it actually does

**1. Trims the prompt with deterministic rules.** Courtesy, filler, verbose
phrasing, duplicated paragraphs, decorative separators, shouting in capitals.
Two levels: `safe` (no semantic risk) and `aggressive` (read the diff).

**2. Never touches what would break the prompt.** Code fences, inline code,
URLs, template placeholders (`{{x}}`, `${x}`, `{x}`, `{% %}`) and XML/HTML tags
are isolated before any rule runs. If a rule ever did make one of those
disappear, that rule is discarded and the rest carry on.

**3. Tells you where the money actually is.** Beyond the trimming, it flags
what usually saves more than shortening ever will:

| Advisory | Why it matters |
|---|---|
| Prompt caching | Reading from cache costs 10% of input. The saving is computed over the **real stable prefix**: in a template with `{{placeholders}}`, only what precedes the first one is cached — not the whole prompt. |
| Reorder the template | Stable instructions sitting *after* the first variable placeholder never cache today. Trazum finds them and prices moving them in front. |
| Batch API | 50% off input and output when the work tolerates latency. |
| Cheaper model | Complexity heuristic: if the task looks simple, what dropping a tier would save. |
| Output-dominated cost | If you pay more for the answer than for the prompt, shortening the prompt has a ceiling. |
| Promotional pricing | Warns when you are budgeting with an introductory price that expires. |
| Context window | If the prompt does not fit, the call is going to fail. |
| Contradictory instructions | "Answer in English" three paragraphs above "reply in the customer's own language". The model has to pick one, and which one can change between calls — a correctness problem that also costs tokens twice. |
| Redundant examples | Few-shot examples that are near-copies of an earlier one, and what they cost per month. |
| Output format stated twice | A schema shown in a code block and then walked again in prose. The block is the version worth keeping. |

The last three are **advisory only**. A contradiction has a right answer that only
the author knows, and an example that looks redundant may be demonstrating a
boundary case on purpose. Trazum points; it does not cut.

The example detector finds near-copies — the way few-shot blocks actually grow,
by copy-paste-and-tweak. It deliberately does not flag *paraphrases*: the same
lesson in different words scores close enough to two genuinely distinct
examples that catching it would mean flagging examples that teach different
things. That case needs a model, and is on the roadmap for the LLM pass.

**Reviewing an aggressive run.** Every rule reports what it actually changed,
so the level that saves the most is judged rule by rule rather than as one wall
of diff — and a single rule you disagree with comes off with `--disable`:

```
  [aggressive] Intensifiers (3×, ~6 tokens)
      VERY → —
      extremely → —
      quite → —
  [aggressive] Self-verification instructions (1×, ~17 tokens)
      You should double-check your answer before re… → —
```

**4. Optionally, runs it past an LLM.** The result is only accepted if it is
shorter and leaves protected content byte-identical. Otherwise the deterministic
version stands. It never returns something worse than where it started.

---

## Getting started

```bash
npm install
npm run build      # core + cli
npm test           # 358 tests
```

### CLI

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

```
Input tokens
  190 → 137   -27.9% (estimated, ±15%)

Rules applied
  [safe] Repeated paragraphs (1×, ~19 tokens)
  [safe] Wordy phrasing (1×, ~3 tokens)
  [safe] Politeness formulas (4×, ~19 tokens)
  [safe] Filler and throat-clearing (2×, ~11 tokens)

Cost with Claude Opus 5
  50,000 calls/month · 300 output tokens per call
  $422.50 → $409.25   saving $13.25/month (3.1%)

Beyond shortening the prompt
  → This task may not need Claude Opus 5 ~$327.40/month
  → If the work tolerates latency, use the Batch API ~$204.62/month
```

Other commands:

```bash
node packages/cli/dist/index.js models    # pricing table and cache minimums
node packages/cli/dist/index.js rules     # what each rule does, and its id
node packages/cli/dist/index.js --help
```

When redirected it writes only the optimised prompt, so it pipes cleanly:

```bash
cat prompt.md | node packages/cli/dist/index.js optimize - > prompt.optimised.md
```

To install it as a `trazum` command:

```bash
npm link -w @trazum/cli
```

**Token budgets in CI.** `trazum check` exits 1 when the prompt busts its
budget, so a template that grows unchecked breaks the build instead of the bill:

```bash
trazum check prompts/system.txt --max-tokens 2000
# FAILED 2,481 tokens busts the budget of 2,000.
#   Optimised with "trazum optimize --level safe" it would land at ~1,913 tokens and fit.
```

In GitHub Actions, use the packaged action — nothing to install:

```yaml
- uses: actions/checkout@v7
- uses: Davmunrey/Trazum@main
  with:
    target: prompts/system.txt
    max-tokens: 2000
```

**The report lands in the run summary automatically** — every run, pass or fail,
with no token and no permissions. To also post it as a pull request comment that
replaces its own previous one:

```yaml
permissions:
  contents: read
  pull-requests: write     # the action cannot grant itself this

steps:
  - uses: actions/checkout@v7
  - uses: Davmunrey/Trazum@main
    with:
      target: prompts/            # a directory uses trazum.config.json budgets
      comment: true
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Commenting can never fail your build.** No pull request, comments disabled, or
a read-only token — each prints a notice and carries on, because the report has
already reached the run summary. That matters on **pull requests from forks**,
where `GITHUB_TOKEN` is read-only by design and the comment simply will not post.

If you go looking for a way around that, the answer you will find is
`pull_request_target`. **Don't.** It runs with a writable token against the base
repository while checking out code the contributor controls, which turns "we
wanted to comment on a PR" into arbitrary code execution with your secrets. The
run summary is there precisely so you do not need it. Trazum asserts in CI that
it uses `pull_request_target` nowhere.

A passing report is collapsed; a failing one is not. A green table that stays
green on every push is the thing you learn to skip — and then you skip the red
one too.

Or by hand, if you already have the repo checked out:

```yaml
- run: npm ci && npm run build
- run: node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

### Does the shorter prompt still work?

Every other number here is arithmetic. This one is not, so `trazum eval` runs
both versions over a set of inputs and compares the answers:

```bash
trazum eval prompts/system.txt --cases cases.txt --level aggressive
```

```
Agreement
  100%  the original prompt with itself  ← the yardstick
   64%  the optimised prompt with the original

  Diverges
    The model is consistent with itself and markedly less so with the rewrite,
    so the optimisation changed what the prompt asks for.
```

**The yardstick line is the whole point.** A model asked the same question
twice does not answer identically, so "diverged on 3 of 10 cases" means nothing
on its own — it might be better than the original manages against itself. So
the original runs twice per case first, and the rewrite is judged against the
model's own variance rather than a determinism it never had.

That costs three calls per case, and the count is printed before any of them
goes out. It exits 1 on `diverges`, so it can gate a pull request. When the
original cannot agree with itself often enough to judge anything against, it
says `inconclusive` rather than inventing a verdict.

Cases are one input per line (`#` comments ignored) or a JSON array.

### A whole repository of prompts

Point `check` at a directory and it governs all of them in one CI step, using
per-pattern budgets from `trazum.config.json`:

```bash
trazum check prompts/
```

```
prompts/ — 5 prompts

  OK      14 / 20   prompts/classify.txt
  OK      15 / 20   prompts/extract.txt
  OK       8 / 20   prompts/nested/notes.md
  OK       7 / 20   prompts/notes.md
  FAILED  30 / 15   prompts/system.txt
            Even optimised it does not fit (~20 tokens): content has to be cut by hand.

  1 of 5 over budget.
```

Two things it deliberately will not do quietly. **A file no pattern covers is
listed as `(no budget)`**, not skipped — otherwise a prompt can sit outside
every pattern for months while the report says everything is fine. And **a run
where nothing at all was budgeted is an error**, because "checked 40 files, 0
failures" from a run that measured nothing is the most misleading thing this
tool could tell you.

It does not follow symlinks, caps how deep and how wide it walks, and says so
when a cap stopped it early.

`--markdown-out <file>` writes the same report as GitHub-flavoured markdown, for
a step summary or a PR comment. `check` and `diff` both take it, it is written
before any exit code is set, and a failure to write it is reported rather than
turned into a failing build.

### Project defaults: `trazum.config.json`

Every key is optional. Found by walking up from the working directory and
stopping at the repository root, so a subdirectory inherits the project's
settings.

```json
{
  "level": "safe",
  "usage": {
    "model": "claude-opus-5",
    "callsPerMonth": 50000,
    "avgOutputTokens": 300,
    "cacheHitRate": 0.9,
    "batchEligible": false
  },
  "budgets": {
    "prompts/**": 2000,
    "prompts/system.txt": 4000
  },
  "maxGrowth": 100,
  "extensions": [".txt", ".md"],
  "disable": ["intensifiers"],
  "locale": "en"
}
```

**Flags beat the config; the config beats the defaults.** A config that could
override an explicit flag would make every flag a suggestion. A boolean the
config switched on comes back off with `--no-batch`, so a setting written into
the repository is not one you have to edit the repository to escape.

Budgets resolve to the **most specific matching pattern**, and "specific" has a
stated definition rather than a felt one: most literal characters wins, longest
pattern breaks a tie. So `prompts/system.txt` beats `prompts/*.txt` beats
`prompts/**` beats `**`. The JSON report names the pattern each budget came
from — a file failing against a budget you cannot locate is a bug report, not a
fix. Pattern order in the file never matters.

**An invalid config is a hard error, including an unknown key:**

```
Error: trazum.config.json: unknown key "budgts" — did you mean "budgets"?
```

That is the whole design of the parser. A lenient one would restore defaults
silently, and for a budget the default is *no budget* — a green build for a
prompt nobody measured. Same reasoning as `--max-growh` being rejected rather
than ignored.

`maxGrowth` in the config arms the `diff` gate exactly as the flag does: a
repository that wrote the number down has opted in as deliberately as somebody
typing it. Absent both, growth alone still exits 0.

`--config <file>` skips the search. `locale` is the one setting the environment
outranks — see [Languages](#languages).

### Did this edit make it worse?

`optimize` answers "how much fat is in this prompt". `diff` answers the
question a pull request actually raises:

```bash
trazum diff prompts/system.txt prompts/system.new.txt --calls 50000
```

```
prompts/system.txt → prompts/system.new.txt

  20 → 57 tokens   +37 (+185%)
  +$9.25/month at 50,000 calls with Claude Opus 5

  New problems
    ! contradictory-instructions
```

**Read the signs carefully — they are the opposite of everywhere else here.**
Every other figure Trazum prints is a *saving*: before minus after, positive is
good. Every figure `diff` prints is a *delta*: after minus before, positive is
**bad**. That is deliberate, it is stated in the one place it applies, and the
negation happens exactly once in the code so the two conventions cannot leak
into each other.

It reports what the edit *broke*, not just what it cost — advisories that
appeared, rules that started firing — and the same in reverse when the edit
improved things.

It measures **the text as written**, not what the rules would leave. A pull
request changed the file on disk, so the file on disk is what you are being
asked about; optimising both sides first would hide a prompt that doubled in
length but happened to double in courtesy. `--optimized` switches the figures
to the post-rules text if you already run Trazum in your pipeline.

**The gate is opt-in.** Growth alone exits 0. `--max-growth 10` is what makes a
prompt that grew more than 10% exit 1:

```bash
trazum diff old.txt new.txt --max-growth 10
```

A tool that fails a build nobody armed gets removed from the pipeline rather
than fixed. And `--max-growh` is rejected with *"Did you mean --max-growth?"*
rather than ignored — a silently-swallowed gate flag means CI green while you
believe a limit is set.

### Web

```bash
npm run build:web
npm run dev:web        # http://localhost:3000
```

An interface for pasting a prompt, tuning the usage scenario, and reading the
word-by-word diff, the saving and the advisories. Includes optimisation history
stored only in the browser — nothing leaves your machine.

The HTTP API behind it is public and small:

```bash
# Metadata: models, and whether an LLM is configured on the server
curl https://your-deployment/api/optimize

# Optimise
curl -X POST https://your-deployment/api/optimize \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "Please, in order to help me, analyse {{x}}. Thanks!",
    "level": "safe",
    "locale": "en",
    "usage": { "model": "claude-opus-5", "callsPerMonth": 20000, "avgOutputTokens": 300 }
  }'
```

The endpoint is rate limited (30/min per IP) and, in production, only accepts
`https` LLM endpoints pointing at public addresses (SSRF protection).

### Deploying to Vercel

The repo is an npm workspaces monorepo; Vercel handles it with no special
configuration:

1. Import the repository in Vercel.
2. **Root Directory**: `apps/web`. The rest — installing from the workspace
   root, building `@trazum/core` via `prebuild` — is automatic.
3. Optional variables: `TRAZUM_LLM_*` to offer the LLM pass without users
   supplying keys, `NEXT_PUBLIC_POSTHOG_KEY` for analytics.

### Library

```ts
import { optimize, refineWithLlm, openAiCompatible } from '@trazum/core';

const result = optimize(prompt, {
  level: 'safe',
  locale: 'en',
  usage: {
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 500,
    cacheHitRate: 0.9,
    batchEligible: false,
  },
});

console.log(result.optimized);
console.log(result.savings.monthlySavingsUsd);
```

`comparePrompts` is the API behind `trazum diff`. Note the sign: everything it
returns is `after - before`, so **positive means worse** — the opposite of
`result.savings`, and the reason it lives in its own module.

```ts
import { comparePrompts, formatSignedUsd } from '@trazum/core';

const change = comparePrompts(oldPrompt, newPrompt, { usage });

change.tokenDelta;                      //  +37   (grew)
formatSignedUsd(change.monthlyDeltaUsd) //  "+$9.25"
change.advisories.appeared;             //  ['contradictory-instructions']
change.rules.noLongerFiring;            //  what the edit cleaned up
```

**Two entry points.** `@trazum/core` is browser-safe and imports no Node
builtins — that is enforced by a test that walks the import graph, not by
convention, because the web app bundles it and one `node:fs` import anywhere in
that graph fails the build. Anything that reads the filesystem lives on
`@trazum/core/node`:

```ts
import { loadConfig, walkPrompts } from '@trazum/core/node';

const { config, path } = await loadConfig();   // null path = none found
const { files, truncated } = await walkPrompts('prompts/');
```

`parseConfig` and `budgetFor` are pure functions of their arguments, so they sit
on both.

---

## Languages

Trazum reports in English by default and ships Spanish as a second locale.

**The locale changes the report, never the optimisation.** The same prompt in
any locale produces the same optimised prompt, the same token counts and the
same advisory ids — only the prose differs. That is enforced by tests.

```bash
trazum optimize prompt.txt --locale es      # flag
TRAZUM_LOCALE=es trazum optimize prompt.txt # environment
```

The CLI resolves `--locale`, then `TRAZUM_LOCALE`, then `LC_ALL`/`LC_MESSAGES`/
`LANG`, and last `locale` in `trazum.config.json`. The web app negotiates
`Accept-Language` on the server and offers a switcher that remembers your
choice. The library takes `locale` directly.

**The config comes last on purpose**, and it is the one setting where it does. A
repository writing `"locale": "es"` is choosing the language its CI logs read
in, where `LANG` is usually unset or `C`. A contributor whose own machine says
otherwise should still get their own language. The project sets the floor; the
person at the keyboard wins.

Two things are deliberately not localised: **USD amounts** stay formatted as
`en-US`, because they come from a US price list and a report shared across a
team should show the same number to everyone; and **rule and advisory ids**,
which are stable across locales precisely so you can branch on them.

Adding a language is a message catalogue per package — see
[CONTRIBUTING.md](CONTRIBUTING.md). Note that
`packages/core/src/phrases.ts` is a separate matter: those dictionaries are the
vocabulary Trazum looks for *inside* prompts, and are unrelated to the language
of the report.

---

## Connecting your own LLM

The provider is pluggable. Configure it by environment:

```bash
TRAZUM_LLM_PROVIDER=openai               # openai (default) | anthropic
TRAZUM_LLM_BASE_URL=https://your-llm/v1  # without /chat/completions
TRAZUM_LLM_MODEL=model-name
TRAZUM_LLM_API_KEY=...
```

That is enough for `--llm` in the CLI and the checkbox in the web app. The
OpenAI-compatible format covers vLLM, Ollama, OpenRouter, LM Studio and most
internal gateways.

If your endpoint speaks neither format, `customProvider` lets you define the
request and the response by hand:

```ts
import { customProvider, refineWithLlm } from '@trazum/core';

const provider = customProvider({
  name: 'internal',
  model: 'my-model',
  request: ({ system, user }) => ({
    url: 'https://your-endpoint/generate',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.MY_KEY! },
      body: JSON.stringify({ instructions: system, input: user }),
    },
  }),
  extract: (body) => (body as { output: string }).output,
});

const withLlm = await refineWithLlm(result, provider);
console.log(withLlm.llm.applied, withLlm.llm.rejectedReason);
```

An LLM candidate is **rejected** when it is empty, alters code/URLs/
placeholders, is not shorter, or keeps under 25% of the tokens — that is a
summary, not a compression.

`--llm` also reviews your few-shot examples, in a second call, and only when
there are at least two. This is the one thing the deterministic detector
deliberately will not guess at: two examples teaching the same lesson in
different words score too close to two genuinely distinct ones to separate by
word overlap. The review reports; it never edits.

---

## Token counting

By default Trazum uses a **dependency-free heuristic estimator**: it classifies
by character type (words, numbers, punctuation, CJK, emoji). On ordinary prose
the typical error is around ±15%. It is built for comparing two versions of the
same prompt, which is what it is used for.

For exact numbers, the official counting endpoint does not charge tokens:

```bash
ANTHROPIC_API_KEY=... node packages/cli/dist/index.js optimize prompt.txt --exact-tokens
```

Or from the library:

```ts
import { countTokensAnthropic, withExactTokenCounts } from '@trazum/core';

const exact = await withExactTokenCounts(
  result,
  countTokensAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: 'claude-opus-5' }),
);
```

---

## Limitations, stated plainly

- **Savings are projections, not billing.** They are computed over the scenario
  you describe (calls/month, output tokens) using the table in
  `packages/core/src/pricing.ts`. Check that table before budgeting:
  `PRICING_LAST_REVIEWED` tells you when it was last updated.
- **Output tokens are held constant in the calculation.** A shorter prompt
  often produces somewhat shorter answers, but that depends on the task and
  cannot be promised. The saving shown comes from input only.
- **The model recommendation is a keyword heuristic**, not a judgement about
  answer quality. Measure the difference with your own evaluations before
  dropping a tier in production.
- **The aggressive level can change nuance.** It removes intensifiers, hedges
  and self-verification requests. Read the diff before applying it.
- **Amazon Bedrock and Vertex AI pricing is set by each partner** and is not
  the pricing in this table.

---

## Layout

```
packages/core/     dependency-free library (rules, tokens, pricing, LLM)
  src/segment.ts     isolation of code, URLs, templates and XML
  src/rules.ts       deterministic rules engine
  src/phrases.ts     phrase dictionaries (data, multilingual)
  src/pricing.ts     model and pricing catalogue
  src/structure.ts   contradictions and repeated few-shot examples
  src/similarity.ts  shared near-duplicate scoring
  src/advisories.ts  caching, batch, model and context advisories
  src/llm.ts         pluggable providers and safety checks
  src/i18n/          message catalogues (report language)
packages/cli/      dependency-free CLI
apps/web/          Next.js (App Router)
```

## Updating prices

`packages/core/src/pricing.ts` is the single source of truth. When you change
it, update `PRICING_LAST_REVIEWED` too. The test suite checks the table stays
coherent (output dearer than input, promotions with an expiry date, plausible
context windows).

## Analytics and privacy

- Prompts are **never stored on any server**: optimisation is synchronous and
  history lives in the browser's localStorage.
- Analytics (PostHog) is **off by default**. It only switches on if the
  operator sets `NEXT_PUBLIC_POSTHOG_KEY`, and even then it never sends prompt
  content — only aggregate metrics (reduction percentage, level, model,
  locale).
- LLM keys entered in the UI are used for that request and discarded; they are
  neither logged nor persisted.

## Roadmap and contributing

[ROADMAP.md](ROADMAP.md) covers what is planned and why.
[CONTRIBUTING.md](CONTRIBUTING.md) covers adding a rule or a language.
[VERSIONING.md](VERSIONING.md) covers what counts as public API.
