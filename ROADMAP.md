# Roadmap

What Trazum is for, what is already true, and what comes next — in order, with
the reasoning attached. Dates are deliberately absent: the ordering is a
commitment, the calendar is not.

**Product line.** Trazum reduces what an AI call costs without changing what
the prompt asks for. Every item below is judged against that sentence. A change
that saves tokens but risks the meaning does not ship; a change that saves
money without touching the prompt at all — caching, batching, model choice —
counts just as much as shortening it.

**Two rules that constrain everything here.**

1. *The deterministic core stays free and offline.* No feature may make a
   network call a prerequisite for optimising a prompt. Anything that needs a
   remote service is opt-in and degrades to the deterministic path.
2. *A locale changes the report, never the optimisation.* The same prompt in
   any language produces the same optimised prompt, the same token counts and
   the same advisory ids.

---

## Released

### 0.1.0 — Deterministic core

The bet: rules first, model second. Most prompt bloat is mechanical —
courtesy, filler, verbose phrasing, paragraphs pasted in twice — and a rules
engine removes it reproducibly, for free, with no API key and no round trip.

- 12 rules across two levels (`safe`, `aggressive`).
- Protection pass: code fences, inline code, URLs, template placeholders and
  XML/HTML tags are isolated *before* any rule runs, so no rule can
  structurally break a prompt.
- Dependency-free heuristic token estimator (±15% on ordinary prose).
- Pricing catalogue with promotional pricing and per-model cache minimums.
- Advisories: caching, Batch API, model tier, context window.
- Optional, pluggable LLM pass with safety checks — a candidate is only
  accepted when it is shorter and leaves protected content byte-identical.
- CLI (`optimize`, `check`, `models`, `rules`) and a Next.js web app.

### 0.2.0 — Caching measured honestly

Fixing a real imprecision: savings were computed over the whole prompt, but
prompt caching is a byte-for-byte prefix match, so a template only caches up to
its first placeholder. Reporting the full-prompt figure overstated the saving
on exactly the prompts people cache most.

- `analyzeCachePrefix` measures the true stable prefix.
- New `cache-prefix-reorder` advisory: finds stable instructions stranded
  *after* the first placeholder, which today never cache, and prices moving
  them in front.
- Packaged GitHub Action for `trazum check`, with a self-test in CI.

### 0.3.0 — English-first, with real internationalisation

The repository is English end to end: source, comments, tests, docs, CLI, web,
CI. Spanish did not get deleted — it got promoted from hardcoded prose to a
locale, which is the only version of "add a language" that survives contact
with a second one.

- Per-locale message catalogues in every package (`core`, `cli`, `web`).
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` take a locale; the report carries it.
- CLI `--locale`, then `TRAZUM_LOCALE`, then the POSIX variables.
- Web negotiates `Accept-Language` server-side and offers a switcher whose
  choice is remembered.
- Catalogue-parity tests, so a locale cannot silently go stale.
- Sample prompts per language, both exercised by the action self-test.

---

## Next

### 0.4.0 — Rules that read structure, not just phrases

Today every rule is a phrase or a paragraph match. The biggest remaining waste
in real prompts is structural, and invisible to a dictionary.

- **Redundant few-shot examples.** Long prompts accumulate examples that teach
  the same thing. Cluster them by the pattern they demonstrate and flag the
  ones carrying no new information. Advisory-only at first: dropping an example
  is a judgement call, so Trazum should point rather than cut.
- **Contradictory instructions.** "Answer in English" three paragraphs above
  "always reply in the customer's language" is a correctness bug that costs
  tokens twice. Detect direct conflicts and surface them.
- **Restated output formats.** A JSON schema given both as prose and as a code
  block only needs the block.
- **Rule-level diffing in the report**, so an aggressive run can be reviewed
  rule by rule instead of all at once.

### 0.5.0 — Measurement instead of estimation

Trazum currently reports what a prompt *should* save. The obvious next question
from anyone about to change a production prompt is whether the shorter version
still works — and that is not something a rules engine can answer by itself.

- **Golden-set evaluation.** Point Trazum at a set of inputs and let it run
  both prompt versions through a configured provider, reporting where outputs
  diverge. Turns "aggressive mode might change nuances" from a caveat in the
  README into a number.
- **Exact counts by default** where an API key is present, with the heuristic
  as the documented fallback.
- **Real cache simulation**: given a call log, report the hit rate actually
  achievable rather than one the user has to guess at.

### 0.6.0 — Fits into a workflow

Optimising once is a demo. The value is in a prompt staying lean as it is
edited over months.

- **`trazum diff`**: compare two prompt versions and report the token and cost
  delta — for pull requests.
- **PR comment mode** for the GitHub Action: post the budget result and the
  delta rather than only failing the build.
- **Directory mode**: `trazum check prompts/` with a per-file budget from a
  config file, so a repository of prompts is governed as a whole.
- **`trazum.config.json`**: project-level defaults for level, model, usage
  profile, disabled rules and budgets. Flags keep overriding it.

### 1.0.0 — A stable contract

1.0 means the API stops moving, not that the feature list is finished.

- Public API frozen under semantic versioning, with a documented deprecation
  policy.
- `@trazum/core` and `@trazum/cli` published to npm (the manifests are already
  prepared).
- Pricing data separated from the release cycle, so a price change does not
  require a library upgrade.
- Documented rule-authoring guide, so rules can be contributed without reading
  the engine.

---

## Under consideration

Not scheduled. Listed so the reasoning is on the record.

- **More locales.** The architecture supports it as of 0.3.0, and adding one is
  now a catalogue plus dictionary entries. Held back on purpose: a language
  needs a maintainer who actually reads it, and a stale translation is worse
  than an honest fallback to English.
- **Editor extension.** Live token cost while writing a prompt is the right
  place for this to live. Waiting on 0.6.0's config file so it has something to
  read.
- **Tokenizer per model family.** The heuristic compares two versions of the
  same prompt well, which is what it is for. A real tokenizer would improve
  absolute figures at the cost of the dependency-free promise — worth doing
  only as an optional package.
- **Prompt library.** Storing prompts is a different product, and one that
  would mean sending them to a server. Trazum's privacy story is that it never
  does.

---

## How versions are decided

See [VERSIONING.md](VERSIONING.md). Briefly: while below 1.0, minor versions
may contain breaking API changes and always say so at the top of their
changelog entry.
