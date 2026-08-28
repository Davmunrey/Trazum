# 1.83–2.0 — The finish line, named

*Written before the code, like the twenty plans before it.*

## The thesis

Every plan in this directory answered "what should this do next". This one
answers a different question, and it is the one the project has been avoiding:
**when is it done?**

The evidence that the question is overdue is in `ROADMAP.md` itself. Its
`Under consideration` section holds 5 entries, and every one of them is
deferred for a reason that is not engineering:

- *More contradiction axes* waits on having seen enough real prompts.
- *More locales* waits on a maintainer who reads the language.
- *Tokenizer per model family* waits on a distribution decision, and 1.82.0
  removed the last excuse by measuring the number the entry itself demanded.
- *Editor extension* waits on a marketplace listing and an update cadence.
- *Cost alerting* waits on somewhere to run and something to remember.

Four of those 5 are blocked on a commitment somebody has to make rather than
code somebody has to write. That is not a backlog. That is a product standing
at its own edge, and the honest response is to walk the last stretch on purpose
instead of adding surface until the question goes away.

So this arc names the finish line and reaches it. **2.0.0 is the release that
says the tool is finished**, and after it the open repository does maintenance:
prices re-reviewed, models added and retired, corrections. Not a smaller
ambition. A stated one.

One thing is added along the way, in 1.83.0, and the reason it belongs in this
repository rather than somewhere private is the whole argument of the chapter
that describes it.

---

## Chapter 1 — 1.83.0, the receipt

**What it is.** A new command, `receipt`, that writes exactly what a fleet
server would need in order to price and supervise a team's spend, and nothing
else:

*It is named here rather than invoked, and that is not a stylistic choice.*
`every-page.test.js` fails any page in this repository that shows a command the
CLI does not dispatch, and this one does not exist yet. A plan written before
the code is exactly the document most likely to break that rule, so it observes
it: the invocation appears when the command does.

| In the receipt | Why |
| --- | --- |
| input, output and cache token counts | the arithmetic |
| model, provider, and the price applied | so the figure can be recomputed |
| that price's review date | so a repricing reads as a repricing |
| counted or estimated, with the family's measured error | so a bound is never read as a number |
| prompt, project and environment ids | so the money can be attributed |
| the gate verdict and the rule that produced it | so a policy can be audited |
| timestamp | so a period can be bounded |

**What is not in it.** The prompt text. The model's answer. File paths. Branch
names. Credentials. Not redacted, not hashed, not truncated — absent, because
the emitter never reads them into the document at all.

**Why this is in the open repository.** There is a commercial product coming
that consumes this file, and it will make a claim no proxy-based competitor can
make: *your prompts never leave your machines*. That sentence is worth nothing
if the only people who can check it are the people selling it. Put the emitter
here and the claim becomes what every other claim in this project is: a
statement anybody can read the source of.

This is the same reasoning `docs/licensing.md` already committed to, applied to
a new case. The analysis stays open. What needs a machine somebody pays for is
a different repository's problem, and it is a consumer of this format rather
than the author of it.

**The guard, which is the actual deliverable.** `receipt-redaction.test.js`
plants prompt text, an absolute file path, a branch name and an API-key-shaped
string into every input the emitter reads, then asserts that none of the 4
appears anywhere in the serialised output — not in a field, not in an id, not
in an error message, not in a rejection. A promise about what a file does not
contain is exactly the kind of promise this project holds with a planted
violation rather than with prose.

**What this refuses to do.** Send anything anywhere. `receipt` writes a file to
a path you name or to standard output. There is no endpoint, no key, no
retry, no queue. Transport belongs to whoever is doing the transporting, and a
command that phones home would break rule 1 of the roadmap in the same release
that claims to be protecting it.

---

## Chapter 2 — 1.84.0, the 4 families nobody has measured

1.82.0 measured the estimator against 2 providers' own counters and published
both figures. It also named the 4 it could not reach — OpenAI, Google, xAI and
Moonshot — and gave each of them a skipped test in the suite carrying the exact
command that would run it.

