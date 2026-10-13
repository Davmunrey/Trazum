# Product direction: useful work per AI budget

[Documentation](README.md) / Proposed product experiments

**Direction:** position Trazum around the cost and capacity
needed to complete useful work, then use measurements to improve the next task.
The [task efficiency workflow](task-efficiency.md) is implemented in the
unreleased checkout. The broader control loop below remains a product direction,
not shipped automation.

## Two budgets, one outcome

An API team can optimize actual billed cost per accepted task. A subscription
user can optimize observed token use, elapsed time and retries per accepted
task. A fixed fee remains a fixed fee. Provider capacity rules may be opaque;
Trazum must not invent a remaining-message counter from tokens.

Track the denominator: a task has an explicit completion criterion and outcome
(accepted, rejected or unknown). Include failed attempts in the cost of the
workflow. Report success rate and unresolved outcomes alongside unit cost.
A cheaper model that causes rework can increase cost per accepted task.

## A local control loop

1. **Set policy:** choose task type, quality criterion and an explicit budget.
2. **Prepare:** recommend a context strategy and allowed configuration from
   observed comparable tasks; use user-supplied defaults when evidence is absent.
3. **Observe:** collect available usage and tool-event metadata without prompt
   content by default. Mark missing data and covered/uncovered host calls.
4. **Intervene:** suggest a bounded action at a meaningful threshold. Applying
   it requires a host capability and user policy; recommendations are not enforcement.
5. **Evaluate:** compare full-task consumption, quality, retries and elapsed
   time, retaining inconclusive results.

Do not add a supervisor model call to every turn. Run deterministic summaries
locally, cache them and emit a short recommendation only when something changed.
Account for the controller's own instructions and calls in the measurement.

## Experiments worth testing

| Experiment | Mechanism to prototype | Success measure and failure boundary |
|---|---|---|
| Context policy | Small opt-in host instructions; prefer targeted reads and bounded tool output | Lower whole-task input with unchanged acceptance. Re-reading changed files remains necessary. |
| Tool-output control | Host adapter filters or paginates oversized results, preserving errors and providing an expansion handle | Fewer input tokens without extra failed searches or missing evidence. No silent truncation. |
| Repetition detector | Detect repeated tool calls or repeated identical file ranges within a task | Fewer unnecessary retries; distinguish changed files and deliberate validation. Advisory first. |
| Output policy | Task-specific response length or output contract | Lower output plus retries, with the required explanation and deliverable intact. |
| Task configuration history | Compare allowed models and context policies on matched tasks | Better cost/quality trade-off; no model switch without an available host control and agreed policy. |
| Session handoff | Propose a compact goal/decision/constraint/evidence summary when changing tasks | Successful continuation with less carried context; user can inspect and retain original evidence. |
| Capacity pacing | Show observed consumption trend against a user-set work budget | Better planning without claiming to predict an undocumented provider reset or remaining allowance. |

Do not ship all of these at once. Start with one host and one repeated task type
so overhead and quality can be measured rather than inferred.

## First product experiment

**Opt-in context and output policy, evaluated over complete tasks.**

Start with the [task efficiency workflow](task-efficiency.md): import explicit
Claude Code/Codex sources, inspect repeated calls with matching recorded
results, review the fixed `repeat-review-v1` policy, optionally append it to a
selected instruction file, and compare a later task with an explicit outcome.
The CLI supports local apply/revert; MCP provides analysis and comparison.
These additions are unreleased and are not in npm 2.5.2. The existing
[compact instruction template](context-efficiency.md) remains a manual option.

For the first adapter, require documented access to the necessary events. Read
metadata where available; do not assume transcripts reveal exact file-range
reuse, hidden system context, quota accounting or task success. If the host
cannot expose an event or enforce an action, label it unavailable.

The first record keeps task identity/type, criterion, declared acceptance and
assessor, policy version, measured usage, source diagnostics, harness/model
coverage and repetition evidence. It excludes raw tool text and source paths;
its reuse checksums do not authenticate or anonymize a report. Comparison
refuses to treat missing coverage or replayed evidence as an improvement.

Additional record capabilities to design and validate:

- Start/end timestamps and measurement coverage.
- Actual billed cost kept separate from the existing API-equivalent estimate.
- Attempt count and controller overhead where attributable.
- Independent evidence that a host loaded a policy and that acceptance passed.

Do not infer success from a zero exit code alone or put raw file paths, prompts
and answers in a shared record by default. Keep unknown counters unknown.

Compare the baseline with the policy on representative comparable tasks. Keep
the model and relevant settings fixed for the first experiment so the policy
is the variable being tested. Repeat runs and include setup overhead. Define
the acceptable quality change and minimum worthwhile benefit before results
are observed. Ship a default only after the net benefit survives that check.

## Reuse the existing product

| Existing surface | Role in this direction | Additional work required |
|---|---|---|
| Native imports and usage profiling | Baseline counts, cost estimates and conversation-growth evidence | Automatic task attribution and coverage beyond explicitly supplied telemetry. |
| Prompt optimization and token checks | Review controlled instruction text and check chosen budgets | Whole-task quality and net-overhead evaluation. |
| Saved plans and verification | Keep a proposed change and inspect later evidence | Repeated experiments beyond the unreleased paired task comparison. |
| MCP skill and tools | Let an agent request analysis and receive advice | Verified host behavior beyond the unreleased optional instruction policy. |
| Local API and gateway | Expose policy decisions; enforce supported rules on routed calls | No blanket control over subscription-host turns; adapters need explicit support. |

## Adoption test

Keep the existing API-cost cohort and the subscription-efficiency cohort
separate. Ask both: "Did Trazum change a decision, and did the resulting task
finish acceptably with less total resource use?" Publish the supported
measurement, not a promised percentage of savings or additional messages.

If a policy cuts tokens but reduces acceptance or creates more human repair,
it is not a FinOps win. If it improves quality at the same budget, that is a
useful result even when the token count does not fall.
