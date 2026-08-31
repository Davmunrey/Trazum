> Generated from [`README.md`](https://github.com/Davmunrey/Trazum/blob/main/README.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## Every model you pay for by the token

Trazum prices Anthropic, OpenAI, Google, Moonshot, DeepSeek, xAI and Mistral:

**Every report says how old the prices are** — the date the table was checked and
how many days ago that was — because every dollar figure descends from that list,
and a date on its own makes you subtract against today to learn whether to trust
it. Past 45 days the report says so in a sentence, rather than leaving the reader
to decide what "old" means.

The 7 providers publish independently, so each carries its own review date and
`trazum models` prints them; the headline figure above is the oldest of the seven,
because the question "how old is this table" is about its worst part.

```bash
trazum optimize prompt.txt --model gpt-5 --calls 50000
trazum optimize prompt.txt --model kimi-k2
trazum models                      # the whole table, with each provider's terms
```

Everything that reads the prompt is provider-agnostic already — the rules, the
protection pass, `--reorder`, the contradiction and example detectors all operate
on text. What differs is the money, and **that is not one set of numbers**:

| | |
|---|---|
| Cache read | 10% of input on Anthropic, OpenAI and Moonshot; **25%** on xAI. Two providers changed it **between generations**: DeepSeek V4 reads at about **3%** where V3 read at 10%, and Google's 3.6 Flash reads at 10% where the retired 2.5 models read at 25% |
| Cache write | 125% of input on Anthropic; 100% elsewhere |
| Cache minimum | **Per model, not per provider.** Anthropic alone spans 512 to 4,096; 1,024 on OpenAI, Moonshot, DeepSeek, xAI and Gemini Flash; 2,048 on the retired Gemini Pro |
| How caching starts | You mark the prefix on Anthropic and Google; it is **automatic** on OpenAI, Moonshot, DeepSeek and xAI |
| Batch API | 50% on Anthropic, OpenAI, Google and Mistral; **none at all** on Moonshot, DeepSeek and xAI |
| Prompt caching | **None at all** on Mistral |

**The cache minimum is the row to read twice, and it used to be wrong here.** This
table said *"512 on Anthropic"* flatly. Anthropic's floor is a property of the
model: 512 on Fable 5, Mythos 5 and Opus 5; 1,024 on Opus 4.8, Sonnet 5 and
Sonnet 4.6; 2,048 on Opus 4.7; **4,096 on Opus 4.6 and Haiku 4.5**. A reader on
Haiku who trusted "512" would have built a prefix eight times too short and been
told caching would save money that could never arrive — the one direction this
tool must never be wrong in. `trazum models` prints the real figure per model,
and every cache advisory has always used it; only this table was wrong.

Those last two rows are why the multipliers had to move onto the model. As global
constants they offered a batch discount to providers that do not sell one and a
caching saving to a model that has no cache — invented savings, which is the one
thing this tool must not print. A provider with no batch API now gets no batch
advisory, and no discount even if you tick the box: `batchEligible` describes the
work, not what the provider sells.

**A cheaper model means a cheaper model, not a different supplier.** The downgrade
advisory only ever suggests models from the provider you are already on. Dropping
a tier is a one-line change; switching vendor is a migration, and this advisory is
a keyword heuristic — it has no business recommending that you change supplier.

**Not covered: Cursor, Claude Code, Codex and other subscriptions.** They do not
bill per token, so "saves $184/month" would be false for anyone inside their plan.
The honest saving there is context-window and rate-limit headroom, which is a
different report rather than a row in this table.

### Optimising a prompt that lives in code

```bash
trazum optimize src/prompts.ts --prompt support --diff
```

It reads the marked prompt and leaves the file alone. **Pointed at an unmarked
source file it refuses**, because optimising TypeScript as if it were prose does
not produce a worse prompt — it produces broken code, and `-o` would write that
back over your file. When a file holds several marked prompts it asks which one
rather than taking the first.

The model comes from the code too, so a file calling OpenAI is priced against
OpenAI. `--model` and `trazum.config.json` still win: flags beat config, config
beats detection, detection beats a built-in default that has no idea which
provider you use.

### Which provider is this prompt even going to?

Since Trazum prices 7 providers, defaulting to Claude became a **wrong
number**: a file calling OpenAI was billed against Claude Opus 5 without comment.
`trazum where` reads what the code already says.

```bash
trazum where src/prompts.ts
```

```
Running inside
  Claude Code (CLAUDECODE)
  Claude Code bills by subscription, not by the token. A monthly saving below is
  arithmetic about tokens, not money you get back — what you gain is context
  window and rate-limit headroom.

Prompts in src/prompts.ts go to
  anthropic · Claude Sonnet 5
    line 2  model-literal: claude-sonnet-5
    line 1  sdk-import: @anthropic-ai/sdk

Priced as
  Claude Sonnet 5 (read from the source)
```

**Every answer names the line it came from.** Four kinds of evidence, strongest
first: `model=` on a `trazum:prompt` marker, a quoted model id, a base URL, an
SDK import — and **a base URL beats the SDK it was pointed at**, because
Moonshot, DeepSeek, xAI and Groq are all called through the OpenAI SDK with a
different `base_url`. **It refuses when a file names two providers**: picking
silently is how somebody budgets against the wrong provider for a month.
Detection sits in the usual layering — a flag beats config, config beats
detection, detection beats the built-in default.

With no file it reports only the host — useful because that is what decides
whether a monthly saving is money at all:

| Host | Bills |
|---|---|
| Claude Code, Codex, Cursor | subscription — the saving is context and rate-limit headroom, not cash |
| GitHub Actions, CI | per token |
| VS Code, plain terminal | unknown, and it says so rather than guessing |

### On a subscription, there is no bill to reduce

Inside Claude Code, Codex or Cursor you pay the same whatever your prompt costs.
A monthly figure there is arithmetic about tokens dressed as money, so Trazum
stops printing one and reports what is actually scarce:

```
What this buys on Claude Code
  Claude Code bills by subscription, so there is no bill to reduce and no
  monthly figure to print.

  1,001 tokens back, every call.
  Context window: 12.4% → 2.1% of Claude Opus 5's 1,000,000 tokens — room the
  conversation gets instead.
  Pass --cost if this prompt is bound for a metered API.
```

The context window is the real currency in an agent: every token the system
prompt holds is one the conversation cannot.

**Advisories whose only pitch is money go too.** "Use a cheaper model" is not
weaker advice on a flat plan — it is not advice. `model-downgrade`, `batch-api`,
`output-dominated` and `promo-pricing` are dropped; caching, context overflow,
contradictions and redundant examples stay, because latency, headroom and
correctness are still real.

**The escape hatch matters.** The host says where *Trazum* runs, not where your
prompt goes — somebody editing a production prompt inside Cursor wants the
dollars, and `--cost` gives them back without leaving the editor. `--tokens-only`
forces the other direction anywhere.
