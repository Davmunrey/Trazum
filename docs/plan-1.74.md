# The plan for 1.74 — any model's money

One arc, following [1.73](plan-1.73.md). **The arc closes at 1.74.0.** The
ordering is a commitment; the calendar is not.

## The thesis

The bill is already vendor-agnostic where people assume it is not: the
usage-log format reads Anthropic and OpenAI shapes alike, `from-otel` reads
any exporter's spans, the bundled catalogue prices eighteen models from
seven providers, the what-if picker reprices a measured mix at any of them,
and `--pricing-live` overlays hundreds more from OpenRouter's published
feed. What is *not* agnostic yet is where the prices can come from in the
browser, and what the product says about the decision every one of those
numbers exists to serve: **should we switch, and when does it pay?**

Three gaps, three chapters, and every one of them holds the doctrine that
made the rest of this product worth trusting: a price is published, declared
or derived from a measurement — never invented — and quality is measured by
an evaluation, never presumed from a price.

## The chapters, in order

**1. Bring your own price card (the web).** The Bill tab accepts a dropped
or pasted pricing document, two shapes, detected not configured: the
overlay JSON the config's `pricing` key already takes, and the raw
OpenRouter `/models` response — `openrouterOverlay` is pure and exported,
so the same transformation the CLI runs on a live fetch runs in the page on
a pasted file, keeping the no-fetch invariant intact. From there every
figure in the tab — the profile, the levers, the what-if — prices Qwen,
Llama, or the model only your company runs, and every repriced figure names
its source: bundled, overlaid, or yours.

**2. `trazum switch` — the forty-first command.** The question every
what-if reader is actually asking, answered as arithmetic and refusal:
given this measured mix, model A → model B is this much per month
(combined with batching where eligible, never added); with a declared
`--migration-usd` the break-even arrives after N months of that delta
(division on the past, denominator attached, no forecast of growth); and
the evaluation the switch requires is itself priced — your cases × three
calls per case — because the cost of *knowing* the cheaper model is good
enough is part of the cost of switching, and no other tool prices it. What
it refuses: any sentence about quality. The verdict on whether B can do the
work belongs to `trazum route`, and the report ends by printing that
command.

**3. `trazum ownrate` — the forty-second.** The model this product cannot
price is the one you run yourself, and the honest answer is not a guess —
it is *your own* numbers, divided: GPU dollars per hour over measured
tokens per second, at a utilisation you declare, gives dollars per million
tokens, labelled derived-from-your-declaration everywhere it travels. The
command prints the figure and the pricing-overlay snippet ready to paste
into the config, so a self-hosted Qwen becomes a first-class row in every
report — priced by you, marked as priced by you.

**4. The guards, and the honest gaps.** Core fixtures both ways for the
two dropped-card shapes, including a malformed card refused with the
parser's own sentence; `switch` proven against a mix where batching makes
the combined figure smaller than the added one; `ownrate` proven to refuse
zero and negative inputs; command-count guards move to forty-two; and the
web arm carries the same no-fetch grep as every arm before it.

## What this deliberately does not ship

- **A quality column.** Cost is arithmetic; quality is an evaluation that
  costs provider calls and needs credentials. The bridge — dropping a
  `route`/`eval` verdict file into the Bill tab so quality stands beside
  cost — is named as the natural 1.75 and not built here.
- **A Qwen (or any) price typed into the bundled table without a review.**
  Coverage beyond the reviewed snapshot is the overlay's job: OpenRouter's
  published feed, or your own declared card.
- **Any forecast.** Break-even divides a declared cost by a measured rate
  and says over how much past that rate was measured. What next month does
  is next month's business.
- **GPU cost modelling.** `ownrate` divides the two numbers you give it; it
  does not estimate your cluster's utilisation, amortisation or energy — a
  calculator that guessed those would be an invented price wearing
  arithmetic's clothes.
