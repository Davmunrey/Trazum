# Coverage

Which lines of the published packages the tests run. `npm run coverage`
measures it, the `Coverage` workflow sends it to
[Codecov](https://app.codecov.io/gh/Davmunrey/Trazum) on every pull request
and on `main`, and Codecov shows it line by line.

Two more things go to Codecov from the same place, each with a section
below: the [test results](#test-results) of that run, and the size of the
[web app's bundle](#the-web-apps-bundle).

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
CLI. Figures are rounded down. This table is a dated reading, not a live one:
every run of the `Coverage` workflow prints the current one in its log.

## Two figures, and why they differ

Codecov shows a lower figure than `npm run coverage` prints for the same
reports. For `main` at `414b058`, on 2026-11-18, from the one run that made
the reports and uploaded them:

| | Lines | Run | Partly run | Not run | Coverage |
| --- | --- | --- | --- | --- | --- |
| `npm run coverage` | 70,633 | 66,809 | not counted | 3,824 | 94.5% |
| Codecov | 70,633 | 65,907 | 111 | 4,615 | 93.3% |

The same 152 files and the same number of lines, and 902 lines apart. An
earlier version of this document, and a comment in the script, said the two
were the same figure. That was written before Codecov had taken an upload.

What is known:

- **The script counts a line by its line record.** A line ran if any report
  says it ran at least once.
- **Codecov's ratio is hits over hits, partials and misses**, as its
  [documentation](https://docs.codecov.com/docs/about-code-coverage) states:
  65,907 of 70,633. A partly run line counts against the figure.
- **Codecov judges a line that carries a branch record by the branch.** Node
  writes a branch record on the line where a branch starts. So a line such as
  `if (schema['additionalProperties'] !== false) return [];`, line 85 of
  `packages/mcp/src/rpc.ts`, which the MCP package's tests ran 108 times, is
  to Codecov a line that did not run, because no test takes its branch.
  Comparing Codecov's verdict on every line of `c220615` with the reports of
  a local run the same day, 1,044 lines differ, and 1,023 of them carry a
  branch record.

What is not known:

- **Codecov's figure is not simply the stricter one.** Where a file is in
  more than one upload, and the CLI's tests run most of the core, Codecov
  called 353 lines run although every report with a branch record on the line
  says a branch there was never taken. Line 466 of `packages/cli/src/index.ts`
  is one. The two reports give that branch different numbers, 20 in one and 9
  in the other. Whether that is why was not tested.
- **The other 21 differing lines** carry no branch record. The two runs were
  on different machines, and their own totals differ by a few lines too. They
  were not traced further.

So neither figure is the true one. For "which lines does no test reach", the
script's count and Codecov's line view agree on all but those 1,044 of 70,633
lines. For "which branch does no test take", Codecov's line view is the place
to look, one file at a time. The badge in the README shows Codecov's figure, because that is the
one a visitor can click through to.

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

Beside each report the runner's own account of the run is kept, as
`coverage/<package>.tap`: what passed, what failed and why. It is not
uploaded anywhere.

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
  again, more slowly, to count. The log does name it: the test, the file and
  line it is at, and the first line of its error. A test that passes in the
  required job and fails here some of the time is a test that depends on the
  clock, and that is worth an issue of its own.
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

## Test results

The same run that counts lines also writes each package's test results, as
`coverage/<package>.junit.xml`, and the workflow sends them to Codecov's test
analytics with the same pinned uploader. Node's test runner writes the format
itself, so nothing is installed for it.

It is for one question the required job cannot answer: which test fails *some
of the time*. On 2026-11-18 two of five coverage runs on a runner had a
failing test in the core that the required job passed on the same commits
(#712). One run says a test failed; only a record across runs says it fails
one time in three, and that is what Codecov keeps.

What is sent: each test's name, how long it took, whether it passed, and for
a failure its message and stack. The file also carries the runner's host
name, which Node writes into it. No source, and nothing a test read or wrote.

A test that fails here still does not fail the job.

## The web app's bundle

The `Bundle` workflow builds the web app and sends the size of what it built
to Codecov's bundle analysis, on every pull request and on `main`.

```bash
npm run build && npm run build:web
DIR="$(mktemp -d)"
npm install --prefix "$DIR" --no-save --ignore-scripts @codecov/bundle-analyzer@2.0.1
node scripts/bundle-report.mjs --analyzer "$DIR/node_modules/@codecov/bundle-analyzer" --dry-run
```

Measured on 2026-11-18, with `--dry-run`, which sends nothing:

```text
trazum-web: 22 files, 1807.9 kB, 539.2 kB compressed  (1,851,354 and 552,234 bytes)
```

So it is not read as more than it is:

- **It is everything under `apps/web/.next/static`**: the scripts, the styles,
  the fonts and the icons a browser can be served. It is not what one page
  loads. No visitor downloads every chunk.
- **Read the total, not the per-file difference.** The build names each chunk
  by a hash of its contents, so between two commits Codecov sees one file gone
  and another arrive where a person would see one file that changed.
- **There is no budget.** The status Codecov posts is informational, and
  growth of five per cent or more is marked as a warning in it. Nothing fails.
- **It is not Codecov's Next.js plugin.** That plugin is for webpack and the
  web app builds with Turbopack. The standalone analyzer walks the built
  directory, so nothing is added to the web app's build. It is installed in
  CI outside the workspace, at one exact version, with install scripts off;
  no package depends on it and the lockfile does not change. The script
  refuses any other version, and turns the analyzer's own telemetry off.

What is sent: file names, sizes and compressed sizes, with the commit and the
branch. No source.

Like the coverage upload, a report Codecov does not take leaves a warning on
a pull request and fails the job on `main`, and the token is read from the
environment by name.

## What needs Codecov's paid plan

Codecov's settings page lists project coverage, flags and components as
available with its Pro plan. None is relied on. The uploads are still flagged
with the package's name, which costs nothing and is what Codecov would group
by; whether the figures by flag are shown depends on the plan, and the
figures by package are in every run's log either way.
