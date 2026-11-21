# Mutation testing

A passing test suite says the code does what the tests ask. It does not say the
tests ask enough. Mutation testing asks the second question, mechanically:
change one small thing in the code, run the tests, and see whether anything
fails. A change the tests catch is a **killed** mutant. One they do not is a
**survivor**: a line that could be wrong without anybody being told.

This repository already did that by hand. Every pull request plants a few
faults and says which test caught each. That proves the guards somebody thought
to try. `scripts/mutate.mjs` tries the ones nobody thought of, on the files
where a wrong line costs most.

## Where it stands

<!-- mutation-score:start -->
Recorded on 2026-11-18: **92.3%** of 801 mutants caught.

| File | Mutants | Caught | Alive | Score |
| --- | --- | --- | --- | --- |
| `optimize.ts` | 105 | 98 | 7 | 93.3% |
| `segment.ts` | 103 | 90 | 13 | 87.4% |
| `rules.ts` | 131 | 121 | 10 | 92.4% |
| `savings.ts` | 62 | 60 | 2 | 96.8% |
| `session-cost.ts` | 74 | 71 | 3 | 95.9% |
| `billing.ts` | 35 | 31 | 4 | 88.6% |
| `pricing.ts` | 212 | 190 | 22 | 89.6% |
| `usage.ts` | 79 | 78 | 1 | 98.7% |
| **All** | 801 | 739 | 62 | 92.3% |
<!-- mutation-score:end -->

A survivor is not a bug. It is a place where a bug would not be noticed.

The first whole run, on 2026-11-17, caught **62.1%**: 277 of 446. Five test
files written from what it found, and the tests written for each target added
since, brought that to the figure above. What it
found was specific. A cache read could be divided by its multiplier instead of
multiplied, in the cost of a conversation. The median could take the wrong
element of any list whose middle values differ. The percentage a prompt was
reduced by could be a hundredth of itself. Two protected spans that touch
could lose one of them. Every one of those passed 2,994 tests.

Only the core's own tests are asked. A mutant that a CLI test would catch and
no core test does is counted alive, on purpose: the core is published by
itself and should hold itself.

## What is mutated

The built JavaScript of six files, and of the functions that choose and apply
a rate in two more, chosen for what a mistake in them does:

- `optimize.ts`, `segment.ts` and `rules.ts` turn a prompt into a shorter
  prompt. A wrong line there changes what somebody's model is told.
- `savings.ts` and `session-cost.ts` turn token counts into money.
- `billing.ts` says, for every call the bill and its findings price, the
  moment it was billed at, the size of prompt that picks its band, how it ran,
  and what its web searches cost. A wrong line there misprices every call.
- In `pricing.ts`, the code and not the numbers: `effectivePricing` and what
  it calls to choose a call's rate (`holds` for a band or an hour,
  `pricedAt` for the price history, `cache` for a promotion,
  `serviceTierOf` and `serviceTierRow` for a service tier,
  `inferenceGeoOf`, `scaleRates` and `scaled` for a geography and the batch
  ratio), and `multipliersFor`, which gives the cache and batch ratios.
- In `usage.ts`, `add`: where a record's tokens are multiplied by those rates
  for the bill and for the lines said apart from it.

A target is a whole file, or `{ file, functions }` in `TARGETS`: the named
top-level functions of one file and nothing else in it. They are found in the
built file's syntax tree, and a name the file does not declare, or a listed
function with nothing in it to change, stops the run before a mutant is made,
so a renamed function cannot leave a target quietly empty.
`npm run mutate -- --acorn "$ACORN" --list` counts each target's mutants and
runs nothing.

Twelve kinds of change:

| Kind | Example |
| --- | --- |
| `comparison` | `a < b` into `a <= b` and into `a >= b` |
| `equality` | `a === b` into `a !== b` |
| `logical` | `a && b` into `a \|\| b`; `a ?? b` into `a && b` |
| `arithmetic` | `a * b` into `a / b`; `a - b` into `a + b` |
| `assignment` | `a += b` into `a -= b` |
| `negation` | `!a` into `a` |
| `update` | `a++` into `a--` |
| `boolean` | `true` into `false` |
| `number` | `400` into `401` |
| `condition` | `if (a)` into `if (true)` and `if (false)`; a loop only into `false` |
| `method` | `some` and `every`, `startsWith` and `endsWith`, `Math.min` and `Math.max` |
| `call-removed` | `list.push(x);` into `;` |

## What is not mutated

So the score is not read as more than it is:

