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

## I am using it

In the order somebody actually meets them:

| | |
|---|---|
| [Usage logs](usage-logs.md) | What Trazum can read, and what each optional field unlocks |
| [Provider accounts](accounts.md) | Connecting a provider so usage arrives on its own |
| [The gateway](gateway.md) | Standing in the path of the call, and refusing |
| [CI](ci.md) | Gating a build on tokens, dollars and quality |
| [The plan document](plan-format.md) | The one output meant to be kept, committed and diffed |
| [JSON output](json-output.md) | Every machine-readable document, field by field |
| [The format](format.md) | What another tool must do to emit or read this format |

## I am extending it

- **[Authoring rules](authoring-rules.md)** — how a deterministic rule is written,
  and the bar it has to clear.
- **[The format](format.md)** and **[JSON output](json-output.md)** — the
  contracts, each with a two-direction parity test.
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

Four arcs have been planned in advance and written down **before** the code. They
are kept because the reasoning is the useful part — not because anything in them
is still forthcoming. Every chapter in all four shipped.

| Arc | Thesis | Landed |
|---|---|---|
| [1.30–1.35](plan-1.30-1.35.md) | The report is a document, not a print-out | 1.35.0 |
| [1.36–1.40](plan-1.36-1.40.md) | The estimating half and the measuring half had never met | 1.40.0 |
| [1.41–1.50](plan-1.41-1.50.md) | The loop is complete and inert; nothing runs on its own | 1.50.0 |
| [1.51](plan-1.51.md) | Every figure is a denominator with no numerator | 1.51.0 |

What each of them **refused** to ship — which is the more useful half, since a
plan and its implementation shared a hand — is in
[our own medicine](our-own-medicine.md).
