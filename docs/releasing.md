# Releasing

Publishing is the one action in this repository that cannot be undone. npm allows
unpublishing for 72 hours and then the version number is spent for good — it can
never be reused, even for identical content. Everything here is arranged so a
mistake fails the workflow rather than reaching the registry.

## One-time setup

This has to be done once, by whoever owns the npm scope, before any release can
work. Until it is done a tag push runs every check and then fails at the publish
step — which is the right failure, having published nothing.

### 1. Create the `@trazum` scope

The scope does not exist yet: `npm view @trazum/core` returns 404. Create it at
[npmjs.com/org/create](https://www.npmjs.com/org/create).

**The first publish has to be made by hand, and that is not a workaround.** A
trusted publisher is configured on a *package's* settings page, and that page
does not exist until the package does — `npmjs.com/package/@trazum/core/access`
answers `{"message": "Not Found"}` today. So the order is: publish once with a
login, then configure trusted publishing, and every release after that goes
through a tag with no credential anywhere.

```bash
npm login
npm publish -w @trazum/core --access public   # core first: the CLI pins it exactly
npm publish -w @trazum/cli  --access public
```

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

### 3. Configure this repository as a trusted publisher

For **each** of `@trazum/core` and `@trazum/cli`, on the package's npm settings
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
3. **Bump the version in all four manifests** — root, `packages/core`,
   `packages/cli`, `apps/web` — plus the `@trazum/core` dependency in
   `packages/cli`, and the lockfile. `publish.test.js` fails if they disagree.
4. **Update the README's action pin** to the release commit, with the new version
   in the trailing comment. `security.test.js` asks git what version *that commit*
   declares and fails if the label disagrees — so the pin can only be advanced
   once the commit it names exists, which is after the merge rather than in it.
5. **Drop the "not published yet" notes** from `RELEASES.md` and both package
   READMEs. `publish.test.js` keys this on whether `v<version>` is tagged and
   asserts it in *both* directions, so it fails if the notes are missing before
   the tag and again if they survive after it — the point being that a note
   removed by hand at release time is a note that survives three releases.
6. `npm run verify`, and read the exit code rather than the output.
7. Merge, then tag the merge commit and push it:

   ```bash
   git tag v1.2.0 && git push origin v1.2.0
   ```

The workflow does the rest. It will refuse if the tag and the manifests disagree,
and it runs the same `verify` a pull request runs before anything is published —
a release gate that checks less than the pull-request gate lets through exactly
what the tag was for.

`@trazum/core` publishes first. The CLI depends on it at an exact version, so the
other order leaves a window where installing the CLI fails on a dependency that
does not exist yet.

## Checking a release without publishing one

Run the workflow from the Actions tab. `workflow_dispatch` is **dry-run only** —
every publish step is gated on a tag, so a manual run does the install, the
`verify` and the `npm pack --dry-run`, and stops. A publish reachable without a
tag would be a release with no version to check against.

## If something goes wrong

- **The tag was wrong** — nothing was published, because the version check runs
  before `verify`. Delete the tag, fix it, tag again.
- **`@trazum/core` published and `@trazum/cli` failed** — the core version is
  spent. Bump to the next patch across all manifests and release again rather
  than trying to reuse the number; npm will not let you, and a `--force` that
  worked would be worse.
- **Within 72 hours, badly wrong** — `npm unpublish @trazum/core@1.2.0`. After
  that the version is permanent and the answer is a new one with a changelog entry
  saying what the bad one did.
