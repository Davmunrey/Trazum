# The doctrine

Every rule below was discovered by getting it wrong first. They are written
down together here because they are the actual argument for why anybody should
trust a cost figure — from this tool or any other — and because each one was
otherwise buried in the changelog entry of the release that learned it.

They are not Trazum-specific. If you are building something that reports money
from measurements, these are the mistakes waiting for you.

**Second edition, at 1.51.0.** Three arcs have now been planned in advance and
delivered, and this is the document they were arguing towards. Two rules joined
at 1.50.3 and 1.50.4 — *a proxy refuses and never answers something else* and
*quality is recorded, never inferred* — because putting a tool in the path of the
call and giving it an opinion about quality are both new ways to do harm, and the
old rules did not cover either. One joined at 1.50.4 and is the newest thing here:
*cheaper per call is not cheaper per outcome, and the product prints both
rankings rather than picking one.*

The record of getting these wrong is [our own
medicine](our-own-medicine.md), which is the same document this product asks its
users to keep.

---

## Measured never merges with estimated without saying which half is which

A tool that adds "you have spent $340" to "this call will cost $0.02" and
reports $340.02 has produced a number that is neither measured nor estimated,
and nobody downstream can tell which half is which. Trazum's cost answer keeps
them in separate fields with a `restsOn` saying what the verdict depends on,
and a composed figure never travels without its two halves beside it.

*Learned in 1.44, building an endpoint that had to answer both at once.*

## Not recorded is not not-happened

A log with no cache columns does not prove a cache hit rate of zero — it proves
the exporter did not write the column. A record with no timestamp did not happen
outside the window; it happened somewhere unknown. Writing zero in either case
manufactures a finding out of a missing field, and it is always the flattering
direction.

Absence is `null` or an empty array, never zero, in every document this project
emits.

*Learned repeatedly. Named in 1.46, when `init` was one line away from writing
`cacheHitRate: 0` into everybody's config.*

## Three outcomes, never two

A check has three answers: it passed, it failed, and it could not be judged. A
tool with only two turns the third into whichever of the first two is cheaper to
implement — always the pass, always silently. `verify` reports `arrived`,
`not-arrived` and `cannot-tell`, and `cannot-tell` carries its own distinct
reasons because they lead to different actions.

A gate may fail on *some* unjudgeable outcomes — a team that degraded its own
log must not pass on the strength of the silence — but it must never quietly
convert one into a pass.

*Learned in 1.39.*

## No series becomes a forecast

Twenty points make a trend visible. They do not make next month knowable. A
series names shapes — climbing, decaying, drifting — and stops at the last
measured point. "You will run out on the 24th" is a projection from a rate the
log has no reason to keep, and it is the single most requested number a cost
tool will ever be asked for.

Refuse it in the type, not just in the comment. A field that does not exist
cannot be added by accident.

*Learned in 1.27. Enforced structurally in 1.49.*

## A floor can prove "over" and can never prove "under"

When measurement covers only part of a period, the figure is a floor: the
unmeasured part spent *something*. A floor that has already crossed the limit is
unarguable. A floor that looks comfortable proves nothing — and reporting it as
comfortable turns missing measurement into good news.

*Learned in 1.49, by writing the reassuring version first and printing it
directly under a warning that contradicted it.*

## A period, or a service, nobody measured is not one under budget

`$0 of $400` is the healthiest-looking budget a dead store can produce. A
pipeline that stopped writing looks exactly like a quiet month. Name the gap;
never report the absence as a pass.

*Learned in 1.37 for services, 1.49 for time.*

## Quiet is not clean

A system that alerts once and then goes quiet has told you it already alerted —
not that the problem went away. After a restart, "within every threshold" is a
different sentence from "nothing has crossed", and only one of them is true when
the budget is still blown.

*Learned in 1.43, when the watch reported all-clear across a restart with the
budget still over.*

## A refusal never arrives bare

"Denied" with nothing after it leaves a caller two moves: do it anyway, or fail.
Both are worse than the thing they wanted. Every refusal in this product carries
what would settle it — the alternative that exists, the days that are missing,
the file and line that disagreed. A refusal a machine can act on is structured;
a refusal a human can act on says what to do next. Do both.

*Learned in 1.45, designing a guard an agent would otherwise stop consulting.*

## Quality is recorded, never inferred

Whether a cheaper model can do the work is a question about quality, and no
usage log answers it. Every projection that depends on one carries the
assumption as a typed value, so a reader knows exactly which human judgement the
number is resting on.

## A credential is borrowed, never held

