# Any input

This page states what Trazum promises about input it was never meant to see —
and where each promise is enforced, so the claim can be checked rather than
believed. It exists because a stress session found **seven defects in an
afternoon, all one shape: an input nobody had tried, taken quietly.** The
session is written up in the [1.62 arc plan](plan-1.62-1.63.md) and in the
release notes for 1.61.1 and 1.61.2; this page is what remains true after it.

## The properties, as held

Every one of these is a test that fails the build, not a sentence. They live in
[`packages/core/test/hostile-input.test.js`](../packages/core/test/hostile-input.test.js),
run on every push, and are **seeded and deterministic** — the same seed
produces the same corpus and the same verdict on any machine, and the run is
bounded in seconds, so it is a test and not a job.

| Promise | Over |
|---|---|
| `optimize` **never throws** | ~1,500 fuzzed prompts built from hostile atoms: RTL and CJK text, lone surrogates, null bytes, zero-width characters, CRLF, unclosed fences, 3,000-character tokens |
| `optimize` **never grows** the token count | the same corpus, at both levels |
| `optimize` is **idempotent** | running it on its own output changes nothing, byte for byte — the pipeline runs to a fixed point |
| **Protected spans survive byte-for-byte** | code blocks, inline code and URLs, asserted across the whole corpus — including bait the rules *want* to rewrite, placed deliberately inside protected spans |
| **Money is never negative** | no document this package can build carries a negative dollar figure, whatever the input — negative or non-finite token counts are refused at the layer that owns them, in the library, the CLI, the gateway and the MCP tools alike |
| **Unreadable lines are named** | `profileUsage`, `conform` and `rollUp` never throw on any text; a line they cannot read is reported by number, not skipped in silence |

Two smaller promises ride along: **no two doors to the same value disagree**
(a flag refuses what the config refuses, at the same threshold), and **a schema
the runtime does not enforce is not the guard** — MCP tools validate their
arguments in code, not only in their published schemas.

## Why the defects are still visible

Each defect the session found is pinned in the suite as its own named case,
outside the fuzzer's seed schedule — because adding one atom shifts every
subsequent draw, and a regression that only a rotated seed would find is not a
regression test. The fuzzer hunts for the next defect; the named cases hold the
ground already taken.

The list itself — what was wrong, for how long, and what found it — is in
[RELEASES.md](../RELEASES.md) under 1.61.1 and 1.61.2, and the standard this
repository holds itself to when writing those lists is in
[our own medicine](our-own-medicine.md).

## What this does not prove

A bounded fuzzer proves the absence of the crashes it looked for, nothing more.
The corpus is a few dozen atoms in combination; real input is stranger. What
the arrangement actually promises is narrower and more useful: **every crash
found from now on joins the corpus as an atom**, so the same input can never be
taken quietly twice. A property that has never failed is treated here as a
property that cannot fail — twice during the arc, an assertion sat green over
a corpus that could not exercise it, and both times the fix was bait in the
corpus, not confidence in the zero. The reasoning behind that rule is in
[the doctrine](doctrine.md).

## Reproducing a verdict

The suite runs with the rest of the tests — `npm test` from the repository
root, or the single file with Node's own runner:

```
node --test packages/core/test/hostile-input.test.js
```

Same seed, same corpus, same verdict, any machine. If it fails somewhere it
should not, that is a finding — [report it](../SUPPORT.md).
