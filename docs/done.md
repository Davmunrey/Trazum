# When a change is done

A change here is done when every check that can be run before the push has
been run and passed, and what was planted to prove each new guard is written
down. Not when the code looks right, and not when the tests the author
thought of pass.

`npm run done` asks that question and answers it one criterion at a time. It
adds no criterion of its own: each one is a step of the required CI job,
another workflow, a section of [CONTRIBUTING.md](../CONTRIBUTING.md) or a
test, and `npm run done -- --list` says which. It makes them runnable before
the push, in the tree you have.

It exists because the pieces were all here and the loop was a habit. One day,
2026-11-17, showed twice what a habit misses. `publish.test.js` reads the list
of tracked files, so a new test file was invisible to it until it was staged:
the local run passed and CI failed (#685). And a release reported success
before its packages could be downloaded (#688). Neither was a missing check.
Both were a check run in the wrong state, or not waited for.

## The loop

1. **Make the change.** One issue, one pull request. Open the issue first,
   and start once a maintainer has labelled it `accepted`.
2. **Stage it**: `git add -A`. What is not tracked is not there for CI.
3. **Run `npm run done`.**
4. **Read the first line that is not `passed`**, and fix its cause. Not the
   check: a test that fails is doing its work, so read the failure before
   touching the test. Then run it again, all of it. A later criterion can
   fail because of what fixed an earlier one.
5. **For each new guard, plant the fault it exists to catch** and watch it
   fail, then put the code back. A guard that has never failed is not known
   to guard anything. Say in the pull request what was planted.
6. **Review the diff** against the repository's rules:
   [`.claude/skills/trazum-review/SKILL.md`](../.claude/skills/trazum-review/SKILL.md).
7. **Commit with `-s`, push, open the pull request as a draft**, with
   `Fixes #<n>` first in the description.
8. **Wait for CI.** It runs what `npm run done` ran, on a clean machine, and
   the things only CI can say. A red check is read and fixed at its cause; it
   is not re-run until it passes.
9. **Done** is every required check green on a branch that contains `main`,
   and not before.

## The criteria

In the order they are checked: what costs a second first, then what CI's
required job runs in the order it runs it, then the one workflow that only
some changes bring into play.

| Criterion | What it checks | When it fails |
| --- | --- | --- |
| `staged` | every new file is tracked, so CI and the tests that read the file list can see it | `git add` the files it names |
| `signed-off` | every commit on the branch carries a Signed-off-by line | commit with `-s`; amend the ones it names |
| `changelog` | the change adds its changelog entry as a file in changes/, and edits no entry in CHANGELOG.md | add `changes/<issue>.<kind>.md` (changes/README.md); move any line you added to `CHANGELOG.md` into it |
| `issue` | the pull request names the issue it resolves | open the issue, and put `Fixes #<n>` in the description |
| `lint` | the linter finds nothing | fix the finding; a rule is switched off only in `biome.jsonc`, with its reason |
| `build` | every package builds | read the compiler's first error, not its last |
| `tests` | every test passes | read the failing test before the code: it may be right |
| `postgres` | the web store keeps its contract on a real PostgreSQL | read the SQL the database refused |
| `baseline` | the repository passes its own prompt gate | a prompt grew: shorten it, or record the new figure on purpose |
| `performance` | no workload is three times slower than recorded | look for a pattern that backtracks; the gate is a tripwire, not a benchmark |
| `typecheck-web` | the web app type-checks | fix the type, not the annotation |
| `build-web` | the web app builds | read the first error of the build |
| `privacy` | a pasted log never leaves the browser | find the request the probe names, and remove it |
| `e2e` | the web app does what a visitor does, in a browser | read what the open panel showed in place of what the flow waited for |
| `packed` | the packages work when packed and installed | read which package and which probe; the tree passed and the tarball did not |
| `mutation` | no mutant lives on a changed line that is not on record | write the test that would notice the change |

## Reading the answer

Each criterion gets one of four verdicts:

- `passed`: it was checked and it holds.
- `FAILED`: it was checked and it does not. The reason follows, and for a
  command the last lines of its output and the file that has all of it.
- `not run`: it could not be checked here, and the reason says what is
  missing: a browser, a database, a parser, or a criterion it needs that did
  not pass. **`not run` is not `passed`.** CI runs it.
- `n/a`: no changed file brings it into play.

| Exit code | Meaning |
| --- | --- |
| 0 | Done: every criterion that applies passed |
| 1 | Not done: at least one failed |
| 2 | Not done: nothing failed, and something was not run or not asked for |

`--only lint,tests` runs part of the list while you work. It never exits 0:
part of the list is not a verdict.

Three criteria need something the repository does not bring:

```bash
export CHROME_PATH="$(command -v google-chrome || command -v chromium)"   # privacy, e2e
export PLAYWRIGHT_CORE_PATH="$PW"     # docs/end-to-end-tests.md installs it
export TRAZUM_ACORN="$ACORN"          # docs/mutation-testing.md installs it
export TRAZUM_TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/an_empty_database
```

## What it does not run

**It fixes nothing.** No file is edited, staged, committed or pushed by it,
and no check is skipped to get to a green answer. `done.test.js` fails if the
script gains a command that writes.

**Three steps of the required job are left out**, each for a reason written
beside it in `scripts/done.mjs`. A step added to CI that is neither a
criterion nor on this list fails `done.test.js`, so somebody decides:

- *Install dependencies*: the loop checks the tree you have, with what is
  installed in it.
- *Freshness (fails only on the weekly schedule)*, *Price drift against the
  providers' pages (fails only on the weekly schedule)* and *Cross-check against
  LiteLLM's model list (fails only on the weekly schedule)*: they report on every
  run and fail only on the weekly one, so a change cannot fail them.

**Some things only CI can say**, and a `Done` here does not say them: CodeQL,
npm audit, Dependency review, and the three jobs that run the published
Action against this repository: GitHub Action self-test, GitHub Action spend
gate and GitHub Action directory mode.

**And two things only GitHub knows.** Whether the issue the description names
carries `accepted`: the `issue` criterion here reads that an issue is named,
and `PR readiness` reads the issue itself. And whether the author has signed
the CLA, which the `cla` check reads from the signatures the repository
keeps. Both are required checks, so a `Done` here with an issue nobody
accepted is not a pull request that can merge.
