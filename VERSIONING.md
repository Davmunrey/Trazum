# Versioning

Trazum follows [semantic versioning](https://semver.org/), with one caveat that
applies until 1.0 and is stated plainly rather than buried.

## From 1.0 onwards

**The public API is frozen.** A breaking change waits for 2.0. Nothing in the
list below changes shape, disappears, or starts throwing where it used to
return, inside the 1.x line.

That is a promise about *the surface*, not a promise to stop working on it.
Things that will still change in a 1.x minor, and are not breaking:

- **New** exports, options, commands, flags, rules and advisories. An addition
  cannot break code that does not use it.
- The **text** of any message, in any language.
- The exact output of the heuristic token estimator, within its documented ±15%.
- Prices, which move on someone else's schedule — see below.

### Deprecating something

Removal inside 1.x is not allowed, so a thing that should not exist any more
gets deprecated instead. The full procedure, so it is not decided case by case:

1. It is marked `@deprecated` in its JSDoc, naming the replacement. That is what
   makes an editor strike it through — the only warning most people will see.
2. The changelog entry for that release lists it under **Deprecated**, with the
   migration written out. Not "use the new thing", but the actual before-and-after.
3. It keeps working, unchanged, for **at least two minor versions and at least
   six months**, whichever is longer. Deprecating and removing in consecutive
   releases is a breaking change wearing a notice.
4. It is removed in the next **major**, and the major's changelog repeats the
   migration rather than pointing back at an older entry.

A deprecated export never starts warning at runtime. A library that prints to
somebody else's stderr because *we* changed our mind is a library people vendor
to make quiet.

### The GitHub Action

The Action's **inputs** are covered by the same freeze, with one difference: an
input cannot be renamed, so a rename ships as a new input plus the old one kept
as a documented alias that warns in the job log. `file` → `target` in 0.11.0 is
the worked example, and `file` still functions.

## While below 1.0

*Historical, for anyone reading an old tag.*

**Minor versions could break the API.** `0.3.0` changed `buildAdvisories()` from
positional arguments to an options object and removed `title`/`rationale` from
the `Rule` interface. Both were breaking; both shipped in a minor.

Every changelog entry that contained a breaking change said so in its first
line, with the migration.

## What counts as public API

Covered by the versioning promise:

- Everything exported from `@trazum/core`'s entry point, and from
  `@trazum/core/node`. Both are entry points; the split exists so the browser
  bundle cannot reach the filesystem, not to make one of them private.
- The CLI's commands, flags and **exit codes**. The exit codes matter as much as
  the flags: `trazum check` exiting 1 on a busted budget is the whole feature,
  and a script branching on it is depending on the API.
- The HTTP API's request and response shapes.
- The GitHub Action's inputs.
- The MCP server's **tool names and input schemas**. An agent configuration
  naming `check_prompt` is a caller like any other, and the text a tool returns
  is copy — same split as everywhere else: branch on the structure, not the
  prose.
- Advisory and rule **identifiers** — stable across locales and versions on
  purpose, so callers can branch on them.
- The `trazum.config.json` and pricing-overlay **schemas**. A config that
  validates today has to keep validating; new keys are additions, and a key
  cannot change meaning.
- The **shape** of what `--json` prints, and of the file `--markdown-out` writes.
  Fields get added; existing fields keep their names and their units.

Not covered, and free to change in any release:

- The **text** of any message, in any language. Rule titles, advisory
  prose and rejection reasons are copy: they get improved. Match on ids.
- The exact output of the heuristic token estimator. It is an estimate with a
  documented error band, and improving its accuracy is not a breaking change.
- The exact **prose and layout** of the human-readable terminal report and the
  markdown report. Parse `--json`, not the table.
- Anything under `src/` that neither entry point re-exports. It is shipped in the
  tarball so the source maps resolve and so you can read what runs on your
  prompts — not as an interface.

**Which rules and advisories exist is not frozen either.** A rule that turns out
to produce false positives can be dropped from the default set, and one can be
added. Its *id* stays stable so long as the rule exists, which is what makes
`--disable` and branching on `advisory.id` safe. A removed id will not be reused
for something different.

## Pricing data

`packages/core/src/pricing.ts` tracks published prices, which change on someone
else's schedule. A pricing update is a **patch** release, and always moves
`PRICING_LAST_REVIEWED`.

This means a patch can change the numbers in your report. That is the intended
behaviour — reporting a price that is no longer real is the worse failure — but
it is why the field exists and why every report prints it.

**You do not have to wait for that patch.** As of 1.0 a price is correctable from
your own repository with a pricing overlay, so a stale bundled price is an
inconvenience rather than a wrong budget:

```json
{ "lastReviewed": "2027-01-15",
  "models": { "claude-opus-5": { "inputPerMTok": 6 } } }
```

Point `pricing` in `trazum.config.json` at it, or pass `--pricing`. Every report
then says which models came from the overlay and when the overlay was reviewed,
because a figure from the bundled catalogue and a figure from your file would
otherwise be indistinguishable.

The overlay **schema** is covered by the freeze. The bundled numbers are not, and
never were.

## Merging, and then releasing

Every merge to `main` gets a `CHANGELOG.md` entry — under the version it is
going out in, or under **`Unreleased`** if no release is being cut. That
includes changes to nothing installable: a test, a document, a workflow. The
changelog is the record of what happened to this repository, and a merged commit
with no entry is a change only `git log` remembers.

`Unreleased` is not a version. It is where work waits, and cutting a release
means giving that work a number.

To release:

1. Fold `Unreleased` into a new version heading, or leave anything genuinely
   not-shipping-yet behind. Breaking changes go first, with the migration.
2. Bump the version in every manifest, including the `@trazum/core` dependency
   pinned by `@trazum/cli` and `@trazum/web`.
3. `npm run verify` must be green — build, tests, typecheck across all three
   workspaces, and the web build. The web build in particular catches things
   nothing else does: `@trazum/core` is bundled for the browser, so one
   `node:fs` import anywhere in its import graph breaks it while `tsc` and the
   tests stay happy.
4. Tag `v<version>`.
5. Move the matching `ROADMAP.md` entry from `Next` to `Released`.

The four manifests are kept in lockstep deliberately: the packages are
developed together, and a version skew between the core and the CLI has no
useful meaning.