- **Regular expressions.** The optimiser's rules are mostly regular
  expressions, and none of this touches one. Those are held by
  `courtesy.test.js`, `protected-prose.test.js` and the seeded properties.
- **The contents of strings**, and a `+` that joins text.
- **What a `for` loop counts with**, however it is written. Sent the other
  way it never reaches its bound: the only possible outcome is a hang, which
  says nothing about the tests. The loop's start and its bound are mutated.
- **Every file and function not listed above.** The whole core had 15,800
  possible mutants on 2026-11-18, over its 121 built files; this runs 801 of
  them, 5.1%. Before `pricing.ts` and `usage.ts` were added it ran 510, 3.2%.
- **The price table's numbers.** They are a different question from the code
  that chooses one of them, and they have their own answer below.

### The catalogue's numbers

Whether a test would fail if a published price were wrong. Measured on
2026-11-18 by the same kind of change the tool makes, one number moved up by
one at a time in the built `pricing.ts`, served through the same loader to
every test file of the core but `mutation.test.js`, 200 of them, until one
failed. A test that reads a clock and failed was believed only when it failed
again. Moving a ratio of 0.025 by one is a large mistake, so this asks whether
anything notices a price that is plainly wrong, not a price that is a cent
off.

`pricing.ts` has 786 numbers outside its functions that the tool would
change. 681 of them are published prices: an input or output rate per million
tokens, of a row, a band, a promotion, a period of the price history or a
service tier; a cache read, cache write or batch ratio; the US-only
multiplier; and the web search fee. The other 105 are cache minimums, the
hours of a clock-priced band and cache lifetimes.

**Of the 681, a sample was measured, not all of them**: every tenth in the
order they appear in the file, the first included, 69 prices. They took 1,017
seconds on the four-core machine described below; the 681 would take about
ten times that. **50 of the 69 are held**: a test fails when the number moves.
19 are not. 12 of those are in OpenAI's service-tier tables, the Flex and Fast
rows and their long-prompt bands. 4 are cache-write ratios of 1, on
GPT-4.1, Gemini 2.5 Flash, DeepSeek V4 Flash and DeepSeek V4.1 Flash. 3 are
Mistral's: Large 2's input rate, Medium 3.5's output rate and Small 4's batch
ratio.

**All 681 are held since #763**, measured on 2026-11-20 the same way, one
number moved up by one at a time in the built file: 681 of 681 fail
`price-snapshot.test.js`, in 28 seconds on the same machine, the 19 above
among them. That test compares the catalogue with
`packages/core/test/fixtures/price-snapshot.json`, which
`scripts/price-snapshot.mjs` writes from the catalogue: every row the pricing
dataset publishes, the default ratios, and each provider's date and pages.

"Held" here means one thing: a published price cannot move without a second
diff, in the snapshot, that a reviewer reads in the same pull request. It holds
every number at once and says nothing about whether one is right. That is the
question of the page the price was read from and of the weekly drift check,
and a price is never called verified because this test holds it.

A test per provider table that prices a call at each rate was the other way to
do it. It was not chosen: each expected figure would have to be typed from the
catalogue or from the provider's page, which is either a copy that proves
nothing or a price remembered into a test. The snapshot is written by a script,
never by hand.

Whether the other test files also hold each of the 681 was not measured: the
sample above is the only figure for that, and with the snapshot in place it no
longer decides whether a price is held.

## How a mutant is run

`dist` is never edited. `scripts/mutant-loader.mjs` serves the changed text to
one process in place of the built file, so an interrupted run leaves nothing
behind and several mutants run at once.

Each mutant is given only the test files whose coverage includes the place it
changes, the ones that have killed most first, and stops at the first failure.
A mutant no test file reaches is not run at all and is reported as
**uncovered**, which counts against the score exactly as a survivor does. A
mutant that makes a test hang past its time limit counts as caught.

Six of the core's test files assert that something finishes within a budget. With several of them running at once on a shared
machine, such an assertion can fail with no mutant in sight, and a failure
that is about load is not a caught bug. So a failure from a test file that
reads a clock is believed only when it fails again with nothing else running.
(The rule goes by what a file mentions and matches nine, three of which only
ask what day it is: a second look that was not needed costs seconds.)
Those files are also tried last, so that most kills are made by a test that
measures nothing and needs no second look. A run says at its end which files
failed once and passed alone.

Some tests edit a tracked file and put it back. One that is stopped at its
time limit does not get to, so the run compares `git status` before and after
and names any file the tests left changed.

