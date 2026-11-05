# Independent audit with REA, November 2026

Trazum's first claim is that your prompts and logs do not leave your machine.
This repository's own tests hold that claim from the inside: they plant a
secret in each field and grep the output for it. This audit checks it from the
outside, with a tool that has never seen the source: [REA](https://github.com/morluto/rea)
("Reverse Engineer Anything"), version 6.8.0, reading what npm actually serves
and what the production web page actually sends.

**Result: nothing found that sends a log, a prompt or a session key anywhere
without being asked.** One defect was found on the web page and is fixed in
the same change as this report. Every finding below names the evidence.

## What was audited

| Target | What REA did |
| --- | --- |
| `@trazum/core@2.7.7` | `analyze-javascript-application` on the unpacked npm tarball: 603 files, 360 JavaScript files parsed, 0 parse failures |
| `@trazum/cli@2.7.7` | the same: 84 JavaScript files parsed, 0 parse failures |
| `@trazum/mcp@2.7.7` | the same: 12 JavaScript files parsed, 0 parse failures |
| `@trazum/tokenizer-openai@2.7.7` | the same: 3 JavaScript files parsed, 0 parse failures |
| `https://trazum.vercel.app/?tab=bill` | `capture-browser-scenario` in headless Chromium 141: paste a log, read the bill, record every request with its headers and body |

The tarballs were packed from the release commit and compared file by file
with the ones npm serves for 2.7.7: identical.

## The packages

**What each package imports, as REA reconstructed it:**

| Package | External imports |
| --- | --- |
| core | `node:fs/promises`, `node:path` |
| mcp | `@trazum/core` |
| tokenizer-openai | `js-tiktoken` |
| cli | `@trazum/core`, and from Node itself `child_process`, `crypto`, `events`, `fs`, `http`, `os`, `path`, `readline/promises`, `stream`, `url`, `zlib` |

No third-party dependency besides `js-tiktoken`, in the one optional package
that exists to count OpenAI tokens. REA also listed calls to a local helper
named `require` in core and the CLI as unresolved `require:` imports; they are
validation calls, not module loads.

**Every place that can reach the network or another process, and what guards
it.** REA's semantic graph located each `fetch`, `createServer`, `listen` and
`spawn` call; each one was then read in the shipped file.

| Where | What it does | Guard |
| --- | --- | --- |
| `cli/dist/serve.js`, `cli/dist/gateway-server.js` | `trazum serve` and `trazum gateway` | listen on `127.0.0.1` only (`BIND_HOST`) or a local socket |
| `cli/dist/git.js` | reads a file's history for `trazum blame`, and runs the CLI itself per workload for `trazum bench` | `spawnSync` with an argv array and `shell: false`; the only file that starts a process |
| `cli/dist/index.js` (dynamic import) | loads the optional token counter | a fixed specifier, `@trazum/tokenizer-openai` |
| `cli/dist/index.js` (`livePricing`) | reads OpenRouter's price list | only with `--pricing-live`; URL checked before the request, redirects refused |
| `cli/dist/watch-run.js` (`postWebhook`) | posts a budget alert to your webhook | opt-in; HTTPS only (HTTP only to loopback), credentials in the URL refused, redirects refused, 10 s timeout |
| `cli/dist/connect.js` | reads a provider's usage report | opt-in, with your admin key |
| `cli/dist/gateway-server.js` | forwards your calls to the provider | the gateway's job, on your machine |
| `core/dist/llm.js`, `core/dist/gcp-auth.js` | paid evaluations and Vertex sign-in | opt-in, with your key |
| `core/dist/tokenizer.js` | Anthropic's `count_tokens` | opt-in, with your key; URL checked, redirects refused |

Every outbound call is opt-in and needs a key, a URL or a flag from you. A
command that reads a log, `bill` and `profile` among them, reaches the network
only when given `--pricing-live`.

## The web page

The scenario opened the Bill tab in production, pasted a two-call log whose
label, session and an extra `prompt` field each carried a unique marker
string, pressed **Read the bill**, and waited five seconds, recording all 16
requests the page made with their headers and request bodies.

- **No marker appeared in any request:** not in a URL, a header or a body,
  and not in the console.
- Every request went to the page's own origin. The page's
  `Content-Security-Policy` is `connect-src 'self'`, which is what makes that
  true for any script, not only Trazum's.
- Reading the bill made no request at all. The four API calls in the capture
  are the other tabs asking their first question as they mount: the prompt
  writer's interview (`POST /api/write`, stateless, no model, no log in its
  body), the optimiser's model list, the session, and the share list.

**The defect.** The share list was requested on every visit, and on a
deployment with no accounts the server can only answer `503` (`401` for a
signed-out visitor). The browser logged it as a failed resource on every load.
A share link belongs to an account, so the Compare tab now asks for the list
only when the page's one session check found somebody signed in. A test in
`apps/web/test/ui.test.mjs` holds it, and was proven by removing the guard and
watching it fail.

## What this audit does not establish

- **Static analysis reads code; it does not run every path.** REA
  reconstructed imports and call sites from the shipped files. A network call
  built from strings at runtime would not appear as a call site. The table
  above was read by hand against the files for that reason.
- **One page, one scenario.** The capture covers the Bill tab and what loads
  with the page. The prompt writer, the optimiser and the shares are separate
  surfaces that send their own inputs to their own endpoints, by design; their
  tests are in `apps/web/test`.
- **The VS Code extension, the GitHub Action and the plugin** were not part of
  this audit.
- **Headers marked sensitive** (cookies, authorization) are redacted by REA
  before it retains them, so their values were not inspected; there were no
  cookies on a signed-out visit.

## Reproducing it

REA 6.8.0, Node 22, from an empty directory outside this repository:

```bash
npm install rea-agents@6.8.0 --ignore-scripts
npm pack @trazum/cli@2.7.7 && mkdir cli && tar -xzf trazum-cli-2.7.7.tgz -C cli
npx rea analyze-javascript-application "$PWD/cli/package" \
  --detail summary --evidence_output cli-evidence.json --format json
```

The browser scenario is a JSON file passed to
`npx rea capture-browser-scenario scenario.json --format json`, with a
`launch` browser, `start_url` set to the Bill tab, `wait_for`, `fill`, `click`
and `wait_for_timeout` steps, and `"capture": {"events": ["network"],
"network": {"request_body": true, "header_values": true}}`. In a container
running as root, set `REA_BROWSER_NO_SANDBOX=true`.
