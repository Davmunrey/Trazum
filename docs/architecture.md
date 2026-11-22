# Architecture

[Documentation](README.md) / [Contributing](../CONTRIBUTING.md) · [Security](../SECURITY.md)

The high-level design: what the parts are, which way they depend on each other,
where data goes, and what crosses the network. The file-by-file map is the
README's [Layout](../README.md#layout); the trust boundaries, each with what
answers it, are in the [threat model](compliance/threat-model.md#where-the-lines-run).

## The parts

| Part | What it is | Depends on |
| --- | --- | --- |
| `@trazum/core` | The library everything else is built on: the usage-log readers for each coding agent, the pricing catalogue, the token estimator, the deterministic prompt rules, the reports | Nothing. It has no runtime dependency, and a test keeps it that way |
| `@trazum/cli` | The `trazum` command, and the local services it can start: the gateway in front of a provider's API, and the local HTTP API (`trazum serve`) | `@trazum/core` |
| `@trazum/mcp` | An MCP server over stdio that exposes the core's analyses as tools to an agent | `@trazum/core` |
| `@trazum/tokenizer-openai` | An optional exact token counter for OpenAI models, loaded only when installed | `js-tiktoken`, the only runtime dependency among the published packages |
| `apps/web` | The Next.js web app: the page that reads a pasted log in the browser, and, when the operator switches accounts on, sign-in with GitHub, a prompt library and share links | `@trazum/core`, Next.js, React, `postgres` |
| `apps/vscode` | The editor extension, attached to each release as a `.vsix` | `@trazum/core` |
| The GitHub Action | `action.yml`, which runs the CLI's prompt gate in a workflow | `@trazum/cli` |

Dependencies point one way, toward the core, and the core points nowhere.

## Where the data goes

- **A bill** (`trazum bill` and the commands around it): the core reads the
  session files each coding agent already keeps on disk, prices every recorded
  call from the catalogue that ships inside the package, and prints or writes
  the result. No call leaves the machine.
- **An optimisation** (`trazum optimize`): the core separates what must not be
  touched (code, URLs, templates) from prose, applies deterministic rules to the
  prose, and returns the prompt with every change listed. No model is called.
- **The gateway** (`trazum gateway`): a local proxy the user points an agent
  at. It estimates each request before forwarding it to the provider the user
  configured, refuses one that would pass the budget, and counts what was
  spent. The provider and the key are the user's.
- **The web page**: a pasted log is read in the browser and goes nowhere else.
  The page's content security policy allows connections to its own origin, and
  to one analytics host only when the operator configures one. A CI probe fails
  the build if any part of a pasted log leaves the page.

## What crosses the network, and when

From the CLI, the MCP server and the libraries: nothing, unless the user asks
for it with a provider key, a URL or a flag. What they send goes through the
core's `net.ts`, which checks the endpoint against an allowlist that fails
closed and refuses redirects.

The hosted web app has connections of its own that `net.ts` does not govern:
GitHub for sign-in, its database, a model endpoint the operator allows, and one
analytics host when the operator configures one. Each is a boundary in the
[threat model](compliance/threat-model.md#where-the-lines-run), with the control
that answers it. [SECURITY.md](../SECURITY.md#what-trazum-is-exposed-to) lists
every surface.

## How it is built and shipped

TypeScript, compiled with `tsc`, in npm workspaces. Two clean builds pack the
four published packages into byte-identical tarballs (measured on 2026-11-22,
at 3.0.4). Every change reaches `main` through a pull request with required
checks. A release is the merge of a release pull request: the workflow
publishes to npm with provenance, tags, attaches the files and signs them
([docs/releasing.md](releasing.md), [RELEASES.md](../RELEASES.md)).
