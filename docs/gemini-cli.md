# Gemini CLI session usage

[Documentation](README.md) / [Agent integrations](agents.md) / Gemini CLI

Import local Gemini CLI sessions to estimate their **API-equivalent usage**.
On the free tier or a Gemini Code Assist plan this is what the same work
costs at Google's list prices, not what you paid. Available since 2.7.0.

## Read your sessions

```bash
npx @trazum/cli bill                       # every agent it finds, Gemini CLI included
trazum bill ~/.gemini/tmp --table          # Gemini CLI alone
trazum from-gemini-cli ~/.gemini/tmp -o usage.jsonl
trazum profile usage.jsonl
```

`bill` with no path reads every `chats` folder under `~/.gemini/tmp/<project>/`
(under `$GEMINI_CLI_HOME/.gemini/tmp` when that is set, and
`~/.cache/.gemini/tmp` where the macOS sandbox moves it), names each one on
stderr, and labels the sessions by project. The rest of `tmp` (shell
history, checkpoints, memory) is never read.

`from-gemini-cli` accepts a file or a directory and recurses through `.jsonl`
and `.json` files, converting only the ones whose own text is a Gemini CLI
session. Normalized JSONL goes to stdout, diagnostics to stderr, and a
conversion with no reply carrying token counts fails instead of writing an
empty log.

The browser Bill tab reads dropped session files the same way, in the tab.
MCP `import_usage` and HTTP [`POST /usage/import`](api.md#import-native-usage)
accept `format: "gemini-cli"` with the session text.

## Where the format comes from

Not from a sample file: from the recorder's own source, google-gemini/gemini-cli
`packages/core/src/services/chatRecordingService.ts` and
`chatRecordingTypes.ts` (Apache-2.0), read for 2.7.0. The facts the converter
rests on:

- **One JSON record per line.** The first is the session's metadata
  (`sessionId`, `projectHash`, `startTime`). Messages follow, with `$set`,
  `$patch` and `$rewindTo` records editing the history. Older versions wrote a
  single pretty-printed `session-*.json` document with a `messages` array; it
  is read too.
- **A message is appended whole every time it changes.** A reply is written
  before its token counts arrive and again with them, so one id appears more
  than once. The last version stands, and the rewrites are counted as
  `repeats`, never as calls.
- **Token counts attach once per reply.** `recordMessageTokens` sets them only
  on a `gemini` message that has none, from the API's `usageMetadata`:
  `input` (prompt), `output` (candidates), `cached`, `thoughts`, `tool` and
  `total`.
- **Editing the history does not undo spend.** A rewind, a removed message
  or a rewritten file changes what the conversation shows, not what was
  called. Every reply that carried tokens is billed once.
- **Subagents** write their own files under `chats/<parent session>/`, which
  the directory walk reaches.

## What is counted

Per reply, following Google's own definitions in the `@google/genai` SDK:

| Usage record | From the reply's `tokens` |
|---|---|
| input | `input − cached + tool` |
| cache read | `cached` |
| output | `output + thoughts` |

`input` (promptTokenCount) **includes** the cached tokens, so they are taken
out of it. `thoughts` is the model's reasoning, billed as output. `tool` is
tool results fed back to the model, billed as input. Together they add up to
`total`, which is checked: a total below its own parts is refused. An older
recorder that kept no `thoughts` or `tool` count but a `total` above the rest
gets the remainder priced as **output**, the dearer side, and the count of
such replies is said on stderr rather than dropped.

Only the model, the timestamp, the session id, the label and the token counts
survive conversion. Prompts, replies, thoughts, tool arguments and results,
and paths are discarded.

## What cannot be established

- **What you paid.** The free tier, Code Assist and Vertex contracts are not
  in the session file. The figure is Google's list price for the work.
- **Calls the recorder did not write.** A session started with recording
  off, or a disk that filled up mid-session (the recorder stops on `ENOSPC`),
  leaves no trace to read.
- **Models the catalogue does not price.** Named on the receipt as unpriced,
  never counted as $0.

## Gemini usage logs, outside the CLI

The same correction applies to any log carrying Gemini's raw `usageMetadata`:
since 2.7.0 `thoughtsTokenCount` is billed as output and
`toolUsePromptTokenCount` as input, in `profile`, `bill` and the gateway alike.
Before, both were left out, and a thinking model's reasoning, often most of
its output, was priced at zero.
