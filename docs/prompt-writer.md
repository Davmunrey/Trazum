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

## Ids here, words in the CLI

`@trazum/core` knows a slot exists and what opens it. `packages/cli/src/i18n`
knows how to ask it in a locale. Same split as the rules catalogue, and for the
same reason: **a locale changes the question, never which questions.** Both
locales are held to the catalogue in both directions — a slot with no question
fails the build, and a question for a slot that does not exist fails too.
