# The plan for 1.73 — the guided tour

One arc, following [1.72](plan-1.72.md). **The arc closes at 1.73.0.** The
ordering is a commitment; the calendar is not.

## The thesis

The app now holds five doors — optimise, write, compare, the bill, the
playground — and a first visitor sees five tabs and a paste box. Every door
explains itself once opened; nothing explains which door answers which
question. The 1.72 playground made the tool demonstrable; this makes it
**discoverable**: a guided tour, offered not imposed, that walks the visitor
door to door and says what question each one answers, ending in the
playground where they can type their first command.

The shape is the one the best product tours share: a dimmed page, one
element ringed, a card that says what it is, next and back and a visible way
out. And the constraints are this repository's own: no third-party tour
library (a dependency for what is a rectangle and some state), no fetch, no
motion for a reader who asked for none, both locales, and the tour never
auto-plays — it is offered on first visit and lives behind a button forever
after, because software that grabs the mouse on arrival has already taught
the visitor the wrong first lesson.

## The chapters, in order

**1. The steps, as data.** `apps/web/lib/tour.ts`: an ordered `TOUR_STEPS`
array — id, the tab it lives on, the `data-tour` target it rings — pure and
testable in Node. The copy lives in the web dictionary under `t.tour`, one
title and one body per step, so the steps file holds structure and the
dictionaries hold every sentence, the same split as everywhere else.

**2. The overlay.** `Tour.tsx`: a fixed overlay that measures the target's
rectangle, rings it, and positions a card beside it — re-measured on resize
and scroll, recovering gracefully when a target is not on screen (the card
centres and the ring is skipped, which is what a phone-sized viewport
needs). Focus moves into the card, `Escape` leaves the tour, the step text
is announced politely, and under `prefers-reduced-motion` scrolling is
instant rather than smooth.

**3. The app carries it.** Tabs become controlled in `App` so a step can
open the door it describes; the panels gain `data-tour` anchors; the rail's
resources group gains the launcher; and a first visit gets a one-line
dismissible offer above the lede — stored under `trazum:tour-seen` (wrapped
in try/catch like every storage read in this app), so it is made once.

**4. The guards.** `tour.test.mjs`: the no-fetch invariant over both new
files; every step's target attribute exists in some component source, so a
refactor cannot orphan a step silently; every step's title and body exist in
both locales and differ from each other; the storage access is guarded; and
the reduced-motion branch is present. Proven by planting — a step aimed at a
target no component carries must fail the suite.

## What this deliberately does not ship

- **Auto-play.** The tour never starts itself. First visit gets an offer; the
  button remains; the visitor drives.
- **A tour library.** driver.js and its cousins are fine software and a
  dependency this repository does not need for one overlay, one ring and a
  dozen sentences.
- **Coach marks scattered through the UI.** One tour, one entry point. Badges
  and pulsing dots on individual controls are noise wearing onboarding's
  name.
- **Analytics on tour progress.** Where a visitor left the tour is a number
  this product does not collect, same as every other number about the
  visitor.
