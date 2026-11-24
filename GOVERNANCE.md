# Governance

How decisions are made here, who makes them, and what happens if a maintainer
can no longer act.

## Two maintainers

Trazum has two maintainers: the repository's owner
([@Davmunrey](https://github.com/Davmunrey)) and
[@Hatidog](https://github.com/Hatidog), who joined on 2026-11-22 as
`munozrey` and renamed the account in November 2026 (GitHub id 267928862, which a
rename does not change). Both can
triage, merge and release, and each is a code owner of every path. Until then
the bus factor was one; it is two now. The project still promises no response
time ([CONTRIBUTING.md](CONTRIBUTING.md#triage)), and an issue is never closed
for going quiet.

## How a decision is made

- **In public, in an issue, before the change.** A pull request names the issue
  it resolves ([CONTRIBUTING.md](CONTRIBUTING.md#issue-first)).
- **A maintainer triages**, and the label is the decision: `accepted`,
  `blocked`, `needs-info`, `wontfix` or `duplicate`, each meaning what
  [CONTRIBUTING.md](CONTRIBUTING.md#triage) says. `accepted` and `blocked`
  together are the roadmap.
- **The order of the work is a file**, `.github/milestones.json`, from which
  [ROADMAP.md](ROADMAP.md) is drawn. It carries no dates: the order is the
  commitment.
- **What may merge is decided by the rules, not by the person.** Every change
  goes through a pull request with required checks, resolved review threads,
  linear history and the approval of the maintainer who did not open it, under
  a branch ruleset with no bypass. The ruleset is
  [`.github/rulesets/main-branch.json`](.github/rulesets/main-branch.json), and a
  weekly workflow compares it with the one GitHub enforces. The bar a change
  has to clear is in [CONTRIBUTING.md](CONTRIBUTING.md#review).
- **A disagreement is settled in the issue**, with reasons written down. When
  the maintainers disagree, the owner has the last word, and the reason is
  recorded where the decision was made, in the issue or in [CHANGELOG.md](CHANGELOG.md).

## Roles

| Role | Who | Decides | Cannot |
| --- | --- | --- | --- |
| **Maintainer** | The owner and @Hatidog | Triage, merges, releases, prices, the response to a security report. The owner also decides who may hold a role | Merge past the ruleset: it has no bypass actor, the owner included |
| **Contributor** | Anyone with a GitHub account | What to propose, in an issue or a pull request | Merge. A contribution signs off every commit ([DCO](CONTRIBUTING.md#signing-off)) and the [CLA](docs/cla/CLA.md) |
| **Language maintainer** | A reader of one of the seven trimming dictionaries | What that language's dictionary may remove ([docs/language-maintainer.md](docs/language-maintainer.md)) | Change another language's rules or the engine |
| **Coding agent** | An agent working for the owner | The work the owner gave it, under [AGENTS.md](AGENTS.md) | Decide for the owner on somebody else's issue or pull request, or answer for the owner in public ([AGENTS.md](AGENTS.md#other-peoples-work)) |

A security report goes to the maintainers privately, as
[SECURITY.md](SECURITY.md#reporting-a-vulnerability) says.

## If a maintainer can no longer act

Trazum has to be able to close issues, accept changes and release within a week
of losing either maintainer. These are what that rests on:

- **Either maintainer can close issues and release.** Both are reviewers of
  the `release` environment the publish runs under
  ([`.github/environments.json`](.github/environments.json)). Merging is
  different: the ruleset asks for the other maintainer's approval, so with one
  of them gone nothing merges until an admin lowers that count, as the next
  section says.
- **The release needs no person's machine.** Merging a release pull request is
  the release: the workflow publishes to npm, tags, attaches and signs the files
  ([docs/releasing.md](docs/releasing.md)).
- **Two admins, in an organisation.** Since 2026-11-22 the repository belongs
  to the `TrazumAPP` organisation rather than to the owner's personal account,
  and both maintainers are admins of it. A personal repository offers its
  collaborators no admin role, which is why it moved (#925). No setting of the
  repository waits on one person's account.
- **Two publishers on npm.** A member of the `@trazum` organisation on npm can
  publish its packages
  ([npm's documentation](https://docs.npmjs.com/organization-roles-and-permissions)),
  so a release does not wait on the owner's npm account.

**Status on 2026-11-22, as the owner reported it:** both maintainers are admins
of the repository in the `TrazumAPP` organisation, and @Hatidog is a member of
the `@trazum` organisation on npm. Either maintainer can close issues, approve a
release and change the repository's settings without waiting on the other.

**In place since 2026-11-22:** the owner applied the ruleset and
[`.github/environments.json`](.github/environments.json) that day, and both
read back as the files state them (`npm run ruleset`, `npm run environments`).
Either maintainer can approve a release, and every merge waits for the other
maintainer's approval (#922).

## When the other maintainer cannot approve

Every merge waits for the approval of the maintainer who did not push last
(#920). With two maintainers, losing one stops merges, so the way back is
written down here rather than worked out on the day:

1. **Only an admin can lower the count, and only on GitHub.** The fix cannot
   go through a pull request, because that pull request would need the missing
   approval. An admin sets `required_approving_review_count` to `0` and turns
   off `require_last_push_approval` and `require_code_owner_review` in the
   ruleset on the repository's settings page, then opens a pull request that
   says the same in [`.github/rulesets/main-branch.json`](.github/rulesets/main-branch.json)
   and names the issue that records why. The weekly comparison reports the
   difference until that pull request merges.
2. **Whichever maintainer can still act does both steps, the same day.** Both
   are admins, so neither waits on the other's account. Until 2026-11-22 only
   the owner was, and while the owner was unreachable there was no way back;
   moving the repository to an organisation closed that gap (#925).
3. **When a second maintainer can act again**, the three settings go back the
   same way, through a pull request they approve.
