# Adoption playbook: first useful result to repeat use

[Documentation](README.md) / Maintainer playbook

This is a proposed 30-day experiment, not evidence of traction or a growth
forecast. Start day 1 when a maintainer begins recruiting. Keep participant
identities, contact details and raw interview notes outside this public repo.

For the proposed task-level FinOps control loop and product experiments, see
[FinOps product direction](finops-direction.md).

## Audience and hypothesis

Start with developers and small teams paying for recurring LLM API usage who
can access usage records and change their application. The hypothesis is that
finding one actionable cost issue, then checking later usage, creates a reason
to return. Test this before broadening the message to every agent user.

Claude Code users can get a quick first report from local transcripts. Qualify
payment mode separately: an API-equivalent estimate on a subscription is not
an opportunity to reduce that subscription invoice.

Describe Trazum consistently: **Find where your AI usage costs money, choose a
change, and check the result.** Lead with one real workflow and link advanced
integrations afterwards. Compare other products only on verified behaviour;
do not claim they lack a feature without checking their current documentation.

## Separate subscription hypothesis

For subscription users, test whether context and prompt inspection improves
useful work per task. Keep this cohort separate from API-billed teams. Record
tokens where available, task completion, retries and quality before and after
one change on comparable tasks. A reduction in estimated cost is not a lower
subscription charge or proof of additional message allowance.

