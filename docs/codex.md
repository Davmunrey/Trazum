# Codex session usage

[Documentation](README.md) / [Agent integrations](agents.md) / Codex

Import a local Codex rollout to estimate its **API-equivalent usage**. This is
not a subscription invoice or proof of the amount a provider charged.

## Read an explicit file

```bash
trazum from-codex ./rollout.jsonl --label coding -o usage.jsonl
trazum bill ./rollout.jsonl --table
trazum profile usage.jsonl
trazum plan usage.jsonl -o plan.json
trazum verify plan.json --against newer-usage.jsonl
```

`from-codex` accepts a file or directory. Directory reads recurse through
`.jsonl` and `.ndjson` files. Nothing automatically scans your Codex home.
Decompress archives before importing them. Without `-o`, normalized JSONL goes
to stdout; diagnostics go to stderr. Conversion with no attributable records
fails instead of writing an empty output.

`bill` detects this format in explicitly supplied inputs. The browser Bill
also accepts uploaded rollout files and converts them locally. For MCP
workflows, call `import_usage` with `format: "codex"`, rollout `text` and an
optional explicit `label`. Pass its normalized `log` to [the usage tools](agents.md)
and preserve the import diagnostics alongside their reports. CLI conversion
remains available; neither route establishes source completeness. The HTTP
savings API accepts the resulting normalized text, not native rollouts.
Raw conversation text is not required by savings analysis.

## What is counted

The converter reads `session_meta`, model-bearing `turn_context`, and
`event_msg` / `token_count` telemetry. A usage snapshot is retained only when
its cumulative delta matches its last-call counts. Identical cumulative
snapshots are duplicates, including repeated rate-limit updates. Per-session
high-water counters survive rewinds and session switches within a file. A
rewind cannot establish a new billable origin: only a corroborated progression
beyond the previous high-water mark can contribute new usage.

Cached input is subtracted from ordinary input and retained separately.
Reasoning output is already inside output tokens and is not added twice.
Models retain their recorded names. Unknown models stay unpriced; no model
alias or price is guessed. The timestamp is retained only when valid.

Only model, timestamp, session ID, optional caller-supplied label and token
counts survive conversion. Prompts, responses, instructions, working paths
and other session metadata are discarded. Output still contains session IDs
and labels; review those before sharing it.

## What cannot be established

- Restored totals and aggregate jumps do not establish individual calls or
  their historical models. They establish a baseline for later deltas only.
- Missing model context, invalid counters, counter resets, synthetic
  context-window fills and nonzero cache-write counters are excluded.
- A partial file may lack earlier context. Repeated copies of the same rollout
  supplied as separate files are **not deduplicated across files**.
- Codex telemetry can be estimated, replayed or incomplete. Even a fully
  converted file does not prove complete provider billing or subscription use.

Conversion reports duplicate and excluded counts separately. `bill` JSON adds
`importEvidence` for Codex inputs: source, basis, files, duplicates,
missingModel, unsupported, unparseable and complete. `complete` means no
conversion exclusions were observed, not that billing is complete. Receipt
`gaps` still records unpriced models and other profile gaps. Consumers that
retain only the standard receipt fields must retain import evidence separately.
Normalized JSONL cannot carry excluded snapshots: preserve conversion stderr
alongside that file when auditing or planning savings.

## Upstream format evidence

Implementation was checked against OpenAI Codex commit
`97239fd052db455bd08c41afcdab738e0fe83b87`:
[protocol counters and rollout context](https://github.com/openai/codex/blob/97239fd052db455bd08c41afcdab738e0fe83b87/codex-rs/protocol/src/protocol.rs)
and [Responses usage mapping](https://github.com/openai/codex/blob/97239fd052db455bd08c41afcdab738e0fe83b87/codex-rs/codex-api/src/sse/responses.rs).
The protocol distinguishes token-count telemetry from exact raw response
completion usage. Future upstream changes may require an adapter update;
unsupported shapes are excluded rather than interpreted as zero-cost calls.
