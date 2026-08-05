# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

## 0.5.0

A third structural finding, same posture as the first two: it reports, it does
not cut.

- New `restated-output-format` advisory. A prompt that shows its schema in a
  code block and then walks the same fields in prose is paying for the schema
  twice; the block is the version worth keeping, since it is unambiguous and
  the protection pass guarantees Trazum never edits it. Priced per month.
- Reads *illustrative* schemas, not only valid JSON. Prompts routinely contain
  trailing commas, `...` and `<placeholders>`, and refusing to parse those
  would skip exactly the prompts worth checking — so key extraction is a
  depth-aware scan rather than `JSON.parse`.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification ("set `escalate` to true when the customer asks for a human")
  and flagging it would turn the advisory into noise.
- New public API: `findRestatedFormat`, and the `RestatedFormat` type.
- Tests grow from 138 to 145.

### Dependencies

- `next` 15 → 16, which is what finally cleared the three high-severity
  `postcss` and `sharp` advisories. Bumping the direct dependency was not
  enough on its own: the lockfile kept the vulnerable transitives, and the
  blocking audit is scoped to the published packages so it never saw them.
  `npm audit` over the whole tree now reports 0 vulnerabilities. The lesson is
  recorded in `SECURITY.md`.
- `actions/checkout` and `actions/setup-node` 4 → 7, clearing the Node 20
  deprecation warning every run was printing.
- `actions/dependency-review-action` 4 → 5.

## 0.4.0

Structural analysis: findings that live in the *relationship* between two
places in a prompt, which no phrase dictionary can see because neither place is
wrong on its own. Both are advisory — Trazum points, it does not cut.

- **Fixes a corruption bug in `duplicate-lines`.** The rule was deleting the
  shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often exactly why both are there. Labelled example fields (`Input:`,
  `Output:`, `Q:`, `A:`, and Spanish equivalents) are now exempt from
  line deduplication. This affected the `safe` level, so it could silently
  damage a prompt anyone ran through Trazum.
- New `contradictory-instructions` advisory across four axes: response
  language, output format, response length, and whether to show the reasoning.
  Reported as a **warning** with both conflicting sentences quoted. It carries
  no dollar figure — being wrong has no price tag.
- New `redundant-examples` advisory: few-shot examples that are near-copies of
  an earlier one, with the tokens they cost per month. It detects copy-paste
  accumulation (~0.89 similarity for a copied example with one field changed),
  and deliberately **not** paraphrases (~0.54), which sit too close to
  genuinely distinct examples (~0.20) to separate without a model.
- **Advisories now sort by severity before money.** Sorting purely on the
  dollar figure buried an overflowing context window — and now a contradiction
  — underneath a saving of a few dollars.
- New public API: `findContradictions`, `analyzeExamples`, `findExamples`, and
  the `jaccard` / `normalizeForCompare` similarity helpers, which moved to a
  shared module so the duplicate rules and the structural analysis cannot
  disagree about what "near-duplicate" means.
- Adding a contradiction axis now fails to compile until every catalogue names
  it, the same guarantee `RuleId` gives rules.
- Tests grow from 75 to 94.

### Security

Hardening for an open repository taking outside contributions. Full reasoning
in [SECURITY.md](SECURITY.md).

- **Fixes four SSRF filter bypasses.** The web app's private-host blocklist
  allowed `https://[::ffff:169.254.169.254]` — the IPv4-mapped IPv6 form of the
  cloud metadata address, which Node normalises to `[::ffff:a9fe:a9fe]` and the
  old patterns did not match. Also allowed: a trailing-dot hostname
  (`localhost.`), the carrier-grade NAT range (`100.64.0.0/10`), and
  credentials embedded in the URL, which would have been forwarded to whatever
  the host resolved to and written into any log recording the endpoint.
- The filter moved from the Next.js route into `@trazum/core` as
  `validateLlmEndpoint` / `isPrivateHost`, so the most security-sensitive code
  in the project is unit-tested instead of living untested in an API handler.
  It returns a reason code rather than a message, so callers localise it and
  tests assert on the decision.
- **Fixes two ReDoS denial-of-service bugs**, both reachable from the public
  HTTP endpoint, both found by CodeQL after the first round of ReDoS tests had
  passed:
  - `whitespace` — a **`safe`-level rule present since 0.1.0**. Its
    trailing-whitespace pattern restarted at every position inside a whitespace
    run and failed from each one when the run did not end the line: 17 seconds
    on a 100 KB line of spaces, well inside the 400 KB the API accepts.
    Anchored to the start of a run, it is now 3 ms at 400 KB.
  - The few-shot label patterns added in this release ended in three adjacent
    unbounded quantifiers, measured at O(n²) — 651 ms at 40 000 spaces, about a
    minute at the size cap. Their quantifiers are now bounded.
  - The ReDoS suite gained the fixture shape it was missing. The original
    fixtures were all *repeated tokens*, which exercise the happy path over and
    over; neither bug needed that, they needed a plausible prefix followed by a
    long run that never completes the match.
