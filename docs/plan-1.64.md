# The plan for 1.64 — the report somebody forwards

One arc, following [1.62–1.63](plan-1.62-1.63.md). Under the numbering adopted
at 1.50.1 the chapters run as 1.63.x and **the arc closes at 1.64.0**. The
ordering is a commitment; the calendar is not.

## The thesis

Every number this product computes dies in one of three places: a terminal
somebody scrolls past, a JSON document only machines read, or a Markdown file
that needs a renderer and loses its layout in an email. **The person who pays
the bill is usually not the person who runs the CLI** — and today the only way
to show them the profile is a screenshot of a terminal, which is a document
with no caveats, no links and no second page.

The arc: a report can leave the terminal as **one self-contained HTML file** —
openable by double-click, attachable to an email, archivable next to the log
that produced it — without losing the property that makes this product's
numbers worth reading: **the caveats travel with the figures.** A total whose
"unpriced models" note got cropped out of the screenshot is a lie by omission;
the HTML door exists so that cropping stops being the default.

## The chapters, in order

**1. The profile leaves the terminal.** An HTML door on `trazum profile`,
named like the Markdown one it stands beside — the pages show the invocation
when it exists; this plan is written before the code. One file, no external
assets, no scripts required to read it, both locales, printable. The layout is
the terminal report's editorial order — headline, findings, caveats — not a
dump of the JSON. **Every figure in the HTML comes from the same document
`--json` prints**: the HTML renderer takes the report object, never the log,
so there is no second computation to disagree with the first.

**2. The caveats are furniture, not footnotes.** Unpriced models, skipped
lines, absent fields and every `cannotSay` render with the same visual weight
as the totals they qualify — the design rule this repository already applies
to its terminal output, made explicit where a designer would be tempted to
grey it out. A report with a caveat section that could be deleted without a
test failing is chapter four's job to prevent.

**3. The roll-up ships the same door.** The roll-up is the team-facing
document — four machines, one bill — and the person it is *for* is exactly
the person who does not run CLIs. Same renderer discipline: the roll-up
document in, one file out, contributors' own gaps kept under the contributor
that has them, the overlap caveat impossible to crop.

**4. The parity guard.** A test walks the rendered HTML and matches **every
dollar figure and every token count** back to the document it was rendered
from — both directions: a number in the HTML that is not in the document
fails (invented), and a headline figure in the document that never reaches
the HTML fails (dropped). Proved by breaking the renderer both ways before
it is trusted, per the house method. The guard also asserts the caveats'
presence by content, so chapter two cannot quietly regress into a footnote.

**— 1.64.0 closes the arc**: two documents have an HTML door, the caveats
are load-bearing in both, and the parity guard makes the HTML a projection
of the JSON rather than a rival account of it.

## What stays out, and why

- **Charts.** A bar drawn with CSS is layout; a charting library is a
  dependency and a script a mail client will strip. The first version says
  its numbers in type. If a chart ever earns its place, it earns it as
  inline SVG with the same parity guard.
- **A template language.** The renderer is TypeScript building strings. The
  moment templates feel necessary, the document has too many shapes in it.
- **Serving it.** The web app already serves; this file is for the person
  with an inbox. No flag grows a port.
- **The blocked arcs.** 1.54.0 and 1.57.0 (provider credentials), 1.58.0
  (a distribution decision), the writer's model-assisted polish — still
  named, still not faked.

## What would make this arc a failure

An HTML file that renders the totals beautifully and the caveats small. The
product's whole argument is that a figure and its limits are one object; a
forwarded report that flatters is worse than no report, because it carries
this tool's name on somebody else's cropped screenshot. Chapter four exists
so that failure is a red build rather than a design review.
