# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

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
