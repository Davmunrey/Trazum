# Pending changes

One file per change that is merged into `main` and not yet released. A release
folds them into [CHANGELOG.md](../CHANGELOG.md) under its version, and deletes
them (`scripts/prepare-release.mjs`).

## Add one

Name it `<issue>.<kind>.md`:

- `<issue>` is the number of the issue the pull request resolves: `847`. A
  second entry for the same issue is `847-2`. With no issue, a short slug in
  lowercase and hyphens: `session-hook`.
- `<kind>` is one of `added`, `changed`, `deprecated`, `removed`, `fixed`,
  `security`. The release lists them in that order, under a heading each.

The text is the entry as it will read in the changelog, without the leading
`- ` and without headings:

```markdown
**`trazum gateway --metrics-port <n>` serves what the gateway counted, for Prometheus to scrape.** (#824) One or two sentences on what changed for somebody using Trazum, and why.
```

## Why a folder

`CHANGELOG.md` passed a megabyte, and every pull request edited the same
`## Unreleased` section of it. Two open pull requests always conflicted there,
and a merge of `main` after a release once put an entry inside a version that
was already published, with no conflict at all (#666). A file per change cannot
conflict with another one, and cannot land in a released version (#847).

`pr-readiness.mjs` and `npm run done` check that a pull request adds a file
here, names it this way, and edits no entry in `CHANGELOG.md`.
