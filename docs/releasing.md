# Releasing

Publishing is the one action in this repository that cannot be undone. npm allows
unpublishing for 72 hours and then the version number is spent for good — it can
never be reused, even for identical content. Everything here is arranged so a
mistake fails the workflow rather than reaching the registry.

## One-time setup

This has to be done once, by whoever owns the npm scope, before any release can
work. Until it is done a tag push runs every check and then fails at the publish
step — which is the right failure, having published nothing.

### 1. Create the `@trazum` scope — done

The org exists and all three packages are on npm as of **2026-08-13**, published
by hand at 1.8.0.

**That first publish had to be manual, and it was not a workaround.** A trusted
publisher is configured on a *package's* settings page, and that page does not
exist until the package does. So the order was: publish once with a login, then
configure trusted publishing, and every release after that goes through a tag
with no credential anywhere.

Kept here because it is the sequence anyone forking this into a new scope has to
repeat, and because two things went wrong that are worth not repeating:

```bash
npm login                                     # E404 on PUT means "not logged in",
npm whoami                                    # not "no such scope" — check both
npm org ls trazum                             # before blaming the manifests
npm publish -w @trazum/core --access public   # core first: the others pin it exactly
npm publish -w @trazum/cli  --access public
npm publish -w @trazum/mcp  --access public
```

- **A `404 Not Found - PUT` is an auth failure.** npm hides the difference between
  "this scope does not exist" and "you may not write to it", so the first real
  attempt looked like a scope problem and was an expired token. `npm whoami` is
  the one-second check that says which.
- **`npm view` 404s for several minutes after a successful publish, and 1.83.0
  measured how long that can be.** `@trazum/cli` was accepted, signed and
  written to the transparency log, and the registry served the previous version
  for **twenty minutes** while its two siblings from the same job were
  installable within seconds. The CLI's tarball is 862 kB against the MCP
  server's 65 kB, which is the only difference between them.

  Since 1.83.0 the release job waits for it: `scripts/npm-serves.mjs` asks the
  registry's dist-tags endpoint for every publishable package until each serves
  the version being released, and fails the job if one never does. A release is
  not the moment `npm publish` returns; it is the moment a stranger typing
  `npm install` gets what `RELEASES.md` says they will.

- **`npm view` 404s for several minutes after a successful publish.** The
  aggregated packument propagates behind the per-version document and the
  tarball, so `+ @trazum/cli@1.8.0` on screen and `npm view` returning 404 are
  both true at once. Fetch `registry.npmjs.org/@trazum%2fcli/1.8.0` to check the
  publish actually landed; it answers first.

`prepublishOnly` rebuilds and runs the tests before each of the four uploads,
so a failure aborts the publish rather than reaching the registry.

**Nothing extra is needed to make the packages public, and there is nothing to
get wrong here.** A scoped package is *restricted* by default, so all four manifests
carry `publishConfig.access: "public"` and all four publish steps pass
`--access public`. Belt and braces on purpose: the failure they prevent is not
a loud one. On a free account a missing `--access public` fails the publish,
which is fine; on a paid account it **succeeds** and uploads a package nobody
outside the org can install — a release that looks completely normal, for an
open-source project, and unpublishable after 72 hours.

`publish.test.js` asserts both of those, asserts that `apps/web` stays `private: true`
so an application never reaches a registry, and derives the set of publishable
workspaces from the root `workspaces` globs — so a workspace added later has to
make the choice rather than inherit one.

If the org's default visibility is set to private, leave it: the per-package
`access` setting is what decides, and it is already committed here.

### 2. Create the `release` environment — done

Repository *Settings → Environments → New environment*, named exactly `release`.
Twenty seconds, and no configuration needed inside it.

**This one is already in place**, and it has been exercised: a
`workflow_dispatch` run went green through `verify` and `npm pack --dry-run`
with all four publish steps correctly skipped. If the environment were missing
or gated, the job would have sat in `waiting` before running anything, so a run
that starts at all is the proof.

Do this rather than relying on the workflow to bring it into existence. It is
also where a required reviewer goes if you ever want publishing to need a second
pair of eyes — the environment gate runs before the job starts, so an approval
there blocks the publish rather than interrupting it halfway.

