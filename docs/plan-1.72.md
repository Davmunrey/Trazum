# The plan for 1.72 — the playground

One arc, following [1.71](plan-1.71.md). **The arc closes at 1.72.0.** The
ordering is a commitment; the calendar is not.

## The thesis

Every door this product has still asks the visitor to bring something: a
prompt to paste, a log to drop, a config to write. The web app demonstrates
the answers, but not the *tool* — the forty commands live in a terminal the
visitor has not installed yet, and "install it and see" loses most of them.

The playground closes that gap with the cheapest honest move available: a
terminal **in the Bill-adjacent tab**, running the same `@trazum/core`
functions the CLI runs, on sample data that is already loaded. Type
`trazum profile usage.jsonl` and the bill prints. Type `trazum from-otel
spans.otlp.json -o out.jsonl` and then `trazum profile out.jsonl`, and the
whole 1.71 pipe happens in front of you. Nothing is uploaded, nothing is
fetched, nothing is installed — the same invariant every web feature here
carries, now carrying the product's own command line.

## What the terminal actually is, stated before building

- **A pure dispatcher, not a shell.** A quote-aware tokenizer (the real CLI
  gets its tokens from the OS shell; the browser has no shell, so the
  playground brings its own), a command registry, and an in-memory virtual
  file map seeded with sample files. `run(line, state)` is a pure function
  from a command line and the current files to output lines and the next
  files — testable in Node without a browser.
- **The same core functions, not a re-implementation.** `optimize`,
  `profileUsage`, `positionReport`, `comparePrompts`, `otelRecords`,
  `claudeCodeRecords`, `findContradictions`, `estimateTokens`,
  `BUNDLED_CATALOGUE`, `RULES` — the playground prices and optimises with
  exactly what the CLI imports. The *presentation* is the playground's own:
  the CLI's formatting is `console.log` fused with ANSI colour and terminal
  wrapping, deliberately not reusable, and this plan does not fork it.
- **Sample files a visitor can read.** `prompt.txt` (deliberately wasteful),
  `usage.jsonl` (a small measured month), `spans.otlp.json` (an OTLP GenAI
  export), `transcript.jsonl` (a Claude Code session), `trazum.config.json`
  (ceilings for `position`). `ls` lists them, `cat` prints them, and
  converter output written with `-o` lands beside them so the next command
  can read it.

## The chapters, in order

**1. The pure dispatcher.** `apps/web/lib/playground.ts`: tokenizer,
registry, virtual files, `runPlayground(line, state, t, locale)`. Every
command returns lines; nothing in the module touches `fetch`, `process`, or
the DOM.

**2. The commands.** The subset of the forty that is pure in the browser:
`optimize`, `check`, `profile`, `position`, `diff`, `semantic` (the
structural half), `from-otel`, `from-claude-code`, `models`, `rules` — plus
the shell furniture (`help`, `ls`, `cat`, `clear`). Each speaks through the
web dictionary, both locales.

**3. The tab.** `Playground.tsx`: output area, prompt line, history on
arrow keys, `t`/`locale` as props from `App` like every other tab. A new
rail item. No fetch inside the file, held by the same guard shape Bill
carries.

**4. The guards, and the honest gaps.** A suite that runs every registered
command against the samples and fails if any throws or prints nothing; the
1.71 loop proven end to end (`from-otel -o` then `profile`); a planted
secret in the OTLP sample that must never cross into any command's output;
and `help` **naming what is not there**: the network commands (`gateway`,
`serve`, `watch`, `connect`, `eval`, live pricing) do not run in a browser
tab and the terminal says so instead of hiding the difference.

## What this deliberately does not ship

- **The other thirty commands.** Anything that needs the network, a
  credential, the filesystem, or a running process is named as CLI-only in
  `help`, not silently absent — the playground is a subset and says so.
- **The LLM half of `semantic` and `optimize --refine`.** Both cost real
  provider calls. The structural contradiction scan runs; the model-assisted
  pass stays where the credential lives.
- **Uploading your own files into the terminal.** The Bill tab's drop zone
  already prices real files; the playground's samples are for learning the
  commands. One feature per surface.
- **A real shell.** No pipes, no env vars, no globbing. `trazum <cmd>` and
  four helpers. A toy shell that half-works is worse than a dispatcher that
  is honest about being one.
