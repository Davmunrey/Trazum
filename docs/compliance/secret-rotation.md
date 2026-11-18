# Rotating the secrets

How to replace each secret a Trazum deployment and this repository hold, what
breaks while you do, and how to tell it worked (OWASP ASVS 4.0.3 1.6.3). It is
a procedure for the operator. How often to follow it is the security policy's
to say, and only the owner can write that
([what only the owner can do](README.md#what-only-the-owner-can-do)). Rotate at
once, whatever the schedule, when a secret may have been seen by someone it was
not meant for, and when somebody who could read it stops working on the
deployment.

**Nothing at rest is encrypted under any of these secrets,** so replacing one
never means re-encrypting data, and a lost secret loses no data.
`apps/web/test/threat-model.test.mjs` fails the build when the code reads a
secret this page does not cover, or when a path it cites no longer exists.

## The two the web app holds

Both are environment variables on the platform that runs the app, read when a
request needs them, never at build time. On Vercel they are under *Project
settings → Environment Variables*, and a change reaches only deployments made
after it, so every procedure below ends in a redeploy. In a container they are
in whatever passes the environment to `docker run`, and a restart picks them up.

### `TRAZUM_GITHUB_CLIENT_SECRET`

**What uses it.** The exchange of a sign-in's code for a GitHub token
(`apps/web/lib/auth/github.ts`), and, through HKDF with a label of its own, the
key that hashes callers' addresses for the shared rate limits
(`apps/web/lib/shared-limit.ts`).

**What does not.** Sessions are random tokens stored as their SHA-256, with no
key. The sign-in state is a random nonce compared with a cookie. Share links
are random tokens. Nothing in the database is derived from this secret.

**What rotating it does.** Nobody is signed out. A sign-in in flight at the
moment the platform switches value may fail once and need one more click. The
one-minute rate-limit counters start again from zero, once, because their keys
change; the old rows expire within the minute and are swept.

1. On GitHub, open the OAuth app (*Settings → Developer settings → OAuth Apps*,
   under the account or organisation that owns it) and generate a new client
   secret. GitHub shows it once: copy it.
2. Set `TRAZUM_GITHUB_CLIENT_SECRET` to the new value on the platform, and
   redeploy or restart.
3. Check it: sign out, sign in, and see the account menu come back. The log has
   an `auth.sign_in` line with `"outcome":"success"` from after the deploy.
4. Back on GitHub, delete the old secret if the page still lists it. If
   generating the new one replaced the old one instead, sign-in failed between
   steps 1 and 2, which is why those two belong in a quiet moment and close
   together.

A leaked client secret is worth little without an authorisation code, and
GitHub sends those only to the callback URL registered for the app. Rotate
anyway, then read the `auth.sign_in` lines since the leak for sign-ins nobody
expected.

### `TRAZUM_DATABASE_URL`

**What uses it.** Every read and write of accounts, sessions, prompts, links and
rate limits (`apps/web/lib/store/index.ts`). Its password is the secret part.

**What rotating it does.** Nobody is signed out: sessions are rows, and the rows
stay. While the app holds a password the database no longer accepts, every
request that needs the database fails, and the log shows `"type":"error"`
lines for them.

Without a gap, using a second role:

1. Create a new role, or a new password on a new role, with exactly the old
   one's privileges on the `trazum_` tables. Most providers do this from their
   dashboard.
2. Set `TRAZUM_DATABASE_URL` to a URL with the new credentials, and redeploy or
   restart.
3. Check it: a signed-in page loads the library, and the log has no
   `"type":"error"` lines from after the deploy.
4. Remove the old role, or its password.

If the provider can only reset the one role's password in place, do steps 1
and 2 back to back in a quiet moment: requests fail between them.

## The ones the repository holds

GitHub *Settings → Secrets and variables → Actions*, or an environment's
secrets. `GITHUB_TOKEN` is issued to each run and expires with it; there is
nothing to rotate.

### `NPM_TOKEN`

An environment secret of the `release` environment, read only by the publish
steps of `.github/workflows/release.yml`. It is a granular npm token limited to
the `@trazum` packages, with an expiry. [Releasing](../releasing.md) says how to
make one; to rotate, make a new one the same way, replace the environment
secret, and revoke the old token on npm. The next release is the check. Whatever
was published under a leaked token stays published: rotation stops the next
upload, not the last one, so read the versions npm lists against the releases
this repository made.

### `CODECOV_TOKEN`

A repository secret, read by two steps and no other: the upload step of
`.github/workflows/coverage.yml`, which hands it to Codecov's uploader through
the environment, and the last step of `.github/workflows/bundle.yml`, where
`scripts/bundle-report.mjs` reads it from the environment by name. It has to
be a repository secret and not an environment's: neither job names an
environment, and a job reads an environment's secrets only when it does. It is
Codecov's upload token: what it authorises is sending a coverage report, a
test results file or a bundle report. Nothing in this repository gates on what
Codecov says, every one of its statuses being informational, so the worst a
leaked one does here is put false figures on Codecov's pages.

1. In Codecov, open the repository's or the account's settings and regenerate
   the upload token.
2. Replace the `CODECOV_TOKEN` repository secret with the new value.
3. Push to `main`, or re-run the `Coverage` and `Bundle` workflows there.

Check it: the upload step's log says whether a token was set, never the
token, and on `main` the step fails when Codecov refuses an upload. On a pull
request from a branch of this repository a refusal is a warning, with
Codecov's reason above it.

### `CODACY_PROJECT_TOKEN`

A repository secret, read by one step and no other: the last step of
`.github/workflows/coverage.yml`, which hands it to Codacy's coverage reporter
through the environment. Like `CODECOV_TOKEN` it has to be a repository secret,
because the job names no environment. It is a repository API token of
Codacy's, and it is wider than its use here. Codacy's page on API tokens, read
on 2026-11-18, says such a token reaches only the one repository it was made
for, and that besides sending coverage it can read that repository's findings
in Codacy and ask for a commit to be analysed again. It cannot reach this
repository on GitHub. Nothing here gates on what Codacy says, so the worst a
leaked one does is put false figures on Codacy's pages and read findings that
are public anyway.

The same page says a token has to expire within a year of being made, so this
one is rotated on a date whether or not it leaked. When it lapses nothing
fails: the step warns that Codacy did not take the coverage, and the figures
measured in the run stand.

1. In Codacy, open the repository's *Settings → API tokens* and, under
   *Repository API tokens*, create a new one. Its value is shown once.
2. Replace the `CODACY_PROJECT_TOKEN` repository secret with the new value.
3. Delete the old token on the same page.
4. Push to `main`, or re-run the `Coverage` workflow there.

Check it: the step's log says whether a token was set, never the token, and
whether Codacy took the reports. Without the secret it says nothing is sent,
and fetches nothing.

### `N0_GITEA_HOST`, `N0_GITEA_USER`, `N0_GITEA_TOKEN`

Read only by `.github/workflows/mirror-to-n0.yml`, which mirrors the repository
to N0 and does nothing while they are unset. To rotate the token, mint a new
one from N0, replace the secret, revoke the old one in Gitea, and push to `main`:
the mirror job is the check.

## Not secrets

Listed so nobody rotates them in a hurry, or guards them as if they were:

- **Who may sign in and who administers:** `TRAZUM_GITHUB_CLIENT_ID` (it is in
  every sign-in URL), `TRAZUM_PUBLIC_URL`, `TRAZUM_ALLOWED_USERS`,
  `TRAZUM_OPEN_SIGNUP`, `TRAZUM_ADMINS`.
- **How sessions and the database behave:** `TRAZUM_SESSION_MAX_HOURS`,
  `TRAZUM_SESSION_IDLE_MINUTES`, `TRAZUM_DATABASE_SSL`, `TRAZUM_DATABASE_POOL`.
- **Which model endpoints exist:** `TRAZUM_ALLOWED_LLM_ENDPOINTS`,
  `TRAZUM_LLM_BASE_URL`, `TRAZUM_LLM_MODEL`. None of them is a key: the server
  never holds one.
- **What the browser is told:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_POSTHOG_HOST`
  and `NEXT_PUBLIC_POSTHOG_KEY`, a public project key the browser sends with
  every event; `NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS`, a switch that holds no
  secret; `VERCEL_URL`, which the platform sets.
- A caller's own model key arrives with one request, is used for it, and is
  never logged or kept. There is nothing to rotate on this side.

## Ending sessions

Not a secret, but the procedure an exposure usually needs next.

- **One account:** the account menu's *Your sessions* to end one session, or
  *Sign out everywhere*. Ending any session but the one asking needs a sign-in
  in the last fifteen minutes.
- **Everybody:** delete every row of `trazum_sessions`. Every browser is signed
  out at its next request; accounts, prompts and links are untouched. On the
  memory store, a restart does the same.