### 3. Configure this repository as a trusted publisher — **it published at 1.85.0**

**Read this first.** On 2026-08-29 the merge of the 1.85.0 release PR published
**all four packages through the workflow**, with provenance, and created the tag
and the GitHub release with no human step. That is the first time this has
happened, and it makes the standing instruction below — *assume tags will not
publish and release by hand* — wrong. Releases go through the workflow now.

**Which credential authenticated the upload: the token, not OIDC.** That was
left open at 1.85.0 and 1.86.0 answered it. Provenance is signed with the job's
OIDC identity either way, so the signed attestation proves nothing about the
auth — the `Can this workflow authenticate to npm?` step is the only thing that
does, and on
[the 1.86.0 run](https://github.com/Davmunrey/Trazum/actions/runs/33274351906)
it reported:

> npm refused the OIDC token for `@trazum/cli`, `@trazum/core`, `@trazum/mcp`,
> `@trazum/tokenizer-openai`. Trusted publishing is not configured, or a claim
> does not match.

All four rejected, and all four published in the same job seconds later. The
only other credential in that job is the granular token on the `release`
environment, so **the token is what is holding releases up** and trusted
publishing is still not working. Do not delete the fallback.

That also settles the thing 1.85.0 only narrowed. The token was made when three
packages existed and `@trazum/tokenizer-openai` published anyway; the two
explanations were OIDC or a wider scope than the instruction below describes.
OIDC is now ruled out for that package by name, so **the token's scope is wider
than three packages**. Worth knowing before trusting the instruction that says
to list packages by name — and it does not remove the rule below about
regenerating the token when a package is added, because a scope nobody has
inspected is not a scope anybody can rely on.

**Read from the run page's annotation**, not from the step's job summary table.
The summary is the better artefact and it is where the per-package verdicts are
written, but the annotation is what a fetch of the run page actually returns —
so that is where this quote comes from, and it is the same sentence the warning
in `checkAuth` composes.

The history that follows is kept because it is what the fix has to survive, not
because it is still the current state.

It failed on **six real publish attempts across three versions**:
1.8.0 because the packages did not exist yet, 1.9.0 because this had not been
done, and `v1.11.0` four times on 2026-08-19 — after the settings had been
reported filled in. Every one of those releases that shipped went out by hand,
and none has provenance as a result. 1.25.0 was the last of those: published
from a clean clone of the tag, with the workflow's own preflight and `verify`
run first by hand. Since then the token fallback (below) authenticates the
workflow's own publishes, so a broken trusted publisher no longer forces a
release onto a laptop.

The v1.11.0 failures settled one thing the 2026-08-13 attempt could not: the
GitHub side is **not** the problem. The failing run prints the claims its token
actually carried, and all of them matched what these instructions say to type —
repository `Davmunrey/Trazum`, user `Davmunrey`, workflow `release.yml`, an
environment present. The mismatch, whatever it is, lives on npm's side of the
form: a configuration that did not save, saved onto the wrong package, or an
account-level restriction this document does not know about. Until someone
confirms the four package pages *display* a saved trusted publisher — not that
the form accepts one — assume tags will not publish and release by hand (see
*Releasing by hand*, below).

For **each published package** — `@trazum/core`, `@trazum/cli`, `@trazum/mcp`
and `@trazum/tokenizer-openai` — on the package's npm settings page under
*Publishing access → Trusted publisher*, enter exactly:

| Field | Value |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `Davmunrey` |
| Repository | `Trazum` |
| Workflow filename | `release.yml` |
| Environment | `release` |

**The environment field is not optional here.** `.github/workflows/release.yml`
declares `environment: release`, so the OIDC token GitHub mints carries that
claim. If npm's configuration leaves the environment blank while the token
asserts one, the claims do not match and the publish is rejected — with an error
about the token rather than about the mismatch, which is a confusing hour if you
do not know to look for it.

**Check it without spending a version.** Run the release workflow from the
Actions tab — `workflow_dispatch` is dry-run only — and read the *Can this
workflow authenticate to npm?* step. It asks npm's token-exchange endpoint the
same question the upload steps ask it, once per package:

```
  configured            @trazum/cli
  rejected (404)        @trazum/core
  configured            @trazum/mcp
```

| Verdict | It means |
|---|---|
| `configured` | Every claim matched for that package. |
| `rejected (401/403/404)` | Not configured for **that package**, or a claim does not match. |
| `unknown (…)` | Something else answered. Tag if you like; the upload is still the authority. |

**Per package, and it is listed per package because that is how it goes wrong.**
The trusted publisher is a setting on three separate pages, so configuring two of
them is the easiest mistake available — and the release publishes `@trazum/core`
first, so the package that fails is not necessarily the one you last looked at.

On a refusal the step also prints the claims the token carries:

```
  The token this run carries:
    repository: Davmunrey/Trazum
    workflow_ref: Davmunrey/Trazum/.github/workflows/release.yml@refs/tags/v1.9.0
    environment: release
```

Compare each against what you typed into npm. **`environment: (absent)` is the
answer whenever it appears** — the claim exists only when the job declares an
environment, so a rule requiring `release` can never match a token without it.

Until this existed the only way to test a trusted publisher was to spend a
version number on it, which is why 1.9.0 found out the expensive way.

**Why it only reports, and when to disbelieve it.** The exchange endpoint is
npm's own plumbing rather than a documented API — how to call it was worked out
by probing. So a `rejected` verdict has two possible causes and the check cannot
tell them apart: the configuration is wrong, or the request is. **If you have
filled in all three settings pages and it still says rejected, believe the
settings.** Tag, and let the publish answer — a tag that fails publishes
nothing, which is the same position as not having tagged.

That is also why it never gates. A gate built on a guess would one day block a
release that would have worked, and that is worse than the failure it prevents.
What it buys is a chance of knowing before you tag, not a verdict.

There is **no token to paste and none to rotate.** That is the whole design: a
long-lived `NPM_TOKEN` would be the highest-value credential this project holds,
sitting in repository secrets permanently for something used a few times a year,
and unlike every other secret a leak is not recoverable by rotation alone —
whatever was published under it stays published. A test in `security.test.js`
asserts no workflow reaches for one.

## Cutting a release

**Which number first.** Since 1.50.1 the version carries the narrative: a
chapter of the arc in progress is a **patch**, and the **minor** is spent only
on the release that lands the arc's thesis. A pricing correction is also a
patch, and the changelog entry is what tells the two apart. The full reasoning,
including what it costs a reader pinning with a tilde, is in
[VERSIONING.md](../VERSIONING.md#what-the-three-numbers-mean-here).

1. **Move `Unreleased` in `CHANGELOG.md`** under the new version heading. Per
   [CONTRIBUTING.md](../CONTRIBUTING.md), a change that alters nothing installable
   still has an entry, so this is usually just a rename.
2. **Move the `ROADMAP.md` entry** from `Next` to `Released`, and say what
   actually shipped rather than what was planned — they differ more often than
   they should.
3. **Bump the version in all five manifests** — root, `packages/core`,
   `packages/cli`, `packages/mcp`, `apps/web` — plus the `@trazum/core` dependency in
   `packages/cli`, `packages/mcp` **and `apps/web`**, and the lockfile.
   `publish.test.js` fails if they disagree, which is how the missing third one
   was found: this list said two for as long as the web app has depended on core,
   and every release that followed it left `apps/web` resolving a registry copy
   until the guard caught it. **The Claude Code plugin manifest joins the
   lockstep**: `plugin/.claude-plugin/plugin.json` carries the same version,
   held by `claude-plugin.test.js` — a plugin claiming one version over a CLI
   at another would describe commands that behave differently than its skill
   says. **`packages/mcp/server.json` joins it**, held by `publish.test.js`:
   the MCP registry hosts metadata rather than artefacts, so a stale version
   there advertises a server that is no longer the one on npm, and a stranger
   is the one who finds out.
4. **Update the README's action pin** to the release commit, with the new version
   in the trailing comment. `security.test.js` asks git what version *that commit*
   declares and fails if the label disagrees — so the pin can only be advanced
   once the commit it names exists, which is after the merge rather than in it.
5. **Nothing to drop any more.** The "not published yet" notes are gone, and
   `publish.test.js` now asserts they stay gone rather than keying on a tag. That
   guard used the tag as a proxy for "on npm" and the manual first publish broke
   it: no tag was pushed, so the repository went on telling visitors nothing was
   installable while three packages sat on the registry. Publication does not
   reverse, so the assertion is one-directional now.
6. **Sweep every `.md` in the repository** — the standing rule: a release is
   not cut until all the documentation says so. Three of them are enforced by
   `publish.test.js` (`RELEASES.md` must have the version's section,
   `CHANGELOG.md` its heading, `ROADMAP.md` a mention), so `verify` fails a
   release prep that skipped them. The rest is a two-minute grep for what the
   tests cannot know is stale:

   ```bash
   git grep -nE "<previous version>" -- '*.md' ':!CHANGELOG.md' ':!RELEASES.md'
   ```

   Anything that surfaces is either history (fine where it is) or a claim
   about the present (update it). The README's action pin is the known
   straggler: it can only advance to the release commit *after* that commit
   exists, so it moves in the next PR — `security.test.js` keeps the label
   honest either way.
7. **Check the prices, per provider.** The one set of numbers in this product
   that cannot be derived from anything in the repository. `PROVIDER_REVIEWED`
   in `packages/core/src/pricing.ts` carries a date per provider; open the
   pricing page for any provider whose date is more than
   `STALE_PRICING_DAYS` old, compare every model this table prices, and move
   that provider's date only if you actually looked. The catalogue's headline
   date is derived as the oldest of the seven, so a partial review records
   itself honestly instead of overstating the rest.

   Two things `pricing-review.test.js` will catch and one it cannot. It catches
   a promotion that expires before the next review is due — a price change this
   table can see coming, and the reason Sonnet 5 nearly went out 50% too high —
   and it catches a review date in the future or a provider priced with no date
   at all. It cannot catch a provider quietly changing a price, which is what
   this step is.

   **And ask whether the models still exist**, which is a different question
   from whether the prices are right and was unasked for eighty releases:

   ```bash
   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... npm run check:models
   ```

   It sends one real request per priced model and rewrites
   `packages/core/test/fixtures/model-availability.json`; commit what it writes.
   The first run found four ids the provider refuses outright, two of which that
   provider's own model list still returns. Any key you have is worth using and
   any you lack is recorded as unasked, so a partial run is honest rather than
   reassuring. A newly refused model is marked `retired` in the provider's own
   words and keeps its price, because the calls in somebody's log really
   happened; what it costs to move off it is a price, and comes off the
   provider's page under the step above or not at all.

8. `npm run verify`, and read the exit code rather than the output.
9. **Merge. That is the release.** The push to main triggers the workflow's
   `decide` job, which sees a manifest version the registry does not have and
   hands it to the release job: verify again, publish all four packages,
   create the `v<version>` tag on the merge commit, and publish the GitHub
   release from `RELEASES.md`. Then a third job waits for npm to serve the new
   `@trazum/mcp` and updates the MCP registry listing, which was the last
   manual step until 1.80.2. No tag to type, no second step to remember.

   A pushed tag still works as the manual override — for re-running a release
   whose publish failed, or releasing a commit that is not the newest merge:

   ```bash
   git tag v1.2.0 <commit> && git push origin v1.2.0
   ```

The workflow does the rest. It will refuse if the tag and the manifests disagree,
and it runs the same `verify` a pull request runs before anything is published —
a release gate that checks less than the pull-request gate lets through exactly
what the tag was for.

`@trazum/core` publishes first. The CLI and the MCP server depend on it at an exact version, so the
other order leaves a window where installing the CLI fails on a dependency that
does not exist yet.

## Listing on the MCP registry

Separate from npm, and automated since 1.80.2. The official MCP registry hosts
*metadata*: it records that a name maps to a package, and it verifies the claim
by fetching that package from npm and reading `mcpName` out of its manifest. So
the listing can only ever point at a version that is already published, which is
what shapes the job.

`release.yml` has an `mcp-registry` job that runs after the npm publishes:

1. `scripts/mcp-registry-preflight.mjs` asks npm for the exact version until it
   answers 200 *and* serves the right `mcpName`, up to five minutes.
2. `mcp-publisher` is downloaded at a pinned version and checked against the
   checksum published for that tag.
3. `mcp-publisher login github-oidc` exchanges the job's OIDC token for a
   registry token. No stored credential: the registry grants the namespace
   matching the token's `repository_owner` claim.
4. `mcp-publisher publish` sends `packages/mcp/server.json`.
5. The job then asks the registry what it now serves, and fails if it is not the
   version just sent.

**Three deliberate choices, each paid for.**

- **A separate job, not a step in the release job.** It downloads a third-party
  binary and runs it, in a process that can mint a token for the whole
  `io.github.<owner>/*` namespace. Keeping it out of `environment: release`
  means that binary never shares a process with `secrets.NPM_TOKEN` or with
  `contents: write`. By the time it runs, npm and the GitHub release are done,
  so the worst it can do is fail, and a failed listing is recoverable by hand.
- **The publisher binary is pinned by version and checksum**, not fetched from
  `releases/latest/download` as the upstream guide shows. Same rule as every
  action in this repository. The cost is a maintenance edge: when the registry
  rotates its OIDC audience, an old binary fails with `invalid audience` and the
  fix is to bump `MCP_PUBLISHER_VERSION` and `MCP_PUBLISHER_SHA256` together,
  taking the checksum from `registry_<version>_checksums.txt` on that release.
  The job's failure note says exactly that, because the error names nothing that
  would lead you here.
- **The wait is a poll, not a sleep.** npm serves a new version minutes after
  the publish returns, and chaining the two publishes without waiting produces a
  400 that reads like a manifest bug and is a propagation race. A fixed sleep is
  either too short on a slow day or too long on every other day.

`security.test.js` holds all of it: the job exists, it is gated on the same
decision the uploads are, it waits before it publishes, the binary is pinned and
verified, and the job is not in the release environment.

### Publishing the listing by hand

Still the fallback when the job fails, and the only route for a listing that has
to move without a release:

```bash
cd packages/mcp
mcp-publisher login github     # device flow, opens a code in the browser
mcp-publisher publish          # reads ./server.json
```

Four things that cost real attempts:

- **Do not run `mcp-publisher init`.** It writes a `server.json` named after the
  *directory*, `io.github.<user>/mcp`, overwriting the one this repository keeps
  in the version lockstep. The committed file is the source of truth; if it is
  missing, the checkout is stale, not the tool.
- **The namespace is case-sensitive.** GitHub authentication grants
  `io.github.<login>/*` with the login spelled exactly as GitHub spells it, so
  `io.github.davmunrey` and `io.github.Davmunrey` are two different namespaces
  and only one of them is yours. Getting this wrong returns a 403 that quotes
  both strings, and it cost 1.80.1: the corrected `mcpName` only counts once it
  is on npm, so the fix was a release. `publish.test.js` now derives the owner
  from `server.json`'s repository URL and holds both files to it.
- **A 400 saying the package is "missing required `mcpName` field"** means the
  version `server.json` advertises does not carry that field on npm, usually
  because the manifest was edited after the last publish, or because npm has not
  propagated yet. Check what the registry sees before blaming the login:

  ```bash
  curl -s https://registry.npmjs.org/@trazum%2fmcp/<version> | grep mcpName
  ```

- **A 401 saying the token is expired** is exactly that. The device-flow
  credential is short-lived; `mcp-publisher login github` again and republish.

## The token fallback

The publish steps authenticate with OIDC when nothing else is configured, and
with an **environment-scoped npm token when one is** — the fallback that keeps
a merge from failing while npm's trusted publishing stays broken. Setting it
up, once:

1. On npm (as the account that owns `@trazum`): *Access Tokens → Generate New
   Token → Granular Access Token*. Permissions **Read and write**, scoped to
   **only** the `@trazum` packages this repository publishes, with an expiry —
   90 days is a fine default. Do not create a classic automation token; granular
   is the one whose blast radius is those packages instead of the account.

   **A package added after the token was made is not in its scope.** A token
   listing packages by name cannot publish a fifth one and cannot create it,
   and the failure is the same `E404` as a missing trusted publisher, on the
   package nobody was looking at. Whenever this repository starts publishing a
   new package, regenerate the token with it included and update the secret, in
   the same change that adds the package.
2. On GitHub: *Settings → Environments → release → Environment secrets → Add
   secret*, name **`NPM_TOKEN`**, value the token. An *environment* secret on
   purpose: only jobs that enter the `release` environment can read it, which
   is exactly one job in one workflow.

What the trade costs, honestly: a long-lived credential now exists, and a
leak of it is not recoverable by rotation alone — whatever was published
under it stays published. What it does **not** cost is provenance: the
attestation is signed with the job's OIDC identity, which is independent of
how the upload authenticates, so releases through the workflow carry
provenance with either auth. `security.test.js` pins the containment: only
`release.yml` may reference the secret, only in the one shape, and token
material committed anywhere fails the build.

When the token expires, a release fails with the same `E404` as a missing
trusted publisher — generate a new token and update the secret. When trusted
publishing finally works, delete the secret; the same workflow reverts to
pure OIDC with no edit.

## Releasing by hand

The last resort — for when the workflow itself is broken, not just npm's
authentication (the token fallback above covers that without leaving GitHub).
It is the exact procedure 1.25.0 used, before the fallback existed. The cost is stated first because it is the only one: **a manual
publish carries no provenance attestation** — nobody can verify the tarball was
built from this repository at this commit. Users notice nothing.

Publish from a clean clone, never from a working tree — a local checkout can be
behind, dirty, or missing files, and what `npm publish` packs is whatever is on
disk:

```bash
cd /tmp && rm -rf trazum-release
git clone --depth 1 https://github.com/Davmunrey/Trazum.git trazum-release
cd trazum-release
node -p "require('./package.json').version"        # read it: this is what ships
npm ci
node scripts/npm-publish-preflight.mjs versions    # aborts if any number is spent
npm run verify
npm whoami || npm login                            # and `npm logout` when done
npm publish -w @trazum/core --access public        # core first: the others pin it exactly
npm publish -w @trazum/cli  --access public
npm publish -w @trazum/mcp  --access public
```

Then push the tag by hand (this is the one path where the tag comes second),
and let the workflow create the GitHub release — its preflight sees the
versions on the registry and skips the uploads. Two
reminders from doing this for real: `npm view` 404s for several minutes after a
successful publish (fetch `registry.npmjs.org/@trazum%2fcore/<version>` to
check instead), and `npm logout` afterwards revokes the session token, which is
the closest a manual publish gets to not holding a credential.

## Checking a release without publishing one

Run the workflow from the Actions tab. `workflow_dispatch` is **dry-run only** —
every publish step is gated on a tag, so a manual run does the install, the
`verify` and the `npm pack --dry-run`, and stops. A publish reachable without a
tag would be a release with no version to check against.

## If something goes wrong

- **The tag was wrong** — nothing was published, because the version check runs
  before `verify`. Delete the tag, fix it, tag again.
- **`E404 Not Found - PUT`** — an authentication failure, not a missing package.
  npm reports a write you are not authorised for as "not found", which is why
  this cost an hour at the first publish and reappeared at 1.9.0. Go to step 3.
  The workflow now says this itself on any publish failure rather than leaving it
  in a document you have to already know to read.
- **`@trazum/core` published and `@trazum/cli` or `@trazum/mcp` failed** — the core version is
  spent. Bump to the next patch across all manifests and release again rather
  than trying to reuse the number; npm will not let you, and a `--force` that
  worked would be worse.

  This is the shape the preflight exists to prevent: *No version may already be
  on the registry* checks all three before the first upload, so a re-tag of a
  half-published release aborts instead of spending another number. It cannot
  help with a failure that happens **between** two uploads — nothing can, short
  of a transaction npm does not offer — but that is now the only way to get here.
- **Within 72 hours, badly wrong** — `npm unpublish @trazum/core@1.2.0`. After
  that the version is permanent and the answer is a new one with a changelog entry
  saying what the bad one did.
