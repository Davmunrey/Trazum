> Generated from [`ROADMAP.md`](https://github.com/TrazumAPP/Trazum/blob/main/ROADMAP.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## Next

**Target: 2.7.13, repeated-task evaluation.**

Validate repeated experiments on representative accepted tasks before making
the instruction policy a default. Measure cost per accepted task, quality,
retries and controller overhead together. Any broader shared-service or fleet
claim requires workload-specific throughput, backpressure and isolation evidence;
local stress tests alone do not establish that capacity.

### In order

The order of this list is the commitment, and there are no dates: the calendar
is not promised. The list is drawn from `.github/milestones.json` by
`node scripts/milestones.mjs roadmap`, and each title links the live
milestone, which holds the same issues.

<!-- milestones:start -->
1. **[2.7.13: repeated-task evaluation](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%222.7.13%3A+repeated-task+evaluation%22)**. Validate the instruction policy over repeated experiments on accepted tasks before it becomes a default: cost per accepted task, quality, retries and controller overhead, measured together. Issues: [#638](https://github.com/TrazumAPP/Trazum/issues/638).
2. **[A site that carries the brand](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22A+site+that+carries+the+brand%22)**. The landing as the front door, the documentation, the catalogue of models and prices, the roadmap and the changelog as pages of one site, and a brand page, all in the design system the project already chose and each with a way to GitHub. Issues: [#734](https://github.com/TrazumAPP/Trazum/issues/734), [#735](https://github.com/TrazumAPP/Trazum/issues/735), [#736](https://github.com/TrazumAPP/Trazum/issues/736), [#737](https://github.com/TrazumAPP/Trazum/issues/737), [#744](https://github.com/TrazumAPP/Trazum/issues/744), [#770](https://github.com/TrazumAPP/Trazum/issues/770).
3. **[Trazum speaks first](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Trazum+speaks+first%22)**. The status line, the watcher and the spend guard exist and are off until somebody wires each by hand. Next: one command that turns them on and off, a watcher that reads the agents' sessions directly and says so on the screen, a weekly summary that arrives on its own, a plan that can open the pull request, and a terminal that carries the brand. Issues: [#755](https://github.com/TrazumAPP/Trazum/issues/755), [#756](https://github.com/TrazumAPP/Trazum/issues/756), [#757](https://github.com/TrazumAPP/Trazum/issues/757), [#758](https://github.com/TrazumAPP/Trazum/issues/758), [#796](https://github.com/TrazumAPP/Trazum/issues/796).
4. **[3.0.0: the release allowed to break](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%223.0.0%3A+the+release+allowed+to+break%22)**. A major is the only release that may remove something. This one removes `tier` from a model in the pricing catalogue, deprecated since 1.8.0 in favour of `capability`, and nothing its changelog entry does not list. Issues: [#764](https://github.com/TrazumAPP/Trazum/issues/764), [#798](https://github.com/TrazumAPP/Trazum/issues/798).
5. **[The price anyone can check](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22The+price+anyone+can+check%22)**. Every comparable tool prices from the same community file and calls the figure an estimate, and a model it cannot price counts as zero. Next: the catalogue published as an open dataset with the provider's page and the date read behind every row, and a pull request comment that says what a change does to a prompt's monthly cost against the base branch, each figure with its dated price. Issues: [#784](https://github.com/TrazumAPP/Trazum/issues/784), [#785](https://github.com/TrazumAPP/Trazum/issues/785).
6. **[The bill where a team already looks](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22The+bill+where+a+team+already+looks%22)**. The bill is printed, saved or gated. Next: the same measured figures as metrics for the dashboards a team already runs, and what was spent in a repository while a branch was written, said as a time window and never as the cost of the change. Issues: [#776](https://github.com/TrazumAPP/Trazum/issues/776), [#777](https://github.com/TrazumAPP/Trazum/issues/777), [#789](https://github.com/TrazumAPP/Trazum/issues/789), [#824](https://github.com/TrazumAPP/Trazum/issues/824).
7. **[A repository a stranger can contribute to](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22A+repository+a+stranger+can+contribute+to%22)**. What a visitor and a contributor need that is not the product: a roadmap that opens with what comes next, a wiki that publishes itself, documents that agree with each other, and Discussions with a form for each kind of question. Issues: [#725](https://github.com/TrazumAPP/Trazum/issues/725), [#726](https://github.com/TrazumAPP/Trazum/issues/726), [#727](https://github.com/TrazumAPP/Trazum/issues/727), [#732](https://github.com/TrazumAPP/Trazum/issues/732), [#747](https://github.com/TrazumAPP/Trazum/issues/747), [#765](https://github.com/TrazumAPP/Trazum/issues/765), [#767](https://github.com/TrazumAPP/Trazum/issues/767), [#772](https://github.com/TrazumAPP/Trazum/issues/772), [#778](https://github.com/TrazumAPP/Trazum/issues/778), [#779](https://github.com/TrazumAPP/Trazum/issues/779), [#787](https://github.com/TrazumAPP/Trazum/issues/787), [#829](https://github.com/TrazumAPP/Trazum/issues/829), [#929](https://github.com/TrazumAPP/Trazum/issues/929), [#931](https://github.com/TrazumAPP/Trazum/issues/931), [#942](https://github.com/TrazumAPP/Trazum/issues/942), [#937](https://github.com/TrazumAPP/Trazum/issues/937), [#938](https://github.com/TrazumAPP/Trazum/issues/938), [#941](https://github.com/TrazumAPP/Trazum/issues/941), [#945](https://github.com/TrazumAPP/Trazum/issues/945), [#947](https://github.com/TrazumAPP/Trazum/issues/947), [#946](https://github.com/TrazumAPP/Trazum/issues/946), [#950](https://github.com/TrazumAPP/Trazum/issues/950), [#954](https://github.com/TrazumAPP/Trazum/issues/954).
8. **[Tests that would notice a wrong price](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Tests+that+would+notice+a+wrong+price%22)**. Line coverage says the code that prices a call runs under test. Mutation testing says whether a test would notice it pricing a call wrongly, and today it reaches six files of the core and, in two more, the functions that choose a rate and multiply by it. Next: the catalogue's own numbers, where a sample found published prices that no test would notice changing. Issues: [#731](https://github.com/TrazumAPP/Trazum/issues/731), [#745](https://github.com/TrazumAPP/Trazum/issues/745), [#763](https://github.com/TrazumAPP/Trazum/issues/763), [#820](https://github.com/TrazumAPP/Trazum/issues/820), [#911](https://github.com/TrazumAPP/Trazum/issues/911).
9. **[Every agent's sessions](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Every+agent%27s+sessions%22)**. The bill reads what each coding agent already keeps on disk. Next: OpenCode's SQLite sessions, and a reader for Cursor, GitHub Copilot CLI, Cline and Amp as soon as somebody supplies one real session of each. Issues: [#645](https://github.com/TrazumAPP/Trazum/issues/645), [#648](https://github.com/TrazumAPP/Trazum/issues/648), [#728](https://github.com/TrazumAPP/Trazum/issues/728), [#729](https://github.com/TrazumAPP/Trazum/issues/729), [#730](https://github.com/TrazumAPP/Trazum/issues/730), [#782](https://github.com/TrazumAPP/Trazum/issues/782), [#786](https://github.com/TrazumAPP/Trazum/issues/786), [#821](https://github.com/TrazumAPP/Trazum/issues/821), [#822](https://github.com/TrazumAPP/Trazum/issues/822), [#823](https://github.com/TrazumAPP/Trazum/issues/823), [#825](https://github.com/TrazumAPP/Trazum/issues/825), [#826](https://github.com/TrazumAPP/Trazum/issues/826), [#961](https://github.com/TrazumAPP/Trazum/issues/961).
10. **[Every provider, counted and priced exactly](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Every+provider%2C+counted+and+priced+exactly%22)**. The estimator's error measured against each provider's own counter, a tokenizer package where the error is large, retired models marked on the provider's own evidence, and the gateway in front of the providers it does not front yet. Issues: [#641](https://github.com/TrazumAPP/Trazum/issues/641), [#642](https://github.com/TrazumAPP/Trazum/issues/642), [#643](https://github.com/TrazumAPP/Trazum/issues/643), [#647](https://github.com/TrazumAPP/Trazum/issues/647), [#775](https://github.com/TrazumAPP/Trazum/issues/775), [#959](https://github.com/TrazumAPP/Trazum/issues/959).
11. **[Seven dictionaries, each read by a speaker](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Seven+dictionaries%2C+each+read+by+a+speaker%22)**. Five of the seven trimming dictionaries were never read by somebody who reads the language. Each needs a reviewer; docs/language-maintainer.md says what the role is. Issues: [#680](https://github.com/TrazumAPP/Trazum/issues/680), [#681](https://github.com/TrazumAPP/Trazum/issues/681), [#682](https://github.com/TrazumAPP/Trazum/issues/682), [#683](https://github.com/TrazumAPP/Trazum/issues/683), [#684](https://github.com/TrazumAPP/Trazum/issues/684).
12. **[Where people meet Trazum](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22Where+people+meet+Trazum%22)**. The editor extension on the VS Code Marketplace, the playground as a Hugging Face Space, the hosted web app measured for how fast it loads, off unless its operator asks, a page that says what Trazum Pro is and that it is not open yet, and a download page at /download for the files each release carries. Issues: [#640](https://github.com/TrazumAPP/Trazum/issues/640), [#646](https://github.com/TrazumAPP/Trazum/issues/646), [#723](https://github.com/TrazumAPP/Trazum/issues/723), [#774](https://github.com/TrazumAPP/Trazum/issues/774), [#780](https://github.com/TrazumAPP/Trazum/issues/780), [#781](https://github.com/TrazumAPP/Trazum/issues/781), [#793](https://github.com/TrazumAPP/Trazum/issues/793), [#827](https://github.com/TrazumAPP/Trazum/issues/827), [#963](https://github.com/TrazumAPP/Trazum/issues/963).
13. **[The optional model pass](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+milestone%3A%22The+optional+model+pass%22)**. Choose and test a model-side optimiser candidate, behind the opt-in layer, with the deterministic core unchanged. Issues: [#644](https://github.com/TrazumAPP/Trazum/issues/644).
<!-- milestones:end -->

### Open work, as issues

Everything this project has agreed to do and has not done is an open issue
that triage accepted. The table is drawn from the issue list by
`node scripts/triage.mjs roadmap`, and the weekly `Triage` run fails when the
two disagree, so an item is here because it is accepted and leaves when it is
closed, not when somebody remembers this page. Live:
[ready to be picked up](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+is%3Aopen+label%3Aaccepted),
[waiting on something outside](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+is%3Aopen+label%3Ablocked),
[open to a first contribution](https://github.com/TrazumAPP/Trazum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

<!-- open-work:start -->
**Ready to be picked up (12).**

| Issue | What | Area |
| --- | --- | --- |
| [#638](https://github.com/TrazumAPP/Trazum/issues/638) | Evaluate repeat-review-v1 over repeated tasks before making it default | cli |
| [#642](https://github.com/TrazumAPP/Trazum/issues/642) | Decide whether to ship DeepSeek and Mistral tokenizer packages | core |
| [#648](https://github.com/TrazumAPP/Trazum/issues/648) | Decide when and how to read OpenCode's SQLite sessions | cli |
| [#680](https://github.com/TrazumAPP/Trazum/issues/680) | Review the French dictionary: 38 entries nobody who reads French has agreed to | core |
| [#681](https://github.com/TrazumAPP/Trazum/issues/681) | Review the German dictionary: 38 entries nobody who reads German has agreed to | core |
| [#682](https://github.com/TrazumAPP/Trazum/issues/682) | Review the Portuguese dictionary: 36 entries nobody who reads Portuguese has agreed to | core |
| [#683](https://github.com/TrazumAPP/Trazum/issues/683) | Review the Italian dictionary: 36 entries nobody who reads Italian has agreed to | core |
| [#684](https://github.com/TrazumAPP/Trazum/issues/684) | Review the Dutch dictionary: 30 entries nobody who reads Dutch has agreed to | core |
| [#775](https://github.com/TrazumAPP/Trazum/issues/775) | bill reads Amazon Bedrock's model invocation logs | cli |
| [#780](https://github.com/TrazumAPP/Trazum/issues/780) | The MCP server ships as a one-click bundle for Claude Desktop, and the registry lists it | mcp |
| [#781](https://github.com/TrazumAPP/Trazum/issues/781) | brew install the CLI from a tap this repository keeps current | cli |
| [#961](https://github.com/TrazumAPP/Trazum/issues/961) | Count a record that sums requests as a row in every command that reads a usage log | cli |

**Waiting on something outside the repository (11).** Each issue says what.

| Issue | What | Area |
| --- | --- | --- |
| [#640](https://github.com/TrazumAPP/Trazum/issues/640) | Publish trazum-vscode to the VS Code Marketplace | vscode |
| [#641](https://github.com/TrazumAPP/Trazum/issues/641) | Measure the estimator's error against Google, xAI and Moonshot | core |
| [#644](https://github.com/TrazumAPP/Trazum/issues/644) | Choose and test a model-side optimiser candidate (arc 1.57.0) | core |
| [#645](https://github.com/TrazumAPP/Trazum/issues/645) | Build from-cursor from a real Cursor usage export | cli |
| [#646](https://github.com/TrazumAPP/Trazum/issues/646) | Publish the web playground as a Hugging Face Space | web |
| [#647](https://github.com/TrazumAPP/Trazum/issues/647) | Mark kimi-k2, the Kimi K2.x models and grok-4 retired on evidence | core |
| [#728](https://github.com/TrazumAPP/Trazum/issues/728) | Read GitHub Copilot CLI's sessions in the bill | cli |
| [#729](https://github.com/TrazumAPP/Trazum/issues/729) | Read Cline's task history in the bill | cli |
| [#730](https://github.com/TrazumAPP/Trazum/issues/730) | Read Amp's threads in the bill | cli |
| [#782](https://github.com/TrazumAPP/Trazum/issues/782) | Read Goose's per-call usage ledger in the bill | cli |
| [#959](https://github.com/TrazumAPP/Trazum/issues/959) | Front xAI in the gateway once its reasoning count and output bound are settled | cli |
<!-- open-work:end -->

A blocked issue is not a deferred one. Most of them wait on something only
the owner holds, a provider key, a publisher account, a real export, and each
says exactly what; the work itself is specified and ready.

**Historical boundary.** [The 2.4
plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-2.4.md) was the previous plan, 2.4.0 delivered every
move of it that did not need something held outside this repository,
2.4.1 carried the door to the README's first line and the browser, 2.4.2
priced the models Claude Code runs today and gave the bill a PDF, 2.4.3
made the one line work with no path and priced each call at its own moment, and
2.5.0 priced each request at its own size, which let the current models of
OpenAI, Moonshot and xAI, Claude Haiku 5.5 and Gemini 3.1 Pro in, and 2.5.1
billed a period and said what a Claude Code bill's figure is. [The
1.83–2.0 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.83-2.0.md) had asked a different question from
every other plan in that directory — not what this should do next, but when
it is finished — and 2.0.0 answered it by freezing the surface at 46
commands. 2.4.0 lifted that freeze deliberately, from a download count rather
than a feature wish, reaching 51 commands at that point. What remains of the
2.4 plan waits on things outside this repository: a real Cursor export to
build a converter against, a Hugging Face token for the Space, and the
provider keys that would let `kimi-k2` and `grok-4`, discontinued by their
providers' own notices and no longer recommended, be marked retired from the
provider's own refusal.

**2.1.0 came after that and this section did not change its mind.** It adds no
command; it adds two fields to a published format and one function, so that a
promise the format had already made in writing since 1.83.0 becomes true. A
frozen surface is a promise about commands, not a vow of silence — but the
distinction is only worth anything if it is stated out loud each time, which is
why it is stated here rather than left to be inferred from a version number.

**2.2.0 is the same statement again, and mostly it is maintenance of the kind
this section says continues.** It adds no command and no analysis: thirty
property suites, and one correction to a published function that those suites
found. Testing what is already shipped is exactly what a repository standing at
its own edge should be spending its effort on.

**2.3.0 is a correction and a rewrite, and still no command.** The correction is
that the stale-price warning on three surfaces named the catalogue's oldest
provider rather than the providers a report actually used, so every run warned
about prices read that week — which is both a wrong figure and a warning people
learn to skip. The rewrite is the agent skill: it was written for a reader with
a shell in this checkout, and Trazum reaches an agent through MCP and as a
library too, so it now says which door you have before it says anything else.
The function that lands with it, `reviewedForModels`, is the same shape as
2.1.0's: one export, in service of a sentence the tool was already printing and
could not justify.

That is a real state rather than an omission, and this section says so plainly
because the alternative is describing delivered work as forthcoming, which is
what it did through an entire arc before a guard caught it.

What continues is maintenance: prices re-read on each provider's own clock,
models added and retired, corrections, security. The entries under `Under
consideration` are deferred for reasons that are not engineering — a maintainer
who reads a language, real prompts nobody has shown me, a service somebody
operates — and a product standing at its own edge is what that looks like.

It runs 1.83.0 through 2.0.0: the receipt and the redaction guard that holds it;
the 4 estimator families that need a key each; the optional per-family
tokenizer, whose own threshold 1.82.0 crossed twice over; the editor extension,
taking the distribution commitment deliberately; and then 2.0.0, which adds no
analysis and exists to say the surface is frozen. After it, this repository does
maintenance: prices re-reviewed on their per-provider clocks, models added and
retired, corrections.

Two things about that arc are worth repeating here, because a plan can be moved
and this file cannot. **1.84.0 does not ship if the keys do not arrive**, and
every report touching an unmeasured family goes on saying nobody has measured
it. And the receipt is analysis output rather than plumbing: it is the figures
`profileUsage` already computes, shaped so they still carry their provenance
when they are read somewhere other than the terminal that produced them.

---

Before the plan above, nothing was planned. 1.82.0 was a correction rather than
a plan: the
published token band turned out to be a measurement of its own calibration
set, and the release replaced it with four that are measurements of the
estimator. Before it, 1.80.0 was a distribution pass: no new command, no
new flag, no new analysis, and the feature surface deliberately frozen
while the doors were fixed. Before that, [the 1.79 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.79.md)
and [the 1.77 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.77.md) were both delivered in full.

**Four things this section listed as waiting have since been built**, and
they are named here because a forecast that keeps promising delivered work
is the same fault as a claim nobody checks. The verdict bridge shipped in
1.82.0, along with `from-litellm` and `from-helicone`; `from-langsmith` was
merged and unreleased then, and shipped in 1.83.0. Each converter waited for
the same thing and got it: a format read out of the tool's own source rather than guessed at.
`roadmap-forecast.test.js` fails if this section ever again describes a
command the CLI already dispatches.

Before it, [the 1.73 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.73.md) was delivered in
full — the guided tour: five doors walked once, offered on first visit and
launched from the rail forever after, with no tour library, no auto-play, no
analytics and the one scroll respecting prefers-reduced-motion. No new plan
is written until one is asked for.

Before it, [the 1.72 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.72.md) was delivered in full — the
playground: the CLI's pure subset runnable in the web app against sample
files, through the same `@trazum/core` functions the terminal runs.
Before it, [the 1.71 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.71.md) was delivered in full —
the universal cost lens, generalising the `from-claude-code` pattern to the
whole observability ecosystem: the standards-based `from-otel` (the fortieth
command) reads OpenTelemetry's GenAI spans as a usage log, so Trazum prices
whatever telemetry a team already emits, and the web tab gained a third arm
for a dropped OTLP export. It also named three vendor-specific converters as
what should come next, and declined to write any of them until each format
could be read out of the tool's own source, which is the same refusal as
inventing a price. All three exist now, and the paragraph above says when.

No new plan is written until one is asked for: a plan exists to be written
before the code, not to keep a section warm.

Before it, [the 1.70 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.70.md) was delivered in
full — the whole 1.69 pipe collapsed to a drag of the transcripts folder,
and the landing gained three machine-drafted languages beside the two
reviewed ones.
Before it, [the 1.69 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.69.md) was delivered in
full — the agent's own bill, priced from the transcripts already on disk.
Before it, [the 1.68 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.68.md) was delivered in
full — the browser caught up with the other three doors in one release.
Before it, [the 1.65–1.67 plan](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.65-1.67.md) was delivered in
full — the owner's five open-source paths, carried as far as they go as
code: 1.65.0 (the format anyone can adopt), 1.66.0 (one policy, three
doors) and 1.67.0 (the month ends on a measured position), every chapter of
all three arcs. No new plan is written until one is asked for: a plan
exists to be written before the code, not to keep a section warm.

The halves of the paths that are not code — adoption conversations, a
policy server, a forecast — stay named in the plan's "what stays out"
rather than dressed up as chapters.

**Three arcs from the previous plans stay open**, numbered below
the last release:

| Arc | Why it is open |
|---|---|
| 1.54.0 | Per-family counting bands need a key for each family's own counting endpoint |
| 1.57.0 | What belongs on the model's side of the line cannot be decided without running it against a model |
| 1.58.0 | An editor extension is a distribution commitment rather than a feature |

Two of those wait on a credential this repository does not have, and inventing
either answer is the estimating-and-measuring merge that 1.36–1.40 spent five
releases removing. The third waits on a decision nobody has made. **That one was
made later, and built is not published.** 1.86.0 built the extension as
`trazum-vscode` and it packages to a `.vsix`; it is not on the VS Code
Marketplace, which is #640. **The gaps stay gaps**: renumbering them away would
rewrite a document whose whole value is having been written before the code.

What comes after 1.61.0 is not written down, because it is not decided. An arc
announced here today with nothing behind it would be a projection on the roadmap
of a tool whose first doctrine rule forbids exactly that.

**1.60.0 is delivered, and it is the last arc the plan named.** The plan is not
finished: six of nine arcs are done, and 1.54.0, 1.57.0 and 1.58.0 stay open with
their reasons on the record rather than renumbered away. What 1.60.0 delivered is
a scoreboard it committed to in advance and reported honestly at one of three —
including the admission that still stands, and the instrument it refused to quote
for the one it could not measure.

**1.59.0 is delivered, and closes its arc out of order.** The maintainer
requirement is a documented role with a bar, the five dictionaries nobody here
reads are named where a reader would otherwise draw the wrong conclusion, and the
worklist a volunteer would be handed can be printed. What it does not deliver is
an eighth language: whether the role is ever filled is not a scheduling question,
and the arc closes saying so rather than implying a queue.

**1.57.0 and 1.58.0 are now the open ones**, and neither is idle by accident.
1.57's remaining chapter — what belongs on the model's side of the line — needs a
provider credential this repository does not have, the same block 1.54.0 sits
behind. 1.58 is an editor extension, which this roadmap has called a distribution
commitment rather than a feature since 0.10.0. 1.86.0 built it, and it is still
not on the Marketplace (#640).

**1.52.0, 1.53.0, 1.55.0 and 1.56.0 are delivered.** The gateway stopped buffering the whole
upstream reply before writing a byte back, and then learned who it can stand in
front of: which providers it fronts, which two it can never front and why, and
which are missing a fact this repository cannot supply without guessing. How
many of each is a question for `trazum gateway` and `trazum connect`, which
derive the answer, rather than for this page. What each arc still cannot do is
in [RELEASES.md](https://github.com/TrazumAPP/Trazum/blob/main/RELEASES.md).

**1.53.0 closed on less than its title asked for**, deliberately: a gap that is
named, proven and alarmed is finished work, and a gap papered over with a
half-remembered hostname is not. Three providers wait on somebody confirming an
endpoint; a guard fails the build the day one arrives.

**The next arc in the ordering answers something wrong or missing today**, and
the plan points at the line of code for it — but it is **blocked**, which is why
1.55.0 went first:

1. **1.54.0 — the counter, per family.** The estimator is calibrated on Claude
   and prices seven families. This roadmap has called the per-family error the
   one number that settles the real-tokenizer question. **Two families are now
   measured and four are not.** 1.82.0 ran the harness against DeepSeek (94.5%
   out at worst) and Mistral (103.1%) on the full forty-seven-sample corpus, and
   the report prints those numbers rather than a hedge with no figure in it. The
   answer for those two is already past the threshold this roadmap set — *"within
   5% and a real tokenizer dependency is not worth taking; 40% out and it is"* —
   which makes the dependency question live rather than theoretical.

   OpenAI, Google, xAI and Moonshot were named unmeasured here. **1.85.0 found
   that OpenAI had been measured all along** -- 112.4%, from a fixture in this
   repository -- and that `band.ts` was reporting it as unmeasured anyway. Three
   remain: Google, xAI and Moonshot, each needing a key for its own counter,
   each with its own named skip in the suite carrying the command to run.
   Inventing a band for them instead is the estimating-and-measuring merge
   1.36–1.40 spent five releases removing.

**1.56.0 asked a question and answered it.** Whether alerting can be given
without becoming a hosted service holding other teams' metrics: yes for the
noticing — `history` names the stretches nobody measured, `trazum pulse` gives
the outside view of a scheduled job, and the CI you already run is the thing
that notices — and no for the last hop, which is written down rather than left
to be discovered.

**1.55.0 is delivered, out of order and deliberately.** More than one machine
was an intention rather than a defect, and it sat behind 1.54.0 in the ordering —
but 1.54.0 needs provider keys this repository does not have, and an arc that can
be built is worth more than a slot left idle waiting for one. `trazum rollup`
merges profile documents several people produced separately: each contributor's
gaps preserved rather than averaged away, the window a contributor claims to
cover kept apart from the one it observed, a roll-up accepted as a contribution
to another roll-up, and the overlap between contributors named as unmeasurable
every time.

**1.54.0 is a hole in the sequence, not a renumbering.** The number stays with
the arc it names. Moving the plan's numbers to close the gap would rewrite a
document whose whole value is having been written before the code, and the gap
is the record that an arc was jumped rather than dropped.

**The remaining six are an ordering of intentions, not commitments about
content** — more than one machine (1.55.0), something that runs (1.56.0), the
optimiser earning its name again (1.57.0), where the prompt lives (1.58.0), a
language needs a maintainer (1.59.0), and our own medicine measured (1.60.0).

The plan says which kind each arc is, in the arc's own section. Presenting all
nine with equal confidence would be merging a measurement with a projection on
the roadmap of a tool whose first doctrine rule forbids exactly that.

**No dates, and no pace.** The ordering is the commitment. What would reorder
it is written down at the end of the plan rather than left to be inferred.

**The arc through 1.51.0 is delivered in full**, with its errata on the record:
[docs/plan-1.51.md](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.51.md). Its thesis was the gap this product had
carried since the beginning: **every figure it printed was a denominator with no
numerator.** It could say a workload got 40% cheaper and could not say whether it
stopped working. Ten chapters answered that — the gateway in the path of the call
(1.50.3), the outcome the caller records and nothing infers (1.50.4), cost per
resolved outcome (1.50.5), the escalation ladder priced in both directions
(1.50.6), two arms on real traffic (1.50.7), the quality gate that refuses to
blame what it cannot attribute (1.50.8), the semantic findings deferred since
0.1.0 (1.50.9), the bill with a name on it and nothing spread (1.50.10), the
commitment replayed against the measured past (1.50.11), and the year assembled
from what was already written down (1.51.0).

The plan document deliberately did **not** pin a patch number to each chapter.
The first draft did, and 1.50.1 (the numbering) and 1.50.2 (the feedback loop)
both arrived without being in it. Work outside a plan is not a failure of the
plan; a plan that pretends otherwise goes stale on contact with the first good
idea. The order is the commitment.

**The arc through 1.50.0 is delivered in full** as well:
[docs/plan-1.41-1.50.md](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.41-1.50.md). Its thesis was that the loop
was complete and inert — every command waited for a human to type something, so
nobody ran it on the afternoon it would have mattered, and the agent actually
spending the money had no way to ask. Ten releases answered that: the connector
(1.41), the store (1.42), the watch (1.43), the answer in milliseconds (1.44),
the agent's budget (1.45), five-minute onboarding (1.46), the bill in the
browser (1.47), cost review in CI (1.48), the live budget (1.49), and the
format, the guarantees and the doctrine other tools can build on (1.50).

The two arcs before those were also delivered in full:
[docs/plan-1.36-1.40.md](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.36-1.40.md) introduced Trazum's estimating
and measuring halves to each other, and
[docs/plan-1.30-1.35.md](https://github.com/TrazumAPP/Trazum/blob/main/docs/plan-1.30-1.35.md) precedes it.

Everything under *Under consideration* below stays where it is until something
moves it. An entry there is not a queue with the front of it hidden — it is the
reasoning for why the thing is not scheduled, and it is written down so that
deciding differently later is a visible act. **Three of those entries are now
scheduled**: the tokenizer question lands in 1.54.0, cost alerting is what
1.56.0 has to answer honestly, and the editor extension is 1.58.0. Two of the
three have moved since. The tokenizer question was answered in 1.85.0 by a
separate package, `@trazum/tokenizer-openai`; whether to ship DeepSeek and
Mistral packages too is #642, and 1.54.0 itself stays open for Google, xAI and
Moonshot. The editor extension was built in 1.86.0 and is not on the
Marketplace (#640).