- New `security.test.js` enforcing four invariants on every pull request: the
  SSRF filter fails closed, the core and CLI carry zero runtime dependencies,
  `fetch` appears only in the two modules that exist to make calls, and no
  regex exhibits catastrophic backtracking under pathological input.
- Workflows run with `permissions: contents: read` by default,
  `npm ci --ignore-scripts`, and `persist-credentials: false`.
- Added CodeQL (`security-extended`), dependency review, a weekly `npm audit`,
  Dependabot, `CODEOWNERS`, and an importable branch ruleset at
  `.github/rulesets/main-branch.json`.
- `SECURITY.md` documents the threat model, private reporting, the settings an
  admin still has to switch on, and the limits that are not covered — DNS
  rebinding, per-instance rate limiting, and actions pinned to tags.

## 0.3.0

**Breaking.** `buildAdvisories()` takes an options object instead of trailing
positional arguments: `buildAdvisories(prompt, tokens, usage, { on, count, locale })`
replaces `buildAdvisories(prompt, tokens, usage, on, count)`. The `Rule`
interface no longer carries `title` or `rationale` — rules carry an `id`, and
copy is resolved from the message catalogue with `getMessages(locale).rules[id]`.
`OptimizationResult.rules` is unchanged, so consumers of the report need no
migration.

The repository is now English end to end — source, comments, tests,
documentation, CLI, web and CI. Spanish was not removed; it was moved out of
hardcoded prose into a locale, which is the only version of "add a language"
that survives a second one.

- Per-locale message catalogues in `@trazum/core`, `@trazum/cli` and
  `@trazum/web`, with English as the declared source of truth.
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` accept a `locale`, and the result carries
  the locale it was produced in.
- New `matchLocale()`, which returns `null` when its input names no locale we
  ship — that is what lets a caller fall through to the next configuration
  source instead of mistaking a fallback for a choice. `resolveLocale()` now
  walks a whole `Accept-Language` list, so `fr-FR,es;q=0.9` resolves to Spanish
  rather than defaulting to English.
- CLI: `--locale`, then `TRAZUM_LOCALE`, then the POSIX locale variables. The
  flag is read straight from argv, so even a bad-argument error is reported in
  the requested language. `trazum rules` now reads its copy from the core
  catalogue, so it can no longer drift from the report.
- Web: `Accept-Language` is negotiated on the server, so first paint already
  matches the reader; a switcher in the masthead overrides it and the choice is
  remembered. `generateMetadata` negotiates too, so link previews follow.
  The API route localises its own errors as well as the report.
- The web starter prompt now exists per language, since the phrase
  dictionaries are per-language and the example exists to show rules firing.
  Switching language never overwrites a prompt you wrote.
- `GET /api/optimize` no longer returns rule copy: it was locale-blind, and the
  report carries its own.
- Sample prompts are `examples/sample-prompt.en.txt` and
  `examples/sample-prompt.es.txt`; the action self-test runs against both.
- The GitHub Action takes a `locale` input.
- Tests grow from 47 to 75, adding catalogue-parity coverage so a locale cannot
  silently go stale, plus a CLI suite covering locale resolution. `npm test` now
  runs both packages.
- New `ROADMAP.md`, `VERSIONING.md` and `CONTRIBUTING.md`.

## 0.2.0

- Cacheable-prefix analysis (`analyzeCachePrefix`): the prompt-caching advisory
  computes its saving over the real stable prefix — everything before the first
  template placeholder — instead of over the whole prompt, which in a template
  never caches in full.
- New `cache-prefix-reorder` advisory: detects stable instructions sitting
  after the first placeholder, which today never cache, and prices moving them
  in front.
- Packaged GitHub Action (`Davmunrey/Trazum@main`) for `trazum check`: token
  budgets in CI with nothing to install, with a self-test in the repository's
  own CI.

## 0.1.0

First release.

- Deterministic core (`@trazum/core`): 12 rules across two levels, isolation of
  code/URLs/templates/XML, dependency-free token estimator, pricing catalogue
  with promotions, and savings advisories (caching, Batch API, model tier,
  context window).
- Optional, pluggable LLM layer (OpenAI-compatible endpoints, the Claude API,
  or a custom provider) with safety checks: a candidate is only accepted when
  it is shorter and preserves the protected content.
- CLI (`@trazum/cli`): `optimize`, `check` (token budgets for CI), `models` and
  `rules`; clean output when redirected, plus `--json`, `--diff` and
  `--exact-tokens`.
- Web (`@trazum/web`): Next.js interface with a word-by-word diff, local
  history, an editable cost scenario and a configurable LLM pass.
