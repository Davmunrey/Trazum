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
  every event; `VERCEL_URL`, which the platform sets.
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
