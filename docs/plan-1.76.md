# 1.76 — The tour that does the work

*Written before the code, like the sixteen plans before it.*

## The thesis

The 1.73 tour walks the doors and describes what is behind each one. A
description of a tool is weaker than the tool: the visitor reads "the Bill
tab prices a dropped log" and still has never seen a log priced. Asked for
directly — make the tour itself a demo, widen the playground's part, and put
the CLI in it with a complete use case.

So the tour stops describing and starts doing. Each step, as it opens its
tab, performs the thing its card is talking about — the sample prompt is
optimised in front of the visitor, the comparison loads its two versions,
the bill prices the sample month, and the terminal types real commands and
runs them. Everything it does is the app's own machinery on the samples the
playground already carries: nothing new is computed, nothing fetches, and
the visitor can take the keyboard at any moment.

## Chapter 1 — The demo bus

`apps/web/lib/demo.ts`: a typed dispatcher, no DOM. `DemoAction` is a small
union — fill-and-run the Optimiser with the sample prompt, load the sample
pair into Compare, price the sample month in Bill, type-and-run one line in
the terminal. `runDemo(action)` dispatches; `onDemo(handler)` subscribes and
returns the unsubscribe. Components own what an action means inside them;
the bus owns nothing but the join. Pure enough to test in Node.

## Chapter 2 — The steps become a script

`TourStep` gains an optional `demo` field, and the walk grows from seven
steps to eleven: the Optimise, Compare and Bill steps each carry their
demo; the playground's single step becomes three (the terminal introduced,
`trazum profile usage.jsonl` typed and run, `trazum optimize prompt.txt`
after it); and a new **"the CLI, complete"** step runs the measured loop's
third act (`trazum position usage.jsonl --max-usd 15`) and says plainly
what the visitor is looking at: the real CLI's own functions, in the page,
on sample files — and the one line that installs the rest of the
forty-two commands. Copy in both dictionaries, one title and body per id,
exactly as before.

## Chapter 3 — The typing hand

The terminal's demo types — around eighteen milliseconds a character, so a
command is read as it is written — and then submits through the exact path
the visitor's Enter uses, history included. Reduced motion types instantly.
**The visitor's keystroke cancels the hand mid-word**: it is their terminal,
and a demo that fights the person who took the keyboard is worse than no
demo. The other three demos have no typing to interrupt; they fill state
through each component's existing run path (the Optimiser's auto pass, the
Compare analysis, Bill's paste handler), so what the visitor sees is what
those buttons already do.

## Chapter 4 — The guards

The tour suite grows with the joins this arc creates:

- every `demo` on a step is an action the bus declares, and every
  `playground-run` line **actually runs** against the sample files in the
  test — executed through `runPlayground`, asserted to produce output and
  not an error, so a renamed sample or a broken invocation fails in CI and
  not in front of a first-time visitor;
- a demo fires only from an open tour: the dispatch sits behind the same
  `tourOpen` gate as the overlay itself, and never on mount;
- the cancel contract is pinned — the typing hand stops on visitor input;
- the no-fetch invariant is re-held over every file this arc touches;
- the walk still covers every public tab and only public tabs.

## What this refuses to do

- No autoplay. The tour still opens only from the first-visit offer or the
  rail compass; a demo runs only when the visitor steps onto its page.
- No new arithmetic. Every figure a demo shows is computed by the same
  functions the visitor would trigger by hand on the same samples.
- No recording, no network, no state left behind: a demo writes into React
  state exactly as the visitor's own input would, and Escape still leaves.
