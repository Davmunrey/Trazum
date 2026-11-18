# Coverage

Which lines of the published packages the tests run. `npm run coverage`
measures it, the `Coverage` workflow sends it to
[Codecov](https://app.codecov.io/gh/Davmunrey/Trazum) on every pull request
and on `main`, and Codecov shows it line by line.

It answers the cheap first question, of which
[mutation testing](mutation-testing.md) is the expensive second one. Coverage
says a line was reached by a test. Mutation testing says whether the test
would have noticed the line being wrong. A line that never ran fails both, and
that is what this is for: finding the code no test touches at all.

## Where it stands

Measured on 2026-11-18, every package's tests together: **94.5%** of 70,633
lines, in 152 source files.

| Package | Lines run | Of | Files | Coverage |
| --- | --- | --- | --- | --- |
| `core` | 38,459 | 40,081 | 121 | 95.9% |
| `cli` | 26,329 | 27,995 | 27 | 94.0% |
| `mcp` | 1,811 | 2,348 | 3 | 77.1% |
| `tokenizer-openai` | 205 | 209 | 1 | 98.0% |

A row is a package's sources, and a line counts as run if any package's tests
ran it: the CLI's tests run most of the core, and the core's run part of the
CLI. Figures are rounded down. Codecov has the current ones and this table is
a dated reading, not a live one.

Of the 154 TypeScript files under `packages/*/src`, two are in no report.
`packages/cli/src/i18n/types.ts` holds only types, so nothing of it exists
once built. `packages/mcp/src/index.ts` is the MCP server's entry point: the
tests start it as a process and stop it, and a process that is stopped
writes no report. That is most of why `mcp` reads lower than the rest.

## What the figure is not

So it is not read as more than it is:

- **A line that ran is not a line that is checked.** A test can call a
  function and assert nothing about what it returns.
- **It is over the files the tests loaded.** A source file no test imports is
  not in the report, so it does not pull the percentage down. Codecov lists
  the files it has; a file that is missing from the list is the finding.
- **A process a test starts is measured only if it exits by itself.** Many
  CLI tests run the built CLI as a child process, and it is counted: that is
  how the CLI's entry point is in the report. A process that is killed writes
  nothing, which is the MCP server's case above.
- **Two trees are left out**, each for a reason written in
  `scripts/coverage.mjs`: `apps/web`, whose tests load TypeScript through a
  loader of their own, and `apps/vscode`, which is not published yet.
- **There is no target.** `codecov.yml` sets none, and both of Codecov's
  statuses are informational. A threshold invites tests written to move a
  number.

## How it is measured

Node's test runner has coverage built in, so nothing is installed. The tests
run against built JavaScript, and the report is mapped back through the source
maps the build already writes, so every path in it is a TypeScript file
somebody edits. It runs from the repository's root: from inside a package the
paths would be `src/…`, which every package has.

```bash
npm run build
npm run coverage                 # every package, into coverage/<package>.lcov
npm run coverage -- --only core  # one of them
```

The four packages measured are `core`, `cli`, `mcp` and `tokenizer-openai`.
`coverage.test.js` fails when a published package with tests is not on that
list.

A record whose path is not `packages/<name>/src/….ts` is left out of the
report and named in the output: a test can load a file it wrote to a temporary
directory, and that file is nobody's to cover. A report left with no source at
all fails the command, because that is what a skipped build looks like: the
paths are built files, and every one is left out.

It takes about eight minutes on four cores, seven of them the CLI's tests:
each starts the CLI as a process, and every process writes its own count.

## In CI

The `Coverage` workflow runs on every pull request and on every push to
`main`. It is **not a required check**, so a pull request does not wait for
it, and it is built so that it cannot stand between a pull request and `main`:

- A test that fails under coverage does not fail the job. Whether the tests
  pass is the required `Build and tests` job's to say; this one runs them
  again, more slowly, to count.
- An upload that fails on a pull request leaves a warning and does not fail
  the job. On `main` it does, because that is where the record is kept and
  nobody's merge is waiting.
- Codecov's two statuses, for the project and for the lines a pull request
  changes, report a figure and cannot fail.

The uploader is Codecov's command-line tool, fetched at a pinned version and
refused unless its checksum is the one written in the workflow. No package
depends on it and nothing is added to the lockfile.

The upload token is the repository secret `CODECOV_TOKEN`. It reaches the
uploader through the environment and is never on a command line. It has to be
a *repository* secret: the job names no environment, so a secret kept on an
environment is not given to it. A pull request from a fork has no secret, and
Codecov takes an upload without a token from a fork and from nowhere else: the
first run of this workflow, from a branch of this repository with no token,
was refused with "Token required because branch is protected". The job's log
says whether a token was set, and never the token.

## What Codecov is not used for

Codecov also offers bundle analysis and test analytics. Neither is set up:

- **Bundle analysis** needs a plugin in the web app's build, which is a
  dependency for a figure nobody has asked for yet.
- **Test analytics** reports slow and flaky tests from a JUnit file. The
  repository's time-sensitive tests are few and named
  ([mutation-testing.md](mutation-testing.md) lists how they are handled), and
  a second service reading every test's name and duration is not worth that
  yet.
