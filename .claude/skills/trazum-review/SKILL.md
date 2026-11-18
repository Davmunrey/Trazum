---
name: trazum-review
description: Review a diff, a branch or a pull request of the Trazum repository against the repository's own rules, and report findings with file and line, each naming the rule and the test or document that states it. Use before opening or merging a pull request here, and when asked to review a change to this repository. It reviews only. It does not fix, approve, merge or push.
---

# Review a change to Trazum against its own rules

This repository's rules are written down twice already: in `CONTRIBUTING.md`,
for a person, and in tests, for the machine. This file is the third reader's
copy and deliberately not a third statement. **It restates no rule.** Each
entry below names a rule, says which changed paths bring it into play, and
points at the document that states it and the test that holds it. Read the
rule there. If this file and that document ever disagree, the document is
right and this file has a bug.

## What this does and does not do

- It reads a diff and reports findings. That is all.
- It does not edit a file, approve a pull request, merge one or push a commit.
  A finding is information for whoever owns the change.
- It does not replace `npm run verify`. A rule that a test holds is checked by
  running the test, not by reading the diff and guessing.
- It does not review `.claude/skills/synced/`, `wiki/`, `plugin/skills/`,
  `docs/assets/` or `package-lock.json`: the first is not this project's, the
  rest are generated, and the source is what gets reviewed.

## How to run it

1. **Get the change.** For a branch: `git fetch origin main`, then
   `git diff --name-only origin/main...HEAD` for the paths and
   `git diff origin/main...HEAD` for the lines. For a pull request, its diff
   and its description.
2. **Pick the rules.** Every rule whose *Applies to* contains a changed path,
   plus the three marked *every change*.
3. **Read each rule where it is stated**, not here.
4. **Do its check.** Where a test holds the rule, run it and report what it
   said. Where a person holds it, do what *Check* says and report what you
   found and what you could not verify.
5. **Report**, in the form at the end of this file.

## The rules

They are in the order `CONTRIBUTING.md`, "Review", gives its questions, which
is the order that has cost this project the most. The rest follow.

### `safe-meaning` · A `safe` rule never changes what a prompt asks for

- **Applies to:** `packages/core/src/rules.ts`, `packages/core/src/phrases.ts`, `packages/core/src/segment.ts`, `packages/core/src/optimize.ts`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 1, and "Adding a rule"; `docs/authoring-rules.md`
- **Held by:** `courtesy.test.js`, `protected-prose.test.js`, `rule-safety.test.js`, and a person for any sentence those do not contain
- **Check:** for each phrase or pattern the diff adds, write one sentence where removing it changes the instruction, save it to a file and run `node packages/cli/dist/index.js optimize` on it. Report the sentence and what came back.

### `price-provenance` · A price is read from the provider's page, never derived

- **Applies to:** `packages/core/src/pricing.ts`, `packages/core/src/pricing-overlay.ts`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 2, and "Changing prices"
- **Held by:** `pricing-review.test.js`, `price-drift.test.js`, and a person for where each figure was read
- **Check:** for every figure the diff changes, find the provider page and the date in the commit message or the description. Flag a rate computed from another rate, and a price changed without its review date.

### `figure-measured` · A number in a document was measured, and its transcript is real

