# The prompt writer — the questions

The first chapter of [the 1.61 arc](plan-1.61.md). `trazum write` starts from
nothing and asks; **what it asks is the product.**

This page is the catalogue. It is derived — `packages/core/test/write.test.js`
fails on a slot that exists in the code and not here, and on a row here for a
slot that does not exist.

## Why a fixed catalogue

No model decides what to ask. The questions are fixed, the follow-ups are
predicates over the answers so far, and the same answers produce the same
interview on any machine. That is what lets [the offline
rule](../ROADMAP.md) hold without a footnote: an interview that needed a
network call to decide its next question would make the rule a footnote on the
first day.

## The three rules the asking follows

1. **A question is only asked when its answer can change the output.** Asking
   for a JSON schema when the answer is prose is waste, and waste is this
   tool's entire subject. Every gate below has an answer set that opens it and
   one that does not — a gate that is always true, or never true, does nothing,
   and the tests prove both directions for each.
2. **The interview stops when nothing left is worth asking.** It says so rather
   than continuing to be thorough at somebody's expense.
3. **[A refusal never arrives bare.](doctrine.md#a-refusal-never-arrives-bare)**
   A prompt cannot be assembled while a required slot is unanswered, and what
   cannot be built is reported with the slots named and what each one unlocks
   beside it.

## Answered, declined, unanswered — three, not two

An answer of `null` is a **decline**: somebody was asked and said no. That is
not the same as never having been asked, and the two are kept apart the way
this product keeps them apart everywhere else. A declined slot is named in the
output rather than silently dropped.

## The slots

Required first, on purpose: somebody who abandons the interview halfway should
have spent their attention on the answers without which there is no prompt at
all.

| Slot | Section | Required | Opens when |
|---|---|---|---|
| `task` | task | yes | always |
| `role` | role | yes | always |
| `inputs` | inputs | yes | always |
| `output-shape` | output | yes | always |
| `output-schema` | output | yes | the shape is `json` or `table` |
| `output-length` | output | no | the shape is `prose` or `list` |
| `audience` | role | no | always |
| `constraints` | constraints | no | always |
| `refusal` | constraints | no | always |
| `examples` | examples | no | always |
| `example-inputs` | examples | no | `examples` was answered |
| `failure-modes` | failure-modes | no | always |
| `model` | — | no | always |
| `budget` | — | no | always |

**A slot with no section changes the report and never the prompt.** `model` and
`budget` decide what the draft is priced against; neither puts a word in the
text. It is the same separation the locale rule makes, one layer up.

## The sections, and why the order is fixed

`role`, `task`, `inputs`, `output`, `constraints`, `examples`, `failure-modes`.

Fixed for a reason this tool can price: prompt caching is a byte-for-byte
prefix match, so everything stable goes first and everything that varies per
call goes last, which makes the cacheable prefix as long as the prompt allows.
Trazum has been reporting the cost of getting that wrong since 1.20; writing it
right by construction is the same finding from the other end.

## The assembly

Answers go under headings in the fixed order above. **Nothing is paraphrased** —
the words are the author's, and a writer that rewrote them would be answering a
question nobody asked it. A slot either opens its section or arrives under a
label (`Audience:`, `Format:`, `Fields:`, `At most:`, `When you cannot answer:`,
`Input:`). A section nobody answered is **omitted**, never written empty.

The headings are English in every locale. They are structure rather than prose —
a contract with the model — and the arc promises the same answers produce the
same prompt byte for byte on any machine *and in any locale*. A heading that
moved with `TRAZUM_LOCALE` would make the prompt a function of the machine that
ran the interview.

**The output is [a contract](json-output.md#the-prompt-draft-document)**,
`prompt-draft`, which `trazum conform` checks. `prompt` is null and never `""`
when required answers are missing, and `missing` is empty exactly when `prompt`
is a string: the refusal and the output are the same fact read two ways and can
never disagree.

## The claim the arc is judged on

 is run over a draft the templates produced, at **all three
levels**, and must recover nothing. A writer whose output this tool still
improves would be selling the cure for a disease it had just caused.

That zero is only worth having if it could have been non-zero, so the same draft
with a verbose phrase pushed into it has to come back non-zero — otherwise a
rules engine that found nothing in anything would satisfy the check forever.

## The three claims, measured

Every draft carries `measured` — or **null**, when there is no prompt to measure.
Null and never an object of zeros: a draft that was never assembled has not been
measured as costing nothing.

| Claim | What it holds |
|---|---|
| `complete` | `required`, `answered`, `declined`, `missing`. **A checklist with its gaps named, and no score** — [nothing continuous invents a number](doctrine.md#nothing-continuous-invents-a-number), and a grade out of ten would be exactly that. |
| `cheap` | `tokens`, `tokenSource`, `model`, `monthlyUsd`, `provenance`, `budgetUsd`, `verdict`, `reason`. |
| `clean` | The `rules` that still fire with their hits, and `tokensRecoverable`. |

**`provenance` is always `estimated`, and it travels inside the object.** Nobody
has sent this prompt yet, so the figure is a projection; a consumer that could
print the money without the provenance would be publishing a projection wearing
a measurement's clothes.

**`monthlyUsd` is null when it cannot be priced**, never 0 — zero reads as free.
And the budget answers three ways, never two: `within`, `over`, or `cannot-tell`
with the reason for the third (`no-budget`, `no-model`, `model-unpriced`), so a
refusal never arrives bare.

`optimize` throws on a model it cannot price, which is right for a command
somebody typed a model into and wrong here — an unpriced model is one of the
three answers, not a crash. So the tokens and the rules are measured first
(neither needs a price) and the money is asked for separately, only when there
is something to ask.

## On the web

`POST /api/write` is the same interview behind a form, and **stateless on
purpose**: the browser holds the answers and sends all of them every time. A
session would mean that endpoint knowing what somebody is halfway through
writing, which is the thing the rest of this product refuses to hold. Nothing
there calls a model either — the surface that has a network by definition is
held to the same rule as the one that does not.

**The browser asks the server what to ask next rather than deriving it.**
`next` and `missing` look alike and mean different things: `missing` holds only
the *required* slots, and the interview carries on through the optional ones.
Deriving one from the other is how a form starts skipping questions.

**Skipping is offered as an answer.** A question a reader cannot decline is a
question they will answer badly to get past — and a bad answer goes into the
prompt, where a decline would have left nothing.

## Ids here, words in the CLI

`@trazum/core` knows a slot exists and what opens it. `packages/cli/src/i18n`
knows how to ask it in a locale. Same split as the rules catalogue, and for the
same reason: **a locale changes the question, never which questions.** Both
locales are held to the catalogue in both directions — a slot with no question
fails the build, and a question for a slot that does not exist fails too.
