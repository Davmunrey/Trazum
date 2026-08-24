# Deploying the web app on N0

What ships is the **web app** (`apps/web`) and nothing else. The CLI, the
gateway and `trazum serve` are loopback-only by design — a cost oracle on a
network interface is an attack surface — and they belong on the machines
where your agents run, next to the logs they read. Deploying the web app
changes none of that: `trazum profile usage.jsonl` and the store still live
wherever the calls happen.

## The pieces in this repository

| File | Job |
| --- | --- |
| `Dockerfile` | Builds `@trazum/core`, then the web app with Next's `standalone` output — the runtime image carries the traced server and static assets, nothing else. |
| `n0-app.json` | The N0 manifest: a `db` (Postgres 16), a `migration` service that applies `apps/web/db/*.sql` and stops on error, and the `web` entrypoint. The SQL is embedded because the platform writes `config_files` before the container starts — and `packages/core/test/n0-manifest.test.js` holds the embedded copy byte-identical to `apps/web/db`, both directions, so it cannot drift. |
| `.gitea/workflows/build-and-push.yml` | Runs inside the N0 workspace's Gitea: builds the image and pushes `:latest`, the commit SHA and any release tag to the workspace registry. N0 never builds images itself. |
| `.github/workflows/mirror-to-n0.yml` | The bridge for updates: on every push to `main` here, mirrors the repository into the workspace's Gitea — which triggers the build above. Does nothing (and says so) until the three `N0_*` secrets exist, so a repository that has not opted in loses nothing. |

## One-time setup

1. In N0: **Developer Settings → API Tokens** ("Build an app with Claude")
   gives `N0_API_BASE` and `N0_API_TOKEN`.
2. Mint a Gitea token from the API (`POST …/workspaces/{ws}/gitea/token/`),
   create the `trazum` repo there, and store `N0_GITEA_HOST`,
   `N0_GITEA_USER`, `N0_GITEA_TOKEN` as GitHub repository secrets — that arms
   the mirror workflow.
3. Replace the `web` service's placeholder image in `n0-app.json` with the
   workspace registry path (`gitea-<workspace>.apps.<domain>/<org>/trazum`).
   The placeholder is loud on purpose: the manifest guard requires it until a
   real workspace exists.
4. Import and deploy: `POST …/apps/definitions/` with the repo URL, then
   `POST …/apps/` with `{"app_type": "trazum"}`. Set `POSTGRES_PASSWORD` and
   `TRAZUM_DATABASE_URL` together in the app's **Secrets** UI — the second
   embeds the first, which is why neither is auto-generated. Without a
   database URL the app runs on the memory store, which forgets on restart
   and says so in its own documentation.

## How an update travels

Merge to `main` here → GitHub mirrors to the workspace Gitea → Gitea Actions
builds and pushes the image tagged with the **commit SHA** → pin that SHA in
`n0-app.json`'s `web` image, re-import the definition, redeploy. Two rules
learned from the platform, worth keeping:

- **`:latest` does not update a running app.** The cluster caches an
  unchanged tag; a redeploy with the same image reference serves the old
  build. Pin the SHA — the same reasoning as this repository's own Action
  pins in the README.
- **Test with a preview, not with production.** `POST …/apps/{id}/previews`
  with the new tag deploys a second instance at `<subdomain>-pv-1` with
  empty data; verify it, then `promote` — the parent redeploys with exactly
  the tested snapshot, and the preview is destroyed.

## What this deliberately does not do

No automatic deploy on merge: the mirror and the build are automatic, the
**deploy is a decision** — pin, re-import, redeploy (or preview → promote),
each a single API call, each leaving a record. And nothing here touches the
provider-credential arcs (1.54.0, 1.57.0) or turns the policy into a server:
the config stays a file in this repository, deployed with the app.
