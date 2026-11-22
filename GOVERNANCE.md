# Governance

How decisions are made here, who makes them, and what happens if the one person
who makes most of them can no longer act.

## One maintainer

Trazum has one maintainer, the repository's owner
([@Davmunrey](https://github.com/Davmunrey)). **The bus factor is one**, and
this page says so rather than implying a team. What the project promises
because of it is stated in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and in
[CONTRIBUTING.md](CONTRIBUTING.md#triage): there is no promised response time,
and an issue is never closed for going quiet.

## How a decision is made

- **In public, in an issue, before the change.** A pull request names the issue
  it resolves ([CONTRIBUTING.md](CONTRIBUTING.md#issue-first)).
- **The maintainer triages**, and the label is the decision: `accepted`,
  `blocked`, `needs-info`, `wontfix` or `duplicate`, each meaning what
  [CONTRIBUTING.md](CONTRIBUTING.md#triage) says. `accepted` and `blocked`
  together are the roadmap.
- **The order of the work is a file**, `.github/milestones.json`, from which
  [ROADMAP.md](ROADMAP.md) is drawn. It carries no dates: the order is the
  commitment.
- **What may merge is decided by the rules, not by the person.** Every change
  goes through a pull request with required checks, resolved review threads and
  linear history, under a branch ruleset with no bypass. The ruleset is
  [`.github/rulesets/main-branch.json`](.github/rulesets/main-branch.json), and a
  weekly workflow compares it with the one GitHub enforces. The bar a change
  has to clear is in [CONTRIBUTING.md](CONTRIBUTING.md#review).
- **A disagreement is settled in the issue**, with reasons written down. The
  maintainer has the last word, and the reason is recorded where the decision
  was made, in the issue or in [CHANGELOG.md](CHANGELOG.md).

## Roles

| Role | Who | Decides | Cannot |
| --- | --- | --- | --- |
| **Maintainer** | The owner | Triage, merges, releases, prices, the response to a security report, who may hold another role | Merge past the ruleset: it has no bypass actor, the owner included |
| **Contributor** | Anyone with a GitHub account | What to propose, in an issue or a pull request | Merge. A contribution signs off every commit ([DCO](CONTRIBUTING.md#signing-off)) and the [CLA](docs/cla/CLA.md) |
| **Language maintainer** | A reader of one of the seven trimming dictionaries | What that language's dictionary may remove ([docs/language-maintainer.md](docs/language-maintainer.md)) | Change another language's rules or the engine |
| **Coding agent** | An agent working for the owner | The work the owner gave it, under [AGENTS.md](AGENTS.md) | Decide for the owner on somebody else's issue or pull request, or answer for the owner in public ([AGENTS.md](AGENTS.md#other-peoples-work)) |

A security report goes to the maintainer privately, as
[SECURITY.md](SECURITY.md#reporting-a-vulnerability) says.

## If the maintainer can no longer act

Trazum has to be able to close issues, accept changes and release within a week
of losing its maintainer. These are what that rests on:

- **The release needs no person's machine.** Merging a release pull request is
  the release: the workflow publishes to npm, tags, attaches and signs the files
  ([docs/releasing.md](docs/releasing.md)). Whoever controls the repository and
  the npm scope can release by following that page.
- **A GitHub account successor.** GitHub lets an account name a successor who,
  after presenting a death certificate and waiting 7 days (or an obituary and
  21 days), may archive the account's public repositories or transfer them to
  their own account
  ([GitHub's documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/access-to-repositories)).
- **A second publisher on npm.** A member of the `@trazum` organisation on npm
  can publish its packages
  ([npm's documentation](https://docs.npmjs.com/organization-roles-and-permissions)),
  so a release does not wait on the owner's npm account.

**Status on 2026-11-22: the owner has decided to name both, and neither is in
place yet.** This line changes to say who holds each, by role and not by name,
once each is in place, and not before.