This release runs them.

**It is blocked on keys, and that is stated here rather than discovered later.**
Each family needs a key for its own token counter. If the keys do not arrive,
**1.84.0 does not ship**, the arc continues at 1.85.0, and every report that
touches an unmeasured family goes on printing that nobody has measured it. That
is the correct behaviour and it is already implemented; the failure mode this
paragraph exists to prevent is quietly publishing a figure derived from Claude's
tokenizer and letting a reader assume it was measured against theirs.

A blocked arc stays named. It is not faked, and it is not deleted to make the
plan look delivered.

---

## Chapter 3 — 1.85.0, the tokenizer somebody can opt into

The `Under consideration` entry for this set its own threshold: *within 5%
across families and the dependency is not worth taking; 40% out and it is.*
1.82.0 measured 94.5% against DeepSeek's counter and 103.1% against Mistral's.
The entry's own test was crossed twice over, and the answer it demanded is yes.

What kept it unscheduled after the measurement was never the evidence. It was
that a real tokenizer is a dependency in packages that have none.

**The shape that resolves both.** Separate optional packages. `@trazum/core`
declares nothing, depends on nothing, and keeps working exactly as it does
today when none is installed. When one is present, `optimize`, `check` and the
report use it, and every figure says which counter produced it: the heuristic,
or the family's own.

**What this refuses to do.** Bundle a tokenizer. Make the core depend on one.
Pick a default. Print a figure without saying where it came from. The zero
dependency promise is load-bearing for the CI use case — a gate that pulls a
50MB model file into every build is a gate teams turn off — and an optional
package is the only shape that improves the absolute figures without spending
that.

---

## Chapter 4 — 1.86.0, the editor extension

Live cost while writing a prompt. Unblocked since 0.10.0, which gave it a
config file and a per-path budget to read, and unscheduled ever since because
an extension is a distribution commitment rather than a feature: a marketplace
listing, an update cadence, and a second place where a bug is somebody's
afternoon.

This arc takes that commitment on purpose, because it is the cheapest place a
person meets this product for the first time, and the whole problem named in
the ledger below is that almost nobody has.

**What this refuses to do.** Send the buffer anywhere, in any form, ever. The
extension runs `@trazum/core` in the editor's own process against text that is
already on the machine. An extension that uploaded a prompt to price it would
be the exact inversion of the product.

---

## Chapter 5 — 2.0.0, done

No new analysis. No new command. The release exists to change one sentence in
the README from a description of something growing into a description of
something finished:

- Every analysis this product can perform offline, it performs.
- The estimator says which counter produced each figure, and names the families
  where nobody has measured one.
- Of the doctrine's 24 rules, each either names the test that fails when the
  product stops obeying it, or names why no test can.
- The surface is frozen. 46 commands, and the 46th was the receipt.

It is a major version for 2 reasons and both are ordinary semver. The tokenizer
packages change what `optimize` prints when one is installed, which is a change
in observable output. And a promise of stability is the kind of thing that
deserves a number people can point at.

**After 2.0.** Maintenance, indefinitely: prices re-reviewed on their own
per-provider clocks, models added and retired, corrections, security. The 2
entries under `Under consideration` that are blocked on people rather than code
stay exactly where they are, still named, still unfaked. If somebody turns up
who reads a language, that is a release. If nobody does, the file goes on saying
so.

---

## What this whole arc refuses to do

**Grow to look alive.** The temptation at 82 releases with 1 external star is
to keep shipping so the graph stays green. Every version above either removes a
named blocker or declares a finish, and none of them is surface added because
the calendar wanted some.

**Move an analysis out of the open set.** `docs/licensing.md` promises that no
analysis this repository can perform today will ever leave it, and the receipt
in Chapter 1 is the test of whether that promise survives contact with a
commercial product. It survives by the receipt being written here.

**Pretend the blockers are technical.** Two of the 5 remaining entries need a
person, not a patch. Saying so is the same discipline as refusing to price a
model whose rate nobody has read.
