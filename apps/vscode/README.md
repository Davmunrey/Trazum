# Trazum for VS Code

What the prompt in front of you costs, counted on this machine, while you write
it.

The status bar shows the token count of the open prompt and, when a budget in
`trazum.config.json` covers the file, where it sits against that budget. The
hover adds the error band on the estimate, the glob the budget came from, and
what the deterministic rules would recover — measured by running them, not
guessed from a ratio.

## It sends nothing anywhere

`@trazum/core` runs in the editor's own process, against text that is already on
your machine. There is no account, no telemetry, and no request. An extension
that uploaded a prompt in order to price it would be the exact inversion of this
product, so the promise is a test rather than a sentence: every source file in
this package is scanned for a way out, and the permitted set is empty.

## What it reads

`trazum.config.json`, found beside the workspace root — the same file the CLI
reads, with the same `budgets` patterns and the same `extensions` list. A
project with no config gets a token count and no budget, because a budget
nobody set is a limit nobody agreed to.

A file the config does not scope shows nothing at all. That is deliberate: the
extension has no opinion about your source code.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `trazum.enabled` | `true` | Show the reading in the status bar. |

## Commands

| Command | What it does |
|---|---|
| `Trazum: What does this prompt cost?` | Shows the hover text as a message. |

## Building it from this repository

```bash
npm run build -w trazum-vscode
npm run test -w trazum-vscode
```

The tests run under `node --test` and need no editor: every judgement lives in
`src/reading.ts`, which takes a string and a config and returns what to show.
`src/extension.ts` is the wire, and a guard holds it to being one.

## Licence

MIT. See [LICENSE](LICENSE).
