# Versioning

Trazum follows [semantic versioning](https://semver.org/) for the thing semver
exists to protect — **breaking changes** — and uses the minor and patch fields
to carry the release narrative. Both halves are stated plainly below rather
than left to be inferred from the tags.

## What the three numbers mean here

**Major** is the only one that carries risk, and it means exactly what semver
says: something in [the public API](#what-counts-as-public-api) changed shape,
disappeared, or started throwing. Nothing inside 2.x does that, and nothing
inside 1.x did.

**Minor** closes an arc. Work here is planned in arcs of about ten releases
with a single thesis — `docs/plan-1.41-1.50.md` was *the loop is complete and
inert*, and everything from the connector to the conformance check served it.
The minor bumps when that thesis has landed. 1.51.0 is not "the release after
1.50.9"; it is the release where a story finishes.

**Patch** is a chapter of the arc in progress, or a pricing correction. So the
sequence after 1.50.0 is 1.50.1, 1.50.2, … each a substantial release in its
own right, until the arc's last chapter lands as 1.51.0.

### What that costs, said out loud

**Under strict semver a patch adds nothing, and here it does.** A patch release
of Trazum can add a command, a flag, a document format or a rule. Somebody
pinning `~2.7.0` expecting only bug fixes will receive features.

It cannot break them — the freeze below is unchanged and is the promise
that actually matters — but "you get more than you expected" is a real
surprise and it is fair to want to know about it in advance rather than from a
diff.

The reason the field was available to reassign: inside a frozen line, minor
and patch are *both* additions-only, so the distinction between them was never
load-bearing for safety. It was carrying nothing. It now carries where you are
in the story, which is the more useful thing for it to say.

**Pin `^2.0.0`** if you want everything non-breaking, which is the intended
range and behaves identically under either scheme. Pin an exact version if you
want to choose your upgrades. A tilde range such as `~2.7.0` does not mean
here what it means elsewhere, and this paragraph exists so nobody finds that
out the hard way.

### 1.8.0 through 1.50.0

*Historical.* Every release in that range was a minor, one per batch of work,
and the arcs were not visible in the numbers at all — `docs/plan-1.41-1.50.md`
described ten releases that looked from the outside like ten unrelated ones.
The numbering changed at 1.50.1. Nothing about those releases is different in
retrospect; only what the next ones are called.

## The freeze

**The public API is frozen.** A breaking change waits for the next major.
Nothing in the list below changes shape, disappears, or starts throwing where
it used to return, inside the 2.x line. The same sentence held for the whole
of 1.x.

### What 2.0.0 was

A major is the only release allowed to break something. It is not obliged to,
and 2.0.0 did not: it added nothing and removed nothing. It was spent on a
statement, which `ROADMAP.md` records under 2.0.0: the surface is what is
promised, *"a command that exists will keep existing and keep meaning what it
means"*. Its changelog entry has no Removed section, and no release from
2.0.0 to 2.7.12 has one.

The count of commands was frozen with it, at 46, and that part was lifted on
purpose in 2.4.0, which added commands. An addition is not a break, so the
promise above was not touched by it.

That is a promise about *the surface*, not a promise to stop working on it.
Things that will still change in any 2.x release, minor or patch, and are not
breaking:

- **New** exports, options, commands, flags, rules and advisories. An addition
  cannot break code that does not use it.
- The **text** of any message, in any language.
- The exact output of the heuristic token estimator, within the band documented
  for that kind of text (±4% on CJK, ±6% on Latin prose, ±26% on code, ±33% on
  tabular numbers).
- Prices, which move on someone else's schedule — see below.

### Deprecating something

Removal inside a major line is not allowed, so a thing that should not exist
any more gets deprecated instead. The full procedure, so it is not decided case by case:

1. It is marked `@deprecated` in its JSDoc, naming the replacement. That is what
   makes an editor strike it through — the only warning most people will see.
2. The changelog entry for that release lists it under **Deprecated**, with the
   migration written out. Not "use the new thing", but the actual before-and-after.
3. It keeps working, unchanged, for **at least two minor versions and at least
   six months**, whichever is longer. Deprecating and removing in consecutive
   releases is a breaking change wearing a notice.

   Since 1.50.1 a minor closes an arc, so "two minors" is now roughly twenty
   releases rather than two. That is a strengthening and it stays as written:
   the point of the clause was always that a deprecation outlives the attention
   span of whoever wrote it, and a longer window serves that better. It was not
   rewritten to keep the old duration, because the old duration was never the
   thing being promised.
4. It is removed only in a **major**, and that major's changelog repeats the
   migration rather than pointing back at an older entry.

### Deprecated, and still working

What is marked `@deprecated` in the packages today. Each still works exactly
as it did.

Nothing is, at the moment. The last was `tier` on a model in the pricing
catalogue, deprecated in 1.8.0 in favour of `capability`. The entry that
deprecated it said it would be removed in 2.0. It was not: 2.0.0 removed
nothing. It is removed in 3.0.0, and that release's changelog entry repeats
the migration.

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
- The `trazum.baseline.json` **file format**, which is the strongest of these
  promises because the file is committed. It sits in somebody's repository across
  upgrades, and a Trazum that silently misread an older one would gate their
  build on numbers it invented. That is why the document carries a `version` and
  why a version this Trazum does not know is a loud error naming
  `trazum baseline` rather than a best-effort read. Bumping that version is a
  breaking change and needs a major.
- The bench ratio baseline `--record` writes, for the same reason: it is
  committed, it gates builds through `--against`, and a `schemaVersion` this
  Trazum does not know is a loud error naming `--record`. Bumping that version
  is likewise a breaking change.
- The **shape** of what `--json` prints, and of the file `--markdown-out` writes.
  Fields get added; existing fields keep their names and their units.

Not covered, and free to change in any release:

- The **text** of any message, in any language. Rule titles, advisory
  prose and rejection reasons are copy: they get improved. Match on ids.
- The exact output of the heuristic token estimator. It is an estimate with a
  documented error band, and improving its accuracy is not a breaking change.
- **The value of `ESTIMATE_ERROR_BAND_PCT`, and the answer `detectTextLanguage`
  gives.** The exports are frozen; what they say is not. The band is a measured
  worst case and it moves when the measurement does — it has been 15, then 25,
  then 15 again, and the release that widened it was the honest one. Freezing the
  number would mean either never measuring again or lying about what was found.
  Read the constant rather than hard-coding 15; that is what it is exported for.
  The same holds for the language detector: adding a language, or making it answer
  `null` where it used to guess, changes estimates by design.
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
else's schedule. A pricing update is a **patch** release — sharing that field
with the arc chapters, so the changelog entry is what tells the two apart — and
always moves `PRICING_LAST_REVIEWED`.

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
   **Which number**: a patch, unless this release is the one that lands the
   current arc's thesis — then the minor. There is no rule about how many
   chapters an arc has; there is a rule that the minor is not spent on
   anything less than a finished story.
2. Bump the root and **all six workspace** manifests — core, CLI, MCP,
   tokenizer, web app and editor extension — including every pinned
   `@trazum/core` dependency. Regenerate the lockfile and follow the plugin
   and MCP registry steps in the release procedure.
3. `npm run verify` must be green — the linter, build, tests, typecheck
   across all six workspaces, and the web build. The web build in particular catches things
   nothing else does: `@trazum/core` is bundled for the browser, so one
   `node:fs` import anywhere in its import graph breaks it while `tsc` and the
   tests stay happy.
4. Tag `v<version>`.
5. Move the matching `ROADMAP.md` entry from `Next` to `Released` in `HISTORY.md`.

The manifests are kept in lockstep deliberately: the packages are developed
together, and a version skew between the core and the CLI has no useful meaning.

That is the summary. **[docs/releasing.md](docs/releasing.md) is the procedure**,
and it is the one to follow — it covers the parts that only bite once, including
what the tag does, what has to be configured before a publish can succeed, and
the README pin that has to move after the release commit exists.
