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
- **`npm view` 404s for several minutes after a successful publish.** The
  aggregated packument propagates behind the per-version document and the
  tarball, so `+ @trazum/cli@1.8.0` on screen and `npm view` returning 404 are
  both true at once. Fetch `registry.npmjs.org/@trazum%2fcli/1.8.0` to check the
  publish actually landed; it answers first.

`prepublishOnly` rebuilds and runs the tests before either upload, so a failure
aborts the publish rather than reaching the registry.

**Nothing extra is needed to make the packages public, and there is nothing to
get wrong here.** A scoped package is *restricted* by default, so both manifests
carry `publishConfig.access: "public"` and both publish steps pass
`--access public`. Belt and braces on purpose: the failure they prevent is not
a loud one. On a free account a missing `--access public` fails the publish,
which is fine; on a paid account it **succeeds** and uploads a package nobody
outside the org can install — a release that looks completely normal, for an
open-source project, and unpublishable after 72 hours.

`publish.test.js` asserts both, asserts that `apps/web` stays `private: true`
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
with all three publish steps correctly skipped. If the environment were missing
or gated, the job would have sat in `waiting` before running anything, so a run
that starts at all is the proof.

Do this rather than relying on the workflow to bring it into existence. It is
also where a required reviewer goes if you ever want publishing to need a second
pair of eyes — the environment gate runs before the job starts, so an approval
there blocks the publish rather than interrupting it halfway.

### 3. Configure this repository as a trusted publisher — **still not working**

The step that decides whether a tag publishes or fails at the last stage. It has
now failed that way on **six real publish attempts across three versions**:
1.8.0 because the packages did not exist yet, 1.9.0 because this had not been
done, and `v1.11.0` four times on 2026-08-19 — after the settings had been
reported filled in. Every one of those releases that shipped went out by hand,
and none has provenance as a result. 1.25.0 is the latest: published from a
clean clone of the tag, with the workflow's own preflight and `verify` run
first by hand.

The v1.11.0 failures settled one thing the 2026-08-13 attempt could not: the
GitHub side is **not** the problem. The failing run prints the claims its token
actually carried, and all of them matched what these instructions say to type —
repository `Davmunrey/Trazum`, user `Davmunrey`, workflow `release.yml`, an
environment present. The mismatch, whatever it is, lives on npm's side of the
form: a configuration that did not save, saved onto the wrong package, or an
account-level restriction this document does not know about. Until someone
confirms the three package pages *display* a saved trusted publisher — not that
the form accepts one — assume tags will not publish and release by hand (see
*Releasing by hand*, below).

For **each** of `@trazum/core`, `@trazum/cli` and `@trazum/mcp`, on the package's npm settings
page under *Publishing access → Trusted publisher*, enter exactly:

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

1. **Move `Unreleased` in `CHANGELOG.md`** under the new version heading. Per
   [CONTRIBUTING.md](../CONTRIBUTING.md), a change that alters nothing installable
   still has an entry, so this is usually just a rename.
2. **Move the `ROADMAP.md` entry** from `Next` to `Released`, and say what
   actually shipped rather than what was planned — they differ more often than
   they should.
3. **Bump the version in all five manifests** — root, `packages/core`,
   `packages/cli`, `packages/mcp`, `apps/web` — plus the `@trazum/core` dependency in
   `packages/cli` and `packages/mcp`, and the lockfile. `publish.test.js` fails if they disagree.
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
7. `npm run verify`, and read the exit code rather than the output.
8. **Merge. That is the release.** The push to main triggers the workflow's
   `decide` job, which sees a manifest version the registry does not have and
   hands it to the release job: verify again, publish all three packages,
   create the `v<version>` tag on the merge commit, and publish the GitHub
   release from `RELEASES.md`. No tag to type, no second step to remember.

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

## The token fallback

The publish steps authenticate with OIDC when nothing else is configured, and
with an **environment-scoped npm token when one is** — the fallback that keeps
a merge from failing while npm's trusted publishing stays broken. Setting it
up, once:

1. On npm (as the account that owns `@trazum`): *Access Tokens → Generate New
   Token → Granular Access Token*. Permissions **Read and write**, scoped to
   **only** the three `@trazum` packages, with an expiry — 90 days is a fine
   default. Do not create a classic automation token; granular is the one
   whose blast radius is three packages instead of the account.
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
