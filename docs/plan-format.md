# The plan document

[Documentation](README.md) / [Usage inputs](usage-logs.md) · [Commands](commands.md#find-a-command) · [JSON output](json-output.md)

`plan.json` is the one thing Trazum writes that is meant to be **kept**. Every
other output answers a question the moment you ask it; a plan is a decision
written down on Monday and checked on Friday, by a different person on a
different surface.

That is why it has a format worth documenting. Commit it, diff it in a pull
request, gate on it in CI with `trazum verify`, open it in the browser tab —
all four read the same file, through the same validator.

Written by `trazum plan <log> -o plan.json`, or by **Save plan.json** in the
web app's Bill tab. The two are byte-identical apart from the `createdAt` stamp
the browser adds.

## What it holds

| Field | What it holds |
| --- | --- |
| `schemaVersion` | `1`. Anything else is refused rather than guessed at. |
| `createdAt` | ISO timestamp, when the writer stamped one. Optional: a plan without it verifies fine and the verification says the plan is undated rather than inventing a date. |
| `span` | The period the plan's figures cover — `{fromMs, toMs}` — or null when the log carried no clock. A saving "per month" is not what this is: it is per the log's own period, stated. |
| `pricingLastReviewed` | The price table that priced this plan. Verification compares it against today's, so a repricing between the two is visible as a repricing rather than read as a team missing a target. |
| `actions` | The ranked list. Largest money first, projected and staked alike. |
| `projectedSavingUsd` | The projections, summed. Additive by construction: two levers on the same slice arrive pre-combined in one action, so nothing here double-counts. |
| `measuredStakeUsd` | Money already paid to the problems named — the retry bill, the cache loss. |
| `totalUsd` | The bill the plan was made against. |
| `batchExcludedUsd` | Input and output dollars no batch action was drawn on: calls already billed at the batch rate, and calls something waited on (`"interactive": true` on the record). Optional: a plan saved before the field existed has none, and verifies as before. Never a saving, and nothing should add it to one. |

**`projectedSavingUsd` and `measuredStakeUsd` are never added together**, and
nothing that renders this file should add them. One is a prediction about calls
that have not happened; the other is money that already left. A figure that is
half of each is neither.

## An action

| Field | What it holds |
| --- | --- |
| `kind` | `route`, `batch`, `route+batch`, `fix-truncation`, `fix-caching` or `edit-file`. |
| `label` | The workload. The unlabelled bucket carries a sentinel, rendered as "unlabelled" and never printed raw. |
| `model` | The model those calls go to now. |
| `savingUsd` | The projection, for route and batch kinds — or null. |
| `stakeUsd` | The measured money, for the fix kinds — or null. Never both: a projection and a measurement in one field is a number that is neither. An `edit-file` action has neither: its figure is `detail.baseline`, measured. |
| `assumes` | What the log cannot confirm, typed rather than as prose — `{kind: 'model-capability', model}`, `{kind: 'batch-window'}`, and so on. Each is a question for a human, and the rendering surface writes it in the reader's language. |
| `check` | A Trazum command that would settle the assumption, when one can. Null when none can. |
| `detail.routeTo` | Where a routing action moves the calls. |
| `detail.measured` | The measured pieces behind a stake, so the figure can be reproduced. |
| `detail.baseline` | **The slice as it was when the plan was made** — calls, dollars, input and output tokens per call. Without this a plan is a prediction with no record of the world it was made in, and "the saving did not arrive" could never be told from "the traffic tripled". |
| `detail.edit` | For `edit-file` only, and required there: the edit, below. |

## An edit

`trazum plan --edits` writes an `edit-file` action for each prompt file
`labels` in `trazum.config.json` maps a workload to, when the `safe` rules
change it. It is the one action something later acts on rather than reads:
the Action's pull-request step makes it on a branch
([CI](ci.md#a-plan-that-opens-its-own-pull-request)). So **the new text is not
in the document.** What is there is enough to make the same edit again and
to refuse any other:

| Field | What it holds |
| --- | --- |
| `path` | The file, relative to the repository root, with forward slashes. Refused when it is absolute, climbs with `..`, has an empty or `.` segment, a backslash, a control character, or names `.git`. |
| `steps` | `reorder`, `trim`, or both in that order. `reorder` moves stable blocks ahead of the first placeholder; `trim` runs the `safe` rules. Nothing else is a step. |
| `level` | `safe`. No other level is written or accepted. |
| `disabledRules` | Rule ids `trim` leaves off, from the configuration's `disable`. |
| `minPrefixTokens` | The prefix `reorder` has to reach to move anything: the model's cacheable minimum, or 0. |
| `beforeSha256` | SHA-256 of the file's text as the plan read it. |
| `afterSha256` | SHA-256 of the text the steps make of it. Never the same as `beforeSha256`. |
| `beforeTokens`, `afterTokens` | The file's tokens before and after, **by the estimator**: estimated, not measured, and no saving is projected from them. |

The assumption it carries is `{kind: 'file-is-what-label-sends', path}`: the
configuration says this file is what the workload sends, and the log records
tokens, not files.

## The five ways a file is refused

`parsePlanDocument` returns a typed reason rather than throwing, because the
refusal has to be rendered in a browser and localised in a terminal.

| Reason | What happened |
| --- | --- |
| `not-json` | It does not parse. |
| `not-an-object` | It parses to an array, a string or a number. |
| `wrong-schema-version` | `schemaVersion` is missing or is not `1`. The value found is reported. |
| `actions-not-a-list` | There is no `actions` array. |
| `action-malformed` | One action is missing `label`, `model`, or carries a `kind` nobody wrote, or an `edit-file` action's `detail.edit` is missing or breaks a rule above. The **position** and the reason are both reported: a plan can hold a dozen actions and only one be wrong. |

The check is deliberately shallow past the three fields verification actually
reads, and the edit an `edit-file` action carries. A document format that
rejects its own past is one nobody commits, so a plan carrying fields from a
newer release still verifies, and a plan written before `edit-file` existed
reads exactly as it did.

**A plan with no actions is a valid plan.** A bill already on the cheapest model
of its family, with no batch API to reach for and nothing measurable being paid
to a problem, plans nothing — and verifying that plan should say "nothing to
check", not "this is not a plan".

## Verifying one

```bash
trazum verify plan.json --against newer.jsonl
trazum verify plan.json --against ./logs --gate    # exits 1 on a broken promise
```

Three outcomes, never two: **arrived**, **did not arrive**, and **cannot tell**
— the last with its reasons kept apart, because a workload that stopped being
logged is not a workload that stopped costing money.

An edit is checked in the file and in the log. It arrived when the file holds
the text the plan promised and the workload's input tokens per call fell below
the baseline; it did not when the file still holds the text the plan was made
from, or the calls are no shorter. `file-changed` (the file holds something
else, or is gone) cannot be told and fails `--gate`; `file-not-read` (a
browser tab, or anything else that cannot read the repository) cannot be told
and fails nothing.

`--gate` fails on a broken promise and on `fields-stopped` only. A team that
degraded its own log must not pass on the strength of the silence; a workload
that genuinely vanished, or a tier the log never recorded, fails nothing.
