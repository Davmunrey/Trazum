# Versioning

Trazum follows [semantic versioning](https://semver.org/), with one caveat that
applies until 1.0 and is stated plainly rather than buried.

## While below 1.0

**Minor versions may break the API.** `0.3.0` changed `buildAdvisories()` from
positional arguments to an options object and removed `title`/`rationale` from
the `Rule` interface. Both were breaking; both shipped in a minor.

Every changelog entry that contains a breaking change says so in its first
line, with the migration. If you depend on `@trazum/core`, pin the minor
(`~0.3.0`) and read the changelog before bumping.

After 1.0 this caveat disappears and breaking changes wait for a major.

## What counts as public API

Covered by the versioning promise:

- Everything exported from `@trazum/core`'s entry point.
- The CLI's commands, flags and exit codes.
- The HTTP API's request and response shapes.
- The GitHub Action's inputs.
- Advisory and rule **identifiers** — these are stable across locales and
  versions on purpose, so callers can branch on them.

Not covered, and free to change in any release:

- The **text** of any message, in any language. Rule titles, advisory
  prose and rejection reasons are copy: they get improved. Match on ids.
- The exact output of the heuristic token estimator. It is an estimate with a
  documented error band, and improving its accuracy is not a breaking change.
- Anything under `src/` that the entry point does not re-export.

## Pricing data

`packages/core/src/pricing.ts` tracks published prices, which change on someone
else's schedule. A pricing update is a **patch** release, and always moves
`PRICING_LAST_REVIEWED`.

This means a patch can change the numbers in your report. That is the intended
behaviour — reporting a price that is no longer real is the worse failure — but
it is why the field exists and why the reports show it.

## Releasing

1. Update `CHANGELOG.md`. Breaking changes go first, with the migration.
2. Bump the version in every manifest, including the `@trazum/core` dependency
   pinned by `@trazum/cli` and `@trazum/web`.
3. `npm run build && npm test` must be green, and the web app must build.
4. Tag `v<version>`.

The four manifests are kept in lockstep deliberately: the packages are
developed together, and a version skew between the core and the CLI has no
useful meaning.
