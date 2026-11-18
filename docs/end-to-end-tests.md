# End-to-end tests

The web app's other tests read modules and rendered components. These open the
page in a real browser, against the production build, and do what a visitor
does: paste a log and read the bill, optimise a prompt, compare two, answer a
question, run a command, load a recorded run, change the theme and the
language, and reach the tabs on a phone.

They exist because a page can pass every unit test and still print the wrong
total. Until `scripts/e2e.mjs` the only thing that drove a browser was the
privacy probe, and it checks one promise: that a pasted log never leaves the
page.

## What is checked

Twenty-one flows, each from an empty browser. Most drive the application at
`/app`, where it has lived since the landing took `/`; eight start on the
landing:

| Flow | What the page must show |
| --- | --- |
| Bill, a pasted log | `$1.43` over two calls, split into input, cache reads and output, by label and by model |
| Bill, not a log | the refusal in words, and which lines could not be read |
| Bill, on a phone | the same total at 390 pixels wide, with no sideways scroll |
| Optimise | `8 → 6 input tokens`, the shorter prompt, and the rule that fired |
| Compare | `18 → 6 input tokens` and `-12 tokens (-67%)` |
| Write | the second question after the first is answered, how many are left, and the same question still there after the language changes |
| Playground | the command list from `help`, and one command run |
| Tasks | a recorded run read into a report: 303,000 tokens, `$1.575` |
| Tabs | each one by click and by address, one panel at a time |
| Site | the landing's headline and command, its GitHub button, its way into the dashboard, the sample month loaded there and priced at `$1.05` over eight calls, and an old `/?tab=` address landing on its panel at `/app` |
| Docs | from the landing, the Docs entry to `/docs`, a search for `baseline gate`, the result for the heading "The CI gate: a budget is a ceiling, a baseline is a gate", and the command reference open at `#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate` with that heading scrolled into view, the document marked English, and View on GitHub going to `docs/commands.md` |
| Models | from the landing, the Models entry to `/models`, the count of every model, one provider chosen so that only its rows are left, a text filter that keeps `deepseek-v4-pro` and drops `deepseek-flash`, the sentence for a filter nothing matches, nothing written to the address, `gemini-2.5-pro` drawn with the Retired tab and marked retired, and no request made by the page while it was filtered |
| Tour | all ten steps: the bill, the optimiser and the comparison each run their sample, and the terminal types and runs each of its three commands once |
| Landing, the story | scrolled from top to bottom a percent at a time: the bill's total, the gate's verdict, the trimming's token counts, what never leaves on the screen and what leaves beside the closed machine each come into view, in that order; the lid's computed rotation is closed (below -95°) at the end, open again halfway back and at the top; no control inside the pinned stage; the last call to action takes focus and leads to `/app` |
| Landing, the fallback | the same story with `CSS.supports` saying no to scroll-driven animation, so the script writes the progress (`data-story="script"`) |
| Landing, on a phone | the menu opens above the story, the page never scrolls sideways at five points of it, and the story plays in order |
| Landing, reduced motion | no story mode, every scene's text on the page in reading order, every line of output fully shown, the laptop open and still |
| Appearance, the public site | on a dark system with nothing chosen the landing is light and its control says Light, `/app` is dark, and Dark chosen in the header holds after a reload |
| Appearance | dark applied at once and still there after a reload |
| Language | Spanish on the page and in the `lang` attribute, after a reload too |
| Phone menu | the tabs behind a menu, and the menu reaching them |

A flow also fails when the page throws an error nobody caught, whatever else
it was checking.

**Every expected figure is written by hand.** The bill's log is two calls to
Claude Opus 5, priced in a comment at the top of the script from the price
list: $5 per million input tokens, $25 per million output, a cache read at a
tenth of input. A test that asks the product what the answer is agrees with
any answer. `e2e.test.mjs` holds those three prices, so when one changes the
required test run says to re-price the log before the browser says "waited
for the total".

## What is not checked

So a green run is not read as more than it is:

- **The library tab.** It is rendered only for a signed-in reader, and signing
  in needs a database and a session the build under test does not have.
  `e2e.test.mjs` requires it to stay the only tab left out.
- **How anything looks.** No screenshot is compared. A layout can be ugly and
  pass; what is checked at phone width is that the page does not scroll
  sideways and that the tabs can be reached.
- **Other browsers.** One Chrome, the runner's own.
- **Accounts, sharing and every API route that writes.** Those are held by the
  route tests in `apps/web/test`.
- **Nothing is retried.** A flow that fails once has failed.

## Running them

They need a Chrome-family browser and `playwright-core`, and the repository
brings neither: the driver is installed outside the workspace, pinned, the way
CI installs it for the privacy probe. Nothing published and nothing in the
lockfile depends on it.

```bash
npm run build && npm run build:web
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
PORT=3124 HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js &

DIR="$(mktemp -d)"
npm install --prefix "$DIR" --no-save --ignore-scripts playwright-core@1.58.2
PW="$DIR/node_modules/playwright-core"
CHROME="$(command -v google-chrome || command -v chromium)"

npm run e2e -- --url http://127.0.0.1:3124 --chrome "$CHROME" --playwright "$PW"
npm run e2e -- --url http://127.0.0.1:3124 --chrome "$CHROME" --playwright "$PW" --only bill
npm run e2e -- --list
```

The static directory has to be copied beside the standalone server, or the
page loads and its scripts do not: the run then says the page "never said it
had started". Rebuild and copy again after changing the app; a server left
running from an earlier build serves the earlier page.

A failure names the step and quotes the open panel:

```text
not ok  bill: a pasted log is priced, to the cent, by part and by label
        waited for the total over the two calls and it did not appear. The panel shows: THE LOG open to read another log Summary Summary Opportunities Usage context Action plan Catalogue-priced spend $1.47 Recorded calls 2 …
```

That one is a planted fault: a cache read charged at a fifth of input in place
of a tenth.

## In CI

A step of the `Build and tests` job, after the web app is built and the
privacy probe has run, on a server of its own. It is part of the required
check, so a pull request that breaks a flow cannot merge. All twenty-one took
67 seconds by the times the runner printed, against a local production build
on a machine three other jobs were sharing, on 2026-11-18. The tour is ten of
them, because it waits for a hand that types. The five flows of the landing
are 22: the three that play the story each scroll the page a hundred and one
times and read it at each stop.

## Adding a flow

A flow is an entry in `FLOWS`: a name, the tabs it `covers`, and a `run` that
opens a path and says what it must `see`. Find controls by role and name, the
way a reader of the page does, and keep each wait's description to what a
person would have been looking for: it is the first line of the failure.

`e2e.test.mjs` fails when a tab a visitor can open has no flow named for it
(`bill: ...`, `tasks: ...`), and when a flow claims a tab it never names. The
flow that clicks through every tab does not count: it opens each one and
checks nothing a tab does. Before the pull request, plant the fault the
flow exists to catch, rebuild, and watch it fail: a flow that has never failed
has not been tested. The pull request that added these planted twelve, and
each was caught.
