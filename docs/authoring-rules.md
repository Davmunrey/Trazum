# Writing a rule

A rule removes or rewrites something in a prompt that costs tokens without
earning them. This is everything you need to add one **without reading the
engine** — which is the point: the engine's job is to make a rule a small,
local, safe thing to write.

If you only remember one paragraph: **a rule never sees code, URLs or
placeholders**, so it cannot break them; and **`safe` is a promise**, so when you
are unsure whether removing something could change what the prompt asks for, the
answer is `aggressive`.

---

## What a rule is

```ts
interface Rule {
  id: RuleId;
  level: 'safe' | 'aggressive';
  apply(text: string): { text: string; hits: number };
}
```

That is the whole contract. `apply` gets a string, returns a string and a count.
No async, no options, no access to the prompt's structure or the usage profile.

`hits` is how many times the rule fired. It drives the per-rule token
attribution and the `3×` in the report, so returning `1` for a rule that fired
four times understates it in every figure a reader sees.

---

## What you never have to worry about

**The text you receive is masked.** Before any rule runs, the engine replaces
every code fence, inline code span, URL, template placeholder (`{{x}}`, `${x}`,
`{x}`, `{% %}`) and XML/HTML tag with a single private-use Unicode marker. Your
regex cannot match inside them because the characters are not there.

So this is not a hazard you need to design around:

```
Summarise this. Do not say "please".      ← your rule may edit this
`please` in a code span                    ← masked, invisible to you
https://example.com/please                 ← masked, invisible to you
{{please}}                                 ← masked, invisible to you
```

**And if a rule breaks the masking anyway, it is discarded.** After every rule
the engine verifies that the markers are still intact. A rule that damaged one is
dropped and the remaining rules carry on — the prompt is never returned in a
half-corrupted state. You do not need to be careful about this; you need to not
rely on it, because a discarded rule is a rule that silently did nothing.

---

## The four steps

### 1. Add the id

`packages/core/src/i18n/types.ts`:

```ts
export type RuleId =
  | 'politeness'
  | 'filler'
  | 'your-new-rule';   // kebab-case, and permanent — see below
```

`RuleId` is a typed union, so **the build now fails** until every locale
catalogue describes your rule. That is deliberate: it is the mechanism that stops
a rule shipping with no Spanish copy.

The id is part of the public API. People write it in `--disable` and branch on it
in `--json`. Pick one you will not want to rename.

### 2. Implement it

`packages/core/src/rules.ts`. If your rule is "delete these phrases", there is
already a factory:

```ts
const YOUR_PHRASES = ['as an aside', 'in passing'] as const;
const yourRule = dropRule('your-new-rule', 'aggressive', YOUR_PHRASES);
```

`dropRule` sorts by length so a longer phrase wins over a shorter one it
contains — `thank you very much` before `thanks` — and tidies the whitespace and
punctuation left behind. Use it when you can.

Otherwise, write it out:

```ts
const yourRule: Rule = {
  id: 'your-new-rule',
  level: 'aggressive',
  apply(text) {
    let hits = 0;
    const out = text.replace(YOUR_PATTERN, () => {
      hits++;
      return '';
    });
    return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
  },
};
```

Two things that look like style but are not:

- **Count inside the replacer**, not with a separate `match()` pass. Two passes
  can disagree, and the one that disagrees is the one in the report.
- **Only tidy when you fired.** `tidyAfterRemoval` normalises the gap a deletion
  leaves; running it on untouched text makes a rule that did nothing look like it
  did something.

Then add it to the exported list at the bottom of the file. Order matters where
one rule's output is another's input.

### 3. Write the copy, in every locale

`packages/core/src/i18n/en.ts` and `es.ts`:

```ts
'your-new-rule': {
  title: 'Asides',
  rationale: 'Parenthetical remarks that do not change the instruction.',
},
```

`title` appears in the report; `rationale` explains why it is safe to remove.
Write the rationale for somebody deciding whether to trust the change — that is
the only reason it exists.

