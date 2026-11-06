# Secure coding checklist

What a change to this repository has to get right, written for whoever makes
it (OWASP ASVS 4.0.3 1.1.7). Each item names what holds it: almost all are a
test that fails the build when the rule is broken, so the list describes the
code rather than hoping for it. The few that only review can hold say so.

Read the [threat model](threat-model.md) for why each exists. Read
[CONTRIBUTING.md](../../CONTRIBUTING.md#security-invariants) for the invariants
of the published packages, which this list repeats in one line each so the
checklist is complete in one place. `apps/web/test/threat-model.test.mjs` fails
when a file this page names no longer exists.

## A web route

| When you | Do this | Held by |
| --- | --- | --- |
| Add a route, or a method to one | Add it to `API_METHODS`; anything not listed is refused with 405 | `apps/web/test/api-methods.test.mjs` |
| Add a route | Give every handler a rate limit: one of the shared buckets, `requireCaller` (which applies the library's), or a limiter of its own with a row in the threat model | `apps/web/test/threat-model.test.mjs` |
| Read a request body | Refuse it with 415 unless `saysJson(request)`; parse it into `raw: unknown`; mark a parse failure with `unreadableBody`; read it only through `readBody` with a schema in `apps/web/lib/body-schemas.ts`, listed in `BODIES` for the route and method | `apps/web/test/request-body.test.mjs`, `apps/web/test/body-schemas.test.mjs`, `apps/web/test/security-log.test.mjs` |
| Export a handler of a route that refuses input | Export it through `logsRefusedInput`, so every 400, 413, 415 and 422 writes a line | `apps/web/test/security-log.test.mjs` |
| Change state | Refuse another origin: `requireCaller(request, { write: true })` on the library routes, `sameOrigin` on the others | `apps/web/test/route-invariants.test.mjs` |
| Need to know who is asking | Ask `requireCaller` or `currentSession`. Never take an account, an owner or a session from the request: there is no parameter that names one, and there must not be | `apps/web/test/prompts.test.mjs`, `apps/web/test/shares.test.mjs`, `apps/web/test/sessions.test.mjs` (each with a second account trying) |
| Read or write a record that belongs to someone | Put the owner in the query itself, never in a check after it; answer 404 for a record that is not the caller's, the same as one that does not exist | `apps/web/test/store-contract.test.mjs`, on memory and on PostgreSQL |
| Count something before writing it | Count and write in one transaction, after locking the account's or the prompt's row | `apps/web/test/store-contract.test.mjs` |
| Answer with somebody's data | Use `privateJson`, or set `cache-control: private, no-store` yourself | `apps/web/test/route-invariants.test.mjs` |
| Make a security decision | Write it with `securityEvent`, the route through `routeOf`; never a token, a login, an address, a prompt or a message that quotes the input | `apps/web/test/security-log.test.mjs` (plants each and reads every line) |
| Set a limit | Name it as a constant with the risk beside it, and add its row to the [threat model's table](threat-model.md#the-limits-and-the-risk-behind-each) | `apps/web/test/threat-model.test.mjs` |
| Read a secret from the environment | Read it at run time, never at build; an error about it names the variable and its range, never its value | `apps/web/test/auth.test.mjs`, `apps/web/test/auth-routes.test.mjs` |
| Fetch anything from the server | Through `packages/core/src/net.ts`, to an endpoint the operator listed, with redirects refused; never derive `allowInsecure` from a request | `packages/core/test/security.test.js` |
| Never lend the operator's model key | A model-assisted pass uses the caller's key or nothing | `apps/web/test/api.test.mjs` |

## A page

| When you | Do this | Held by |
| --- | --- | --- |
| Add a script | Let it load under the nonce; never add `'unsafe-inline'` to `script-src`, nor `'unsafe-eval'` in production | `apps/web/test/route-invariants.test.mjs` |
| Read something the user pasted or dropped | Read it in the page. Nothing pasted may reach the server or any other host | `test/privacy-probe.test.mjs`, and the probe CI runs on the built app |
| Send a body to the API | Say `content-type: application/json`, and send only the fields the route's schema declares | `apps/web/test/request-body.test.mjs`, `apps/web/test/body-schemas.test.mjs` |
| Put a share token in a link | Nothing to do: `Referrer-Policy: no-referrer` is site-wide, and analytics strip tokens. Do not loosen either | `apps/web/test/route-invariants.test.mjs`, `apps/web/test/analytics.test.mjs` |
| Render text a user wrote | Let React escape it; never `dangerouslySetInnerHTML` with it | Review |

## The packages: core, CLI, MCP server

| When you | Do this | Held by |
| --- | --- | --- |
| Want a dependency | Do not add one at run time: the published packages have none, and the test lists them from the workspaces | `packages/core/test/security.test.js` |
| Write a rule's regular expression | Bound every repetition; no nested unbounded quantifiers. Pathological inputs run against a time budget | `packages/core/test/security.test.js`, [authoring rules](../authoring-rules.md) |
| Write a parser | It never throws on any input, never grows its input, and stays idempotent; seeded properties hold each | `packages/core/test/properties-usage.test.js`, [hardening](../hardening.md) |
| Import a Node builtin in core | Do not; filesystem code belongs on `@trazum/core/node` | `packages/core/test/security.test.js` |
| Call the network from core | Only from the two modules whose job it is; `optimize()` never does | `packages/core/test/security.test.js` |
| Write a file on the user's machine | `0600` for files and `0700` for directories: a prompt in a shared home directory is published to every account on it | `packages/cli/test/suggest-cache.test.js`, `packages/cli/test/filter.test.js` |
| Print or log anything | Never a prompt or an API key | Review |

## A workflow

| When you | Do this | Held by |
| --- | --- | --- |
| Use a third-party action | Pin it to a commit, with a `# vN` comment Dependabot bumps | `packages/core/test/security.test.js` |
| Pass a value to a shell step | Through `env:`, never interpolated into a `run:` body | `packages/core/test/security.test.js` |
| Want a workflow to comment on a fork's pull request | Do not reach for `pull_request_target`: it runs a contributor's code with the repository's secrets | `packages/core/test/security.test.js` |
| Install dependencies | With `--ignore-scripts` | `packages/core/test/security.test.js` |

## Every pull request

- Say what the change refuses to do, and plant the violation the new guard is
  for and watch it fail before trusting it. The [template](../../.github/PULL_REQUEST_TEMPLATE.md)
  asks for both; review holds them.
- A finding from CodeQL, dependency review or Socket is read and answered on
  its merits, never dismissed to get green; a job fails the build while `main`
  carries an open high or critical alert (`.github/workflows/security.yml`).
- A bug that reached `main` gets the test that would have caught it, in the
  same change as the fix.