- **Applies to:** `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `docs/`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 2
- **Held by:** `derived-counts.test.js`, `docs.test.js`, and a person for a figure no test derives
- **Check:** for each number, command, flag and quoted output the diff adds to a document, find where the change shows it being measured, defined or produced. Report each one you could not trace.

### `core-offline` · The published packages run offline, with no dependency

- **Applies to:** `packages/core/src/`, `packages/core/package.json`, `packages/cli/package.json`, `packages/mcp/package.json`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 3, and "Security invariants"
- **Held by:** `security.test.js`
- **Check:** `npm test -w @trazum/core`. Then read the diff for a new import, a new `fetch`, a new file or environment read: the test passing does not make the reason for one good.

### `guard-proven` · A new guard was seen to fail

- **Applies to:** `packages/core/test/`, `packages/cli/test/`, `packages/mcp/test/`, `apps/web/test/`, `action/test/`, `test/`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 4, and "Mutation testing, beside both"
- **Held by:** `mutation.test.js` for the files `scripts/mutate.mjs` lists, and a person everywhere else
- **Check:** the description names what was planted for each new guard. For each new assertion, ask whether it would still pass with the code under test removed, and whether its pattern matches the test's own comment.

### `docs-match-code` · The page still says what the code does

- **Applies to:** `packages/`, `apps/`, `scripts/`, `docs/`, `README.md`, `.claude/skills/trazum/`
- **Stated in:** `CONTRIBUTING.md`, "Review", question 5
- **Held by:** `docs.test.js`, `contributing.test.js`, `named-guards.test.js`, `skill-doc.test.js`, `claude-plugin.test.js`, `wiki.test.js`
- **Check:** `npm run verify`. A changed command, flag, key or script name moves its document in the same change.

### `regex-bounded` · No pattern can backtrack without bound

- **Applies to:** `packages/core/src/`
- **Stated in:** `CONTRIBUTING.md`, "Security invariants", and "Adding a rule"; `docs/authoring-rules.md`
- **Held by:** `security.test.js`
- **Check:** for each regular expression the diff adds or changes, look for a quantifier inside a quantifier and a lookbehind that can run at every position. `npm test -w @trazum/core`.

### `workflow-safe` · A workflow pins its actions and keeps credentials out of reach

- **Applies to:** `.github/workflows/`, `action.yml`
- **Stated in:** `CONTRIBUTING.md`, "Security invariants"
- **Held by:** `security.test.js`, and a person for a checkout's credentials
- **Check:** every `uses:` names a full commit SHA with a version comment, every checkout sets `persist-credentials: false`, nothing from the event is interpolated into a `run:` body, and permissions are declared.

### `section-bounded` · A test bounds a prose section by its own heading

- **Applies to:** `packages/core/test/`, `packages/cli/test/`, `packages/mcp/test/`, `apps/web/test/`, `action/test/`, `test/`
- **Stated in:** `test-utils/section.mjs`
- **Held by:** `review-skill.test.js`
- **Check:** a test that reads part of a document takes it with `sectionOf()`.

### `spawn-env` · A test that spawns what this repository built passes `SPAWN_ENV`

- **Applies to:** `packages/core/test/`, `packages/cli/test/`, `packages/mcp/test/`, `apps/web/test/`, `action/test/`, `test/`
- **Stated in:** `CONTRIBUTING.md`, "Tests"
- **Held by:** `i18n.test.js`
- **Check:** `npm test -w @trazum/core`.

### `json-contract` · New machine-readable output is contracted

- **Applies to:** `packages/cli/src/`, `packages/mcp/src/`, `docs/json-output.md`
- **Stated in:** `.github/PULL_REQUEST_TEMPLATE.md`
- **Held by:** `contract-coverage.test.js`, `json-contract.test.js`
- **Check:** a field the diff adds to any JSON the CLI or the MCP server prints is in `docs/json-output.md`, in its own section, with a parity test in both directions.

### `tab-has-flow` · A tab a visitor can open has an end-to-end flow

- **Applies to:** `apps/web/components/`, `apps/web/app/`, `scripts/e2e.mjs`
- **Stated in:** `CONTRIBUTING.md`, "End to end, in a browser"; `docs/end-to-end-tests.md`
- **Held by:** `e2e.test.mjs`
- **Check:** `npm run test:agents`. An expected figure in a flow is worked out by hand in a comment beside it.

### `lint-reason` · A lint rule is switched off with its reason

- **Applies to:** `biome.jsonc`, `packages/`, `apps/`, `scripts/`
- **Stated in:** `CONTRIBUTING.md`, "The linter"
- **Held by:** `lint.test.js`
- **Check:** `npm run lint`.

### `english-only` · The repository is English

- **Applies to:** every change
- **Stated in:** `CONTRIBUTING.md`, "The repository is English"
- **Held by:** a person
- **Check:** source, comments, tests, documents and the commit message are English, outside the two exceptions that section names.

### `issue-and-changelog` · A pull request names its issue and has a changelog line

- **Applies to:** every change
- **Stated in:** `CONTRIBUTING.md`, "Pull requests", and "Issue first"
- **Held by:** `pr-readiness.test.js`, `changelog-coverage.test.js`, and the `PR readiness` check on the pull request
- **Check:** the description opens with a closing keyword and an issue number, and the diff adds a line under `## Unreleased` in `CHANGELOG.md`.

### `signed-off` · Every commit is signed off

- **Applies to:** every change
- **Stated in:** `CONTRIBUTING.md`, "Signing off"
- **Held by:** `.github/workflows/dco.yml`
- **Check:** `git log origin/main..HEAD --format=%B` shows a `Signed-off-by:` line in every commit.

## What to report

One finding per line, most serious first, in this form:

```text
<path>:<line>  <rule id>  <what is wrong, with the input that shows it>
    stated in <document and section>; held by <the test, or "a person">
```

- **A file and a line**, in the changed file. A finding about something that is
  missing names the file where it should be.
- **The rule's id**, from the headings above.
- **What is wrong, with the input that shows it.** Not what the rule is.
- **Where the rule is stated and what holds it**, so the reader can check the
  finding without trusting it.

Then three short lists:

- **Checked and clean:** the rules that applied and found nothing.
- **Not checked:** each rule that applied and that you could not check, with
  the reason. "Read the diff, did not run it" is a useful review.
- **Not applicable:** the rules no changed path brought into play.

If nothing is wrong, say so in one line and give the three lists. Do not pad a
clean review with style remarks: wording and formatting are not findings here.
