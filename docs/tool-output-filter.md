# Opt-in tool-output filter

[Documentation](README.md) / [Context efficiency](context-efficiency.md)

`trazum filter` compacts consecutive identical lines in a **display log before
an agent reads it**. It runs locally without a model or provider key. It keeps
unique lines and diagnostic lines containing error, warning, failure, exception,
traceback, panic, assertion or stderr markers. It does not rewrite prompts,
source files, requests, tool arguments or the gateway.

This first version targets repetitive polling/build logs. It does not summarize
large unique outputs. It is opt-in; installing Trazum does not activate a host
hook or intercept every tool invocation.

## Try it

The filter is available in `@trazum/cli` starting at 2.5.2. To try the latest
source checkout:

```bash
npm ci
npm run build
node packages/cli/dist/index.js filter --help
```

Once that version is installed with `npm install -g @trazum/cli`, use Bash:

```bash
set -o pipefail
npm test | trazum filter compact --recovery-dir "$HOME/.trazum-tool-logs"
```

Choose the producing command yourself. **Keep `pipefail`**: otherwise a passing
filter could hide a failing producer. Stderr is not piped or filtered, so error
output stays visible. Do not add `2>&1` just to reduce it. Use this only for a
non-interactive command whose stdout is a human/agent-readable log, not output
that another program must parse. Do not wrap commands needing a TTY.

The agent sees a shorter view plus the number of repetitions and a recovery
command. The filter writes the complete original before releasing that view.
If persistence fails, it prints the original unchanged and a diagnostic.

## Recover exact output

Run the recovery command printed in the compacted view:

```bash
trazum filter restore <sha256-from-the-view> --recovery-dir "$HOME/.trazum-tool-logs"
```

In a source checkout, replace `trazum` with `node packages/cli/dist/index.js`.
Recovery validates the identifier and content hash before emitting bytes.
Expansion is appropriate when exact output, line counts or surrounding context
matter; recovering every result would defeat the purpose of the filter.

## Measure the emitted view

In the next release after 2.5.2 (or a built checkout), add `--stats` to `compact`
to write one JSON record to the filter's stderr. Stdout stays the same. For
example, in Bash:

```bash
set -o pipefail
npm test | trazum filter compact --recovery-dir "$HOME/.trazum-tool-logs" --stats 2>filter-stats.jsonl
```

The redirect applies only to the filter. The producing command's stderr remains
visible, and `pipefail` still exposes its failure. Use a fresh report filename
for each comparison, or `2>>filter-stats.jsonl` to append runs.

| JSON field | Meaning |
|---|---|
| `schemaVersion`, `kind`, `estimateOnly` | `1`, `trazum-tool-filter`, and `true`; these are local estimates. |
| `applied`, `reason` | Whether the view was actually compacted, and why. |
| `inputBytes`, `outputBytes` | Exact byte counts at this filter, not provider token usage. |
| `estimatedTokensBefore`, `estimatedTokensAfter` | Heuristic counts including recovery instructions in the emitted view. |
| `estimatedTokensSaved`, `estimatedReductionPercent` | Net estimated reduction for this invocation. |
| `repeatedLines` | Repetitions omitted from the view actually emitted. |

The report contains no original log text, paths, hashes or recovery commands.
It is opt-in: avoid feeding telemetry back into the model just to measure a
smaller context. Reports do not accumulate automatically and do not measure
recovery requests, later turns, retries, cache behavior or task quality.

An unchanged supported input reports zero estimated savings. A `storage-failed`
result also reports zero, even if the discarded candidate would have been
shorter. `invalid-utf8`, `stream-limit` (above 1 MiB) and core `too-large`
results keep token estimates `null`; unknown token counts are not zero usage.
Other reasons are `compacted`, `unchanged`, `unsupported` and `not-worthwhile`.
Invalid arguments still fail normally and do not promise a stats record.

## Optional output instructions

```bash
trazum filter instructions
```

This prints a short instruction block to request direct answers while retaining
correctness, evidence and the user's requested detail. Add it once through your
agent's supported instruction mechanism if you want that behaviour. Printing
it does not install or activate it, and shortening already generated output
would not recover output tokens already consumed.

## Claude Code integration

After installing a Trazum release containing this feature, activate the existing
Trazum skill and explicitly ask it to use the tool-log filter for suitable
non-interactive Bash commands. The skill loads its efficiency reference on
request and preserves producer exit status. It can run from a built checkout
or an installed package; it does not need a new MCP tool or a proxy.

The reference explains how to avoid loading whole logs into the model just to
compact them. This is a skill-guided workflow, not an enforcement hook: the host
and agent must actually choose the filtered command. It does not change the
underlying Bash command's authorization requirements.

## Storage and limits

- `--recovery-dir` is required: it explicitly opts into saving raw local logs, which
  may contain sensitive information. Prefer a directory outside your repository.
- On POSIX the store must be owned by the current user with mode 0700; new
  recovery files use 0600. Symlink store roots and symlink recovery files are
  refused. Windows filesystem ACLs remain the operator's responsibility.
- Files are addressed by the SHA-256 of their exact bytes. Identical originals
  reuse one file. There is no automatic retention period: delete the chosen
  store when recovery is no longer needed.
- Invalid UTF-8, terminal controls, CRLF, fenced source and already compacted
  views pass unchanged. The core caps text at 400,000 characters. The streaming
  CLI switches to byte-for-byte pass-through above 1 MiB instead of truncating.
- A view is used only when the heuristic estimates at least 128 fewer tokens
  and a 20% reduction, **including the recovery instructions**. These are policy
  thresholds, not guaranteed reductions with the host's tokenizer.
- Original stdout/stderr interleaving and TTY-dependent formatting are not
  preserved: stdout is buffered for inspection while stderr goes straight
  through. Do not use this for interactive tools or timing-sensitive displays.

## Evaluate the result

Compare complete tasks with and without the filter, including recovery calls,
instruction overhead, retries and task acceptance. Preserve cache information
where available; a shorter payload does not always mean lower billed cost.

The browser-safe `compactToolOutput` API returns the view, application reason,
estimated before/after token counts and repetition count. It does **not** store
anything: integrations must retain the original before showing an applied view.
Use the CLI for the complete local retention-and-recovery workflow.

Neither this filter nor the output instructions increase a provider's quota,
prove unchanged task quality or measure remaining subscription capacity.
