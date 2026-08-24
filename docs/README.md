# Trazum documentation

Somebody choosing this tool, somebody using it, somebody extending it and
somebody maintaining it want four different documents, and a file that serves
two of them serves neither. Find yourself below. The fifth section is for when
something is wrong.

---

## I am deciding whether to use this

Start at the [README](../README.md) — what it is, what it costs you to try, and
one worked example per command.

Then, if you want to know whether to trust the numbers:

- **[The doctrine](doctrine.md)** — the rules this product refuses to break, each
  one discovered by getting it wrong first. This is the actual argument for why a
  cost figure from this tool is worth reading.
- **[Our own medicine](our-own-medicine.md)** — the same standard applied to this
  project: what it refused to ship, what it got wrong and for how long, and what
  it cannot say about itself.
- **[Any input](hardening.md)** — what is promised about input this tool was
  never meant to see, and the seeded fuzz suite in CI that holds each promise:
  never throws, never grows, idempotent, masks intact, money never negative.

## I am using it

In the order somebody actually meets them:

| | |
|---|---|
| [Usage logs](usage-logs.md) | What Trazum can read, and what each optional field unlocks |
| [Accounts](accounts.md) | Signing in to the web app: the prompt library, share links, and what the database holds |
| [The gateway](gateway.md) | Standing in the path of the call, and refusing |
| [CI](ci.md) | Gating a build on tokens, dollars and quality |
| [Running it](running.md) | Making it happen on a schedule, and why that schedule is yours |
| [The plan document](plan-format.md) | The one output meant to be kept, committed and diffed |
| [JSON output](json-output.md) | Every machine-readable document, field by field |
| [The format](format.md) | What another tool must do to emit or read this format |

## I am extending it

- **[Authoring rules](authoring-rules.md)** — how a deterministic rule is written,
  and the bar it has to clear.
- **[Maintaining a language](language-maintainer.md)** — what a dictionary
  maintainer decides, which five of the seven dictionaries nobody here reads, and
  the worklist `scripts/dictionary-worklist.mjs` prints for each.
- **[The format](format.md)** and **[JSON output](json-output.md)** — the
  contracts, each with a two-direction parity test.
- **[The prompt writer](prompt-writer.md)** — the questions `trazum write` asks,
  why each one is asked only when its answer can change the output, and what a
  declined answer costs you.
- **[Contributing](../CONTRIBUTING.md)** — how to propose a change here.

## I am maintaining it

- **[Releasing](releasing.md)** — the recipe, and what the workflow does.
- **[Versioning](../VERSIONING.md)** — what the three numbers mean here, which is
  not quite what semver says.
- **[Changelog](../CHANGELOG.md)** — every decision, every reversal, every reason.
- **[Releases](../RELEASES.md)** — the same facts written for a person with forty
  seconds.
- **[Roadmap](../ROADMAP.md)** — the history as a story, oldest first, and what is
  planned next.

## I want to report a problem

- **[Security](../SECURITY.md)** — how to report a vulnerability privately.
- **[Support](../SUPPORT.md)** — what is answered, by whom, and how fast.
- **[Code of conduct](../CODE_OF_CONDUCT.md)** — what is expected of everyone here.

---

## The arcs, as they were planned

Seven plans have been written down **before** the code. Six delivered in
full; one landed six of its nine arcs. The delivered plans are kept because
the reasoning is the useful part, not because anything in them is still
forthcoming: every chapter in them shipped. The 1.52–1.60 plan keeps its three
open arcs visible for the same reason — what a plan could not build, and why,
is the half a reader cannot reconstruct.

| Arc | Thesis | Landed |
|---|---|---|
| [1.30–1.35](plan-1.30-1.35.md) | The report is a document, not a print-out | 1.35.0 |
| [1.36–1.40](plan-1.36-1.40.md) | The estimating half and the measuring half had never met | 1.40.0 |
| [1.41–1.50](plan-1.41-1.50.md) | The loop is complete and inert; nothing runs on its own | 1.50.0 |
| [1.51](plan-1.51.md) | Every figure is a denominator with no numerator | 1.51.0 |
| [1.52–1.60](plan-1.52-1.60.md) | Nine arcs: finish what shipped incomplete, then widen | **six of nine** — 1.52.0, 1.53.0, 1.55.0, 1.56.0, 1.59.0 and 1.60.0 landed; 1.54.0 and 1.57.0 blocked on provider keys; 1.58.0 is a distribution commitment |
| [1.61](plan-1.61.md) | Trazum has only ever read prompts somebody else wrote | 1.61.0 — all six chapters; the model-assisted polish stays named and unbuilt |
| [1.62–1.63](plan-1.62-1.63.md) | Held to its own standard, then measured: fuzz as a fixture, perf as a gate | 1.62.0 and 1.63.0 — both arcs, all nine chapters; the ratio gate is live in CI |

What each of them **refused** to ship — which is the more useful half, since a
plan and its implementation shared a hand — is in
[our own medicine](our-own-medicine.md).

**The 1.52–1.60 plan is the one to read differently.** Its first three arcs
answer things that are wrong or missing today and point at the line of code for
each; the remaining six are an ordering of intentions. The plan says which kind
each arc is, because presenting all nine with equal confidence would merge a
measurement with a projection on the roadmap of a tool whose first doctrine rule
forbids that.