Two checks run before any mutant, for every target, because both ways this can
be wrong look like a result. A loader that silently did nothing would report
every mutant alive. One that broke every import would report every mutant
killed, and that mistake reads as a perfect score. So each target is served
once unchanged, which must pass, and once as a file that only throws, which
must fail. Every mutant is also parsed before it is run: a syntax error is not
a caught bug.

## The check on the tool itself

A survivor is a mutant that every test *given to it* passed. If coverage is
read wrongly, a test that would have killed it is never given it, and it is
reported alive. That happened on the first day: V8 reports the right-hand side
of `a ?? b` as a range of its own, counted zero when `a` was never null, and
that range contains the operator. Asked at the operator, a test that had
evaluated the expression answered "never ran", and `record.label ?? UNLABELLED`
was reported alive when `session-cost.test.js` kills it. The question is now
asked at the start of the expression.

`--audit n` is what would have caught it: it takes n recorded survivors and
runs each against every test file it was *not* given. One failure means the
choice of tests is wrong and no score should be read until it is fixed.

Last run on 2026-11-18, over the 38 survivors that were on record that day:
none was killed by a test it had not been given. It took 614 seconds. The
record holds 62 now; the 23 added with `pricing.ts` and `usage.ts` have not
been audited.

It costs a whole suite per mutant, so it is run when the way tests are chosen
changes, not on every run.

## Running it

It needs a parser and no package has one, so it is installed from a manifest
and lockfile of its own in `.github/tools/acorn`, which pin it by hash, the way
CI installs it. Nothing published depends on it.

```bash
npm run build -w @trazum/core
npm ci --prefix .github/tools/acorn --ignore-scripts
ACORN=.github/tools/acorn/node_modules/acorn

npm run mutate -- --acorn "$ACORN"                    # every target, and every survivor
npm run mutate -- --acorn "$ACORN" --only segment     # one file
npm run mutate -- --acorn "$ACORN" --list             # count each target's mutants, run nothing
npm run mutate -- --acorn "$ACORN" --since origin/main --check   # only the lines you changed
npm run mutate -- --acorn "$ACORN" --survivors        # only the recorded survivors
npm run mutate -- --acorn "$ACORN" --write            # record a whole run, and its score above
npm run mutate -- --acorn "$ACORN" --without a.test.js   # as if a test file did not exist
npm run mutate -- --acorn "$ACORN" --audit 20         # is the choice of tests right? see below
TRAZUM_ACORN="$ACORN" npm run test:mutation           # the tool itself, against the real parser
```

A killed mutant costs one test file. A survivor costs every test file that
reaches it, so a whole run gets shorter as survivors are killed: on four cores
it took 1,595 seconds at 62.1% and 662 seconds at 91.5%. On a GitHub-hosted
runner the same run took 1,259 seconds on 2026-11-18 and caught the same 408
of 446, file by file, with no test failing once and passing alone. On a
four-core machine shared with other test runs, the whole run took 1,405
seconds over five files and 475 mutants, and 1,400 seconds over six files and
510, both on 2026-11-18.

With `pricing.ts` and `usage.ts` added, the whole run, eight targets and 801
mutants, took 2,122 seconds on 2026-11-18. The machine was four cores of an
Intel Xeon at 2.10 GHz with 15 GB of memory, and another checkout's test
suite was running beside it for part of that time. `pricing.ts` alone took
230 seconds and `usage.ts` alone 110, with every test file run once for
coverage in each. What the same run takes on a GitHub-hosted runner is read
from the first run of the workflow after this change; it was not measured
here, and the workflow's limit of 120 minutes is above every time measured.

## In CI

The `Mutation testing` workflow runs on a pull request that changes the core's
source, the tool or the record, and asks only about the lines that pull request
changes: **a mutant that lives on a line you changed, and is not on record,
fails the check.** Every Monday it runs every target, which is also when a test
deleted by a pull request that changed no target would be noticed.

