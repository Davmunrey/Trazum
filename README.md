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
npm test           # 179 tests
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
    file: prompts/system.txt
    max-tokens: 2000
```

Or by hand, if you already have the repo checked out:

```yaml
- run: npm ci && npm run build
- run: node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

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
`LANG`. The web app negotiates `Accept-Language` on the server and offers a
switcher that remembers your choice. The library takes `locale` directly.

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