The catalogue-parity test will fail if you add one and not the other.

### 4. Test it

The bar is **three** cases, and the third is the one people skip:

```ts
it('removes the aside', () => {
  const { optimized } = optimize('Summarise it, as an aside, briefly.');
  assert.doesNotMatch(optimized, /as an aside/);
});

it('leaves a lookalike alone', () => {
  // "aside from" is not an aside — it is load-bearing.
  const { optimized } = optimize('Aside from the summary, list the risks.');
  assert.match(optimized, /Aside from the summary/);
});

it('counts every hit', () => {
  const result = optimize('As an aside, x. As an aside, y.');
  assert.equal(result.rules.find((r) => r.id === 'your-new-rule').hits, 2);
});
```

The false-positive case is what makes a rule trustworthy. Nearly every rule in
this repository has one, and the two that shipped without one both had bugs.

---

## Choosing the level

**`safe` means "this cannot change what the prompt asks for".** Not "unlikely
to", not "I could not think of a case". It is the level people run unattended in
CI, so a false positive there is a silently altered prompt in production.

Put a rule at `aggressive` if removing its target could:

- change the tone the model adopts, when tone might be the task
- remove an instruction that reads as decorative but constrains the output
- delete something whose absence changes the meaning of a *neighbouring*
  sentence

`aggressive` is not a lesser level. It is where the largest savings are, and as
of 0.6.0 every rule reports what it changed so an aggressive run can be reviewed
rule by rule. A rule at `aggressive` with a good rationale is more useful than
the same rule at `safe` with a caveat in the docs.

---

## The one hard constraint: bounded regexes

Trazum is a regex engine pointed at text somebody else wrote, reachable over
HTTP through the web app. **A rule with catastrophic backtracking is a
denial-of-service bug**, and two shipped in 0.1.0 — one of them in a `safe` rule.

The rule, stated plainly: **no two adjacent unbounded quantifiers.**

```ts
/\s+\w+\s+/          // fine
/(\s*\w*)+/          // NOT fine — nested quantifiers
/[^\S\n]+\s+$/       // NOT fine — two unbounded runs that can overlap
/[ \t]{0,16}\d{0,6}/ // fine — bounded, and bounds are cheap to add
```

Prefer an explicit bound (`{0,16}`) to an open `*` whenever a real prompt would
never exceed it. Every bounded constant in `structure.ts` exists because of this.

**Test it with the right shape.** The suite has a time budget over pathological
inputs, and it only works if the fixture matches the failure mode. Repeated
tokens are not enough:

```ts
'word '.repeat(50_000)              // catches almost nothing
`${'a'.repeat(50_000)}!`            // a long run that never terminates — this
                                    // is the shape that finds real bugs
```

Both ReDoS bugs found in this repository needed a prefix plus a long
non-terminating run. The fixtures that missed them were all repeated words.

---

## What does not belong in a rule

- **Anything that needs to see the whole prompt's structure.** Contradictions,
  redundant examples and restated formats are *advisories*, in
  `structure.ts` — they report, they never cut, because they have a right answer
  only the author knows.
- **Anything that needs a model.** That is the optional LLM pass in `llm.ts`.
- **Anything that needs the network.** The deterministic core makes no network
  call, and a test asserts that only `llm.ts` and `tokenizer.ts` may mention
  `fetch`.
- **Anything language-specific in the code.** Dictionaries live in the locale
  files; the rule reads them. A rule with English phrases inline cannot be
  translated.

---

## Before you open the pull request

```bash
npm run verify
```

Build, tests, typecheck across all three workspaces, and the web build — in the
order CI runs them. Read the exit code, not the output.

Then add a `CHANGELOG.md` entry under `Unreleased`, and say in the pull request
what the rule leaves alone. A reviewer's first question about a new rule is
always "what does this break", and answering it unprompted is the fastest way
through review.
