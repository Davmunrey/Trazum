# Task efficiency: inspect, change, compare

[Documentation index](README.md) · [Agent integrations](agents.md) · [Context policy](context-efficiency.md)

**Available in the dashboard and a built checkout; CLI/MCP not published in npm 2.5.2.** This workflow
groups explicitly supplied Claude Code and Codex transcripts under one task,
finds repeated tool calls for review, and compares a later run with an explicit
acceptance decision. It makes no model calls and does not run the task for you.

## Dashboard

Open [Tasks](https://trazum.vercel.app/?tab=tasks). No account is required.

1. Choose **Analyze a run**, select Claude Code or Codex, then choose complete
   JSONL session files for one task. Change the format before adding files from
   another harness; each file retains its selected format. Limits: 16 files,
   400,000 UTF-16 code units combined, and 1,200,000 UTF-8 bytes per file.
2. Enter a run ID, task type and explicit acceptance criterion. Leave the outcome
   **Not assessed** unless you have checked that criterion. Accepted/rejected
   outcomes require an assessor label. Use non-sensitive metadata.
3. Analyze, inspect coverage and repetition evidence, then export the report JSON.
   File numbers refer to the selected-file list; call/result line numbers refer
   to the original JSONL. No raw tool content is included in the report.
4. When actionable evidence exists, review and export the proposed instructions.
   Add them to a project instruction file your agent reads and run a comparable
   task. The browser does not edit that file or execute the agent. Select
   **Repeat review v1** only for a run that actually used those instructions.
5. Use **Use as baseline** or **Use as comparison run** to carry an analyzed report
   into **Compare reports**. Import the other report, or analyze it and carry it
   over too. Compare and export the result. CLI/MCP task-report JSON uses the same
   schema; a comparison or policy document is not a task report.

Every export opens a review panel with the filename and exact contents. Choose
**Download file**, **Copy contents**, or **Select text**. A download request does
not confirm that a file was saved: check your browser's downloads. If downloads
are blocked, copy the contents into a UTF-8 file with the displayed filename.
If automatic clipboard access is unavailable, the panel selects the text for
your device's copy command. Close the panel with its button or Escape.

The comparison requires the same task type, exact criterion, harness/model
coverage, independent evidence and baseline → repeat-review policy pair.
Coverage gaps or unassessed outcomes produce an inconclusive result. An accepted
baseline followed by a rejected run records declared acceptance regression.
Lower recorded usage does not establish causal savings.

Files are read in this browser tab, never uploaded, persisted or sent to
analytics. Moving between dashboard tabs preserves the workspace in memory.
**Clear workspace** or closing/reloading the page discards it; downloads remain
where your browser saves them. Clearing the workspace does not clear copied
clipboard contents or saved files. Exports retain entered task metadata, assessor and
criterion. Treat those labels as shareable only after reviewing them.

The report's API-equivalent estimate uses the bundled price catalogue and is
not an invoice or a subscription charge. Missing usage is not displayed as zero.
English and Spanish interface copy share the same report format; optional policy
instructions keep the core's fixed English text.

## Prepare a baseline

From the repository root, build the checkout and use its CLI:

```sh
npm run build
node packages/cli/dist/index.js task --help
```

Choose a task type and acceptance criterion before changing instructions. Pass
only transcripts belonging to that task. If a session mixes unrelated tasks,
Trazum cannot separate their usage. Include failed attempts and handoffs; the
caller is responsible for selecting the complete set.

```sh
node packages/cli/dist/index.js task analyze \
  --id parser-baseline \
  --type bug-fix \
  --criterion 'Regression test passes and review accepts the change' \
  --outcome accepted \
  --assessor 'test-and-review' \
  --claude-code ./baseline-claude.jsonl \
  --codex ./baseline-codex.jsonl \
  -o ./baseline-task.json
```

Repeat `--claude-code` or `--codex` for additional files. The default policy is
`baseline`; the default outcome is `unknown`. An accepted or rejected outcome
requires an explicit assessor. Trazum records your assertion; it does not infer
completion from a tool result, a transcript ending or a successful command.
`-o` creates a new private report file and refuses to overwrite an existing one.
Without `-o`, the report is printed as JSON.

Analysis accepts at most 16 sources and 400,000 UTF-16 code units across their text.
Use complete sessions that fit these limits; splitting a large run into pieces
does not produce independent comparable tasks.

Serialized CLI output has the same 400,000-code-unit limit, including its
trailing newline. JSON is normally indented; the CLI falls back to compact
JSON if needed and refuses output that still exceeds the limit. It never emits
a truncated report.

Use each full session once. Overlapping exports and split snapshots are not
independent work. Native usage converters have format-specific deduplication
and counter limitations; retain the report's diagnostics and coverage warnings.
Missing usage is not zero usage, and available telemetry does not establish
that every turn or every attempt is represented.

## Review the evidence

Inspect the saved report before applying advice. Findings require identical
tool calls with identical recorded results and distinct call IDs within a
session. They point to one-based source and line numbers so you can inspect
the original locally. They are candidates for review, not a
count of wasted work. Retesting a change, checking fresh state or deliberately
confirming a result can require identical tool calls.

Usage counters and repetition evidence answer different questions. A repeated
tool call does not reveal its attributable token cost. Trazum does not convert
the number of repetitions into saved money, remaining messages or a forecast
of subscription capacity.

## Apply one optional instruction change

Print the small, fixed policy proposed for the report:

```sh
node packages/cli/dist/index.js task policy ./baseline-task.json
```

Policy export and application require a repeated read, repeated search or
explicit repeated failure in the report. If none is found, they refuse with an
explanation; there is no instruction change to apply from that evidence.

Review it, then select an existing local instruction file that your harness
already reads. This example uses a repository-local `AGENTS.md`:

```sh
node packages/cli/dist/index.js task apply ./baseline-task.json \
  --instructions ./AGENTS.md
git diff -- AGENTS.md
```

Close other editors for the instruction file while applying or reverting.
The command appends a managed instruction block to the explicit file; applying
the same block again is a no-op. Symlinks, non-regular files and files with
multiple hard links are refused. It does
not discover or change global configuration, install hooks, intercept tool
calls or restart a harness. Consult your harness's instruction-loading rules
before the next run. These instructions are advisory, not an enforcement
mechanism. No policy changes a model or authorizes spending.

The policy adds context of its own. Keep that overhead in the later task's
usage; a shorter individual tool result is not proof that the whole task became
more efficient.

## Run a comparable task and record its outcome

Run the next comparable task manually with the selected instructions. Keep the
task type, criterion, starting repository state, model and relevant settings
comparable. Record failures and rework, including any caused by the policy.
Do not stop measuring at the first successful tool call.

```sh
node packages/cli/dist/index.js task analyze \
  --id parser-policy \
  --type bug-fix \
  --criterion 'Regression test passes and review accepts the change' \
  --policy repeat-review-v1 \
  --outcome accepted \
  --assessor 'test-and-review' \
  --claude-code ./after-claude.jsonl \
  --codex ./after-codex.jsonl \
  -o ./after-task.json

node packages/cli/dist/index.js task compare \
  ./baseline-task.json ./after-task.json
```

Mark `repeat-review-v1` only if you actually ran with that policy. It is a
caller-supplied configuration label, not proof that the harness loaded or
obeyed the instructions. Use `unknown` when acceptance has not been assessed;
use `rejected` if the criterion failed.

Comparison reports observed differences and the limits of the evidence. It
requires matching task types, exact acceptance criteria, harnesses and models;
task IDs may differ. Material coverage gaps or reused source/session evidence
make the comparison inconclusive. The intended policy pair is `baseline`
followed by `repeat-review-v1`. Both outcomes must be accepted to compare usage
as accepted work; an accepted-to-rejected pair can report `quality-regressed`.

The possible verdicts are `lower-usage`, `higher-usage`, `similar-usage`,
`quality-regressed` and `inconclusive`. Token totals include fresh input,
cache-read input, cache-write input and output; reasoning tokens are already a
subset of output and are not added again. No verdict establishes that the
policy caused a change. Less usage with rejected
or unknown quality is not an accepted efficiency improvement. One pair of
tasks cannot establish a general benefit; use repeated, representative runs
before keeping a default.

## Revert the instruction change

```sh
node packages/cli/dist/index.js task revert --instructions ./AGENTS.md
git diff -- AGENTS.md
```

Revert removes only the exact managed block. An edited block must be reviewed
manually; Trazum does not guess which surrounding instructions to delete.

## Privacy and evidence boundaries

Task analysis reads tool names, inputs and outputs in memory to compare calls.
The saved report excludes raw tool content, source paths and raw session IDs;
source and line references support local investigation. Explicit task IDs,
types, acceptance criteria and assessor labels are retained. Keep personal
data and secrets out of those fields and review reports before sharing them.
Source fingerprints and session keys detect possible reused evidence. They
are non-cryptographic checksums, not authentication or guaranteed anonymity.

This differs from the existing native **usage import**, which extracts token
telemetry without using tool content for repetition analysis. Task analysis
needs original supported transcripts, not the normalized usage-only JSONL.
The CLI reads only paths you supply and does not upload them. MCP accepts
transcript text from its host; the host's transport and model-context behavior
determine how that text reaches the local server.

The first workflow has no automatic task discovery, PR attribution, live
intervention, remaining-quota estimate or quality judge. It provides a local
record and a reversible experiment, with acceptance supplied by a person or
an explicitly identified test process.

## Output contract

The unreleased task document family uses `version: 1` and a `kind`
discriminator, separate from the older `schemaVersion` contracts.
`trazum conform` and `trazum schema` do not support this family. Preserve the full saved
report: `parseTaskReport`, CLI policy/apply/compare and MCP comparison validate
its fields and reject unknown fields, invalid counters and inconsistent
evidence. A valid report remains a caller-supplied observation, not authenticated
proof. Comparison and policy receipts are outputs, not inputs to that parser.

| Variant | Produced by | Fields besides `version` and `kind` |
|---|---|---|
| `trazum-task` | CLI `task analyze`; MCP `analyze_task`'s `report` | `task`, `usage`, `sources`, `coverage`, `tools`, `limitations` |
| `trazum-task-comparison` | CLI `task compare`; MCP `compare_tasks` | `verdict`, `reasons`, `tokenChange`, `limitations` |
| `trazum-task-policy` | CLI `task apply` and `task revert` | `policyId`, `applied`, `changed` |

For a task report:

- `task` holds `id`, `type`, `criterion`, `policyId`, `outcome` and `assessor`.
  `assessor` is `null` when omitted; a known outcome requires it.
- `usage` holds `records`, `inputTokens`, `outputTokens`, `cacheReadTokens`,
  `cacheWriteTokens`, `totalTokens`, `apiEquivalentUsd`, `unpricedRecords`
  and `pricing`. Pricing records `source: "bundled"`, the catalogue's
  `lastReviewed` date and `basis: "api-equivalent"`; valuation uses those
  bundled rates. Different catalogue review dates do not invalidate a token
  comparison, which does not infer dollar savings.
  Valuation is `null` when no records exist, some cannot be priced or a cache
  write duration would have to be assumed. Zero
  recorded tokens with missing evidence does not establish zero task usage.
- Each `sources` entry holds one-based `index`, `format`, `fingerprint`,
  `sessionKeys`, `sessionCount`, native converter `diagnostics` and
  `completeness: "not-established"`. `coverage` holds `harnesses`, `models`
  and `gaps`; unknown models are gaps, not invented prices.
- `tools` holds `calls`, `duplicateCalls`, `missingResults`, `unsupported`
  and `findings`. Each finding has `kind`, `category`, `count` and `occurrences`;
  occurrences carry one-based `source`, call `line` and `resultLine`. The report
  retains at most 100 findings and 20 occurrences per finding; truncation is a gap.
- `limitations` preserves the evidence boundaries. A comparison's
  `tokenChange` is `null` unless an accepted usage comparison is supported;
  otherwise it holds `before`, `after`, `delta` (after minus before) and
  `percent` relative to the baseline. Policy receipts report desired managed
  block presence with `applied` and whether this invocation edited the file
  with `changed`; neither establishes that a harness loaded it.

`task policy` emits instruction text rather than a task JSON document. MCP
`analyze_task` wraps the report and optional policy as described below; save
only its `report` field for later comparison.

## Supported tool formats and upstream evidence

Usage telemetry follows the existing [pinned Codex format evidence](codex.md#upstream-format-evidence).
The tool adapter was checked against OpenAI Codex commit
`97239fd052db455bd08c41afcdab738e0fe83b87`, including its
[`ResponseItem` definitions](https://github.com/openai/codex/blob/97239fd052db455bd08c41afcdab738e0fe83b87/codex-rs/protocol/src/models.rs#L1098).
It supports `function_call` records with `name`, optional `namespace`, JSON
`arguments` and `call_id`, paired with string `function_call_output` results.
Structured output arrays, custom-tool, local-shell and web-search calls are
reported as unsupported. Failure-looking output prose is never treated as a
Codex exit status.

Claude matching uses the documented [`tool_use` / `tool_result` message blocks](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls),
linked by tool IDs; explicit `is_error: true` establishes a recorded failure.
These contracts support the implemented subset, not complete coverage of every
harness event. Missing results and unsupported shapes remain coverage gaps;
future upstream changes can require adapter updates.

## Use it from an agent

The unreleased MCP tools `analyze_task` and `compare_tasks` use the same core.
`analyze_task` receives explicit transcript text and task metadata and returns
`report` and `policy`; `policy` is `null` when no actionable repeated read,
search or explicit failure was found. Save the `report` object, not the
surrounding response; `compare_tasks` accepts its before and after JSON strings,
with at most 400,000 UTF-16 code units combined. Inspect `tools/list` on the running
server and use the [MCP reference](../packages/mcp/README.md) for argument
schemas and limits.

MCP never opens instruction files or applies the policy. Use the explicit CLI
apply/revert commands when a reviewed local change is appropriate. The task
workflow does not add a local HTTP route.