Use the [subscription workflow](quick-start.md#subscription-efficiency). Ask
whether conversation-growth reporting or prompt review changed a decision.
Automatic context selection, session summarization and host compaction are
potential future work, not capabilities demonstrated by this experiment.

## Four-week experiment

| Window | Work | Evidence to collect |
|---|---|---|
| Days 1–7 | Use the revised README and quick start with five first-time users. Observe before explaining. | Can they explain the product and reach a report? Record blockers and time. |
| Days 8–14 | Complete ten qualified user sessions in total. Ask each to choose one useful finding. | Correctly interpreted results, surprising findings, and changes users actually intend to make. |
| Days 15–21 | Fix the most frequent blockers. Follow up with participants whose seven-day window has elapsed. | Independent reuse, attempted changes, and why others did not return. |
| Days 22–30 | Prepare up to three consented case studies and distribute one reproducible demo. | Measured outcomes where available; qualified first uses attributable to each channel. |

Targets: ten completed sessions, five users reaching a report without help,
and three documented outcomes. These are learning targets, not statistical
proof or promises. Do not publish a case as a success just to meet the target.

## Recruitment

Find people already discussing LLM bills, cache behaviour, model routing or
usage attribution. Ask moderators before promotional posts where needed.
Prioritize relevant conversations over bulk messages or directory submissions.

Qualification questions:

1. Do you pay per API call/token, use a fixed subscription, or both?
2. Which provider and workload would you inspect?
3. Can you access usage counts and timestamps without sharing prompt contents?
4. Can you change the application and evaluate its output quality?
5. What do you use today, and what question does it leave unanswered?

Suggested invitation, to adapt and send manually:

> I'm testing Trazum, an open-source tool that analyses local LLM usage and helps
> check whether a cost-saving change worked. Would you be willing to try it on
> one workload in a 20-minute session? I'm looking for usability feedback;
> there is no need to send me prompts, credentials or raw logs.

## A 20-minute observation session

- Minutes 0–3: establish the user's question and payment mode. Ask permission
  before taking notes or recording; recording is optional.
- Minutes 3–8: let them read the README and run the first command. Do not guide
  them unless they are blocked. Record where help became necessary.
- Minutes 8–13: ask them to explain the report, its coverage and whether the
  number represents their actual bill. A successful execution alone does not
  establish understanding.
- Minutes 13–18: for a suitable normalized log, generate a plan. Ask which
  action they would take, what assumption needs checking and how they would
  evaluate quality. No paid evaluation or change to production is required.
- Minutes 18–20: ask what would make them use it again. Agree on an optional
  seven-day follow-up and a specific task they can try independently.

Follow-up questions: Did you use it again? What triggered that use? Did you
change anything? Did later usage support the result? What prevented progress?
Record negative answers as well as positive ones.

## Measurement without hidden telemetry

Use a private, participant-coded sheet. Collect only volunteered information;
no new CLI telemetry or prompt collection is required by this experiment.

Suggested columns: participant code, source channel, payment mode, workload,
session date, first-run success, help needed, minutes to interpretable report,
action chosen, change attempted, seven-day eligibility, independent reuse,
verification outcome, blocker category, publication consent.

| Metric | Numerator / denominator | Interpretation |
|---|---|---|
| Recruitment yield | Completed qualified sessions / qualified invitations sent | Report counts and period; do not include unanswered public post impressions. |
| First-use success | Users reaching and correctly explaining a report without help / users attempting first use | Count missing-data and installation failures too. |
| Actionability | Users choosing a concrete action / users attempting first use | Keep recommendations separate from implemented changes. |
| Seven-day reuse | Users reporting independent reuse / participants whose seven-day window elapsed | Report unreachable participants separately; do not remove them silently. |
| Verification coverage | Users completing later-log verification / users attempting a change | Keep arrived, did-not-arrive and cannot-tell results separate. |

Track npm downloads by package and period as a distribution signal, never as
unique or active users. Do not add dependent-package totals together and call
them people. Review GitHub traffic where available as another directional
signal, not a conversion denominator for users you cannot link across systems.

Decision rules for this small cohort:

- If fewer than five of ten reach an interpretable report without help, fix
  first-use friction before a broad launch.
- If reports work but users cannot select an action, inspect audience fit and
  recommendation clarity before adding integrations.
- If actions are useful but nobody returns, investigate the natural frequency
  of the problem and the follow-up workflow. Do not assume weekly use is right.
- If users return and can explain a useful outcome, repeat the channel that
  brought them and publish the evidence with permission.

## Reproducible demo

From a repository checkout, after `npm ci` and `npm run build`:

```bash
node packages/cli/dist/index.js bill examples/claude-projects --table
node packages/cli/dist/index.js from-claude-code examples/claude-projects --label-from-project -o demo-usage.jsonl
node packages/cli/dist/index.js plan demo-usage.jsonl -o demo-plan.json
```

These commands use illustrative fixtures. Run in a disposable checkout or use
unused output filenames. They demonstrate a report and a plan, not achieved
savings. The generated normalized log may retain session identifiers; review
it before sharing. Do not commit outputs containing real usage.

For a 30–45 second clip, show the problem, run the report, point out its
API-equivalent label and coverage, then show a proposed action and its
assumption. End at the quick-start link. Use actual output and label sample
data on screen. Do not stage a verification success using fabricated later
usage. Demonstrate verification with consented later data only when available.

## Case-study worksheet

Copy this outline into a private working document. Publish only after the
participant approves the specific text, figures and screenshots.

1. **Context:** workload, payment mode, period, providers and versions.
2. **Question:** what the participant could not answer before using Trazum.
3. **Evidence:** input source, coverage gaps, pricing date and baseline usage.
4. **Finding:** proposed action, estimated opportunity and its assumptions.
5. **Change:** what was actually changed and when; what stayed uncontrolled.
6. **Quality:** evaluation tasks, metric, sample size and observed regression
   or uncertainty. Do not equate model agreement with correctness.
7. **Outcome:** later period, traffic and task mix; estimated versus observed
   costs; provider billing reconciliation if available; verification verdict.
8. **Limitations:** alternative explanations, missing evidence and whether the
   result is repeatable. An inconclusive result can still be useful.
9. **Permission:** approval of the exact public material, recorded privately.

Never subtract two monthly totals and attribute the difference to Trazum
without considering volume, task mix, prices and quality. A subscription
API-equivalent reduction is not an invoice saving.

## Distribution sequence

1. Publish one reproducible technical walkthrough answering a concrete question.
2. Share it in a relevant community with the maintainer affiliation disclosed,
   sample data labelled and one link to the quick start.
3. Ask a complementary-tool maintainer about a specific integration only after
   demonstrating the gap with a real workflow.
4. Prepare a broader launch once first-use blockers are addressed. Use approved
   cases and real outcomes; avoid fabricated testimonials or savings promises.
5. Review qualified first uses and reuse by source. Continue channels bringing
   relevant users, even if their raw reach is smaller.

No outreach, publication, npm release or telemetry change is performed by this
playbook. The npm README change reaches the registry on the next package release;
merging a documentation change on GitHub alone does not update the npm page.