A pull request that changes the tool, its record or the workflow also runs one
small target whole. Without that, such a pull request has no changed line to
ask about and returns before it has run a single test, which is how the
workflow first merged green and could not run: it built only the core and
checked out one commit, and four test files need more than that (#698). Every
test file has to pass before a mutant is run, and when one does not the run
now prints what it said, not only its name.

## Reading a survivor

```text
packages/core/src/segment.ts:235  comparison
    - const overlapping = (start, end) => reserved.find((range) => start < range.end && end > range.start);
    + const overlapping = (start, end) => reserved.find((range) => start <= range.end && end > range.start);
```

The line is the TypeScript line; the two lines of code are the built file
without and with the change. Ask what input would make those two behave
differently. For this one: a protected span that starts on the character where
another ends. No test had two spans that touch, and now
`segment-edges.test.js` does.

That line is no longer in the file. It looked at every reserved range for
every match, which made the segmenter's work grow with the square of the
spans in a text, and it was replaced by a search that halves (#716). The
example is kept as it was read. The search that replaced it added 29 mutants
and none of them lives.

There are three honest outcomes:

1. **A test was missing.** Write it. This is most of them.
2. **The change makes no difference.** `if (list.length > 0)` in front of a
   loop over the list is a shortcut; forcing it to `true` changes the time and
   not the answer. Leave it on record.
3. **The code cannot be reached.** A guard against a match of no length, in a
   file where no pattern can produce one. Either the guard goes or it stays on
   record; a test cannot be written for an input that does not exist.

### What is on record

Of the 62 on record, as read on 2026-11-18. This is a reading, not a proof:

- **29 are changes that make no difference.** Six are shortcuts: a test for
  "is there anything to do" in front of code that does nothing when there is
  not (`segment.ts` 194, 196, 310), and the early exit from the fixed-point
  loop (`optimize.ts` 187). Forcing them changes the time and not the answer.
  Three write a field the call left out as present and undefined
  (`billing.ts` 38, 39, 40): everything that reads the field asks whether it
  is undefined, and an absent field is. One lets a call with no web searches
  through to the arithmetic (`billing.ts` 56), where no searches cost nothing.
  In the code that chooses a rate, nine are its memos, forced to build again
  or not to keep what they built (`pricing.ts` 272, 274, 2928, 2930, 2933,
  2941, 2962, 2979, 3009): the same row comes back, later. Six more are
  shortcuts: a dated question that finds the current period asked again
  without the date (`pricing.ts` 267), the price history asked about a row
  that has none (3086), a service tier looked for when none was named or the
  row has no table of them (3094 twice, 3096), and a geography other than
  `us`, which finds no multiplier either way (3066). Three write bands or
  ratios a row does not have as present and undefined (`pricing.ts` 2939,
  2970, 2973), which is read as having none. And a call with no web searches
  adds no unpriced searches whether or not it is counted (`usage.ts` 1324).
- **15 guard an input that does not arrive.** A match of no length, where no
  pattern can produce one (`segment.ts` 288, 289, 293). More protected spans
  than there are masks, where the cap moving by one only matters on a
  collision (`optimize.ts` 27, 57). An unpriced model, turned away twice (`session-cost.ts` 119, 144). A
  percentile's index clamped to a bound it never passes (`session-cost.ts`
  109). A zero already handled a line earlier (`savings.ts` 140). An empty
  replacement, which no entry has (`rules.ts` 137). The price history of a
  row that has none (`pricing.ts` 2960, twice): both callers ask whether it
  has one first.
- **3 are a cap nothing reaches.** Five passes to a fixed point
  (`optimize.ts` 141, 142). No prompt in the suite needs the fifth.
- **15 are not settled.** The longest-phrase-first sorts (`rules.ts` 115,
  210, 226), two lines of the rule about a thanks under a colon (`rules.ts`
  271, 278), one branch of keeping a capital (`rules.ts` 139), the 0.92
  similarity at which a block is a near-copy (`rules.ts` 422), a promotion
  that applies to one side of a comparison (`savings.ts` 63), and how the scan
  resumes after a reservation (`segment.ts` 300). And which is the dearer
  of two rates with the same input price and different output prices, when
  a band cannot be decided: two bands (`pricing.ts` 3136), or a band and the
  base (3144). The ceiling is the dearer candidate, and no document says
  which of those is dearer. Each of these is either
  a missing test or a line that can be simpler. They are the work this record
  leaves.


`mutation.baseline.json` is the record: each file's score and every survivor,
named by a digest of its file, its function and the changed line, so adding a
comment above one does not make it look new. After killing survivors, run
`--write` and commit the record; the check says so when recorded survivors are
gone.

## Adding a file

Add its path to `TARGETS` in `scripts/mutate.mjs`, run it with `--only`, kill
what is worth killing, and record a whole run. For part of a file, add
`{ file, functions }` instead, naming its top-level functions; `--list` says
how many mutants that makes before anything is run. The pull request says what the
first run found. A file is not added with its survivors unread.

Until the record names the new file, `mutation.test.js` fails before any
mutant is run, because it holds the record to `TARGETS`. That test file
reaches none of the core's source, so the `--only` run can leave it out with
`--without mutation.test.js`. The whole run cannot, and `billing.ts`,
`pricing.ts` and `usage.ts` were recorded by first giving each a row of zeros
in the record and the table, which `--write` then replaced.
