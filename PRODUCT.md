# Trazum

## Platform

Shared TypeScript core, CLI, MCP, local HTTP API, web dashboard and editor integration.

## Purpose

Understand AI usage costs and apply explicit spending policies. Trazum distinguishes measured usage, price-based estimates, and unknown data. It does not claim that shorter prompts always produce cheaper successful outcomes.

Trazum is independent of the agent harness and model provider. Claude Code is
the first native session integration, not the boundary of the product. A
harness identifies where an agent runs; the model, provider and payment mode
are separate facts. Neither a harness name nor an environment variable proves
subscription or API billing.

## Users

Working assumption inferred from the existing product: developers and teams investigating model usage logs, comparing prompts, and operating AI workloads. The rebrand does not introduce a new customer segment or paid service.

## Capabilities and constraints

- The web app provides bill analysis, task-efficiency analysis and comparison, a CLI playground, prompt optimization, prompt writing, comparison, and an authenticated library.
- Task analysis reads explicitly selected Claude Code/Codex files locally, exports portable reports and optional instructions, and compares declared outcomes. It neither runs tasks nor applies project instructions from the browser.
- Usage-log bill analysis happens in the browser. Privacy claims are specific to their actual workflows; account and other server-backed features remain distinct.
- The core and CLI expose deterministic analysis, reports, and policy checks. Estimates and assumptions must remain visible.
- Native session adapters normalize recorded usage into the existing usage-log
  contract. Missing model attribution, unsupported formats and partial usage
  remain explicit gaps. MCP compatibility alone does not imply native session
  import, automatic interception or account-wide spending enforcement.
- Compare successful task costs only when task identity and outcome evidence
  exist. Tokens, requests and sessions alone cannot establish task success or
  prove that one harness is better than another.
- English and Spanish are reviewed application locales. Marketing also includes French, German, and Portuguese with the existing review disclosures.
- No new cloud billing service, blockchain integration, subscriptions, customers, or performance claims are implied by the visual refresh.

## Brand commitments

Trazum remains the product name. Clear, precise, direct language. The user authorized complete visual replacement while preserving existing functionality.

## Accessibility

Keyboard navigation, labelled inputs, visible focus, reduced motion, responsive layouts, and legible contrast in both system color schemes.

## Evidence

Existing code, examples, source-linked claims and test fixtures. Illustrative figures must stay labelled; never present example data as customer evidence.

## Scale and release quality

Evaluate value per accepted task, including retries, failures, analysis overhead
and unknown outcomes. Lower token use alone does not establish higher value.
Every release must exercise input/output boundaries, concurrent requests and
recovery after refusal on its affected surfaces. Test the installable packages
as well as the checkout. Keep synthetic stress measurements separate from
production capacity claims; shared-service scale requires its own load and
isolation evidence before being promised.
