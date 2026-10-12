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

## 3. Choose one next action

| Your question | Next step |
|---|---|
| What should I change first? | [Create and verify a plan](plan-format.md) |
| Can this prompt fit a budget? | [CLI setup](setup.md#cli), then [CI gates](ci.md) |
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
