# Releases

Release notes for people. [CHANGELOG.md](CHANGELOG.md) is the record for
whoever maintains this — every decision, every reversal, every reason. This file
is what you read when somebody says "what's new" and you have forty seconds.

Same facts, different job. Nothing here is softened: if a release fixed
something embarrassing, it says what it was.

**All three packages are on npm at 1.81.0**: `@trazum/core`, `@trazum/cli` and
`@trazum/mcp` — published by the workflow itself, from the merge of the release
PR, authenticated by the token fallback and carrying an OIDC-signed provenance
attestation. That has been the route for every release since 1.28.0, which was
the fallback's first live run. 1.25.0 before it went out by hand on 2026-08-19,
after npm's trusted publishing rejected the workflow's OIDC token on four real
publish attempts against `v1.11.0` with every GitHub-side claim verified
correct — so 1.25.0, like 1.8.0, 1.9.0 and 1.10.0, **carries no provenance
attestation**.

This paragraph said 1.28.0 for seventeen releases, because nothing checked it.
`publish.test.js` now fails the build when it drifts from the manifests: the
merge that bumps them is the merge that publishes, so the two are the same
number or the file is lying to a stranger about what `npm install` gives them.

**1.11.0 through 1.24.0 were never published to npm.** They are real releases
of this repository — each has its notes below, its changelog entries and its
merge commit — but the registry went straight from 1.10.0 to 1.25.0, which
contains all of them. `v1.11.0` is the one tag in that range that exists, spent
on diagnosing the trusted-publisher refusal; it published nothing.

**1.9.1 was prepared and never published.** Its tag failed three times against a
trusted-publisher configuration npm kept refusing, nothing reached the registry, and
everything in it is contained in 1.10.0. Its notes are kept below because the work
happened; the version number is simply spent.

Everything under 1.8.0 is a milestone recorded in this repository and never
uploaded anywhere, 1.0.0 included. The numbering is kept because the ordering is
the useful part — 1.8.0 is the first version that exists outside this repository,
not the eighth release.

`RELEASES.md` is checked against the manifests by `publish.test.js`, so a version
cannot be tagged without its notes being written first. That is the point of the
file being here rather than pasted into a GitHub form at release time.

---

## 1.81.0 — "The things nobody had checked"

Nothing here is a new idea. Every item is something that had been in this
repository for weeks or months, that looked finished, and that nobody had ever
opened and read against what it claimed to do. Fourteen of the twenty-two
entries in the changelog are that shape.

**The web app was one environment variable away from spending your money on
strangers.** `POST /api/optimize` fell back to `TRAZUM_LLM_API_KEY`, then
`ANTHROPIC_API_KEY`, then to the CLI's `providerFromEnv()`, whenever a request
carried no key of its own. On a deployment with either variable set, anyone who
posted `{"suggest": true}` spent the operator's credit: no account, no session,
nothing to attribute the call to, and the rate limiter in front of it keyed on a
header the caller chooses. It was never armed on trazum.vercel.app, which
answered `"llmConfiguredOnServer": false` the whole time, so nothing was ever
spent. It was a trap set, and it would have armed itself the day somebody
configured a key. The endpoint and the model may still come from the operator;
the key may not.

That same `GET` stopped publishing `llmConfiguredOnServer` at all, because an
unauthenticated, unlimited endpoint answering "is there a key here worth
attacking" is an oracle. It also gained the rate limiter that only `POST` had.

**An account you could never close.** Accounts arrived in 1.7.0 and there was no
way out of them: `deleteUser` did not exist in the store interface, in either
driver, or anywhere else. `DELETE /api/account` closes one now, and takes with it
every session, every prompt, every version of each, and every share link the
account published. Immediate, with no grace period, because a screen that says
deleted should mean deleted. Shared `/c/<token>` links stop working, which is the
answer rather than an oversight: keeping them would mean keeping the deleted
person's prompt text.

**Sign out everywhere**, which the store could always do. `deleteSessionsForUser`
existed in the interface and in both drivers with no caller anywhere, so somebody
whose laptop was stolen could sign out on their phone and the stolen cookie
stayed valid for the rest of its thirty days.

**A ten-minute window that only the browser was keeping.** The OAuth state cookie
had a `maxAge` and nothing else, while the callback's own comment described an
expired state as a case it handled. The state carries an issue time now and the
server checks it. It is deliberately not signed, and the code says why: anyone
who can write that cookie can ask for a fresh one, so a forged timestamp buys an
attacker nothing. An HMAC would have looked like it closed something.

**The one auth route nothing bounded.** `GET /api/auth/session` ran a database
lookup on every call, for an unauthenticated caller, with a cookie that caller
chose, while the limiter for the sign-in routes sat exported twenty lines away in
the same file. It has its own budget rather than sharing that one, because the
header polls this endpoint and sharing would refuse somebody at the moment they
pressed sign in.

**Sessions that expired and were never swept.** The lookup reaped the row it was
handed, which covers a session somebody comes back to. Nobody was reaping the
ones nobody comes back for, and those are the majority. Not a way in, since an
expired row cannot authenticate anybody; unbounded growth in a table whose rows
are all dead weight after thirty days.

### And two things that are new

**A Claude Code status line that costs nothing.** It shows what the session has
spent, in Trazum's numbers rather than an estimate, and it is free because of
where it runs: the status line's output is drawn in the terminal and a `Stop`
hook's goes to the debug log, so neither is context and neither is billed.
`SessionStart` is the hook whose output *is* context, and a test refuses it by
name.

**`trazum from-claude-code --state`** reads only what a transcript appended since
last time. On the largest real transcript on one machine, 212 MB, the conversion
drops from 2.6s to 0.19s, and the records it appends are byte for byte what a
full read would have produced.

### The part worth saying about how this was built

**Four guards were planted and did not fail.** Each time the test was what was
wrong, not the code. A test that checked one account could not revoke another's
sessions passed just as happily against a route that grew a `?user=` parameter;
it attempts the attack now. A test that checked account deletion removed a
prompt could not see the orphaned version rows left behind, because no public
call can reach a version without its prompt; and the count added to make it
visible summed what the loop was *about* to delete, so it reported success with
the delete removed. A number that fails in the same direction as the code it
reports on is not evidence.

---

## 1.80.1 — "The capital letter the grant keeps"

1.80.0 wrote the MCP registry manifest and the `mcpName` field that
proves it. Both spelled the owner in lowercase. The registry refused the
publish with a 403 that put the two strings next to each other:

```
You have permission to publish: io.github.Davmunrey/*
Attempting to publish: io.github.davmunrey/trazum
```

**The namespace carries the GitHub login exactly as GitHub spells it.**
`io.github.davmunrey` and `io.github.Davmunrey` are two different
namespaces, and the account is only granted one of them. Both files now
say `io.github.Davmunrey/trazum`, and because the registry verifies the
claim by reading `mcpName` back out of the published npm package, the
fix could not be a local edit. It had to be a release. That is what this
one is.

**The guard was the reason nobody caught it.** It matched the owner
segment against `[a-z0-9-]+`, a pattern written before anyone here had
published to this registry, encoding a guess about it that read as a
rule. It passed the wrong name and would have gone on passing it. The
owner is no longer typed into the test at all: it is read out of the
repository URL that `server.json` already carries, so the one place this
repository states who owns it is the place that decides what the server
may be called. Planting the lowercase name fails the guard with the two
namespaces in the message; changing the repository URL's owner and
leaving the name alone fails it too, which is what proves the derivation
is live rather than a hardcoded string in disguise.

Nothing else changed. No command, no flag, no output.

---

## 1.80.0 — "The doors somebody else walks through"

Six releases of work went into this repository and none of it into the
doors a stranger arrives by. This release is those doors.

**The Action's one line named half the product.** `action.yml` runs two
gates, a prompt against a token budget and a usage log against a spend
budget, and seven of its eighteen inputs exist only for the second. Its
description said "Token budget for prompts" and stopped. That is the one
sentence the GitHub Marketplace shows, and it described a version that
stopped being the whole story several releases ago. A guard now reads the
modes out of the script and fails when the description does not name what
each one gates.

**The MCP registry had nothing true to read.** `packages/mcp/server.json`
and an `mcpName` on the package are what the official registry verifies
against npm, and they now ride the same version lockstep as the six
manifests, so a release cannot leave the registry advertising a version
nobody can install.

**The npm pages had one destination and it was the one npm already
shows.** `homepage` and `bugs` were absent on all three packages for 103
releases, so the only route from the registry to the thing that runs
without installing anything was a README somebody had to scroll.

**The front door leads with the loop this is for.** A fleet of agents
spends money in a loop nobody watches per iteration; `spend_guard` prices
the call before it happens, and it is now the first tool the MCP server
offers rather than the sixth of seven. The tool descriptions were written
as documentation and are the most-read copy in the project; they now say
where their numbers come from, which is what an agent needs to act on them.

**And the demo link lands.** `?tab=playground` opens that panel directly.
It did not exist: the web app read neither the query string nor the hash,
so any such link in a README would have quietly dropped a visitor on a
different tab.

Underneath all of it, provenance written down while nothing was at stake:
a DCO gate on every commit, and `docs/licensing.md` saying what is open
permanently, what was never open, and what the licence never covered.

## 1.79.0 — "The dash the sweep left behind"

The em-dash was asked to leave this product. The web app was swept, and
the terminal was not, so running `trazum position --locale es` on a real
log printed two of them in the middle of a Spanish paragraph. An
instruction carried out by hand on one surface is not carried out; it is
postponed until somebody reintroduces it.

338 em-dashes are gone from the two Spanish catalogues, each judged one at
a time so the Spanish still reads like Spanish rather than like a bulk
find-and-replace. English keeps its em-dashes on purpose: they are ordinary
English punctuation, this product's entire English voice rests on them, and
sweeping one English file while the READMEs kept theirs would just make the
product read as though two people wrote it.

The part worth keeping is the guard. It walks the repository for every
Spanish dictionary, refuses to pass by finding none, and names the file and
line of any em-dash it finds, in **both** spellings: the character and the
`\u2014` escape. That second spelling is there because the first attempt at
this sweep searched only for the character and declared the catalogue clean
while 32 escaped em-dashes sat inside it, one of which was still printing
on screen. The suite caught what the sweep missed, and now the guard covers
both.

## 1.78.0 — "A sentence no locale could reach"

Running `trazum position` in Spanish printed a Spanish heading over an
English paragraph. The paragraph was not a translation that had been
missed: it was baked into the document itself, where no locale could ever
reach it.

Three sibling documents already do this correctly, and the contract says
why in so many words: codes rather than prose, so a consumer can branch
and each rendering carries the sentence. The position document follows its
own family now, and both the terminal and the web app say it in the
reader's language.

## 1.77.1 — "The folder name stands"

1.77.0 taught `from-claude-code` to label by project folder, and decoded
the folder name into something tidy. The first real run found the flaw in
minutes: Claude Code encodes a path by turning `/` into `-`, and since a
project name may already contain `-`, nothing afterwards can tell the two
apart. `ai-job-search` was labelled `search`. `pulse-coffee` was labelled
`coffee`. Two projects renamed to words that were never their names, with
money attributed to them.

The same session found three more, all of them the shape of a change that
was applied in one place and not the other: the model aliases 1.77.0 added
were indexed by one of the two catalogue builders, so `--pricing-live`
dropped eight calls out of a real bill; an overlay declaring an id that was
already an alias was silently discarded; and `switch` printed an ASCII
arrow where every other report prints `→`. One index builder now, one
arrow, and a refusal that no longer lists a flag twice.

The folder name stands as it is now, minus the leading separator: longer,
uglier, and true. Presenting a decoding as a fact when the encoding cannot
support one is the failure this product exists to refuse, and it does not
get an exception for being convenient.

## 1.77.0 — "The agent's bill, told honestly"

A real forty-day Claude Code profile ran through this tool and answered
well. It also said four things it should not have had to say: every one of
its 10,393 calls arrived unlabelled, 164 sat outside the totals because
their ids were not recognised, some of those ids were not models at all,
and three sections reported that no answer could be checked for truncation.

None of that was the profiler being wrong. It was the converter handing the
profiler less than the transcript already knew, and the profiler then being
scrupulously honest about the gap. So: a folder of projects now labels
itself by project, a dated model id prices as the model it is, the turns
Claude Code wrote itself are excluded by name and counted rather than
priced at zero, and `stop_reason` reaches the log it was always in the
transcript for.

The alias mechanism is worth one sentence of its own, because it would have
been easy to do badly: every alias is declared and reviewed like a price,
never derived from a pattern. An id that merely looks like a dated version
of a known model is still unknown here, because guessing that two ids bill
alike is guessing a price.

## 1.76.0 — "The tour that does the work"

The guided tour used to describe each door; now it opens them. Step onto
Optimise and the sample prompt shortens in front of you; onto Compare and
the edit on screen is judged; onto Bill and the sample month prices itself
the way your own pasted log would. Then the terminal takes over: the tour
types `trazum profile usage.jsonl` character by character, runs it, follows
with `optimize` and closes with `position` — the real CLI's own functions,
in the page, on sample files. Touch the keyboard mid-word and the hand
stops: it is your terminal, and the demo yields.

Also in this release: the README split landed just before it — the front
door at ~1,150 lines, every deep chapter verbatim in `docs/commands.md` —
and the CLA gate's first live run surfaced two defects, both fixed: its
signatures branch now exists, and the repository's own agent is allowlisted
so the gate asks strangers, not the furniture.

## 1.75.0 — "The readable terminal"

The CLI's reports were honest and dense, and dense was winning: a forty-day
profile printed twelve sections of correct prose with the same visual weight
on every line. Now the terminal has what the HTML report always had — a
hierarchy you can see from a metre away. Section headings carry a rule out to
the report's width; the spend split and the per-label and per-model rows
carry a proportion bar beside the percentage they already stated; warnings
keep their yellow `!`, levers their `→`, and `trazum models` is the first
table through the one shared renderer, aligned by a measurer that does not
count ANSI codes as width.

Every sentence and every figure is unchanged, and that is a test now, not a
promise: the same command runs painted and plain, the paint is stripped, and
the two must match byte for byte. A pipe still gets plain bytes — your
`trazum … | grep` reads exactly what it read last week. `FORCE_COLOR=1`
paints anywhere, `NO_COLOR` wins everywhere, and neither is a Trazum
invention.

## 1.74.0 — "Any model's money"

**Drop your own price card on the bill — an OpenRouter export or your own
overlay JSON — and every figure prices Qwen, Llama, or the model only your
company runs.** The transformation is the same pure function the CLI runs
on a live feed, run in the page on a file, so nothing is fetched and the
what-if crosses vendors both ways. **`trazum switch`** then prices the
decision itself: the measured delta, a declared migration cost recovered
over the measured daily saving — division on the past, days attached,
refused by name when there is no saving or no clock — and the evaluation
the switch requires, priced too, because knowing the cheaper model is good
enough costs money. **`trazum ownrate`** derives your self-hosted model's
$/MTok from your own GPU rate and measured throughput, and prints the
overlay snippet ready to paste — proven to paste by a round-trip guard.
Forty-two commands now. What none of this says: whether the candidate can
do the work. That is an evaluation, and every report ends by printing the
`trazum route` command that settles it.

## 1.73.1 — "The result follows the scenario"

**Flip the model selector and the Optimizer's dollars follow.** The result
panel used to hold whatever the last press of Optimise computed, so
changing models left a report priced for another model on screen — and it
looked like nothing changed. The token reduction genuinely should not
change (the rules transform text; the counter is one honest heuristic, not
a per-vendor tokenizer), but the money and the advisories should, and now
they do: once a result exists, scenario changes re-run the free
deterministic pass automatically. It never fires before your first
Optimise, never while the LLM pass is on — a dropdown must never spend a
provider call unasked — and automatic runs stay out of your history.

Also carried: the `humanizer` prose-editing skill vendored (MIT, pinned to
its commit) into the tracked skills tree, with a registry that finally
survives the container it was written in.

## 1.73.0 — "The guided tour"

**Five doors, walked once, offered never imposed.** A first visit gets a
one-line offer; the rail keeps a launcher forever; and the tour itself
dims the page, rings one panel at a time and says what question each door
answers — optimise, write, compare, the bill, the playground — ending
where the visitor can type their first command. Escape leaves, focus
travels with the card, the single scroll respects prefers-reduced-motion,
and on a phone the card centres instead of pointing at nothing. No tour
library, no fetch, no analytics on where anyone stopped, both languages.
The suite pins the joins: every ringed step's anchor must exist in a
component, every step must speak both locales in different words, and no
effect may auto-open the overlay.

## 1.72.0 — "The playground"

**Type `trazum profile usage.jsonl` in the web app and the bill prints —
the CLI, runnable in the page, with nothing installed and nothing
uploaded.** The new Playground tab is a terminal over the same
`@trazum/core` functions the real CLI imports, on sample files already
loaded: ten commands (`optimize`, `check`, `profile`, `position`, `diff`,
`semantic`, `from-otel`, `from-claude-code`, `models`, `rules`) plus `ls`,
`cat`, `clear` and `help`. Converter output written with `-o` lands beside
the samples, so the whole 1.71 pipe happens in front of you: convert an
OpenTelemetry export, then price it, two lines apart. Arrow-key history,
both languages, and a clock pinned inside the sample month so the demo
reads the same next year.

**The subset says it is one.** The commands that need a network, a
credential or a running process are named as CLI-only by `help` — and by
the refusal you get typing one — rather than silently absent. The suite
holds the rest: no fetch in either new file, every advertised command runs
in both locales, and a prompt planted in the OTLP sample never crosses any
conversion or any priced output.

Also carried: `github/codeql-action` bumped to 4.37.8 in one commit, both
halves together, superseding the two dependabot PRs that each fail the
SHA-parity guard alone — by design, as the workflow's own comment says.

## 1.71.2 — "The README the npm page never showed"

**Every package's npm page now shows its README.** The release workflow
published with `npm publish -w @trazum/<pkg>` from the repo root, which puts
the README in the tarball but leaves it out of the version metadata npmjs.com
renders, so the page said "This package does not have a README" over a
package that shipped one. Three releases went out that way. Each package now
publishes from its own directory, which is what makes npm attach the README.
No code changed; the packages republish so the pages fill in, and a guard now
forbids the `-w` form and proves it would fail.

## 1.71.1 — "The help, in the language it was asked in"

**A Spanish reader running `trazum --help` now sees the two conversion
commands, `from-claude-code` and `from-otel`.** Both were missing from the
Spanish USAGE block and had no options section, so `--help --locale es` did
not tell a Spanish user those commands exist, even though their error
messages were translated. The help is one big template per language, so the
compiler could not catch it. Fixed, and the guard that proves the English
help lists every command now runs in every reviewed locale, with a planted
hole to prove it fails when a command goes missing again. No behaviour
changed; the CLI republishes so the corrected help ships.

## 1.71.0 — "The universal cost lens"

**Point Trazum at any OpenTelemetry export and it prices the LLM calls
inside — the standard the whole ecosystem is converging on, read as a
bill.** `trazum from-otel` — the fortieth command — generalises the
`from-claude-code` pattern: a pure converter turns a tool's export into a
usage log, and every command prices it from there. It reads the OTLP/JSON
any GenAI exporter produces and turns each LLM-call span into a record —
the model, the timestamp, a label from the span's operation or the
service name (so a per-service bill falls out by itself), and the token
counts. Spans that are not LLM calls are counted and skipped, never
priced. `trazum from-otel spans.otlp.json -o usage.jsonl` then `trazum
profile usage.jsonl`, and the stderr summary says how many spans were LLM
calls, how many were skipped, and how many carried no cache data. This is
what makes Trazum complementary to LangSmith, Helicone and LiteLLM rather
than a competitor: it reads whatever telemetry you already emit.

**The web app learned it too.** The Bill tab's folder drop gains a third
arm — a dropped OpenTelemetry export is detected and converted in the
page, priced beside any transcripts and usage logs in the same drop.
*Drag your OpenTelemetry export onto Trazum* joins *drag your
~/.claude/projects*. No fetch, same invariant, both locales.

**What OTel cannot give, it does not fake.** OpenTelemetry has not
standardised the cache-write TTL split, so an OTel-sourced record carries
no `cache_creation` and its cache verdicts read *cannot tell* rather than
a fabricated one — the same refusal as inventing a price. Cache reads are
read only where the span actually carries them. And nothing but the
numbers crosses: a fixture plants a prompt and a trace id in a span and
greps the whole conversion for them, the same privacy proof the
transcript converter carries. Vendor-specific converters (LangSmith,
Helicone, LiteLLM) are named as next, not built now — each ships when a
real export of it is seen, because a converter for an unseen format is an
estimate wearing a parser's clothes.

## 1.70.0 — "One drag"

**Drag your ~/.claude/projects folder onto the web app and read your own
agent bill in seconds — no install, no upload, no third step.** The 1.69
converter already lived in the browser bundle; 1.70 taught the Bill tab to
recognise a transcript (a new core `looksLikeClaudeCodeTranscript`, keyed
on the assistant envelope, not the word), accept a dropped folder
(`webkitGetAsEntry` descending it, a `webkitdirectory` picker beside it),
convert every transcript in the page labelled by its project directory —
so the per-project bill appears by itself — and price them beside any
usage logs in the same drop. A banner says what it did and ends on the
sentence that earns the whole thing: the transcripts were read in this
tab, the numbers kept and the words not. The privacy guard holds it: no
fetch with the new code inside it, and a mixed folder-plus-log drop
prices as one bill with three labels while the planted transcript words
never cross into the priced stream.

**And the landing speaks five languages.** English and Spanish — reviewed
— plus machine-drafted French, German and Portuguese, so the marketing
surface reaches the world while the tool keeps making its precise claims
only in the languages a human has checked, the same split the trimming
dictionaries draw. The unreviewed languages say so, visibly, with the fix
one GitHub issue away, and the landing keeps its own locale key so a
French visitor never gets pushed into a half-reviewed tool.

## 1.69.0 — "The agent's own bill"

**The largest new LLM bill many people have is one they never
instrumented: the agent they talk to all day.** `trazum from-claude-code`
— the thirty-ninth command — turns the transcripts Claude Code already
writes under `~/.claude/projects/` into a usage log, so `profile`,
`position`, the gates and the web tab price the agent's sessions without
recording anything new. The API's own `usage` object crosses whole,
`cache_creation` TTL split included — the exact field the cache verdicts
beg for — and **nothing else does**: no message text, no paths, no branch
names, held by fixtures that plant a secret in each and grep the entire
output.

Measured before designed, on real transcripts: one API call is written as
one line per content block (25,490 lines → 16,079 calls on one session —
counting lines would overbill by a third), so records deduplicate by
request id keeping the final line; and 311 calls across a real project
differed only by counts growing — responses captured mid-stream — which
the converter counts as `streamed` without alarm, reserving
`disagreements` for what streaming cannot explain. The first draft
alarmed on both; that was the message crying wolf about the norm, and the
plan records the correction.

A guard hole closed on the way and paid immediately: the README's
command-count guard mapped number words only up to thirty-two, silently
skipping every claim above it — extended to forty-four, its first covered
run caught a stale "thirty-four commands" that had drifted invisibly.

This release also carries what merged unreleased before it: **Trazum as a
Claude Code plugin** (`claude plugin marketplace add Davmunrey/Trazum`,
then `claude plugin install trazum@trazum` — the skill derived from the
project's own by script, the MCP server through the registry, versions in
lockstep with these manifests), and six vendored agent skills with their
provenance recorded in `.agents/skills/VENDORED.md`.

## 1.68.0 — "The browser catches up"

**Everything the CLI can say about your money, the web app now says in
your own tab — from the same functions, with nothing uploaded.** The
[1.68 plan](docs/plan-1.68.md)'s arc, closed: 1.67 taught the product to
answer *where does the month stand against the ceilings I configured*, and
until now only three of the four surfaces could say it. The fourth — the
one a person who pays the bill actually opens — has caught up.

**The Position card.** The Bill tab renders the 1.67 `PositionDocument` in
the browser: every configured ceiling with its measured spend, its window,
its denominators and its verdict; the distance line as division labelled
as division, rendered **only when `positionReport` granted it** — under
the seven-day floor, on an `over` and on a zero rate the document withholds
it, and a guard proves the card cannot re-derive what was withheld. The
unmeasured ceilings render with their reasons — an unseen label is named
as possibly renamed, possibly idle, and neither is "under budget" — the
`cannotSay` lines render as furniture, and `source: usage-log` is stated
on the card: the store's provider-billed standing is a different
measurement and is never merged in.

**The ceilings come from the real config.** You paste your own
`trazum.config.json`; it is read by the same `parseConfig` the CLI uses —
same validation, same error sentences verbatim, and no second JSON parser
beside it (guard-enforced). A config that validates but configures no
ceilings is told so, never shown an empty report. Like everything in the
tab: no fetch anywhere, the config never leaves the page.

**One document, four doors, one wording.** Both locales speak the CLI
catalogue's own sentences word for word. `position-ui.test.mjs` holds the
fourth door to the other three textually and functionally — the exact call
path the card takes produces the document the CLI produces: a quiet day is
a measured $0, `sessionUsd` lands in "what this deliberately does not
answer", unpriced records are counted out loud. 408 web tests; verified
live in light, dark and Spanish, error states included.

The plan records one honest correction, kept because the record is the
point: "what-if in the browser" was sketched as a chapter and turned out
to have already shipped — the Bill tab has carried the CLI's `--what-if`
since the levers work.

## 1.67.1 — "Ready to travel"

**Nothing changed shape; the project got easier to reach and easier to
run.** A patch in this repository's sense: no new contract, no new command,
and three things worth having.

**Deployable on N0, honestly.** A root `Dockerfile` builds the workspace in
stages — core first, then the web app with Next's `standalone` output — and
`n0-app.json` describes the whole thing: Postgres 16, a migration service
that applies `apps/web/db/*.sql` in order and stops on the first error, and
the web entrypoint. The manifest embeds the SQL because the platform writes
config files before the container starts, and a test keeps the embedded
copies **byte-identical to the real files in both directions** — plus two
more honesty guards: the image field must keep its loud
`REPLACE-WITH-REGISTRY/` placeholder until a real registry exists, and no
environment value may be credential-shaped (secrets are declarations, not
values). Updates travel by mirroring: a GitHub workflow pushes `main` to
the N0 workspace's Gitea — doing nothing, and saying so in the log, until
the owner adds the three `N0_*` secrets — and a Gitea Actions workflow
there builds and pushes the image on every mirrored commit. The whole flow,
including why you pin a commit SHA rather than trusting `:latest`, is in
`docs/deploy-n0.md`. **Nothing deployed with this release**; the machinery
waits for credentials only the owner can mint.

**The rail names its groups and links out.** The web app's five tabs sat in
one undifferentiated column; now the rail says what each cluster is for —
*Work on a prompt* (Optimise, Write, Compare, and the Library when signed
in) and *Measure* (Your bill) — with quiet uppercase eyebrows that collapse
to hairline separators in the icon-only rail, and a *Resources* block
linking the GitHub repository, the npm CLI package and the documentation.
Each link opens in a new tab, tells a screen reader so, and shows a small
outward arrow on hover or keyboard focus. The labels are data, not
submenus: nothing hides behind an extra click, and the keyboard order is
unchanged. Both locales.

**A rendering defect found by looking, not by report.** Tailwind's named
groups match *any* ancestor, not the nearest: the tabs primitive styled
itself through `group-data-[orientation]/tabs:`, so the Optimizer's
horizontal result switcher — nested inside the shell's vertical Tabs —
rendered as a stacked column, and with both orientations' marker rules
matching at once the active indicator collapsed to a 2×2px dot floating
over the card heading. The primitive now reads the element's own
`data-orientation`, which Radix stamps per element and which cannot cross a
Tabs boundary. The guard that defends those declarations learned the new
spelling, and its planted-defect cases still fire. 393 web tests green;
verified by screenshot in light, dark, the mobile drawer and the collapsed
rail.

## 1.67.0 — "The month ends on a measured position"

**The product still refuses to forecast; what it stops refusing is to say
where the month stands.** The last arc of the 1.65–1.67 plan, and with it
the plan closes: every chapter of all three arcs delivered.

**Chapter one — the position, as one answer.** `trazum position
<usage.jsonl>`: every configured ceiling — `spend.monthlyUsd`,
`limits.dayUsd`, each `limits.byLabel` entry — with its measured spend, its
window, and the denominator on every figure, measured from the named log
alone and saying so (`source: "usage-log"`; the store's provider-billed
standing is a different measurement and is never merged in). The line
people actually want is division, labelled as division: *"at $5.00/day over
8 measured days, the ceiling is 12.0 days away — division on the past, not
a forecast."* It is **absent, never zeroed**, under the seven-day floor
every scaled figure respects, on an `over`, and on a zero rate — and no
field in the document names a date, held by a test. A stale log is
`cannot-tell` for the month while a quiet day is a measured $0 — the
`budgetPositions` rule and the doors' rule, side by side on purpose. What
the log cannot measure is named with its reason (`no-clock`, `no-labels`,
`nothing-recorded`, `label-unseen` — renamed? idle? neither is "under
budget"), and what the document deliberately does not answer is written in
it: the per-session ceiling is judged per call at the doors, because a
session is not a calendar scope. The document is the **nineteenth named
contract** — `conform` detects it, `trazum schema position` exports it —
and the CLI grows to **thirty-eight commands**.

**Chapter two — the position travels.** `--html-out` writes the position as
one self-contained page: the terminal's own sentences through the same
message catalogue, the caveat block before the tables (a forwarded page
gets cropped from the bottom), hostile labels escaped and both locales
tested. The MCP server grows a **seventh tool, `position`** — log text and
ceilings in, never a path; the same document out; the `limits` argument
validated by the config file's own parser; session keys grouped by and
never shown. The tool-list guard exists precisely so a tool cannot arrive
without its security argument being re-read, and position's is recorded
where the others' are.

**Chapter three — one pipe, no shell loop.** `check --files-from -` reads a
file list from stdin — the shape `git diff --name-only` produces — so the
pre-commit hook is now literally
`git diff --cached --name-only | trazum check --files-from -`. Paths that
are not prompt files, paths the config ignores, and deletions are dropped
and **counted out loud**; a commit that touches no prompts passes without
ceremony, because a hook that fails on a README edit is a hook somebody
uninstalls. The baseline gate is deliberately skipped under a partial list
— it compares the whole repository against the committed record, and two
changed files would read as thirty-eight removals — and the skip is stated
on every run.

Nothing existing changed shape or meaning; `schemaVersion` stays `1`
everywhere. With this release the five open-source paths are delivered as
far as they go as code; what stays out — adoption conversations, a
forecast, a policy server, and the blocked arcs 1.54.0/1.57.0/1.58.0 with
the writer's model-assisted polish — stays named, not faked.

---

## 1.66.0 — "One policy, three doors"

**Per-label, per-session and per-day USD ceilings, stated once, judged once,
enforced identically at whichever door the call arrives.** The product could
already refuse — the gateway with an HTTP 402, `serve` with a cost answer,
`spend_guard` over MCP — but each door read its own slice of config, and the
1.62 arc's lesson is that two doors to the same value agreeing by coincidence
is a defect waiting for its input. Four chapters closed it.

**Chapter one — the policy has one shape.** A `limits` block in
`trazum.config.json`: `dayUsd`, `sessionUsd` and `byLabel` ceilings.
Deliberately separate from `spend`: a report gate is read after the fact over
a log; an enforcement ceiling is read before a call is made, to refuse it.
Every ceiling must be a **positive** finite number — a zero enforcement
ceiling refuses every call at that door, an outage dressed as a policy, and
the error says what to write instead. Unknown keys are named with the
nearest real key, never ignored.

**Chapter two — the library judges it.** `judgeLimits` in `@trazum/core`:
policy + measured position + proposed call in; within, over or cannot-tell
out — one judgement per applicable ceiling, each carrying the limit, the
measured spend, the window it covers and the after-call position. Every
ceiling is judged by `answerCost`, the single-budget semantics every door
has used since 1.44, refusals included. Two refusals close one loophole: a
call that omits its label or session does not slip past that ceiling — it
becomes unjudgeable, with the smallest ceiling named as the one it might be
dodging. Verdict precedence is over, then cannot-tell, then within, because
"within" must mean everything was judged; an empty policy answers
`no-policy`, never "within".

**Chapter three — the doors hold the line.** All three doors carry the same
`policy` judgement; none does arithmetic of its own. The suite proves it the
hard way: the same policy, the same measured position and the same call go
through all three doors and the judgements must match **field for field** —
then a door is deliberately broken twice (a forged field; `serve` started
without its measured side) to show the comparison can fail. The measured
side is a usage log — `--log` on `serve` and `gateway`, since per-label and
per-session spend live in a usage log, not in the store's provider buckets —
and `spend_guard`'s `limits` argument is validated by the config file's own
parser, so a pasted policy and a committed one cannot mean different things.
The gateway reads `metadata.trazum_session` at the label's seam; session
identifiers judge and are never echoed, recorded or printed, and the suite
greps every door's output for the key to prove it.

**Chapter four — refusal is legible, and silencing one leaves a record.**
Every over-limit refusal names the limit, the measured spend and the period
in one sentence, built once and spoken by every door. Waivers apply to
limits unchanged — gates `limits.dayUsd`, `limits.sessionUsd`,
`limits.byLabel:<label>`, mandatory reason and expiry. A waived ceiling
keeps its `over` — the measurement is the measurement — but the policy does
not refuse it, the waiver rides in every answer as the record of the
silence, and the day it expires the ceiling refuses again.

**Also found on the way, reproduced against the shipped build first:**
`serve` crashed outright on `{"inputTokens": -5}` — the core's
negative-figure refusal was an uncaught throw inside the request handler,
taking the whole oracle down. It is a 400 now, with a test on the door.

The new `policy` field is additive on all three documents; `schemaVersion`
stays `1` everywhere and nothing existing changed shape or meaning.

---

## 1.65.0 — "The format anyone can adopt"

**A document can now be checked against this format by a tool that has never
installed this product.** That sentence is the whole arc, and each of its three
chapters removed one thing standing between a stranger's tool and this format.

**Chapter one — every contract answers to its name.** `--contract` accepts all
**eighteen** documented contracts; before this arc it named eleven, and the
seven others — fleet, spend guard, first run, pulse, rule yield, gateway
refusal, bench — could be read about but not checked. Each of the seven now has
its required fields enforced by `conform` in both directions: the documented
minimum passes, and gutting any single field fails with the field named.
`contractOf` detects all eighteen from a bare document, with the detection
order stated where it matters (a fleet before a profile, a spend guard before
a cost answer).

**Chapter two — the schema leaves the repository.** `trazum schema <contract>`
prints an authored **JSON Schema (draft 2020-12)** for any named contract, so
any off-the-shelf validator can check a document with no Trazum installed. The
schemas state required fields and their types and stop there:
`additionalProperties` is never `false`, because these documents gain fields
without a version bump, and documented unions stay open by the format's own
rule. Held to `conform` by construction, not coincidence — `requiredFieldsOf`
exports the exact list `conform` enforces and a guard compares every schema's
`required` to it. That guard caught **five drifted schemas and a missing
field before the chapter was an hour old**, which is the argument for it in
one sentence. Every schema-shaped minimum round-trips through both doors;
the CLI's output is byte-identical to the library's schema, tested per
contract; the refusal names all eighteen contracts in both locales.

**Chapter three — the producer's page.** `docs/format.md` grows the section a
connector author actually needs: **emit-this-minimum** examples for the two
contracts that exist to be written by tools that are not Trazum (a usage-log
record whose only required field is `model`, and an outcome report exactly as
`@trazum/core` computes one), the additive promise restated from the
producer's side — *add anything, redefine nothing, never write `0` for a
measurement nobody took* — and where the schemas live, with each schema's
`$id` stated as an **identifier, never fetched**. The examples are not
illustrations: the build extracts every labelled example from the page, runs
it through `trazum conform`, then guts a required field and requires the
gutted copy to fail. An example that drifts breaks this build, not the first
producer to copy it.

Also in this release: the trusted-hosts inventory gained a new decision kind,
*identifier, never fetched*, added deliberately for `json-schema.org` — a URI
that exists to be compared and must never be resolved by a build.

Nothing in the JSON contract changed shape. `schemaVersion` stays `1`
everywhere; the schemas describe what already ships.

---

## 1.64.0 — "The report somebody forwards"

**The figures leave the terminal without losing their caveats.** The person
who pays the bill is usually not the person who runs the CLI, and until now
the profile reached them as a screenshot — a document with no caveats and no
second page. Four chapters, planned first, delivered in full:

- **`trazum profile --html-out`** — one self-contained file: inline CSS, no
  scripts, no external assets, both locales, printable. A projection of the
  document `--json` prints — the renderer takes the exact same input object
  as the Markdown door, built once for both, so no second computation exists
  to disagree with the first, and the copy is the terminal's own catalogue.
- **The caveats are furniture, not footnotes.** Unpriced models, unreadable
  lines, a log with no clock or sessions, an unsettled cache TTL and a stale
  price table render in a bordered block *ahead of* the tables, at the same
  weight as the totals they qualify — asserted by content and by position,
  and in the other direction too: a run with nothing to caveat earns no
  block, because a box that always renders is a box nobody reads.
- **`trazum rollup --html-out`** — the team-facing document, same
  discipline: each contributor's gaps under that contributor's own name
  (pooling them is the averaging the roll-up exists to refuse), and every
  `cannotSay` — `overlap-invisible` included — impossible to crop out of a
  forwarded copy.
- **The parity guard, both directions**: every dollar anywhere in either
  page and every count in a numeric cell walks back to the document
  (nothing invented), and the document's headline figures walk forward into
  the page (nothing dropped). Proved by forging pages before being trusted;
  the guard imports the product's own `formatUsd`, because a
  re-implementation is a second computation wearing an assertion.

**Found on the way in, fixed first**: `profile --json --markdown-out` had
crashed with a ReferenceError since 1.59, on every release — reproduced
against the published 1.63.0 before fixing. Under `--json` the terminal path
never runs, and the side-file writer reached for that path's uninitialised
`levers` binding. No test had ever driven both flags together; now one does.

Labels and model ids come from somebody's log, so everything interpolated is
escaped — tested with a label that is itself an HTML injection. What stayed
out, per the plan: charting libraries, template languages, serving anything.

## 1.63.0 — "Scale is measured, not assumed"

**The 1.63 arc closes, and the ceilings are now measurements the build is
held to.** The stress session timed the pathological cases by hand and
nothing held them there; four chapters later, everything below is enforced,
and this release's own contribution is the closing condition the plan
committed to: **the gate is live.**

### This machine's numbers, next to the promises

- **The bench** (1.62.1): 1MB optimize safe **818ms / 152MB RSS**, aggressive
  **1,071ms / 148MB**; 200k-line profile **1,673ms / 230MB**; 10k-file walk
  **118ms**; 20k-line roll-up **7ms**. One shot each, own child process,
  deterministic generated inputs.
- **The ratio gate** (1.62.1, live as of this release): `trazum.bench.json`
  is committed and CI fails past **3×** a workload's recorded ratio. The
  design got a free live trial: this container's CPU changed between the
  recording run and the gating run — wall clocks moved ~1.5× — and the
  ratios held (5.47→5.33, 7.49→7.85, 11.08→11.14). The machine cancels out;
  that was the whole argument, and it is now measured rather than claimed.
  The named risk stands: a workload too noisy on shared runners loses its
  gate loudly here, never left flaking.
- **The refusal ceiling** (this arc's chapter three): above **400,000
  characters**, anything claiming to be a prompt is refused with the size
  and the limit named — every door, one constant in `@trazum/core`, a suite
  guard holding every other ceiling to deriving from it, `--max-input` to
  raise it deliberately. Logs and documents are never held to it.
- **The heap line** (chapter four): the 25MB log profiles inside a **384MB**
  old-space cap enforced by the engine itself, observed peak **~158MB**;
  the same probe dies at 64MB, so the line binds.

### On the record

Landing chapter three tripped the code-scanning rule: four medium
`js/file-access-to-http` alerts on `llm.ts` and `tokenizer.ts` — CodeQL
accurately describing `--exact-tokens` and `--llm`, the two features that
send your prompt to the API you configured. The query is now excluded in
`.github/codeql/codeql-config.yml` with the reasoning attached, **proposed
to and approved by the repository owner before it landed**; every other
security-extended query stays on, and the security suite keeps pinning
which modules may reach the network at all.

With this minor, [the 1.62–1.63 plan](docs/plan-1.62-1.63.md) is delivered
in full — both arcs, all nine chapters, nothing renumbered and nothing
faked. What stays blocked stays named: 1.54.0 and 1.57.0 on provider
credentials, 1.58.0 on a distribution decision, the writer's model-assisted
polish on the same.

## 1.62.1 — "This machine, measured"

**The 1.63 arc opens with its first two chapters: the bench, and the ratio
gate it feeds.** The stress session timed the pathological cases by hand — 1MB
of prose in about a second, a 200,000-line log in about 1.3 — and nothing held
them there. Now something can.

**`trazum bench` measures this machine, honestly.** The standard workloads — a
1MB prompt at both levels, a 200,000-line profile, a 10,000-file walk, a
20,000-line roll-up — one shot each, wall time and peak RSS, as a table and as
`--json`. Each workload runs in its own child process, because a memory peak
is a fact about a process: five workloads in one heap would each report the
high-water mark of whichever ran biggest before them, and the test proves the
isolation by watching a peak sit *below* its predecessor, a shape one process
cannot produce. The inputs are generated with the hostile-input suite's own
LCG against a fixed pricing date — deterministic, never written to your
project (proved by running the bench inside an empty directory and looking).
"Peak heap" from the plan ships as **peak RSS, named as such** — a heap
high-water mark is not observable from inside a synchronous run without
moving the number.

**The gate is a ratio, never a wall clock.** CI runners lie about time, so
each workload is also timed against a fixed calibration loop in the same
process — deliberately *not* the product's own code, so a ratio moves only
when the workload does — and the runner lies to both by the same amount, so
the lie cancels out. `--record` writes the ratios as a committed baseline;
`--against` with a stated `--max-ratio` exits 1 past the factor, on stderr,
the way `check` has always gated — the JSON never changes shape with the gate
flags. A workload measured but absent from the baseline fails rather than
passing silently. The baseline format joins the versioning freeze beside
`trazum.baseline.json`: an unknown version is a loud error naming `--record`.
The gate is proved by breaking it — a real run against an absurdly small
recorded ratio goes red with the workload named.

**Landing it collected four debts, each from a guard doing its job**: the
bench document needed a CLAIMED harvest (it now holds its own `json-output.md`
table in both directions), `docs/format.md` needed a row (seventeen documents
emitted of eighteen defined, with the count guards taught the indefinite
article), the `--json` command partition had bench in neither list, and the
security suite refused a second `child_process` import — the spawn moved into
`git.ts` as `runSelf()`, under the same stated rules, nothing loosened.

Not in these chapters, per the plan: wiring this repository's own CI to a
committed baseline. That is the arc's closing condition — the gate goes live
for whichever workloads prove stable, and a workload dropped for variance is
dropped loudly in the release notes, never left flaking.

This container's numbers, transcribed: 1MB optimize (safe) 818ms / 152MB;
aggressive 1,071ms / 148MB; 200k-line profile 1,673ms / 230MB; 10k-file walk
118ms; 20k-line roll-up 7ms.

## 1.62.0 — "Held to its own standard"

**The 1.62 arc closes.** The thesis was turned inward: 1.61 ended on *a prompt
this tool cannot improve*, and the stress session asked whether `optimize`
holds itself to that claim — it did not, and neither did four other doors. The
five chapters landed in 1.61.1 and 1.61.2; this minor is the story finishing,
and its job is to say on the record what is now permanently true:

- **Never throws.** `optimize` survives a seeded corpus of hostile atoms — RTL,
  CJK, lone surrogates, null bytes, zero-width characters, CRLF, unclosed
  fences, 3,000-character tokens — without an exception.
- **Never grows.** No input comes out costing more tokens than it went in
  with, at either level.
- **Idempotent.** The pipeline runs to a fixed point; run on its own output it
  changes nothing, byte for byte.
- **Masks intact.** Code blocks, inline code and URLs survive byte-for-byte
  across the whole corpus — proved by planting bait the rules want to rewrite
  *inside* protected spans, which is how defect seven was found at all.
- **Money is never negative.** No document this package can build carries a
  negative dollar figure, whatever the input; negative and non-finite token
  counts, budgets and volumes are refused at the layer that owns each, and no
  flag accepts what its config sibling refuses.
- **Unreadable lines are named.** `profileUsage`, `conform` and `rollUp` are
  total over strings: a line they cannot read is reported by number, never
  thrown at, never read past in silence.

The properties live in `hostile-input.test.js` — seeded, deterministic,
bounded in seconds, run on every push — and every defect the session found is
pinned as a named case outside the fuzzer's seed schedule, so a corpus rotation
cannot retire a regression test. New this release:
**[docs/hardening.md](docs/hardening.md)** states all of it as a page — where
each promise is enforced, what a bounded fuzzer does not prove, and the
standing rule that every future crash joins the corpus as an atom, so the same
input can never be taken quietly twice.

The documentation index also stops undercounting its own plans: it said five
plans when there were seven, and the arcs table now records this arc as landed.

No code changed in this release — the arc's code shipped in its chapters. The
mechanics: five manifests, three `@trazum/core` pins and the lockfile at
1.62.0; README Action pins advanced to the 1.61.2 release commit.

Next: **the 1.63 arc — scale is measured, not assumed** — runs as 1.62.x. A
bench command, a ratio gate against in-process calibration rather than a wall
clock, a uniform refusal ceiling, and a heap line for the 25MB log.

## 1.61.2 — "An input nobody had tried"

**Seven defects, one stress session, one shape.** The owner asked for the app
to be stressed — errors, failures, absolutely everything — and an afternoon of
fuzzing found seven, every one an input nobody had tried, taken quietly. [The
plan through 1.62 and 1.63](docs/plan-1.62-1.63.md) was written out of the
session, and this release is its first five chapters.

### The seven

1. **`optimize` was not idempotent** — run on its own output it saved more, on
   1 input in 4,000. One pass missed its own cascades: `emphasis` stripped
   `IMPORTANT:` and left two lines equal but for a space `whitespace` had
   already stopped looking at. The pipeline runs to a **fixed point** now, and
   `optimize(optimize(x)) === optimize(x)` is enforced over a hostile corpus.
2. **`spend_guard` said yes to a lie.** `outputTokens: -500` priced the call
   at **−$0.0075**, and a negative estimate lowers the projected spend — an
   agent that lies about its output tokens bought itself an approval. Refused
   in `answerCost`, which closes `serve`, the gateway and the guard in one
   place.
3. **A negative budget was judged.** `assemble` took `budget: "-5"` and said
   `over` — a verdict against a limit that cannot exist. Not a positive finite
   number → no budget, said with the verdict's own reason.
4. **A negative volume was billed.** `callsPerMonth: -100` priced a prompt at
   **−$1.26 a month**, a number no bill ever had.
5. **`--cache-hit-rate 2` walked through the flag door** while the config door
   refused the identical value. Two doors to one value cannot disagree about
   what fits through; the flag now refuses in both locales, naming the
   config's own rule.
6. **`prompt_writer`'s schema said `minimum: 1` and the runtime never enforced
   it.** A schema the runtime does not enforce is documentation wearing a
   guard's clothes.
7. **Text inside a code span came out rewritten, with every mask believed on.**
   On ``` ``` `span` ``` ``` shapes the segmenter's inline-code scan matched
   from the third backtick of a closing fence, and after the illegitimate
   match was dropped its scan position had already passed the real span — left
   mutable, and rewritten. **Since the masker shipped.** Each pattern now
   scans with earlier patterns' ranges reserved, restarting after a
   reservation rather than after itself.

### The stress session as a fixture

`packages/core/test/hostile-input.test.js` — seeded, deterministic, bounded
(~5s). A corpus of hostile atoms (RTL, CJK, lone surrogates, zero-width
characters, control bytes, CRLF, unclosed fences, 3KB tokens) holding four
properties: **never throws, never grows tokens, idempotent, masks survive
byte-for-byte** — plus a malformed-log corpus, *money is never negative
whatever the input*, and *a line the parser could not read is named in
`skippedLines`, never read past*. Every defect above is pinned as a named case
outside the fuzzer's seed schedule.

### The zero that proved nothing, twice

The mask property passed immediately — and breaking the safety net did not
fail it, and removing the inline-code mask did not either. **The corpus held
no code a rule wanted to touch**: a zero that cannot go non-zero proves
nothing. Bait atoms went in — verbose phrases and double spaces *inside*
protected spans — and defect seven fell out the same hour. The bait stays in
the corpus so the zero can never go vacuous again.

### What this release found wrong in itself

The plan document named a command that does not exist yet, and the every-page
guard refused the page — correctly: a reader cannot type `bench` today. The
plan now says "a `bench` command", and the invocation appears when it exists.
The guard beat the plan, and the plan is better for it.

---

## 1.61.1 — "Nothing was holding these"

**A patch, and both entries are the same act.** Take something this repository
says about itself, ask what would fail if it stopped being true, and find out by
**emptying it** rather than by reading. Two answers came back the same: nothing
would fail.

### Four of the five promises the format opens with

`docs/json-output.md` opens with five. One was enforced — *absence is `null` and
never zero*, checked on five fields of one document. **The other four were
prose**: dollars are numbers, never rounded; token counts are integers; nothing
carries a session key or prompt text.

**All four held.** Measured, not assumed: **414 dollar figures and 296 token
counts** across the profile, the roll-up and the prompt draft — zero strings,
zero non-integers, and nothing out of a log deliberately carrying `prompt`,
`system`, `completion`, `content` and `messages`. That is exactly the state in
which a promise quietly stops being true, because nothing would say so.

The guard **takes the bullets out of the page first**, so it cannot outlive the
claim or the claim the guard. **Rounding is asserted backwards**, because its
absence cannot be proved from one document: a document whose dollars had been
through `toFixed(2)` would carry *none* with more than two decimals, and this one
has to carry a majority.

**Every check was proved by breaking the product, not the test** — rounding on
the way out of `profileUsage`, a dollar returned as a string, a half added to a
token count, a session key placed in the document. And rewording the promise
section without changing a promise must not fail, which it does not.

### Six pages that could have been deleted in silence

The probe that found `docs/doctrine.md` unguarded was run over every prose page
here. Six broke **nothing at all**: `docs/ci.md`, `docs/running.md`,
`docs/accounts.md`, `docs/authoring-rules.md`, **`SECURITY.md`** and
**`VERSIONING.md`**. The last two are worth naming — one tells somebody how to
report a vulnerability, the other defines what this project's three version
numbers mean, which every release depends on.

Six bespoke guards would have left the seventh page unguarded, so the new one is
derived from the filesystem and holds **every** page to the three things a page
goes wrong about quietly: it says something, it links only to files that are
there, and it shows only commands this CLI dispatches — that last derived from
`COMMAND_FLAGS`, so the docs and `USAGE` cannot disagree with the product or with
each other. Thirty pages, 219 relative links, fifty-odd documented invocations.

**What that proves is narrow, and the test says so.** Nothing mechanical can
check that what a page *says* is true. But the failure was not a subtle
mischaracterisation: it was six pages nothing was holding at all.

### What this release found wrong in itself

**The new guard caught prose on its first run.** `Executable trazum not found`,
quoted in a changelog entry, came back as a command called `not`. Exempting the
file would have been the wrong fix — a guard that needs an allowlist to stay
quiet is a guard somebody deletes — so the pattern was tightened to what an
invocation actually is: something that **begins** its command, at a line start,
inside a code span, or after a shell prompt. Both cases are kept as tests.

And the first attempt to prove the link check by breaking it was a **no-op**: it
edited a link `docs/ci.md` does not have, and the suite stayed green for the
wrong reason. Redone against a link that is really there.

---

## 1.61.0 — "A prompt this tool cannot improve"

**The arc closes.** Trazum had only ever read prompts somebody else wrote. It
writes one now, by asking — and the whole point is what it refuses to say about
what it wrote.

[The plan](docs/plan-1.61.md) was written before the code, as every arc here has
been. **Six chapters, all six delivered**: the questions, the assembly, the three
measured claims, the terminal, the web, and MCP.

### The shape of it

```bash
trazum write                    # asks the questions, one at a time
trazum write --answers a.json   # the same questions, already answered
```

Also a `Write` tab in the web app, and `prompt_writer` over MCP so an agent gets
interviewed too. **Three surfaces, one document**, and the same fourteen
questions behind all of them.

**Nothing is generated.** No model decides what to ask or what to write. The
catalogue is fixed, the follow-ups are predicates over the answers so far, and
the words in the prompt are the author's — a writer that paraphrased them would
be answering a question nobody asked it. The same answers assemble the same
bytes on any machine and in any locale, which is what let the offline rule hold
without a footnote.

### What it refuses to claim

**Not that the prompt is perfect, or good, or better than the one you had.**
Those are judgements about text nobody has run, and this product spent an entire
arc removing exactly that kind of claim from its own advice.

Three measurable things replace it:

| Claim | What it means |
|---|---|
| **Complete** | Every required question answered, every declined one named. **No score** — a grade out of ten is precisely what *nothing continuous invents a number* forbids |
| **Cheap** | What it costs, with `provenance: estimated` carried *inside* the figure because nobody has sent this prompt yet. `monthlyUsd` is **null when it cannot be priced**, never 0. The budget answers `within`, `over` or `cannot-tell`, with the reason for the third |
| **Clean** | What `trazum optimize` still recovers from the draft. **Nothing** |

**The third is the only one this product could have staked its name on**, because
the tool grading the output is the same tool that would have to find the fault. A
writer whose output `trazum optimize` still improved would be selling the cure
for a disease it had just caused. And the zero is proved non-vacuous: the same
draft with a verbose phrase pushed into it has to come back non-zero, or a rules
engine that found nothing in anything would satisfy that check forever.

### Three states, everywhere

**Answered, declined, and never asked.** A decline is an answer: it closes the
follow-up a real one would have opened, and it is named in the output rather
than dropped. Input running out mid-interview is none of the three, and is
reported as unasked — which cost a real bug to learn, because `readline` on a
drained pipe never settles and the process was leaving with **status 0 and
nothing printed**: an interview that stopped halfway and reported success.

### The contract, and the two releases that made it arrive properly

`prompt-draft` is the eleventh contract `--contract` accepts and the sixteenth
document in the interchange format. `prompt` is **null and never `""`** when
required answers are missing, and `missing` is empty **exactly when** `prompt` is
a string — asserted in both directions, so the refusal and the output can never
drift into disagreeing.

**Four existing guards forced it to arrive documented and checked**, and none of
them was edited to pass: the contract-coverage map wanted a claim, the
interchange index and the README wanted their counts moved, the article map
refused to guess one for a new contract name, and the library-documents guard
required the draft to be handed to the package's own checker. That was the
plan's own test of [1.60.3](#1603--a-document-nobody-lists), and it worked.

### What building it found in code that was already shipped

- **`optimize` accepted any string as a level and silently ran `safe`.** The CLI
  had refused `--level balanced` by name since forever; a library caller got the
  quiet downgrade instead. `RULE_LEVELS` is exported for the first time — the
  package had the union and no list, so the valid set was not discoverable at
  all.
- **`-o` parsed and did nothing**, in the new command *and* as a dead fallback
  in `baseline`: the parser rewrites it to `out`, so the key it read could never
  exist.
- **A guard read a whole page instead of its own section**, and reported three
  slots that do not exist the moment that page gained a second table.
- **CodeQL called the web route's answer loop a remote property injection**, and
  was right about the shape: the property being written was a string the caller
  chose. The loop runs over the catalogue now and the map has no prototype —
  fixed on the HTTP route, then written correctly on the MCP tool before it
  could be made twice.
- **A count had stopped being a check.** `tools.length === 5` was a literal
  bumped every time a tool arrived; a number somebody edits to make a suite pass
  asserts nothing.

### What this arc did not build

**The optional model-assisted polish.** It needs a credential this repository
does not have, and inventing what a model would have said is the
estimating-and-measuring merge that 1.36–1.40 spent five releases removing.
Named in the plan from its first draft, named here, and still open — the same
treatment 1.54.0 and 1.57.0 get.

### What this release found wrong in itself

A sweep that called itself "all three levels" measured two, because `balanced`
silently ran `safe`. The zero survived the correction; the sentence did not. And
CI caught a section-bounding defect a local run should have: `verify` went green,
*then* a page gained a table, *then* the commit went out — the run was of the
code and not of the change.

---

## 1.60.4 — "You describe it, it asks"

**Trazum has only ever read prompts somebody else wrote.** `optimize` finds the
waste in one, `check` holds it to a budget, `rules --measure` says what each rule
recovers — and all of them start from a prompt somebody already guessed their way
into. The most expensive waste is not the filler the rules remove. It is **the
paragraph that should never have been written and the constraint nobody stated.**

The owner asked for the other direction: *you describe what you want, the app
asks you for context, and writes the prompt.* [The plan](docs/plan-1.61.md) was
written before the code, as every arc here has been, and this release is its
first four chapters — plus a guard for the one page in this repository that had
none.

### `trazum write`

```bash
trazum write                    # asks the questions, one at a time
trazum write --answers a.json   # the same questions, already answered
trazum write --answers a.json --json > draft.json
```

**Nothing is generated.** No model decides what to ask or what to write. The
catalogue is fixed, the follow-ups are predicates over the answers so far, and
the words in the prompt are yours — a writer that paraphrased your answers would
be answering a question nobody asked it. The same answers assemble the same bytes
on any machine and **in any locale**, which is what lets the offline rule hold
without a footnote.

**The prompt goes to stdout and everything else to stderr**, so
`trazum write --answers a.json > prompt.txt` is a file with a prompt in it and
not a file with an interview in it.

### The questions are the product

A question whose answer cannot change the output is waste, and waste is this
tool's whole subject. Three rules govern the asking, and **each one is run rather
than commented**:

- **A question is only asked when its answer can change the output.** Every gate
  is handed an answer set that opens it *and* one that does not — **a gate that
  is always true, or never true, does nothing** — and both directions fail. No
  JSON schema is asked for when the answer is prose.
- **The interview stops.** It says so when every open slot has an answer or a
  decline, and the opposite direction is asserted too: `done` on an empty
  interview would be a stop rule that stops before it starts.
- **A refusal never arrives bare.** Missing required answers are named with what
  each one unlocks, including one that only a previous answer opened.

**Answered, declined and unanswered are three states.** A decline is an answer:
it closes the follow-up a real one would have opened, and it is named in the
output rather than dropped. Input simply running out is none of the three and is
reported as unasked.

### It refuses to claim the prompt is perfect

That is a quality judgement about text nobody has run. Three measurable claims
replace it, and all three are printed:

| Claim | What it holds |
|---|---|
| **complete** | The checklist with its gaps named, and **no score** — a grade out of ten is exactly what *nothing continuous invents a number* forbids |
| **cheap** | `provenance` is always `estimated` and travels *inside* the object; `monthlyUsd` is **null when it cannot be priced**, never 0; the budget answers `within`, `over` or `cannot-tell` with its reason |
| **clean** | What `trazum optimize` still recovers from the draft. The target is nothing |

**The third is the one worth having**: the product's own rules are the acceptance
test for its own output. A writer whose output this tool still improved would be
selling the cure for a disease it had just caused. It recovers **nothing**, at
every level — and the zero is proved non-vacuous, because a rules engine that
found nothing in anything would satisfy that check forever.

### `prompt-draft` joined the interchange format

The eleventh contract `--contract` accepts, the sixteenth document. `prompt` is
**null and never `""`** when required answers are missing, and `missing` is empty
**exactly when** `prompt` is a string — the refusal and the output are the same
fact read two ways, asserted in both directions so they cannot drift into
disagreeing.

**This was the plan's own test of the two releases before it**, and four guards
fired without being edited: the new table needed a claim, two pages needed their
counts moved, the article map refused to guess one for a new contract name, and
the library-documents guard required the draft to be handed to the package's own
checker.

### The doctrine was the one page here nothing enforced

Measured rather than assumed: **emptying `docs/doctrine.md` and re-running the
suites broke nothing**, while emptying `docs/json-output.md` broke ten files.
Twenty-four rules, referenced only from test comments — in the page whose whole
subject is checking what enforces your own rules.

The guard does not enforce the rules; most are about judgement and one says
outright that no test can hold it. It enforces the page, and **italics in the
preface are now reserved for rule names** — which is not a style note, because
every italic phrase there is read as a rule and any that is not one fails. **It
fired on the first draft of the paragraph announcing it.**

### What building this found in code that was already shipped

- **`optimize` accepted any string as a level and silently ran `safe`.** The CLI
  has refused `--level balanced` by name since forever; a library caller got the
  quiet downgrade instead. It refuses now. `RULE_LEVELS` is exported for the
  first time — the package had the union and no list, so the valid set was not
  discoverable at all.
- **`-o` was accepted, ignored, and the prompt went to stdout.** The parser
  rewrites `-o` to `out`, so `stringFlag(args, 'o')` can never match. **The same
  dead read had been sitting in `baseline`** as a fallback that could not fire.
- **A guard read a whole page instead of its own section.** Chapter one's slot
  table check harvested every backticked cell in `docs/prompt-writer.md`, and
  reported three slots that do not exist the moment the page gained a second
  table. *Bound an assertion by its subject, never by its neighbour* — a rule
  this repository wrote down and a helper it already had.

### What this release found wrong in itself

The chapter that measured the writer's cleanliness swept `safe`, `balanced` and
`aggressive` and called it "all three levels". **There are two**, and `balanced`
silently ran `safe`, so it measured the same level twice. The zero survived the
correction; the sentence did not, and the sweep now comes from `RULE_LEVELS`
rather than a list typed into a test.

And CI caught the section-bounding defect when a local run should have:
`npm run verify` went green, *then* the page gained a table, *then* the commit
went out. The run was of the code and not of the change.

---

## 1.60.3 — "A document nobody lists"

**Two chapters, one shape.** `docs/json-output.md` calls itself the contract;
`docs/format.md` is the index a connector author works from. Between them they
specify every document Trazum emits — and between them, six contracts had no
guard at all and three documents were on neither list. The second is a
consequence of the first, which is why they ship together: **a document nobody
lists is a document nobody checks.**

### Six of fifteen contracts had no guard, and two of them had drifted

`docs/json-output.md` opens by calling itself the contract, and its second
sentence named **one** test file. The file specifies **fifteen** documents. Nine
were genuinely harvested by a parity check somewhere in this repository; six
were not, and **nothing anywhere recorded which was which**.

**The roll-up documented three of its nineteen top-level fields.** `trazum
rollup --json` emits the merged bill, both periods, the duplicate and overlap
findings and the typed caveats; the table listed `schemaVersion`, `contributors`
and `rejected`. Absent: `total`, `unpriced`, `unpricedModels`, `byLabel`,
`byModel`, `byLabelAndModel`, `spendByDay`, `span`, `claimedSpan`,
`fieldCoverage`, `outcomeTally`, `duplicateLines`, `identicalContributions`,
`repeatedContributors`, `notMerged` and `cannotSay`. `notMerged` sat beside a
documented `rejected` — a reader handling one would have missed the other, and
they mean different things: a contribution refused, against **a finding that
cannot survive a merge**.

All sixteen are documented now, and the rows carry the refusals rather than only
the arithmetic: a shared day's dearest label is null because no document carries
per-label-per-day spend; `claimedSpan` stays apart from `span` because one is
what the records showed and the other is what somebody went looking for; the
repeats are named and never subtracted.

**The fleet document never mentioned `schemaVersion`** — the one field this
file's own promise section calls *the only thing you must branch on*.

**The guard puts the inventory next to the promise.** It takes every heading in
`docs/json-output.md` whose section carries a field table, matches each against
the test that harvests it, and fails on a table nobody claims *and* on a claim
for a table that is gone. A claim is not taken on trust: the file named has to
pass the heading to a call, because **a heading in a comment is not
enforcement**. It also walks all three packages' test directories for harvests
the map does not know about — the direction that would have caught the six. The
six are now held both ways **by running the command**, or the library function
for the outcome report, which no command emits.

### The index undercounted by three, and the guard on its count agreed with it

`docs/format.md`'s first sentence said Trazum emits **twelve** documents and
defines a thirteenth. `README.md` said the same. Three documents were on neither
list: `trazum pulse --json`, `trazum rules --measure --json`, and the gateway's
**HTTP 402** refusal body — each with a contract table, a `schemaVersion` and
something that emits it. A connector author working from that page would not
have known they exist.

**The count was already guarded.** It has been held to the table beneath it
since the day it said *seven* with ten rows, and it derives the ordinal rather
than typing it. It could not have caught these three: **both halves of that
comparison are written by hand**, so a document missing from the table and
missing from the sentence leaves the two in perfect agreement. The missing half
was never the arithmetic — it was the table against the contracts that exist.

Fifteen emitted and a sixteenth defined, in both pages. The list is derived from
the contract tables that exist and matched against the index **by the anchors
its rows link to**; `README.md` is held to the same count; the `--contract`
column is compared to what the CLI accepts **as a set**, since the existing
checks are satisfied by a name appearing in prose; and the plan — the one
contract documented twice, in `json-output.md` and `plan-format.md` — has its
two tables held to each other.

### Both guards were proved by breaking them, and proved not to fire on anything else

Dropping a row, renaming a documented field, removing a claim, pointing a claim
at a file that does not harvest it, misspelling a `--contract` cell, putting
`README.md` back to twelve, making the plan's two tables disagree: each fails.
Adding a prose-only section, reordering the map, rewording a "Written by" cell:
each stays green. The anchor rule is unit-checked on the case it has to get
right — ``## The `--by-source` document`` becoming `the---by-source-document`,
backticks gone and dashes kept — because a slug rule quietly disagreeing with
GitHub's would report every row as missing, or none.

### What this release found wrong in itself

The first draft of the second chapter claimed the count had no guard. It had
one, it fired correctly on the row it could see, and its word list simply
stopped at fifteen. The finding is better for it: the defect was never a missing
check, it was **a check whose two halves were both written by hand**.

---

## 1.60.2 — "Checked by running"

**A patch, and every entry in it is the same act.** With the plan finished as far
as it can go — six of nine arcs, three open and named — the work is taking a
claim this project makes about itself, asking what enforces it, and measuring by
running rather than by reading. Four findings. One reached installable code.

### The one that reached installable code

**The profile was the only contract of the ten whose `schemaVersion` was stamped
by the CLI.** `docs/format.md` promises every document carries it and `conform`
rejects one that does not — so `profileUsage()`, the function in the package
whose whole job is emitting this format, returned a document `trazum conform`
refuses. Anybody writing a connector against `@trazum/core` would have found out
from a rejection.

**Nothing could have caught it from inside.** Every test that checked a profile
against the contract added `schemaVersion` first, because that is what the CLI
does, and a fixture built the way the CLI builds it can never catch the CLI doing
the work.

It is stamped by `profileUsage` now, where every other builder stamps its own.
The CLI's stamp is gone and **the compiler flagged it as redundant**, which is the
change proving itself. The new guard hands every document the package can build
from its own exports straight to its own checker, and **names the eight contracts
it cannot reach** — two documents checking out is not the format checking out.

### The two rules `ROADMAP.md` opens with are now checked by running

**"A locale changes the report, never the optimisation"** was enforced by a
single English sentence in two locales. It is now a sweep: the corpus read off
disk — **35 prompts**, prose in seven languages — and the locales read off
`LOCALES`, every prompt at both levels in every locale, comparing the optimised
text, every token figure, every rule id with its hits and saving, and every
advisory id. **And the opposite direction**, because a build returning the English
report for every locale would satisfy all of that: somewhere a rule fires and its
title has to come back different.

**"The deterministic core stays free and offline"** was enforced by two checks
and neither ran the command — one requires every network-capable module to be
named in the prose, the other scans `packages/core/src` for `fetch`. Both are
source-level; the CLI is in neither. `fetch` is now replaced with a thrower
before the CLI loads, and `optimize`, `check` and `rules` have to work with it
gone, with the report **byte-identical** to a run with the network intact. **And
the stub is proved to bite**: `--pricing-live` under the same stub must fail
carrying the stub's own marker, or none of the rest proves anything.

### A guard that asserted padding and called it format

`transcript-format.test.js` compared the `~ ` before a money figure in the
`trazum doctor` transcript. That space is **right-alignment** — the command prints
`~ $10.59`, `~  $8.82` and `~$0.5300` in one column — so the check agreed or
disagreed on how wide this repository's own figures happened to be, and broke on
a config change that never touched the README. Four releases.

It now measures what the column promises: the text starts at the same offset on
every row, priced or not, measured on both sides. **And the defect it was written
for was real** — the transcript's unpriced rows sat one column left of the priced
ones, on a page headed *Real output, transcribed*.

### A rule joined the doctrine

*And prove it does not fire on anything else* — the half of the guard rule that
keeps being skipped because the first half passed. A guard that fails on its
defect *and* on things that are not its defect gets deleted after enough false
alarms, and by then nobody remembers whether it was ever right. Two instances on
this project's record, both a proxy that correlated with the property until it
did not.

### What this release found wrong in itself

Everything above, and one more: **#359's changelog entry named one guard where
two existed**, understating what was already there and overstating what the new
one added. Corrected in `Unreleased` before it could reach a release, by taking
the same lens to the previous chapter.

---

## 1.60.1 — "What else does this fail on"

**A patch, and nothing installable changed.** The arcs are done as far as they
can go — six of nine, with the other three open and named — so this is the
honest shape of the work that follows a plan: a guard that was checking the
wrong thing, the document it was supposed to be checking, and the rule that
would have caught both.

### A guard asserted padding and called it format

`transcript-format.test.js` checks that the README's `trazum doctor` transcript
writes its money column the way the command does. It did that by taking the `~ `
prefix off the **first** money line of a live run and requiring every transcript
line to use the same one.

**That space is right-alignment, not format.** The command prints all three of
these in one column:

```
  ~ $10.59  This task may not need Claude Opus 5  2 prompts
  ~  $8.82  If the work tolerates latency, use the Batch API  2 prompts
  ~$0.5300  The output schema could travel in the request instead of the prompt  2 prompts
```

`$0.5300` is two characters wider than `$8.82`, so the padding differs. The guard
therefore agreed or disagreed on how wide **this repository's own figures**
happened to be — and it broke on a config change that never touched the README.

It now measures what the column actually promises: **the text starts at the same
offset on every row, priced or not.** Both sides are measured, each bounded to its
own advisory block, with the command's block as the yardstick.

### And the defect it was written for was real

| | Priced rows | Unpriced rows |
|---|---|---|
| `doctor` | text at column 12 | text at column **12** |
| README transcript | text at column 12 | text at column **11** |

*Below the cacheable minimum* sat one space left of the priced rows above it, on
a page headed *Real output, transcribed*. Found by measuring both, not by reading
either.

### A rule joined the doctrine, and it is the other half of one already there

*Prove a guard by breaking it* has been on that list for arcs. The half nobody
writes down is **and prove it does not fire on anything else**. A guard that
fails on its defect *and* on things that are not its defect gets deleted after
enough false alarms, and by then nobody remembers whether it was ever right.

Two instances on this project's record, the same shape both times — a proxy that
correlated with the property until it did not:

- A `docs/releasing.md` guard that matched every quantity word near "manifest" or
  "upload" and failed **two correct sentences**. It never merged, because it was
  run against the real document rather than only against the defect.
- The padding-versus-format guard above. **Four releases.**

The question that catches it is not *does this fail on the bug*. It is **what
else does this fail on** — and the cheap way to answer is to run the finished
check against the real thing, whole.

### What this release found wrong in itself

Both of the above: a guard that had been checking the wrong thing for four
releases, and the misaligned transcript it was supposed to be checking. Neither
was found by reading; both were found by measuring the command and the document
and comparing the numbers.

---

## 1.60.0 — "Our own medicine, measured"

**A minor closes an arc, and this closes the last arc the 1.52–1.60 plan named.**
It does not close the plan. 1.54.0 and 1.57.0 are blocked on provider credentials
this repository does not have; 1.58.0 is an editor extension, a distribution
commitment rather than a feature. **Six of the nine arcs are delivered and the
other three stay open and named** — the plan's own answer to an arc it cannot
build, rather than renumbering the gap away.

The arc's thesis was written down before the code: *make at least one of three
admissions about this project no longer true, with a measurement rather than an
argument — and if it cannot, say so and close on the number it could not
produce.*

### The scoreboard, which is the deliverable

| Admission | After the arc |
|---|---|
| The record is self-reported | **No longer true** — five defects were found by CodeQL and by nothing here |
| No outcome is recorded for any of it | **Weakened** — one outcome on the record |
| This project has no usage log of its own | **Still true, in full** |

**One of three.** Less than the arc hoped for and exactly what it committed to
report.

### Five defects on the record were found by an outside instrument

In 1.8.0, 1.46.0, 1.50.3, 1.53.4 and 1.55.0 — and not one by a test in this
repository. Tabulated on [our own medicine](docs/our-own-medicine.md) with what
each found: an SSRF where a validated URL and a fetched URL were different
expressions, a time-of-check/time-of-use race on a size bound, two unanchored
host patterns a lookalike domain satisfies, a ReDoS in a guard this project had
just written whose own proof would have passed against the vulnerable version,
and a file-system race on the pull request that introduced it.

**The 1.8.0 entry carries the weight**: CodeQL kept that alert open **twice**,
against this project's judgement, and was right both times. A self-report cannot
contain that shape by definition.

**What it does not establish is written beside it.** CodeQL is not an independent
audit — it runs because this project turned it on and would stop the day somebody
deleted a workflow. It is an outside instrument whose rules this project did not
write and cannot argue with, which is narrower and is what was actually measured.

### The tokens this project puts on your bill, counted for the first time

Four system prompts ship inside `@trazum/core` and are sent to a model on every
`--llm`, `--suggest`, `--semantic` and examples-review run — on your key, on your
bill, before a single token of your own prompt is counted. A tool that reports
other people's prompt cost and had never counted its own is the self-report
problem in its most literal form.

| Prompt | Tokens | Recovered |
|---|---|---|
| `suggest` | 291 | 2 |
| `semantic` | 382 | 4 |
| `refiner` | 198 | 0 |
| `example-review` | 305 | 0 |

**1176 tokens, and this project's own rules recover 6 — half a per cent.** Eleven
of the twelve rules are inert on all four. The honest reading is not that the
rules are bad: these are prompts written to be read by a model, with no
politeness, no hedging and nothing repeated, which is the shape the dictionaries
have nothing to say about.

**The uncomfortable arithmetic is published rather than left to a sceptic.** At
about one per cent recovered, any prompt under roughly thirty thousand tokens
costs more in this project's own instructions on a single `--suggest` run than
the rules recover from it. Different budgets — a per-call cost you opt into
against a saving on every call forever — and the first thing a sceptical reader
would compute.

**This is the outcome that weakened the second admission**, and its limits are on
the page: nothing about whether users benefit, nothing about the model-side passes
those tokens buy, and still self-reported.

### The loop this product sells was inert in the repository that sells it

`trazum init` writes a config. `trazum baseline` records what a repository's
prompts cost. `trazum check` fails a build when they grow. All three shipped arcs
ago, all three are what [docs/ci.md](docs/ci.md) tells other people to run — and
**this repository had no config and no baseline of its own.**

Both are committed now, CI runs the gate, and the gate was proved by growing the
prompts past the limit in a scratch copy and watching it exit 1.

### `ignore` — a new config key

```json
{ "extensions": [".txt"], "ignore": ["**/fixtures/**", "**/corpus/**"] }
```

The companion to `extensions`, and the feature that had to exist before any of the
above was possible. Directory mode decided what a prompt was from the extension
alone, so a repository with a corpus of `.txt` files got every fixture walked,
budgeted and baselined, and there was no way to say otherwise.

Globs relative to the walk root. **A matched directory is not descended into at
all**, so an ignored tree costs one comparison rather than one per file in it. A
pattern that climbs out of the project with `..`, or an absolute one, is refused
the way a budget pattern is — on a pull request the config comes from whoever
opened it. Threaded through every walk that already consulted `extensions`,
because the two halves of *what counts as a prompt here* disagreeing is the same
defect one layer down.

### Why the third admission stands

This project would have to spend money on models and record what it spent, and
**it does not spend**: the deterministic path makes no calls at all, and the
model-side passes run on the user's key. What could be counted is the cost it
*imposes*, which is counted above under a heading that says it is a different
sentence. Merging the two would have been this document's own first doctrine rule
broken on its own page.

### Why the second is only weakened, and what was refused

*Whether it helps* needs somebody it helped, and there is no such person on this
record.

*Whether it is used* had one available instrument and **it was refused, on the
record**: npm download counts are fetches, not uses — mirrors, CI runners and bots
are in the total, so the figure bounds **above** and nothing bounds below. `A
floor can prove "over" and can never prove "under"` is on this project's own
doctrine list; quoting a ceiling as evidence of adoption is that rule inverted. A
number nobody can check is worse here than a gap that is named.

### What this release found wrong in itself

Four things, and the first is the worst kind:

- **A gate flag that silently gates nothing.** `check --baseline` against a config
  with no `baseline` block prints nothing about the baseline and exits 0 — the
  flag is read as `config.baseline !== undefined && boolFlag(...)`, so a missing
  block *disables* the gate instead of failing the run. A green build, from a
  command invoked with the flag that asks for the check. Found the first time the
  CLI was pointed at this repository.
- **The reason no baseline was ever committed here.** At the root with the default
  extensions, `trazum baseline` records **74 prompts and 509,255 tokens** — README,
  changelog, roadmap — plus 35 test fixtures.
- **Three derived guards had to fail before the documentation caught up.** `ignore`
  was missing from the README, from the CLI help in both locales, and from the
  skill's config table; each has a test deriving the key list from the schema, and
  each failed until it was written.
- **The prompts this project ships to models live inside `.ts`**, where the
  baseline gate cannot see them at all. Their cost is measured and guarded by a
  test instead, because the product's own mechanism cannot reach them. Named
  rather than papered over.

### Guards

- The published per-prompt figures are checked against what the optimiser
  produces, and the four prompts are derived from the package's own exports, so a
  fifth shipped unmeasured fails the build.
- The committed baseline is checked against the tree file by file; the config's
  `baseline` block is asserted present; the workflow is asserted to still carry
  the step; and the gate is run against a scratch copy grown past the limit.
- The scoreboard is graded against the page — exactly three admissions, exactly
  one fallen, and the two that stand still stated below.
- Every one of those is proved against fabricated input: a fifth export, a
  drifted row, a table claiming two admissions fell, a dictionary with an orphaned
  entry, and a release with nothing external in it.

---

## 1.59.0 — "A language needs a maintainer"

**A minor closes an arc, and this one closes out of order.** 1.57.0 and 1.58.0
stay open: 1.57's remaining chapter needs a provider credential this repository
does not have, and 1.58 is an editor extension — a distribution commitment rather
than a feature. An arc that can be finished is worth more than a slot left idle
waiting for one, the same call 1.55.0 made. The gaps stay gaps rather than being
renumbered away.

**The arc asked for one thing**: make the maintainer requirement a real,
documented role with a real bar, and then admit that whether it lands is not a
scheduling question. It deliberately did not ask for an eighth language, and does
not deliver one.

### The five dictionaries nobody here reads, named where it matters

Trazum's trimming dictionaries cover seven languages. Two are languages this
project reports in, which is the only evidence in this repository that anybody
here reads them. For French, German, Portuguese, Italian and Dutch, nothing says
a speaker ever agreed that removing an entry leaves the prompt asking for the
same thing.

**Two branches say so, and they are different claims.** When no rule fires:

```
No rule found anything to trim.
The phrase dictionaries cover English, Spanish, French, German, Portuguese,
Italian and Dutch. A prompt in another language is not necessarily efficient —
it may just be one Trazum cannot read yet.
Of those, French, German, Portuguese, Italian and Dutch carry entries nobody
here reads: written by the same process that wrote the rules, never agreed by a
speaker of the language.
```

And when a rule **does** fire on a prompt whose own language is one of the five —
the branch that matters most, because there the tool has just applied an
unverified judgement to somebody's text:

```
Rules applied
  These changes came from the Dutch dictionary, which nobody here reads. Its
  entries were written by the same process that wrote the rules and never agreed
  by a speaker — read the diff before trusting it.
  [safe] Filler and throat-clearing (4×, ~29 tokens)
```

That second line is gated on the prompt's own detected language, so an English or
Spanish prompt never sees it and it never becomes a footer. `detectTextLanguage`
answers `null` on a prompt too short or too mixed to place, and it stays silent
then: not-detected is not not-unreviewed, but guessing a language in order to warn
about it would put a Dutch warning on a Portuguese prompt.

**`DICTIONARY_STANDING`** is the record behind both — `reviewed` or `unreviewed`
per language, with what was actually done to the entries. Exported from
`@trazum/core` with `dictionaryStanding(code)` and
`languagesWithStanding(codes, standing)`.

**Nothing is deleted.** A Dutch prompt is better served by a dictionary that fires
and says it was never reviewed than by silence that reads as *your prompt is
already efficient*.

### [docs/language-maintainer.md](docs/language-maintainer.md) — the role, with a bar

What a maintainer decides, which is not "is this the right translation": whether
removing an entry leaves the prompt asking for the same thing, whether a word is
doing a second job, whether the phrase gets written at all, whether an output cue
means what the catalogue says, and where the language makes this analysis wrong.

What is asked — a bounded commitment, because an unbounded one gets declined by
exactly the people worth having — and what is deliberately **not** asked:
availability, a response time, or ownership of anything outside the dictionary.

What happens when nobody holds it: the language stays, its record says
`unreviewed`, and nothing pretends otherwise. If a maintainer stops, the record
goes back on the day they say so — not silently, and not on a guess about how long
is too long.

### `node scripts/dictionary-worklist.mjs <lang> [--json]`

The worklist that role asks for, printed. Until this existed the request could not
be scoped: the entries live in one flat array per rule with a `// Dutch` comment
marking where each language starts, so a prospective maintainer had to read
`phrases.ts` to find out how much they were agreeing to.

```
Dutch: 30 entries across 6 rules

verbose-phrases (10)
  met het doel om → om
  vanwege het feit dat → omdat
  …
politeness (6)
  alsjeblieft → (deleted)
```

A replacement and a deletion read differently on purpose: one asks *is the short
form the same instruction*, the other asks *does the prompt survive losing this at
all*. `--json` emits the same thing for a tool.

**Two things the counting found.** The maintainer page said "a few hundred short
phrases" and it is **thirty to thirty-eight** — an afternoon, not a project, and
the figure was wrong in the direction that discourages volunteers. And English has
89 entries against Spanish's 81, so the five unreviewed dictionaries are also less
than half the size of the two somebody read; recorded on the page and not
addressed.

### A rule joined the doctrine, and no test can enforce it

*A rule you wrote for yourself is a claim like any other.* The rules in
[the doctrine](docs/doctrine.md) are enforced by tests because a rule with nothing
checking it drifts as fast as a number with nothing checking it. **The ones about
your own conduct drift faster**, because a test asserts what the code does and
nothing asserts that the project still does what it said it would.

The cheapest available check is written down beside it: put the promise next to
the inventory. This one was found exactly that way.

### What this release found wrong in itself

**A rule this project wrote for itself, and then broke.** *A dictionary is a
judgement about a language and this project will not make it in a language nobody
here reads* was held up for several arcs as the reason an eighth language was not
scheduled, while five dictionaries no speaker had read were already shipping —
**since they shipped**. Every other row on *what we got wrong, in public* is a
claim nothing checked; this one is a rule and a catalogue, each correct alone,
disagreeing with each other. No guard catches that shape.

**And the page written to fix it overstated the work by an order of magnitude**,
two chapters before something counted the entries.

**And the worklist script printed an EPIPE stack trace** when piped into `head`,
which is what its own documented usage invites. Found by running it.

### Guards

Derived rather than written, because a list that agrees with itself proves
nothing:

- The `reviewed` set is read **off the report catalogues on disk**, so a French
  report translation fails the build until somebody decides what it means for the
  French dictionary.
- The worklist is checked against a **second, different parse** of the same file:
  it slices between language markers, the guard counts the whole array, and they
  must agree. An entry above the first marker appears on nobody's worklist and
  still edits prompts.
- The five counts the maintainer page quotes are checked against what the script
  produces, so the number a volunteer is shown cannot drift from the work.
- Every one of those is proved against a fabricated table, a fabricated
  dictionary with an orphaned entry, and a page with a language quietly dropped.

---

## 1.56.2 — "What this project was claiming about itself"

**A patch, and no new command.** A minor closes an arc; two arcs each gained
their first chapter here and neither is closed. Both chapters are the same act
done twice: a sentence this project had been saying about itself turned out to
be wrong, and was measured rather than argued with.

### Five of the seven phrase dictionaries were never read by anybody who speaks the language

The dictionaries cover English, Spanish, French, German, Portuguese, Italian and
Dutch, and when no rule fired the report named all seven in one sentence. That
reads as seven dictionaries of equal standing.

Two of them are languages Trazum reports in, which is the only evidence in this
repository that anybody here reads them. For the other five, nothing says a
speaker ever agreed that removing an entry leaves the prompt asking for the same
thing.

**The roadmap had been saying the opposite for several arcs.** An eighth language
was held back on the stated grounds that a dictionary is a judgement about a
language and this project will not make it in a language nobody here reads.
Seven dictionaries shipped anyway, and the catalogue is the one users meet.

**What the report prints now**, on the branch where an empty result would
otherwise reassure, in both report languages:

```
No rule found anything to trim.
The phrase dictionaries cover English, Spanish, French, German, Portuguese,
Italian and Dutch. A prompt in another language is not necessarily efficient —
it may just be one Trazum cannot read yet.
Of those, French, German, Portuguese, Italian and Dutch carry entries nobody
here reads: written by the same process that wrote the rules, never agreed by a
speaker of the language.
```

Its own line rather than a qualifier folded into the first, so the day somebody
maintains all seven it is deleted rather than reworded. It does not print when a
rule did fire: the admission belongs to the branch where silence misleads, and a
line under every report is a footer people learn to skip.

**`DICTIONARY_STANDING`** is the record behind it — `reviewed` or `unreviewed`
per language, with what was actually done to the entries in each case. Exported
from `@trazum/core` along with `dictionaryStanding(code)` and
`languagesWithStanding(codes, standing)`.

**The evidence that reading a list is not enough is a bug already on this
project's record.** `INTENSIFIERS` shipped `molto`, `muito` and `heel`, each an
intensifier *and* a quantifier, so *you have much time* became *you have time* in
three languages at once. Spanish avoids exactly that trap — `muy` yes, `mucho`
no — because somebody who speaks Spanish wrote it. The three were caught by
running prompts through the rules, which is a far weaker instrument than a
speaker. One bug found by the weaker instrument is not a review.

**Nothing is deleted.** A Dutch prompt is better served by a dictionary that
fires and says it was never reviewed than by silence.

### [docs/language-maintainer.md](docs/language-maintainer.md) — the role, with a bar

What a maintainer actually decides, which is not "is this the right
translation": whether removing an entry leaves the prompt asking for the same
thing, whether a word is doing a second job, whether the phrase gets written at
all, whether an output cue means what the catalogue says, and where the language
makes this analysis wrong.

What is asked — a bounded commitment, because an unbounded one gets declined by
exactly the people worth having — and what is deliberately **not** asked:
availability, a response time, or ownership of anything outside the dictionary.

And what happens when nobody holds it: the language stays, its record says
`unreviewed`, and nothing pretends otherwise. **This page does not promise an
eighth language.** Whether the role is ever filled is not a scheduling question,
and the page closes on that rather than on a plan.

### One of the three things this project could not say about itself is no longer true

[docs/our-own-medicine.md](docs/our-own-medicine.md) ends by listing what this
project cannot say about itself. Arc 1.60 asks for at least one of them to fall
to a measurement rather than an argument. The third was *"every miss above was
found and written down by the same process that made it"*.

**Five defects on the record were found by CodeQL** — in 1.8.0, 1.46.0, 1.50.3,
1.53.4 and 1.55.0 — and not one by a test in this repository. They are tabulated
with what each found: an SSRF where a validated URL and a fetched URL were
different expressions, a time-of-check/time-of-use race on a size bound, two
unanchored host patterns a lookalike domain satisfies, a ReDoS in a guard this
project had just written whose own proof would have passed against the vulnerable
version, and a file-system race on the pull request that introduced it.

**The 1.8.0 entry carries the weight**: CodeQL kept that alert open twice,
against this project's judgement, and was right both times. A self-report cannot
contain that shape by definition.

**What it does not establish is written beside it.** CodeQL is not an independent
audit — it runs because this project turned it on and would stop the day somebody
here deleted a workflow. It is an outside instrument whose rules this project did
not write and cannot argue with, which is narrower than "somebody audited us" and
is what was actually measured. The other two admissions — no usage log of its
own, no outcome recorded for any of its work — are untouched.

### What this release found wrong in itself

**A rule this project wrote for itself, and then broke.** Every other row on
*what we got wrong, in public* is a claim nothing checked — a version number in
prose, a count stated twice in two different nouns. This one is different and
worse: the rule was *a dictionary is a judgement about a language and this
project will not make it in a language nobody here reads*, held up for several
arcs as the reason an eighth language was not scheduled, while five dictionaries
no speaker had read were already shipping. **Since they shipped**, and no guard
catches that shape — only re-reading the rule against the catalogue does.

**And a second, found while cutting this release.** `docs/releasing.md` step 3
listed the `@trazum/core` dependency as living in `packages/cli` and
`packages/mcp`. It is in **three** places — `apps/web` pins it too — so anybody
following the recipe left the web app resolving a registry copy of the previous
version instead of the workspace. `publish.test.js` caught it here, which is why
it is a paragraph rather than a released defect, and the recipe now says three.

### Guards

Derived rather than written, because a list that agrees with itself proves
nothing:

- The `reviewed` set is read **off the report catalogues on disk**, so a French
  report translation fails the build until somebody decides what it means for the
  French dictionary.
- `docs/language-maintainer.md` is checked against the code's unreviewed set and
  its count, not against a hand-kept list.
- The releases named as outside findings are checked to actually mention CodeQL
  in their own notes, so the claim cannot grow past its evidence.
- Every one of those is proved against a fabricated table, a page with a language
  quietly dropped, and a release with nothing external in it — a check that only
  ever sees today's correct values cannot fire.

---

## 1.56.1 — "What the rules actually do"

**A patch, and the number is the honest one.** A minor closes an arc; the arc in
progress is 1.57 — *the optimiser earns its name again* — and its thesis is what
belongs on the model's side of the line. Nothing here answers that. What is here
is the groundwork the arc could not proceed without.

The README says plainly that the deterministic rules recover about one per cent,
and that is the fair complaint about this tool. It is also an **aggregate**,
equally consistent with every rule pulling its weight and with two rules doing
all of it beside five that have never changed a byte of anybody's prompt. Nobody
here had measured which.

### `trazum rules --measure <dir> [--level <safe|aggressive>] [--json]`

Runs the optimiser once with each rule **alone** and once with each rule
**removed**, over prompts you actually have.

```
What each rule recovers in . — 2 prompts, level aggressive
  403 tokens before. The rules recover 68; normalisation recovers 2 whether a
  rule is enabled or not, and that is not the rules' work.

  verbose-phrases        lost if removed     16   alone     16   1 prompt
  filler                 lost if removed      9   alone      9   1 prompt
  duplicate-blocks       lost if removed      0   alone     40   1 prompt
  near-duplicate-blocks  lost if removed      0   alone     40   1 prompt
  duplicate-lines        lost if removed      0   alone     40   1 prompt
```

**Both figures, never added together.** They diverge exactly where rules
overlap, and the three above are the case: each recovers forty tokens alone and
nothing at the margin, because the other two still find it. `alone` by itself
makes an overlapping rule look load-bearing; `marginal` by itself makes it look
inert. `sumOfAlone` sits beside `tokensSaved` and **the gap is stated as the
overlap rather than resolved into a total** — a single figure there is the one
number that cannot be true.

**The floor is separated out, and finding that was the point.** The optimiser
normalises whitespace whether or not a rule is enabled. The first version of
this measurement credited that to the rules, and over this repository's
tokenizer corpus it reported that the optimiser saved twenty-one tokens and that
every rule was redundant — a sentence assembled entirely out of somebody else's
arithmetic.

**Inert is always said about the corpus.** A rule that finds nothing in a set of
files has not been shown to find nothing anywhere, and the difference is the
whole distance between "delete this rule" and "measure it on something else".

Emitted as the **rule-yield document** under `--json`, contracted in
[docs/json-output.md](docs/json-output.md).

### A corpus that exercises every rule

`--measure` could only ever answer "inert here", because nothing in this
repository contained what most rules look for. Twelve fixtures now do — one per
rule, each a short realistic prompt carrying exactly what that rule is written
to find. The guard is **derived from the rule catalogue**, so a rule added
without a fixture fails the build rather than joining a list nobody reads.

**Building it split one field in two.** `inertHere` was "saved nothing", which
quietly merged *never fired* with *fired and recovered nothing*. Those look
identical in a saving column and mean opposite things: the first is a fact about
the corpus, the second a finding about the rule. `emphasis` is the case — it
lowercases shouted words, so the prompt changes, the instruction changes, and
the token count does not move. It now lands in `firedWithoutSavingHere`, which
the terminal prints **first**, because a reader who meets the two the other way
round reads both as the same shrug.

The fixture guard asserts **firing**, not saving, for the same reason: asserting
a saving would have marked a working rule as broken.

### The rule order, and what it decides

The measurement showed three deletion rules each recovering the same tokens,
which looked like a defect worth chasing. Measured, it is not one: a repeated
stanza is a repeated *block* and also a set of repeated *lines*, all three can
find it, and whichever runs first takes it. The applied run credits exactly one
rule; the leave-one-out measurement credits all three because each *would* have
caught it alone. Different questions, both answered correctly.

**What had no guard was the consequence.** Coarsest-first means the same saving
is reported as *one repeated paragraph* instead of *three repeated lines* — a
sentence somebody can act on instead of three they have to reassemble — and the
only reason written down for that order was that block deletions leave less text
for the rest to walk. A reorder would have changed what every user reads while
every number stayed identical and no test noticed. The order is pinned now,
adjacency included.

### Fixed

**`rules --measure <dir>` never put the root back on.** The walk returns names
relative to its root and the command read them bare, so it worked only from a
run whose working directory happened to be the root — which is the one case a
first probe uses. `--measure .` passed; `--measure some/dir` threw `ENOENT`.

**A fixture that exercised the wrong rule.** The first near-duplicate fixture
differed in two words and `duplicate-lines` claimed it instead. A fixture that
exercises the wrong rule is worse than no fixture, because the guard goes green.

### What this release still cannot do

- **It does not answer the arc's question.** What belongs on the model's side of
  the line is still open, and the bar the semantic pass set — a finding a
  dictionary cannot make, verified before it is offered, never applied silently
  — is still the bar. This release only makes the dictionary side legible enough
  to argue about.
- **The remaining chapter needs a credential this work did not have.** Designing
  a model-side candidate that has never been run against a model is the
  measure-by-reading this repository refuses everywhere else, so it is named as
  blocked rather than half-built — the same treatment 1.54.0 gets, and for the
  same reason.
- **Every figure carries the estimator's band.** The counter is named in the
  report because a rule whose yield is a handful of tokens is inside the noise,
  and nothing here pretends otherwise.
- **It measures your prompts, not prompts in general.** Every verdict in the
  document says "here", and the corpus in this repository is twelve fixtures
  written to exercise twelve rules — not a sample of how anybody writes.

---

## 1.56.0 — "Something that runs"

**The arc asked whether alerting can be given without becoming a hosted service
holding other teams' metrics**, and said that if the answer turned out to be no,
the deliverable was that sentence with its reasoning.

The answer is **yes for the noticing, no for the last hop**, and what shipped is
not a runtime at all. Three pieces, and every one of them exists because a
scheduled job that stopped does not announce itself — it just goes quiet, and a
tool that cannot tell quiet from stopped is a tool nobody should trust with an
alert.

### `history` names the calendar time no report covers

A cron that died three weeks ago produces a series that looks exactly like a
shorter one. Until this release nothing could tell a reader which they were
looking at.

`unmeasured[]` carries every stretch between the first report's start and the
last one's end that **no report covers** — the days, the instants, and the
reports either side. It is arithmetic on the spans and **never an inference
about a schedule**: this module has no idea how often anybody meant to run
anything, and guessing a cadence in order to call a gap *late* would be the tool
deciding what somebody's routine is.

**And the caveat travels on the finding.** A run is consecutive *reports* and
read as consecutive *time*: four rising periods with an unmeasured fortnight
between the second and the third was reported as "climbing for four periods",
when the climb may have reversed and come back inside the hole. Each run now
carries `unmeasuredDays`, printed on the run's own line — a caveat one section
away arrives after the reader has already formed the sentence.

`overlappingReports[]` names two reports covering some of the same days. This
command never sums across periods, but a reader with the document in a
spreadsheet will, and two exports over the same fortnight count it twice. Named
and never merged: which of the two is the better measurement is not knowable
from here.

A gap shorter than a whole day is not reported — that is the seam between two
adjacent exports — and days are floored, so a gap called three days is at least
three days.

### `trazum pulse [--max-stale-hours <n>] [--json]` — new command

`watch --once` is built for a scheduler: a cron entry is the whole daemon, and
its state file records each cycle precisely so a restart is honest about the
stretch it did not watch. **That file was read by exactly one thing, and that
thing was the next cycle.**

So nothing could tell you the watcher had stopped, because the thing that would
tell you was the thing that stopped.

```
Did the things that are supposed to run, run?
  ✗ last watch cycle: 2026-08-19 23:10Z, 50 hours ago
  ✓ last pull into the store: 2026-08-21 23:10Z, 2 hours ago
  measurements reach up to: 2026-08-20 01:10Z, 48 hours ago

  Something that runs here has not run in over 36 hours. Silence from a
    scheduled job and silence from a job with nothing to report look
    identical; this is which.
```

**It runs nothing and hosts nothing.** Something has to notice, and the
something is already in your CI: a step running this on the schedule you already
have turns a dead cron into a red build, without Trazum holding anybody's
metrics.

**Three refusals:**

- **A first run that never happened is not late.** There is no cadence to be
  late against, so `never-run` is its own verdict and never gates. A check that
  fired on "you have not adopted this feature" would be nagging, not measuring.
- **No threshold, no verdict.** Without `--max-stale-hours` the ages are
  reported and nothing is judged, and the rendering says so out loud — a screen
  with no threshold behind it is the shape somebody reads as "checked".
- **How far the measurements reach is never judged by the same threshold.** A
  store pulled ten minutes ago whose newest record stops two days back is a
  healthy job in front of a provider that reports late. Gating on it would be a
  red build for somebody else's latency.

It does not fire on the threshold itself, only past it; a future instant is no
age rather than a negative one; and ages are floored.

### `docs/running.md` — the reasoning, the recipes, and where they run out

What actually has to run, and why the four jobs are kept separate — a single
"run everything" command would hide which of them stopped. Recipes for **cron**,
**systemd timers**, **GitHub Actions** and **Windows Task Scheduler**, each one
a command this repository actually accepts. Where the credential lives on each
platform, and why Trazum adds no new place for a key to sit.

Every command in the recipes was run against the build rather than recalled, and
two claims were wrong until that happened: the Actions recipe cited a checkout
version this repository does not use, and the page named one credential variable
where the connector accepts two.

And a section on **where this answer runs out**, because a page that only listed
what works would be advertising. A laptop is not a scheduler. The last hop is
still the reader's — Trazum cannot page anybody, retry a delivery, deduplicate
across channels or know somebody is on holiday, which is what a hosted alerting
product is actually selling. A watcher can only judge what has been pulled. And
nothing here watches the watcher's watcher, because the chain has to end at the
thing the reader already trusts to tell them when it breaks.

### Fixed

**A whole class of flag defect is now guarded.** `--max-stale-hours 36` shipped,
built, ran, printed a full report and **gated on nothing**: the flag was not in
`VALUE_FLAGS`, so it parsed as a boolean and `36` became a positional argument.
Nothing failed anywhere, and a test that only checked the command printed would
have passed. The rule is derivable, so it is derived — anything read with
`stringFlag` or `numberFlag` takes a value by definition — and it is proved
against the exact line that shipped.

**A nested roll-up reported the same finding twice.** The day's-dearest-label
entry was appended after the inner roll-up's findings were merged, so both
survived. Found by running it; the source read fine.

### What this release still cannot do

- **It cannot notice anything on its own.** `pulse` is a command, not a daemon,
  and if the CI step that runs it stops running, it stops with it. That is the
  end of the chain and it is deliberate: the alternative is a hosted service
  holding other people's metrics.
- **It cannot deliver an alert.** A non-zero exit code, a JSON document and a
  webhook POST are the three transports, and all three are boring on purpose.
  Paging, retries, channel deduplication and knowing somebody is on holiday are
  not here and are not planned.
- **It cannot judge what has not been pulled.** A provider that reports usage a
  day late means a crossing judged a day late. `pulse` reports the reach
  separately so the two delays are never confused, and that is the whole of what
  it can do about it.
- **It infers no schedule anywhere.** No "expected cadence", no "this run is
  late" without a threshold somebody typed. That is a refusal rather than a gap,
  and it means a first-time reader gets ages and no opinion.
- **The per-family token band is still unmeasured**, which is the arc 1.54.0
  names — still missing on purpose, still waiting on provider keys.

---

## 1.55.0 — "More than one machine"

**Four people measured four things, and nobody wanted to email logs around.**
Everything in this repository assumed one operator with the files on disk:
`--by-source` and `owners` divide a bill somebody already collected, and nothing
combined bills nobody collected together. This release adds the missing half — a
**format and a merge, not a service**. Nothing is uploaded and there is no
account, because the tool whose whole argument is that it reads your bill without
uploading it cannot also be where everybody's bill is uploaded.

**1.54.0 is missing on purpose.** The arc it names — the counter, per family —
needs provider API keys this work did not have, and inventing a band is the
estimating-and-measuring merge this project spent 1.36–1.40 removing. The hole in
the sequence is the record that an arc was jumped rather than dropped;
renumbering the plan to hide it would rewrite a document whose whole value is
having been written before the code.

### `trazum rollup <document...|dir> [--json]` — new command

Merges profile documents several people produced separately. Each contributor
runs `trazum profile --json` wherever their traffic already is; the documents
arrive however your team already moves files, and a **directory argument** rolls
up every `.json` inside it, so a shared folder people drop a document into is a
roll-up without anybody writing a shell loop.

A profile document carries no prompt text, no completion text, no session keys
and no credentials, and never has. That is what makes handing one to a colleague
a different act from handing over a log.

```
Roll-up of 2 contributors — $20.07 over 32 calls
  Covering 2026-08-01 to 2026-08-14, stated and never extrapolated from.

Contributors, and what each one could not see
  api.json — $14.45, 18 calls, 13 days
  nightly.json — $5.62, 14 calls, 13 days
    1 line of this contributor's log could not be read
    no record carried a session, so this contributor brings no
      conversation findings
```

**Two thirds of the output is what the merge could not do**, and that is the
point. It exits 1 when a contribution was handed over and could not be merged.

**What it merges.** Totals, unpriced totals and unpriced model names; per label,
per model and per label-and-model; spend per UTC day with each day's per-model
split; field coverage; the outcome tally; within-contributor duplicate lines; and
the observed span, earliest start to latest end.

**What it refuses, one by one:**

- **Findings computed from individual calls do not roll up.** Percentile input
  and output shapes, conversation growth, repeated turns, truncation retries —
  every one needs the calls, and a summary of a summary cannot reproduce them.
  They are listed in `notMerged` with the contributors that have them, so the
  reader knows where to go and look.
- **A day drawn from two contributors has no dearest label.** The merged answer
  needs per-label-per-day spend no document carries, and taking the larger of two
  contributors' answers is wrong whenever a runner-up in both adds up to more
  than either winner. `topLabel` and `topLabelUsd` are both `null`, never `0`.
- **The largest single call is a maximum, never a sum.** Four machines' largest
  calls added together is a call that never happened, in the direction that makes
  a context window look tight.
- **A contribution that does not conform is rejected by name and gates.** A
  machine that contributed nothing must not read like a machine that spent
  nothing.
- **Each contributor's gaps stay with that contributor** — unreadable lines,
  unpriced calls, no clock, a partial clock, no sessions, no labels, duplicate
  lines. Summed, they would say "3% of this roll-up is unpriced" when the truth
  is "one of your four machines is 90% unpriced and the other three are clean".
- **Overlap between contributors is unmeasurable**, and every roll-up of more
  than one contributor says so. Two people exporting the same traffic double the
  bill, and no merge of summaries can see it — the raw lines a duplicate check
  needs are in no document. This one cannot be lifted by a better implementation.
- **A numeric field this version cannot classify is dropped and named**, in
  `cannotSay` and again in `notMerged` with the field's name. A number added
  later may be a sum, a maximum or a ratio.

**Identical contributions are merged and stated, never discarded** — the rule a
single profile already applies to duplicate lines. The comparison is over the
whole text, never a hash: a hash collision would report a duplicate that is not
one, and this figure exists to make somebody distrust a total.

### A span is not a period — claimed windows and named silence

A log whose latest record is the 5th may be a log of a quiet week or a log that
stopped being written on the 5th. The records cannot tell those apart.

When a contributor profiled with `--since`/`--until`, the roll-up carries the
window it **asked for** as `claimed`, keeps `claimedSpan` apart from the observed
`span`, and **names every day inside a bounded claim that recorded nothing** —
contiguous runs with `from`, `to` and `days`, so a year-long claim with three
days of traffic is a handful of entries rather than three hundred and sixty-two
strings.

```
  api-claim.json — $14.45, 18 calls, 13 days
    asked for 2026-08-01 to 2026-08-21
    7 days inside the window this contributor asked for recorded nothing
      2026-08-15 to 2026-08-21
```

Whether a silent stretch is a quiet fortnight or a broken export is yours to
know; that it is silent is this tool's to say.

- A contributor that claimed nothing gets **`no-claimed-period`** rather than
  having its span promoted to a period.
- A claim with a single end gets **`claim-not-bounded`**: silence cannot be
  measured against half a window, and taking the span's other end would invent
  the claim.
- A claim longer than ten years is **kept and not walked**. These documents come
  from elsewhere, and `untilMs: 1e15` is a malformed document rather than a team
  with a long memory — enumerating it would be thirty million iterations inside a
  merge somebody ran on four files.
- `undatedExcluded` travels too, and is **`null` when there was no window**,
  never `0`, because zero would say a window excluded nothing.

### A roll-up is a contribution too

Three teams roll up their own machines and the organisation rolls up the three.
`rollup` accepts a `roll-up` document wherever it accepts a `profile`, because
every summable part of one carries the same field names as a profile.

The interesting half is not the arithmetic. It is that **every refusal has to
survive the nesting**, because a refusal that quietly stops at a layer boundary
is worse than one that never existed — the layer makes it look audited.

- **Contributors are flattened, never collapsed.** A roll-up of three roll-ups
  lists twelve machines with twelve sets of gaps, each carrying `via` — the
  roll-up it arrived through, kept as the roll-up that actually held it even
  through a third layer.
- **Rejections travel, with their `via`.** A machine whose document did not
  conform cannot be made to disappear by adding a layer.
- **`cannotSay` is unioned.** An inner roll-up that could not see overlap does
  not become an outer roll-up that could.
- **A finding an inner roll-up refused to merge does not become mergeable by
  being handed on**, and the same finding from two roll-ups is one entry naming
  both sets of machines.
- **Days count machines, not documents.** A nested roll-up already knows how many
  machines saw a day.
- **The double count nesting makes possible is named and not subtracted.**
  Handing over both a roll-up and one of the machines inside it counts that
  machine's money twice; the documents differ, so only the *name* can see it.
  `repeatedContributors` states it — two teams genuinely running `api.json` is
  possible, and deciding between them by removing money is the repair this tool
  does not make.

### `roll-up` — the tenth `--contract` name

`trazum conform` recognises the roll-up document, and `trazum rollup … --json |
trazum conform -` closes the loop. Detection tests it **before** `profile`: a
roll-up carries `byLabelAndModel` too, so testing the profile first would accept
every roll-up as a profile and never apply the two refusals only a roll-up has to
carry.

Those two are enforced rather than merely documented. `conform` **fails** a
roll-up of more than one contributor whose `cannotSay` omits `overlap-invisible`,
and one that rejected a contribution and does not say so. A format that carried
the fields and lost those refusals would hand somebody a doubled total that looks
audited.

The interchange format is now **twelve documents emitted, a thirteenth defined
and not emitted**, ten of them nameable to `--contract`.

### `rollUp()` in `@trazum/core`

Exported with `RollupInput`, `RollupDocument`, `RollupContributor`, `RollupDay`,
`RollupCaveat`, `ContributorGap`, `UnmergedFinding` and `SilentRun`. It reads no
files and runs no globs — the caller hands over text it read — so it stays
browser-safe and the CLI keeps its monopoly on the filesystem.

### Fixed

**A file-system race in the new command, caught by CodeQL on the pull request
that introduced it.** `stat`, branch on `isDirectory()`, then read the path is a
check-then-act: between the answer and the read the path can become something
else. It asks once now — attempt the directory listing and read the error code,
where `ENOTDIR` means *this is a file* — because there is no window between two
operations when there is only one. Guarded at the source, since both shapes
behave identically on a filesystem nobody is racing.

**`--help` retyped the list of contracts and stopped at `cost-answer`.** Two
releases each added a contract and the help text named neither — one section
below the USAGE block that a whole test suite exists to keep provider names out
of. It is interpolated from `CONTRACT_NAMES` now, and a test reads the names out
of the CLI's own refusal and asserts every one appears.

**The README said Trazum emits ten documents while the format page said eleven
and twelve.** Two pages, three numbers, one table.

**The guard on the format page's count matched the literal `twelfth`.** The guard
against a stale count had itself gone stale; the ordinal is derived from the row
count now.

**A nested roll-up reported the same finding twice.** The day's-dearest-label
entry was appended after the inner roll-up's findings were merged, so both
survived. Found by running it — the source read fine.

**Five copies of the help-screen defaults lived in one test file.** Adding a
field to `HelpDefaults` made every one of them throw at the first `.join`: five
failures, one cause. The help screen is rendered from data precisely so its
enumerations cannot go stale, and a test that retypes that data is the staleness
one layer down.

### What this release still cannot do

- **It cannot see overlap between contributors.** Not a gap to be closed later: a
  merge of summaries has no access to the raw lines a duplicate check needs. The
  document says so every time, and the checker enforces that it does.
- **A contributor with no claimed window is a span, not a period**, and no amount
  of arithmetic changes that. The roll-up says which contributors are in that
  position rather than guessing.
- **Nothing transports the documents.** That is deliberate and is the shape of
  the whole arc, but it does mean a team with no shared drive has a step to
  solve that this tool does not solve for them.
- **The per-family token band is still unmeasured**, which is the arc 1.54.0
  names and the reason that number is missing here.

---

## 1.53.4 — "What it says and what it does"

**Every defect in this release is the same gap**: something said one thing and
did another, and the saying was never wrong enough to notice by reading. A class
list that merged correctly and computed to the primitive's value. A page headed
*"Real output, transcribed"* whose transcripts stopped early. A guard whose name
promised a check it had quietly stopped performing. Nineteen of them, and the
only thing that ever found one was running it.

### The web app got a shell

The three modes were a pill group under a full-width header. They are a sidebar
now: 236px expanded, 60px collapsed with the preference kept across visits, and
below `lg` the same rail arrives as a drawer with a scrim that closes three ways
— Escape, the scrim, and choosing a mode, which is what it was opened for. The
account control became a menu at the rail's foot, opening upward at the wide
width and sideways at the narrow one so it can never open off the screen.

**Three waiting states, each in the shape of what is coming.** Optimise, Compare
and Library shared one defect: the button changed its label while the panel that
will hold the answer went on showing its empty state, so the only sign of life
was at the far side of the screen from where the reader is looking. Each draws
the real rows of its own report now, so nothing jumps when the answer lands.

**Two columns, and every number in them is derived.** A nav row is 8px of the
list's padding, 1px of transparent border and 10px of its own — so every glyph
sits at 19 and every label at 46. The account row's gap is 5px rather than 10,
which is 10 minus the 5 its 22px avatar exceeds a 17px icon, so both columns
hold across two different glyph sizes. Collapsed, all five glyphs centre on the
same half-pixel.

### A phone had 261 pixels of a 390 pixel screen

The tabs root is a flex container and `orientation="vertical"` leaves it a row,
so the mobile bar became a 128px *column* standing beside the content. It was
invisible in every screenshot taken of it, because the only ones taken had the
drawer open over it, and obvious the moment the bounding boxes were printed.

### Three times, a correct class list computed to the wrong thing

`TabsTrigger` carries its declarations behind variant prefixes — and a `dark:`
copy of one of them, a further specificity step up. The same declaration written
on the `TabsList` loses to them silently: tailwind-merge cleans the class list,
the source reads correctly, the build is green, and the computed value is the
primitive's.

It cost a collapsed rail whose icons measured 12.5px off centre while every
other glyph measured half a pixel, and an active row with **no surface at all**
— `rgba(0,0,0,0)` in both themes, with the collapsed rail signalling the current
mode by icon hue alone. Fixing the light rule left the dark one exactly as it
was, because the dark rule outranks it.

### Two audits, and what they found

Five lenses measured the running app — geometry, keyboard, colour, Spanish,
breakpoints — and every finding was reproduced by an independent reader before
it counted. Then a sixth pass asked what all five had missed, and named the
frames *during* a transition, the dark theme's overlay layer, Windows High
Contrast, and the requests the page issues on load.

- **A closed drawer kept five controls in the tab order**, all off-screen. Five
  consecutive Tab presses changed zero pixels anywhere on a phone.
- **The drawer claimed modality and did not enforce it**: focus never entered,
  Tab walked out behind the scrim, and closing stranded it.
- **In dark mode the scrim brightened the page instead of dimming it.** It
  followed `--foreground`, which in dark is a near-white, so the layer whose
  whole job is to recede became a 40% white wash: the page behind it measured a
  relative luminance of 0.0157 closed and 0.1681 open — eleven times brighter —
  while the drawer in front of it sat at rgb(38,36,32).
- **Expanding the rail threw its contents 70px across the page** for the first
  ~50ms, where they also answered hit-tests.
- **Under Windows High Contrast the current mode became untellable.** The rail
  marks it with a background tint, and a tint is exactly what forced-colors
  replaces; active and inactive rows both measured rgb(232,232,232).
- **Two contrast floors**: 2.90:1 for the faint tier and 3.77:1 for inactive
  labels in light, where the dark theme had a token and the light one had
  shadcn's `/60` opacity. **A legibility floor outranks a visual tier**, so the
  faint tier is now the lightest warm grey clearing 4.5:1 on both surfaces —
  a narrow band, and said to be one.
- **Focus indicators at 1.05:1 and 2.03:1** against a floor of 3:1.
- **A desktop preference reached a phone drawer**, producing a 248px overlay
  containing a 60px rail — no wordmark, every label `sr-only`, and no expand
  control, because the only one is desktop-width. And **crossing to a desktop
  with the drawer open** left a full-screen scrim and a locked body with no
  visible control to lift either.
- **The session was fetched twice on every load**, by two components reading
  different fields of one answer — and two answers to one question can differ.

**Five of the nineteen were introduced while fixing the others, and not one was
visible in the source.** A focus trap that read its container once and did
nothing, while Escape kept working because it returns before touching it. A
retry that stopped at *finding* a candidate rather than at *moving* focus —
`offsetParent` is null for `display: none` and never for `visibility: hidden`,
so the list was full of stops that could not take focus. An `outline-none` and
an `outline-2` computing together to `outline: none 0px`. A comment claiming
controls had no focus indicator, written off a probe that sampled the computed
style three percent into a transition. And an `overflow-x: visible` control that
was not a control, because beside `overflow-y: auto` it computes back to `auto`.

### The README said "real output, transcribed" and twenty blocks were not

Forty-three fenced blocks invoke `trazum`. Ten commands were checked by
executing them and comparing line for line, each difference reproduced by an
independent reader. Twenty-nine survived, and all but four are one shape: **a
transcript that stops early and is not marked abridged**, so a reader takes a
partial output for a whole one. The page already had the convention — a bare
ellipsis line inside the fence, used exactly once — and had not used it since.

The four that are not that:

- **`--max-growth` is a token count, not a percentage.** The page said
  `--max-growth 10` fails "a prompt that grew more than 10%". It compares
  `tokenDelta > limit`. Measured both directions: a prompt that grew **50%** but
  five tokens passes, and one that grew **3%** but thirty tokens fails. People
  put this in CI.
- **`blame`'s headline figure was six times too high.** +759 tokens at 50,000
  calls was priced at +$1,138.50 a month. Run on a constructed two-commit
  history, +500 tokens at 50,000 calls prints +$125.00 — $5 per million, which
  is what `trazum models` lists for Claude Opus 5 and what the `diff` block on
  the same page already agreed with. It is +$189.75, and the two blocks had been
  contradicting each other.
- **`profile` handed the reader the wrong homework command** — the one thing the
  block exists to give you.
- **`check`'s report was re-laid-out around its own transcript**: the status
  column moved from the end of the row to the front, a header and a summary line
  appeared, and the count no longer matched the snippet printed directly above
  it — 34, not 43, for the very code the page shows.

**And the caveats had been falling out of the transcripts.** `quality` prints
two — that a before-and-after is not an experiment, and that it cannot see what
else you deployed that day — and the block had replaced the first with a blank
line and dropped the second, on a block whose subject is a failing gate that
also showed no gate verdict. `blame`'s ±10% note, `rank`'s two definitions,
`prune`'s yardstick sentence (cut mid-clause and closed with a full stop the
tool never prints), `route`'s "agreement is not correctness", `eval`'s "read the
cases below before shipping this", and `baseline`'s "re-record and commit" were
all absent. Every one bounds the claim above it.

Two more found the same way: **`serve`'s response was missing `schemaVersion`**,
which the same page elsewhere calls *"the only thing you must branch on"*; and
**`watch` reads the store, which its section never said**, so a reader met the
prerequisite after writing the cron entry rather than before.

### Guards, and the four that cried wolf

Five are new, and every one is derived from the thing it guards rather than from
a list typed beside it: the primitive's own declarations, `formatUsd`, the
document's own table.

**Four of them flagged something correct on their first version.** A hover
override that wins. An `_svg` descendant rule that paints. A child's prop *name*.
A working parent override whose only sin was sharing a property family. State
and element each turned out to be half the rule, and the lesson is now written
down: before widening a guard, measure whether the thing it flagged actually
works.

**And CodeQL found a ReDoS inside one of them.** The extractor's alternation was
ambiguous — both branches could begin with `[` — so every `[[]` in the input had
two readings: 0.2ms at ten repetitions, 93.6 at twenty-two, **6,051 at
twenty-eight**. Worse, **the test written to prove that fix would have passed
against the vulnerable version**: it fed the pattern a plain run of sixty `[`,
which the ambiguous form chews through in 0.08ms. The recurring trap of this
repository — an assertion that only ever sees inputs it cannot fail on — this
time inside the proof for the defect itself.

### What stayed out, and why

**Ten of the twenty-nine README findings are not fixed.** They are figures from
logs the README's author had and this work does not — `profile`'s dollar
columns, `blame`'s author-column width, `rank`'s size figures. Reconstructing
them would be the same defect pointing the other way.

**Four transcripts could not be run at all.** `optimize --suggest`, `eval`,
`route` and `watch` need a model call or a provider credential, and this work
had neither. Said, rather than worked around.

**One thing was seen and deliberately not claimed.** Under the `--suggest`
block, which shows three surviving suggestions and two dropped, the prose says
*"eight surviving suggestions out of ten is a useful result"*. That may be a
general principle rather than a reading of the transcript directly above it. It
cannot be settled without a key, so it stays as it is and is written down here
instead.

**Nothing about what the tool computes changed.** The web suite goes from 351 to
373 and the CLI suite from 957 to 964; no existing case was deleted.

### Checked and clean, which is also a result

`docs/format.md`'s three `conform` invocations run exactly as written, and it has
no example documents to parse. `optimize --reorder --diff` reproduces its four
lines word for word. The `--json` contract holds in both directions against a
real run. Every dollar amount in every fenced block in the README now matches
what `formatUsd` prints — swept, one finding, and the sweep is a test now.
`trazum gateway` names four providers with no count typed beside them, which is
the defect avoided rather than made.

## 1.53.3 — "Two surfaces, two formats"

**The doc-drift hunt, continued into the two places it had not looked**: the
page npm renders, and the transcripts that claim to be real output.

### The npm page showed twenty-one of thirty-two commands as though they were all

`packages/cli/README.md` is what npm renders — for most people the first and
only page they read. Its `## Commands` table stopped without saying it stops,
and the sentence beneath it read *"`trazum --help` documents every flag"*:
flags, never commands. `trazum gateway`, the only thing in this product that can
refuse a call **before** the money is spent, had no row and no mention.

The fix is not to list all thirty-two on a page like that. It is to say the
table is a selection and point at the tool — the same rule this repository
applies to a skipped test and a half-measured day: **silence about
incompleteness reads as completeness.** That sentence is also only true because
1.53.2 put every command into `--help` in the first place.

**Writing that disclaimer produced the defect it was fixing, twice in one
paragraph.** The first draft enumerated the eleven omitted commands — a list
typed beside the thing, stale the moment a command is added, which is precisely
what the previous release had spent itself removing. The second said *"a dozen
more"* when there are eleven. Both are refused now: the disclaimer may state no
count and name at most one command as an example.

**And the check written to catch the second one did not catch it.** It listed
`a dozen` in lower case and was case-sensitive; the draft began the sentence *"A
dozen more"* and passed clean. A guard that reads as coverage and covers
nothing — found by running the probe rather than by reading the regex, and now
handed both phrasings directly.

**An existing guard caught this work's own test.** The first version bounded the
`## Commands` section by finding the next heading by hand, which
`publish.test.js` refuses: bounding a section by its neighbour has silently
broken a harvest nine times here, and `sectionOf()` exists as the one home for
that rule.

### A transcript had stopped being a transcript

`trazum doctor`'s money column in the README read `~$4,912`. The command prints
`~ $4,912` — tilde, space, dollar. The transcript was taken before the column
was spaced and never re-taken, on a page headed *"Real output, transcribed"*.

**A naive rule here would have broken the correct surface.** `optimize`'s
advisory suffix is `` ` ~${amount}/month` `` — **no** space, deliberately,
because it trails a sentence rather than heading a column. Banning `~$` across
the documentation would have failed `~$327.40/month` in two READMEs, which is
exactly what the tool prints. Two surfaces, two formats, one character sequence;
the subject is the doctor transcript, not the sequence.

So the guard takes the column's shape from **running `doctor`** at test time —
the numbers differ, since the transcript is from a sample project, but the shape
does not — and separately asserts the sentence-trailing form survives a future
tidy-up that tries to make the tildes consistent.

**One half of the fix was reverted for being the same defect again.** The first
pass also added *"(58 days ago)"* to the transcript's prices line, because the
command prints an age now. That number is relative to today and would be wrong
tomorrow: a count that ages on its own, written into a paragraph about counts
that age on their own. Only the spacing was kept — a fact about the formatter
rather than about when the run happened.

### What was checked and found correct

Recorded rather than left as unexamined confidence. Documented examples
reproduced against the real binary:

- **`trazum where src/prompts.ts`** — matches the shown output **line for
  line**, including the detection lines and their order.
- **`trazum conform your-log.jsonl`** — matches in substance and wording; the
  block is an abbreviated excerpt and marks itself as one.

And from the previous release's sweep, still holding: every documented flag
exists, and the "thirty-two commands" figure is right.


## 1.53.2 — "What the tool says about itself"

**Four faults, one shape.** Every guard in this repository that watches for a
stale list was pointed at the **documentation**. The product's own help text —
the first thing anybody reads — was checked by nothing, and it had drifted away
from the product in four separate places.

Found by an angle nobody had tried: extracting every documented `trazum`
invocation and comparing it against what the tool actually says.

### The help said the gateway fronts two providers

```
$ trazum --help
  trazum gateway <anthropic|openai> --on-cannot-tell <fail-open|fail-closed>

$ trazum gateway
Error: Name the provider to stand in front of. Known: anthropic, openai, deepseek, google.
```

A reader meets both within a minute of each other and **the wrong one is
first**. It went stale during the release whose entire subject was that list —
`docs/gateway.md` was guarded against the compiled upstream table, and the same
sentence lived inside the product where nothing was looking.

The fix is not a longer list kept in sync. It is `<provider>`, with the
enumeration left to the refusal that derives it. A provider list typed beside
the thing has now gone stale in `docs/gateway.md`, in `ROADMAP.md` and in the
help; each time the answer was to stop writing the list.

### `trazum profile` was not in the help at all

Not a small one. `profile` is the command almost every refusal in this product
points a reader at — *"trazum profile prices a mistral log you export"*, the
`--max-usd` gate that fails a build on the bill, the `--json` documents
`history` reads. It had a full nineteen-flag allowlist and its own `OPTIONS FOR
profile` section, and it was absent from the list of commands.

Nothing noticed because the *"thirty-two commands"* figure the README states is
guarded — against `COMMAND_FLAGS`, which had all thirty-two. The USAGE block had
thirty-one, and **no check compared the product's own two lists with each
other**.

### Two commands had no options section, and one had two

`trazum ladder` takes `--since`, `--until` and `--label`; `trazum owners` takes
`--since` and `--until`. Neither had an `OPTIONS FOR` section, so nothing in the
help said they take a window at all — and both are commands whose whole point is
judging a period.

`eval` had **two** sections under the same heading with different content: one
listing `--export promptfoo` and `-o`, the other carrying the paragraph
explaining that it costs **three** provider calls per case — the original twice
to measure the model's own run-to-run variance, and the optimised once — and
exits 1 on divergence. Whichever a reader scrolled to, they got half, and the
duplicate heading meant neither half announced itself as one.

### An Action pin could point at a commit that is not on `main`

The guard on the README's `uses:` lines is thorough: a 40-character SHA, never a
tag, with the version comment verified against **that commit's own** manifest
rather than against the working tree — a distinction it learned the hard way,
because comparing to the working tree made an honest release impossible.

All of it is satisfied by the pre-squash head of a feature branch. That commit
says exactly the right version and is deleted the moment the pull request
merges; GitHub can garbage-collect it, and a workflow pinned there stops
resolving with no warning to anybody.

**Caught while preparing this release.** The sha to hand was the branch commit
rather than the squash-merge on `main`, and every existing assertion passed on
it. By the time the check was written that commit had already gone from the
clone — the hazard demonstrating itself. The pin must now be an ancestor of
`origin/main`, and a clone without that ref reports the pin as unverified rather
than passing over it.

### What guards this now

Three new checks, each derived from the code rather than from a list typed
beside it, and each run against a planted defect **and** against the corrected
text:

- no USAGE line may enumerate providers — the provider set drawn from the
  catalogue, the upstream table and the connector list together
- USAGE and the dispatch table must agree **in both directions**: a command that
  is dispatched and undocumented fails, and so does a USAGE line promising a
  command the CLI does not have, because a careless fix for the first would
  otherwise satisfy one check and mislead every reader
- every command with flags of its own must have **exactly one** options section

The provider check, the duplicate-heading check and the pin-ancestry check are
each handed the shapes they exist to reject, not only today's corrected text —
the fifth, sixth and seventh time this session that an assertion over
known-good values turned out to be unable to fail at all.

### What was checked and found correct

Two negative results, recorded rather than left as unexamined confidence:

- **Every documented flag exists.** Every `--flag` written beside a `trazum
  <command>` across all thirty-one instructional documents, compared against
  `COMMAND_FLAGS` plus the globals: zero that the command does not accept.
- **The "thirty-two commands" figure is right**, and matches `COMMAND_FLAGS`
  exactly.


## 1.53.1 — "The band stays inside the family it was measured in"

**Two chapters of the 1.54 arc**, and the second one is a fault that had been in
the product since the estimator learned to price more than one provider.

Trazum's `±10%` is the estimator's error **measured against Claude's tokenizer**
over twenty-one samples, and `--exact-tokens` counts with **Anthropic's**
endpoint. Both facts were written down. Neither was enforced, and three claims
had walked out of the family they were measured in.

### `--exact-tokens` was sending your model to somebody else's counter

`optimize --exact-tokens` handed `result.usage.model` straight to Anthropic's
`count_tokens`. On a Claude model that is exactly right. On `gpt-5` it sends
another company's model id to Anthropic and comes back with either a confusing
upstream error or a number counted with the wrong tokenizer — labelled
**exact**, which is the strongest word this tool uses about a count.

It refuses now, by name:

```
Error: --exact-tokens counts with Anthropic's endpoint, which counts Claude's
tokenizer, and gpt-5 is a model from openai. Counting it there would either be
refused upstream or return a number for a different tokenizer, and this tool
will not label that exact. Drop --exact-tokens for the estimate — which is
honest about being one — or count with openai's own tooling.
```

**The family check runs before the key check**, and that order is the point.
Asking a reader on another family for an `ANTHROPIC_API_KEY` first would send
them after a credential that could not have helped them.

### "The call will fail" was Claude's verdict, given to everybody

The context-overflow advisory is the most absolute sentence this product
produces — no dollar figure, no hedge, just *"The call will fail: split the
content or move to a model with a larger window."* It fired whenever the
estimate exceeded the window by more than the band. That band is Claude's.

On a family nobody has measured, an estimate over the window is **always**
uncertain however far over it looks, because the margin that would settle it is
the unknown. So the advisory has three shapes now where it had two: an exact
count gives a verdict, an estimate on the calibrated family gives a probability,
and an estimate on any other family says that how far over it really is cannot
be said from here.

**The fix is not a second, wider band for the unmeasured families.** That would
be the same mistake with worse arithmetic — *nothing continuous invents a
number*.

### And the advice pointed at a command that now refuses you

Both context advisories ended with *"settle it with --exact-tokens; the counting
endpoint is free"* — for five of the seven priced families, a counter for a
different tokenizer. The advice is **bounded, not deleted**: the family it works
for still gets it, and a test asserts that it kept it.

`BAND_CALIBRATED_PROVIDER` and `bandGoverns()` are exported so the fact has a
name that something can check. A model with no provider recorded reads as **not
covered**, never as covered: the flattering reading of missing information is
the one this project does not take.

### The band harness measures four families

The other chapter, and it was only writable because 1.53 closed. OpenAI and
Google became measurable when their endpoints became committed facts of this
repository — the gateway's own upstreams. **Google deliberately does not use a
counting endpoint**: one may well exist, nobody here has ever sent a key to it,
and an endpoint recalled rather than committed is exactly what the previous arc
spent itself refusing. It measures with `:generateContent` at one output token
and pays for it.

**Neither has been run against the real service.** Nothing in this environment
has a key. What ships is the shape.

**The measuring script is now tied to the gateway's allowlist.** It sends a real
API key to every family it measures, from a file nobody thinks of as
security-sensitive — and it is in fact the file where DeepSeek's endpoint sat
while the gateway was still refusing DeepSeek as unsupported. Adding a family
requires the same deliberate edit to `security.test.js` that adding an upstream
does. A measuring script is not a side door.

Each unmeasured family now gets its **own named skip** with its own command:

```
ok 2 - openai: not measured — the estimator's error on this family is unknown # SKIP run: node scripts/measure-token-band.mjs --provider openai
ok 3 - google: not measured — the estimator's error on this family is unknown # SKIP run: node scripts/measure-token-band.mjs --provider google
ok 4 - deepseek: not measured — the estimator's error on this family is unknown # SKIP run: node scripts/measure-token-band.mjs --provider deepseek
```

The sentence it replaced named `deepseek` alone, because that was the only other
provider the day it was typed — so the two families arriving at 1.53 would have
gone unmentioned by a message bounded by its neighbour rather than by its
subject.

### What this work found wrong in itself

**A refusal that told a falsehood.** The provider-less branch said the model
*"is not a model in the price catalogue at all"* — false in the only case that
can reach it, since `provider` is optional on a priced model and `--pricing`
lets anybody supply a catalogue. The model **is** in the catalogue; its family
is what is missing. Found by constructing the case and running it.

**A test that failed a correct implementation.** The new guard asked for a
prompt 1.01× a 1,000,000-token window and grew the text by doubling, producing
1,966,080 tokens — landing in the *certain* branch. Badly built input, correct
code. Building it by repeated append then hung the suite for two minutes, which
is how the third version came to compute the length instead.

**A guard that legitimately failed nine models.** `threshold-honesty.test.js`
recognises hedging by vocabulary, and the new sentences hedge in words its list
did not know. `may be` became `\bmay\b`, plus *"not knowable"* and *"cannot be
said"*. Widening a guard's accept-list to make your own change pass is how a
guard becomes decoration — so the pattern is now handed the flat sentences it
exists to refuse and must reject all three.

**A check that could never have fired.** *"The harness reaches nothing the
gateway does not front"* would never have run against anything it should reject,
because a brand-new host fails the decision check above it first. The case it
actually exists for is a host already decided about and decided to be something
*other* than an upstream — which satisfies every other check in the file. Third
time this pattern has been caught in three releases.

### What stayed out

**The numbers.** Nothing in this environment has an API key, so no per-family
band was measured. The plan's remaining chapters — publish a band per family,
then take the real-tokenizer dependency decision **with the number in hand** —
are waiting on somebody who can run the harness. Until then every family the
estimator was not calibrated on is named as unmeasured rather than quietly given
Claude's number.


## 1.53.0 — "Four of the seven, and why the other three are not here"

**The minor that closes the arc**, and it closes on a number smaller than the
one the plan hoped for. Trazum prices seven providers. The gateway now stands in
front of **four**; two more can never be fronted by a proxy of this kind, for
reasons proven from this repository's own code; and the last three are missing
one fact that nobody here can supply honestly.

That is the whole thesis of the release. The arc was called *"every provider you
pay for"*, and what shipped is *every provider this repository can reach without
guessing* — plus a complete, self-checking account of the difference. A gap that
is named, proven and alarmed is a finished piece of work. A gap papered over
with a hostname somebody half-remembers is not.

### Where the gateway stands

| Provider | Gateway | Why |
| --- | --- | --- |
| `anthropic` | fronted | since 1.50.3 |
| `openai` | fronted | since 1.50.3 |
| `deepseek` | fronted | the token-band harness already sent a real key to its host |
| `google` | fronted | the Gemini provider already sent a real key to its host, and the Gemini importer already read its counts |
| Bedrock | **cannot be** | SigV4 signs the host |
| Vertex AI | **cannot be** | the origin is per-caller |
| `moonshot`, `xai`, `mistral` | not yet | their hosts are nowhere in this repository |

### A provider you pay for is not a typo

`trazum gateway mistral` and `trazum gateway bogus` used to get the same
sentence. One is a real gap with a real workaround; the other is a
misspelling — and the refusal told somebody with a live Mistral bill to check
their spelling.

Both refusals now name the gap, offer `trazum profile` on an exported log, and
say what that does **not** give you: a refusal before the money is spent, which
is the entire reason the gateway exists. Both derive their subject from the
catalogue and from the gateway's own upstream table, so a provider that gains
support leaves the gap with nothing edited.

`trazum connect` says the honest disjunction rather than picking a side:
*"either that provider publishes no usage API, or one has not been written."*

### Two providers added without anybody typing a hostname

**DeepSeek.** `scripts/measure-token-band.mjs` has sent a real API key to
`https://api.deepseek.com/chat/completions` since the band harness learned a
second provider. Its path genuinely has **no `/v1`** — the kind of detail memory
gets wrong.

**Google.** `packages/core/src/llm.ts` has sent a real key to
`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
with the key in an `x-goog-api-key` header rather than the query string, since
the Gemini provider landed; `packages/core/src/usage.ts` has read `usageMetadata`
back since the Gemini importer landed, including the part where
`promptTokenCount` **includes** `cachedContentTokenCount` rather than adding to
it. Four facts, none recalled.

`WIRE_SHAPES` came with the first of them: one map saying which response shape
each provider speaks, because the buffered reader and the streaming reader each
had their own `provider === 'openai'` test and two lists of names eventually
disagree. **A provider absent from that map reads as null, not as a guess**, and
the gateway then reports the call as unmeasured — which is true — instead of a
number nobody can defend.

### The model in the URL, and the pattern that is narrower than a literal

Gemini names its model in the path, so "the one path this gateway forwards"
could not stay a string comparison. It became an anchored pattern whose model
segment accepts only `[A-Za-z0-9._-]` — a stricter grammar than an equality test
against something a caller could have put a `?` or a `..` in — and **the URL
sent upstream is rebuilt from what matched, never echoed**. A pattern that
matched is evidence the request was well formed; it is not permission to forward
whatever else satisfied it.

Eight hostile paths are refused by test, each asserting the provider saw **no
connection at all** rather than an error relayed back: a smuggled query string,
traversal in the model segment, a second path segment, `:streamGenerateContent`,
`:countTokens`, text appended after `:generateContent`, a prefix before the
version, and another provider's path.

`:streamGenerateContent` is refused on purpose. Establishing Gemini's buffered
shape does not establish its streamed one, and the streaming reader returns
nothing for Google given **both** an OpenAI-shaped event and a Gemini-shaped
one, so no later edit can quietly merge the two facts.

### Adding an upstream means editing a security test, and that includes patterns

`security.test.js` compares the gateway's origins and paths **exactly**,
extracted from the source rather than searched for, so a new destination for a
credential cannot arrive without a deliberate edit to a file that exists to
notice. That friction is the point.

It harvested `path: '...'` literals only. A **pattern** would have reached a
credential-forwarding proxy without appearing in the allowlist at all — the hole
opening in the same commit that made it possible, with the guard still passing
and still reading as coverage. Pattern paths are extracted just as exactly now,
every one must be anchored and must accept no arbitrary run of text, and the
fetch target is asserted to interpolate only the compiled-in origin and a path
the module built.

**That property check is proved against known-bad inputs**, because written as a
loop over today's good pattern it could never have failed: the exact-list
comparison above it catches any change first. It is handed a pattern missing its
start anchor, one missing its end anchor, and one with a `.*` model segment, and
must reject all three.

### Every host this repository names is now decided about

Google's endpoint sat in `llm.ts` carrying a real key while `docs/gateway.md`
listed Google among the providers the gateway could not front. **Neither file
was wrong.** Nothing held both facts at once, so nobody could see that one
answered the other — and finding it took a hand-run dump of every `https://`
string in the repository, releases after it became true.

That dump is kept. The host set is derived from source — tracked files **and**
untracked-but-not-ignored ones, so a new destination fails at the desk rather
than at CI — and the decision about each host is deliberate, from a fixed
vocabulary so a typo cannot invent a category. The upstream decisions are
checked against the compiled table in both directions.

**And a provider endpoint the gateway could front sets off an alarm.** Nothing
is permitted to carry the decision *"model call, not yet fronted"*. The day a
Mistral, xAI or Moonshot host arrives here — in a script, a provider, a
fixture — it fails the decision check by name, and the only honest label for a
plain-credential model endpoint fails the build with the chapter to write. The
alarm is handed a planted map as well as the real one, for the same reason as
the pattern check.

### Bedrock and Vertex, which are findings rather than gaps

Both are recorded as unfrontable **permanently**, and the reasons come from this
repository's code rather than from anybody's understanding of the vendors. They
turn out to be the same reason: the origin is not a constant.

- **Bedrock** defaults to `https://bedrock-runtime.${region}.amazonaws.com`, and
  `signRequest` is handed `host` — SigV4 signs the origin, so a proxy that
  rewrote it would forward a signature matching nothing it was attached to.
- **Vertex AI** defaults to `https://${location}-aiplatform.googleapis.com` for
  every region but `global`, so fronting it would mean a caller-supplied
  origin — the exact thing the compiled-in upstreams exist to prevent.

`docs/gateway.md` says so now, because somebody whose calls go through Bedrock
deserves to read why rather than assume it is coming. The test re-checks both
claims against `llm.ts` rather than trusting its own prose.

### What the arc found wrong in itself

**The buffered path went unmeasured in silence.** 1.52 taught the streaming path
to say *this call is unmeasured* when no usage event arrived, and left the other
side of the same `if` recording nothing and saying nothing. A Gemini response
with no counts was forwarded, answered, and vanished from the total without a
word. It names the cause now — but only on a response the provider called
**ok**, because an upstream error carries no counts for the honest reason that
it produced none, and announcing those would bury the ones that spent money.

**A third unmeasured cause would have inherited the second one's sentence.** The
message was a two-branch ternary whose `else` explained OpenAI's
`stream_options.include_usage`, so a Gemini user would have been told about a
setting their SDK does not have. One branch per cause now, no `else`. The
eleventh time this project has bounded a message by its neighbour instead of by
its subject.

**`docs/gateway.md` said "five of the seven, still" through an entire release in
which it became four**, and `ROADMAP.md` carried the same stale *two*. The table
beside the sentence was guarded against the upstream list; the sentence
introducing the table was not. Both counts are gone, and a guard now fails any
spelled or digit count in that paragraph. That is the eleventh count written
above a derived list this project has had to remove.

### What stayed out, and why

**`moonshot`, `xai` and `mistral` are unfronted, and this release does not
pretend otherwise.** Their hosts appear nowhere in this repository. Compiling an
endpoint in from memory — into the single place a user's credential is
forwarded — is the thing this project's doctrine forbids treating as known, and
the rule paid for itself twice in this very arc: both providers that were added
came from *finding* a host already committed here, not from recalling one.
Confirming those three endpoints is a question for somebody who can check them.
Until then the refusal says so, and the guard proves the absence on every build.

**No connector was added.** Whether each of these providers publishes a usage
API at all is a separate question from whether the gateway can front it, and
*"this provider does not publish one"* is a finding to record rather than a gap
to paper over.

**Nothing sums the gateway's own traffic into a usage report.** That would be a
measurement of what went through the proxy, not of the bill, and the two differ
by every call that did not. The arc refused it on the day it was planned and
refuses it now.


## 1.52.1 — "Two more providers, from facts already here"

**Three chapters of the 1.53 arc.** The gateway stood in front of two of the
seven providers Trazum prices. It now stands in front of four — and the two it
gained were added without anybody typing a hostname from memory, which is the
whole point of how this went.

### A provider you pay for is not a typo

`trazum gateway mistral` and `trazum gateway bogus` got the same sentence: *"is
not a provider this gateway speaks for."* One is a real gap in this tool with a
real workaround; the other is a misspelling. The refusal told somebody with a
live Mistral bill to check their spelling.

It now says Trazum prices that provider, that the gateway does not front it
**yet**, and what to do meanwhile — `trazum profile` on a log you export, whose
`--max-usd` gate fails a build on the bill after the fact. It also says what
that does **not** give you: a refusal before the money is spent, which is the
entire reason the gateway exists and the reason this gap is worth naming rather
than hiding behind "unknown provider".

`trazum connect` gained the same distinction for the same reason.

Both refusals are **derived** — the priced set from the catalogue, the supported
sets from the gateway's upstream table and the connector list. A provider that
gains support leaves the gap with nobody editing anything, and one added to
pricing joins it the same way. Its guard begins by asserting the gap still
exists at all: when every priced provider is fronted, the suite says to delete
itself rather than be weakened.

### DeepSeek, on a host this repository already trusts

`scripts/measure-token-band.mjs` has sent a real API key to
`https://api.deepseek.com/chat/completions` since the token-band harness learned
a second provider. Reusing an endpoint this repository already trusts with a
credential is a different act from inventing one — and that path genuinely has
**no `/v1`**, which is exactly the detail memory gets wrong.

`WIRE_SHAPES` came with it: one map saying which response shape each provider
speaks. DeepSeek serves the OpenAI format, so reading `prompt_tokens` out of it
is the same code — but the buffered reader and the streaming reader each had
their own `provider === 'openai'` test, and two lists of provider names
eventually disagree.

**A provider absent from that map reads as null, not as a guess.** The gateway
then reports the call as *unmeasured*, which is true, instead of recording a
number nobody can defend.

### Google, where the model is in the URL

Every other provider names its model in the request body, so "the one path this
gateway forwards" could be a literal string. Gemini's is
`/v1beta/models/{model}:generateContent`, and that single difference reaches
everywhere.

Every fact it needed was already committed here: `packages/core/src/llm.ts` has
sent a real key to `https://generativelanguage.googleapis.com` at that path, in
an `x-goog-api-key` header rather than the query string, since the Gemini
provider landed; `packages/core/src/usage.ts` has read `usageMetadata` back
since the Gemini importer landed, including the part where `promptTokenCount`
**includes** `cachedContentTokenCount` rather than excluding it. Host, path,
credential header and response shape — four facts, none recalled.

**The pattern is narrower than the literal it replaced.** It is anchored at both
ends and its model segment accepts only `[A-Za-z0-9._-]` — a stricter grammar
than an equality test against a string a caller could have put a `?` or a `..`
in. And the URL sent upstream is **rebuilt** from what matched, never the
caller's string echoed back: a pattern that matched is evidence the request was
well formed, not permission to forward whatever else satisfied it.

Eight hostile paths are refused by test, each asserting the provider saw **no
connection at all** rather than an error relayed back:

- a query string smuggled past the model segment
- traversal in the model segment
- a second path segment where the model goes
- `:streamGenerateContent`
- `:countTokens`
- text appended after `:generateContent`
- a prefix before the version
- another provider's path, on this gateway

`:streamGenerateContent` is refused on purpose. Its buffered shape being
established does not establish its streamed one, and `streamingUsageReader`
returns nothing for Google in **both** an OpenAI-shaped event and a
Gemini-shaped one, so a later edit cannot quietly merge the two facts.

### The allowlist had to learn about patterns

`security.test.js` compares the gateway's origins and paths **exactly**,
extracted from the source rather than searched for, so a new destination for
somebody's credential cannot arrive without a deliberate edit to a file that
exists to notice. That friction is the point.

It harvested `path: '...'` literals. A **pattern** would have reached a
credential-forwarding proxy without appearing in that allowlist at all — the
hole opening in the same commit that made it possible, with the guard still
passing and still reading as coverage. Pattern paths are now extracted just as
exactly, every one is required to be anchored and to accept no arbitrary run of
text, and the fetch target is asserted to interpolate only the compiled-in
origin and a path the module built.

**And that property check is proved against known-bad inputs.** Written as a
loop over today's good pattern alone, it could never have failed: the exact-list
comparison above it catches any change first. It is handed a pattern missing its
start anchor, one missing its end anchor, and one with a `.*` model segment, and
must reject all three.

### What this found wrong in itself

**The buffered path went unmeasured in silence.** 1.52 taught the streaming path
to say *this call is unmeasured* when no usage event arrived, and left the other
side of the same `if` recording nothing and saying nothing. A Gemini response
with no counts in it was forwarded, answered, and vanished from the total
without a word. It now names the cause — but only on a response the provider
called **ok**, because an upstream error carries no counts for the honest reason
that it produced none, and announcing those would bury the ones that spent
money.

**A third unmeasured cause would have inherited the second one's sentence.**
The message was a two-branch ternary whose `else` explained OpenAI's
`stream_options.include_usage`, so a Gemini user would have been told about a
setting their SDK does not have. One branch per cause now, no `else`. That is
the eleventh time this project has bounded a message by its neighbour instead of
by its subject.

**`docs/gateway.md` said "five of the seven, still" through an entire release in
which it became four.** The table beside that sentence was guarded against the
upstream list; the sentence introducing the table was not. `ROADMAP.md` carried
the same stale *two*. Both counts are gone — there is no number to get wrong if
there is no number — and a guard now fails any spelled or digit count in that
paragraph.

### What stayed out, and why

**`moonshot`, `xai` and `mistral` are still unfronted.** Their hosts appear
nowhere in this repository, and compiling an endpoint in from memory — into the
single place a user's credential is forwarded — is the thing this project's
doctrine forbids treating as known. The rule has now paid for itself twice: both
providers added this release were unlocked by *finding* a host already committed
here, not by recalling one. Confirming those three endpoints is a question for
somebody who can check them, and until then the refusal says so plainly.

**No connector was added.** Whether each of these providers publishes a usage
API at all is a separate question from whether the gateway can front it, and
*"this provider does not publish one"* is a finding to record, not a gap to
paper over.


## 1.52.0 — "The gateway in a real path"

**The minor that closes the arc.** `trazum gateway` shipped at 1.50.3 with the
right argument and an implementation nobody streaming could use. Four chapters
later it stands in the path of a real call: it relays as the answer arrives, it
refuses before the first byte or not at all, and it says out loud which calls it
could not measure.

### It streams

The relay read `await upstreamResponse.text()` for every response. For
`"stream": true` — nearly all production traffic, and every agent loop — it held
the whole answer and delivered it at once, so **time to first token became the
total generation time**.

The page had the argument against itself already. It says reading a budget file
per request would *"put Trazum's own latency between you and your provider on
every call — a cost this tool would otherwise be reporting on somebody else."*
Buffering a stream was a far larger version of exactly that, in the same file,
written in the same commit.

**The provider decides, not the request.** The branch turns on the
`content-type` that arrived, because a body asking to stream can come back
whole. A non-streaming response takes the old path unchanged.

`streamingUsageReader` reads the counts off the events on their way past and
holds three numbers and a partial line — never the text. The same promise the
buffered path made, kept structurally rather than by intention:

- **Anthropic's `message_delta` is cumulative, so the last one wins.** Summing
  the deltas would report a bill several times the real one, in the direction
  that makes this tool look like it found money that was never there.
- **A line that never ends is refused past 1 MB.** A proxy that promised to hold
  no text must not be turned into one holding a gigabyte by an upstream that
  omits a newline.

### It refuses before the first byte, or not at all

**On a refusal the provider is not contacted at all.** The status code is the
weaker half of that: the property worth having is that **your prompt never
leaves the machine**. A gateway that forwarded first and refused afterwards
would have spent the money it was refusing *and* sent the text somewhere while
claiming to stand in front of it.

**Once bytes are flowing the call is committed.** The status line is long gone,
so a 402 could not be *sent* as a refusal even if the budget ran out mid-answer
— it would arrive as garbage inside somebody's response. So it does not arrive:
a stream that started, finishes.

That has a cost, and it is stated rather than discovered. **A call that begins
inside the budget can end outside it, by exactly the cost of one answer.**
Cutting a reply off partway to save the difference would corrupt what the caller
is reading to protect a figure already spent, and this gateway will not do that.

### It says which calls it could not measure

Recording nothing for a call whose usage never arrived is right. Telling nobody
is not: the money is spent, and a period's total is short by exactly those
calls.

| Cause | What happened | How common |
| --- | --- | --- |
| `stream-broke` | the connection died before the event carrying the counts | rare, and a real error |
| `no-usage-event` | the stream ended cleanly and carried no counts | **every OpenAI streaming call** without `stream_options: {include_usage: true}` |

**The second is the one to act on**, and it is not a failure. On OpenAI a
streamed call reports nothing unless the caller asks, so a gateway that stayed
silent would under-report most of somebody's bill **and look precise doing it**.
The gateway names the field to set, not only the symptom:

```
  unmeasured: the stream carried no usage event — on OpenAI that is every
  streaming call without stream_options.include_usage, so the total below is
  short by these (3 unmeasured so far)
```

The count is kept separate from the measured one and never folded in. A total
that swallowed the difference would be wrong in the flattering direction, and
*not-recorded is not not-happened* is the rule everywhere else here.

### The tests are the point of this release

Three shapes worth naming, because each one cannot pass by accident:

- **The streaming test deadlocks against the old implementation.** The stub
  upstream emits `message_start` and then holds; the test asserts the first
  event reached the caller *before* releasing the rest. Restoring the buffering
  relay does not fail an assertion — the proxy waits for a body that will not
  end until the test waiting on the proxy lets it. Proven by doing exactly that
  under a timeout, which killed it. A test that merely checked "the bytes
  arrived" would have passed against both relays and proved nothing.
- **The refusal tests fail against a planted inversion of the property they
  assert.** Forwarding before judging fails the first by name; consulting the
  budget per chunk terminates the stream mid-answer and fails the second, which
  is exactly the production failure it describes.
- **The unmeasured tests plant the *tempting wrong fix*.** Removing the calls
  fails them; reporting a gap **and also recording it** fails the assertion that
  naming a gap must not inflate the total it warns about. That second direction
  is the one worth having — it is the change somebody would make in good faith.

### What this release found wrong in itself

**A test asserted a refusal type that does not exist.** `trazum_budget_exceeded`
rather than `trazum_budget_refusal` — and it sat *in front of* the two
assertions that mattered, so a suite that looked like it was checking the
ordering was checking a string. Caught on the first run.

**A test conflated a broken stream with a dead upstream.** It destroyed the
upstream socket in the same tick as the first write, so the response never
reached the gateway, the fetch failed at connection level and the 502 path ran
instead — a different failure with a different answer. The test saw neither
cause and reported nothing. Found by running the real thing under a probe and
reading what happened, rather than reasoning about what Node ought to do.

Both are the same lesson: **verify a name and a behaviour against the running
code, not against what it ought to be.**

### What this gateway still cannot do, said plainly

- **It fronts two of the seven providers Trazum prices.** `anthropic` and
  `openai`. A budget that works on two of your seven providers is a budget for
  the convenient part of the bill, and closing that is what 1.53 is for.
- **It cannot refuse a call already in flight**, by design, and the cost of that
  is one answer.
- **It measures only what goes through it.** Calls that bypass the proxy are
  invisible to it, and the store never pretends otherwise.

### What stayed out, and why

- **Buffering "just for small responses".** A threshold nobody can check and a
  latency cliff nobody can predict.
- **Estimating the cost of an unmeasured call.** It would merge the two halves
  this project spent the 1.36–1.40 arc separating, to remove a gap that is
  better named than filled.
- **A shutdown summary of the session's unmeasured calls.** The running count is
  in the line that reports each one; a second surface would be a report this
  command does not otherwise have.

## 1.51.2 — "The stream, and fourteen things nothing was checking"

**Three things you install changed, and fourteen documents that were lying
stopped.** The first chapter of the 1.52 arc lands here, along with two format
fixes from 1.51.1's tail and a documentation sweep that found a defect in every
file it opened but one.

### The gateway no longer holds your answer hostage

`trazum gateway` relayed every response with `await upstreamResponse.text()`. For
`"stream": true` — nearly all production traffic, and every agent loop — it read
the entire answer before writing a byte back, so **time to first token became
the total generation time**.

The page had the argument against itself already. It says reading a budget file
per request would *"put Trazum's own latency between you and your provider on
every call — a cost this tool would otherwise be reporting on somebody else."*
Buffering a stream was a far larger version of exactly that, in the same file,
shipped in the same release.

```
# before: the first byte arrives when the last one does
# after:  the first byte arrives when the provider sends it
```

**The provider decides, not the request.** The branch turns on the
`content-type` that actually arrived, because a body asking to stream can still
come back whole. A non-streaming response takes the old path, unchanged.

**`streamingUsageReader` counts on the way past and keeps no text** — three
numbers and a partial line. The same promise the buffered path made, kept
structurally rather than by intention. Four decisions inside it:

- **Anthropic's `message_delta` carries a running total, so the last one wins.**
  Summing the deltas would report a bill several times the real one, in the
  direction that makes this tool look like it found money that was never there.
- **OpenAI sends usage only when the caller passed `stream_options:
  {include_usage: true}`.** Without it the stream carries no counts and the
  gateway records **nothing — not zero**. A call whose usage never arrived is not
  a free call, and zero is the flattering direction.
- **A line that never ends is refused past 1 MB.** A proxy that promised to hold
  no text must not be turned into one holding a gigabyte by an upstream that
  omits a newline. The lost counts surface as "usage not recorded", which is the
  honest failure.
- **A stream that breaks partway destroys the socket** — the head is already
  sent, so there is no status left to change — and notes the call unmeasured.
  Recording the counts of the part that arrived would be a measurement of the
  fragment, read as the cost of the whole.

**The test cannot pass against the old implementation: it deadlocks.** The stub
upstream emits `message_start` and then holds; the test asserts the first event
reached the caller *before* releasing the rest. Restoring the buffering relay
does not fail an assertion — the proxy waits for a body that will not end until
the test waiting on the proxy lets it. Proven by doing exactly that under a
timeout, which killed it. A test that merely checked "the bytes arrived" would
have passed against both and proved nothing.

### Two documents a machine could not read

**`trazum report --year --json` printed the human report and *then* the
document.** The one command emitting the `annual-record` contract was the one
command whose output no machine could consume: `| jq` and `| trazum conform -`
both die on the prose in front. Its help said "Also emit", which described what
it did and not what `--json` means everywhere else in this tool.

The test covering it did `stdout.indexOf('{')` and parsed from there — a step no
consumer can take — so the assertion passed and the defect was invisible. **A
guard that works around the bug it is standing next to** is a shape this sweep
kept finding.

**`@trazum/core` emitted an `outcome-report` that failed its own contract.**
`schemaVersion` is required by the contract the same package defines, and the
only implementation of it omitted the field for **nine releases**. A format whose
reference producer fails its own check is worse than no format: a tool mirroring
it inherits the defect and looks interoperable.

`--contract` also refused `outcome-report` and `annual-record` by name, so the
two newest contracts could not be checked at all.

### Fourteen things nothing was checking

A sweep of every markdown file whose *content* no test reads — fourteen of
thirty. Every file opened had a defect except one, and that one is recorded as
clean because a sweep that always finds something is not a sweep.

| Where | What it said | What was true |
| --- | --- | --- |
| README hero | "fourteen findings" | the paragraph beneath said "Thirteen advisories" — wrong for **52 releases** |
| README money table | "512 on Anthropic" | `cacheMinTokens` is per model and spans **512 to 4,096** |
| `docs/ci.md` | `with: path: prompts/` | `action.yml` has **never** declared a `path` input |
| `docs/usage-logs.md` | nine of the fourteen keys the parser accepts | `outcome` appeared **nowhere**, five releases after it shipped |
| `docs/gateway.md` | `trazum gateway anthropic` | it has fronted `openai` since the same commit that wrote the page |
| `SUPPORT.md` | "the only network calls" — three of them | seven, missing the gateway, `--exact-tokens` and `watch --webhook` |
| `SKILL.md` | nine config keys | the schema knows **seventeen** |
| `docs/releasing.md` | "both manifests", "both publish steps" | three packages |
| `CONTRIBUTING.md` | `npm test # core + cli test suites` | it runs **five** |
| `docs/README.md` | accounts.md is "Provider accounts" | it is about signing in to the web app |
| `ROADMAP.md` | "the arc in progress is plan-1.51.md" | that arc had landed |
| `docs/doctrine.md` | "name the end as well as the start" | that is the fix that kept re-arming the trap |
| `docs/our-own-medicine.md` | nine occurrences, two long ones | ten, and the longest was newer than both |
| `docs/plan-format.md` | — | **correct in every particular** |

**The money table is the one that could have cost somebody.** A reader on Haiku
4.5 who trusted "512 on Anthropic" would have built a prefix eight times too
short and expected a cache saving that could never arrive. This project's own
rule is that a floor proves over, never under — and its front page was breaking
that rule about the floor itself. The code was always right; only the prose
flattening a per-model fact into a per-provider one was wrong.

**The CI page's example is the one that never worked at all.** It shipped with
`path:` at 1.48.0 and said it for sixteen releases. What kept that from being
worse is the Action's own refusal: with no `target` it stops with *"Set the
'target' input…"*, so a reader copying it got a red build naming the right input
rather than a green build gating nothing. That is the argument for writing a
refusal even where nobody expects to need one.

**The agent-facing one is the one that gave wrong answers.** `SKILL.md` is what
an agent reads before answering a question about this tool. Omitting `outcomes`
meant an agent asked *"can Trazum tell me whether the cheaper model made things
worse?"* would have consulted the list, not found it, and said no — about the one
capability the 1.51 arc existed to add.

Each fix ships with a guard deriving its subject from the code: `CONFIG_KEYS`,
`UPSTREAMS`, `CONNECTORS`, `BUNDLED_CATALOGUE`, `action.yml`'s inputs,
`parseUsageLine`'s keys, `package.json`'s scripts.

### What this release found wrong in itself

**The doctrine's own entry prescribed the fix that kept causing the failure.**
*Bound an assertion by its subject, never by its neighbour* is the rule this
repository has broken more than any other, and its entry ended with *"the fix is
the same in every case: name the end as well as the start."* That is what every
repair had done, and naming the new neighbour moves the trap one section along.
The canonical document was telling every future reader to re-arm it.

**Then it happened again, in a guard written against that very rule.** The
`docs/releasing.md` count guard matched every quantity word beside "manifest" or
"upload" and failed two **true** sentences. Tenth occurrence, three changes after
rewriting the warning.

**And the guard written to find the gateway's outbound call missed the
gateway.** `gateway-server.ts` assigns `const doFetch = context.fetchImpl ??
fetch`; matching `fetch(` and `fetchImpl(` skipped it. Its second draft then
missed a planted module because it derived its file list from `git ls-files`
while the probe was unstaged — it would have worked in CI and been useless at
the desk.

**And the fix for "the only network calls" wrote "six" above a table of seven
rows**, the same count-above-a-list failure corrected in three other files in
this same release.

The habit that caught all four: **run a new guard against the whole real corpus
and against the pre-fix text, and show it stays silent on what was already
correct** — not merely that it fires on the defect.

### What stayed out, and why

- **A release for the documentation work alone.** Fourteen PRs waited under
  `Unreleased` rather than each taking a number. Three identical tarballs would
  have been the noise, not the record.
- **A guard on the 21-sample corpus count, the language-dictionary depth, and
  the MCP README's parameter names.** All three were checked and found correct,
  and a preventive guard where no defect was found is padding.
- **Reverting the maintainer's direct edit to `CODE_OF_CONDUCT.md`.** The
  reporting address changed to a Proton one between releases, outside this
  branch. Left exactly as they set it.
- **Buffering "just for small responses".** A threshold nobody can check and a
  latency cliff nobody can predict.

## 1.51.1 — "A front door"

**Nothing you install changed.** The tarballs differ from 1.51.0 in their
version number and nothing else — no source moved, no output changed. This
release is a number attached to a documentation reorganisation, because
`RELEASES.md` and `ROADMAP.md` are indexed by version and work left under
`Unreleased` appears in neither. Upgrading gains you nothing; not upgrading
costs you nothing. Both of those are said here rather than left for somebody to
work out by diffing two tarballs.

### The documentation has a way in

Twenty-three Markdown files — fifteen under `docs/`, eight at the root — and no
index. Every one of them was *reachable*, from a link inside some other document
you had to already be reading. None of them was *findable*. The only path
through the documentation was whichever one you happened to be standing on.

**[docs/README.md](docs/README.md) is the front door**, and it is arranged by
what you came here to do rather than by what the files are called:

- **Deciding whether to use this** — the README, then the doctrine and our own
  medicine, which are the actual argument for why a figure printed by this tool
  is worth reading.
- **Using it** — usage logs, provider accounts, the gateway, CI, the plan
  document, JSON output and the format, in the order somebody actually meets
  them rather than alphabetically.
- **Extending it** — authoring a rule, and the two contracts with parity tests.
- **Maintaining it** — releasing, versioning, the changelog, the release notes,
  the roadmap.
- **Reporting a problem** — security, support, code of conduct.

It closes with the four planned arcs — 1.30–1.35, 1.36–1.40, 1.41–1.50 and 1.51
— presented as what they now are: delivered history, each with its thesis and
the version it landed at.

### The two documents an open-source project owes a stranger, which were missing

**[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).** There was none, and no file
mentioned one. It is written in this project's own words rather than adopted
wholesale, and it is explicit about the part most codes of conduct leave vague:
**enforcement here is one person, who is also the person most complaints would
be about.** It says so, and says what to do about it, instead of implying a
committee exists. It also states the thing this repository actually runs on —
being wrong in public has to be safe, or nothing else here works.

**[.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).** The
issue templates have existed since 1.9.0; the pull request side had nothing. It
asks for the two things this repository holds a change to that no automated
check can see: **what the change refuses to do**, and **whether a new guard was
proven by planting the violation** and watching the test fail naming it.

### The documentation is now checked the way the code is

Prose is the part of this repository nothing compiles. A link that stops
resolving because a file moved, and an index that stops listing a document
because somebody added one, both fail silently and stay wrong until a reader
clicks. `packages/core/test/docs.test.js` closes both:

- **Every relative link in every Markdown file resolves to a file that exists** —
  Markdown links and `<img src>` alike. Fenced code blocks are excluded, because
  a path inside an example is text, not a reference.
- **Every file in `docs/` is named by `docs/README.md`.** An index that adding a
  document is enough to fall out of has a shelf life. This is the ratchet that
  keeps the front door from going stale the way the documentation did in the
  first place.

**Anchors are deliberately not checked.** Heading text drifts for good reasons,
and a guard that failed every time a section was renamed would be answered by
deleting the guard rather than by fixing the link.

### What this release found wrong in itself

**The guard was blind exactly when it mattered most.** Proving it the way every
guard here is proven — planting the violation and watching the test fail naming
it — a link to a file that does not exist and a document removed from the index
were planted together. The index half failed by name. **The link half passed.**

`git ls-files` lists what is *committed*. The file whose links had just been
broken was new and untracked, so it was not in the list the guard walked at all.
A guard that only sees a document once it has been committed is blind precisely
at the moment a document is most likely to be wrong: when it is being written.
It now enumerates with `--cached --others --exclude-standard`, and the same
planted link fails naming both broken targets. The probe was removed and the
suite is green — but the useful part is that a guard written to catch drift in
prose was itself drifting, and only the probe said so.

**Three delivered plans were still written in the future tense.**
`docs/plan-1.36-1.40.md`, `plan-1.41-1.50.md` and `plan-1.51.md` opened by
describing work that has entirely shipped, as though it were forthcoming — three
forward-looking documents narrating a past. Each now carries a banner naming
what landed and where. **Their bodies are kept exactly as written**, for the
reason `plan-1.30-1.35.md` already gave when it was retired: a plan that edits
itself to match what happened is no longer a record of having been a plan.

**Three documents pointed only inward.** `README.md` ended without naming the
documentation it sits on top of; `CONTRIBUTING.md` and `SUPPORT.md` were
reachable only from the README, which is the one document a returning
contributor no longer reads. All three now lead to the index and the code of
conduct.

### What stayed out, and why

**Nothing was deleted.** The instruction behind this pass was to put the
documentation in order and remove what does not belong, and the second half was
checked before it was answered: every `docs/*.md` file was counted for inbound
links first. The loneliest has three; the median has seven. **Nothing was
orphaned and nothing was superseded** — the disorder was that there was no way
*in*, not that there was junk lying around. Deleting a document to make this
section read like a tidy-up would have cost a reader something real in exchange
for a tidier release note.

**The README was not split.** It is long — deliberately, one worked example per
command — and breaking it into a dozen pages would trade a document you can
search in one place for a set nobody would keep synchronised. What it lacked was
an exit, and it has one now.

---

## 1.51.0 — "The record, and the minor"

Chapter ten, and the release that closes the arc. The minor is spent here
because this is where the arc's thesis lands, not because ten things happened —
the numbering adopted at 1.50.1 says a chapter is a patch and the minor belongs
to the release that finishes the story.

### The thesis, and whether it was answered

The arc opened with one sentence: **every figure this product prints is a
denominator with no numerator.** It could say a workload got forty per cent
cheaper and could not say whether it stopped working.

Ten chapters later:

| | |
|---|---|
| 1.50.3 | It can stand in the path of the call and refuse |
| 1.50.4 | It has a numerator, recorded and never inferred |
| 1.50.5 | It can divide by it, and prints both rankings |
| 1.50.6 | It prices a ladder in both directions |
| 1.50.7 | It compares two arms and refuses a winner where there is none |
| 1.50.8 | It fails a build for quality, and refuses to blame what it cannot attribute |
| 1.50.9 | It finds what a dictionary cannot, and throws most of it away |
| 1.50.10 | It puts a name on the bill and never spreads the unallocated |
| 1.50.11 | It replays a contract on measured months, both directions |
| 1.51.0 | It audits itself in public |

### `trazum report --year`

```
The year 2026, from what was already written down

  $14,600 across 120 calls, over 4 recorded months.
  ! No record at all for 2026-05, 2026-06, 2026-07, 2026-08, 2026-09,
    2026-10, 2026-11, 2026-12. Those months are named rather than filled: a
    year that quietly covers part of itself and prints an annual total is
    wrong by the rest and says nothing about it.

  14 actions planned. 11 arrived, 1 did not, and 2 could not be judged.

  What this record cannot say
    · whether some promises were kept — they could not be judged from the logs
    · how many dollars the kept promises were worth
    · what any of the money bought
```

**No new data.** Everything comes from the store and the plans a team already
keeps, and nothing is computed that cannot be checked against a document that
already exists.

That constraint is the whole design rather than a limitation somebody accepted.
An annual report is the document most likely to be quoted out of the room it was
written in, and the one nobody goes back to verify — so it may not contain a
single figure this tool would refuse to print anywhere else. Which makes it,
correctly, mostly a summing exercise with a great many refusals attached.

### The figure it refuses to produce

**There is deliberately no `arrivedUsd` beside `projectedUsd`.**

A verification says whether each action *arrived*, and its `observed` map carries
where the money sits now — but the document has never carried a per-action figure
for the saving that actually landed. Summing one out of the observations would
mean deciding which of several numbers per action is "the saving", which is a
judgement the verification refused to make and this module has no standing to
make on its behalf.

So the year says what was promised and how many promises were kept, and says
plainly that it cannot put a dollar figure on the kept ones. The alternative — a
plausible number assembled here — is precisely the annual-report arithmetic this
document exists to replace.

### Three outcomes, never two, at the scale where it is hardest

"Eleven of fourteen actions arrived" reads better than "eleven arrived, one did
not, and two could not be judged". A year is where the temptation to collapse
them is strongest, and the second sentence is the one that tells somebody their
measurement has a hole in it.

Missing months are named rather than filled, for the same reason.

### It reports the record, not the team

No per-person anything, no velocity, no ranking of who planned well. The doctrine
rule from 1.44, and it matters most here: **an annual document is exactly where a
cost tool starts being used for performance review, and the way to not be is to
hold no data that could be.** A test asserts the document carries no field that
could name somebody.

### Our own medicine, in public

`docs/our-own-medicine.md`. This project gates other people's promises; a tool
that does that and never shows its own record has a double standard.

It lists what each arc **refused** to ship — because "did the chapters ship" is
the wrong measure when the plan and the implementation share a hand — what this
repository got wrong and for how long, and what it cannot say about itself.

The long ones are the interesting ones: a version claim wrong for **seventeen
releases**, and a roadmap running in two directions for **twenty-four**. Both were
claims nothing checked, and both drifted the moment somebody stopped hand-checking
them.

It ends without a score. Every miss on it was found by the same process that made
it, so a miss nobody noticed is by construction not on the page — and there is no
way to estimate how many of those there are without inventing a number.

### The standard carries its refusals

`conform` grows an outcome chapter and an annual chapter, so another tool
emitting this format has to handle a missing numerator the same way.

And **cross-field rules**, which the chapter did not ask for and the work
demanded. The refusals worth carrying turned out to be *relational*: a per-field
contract can say "a number or null"; it cannot say **"null when nothing was
recorded, and a number otherwise"** — and that is the whole refusal. A rate of `0`
is perfectly valid when calls were recorded and none of them succeeded, and a lie
when nothing was recorded at all, and the difference lives in a different field.

A standard that shipped the fields and lost that would be worse than no standard,
because it would look interoperable.

### The doctrine, second edition

Two rules added from this arc's own findings:

- **Cheaper per call is not cheaper per outcome.** A workload was found costing
  ten times more per call and half as much per resolution, and every ranking this
  product had printed until then was the first column.
- **An unallocated share is never spread.** It makes every figure wrong by an
  amount nobody can see, and worst for the teams whose instrumentation is
  cleanest.

Plus the two the arc's plan named in advance, which shipped with their chapters:
*a proxy refuses and never answers something else* (1.50.3) and *quality is
recorded, never inferred* (1.50.4).

### What this release found wrong in itself

**A zero dressed as a measurement, in the module written to forbid exactly
that.**

The annual record attached an outcomes object whenever *calls* were parsed rather
than whenever an *outcome* was recorded. So a year that recorded no outcome at
all still got an outcomes object reporting "0 of 120", and the honest sentence —
*no outcome was recorded this year, so nothing here says what the money bought* —
was unreachable code.

Caught by a test written for the sentence that could not print. The field's own
contract, three files away, forbids precisely this.

### What stayed out, and why

**Publishing this repository's own cost figures.** The chapter asks for "its own
cost figures, its own predictions and its own misses". The predictions and the
misses are in `our-own-medicine.md`; the cost figures are not, because **this
project has no usage log of its own.** It optimises LLM spend and does not itself
spend on LLMs in a way it measures. Writing a figure there would mean estimating
one, in the document whose entire purpose is to demonstrate that this project
holds itself to its own standard. The absence is stated in that document rather
than filled.

**A `--gate` on the annual record.** Every other report in this product can fail
a build and this one cannot. A year is a conversation, not a pipeline step, and a
gate on an annual document would either fire once a year (useless) or be run
monthly against a year that is not over (wrong). The three outcomes are printed
and nothing exits non-zero.

---

## 1.50.11 — "The commitment"

Chapter nine of `docs/plan-1.51.md`, and the highest-stakes instance of the
failure this whole product exists to end.

Providers sell committed-use and reserved-capacity deals. Every team that signs
one is doing arithmetic in a spreadsheet against a number they guessed — and
unlike every other guess this tool has replaced, this one is annual and signed.

```
A 12-month commitment: $3,000 a month at 20% off
  This is what the deal WOULD HAVE done on the traffic you actually had. It
  is a measurement of the past, not a prediction — every month below
  happened.

  month       list  would pay    saving
  2026-01   $5,000     $4,000   +$1,000
  2026-02   $5,000     $4,000   +$1,000
  2026-03  $600.00     $3,000   -$2,400
  2026-04   $4,000     $3,200  +$800.00

  Net over 4 measured months: $400.00.
  The months that cleared the floor saved $2,800.
  ! 1 of them fell short, and the floor you would have paid for capacity
    nobody used comes to $2,520. That figure is kept separate on purpose:
    netted into the line above it disappears, and the disappearing is what a
    vendor's slide relies on.
```

### Both directions, because one direction is the sales pitch

**Net positive, and one month cost $2,520.**

A commitment is a **floor** as well as a discount. Below the floor you pay for
capacity you did not use, and a saving quoted without that half is not an
analysis. The two figures are kept apart on the page — netted together the bad
month vanishes into a positive total, and the vanishing is precisely what makes
the vendor's version persuasive.

Three regions, and the table shows all of them:

- **Below the floor** you pay the floor for less usage than it buys, and the
  saving is negative.
- **Between the floor and full utilisation** the saving is `spend − floor`,
  which is real and smaller than the discount would suggest — the case a
  percentage headline hides completely.
- **Above full utilisation** the saving is the discount.

### An as-if calculation, and the wording never blurs it

"On the traffic you actually had, this commitment would have saved $X" is a
measurement of the past.

"You will save $X" is a claim about the future, and this product has refused
that at every scale since 1.27. Nothing here projects, extrapolates, fits a
trend or annualises a partial month, and the document carries
`provenance: 'measured-past'` so a machine reader cannot mistake it either.

### The shortfall risk is a count, not a probability

"Three of your last twelve months would have fallen short, and here they are" is
a measurement. "There is a 25% chance of shortfall" is a model of a distribution
nobody fitted, presented with the authority of arithmetic.

Only the first is available from a log, so only the first is printed — the count,
the named months, and the measured spread beside it.

### Partial months are dropped, never scaled

A fortnight replayed against a monthly floor is a shortfall the traffic never
had: half a month of usage judged against a whole month of commitment. Dropping
it costs an answer about that month; keeping it would manufacture one.

### The refusals

**Fewer than three whole months** and the answer is that this cannot be judged
from what exists, with how many more would settle it. A commitment is signed for
a year; an answer from one month is a year-long decision made on a fortnight of
evidence.

The break-even is stated anyway, because it is a fact about the **deal** rather
than about the traffic, and it is available before a single log exists.

**A history shorter than the term still gets an answer, with the gap marked.**
Six months against a twelve-month deal is a real answer about six months, and
refusing it would be less useful than saying so. What it must not do is go
unsaid — a twelve-month decision read off half a year with nothing on the page
marking the gap is the spreadsheet this command was written to replace.

### What this release found wrong in itself

**The action pins were pointed at the wrong commit, and a guard caught it.**

The README pins the Action to a SHA with the version in a comment beside it.
Advancing them for this release, I reached for the last merge SHA in hand — which
was the *feature* commit for chapter eight — and labelled it `# 1.50.10`. It is
not: 1.50.10 is the release commit that follows it.

The guard added in 1.31 resolves each pinned SHA and compares it against the
version the comment claims, and it failed by name three times, once per pin. A
reader following that pin would have got the Action from before the release it
was told it was getting.

Worth recording because the mistake is not carelessness with a SHA — it is that
**every release since 1.28 has had two candidate commits** for this and the wrong
one is always the more recent. The guard is what makes that survivable.

The other two were found by looking at a real table rather than by a test.

**`formatUsd` rendered a value just under a thousand in the wrong format.**
`5000 - 5000 * 0.8` is `999.9999999999999`. That is under a thousand to a
comparison, so it took the two-decimal branch and came out as **`$1000.00`** — a
string the thousands branch would never produce, sitting in a column beside
`$5,000` and reading as a different currency format for the same magnitude.

The branch is chosen on the **rounded** value now, so the boundary is the number
a reader sees rather than the number the machine holds. It has been wrong since
`formatUsd` was written, in every table where a figure landed within a cent of a
thousand.

**A signed column was using the unsigned formatter.** `formatUsd` renders a
negative as `$-2,400`, which reads as a typo. `formatSignedUsd` has existed since
1.30 for exactly this case — in a column where every row can go either way the
sign carries the whole meaning, so it belongs in front of the currency where a
reader expects it — and it was simply not reached for.

### What stayed out, and why

**Recommending whether to sign.** The command prints what the deal would have
done and stops. Whether to take it depends on how confident somebody is that next
year resembles last year, and that is a judgement about their roadmap rather than
about their logs — the same line `plan` has held since 1.38, where an action is
ranked and never taken.

**Tiered and blended commitments.** Providers sell deals with multiple floors,
step discounts and spend-based tiers. Each is a different arithmetic and the
shapes are not interchangeable; implementing one and letting it stand for the
others would price somebody's contract against terms it does not have. One shape,
correct, with its terms named on the first line.

---

## 1.50.10 — "Whose money"

Chapter eight of `docs/plan-1.51.md`, and the release that puts a name on the
bill.

The fleet answered *which service* in 1.37. Nobody has answered **whose
budget** — which is the question that decides whether anything else in this
product gets acted on. A report saying "the bill is $40,000 and here is $9,000
of savings" is read by four people who each assume it is one of the other
three's problem, and nothing happens.

```
Whose money

  owner      spend  budget  calls
  payments  $62.00   $8.00     62  over
  support   $38.00  $20.00     38  over
  platform      $0  $10.00      0  not measured

  ! platform has a budget and no measured calls. That is NOT under budget — a
    team whose logs never arrived passes every budget it has, forever, and a
    green tick beside their name says the opposite of the truth.

  ! Unallocated: $15.00 (13.0% of the bill), from internal-eval.
    It is not divided between the owners above, and it never will be.

  Shared, by a rule somebody wrote
    search: payments 60.0%, support 40.0%
```

### The rule worth breaking a module over

**The unallocated is its own line, and it is never spread.**

Splitting unattributed spend proportionally across the owners you *do* know is
the single most common lie in cost reporting. It is attractive for exactly one
reason: it makes the numbers add up and every line look complete.

What it actually does is make **every team's figure wrong**, by an amount nobody
can see, in a direction nobody can check. And it does it *hardest to the teams
with the cleanest instrumentation* — because their known spend is largest, so
they absorb the biggest share of somebody else's mystery. A tool that behaves
that way punishes the only people doing the thing it asked for.

So it stays a line of its own, with its own dollar figure, until a human claims
it. The labels in it are named on purpose: "unallocated: $15" invites somebody
to divide it, and "unallocated: $15 from `internal-eval`" invites somebody to
claim it.

It is loud deliberately. An unallocated share that grows quietly is a chargeback
report becoming fiction one month at a time.

### Shared cost is declared, and the rule travels with the report

A workload two teams use is split by a rule somebody wrote down, and the rule is
**printed beside the numbers**. That is the entire design: the argument then
happens about the rule — *why is search 60/40?* — rather than about the number,
which is an argument nobody can win because nobody can see where it came from.

Splits are keyed by the **exact label** rather than by a pattern. A shared split
is a negotiated fact about one workload; letting it match a glob would mean a
new label silently joining somebody's bill.

### A split that does not sum to one is an error, not a rounding problem

0.9 loses a tenth of that workload's money. 1.1 invents a tenth. Both silently,
while every line still looks complete — which is precisely what a chargeback
report exists to make impossible.

**The workload goes to unallocated whole.** Applying the 0.9 would put ten per
cent nowhere with nothing on the page to explain it; putting the whole workload
in the unallocated line places it somewhere visible, next to the problem that
caused it.

Also caught, and all reported at once rather than one per run — a config fixed
one error at a time is a config somebody abandons halfway and then never trusts:

- a split naming an owner `owners.patterns` never declared;
- a "shared" workload with a **single** owner, which is a pattern written the
  long way and where reading it as a share invites a second owner to be added
  without the first being adjusted;
- a negative share;
- a budget for an owner with no patterns, so nothing can ever land on it.

### An owner with no measured data is not an owner under budget

`fleetBudgetMissing` from 1.37, applied to people rather than services. A team
whose logs never arrived passes every budget it has, forever, and a report that
renders that as a green tick has told somebody the opposite of the truth.

**Every declared owner gets a line even with no traffic**, because that refusal
cannot be printed for somebody who is not on the page — and an owner absent from
the report is an owner nobody looks at.

Four verdicts, kept apart: `over`, `within`, `not-measured`, `no-budget`.

### One rule for pattern precedence

Attribution is by the most specific matching pattern — the same tie-break
`sources` and `budgets` use. Two rules for pattern precedence in one tool is one
rule too many.

### What this release found wrong in itself

**A hand-computed figure in a test was wrong.** The unallocated share in the CLI
suite was written as 13.0%, copied from a smoke test with a different fixture;
over the 85 calls the test actually builds it is 17.6%. The assertion failed on
its first run, which is the suite working exactly as intended.

Worth recording because it is the **second time this week** a figure computed by
hand into a test has been wrong, and both times **the code was right and the test
was not**. The lesson is not "check the arithmetic" — it is that a test asserting
a derived number should derive it, and the two that failed both asserted a
literal.

### What stayed out, and why

**Gating on an owner's budget in CI.** The verdicts are computed and printed and
nothing exits non-zero for `over`. A chargeback overspend is a conversation
between people, not a broken build: failing somebody's pipeline because another
team's workload crossed a line they did not set is a gate that gets removed the
first afternoon it fires. `--gate` belongs here eventually, scoped to *your own*
owner, and that scoping is the design work.

**Attribution by anything other than the label.** Attributing by model, by
source file or by time window are all reasonable and all mean a second
precedence rule competing with the first. The label is the workload, the workload
is what somebody owns, and one rule is the whole point.

---

## 1.50.9 — "The semantic pass"

Chapter seven of `docs/plan-1.51.md`, and the oldest deferred item in this
product finally shipping — with most of the release spent on the machinery that
throws the model's answers away.

### Why it waited seven years of releases

The rules engine has deferred paraphrase-level findings since 0.1.0 for one
honest reason. A dictionary cannot see meaning. And **a model that hallucinates
a finding is worse than a rule that misses one**: a missed finding costs
somebody nothing, and an invented one costs them an afternoon and the next
finding's credibility.

What changed is not the model. It is that this arc built a way to *check*.

### The price, before anything is sent

```
Semantic pass on prompts/support.txt

  This will send the prompt to Claude Opus 5: about 440 tokens in and 800
  out, roughly $0.0222. Estimated, not measured — a tool that spends your
  money to tell you how to spend less should be the first thing audited by
  its own arithmetic. Pass --yes to run it.

  Nothing was sent. Add --yes once you have read the price above.
```

Without `--yes`, that price is the **entire output** of a run. No provider is
looked up, nothing is sent, and the arithmetic comes from the local catalogue —
so the price works offline, which is the point.

### The model proposes; the deterministic layer disposes

The discipline `--suggest` has had since 1.6, applied to a harder claim. A
rewrite is checkable by construction: the replacement is either shorter or it is
not. A *semantic* finding is a claim about meaning, and the only part of it that
can be checked is the **evidence**.

So the evidence is checked, ruthlessly:

1. **Every quoted span must appear in the prompt character for character.** The
   strongest signal available. A model reporting on a prompt while paraphrasing
   what it quotes has stopped reading and started writing, and everything else
   in that response is suspect.
2. **The spans must be distinct and must not overlap.** A "pair" that is one
   passage quoted twice is not a finding about redundancy; it is a finding about
   nothing.
3. **A near-copy the rules engine already catches is dropped.** A model paid to
   re-report a deterministic finding is a model being paid for nothing, and the
   reader sees the same thing twice with two different confidences attached.
4. **A near-copy labelled a contradiction is rejected.** Two passages that say
   the same thing cannot contradict each other, and a model that mislabels one
   has made every other label in that response worth less.
5. **Nothing the model says about size is believed.** Tokens are counted here,
   from the spans, with the counter everything else uses.

**What did not survive is printed, with its reason.** A pass that showed only
its accepted findings would hide its own hit rate — the single most useful thing
a reader can know about whether to run it again.

### A ceiling, and a contradiction with no number at all

Merging a paraphrase pair means writing one passage that does the work of both,
and nobody knows yet how long that is. So the figure is what deleting the
smaller half would recover, **named as the ceiling it is** rather than presented
as a saving.

A contradiction gets no figure. It is worth fixing because the prompt is
**wrong**, not because it is long, and attaching a dollar amount would sell the
wrong reason to fix it — and the wrong reason is the one that loses the argument
when somebody pushes back.

### It never becomes a prerequisite

The deterministic core keeps working with no key, no network and no model. True
since 0.1.0, and this release does not get to change it. The way that stays true
is **structural**: the verification lives in the package that has no network,
and only the call lives in the CLI.

Three guards prove it, each with a planted probe: the verification module makes
no call of any kind — no `fetch`, no URL, no `process.env`, no `await`; nothing
the model returns is trusted about size; and the verbatim check runs before any
similarity work.

### What this release found wrong in itself

**A threshold that was wrong in the dangerous direction, with a comment
asserting it was right.**

The already-detected cutoff shipped at 0.8, and a comment claimed it matched the
deterministic pass. It did not: `rules.ts` drops a duplicate example at **0.92**.
Everything between 0.8 and 0.92 is a pair the rules engine does *not* catch —
and this layer was silently throwing those away. It was discarding exactly the
findings the chapter exists to surface, while its own comment said the opposite.

The constant is 0.92 now, and a test reads the threshold **out of `rules.ts`**
and compares them, so the two can never drift apart again.

**A guard that guarded nothing — and the probe is what caught it.**

The check that the verbatim test runs before any similarity work compared the
first occurrence of `'span-not-found'` against the first `jaccard(`. But
`'span-not-found'` appears in the *type union* near the top of the file, so it
always came first and the assertion passed whatever the loop actually did.
Planting the reordering left it green.

It is bounded to the function body now and fails on the probe. This is the
**seventh** time in this repository an assertion was bounded by something other
than its subject, and the **first** time the probe caught it rather than a later
release finding it by accident. The rule "prove a guard by breaking it" earned
its place today.

### What stayed out, and why

**Applying a semantic finding.** `--suggest` can apply its rewrites because a
rewrite is a mechanical substitution. Resolving a paraphrase pair means writing
one passage that does the work of two, which is an authoring decision with taste
in it — and a tool that merged two instructions automatically would change what
a prompt asks for while reporting a token saving. The findings are shown with
their line numbers so somebody can go and do it.

**A cache.** `--suggest` has one and this deliberately does not. A cached
semantic finding is last week's reading of a prompt that has since been edited,
and the whole value of this pass is that it read *this* text. The suggest cache
exists because a rewrite proposal is cheap to re-check; a semantic finding is
not.

---

## 1.50.8 — "The quality gate"

Chapter six of `docs/plan-1.51.md`, and the release that closes the loop this
product has been running open since 0.1.0.

CI has been able to fail a build for tokens since 1.4 and for dollars since
1.21. A prompt edit that quietly made the product worse has never been
gateable — which means **every saving this tool has ever recommended went into
a repository with its most important consequence unmeasured.**

```
Quality across the change: support
  This is a before-and-after, not an experiment. It splits traffic by time
  rather than at random, so everything else that changed at the same time is
  in the difference too — which is why it says "cannot tell" far more
  readily than an A/B would.

  before 71.0% (8,400 outcomes)   after 64.0% (8,400 outcomes)

  ✗ The resolution rate moved from 71.0% to 64.0% on 16,800 measured outcomes,
    and this change saves $0.5000 a call. Both halves are measured; neither is
    an estimate.

  Gate failed: a measured drop with nothing else to explain it.
```

That is the sentence the plan asked for, and the sentence teams actually argue
about: both halves, both provenances, one line.

### The deviation, and why

The chapter specified `check --against-outcomes`. It shipped as **`trazum
quality`**.

`check` reads *prompt files* and gates on tokens. It has never opened a usage
log, and a command that takes either a prompt or a log depending on which flag
is present is two commands wearing one name — the reader has to know which one
they are running before they can read the help. The split-by-time this needs is
also not a `check` idea: there is nothing in a prompt file with a timestamp on
it.

### It is a before-and-after, not an experiment

Worth the first paragraph of the module, because the arithmetic is
`experiment`'s and the epistemics are not.

An experiment splits traffic **at random**, so the two arms differ only in the
thing under test. A before-and-after splits it by **time**, and everything else
that changed at the same moment is in the difference too.

So most of this module is spent looking for reasons *not* to blame the prompt,
and it reports `cannot-tell` far more readily than a randomised comparison
would. That is not timidity. **A gate that blames the prompt because the prompt
is the thing it can see will be switched off within a month, and a switched-off
gate catches nothing at all.**

### The three confounders it can see

**The model mix moved.** The drop may be entirely somebody else's migration,
and no amount of statistics separates the two from one label's numbers.

**The volume moved.** A workload whose traffic doubled is usually a workload
whose *population* changed — a new surface, a new customer, a campaign — and the
questions being asked are not the questions from before.

**Outcome coverage moved.** The subtle one, and the one nobody thinks of: if the
share of calls recording an outcome changed, the two rates describe different
populations. A team that starts instrumenting its hard cases sees its measured
rate fall without anything having got worse. Comparing two rates over
differently-selected populations is the most convincing wrong answer this module
could produce.

Any of them present and the verdict is `cannot-tell` **with the confounder
named** — a refusal to blame, not a hedge attached to a blame.

**They print on every verdict, including green ones.** A rate that held while
the model changed underneath is not evidence that the prompt is fine either, and
hiding the confounder on a passing run is how a gate teaches people to trust it
in exactly the case it should not be trusted.

**A confounder outranks the statistics.** It is checked after the sample sizes
and before the verdict, so a build is never failed on a difference that
something else could equally explain — even when the drop is enormous and
statistically unambiguous. A test proves that with a 90%-to-10% collapse on a
changed model: still `cannot-tell`.

### Three outcomes, never two — and this one has an exit code

"Not measurably worse" is **never** "held". A gate that spelled them the same
way would pass a real regression it merely lacked the power to see, and this is
the first gate in the product wired to a build.

`cannot tell` exits **2**, not 0. A gate that exited green on every underpowered
window would be a gate nobody ever saw fire.

### A hundred outcomes a side

Not the ten a rate needs elsewhere in this product. This one fails builds, and
the two errors are not symmetric: the cost of a wrong `dropped` is somebody
reverting a good change and losing the saving; the cost of a wrong `cannot-tell`
is waiting a day.

### One implementation of the comparison

The statistics are `experiment`'s, deliberately — the same Wilson intervals and
the same Newcombe difference. Two implementations would mean a gate and a
deliberate A/B could disagree about the same two numbers, and a team that ran
both would trust whichever answer they preferred.

### What it cannot see, said out loud

Everything else deployed that day. A `dropped` verdict states that the rate fell
and the three things it can check did not move. That is a smaller claim than
"the prompt did it", and it is the largest claim the evidence supports.

### What stayed out, and why

**Posting the sentence on a pull request.** The chapter asks for it and the
Action already comments; what it does not have is the *timestamp* of the change,
which is the input this gate cannot work without. A PR comment would have to
guess the boundary from the merge time and would then judge a change against
traffic that predates its deploy — reporting a regression for a change that was
not live yet. Wiring it properly means the Action knowing when a deploy
happened, which is a fact about somebody's pipeline rather than about their
repository.

**Attribution across labels.** A drop in one workload that coincides with a rise
in another is often one population moving between them, and this gate judges one
label at a time by design. Seeing that pattern needs a cross-label view and a
rule for what counts as "moved", and a wrong rule there would manufacture
confounders as confidently as the naive version manufactures blame.

---

## 1.50.7 — "The experiment"

Chapter five of `docs/plan-1.51.md`. `eval` compares two prompts on cases
somebody wrote; `route` compares two models on the same. Both measure agreement
in a laboratory. **The traffic is the only place the real question gets
answered** — and the moment a comparison runs there, three failures become
available that a laboratory does not have.

```
Experiment: prompt-v2 against prompt-v1

  prompt-v2  80.0%  (800 of 1,000 recorded)  95% [77.4%, 82.4%]
  prompt-v1  50.0%  (500 of 1,000 recorded)  95% [46.9%, 53.1%]

  ✓ prompt-v2 wins. The difference is between 26.0% and 33.9% at 95%
    confidence — the whole interval is on one side of zero, which is what
    "wins" means here.

  Stopping rule honoured: both arms cleared 1,000 recorded outcomes.

  prompt-v2 resolves more and costs more. One extra success costs $1.67 —
    that figure, not the rate, is what the decision turns on.
```

### Failure one: a winner where there is none

Two arms always produce two numbers, and one of them is always larger. An A/B
report that names a winner from that is a coin flip with a dashboard.

The verdict is **three-valued**, the way `verify`'s has been since 1.39 — and
the third value is not a shrug:

```
  · Not separable on this traffic: the 95% interval on the difference includes
    zero. One number is larger, and that is not a finding. About 2,449 outcomes
    per arm would settle the difference observed so far.
```

"Not significant" tells a reader nothing about whether to wait a day or abandon
the idea. **2,449** is an instruction somebody can act on. It is a two-proportion
power calculation at 95% confidence and 80% power, on the difference observed so
far — an estimate about something that may itself be noise, and offered as "how
much longer" rather than as a promise.

**When both arms record the same rate the figure is `null`, not a very large
number.** No sample size separates a difference of zero, and a big figure would
read as "keep going" when the honest answer is that there is nothing here to
find.

### Failure two: peeking

A test stopped on the first afternoon it looked good is not a test.

`--min-outcomes` is **required**, and that is the whole point of it: a stopping
rule declared after looking at the numbers is not a stopping rule. Nothing here
can *prevent* an early read — nobody can stop somebody looking at a number — but
it can make the early read **visible to whoever reads the result later**, which
is the part that survives the afternoon:

```
  ! Read early. The declared rule was 1,000 outcomes per arm and a has 100.
    Nothing can stop a number being read early; this line exists so whoever
    reads the result later can see that it was.
```

**Printed whether or not the arms separated.** A separable result read too early
is still separable *and* still read too early. Collapsing the two would hide one
of the facts, and it is always the inconvenient one that goes.

### Failure three: quality reported without its price

The interesting arm is almost never better *and* cheaper. It is better and
dearer, and the decision turns on a figure nobody computes: **what one extra
success costs.** The difference in spend over the difference in successes.

**Per call on both sides**, so arms that took different shares of the traffic
compare. Dividing raw totals would report a marginal cost that moves when the
split changes and the behaviour does not — a number that reacts to a routing
decision and looks like a finding about quality.

When the better arm is *also* the cheaper one the figure is null rather than
negative: nothing is being bought, and a negative "cost per extra success" is a
number people quote without the sign.

### The statistics are shown, not asserted

Wilson score intervals per arm, Newcombe's interval on the difference. Both
chosen because they behave at the sample sizes an experiment actually starts
with — at 10 of 10 a symmetric interval runs past 1, and in a real experiment
that is not an edge case, it is most of the first week.

The intervals are **returned**, not just the verdict. A reader who disagrees
with the threshold can see the numbers it was applied to, which is the same
discipline `eval` established by running the original twice before judging
anything against it.

An undeclared outcome value stays out of both arms: a typo in an exporter must
not decide an experiment.

### Nothing is auto-promoted

A winner is a finding. Taking it is a decision with a name attached, and it
belongs in the plan like everything else. The command says so in its last line,
because a tool that prints "prompt-v2 wins" and nothing else invites somebody to
treat the printing as the deciding.

### What stayed out, and why

**Splitting the traffic.** The chapter describes arms "split across real traffic
through the gateway", and this release reads arms from labels that already exist
in a log. Assigning traffic to arms is a routing decision made *before* the
call, in the caller's own code or in the gateway — and doing it in the gateway
would mean the proxy choosing which model answers, which is the one behaviour
1.50.3 built its type system to prevent. The honest split is the caller's, and
the honest name for what shipped is "judge two arms", not "run an experiment for
you".

**Sequential testing.** The power calculation assumes a fixed sample, and a
report read repeatedly against a fixed-sample threshold inflates its own false
positive rate — which is exactly the peeking problem, one level up. Doing it
properly needs an alpha-spending function and a declared analysis schedule, and
half of that is worse than none: it would make the peek line say "honoured"
while the statistics quietly stopped being valid.

---

## 1.50.6 — "The ladder"

Chapter four of `docs/plan-1.51.md`. Two ladders, configured identically:

```
  support  claude-haiku-4-5 → claude-opus-5
    $0.2000 a call cheap, $1.00 dear. Break-even escalation rate: 80.0%.
    Measured: 10.0% (10 of 100 calls escalated).
    ✓ Saving $0.7000 a call against never having built it.

  triage  claude-haiku-4-5 → claude-opus-5
    $0.2000 a call cheap, $1.00 dear. Break-even escalation rate: 80.0%.
    Measured: 90.0% (90 of 100 calls escalated).
    ✗ Costing $0.1000 a call MORE than never having built it.
```

One saves seventy per cent a call. The other costs ten per cent **more** than
never having built it. The configuration is the same; the only difference is a
measured escalation rate that no configuration file can show you, and that
nobody was computing.

### The arithmetic nobody does in their head

"We route to the cheap model first and escalate on failure" describes both of
those policies equally well. What separates them is that **an escalation pays
twice** — the cheap attempt is not refunded — so:

```
with a ladder:  cheap + rate × dear
without one:    dear
```

Those are equal at `rate = (dear − cheap) / dear`. Below it the ladder saves;
above it the ladder is a more expensive way to get the same answers. It is the
same head-arithmetic error `plan` was built to kill in 1.38, and worse here,
because the mistake compounds with traffic and nobody notices until a quarter
is over.

### Three decisions inside the arithmetic

**A multi-rung ladder is priced against its top rung**, never its middle. The
alternative to a ladder is the model that would have been used without one,
which is the top; comparing against the middle reports a saving against a model
nobody was going to use.

**No sign is claimed within two points of break-even.** Inside that band the
answer flips on ordinary week-to-week variation, and reporting "saving" on
Monday and "costing" on Thursday from an unchanged policy teaches a reader to
ignore the figure — which is worse than not printing it.

**An undeclared value is out of the denominator as well as the numerator.** With
90 resolved, 10 escalated and 100 misspelled, counting the typos reports a 5%
escalation rate instead of 10%. A control loop judged on half its real
escalation rate is a control loop nobody switches off.

### The signal is the caller's, and this is the sharper case

`outcome` refuses inference because a report built on a guess prints a wrong
number. A ladder refuses it for a harder reason: **this is a control loop.** A
control loop built on a guess sends real traffic to a more expensive model on
the strength of that guess, forever, and bills for it. Not from length, not
latency, not refusal text, not a stop reason, not a retry.

**`escalateOn` is required and never defaulted.** "Anything that is not a
success" is the tempting default and it is wrong: adding a word to the
vocabulary would silently start sending traffic to a dearer model. A control
loop must not change behaviour because somebody wrote documentation.

### `validateLadder`, and the most expensive typo in the file

A ladder that escalates on a value declared a **success** pays twice for work
that already worked, on every single call, while looking exactly like a
cost-saving measure in the config. It is caught before anything is measured,
because printing its measured position first would bury it under a number.

Also caught: a ladder naming an undeclared value, which never fires and says
nothing; rungs that go **down**, which is not a ladder but a routing rule that
escalates to something cheaper and reports a saving for it; duplicates; unknown
models; and one-rung ladders. All reported at once rather than one per run,
because a config fixed one error per run is a config people give up on.

A misconfigured ladder **exits 1**. It is the one finding here that is wrong
*now* rather than a measurement somebody should look at; everything else exits
0, like `doctor`.

### What Trazum does not do, said in the output

It does not run the escalation. A ladder escalates *after* a failure is known —
after the answer came back, and usually after something downstream judged it —
so the retry belongs in the caller's own loop rather than in a proxy sitting on
one request. A command that printed ladder arithmetic without that line would
read as a feature that routes traffic, and it is not one.

### What stayed out, and why

**The gateway executing tier zero.** Sending the first attempt to the cheap
model is something the gateway *could* do — it is a configured substitution, and
that machinery shipped in 1.50.3. It is not here because a ladder's first rung
and a budget refusal's substitution look identical in the record and mean
completely different things: one is "we always try this first" and the other is
"you are out of money". Merging them would make the store unable to tell a
policy from an emergency, and `verify` unable to judge either.

**Judging a ladder in `verify`.** The chapter asks for it and it needs the
before-and-after the store does not yet keep for a policy change. Inventing the
"before" from the current config would be reconstructing rather than recording,
which this repository refuses everywhere else.

---

## 1.50.5 — "Cost per outcome"

Chapter three of `docs/plan-1.51.md`. 1.50.4 recorded the numerator; this
divides by it — which sounds like arithmetic and is almost entirely a set of
decisions about when **not** to do the arithmetic.

### The finding a total cannot make

```
What an outcome costs
  workload  per call  per success  recorded
  dear         $1.00        $1.00    100.0%
  cheap      $0.1000        $2.00    100.0%

  Cheapest per call and cheapest per success are different orders, and both
    are printed rather than one being picked. A workload can move up one while
    moving down the other, and somebody optimising on the first number would
    be moving the wrong one.
  → cheap is #2 by cost per call and #1 by cost per success.
```

`dear` costs **ten times more per call and half as much per resolution.**

That is the whole chapter in one table. Every ranking this product has printed
since 0.1.0 has been the left-hand column, and anybody acting on it in a case
like this one has been optimising the wrong number — confidently, with a tool
agreeing with them.

### Which bill is the numerator, and why it is not the obvious one

The obvious implementation divides the **whole** slice bill by its successes.
It is wrong, and wrong in the flattering-to-nobody direction: a call that
carried no outcome is spend with no chance of ever appearing in the
denominator, so the ratio comes out inflated by exactly the uninstrumented
share — silently, and by an amount invisible from the figure itself.

A team that instruments half its traffic reads a cost per resolution **twice**
the real one. They conclude the feature is uneconomic. They kill it.

So the numerator is **recorded spend only**. That makes the figure a ratio over
a sample, which is acceptable for exactly two reasons and no others: the
coverage is printed beside it every single time, and below a floor it is not
printed at all.

### Five reasons a figure is withheld, each named where the figure would be

| Cell | Meaning |
| --- | --- |
| `3 so far` | Fewer than ten recorded successes. A figure over fewer than ten observations moves more from one more observation than from anything a team could do about it — the refusal `route` makes about small case sets and `history` makes about short runs. |
| `50.0% covered` | Below the 80% coverage floor, the same one `watch` uses for a measured day. A ratio over an unknown denominator. |
| `none succeeded` | Money spent, nothing resolved. A real and alarming measurement, reported as one rather than as a division by zero dressed up as a figure. |
| `not recorded` | This workload carried no outcome, sitting beside one that did. |
| `no vocabulary` | Nothing declares what success means. |

**A withheld slice has no rank.** It is left out of the per-success ordering
entirely, because giving it a position would place it on the strength of a
number this module explicitly declined to state — and a reader who sees a rank
assumes a rate.

### Two orders, and the product prints both

Cheapest per call and cheapest per outcome are different orders. Picking one
would be this tool making exactly the judgement it spent 1.50.4 refusing to
make. Both are returned, and the disagreement between them is reported as the
finding it is.

### Nothing prints when nothing recorded

With no outcome anywhere in the log the section does not appear. The coverage
section below already names the missing field and what it would unlock, and a
table of `not recorded` rows above it would be the same sentence in a grid. The
case worth showing is the **mixed** one, where a silent workload sits next to a
measured one and the difference is the point.

### What this release found wrong in itself

**The disagreement test missed the sharpest case there is.** It flagged a slice
whose two ranks differ by more than one place — and with two rankable slices a
*complete reversal* is a distance of exactly one. The clearest possible instance
of the finding was being filed as noise. A change at the top now counts
regardless of distance: whoever is dearest per call and whoever is dearest per
resolution are the two names in the conversation, and them being different names
is the entire point of computing both.

**A fixture whose two ratios were accidentally equal.** The first version of the
ranking test built a "cheap" workload and a "dear" one that both came to exactly
$1.00 per resolution, so the test written to prove the two orders diverge proved
nothing at all. It was caught because the assertion failed, not because anybody
checked the arithmetic — which is luck, and worth writing down as luck.

### What stayed out, and why

**Per-outcome figures in `plan`, `verify` and `history`.** The chapter lists
them and they are not here. Each needs a decision this release did not make:
`plan` ranks actions by money saved, and an action that saves money while
raising the cost per resolution is a *worse* action that would rank higher —
so the ranking needs rethinking rather than a column adding. `verify` would need
to judge whether a promised saving arrived *and* whether the outcome rate
survived it, which is two verdicts where the document has one. Both are real
work, and doing either badly here would put a number in front of somebody that
looks like the ones above and is not.

**Per-source figures for the fleet.** The tally is sliced by label and by model
and not by source, because source assignment happens over file paths in the CLI
rather than over records in the core, and threading it through is a change to
`assignSources` rather than to this module.

---

## 1.50.4 — "The outcome"

Chapter two of `docs/plan-1.51.md`, and the release that gives every other
figure in this product something to be a fraction *of*.

### The gap this closes

Everything Trazum reports is a cost. It can tell you a workload got forty per
cent cheaper and it cannot tell you whether it stopped working — a denominator
with no numerator, since 0.1.0. Every "saving" this tool has ever printed came
with an unstated and unfalsifiable assumption: that the cheaper version still
does the job.

The missing field is not something this tool can compute. **It is something
only the caller knows.**

### One field, beside `label` and `session`

```jsonl
{"model":"claude-opus-5","label":"support","outcome":"resolved","usage":{...}}
{"model":"claude-opus-5","label":"support","outcome":"escalated","usage":{...}}
```

Read from `outcome` or `trazum_outcome`, for the same reason `session` is read
from `conversation_id` too: a field nobody sets measures nothing, and making its
adoption a chore is exactly how that happens.

### The vocabulary is declared, not guessed

```json
{ "outcomes": { "values": ["resolved", "escalated", "abandoned"], "success": ["resolved"] } }
```

```
Outcomes
  outcome                calls    spend
  escalated  —              12   $11.07
  resolved   success        40   $10.30
  resolvd    undeclared      3  $0.7725

  48.2% of $21.37 in declared outcomes succeeded — by spend rather than by
    call, because the two diverge exactly when the expensive half is the half
    that fails.
  ! 12.2% of the bill ($3.07) carried no outcome, and is in neither half of
    the rate above.
  ! Not declared in "outcomes.values": resolvd. Named rather than counted as
    failures — a typo in an exporter should look like a typo, not like a
    product regression.
```

### The rate is by spend, and that is not a detail

Forty of those fifty-five calls succeeded. **73% by call. 48.2% by spend.**

The expensive half of the traffic was the half that failed, and the
call-weighted figure would have read as a healthy product. The two numbers
diverge exactly in the case somebody needs to see, which is why only one of them
is printed and why the sentence beside it says which one it is. This product's
whole subject is money; a rate that ignores it is a rate about something else.

### `outcomes.success` is required, and may be empty

The single most important line in the schema.

**Required**, because which of your words counts as success is a judgement about
your *product* rather than your bill, and this tool has no standing to make it. A
tool that decided `escalated` was a failure would be wrong at every company where
escalation is the correct, designed outcome for a whole class of request.
Leaving the field optional would have sent that question straight back here, to
be answered by a default nobody chose and everybody inherited.

**May be empty**, because a product that records only failures has declared
something real. The report then says it cannot state a rate rather than inventing
one, and names which of the two reasons applies.

### Never inferred

No absence of complaint counts as success. No short conversation counts as
resolution. No retry counts as failure. No `end_turn` counts as anything.

Every one of those is plausible, wrong often enough to matter, and would become
a metric somebody optimises against — which is how a tool ends up rewarding
conversations that ended early because the user gave up.

**Three guards enforce it, each proven by planting the violation:** the outcome
module may not mention `session`, `stop_reason`, `truncated`, a timestamp, a
retry or a repeat; the parser's assignment is compared *exactly*, so no
`?? 'resolved'` fallback can be appended to it later; and the rate's type must
stay `number | null` with a `noRate` beside it.

### Nothing recorded is not a rate of zero

A rate of zero is a real and terrible measurement. "Nobody told us" is a
different sentence. A tool that spelled them the same way would report 0%
success for an uninstrumented product and get somebody fired over a number that
measured nothing.

`successShareOfRecordedUsd` is `null` in that case, and `noRate` says which of
`nothing-recorded` and `no-success-values-declared` it was. Three outcomes,
never two — the posture `verify` established in 1.39.

### An undeclared value is named, never bucketed

A misspelled `resolvd` is a broken exporter. Folding it into the failure side
would report a product regression that never happened, which is the direction
that gets somebody paged at four in the morning. It is excluded from **both**
halves of the rate and listed by name.

### Every rate carries what it does not cover

The share of the bill that recorded no outcome is printed beside the rate, every
time. A rate over an eighth of the spend is a rate about an eighth of the spend,
and putting it next to a total without that line is how a sample becomes a claim
about the whole.

### The privacy line does not move

An outcome is a small enumerated value. `outcomeTally` is an aggregate — value,
calls, dollars — and never a list of calls, the same shape the store has kept
since 1.42. Counting outcomes never means keeping conversations, and a guard
asserts the module's shape rather than trusting the intention.

### What this release found wrong in itself

**An assertion bounded by a phrase rather than by its subject.** The cache-TTL
test asserted that the whole report contained no `cannot say whether`. The new
outcome-coverage line says "cannot say whether it stopped working", for entirely
unrelated and entirely correct reasons — so a true assertion began failing on a
sentence about a different subject. It matches the TTL hedge's own two sentences
now.

**Sixth occurrence of this shape in the repository, and the second this week**
— after the `init` and `feedback` source harvests bounded by `commandModels`'s
name in 1.50.3, and four in `docs/json-output.md` before them. The pattern is
always the same: an assertion whose boundary is *whatever happens to come next*
rather than the thing it is about. It is now worth stating as a rule of its own,
and it is in the doctrine.

**Three test fixtures that quietly stopped being what they claimed.** A record
called `complete` in `field-coverage.test.js` was no longer complete the moment
`outcome` joined the optional fields, and a `deepEqual` on `fieldCoverage`
listed six fields where there are now seven. Both failed loudly, which is the
suite working — a "complete" fixture that silently stayed passing after a field
was added would have been the real problem.

### What stayed out, and why

**Cost per outcome, the ratio itself.** That is chapter three, and it needs a
decision this release deliberately did not make: what to do about the spend that
carried no outcome. Dividing the whole bill by the resolved calls charges the
uninstrumented traffic to the instrumented outcomes and reports a cost per
resolution that is too high by however much of the log is uncovered — silently,
and in the direction that makes a product look worse than it is. Naming that
choice is the work, and it deserves its own release rather than a paragraph at
the end of this one.

**Outcomes through the gateway.** The gateway sees a call at the moment it is
made and an outcome is known afterwards, usually by a different part of the
system. Accepting one on the request would mean accepting a claim about a call
that has not happened yet. That is a real feature — an endpoint that attaches an
outcome to a call already recorded — and it is a different one.

---

## 1.50.3 — "The gateway"

Chapter one of the arc in `docs/plan-1.51.md`, and the first thing this
product has ever been able to do rather than report on.

### Why in the path at all

`trazum serve` answers *what will this cost and is there budget* in single-digit
milliseconds, and an implementation may consult it and ignore it. `spend_guard`
gives an agent the same answer in a shape it can act on, and an agent may ignore
that too. **Advice an implementation can skip is advice a budget cannot rely
on.** And a connector pulls usage after the fact, because a provider's export is
a batch job on somebody else's schedule — so the runaway is always reported
after it ran.

Standing between the caller and the provider fixes both.

```bash
trazum gateway anthropic --on-cannot-tell fail-closed
```

Point your SDK's base URL at what it prints and change nothing else. It speaks
the provider's own wire format, so there is no new client, no wrapper and no
code change.

### It refuses; it does not substitute

A call over budget is rejected with **HTTP 402** and the cheaper alternatives
named. It is never silently swapped for a smaller model, never trimmed, never
downgraded in flight. The caller asked for something specific, and a proxy that
quietly answers a different question is worse than one that fails — the failure
is visible and the substitution is not.

**That is enforced in the type, not in a comment.** A decision from
`gatewayDecision` is either `forward`, which carries nothing the caller did not
send, or `refuse`, which carries no body at all. There is no shape in which the
core hands back a modified request, so substitution cannot arrive one refactor
later wearing a reasonable name — it would have to change a type that every
caller and every test reads.

### 402, and never 429

Worth its own heading because it is the sort of detail that only shows up in
production, at scale, at the worst moment.

**Every provider SDK retries a 429 automatically.** That is what the code means
to them. Answering a budget refusal with one would turn a single refusal into a
retry storm against a gateway that will refuse every time — driven by the
caller's own client library, with nobody having written a loop. 402 Payment
Required is both literally correct and in nobody's default retry list.

A **502** with `trazum_upstream_unreachable` is kept strictly distinct. A caller
needs to tell *your provider is down* from *you are out of money*, and a proxy
that blurred them would send somebody to fix the wrong thing at the worst
possible moment.

### Failure is a decision the operator makes in advance

`--on-cannot-tell` is **required and has no default.**

| Policy | What happens | What it costs |
| --- | --- | --- |
| `fail-open` | The call goes through, and the record says it was **unjudged** | The bill keeps running while nobody is watching |
| `fail-closed` | The call is refused | The product stops working |

Both are defensible and only the operator knows which failure their product can
survive. Picking one for them would be the most consequential decision in
somebody's architecture, made silently at install time, by a tool they installed
to *reduce* surprises.

The fail-open half matters as much as the refusal: the call is forwarded **and**
the fact that nothing judged it is carried, so no later report can read it as
"within budget". Unjudged and under budget are different, and only one of them
is good news.

### Substitution, if you want it, written down

`spend.substitute` in the config, by model id, each with the operator's own
`reason` — required, for the same purpose a waiver's reason is: a substitution
nobody wrote a reason for is a caller being answered a different question, with
nobody able to say why six weeks later.

Every substituted call is **marked** in the record, so no later report treats it
as the call the caller made. It is a separate decision *kind* rather than a
`forward` with a changed model, precisely so nothing downstream can conflate
them.

And it **never fires because the gateway could not judge.** Swapping a model
because a *budget* could not be read would be answering a different question for
a reason that has nothing to do with the caller's request. Configured
substitution plus fail-closed is a refusal, not a swap.

### The credential is not even borrowed

The connector's rule since 1.41 is *a credential is borrowed, never held*. This
is stronger: the caller's own `authorization` and `x-api-key` headers are
forwarded **untouched and never read**. Trazum holds no key for the gateway and
has no way to make a call of its own through it.

The guard checks for the *absence of any read*, not for the absence of a log —
code that reads a secret and happens not to log it today is one refactor from
logging it tomorrow.

### Five guards, each proven with a planted probe

1. **The upstream is compiled in.** A flag naming the host would make this a
   credential-forwarding open proxy: anything that could rewrite a config on
   disk could point a company's API key at a machine it chose.
2. **The credential is never read.**
3. **Nothing about the payload is written down**, and the interfaces have
   nowhere to put it: `gatewayDecision` is handed a *description* of the call
   and never a body, and the recording callback takes counts. The promise is a
   fact about the interface rather than a discipline somebody maintains.
4. **`forward` cannot carry a request**, asserted against the type.
5. **The refusal is 402**, asserted against the handler.

Plus loopback binding with exactly one definition of the address, and exactly
one forwarded path — the one that spends tokens. A gateway that forwarded any
path would be a general proxy for somebody's API key.

### What this release found wrong in itself

**A guard against a redirected credential that a lookalike host satisfies.**
CodeQL flagged the compiled-in-upstream check as two unanchored host patterns.
It was right about more than the lint: `assert.match(text,
/https:\/\/api\.anthropic\.com/)` also passes on a source edited to say
`https://api.anthropic.com.evil.com` — which is the *single substitution*
somebody attacking that file would make. The guard existed to stop exactly that
and would have watched it happen.

It extracts the origins and the paths and compares them exactly now. Proven by
planting `api.anthropic.com.evil.example` and watching it fail by name.

**Two source harvests bounded by their neighbour's name.** The `init` and
`feedback` security guards sliced from their function to `commandModels` *by
name*, so inserting `commandGateway` between them silently widened both — and
one immediately started reporting on its neighbour's source, failing on a
`config?.` that belonged to a different command. This is the same failure the
`docs/json-output.md` parity harvests have had five times, in a different file.
Both are bounded to the *next function*, whatever it turns out to be, and the
first-run contract harvest — last in its file and therefore unbounded — was
bounded before the section that would have broken it.

**The gateway merged with no changelog entry.** The script that writes one
asserted on `Unreleased: Nothing yet`, which had stopped being true when the
roadmap fix merged, so it aborted — and the `git commit` on the next line of the
same shell ran regardless. **Third time.** 1.45's notes recorded the second and
said a rule that fails silently once will fail silently again; the lesson that
keeps not being learned is that writing the entry and making the commit belong
in one operation rather than two lines of a shell.

### What stayed out, and why

**Streaming responses.** The gateway reads the whole response to take the
provider's own token counts out of it, which a streamed body does not carry
until the final event. Forwarding a stream while measuring it is a real feature
and a different one — it needs the event framing of each provider parsed, and a
half-parsed stream is a corrupted answer rather than a missing measurement. A
non-streaming gateway that works is worth more than a streaming one that
occasionally garbles a reply.

**Writing the measured calls into the store.** They are reported to the
operator's terminal as they happen and go no further. The store's records are
provider-pull buckets with an identity that resolves duplicates across pulls;
per-call gateway records are a different grain, and merging them without
deciding how the two reconcile would double-count the moment somebody ran
`trazum connect` for the same period. That reconciliation is chapter two's
problem, and it is a design decision rather than a line of code.

---

## 1.50.2 — "The feedback loop"

### The problem this release actually has

Trazum has no telemetry. No ping, no install hook, no anonymous counter, no
crash reporter — not in the CLI, the library, the MCP server or the web app.
That is deliberate and it is not going to change: a tool whose entire argument
is that it reads your bill without uploading it cannot also be quietly reporting
on you.

The cost of that position is real and worth naming. **Nobody here can see how
many people run this, which commands they use, or what breaks.** Downloads count
CI runners and registry crawlers. Stars are a different popularity contest. The
only signal that carries a reason is what somebody chooses to say — so the least
this product can do is make saying it one word.

### `trazum feedback`

```
Telling us something
  This command sends nothing, and neither does anything else here.

Where
  A rule changed what a prompt asks for — the report that matters most:
    …/issues/new?template=wrong_optimisation.yml
  Anything else that is wrong:            …/issues/new?template=bug_report.yml
  A question, or an idea you are not sure about:            …/discussions
  A security problem — privately, never a public issue:     …/security/advisories/new

What a maintainer will ask for
  Trazum 1.50.2
  Node v22.22.2
  linux x64
  locale en
  That is the whole of it. Nothing about your work is here.

A blank issue with the above already filled in
  https://github.com/Davmunrey/Trazum/issues/new?body=…
```

The link is **printed in full before it is offered**, so nothing travels that
the sender has not read. And the command does not open it — launching a browser
is a way of making a request happen, and a request somebody did not read is not
one they consented to, however small.

**Nothing about their work is in it.** Not the config, not a prompt, not a
label, not a figure, not a path. Those are precisely what a good report needs
and precisely what only the reporter can decide to share. A command that
helpfully attached them would be the leak this product exists not to be — and
the worst kind, because they would have pressed the button themselves.

### The guards, and why this command needed them most

Four, each proven the way this repository proves a guard: plant the violation,
watch the test fail by name, remove it, watch the suite go green.

1. **It may not reach the network.**
2. **It may not open a browser**, or spawn anything at all.
3. **Nothing about the person reaches the prefilled body** — checked as
   *property reads*, so a config value cannot be interpolated in without the
   build going red.
4. **No published package may declare an install hook.** `preinstall`,
   `install`, `postinstall`, `prepublish` — that is how a CLI usually acquires
   telemetry without a single line of its own code changing, and it is the one
   route none of the other three would have caught.

`trazum feedback` is *shaped* exactly like a telemetry feature: it collects
environment facts, formats them, and offers to send them somewhere. A reader
cannot tell it apart from the real thing by looking at the output. So the
sentence it prints — *this sends nothing* — is worth precisely as much as the
check behind it, and no more.

### `trazum --version`

The CLI could not say which version it was. In a tool whose bug reports need
that above every other fact, through fifty releases.

Read from the manifest beside the built entry point rather than baked in by a
generator, so it cannot drift from what npm actually installed — the one number
a report is useless without is the one that must not be a copy. It answers
before the config loads, for the same reason `--clear-suggestion-cache` does:
"which version is this?" is asked most often when something is broken, and a
version command that needs a valid config is a version command that is missing
when it matters.

A manifest it cannot read falls back to `unknown` rather than throwing. A tool
that will not start because it cannot find its own package.json is worse than
one that admits it does not know — and `unknown` in a report is itself a fact
about how somebody installed it.

### SUPPORT.md

GitHub surfaces it in the issue flow, and it did not exist. Where to go, the
warning that an issue is a public page and a usage log names your workloads and
your spend, the no-telemetry statement with what enforces it, and an honest
paragraph on what downloads and stars do *not* tell anybody.

It also says plainly that there is no support contract and no promised response
time, because a project that implies one it will not meet has made its first
false claim before anybody has run it.

### What this release found wrong in itself

**The plan document was already stale, four days after being written.**
`docs/plan-1.51.md` assigned a patch number to each of its nine chapters —
1.50.1 through 1.50.9 — and then 1.50.1 went to the numbering change and 1.50.2
went to this. Two releases in, the table was wrong.

It stops pinning numbers. The chapters are numbered 1 to 10 and the **order** is
the commitment, which is what the plan documents have always actually promised.
Work that arrives outside a plan is not a failure of the plan; a plan that
pretends otherwise goes stale on contact with the first good idea.

### What stayed out, and why

**Anonymous usage telemetry, opt-in or otherwise.** It is the obvious answer to
the problem at the top of these notes and it is not going to happen. An opt-in
counter still means shipping the code that reports, the endpoint that receives
and the promise that it stays opt-in — and every product that now phones home by
default shipped exactly that first. The position is more useful than the data.

**A `--json` mode for `feedback`.** There is no machine that should be
consuming this. A script that read it would be automating the one step that is
supposed to be a person deciding.

---

## 1.50.1 — "The numbering"

A patch that changes what a patch means, which is the only release where that
is not a contradiction.

### The version number now carries the narrative

Work here is planned in **arcs**: about ten releases with a single thesis.
`docs/plan-1.41-1.50.md` was *the loop is complete and inert*, and everything
in it — the connector, the store, the watch, the endpoint, the guard, the first
run, the browser, the waiver record, the live budget, the conformance check —
served that one sentence. From the outside, none of that was visible. Ten
minors in a row look like ten unrelated releases.

From here:

- **A chapter of the arc in progress is a patch.** 1.50.1, 1.50.2, and so on,
  each a substantial release in its own right.
- **The minor is spent only on the release that lands the thesis.** So the next
  arc runs 1.50.1 through 1.50.9 and finishes at **1.51.0** — which is not "the
  release after 1.50.9" but the one where a story ends.
- **Major is unchanged and is the only number that carries risk.** A breaking
  change waits for 2.0, as it always has.

### What that costs, said out loud rather than buried

**Under strict semver a patch adds nothing, and here it will.** A patch release
of Trazum can add a command, a flag, a document format or a rule. Somebody
pinning `~1.50.0` in the expectation of bug fixes only will receive features.

It cannot *break* them — the 1.x freeze is untouched, and that freeze is the
promise that actually matters — but "you get more than you expected" is a real
surprise, and it is fair to want it in advance rather than from a diff.
`VERSIONING.md` now carries a section headed exactly that, naming `^1.50.0` as
the intended range and saying plainly that `~1.50.0` no longer means here what
it means elsewhere.

The reason the field was available to reassign is worth stating, because it is
the whole argument: **inside a frozen 1.x line, minor and patch are both
additions-only.** The distinction between them was never load-bearing for
safety. It was carrying nothing, and it now carries where you are in the story.

### The deprecation window got longer, and stays as written

`VERSIONING.md` requires a deprecated thing to keep working for "at least two
minor versions and at least six months, whichever is longer". Under the new
numbering two minors is roughly *twenty* releases rather than two.

That is a strengthening, and it was deliberately not rewritten to preserve the
old duration. The clause exists so a deprecation outlives the attention span of
whoever wrote it; the old duration was never the thing being promised. Recorded
here because a rule whose meaning changes as a side effect of an unrelated
decision is exactly the sort of thing that gets quietly re-tightened later by
somebody who does not know it was considered.

### The plan document, renumbered

`docs/plan-1.51-1.60.md` is now `docs/plan-1.51.md`: nine chapters as 1.50.1
through 1.50.9, landing as 1.51.0. The arc, its thesis and every release's
content are unchanged — only what they are called.

**The 1.40.0 changelog entry still names the old path**, and that is deliberate.
Below the first version heading, `CHANGELOG.md` is a record. Rewriting a shipped
entry so a link resolves would be falsifying history to tidy a footnote, which
is the same rule this repository applied when it declined to correct "Nine
commands now, up from four" in an old release's notes.

### Two documents that opened in the wrong place

`VERSIONING.md` began with a caveat about a pre-1.0 world nobody is in any
more, and the reader had to get four sections in before learning what a minor
means. It opens with what the three numbers mean now, and the pre-1.0 material
is marked historical where it belongs.

`docs/releasing.md` answers "which number" before step one. Its first step used
to be "move `Unreleased` under the new version heading", which quietly assumes
the hard question is already settled.

---

## 1.50.0 — "The standard"

The tenth of the ten, and the close of the arc `docs/plan-1.41-1.50.md` opened
at 1.41. That arc's thesis was that the loop was complete and inert — Trazum
could answer every question it had been taught, and nothing made it act.
Between then and now it grew a connector, a store, a watch, an endpoint, a
guard, a first run, a browser that sees the whole loop, a waiver record and one
live budget every surface reads.

This one is about somebody else's tool.

### `trazum conform`

```
your-log.jsonl reads as a usage-log: 2 records
  It conforms. Every required field is present and the right type.

What this cannot answer, and what would unlock it
  per-workload bills, per-label budgets, the ranked plan — no record carries
  "label". Add a "label" naming the workload on each record.
  the cache verdict — whether caching is paying for itself — no record carries
  "cache". Add cache_read_input_tokens and cache_creation_input_tokens.
  …
  None of those failed anything.
```

Ten documents come out of this project and every one is a contract, enforced
in both directions by parity tests in this repository. Until now there was no
way for anybody else's emitter to find out whether what it produced satisfied
one, short of reading the source and hoping.

### Two questions, kept apart, and the second is the useful one

**Does this conform** is a yes or no: required fields, present and the right
type. It exits 1, so it gates in CI.

**What can a valid document of this shape not answer** has nothing to do with
validity. A usage log with a model and token counts conforms *completely* — and
supports about a third of this product. No `label` means no per-workload bill,
no per-label budget, no ranked plan. No `session` means no conversation growth,
which is routinely the largest line on an agent bill. An emitter that only ever
hears "valid" ships it and never finds out why the cache verdict never appears.

Each gap comes with the field that would unlock it, because a gap named without
its fix is a complaint.

**And the second half never gates.** Choosing not to log sessions is a
decision, not a defect. A check that failed on it would be Trazum telling
somebody what to record, which is not its business — and the output says so out
loud, because the exit code says it silently and somebody reading a screen of
yellow will assume both halves gated.

### Two smaller rules that took some thinking

**Unknown fields are never a problem.** These documents gain fields without a
version bump — that is the whole point of `schemaVersion` — so a checker that
rejected tomorrow's field would be a checker nobody upgrades.

**A zero standing in for absence is a problem, and its own kind of one.** A
`span` of `0` reads as a log covering the epoch rather than a log with no clock.
It is the mistake that produces a *wrong report* rather than a rejected one, and
it is always in the flattering direction, so it is called out separately from an
ordinary type error.

The contract is detected by each document's most distinctive field rather than
by trying each in turn and keeping whichever complains least — that would report
a broken plan as a slightly-more-broken profile and send somebody to fix the
wrong file.

### docs/doctrine.md

Twenty rules, each with the release that learned it by getting it wrong first.

Measured never merges with estimated without saying which half is which.
Not-recorded is not not-happened. Three outcomes, never two. No series becomes
a forecast. A floor can prove *over* and can never prove *under*. A period
nobody measured is not one under budget. Quiet is not clean. A refusal never
arrives bare. Quality is recorded, never inferred. A credential is borrowed,
never held. Nothing continuous invents a number. A machine reader gets the
provenance too. A proxy refuses and never answers something else. One key, one
denominator. What stays out gets its reason on the record. A guard that quietly
stops guarding is worse than no guard. Prove a guard by breaking it. Record, do
not reconstruct. Report the record, not the team.

They were discovered one release at a time, each buried in the changelog entry
of whichever release paid for it. Written down together they are the actual
argument for why anybody should trust a cost figure — from this tool or any
other — and none of them is Trazum-specific. If you are building something that
reports money from measurements, those are the mistakes waiting for you.

### docs/format.md

The ten contracts in one index. What `schemaVersion` promises, in a table: a
new field arrives in any release, a field's *meaning* changing needs a version
bump, so does a removal, so does a type change **including a narrowing**, and a
new value in a documented union is a minor because the unions here are open by
construction. What is deliberately in none of them — no prompt text, no
completion text, no session keys, no credentials — and the note that this is
enforced by the security suite rather than promised in prose. And the four
rules a provider connector must follow, which are the ones that stop a
connector nobody here wrote from silently dropping a day.

### What this release found wrong in itself

**`--contract` was silently a boolean, and so is any value flag nobody
registers.**

A flag missing from `VALUE_FLAGS` parses as `true`, and the value it was given
falls into the positionals. So `trazum conform report.json --contract profile`
stored `contract: true`, dropped `profile` into the argument list, and the
command read `undefined` — ignoring the contract it had been told to check
against and producing a confident answer about a different one.

Nothing errored. `rejectUnknownFlags` was satisfied, because the flag *is*
known; it simply is not known to take a value. The only symptom was an answer
that looked right.

It was caught the same afternoon by a test that expected a bad contract name to
be refused and watched a conformance report come back instead — which is the
argument for writing the refusal tests, not just the happy ones.

A guard now fails the build when a flag the help documents as `--x <value>` is
not registered as taking one. The help text is the checkable promise: a line
reading `--contract <name>` is a commitment to a reader, and the parser is now
held to it. Proven by removing `contract` again and watching it fail by name.

The guard is deliberately one-directional and reads only the OPTIONS blocks.
Its first version also read the USAGE synopsis and failed on `trazum diff --all
<dir> <dir>` — where the two directories are positionals and `--all` is a real
boolean. Right about the shape, wrong about the meaning.

### The arc, closed

| | |
| --- | --- |
| 1.41 | the connector — read the bill from the provider, not from an export |
| 1.42 | the store — keep what was measured, and never double-count it |
| 1.43 | the watch — a measured crossing, and quiet is not clean |
| 1.44 | the answer in milliseconds — halves kept apart |
| 1.45 | the agent's budget — a refusal that arrives with the lever |
| 1.46 | five minutes — the floor, and the four keys it refuses to write |
| 1.47 | the browser sees the bill — the plan and the check, one document |
| 1.48 | the cost review — waivers get the record 1.40 refused to invent |
| 1.49 | the live budget — one measured number, wherever it is asked for |
| 1.50 | the standard — the contracts, the guarantees, and the doctrine |

### What stayed out, and why

**The conformance suite as a published package.** `trazum conform` is the
executable check and it ships in the CLI everybody already installs. A separate
`@trazum/conformance` would be a second artefact to version, release and keep in
step with contracts that live here — and the first time it lagged by a release
it would be telling somebody their conforming document does not conform. It is
worth doing when somebody outside this repository actually needs it, and not
before.

**A documented rule plugin seam.** The connector seam is documented in
`format.md` because it already is one — `ConnectorDescriptor` is a public type
with a real contract behind it. A rule is not: rules reach into the tokenizer,
the phrase catalogue and the locale machinery, and documenting that surface as
an extension point would freeze internals that are still moving. Saying so beats
publishing a seam that breaks every minor.

---

## 1.49.0 — "The live budget"

The ninth of the ten planned in `docs/plan-1.41-1.50.md`. By 1.48 there were
four ways to ask Trazum about money — a gate in CI, the terminal, the local
endpoint an agent consults, the browser — and **no guarantee any two of them
agreed**. Each computed its own answer from whatever it happened to be holding:
a log, a store, a request body. Four right answers to four slightly different
questions is how a CI failure and an agent's refusal come to disagree in front
of a person who then trusts neither.

### A budget becomes a standing

```
Budget for 2026-08
  $30.00 of $100.00 (30%), measured over 3 of the month's 31 days.
  Only 3 of 20 elapsed days carry any measurement, so the figure above is a
  floor on the month rather than the month.
  Whether that is fast or slow for the month cannot be told from a floor: the
  unmeasured days spent something, and only an overrun would be unarguable.
```

`budgetPositions` in `@trazum/core` takes the store's measured records and a
calendar month and returns a position: the limit, the spend inside the period,
what is left — and, the part that makes it honest, **how much of that period
was measured at all**. `trazum store` prints it, `trazum serve` answers with
it, and both make the same call, so the two cannot drift.

### `spend.monthlyUsd` is a new key, and that is the whole point

Reusing `maxUsd` would have been far less code, and it is exactly the bug.

`maxUsd` gates *this log* — whatever period the file somebody passed happens to
cover. The new key gates *this month*. Same units, different denominators. One
key carrying both is precisely how two surfaces of one product come to disagree
about how much is left, which brings us to what this release found.

### What this release found wrong in itself

**`trazum serve` was comparing the whole store against a per-log budget.**

It read `spend.maxUsd` and set it against every record the store held. A store
is append-only and keeps whatever has been pulled into it, so on a machine that
had been pulling for a year, an agent asking "is there budget left?" was being
told the answer for the year against a limit somebody wrote for a month. The
gap between what `serve` said and what CI said was exactly as large as that
machine's history — invisible from either side, and growing.

It shipped in 1.44, was reviewed carefully enough to get three security guards
and a documented JSON contract, and nobody looked at the denominator. Reading
`maxUsd` there was not a shortcut somebody took knowingly; it was the only key
that existed with the right units.

Two smaller things came with it. `serve`'s answer carried **the store's span**
as its staleness window, so a caller was told when the oldest record was pulled
rather than which month the figure covers; it carries the period now. And the
`serve` test suite's fixture was pinned to a **literal August 2026 date**,
which happened to be inside the current month — a month-based budget would have
turned that into a suite that passed for eleven months and then failed for
reasons nobody remembered. The fixture is relative to the current UTC month.

### A period nobody measured is not a period under budget

The `fleetBudgetMissing` rule from 1.37, applied to time. Elapsed days with no
measurement are counted and named. With nothing measured at all the verdict is
`cannot-tell`, never `within`: **`$0 of $400` is the healthiest-looking budget
a dead store can produce**, and a store that stopped being written to looks
exactly like a quiet month.

One detail worth stating because it is easy to get backwards: a record whose
model the catalogue cannot price contributes no dollars — which is right — and
it must contribute **no measured day** either. Counting the day would report
the period as covered by money nobody can see.

### The burn is a shape, never a date

`ahead`, `on-pace`, `behind`, `cannot-tell` — a comparison of two shares that
have **both already happened**: how much of the budget is gone against how much
of the month is gone. "Thirty per cent over eleven of thirty days" is a
measurement. "You run out on the 24th" is a prediction, and this product has
refused those since 1.27 at every scale it operates on.

The type carries `readonly forecast?: never`, with a comment saying why, and a
test asserts the serialised object contains no field naming such a date. Not
because anybody plans to add one, but because it is the single most requested
number this module will ever be asked for, and a comment alone loses that
argument eventually.

**A floor can prove `ahead` and can never prove `behind`.** Partial coverage
means the consumed figure is a floor: the unmeasured days spent something and
nobody knows how much. A floor that has already outrun the calendar is
unarguable — the real figure is higher still. A comfortable-looking floor
proves nothing, and calling it `behind` would turn missing measurement into
good news.

The first version of this file did exactly that: `behind` on three measured
days out of twenty, printed directly under a warning that the figure was a
floor. Two sentences contradicting each other on adjacent lines, and the
reassuring one came second.

### What the store cannot answer for, said rather than guessed

Per-label and per-service budgets get no position. A store record carries a
provider, a model and the account's own grouping — it does not carry a workload
label, because labels live in a per-call usage log and a bucketed provider API
does not serve one. A per-label figure assembled from records that cannot
distinguish labels would be the right shape over the wrong denominator, which
is the fault this whole release exists to remove. They are listed as
unmeasurable from here, with the pointer to `trazum profile` against a per-call
log.

### What stayed out, and why

**Reservations, so two agents cannot race for the last dollar.** The plan lists
them and they are not here. Within a single `serve` process an in-memory
reservation is straightforward and would work; across processes — two CI jobs,
two machines, a server restarted between the reservation and the spend — it
needs a lock over a file, an expiry that survives a crash, and a story for a
reservation whose holder never came back. Shipping the easy half would mean an
agent being told "reserved" by a guarantee that quietly does not hold the
moment there are two of anything, which is worse than being told to check
again. It gets its own release or none.

**The MCP guard still takes the position as an argument.** That is not an
oversight: the MCP server has promised since it shipped that it reads nothing
from disk, and the security suite fails the build if it ever does. An agent
using MCP passes the standing it got from `serve` or from CI, and the seam is
where it has always been.

---

## 1.48.0 — "The cost review"

The eighth of the ten planned in `docs/plan-1.41-1.50.md`, and the one that
goes back and settles an old debt.

### Waivers get their history

1.40 wanted to say **"this finding has been waived three times in a row"** —
which is a sentence about a decision nobody is revisiting, and the most useful
thing a cost tool can say about a team's habits. It refused, and said why: no
document stored past waivers, and a history invented from the current config
would be a guess presented as a record.

That refusal was right, and it named its own fix. A config knows only today. It
cannot say whether the same finding was waived last quarter under a different
reason, or whether the expiry has been pushed forward four times by four people
who each assumed somebody else had looked. So: **record**, do not infer.

When a waiver silences a gate, `trazum profile` appends one dated line to
`.trazum/waivers.jsonl` — the gate, the reason and expiry **as they stood at
that moment**, the commit when CI exported one, and the figures the gate
actually judged, so a recorded use is checkable rather than asserted.
`trazum history` reads those lines back:

```
What this repository has been living with
  9 recorded uses since 2026-04-02, when recording started.
  Nothing before that day exists. This record began when recording did, and no
  past was reconstructed from the config as it stands.

  maxUsd: 9 uses across 7 days, 2026-04-02 to 2026-08-14
    The expiry has moved and the reason has not. That is the shape a decision
    takes when nobody is revisiting it — which is sometimes exactly right, and
    worth saying out loud either way.
    Reason: the vendor migration lands in March
    Expiry moved 3 times: 2026-05-01 → 2026-09-01.
```

### The verdict is the point, and it has four values

- **`used-once`** — one use. Nothing to read into it yet, and the copy says so
  rather than filling the space.
- **`recurring`** — the gate keeps firing under one unchanging reason and one
  unchanging expiry. A decision, holding.
- **`renewed-without-revisiting`** — the expiry moved while the reason did not.
  The same sentence carried forward past its own deadline.
- **`reason-changed`** — somebody looked again.

The last two are the ones worth separating. Counting both as "waived four
times" would flatten the single signal this whole feature exists to produce.
And neither is called *wrong*: plenty of real constraints outlive their first
estimate. The verdict describes dates and sentences in a file. Whether the call
was right is a conversation this tool does not get to have.

### Three rules hold the record up

- **Nothing is back-filled.** The history begins the day recording began, and
  `since` says which day. A reader looking at two uses needs to know whether
  that is two in the project's life or two since Tuesday — and a fabricated
  "waived four times" is not a report, it is an accusation.
- **A use is recorded when a waiver silences something, not when it is
  written.** A waiver nobody's build has ever hit is not a habit; it is dead
  config, listed separately. Either the gate stopped failing — good news nobody
  wrote down — or the waiver names a situation that never arises. Both are
  worth deleting; neither is a team living with a finding.
- **A failure to write never fails the build.** The gate's job is the exit
  code. A read-only checkout, a full disk, a CI job that cannot create the
  directory — none of those may turn a passing build red on account of
  bookkeeping. The problem is printed and the gate's own verdict stands.

The reason and expiry are captured at the moment of use rather than read back
from today's config, which is the same mistake as inventing the past, one layer
down.

### No prune, no compaction, no `--clear`

Deliberately. A record of decisions the tool can erase is a record nobody can
rely on, and the one thing a waiver history is for is being awkward six months
later. Deleting the file is something a person does with `rm`, on purpose,
having seen it.

The reader is a `.jsonl` file like the store: a line that will not parse is
counted, named by position and skipped. Losing the whole history to one broken
line would be the worst possible response; pretending the history is complete
would be the second worst.

### docs/ci.md — gating in whatever CI you already run

GitLab CI, Jenkins, CircleCI and a pre-commit hook, each a handful of lines
around **the same binary and the same two exit codes**. Every exit code on that
page was checked against the built CLI before it was written down.

No vendor plugin, and the page says why: each would be a second code path with
its own bugs, its own release cadence and its own way of drifting from the exit
codes it exists to relay. The pre-commit recipe names `--no-verify` on purpose
— a hook somebody cannot get past is a hook somebody uninstalls, and an
uninstalled hook gates nothing.

### What this release found wrong in itself

**The README documented no waivers at all.** Not the key, not the three
required fields, not the expiry mechanism that is the entire reason the feature
is a decision rather than a deletion. A config key with a whole design behind it
had never appeared in the front door, through eight releases that touched
gating.

It was found by writing this release's documentation and going to link the
existing section, not by any guard — which is worth recording as plainly as the
gap itself. The `publish.test.js` sweep checks that command counts and version
claims stay true; it has nothing to say about a feature that is simply absent.
A guard for "every config key appears in the README" is the obvious next move
and is deliberately **not** in this release: it wants a real think about what
counts as documented, and bolting it on at the end of a release is how a guard
gets written that everyone learns to work around.

### What stayed out, and why

The pull-request comment carrying the plan, and `verify --gate` as a status
check. Both are real, both are in this release's design note, and both are
Action work rather than tool work — the comment is a formatting-and-idempotency
problem (a thread of stale cost figures is worse than none), and neither needs
the waiver record that was the actual debt outstanding. Splitting them out kept
this release about one thing.

---

## 1.47.0 — "The browser sees the bill"

The seventh of the ten planned in `docs/plan-1.41-1.50.md`. The bill has been
readable in a browser tab since 1.36 — the spend split, the cache verdict, the
levers, conversation growth. Everything the loop does *with* a bill has lived
only in a terminal, which made the web app a demo of the smallest half of the
product.

### The plan, under the report

Ranked actions, each carrying what the terminal has carried since 1.38: the
money as a projection **or** a measured stake and never both, the typed
assumption it rests on, and the Trazum command that would settle that
assumption. The two totals are printed apart with a line saying why they are
never added — one is a prediction about calls that have not happened, the other
is money that already left, and a figure that is half of each is neither.

A plan with no actions renders as the real answer it is: a bill already on the
cheapest model of its family, with no batch window to reach for and nothing
measurable being paid to a problem, has no lever, and saying so beats
manufacturing one.

### The document is the bridge, and it is the same document

**Save plan.json** writes byte-for-byte what `trazum plan -o plan.json` writes.
Commit it, diff it in a pull request, gate on it in CI with `trazum verify`,
open it back here on Friday. One format, one validator, no server between the
two surfaces. A browser tool whose output the terminal will not accept is a
second product wearing the first one's name.

Saved as a **file, not offered as a link**. A link would mean this page storing
somebody's bill somewhere, and who may read another team's spend is an
access-control story somebody has to design on purpose. That is the same call
the store made in 1.42, and it is the same reason.

### Did it work?

Open a saved plan and the log already in the tab becomes the check on it —
three outcomes, never two, with the three cannot-tell reasons kept apart,
because a workload that stopped being logged is not a workload that stopped
costing money. The plan's price-table date is compared against today's, so a
repricing between the two renders as a repricing rather than as a team missing
a target.

A file that is not a plan is **named as one that is not**, with what is wrong
and where. Never an empty verification: "0 arrived, 0 did not, 0 cannot be
told" reads as a clean result.

### One validator, because there were two and they were not the same

`parsePlanDocument` moves the check into `@trazum/core` and both surfaces use
it. It returns a typed refusal rather than throwing — a refusal has to be
*rendered* in a browser and *localised* in a terminal, and an exception with an
English message baked in can be neither. It names which action is malformed and
what about it, because a plan can hold a dozen actions and only one be wrong.

Deliberately shallow past the three fields verification actually reads. A
document format that rejects its own past is one nobody commits.

### What this release found wrong in itself

**`trazum verify` accepted files that were not plans.** The check was
`schemaVersion === 1 && Array.isArray(actions)` and nothing more, which admits
an `actions` array of arbitrary objects. `verifyPlan` would then read `label`
off `undefined`, match it against no slice in the log, and report
`cannot-tell: workload-vanished` for every one — a verification of a document
that was never a plan, rendered exactly like a real one, with the reassuring
shape of a tool that had looked and found nothing to worry about. Surfaced by
writing the browser's validator and asking what the terminal's actually
covered.

**The web app has been built against `@trazum/core@1.36.0` for ten releases.**
This is the larger of the two and the more uncomfortable.

`apps/web/package.json` pins an exact `@trazum/core` version, the way
`packages/cli` and `packages/mcp` do. Those two are in the release recipe and
get bumped every time. The web app never was, because it is not published, so
nobody thought of it — and npm honours an exact pin that does not match the
workspace by installing a **real copy from the registry** into
`apps/web/node_modules`, which shadows the workspace symlink.

So since 1.37 the browser could not see the fleet, the plan, verification, the
series, the connector, the store, the watch, the endpoint, the guard or `init`.
Ten releases of core, invisible to one of the four surfaces this repository
ships — and `npm run verify` passed the whole way, because **nothing was
broken**. The wrong thing was being checked. The design note for this release
had recorded "the web app cannot see the plan" as a gap to close with new code;
it was a dependency pin.

The pin now tracks the repository, and `publish.test.js` fails the build when
any workspace — published or not — depends on a `@trazum/core` that is not this
one. Proven by putting 1.36.0 back and watching the failure name the file, the
field and the version.

### docs/plan-format.md

The plan is the one thing Trazum writes that is meant to be kept, so it now has
a page: every field of the document and every field of an action, what
`detail.baseline` is for (without it a plan is a prediction with no record of
the world it was made in, and "the saving did not arrive" could never be told
from "the traffic tripled"), the five typed ways a file is refused, and what
`--gate` fails on and what it deliberately does not.

### What stayed out, and why

The fleet and the series in the browser. Both are real gaps and both need
something dropped *beside* the log — a config naming the sources, or several
stored reports — and a drop zone that silently accepts four kinds of file and
guesses which is which is exactly the sort of interface this product should not
build in a hurry. The plan and the verification needed no such guess: one is
computed from the log already open, and the other is a file the reader
deliberately chose.

---

## 1.46.0 — "Five minutes"

The sixth of the ten planned in `docs/plan-1.41-1.50.md`, and the first one
pointed the other way. Everything since 1.41 raised the ceiling — a connector,
a store, a watch, an endpoint, a guard. This lowers the floor: from
`npx @trazum/cli` to a finding worth money, without reading a page of anything.
Twenty-two commands is a wall to somebody who has none of them yet, and that
wall is why a good tool gets closed inside a minute.

### `trazum init`

```
What is here

  Running inside a terminal.
  1 prompt file found.
  Usage log found: usage.jsonl.

What the config would say
  + usage.model  100% of the measured bill went to claude-opus-5
  + usage.callsPerMonth  240 calls over 30 days, stated as 240 a month
  + usage.avgOutputTokens  96000 output tokens over 240 calls averages 400
  · usage.cacheHitRate  this log has no cache columns at all, which is not the same as a hit rate of zero
  · usage.batchEligible  whether the work can wait for a batch window is a product decision, and no log records it
  · labels  1 label in the log, and nothing here proves which prompt file sends which
  · spend.maxUsd  a budget is a policy, so it is yours to set — the measured figure is $38.40 over 30 days

The most valuable thing found
  240 calls labelled "classify" went to Claude Opus 5 over 30 days.
  They cost $38.40.
  The same work fits Claude Sonnet 5, which is cheaper per token.
  The Batch API halves both halves of the bill, for work that can wait.
  Together: $30.72 over the same 30 days.
```

It does what a person would do on their first afternoon, in that order, saying
what it found at each step: which provider the code calls (the `where`
machinery from 1.7, which has refused to guess since it shipped), where the
prompts are, whether there is a usage log or a credential for one, and what a
config could honestly say. Then one finding.

**A detection, not a wizard.** Nothing is asked. Every step above is something
that was *found*; the only decision is whether to write the file, and `--yes`
skips even that. A first-run experience that interrogates somebody is a
first-run experience that gets abandoned halfway.

### The arithmetic comes before the figure

Not a formatting preference. The reader has no reason yet to believe anything
this command says, and a tool that opens with a dollar amount nobody can check
gets closed. So the headline is four lines and the money is the fourth: how
many calls, under which label, on which model, over how many days — then what
they cost — then which lever exists — then what it is worth. Every term is
checkable against `trazum profile` on the same file.

One finding, not a ranked table. `doctor` and `plan` exist for the table. A
first run that opens with fourteen rows has told somebody nothing; they came to
find out whether this is worth an afternoon.

### Four keys it refuses to write, which is the substance of the release

The easy version of this command writes a full config and looks impressive. It
would also be the most damaging thing in the product: a generated config full
of guessed thresholds is worse than an empty one, because six weeks later it
reads as a decision somebody made, and every price in every report rests on it.

- **A budget, ever.** A log says what your traffic *was* — how many calls,
  which model, how long the outputs ran. Those are measurements and they get
  written. A budget says what your traffic *may cost*, and no log answers that.
  "The measured month plus twenty per cent" would be Trazum inventing a
  threshold and then grading somebody against it. The measured figure is handed
  over — `$38.40 over 30 days`, in the line above — and the limit stays with
  the person who can actually set one.
- **A monthly rate from a short window.** Twenty-eight days minimum, so every
  weekday appears the same number of times. Four days multiplied by seven is a
  forecast wearing a measurement's clothes, and this repository has refused
  that since the series shipped in 1.40. And a **separate** refusal for the
  quiet case: if any call in the log carries no timestamp, no rate is stated at
  all. Those calls are all *there*; they simply cannot be placed inside the
  span a rate would divide by, and dividing anyway makes the figure come out
  high with nothing visible to explain why.
- **A cache hit rate from a log with no cache columns.** Not recorded is not
  not-happened. A zero would tell every later caching advisory that caching is
  doing nothing — a finding invented out of a missing field. A log that *does*
  record cache writes and reports no reads is a different thing entirely: that
  is a measurement of a cache being paid for and never read, and it is written
  as the zero it is.
- **`usage.batchEligible`, in either direction.** Whether the work tolerates a
  batch window is a product decision, and no log records it. `false` would
  silently delete the batch lever from every report this config touches; `true`
  would sell a saving on latency nobody agreed to give up.

It also declines a model when the code names a **provider** and no model.
`trazum where` prints a provider's default because a reader can see, in the
same breath, that it is a guess. A config file cannot.

And it never maps a label to a prompt file. That would be a claim about which
file produced which calls, and a directory walk cannot prove one — a wrong
entry is worse than a missing one, because `profile` would then read the wrong
file and explain a cache verdict with the wrong prompt's structure,
confidently.

### A refusal never arrives bare

The rule `spend_guard` established for a call in 1.45, applied here to a file.
Every declined key carries a **typed** reason and whatever would settle it —
the days measured against the days needed, how many calls carry no clock, which
files named more than one provider. "No provider written" with nothing after it
is indistinguishable from a bug, and the reader has no way to tell which.

### `proposeInit`, in the core, with no filesystem near it

The judgement is a pure function over observations the CLI collected. Two
things follow. Every rule above is tested without a disk — twenty-five cases in
`packages/core/test/init.test.js`, each one really the same case in a different
costume: a key that cannot be justified is a key that is not written. And
`--dry-run` is the same code path minus the write, rather than a second
implementation that drifts from the first one the moment either changes.

### What this release found wrong in itself

**`init` needed a working config to run — and it is the command you run when
yours is broken.** Every command loads `trazum.config.json` before dispatch and
throws when it will not parse. That is correct for the other twenty-one:
"defaults" for a budget means "no budget", and a silent revert to defaults is a
green build that should have been red. But `init` exists for the person whose
setup does not work yet, and it was the one command a broken setup could stop
from running.

The way it surfaced is the part worth recording. The refusal to overwrite an
unparseable config had been written two hours earlier in this same release —
careful code, with a comment explaining why it mattered — and it was
**unreachable**, standing behind a throw three thousand lines away. The test
written to prove it fires watched a parse error arrive instead. `init` now
survives the load failure with nothing carried forward (no keys, no budgets, no
locale) and refuses to write over the file it could not read, naming it.

**A documentation claim did not survive being run.** `docs/usage-logs.md` was
written with an example of a JSON *array* in a `.json` file. Trazum does not
read one — it reads one object per line — and the page would have sent somebody
to convert their log into the one format that does not work. Every example on
that page was then run through `trazum profile` before being written down, and
the limitation is stated rather than papered over.

### Security: three guards on the first run, each proven with a planted probe

`init` has the widest reach in this product and the least trust behind it. It
runs in a directory it has never seen, before anybody has read a page of
documentation, and it walks that directory: prompts, source files, log
candidates, the environment.

- **It never spends to answer.** The build fails if `commandInit` reaches the
  network or an LLM. The deterministic core has been the entry point since
  0.1.0, and a tool whose introduction costs money is one nobody introduces.
- **A credential is named, never read.** `findCredential` returns the key
  because the connector needs it; `init` takes the variable name and drops the
  rest. The guard checks what is **destructured**, not what is printed — a
  version that pulls the key out and happens not to log it today is one
  refactor away from logging it tomorrow. A first-run summary is the single
  most likely output in this product to be pasted into a chat window.
- **It writes exactly one file, in the directory it was pointed at.** An `init`
  that writes to a home directory or a cache is a first impression nobody
  recovers from.

Each was proven the way this repository proves a guard: plant the violation,
watch the test fail by name, remove it, watch the suite go green.

A fourth guard was added after this release opened its pull request, because
**CodeQL found a real time-of-check/time-of-use race in the code above**. The
size bound was taken with `stat(path)` and the file then read with
`readFile(path)`: two lookups of the same name, where what arrives the second
time need not be what was measured the first. The bound would have been
enforced against a file that was no longer there. It opens once and stats the
*handle* now — the same inode by construction — and the guard exists because
the fix is invisible in the output. Both versions print exactly the same thing,
and only one of them is checking the file it reads. Worth recording plainly:
the three guards written by hand covered spending, credentials and where a file
is written, and none of them would have caught this.

### docs/usage-logs.md

The answer to the thing a first run says most often — *no usage found*. Four
shapes with real records rather than a schema dump: an Anthropic response, an
OpenAI response (with the note that `prompt_tokens` includes the cached ones,
so Trazum subtracts them before pricing rather than billing them twice), a
Vercel AI SDK `onFinish` hook, and an OTel collector. Plus a table of which
finding each optional field buys, so the cost of leaving one out is visible
before the log is written rather than after.

### The first-run document, contracted

`trazum init --json` has its section in `docs/json-output.md` with a
two-direction parity test **bounded to its own section** — and the spend-guard
harvest above it was bounded in the same commit. An unbounded harvest starts
enforcing the *next* shape's fields the moment a new contract is appended, and
that has now happened five times in this one file. The bound is written before
the section that would break it rather than after.

### What stayed out, and why

The connector half of the first run. `init` notices that a credential is in the
environment and says so; it does not pull. A first run that reaches a provider's
API before anybody has agreed to it is exactly the surprise this release exists
to avoid, and the line it prints — *run `trazum connect`* — is one keystroke
away for somebody who wants it.

---

## 1.45.0 — "The agent's budget"

The fifth of the ten planned in `docs/plan-1.41-1.50.md`, and the release
where the arc starts paying. 1.44 built an endpoint that *answers*; an agent
may consult it and ignore it, which is fine — advice an implementation can
skip is still advice. What was missing was the shape of a refusal an agent can
act on.

### `spend_guard`, over MCP

```json
{
  "verdict": "no",
  "because": "This call would take the budget past its limit, on an estimate
              of the call. The cheapest alternative below saves the most.",
  "alternatives": [
    { "kind": "route+batch",
      "model": { "id": "claude-haiku-4-5", "displayName": "Claude Haiku 4.5" },
      "savingUsd": 0.90,
      "assumes": [ { "kind": "model-capability", "model": "Claude Haiku 4.5" },
                   { "kind": "batch-window" } ],
      "fits": true }
  ]
}
```

### A refusal never arrives bare

An agent told "denied" and nothing else has exactly two moves: send it anyway,
or fail the user's request. **Both are worse than the call it wanted to make**
— which is how a guard that only says no teaches a caller to stop asking, and
a caller that stops asking is a guard that does nothing.

So every `no` carries the cheaper ways to make the *same* call, and every rule
about them has a reason:

- **Priced for this call, never for a month.** The caller is deciding one call
  right now; a monthly figure is the right number at the wrong moment and an
  agent has no way to act on it.
- **Each names what it assumes**, typed as `PlanAssumption` has been since
  1.38 — the cheaper model's competence, the batch window's tolerability. A
  machine reader gets the assumption as a value, not as prose it will drop.
- **Alternatives appear on a `yes` as well.** An agent that is allowed to
  spend and could spend less should be told so; withholding it until a refusal
  would make the guard adversarial rather than useful.

### An alternative the prompt does not fit in is not an alternative

A cheaper model with a smaller context window does not make this call cheaper
— **it makes it impossible**. Those are filtered out before they are offered,
rather than offered and blamed later when the call fails. The survivors carry
`fits: true`, so the rule lives in the type where the next reader will see it
rather than in a filter buried three functions down.

### Route and batch combine, never add

The batch discount applies to the *cheaper model's* price, exactly as
`billLevers` has combined them since 1.23. The head arithmetic `plan` was
built to kill — $12.60 plus $10.50 against a $21.00 slice — does not get to
reappear at the tool surface where an agent would act on it automatically.

### It never spends to answer, and never says yes to what it cannot judge

No provider call, no model call, no pull: the figures come from what the
caller passes and the catalogue the server already holds. **A cost guard that
costs money to consult is a joke with a bill attached.**

And `cannot-tell` stays `cannot-tell`. A guard that permits whatever it cannot
judge permits *everything* the moment its inputs go missing — an empty store,
an unset budget, a model outside the catalogue. The three reasons stay apart
because the fixes do: configure a limit, connect a source, add a price.

### Security: a tool may not cause spending

An agent that could trigger a provider pull by asking a question is a
denial-of-service with good manners, and the bill lands on whoever installed
the cost tool. A guard fails the build if the MCP tool surface reaches the
connector's fetch path, the Node entry point or the filesystem — proven with a
planted probe. The exact-set tools test, which exists so a tool cannot arrive
without somebody re-reading the security argument, now carries the review that
admitted `spend_guard`, the same way it has carried `profile_usage`'s since
1.30.

### Three process failures this release found in itself

- **`serve`'s `POST /cost` shipped in 1.44 with no contract.** Every other
  machine-readable output in this product is documented in
  docs/json-output.md and held there by a two-direction parity test; the one
  consumers build against hardest — an agent reads it on every call — had
  nothing. It is documented now, with the spend-guard document beside it and
  parity tests over both.
- **The guard merged to `main` with no changelog entry.** The script that
  wrote the entry aborted partway on an unrelated assertion, and the missing
  entry was not noticed until release time. The entry is complete here, and
  the failure is recorded rather than quietly repaired: this repository's rule
  is that every change lands in the changelog, and a rule that fails silently
  once will fail silently again.
- **The header of this file said the wrong version for seventeen releases.**
  "All three packages are on npm at 1.28.0" is the first line a stranger reads
  about what `npm install` actually gives them, and it stayed at 1.28.0 while
  the manifests moved to 1.45.0. Every other live claim in this repository has
  a guard behind it; this one had none, so it drifted the moment nobody was
  hand-editing it — the exact failure this product exists to argue against,
  happening inside the product's own notes. `publish.test.js` now fails the
  build when that number is not the version the manifests publish, and the
  guard was proven by planting 1.28.0 back and watching it fail by name.

### What stayed out, and why

The rest of the command set over MCP — `plan`, `verify`, `history`, the fleet
— which the plan listed for this release. Each of those reads *files*: a plan
document, a directory of stored reports, a store. This server has promised
since it shipped that it reads nothing from disk, and the security suite fails
the build if it ever does. Exposing them means either breaking that promise or
passing whole documents as tool arguments, and neither is a decision to make
in passing at the end of a release. `spend_guard` needed no file, which is
why it is here and they are not.

---

## 1.44.0 — "The answer in milliseconds"

The fourth of the ten planned in `docs/plan-1.41-1.50.md`, and the pivot the
rest of the arc rests on. Everything this tool knows sat behind a process
launch, a config walk and a log parse. That is fine for a report and useless
for a decision being made right now: by the time the report exists, the call
has been paid for.

### `trazum serve`

```bash
trazum serve                 # 127.0.0.1:7317, or --socket /tmp/trazum.sock
curl -s localhost:7317/cost -d '{"model":"claude-opus-5","inputTokens":200000}'
```

```json
{
  "call":   { "estimatedUsd": 1.00, "provenance": "estimated" },
  "budget": { "consumedUsd": 40.00, "limitUsd": 50.00, "provenance": "measured" },
  "verdict": "within",
  "restsOn": "measured+estimated",
  "afterCall": { "usd": 41.00, "halves": { "measuredUsd": 40, "estimatedUsd": 1 } }
}
```

Measured at about two milliseconds an answer, and the suite asserts a ceiling
rather than trusting the number in this paragraph.

### The shape is the release

This is where the temptation to merge halves is strongest, and the answer
refuses to:

- **The budget consumed is `measured`** — the provider billed those tokens.
- **The cost of the described call is `estimated`** — nobody has sent it, and
  the token count behind it is a count of something that has not happened.
- **The composed figure exists**, because a caller deciding one call genuinely
  needs it — and it never travels without both halves beside it, so nobody can
  mistake the composition for a measurement.
- **`restsOn` says whether the verdict needed the estimate at all.** `measured`
  means the budget is already past its limit and a caller can act with full
  confidence; `measured+estimated` means it takes this call to cross, and the
  verdict is only as good as the token count. A caller reading nothing but the
  verdict can still tell those apart.

### Three outcomes, and three reasons kept apart

`within`, `over`, `cannot-tell` — and the three ways of not being able to tell
are distinct because their fixes are: **no budget configured** (set
`spend.maxUsd`), **nothing measured** (connect a source), **model unpriced**
(add it with a pricing overlay). Answering "within" for a model the catalogue
cannot price would answer whether *current* spend fits, which is a different
question from the one asked.

### It degrades rather than failing

With no store and no budget the endpoint still prices the call and says the
budget half is unknown. Offline is a mode, not a failure — an oracle that
refuses to speak when half its inputs are missing is an oracle nobody wires
into a hot path.

The measured position is read **once at start**, because a file read in the
request path cannot promise milliseconds. That staleness is real, so every
answer carries the window its measurement covers rather than implying it is
current to the second.

### The first time Trazum listens

- **Loopback, compiled in, with no way to say otherwise.** Not a flag, not an
  environment variable, not a config key. This endpoint holds a company's
  spend, its model mix and its budgets, and answers whoever asks.
  `checkedEndpoint` has guarded *outbound* requests since 1.14 on the
  principle that a caller selects an endpoint rather than naming one; this is
  the inbound counterpart, enforced the same way — by there being no way to
  say otherwise.
- **No auth, on purpose.** A token checked over loopback is theatre: whoever
  can reach the socket can read it out of the process that holds it. The
  honest posture is a surface small enough not to need one.
- **Bodies over a megabyte are refused unread.** A prompt is text and text is
  unbounded; a hot-path oracle that buffers whatever it is handed is one
  request away from taking down the caller that was asking how to spend less.
- **Everything but `/health` and `/cost` is a 404.**

Three guards fail the build over it, each proven with a planted probe.

### Two failures this work found in itself

- **The answer carried a `null` window.** The copy promised that every answer
  says what period its measurement covers; the code passed a null through, so a
  figure from last month would have read as current. Fixed, and covered by a
  test that says why.
- **The README command-count guard had been blind since "sixteen".** Its word
  list stopped there, and an unknown number word is *skipped* rather than
  failed — so the count claim went unchecked for five releases, exactly while
  it changed in every one of them. Extended past thirty with hyphenated forms,
  and proven against a wrong count. A guard that quietly stops guarding is
  worse than no guard, because it still reads like one.

### What stayed out, and why

A remote mode, with or without a token. Every version of it trades a large new
attack surface — spend, model mix, budgets, answered over a network — for the
convenience of not running a process per machine. If a team needs one endpoint
for several machines, that is a hosted collector with an access-control story
somebody designed on purpose, which is a different product decision than a
flag on this one.

---

## 1.43.0 — "The watch"

The third of the ten planned in `docs/plan-1.41-1.50.md`. 1.41 made the bill
readable without an export and 1.42 made it stay. Both still wait for somebody
to type something — and the failures worth catching (a retry loop, a prompt
that grew, a model swapped in a deploy) happen at 3pm on a Tuesday, where a
report that arrives three weeks later is an obituary.

### `trazum watch`

```
CROSSED — Total spend is $50.00 against a limit of $25.00. Measured, not
  projected.
CROSSED — Spend on 2026-08-03 is $30.00 against a limit of $15.00. Measured,
  not projected.
```

**One cycle is the primitive.** `--once` measures, keeps, evaluates, emits and
remembers — that is what a cron entry runs, and what every test exercises.
`--interval 15m` is that same cycle in a timer. One code path, so there is no
daemon-only behaviour that nobody tests, and the thing that ships is the thing
the suite proves.

**The interval has a five-minute floor.** Usage APIs are rate limited, and a
tight loop is how a tool that exists to save somebody money gets their key
throttled instead.

### An alert fires on a measured crossing, never on a projection

"You have spent $412 of a $400 budget, measured over these calls" is a fact.
"You will exceed" is a forecast, and this product has refused those at every
window length since 1.27. That distinction is the only reason an alert at 3am
can be trusted.

Every crossing carries `provenance: 'measured'` **as a field**, even though it
can hold exactly one value today. A consumer that cannot see the provenance
will treat whatever arrives as fact, and a later version of that file must not
be able to smuggle an estimate past a reader by leaving the question unasked.

### A day still being measured is not judged, and not passed either

At noon, a threshold over that day is a threshold over half a day, so the gate
reports *not yet judgeable* with how much of the period is covered — three
states, never two, and a gate silently skipped for a week reads exactly like a
gate that has been passing for a week.

**A day already over budget fires whatever the hour**, because it does not
become less over budget at midnight. The coverage floor suppresses an unripe
verdict and never a real crossing. It sits below perfection deliberately: a
usage API's last bucket lags minutes behind, and a gate that waits for a whole
day never judges anything.

### A restart is not amnesia, and quiet is not clean

```
STILL OVER — Total spend is $50.00 against a limit of $25.00, and was already
  reported. Quiet is not clean.
```

**This is the failure the release found in itself.** The first version reported
*"Within every threshold"* on the cycle after an alert — it had suppressed the
alert and, in doing so, the fact. That is exactly the flattering reading this
repository refuses everywhere else. A crossing already reported now comes back
as `suppressed`, prints as STILL OVER, and **keeps the run failing**: "we
alerted about this" and "this is fine now" are different sentences.

The stretch between cycles that nobody watched is named once, because a
watcher that resumes in silence implies coverage it did not have.

### Three transports, all boring

A non-zero exit code so cron mails it, a JSON event on stdout for any pipeline,
and `--webhook` for wherever the alerts already go. No hosted service, no
account. **A receiver that is down is reported and swallowed** — the crossing
already went out through the other two, and losing them because somebody's
server fell over would make the quietest failure the loudest one.

### The webhook is a new outbound surface, and three guards fail the build

- **A URL carrying credentials is refused.** URLs end up in logs, shell history
  and error messages; the secret belongs in a header the receiver checks.
- **Plain http is refused off loopback.** An alert carries spend figures, and
  sending them in the clear across a network is a leak nobody asked for.
  Loopback is allowed, because pointing a watcher at your own alerting daemon
  is the ordinary case rather than the attack.
- **The payload's shape is pinned** to figures and gate names, and the delivery
  path may not throw.

This is deliberately **not** the SSRF case `checkedEndpoint` guards. That rule
exists because a *request body* must never name a host — an anonymous caller
pointing a shared server at an internal address. Here the URL is in the
operator's own config on their own machine, which is why loopback is allowed at
all, and the distinction is written down rather than left to be inferred. Each
guard was proven with a planted probe before being trusted: a guard that never
fires is a guard nobody should believe.

### Changed

**`spend.maxCacheLossUsd` is now a config key**, not only a flag. It has gated
since 1.21 and only from an invocation, which made it a policy `watch` could
not read — and a policy that lives in one command line is a policy nothing else
can act on.

### What stayed out, and why

Alerting on anything a usage API cannot serve. `spend.bySource` gates on log
paths, and a usage API has none; rather than quietly passing that gate on a
connected source, `watch` reports it as unjudgeable on this source. Making it
work needs per-call data with its origin attached, which arrives with the
gateway in 1.51.

---

## 1.42.0 — "The store"

The second of the ten planned in `docs/plan-1.41-1.50.md`. 1.41 made the bill
readable without an export; a connector that re-downloads a month every time it
runs is still a connector nobody leaves on. This is where what was pulled
stays.

### `connect --store` and `trazum store`

```
The store: 14 measurements · $47.95 · 2026-08-01 → 2026-08-08
  anthropic  14 measurements · 2026-08-01 → 2026-08-08 · 2 models

  Held in 1 files: token counts, billed dollars and the account's own
    workspace and key identifiers. Never prompt text, never completion text,
    never a credential — this is a file you can back up without a privacy
    review.
  No retention policy is configured, so nothing is ever deleted on its own.
    Set "store": {"keepDays": 90} when you want one.
```

Opt-in rather than automatic: a command that starts writing to a hidden
directory on its own is a command nobody trusts twice.

### Convergence, not accumulation

A record is identified by its **provider, window, model and grouping**.
Re-pulling an overlapping window is the *same fact restated*, so the later pull
wins — a window pulled again is at worst as complete as it was. Three identical
pulls of the same four days leave four measurements and the same $4.00, which
is what makes a scheduled hourly pull over a rolling day safe to leave running.

### Deduplication that cannot lie

- **Two records the store cannot tell apart are kept as two.** A window of no
  length, a record naming no model: there is no honest way to decide whether
  they are one measurement or two, so both are kept and reported as
  possibly-double. A total built on them may count the same spend twice, and
  saying so beats a smaller number nobody can check — quietly smaller is the
  flattering direction.
- **A line that will not parse costs that line**, named with its file and
  number. The store is a file a human may open, a backup may truncate and a
  merge may mangle; losing the month because one line broke would be the worst
  possible response, and so would pretending the month is complete.
- **A record from a newer schema is kept and counted**, left out of the figures
  rather than guessed at, with an upgrade named.
- **An unknown call count survives the trip to disk as null** and never becomes
  zero, because zero reads as "no traffic" against real spend.

### Append-only, with compaction as an explicit errand

A pull appends one block per month file and rewrites nothing. Two consequences
worth stating: a crash during a write loses the tail of one block rather than a
year of measurements, and two runs writing at once interleave whole blocks
rather than half-lines. Convergence resolves when the store is *read*, which
keeps a write cheap enough to run on a schedule.

Only `store --prune` rewrites, because collapsing a log is the one operation
that destroys something and it must never happen as a side effect of a pull.

### Retention refuses a policy nobody wrote down

```
A prune would delete 4 measurements older than 1 days, covering
2026-08-01 → 2026-08-05 and $4.00 of measured spend. Nothing was deleted —
this was --dry-run.
```

With neither `store.keepDays` in the config nor `--keep`, pruning **refuses**
and names both ways to set one. Deleting measurements on a guessed policy is
not a default anybody should get by accident. What went is reported with the
span it covered and the dollars it held; `--dry-run` says all of it before
anything goes. A bucket that *ends* inside the retained period is kept whole,
because half a bucket measures nothing.

### `history --store`

The series, built straight from what is kept — no directory for anybody to
curate. Bucketed sources carry no label, because a usage API groups by model
and workspace and never by workload, so **the label series is absent and said
to be** rather than empty and misread as "no workload moved". The model-share
and cache-share series are exactly what a series exists for, and both work in
full. Reading stored `--json` report files keeps working unchanged: a year of
JSON a team already has must not stop working because a store appeared.

### Two failures this work found in itself

- **An empty store was reported over records it could not resolve.** Records it
  cannot tell apart, unparseable lines and records from a newer schema are real
  measurements sitting on disk; "the store is empty" over them hid exactly what
  the reader needed to see. Empty now means *nothing at all*.
- **A series printed "0 calls" for a source that serves no request count.**
  The connected report had refused that reading since 1.41 and the series had
  not; period call counts are nullable now, and the row omits what it does not
  know.

### The module underneath

`@trazum/core` gains `store.ts` (`resolveStore`, `recordsFromBuckets`,
`bucketsFromRecords`, `storeInventory`, `pruneRecords`), browser-safe: it
decides what a record is and when two are the same, and the filesystem half
lives in the CLI. New config block `store.keepDays`, deliberately with no
default.

### What stayed out, and why

A store shared over a network, or committed as a team artefact. Both are real
wants, and both need a decision about who may read another team's spend that
this release has no basis to make. The store is local, per-checkout, and says
so; the shared version belongs with the team work in 1.48.

---

## 1.41.0 — "The connector"

The first of the ten planned in `docs/plan-1.41-1.50.md`, and the first
release whose subject is not a finding but an *invocation*. Through 1.40 the
loop became complete and stayed inert: seventeen commands, all of them reading
a file somebody produced by hand. The export step is where adoption dies — the
person who would benefit most from a cost report is the person least likely to
have a `usage.jsonl` lying around.

### `trazum connect <provider>` — the bill, read from the provider

```
Anthropic · 2026-08-01 → 2026-08-06 · $136.00
  claude-opus-5       $106.00   77.9%
  claude-haiku-4-5     $30.00   22.1%

  Caching added $11.00 to this bill against what the same tokens would have
    cost as ordinary input.

  Anthropic's usage report serves token sums and no request count, so there
    is no call count here and no per-call average. A zero would read as "no
    traffic", so nothing is printed instead.

  ! some-private-model is not in the price catalogue, so its 4,505,000
    tokens are counted and its money is not. Add it with --pricing rather than
    reading the total as complete.

  Findings this source cannot support: inputShapes, truncationRetries,
    repeatedTurns, sessionCosts, contextPressure, duplicateLines, calls. They
    need one row per call, and a sum has lost the rows — a per-call log still
    answers them.
```

Anthropic and OpenAI in this release, over a window `--since`/`--until` name
with the grammar `profile` already had — a UTC day, an ISO timestamp, `7d`,
`24h`, `now` — defaulting to the last thirty days.

### The credential is borrowed, never held

This is the first credential Trazum handles that belongs to somebody else's
*account*, and the discipline is the whole point of the release:

- **Read from the environment at the moment of the call.**
  `TRAZUM_ANTHROPIC_ADMIN_KEY` and `TRAZUM_OPENAI_ADMIN_KEY`, with each
  provider's own variable as a fallback. Never written to a config, a cache, a
  report or an error message; the caller of the credential lookup gets back the
  *name of the variable*, never the value, so an error handler that prints its
  source cannot leak a key.
- **Redaction covers the key we hold and the ones we do not.** A provider that
  quotes a key back inside its own error body — the mistyped one, one from a
  proxy's log line — would leak it through Trazum's output; every response body
  that reaches an error passes through redaction on the way, and the key
  *shapes* are redacted alongside the exact string.
- **The narrowest key that works, named in the refusal.** A usage report needs
  read access and nothing that could spend money. A key the endpoint rejects
  produces an error naming the key *kind* required, never the key.
- **The endpoint is compiled in, not accepted from a flag.** Trazum's SSRF
  posture since 1.14 is that a caller *selects* an endpoint rather than naming
  one; a usage connector taking `--base-url` would hand that property back for
  the convenience of a self-hosted proxy nobody has asked for.

**Four guards fail the build rather than promising any of it.** No real-shaped
key material may be committed anywhere in the repository — the pattern is
calibrated against what a real key looks like, so an obviously fake fixture in
a test stays legal and a leak does not. The module that holds a key may not
call `console` or write a file at all. Every provider response body reaching an
error must pass through `redact`. And the endpoints must stay compiled in, with
no flag naming a URL. Each was checked against a planted probe before being
trusted: a guard that never fires is a guard nobody should believe.

### A connected report is a restricted report, and says so

Usage APIs serve **sums over a window**, not one row per call. The totals, the
model split, the day series and the cache verdict all work on a sum. Six
findings do not, and each is listed with why and what would unlock it:
`inputShapes` (the spread of call sizes is not in a sum), `truncationRetries`
(pairing needs both calls, their order and their stop reasons), `repeatedTurns`
(the same request twice is invisible once added together), `sessionCosts`
(conversations are not a dimension any usage API groups by), `contextPressure`
(it reads the largest single call, and a total has lost the maximum) and
`duplicateLines` (a doubled bill is caught by finding identical rows).

**It carries its own document shape**, rather than a `UsageProfileReport` with
holes in it. That is the load-bearing design decision of the release: with a
shared shape, a per-call finding would eventually read a zero this code wrote
and report "nothing found" about something nobody measured. Not recorded is not
not-happened — here enforced by the type system rather than by care.

### The asymmetry between providers is kept, not papered over

- **OpenAI serves a request count and Anthropic does not.** So a connected
  OpenAI report carries per-call averages and a connected Anthropic report says
  why it carries none: `calls` is `null`, never `0`, because zero reads as "no
  traffic" against real spend. Merged buckets follow the same rule — a known
  count added to an unknown one is unknown, not a number describing half the
  traffic.
- **OpenAI reports cached tokens *inside* the input total.** Read at face
  value, the same tokens would be billed twice — once at the full input rate
  and again at the cache rate. The uncached half is the subtraction.
- **Anthropic's two cache-write TTLs are kept apart**, as everywhere else in
  this product, because they bill at 1.25x and 2x and a total that has lost the
  split cannot be repriced. When only the flat legacy field is served, the
  cheaper rate is assumed for the headline and the worst case is carried, so
  the cache verdict says *unsettled* rather than settling in your favour.

### A partial pull is a partial pull, out loud

Six gap kinds, each returned with what did arrive rather than thrown away:
`rate-limited` (the provider stopped us, and the rest of the window was not
measured), `cursor-expired` (it said there was more and served no cursor to
reach it), `page-limit` (fifty pages, so the window is incomplete — narrow it),
`unreadable-entry` (a bucket with no readable window, or a result naming no
model, is left out and named), `unreadable-field` and `retention-boundary`. A
bill quietly short by an unknown amount is the failure this repository refuses
everywhere it can occur, and a paginated API behind a rate limit is exactly
where it occurs.

### Two ways to run it without spending anything

- **`--dry-run`** prints exactly what would be called and which environment
  variable the key would come from. It sends nothing and needs no credential —
  the way to find out what this command wants before giving it anything.
- **`--payload <file>`** prices a response you already have, with no credential
  and no network. People save API responses: from a support thread, from a curl
  in a runbook, from a colleague who has the admin key when they do not.

### The module underneath

`@trazum/core` gains `connector.ts` (`CONNECTORS`, `normalizeAnthropicUsage`,
`normalizeOpenAIUsage`, `bucketedProfile`, `bucketedCacheEconomics`),
browser-safe and pure: the fetch, the credentials and the pagination live in
the CLI, the same split `openrouterOverlay` has had since 1.13. The connected
document is contracted in docs/json-output.md and enforced in both directions
by a parity test. `--since`/`--until` parsing moved to one shared parser: two
parsers for one flag pair is one too many.

### What changed from the plan, on the record

The plan said `--from-provider` on every command that reads a log. **It is not
in this release**, and the reason is the release's own argument: these sources
serve aggregates, and wiring an aggregate into a per-call report means
synthesising rows — inventing the very per-call data the module spends its
length refusing to invent. Those commands get connected data when a per-call
source exists, which is the gateway in 1.51. Shipping the flag over synthesised
rows would have been the flattering version of this release.

---

## 1.40.0 — "The long run"

The fifth and last of the five planned in `docs/plan-1.36-1.40.md` — the
arc is delivered. Every comparison in Trazum is between two logs, and a
product's cost problem is rarely visible in two: it is visible in twenty.
This release is the twenty.

### `trazum history <dir>` — many reports, one series

```
The long run: 4 periods, 2026-07-01 → 2026-07-27
  w0.report.json  $9.40 · 5 calls · 5.0 days
  w1.report.json  $13.42 · 7 calls · 5.0 days
  w2.report.json  $17.32 · 9 calls · 5.0 days
  w3.report.json  $21.10 · 11 calls · 5.0 days

  ! support has climbed for 3 consecutive periods since w0.report.json:
    $8.40 → $20.10. A shape, not a forecast.
  ! claude-opus-5's share of the bill has climbed for 3 consecutive periods
    since w0.report.json: 89.4% → 95.3%. The totals can look flat while the
    mix moves under them.
  ! The cache share has decayed for 3 consecutive periods since
    w0.report.json: 23.5% → 3.8% — slowly enough that no single report
    called it a finding, which is exactly why a series exists.

  ! Routing and batching support (claude-opus-5) has been planned 2 times
    and is still in the newest plan — a decision nobody is revisiting.
```

**Derived from stored reports, never re-parsed logs.** The input is a
directory of the `--json` documents `profile` already writes, plus any saved
plans beside them. A team can keep a year of reports and throw the raw logs
away — which is what the privacy story requires anyway: the stored documents
carry no prompt text, no session keys and no per-call rows, so the long run
is built from data that was already safe to keep.

**The consecutive-movement rule.** A finding needs at least `MIN_RUN` (3)
consecutive rises or falls — a run of 3 spans four reports. Two rises is
what `profile --against` already shows, and one is noise wearing a trend's
clothes. The run is named with where it started (*since w0.report.json*) and
its first and last values, so the reader judges the size — never a
percentage per period, which would be a fitted line in disguise.

**The findings only a series can make:**

- **A label climbing.** 4% a week for eleven weeks never trips a weekly
  gate; eleven consecutive rises in a series is unmissable.
- **A model share climbing under flat totals.** The bill holds steady while
  the mix underneath moves toward the expensive model — invisible to every
  total, visible to a share series.
- **The cache share decaying.** Slowly enough that no single week's report
  called it a finding, which is exactly why a series exists.
- **The same action planned again and again.** Saved plans in the directory
  are held against each other: an action appearing in two or more plans is
  named as *a decision nobody is revisiting*, with first and last planned
  dates. 1.38 made plans files and 1.39 made them checkable; this makes
  ignoring them visible.

**Still no forecasts.** Twenty points make a trend visible; they do not make
next month knowable. The series is stated, the shape is named, and where it
goes next remains the reader's to judge — the same refusal `modelMixDrift`
has carried since 1.27, now at series length. The refusal is printed in the
report's own footer.

**The refusals, each with its reason:**

- **A report with no span is on no timeline** — named, never silently
  absorbed, because a period that cannot be placed would have to be guessed
  into position.
- **A JSON file that is neither a stored report nor a saved plan is named**
  rather than skipped: a directory of "all my reports" that quietly ignored
  one file would be a series wrong by an unknown amount.
- **Fewer than three dated reports is an error naming the right tool**: two
  reports is a comparison, and `profile --against` already does that better,
  with drivers attributed.

### The document

`history --json` emits the history document — the ordered periods, the three
series (label dollars, model shares, cache share, with null for absence
because absence is not zero), the runs, the repeated plan actions, and both
named exclusion lists — contracted in docs/json-output.md and enforced in
both directions by a parity test. `--markdown-out` writes the series for a
CI summary.

### The module underneath

`@trazum/core` gains `history.ts` (`buildHistory`, `storedReportFrom`,
`MIN_RUN`), browser-safe: documents in, series out. `storedReportFrom`
returns null for anything that is not a profile document, so the caller
names the file instead of absorbing it.

### What stayed out, and why

**Waiver history.** The plan called for "a finding waived three times in a
row is a decision nobody is revisiting" — but no document stores *past*
waivers: the config holds only the waivers currently in force, and a history
invented from the current config would be a guess presented as a record.
The shape of the feature is right and the data for it does not exist yet;
when waivers are recorded somewhere with dates, the series can be built the
same way the plan series is. Plan history shipped instead, because plans
*are* dated documents already.

---

## 1.39.0 — "Did it work?"

The fourth of the five planned in `docs/plan-1.36-1.40.md`, and the release
that makes Trazum accountable to its own predictions. Every optimisation
tool says what you *would* save; almost none says what you *did*. From this
release, a plan saved with `trazum plan -o` is a promise the repository can
be held to.

### `trazum verify <plan.json> --against <newer.jsonl|dir>` — the reckoning

```
Did it work? 5 actions from the plan of 2026-08-19, against this log
  1 arrived · 2 did not arrive · 2 cannot be told. The third is not a soft
    version of the second: it means this log cannot answer, which is its own
    finding.

  → Route and batch support (claude-opus-5) — ARRIVED
  · the label's dearest model is now claude-sonnet-5 · $8.12 on the target,
    $0 still on the old model
  · the batch half of this action cannot be seen in token counts; the
    verdict above is the route half alone
  · the world moved too: calls 5 → 10, output/call 1,000 → 1,200 tokens —
    stated so the verdict is not read as the whole story

  → Fix the truncation retries on digest (claude-opus-5) — DID NOT ARRIVE
  · this log still shows $8.00 of truncation waste and retries

  → Fix the cache on rag (claude-opus-5) — CANNOT BE TOLD
  · the label carries no priced traffic in this log — a vanished workload is
    not a fixed one, and not a broken one either
```

**Three outcomes, never two.** Arrived and did-not-arrive are measurements;
*cannot be told* is the log refusing to guess — the workload vanished, the
fields the detection needs stopped being recorded, or the thing is invisible
to token counts. The third outcome is the honest one, and the one every
other tool renders as the first: a dashboard that shows a vanished workload
as "saving achieved" is congratulating a team for turning a feature off.

**The verification rules, per action kind:**

- **A route is judged on the label's dearest model in the newer log** — the
  same rule the fleet's split-brain detection uses, so one stray call on the
  old model does not un-verify a completed migration, and one experiment on
  the target does not verify an incomplete one. The money still sitting on
  the old model is printed either way.
- **A truncation fix is judged on the measured retry bill** — zero pairs is
  arrived, a persisting bill is not-arrived with the new figure. The
  detection needs sessions and timestamps: a newer log that dropped them
  reads "no retries" for the wrong reason, so it is *cannot be told* — and
  it fails the gate, because a team must not pass on the strength of its own
  log's silence.
- **A cache fix is judged on the settled verdict only.** Paid-off is
  arrived; a settled loss is not-arrived with the new delta; a verdict that
  can no longer settle (the TTL field is gone) is cannot-be-told and fails
  the gate for the same reason.
- **A pure batch action is always *cannot be told*: tokens do not say which
  tier billed them.** The Batch API is invisible in usage logs, and saying
  so beats assuming the discount happened. It fails no gate — the silence is
  the provider's log format, not the team's. On a route+batch action the
  route half is judged and the batch half is named as unobservable, never
  counted as arrived.

**Differences are attributed, not just stated.** Every plan action records
its baseline since this release — calls, dollars, tokens per call at plan
time — and the verification prints the world's movement beside each verdict:
`calls 5 → 10, output/call 1,000 → 1,200`. "The prediction was wrong" and
"the traffic doubled" are different sentences, and a verdict without the
second is read as the first.

**A repricing is named, not priced through.** A plan made under one
catalogue and verified under another sets `pricesChanged`, and the rendering
says every dollar comparison is two price lists rather than one measurement
— the tool must not blame a team for a saving that arithmetic revoked.

### `--gate` — promises, checkable in CI

```
GATE FAILED — 2 of 5 actions did not produce what the plan promised, or
stopped being measurable by the team's own log.
```

Exit 1 on any `not-arrived`, and on `cannot-tell` when the reason is
`fields-stopped` — "not recorded" must not read as "fixed". A vanished
workload and an unrecordable tier fail nothing: the first is the world's
doing, the second is the log format's. This is a different and more useful
gate than "spend went up": it fails when a change a team committed to did
not produce what it promised.

**The refusals, each with its reason:**

- **A missing `--against` is an error naming why**: a plan can only be
  verified against a log that came after it — without one there is nothing
  to hold the prediction to.
- **A file that is not a plan document is refused by shape** (`schemaVersion
  1` with an `actions` array), naming what `trazum plan -o` writes — not
  parsed optimistically into empty verdicts.

### The document

`verify --json` emits the verification document — the three counts (always
summing to the action count), the verdicts with `observed` and
`attribution`, the `pricesChanged` flag, and `gateFailures` — contracted in
docs/json-output.md and enforced in both directions by a parity test.
`--markdown-out` writes the verdicts for a CI summary.

### The module underneath

`@trazum/core` gains `verify.ts` (`verifyPlan`, typed `VerifyOutcome` and
`CannotTellReason`), browser-safe: two documents in, one verdict out. The
plan module's actions now carry `detail.baseline`, which is what makes
attribution possible — a prediction with no record of the world it was made
in could never separate its own error from the world's movement.

---

## 1.38.0 — "The plan"

The third of the five planned in `docs/plan-1.36-1.40.md`. The report names
findings; a person then decides what to do first by doing arithmetic in
their head — and head-arithmetic on savings gets done by *adding* them,
which the levers module has documented as wrong since it shipped: $12.60 for
the route plus $10.50 for the batch, against a slice that costs $21.00 in
total. This release does the composition once, correctly, and writes the
result down where it can later be held to account.

### `trazum plan <log|dir>` — what to do first, costed and ranked

```
The plan: 5 actions against a $53.56 bill
  $41.60 projected savings, on assumptions listed below. $20.50 already
  spent on problems this plan names — measured, not projected.

  → Route and batch rag (claude-opus-5)  $19.00 projected
    to Claude Sonnet 5 — combined with batching where both apply, never summed
    ? assumes Claude Sonnet 5 can do this work — the log prices the move, it
      cannot judge the answers
    ? assumes these calls can wait for a batch window
    check it: trazum route <log> --prompt-file <prompt> --cases <cases>

  → Look at the cache on rag (claude-opus-5)  $12.50 already spent
    ? assumes the traffic pattern holds — a cache that lost money on this log
      may pay on different traffic

  → Fix the truncation retries on digest (claude-opus-5)  $8.00 already spent
    ? assumes the retry pattern is real — the log sees shapes, not content
    ? assumes a max_tokens the answers fit in removes the pair

  Ranked by money, projected or already spent alike. The assumptions are
  yours to answer: this plan is arithmetic over the log, not knowledge of
  your product.
```

**Non-additive by construction.** Route and batch on the same slice arrive
as a single pre-combined action carrying the levers module's `combinedUsd` —
batch applies to the *cheaper* model's price after the route, not to the one
you left. Actions on different slices add cleanly, so the plan's totals are
sums of non-overlapping figures by construction rather than by hope.

**Projections and stakes never merge.** Every action carries exactly one of
`savingUsd` (projected — the route, the batch) or `stakeUsd` (already spent,
measured — the truncation retry bill, a settled cache loss), and the two are
totalled apart. "What you would save" and "what you already paid" folded
into one figure is a number that is neither.

**Every action names what the log cannot confirm.** The cheaper model's
competence, the batch window's tolerability, the retry pattern being real —
typed assumptions attached per action, with the Trazum command that can
check one where a command exists (`trazum route` for the route's competence
question). A plan that hides its assumptions is advice pretending to be
arithmetic. The assumptions travel as data, not prose — `{"kind":
"model-capability", "model": "Claude Sonnet 5"}` — so the terminal localizes
them and 1.39's verification will match them structurally.

**The plan is a dated file.** `-o plan.json` writes the document with
`createdAt` and `pricingLastReviewed` on record — the catalogue that
actually priced it, an overlay's date when one was in effect — which is what
lets a later check tell "the prediction was wrong" from "the prices
changed". A prediction nobody wrote down is a prediction nobody can be held
to, and 1.39 exists to hold them. `--markdown-out` writes the same plan for
a CI summary or a pull-request comment; `--json` prints the document.

**`--min-usd <n>` cuts the noise floor honestly.** How many actions were
dropped and what they were worth *together* is stated, never silent — and
the saved document recomputes its totals over the actions it actually holds,
so a filtered plan never contradicts itself. Dropped is dropped, not
disproved, and the copy says so.

**The refusals, each with its reason:**

- **A cache action exists only for a settled loss.** When the log did not
  record the write TTL, the verdict is unsettled — and "add the field" is
  the report's advice, not a plan's. An action built on an unsettled verdict
  would be a recommendation resting on a guess about which rate applied.
- **A log that priced nothing is an error naming the next step** (`trazum
  profile`), not an empty plan — a plan over zero dollars is advice about
  nothing.
- **No target names the usage in full**, including that the argument can be
  a directory of rotated logs.

### The document

`docs/json-output.md` gains the plan document as its own contract —
`schemaVersion`, the dated stamp, the span or its honest null, the ranked
actions with their typed assumptions, the two totals kept apart, and the
bill the plan was made against. Enforced in both directions by a parity
test: a documented field that vanishes fails, and a field added without a
line in the doc fails too. The profile document's own contract test is now
scoped to its own table, since the file describes three shapes.

### The module underneath

`@trazum/core` gains `plan.ts`: `buildPlan(report, levers,
pricingLastReviewed)` and `planLabelName`, browser-safe — everything is
derived from figures the report and the levers already computed. Nothing is
invented: route and batch come from `billLevers` (combined, never summed),
the truncation stake is the measured retry bill, the cache stake is
`cacheEconomics`' own delta.

### What stayed out, and why

The plan document deliberately spans one log. Comparing a plan against a
*newer* log — did the routed slice actually shrink, did the retries stop —
is 1.39.0's verification, and building half of it here would have shipped a
comparison with no attribution rules.

The spec's "actions needing no human judgement" filter for `--effort`. In
this design every action carries at least one assumption — that is the
point of the plan — so a filter for assumption-free actions would return an
empty plan on every log, a flag that always says nothing. The effort dial
that exists is `--min-usd`, named for what it actually filters by.

---

## 1.37.0 — "The fleet"

The second of the five planned in `docs/plan-1.36-1.40.md`. `profile` merges
a directory of logs into one honest bill, which is right for one service and
wrong for twelve: the merged report hides which service the money is coming
from, per-service budgets cannot exist at all, and the findings a comparison
*between* services could make are invisible. This release is the comparison.

### `profile <dir> --by-source` — one summary per service, and the bleeder named

The config gains a `sources` block — a name per service, each with glob
patterns over log paths — and `--by-source` walks the directory recursively
(the fleet's whole point is one directory per service, so this is the one
mode where the walk descends), assigns each file to the most specific
matching pattern, and renders the fleet:

```
The fleet: 2 sources · $21.00 · 3 calls
  api  $20.00  95.2% of the fleet · 2 calls · 9.0 days
  web  $1.00  4.8% of the fleet · 1 call · 0.0 days

  ! api is where the money is: $20.00, 95.2% of the fleet's total.
  These sources cover different periods, so the shares above compare totals,
  not rates — a 3-day log looks cheap next to a 30-day one for reasons that
  have nothing to do with cost. Each row states its own span.

  ! The same workload runs on different models in different sources — support:
    api → claude-opus-5 ($20.00), web → claude-haiku-4-5 ($1.00). Same job,
    different rate cards; whether that is a decision or an accident is not in
    the logs.
  ! logs/stray.jsonl matched no source pattern, so it is in no report above —
    spend missing from every bill until a pattern covers it.
```

Pattern precedence is the budget patterns' own most-specific-wins rule,
applied across sources — two rules for pattern precedence in one tool is one
rule too many. `services/api/**` beats `services/**` on the same file, whoever
owns each pattern.

**The findings are the ones a merged bill cannot make:**

- **Split brains.** The same workload label running on different models in
  different sources — one team on Opus, another on Haiku, same job. Judged on
  each source's *dearest* model for the label, so a single stray experiment
  call does not report a team as migrated. Only splits where both sides carry
  real spend are reported, dearest gap first. Whether the split is a decision
  or an accident is not in the logs, and the copy says so instead of guessing.
- **Cache underwater in a named source.** Caching that pays for the fleet in
  aggregate while losing money in one service — the aggregate verdict is the
  flattering rendering when a source is quietly underwater, so each one is
  named with its own delta. Reported *only when the aggregate pays off*: when
  the aggregate itself loses money, the whole-fleet report already shouts,
  and repeating it per source would be the same alarm in pieces.
- **Mismatched spans, in the copy.** Shares of the fleet's total are shares
  of a sum, and stay valid — but reading them as *rate* comparisons is the
  mistake the flag exists to stop. When sources' logs cover meaningfully
  different periods (spans more than a day apart, or some with no clock at
  all), the report says so and each row states its own span.

### `spend.bySource` — a budget per service, failing by name

```
FAILED — api spent $20.00 against its budget of $5.00 in spend.bySource. The
fleet total can be fine while one service bleeds; this gate names which.
Within budget: web spent $1.00 against its $10.00 in spend.bySource.
```

The fleet total can be fine while one service bleeds — that is the whole
reason per-service budgets exist. Each source is gated against its own figure
in the same run, exit 1 naming the failing service.

**The refusals, each with its reason:**

- **A budgeted source with no logs is named, not passed.** "Did not appear"
  is not "under budget" — a service whose logs stopped arriving would
  otherwise pass forever on the strength of the silence.
- **Files matching no source pattern are named loudly.** A log in no report
  is spend missing from every bill, which is the flattering omission this
  repository refuses everywhere it can occur.
- **`--by-source` without a `sources` block is an error naming the fix**,
  not an empty fleet — a report over zero sources would be "nothing is
  bleeding" said about nothing being measured.

### The JSON document

`profile <dir> --by-source --json` emits the fleet document: the full
per-source reports (each one exactly what `profile` would say about that
service alone), the rollup — totals, shares, the worst source, split brains,
cache-underwater sources, the mismatched-spans flag — and the unmatched
files. Documented field by field in docs/json-output.md.

### The module underneath

`@trazum/core` gains `fleet.ts`: `assignSources()` (file-to-source assignment
by most specific glob, unmatched files returned rather than dropped) and
`fleetRollup()` (the rollup with every finding above). Browser-safe — it
reads no files and runs no globs against a filesystem; the caller hands it
file names and per-source reports, so the CLI keeps its monopoly on I/O.
`sources` and `spend.bySource` validate in the config schema with the same
discipline as everything else there: non-empty pattern lists, no empty names,
and no filesystem checks — which files exist is the CLI's question.

### What stayed out, and why

A `source` column on `--csv-out`. The CSV contract is one row shape per file
so nothing has to be filtered before it can be summed; a source column would
make the slice shape mean different things with and without `--by-source`,
and a chart summing across it would double-count the fleet. Per-source CSV is
a run of `profile` per source directory, which needs no new contract.

---

## 1.36.0 — "The estimate stops guessing"

The first of the five planned in `docs/plan-1.36-1.40.md`, and the one that
introduces Trazum's two halves to each other. The estimating half (`optimize`,
`check`, `diff`, `rank`) multiplies a token delta by a call volume, an output
size and a cache hit rate that somebody typed into a config file. The
measuring half (`profile`) reads the provider's own billed counts and knows
all three exactly. Until this release they had never met.

### `optimize --from-log <usage.jsonl>` — the multiplication measured

```
Cost with Claude Opus 5
  1,043 calls measured over 12.0 days — 2,608/month at that rate · 512 output
  tokens per call, measured
  $161.20 → $103.40   saving $57.80/month (35.9%)
```

The token delta stays an estimate with its ±10% band; everything it is
multiplied by stops being a guess. The rendering names which figures are
measured on every line, because "measured × estimated" and "estimated ×
guessed" are different claims about the same dollar sign, and the reader
budgeting on the result must know which one they are holding.

Which workload the prompt is comes from `--label`, or from the config's
`labels` map read in reverse — the file on the command line looked up among
its values, with two labels mapped to one file refused by name rather than
resolved by silent first match.

**The refusals, each with its reason:**

- **Typed flags are refused beside it.** `--from-log --calls 5000` is a
  contradiction, not a preference order: measuring and typing the same figure
  cannot both be the answer. The same for `--output-tokens`,
  `--cache-hit-rate` and `--model`.
- **Nothing scales to a month under a week of data.** The week is the cycle
  traffic actually has, and a span shorter than one cycle scaled up
  multiplies whichever part of the cycle it caught — three weekdays scaled to
  a month is a Tuesday with a multiplier. Under the floor, the saving is
  stated over the exact period measured, every "month" disappears from the
  wording, and the refusal explains itself in the output.
- **A label with no priced traffic is an error naming the labels that have
  some.** A zero-call profile would price the change as *worthless* when the
  truth is *unmeasured*, and those read very differently in a review.
- **A label that ran on several models says so**: the figures use the model
  that carried the most spend, and the report states which share of the
  label's money that model covered.
- **Output never recorded renders as $0 measured, not $0 assumed** — the
  difference between "these calls produced nothing billable" and "nobody
  wrote the field down".

`--from-log` implies `--cost`: a log with billed token counts is proof the
prompt's traffic goes to a metered API, whatever the terminal running the
command bills like — without this, a subscription-billed host would suppress
exactly the figures the person measured in order to see.

### `optimize --all-labels` — which prompt to edit first

```
Every mapped prompt against its own measured traffic — 2 ranked by what the
change is worth
  → support  $57.80/month if optimised   prompts/support.txt · 1,178 → 742 tokens · $402.11 measured
  → chat     $3.20/month if optimised    prompts/chat.txt · 310 → 296 tokens · $12.40 measured
  ! orphan carries $250.10 of measured spend and no prompt file is mapped to
    it — the workload nobody can optimise because nobody said where it lives.
  retired is mapped to prompts/old.txt and has no traffic in this log.
```

Every prompt in the config's `labels` map, optimised and priced against its
own measured traffic, ranked by what the change is worth. Ranked by traffic
and never by prompt length — a big prompt on a dead workload is worth less
than a small one on a busy one — which is also why it requires `--from-log`:
ranking savings that were all multiplied by the same typed guess ranks the
prompts by length and calls it a priority.

Both coverage mismatches are named at the end, because neither side can see
them alone: a label carrying measured spend with no prompt mapped, and a
mapped prompt whose label has no traffic (retired, renamed, or a typo that
has been silently doing nothing). A mapped file that cannot be read is named
too — the mapping exists; the file does not.

### The module underneath

`@trazum/core` gains `measured-profile.ts`: `measuredUsage()` returns the
profile with its provenance attached — the span, the scaling factor when one
was applied, the chosen model's share, whether output was ever recorded — and
`labelCoverage()` returns both mismatch lists. The cache figure is documented
as what it is: a share of input *tokens* served from cache, not the share of
*calls* the config field was defined as. A measured token share beats a typed
call share, and the module says so rather than renaming one into the other.

---

## 1.35.0 — "The reader who is not in the terminal"

The last of the six planned in `docs/plan-1.30-1.35.md`, and the one aimed at
the person who owns the budget and does not run the CLI.

### The short form

`--markdown-summary` states the gate verdict, the bill, what changed against a
previous log with its largest driver, and the single lever worth the most —
then stops. Twelve lines against ninety, for a pull-request body or a weekly
note.

It is a **view over the same report, never a different set of figures**: a
reader who opens both cannot find them disagreeing. It returns before the full
rendering rather than filtering it, so a section added later cannot leak into
the short form by forgetting to opt out. One driver and one lever, because a
summary that lists everything is the report with a shorter heading. With no
previous log it says so, rather than implying a stability nobody measured.

### The comparison in the browser was already there

The plan's second item for this release was "the web bill accepts a
comparison". It has since 1.11, and coverage drift and the what-if
corrections reached it with their own releases — so the honest answer is that
nothing was missing, and no work was invented to look busy.

One real gap turned up while checking: the privacy sentence above the drop
zone said "the log", singular, on a page that has accepted two files for
twenty releases. The second was always read in the tab like the first; now the
promise says so where somebody about to open it will read it.

---

## 1.34.0 — "Findings as policy"

### A finding decided about, on the record

Trazum finds the same thing every run, and a team that has looked at a failure
and chosen to live with it had no way to say so — so the finding shouted
forever and the report lost authority. `waive` in `trazum.config.json` fixes
that, and its refusals are the design:

```json
"waive": [{ "gate": "maxUsd", "reason": "August migration doubles traffic", "until": "2026-09-15" }]
```

```
FAILED — this log spent $12.00 against a --max-usd of $8.00.
WAIVED — the maxUsd failure above is on the record and silenced until
2026-09-15 (28 days left): "August migration doubles traffic". The bill still
counts it; only the exit code is quiet.
```

**All three fields are required.** A waiver with no end date is a finding
deleted with extra steps; a reasonless one is a silence nobody can audit; one
naming an unknown gate is a decision about nothing, refused with the list of
what is waivable.

**Waived is shown as waived, never hidden.** The failure prints in full, its
explanation prints, the bill still counts it. Only the exit code goes quiet.

**An expired waiver fails the gate it silenced**, naming the date it expired
and the reason somebody wrote. That expiry is the entire mechanism by which a
waiver stays a decision rather than becoming a habit.

### What cannot be waived, and why

`maxUsd`, `maxDayUsd`, `maxSessionUsd`, `maxCacheLossUsd`, `maxGrowthUsd` and
`byLabel:<label>` are waivable. The growth gate's **coverage refusal** is not:
that failure says the comparison cannot be made, and waiving unmeasurability
would be a decision to stop measuring rather than a budget decision with an
end date.

---

## 1.33.0 — "The log it could not read yet"

### Gemini's shape, recognised because it is unambiguous

`usageMetadata` appears in no other provider's response — that is the
recognition bar, and ambiguous shapes stay refused rather than mapped
hopefully. `promptTokenCount` and `candidatesTokenCount` read as input and
output; `cachedContentTokenCount` is subtracted from the prompt count through
the same mechanism as OpenAI's `cached_tokens`, because Gemini sets the same
double-charge trap; `finishReason: "MAX_TOKENS"` joins the truncation
contract. The catalogue has priced `gemini-2.5-pro` and `-flash` since the
seven-provider work — what was missing was reading the log their SDK writes.

Already true, stated for the record: Bedrock's camelCase counts
(`inputTokens`/`outputTokens`) and OpenRouter's OpenAI-shaped usage were
readable before this release. Nothing new shipped for them; the sentence is
here so nobody discovers it by experiment.

### `--dry-run`: what the log could answer, before you wire it in

```
What this log can answer — no bill was produced
  ✓ The bill itself: totals, per-model split, cache economics, the levers.
  ✓ Per-workload findings and label budgets — "label" on 100.0% of records.
  ✗ Truncated answers and their retry bill — a stop reason on 0.0% of records.
```

Readiness per capability and no dollar figure at all, so nothing in it can be
mistaken for spend. It refuses to run beside a gate — a gate over a report
that was never produced would exit green having judged nothing — and it
distinguishes "nothing wrote to the cache" from a missing split, because
absent traffic and an absent field are different facts. Nothing parsing exits
non-zero: an unreadable log is not a ready one.

---

## 1.32.0 — "The routing decision, priced whole"

### The figure the target would refuse to bill, corrected in place

A cache entry only forms above a model's minimum prompt size, and a slice
whose largest call sits under the target's minimum could not create one — so
`--what-if`'s standard figure granted cache traffic discounted rates the
target would never concede, an error in exactly the flattering direction:

```
· tiny on claude-opus-5: $0.00380 → $0.00076
! Its cache traffic could not exist there: the largest call is 400 tokens
  against the target's 4,096-token cache minimum, so no call in this slice
  could create an entry. Without the cache the same tokens cost $0.00130 —
  the figure the target would actually bill.
```

The correction travels inside the slice (`cacheBeyondTarget` in the JSON), so
a consumer cannot print the discounted figure without it. Silent when the
calls clear the minimum, when nothing cached, or when the target's minimum is
unknown — nothing is claimed against a threshold nobody stated.

### The move, batched

The decision usually pairs the move with the Batch API, and the arithmetic in
a reader's head gets done by adding two savings — the mistake the levers
module documents. `--what-if` now states the moved bill with the target's
batch discount on top, computed on the target's rates with over-context money
excluded, and hedged: whether these calls can wait is not in the log.
`whatIf.batchOnTarget` in the JSON, null when the target sells no batch
discount — a different statement from a $0 saving.

### What stays out, and why

The plan named a check for `max_tokens` ceilings above the target's output
limits. The catalogue carries no output ceilings, and inventing them would be
this tool doing the guessing it exists to end — the check waits for the data.

---

## 1.31.0 — "The gate that explains itself"

### A failing gate says what to change

A gate printed a verdict and an exit code, and the person reading it is in
CI — the one place nobody opens the full report. Every spend gate failure now
carries its own next step:

```
FAILED — this log spent $12.00 against a --max-usd of $8.00.
  Most of it is rag on claude-opus-5: $10.00, 83.3% of the bill. That is
  where the money is, not necessarily where the fix is.
  The largest lever the report priced would save $5.00 on rag by sending it
  through the Batch API — enough to cover the $4.00 this is over by.
```

Nothing is invented: the overage is subtraction, the contributor is the
biggest slice already in the report, the lever is the report's own
arithmetic. Whether the lever covers the overage is stated rather than
inferred, and nothing recommends — whether that model can do the work is the
reader's to judge, and the copy says so. Written once, called by all four
gates.

### A tight pass says so

`Passed with 4.0% of the budget left`. A pass 2% under budget and a pass 60%
under are different states of the world, and only one of them is quiet news.
Said under a tenth of the budget, with the threshold in the sentence.

### The verdict reaches the CI summary

The gates spoke on stderr and stopped there, so a run summary carried the
whole report and not the one sentence explaining why the build was red.
`--markdown-out` now leads with the verdict — a failure quoted and bold, its
explanation beneath it, a pass stated plainly — and the GitHub Action already
pipes that file into the step summary, so red builds carry their reason with
no workflow change.

---

## 1.30.0 — "The report as a diff"

### What the comparison stopped being able to see

`--against` names the dollars that moved. Nothing named the findings that
stopped being *measurable* — and those look exactly like good news:

```
$4.00 → $4.00 · +0.0%
! Coverage moved: session was on 100.0% of records and is now on 0.0%.
  Gone quiet with it: conversation growth, per-conversation cost, repeated
  turns, truncation retries and the cache-TTL fit.
```

The bill is identical on both sides, which is exactly why this exists: a log
that stopped recording `session` has not fixed its conversation growth, it
went blind to it. A fixed finding and a blinded log are opposite facts the
dollars render identically, and coverage is the only thing that tells them
apart. Shares rather than counts, so two logs of different sizes compare;
20 points in either direction, stated in the copy; loud on a collapse, quiet
on a gain, because seeing more is not a regression.

### The gate refuses a comparison it cannot make

`--max-growth-usd` now fails when this log stopped recording a field the
previous one carried, before it judges the dollars at all:

```
FAILED — this log stopped recording session (100.0% of records before, 0.0%
now), so the comparison cannot be made. That is not a pass: a bill whose
growth nobody could measure is not a bill that stayed flat.
```

The same refusal `--max-day-usd` makes on a clockless log and
`--max-session-usd` on a sessionless one. A field that *appeared* never
refuses.

### The same finding on all three surfaces

The CLI, the MCP's `profile_usage` and the web bill render the drift at the
same threshold with the same split, so an agent relaying "spend flat, all
clear" cannot do it off a log that stopped measuring.

---

## 1.29.0 — "The budget, the overlay and the small log"

### The unit an agent product blows up in

A month's budget and a day's budget both pass while one conversation loops
its way through $400. `--max-session-usd` — or `spend.maxSessionUsd` in
`trazum.config.json`, flag winning — judges the single most expensive
conversation in the log:

```
FAILED — the most expensive of 3 conversations cost $8.00, over the
--max-session-usd limit of $5.00.
```

The report gained `sessionSpend` (`sessions` and `maxUsd`, no minimum)
alongside the percentile-gated `sessionCosts`, because a maximum is a fact
at any count. The refusals travel with it: a log with no sessions fails
rather than passes, a conversation that started before the log makes the
pass a floor and the message says so, and the session key never appears in
any output — pinned by tests on both the text and `--json` paths.

### The CLI's price table, in the MCP, as text

`profile_usage` gained `pricing_overlay`: the same JSON document a
`--pricing` overlay file holds, passed as text because this server takes
no paths — that absence is the security design, and it stays. Models the
overlay adds or overrides price the whole report, `what_if` included, and
the report says the overlay is in effect with the overlay's own
`lastReviewed` date. A malformed overlay is refused with the parser's own
reason, never a report quietly priced from the bundled table.

### The figure that survives a small log

`sessionCosts` refuses slices under five conversations — a percentile over
four is the largest of four wearing a percentile's name. Now, where the
percentiles refused and the log still carries sessions, the CLI, the MCP
report and the web bill state the count and the single worst cost — the
same figure `--max-session-usd` judges — and stand the line down the
moment the percentiles can speak.

---

## 1.28.0 — "The retry bill, the series and the standing word"

### The billed-again half, measured

The truncation finding has always said cut-off answers are *frequently
retried — billed again*, and that half was an assertion. Now it is a count
and two dollar figures:

```
  ! draft on Claude Opus 5: 2 of 3 truncated answers were followed within
    120 seconds by another call in the same conversation — $4.00 spent on
    the cut attempts, plus $4.00 on the follow-ups.
```

Attributed to the truncated call's slice — where the `max_tokens` ceiling
that caused the pair lives — with the checkable denominator, a two-minute
window, and the hedge in every rendering: the log cannot see content, so
the pair is a shape, not a certainty. A single pair is not reported.

### The drift, day by day

`--csv-shape model-day` writes one row per UTC day *and* model — the long
format a pivot table or a chart takes as-is — and `spendByDay` in `--json`
carries the same per-model split, so `modelMixDrift` stays the summary and
the raw series is available whole. No total row, model ids formula-defused,
unpriced models absent.

### The standing word

`spend.maxDayUsd` in `trazum.config.json` arms the per-day gate from the
repository instead of one CI invocation. The flag still wins when both are
present, and the config path inherits the refusal: a log with no timestamps
fails the day budget, because "not measured" is not "under budget".

---

## 1.27.0 — "The ceiling, the drift and the tab in step"

### The ceiling, seen coming

Input grows turn by turn or document by document, costs nothing extra to
grow — and then one call crosses the model's context window and the API
refuses it outright. The bill looks fine right up to the day the product
breaks.

```
  ! chat on Claude Haiku 4.5: the largest call carried 190,000 input tokens
    against a 200,000-token window — 95.0% of the ceiling.
```

Each slice's largest call (input, cache reads and writes — the model read
all of it) against **its own model's** window: the same 170k-token call is
an emergency on Haiku and irrelevant on Opus. Silent below half the window,
quiet from 50%, loud from 85%. Never a date for the crossing: a straight
line through two points is a guess wearing arithmetic's clothes.

### The migration a total cannot show

A bill can grow with no workload growing — traffic quietly moving from the
cheap model to the expensive one, a deploy that flipped a default, a
fallback that became the main path.

```
  ! claude-opus-5 went from 0.0% of the spend in the first 2 days to 100.0%
    in the last 2 — $2.00 of the recent half.
```

The log's days are split chronologically in half and each model's exact
share of each half's spend is stated. `null` under four dated days — one
day against one day is weather presented as climate. The renderings speak
past fifteen points of movement; `--json` carries every share either way.
And never a forecast: where the mix goes next is not in the log.

### The tab in step

The browser Bill tab picked up the four findings it lacked — the
doubled-bill warning, the same request sent again, the ceiling and the
drift — with the CLI's own thresholds, computed in the page, verified in
Chromium with zero network requests.

---

## 1.26.0 — "The release that releases itself"

### Merging the release PR is now the release

This version contains no product change. It changes what a version *is*: from
here on, merging the release PR publishes the packages, creates the
`v<version>` tag on the merge commit, and publishes the GitHub release from
this file — no tag to type, no second step to remember, no laptop involved.

A `decide` job fronts it: every push to main runs a seconds-long registry
preflight, and only the one push whose manifests name a version the registry
does not have goes on to release. Ordinary merges skip in nine seconds
(measured, on the first live run). A pushed tag remains the manual override,
and the Actions-tab dry run stays a dry run.

### npm can no longer fail the publish

Trusted publishing rejected this workflow's OIDC token on six real publish
attempts across three versions, and four releases went out from a laptop
because of it — which protects nothing and audits worse. The publish steps now
accept an environment-scoped npm token as the authentication fallback: absent,
OIDC is the auth exactly as before; present, the release goes out either way.

**Provenance survives both paths.** The attestation is signed with the job's
OIDC identity, which is independent of how the upload authenticates — so this
release, unlike every one before it, carries a verifiable provenance
statement. The security suite pins the containment: only `release.yml` may
reference the secret, only in one exact shape, and npm token material
committed anywhere fails the build.

### The documentation sweep is enforced, not remembered

A release is not cut until all the documentation says so. `verify` now fails
when the manifest version is missing from `CHANGELOG.md` (as a heading),
`ROADMAP.md` (by name) or this file (as a section) — so a release prep that
skips the docs cannot merge. The checklist in `docs/releasing.md` adds the
grep sweep for the stale references no test can know about.

Also in this version: every repository document caught up with the registry —
the README's action pins advanced to the 1.25.0 commit, the roadmap's Released
section no longer stops at 1.9.0, and `docs/releasing.md` tells the truth
about the trusted-publisher fight, including the by-hand procedure 1.25.0
used.

---

## 1.25.0 — "The retry, the archive and the shape in the tab"

### The same request, sent again

A conversation's input grows with every turn. So two consecutive calls in one
conversation carrying *exactly* the same input size, seconds apart, is the
shape of something going wrong:

```
  ! agent on Claude Opus 5: 5 of 6 calls re-sent the previous call's exact
    input size within 60 seconds, in the same conversation, costing $5.00.
```

A retry after a timeout, an agent step repeating because a tool call failed, a
loop that re-sends the whole context and gets nowhere — the call is billed in
full, and on an agent workload the input *is* the bill. 1.23's
`duplicateLines` catches the same line recorded twice; this catches two
different calls that sent the same thing.

Each call is compared only to the one immediately before it in the same
session, inside a one-minute window, and only where the log carries both a
session and a clock. It cannot see content, so it names the pattern and stops:
every rendering says *usually* a retry or a loop, never that it is one. A lone
repeat is not reported at all — a single retry after a timeout is ordinary.

### Rotated logs are read as they are

`logrotate`, Docker's json-file driver and every cloud log export compress
yesterday's file, so a directory of a month's logs is one plain file and
twenty-nine gzipped ones. Directory mode read the plain one and said nothing:
a month's bill reported from a day of it.

```bash
trazum profile /var/log/llm/    # today.jsonl + 2026-08-*.jsonl.gz, one bill
```

Decided by extension rather than by sniffing the first two bytes — a `.jsonl`
starting with `0x1f8b` is far more likely a corrupt log than a mislabelled
archive — and a `.gz` that will not decompress is an error naming the file,
never a bill quietly missing a day. `--against` accepts them too.

### The input shape, in the browser

The Bill tab gained the card the terminal and the CI summary already had: how
big a slice's calls are, whether the large ones dwarf the ordinary one, and
how much of that size was billed at the cache-read rate. Same threshold, same
sentences — two surfaces summarising one log differently is a second opinion
nobody asked for. Measured in your own tab, like everything else there.

---

## 1.24.0 — "How big, how uneven, and the day it spiked"

### How big these calls actually are

`profile` could say "input is 63% of this bill" and stop there. True, and
nothing follows from it. The question somebody can act on is whether *every*
call carries a large prompt or a few calls carry an enormous one — and those
two want opposite responses:

```
  rag on Claude Opus 5 is uneven: half its calls fit within 1,024 input
  tokens and 95% within 106,496 — about 104.0x the ordinary call, over $2.70
  of input spend.
  Past four times the median, the ordinary call is fine and something is
  growing on top of it: a conversation nobody truncates, a retrieval with no
  cap, a tool result pasted in whole. The fix is a limit on the large calls,
  not a rewrite of the prompt every call sends.
  Almost none of that was a cache read, so every one of those tokens was
  billed at the full input rate.
```

An even slice gets the other sentence, pointing at the prompt instead. Every
figure is a **bucket ceiling** rather than an interpolated percentile — "half
the calls fit within 1,024 input tokens" is exact for the number named — and a
slice with fewer than twenty calls is left out entirely rather than reported at
a precision it does not have.

### `--max-day-usd`, the gate a total cannot arm

A month at $3,000 against a $4,000 budget passes while one afternoon's runaway
loop burned $900 of it.

```bash
trazum profile month.jsonl --max-usd 4000 --max-day-usd 300
```

```
FAILED — 2026-08-14 spent $412.00, over the --max-day-usd limit of $300.00. A total
under budget can hide a single runaway day, which is what this gate exists to catch.
agent was the biggest label that day, at $380.00.
```

A log with **no timestamps fails this gate** rather than passing it: a bill
nobody could measure by day is not a bill that stayed under a daily budget.
Calls with no clock are in the total and in none of the days, so a *pass* says
how many were left out — a failure stands regardless.

### The CI summary says what the terminal says

`--markdown-out` is where most people will ever read this report, and three
findings were missing from it: the doubled-bill warning (above the figures it
would inflate, not below them), the input shape, and the `--what-if`
repricing — with its assumption above the figure there too, because a pull
request comment is exactly where a dollar amount with the caveat underneath
gets read as a recommendation and merged.

### Fixed

"1 lines are exact duplicates" could not agree with its own verb. It takes a
number now and reads "1 line is an exact duplicate", in both languages.

---

## 1.23.0 — "What if it were the other model?"

### `--what-if <model>`: these exact calls at another rate card

The levers section picks its own candidate. This answers the question you
arrived with — *`classify` spent $4,000 on the frontier model, what would
those calls have cost on the small one?*

```
trazum profile usage.jsonl --what-if claude-haiku-4-5
```

```
  These exact calls on Claude Haiku 4.5
  This is multiplication, not advice: the same token counts at another rate
  card. It says nothing about whether that model could do the work, and a
  model that answers at greater length or gets retried would not send these
  counts at all.

  → $1.00 of movable spend would have been $0.2000 — a difference of $0.8000.
    · chat on claude-opus-5: $1.00 → $0.2000
  ! huge cannot move: its largest call carries 250,000 input tokens and that
    model's window is 200,000. Those calls would fail, not cost less, so
    their $1.25 is excluded from the figures above.
```

Every token in that answer was actually billed — only the rate card changed —
so it is arithmetic rather than the guess about content `profile` refuses to
make. What makes it usable is what it declines to say:

- **A call the target could not have accepted is named, not priced.** It would
  fail, not cost less, and its money is in none of the totals. The ceiling is
  judged on the largest single call: one call over the line is a failed call,
  and an average hides it.
- **Spend already on that model stays out of the difference**, so a bill that
  is mostly already cheap does not report a 1% change and read as "not worth
  doing".
- **Models with no price here are named.** Their cost on the target is
  knowable; the difference is not.

The same comparison is in `--json` as `whatIf` — with `sameTokensAssumed`
inside the object, so a dashboard cannot print the figure without the caveat —
in the MCP `profile_usage` tool as `what_if`, and in the web Bill tab as a
model picker that reprices in your own browser tab. A model id nothing can
price is an error on all three, never a section that quietly says nothing.

### A doubled bill, caught

Reading a directory of rotated logs makes double-counting easy: a log exported
twice, an overlapping export, a copy left in the folder. The total then reads
high and nothing else in the report can see it.

```
  ! 2 lines are exact duplicates of an earlier line — same counts, same label
    and session, same millisecond — and they add $2.00 to the total above.
```

Counted only over records carrying a clock, comparing the raw line rather than
a hash, because a hash collision would report a duplicate that is not one and
this figure exists to make you distrust a total. It states the count and the
money and stops: whether it is a double export or a genuinely busy millisecond
is yours to know.

---

## 1.22.0 — "The gate, the window and the spreadsheet"

### The bridge between the two halves of the product

`check` gates what you **wrote**; `profile` measures what you **sent**.
Nothing told a reader those are different quantities — so when `labels` maps a
workload to a prompt file and a budget covers that file, the report now says
how much of the call that gate can actually see:

```
! The budget on prompts/support.txt is 2,000 tokens, and calls labelled support
  carry about 50,000 input tokens each — so that gate governs roughly 4.0% of
  what actually goes up the wire. The budget is not wrong; it is just smaller
  than the bill.
```

Only when the budget covers less than half the call — a budget doing its job
is not news — with the share named as approximate, because a file is counted
by the estimator and a call by the provider. Cached tokens count towards the
call: a cached token was still sent and still filled the window.

### `--since 7d`

"The last week" is what a nightly job asks for, and computing a date in a
shell to say it is the step that gets skipped. Days and hours on either bound,
plus `now`. Measured against **this machine's clock, not the log's** — said
out loud beside the window line, and named as the likely reason when a
relative window finds nothing.

### `--csv-shape day|hour`

The CSV wrote one table: label and model. The time series is what somebody
pastes into a chart, so it is a choice now rather than extra columns — one row
shape per file, because a spreadsheet that has to filter before it can sum is
a spreadsheet somebody sums wrong. The day table carries each day's biggest
label; a day whose calls carried no label leaves those cells empty rather than
inventing a name.

---

## 1.21.0 — "What the log does not say"

**A report that quietly omits half of itself is worse than one that admits
what it is missing.**

Every finding past the totals needs a field the log format does not require —
`label`, `session`, `ts`, `stop_reason`, the `cache_creation` object. A reader
who never adds them sees a shorter report and has no way to tell "nothing to
report" from "nothing recorded". The report now ends by naming each missing
field with what it would unlock:

```
What this log cannot answer yet
  "session" on 12/40,000 records: without it there is no conversation growth,
  no per-conversation cost, and no cache-TTL fit. It is grouped by and never
  printed.
```

**Counts, never booleans.** Twelve labelled records out of forty thousand is
not a labelled log — a boolean would call it one, and the other 39,988 would
never be found. Coverage is counted over records that *parsed*, priced or not,
because whether a field is present is a property of the log rather than of the
price catalogue; the cache-TTL line is counted only over records that actually
wrote to the cache, the one place its absence means anything.

A complete log gets **no section at all**: a paragraph of things that are fine
is the paragraph readers learn to skip. The same section, from the same
counts, reaches the MCP — where an agent told "labelled" by a boolean would
stop asking — and the browser.

**And the README caught up with eight releases**, so the first file anybody
reads finally describes the tool that exists: the conversation cost, the shape
of the day, the never-came-back ceiling, the third money gate, `spend` budgets
in the config, `--csv-out`, directory mode and the documented `--json`
contract.

---

## 1.20.0 — "When, and what you can build on"

### The shape of the day

```
80% of this spend lands in 2 hours of the UTC day (09:00, 10:00) — interactive
traffic somebody is waiting on, where the Batch API's 24-hour turnaround does
not fit.
```

The total says how much and the per-day series says which days. Neither says
*when in the day*, and that is what decides whether the Batch API — a flat 50%
— applies at all. `spendByHour` buckets exact per-record dollars by hour of
the UTC day, and the report states the measure that needs no threshold to
explain: **the fewest hours holding 80% of the spend**. Two hours is
interactive; twenty is background work, which is what the Batch API halves.

It names the lever and never claims the saving: whether a workload can wait a
day is a product decision counts cannot make. The browser draws the same
thing as twenty-four bars — with empty hours drawn empty, because a chart that
closed the gaps would make every workload look flat.

### `--json` becomes a contract

`docs/json-output.md` documents every top-level field, the output carries a
`schemaVersion`, and a test enforces the promise **in both directions**: a
documented field that disappears fails the build, and a field emitted without
a line in the doc fails it too.

The promises are the ones a dashboard needs: fields are added without a
version bump, so ignoring unknown keys keeps working; dollars are unrounded
numbers — the terminal rounds, the JSON does not; **absence is `null` or `[]`
and never zero**, because "not measured" and "measured as none" are different
answers; and nothing in the document carries a session key or prompt text.

---

## 1.19.0 — "Which workload, and at what rate"

**A total tells you something is wrong; this release tells you whose it is.**

### Truncation, with suspects

```
! 3 calls hit the max_tokens ceiling: $3.00 of output (12%) bought answers cut
  off mid-generation — paid in full and frequently retried.
    chat: 1 of 2 calls that recorded a stop reason were cut off (50.0%), $1.00
    of output. The denominator is the calls that measured, not every call.
    95% of the answers that finished fit within 4,096 output tokens.
```

The report could say a bill paid for cut-off answers and not which workload
was paying. It names them now, ranked by wasted output — and the **rate** is
the finding: 40% is a `max_tokens` setting that is simply wrong, 1% is a long
tail, and the two call for opposite responses.

The denominator is stated because it is the honest part: calls that *recorded
a stop reason*, never every call, since a workload logging the field half the
time is not a workload whose other half completed. Beside it, the ceiling the
finished answers actually needed — the number a cap wants, next to the
evidence that the current cap is too low.

### Click a workload, see it alone

The web Bill tab's per-label table became clickable: the CLI's `--label`
without retyping the command. The banner carries the awkward half out loud —
every share below is a share of *that workload's* bill, not of the log — and a
drill-down inside a drill-down is not offered, because it would filter an
already-filtered report and quietly produce an empty one. Verified in a real
browser, zero network requests.

Every finding in this release renders the same way in the terminal, in
`--markdown-out`, in the MCP and in the browser.

---

## 1.18.0 — "The bill, where the decisions are made"

**Three additions about where a cost report actually gets used: in a repository,
in a spreadsheet, and over the month of logs you already have.**

### Budgets that live in the repository

```json
{ "spend": { "maxUsd": 200, "byLabel": { "chat": 40, "batch": 120 } } }
```

```bash
trazum profile logs/yesterday.jsonl     # no flags — the policy is in the repo
```

`budgets` gates the tokens a prompt file may hold; `spend` gates the dollars a
usage log records. A per-workload budget is a policy several people agree on,
and a policy that lives in one CI invocation is a policy nobody can read.
Flags still beat the config, as everywhere.

Two refusals keep it honest. A budgeted label with **no calls in the log** is
reported as *not measured*, never as a pass — a workload that did not appear
is not one that came in under budget. And per-label budgets are **not applied
under `--since`/`--until`**, because a window makes "what this label spent"
mean a slice, and a budget written for the whole period would gate against
something it does not describe.

### The report as a spreadsheet

```bash
trazum profile usage.jsonl --csv-out spend.csv
```

One row per label and model — the grain a routing or budget decision is made
at. **No total row**, because a total inside a data file gets summed with the
data and doubles every figure downstream. **Empty dollar cells for unpriced
models**, never zeros, because their tokens are real and a `0` would claim the
calls were free. And a label starting with `=`, `+`, `-` or `@` gets an
apostrophe: a usage log is data, and a spreadsheet would otherwise run it.

Writing that flag found two real defects, both fixed: under `--json` neither
`--csv-out` nor `--markdown-out` wrote anything at all, and the "wrote to"
notice went to stdout and turned a parseable JSON document into a parse error.

### A month of rotated logs, read as one bill

```bash
trazum profile logs/ --max-usd 500
```

Logs rotate one file per day; `cat`-ing them together before a profile will
read them is the kind of setup cost that gets a tool skipped. A directory is
read in name order as one bill, the number of files stated — a report over
"the logs" that silently skipped one is a total wrong by an unknown amount —
and a directory with nothing readable is an error naming the extensions it
looked for, never an empty report that reads as "you spent nothing".

---

## 1.17.0 — "What the report cannot see"

**A report is only as good as what it admits it missed.** This release closes
the last places where Trazum could hand back a confident number over partial
data — and adds the per-conversation figure a price is actually set from.

### A gate that judges part of a bill says so

```
Note: the gated figure is a floor, not the bill — 1 line was unreadable and
left out. Whatever those calls cost is not in the number the gate just judged.
Within budget: $5.00 spent against --max-usd $9.00.
```

Three things hide spend from a gate: unreadable lines, models the price table
does not know, and clockless calls dropped by a `--since`/`--until` window.
The pass still prints — a floor is a legitimate thing to gate on — but it now
means "the part I could read fits", never "the bill fits".

### `--against` warns when the two logs overlap

Two logs that both cover the same day put the same calls on both sides of the
subtraction, so part of the reported growth is the same money counted twice.
Warned between the totals line and the drivers built from it, and only when
both logs carry a clock: unknown stays silent rather than reassuring. The
whole comparison — totals, warning, drivers per label and per model — also
reaches `--markdown-out`, which had been showing one log out of two.

### What one conversation costs

```
chat on Claude Opus 5: across 4,812 conversations, the median one costs $0.02
over 6 turns, 95% come in under $1.80, and the most expensive was $46.10.
```

"Support cost $4,000" does not say whether that is forty thousand cheap
conversations or four hundred expensive ones, and a per-seat price, a quota or
a runaway-loop alarm all need the answer. The **median** is what a typical
conversation costs; the **p95** is what a quota has to survive; a mean is
refused, because one runaway loop drags it up and hides the ordinary case. A
p95 past ten times the median is called out as a tail a quota can catch — and
a p95 beside the median gets the opposite advice, because there is no tail to
hunt. Exact billed counts, on the terminal, in `--json`, in the MCP and in the
browser. Session keys group turns and never appear.

---

## 1.16.0 — "The worst case, on the record"

**Three additions, one posture: when the report cannot be certain, it says
the uncomfortable half out loud — and gates on it.**

### `--max-cache-loss-usd`, the third money gate

```
trazum profile usage.jsonl --max-cache-loss-usd 5
```

Exit 1 when caching **added** more than the limit to this bill — the
`cacheEconomics` counterfactual as a CI gate; exact, the same tokens at the
published input rate. And it reads the **worst case** on purpose: a log
carrying only the flat cache-write count cannot say which TTL was paid, the
settled figure and the 1-hour worst case can straddle the limit, and a gate
reading the flattering half would pass exactly the bills it exists to catch.
The failure message says which claim fired — a settled loss, or a ceiling
only the missing `cache_creation` field can settle. In the Action as
`max-cache-loss-usd`, self-tested in CI on a +$1.25 loss.

### The price table's age, said out loud

Every dollar a profile prints uses the bundled price table, and the one fact
that silently invalidates all of them is a table the provider has re-priced
since — an error that does not name its own size. Past 45 days, the terminal,
the markdown, the MCP and the web all say so loudly, with `--pricing-live` as
the fix; `--json` always carries `pricing.lastReviewed` / `pricing.ageDays`
as provenance. The tests pin the rule, not the calendar: a freshly reviewed
table asserts the opposite behaviour and passes the same suite.

### The day series in the markdown

The spend-per-day table the peak sentence summarises — day, exact dollars,
calls, biggest label — capped at the most recent 14 days with the earlier
ones counted out loud, absent for a single day because one row is the total
again. The full series still rides `--json` as `spendByDay`.

---

## 1.15.0 — "The same answer on every surface"

**1.14.0 added the drill-downs and the drive-by finding; this release makes
every surface give the same answer about them — and adds the one question the
per-workload rows cannot answer.**

### The change by model — where the mix moved

```
  +$4.00  chat  ($1.00 → $5.00)

  The same change, by model — where the mix moved:
  +$5.00  claude-opus-5  (new since the previous log)
  -$1.00  claude-haiku-4-5  (gone since the previous log)
```

A workload that keeps its name and switches from Haiku to Opus reads as "chat
grew" in the per-label drivers — true, and not the reason. `--against` now
splits the same change by model, appeared and vanished models named; one model
on both sides stays silent, because it would restate the totals line. Both
driver sets ride `--json` as `against.byLabel` / `against.byModel`.

Underneath, the union-and-subtract is now **one implementation in
`@trazum/core`** (`driversBetween`), imported by the CLI, the web and the MCP
— its sign convention (positive means the bill grew) flipped once in this
repository's history when restated by hand, and that class of bug dies with
the duplication.

### The comparison reaches the MCP

`profile_usage` gains `previous_log` — the totals with the convention stated
before the first figure, the drivers per label and per model, and a previous
log with nothing priced reported as its own answer rather than zero growth.
`label`, `since` and `until` filter **both** logs, so the comparison stays one
workload and one period.

### The drill-downs reach the Action and the browser

The spend gate takes `label`, `since` and `until` — one workload's budget, or
one period's, in a workflow — with the CLI's refusals intact and self-tested
in CI on hand-checkable arithmetic. The web Bill tab grows two date fields
with the same reading (a bare date is that whole UTC day; the same window on
both logs of a comparison; clockless calls counted out loud), verified in a
real browser with zero network requests.

---

## 1.14.0 — "Drill-downs and drive-bys"

**Two new questions the profile can answer: "what did *this week* cost?" and
"what do the conversations that never come back cost?"**

### One period, honestly

```
trazum profile usage.jsonl --since 2026-08-11 --until 2026-08-17 --max-usd 200
```

`--label` drilled into one workload; `--since`/`--until` drill into one
period. A UTC day or a full ISO 8601 timestamp — and a bare `--until` date
includes the whole day it names, because a window that excludes the day it
names is a trap for everyone who reads dates the way humans do.

The honesty rules carry the feature. A call with no `ts` cannot be placed
inside or outside a window, so it is excluded and **counted out loud**: the
window's figures are a floor on the period, and the report says so. A window
matching nothing is an error naming what the log does cover — never a $0
report, which under `--max-usd` would pass a budget gate over a period the log
does not contain. With `--against`, both logs get the same window, and the
money gates gate the window: yesterday against the day before, with a budget,
in one line of CI.

### The drive-bys

A cache write is a bet: pay 1.25x input now (2x at the 1-hour TTL) so the next
turn reads the prefix at 0.1x. A conversation that ends after its first turn
never places that next call — and on a workload with many short sessions this
leaks steadily while the totals look healthy, because the long sessions' reads
pay for the cache overall.

```
  ! chat on Claude Opus 5: 12 of 42 conversations ended after their first
    turn and spent $6.25 writing a cache that nothing in this log ever read.
```

The figure is stated with the precision the provider's cache actually allows:
it is keyed by **prefix**, not by conversation, so another session sharing the
prefix within the TTL could have read those writes and the log cannot see
whose write a read hit. With reads anywhere in the slice, the figure is a
**ceiling, named as one**. With zero reads, the ceiling collapses into a fact,
said loudly: those writes bought nothing. Needs only `session` on the records
— no clock — and the session key is grouped by and never shown, as everywhere.

Both findings reach every rendering: terminal, `--markdown-out` (the window
stated as you typed it, the undated count as a loud blockquote), `--json`,
the MCP's `profile_usage` (which gains `since`/`until` under the same rules),
and the web Bill tab.

---

## 1.13.0 — "The bill learns to say no"

**The profile stops being a report you read and becomes a check that can fail
your build.** Two flags, two exit codes:

```
trazum profile usage.jsonl --max-usd 50
trazum profile usage.jsonl --against last-week.jsonl --max-growth-usd 10
```

`--max-usd` exits 1 when the log spent more than its budget. `--max-growth-usd`
exits 1 when the bill grew past the limit against the previous log — and used
alone it is an error, because a growth gate with nothing to grow *from* would be
a flag that silently gates nothing. Both fire under `--json` too: CI reads the
exit code there, and a gate that only worked in the human rendering would be a
gate that CI never sees. No period is assumed by either — the gate is over what
the log records, and the span line says what that was.

**The same gates run in the GitHub Action.** Hand it a `usage-log` instead of a
`target` and it gates the spend itself rather than the tokens about to be spent
— report in the run summary, a failing gate still writing it. Self-tested in CI
with hand-checkable arithmetic: a $5.00 log passes a $9 budget, a $15.00 log
fails it, +$10.00 growth fails a $5 limit.

### The most expensive day

The report names the peak day against the **median** day — a mean would let the
spike inflate its own yardstick — loud only past twice it, with the label that
drove it when there is more than one:

```
  ! 2026-08-09 spent $31.20 across 41 calls — 4.2x the median day ($7.41).
    Biggest that day: batch-eval ($24.80).
```

Exact per-record dollars per UTC day: each day's figure is the delta that day's
records added to the total, so the day arithmetic can never drift from the bill.

### `--label`, the drill-down

Once the full report has named a suspect, the same command profiles that
workload alone — every section, the gates included, over one label's calls.
A label that matches nothing is an error naming the labels that exist, never a
silent report over zero calls that would read as "this workload is free". With
`--against`, both logs are filtered, so the comparison stays one workload. The
MCP's `profile_usage` gains the same `label` under the same rule.

### Everywhere the bill renders

The clock reached `--markdown-out` (span, peak day, TTL verdicts, failing ones
loud) with the gap and day helpers shared between renderings so they cannot
drift. The web Bill tab draws spend per day — a bar per UTC day, plain divs,
the peak in the warning colour — and takes a **second log** to render the
comparison in the browser: sign convention stated before the first figure,
drivers over the union of labels so appeared and vanished workloads are named,
zero network requests, verified in a real browser. Output shapes gain the
max_tokens ceilings (`medianWithinTokens`, `p95WithinTokens`): the histogram
ceiling at least half and 95% of measured answers fit within, `null` for the
open-ended bucket rather than an invented number.

---

## 1.12.0 — "The log gets a clock"

**One field, and the single most common reason a cache loses money becomes
visible.** Add `ts` to the usage record — ISO 8601, an epoch number, or the
`created` OpenAI already returns — and `trazum profile` reads the clock.

### Does the cache TTL fit how fast the turns come?

```
  ! chat on Claude Opus 5: turns arrive a median of 9m apart and the 5-minute
    entry is gone by then — writes expire before the next turn reads them,
    which from the bill is a cache that only writes.
```

A cache entry lives 5 minutes, or an hour at 2x the write price. Whether either
is right depends on how long the workload waits between turns — and a support
flow whose users answer in nine minutes writes a 5-minute entry on every turn
and reads it back on none. `cacheEconomics` could say *that* money was lost;
the clock says *why*, and the why decides the fix: the 1-hour TTL, or caching
switched off.

The opposite mistake is quieter and visible nowhere else: turns seconds apart
paying the 1-hour rate. Those writes work — the cache verdict reads `paid-off` —
and every one pays 2x input for endurance the gaps never use. **Switching them
to the 5-minute TTL is priced exactly**: the same tokens at the other published
rate, the same counterfactual line `cacheEconomics` draws.

The gap is the **median between consecutive turns of the same conversation**,
sorted by the recorded clock so the answer is independent of the order of the
log. Five states — expires, overlong, unsettled when the unrecorded TTL decides
it, fits said out loud, and could-not-be-measured over writes with no clock —
because "no data" and "fine" are different answers.

### The span, stated and never extrapolated

`This log covers 2026-08-01 → 2026-08-14 (13.0 days).` The span makes your own
monthly arithmetic valid; a per-month figure from a partial month would be
Trazum doing the guessing it exists to end. When only some calls carry a clock
it says how many, so a span over a slice is never presented as the period.

Everything renders in the CLI (English and Spanish), the MCP `profile_usage`
tool and the web app's Your bill tab, and rides `--json` as `span` and
`cacheTtlFit`. The recording recipe gains `ts` everywhere it is written, and
the fixture that pins the docs against the tool now proves that following the
recipe produces a report that asks for nothing more.

## 1.11.0 — "What actually moves the bill"

**This release exists because the fairest complaint anybody has made about Trazum
was right.** On a company spending €20,000 a month, the rules recovered about €200 —
1%, measured: three tokens out of three hundred and six on an ordinary support
prompt. Nobody installs a tool for €200.

The number was never wrong. **Shortening the prompt was never where the money was**,
and the tool that only did that had no figure anywhere for the places it is.

| lever | what it moves | before |
|---|---|---|
| which model the call goes to | Opus 5 → Sonnet 5 is **40%** off; → Haiku 4.5 is **80%** | unpriced |
| the Batch API | **50%** flat | unpriced |
| what re-sending the conversation costs | **58%** of a modelled agent bill | invisible |
| whether caching paid for itself | can be **negative** | unanswerable |
| shortening the prompt | **~1%** | the whole product |

### `trazum profile` now prices the levers that are not the prompt

```
What would actually move this bill

  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50

  For comparison: shortening the prompt text can touch $22.80 at the very
  most — 70.9% of this bill, and only if you deleted every input token.
```

On a modelled estate — a classifier, a chat and a RAG workload — the levers came to
**80% of the bill**. Every figure is arithmetic on tokens that were billed: the same
counts at another model's published rate, the same tokens at the provider's batch
multiplier. Nothing modelled, nothing extrapolated.

The options on a slice are **combined and never summed**: batching a routed call
discounts the cheaper model, so the pair is $16.80 and not the $23.10 an addition
gives — against $21.00 that slice had ever spent. A route prints the command that
tests it rather than a recommendation, and steps down **one** capability rung rather
than to the cheapest model on the shelf.

### `trazum route` measures whether the cheaper model still does the job

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).
  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.
  ✓ HOLDS — the difference is inside the original model's own noise.
```

**The yardstick needed no inventing.** `eval` already ran a prompt twice to measure
the model's own run-to-run variance; routing is the same measurement on a different
axis. A route is safe when the cheaper model agrees with the original *more closely
than the original agrees with itself*, and any other bar would be a number somebody
chose. Three calls per case, and it calls nothing without `--yes`.

### What re-sending the conversation costs

A chat or agent workload sends the whole conversation back every turn, and on an
agent bill that growth is routinely the largest single line. Nothing here could see
it — a prompt file shows the system prompt, not the history.

Add `session` (or `conversation_id`) and it is measured as a **ceiling**: what the
workload would have cost if every turn had cost what its own first turn cost. The
subtraction is exact; the split between re-sent history and the user's own new
messages is not knowable from counts, and inventing one would be the flattering
direction.

**Trazum never prints the session key.** In a real log it is an account id, a ticket
number or an email address. It groups calls and counts turns; tests assert the value
appears nowhere in the report or in `--json`.

### Did the caching pay for itself?

The rest of Trazum tells you to cache. This is the one report that can say the
advice was wrong for a workload — a cache write is 1.25x plain input, or 2x at the
one-hour TTL, so a prefix that changes faster than it is reused pays a premium and
returns nothing. **The cache hit rate cannot tell you**: it reads 97.8% on a log
where one of two workloads is burning money.

When the log did not record which TTL a write used, the report says the question
cannot be settled and gives both figures rather than the flattering one. That
assumption moves the verdict, not just the total: between 0.28 and 1.11 reads per
write the same calls pay for themselves at 1.25x and lose money at 2x.

### The bill as a watched metric

`trazum profile --against previous.jsonl` compares two logs and ranks what drove
the difference, with the convention stated before the first figure: positive
means the bill grew, both files are exactly what they hold, and no period is
assumed. `--markdown-out` writes the whole profile as markdown for a PR comment
or a dashboard.

Three more findings from the same log. **Answers cut off mid-generation** are the
one slice of a bill that is waste without a counterpart — paid in full,
frequently retried, billed again — and the report prices them from `stop_reason`,
with "not recorded" kept distinct from "none truncated". **Where the output spend
concentrates**: six per cent of calls holding half the output spend is a tail
with a cause; forty-five per cent is a task whose answers are long — and the
total cannot tell them apart. And **conversation growth** now anchors on the
smallest turn by tokens, after billing noise at cache rates was caught reporting
77.5% fake growth on a flat conversation.

### `labels` in the config close the cache loop

Map a usage-log label to the prompt file it sends —
`{ "labels": { "support-rag": "prompts/support.txt" } }` — and `profile` reads
the file when that label's cache lost money, and says *why* it fails: a stable
prefix below the model's cache minimum (setting `cache_control` there does not
error, it simply never caches), stable tokens stranded behind the first
placeholder (`trazum optimize --reorder` moves them), or a healthy prefix, which
points at byte-identity instead. Every diagnosis carries "as it is today — the
log may predate it".

### The bill in the browser, and for agents

The web app grew a **Your bill** tab: drop or paste a usage log and read the
whole profile — parsed entirely in the browser against the bundled catalogue.
**Nothing is uploaded**: there is no fetch in that component, a test fails if one
appears, and the analytics event carries two booleans. And `@trazum/mcp` grew
`profile_usage`, the same report for an agent — the log passed as text, never a
path, with a test feeding a customer-named session key through to assert no
fragment of it comes back out.

### Ten faults found by adversarial review, and five by using the tool

Sixteen agents over four lenses, every finding handed to an independent verifier
told to refute it. Everything that survived flattered the bill. The worst inverted a
verdict — `Caching took $0.1000 off this bill` where the truth was a **$3.65 loss**.

And five more found by running the thing as a new user would rather than reading it:
`optimize` reported 1% and never said where the rest was; `Context window: 0.0% →
0.0%`; a named scenario answered with a hint to name it; `unlabelled` reported as
though it were a workload; and `1 calls`.

Twice in that pass the existing code or an existing test was right and the change
was not, and the change was reverted. That is the system working.

### Note on provenance

Like 1.8.0, 1.9.0 and 1.10.0, check `docs/releasing.md` before tagging: the trusted
publisher refused this workflow on three separate tags, and a release that goes out
by hand carries **no provenance attestation**. The workflow now tells a shipped
release apart from a version collision, so tagging one no longer fails and no longer
blames authentication for it.

## 1.10.0 — "Every hard edge, both sides"

> **This release has no provenance attestation.** It went out by hand, like 1.8.0
> and 1.9.0 before it — the trusted publisher refused this workflow on three
> separate tags, and the diagnosis in 1.9.1 turned out to be right about *that it
> was refusing* and unable to say why. So these tarballs are not signed by the
> workflow, and you cannot verify from npm alone that they were built from this
> commit. The release workflow now tells a shipped release apart from a version
> collision, so tagging one of these no longer fails and no longer blames
> authentication for it.

**If you use Trazum, this release changes the number beside every token count.**
The published error band is `±10%`, down from `±15%`, and it is the fourth value that
figure has had — the first three were a guess, a measurement, and a fix. This one is
a measured worst case with deliberate room left over.

### The estimator got more accurate on CJK, for free

Every CJK character was charged one token. Measured against Anthropic's counting
endpoint that put Japanese at **+11.2%** — the worst error in the whole corpus —
while Chinese sat at **−3.2%** under exactly the same rule.

One constant could not be right for both, and the samples say why: the Japanese file
is 58% kana, the Chinese one is 0%. Kana are a small syllabary in every sentence, so
the merge table covers runs of them. Han are tens of thousands of rare characters it
cannot cover.

| | before | now |
|---|---:|---:|
| Japanese | +11.2% | −1.5% |
| Chinese | −3.2% | +1.3% |
| **worst in the corpus** | **11.2%** | **6.4%** |

No new API calls were needed. The finding was sitting in the twenty-one measurements
already committed, which is worth saying because the previous two band changes both
cost a key.

**The band is 10 and the worst measurement is 6.4, on purpose.** Twenty-one samples
across six text types cannot bound a seventh — there is no Korean here, no Cyrillic
prose, no mixed-script document. A band that becomes false the first time somebody
measures something new is the fault this whole exercise was fixing.

### Three advisories were stating predictions as facts

Trazum compares token counts against thresholds that are absolute — a model's
cacheable minimum, its context window — while the counts carry a ±10% band. Three
findings got that wrong, in both available directions:

- **`cache-prefix-reorder` offered money that could not be collected.** It priced
  moving stable content into the cacheable prefix without checking the prefix that
  would build clears the minimum. On a 306-token prompt against a 512-token minimum
  the best possible prefix is 302 — nothing caches at any ordering — and it offered
  **$48.67 a month**, in the same report as another finding saying caching would not
  work here at all.
- **`prompt-caching` hedged below the line and promised money above it.** An
  estimated 528-token prefix can truly be 475, and then nothing caches and the figure
  beside the advisory is not there.
- **`context-overflow` said "the call will fail" as a certainty** — and said nothing
  at all when an estimate that fitted might really not. That silent case is now
  `context-near-limit`, the fourteenth finding, and it is the more dangerous of the
  two: a prompt over the window fails outright rather than degrading, so there is no
  partial result to notice.

### And the advisory tells you the command now

`cache-prefix-reorder` described the rearrangement in prose and left you to do it by
hand, while Trazum had `--reorder` all along — whole blocks only, refusing anything
that refers back to earlier text. On a 1,355-token prompt it takes the cacheable
prefix from **13 tokens to 1,350**.

### What stops it happening again

Fixing one fault three times is evidence it will recur, so there is now a guard that
asserts the property rather than the instances: for every model in the pricing
catalogue, no token count near a threshold may produce an unqualified claim, and
**silence counts as a failure** rather than a pass. Eighteen models, four cacheable
minimums, six context windows, all derived — a model added later is covered without
anybody remembering to.

---

## 1.9.1 — "The preflight"

**Maintenance, and the point of it is that the next release publishes itself.**

1.8.0 and 1.9.0 both went out by hand — the first because the packages did not
exist yet, the second because the trusted publisher had not been configured — so
neither tarball carries provenance. Nothing in the repository could tell you in
advance which way a tag would go, so 1.9.0 found out by spending the tag.

Two questions get asked before anything is at stake now, and a dry run from the
Actions tab can answer them without spending a version:

- **Will npm accept this workflow's identity?** Asked against npm's token
  exchange, once per package, because the setting lives on three separate pages
  and doing two of them is the easiest mistake available.
- **Is any of these version numbers already spent?** npm never reuses one, and
  the packages publish in dependency order — so without this, core uploading and
  the CLI failing costs the whole set a version.

**One honest caveat.** The endpoint behind the first question is not documented;
how to call it was worked out by probing. A refusal can therefore be the check
being wrong rather than your settings, and it cannot tell those apart — so it
says so and never blocks a release. Only a tag settles it.

Also: `E404 Not Found - PUT` from npm is an authentication failure, not a missing
package. The workflow explains that itself now instead of leaving it in a
document you would have to already know to read.

**Nothing in the library, the CLI or the reports changed.** If you are not
releasing Trazum, this version is identical to 1.9.0 for you.

---

## 1.9.0 — "The error band, measured"

**Trazum was under-reporting what your prompts cost, and now it does not.**

Every report printed `±15%`, every dollar figure descended from it, and nothing
had ever checked it. Measured against Anthropic's official counting endpoint, it
was false: nine of eleven samples underestimated, the worst by 30.6%.
Underestimating tokens under-reports cost — the flattering direction, and the
worst one for a tool whose whole argument is honest cost accounting.

**If you use Trazum on anything other than English, this release changes your
numbers.** The estimator turned out to be calibrated for English specifically:
German came out 37.3% under, Dutch 28.3%, Italian 23.8%, Spanish 22.9%,
Portuguese 18.1%, French 15.1% — against English at +1.0%. It now detects the
language and counts accordingly, and the figures it gives you go **up**, because
they were too low.

| language | before | now |
|---|---:|---:|
| German | −37.3% | +1.3% |
| Dutch | −28.3% | −2.1% |
| Italian | −23.8% | +2.0% |
| Spanish | −22.1% | +3.1% |
| Portuguese | −18.1% | −5.7% |
| French | −15.1% | +0.4% |
| Numeric-heavy text | −30.6% | −5.0% |

The band is still `±15%`, and that is a coincidence rather than a restoration:
the old one bounded nothing, and this one bounds **twenty-one measured samples
across seven languages and six text types**, worst case 11.2%. Every language has
a held-out sample in a different register, so the calibration fits a language
rather than a template.

**`trazum baseline`** records what a repository's prompts cost, to a file you
commit. `trazum check` then fails the build when the estate drifts past it — the
question a per-file budget cannot answer, because a repository at 95% of every
budget passes forever while a pull request adds four hundred tokens across a
dozen files. Thresholds are in tokens, never dollars: a repriced model would
otherwise fail a build for a change nobody made.

**The pull-request comment leads with what the branch costs**, not with a table of
which files fit their ceilings. No change to the Action was needed.

**One advisory was giving wrong advice.** `below-cache-minimum` compared an
*estimated* prefix against a hard 512-token threshold and told you caching would
not work. Near the line an underestimate made that false, and it cost the reader
the largest saving Trazum offers. It hedges there now and names `--exact-tokens`,
which is free.

**If you want exact numbers, they are free.** `--exact-tokens` uses the official
counting endpoint, which does not run the model. On non-English prompts it remains
the honest choice; the band above is what the heuristic gets you without a key.

## 1.8.0 — "Everything it had only been pricing" (the first publish)

Trazum 1.0.0 could tell you what a prompt cost. It could not tell you **which**
prompt, **who** made it expensive, whether the shorter version still worked, or
what to do about any of it. That is what everything since has been about.

Twelve commands now, up from four.

### What's new

- **`trazum prune` — which few-shot examples earn their tokens, measured.** Removes
  each example in turn and checks whether any answer moves further than the model
  already moves on its own. It is the only command that asks before spending — the
  bill is `(2 + examples) × cases`, printed before a provider is even looked up —
  and it reports "no effect on these inputs", never "delete this". Nothing is
  edited.

- **`@trazum/mcp` — Trazum as an MCP server, so an agent can budget its own
  prompts.** Three tools over stdio (`check_prompt`, `optimize_prompt`,
  `list_models`), running on your machine like the CLI: no service, no prompt
  leaving the box. The JSON-RPC layer is written by hand because every published
  package here carries zero runtime dependencies — and an MCP server reading
  model-supplied text is the last place to relax that.

- **`trazum doctor` finds preambles that could share a cache entry and do not.**
  Prompt caching matches bytes, so twelve prompts assembled from the same preamble
  — identical except a trailing tab and a stray capital — occupy twelve cache
  entries and share nothing. Each file is individually fine, which is why no
  per-prompt analysis can see it. No dollar figure, deliberately: pricing it would
  mean inventing how your calls spread across the group.

- **An advisory for a schema the request could carry instead of the prompt.**
  `Output format:` followed by a fenced JSON block costs those tokens on every
  call; every major API now takes the same shape as a request parameter, where the
  decoder is constrained rather than persuaded. Cheaper and stricter both — the
  rare finding that is not a trade-off. Trazum reports it and never edits it,
  because it is a change to the call, not the prompt.

- **LLM-agnostic, for real.** `openai` in `TRAZUM_LLM_PROVIDER` is a wire format,
  not a company — point a base URL at OpenRouter, LiteLLM, Groq, Together,
  Fireworks, DeepInfra, DeepSeek, Mistral, Ollama, vLLM or LM Studio and it works.
  Native providers for Anthropic and Gemini, and `bedrockProvider` /
  `vertexProvider` with SigV4 and the service-account JWT signed by hand on
  WebCrypto, because the AWS and Google SDKs are two hundred packages between them
  to authenticate one request. Live prices via an OpenRouter overlay, with every
  fact the feed does not carry marked `unknown` rather than guessed.

- **A real Content-Security-Policy on the web app.** A 128-bit nonce per request,
  `strict-dynamic`, no `unsafe-inline` in `script-src` — verified against a built
  server: nine of nine script tags carry the nonce, and deleting the one
  easy-to-miss line (the policy must ride the *request* headers too) gives nine
  tags and zero nonces.

- **A `.pre-commit-hooks.yaml`** for teams who manage hooks with the pre-commit
  framework, and **automatic recovery from container rollbacks** for anyone
  developing this repository in an environment that restores stale disk snapshots
  — which this one did, more than twenty times.

- **`--suggest` stops paying for answers it already has.** Add
  `--cache-suggestions` and a prompt that has not changed since the last run is
  answered from disk instead of from the model — re-run over forty prompts after
  editing two, and thirty-eight requests do not happen. It is off unless you ask,
  and it says out loud every time it uses a cached answer, because a cached
  answer is what the model said last week and a model is not a calculator. What
  gets stored is the model's raw reply, so every safety check runs again on the
  way out: a suggestion cached in March is still checked against your prompt in
  April by April's rules. Seven days, files nobody else on the machine can read,
  and `trazum --clear-suggestion-cache` when you want it gone.

  The honest footnote: this was meant to be the API's own prompt caching, and
  that turned out to be impossible rather than difficult. The API will not cache
  a prefix shorter than 512 tokens, our suggest instructions are 291, and a
  prefix that is too short is not cached *and does not tell you* — it just
  quietly costs full price. One line of code, zero saving, no way to notice.
  There is now a test that measures the prompt against every model's published
  floor, so if that ever changes we find out from a red build rather than from a
  comment nobody re-checked.

- **A badge for your README.** Every share link is also `/badge/<token>.svg`:
  the token change, in an image you can paste into a repository's front page. It
  is **recomputed every time it loads**, so it follows the prompts instead of
  freezing a number from the day somebody made it — which is the failure mode of
  every hand-written "saves 30%" line in every README. Revoking the link revokes
  the badge, because there is only one thing to revoke. An unknown, expired or
  revoked token renders the same neutral badge rather than a broken image, and
  no character of anybody's prompt ever reaches the picture.

- **A deployment overview for whoever runs it.** `/admin` adds up every prompt
  saved on the instance and says which ones are worth an afternoon — and it is
  careful about what it claims. It is **not** a spend report: Trazum has never
  seen a bill or an API call, so the headline is input tokens, the second figure
  is what running the rules would remove, and there is no score anywhere,
  because a number nobody can reproduce by hand is a number nobody can argue
  with. It shows prompt names and never prompt text: an admin is an operator,
  not an auditor of what their colleagues wrote. Off unless `TRAZUM_ADMINS` is
  set, and off means the page does not exist rather than refuses.

- **Share links: send a colleague what the edit cost.** A comparison published
  at an unguessable URL that anyone can open without an account, which is what
  "share" has to mean and is also the only thing in Trazum that serves one
  person's prompt to a stranger. So it says what it does **before** the button,
  not after: *this publishes both prompts to anyone who has the URL.* Links
  expire in thirty days unless you pick otherwise, can be revoked, and are kept
  out of search engines two independent ways. Reading one writes nothing —
  no view counter, because an unauthenticated request that can cause a write is
  a lever and a view count is not worth being one. And nothing derived is
  stored, so a link opened next year is priced by next year's rules.

- **A prompt library, with every version you ever saved.** Signed in, Trazum
  keeps your prompts and the whole history of each — because the question worth
  asking about a prompt is not what it costs today, it is what last month's edit
  did to it. History is append-only: saving over a prompt writes a new version
  and never rewrites one, and a save that changed nothing writes nothing and
  says so rather than filling the record with identical rows. Token counts are
  recomputed on read rather than stored, so two versions saved a year apart are
  actually comparable instead of being priced by two different estimators.
  Somebody else's prompt answers **404, never 403** — a 403 confirms the id
  exists — and the store has no lookup that takes an id without an owner, so
  that mistake cannot be written rather than merely not being written.

- **Sign in with GitHub — and the app is unchanged if you don't.** Accounts are
  off by default; a deployment with no GitHub app configured is the anonymous
  tool it always was, with no button and no database. Turn it on and Trazum
  remembers who you are, which is what a saved prompt library and a shared
  budget need to exist at all. It asks GitHub for `read:user` and nothing else
  — no repositories, no email, no write anywhere — and **never stores the
  access token**: it is exchanged, used once to read your login, and dropped.
  Session cookies are 256 random bits stored only as their SHA-256, so a
  database dump is a list of hashes rather than a list of live logins. Any
  Postgres will do; without one, sessions live in memory and the header says
  "temporary session" instead of letting you discover it.

- **`--reorder` — the saving Trazum had been pointing at for months.** Prompt
  caching is a byte-for-byte prefix match, so a stable instruction sitting
  *after* your first placeholder is re-read at full price on every single call.
  The advisory had been saying so since 0.2.0 and no command could act on it.
  Measured on a real 1,178-token support prompt: **14 tokens cacheable as
  written, 1,046 after.** It moves whole blocks, never sentences, and refuses
  the moment a block points backwards — because "summarise the text above" is
  correct where it sits and nonsense in front of the text.
- **`trazum rank <dir>` — which of your forty prompts to fix first.** Sorted by
  what optimising each one would actually recover, measured by running the rules
  rather than evaluating a formula. There is deliberately **no complexity score
  out of a hundred**: a number nobody can reproduce by hand cannot be argued
  with, and the weights that produce it get quietly tuned until the ranking
  looks right, which is fitting the metric to the answer. You get the
  measurements and a definition for each.
- **`trazum blame <file>` — who made this prompt expensive.** Git blame for
  tokens. Git already knows who edited a prompt and when; it does not know that
  three lines added to a system prompt at 50,000 calls a month is a bill rather
  than a diff. Now both facts are on the same line, with the single worst commit
  named.
- **Both of them post to pull requests.** `--markdown-out` was on `check` and
  `diff` only, so the two commands that answer *which prompt is worth an
  afternoon* and *who made this one expensive* could not put their answers where
  those decisions get made. They can now.
- **`optimize --suggest` — rewrites you can judge one at a time.** The LLM pass
  used to be all-or-nothing in both directions: fail one safety check and you got
  nothing, pass it and you got a wholesale rewrite to read end to end. Now it
  proposes phrases — `You should always make sure to → Always` — and each one is
  checked against your prompt before you see it. Eight surviving out of ten is a
  useful morning. A wholesale rewrite that failed one check never was. On the web
  as two switches, with the proposals listed above the saving rather than under
  it.
- **`eval --export promptfoo` — your assertions, not ours.** `trazum eval`
  measures whether the model still says the same thing, which is the question
  Trazum is qualified to ask and emphatically not the one you need answered
  before shipping. Yours is whether the classifier still hits 94%. So this builds
  the suite where the only variable is the prompt and leaves `assert` blank on
  purpose. Needs no API key and makes no call — the entire point is handing the
  run over.
- **`trazum where` — which model is this prompt actually going to?** Reads the
  code instead of guessing: a marker beats a quoted model id beats a base URL
  beats an SDK import, and it shows you the evidence with line numbers. A base
  URL beats the SDK it was pointed at, because DeepSeek, Moonshot, xAI and Groq
  all speak to the OpenAI client.
- **Prompts where they actually live.** `// trazum:prompt name` above a template
  literal, and `check`, `optimize`, `rank` and `blame` all read it out of your
  TypeScript instead of asking you to keep a copy in a `.txt` file that drifts.
- **Nine providers' prices, not one.** OpenAI, Google, Moonshot, DeepSeek, xAI
  and Mistral join Anthropic. The data was the easy half — see Fixed.
- **A Compare tab on the web — "what did this edit cost?"** Paste the old version
  and the new one and get the token delta, the monthly figure, and which problems
  the edit introduced or resolved. Every number is *after minus before*, so
  **positive means worse**, which is the opposite of everywhere else in Trazum —
  and the page says so above the figures rather than beside them, because somebody
  arriving from the other tab has the opposite convention already loaded.
- **`trazum diff`, `trazum eval`, directory mode, `trazum.config.json`, a GitHub
  Action** that comments on pull requests, and a **web app** rebuilt on
  shadcn/ui that kept its own palette rather than adopting the one every other
  application built from that registry is wearing.
- **On a subscription, no dollar figures.** Running inside Claude Code or Cursor,
  Trazum reports tokens and context-window headroom and says nothing about money,
  because there is no per-call bill to reduce and arithmetic about tokens dressed
  as dollars is just a wrong number with a currency symbol.

### Fixed

- **`optimize src/prompts.ts` rewrote your source code.** The capitalisation rule
  turned `import OpenAI` into `Import OpenAI`, which does not compile, and with
  `-o` it wrote that back over the file. It also counted your imports as tokens
  you pay a model for, and priced a file that plainly calls OpenAI against Claude
  Opus 5. This was the **default** behaviour. It refuses now, and tells you how
  to mark the prompt.
- **`--reorder` had no safety at all outside English and Spanish.** Not a missing
  feature — a silent failure. The backward-reference list was one flat
  English/Spanish array applied to every prompt, so a French, German,
  Portuguese, Italian, Dutch, Japanese or Chinese author got **none** of the
  refusals the whole design rests on. `Résumez le texte ci-dessus` was cheerfully
  hoisted above the text it points at and reported as a saving. Every test passed
  throughout, because every test asked the question in the two languages that
  worked. Seven languages added, plus a fourth refusal for the scripts still
  missing: a prompt with Cyrillic, Arabic, Hebrew, Hangul, Devanagari, Thai or
  Greek in it is not rearranged at all, and the report says which script stopped
  it.
- **Three providers were offered a batch discount that cannot be bought.** Kimi,
  DeepSeek and Grok have no batch API. The cost multipliers were global
  constants, so all three were quoted 50% off — **$139 a month** in the test that
  caught it. And Mistral, which has no prompt caching, was offered **$100 a
  month** of caching, because a zero cache minimum satisfies `0 >= 0`.
- **The batch saving was computed as `cost × discount`**, which is the saving only
  when the discount is exactly 0.5. Correct on Anthropic by coincidence, wrong on
  the first provider with any other rate.
- **It told Claude users to switch to `gpt-5-nano`.** The cheaper-model advisory
  searched every provider. Dropping from Opus to Sonnet is one line; changing
  vendor is a migration. Scoped to your own provider now.
- **A validated URL and a fetched URL were two different expressions.** The SSRF
  filter checked `baseUrl` and then fetched `` `${baseUrl.replace(/\/$/, '')}` ``
  — so nothing on the path from option to `fetch` was actually a barrier. CodeQL
  kept the alert open and was right to, twice. The check returns the value to use
  now, and the real fix went further: the web app's request body no longer
  **names** an endpoint at all, it **selects** one the operator listed. A host
  filter reads a name, and a name an attacker registered resolves wherever they
  like.
- **`fetch` follows redirects, which quietly voided the entire host filter.** A
  perfectly valid endpoint could answer `302 Location: http://169.254.169.254/`
  and the request went there anyway, `authorization` header included. One HTTP
  response. Every server-side call now refuses redirects.
- **The token counter sent your API key to an unvalidated URL.** Both providers
  had been hardened twice over while `countTokensAnthropic` sat wide open,
  because it is called a counter rather than a provider.
- **A security fix shipped with no reviewable diff.** `measure-token-band.mjs`
  used a raw NUL byte as a hash separator, which is enough for git to call the
  file binary. Three commits rendered as `Bin 7652 -> 7654 bytes` — including the
  one that fixed an SSRF finding **in that file**. It built, it ran, it passed
  every test, and nothing anywhere mentioned that a security fix had gone through
  unread.
- **The alert gate failed the merge that fixed both alerts.** It ran one second
  after starting, a full minute before the CodeQL analysis it reads had uploaded
  anything, and reported two findings at line numbers that no longer existed. A
  red build for a fix that worked is how people learn to re-run until green.
- **`--tokens-only` on GitHub Actions announced that "GitHub Actions bills by
  subscription".** It does not. It bills by the minute.
- **The README recommended `@v1.0.0`, a tag that never existed.** The test written
  in that same pull request only required `#\s*v?\d`, so it passed.
- **A renamed prompt reported no history before the rename** in `blame`. The data
  was there under the old name; the report said there was none.
- **`--limit` was silently ignored** — accepted by the command, never registered
  as taking a value, so every run walked the default 20 and said nothing.
- **`applySuggestions` on its own returned a `200` and applied nothing.** A full
  report, no error, the prompt untouched, and the one thing the caller asked for
  had quietly not happened. The source looked right — the field parsed, the guard
  around it was correct, and the branch that would have used it was never
  entered. It took sending the request. A `400` now, refused before any call to
  the model, so a malformed request never costs one.
- **Two quadratic passes.** One took 13.9 seconds on a large prompt; the other
  took **31**. Both found by hostile-input tests rather than by reading.
- **The results panel in the web app rendered blank.** It waited for an
  `IntersectionObserver`, and anyone who scrolls down to reach the button gets
  their result mounted above the viewport. A 214px card at zero opacity, showing
  nothing, on the page whose job is showing you the answer.

### Changed

- **`ModelPricing.tier` is deprecated in favour of `capability`** — `small | mid |
  large | frontier`. Telling somebody on Kimi that their task "looks like haiku
  complexity" is a label meaning something other than what it says. `tier` keeps
  working for all of 1.x.
- **The report stops claiming a Claude-calibrated band for models it was not calibrated on.** The
  estimator is tuned against Claude's tokenizer, and printing a Claude band beside
  a GPT figure was a precision claim nobody had earned.
- **Money-only advisories are gone from `--tokens-only`.** Suppressing the price
  in the heading and leaving dollars in the prose underneath is not suppressing
  the price.

### Still honest about

The **band was a design target that had not been measured** when this shipped. It is printed on
every report and every dollar figure descends from it. The corpus, the harness and
the test are all written and waiting; the measurement needs the official counting
endpoint and a key, so it cannot happen inside this repository. Until somebody
runs it, the code says so out loud rather than passing quietly — which is the
whole disposition of this project in one sentence.

*Somebody ran it in 1.9.0, and it was false. See the notes at the top of this
file. This paragraph is left as it was written.*

---

## 1.0.0 — "A stable contract"

The API froze. What `optimize` returns, what the rules are called, what counts as
a breaking change — all of it written down in [VERSIONING.md](VERSIONING.md) and
tested rather than intended.

### What's new

- **Twelve deterministic rules**, offline and free, that cut politeness formulas,
  filler, hedges, shouted emphasis, decorative separators and repeated paragraphs
  — without touching code, URLs, template placeholders or XML tags, which are
  copied character for character. A restated output format is *reported* and never
  cut: the schema and the prose walking through it are both defensible, and which
  to keep is the author's call.
- **Two levels.** `safe` has no semantic risk. `aggressive` shows you exactly
  what it changed, phrase by phrase, because "read the diff" is not advice you
  can follow on a diff of everything at once.
- **Advisories for the savings that dwarf trimming** — prompt caching, the batch
  API, whether the task needs the model you picked, and the one nobody wants to
  hear: that your cost is usually in the *output*, and shortening the prompt has
  a low ceiling.
- **`check --max-tokens`** as a CI gate, and **`--exact-tokens`** against the
  official counting endpoint for figures you can actually budget from.
- **English and Spanish**, where a locale changes the report and never the
  optimisation. Same prompt, same output, same advisory ids, whatever language
  you read them in.
