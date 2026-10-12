# Quick start

[Documentation](README.md) / Quick start

Choose recorded usage to understand spend, or a prompt to estimate an edit.
You need Node.js 20 or newer. `npx` may download Trazum; the analysis below
runs locally and requires no provider key.

## 1. Get a first result

Already using Claude Code?

```bash
npx @trazum/cli bill
```

This reads its local transcripts. The amount is API-equivalent cost, **not
your subscription invoice**. Unknown models remain named pricing gaps.

Have an export instead?

```bash
npx @trazum/cli bill ./usage-export.jsonl
```

Use your own path. `bill` detects supported provider and observability export
shapes. [Supported inputs and required fields](usage-logs.md).

For a reproducible demo from a clone of this repository:

```bash
npm install
npm run build
node packages/cli/dist/index.js bill examples/claude-projects
```

These are illustrative fixtures, not a customer's spend. The report groups
priced calls by project and model and names missing information.

## 2. Export the evidence

```bash
npx @trazum/cli bill ./usage-export.jsonl --html-out bill.html
```

HTML carries the report and its caveats. PDF, CSV and Markdown exports are
also available. Treat reports as financial information when sharing them.
For normalized logs, `profile` exposes deeper analysis:

```bash
npx @trazum/cli profile ./usage.jsonl
```

[Import a usage log](usage-logs.md) before passing provider-specific exports
to `profile`. [Bill and profile reference](commands.md#find-a-command).

## 3. Save a plan for one change

For a normalized usage log (use your own path):

```bash
npx @trazum/cli plan ./usage.jsonl -o plan.json
```

If you started with Claude Code transcripts, convert them first:

```bash
npx @trazum/cli from-claude-code ~/.claude/projects --label-from-project -o usage.jsonl
npx @trazum/cli plan usage.jsonl -o plan.json
```

Other exports need their corresponding [usage importer](usage-logs.md).
`bill` accepts more input shapes than `plan`; do not pass an arbitrary provider
export directly to `plan`.

Read the top action, its assumptions and the period it covers. Choose one
change you control. Check quality on representative tasks before changing a
model or prompt, and check whether your workload tolerates batch latency.
A plan with no actions is valid; do not manufacture savings to fill it.

On a fixed subscription, a lower API-equivalent estimate does not imply a
lower subscription payment. This workflow is most directly useful when you
pay for the affected API usage.

## 4. Check later usage

After applying a change, collect a new normalized log for the same workload,
keeping workload labels consistent. Use a separate file for the later period,
not a second export containing all the original history.

```bash
npx @trazum/cli verify plan.json --against ./usage-after.jsonl
```

Expect one of three outcomes: savings arrived, did not arrive, or cannot be
determined. Read the explanation alongside the verdict: traffic, pricing and
missing fields can affect the comparison. This does not establish causality,
prove unchanged answer quality, or reconcile your provider invoice.
[Plan format and verification limits](plan-format.md).

## Subscription efficiency

For a fixed subscription, focus on useful work per task and context quality,
not projected invoice savings. With a normalized log carrying consistent
session identifiers, `profile` can describe conversation growth:

```bash
npx @trazum/cli profile ./usage.jsonl
```

Growth is not all waste: later turns may need earlier decisions, new files or
new user requirements. Treat the report as a reason to inspect the workflow,
not permission to remove context indiscriminately.

For a prompt or instruction file you control, inspect a proposed edit:

```bash
npx @trazum/cli optimize ./prompt.txt --diff
```

Review changes and compare representative tasks before adopting them. Record
input/output tokens per completed task where available, retries, and quality.
A shorter prompt that causes more retries may be worse overall.

You can also enforce a chosen token budget on that file:

```bash
npx @trazum/cli check ./prompt.txt --max-tokens 2000
```

Here 2,000 is an example policy, not a provider limit or a recommended budget
for every task. These checks do not control the agent's complete context,
compact its conversation, or translate tokens into remaining subscription
messages. Selecting relevant files and starting a new session with a carefully
reviewed handoff summary remain host/user workflow decisions.

For an optional agent instruction template and its limits, see
[efficient context instructions](context-efficiency.md).

## Other workflows

| Your question | Next step |
|---|---|
| Can this prompt fit a budget? | [CLI setup](setup.md#cli), then [CI gates](ci.md) |
| Should I configure this repository? | Optional [project setup with init](setup.md#the-first-five-minutes-trazum-init) |
| Can calls be refused before forwarding? | [Gateway setup and limits](gateway.md) |
| Can my agent use it? | [MCP](../packages/mcp/README.md) or [Claude Code plugin](../plugin/README.md) |
| Can I automate reporting? | [Schedules, watch and alerts](running.md) |

For a prompt without usage data:

```bash
npx @trazum/cli optimize ./prompt.txt --cost
```

Read the diff and assumptions. Projected savings do not prove unchanged
answer quality; model recommendations require your own evaluations.

## If the result is incomplete

| Symptom | What to check |
|---|---|
| No usage found | Pass an explicit file or folder; see [input formats](usage-logs.md). |
| A model cannot be priced | Inspect `trazum models`; use a [pricing overlay](commands.md#updating-prices) backed by your rate card. |
| The cost differs from an invoice | Check period, credits, subscription pricing, missing calls and provider rates. See `reconcile` in the [reference](commands.md#find-a-command). |
| A finding is unavailable | Supply the missing fields; missing evidence is not zero spend. |
| A command fails | Run `trazum <command> --help`; use [support](../SUPPORT.md) with a redacted reproduction. |

Local analysis does not upload your files. Optional provider calls and saved
web-library prompts have different data paths: read [privacy](../README.md#analytics-and-privacy)
and [accounts](accounts.md) before enabling those integrations.
