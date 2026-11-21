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

30 flows, each from an empty browser. Most drive the application at
`/app`, where it has lived since the landing took `/`; thirteen start on the
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
| Brand | from the footer, the Brand entry to `/brand`, the wordmark shown for a light ground and for a dark one, eight files offered and each fetched with the kind of file its name says, the canvas shown as `#f6f4ec` on paper and `#1c211b` on the dark ground, a copy of `#f6f4ec` confirmed, and no request made by the page when it was copied |
| Pro | from the landing, the Pro entry to `/pro`, the status above the title and the section that says it is not open, the four tiers as Trazum Pro's `docs/pricing.md` decided them (`€149 a month`, `Up to €5,000`, `2.98%` and the rest), one `mailto:` link to the address `CODE_OF_CONDUCT.md` publishes with the subject filled in, no form or field, every text at its WCAG contrast on paper and again with Dark chosen in the header, no request to another origin from the landing on, and no cookie |
| Download | from the landing, the Download entry to `/download`, the version the page says it is for (the manifest's), the five sections in order, the CLI at that exact version three ways (`npx`, `npm install -g`, the Homebrew tap), the eight MCP clients in order with the Claude Code, Codex, Cursor, VS Code and Gemini CLI snippets parsed and held to `@trazum/mcp@<version>`, the four files linked by one scheme (`releases/download/v<version>/trazum-vscode-<version>.vsix` and the rest, never `releases/latest`), the Action's pinned line, the checksum command, no store named anywhere, no form or field, every text at its WCAG contrast on paper and with Dark chosen, no sideways scroll on a phone, no request to another origin and no cookie |
| Tour | all ten steps: the bill, the optimiser and the comparison each run their sample, and the terminal types and runs each of its three commands once |
| Landing, the story | at 1440x900, scrolled from top to bottom a two-hundredth of the story at a time: the arrival's words, the bill's total on the laptop's screen, the receipt's total on the desk, the gate's verdict, the breaker's stop, the clock's first week, the trimming's counts, the calendar's cut, the page a rate was read from on the receipt, the model the example keeps out of the total, what never leaves and the closing each come into view, in that order, and what comes after the bill is gone again on the way back up; one laptop on the page; then each object's chapter walked forward and back, its object the one pressed and the one lifted as seen, its output the one on the screen with its last line in view, and the lid shut in the closing; the last call to action takes focus and leads to `/app` |
| Landing, pressing | at 1440x900, after the story: the seven objects reached by Tab in the order they lie, then each object that runs a command pressed by keyboard (its own output on the screen, only it pressed, one laptop, the lid open); the lid closes (its computed rotation below -95°) and opens on the last command; then in the middle of the breaker's chapter the calendar pressed shows its output and only it pressed, and scrolled into the clock's chapter the press is let go and the screen and the pressed object are the clock's |
| Landing, the fallback | the story in order and each chapter's turn with `CSS.supports` saying no to scroll-driven animation, so the script writes the progress (`data-story="script"`) |
| Landing, on a phone | the menu opens above the story; the page never scrolls sideways at seven points of the story or after every object is pressed; the seven objects inside the window; the laptop inside the gutters; the story in order without the receipt on the desk, which a phone keeps in the laptop until it comes forward; each chapter's turn; every link and button in the chapters focused in turn and found at its middle, so none is behind the pinned desk; and every object pressed as on the wide screen |
| Landing, reduced motion | no story mode but the desk, and no animation running; each object's chapter, as it becomes current, shows its object pressed and its output whole at once; the closing shuts the lid at once; a press shows the gate's output whole with the lid open, and the lid is shut by the next frame |
| Landing, without JavaScript | no desk mode; every command's output, the example tagged as one, what never leaves, the receipt with each rate's page, then every chapter's words and the closing, in reading order; no object drawn; every line of output shown; one laptop |
| Appearance, the public site | on a dark system with nothing chosen the landing is light and its control says Light, `/app` is dark, and Dark chosen in the header holds after a reload |
| Appearance | dark applied at once and still there after a reload |
| Language | Spanish on the page and in the `lang` attribute, after a reload too |
| Phone menu | the tabs behind a menu, and the menu reaching them |
| The tour, as a modal | the tour a modal the browser enforces, Tab walked round it eight times without reaching the page, Escape closing it, and focus back on Take the tour |
| The phone menu, as a modal | with the menu open at 390 pixels the page and the bar inert, Tab walked sixteen times without leaving the menu, and Escape giving both back with focus on the menu button |

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
check, so a pull request that breaks a flow cannot merge. The twenty-three
there were then took 56 seconds by the times the runner printed, against a local
production build on a machine another job was sharing, on 2026-11-18 (#770). The
tour is nine of them, because it waits for a hand that types. The landing's flows
were replaced by the desk's six on 2026-11-19, and those by the story's six on 2026-11-20,
which took 37,631 ms between them by the times the runner printed, against a local
production build on a machine other jobs were sharing; the phone's is the longest, at
12,199 ms, because it reads the whole story, walks every chapter forward and back,
focuses every control in the chapters and then presses every object. The Pro flow, added after them, took 1,854 ms on its own on
2026-11-19, against a local production build on a machine another job was
sharing. The Download flow's time is in CHANGELOG.md, under the entry that added it.

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
