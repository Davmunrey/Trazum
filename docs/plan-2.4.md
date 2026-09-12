# Plan 2.4: one door, and where the spend is

The other plan documents in this directory describe what to build. This one
starts from a number instead: `@trazum/cli` is at about two hundred downloads
a month, with forty-nine commands behind it. That ratio is the finding. The
product is deep and nobody arrives, and adding a fiftieth command to the
same door does not change who walks through it.

Three causes, each with a fix below, in the order they pay.

1. **Arriving requires knowing which of forty-nine commands to run.** Every
   converter has its own name, and a person with a log has to know what
   their log is called before Trazum will read it. The first move is one
   door that reads anything.
2. **It reaches only people whose usage is already in one of seven shapes.**
   Two providers and five tools. The places where AI money is actually spent
   in 2026 — routers, editors, hosted inference — are not among them.
3. **It lives where nobody looks.** npm is where it is installed, not where
   it is found. The surfaces that find tools now are registries, marketplaces
   and the editors' own configuration files, and each of those is a checklist
   item with a verifiable state.

Nothing below relaxes the doctrine. A converter is written from a published
schema or it is not written; a figure is derived or it is refused by name; a
provider credential never enters this repository. A plan that grew the
audience by loosening the one property the audience would come for is not a
growth plan.

## 1. One door: `trazum bill <anything>`

```bash
npx @trazum/cli bill ~/.claude/projects
npx @trazum/cli bill usage.json
npx @trazum/cli bill exports/
```

Reads a file or a directory, tells each file's format from its own text with
the sniffers the converters already ship (`looksLikeClaudeCodeTranscript`,
`looksLikeOtel`, `looksLikeLiteLlm`, `looksLikeHelicone`, `looksLikeLangsmith`,
`looksLikeAnthropicUsage`, `looksLikeOpenaiUsage`, `looksLikeOpenrouterActivity`,
plus a plain usage log), converts in memory, prices, and prints the receipt
with every gap named. No flags needed for the common case; `--label` and
`-o` as everywhere else.

What it must refuse: a file no sniffer claims is listed by name and not
guessed; a file two sniffers claim is listed as ambiguous and not converted.
Every per-converter refusal (batch rows, unnamed models, one page of several)
is printed exactly as the dedicated command prints it, because `bill` is the
dedicated commands composed and not a looser version of them.

This is also the landing-page demo and the first line of the README, because
it is the first thing that works with nothing configured.

## 2. Where the spend is

Each converter here is written from a schema that was read, and the ones
whose schema could not be read from this environment are named as blocked
rather than written from memory.

- **`from-openrouter`** — `GET /api/v1/activity`, management key, thirty
  days of rows per model per endpoint per day. Schema read from the published
  reference. The model slug is the same slug the OpenRouter pricing overlay is
  keyed by, so the two halves Trazum already had meet: hundreds of models
  priced from a live catalogue, and now a report to price them from. The
  dollars OpenRouter charged are carried beside the records and never merged;
  reasoning tokens are counted and not added, because the schema does not say
  whether the completion count holds them.
- **`from-cursor`** — Cursor's Admin API (`/teams/daily-usage-data`,
  `/teams/filtered-usage-events`) and the dashboard's usage export. The docs
  host is unreachable from the environment this plan was written in, and a
  converter written from a search-engine summary would mis-read somebody's
  bill. **Blocked** until either the reference is read or one real export is
  supplied to build the fixture from. Named, not faked.
- **Hugging Face Inference Providers** — an OpenAI-compatible gateway, so a
  log written by spreading its responses should already parse as a usage log
  with the model in `model` and the counts in `usage`. That claim needs one
  real response to be asserted against, and the docs host is likewise
  unreachable from here. **Blocked** on the same terms. Separately, the web
  playground can run as a Space from the existing `Dockerfile`, which is a
  distribution move rather than a converter and needs an account token that
  only the owner holds.

## 3. Where the people are

Each of these is a state that was checked, not hoped. What was found:

- **MCP registry: already right.** The official registry serves
  `io.github.Davmunrey/trazum` at 2.3.0 as latest, with every version since
  1.80.1 listed, and `release.yml` has published the listing on every release
  since 1.80.2 through GitHub OIDC. Nothing to do here except keep it so.
- **Claude Code plugin marketplace: exists.** `.claude-plugin/marketplace.json`
  and the two-line install in the README. Not re-verified from a clean
  machine in this plan.
- **Every other MCP client: was missing, now written.** The README told
  Claude Code users two lines and everyone else "over stdio does the same".
  It now carries the `mcpServers` JSON that Cursor, Windsurf and Claude
  Desktop all read, and the `npx @trazum/cli bill` line under it. This is
  the cheapest surface on the list and the one the download number said was
  missing.
- **GitHub Marketplace.** `action.yml` exists with branding, and the
  self-test holds its one-line description to naming both gates. Whether the
  listing is published is a state of the Marketplace, not of this
  repository, and was not checked from here.
- **Hugging Face Space.** The web app from the `Dockerfile`. Blocked on the
  owner's token; the manifest can be prepared when the token exists.

## 4. A reason to come back

A tool that prices a log once is a tool that is run once. Most of the loop
already existed before this plan and was not the problem: `connect` pulls,
`watch --once` judges, `pulse` notices when the scheduler itself stopped, and
`docs/running.md` carries the cron, systemd, Actions and Task Scheduler
recipes for all of it. What was missing was the recipe a repository with
logs in it needs and nothing else: **the week's bill, every Monday**, as the
packaged spend gate on a schedule with the window computed by the job. It is
in `docs/running.md` now. What it deliberately does not do is post a comment:
the Action's comment needs a pull request and a cron has none, so the report
goes to the run summary and a crossing is the exit code, which is the
alerting nobody has to build. A badge for the month's standing stays unbuilt
here; that is the loop the Pro product closes for organisations.

## 5. Measured, not hoped

The number that opened this document is the number that judges it.
`scripts/adoption.mjs` reads three public counters — downloads of
`@trazum/cli` over the last thirty days, GitHub stars, and the MCP registry's
latest version — and prints the one line `docs/releasing.md` now asks for
under every new heading in `RELEASES.md`. A counter the network would not
give is printed as unavailable and never as zero, because a zero is a claim
about the product and an unavailable is a fact about the run. No credential
is read or sent; all three endpoints are public.

The figure this plan opened from was read by hand on 2026-09-11 and is not
written into `RELEASES.md` retroactively: the first line goes under the first
release cut after this plan, and every one after it.
