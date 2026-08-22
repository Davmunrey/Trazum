# Maintaining a language

Trazum's trimming dictionaries cover seven languages. **Two of them have
somebody here who reads them. Five do not.**

This page is what the missing role actually is: what a language maintainer
decides, the bar a decision has to clear, and what happens when nobody holds
the role — which is the situation for five of the seven right now.

---

## Where the two situations are stated

The standing of each dictionary lives in
[`packages/core/src/maintainers.ts`](../packages/core/src/maintainers.ts), and
the report prints it when no rule fires:

```
  The phrase dictionaries cover English, Spanish, French, German, Portuguese,
  Italian and Dutch.
  Of those, French, German, Portuguese, Italian and Dutch carry entries nobody
  here reads: written by the same process that wrote the rules, never agreed by
  a speaker of the language.
```

| Standing | Languages | What it means |
|---|---|---|
| `reviewed` | English, Spanish | This project reports in it; the entries were revised by somebody reading them |
| `unreviewed` | French, German, Portuguese, Italian, Dutch | Run through the rules against sample prompts; no speaker has agreed to the entries |

And when a rule *does* fire, on a prompt whose own language is one of the five:

```
Rules applied
  These changes came from the Dutch dictionary, which nobody here reads. Its
  entries were written by the same process that wrote the rules and never agreed
  by a speaker — read the diff before trusting it.
  [safe] Filler and throat-clearing (4×, ~29 tokens)
```

**That is the branch where it matters most**, and the coverage line above cannot
reach it: by the time that one prints, the prompt is untouched. Here the tool has
just applied an unverified judgement to somebody's text.

It is gated on the prompt's own detected language, so an English or Spanish
prompt never sees it and it never becomes a footer. `detectTextLanguage` answers
`null` on a prompt too short or too mixed to place, and this stays silent then —
not-detected is not not-unreviewed, but guessing a language in order to warn
about it would put a Dutch warning on a Portuguese prompt.

The five are not deleted, and that is deliberate. A Dutch prompt is better
served by a dictionary that fires and says it was never reviewed than by
silence that reads as *your prompt is already efficient*. What is not
acceptable is naming all seven in one breath — `silence about incompleteness
reads as completeness`, and five sevenths of that list had never been checked
by anyone who could check it.

## Why reading the list is not enough

The strongest evidence this project has that the role is real is a bug it
shipped in three languages at once.

`INTENSIFIERS` is a list of words that add emphasis and nothing else, so
dropping one cannot change what the prompt asks for. The first draft of the
five non-Spanish dictionaries included `molto`, `muito` and `heel`. Each of
those is an intensifier **and** a quantifier:

```
Hai molto tempo per rispondere.   →   Hai tempo per rispondere.
```

*You have much time to answer* became *you have time to answer*. Different
instruction, same token count claimed as a saving.

Spanish has exactly this trap — `muy` is an intensifier, `mucho` is a
quantifier — and the Spanish dictionary got it right, because somebody who
speaks Spanish wrote it. Translating that list word by word lost the
distinction three times over, and it survived being read.

It was caught by running prompts through the rules, which is a far weaker
instrument than a speaker and is what this project actually had. **One bug
found by the weaker instrument is not a review.**

## What a maintainer decides

Not *"is this the right translation"*. The dictionaries are not translations of
each other; each is a judgement about one language. A maintainer answers, for
their own language, questions of this shape:

1. **Does removing this leave the prompt asking for the same thing?** The whole
   product rests on this. `verbose-phrases`, `filler`, `hedges`,
   `intensifiers`, `politeness` and `self-check` each delete or shorten text on
   the claim that meaning survives.
2. **Is a word doing a second job?** The quantifier trap above, and every
   shape like it: a word that is decorative in one construction and load-bearing
   in another belongs on the `aggressive` level, or nowhere.
3. **Does this phrase actually get written?** An entry nobody types is dead
   weight in a list somebody has to keep true.
4. **Does an output cue mean what the catalogue says?** `OUTPUT_CUES_BY_LANGUAGE`
   decides whether a fenced block is *the contract for the answer* or *data the
   prompt needs*. Getting that wrong in one language advises somebody to delete
   a working few-shot example.
5. **Where does the language make this analysis wrong?** A finding this
   repository cannot make from the outside, and the most valuable of the five.

The bar for each is the bar in
[authoring rules](authoring-rules.md): a change lands with a prompt that proves
it, run through the rules, not with an argument that it ought to work.

## What is actually being asked

**A bounded commitment, stated plainly, because an unbounded one gets declined
by exactly the people worth having.**

- Reading one dictionary's entries for your language — a few hundred short
  phrases — and saying, entry by entry, which ones survive question 1 above.
- Answering when a new entry is proposed in that language. Not on a schedule;
  when it happens.
- Saying so if you stop. A maintainer who disappears is not a failure, and
  a record that pretends otherwise is worse than an empty one.

**What is not asked:** availability, a response time, or ownership of anything
outside the dictionary. There is no rota here to join.

## What happens when nobody holds it

The language stays. Its record says `unreviewed`, the report says so where a
reader would otherwise draw the wrong conclusion, and nothing pretends
otherwise. If a maintainer stops, the record goes back to `unreviewed` on the
day they say so — not silently, and not on a guess about how long is too long.

That is the whole mechanism. It is deliberately small: the alternative designs
all end in this project deciding, on its own, that a language it cannot read is
adequately covered.

## The part that is not a scheduling question

An eighth language has been on the roadmap since the dictionaries existed, and
this is why it never moved: the work is not the catalogue plumbing, it is the
judgement, and the judgement cannot be done here. That was true before this
page existed and is still true after it.

So this page does not promise an eighth language. It makes the role a real one
with a real bar, so that somebody who reads a language Trazum trims can see
exactly what they would be signing up for — and so that the five dictionaries
already shipped stop being described as though somebody had.

Proposing yourself: open an issue, or see [contributing](../CONTRIBUTING.md).
