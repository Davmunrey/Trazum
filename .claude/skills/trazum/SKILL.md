---
name: trazum
description: Optimise a prompt to cost fewer tokens, or check one against a token budget. Use when asked to shorten, optimise, or cut the cost of a prompt or system prompt; when asked what a prompt costs per month; when asked whether a prompt fits a token budget; or when reviewing a change to a prompt file. Also use when asked to find contradictory instructions or redundant few-shot examples in a prompt.
---

# Trazum — prompt optimiser

Shortens a prompt without changing what it asks for, prices the saving, and
reports what would save more than shortening ever will.

The engine is deterministic: same input, same output, no API key, no network
call, nothing to pay. Do not reach for a model to do what the rules already do.

## Before anything else

Build once per session:

```bash
npm install && npm run build
```

Then `node packages/cli/dist/index.js` is the entry point. If Trazum is
installed globally the command is just `trazum`.

## Optimising a prompt

```bash
node packages/cli/dist/index.js optimize prompt.txt --calls 50000 --diff
```

Useful flags:

| Flag | Use it when |
|---|---|
| `--level aggressive` | The user accepts nuance changes. **Always show the diff after using this.** |
| `--calls <n>` `--output-tokens <n>` | You know the real usage — the dollar figures are meaningless without it |
| `--model <id>` | Pricing against something other than Claude Opus 5 (`models` lists them) |
| `--diff` | Any time a human will read the result |
| `--json` | You need to parse the report |
| `-o <file>` | Writing the optimised prompt somewhere |
| `--locale es` | The user is working in Spanish |

Redirecting output writes **only** the optimised prompt, so it pipes cleanly:

```bash
cat prompt.md | node packages/cli/dist/index.js optimize - > prompt.optimised.md
```

## Checking a budget in CI

Exits 1 when the prompt busts the budget, and says whether optimising would be
enough:

```bash
node packages/cli/dist/index.js check prompts/system.txt --max-tokens 2000
```

## From code

```ts
import { optimize } from '@trazum/core';

const result = optimize(prompt, {
  level: 'safe',
  usage: { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 500,
           cacheHitRate: 0.9, batchEligible: false },
});

result.optimized;                    // the shortened prompt
result.savings.monthlySavingsUsd;    // projected saving
result.advisories;                   // everything below
```

## How to read the report

The token reduction is usually **not** where the money is. Read the advisories
first — they are sorted warnings-first, then by monthly saving.

- `contradictory-instructions` — **a correctness bug, not a saving.** Two
  instructions disagree about the response language, output format, length, or
  whether to show reasoning. Surface this to the user before anything else; the
  model picks one, and which one can change between calls.
- `cache-prefix-reorder` — stable instructions sitting *after* the first
  `{{placeholder}}` never cache. Moving them in front is often the single
  largest saving available.
- `prompt-caching` / `below-cache-minimum` — caching is a byte-for-byte prefix
  match, so a template only caches up to its first placeholder.
- `model-downgrade` — a keyword heuristic, not a quality judgement. Present it
  as something to validate with evaluations, never as a recommendation to apply.
- `output-dominated` — the prompt is not the problem; the answer length is.
  Shortening the prompt has a low ceiling here, and saying so is more useful
  than reporting a 2% win.
- `redundant-examples` — few-shot examples that are near-copies of an earlier
  one. Read them before deleting: one may be a boundary case on purpose.

## Rules

`node packages/cli/dist/index.js rules` lists all of them with their ids.

- **safe** — no semantic risk: courtesy, filler, verbose phrasing, duplicated
  paragraphs, whitespace.
- **aggressive** — can change nuance: intensifiers, hedges, self-verification
  requests, near-duplicate paragraphs.

Turn individual rules off with `--disable id1,id2`.

## What it will not touch

Code fences, inline code, URLs, template placeholders (`{{x}}`, `${x}`, `{x}`,
`{% %}`) and XML/HTML tags are isolated before any rule runs. If a rule would
make one disappear, that rule is dropped and the rest continue. You can rely on
this: the optimised prompt will not have broken someone's JSON schema.

## Things to get right

- **Token counts are estimates (±15%).** Fine for comparing two versions of the
  same prompt, which is what they are for. For exact figures use
  `--exact-tokens` with `ANTHROPIC_API_KEY` set — the counting endpoint does not
  charge for tokens.
- **Savings are projections over the scenario given**, not billing. Pass real
  `--calls` and `--output-tokens` or say the numbers are illustrative.
- **Output tokens are held constant** in the calculation. The reported saving
  comes from input only.
- **Never present aggressive-level output without the diff.**
- Prices come from `packages/core/src/pricing.ts`; `PRICING_LAST_REVIEWED` says
  when they were checked. Mention it if the user is budgeting.

## The optional LLM pass

`--llm` adds semantic compression the rules cannot do. It costs one call, needs
`TRAZUM_LLM_*` configured, and is **not** needed for ordinary use — the
deterministic pass is free and does most of the work. The candidate is only
accepted if it is shorter and leaves protected content byte-identical;
otherwise the deterministic version stands.
