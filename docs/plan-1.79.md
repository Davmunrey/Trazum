# 1.79 — The dash the sweep left behind

*Written before the code, like the eighteen plans before it.*

## The thesis

The owner asked, in so many words, for every em-dash to leave the product.
The web app was swept and its Spanish dictionary now holds none. Then the
owner ran `trazum position --locale es` on their own log and read this:

```
  Medido solo desde este log, registro a registro. La posición mensual
    facturada por el proveedor que guarda el almacén es otra medición — la
    imprime «trazum store» — y las dos nunca se funden en una cifra.
```

Two em-dashes, in Spanish, in the terminal. The sweep had covered one
surface out of two, and nothing in the suite noticed, because the sweep was
an edit rather than a rule. An instruction carried out by hand once is not
carried out: it is postponed until the next person reintroduces it.

This arc finishes the sweep on the Spanish surfaces and, more importantly,
turns it into something the suite holds.

## Chapter 1 — Spanish, not English

The Spanish catalogues are swept: `packages/cli/src/i18n/es.ts` (324
occurrences) and `packages/core/src/i18n/es.ts` (14). Every replacement is
judged one at a time, because the em-dash is doing different work in
different sentences and a blanket substitution would produce Spanish nobody
writes:

- An explanatory continuation becomes a colon.
- An aside becomes a comma, or a pair of parentheses when it is bracketed.
- A gloss after a title becomes a comma.
- A sentence that is really two sentences becomes two sentences.

**English is deliberately not swept, and this plan says so rather than
leaving it to be discovered.** The em-dash is ordinary English punctuation
and the entire English voice of this product rests on it: the READMEs, the
release notes, the CHANGELOG and `en.ts` itself. Removing it from one
English file and not the rest would make the product read as though two
people wrote it. The instruction was about the Spanish the owner reads on
screen, and that is what this arc closes. If the owner wants English swept
too, that is a different arc and a much larger one, and it should be asked
for rather than assumed.

## Chapter 2 — A rule, not an edit

A new guard in `packages/core/test/security.test.js` reads every Spanish
catalogue in the repository and fails on an em-dash in any of them. It
names the file and the line, so a contributor who adds one is told where
rather than told no.

The guard covers the Spanish catalogues by discovery, not by a hard-coded
list, so a Spanish dictionary added tomorrow is covered the day it lands.
Comments are not exempt: a comment is copy somebody will paste.

The web app's `es.ts` is already clean and stays clean under the same
guard, which is the point. The sweep that had no rule behind it is the
reason this arc exists.

## Chapter 3 — What does not change

No figure, no code path, no JSON field. This arc touches punctuation in two
catalogues and adds one guard. Any test asserting on a Spanish sentence is
updated to the new punctuation and to nothing else; if a test breaks for a
reason other than punctuation, the sweep was wrong and the sweep is what
gets fixed.

## The name

*The dash the sweep left behind.* The instruction was given once and obeyed
once, on one surface, and the surface the owner actually works in kept it.
