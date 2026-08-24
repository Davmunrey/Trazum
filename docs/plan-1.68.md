# The plan for 1.68 — the browser catches up

One arc, following [1.65–1.67](plan-1.65-1.67.md). Under the numbering
adopted at 1.50.1 the chapters land as patches of 1.67.x if released
separately, and **the arc closes at 1.68.0**. The ordering is a commitment;
the calendar is not.

## The thesis

The web app's Bill tab has read a usage log in the browser since 1.36, and
the property that makes it acceptable — **the log never leaves the page** —
has held through every card added since: the levers, the what-if, the
comparison, the drill-down. But 1.67 taught the product a new sentence,
*where does the month stand against the ceilings I configured*, and only
three of the four surfaces can say it: the CLI (`trazum position`), the HTML
door (`--html-out`) and the MCP server (`position`). The browser — the one
surface a person who pays the bill actually opens — cannot.

The arc: **everything the CLI can say about your money, the web app can say
in the reader's own tab, from the same functions, with nothing uploaded.**
Not a re-implementation that drifts — the same `positionReport` the other
three doors call, fed by the same `parseConfig` the CLI reads
`trazum.config.json` with, so a fourth surface cannot disagree with the
other three about where the month stands.

One honest correction, recorded because the plan was written before the
code was read: the original sketch had "what-if in the browser" as a
chapter. It already shipped — the Bill tab has carried the CLI's
`--what-if` as a card, computed in the page by `repriceProfile`, since the
levers work. The chapter below that replaced it is the one genuinely
missing piece: the ceilings' source.

## The chapters, in order

**1. The position, in the tab.** A card in the Bill tab that renders the
`PositionDocument` — every configured ceiling with its measured spend, its
window, its denominators, and its verdict; the distance line as division
labelled as division, absent under the `MIN_SCALE_DAYS` floor, on an `over`
and on a zero rate, exactly as the CLI withholds it. The unmeasured
ceilings render with their reasons (`no-clock`, `no-labels`,
`nothing-recorded`, `label-unseen`), the `cannotSay` lines render as
furniture, and `source: usage-log` is stated on the card — the store's
provider-billed standing is a different measurement and is never merged in.
Computed by the same `positionReport` as the other three doors, on the same
parsed records, in the page.

**2. The ceilings come from the real config.** The card's input is the
reader's own `trazum.config.json`, pasted and parsed by the same
`parseConfig` the CLI uses — the same validation, the same error sentences,
the same rejection of a negative ceiling as "outage as a policy". No
retyping numbers into bespoke fields that could accept what the config
schema refuses; a config that validates in the browser validates at the
CLI, because it is one parser. A config with no `spend.monthlyUsd` and no
`limits` block is told it configures no ceilings, not shown an empty
report.

**3. Both locales, and the states between.** Every sentence exists in
English and Spanish; the empty states (no config pasted yet, config with no
ceilings, log with nothing priced) and the error states (invalid JSON, a
config the schema refuses) each say what happened and what would change it.
The verdict words stay the product's own — within, over, cannot-tell — and
a `cannot-tell` is never rendered as a softer "within".

**4. The parity guard.** Tests that hold the fourth door to the other
three: the card renders from a `PositionDocument` field-for-field (source,
window, denominators, verdicts), never from its own arithmetic; session
keys never render anywhere in the tab, held the way the three-doors suite
holds it — by grepping the output, not by trusting the code; and the
planted-defect discipline applies — a guard that cannot fail on the defect
it names is not a guard.

## What this deliberately does not ship

- **A config editor.** The browser reads the file the CLI reads; it does
  not write one. A UI that generates configs is a second source of truth
  for the schema, and `trazum init` already owns that conversation.
- **Waivers in the browser.** A waiver is a decision with an author and an
  expiry, recorded next to the config in a repository. Reading them here
  would be safe; the pressure to *grant* them here would follow. The card
  states verdicts; the doors enforce them.
- **The store's standing.** The card says `source: usage-log` because that
  is the only source it reads. Folding in the provider-billed buckets would
  be the two-doors defect with extra steps — the same refusal
  `positionReport` itself makes.
