# Agent workflows

Use this reference for a complete cost investigation or a repeatable budget
check. Tool output is evidence, not permission to spend or deploy.

## Diagnose, plan, verify

1. Read the user's authorized usage export. With a shell, use `trazum bill`
   for supported raw exports or `trazum profile usage.jsonl --json` for a
   normalized log. With MCP, pass the log contents to `profile_usage`.
2. Preserve the period, priced and unpriced calls, skipped records, and pricing
   source. Missing models or fields make the result incomplete; never fill
   them with guessed prices or zero spend.
3. Create a proposal with `trazum plan usage.jsonl --json -o plan.json`, or
   `plan_savings` with `{ "log": "<JSONL contents>" }`. For MCP, save the
   returned `plan` field as the document, not the surrounding response.
4. Explain the plan's assumptions. Model changes need quality evaluation;
   batch processing needs an acceptable latency window. A projected saving
   is not an observed reduction and separate overlapping options are not added.
5. After an authorized change and a later observation period, use
   `trazum verify plan.json --against later.jsonl --json` or `verify_savings` with
   `{ "plan": "<saved JSON document>", "log": "<later JSONL contents>" }`.
   Report `arrived`, `not-arrived`, and `cannot-tell` separately. A vanished
   workload does not prove a saving. Preserve any pricing-change warning.

MCP tools take text, never paths. The host reads and writes within its own
permissions. Read `tools/list` before calling a tool; a released server older
than the skill may not expose the planning tools. In that case use the CLI
equivalent or explain the version gap, rather than inventing a tool response.

## Before a paid call

Use `spend_guard` with the actual configured ceiling, measured spend, model
and proposed token counts. Do not supply a fabricated `consumedUsd: 0` to
obtain a verdict. `cannot-tell` must remain unknown. A `yes` is an estimate
against supplied evidence, not a provider-enforced cap or authorization.

The local HTTP equivalent is `trazum serve`. Fetch
`http://127.0.0.1:7317/openapi.json` for its request/response schema, then use
`POST /cost`. This service consults its startup baseline; it does not forward
provider requests or reserve spending. Do not expose it on a public interface.

`trazum gateway` forwards authorized calls and maintains process-local usage
and in-flight reservations. It is not a durable ledger or an account-wide cap.
After unmeasured usage its configured failure policy applies. Restart only
with a refreshed baseline; spending through other processes is not observed.

## Machine-readable handling

- Parse JSON rather than scraping formatted terminal tables.
- Check the process exit code or MCP `isError` before using a result.
- Treat tool errors as errors, not zero-cost reports. Preserve useful detail
  while excluding credentials and original prompt/log text from diagnostics.
- Keep the complete plan document so CLI, MCP and web can share it. Do not
  rebuild it from a natural-language summary.
- Prefer deterministic checks first. Request paid evaluations only when their
  results can resolve a stated quality question and spending is authorized.

## Reporting

State what was measured, what remains unknown, the proposed action, its
assumptions, and the next observation needed. Say which interface and pricing
version produced the result. Do not describe API-equivalent Claude Code
transcript costs as a subscription invoice.