A tool that reads a provider's usage API needs a key for the duration of one
request. It never stores it, never logs it, never returns it to a caller that
might print it, and never puts it in a URL. Report the **name of the variable**
it came from; that is checkable and harmless.

*Learned in 1.41. Guarded structurally: the guards check what is destructured,
not what is printed, because code that happens not to log a secret today is one
refactor from logging it tomorrow.*

## Nothing continuous invents a number

A process that runs every fifteen minutes must not fire on a projection, and
must not report a figure it did not measure this cycle. An alert on a
measurement is worth having; an alert on an extrapolation trains people to
ignore alerts.

## A machine reader gets the provenance too

The JSON is not the human report with the prose removed. Every field a decision
depends on is structured — the verdict, what it rests on, the assumption, the
window, the coverage — because the consumer that most needs to know a figure is
an estimate is the one that cannot read the sentence saying so.

## A proxy refuses and never answers something else

When something cannot be done, fail. Do not substitute the nearest thing that
can be. A tool that quietly answers a different question than the one asked is
worse than one that errors, because the answer looks right.

## One key, one denominator

Two things measured in the same units over different periods must not share a
configuration key. `maxUsd` gating "this log" and "this month" is not a
convenience; it is a guarantee that two surfaces of the same product will
eventually disagree, by exactly as much history as the machine happens to hold.

*Learned in 1.49, five releases after the disagreement started.*

## What stays out gets its reason on the record

Every release here names what it did not ship and why. A feature dropped
silently looks like a feature nobody thought of, and the next person to think of
it repeats the reasoning from scratch — or worse, ships the version that was
rejected for a reason.

## A guard that quietly stops guarding is worse than no guard

A check that skips what it does not recognise reports green over the thing it
was written to catch. Trazum's README command-count guard silently ignored
number words it had never seen and stood green for five releases while the count
drifted. Fail on the unknown case, or narrow the guard until the unknown case
cannot arise.

*Learned in 1.45.*

## Prove a guard by breaking it

Write the check, then plant the violation it exists to catch and watch it fail
**by name**. Remove the probe, watch it pass. A guard nobody has seen fail is a
guard nobody knows is connected — and roughly one in five turns out not to be.

## Cheaper per call is not cheaper per outcome

The two are different rankings and a workload can move up one while moving down
the other. Trazum found a case where one workload cost **ten times more per
call** and **half as much per resolution** — and every ranking this product had
printed until then was the first column.

Print both. Picking one is a product judgement about whether cost or quality
matters more today, and that is not a judgement a cost tool has standing to
make on somebody's behalf.

*Learned in 1.50.5.*

## An unallocated share is never spread

Dividing unattributed spend proportionally across the owners you *do* know is
the most common lie in cost reporting. It makes every line add up and every
figure wrong — by an amount nobody can see, in a direction nobody can check.

It is worst for the teams with the cleanest instrumentation, because their known
spend is largest, so they absorb the biggest share of somebody else's mystery. A
tool that behaves that way punishes the only people doing the thing it asked
for.

Keep it as its own line, name what is in it, and wait for somebody to claim it.

*Learned in 1.50.10.*

## Bound an assertion by its subject, never by its neighbour

A test that harvests "from here to whatever comes next" is not bounded — it is
bounded by an accident, and the accident changes.

This has gone wrong six times in this repository, in three different files, and
the shape is identical every time:

- Four contract harvests in `docs/json-output.md` sliced from their heading to
  the end of the file, so each new section silently widened the one before it.
- Two source harvests in `security.test.js` sliced from a function to
  `commandModels` **by name**, so inserting a command between them pulled a
  third command's source into both guards.
- A profile assertion searched the whole report for the phrase `cannot say
  whether`, and a new coverage line about outcomes — unrelated, and correct —
  made a true assertion fail.

Two of those made a guard cover more than it should; one made it cover less;
one made a correct sentence look like a bug. The fix is the same in every case:
name the end as well as the start, and match the subject rather than a phrase
that any section might legitimately use.

*Learned across 1.38 to 1.50.4, the same lesson each time.*

## Record, do not reconstruct

When you want to say "this has happened nine times", the honest way is to have
written down each of the nine. A history assembled from the current
configuration is a guess presented as evidence, and it is the sort of guess that
becomes an accusation. Start recording, say which day recording started, and let
the record be short until it is not.

*Learned in 1.40, which refused to fake it, and fixed in 1.48 by recording.*

## Report the record, not the team

"The expiry moved three times and the reason did not" is a statement about dates
in a file. Whether that was the right call is a conversation the tool does not
get to have. Name the shape; leave the judgement to the people who know why.
