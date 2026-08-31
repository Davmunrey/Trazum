> Generated from [`README.md`](https://github.com/Davmunrey/Trazum/blob/main/README.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## What it actually does

**1. Tells you where the money actually is.** This is the part worth reading
first, because it is where the numbers are. Every advisory is priced per month
against your own call volume, and none of them is about making the text shorter:

| Advisory | Why it matters |
|---|---|
| Prompt caching | Reading from cache costs 10% of input. The saving is computed over the **real stable prefix**: in a template with `{{placeholders}}`, only what precedes the first one is cached — not the whole prompt. |
| Reorder the template | Stable instructions sitting *after* the first variable placeholder never cache today. Trazum prices moving them in front — and with `--reorder`, [does it](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#reordering-for-the-cache---reorder). |
| Batch API | 50% off input and output when the work tolerates latency. |
| Cheaper model | Complexity heuristic: if the task looks simple, what dropping a tier would save. |
| Output-dominated cost | If you pay more for the answer than for the prompt, shortening the prompt has a ceiling. |
| Promotional pricing | Warns when you are budgeting with an introductory price that expires. |
| Context window | If the prompt does not fit, the call is going to fail. |
| Contradictory instructions | "Answer in English" three paragraphs above "reply in the customer's own language". The model has to pick one, and which one can change between calls — a correctness problem that also costs tokens twice. |
| Redundant examples | Few-shot examples that are near-copies of an earlier one, and what they cost per month. |
| Output format stated twice | A schema shown in a code block and then walked again in prose. The block is the version worth keeping. |
| Schema the request could carry | A schema block introduced by "Output format:" is paid for in input tokens on every call. Every major API now takes a response schema as a *parameter* — and moving it there is both cheaper and stricter. See below. |

The last four are **advisory only**. A contradiction has a right answer that only
the author knows, and an example that looks redundant may be demonstrating a
boundary case on purpose. Trazum points; it does not cut.

#### The one finding that is not a trade-off

Most of what Trazum reports is a choice: shorter against clearer, cheaper against
more capable. Moving an output schema out of the prompt is neither.

```
→ The output schema could travel in the request instead of the prompt
  A schema block introduced by "output format" defines `category`, `reply`,
  `escalate_to_human`, `confidence`, costing about 62 tokens on every call.
```

Those tokens are paid on **every call** to have the model read a shape and be
asked, politely, to match it. `output_config.format`, `response_format`,
`responseSchema` — whatever your provider calls it — takes the same shape as a
request parameter, where the decoder is constrained rather than persuaded. Cheaper
*and* stricter.

**Trazum reports it and never does it**, because it is not a change to the prompt:
it is a change to the code that sends the prompt. A rule that deleted the schema
would leave a prompt asking for a shape it no longer describes, sent by a client
nobody updated — strictly worse than what it started from.

**The one way this could do harm, and what stops it.** `Output format: {...}` is
a contract and moving it is free; `Input: {...}` inside a few-shot example is
*data the prompt needs*, and moving it breaks the prompt. So nothing is guessed:
a block counts only when a phrase from the output-cue dictionary appears
immediately before it, in one of the seven languages the rules cover. No phrase,
no finding — a false negative, which is the right direction to be wrong in.

The example detector finds near-copies — the way few-shot blocks actually grow.
It deliberately does not flag *paraphrases*: that case needs a model, and is on
the roadmap for the LLM pass.

**2. Then it trims the prompt itself.** Twelve deterministic rules: courtesy,
filler, verbose phrasing, duplicated paragraphs, decorative separators, shouting
in capitals. Two levels — `safe` (no semantic risk) and `aggressive` (read the
diff). This is the smallest number on the page more often than not, and it is
reported that way rather than dressed up.

**3. And never touches what would break the prompt.** Code fences, indented code
blocks, inline code, URLs, email addresses, template placeholders (`{{x}}`,
`${x}`, `{x}`, `{% %}`) and XML/HTML tags are isolated before any rule runs. If a rule ever did make one of those
disappear, that rule is discarded and the rest carry on.

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
version stands. It never returns something worse than where it started. With
`--suggest` it proposes phrases one at a time — `You should always make sure to →
Always` — each checked against your prompt before you see it, so eight surviving
out of ten is a useful morning rather than a rewrite to read end to end.

**5. Answers the questions that come before "shorten this".** Trimming one file
is the smallest thing here. `optimize` is one of 46 commands — [the table
above](https://github.com/Davmunrey/Trazum/blob/main/README.md#the-46-commands) names what each answers — because knowing a prompt
is wasteful is not the same as knowing *which* prompt, *whose* change made it so,
or whether the shorter version still works.

`check`, `diff`, `rank` and `blame` all take `--markdown-out`, so the answer can
land in a pull request comment rather than a terminal nobody is looking at.

**It gates in whatever CI you already run.** One binary, two exit codes, and
[worked recipes for GitLab CI, Jenkins, CircleCI and a pre-commit hook](https://github.com/Davmunrey/Trazum/blob/main/docs/ci.md)
— no vendor plugin, because each one would be a second code path that drifts
from the exit codes it is supposed to relay.

---
