# What is open, what is not, and what cannot move

If you are deciding whether to build on this, the licence file answers one
question and leaves three unanswered. This page answers the other three: what
the licence covers today, what could plausibly stop being covered, and what was
never covered at all.

It is written now, while there is one copyright holder and nothing to gain from
a convenient answer. A promise about openness made after there is money on the
other side of it is worth less than the same promise made before.

## What is open

Everything in this repository is MIT, and the file is
[LICENSE](../LICENSE). That includes:

- **`@trazum/core`**, the analysis. Every figure this product prints is
  computed here.
- **`@trazum/cli`**, the 48 commands.
- **`@trazum/mcp`**, the MCP server.
- **`@trazum/tokenizer-openai`**, the optional exact counter for OpenAI models.
  The one package here with a runtime dependency, taken on purpose so the core
  keeps having none.
- **`action/`**, the GitHub Action.
- **`apps/web`**, the web app, including everything the hosted page runs.
- **`plugin/`**, the Claude Code plugin.

That list is not typed from memory. `licensing.test.js` derives it from the
repository: every package under `packages/` that is not marked `private`, plus
each shipping surface directory, and it fails if one of them is missing from
this page. A package added tomorrow and not named here breaks the build. It
also asserts that every publishable package actually declares MIT, so the
sentence above is a claim about the manifests rather than about somebody's
recollection of them.

## The promise

**No analysis this repository can perform today will move out of the open
set.** Not the profiler, not the gates, not the optimiser, not the pricing
work, not the converters, not the report documents.

This is not generosity. It is the only position consistent with what this
product claims about itself.

The argument for trusting a figure printed here has never been "trust us". It
is that the code producing the figure can be read, and that its refusals are
visible in the source: where it says it cannot know something, you can go and
see why. A capability held back from the open set would not merely be a
licensing decision. It would mean the interesting half of the arithmetic is the
half nobody can check, which is the exact posture this product exists to
refuse. Withholding an analysis would break the thesis before it broke the
licence.

The practical form of the promise: if an analysis works here today, it stays
here. There is no "open core" boundary waiting to be drawn through the middle
of the product.

## What is not open, and never was

Anything that requires infrastructure somebody else operates.

**None of it exists.** There is no hosted service, no account, no server
holding anybody's data. Every figure this product prints today is computed on
the machine that ran the command, from a file that machine already had.

If such a thing is ever built, it ships proprietary from its first commit. That
is a different statement from the one people usually make, and the difference
is the point: nothing is moved out of the open set to create it. A hosted
service would be new code, doing a new job that needs a machine somebody pays
for, and the open set would be exactly as large the day after it launched as
the day before.

## What is reserved

**The name.** The MIT licence covers the code. It has never covered the right
to call something else Trazum, and it does not now.

You may fork, modify, redistribute and sell the code, with attribution, exactly
as MIT says. What you may not do is present the result as this project. That is
not a restriction MIT imposes and not one added on top of it: a licence grants
rights in a copyrighted work, and a name is not one.

There is no trademark policy here yet, and this page is not one. A policy waits
on a filing, and until then this is the whole of the reservation: the code is
yours to use, the name is not.

## Open questions, named rather than implied

- **Apache-2.0 is under consideration and has not been decided.** It would
  add an explicit patent grant, which is what a corporate legal review usually
  asks for and MIT does not answer. It is a later decision and a conditional
  one, and nothing on this page assumes it.
- **The licences of vendored dependencies have not been audited.** Runtime
  dependencies outside this repository are zero by design, and a guard holds
  that. Development dependencies and vendored material are a separate question
  that this page does not answer.

## Why provenance sits next to this

A licence is only as good as the repository's ability to account for where its
code came from. That is what the [sign-off
requirement](../CONTRIBUTING.md#signing-off) is for, and why it was added while
the answer was still trivial: with one copyright holder, "who wrote this and
under what terms" has an easy answer. The first merged commit whose origin
nobody recorded is the one that makes it hard forever.

Read together: the sign-off records where the code came from, this page records
what may be done with it, and neither is worth much without the other.
