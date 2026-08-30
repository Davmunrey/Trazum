# Changelog

Versioning policy: [VERSIONING.md](VERSIONING.md). Below 1.0, minor versions
may contain breaking changes, and say so in their first line.

`Unreleased` holds what is merged into `main` but not yet tagged. A change that
alters nothing installable — a test, a document — still lands there rather than
nowhere: the changelog is the record of what happened to this repository, and a
merged commit with no entry is a change only `git log` remembers.


## Unreleased

### Fixed

- **The optimiser broke email addresses, and reported a saving for it.** Five of
  ten realistic addresses came out corrupted: `please@example.com` became
  `@example.com`, and so did `thanks@`, `basically@`, `essentially.ops@` and
  `very.important@`. The politeness, filler and intensifier rules read the local
  part as ordinary prose and cut it out. What is left is not a wrong address —
  it is not an address.

  That is the failure `segment.ts` opens by naming: *"compressing a code block,
  a URL or a template placeholder would break the prompt, and that is exactly
  the failure that makes a prompt optimiser useless."* Code, URLs, placeholders,
  inline spans and XML tags were on the protected list. The thing every support
  prompt in the world carries was not. `support@` and `no-reply@` survived, and
  `por.favor@ejemplo.es` survived only because the Spanish politeness entry is
  written with a space rather than a dot — luck, spread across the half of the
  cases that happened not to spell a stripped word, which is what hid it.

  **A fuzzed corpus built for exactly this failed to catch it, for a reason
  worth naming.** `hostile-input.test.js` asserts every protected span survives
  byte for byte over a seeded corpus, and its span extractor was written from
  the same list as the masker — so a protection the masker did not have was one
  the guard could not miss. Its own comment states the principle it was missing:
  bait must be *"text a rule would rewrite, deliberately inside protected
  spans"*, or the property can never fail. There is now an email bait atom and
  the extractor reads addresses.

  Three plants fire, two of them through the corpus guard. A fourth could not be
  built and is recorded rather than left as an untested corner: widening the
  pattern to `\S*@\S*` changes no output, because it cannot cross whitespace and
  a word a rule strips is its own token.

- **That email mask shipped with a quadratic quantifier, and CI caught what this
  machine did not.** The local part accepts `.`, so on a long dotted run with no
  `@` an unbounded `+` matched the whole run from every starting position and
  then failed: **897ms on 40,008 characters**. `security.test.js` has a
  5,000-second-cliff detector over the whole of `optimize`, and one pattern
  eating 18% of that budget passed here and failed on a runner about six times
  slower. Bounded to RFC 5321's limits — 64 octets for a local part, 63 for a
  label — the same input takes **8ms** and no address is lost.

  **A cliff detector that only fires on slow hardware is one a fast development
  box walks past**, so there is a second guard on `segment` alone, where the
  cliff is sharper: every mask over every adversarial input completes in 9ms or
  less, and the budget is 300ms — thirty-three times the worst observed, and
  three times *under* the fault it exists to catch. Restoring the unbounded
  quantifier fails it on this machine, which is the whole point.

  Two fixtures were added for the shape the old list was missing: a mask that
  keys on a delimiter needs a long run of the characters *before* it, so the
  pattern restarts and fails at every position. The previous fixtures were
  repeated whole tokens, which exercise the happy path rather than making a
  match fail as late as possible — the file's own note says so, about the last
  time this happened.

  A third guard caught the comment explaining all this: `trusted-hosts.test.js`
  scans source for hostnames and requires each to have been decided about, and
  it cannot tell an illustration in a comment from an endpoint. It was right to
  ask; the illustration is described in words now.

- **The schema reader named four formats in its own filter and could read one.**
  `findRestatedFormat` reports a prompt that shows its output schema in a fence
  and then walks the same fields again in prose. Its fence filter admitted
  `json`, `jsonc`, `json5`, `yaml` and `yml` — and the key extractor accepted
  only a *quoted* string followed by a colon, which is JSON and nothing else. A
  prompt writing its schema as YAML matched a language this module names, then
  produced zero keys and reported nothing, however thoroughly the prose restated
  it. Not a missing feature: a promise made in one expression and broken by the
  next.

  `ts` was not on the list at all, which is the same omission wearing a
  different label — `interface Ticket { … }` is how a TypeScript codebase asks
  for structured output. Five fence shapes read correctly now where one did.

  **The first implementation walked line by line and found nothing in three of
  them**, because `interface Ticket { category: string; urgency: number }` is
  one line and a line-oriented walk sees depth 0 where it starts. Single-line
  objects are the normal case in a `ts` fence and in pasted JSON5, not the
  exception. It reads characters now.

  Four clean prompts hold the other direction: a nested object's fields are not
  top-level keys, a `ts` function's parameters live in parentheses rather than
  braces, YAML children belong to their parent, and a fence with **no** language
  stays quoted-only — an unlabelled block is as likely to be a log as a schema.

  Five plants fire. One was silent and found a hole in the fixture rather than
  the code: the unlabelled-fence case had no braces, so it never reached the
  branch the exclusion protects, and removing the exclusion left it green. A
  braced version was added and it fires.

### Fixed

- **The example detector was blind to nine of fourteen labellings, and six
  analyses went blind with it.** `findExamples` splits a prompt into its
  few-shot examples, and its opener vocabulary was `example`, `input`, `user`,
  `usuario`, `q`. A support prompt labelled `Customer:` / `Agent:` — the
  commonest shape there is — split into nothing. So did `Human:`, which is
  Anthropic's own historical convention, and `Question:`, while `Q:` worked,
  which is the arbitrariness that gives the fault away. So did `Cliente:` and
  `Pregunta:`, in a product that ships a Spanish locale.

  Six analyses read that splitter. On a 338-token support prompt whose examples
  are **38% of it**, `profile` reported the examples as costing nothing, the
  redundant-example advisory never fired, and `trazum prune` — whose whole job
  is cutting few-shot examples — printed *"This prompt has fewer than two
  few-shot examples, so there is nothing to compare."* That is not a refusal
  naming what is missing. It is a confident false statement about a prompt with
  four examples in it.

  **The failure was silent by construction**, which is why it survived: an
  unrecognised label yields no blocks, no blocks yields no finding, and nothing
  distinguishes that from a prompt containing no examples. The whole suite was
  green with nine of fourteen labellings blind, and is green now — no test
  covered it, because a test written from the same list as the code would have
  agreed with it.

  The vocabulary is two named lists now, openers and answerers, and both the
  splitter and the field pattern are built from them — the pair had already
  drifted once, which is exactly how the field detector came to know `question`
  while the splitter did not. The guard is fourteen real labellings written as
  prompts rather than as a list of labels, so it fails if the vocabulary
  narrows again for any reason. Four plants fire: the old vocabulary restored,
  an answerer label promoted to a splitter (which halves every example), the
  field pattern unhooked from the lists, and a suffix loosened until the
  splitter invents examples in ordinary prose.

- **The tag Anthropic's own documentation tells people to use found nothing.**
  `<example>` is the convention in the provider's prompting guide, and this
  product's headline model is Claude. A code-review prompt wrapping three
  demonstrations in it split into zero examples, so the same six analyses went
  quiet that `Customer:` had silenced — on that prompt the examples are **68%
  of it**.

  Tried before the label tiers, because a delimiter admits no judgement: either
  the tag is there or it is not, where a label is a word that might be prose.
  Only `example` and `examples`, which are what the documentation names —
  `<sample>` and `<demonstration>` exist in the wild and are not added, because
  that list would be a guess about what people might write, and this splitter
  has been burnt once already by a vocabulary somebody thought was wide enough.
  A tag inside a fenced block is documentation about the tag rather than a use
  of it, so fences are removed before matching.

  Four plants fire. One was silent at first and the plant was the fault, not the
  guard: it added `dotAll` to a pattern containing no `.`, which changes
  nothing. The real violation — a greedy body, so the first tag swallows through
  to the last — fires on three tests.

- **`trazum prune` stated something false with confidence.** On a prompt it
  could not read it printed *"This prompt has fewer than two few-shot examples,
  so there is nothing to compare"* — a claim about the prompt, made by a tool
  that had only established something about itself. It now names what it looked
  for (a tag, or labelled turns) and says that examples laid out another way
  were not seen rather than not there. Both locales. That is the difference
  between a refusal and a wrong answer, and the doctrine asks for the first.

- **One shape is deliberately still unread, and it is written down.** Inline
  mappings — `1. "package never arrived" -> shipping` — are the remaining
  silent case on these probes and are not detected. The only thing separating a
  demonstration from an instruction there is judgement: `if the ticket is about
  delivery -> use the shipping category` has the identical shape and is a rule.
  Getting that wrong is not a wrong number, because `prune` removes what it
  finds, so a rule misread as an example becomes a proposal to delete an
  instruction. The tempting narrowing — require the left side to be quoted —
  was refused: both probes are quoted because the person writing the probes
  wrote them that way, and a threshold fitted to one's own fixture has been
  measured against nothing.

- **The contradiction detector missed eight of eleven ordinary phrasings, and
  no concept was missing.** Every one sat inside an axis it already claims to
  cover — it was the same instruction in different grammar. *"Respond in the
  same language the user writes in"* was invisible because the pattern accepted
  `used`, `wrote` and `speaks` but not the present tense, so a prompt pinning
  English and mirroring the user in the same breath reported no conflict at
  all. So did *"keep answers short"* against *"keep it short"*, *"answer in at
  most two sentences"*, *"provide a thorough explanation"* against *"be
  thorough"*, *"walk through your reasoning"*, *"show your chain of thought"*
  and *"without justification"*.

  **The first fix traded false negatives for false positives, and measuring
  caught it.** Widening the vocabularies made four of five clean prompts report
  a contradiction: a detailed *error message* read as a detailed answer, a word
  limit on a *form field* read as a limit on the reply, a *document* in the
  user's language read as an instruction to mirror it. The cause was dropping a
  constraint the module already had and documents — that the sentence must be
  about the response, which is what `RESPOND` exists for. Rebuilt so every new
  alternative carries its own anchor and no existing alternative is touched:
  eleven of eleven phrasings seen, five of five clean prompts left alone.

  The guard holds both directions, because a detector is only as good as its
  quieter half. Five plants fire. One was silent and found a hole in the
  fixture rather than in the code: the clean prompt it tested paired two
  sentences that both fail to match, so they masked each other and the case
  passed however the length cap behaved. One end of a pair has to be beyond
  doubt for the other end to be under test.

- **One filler family covered two constructions in English where Spanish
  covered five.** English had four entries in the note-and-mention family and
  two constructions — `it is important to note that` and `it is worth noting
  that`, each written twice for the contraction — while Spanish had five
  constructions in five entries. German carried `es sei darauf hingewiesen,
  dass`, literally *"it should be noted that"*, which English did not. Found by
  reading across the sections of one list rather than by taste.

  **A correction to the commit that made this change.** It claimed the English
  list was *the thinnest in the file*, and that is false: counted per language
  it is the longest, 12 entries against Spanish's 12 and Italian's 9. The gap
  was inside one family and the claim generalised it to the whole list without
  checking — a number that could not be justified, in a release note about a
  dictionary. Counting all six sections of all ten dictionaries took one script,
  and it says English is first or second in every one of them. The source
  comment and the guard now say what was actually measured.

  Measured on fifteen padded sentences an editor trims without touching a single
  instruction, the rules recovered **34 of 76 tokens**. The five phrasings
  another language's section already justified take it to 49. Nothing was added
  for the other five languages: a phrasing they lack is for whoever reads the
  language to judge, which is what `docs/language-maintainer.md` exists for, and
  guessing at French filler from an English ear is how a rule starts editing
  prompts it does not understand.

  **One of the fifteen caught the person doing the measuring, not the code.**
  The corpus was graded against an editor's rewrite, and that editor turned
  *"feel free to ask a clarifying question"* into *"ask a clarifying
  question"* — which is not a trim. It converts permission into an instruction.
  Three of the remaining misses are the same kind and stay missed on purpose:
  removing `try to` **strengthens** an instruction, and `make sure that you` is
  emphasis, which this repository already decided belongs at the aggressive
  level. `as mentioned above` and `keep in mind that` stay out for a different
  reason — no other language's section justifies them, and the rule for these
  additions is that one has to.

  The guard holds both halves. Five plants fire, three of them for phrasings
  wrongly *added*.

- **A measured negative result, recorded so nobody re-derives it.** The
  redundancy threshold is 0.7 word overlap, and the obvious next thought is to
  lower it and catch paraphrases. It was measured and it does not work: four
  support answers that any reader calls one example — *"Let me look that up for
  you. Could you share your order number?"* against *"Of course. What is your
  order number?"* and two more — overlap at 0.29–0.43, and comparing only the
  answers makes it **worse**, 0.21–0.39, because all they share is `your`,
  `order`, `number`. No threshold separates those from genuinely different
  examples. That judgement belongs to `trazum semantic`, which says what it
  costs and asks first, and to `prune`, which answers it by running the cases.
  The deterministic half reports what the examples cost, which is a fact.

- **The release document asked a question the release had already answered.**
  Since 1.85.0 it said which credential authenticated the npm upload was
  unsettled, because provenance is signed with the job's OIDC identity either
  way and proves nothing about the auth. The 1.86.0 run answers it: the
  `Can this workflow authenticate to npm?` step reported **all four packages
  rejected**, and all four published seconds later in the same job. The only
  other credential there is the granular token on the `release` environment, so
  that token is what authenticates every upload — it is the thing holding
  releases up, not a fallback in waiting, and deleting it stops them.

  That also settles what 1.85.0 could only narrow. `@trazum/tokenizer-openai`
  published although the token was made when three packages existed, and the two
  explanations were OIDC or a wider scope. OIDC is now ruled out for that
  package by name, so the scope is wider than three. The rule about regenerating
  the token when a package is added stays, because a scope nobody has inspected
  is not one anybody can rely on.

  The workflow said the same thing in the older, weaker form — *"when npm keeps
  refusing"*, as a conditional about a fallback. Two comments now state what is
  actually true of every publish this repository makes.

- **The README told people to pin an Action two releases old.** `security.test.js`
  derives how many versions a recommended pin is behind from `git tag`, and
  allows exactly one — the pin can only advance to a release commit once that
  commit exists, which is after the merge rather than in it. 1.85.0 shipped and
  left the pin at 1.83.0, which the rule tolerated; 1.86.0 made it two and the
  guard fired.

  **It fired on CI and not here, and the reason is the same class of fault this
  release spent a commit on.** The container running the tests had fetched tags
  before `v1.86.0` existed, so `git tag` listed one release since the pin and
  the guard passed. A test whose verdict depends on how recently the machine
  fetched is environment-dependent in the way `SPAWN_ENV` was written to stop —
  though here the machine is *behind* the truth rather than differently
  configured, and the fix is fetching, not neutralising. Reproduced locally by
  fetching the tag, then fixed.

  The pin is the 1.86.0 release commit now. Planted a wrong label against the
  right commit to check the fix advanced the pin rather than blinding the guard:
  it still fails with `comment says 1.85.0, 2c5e907 says 1.86.0`.

## 1.86.0 — 2026-08-29

### Added

- **`trazum-vscode`, the editor extension.** Live token cost while writing a
  prompt: the count, the budget that covers the file and the pattern it came
  from, and what the deterministic rules would recover, in the status bar and
  its hover. The plan called this unblocked since 0.10.0 and unscheduled ever
  since, because an extension is a distribution commitment rather than a
  feature. This arc takes the commitment.

  **It sends the buffer nowhere, in any form, ever.** `@trazum/core` runs in the
  editor's own process against text already on the machine, and the promise is a
  test rather than a paragraph: every source file in the package is scanned for
  a way out, the permitted set is empty, and importing either core module that
  exists to make calls fails the build.

  **Every judgement lives in `reading.ts`, which has never heard of an editor.**
  A VS Code extension is normally tested by downloading VS Code and driving it —
  a network dependency, a version to track, and a suite that cannot run without
  a display. Here the extension is a wire: it hands a string and a config to a
  pure function and renders what comes back, and a guard asserts it performs no
  arithmetic and formats no figure of its own.

  **It depends on `@types/vscode` for nothing.** The editor supplies the
  `vscode` module at runtime and never installs it, so the contract this
  extension relies on is written out in `src/vscode.d.ts`, exactly as wide as
  what it touches. 1.85.0 already paid for the alternative: an install-only
  dependency that turned an optional package into one the repository could not
  compile without.

  **`null` is not zero, in the one place a reader would be misled.** The rules
  run when the typing stops, not on the keystroke, so a fresh reading has not
  measured them. It says so rather than showing `0`, which would tell somebody
  their prompt is already tight when nobody has checked.

  **The first version of this workspace could not be packaged at all**, and
  nothing caught it because nothing had tried to ship it. It was named
  `@trazum/vscode` — a fine npm workspace name and an impossible extension name,
  since a marketplace identifier is `publisher.name` and a slash cannot appear
  in one. It is `trazum-vscode` now, and the rules a packager enforces are
  checked by a test rather than by installing the packager: `@vscode/vsce` is
  fetched by `npx` for the one run that writes a `.vsix`.

  The icon is generated by `npm run draw:icon` and asserted byte-identical to a
  fresh run, the same claim the architecture picture carries. It draws the
  proportion bar this product prints on every surface, in the palette the rest
  of it uses, and the PNG is written by hand — a zlib stream and four chunks —
  rather than by taking an image dependency.

  **`npm run package:vscode` was run rather than described.** It produces
  `trazum-vscode-1.86.0.vsix`: 8 files, 8.39 kB — the two built modules, the
  icon, the licence, the README and the two manifests `vsce` writes. No sources,
  no tests, no source maps, which is `.vscodeignore` doing its job and is now
  the thing that observation confirmed rather than the thing a config file
  claims.

  That run also found what it leaves behind. The guard against runtime state in
  this repository checks the *tracked* tree, deliberately, because an untracked
  file is a local mess rather than everybody's — but `git add -A` before a
  commit sweeps up whatever the last command produced, which is exactly how
  sixty waiver records reached `main` and sat there for two releases. `*.vsix`
  is ignored, and a test asserts it, so running the documented command cannot
  cost somebody that.

### Fixed

- **The release document told the owner to configure three package pages out of
  four.** The trusted-publisher instruction listed `@trazum/core`, `@trazum/cli`
  and `@trazum/mcp` — a list typed when there were three packages and left alone
  when `@trazum/tokenizer-openai` made it four. Somebody following it exactly
  would have configured three, and the release publishes the new package last,
  so the page that fails is the one the instruction never named.

  A derived guard holds it now: every package the workspace globs say this
  repository publishes must be named in the paragraph that hands over the
  settings table. The first version of that guard read the whole section and a
  plant walked past it, because the paragraph above the instruction names the
  newest package for a different reason.

- **Two claims in that document that the 1.85.0 release disproved.** It carried
  the heading *"still not working"* and the standing instruction *"assume tags
  will not publish and release by hand"*. The 1.85.0 merge published all four
  packages through the workflow, with provenance, and created the tag and the
  release with no human step. What the run does **not** settle is which
  credential authenticated the upload, because provenance is signed with the
  job's OIDC identity either way — so the document now says that too, and names
  the step that answers it rather than guessing.

- **A token scope that goes stale the moment a package is added.** The fallback
  token is granular and scoped to named packages, so a package added later is
  not in it, and the failure is the same `E404` as a missing trusted publisher.
  Written down beside the instruction that creates the token.

- **The extension's wire shipped with no behavioural test at all.** The guard on
  it asserted textually that it computes nothing and writes no status text of
  its own — an assertion about what it does *not* do. Nothing checked that it
  does the right thing, and a wire has plenty of room to be wrong: the
  workspace-relative path it builds for budget matching, the four separate
  branches that hide the item, the debounce that keeps `optimize` off the
  keystroke path, and the listener that must ignore a document which is not on
  screen.

  `shim.test.js` runs `activate()` against a fake editor, resolved through a
  loader the way `apps/web` resolves `next/server`. Everything under the fake is
  real: the core, the reading module, and a config parsed off a real file on
  disk. Eight violations were planted and every one fired on the test that
  claims it. The workspace-relative path is proved through the budget rather
  than by watching the call — the config scopes `prompts/*.txt`, which can match
  the relative path and cannot match the absolute one, so a shim that passed the
  wrong one shows a bare count and the budget silently stops applying in the
  editor while `trazum check` still enforces it.

  That guard's own first version was bound to its neighbour: it matched the
  first binding called `path`, which is the config path inside `projectConfig`,
  and reported the shim as broken. Rebound to the binding that is handed to
  `read`.

- **The fake editor was the only editor this repository will ever run against,
  and nothing held it to the contract.** `src/vscode.d.ts` is hand-written, the
  fake is plain JavaScript reached through a loader, and `tsc` never sees the
  two together — so a fake that lost a member, took fewer arguments than the
  editor passes, or grew one VS Code does not have would leave the whole shim
  suite green about an editor nobody ships. `contract.test.js` holds it, and
  holds the declaration to being no wider than what the shim touches, which is
  the install-only dependency growing back one member at a time.

  Its arity check was too loose at first and a plant proved it: a fake that
  dropped the optional priority argument passed, and only failed by accident. It
  requires the declared count exactly now, because a fake cannot observe an
  argument it does not take.

- **Four comments named a guard that does not exist.** Two source files pointed
  at `shim.test.js` and one at `contract.test.js` — files promised in a shipped
  release and never written. `memory.ts` pointed at a postgres suite under a
  name it does not have, a rename that took the file and left the sentence. And
  `draw-icon.mjs` pointed at an icon suite that has never existed under any
  name.

  A reference to a guard that is not there is worse than no reference: it
  reports a check where there is none, and the reader stops looking.
  `named-guards.test.js` scans every source file and document in the repository
  and fails on a name that is not a file.

- **The icon's palette said it came from the product and one third of it did
  not.** `draw-icon.mjs` claims the colours are *"the product's own, taken from
  `docs/assets/demo.svg`"*, and the guard that was supposed to hold that claim
  held a hardcoded copy of one colour instead — two copies of the same number,
  agreeing with each other and with nothing. Bound to the demo, the ground and
  the accent were there and the unspent-cell colour was in no other surface of
  this product. It is `#363329` now, the rule colour the demo already draws on
  the same ground, and the icon is regenerated.

## 1.85.0 — 2026-08-29

### Added

- **`@trazum/tokenizer-openai`**, the optional exact counter the 1.83–2.0 plan's
  third chapter asked for. OpenAI's own byte-pair ranks, wrapped so that
  `optimize`, `check` and the report can count a GPT prompt exactly instead of
  estimating it. `@trazum/core` imports nothing from it; the counter arrives
  through the `TokenCounter` seam that has been there since the beginning, so a
  reader who does not install it sees no change of any kind.

  It reproduces the committed 47-sample OpenAI fixture **47 out of 47, to the
  token**, which is what turns the figure below into a measurement rather than
  an assertion: a paid API call and an offline rank table agreeing exactly on
  every sample.

  It refuses a model it has no encoding for — `gpt-5-codex`, and anything
  shipped since the rank tables were written — rather than reaching for the
  newest table. A guessed count labelled *exact* is worse than no count, and
  *exact* is the strongest word this tool uses about a number. It also refuses
  to say whose a model is: a Claude id comes back `unknown-encoding` and not
  *wrong family*, because the catalogue already owns that question and a rank
  table would be a second source of truth about it.

### Fixed

- **A test that read the locale of the machine running it.** `own-gate.test.js`
  spawned the gate with no environment and asserted on `over the limit`, so it
  passed on a runner with `LANG` unset and failed on a Spanish laptop, where the
  gate correctly answers `un crecimiento de 151 tokens supera el límite de 25`.

  The guard that exists to prevent this — added when seven tests in
  `i18n.test.js` had the same fault — read one directory and matched only an
  environment built inline, so a spawn with no environment at all, two packages
  away, was invisible to it. It now reads every tracked suite and holds every run
  of something this repository built to passing an environment it controls,
  following the entry point through the bindings that carry it, because this
  failure put the path into a shell script first. Two more hand-rolled copies of
  the shared environment were found by the widened check, in `apps/web` and in
  `publish.test.js`, and both now use it.

  `env.mjs` reads the detector's variable list out of `src/i18n/index.ts` instead
  of importing the compiled module, so suites in other workspaces can use it
  without the CLI having been built; a guard asserts the parse equals what the
  detector exports. The suite now passes identically under `LANG=es_ES.UTF-8`.

- **Three more tests that read the machine instead of the code.** Found by
  running the suite on a contributor's Mac: 31 failures in `@trazum/cli`, none of
  them a defect in the product.

  **`FORCE_COLOR`, exported by that shell, was 29 of them.** `SPAWN_ENV` set
  `NO_COLOR` and inherited `FORCE_COLOR`, which outranks it in `style.ts` and in
  Node, so every spawn came back painted: assertions failed on ANSI codes between
  the words they matched, and `JSON.parse` failed on Node's own warning that the
  two variables disagreed. The colour variables are now read out of `style.ts`,
  the way the locale variables are read out of the detector, and **removed**
  rather than blanked — an empty `FORCE_COLOR` still turns colour on.

  **A `PATH` narrowed to the directory holding `git`.** The pre-commit hook pipes
  through `awk`, and where `git` comes from Homebrew that directory has neither
  `awk` nor anything else. The test now subtracts the directories that hold a
  `trazum` instead of naming the tools the hook needs, which is the version with
  nothing to keep up to date.

  **An assertion that straddled a line wrap.** `mkdtemp` gives
  `/var/folders/k5/…/T/…` on a Mac and `/tmp/…` on a runner, and the paths sit in
  the same paragraph as the sentence being matched, so the renderer wrapped it in
  one place and not the other. Matched against collapsed whitespace now: the claim
  is about which words sit together, never about the column they sit in.

  Six plants fire. The whole suite passes identically with the environment clean
  and with `FORCE_COLOR=1`, `LANG=es_ES.UTF-8` and a Mac-length `TMPDIR`.

- **A measurement this repository had already paid for, reported as missing.**
  `token-ground-truth.openai.json` has held 47 samples measured against `gpt-5`
  through OpenAI's own API since 2026-08-28. `MEASURED_FOREIGN_ERROR_PCT` had no
  entry for `openai`, `measuredForeignError('openai')` answered `null`, and a
  test *pinned* that null — so every report touching a GPT model told its reader
  nobody had measured the estimator against their tokenizer.

  The answer was **112.4%**, the worst of the four measured families, on German
  prose. `o200k_base` packs Latin text far more densely than the estimator's
  Claude-calibrated divisors expect.

  The guard that existed covers the other direction: a *claim with no fixture
  behind it*. This was a **fixture with no claim in front of it**, which is the
  same fault with the sign reversed — one overclaims, the other throws away a
  measurement and leaves a true-sounding sentence where the number belongs. The
  new guard fails the build for any family whose fixture exists and whose figure
  is missing, excluding the one whose fixture governs the published band, since
  a second copy of that number is the two-sources-of-truth problem the file
  exists to prevent.

  Four plants: the core given a dependency exception, a second dependency
  slipped into the excepted package, the `openai` entry deleted again, and the
  figure edited to a flattering 12.4%.

### Added

- **A guard for commands documented nowhere.** `contributing.test.js` held a
  script's *comment* to the workspaces it drives, and nothing noticed a script
  documented in neither `README.md` nor `CONTRIBUTING.md`. `test:action` had
  been in that state for a while, and `draw:architecture` arrived in the README
  without reaching the file a contributor actually opens.

  It matters most for the scripts that write files: somebody who adds a package
  without knowing `draw:architecture` exists gets a failing test about a
  picture, which is a confusing place to start. Both are documented now, and a
  third that is not fails the build.

- **An architecture picture on the front page, generated from the code rather
  than drawn.** `npm run draw:architecture` writes `docs/assets/boundary.svg`
  from the workspace globs and the network allowlist, and
  `architecture-image.test.js` fails the build if a published package exists the
  picture does not show, if the core takes a dependency while the picture says
  it has none, or if a third module is allowed to reach a network without the
  picture saying so.

  The reason it is generated is the reason every architecture diagram in every
  repository eventually lies: the code moves, the picture does not, and because
  **a picture cannot be grepped** nobody notices for a year — so the most
  confident-looking artefact on the front page becomes the least true.

  `mingrammer/diagrams` was tried first and ruled out on three counts, written
  into the generator so the afternoon is not spent twice. Its nodes are
  fixed-colour images with labels outside the shape, so they cannot carry this
  product's palette and break under anything longer than a word — the first
  render came out 1273×2650 with labels overflowing their clusters. It ships no
  icon for OpenAI, Anthropic, OpenTelemetry, LiteLLM, Helicone or LangSmith,
  which are the products this tool integrates with, so the one diagram that
  would play to its strengths cannot be drawn with it either. And it is built to
  show what connects to what, while the claim worth drawing here is **what does
  not cross a line** — an absence, which a graph of edges is the wrong shape for.

  Node rather than Python: Graphviz and a Python toolchain would be a new
  prerequisite for contributing to a repository whose argument is that it has no
  dependencies.

  Four plants fire: a published package vanishing from the picture, a third
  module added to the network allowlist, the picture citing a guard that does
  not exist, and the zero-dependency claim removed while the core still has none.

### Fixed

- **`x-powered-by: Next.js` on every response**, found by observing a deployed
  preview while checking that HSTS had actually arrived — not by reading the
  config, which is the gap the header tests already admit to: declared is one
  step short of sent, and it runs in both directions, since something undeclared
  can be sent too.

  Not a vulnerability, and removing it is not a defence — fingerprinting a Next
  app takes one look at the markup. It is free reconnaissance with no reason to
  stay. `poweredByHeader: false`.

- **No HSTS, so a returning visitor's first request could still be plain HTTP.**
  The redirect to HTTPS arrives too late: the request is already on the wire and
  a network in between can answer it. `Strict-Transport-Security` is now on
  every response with `max-age=31536000` and `includeSubDomains`, the second
  because without it a subdomain is a way back in — an attacker who can answer
  for `anything.<host>` over HTTP can set a cookie the parent will send.

  **`preload` is deliberately absent.** It is not a flag with an effect, it is
  consent to be compiled into browsers, and removal takes months and reaches
  users only as they update. That belongs to whoever owns the domain, decided
  once and knowingly, and it needs a submission nobody has made — so adding it
  here would be a claim as well as a decision.

  Sent in production only. `next dev` serves plain HTTP, and a browser that
  accepts the header for a development hostname pins it, breaking every other
  project served over HTTP on that name for a year on that machine. Chrome
  special-cases `localhost`; a LAN address or a `.local` name is not.

  What could not be checked from where this was written, and is therefore not
  claimed either way: whether the host it currently deploys to is already
  covered by somebody else's preload entry. The registry that answers it is
  unreachable from this environment. The header is right regardless — it costs
  nothing if the host is already pinned, and it is the whole defence on a custom
  domain.

  Four plants: `preload` slipped into the value, the max-age dropped to a day,
  `includeSubDomains` removed, and the header sent in development.

- **An optional package that was required to compile.** The CLI typed its
  loader as `typeof import('@trazum/tokenizer-openai')`, which `tsc` resolves
  while type-checking — so `@trazum/cli` could not be built unless the optional
  package had been built first, and a clean checkout failed with `TS2307`. CI
  caught it. The CLI now declares the small contract it relies on and assembles
  the specifier from fragments, with a test asserting the real package still
  satisfies that contract.

  The first guard listed the forms to forbid and a plant walked past it: a plain
  `await import('...')` with a literal specifier passes a check for static
  imports and `typeof import(...)`, and still fails the build. The rule is now
  the one with no forms to enumerate — the specifier never appears as a literal
  in the CLI's code — and all three forms fail it.

- **A dependency that reads as obfuscated, fixed by shape rather than by
  dismissal.** Socket flagged `js-tiktoken` as 90% likely obfuscated. The
  reading was fair: its main entry inlines every byte-pair table into one 5.6 MB
  file with a single line 2.3 million characters long. That is a vocabulary and
  not hidden code, but nothing about the file says so.

  The import moved to `js-tiktoken/lite`, which separates the logic from the
  tables — the code loaded now has a longest line of 160 characters — and
  `security.test.js` asserts that property directly, so the answer is a check
  this repository owns rather than a judgement about somebody's heuristic. It
  also parses one rank table instead of six, which made the counter
  asynchronous while the counting function it returns stays synchronous.

- **A derivation that skipped any workspace with a hyphen in its name.**
  `contributing.test.js` matched `-w @trazum/[a-z]+`, so `@trazum/tokenizer-openai`
  was invisible to it: a script could have driven a workspace its own documented
  comment never mentioned, which is precisely the drift that file exists to
  catch, arriving through its derivation rather than its prose.

### Changed

- **The no-runtime-dependencies rule is spent once, and narrowed rather than
  softened.** Every package here has had zero dependencies because a dependency
  is code that runs over the user's prompt text with no review from this
  project. `@trazum/tokenizer-openai` has one, and the allowance is a single
  named package with a single named dependency, written in one file that both
  `security.test.js` and `publish.test.js` read — a whitelist kept in two places
  is a whitelist with a hole in it. `@trazum/core` is asserted separately never
  to appear in it.

  `js-tiktoken` is held to the property the rule is really about: MIT, no
  network, no filesystem, no subprocess, no `eval`, checked from the installed
  source on every run rather than reviewed once and trusted through the next
  version bump.

  The exception exists for the CI case the product is built around: the rank
  tables are twenty-two megabytes, and a gate that pulls that into every build
  is a gate teams turn off.

- **1.84.0 did not ship.** Three of the four families still need a key for their
  own counting endpoint, and the plan wrote down in advance that the arc would
  continue at 1.85.0 rather than publish a number derived from the wrong
  tokenizer. The gap stays numbered; renumbering it away would rewrite a
  document whose whole value is having been written before the code. The
  remaining three are Google, xAI and Moonshot — OpenAI leaves that list not
  because a key arrived but because its measurement was already here.

### Fixed

- **The README recommended a two-release-old Action.** Its three copy-pasteable
  examples pinned `Davmunrey/Trazum` at 1.81.0. `security.test.js` allows the
  pin to lag by exactly one release, because the pin can only advance to a
  release commit once that commit exists — which is after the merge rather than
  in it — so cutting 1.83.0 took the lag from one to two and the guard fired on
  the next pull request.

  That is the designed behaviour rather than a hole: a release cannot carry its
  own pin, and the check derives the count from `git tag` instead of trusting
  anybody to have remembered. Advanced to 1.83.0's commit. Reproduced with the
  old pin before the fix and green after, since a guard that has never been
  seen to fail is a guard nobody has tested.

- **A release could report success for a package npm was not serving.** 1.83.0's
  job published all three: `+ @trazum/cli@1.83.0` on screen, provenance signed,
  transparency log written. Twenty minutes later `@trazum/core` and
  `@trazum/mcp` were installable at 1.83.0 and `@trazum/cli` was still 1.82.0 on
  every endpoint the registry has, while `RELEASES.md` said all three were
  there.

  It resolved on its own — the CLI's tarball is 862 kB against the MCP server's
  65 kB, and npm's processing queue is the whole difference — but **nothing was
  looking**, and the same silence covers a publish that never lands. The only
  wait in the workflow was for `@trazum/mcp`, and only because the MCP registry
  refuses a listing whose package it cannot fetch; core and the CLI had no such
  downstream.

  `scripts/npm-serves.mjs` asks the registry's dist-tags endpoint for every
  publishable package until each serves the version being released, and fails
  the job if one never does. The packages are derived from the root
  `workspaces` globs rather than listed, because a fourth package added later
  and not added to a hand-kept list is a package the check is blind to, which is
  the shape of the defect it exists to catch.

  **The first version of the script had no main check**, so the test file
  importing it ran the whole wait and made three HTTPS calls — this repository's
  offline promise broken in the place least likely to be looked at. The suite
  gave it away by finishing in under a second with the script's own output among
  the results. **And one of that file's tests was written as
  `() => async function () {…}`**, which returns a function nobody calls: it
  passed, asserted nothing, and would have gone on passing through any defect in
  the thing it named. Both are fixed and both are guarded.

## 1.83.0 — "A receipt, and the surfaces that could not disagree"

### Changed

- **A receipt's rates did not reconstruct its money, and now the money is on
  the document.** `receiptFrom` published the catalogue's `inputPerMTok` and
  `outputPerMTok` beside a total `profileUsage` had computed, and those are not
  always the same rates. A model inside a promotional window is billed at the
  promotion. One whose long-context tier applied is billed at the tier. And a
  cached read is billed at a fraction of input that **no published field named
  at all** — the catalogue holds it as a multiplier, which never reached the
  receipt.

  So the obvious check a stranger would run — tokens times the stated rate —
  disagreed with the stated total, with nothing on the document saying which of
  the two to believe. In a file whose entire purpose is that a figure still
  answers when it is read somewhere else, that is the defect rather than a
  rounding difference.

  A line now carries `money`: input, cache reads, cache writes and output, as
  they were actually apportioned, with `usd` their sum. The rates stay as
  provenance and are labelled as the catalogue's published figures rather than
  as the arithmetic. Dividing a bucket by its own token count recovers the rate
  that was really charged, **including the cached-read rate**, which is the one
  figure a consumer most wants and the one nothing carried.

  Two more fields come with it, for the same reason `UsageBreakdown` keeps them:
  `cacheWrite5mTokens` and `cacheWrite1hTokens`, because the ratio between the
  TTLs is not a constant across providers and a write total that has lost the
  split can be repriced only by guessing. And a new gap, `assumed-write-ttl`,
  because a log that records a write without stating its TTL gets the cheaper
  rate — the right assumption and the flattering one, which makes the total a
  floor on those calls rather than a measurement.

  `receipt-arithmetic.test.js` holds all of it: the buckets add to the line and
  the lines to the document, no bucket holds money for tokens that are not
  there, the charged rate is recoverable, and a cached read costs less than
  fresh input. Five plants fire — a bucket dropped, every bucket's money moved
  into `inputUsd` (which still balances, and is what the second check exists
  for), the money recomputed from the published rates, the TTL split broken and
  the assumed-TTL gap left unsaid.

  **One plant did not fire on its first run and the plant was right; the
  fixture was wrong.** Zeroing `cacheWrite1hTokens` changed nothing, because
  every write in the fixture came from an unstated TTL and had landed in the
  5-minute bucket. A second log line with a stated split was added, along with
  an assertion that some line carries a 1-hour write at all — a guard that
  cannot notice a field being dropped is not guarding it.

  The receipt has never been published to npm, so no consumer can be holding
  the older shape and `schemaVersion` stays at 1. Said here rather than assumed,
  because the same change after 1.83.0 ships would have needed a 2.

- **The claim that the four surfaces cannot disagree is now checked.** *"One
  core does the measuring; four surfaces carry it. They cannot disagree,
  because they are the same functions"* is on the landing in five languages,
  and it is the reason a reader is expected to believe the figure in their
  terminal, the one their agent quotes and the one on the page are the same
  figure. Nothing checked it.

  "The same functions" is an argument, not a proof: two surfaces can call one
  core and still disagree if either rounds, filters, defaults or windows
  differently on the way in or out, and each of the four does its own argument
  handling, formatting and locale.

  `surface-parity.test.mjs` sends one log and one prompt through all four and
  compares **what a reader is shown**: the money and the call count from the
  core, the CLI's `--json`, the MCP server and the browser's own run. The MCP
  server is spoken to over stdio with real JSON-RPC framing rather than called
  as a function, which is the standard `packages/mcp/test/server.test.js`
  already sets — a tool registered under a name no client can reach is a tool
  that does not exist.

  It lives in the web package because that is the only one that can reach all
  four, and it reads the claim off the landing rather than quoting it, so if
  the sentence ever goes the guard for it is reconsidered rather than left
  running against a promise nobody makes.

  Proven by planting a disagreement in each surface in turn: the MCP rounding
  differently, the browser counting one call more, and the CLI repacking a
  token count on its way out.

- **`security.test.js`'s subprocess rule was scoped by directory layout rather
  than by intent.** It forbids `node:child_process` outside `git.ts` across
  `packages/core/src`, `packages/cli/src` and `apps/web` — two package *source*
  roots, and the web app whole, because the web app has no `src`. So
  `packages/cli/test` has spawned the CLI in dozens of files since the guard
  was written and was never an offender, while the first test under `apps/web`
  to speak to a subprocess was. Test directories are excluded by name now, with
  the reason on the record; a `child_process` import in shipped web source is
  still caught, which is planted and proven.

### Changed

- **The offline promise is now proven for every command, not three.** *"Your
  prompts never leave your machine"* is the sentence the README opens with and
  the reason a reader who cannot use a hosted tool is reading at all. It was
  proven for `optimize`, `check` and `rules`: the right three to pick first, and
  seven percent of the product.

  `offline.test.js` now builds a workspace with a real log, a real prompt, a
  plan and four months of reports, and runs **all forty** commands that do work
  against it with `fetch` removed. `--help` would prove nothing, so each command
  gets the arguments that make it read something.

  **Twice each, and compared.** Checking only for the stub's marker would pass a
  command that failed before it reached anything — an early error touches no
  network either, and forty commands quietly erroring would look exactly like
  forty commands working. Every command is run with the network and without,
  and the two have to answer the same bytes.

  The invocation table is required to be complete: a command with no entry and
  no documented reason fails the first check, so a forty-sixth cannot be added
  without proving it offline. Five are excused by name — `connect` and `gateway`
  are declared outbound surfaces that `outbound-surfaces.test.js` already holds
  the list of, and `serve`, `write` and `bench` never return on their own.

  It runs in eight seconds. The first version took 108, because it rebuilt the
  workspace for each of eighty runs and building it runs the product six times;
  the workspace is built once and copied now.

### Fixed

- **A spend gate passed on a log nobody could read.** `trazum profile
  broken.jsonl --max-usd 50` exited **0**. So did an empty log, and so did one
  whose every model is unpriced, on the human path and under `--json`. The
  doctrine has a rule for exactly this, learned twice: *a period, or a service,
  nobody measured is not one under budget. Name the gap; never report the
  absence as a pass.*

  The product had already applied that rule **once**. A `--since` matching no
  record throws, and the comment above it says why in the same words: under
  `--max-usd` it would pass a budget gate over a period the log does not cover.
  Three other ways of measuring nothing reached the same gate and were never
  given the same answer.

  All four now exit 1 and name which gap they found. `--allow-empty` is how a
  nightly job says a period with no calls is the expected answer, because that
  is a real thing to want and it should be said rather than inferred from
  silence. `gate-nothing-measured.test.js` holds the whole matrix — three
  emptinesses × four gate flags × two output paths — and is proven from both
  sides: 25 of its checks fail when the refusal is removed, and one fails when
  it fires without a gate armed.

- **Seven commands answered a mistyped path with a syscall.** `optimize`,
  `check`, `profile`, `position`, `diff`, `semantic` and `conform` printed
  `ENOENT: no such file or directory, open '/nope/x.txt'`, while the five
  converters answered `/nope/x.json: not found`. The CLI disagreed with itself
  about how to refuse, and the majority spelling named a syscall — against the
  doctrine's *a refusal never arrives bare*, a rule three other tests already
  cite.

  Translated at the top-level handler rather than at each of the seven, because
  the seven is the part that changes: a command added next year reads a path
  too. `EISDIR` and `EACCES` are covered with it, including the pathless
  `EISDIR` Node raises from `read` rather than `open`.

  `bare-refusals.test.js` runs **every** command out of `COMMAND_FLAGS` against
  a missing path and a directory, so a command added later is covered by
  existing rather than by anyone remembering. Three that neither read a path
  nor terminate on their own — `serve`, `write`, `bench` — are named with their
  reason, and the guard fails if the coverage drops below forty commands. It
  runs eight at a time: in series it took 100 seconds, which is a guard that
  gets deleted rather than kept.

### Changed

- **The `profile` report was 1,200 lines of sequential printing inside one
  function.** The four alternative outputs left it in 1.82.x; what remained was
  the report itself, and it was one concern printed straight down with every
  local it had ever needed still in scope.

  It is twelve section printers now, one per heading a reader sees: the cache
  verdict, the labels and budgets, the levers, `--what-if`, conversation
  history, output shape, input shape, context pressure, mix drift, repeated
  calls, the comparison against a previous log, and outcomes with coverage.
  `commandProfile` is **570 lines**, from 2,359 before the arc began.

  Most of them need two things. `reportCacheVerdict` is 134 lines and takes the
  report and the messages; `reportMixDrift` takes the same two. The one with a
  real parameter list is `reportAgainstPrevious`, which needs eight — two of
  them drivers computed three hundred lines earlier and used nowhere else,
  which was a thing you could only learn by reading both places.

  Verified byte for byte at every step, the same way the first half was: one
  fixed log, fifteen flag combinations, both locales, every byte of stdout and
  stderr compared against a baseline captured before the first extraction.

### Changed

- **`commandProfile` was a single 2,359-line function.** The largest thing in
  this repository by a factor of five, and four complete outputs shared its
  scope with the report they are alternatives to: `--by-source`, `--dry-run`,
  the money gates and the side-file writer could each only be understood by
  reading the body they sat in.

  They are four named functions now, and naming them is most of the point:
  `--dry-run` needs three of the thirty-one values that were in scope around
  it, and `--by-source` needs seven. `commandProfile` is 1,673 lines.

  **The gates stopped writing to their enclosing scope.** `gateFailed` and
  `gateVerdicts` were declared three hundred lines above where the gates set
  them and read three hundred lines below, an output channel nothing declared.
  `runProfileGates` returns them. `failed` is still read off `process.exitCode`
  exactly as it was, because the gates set the exit code and the function
  reports what they set.

  One reach forward was removed rather than reproduced: the gate block's
  failure explanation used `levers`, declared several hundred lines later in
  the same function, which was legal only because the closure that read it ran
  after. `billLevers` is pure, so the extracted function asks for it.

  Verified byte-for-byte: `trazum profile` was run over one fixed log across
  fifteen flag combinations in both locales, thirty captures of every byte on
  stdout and stderr, before and after each extraction. Identical every time,
  and the 1,167 CLI tests unchanged.

### Added

- **`trazum from-langsmith` reads a LangSmith run export as a usage log.** The
  fifth converter, and the only one where the unit is wrong before anything
  else can be right: LangSmith records a **run**, and a trace is a tree of
  them. The chain that wrapped a model call carries the same tokens as the
  call, and the agent above it carries them again, so summing an export bills
  the same tokens once per level.

  **Only `run_type: "llm"` is a call**, and every run that is not one is
  counted out loud. Most of a LangSmith export is chains, tools and retrievers;
  a converter that turned a thousand runs into three hundred records without
  saying why would look exactly like one that failed to read the file.

  **The model is refused rather than inferred.** There is no model column — the
  name lives in `extra.metadata.ls_model_name` or in the invocation parameters
  beside it — and the obvious substitute is right there and wrong: LangChain
  sets a run's `name` to the client class, so pricing a call by `ChatAnthropic`
  would attribute a figure to something that is not a model. Those runs are
  counted in `unnamedModel` and dropped. A test plants exactly that run and
  asserts the class never reaches a record.

  **The trace is the conversation.** `trace_id` spans the calls one request
  made, which is the identity Trazum's conversation findings need; `id` is a
  single call. This is the one converter of the five that can answer those
  questions rather than declining them.

  **What does not cross:** `inputs` and `outputs` are the prompt and the
  completion on every run, and neither is read. `extra.metadata` is a free-form
  bag the operator fills, so it is read for named keys and never copied — the
  next thing somebody puts in there is not a leak by default. One marker is
  planted in each and the whole conversion is grepped for it.

  **What it refuses to invent:** `total_cost` and `prompt_cost_details` are
  LangSmith's arithmetic over LangSmith's price table. They never enter a
  record and the figure is printed beside Trazum's rather than inside it.
  `prompt_cost_details` looks like a cache split and is dollars rather than
  tokens, so the cache verdicts read `cannot-tell`.

  `looksLikeLangsmith` is planted against a Helicone export, a LiteLLM spend
  log and an OpenAI usage response: all three carry `prompt_tokens`, and a
  detector loose enough to claim any of them would take somebody's export away
  from the converter that understands it.

  Forty-five commands.

### Fixed

- **Two shipped defects the suite had no shape for.** It verifies prose and
  arithmetic exhaustively and verified nothing about what a reader could see or
  press, so both of these passed CI and were visible on first paint. The
  landing rendered five of its six sections at zero opacity for two days — a
  `Reveal` wrapper whose observer never fired below the fold — and the Write
  panel opened with two buttons both reading "Skip this" for four days, because
  a ternary label's falsy branch was its neighbour's label and the falsy branch
  is the state the panel opens in.

  Neither needed a browser to catch. `apps/web/test/reachable.test.mjs` refuses
  content hidden behind client state that starts falsy, a reveal on a timeline
  that may not advance (the *second* attempt at fixing the blank landing, also
  blank), and two buttons in one component that can carry one label at once. It
  claims a collision between two conditional labels only when the conditions
  are written identically, because proving mutual exclusion means evaluating
  them.

- **Every page counted the commands by hand, and three of them were wrong.**
  `README.md`, `docs/licensing.md` and `plugin/README.md` all said **42
  commands** against a CLI dispatching 45; the README disagreed with itself,
  saying 42 in its architecture diagram and forty-five in the table of contents
  four lines below. The landing said **39**, in five languages, and spelled its
  contract count as a word. `plugin/README.md` ships with the Claude Code
  plugin, so that one was wrong in an artefact a stranger installs.

  `every-page.test.js` reads every documented `trazum <command>` invocation out
  of `docs/` and checks it against `COMMAND_FLAGS`, so a *renamed* command
  cannot survive in the prose. A wrong total can, and its walk stops at `docs/`.

  `derived-counts.test.js` reads every page that describes the product as it is,
  plus the landing's copy in five languages, and holds five counts to what the
  product has: commands from `COMMAND_FLAGS`, the playground's subset from
  `PLAYGROUND_COMMANDS`, contracts from `CONTRACT_NAMES`, providers from the
  pricing catalogue, and rules from either `RULES` or the doctrine's headings
  depending on which the paragraph is about. Counts are written in digits: a
  figure spelled as a word is outside what any derivation can reach.

  Fenced blocks, lines naming the release they describe, and the dated files
  end to end are excluded, because each would otherwise fail on a true
  sentence or invite rewriting history. The README's architecture diagram is
  the one claim living in a fence, so it is checked by name.

- **Sonnet 5 was priced at a number nobody charges, on a timer.** The catalogue
  carried it as $3/$15 with an introductory promotion of $2/$10 running to
  2026-08-31 on top. Anthropic cancelled that increase and made $2/$10 the
  standard price; the table did not know, so on 2026-09-01 every Sonnet 5
  figure this tool printed would have risen 50% with no code change, no release
  and nothing for a reader to notice. Four days out when it was found.

  **A promotion is the one price change this table can see coming**, so
  `pricing-review.test.js` now refuses one that expires inside
  `STALE_PRICING_DAYS` — before the next review this product tells readers it
  performs. That check would have asked the question on 2026-07-17. It cannot
  catch a provider quietly changing a price, and says so; that is the release
  checklist's job, and step 7 of [docs/releasing.md](docs/releasing.md) is now
  it.

  The lever table's headline moved with the price, and it turned out to be the
  product's headline argument. **Opus 5 → Sonnet 5 is 60% off, not 40%**, and
  the span "which model a call goes to moves 40% to 80%" was wrong in **15
  places**: both CLI locales, the type documenting them, two comments in the
  CLI, the README, the Claude Code skill and the plugin copy generated from
  it, and the landing in five languages plus its proof row. Its floor had been
  computed from the $3/$15 list price while every test, transcript and the
  product's own output used the $2/$10 actually charged, so `docs/commands.md`
  disagreed with the sample printed four lines below it and the first sentence
  a visitor reads was 20 points low. Floor and ceiling are now derived from
  `MODELS`, and the guard reads the ceiling and checks the number in front of
  it, so it holds in a language it cannot parse.

- **The landing's headline figure was not one the product printed.** The page
  says, in a comment above its own copy, that every number on it is the
  product's own output, and the largest — **−37.4%**, in the proof row, drawn
  in the hero ledger and printed on the share card every link to the page
  renders — described itself as `optimize --level aggressive` over the demo
  prompt. No prompt in this repository produces it. The demo prompt is the one
  the Playground tab loads and the Optimiser fills itself with when a visitor
  clicks through, so it is the prompt whose figure the page is entitled to
  quote, and the rules take **20.1%** off it.

  `marketing.test.mjs` used to pin the figure by listing it — `['−37.4%',
  '40–80%', '−50%']`, asserted to appear on the page. Both halves of that were
  the same hand-typed number, so it could catch a figure being deleted and
  never one being wrong. It now runs the rules over the demo prompt and
  compares **every** reduction on the landing and on the share card against
  what comes out, because the hero draws the figure and the proof row states
  it and either could drift alone.

- **The picture at the top of the README was arithmetic nothing checked.** It
  is a terminal transcript: a prompt of 238 tokens shortened to 142, priced on
  Claude Opus 5 at 50,000 calls a month, with the model switch and the Batch
  API underneath. The prompt is illustrative and allowed to be — a drawing may
  invent its subject. The money may not: every dollar in it follows from two
  token counts and the prices of two models, and those prices live in a table
  that changes. An Opus 5 re-price would have left the first thing every
  visitor sees showing figures that were right once.

  `demo-image.test.js` reads the scenario out of the drawing — the token
  counts, the calls, the output length — and recomputes each figure from
  `MODELS`: the bill before and after, what the rules save, the output and
  input halves, and what the switch to Haiku 4.5 is worth. Its band comes from
  `bandFor` rather than the number that happened to be published when it was
  drawn.

- **Seven copies of one staleness threshold.** `profile`, the MCP report and
  the browser's bill each typed `45` into their own comparison, and four locale
  strings stated it again in prose. It is `STALE_PRICING_DAYS` in
  `@trazum/core` now, and a guard refuses both a surface that compares an age
  to a typed number and a locale sentence that tells the reader a different
  one.

- **One review date for seven providers.** The date was written on 2026-08-04
  already reading 2026-06-24 and never moved, because moving it required
  reviewing all seven at once: a partial review could only overstate the rest
  or throw itself away. `PROVIDER_REVIEWED` carries a date per provider, the
  catalogue's headline date is derived as the oldest of them, and `trazum
  models` prints the breakdown when they disagree — so a reader pricing Claude
  calls is no longer told their prices are two months old when that half of the
  table was checked this morning.

- **The README said there was deliberately no staleness threshold.** There has
  been one for as long as three surfaces have been printing a warning past 45
  days. Corrected, along with the illustrative day count beside it, which was a
  number that could only rot.

- **The Playground's terminal was a paper-coloured card.** The one place in
  the app where a reader types commands was the same white surface as the forms
  around it, with monospace text in it — so it read as another text box. A
  terminal is dark; that is its use scene, not a preference, and this
  repository already draws one at the top of its own README. It is now the same
  window as `docs/assets/demo.svg`: the same dark tokens in both schemes, the
  same mark in the title bar, and a terracotta prompt. What the README promises
  and what the page delivers are recognisably the same object.

  Its lede was the fourth panel heading printed twice; the sentence survives as
  the empty terminal's own first line, which is where a reader looking at a
  blank prompt actually wants it.

- **The Write panel opened with two buttons, both reading "Skip this", and the
  emphasised one skipped.** The primary control's label was
  `typed ? t.write.tab : t.write.decline` — the rail's own label ("Write") once
  something had been typed, and the decline label while the box was empty,
  which is the state every reader arrives in. There was no key for the action
  the button performs, so it borrowed two that were not it. `write.answer`
  exists now in both locales, the control names one action, and it is disabled
  until there is an answer to record rather than quietly turning into the
  button beside it.

- **Three panels printed their own heading twice.** Write, Your bill and
  Compare each rendered a lede directly under the page header that already
  states the panel's purpose — read off the rail's label so it cannot disagree
  with the nav. On Your bill the two sentences were near-identical
  ("*says where the money actually went: which workload, which model, whether
  caching paid for itself*") and the repetition pushed the drop zone, the one
  thing a reader came for, further down. Each panel now says the half the
  header does not: the file's shape on Your bill, the privacy claim on Write,
  and on Compare an empty state naming what the report will hold instead of a
  card containing the title again.

- **A coloured 3px left border was the notice style in ten places.** The class
  string was typed at each call site across three panels, each picking its own
  tone — the callout every framework ships and no design chose, and one that
  vanishes entirely under `forced-colors`, for the reader who most needs the
  distinction. One `Note` component with four tones replaces it, carrying its
  meaning in the surface and the text colour, both of which survive a
  high-contrast substitution.

- **A disabled primary button looked like a loading one.** shadcn's
  `disabled:opacity-50` on the terracotta fill produced a full-width slab of
  half-strength brand colour; on Your bill that slab sat under an empty paste
  box reading "Read the bill", and the only way to tell *waiting for you* from
  *working* was to notice nothing moved. Disabled now drops out of the brand
  entirely — the muted surface and the faint ink tier — so it cannot be
  confused with the loading state, which keeps the fill and animates its label.

- **The results column scrolled away from the reader editing what it priced.**
  On Optimise and Compare the answer sat at the top of a column beside a form
  three times its height, so going back to change the prompt took the report
  off screen. Both are sticky from `lg` now.

- **The landing page was blank below the fold, and had been since it shipped.**
  `Reveal` rendered its children at `opacity-0` and waited for an
  IntersectionObserver to say otherwise. A full-page capture of the built site
  showed the hero and two paragraphs on **seven thousand pixels of blank
  paper**: the four doors, the measured figures, the licence and the closing
  call were all in the DOM, laid out, and invisible, because nothing had
  scrolled and so nothing had intersected. A crawler, a print, a link preview
  and a screenshot all got that version.

  The app's own `AnimatedContent` had written the rule down two releases
  earlier — *"content is present before it animates"*, *"failing open is the
  only acceptable direction when the alternative is invisible content"* — and
  the one page that sells the product had never been held to it.

  **Two fixes were tried and the second was also wrong.** Replacing the
  observer with `animation-timeline: view()` removed the script and kept the
  fault: a scroll timeline has no progress when there is nothing to scroll, so
  on a document shorter than the viewport `fill-mode: both` pins the element at
  the `from` keyframe, which is zero opacity. Tightening the range moved the
  boundary without removing it, and a capture caught it again.

  **`Reveal` is deleted.** Fourteen identical fade-ups were buying a real risk
  of invisible copy for the effect the craft floor names as the failure mode —
  *one identical entrance on every section*. The page's motion is now one
  authored moment: the hero's ledger figure filling once on load, time-based so
  it cannot wait on a scroll position that may not exist, and written so the
  finished state is the element's own style and the animation is subtracted
  from it. Text is text, and it is there on the first paint.

- **`bg-layer` was a class that painted nothing.** The landing asked for it on
  the story and proof bands; no `--layer` token existed, Tailwind emitted no
  rule, and three sections meant to alternate against the hero were flat. The
  token exists now, in both themes, a hair off the paper rather than the full
  sunken step — on a long page a band is a change of ground, not a panel.

- **Two stale figures on the landing, in five languages each.** It advertised
  *39 commands* (45) and *nineteen contracts* (24). Both are the kind of number
  this repository treats as load-bearing, and both were wrong in every locale.

- **The prompt editor grew to 900 pixels and pushed its own button off the
  screen.** shadcn's `Textarea` carries `field-sizing-content`, so the box
  grows to whatever is pasted in it. With the bundled demo prompt the input
  column measured **1307px against a results column of 270** — a thousand
  pixels of empty paper beside the form — and the Optimise button sat below the
  fold on a 1000px display, so the first thing a first-time reader had to do
  was scroll past a wall of somebody else's prompt to find the one control on
  the page. It is capped at 26rem and scrolls past that; short prompts still
  get short boxes, which is the point of content sizing.

- **The roadmap promised four things it had already delivered.**
  `ROADMAP.md`'s `Next` section said the verdict bridge *"stays named and waits
  to be asked for, as do the `from-langsmith`, `from-helicone` and
  `from-litellm` converters, which need real exports before their formats can
  be read rather than guessed"*. All four were in `main`. A reader deciding
  whether Trazum could read their LiteLLM spend log was told, by the file whose
  whole job is saying what exists, that it could not.

  **Every guard here pointed one way, and this is the other way.**
  `every-page.test.js` fails a page that shows a command the CLI does not
  dispatch; nothing failed a page claiming *less* than is built. That direction
  is not harmless: this project's rule is that a blocked arc stays named and is
  never faked, and the mirror of that rule is that a delivered arc stops being
  called pending.

  `roadmap-forecast.test.js` reads the `Next` and `Under consideration`
  sections, sentence by sentence, and fails when one of this repository's
  named-not-built phrasings lands in the same sentence as a command
  `COMMAND_FLAGS` dispatches. It is sentence-bounded on purpose, so a paragraph
  that mentions a shipped command near an unbuilt one is not rewritten to
  please a test.

  **The released record is excluded, and a test says so.** *"The
  vendor-specific converters stay named and unbuilt until a real export of each
  is seen"* is a true statement about 1.71.0, and sweeping it to match the
  present would falsify a record — the same objection `token-band.test.js`
  skips the changelog for. A third assertion pins that sentence where it is, so
  the exclusion is a decision something checks rather than one that quietly
  becomes a bug.

  Proven by planting the sentence back in and watching it fail with
  *"from-litellm is dispatched, and this calls it pending"*.

- **The new guard missed the sentence next to the one it was written for.** It
  matched a command inside backticks, and four lines below the paragraph it
  fixed sat *"Vendor-specific converters (LangSmith, Helicone, LiteLLM) are
  named as next but stay unbuilt"* — three shipped converters, named as the
  products they read rather than as the commands that read them. A guard that
  only knows one spelling of its subject is a guard with a hole in it.

  A `from-x` command is now also looked for by its subject: `from-langsmith`
  answers to *LangSmith*, `from-claude-code` to *Claude Code*. Adding it fired
  on all three immediately, which is how the miss was found.

- **`Under consideration` still said nobody had measured the per-family
  tokenizer error.** That entry set its own threshold — *within 5% across
  families the dependency is not worth taking; 40% out and it is* — and said
  deciding without the number would be deciding blind. 1.82.0 measured two
  families at 94.5% and 103.1%, both more than twice that threshold. The entry
  now says the question is answered for those two, that four remain unmeasured
  and what each needs, and that the item stays unscheduled for a distribution
  reason rather than an evidentiary one.

  This is the same defect as the one above, in the section the guard does read,
  and the guard did not catch it: it keys on command names, and this entry
  names no command. Written down rather than papered over.

  An existing guard then caught the new one twice, which is the ratchet
  working. `publish.test.js` fails any suite that bounds a section of prose by
  naming the heading after it, *"the pattern this repository has had to fix
  nine times"* — and the first draft did exactly that, then wrote the offending
  call into a comment explaining why it had stopped, which fails too because
  that guard reads the raw file. The record is now computed as everything the
  forecast is not, from the same boundary the check itself uses.

## 1.82.0 — "The band was a measurement of its own training set"

### Fixed

- **Two `--json` documents carried the prompt text this file promises they never
  do.** `docs/json-output.md` opens by promising that *"nothing here carries a
  session key or prompt text"*. `trazum route --json` printed the whole
  `EvalReport`, whose `cases[]` holds `input` — the caller's own case text — plus
  `baseline[0]`, `baseline[1]` and `optimized`, three model answers.
  `trazum prune --json` printed `ExampleContribution.text`, which is a few-shot
  example and therefore prompt text by any reading. Neither carried a
  `schemaVersion`.

  **Nothing said so, and the guard that enforces the promise explains why.**
  `format-promises.test.js` runs it over *"every document this package can
  build — the profile, the roll-up and the prompt draft"*. Both of these are
  built in the CLI, so they sat outside a guard whose own comment describes the
  state they were in: a promise that quietly stops being true, because nothing
  would say so.

  **The measurement survives; only the strings go.** Both documents keep their
  per-item shape, because the similarity scores are the evidence behind the
  verdict and `index` says which example a verdict is about. Anyone who wants to
  read the answers has the human-readable output, which never left the terminal.

  `routeDocument` and `pruneDocument` are named functions now rather than inline
  objects, which is what makes the guard possible at all: reaching either
  document for real costs provider calls and an API key, so a test that demanded
  a live run would never run in CI.

  Three plants, three failures, including the one that matters in the other
  direction: returning a nearly empty document passes a stripping guard
  perfectly, and fails `the per-example evidence went with the text`.

  **Named and not built:** five commands emit `--json` with no contract table in
  `docs/json-output.md` at all — `route`, `prune`, `store`, `conform` and
  `watch`. `contract-coverage.test.js` checks documented-against-tested in both
  directions and cannot see a document nobody ever wrote down. The guard that
  derives the list from `COMMAND_FLAGS` was written and set aside: it fails
  until those five tables exist, and writing them is its own piece of work.


### Added

- **`trazum from-helicone` reads a Helicone request export as a usage log.** The
  fourth converter in the pattern `from-claude-code` started: a pure function
  turns one tool's export into Trazum's records and every door prices it from
  there. Helicone sits as a proxy in front of the provider and keeps every
  request it saw, so a team using it already has the export and needed no new
  instrumentation to answer *where did the money go*.

  **The format is derived, not remembered.** The columns are the SELECT that
  builds Helicone's own request table — `web/lib/api/request/request.ts` in
  Helicone/helicone — and the shape its `POST /v1/request/query` endpoint
  documents. A converter written from memory of an API is a converter that
  silently mis-reads somebody's bill.

  **It takes three columns to answer what model ran.** `request_model`,
  `model_override` and `response_model` can disagree, because the override
  exists precisely so a proxy can send a different model than the caller asked
  for. The response wins, then the override, then the request — a bill is about
  what was billed, not what was intended — and `modelDisagreements` counts the
  rows where they differed, so a substitution is a fact a reader sees rather
  than one they discover inside a total.

  **What does not cross.** A Helicone row carries the request body, the response
  body and `request_user_id`, which is an email address in Helicone's own
  documented example. None of it is read: the converter names the fields it
  takes and takes nothing else, and a fixture plants one marker in each and
  greps the whole conversion for it.

  **What it refuses to invent.** `cache_enabled` is a flag with no token split
  behind it, so a converted record carries no cache fields and the caching
  questions come back `cannot-tell` — the same refusal `from-otel` and
  `from-litellm` make. And `request_id` is one call, not a conversation, so the
  records carry no `session` and the conversation findings stay unavailable
  rather than being answered from a per-call id, which would report every call
  as a conversation of one.

  `looksLikeHelicone` is deliberately narrow, and the plant that proves it is a
  LiteLLM spend log and an OpenAI usage response: both carry `prompt_tokens`,
  and a detector loose enough to claim either would take somebody's export away
  from the converter that understands it.

- **The tier heuristic refuses when the prompt argues with itself.** The score is
  `complex × 2 − simple × 2`, so a prompt carrying four signals of a hard task
  and three of an easy one cancels to `sonnet` — **the identical answer to a
  prompt with no signals at all**. Those are opposite situations reported with
  one number: one is *"nothing here suggests a tier"*, the other is *"this prompt
  contradicts itself about which tier it needs"*, and only the second is worth
  saying out loud.

  A new `tier-signals-conflict` advisory says it, and `model-downgrade` does not
  fire while it holds. That order matters: a saving computed from a tier the
  heuristic cannot stand behind is a dollar figure with nothing underneath.

  **The threshold is derived from the weights, not from taste.** A lead of one
  signal or fewer counts as conflict, because each signal moves the score by 2
  and prompt length moves it by up to 2 on its own: a one-signal lead is inside
  what length alone contributes, and a lead of two or more is a majority the
  size term cannot manufacture. `recommendTierDetailed` reports the counts and
  the verdict; `recommendTier` keeps its shape, because the 1.x line does not
  change one.

  Four plants, four failures, including the one that matters most in the other
  direction: making the refusal unconditional fails `still recommends a tier when
  one side clearly leads`, so the guard cannot be satisfied by refusing
  everything.

### Changed

- **The published `±10%` token band was a fit over its own calibration set, and
  there is no single band any more.** For eight releases every report said the
  same figure about every prompt. It was measured over a corpus of twenty-one
  samples that held **thirteen files of Latin prose and exactly one each of
  code, numeric and punctuation** — and those single files were the set the
  estimator's constants had been fitted to. So the number was not a measurement
  of the estimator. It was a measurement of its own training set.

  **Twenty-six ordinary samples broke it.** Measured against Anthropic's
  counting endpoint, the same estimator that is 5.6% out on prose is **25.1% out
  on a run of identifiers** and **32.5% out on a CSV ledger**. Telling somebody
  ±10% about their ledger was telling them a number that is wrong about their
  prompt specifically, and every dollar figure below it inherited the error.

  The band is a property of the text now. `bandFor(text)` in the new `band.ts`
  answers with one of four measured figures, and every surface prints it: the
  report's estimate line, the check and blame markdown, the MCP tool output, and
  the two advisories that hedge near a threshold.

  | Kind of text | Band | Worst sample | Samples |
  |---|---|---|---|
  | CJK, all three scripts | ±4% | 3.2% (`cjk-japanese-technical`) | 6 |
  | Latin prose and few-shot blocks | ±6% | 5.6% (`numeric-matrix`) | 18 |
  | Code, markup and quoting | ±26% | 25.1% (`numeric-identifiers`) | 16 |
  | Digit-dominant tables and ledgers | ±33% | 32.5% (`numeric-tabular`) | 7 |

  **It deliberately does not classify by text type**, and that is a finding
  rather than a shortcut. Measured by character mix, code and punctuation
  overlap completely — `code-sql` is 7.7% symbols and `punctuation-markup` is
  17.5%, with `code-heavy` at 15.6% sitting between them — and two of the three
  few-shot samples are indistinguishable from prose. A classifier over those
  would be a guess wearing a measurement's name, and it would hand out the wrong
  band precisely where the band matters most. So the buckets are the separations
  the corpus actually offers, and where two classes overlap the worse band wins:
  an overstated uncertainty costs a reader some confidence, an understated one
  tells them a wrong number and lets them act on it.

  **The thresholds are the widest gaps the corpus offers**, not round numbers
  somebody liked. CJK at 0.5 — the CJK samples are 90.1% to 94.5% CJK and every
  other sample is 0.0%, with nothing in between. Digits at 0.30 — the two purely
  numeric samples are 47.7% and 49.7% digits and the next highest anywhere is
  15.3%. Symbols at 0.07, and this one is stated as thin: `code-sql` at 7.7%
  against `portuguese-prose` at 6.1% is 1.6 points of margin. Thin in the safe
  direction, because a prose sample that crosses it is given a wider band than
  it needs and no sample is ever given one narrower than its own error.

  `ESTIMATE_ERROR_BAND_PCT` is now **33** rather than 10, and it is only for
  callers that must print one figure without holding the text — a figure
  covering the whole catalogue of text can only be the worst of it. Widening it
  makes every claim that reads it true where it had been false, at the cost of
  understating the estimator on prose. A caller with no text cannot know which
  it is holding, and there is one safe direction to guess in.

  **The guard is planted rather than asserted.** `token-band.test.js` holds every
  sample against the band `bandFor` gives it, requires no bucket's band to be
  narrower than its own worst sample, and requires every bucket to carry at
  least one measurement. It cannot be satisfied by tuning a threshold: a sample
  sorted into a friendlier bucket gets a smaller band and fails. The
  single-source guard was extended too — it now reads a `±N%` in any live file
  and fails unless the code publishes that exact number, with source comments
  stripped first so a file explaining what the band *was* is not forced to
  falsify its own history.

- **The estimator's error against a foreign tokenizer is said out loud, with the
  number.** The report already knew to name the provider when the model was not
  Anthropic's. What it could not say is how far off — and a hedge with no figure
  is a hedge a reader discounts. The same 47 samples run against DeepSeek's own
  counter come out **94.5% wrong** at worst and against Mistral's **103.1%**, so
  those two families now get the measurement on the line:

  ```
  26 → 21   -19.2% (estimated: the counter is calibrated on Claude,
                    not DeepSeek V3, where it has measured up to 94.5% out)
  ```

  A family nobody has run gets *"nobody has measured how far off it is there"*
  instead, because `measuredForeignError` answers null rather than the nearest
  number. Both halves are held: one test recomputes each published figure from
  that provider's fixture and fails on drift, another fails if `band.ts` ever
  states an error for a family with no fixture behind it at all.

- **The corpus is 47 samples in ten languages, and the harness reaches
  Mistral.** Twenty-six were added: seven code and markup samples, three
  few-shot, four more CJK including the first two Korean ones, and twelve purely
  numeric. Mistral joins Anthropic, DeepSeek, OpenAI and Google as a family the
  harness can measure — through the gateway's upstream allowlist, because
  `trusted-hosts.test.js` refused to let a measuring script be a side door, and
  it was right to.

  The harness also retries a rate limit or a 5xx with doubling backoff and paces
  paid providers, after a 43-sample run died three times on the same endpoint.

- **`--exact-tokens` and the default measurement model.** The band script's
  default Anthropic model was `claude-opus-4-1`, which is retired: the first run
  anybody had a key for returned a 404 from a model id nobody had checked since
  the catalogue moved. It is `claude-opus-5` now.

- **`model-downgrade` names the command that settles it.** It said *"measure the
  difference with your own evaluations"*, which is advice nobody can follow
  without already knowing how. It now names
  `trazum route <log.jsonl> --prompt-file <prompt> --cases <cases> --yes`, which
  is the command that sends the same cases to both models and reports whether
  the cheaper one still does the job. The refusal above names it too, because a
  refusal that does not say what would settle the question is only half of one.

### Fixed

- **A character range that looked right sorted astral emoji as CJK.** `band.ts`
  wrote its CJK test as five ranges of literal characters, and the last pair
  meant *"compatibility ideographs, U+F900 to U+FAFF"*. Its opening character
  was **U+8C48** — the ordinary unified ideograph that shares the glyph, not the
  compatibility one — so the range ran from U+8C48 to U+FAFF and took in the Yi
  syllables, the private-use area and both surrogate halves on the way.

  A page of emoji therefore came out `cjk` and was handed **±4%**: the narrowest
  band in the file, about text nothing has ever measured. It passed every
  assertion in `token-band.test.js` because no corpus sample lives in any of
  those blocks. CodeQL found it on the pull request that introduced it, in the
  same release whose entire subject is a figure that looked measured and was
  not.

  The ranges are numeric escapes now, and a test plants one character from each
  block that used to be caught — with the silent half checked too, so a guard
  that rejects everything cannot pass it.

- **Hangul was charged a placeholder nothing had measured.** Every CJK character
  that was not kana was billed han's 1.05 tokens, and the corpus had no Korean in
  it to say otherwise. Two Korean samples in different registers — a support
  script and a technical note — agree in lockstep across the whole search:
  −10.6% and −10.0% at 1.20 tokens per character, −3.5% and −3.1% at 1.30, 0.0%
  and 0.0% at 1.35, and +3.2% and +3.4% at 1.40. `HANGUL_TOKENS_PER_CHAR` is
  1.35, the CJK bucket's worst error went from 10.6% to 3.2%, and its standard
  deviation from 4.0 points to 1.0.

  This is the only calibration in the release that succeeded, and the reason it
  is trusted is that two independent samples moved together at every candidate
  rather than one sample landing on a number.

- **Punctuation was charged half a token each and costs closer to one.** The
  divisor was `n / 2`, fitted against a single punctuation-heavy sample. Five
  symbol-dense samples added this release all undercounted, and `n / 1` takes
  them in. The digit divisor was deliberately left alone: no single constant
  serves both numeric samples, and moving it to fit one would be the same fault
  as the band itself.

  **Two hypotheses were tested and rejected**, which is what the larger corpus
  bought. Digit-run length does not predict the numeric error — `numeric-tabular`
  averages 2.79 digits per run and is +32.5% out, `numeric-heavy` averages 3.13
  and is −5.0% — and neither does grouped-number density: `numeric-versions` at
  0.44 is −11.5%, `numeric-tabular` at 0.60 is +32.5%. With two samples each
  would have been fitted and shipped as a fix.

- **The caching advisory quoted a threshold that was true of no model.** It said,
  for every model in the catalogue, *"a cache write costs 125% of the input price
  and a read costs 10%. Below roughly a 28% hit rate you pay more than you
  save."* Two of those numbers were Anthropic's multipliers stated as universal.
  The third was not derivable from anything: break-even is where a cached token
  costs what an uncached one does, `h·read + (1−h)·write = 1`, so
  `h = (1 − write) / (read − write)`, and at 1.25 and 0.1 that is **21.74%**.

  **The advice was actively wrong for eight of the eighteen models.** `gpt-5`,
  `gpt-5-mini`, `gpt-5-nano`, `gemini-2.5-pro`, `gemini-2.5-flash`, `kimi-k2`,
  `deepseek-v3` and `grok-4` write at **1× input price**, so caching cannot lose
  money at any hit rate: `(1 − 1) / (r − 1)` is zero, which is the absence of a
  threshold rather than a small one. All eight were being told to consider
  turning caching off. The message now takes the model's own multipliers and
  says the different thing that is true of them.

  The multipliers were in hand at the call site and already passed to the
  advisory next door, whose comment says why a global constant is *"an invented
  saving rather than an imprecise one"*. Only this message invented its own.
  The guard recomputes the threshold from the catalogue rather than typing it in,
  and one plant fired on the number while a second, matched against the wording
  of the replacement rather than the claim, did not: the sentence it was written
  to catch reads `Below **roughly** a 28%` and `Below a` does not match it. It
  is matched on `you pay more than you save` now, which is the claim itself.

- **A measured cache hit rate rose the more the cache was rewritten.**
  `cacheReadShare` was `reads / (input + reads)`, leaving cache **writes** out of
  the total it claims to be a share of. With 100 read tokens, no plain input and
  9,900 written, it answered **100%** where the truth is 1%.

  That is the worst direction for this number to be wrong in. It is handed to
  `optimize` as `cacheHitRate`, which decides whether caching is paying off, so
  the workload burning money on writes was the one most likely to be told its
  cache was working perfectly. Writes are input tokens: billed at the input rate
  times the write multiplier, arriving in the same `usage` block.

- **The downgrade advisory halved candidates that have no batch API.** The saving
  multiplied the cheaper model by a hardcoded `0.5` whenever the caller said
  `batchEligible`, while the current model's cost twenty lines above already used
  `rates.batch ?? 1`. Three models carry `batch: null` — `kimi-k2`, `deepseek-v3`
  and `grok-4` — meaning no batch API at all, so the advisory offered money that
  cannot be bought at any price, made the downgrade look twice as good as it is,
  and could turn a negative saving into a reported one.

- **The MCP registry read-back failed 1.81.0's release while the publish had
  succeeded.** The listing job's last step asks the registry whether it now
  serves what was just sent. It reported `the registry serves '1.80.1' for
  io.github.Davmunrey/trazum, expected '1.81.0'` seconds after the publisher
  printed `✓ Successfully published — version 1.81.0`. Both statements were
  true, and the check was wrong twice over.

  **It took the first entry the search returned.** The registry keeps every
  version of a server, so `find((entry) => entry.server?.name === name)` answers
  *"some version is listed"* while the step reads it as *"this version is
  listed"*. After 1.81.0 published, the search returned 1.80.1 first and 1.81.0
  second. Verified against the live registry rather than reasoned about: the old
  expression reads `1.80.1` today, and would have failed **every release from
  here on**, not only this one. It now collects every version under that name
  and asks whether the wanted one is among them, so the answer cannot depend on
  ordering. When it is absent the error names what the registry does hold.

  **And it asked once, 0.6 seconds after the publisher returned.** The publisher
  confirms the write; the search index catches up afterwards.
  `scripts/mcp-registry-preflight.mjs` already learned exactly this about npm
  and polls until the answer arrives, and the lesson had not travelled one step
  further down. The read-back now asks for up to a minute.

  Nothing was actually broken by this: `@trazum/core`, `@trazum/cli` and
  `@trazum/mcp` are live on npm at 1.81.0, the tag exists, and the registry
  lists `io.github.Davmunrey/trazum` at 1.81.0 with status `active`. The failure
  was a check reporting a broken release that was not broken, which is the worst
  direction for a check to be wrong in: it teaches whoever sees it to stop
  believing the red.

  Two plants, two failures: restoring the first-match expression fails with `the
  read-back takes the first listing by name`, and removing the polling fails
  with `the read-back asks once rather than waiting for the registry to catch
  up`.



## 1.81.0 — "The things nobody had checked"

### Added

- **`DELETE /api/account` closes an account, which nothing could do.** The
  accounts that arrived in 1.7.0 could be signed out of and never closed: there
  was no `deleteUser` in the store interface, in either driver, or anywhere
  else. The only way out of this product was to stop using it.

  It takes the account row and, with it, every session, every prompt, every
  version of each, and every `/c/<token>` link the account published. Postgres
  does that with the four `on delete cascade` clauses the schema already
  carried; the memory driver walks the same graph by hand.

  **Immediate, with no grace period.** A screen that says deleted should mean
  deleted, and a `deleted_at` column would have meant touching every read, a
  second reaper, and an account that both exists and does not.

  **The confirmation is checked on the server.** The browser asks for the login
  to be typed, and a browser is bypassed by anyone with a terminal, so the same
  string is compared against the session the request resolved. Whose account is
  never a parameter: the worst any caller can do is delete themselves, asserted
  against four spellings of a target plus a query string.

  **Published share links stop working, and that is the answer rather than an
  oversight.** Keeping them would mean keeping the deleted person's prompt text
  and their denormalised `owner_login` in `trazum_shares`.

  **One plant refused to fire twice, and both times the test was what was
  wrong.** Removing `versions.delete(id)` leaves version rows orphaned in a map
  no public call can reach, and all seven tests through the route stayed green,
  because every route reaches a version through its prompt and the prompt is
  gone. Adding a count did not fix it: the count summed what each iteration was
  *about* to delete, so it reported three removed with the delete taken out. It
  measures the map before and after now, and the plant fails with `the versions
  were left behind, unreachable and undeleted`. The guard for it runs against
  `promptTablesInMemory` rather than through the `Store`, because that is the
  level the bug lives at.

  **An existing guard caught this before CI did.** `every route the web app
  serves is named in the roadmap` failed on `/api/account`, so `ROADMAP.md`
  gains an `Unreleased` section on the same terms `CHANGELOG.md` has one.

  Left alone deliberately: `trazum_prompt_versions.author_id` references
  `trazum_users` with neither cascade nor `set null`. It cannot bite today,
  because prompts are private so `author_id` always equals the owner and the
  cascade from `trazum_prompts` reaches those rows first. The day collaboration
  exists, deleting an account will fail on a foreign key. Migrating the schema
  for a feature that does not exist would be inventing a requirement.
- **Expired sessions are swept, and nothing was sweeping them.** `findSession`
  deletes the row it was handed on its way out, which covers a session somebody
  comes back and presents. It does not cover the ones nobody ever comes back
  for, and those are the majority: a browser that cleared its cookies, a laptop
  that was replaced, anyone who signed in from somewhere once. Those rows sat in
  `trazum_sessions` for ever and nothing about the deployment looked wrong while
  they piled up.

  **This is unbounded growth, not a way in, and the test says so.** `findSession`
  excludes anything past `expires_at`, so a dead row cannot authenticate
  anybody. The assertion is therefore about how many rows are left rather than
  about what a lookup answers, which is the honest shape for a fix whose whole
  subject is a table that only grows.

  **On sign-in rather than on a timer**, for the reason `rate-limit.ts` already
  gives for sweeping on use: this deploys to a platform with no long-lived
  process to hang an interval on, and a route that stops being called should
  stop doing work. Signing in is the event that grows this table, so it is the
  right event to shrink it by, and after the first sweep the delete matches
  nothing and costs an index probe. Awaited rather than fired and forgotten, and
  wrapped in a `catch`, because a floating promise on a serverless function is
  one the runtime may kill mid-delete and a failed sweep must never cost
  somebody their sign-in.

  No migration: `trazum_sessions_expires_at_idx` was added with the table in
  `db/001_accounts.sql` and is exactly the index this delete wants.

  Two plants, two failures: removing the sweep fails with `expired sessions
  survived a sign-in and were left to accumulate`, and a sweep that ignores
  `expires_at` fails with `the sweep took a session that had not expired`, which
  is the half that would turn this from a fix into an outage.

- **`POST /api/auth/signout?all=1` ends every session the account has, and the
  account menu offers it.** `deleteSessionsForUser` existed in the store
  interface and in both drivers, with no caller anywhere. The only revocation
  available was for the session doing the asking, so somebody whose laptop was
  stolen could sign out on their phone and the stolen cookie stayed valid for
  the rest of its thirty days, with nothing they could do about it.

  **Opt-in rather than the default.** The common sign-out is one person leaving
  one shared machine, and taking their phone with them would be a surprise
  nobody asked for. The narrow sign-out is unchanged and stays first in the
  menu; the wide one sits below it and its label says what it ends, this device
  included.

  **The authorisation is an absence.** There is no parameter naming whose
  sessions to end: the user is resolved from the caller's own cookie, so the
  worst any caller can do is sign themselves out. The response is the same 204
  with the same empty body whether one session went or twenty and whether the
  caller held a live cookie at all, because a count answers a question nobody
  holding a valid cookie needs and every holder of a stolen one would like.

  **One of the three plants did not fire, and the test was the thing that was
  wrong.** The isolation test signed in as two people and checked that revoking
  one left the other alone, which a route that grew a `?user=` parameter passes
  just as happily as a route that never had one: planting it left every
  assertion green. It attempts the attack now, in four spellings a future
  handler could plausibly read plus a JSON body, and fails with `one account
  revoked another account's sessions through ?all=1&user=…`.

  The other two: reverting to `deleteSession` alone fails the wide sign-out, and
  making `all` unconditional fails `signing out of one device signed the account
  out of all of them`.

  **A UI guard broke on the change and was rewritten rather than relaxed.**
  `ui.test.mjs` proved the sign-out uses POST by quoting the source text
  `'/api/auth/signout', { method: 'POST' }`, which stopped matching when the
  path became a template literal. Quoting a spelling is not proving a property:
  that guard would also have gone on passing if somebody had added a second
  sign-out call on GET beside the first. It now walks every occurrence of the
  path in the component and requires POST at each, and separately requires the
  wide sign-out to exist. Both halves were planted: `GET` fails with `a sign-out
  call does not say POST, so an image tag could forge it`, and dropping `?all=1`
  fails with `the account control cannot revoke every device`.
- **The ten-minute window on an OAuth state is checked here now, not asked of
  the browser.** `OAUTH_STATE_TTL_SECONDS` existed and was applied in exactly one
  place: the state cookie's `maxAge`. That is a request a browser is free to
  ignore and a non-browser never sees. Meanwhile the callback's own comment
  described *"a real one that sat in a tab past the ten-minute window"* as one of
  the two cases it handled, and nothing measured it. The state carries an issue
  time now, and `stateMatches` reads it.

  **What that binds, and what it does not.** It binds a browser, which is the
  case the window was written for: a callback URL left in an open tab, in
  history, or in a proxy log stops working ten minutes after it was issued
  rather than whenever the browser gets round to dropping the cookie. It does
  not bind a client that writes its own cookie, and the timestamp is
  deliberately not signed to make it so, because there is nothing there to gain:
  anyone who can set this cookie can equally ask for a fresh one, so a forged
  issue time buys an attacker a state they could have had for free. Saying that
  is the point; an HMAC would have looked like it closed something.

  **Both ends of the window.** Past the TTL is the case the ten minutes are
  about. Issued in the future is a clock that disagrees with ours, and a
  negative age is not a small one: read as a number it sits inside every window
  there is, for as long as the skew lasts. So it is refused rather than granted
  an unbounded one.

  **The old two-part value is refused, not accepted.** A browser can be holding
  one across a deploy, and the cost of refusing is a 400 saying start again and
  one more click, inside a ten-minute window. Accepting it would give the guard
  a shape that switches itself off for anything resembling the format it
  replaced, which is the kind of guard that outlives its own reason.

  One test that quoted the cookie's layout by hand now reads it through
  `unpackState`, so it fails on the destination it is about rather than on a
  format change.

  Three plants, three failures: deleting the window check, keeping only its
  upper bound, and accepting the two-part format.

- **`GET /api/auth/session` is rate limited, and it was the only auth route that
  was not.** Every call below the disabled branch is an indexed lookup by token
  hash, made for an unauthenticated caller, keyed on a cookie that caller chose.
  `lib/auth/routes.ts` has exported a limiter for the sign-in hops since they
  were written; this route imported the file for nothing else and never asked
  for one. The gap was an omission, not a decision.

  **Its own budget, not the sign-in one, and that is the part worth a guard.**
  The header asks this endpoint before it can draw anything, so a person
  clicking around calls it far more often than they sign in. One shared bucket
  means ordinary browsing spends what the sign-in hops need and refuses somebody
  at the moment they press the button. Reusing `authRateLimited` fails with
  `reading the session locked this address out of signing in`, which is the
  regression a future reader is most likely to make while tidying.

  Sixty a minute, the same as `/api/write` and for the same reason: the limiter
  keys on an address rather than a person, so the budget has to be an office's.
  That is a policy matched to an existing precedent in this repository, not a
  measurement, and the comment says so rather than dressing it up. What it does
  not bound is a distributed attacker, which `rate-limit.ts` already states in
  its own terms; guessing a token is not among the risks, since they are 256
  bits.

  **The refusal sits after the disabled branch, not before it.** That branch
  exists so an operator whose sign-in never appeared can curl this endpoint and
  read why, and it touches no store; rationing it would ration the one answer
  somebody debugging a deployment needs. Moving the limiter above it fails on
  call 61 of a test with its own address, which is the only way that failure
  names the ordering rather than a budget two tests above already spent.

  Three plants, three failures: deleting the limiter, sharing the sign-in
  bucket, and moving it above the disabled branch. The 429 carries
  `cache-control: private, no-store` like every other branch of this route.

- **The English catalogues lost their em-dashes, and the guard covers them
  now.** 341 in `packages/cli/src/i18n/en.ts` (30 of them written as `\u2014`),
  17 in `packages/core/src/i18n/en.ts`, 1 in `apps/web/lib/i18n/en.ts`. Three of
  them were not punctuation at all but table cells, and they became words the
  way the Spanish sweep did: `none`, `other`, `no verdict`.

  **This reverses a decision the guard itself argued for**, and the comment now
  says why rather than being quietly deleted. The old argument was that the
  em-dash is ordinary English punctuation and the product's whole English voice
  rests on it, so sweeping one file and not the rest reads as two writers. That
  holds for prose somebody opens on purpose and does not hold for the line that
  appears in their terminal unasked. The README, `docs/` and this file keep
  theirs, deliberately: the line is what a user reads on screen versus what a
  reader opens.

  **What the mechanical pass got wrong, and how it was found.** A comma was
  right 249 times and a colon 99, chosen by reading the clause after the dash,
  and then every changed line was read back. Three kinds of damage turned up
  that no rule would have avoided: a dash ending a wrapped help line became a
  comma at the start of the next one; the config help table used the dash as a
  column separator, so a comma read as part of the value (that table is a colon
  against the value now, the same shape the Spanish sweep gave it); and one
  regex reached inside a JSON literal in that table and moved a comma belonging
  to the data, which is why the block was restored and rewritten by hand.

  **An existing guard caught the sharpest one.** `markdown.test.js` forbids
  `score:`, `grade:`, `rating:` in the report, because a report that looks like
  it scores you is a report that invented one. The sweep turned *"There is no
  score — every column is a measurement"* into *"There is no score: every
  column…"*, and the guard failed on a copy change nobody would have connected
  to it. The sentence is two sentences now.

  Twenty-four test assertions quote this copy and were realigned to it, and 75
  more were reverted after an over-eager pass touched assertions whose strings
  live in `packages/core/src/*.ts` rather than in a catalogue and were never
  swept.

  Three plants, three failures: a literal em-dash in the CLI's English
  catalogue, an escaped one in core's, and the guard being narrowed back to
  Spanish, which fails on finding three catalogues where it expects six.

- **`trazum from-claude-code --state <file>` reads only what is new.** A
  transcript is append-only and can be enormous, so anything converting it on a
  loop spends its time re-reading bytes that cannot have changed. On the largest
  real transcript on one machine, 212 MB, the conversion drops from **2.6s to
  0.19s**, and the records appended are byte for byte what a full read would have
  produced. The status line's `Stop` hook uses it, so its per-turn cost on that
  session goes from 2.7s to 0.72s.

  **The resume point is not the end of the file, and that is the whole design.**
  One call is written as several lines and the last one stands, so a run that
  stopped at the end would record the call that was still streaming from its
  first line and never see the lines that finished it. The bill would be short
  by whatever that call grew by, on every pass, with nothing looking wrong. So
  the resume point is the first line of the last call, that call is re-derived
  every time, and the output is truncated back to the settled records before the
  new ones are appended.

  Contiguity was measured rather than assumed: across 208 real transcripts and
  36,468 lines carrying a `requestId`, no request ever reappeared after another
  had begun. The design does not lean on that; it re-derives the final call
  whether or not it needed re-deriving, because a measurement on one machine is
  evidence and not a guarantee.

  Three refusals, each because the exact answer is not available otherwise: it
  needs `--out` (nothing to truncate when the records go to stdout), it takes one
  transcript rather than a folder (several transcripts appending to one output
  have no single settled length), and it re-reads from the top when the bytes
  before the resume point do not match what it left, so a rotated or replaced
  transcript is never resumed into. A missing or corrupt state file is a cold
  start, not an error: it is a cache.

  Five plants, and **three of them found holes in the tests rather than in the
  code**. Deleting the digest passed, because the replacement transcript was
  shorter and the length check alone refused it. Deleting the output truncation
  passed, because every append in the suite made the tail longer. Deleting the
  partial-line cap passed, because the half-written line was planted after a real
  call, where the cap changes nothing. All three tests were rewritten until the
  deletion they name is the reason they fail.

- **A Claude Code status line that costs nothing.**
  `plugin/statusline/trazum-statusline.sh` shows what the session has cost at
  the bottom of the terminal:

  ```
  Sonnet  $0.7761 · 10 calls · cache 88% · saved $2.91
  ```

  None of it is tokens. Claude Code draws the status line's stdout in the
  terminal and writes a `Stop` hook's stdout to the debug log, so neither is
  context. `SessionStart` is the hook whose stdout the model *does* see, which
  is why the refresh is not wired to it and why a test refuses it by name in
  both the script and the README somebody copies from.

  **The split between the two is the design.** Claude Code runs the status line
  on every assistant message and cancels the script if another update arrives
  while it is still running, so a status line that reads the whole transcript
  does not show a stale number, it shows nothing. Measured on 208 real
  transcripts on one machine: median 0.50s, largest 6.5s on a 212 MB session.
  With the work in the hook, the status line returns in **0.08s on that same
  212 MB session**, and the hook pays the cost once per turn, after the turn.

  Without the hook it still works, and shows the figure Claude Code computes
  itself labelled `(Claude Code)` rather than passing somebody else's estimate
  off as Trazum's.

  Five plants, five failures: moving the computation back into the status line
  is caught by a `trazum` that writes a marker and fails, dropping the
  attribution is caught, writing the cache in place rather than renaming it
  into place is caught, and naming `SessionStart` in either the script or the
  README is caught both when it replaces `Stop` and when it is added beside it.


- **The MCP registry listing is published by the release workflow.** A new
  `mcp-registry` job in `release.yml` waits for npm to serve the new
  `@trazum/mcp`, authenticates with GitHub OIDC, publishes
  `packages/mcp/server.json`, and then asks the registry what it serves and
  fails if it is not the version just sent. It was the last manual step in a
  release, and it failed on both of its two manual runs.

- **`scripts/mcp-registry-preflight.mjs`.** The registry verifies a listing by
  reading `mcpName` off the package on npm, and npm serves a new version
  minutes after the publish returns, so chaining the two publishes produces a
  400 that reads like a manifest bug and is a propagation race. This asks npm
  for the exact version until it answers 200 *and* serves the right `mcpName`,
  for up to five minutes. A fixed sleep would be too short on a slow day and too
  long on every other one.

  It also re-checks the `server.json` / `mcpName` agreement at the point of use,
  which is not redundant with `publish.test.js`: that runs against the commit,
  this runs against the checkout a release job is about to publish from, and a
  hand-pushed tag can skip the first.

  Proved by planting all three failures: a version npm does not have times out
  with the 404 quoted, a name mismatch fails before any request, and the real
  version passes on the first ask.

- **The gateway forwards two paths that spend nothing, without judging them.**
  `POST /v1/messages/count_tokens` and `GET /v1/models` on Anthropic. Until now
  the rule was one path per provider, and a coding agent pointed at this gateway
  got a 404 within its first second from a proxy that was otherwise working.

  **Refusing them was never the stricter answer.** `count_tokens` is the call you
  make to find out whether you can afford the other one, so answering it with a
  402 blinds a caller at the exact moment they are trying to behave. A budget
  refusal only means something when there is money on the line; on a free call it
  is theatre with a real cost.

  What it widens is stated in `docs/gateway.md` rather than glossed: the origin
  is still compiled in, so the credential still reaches one host, and what grows
  is the set of *operations* somebody who can reach the loopback port may perform
  with it, from one to three. So the list is literal strings rather than
  patterns, the method is part of the match, and the comparison is against the
  whole path.

  The free branch reaches no decision, records no usage and never substitutes a
  model, because there is no money to judge, no counts to keep and nothing to
  swap. Any of those would be a figure invented about a call that cost nothing.

  **Two security guards were strengthened rather than relaxed.** Adding a
  destination for somebody's credential already meant editing an allowlist in
  `security.test.js`; adding a path forwarded *without a budget decision* now
  means the same, method included. And the fetch-target guard pinned a
  single-element array, which is the wrong thing to hold: it fails on a second
  call site that is correct and passes on a first that is not. It asserts the
  set of distinct targets now.

  Eight refusals are planted and pass: `/v1/messages/batches` (bills, and reads
  as administrative), `/v1/models/../messages`, `/v1/models?limit=1`,
  `/v1/modelsX`, `/v1/model`, both right paths on the wrong method, and a method
  nothing answers. Four design failures are planted too, and all four fail: the
  free branch moved after the budget decision, a `startsWith` comparison, a
  billing path added to the free list, and the free branch recording usage.

  Proved live as well as in tests: against the real `api.anthropic.com`, the
  spending path returns 402 while `count_tokens` and `/v1/models` return
  Anthropic's own 401 for a fake key, on the same gateway, configured
  `fail-closed` with no budget.

### Fixed

- **The web app never lends its own LLM key.** `POST /api/optimize` read
  `TRAZUM_LLM_API_KEY`, then `ANTHROPIC_API_KEY`, and fell through to
  `providerFromEnv()` when a request carried no key of its own. On a deployment
  with either variable set, any stranger who posted `{"suggest": true}` spent the
  operator's money: no account, no session, nothing to attribute it to, and a
  rate limiter in front of it keyed on a header the caller controls.

  **It is not armed on the live deployment.** `https://trazum.vercel.app/api/optimize`
  answered `"llmConfiguredOnServer": false` while this was being written, so no
  key was configured and nothing was ever spent. It was a trap set rather than a
  leak open, and it would have armed itself the day somebody set that variable.

  **The bug is a function used outside the world it was written for.**
  `providerFromEnv`'s own comment says it is *"trusted because it came from the
  environment: the operator configuring their own machine, not a stranger naming
  a host for this server to fetch"*. That is exactly right for the CLI, where
  the operator and the caller are the same person. In a web app they are not,
  and reusing it there turned "my key on my machine" into "my key for anyone
  with the URL".

  The endpoint and the model may still come from the operator, and the key may
  not. Collapsing those two kinds of setting is what caused this:
  `TRAZUM_LLM_BASE_URL` is the documented Ollama-on-localhost case and costs an
  operator nothing when a stranger uses it, because the stranger still brings
  the credential that pays. `allowInsecure` is scoped to the operator's own host
  for the same reason.

- **`GET /api/optimize` stops answering whether there is a key worth
  attacking.** It returned `llmConfiguredOnServer`, unauthenticated and
  unlimited, which is an oracle. The field is gone rather than set to `false`,
  because the question no longer has meaning once the server never lends a key,
  and the placeholder in the key field says it without a round trip. The route
  also gains the rate limiter that was on `POST` only: the one endpoint that
  answered without a body was the one nothing bounded.

  Two plants, both firing. Restoring the environment fallback fails with `a
  keyless request was served` and `a keyless refining request was served`.
  Closing only `suggest` and leaving `llm.enabled` open fails with the second
  alone, which is how this kind of fix is usually half-made. The suite keeps
  `TRAZUM_LLM_API_KEY` set so the tests run against the configuration that used
  to be dangerous rather than a tidy one where the question cannot arise.


- **Half of this file was a second copy of itself.** 100 of its 116 version
  headings appeared twice, 11,336 lines of duplicate history, concatenated in
  #411 and unnoticed for sixty-nine releases. The two copies differed by exactly
  one entry, present in the first and missing from the second, so the first
  contained the second whole and the second was deleted after proving that line
  by line: every version heading still present, every entry still present, none
  duplicated.

- **A section marked `Unreleased` sat below `## 1.80.0` holding work that
  shipped in 1.80.0.** `packages/mcp/server.json` exists at the `v1.80.0` tag
  and `action.yml` carries the corrected description there, so the file was
  telling a reader "not released yet" about something they could already
  install. Both entries are folded into 1.80.0 where they belong. This is the
  one that mattered: the changelog is what somebody reads before depending on
  this, and it was wrong in the direction that undersells what they get.

- **Two more `## Unreleased` headings and two `# Changelog` titles.** Two pull
  requests each opened their own Unreleased instead of adding to the one there,
  and the duplicated title came in with the duplicated history. One of each now.

- **A guard, so none of the four can come back.** `publish.test.js` asserts one
  title, one `Unreleased`, `Unreleased` as the first section, and versions in
  descending order. Nothing was looking at this file's structure before, only at
  whether a given version had a heading somewhere in it, which all four defects
  satisfied. Four plants, four failures, and the ordering assertion is the one
  that found the duplicate history in the first place.

### Security

- **The publisher binary is pinned by version and checksum.** The upstream guide
  installs it from `releases/latest/download`, a movable ref, into a job holding
  `id-token: write` for a namespace-wide grant. It is pinned to a version and
  verified against the checksum published for that tag, the same rule every
  action in this repository already follows.

- **The listing runs in its own job, outside `environment: release`.** That job
  downloads a third-party binary and runs it, so it must never share a process
  with `secrets.NPM_TOKEN` or with `contents: write`. It runs after npm and the
  GitHub release are done, so the worst it can do is fail, and a failed listing
  is recoverable by hand while a bad publish is not.

- **`security.test.js` holds all of it**: the job exists, it is gated on the
  same decision the uploads are, it waits before it publishes, the binary is
  pinned and verified, and it is not in the release environment. Seven plants,
  seven failures, and one of them found a hole in the guard itself: the ordering
  assertion used `indexOf` alone, and `-1` is less than every real index, so it
  passed loudest exactly when the step it ordered had been deleted. Presence is
  asserted before order now.

- **The npm URL is encoded, not patched.** `scripts/mcp-registry-preflight.mjs`
  first built it with `.replace('/', '%2f')`, which CodeQL flagged as incomplete
  escaping and was right to: a string pattern replaces the first occurrence
  only, so that line was correct for `@scope/name` by luck of the shape rather
  than by construction. `encodeURIComponent` now. Both spellings answer 200 from
  npm; only one of them is an encoder.

### Changed

- **`docs/releasing.md`** documents the job, the three choices behind it, and
  keeps the manual route as the fallback, now with the 401 (an expired
  device-flow token) alongside the 400 and the 403.

## 1.80.1 — "The capital letter the grant keeps"

### Fixed

- **The MCP registry namespace is case-sensitive, and both files said it
  wrong.** `packages/mcp/package.json`'s `mcpName` and `packages/mcp/server.json`'s
  `name` were `io.github.davmunrey/trazum`. GitHub grants
  `io.github.Davmunrey/*`, the login exactly as GitHub spells it, so the
  publish came back 403 with both strings quoted at each other. Corrected in
  both files.

  This could not be fixed locally. The registry verifies a name by reading
  `mcpName` back out of the package on npm, so the corrected field only counts
  once it is published, and publishing is a release. Hence a version number for
  a two-character change.

### Changed

- **`publish.test.js` derives the namespace owner instead of guessing its
  shape.** The assertion matched the owner segment against `[a-z0-9-]+`, a
  pattern written before anyone here had published to this registry: it encoded
  an assumption about the registry as though it were a rule, and it passed the
  name the registry refused. It now reads the owner out of the `repository.url`
  in `server.json` and asserts `mcpName` starts with `io.github.<owner>/`,
  case included.

  Both plants fire: lowercasing the name in both files fails with the two
  namespaces named in the message, and changing the repository URL's owner
  while leaving the name alone fails as well, which is what proves the owner
  is read rather than hardcoded under a different spelling. Restoring either
  passes.

- **The README's Action pin advances to `12d181a`, the 1.80.0 release commit.**
  Structural lag, as always: the pin can only name a commit that exists.

## 1.80.0 — "The doors somebody else walks through"

### Added

- **DCO sign-off, enforced in CI.** `.github/workflows/dco.yml` walks
  `base..head` on every pull request and fails on any commit without a
  `Signed-off-by:` line, naming the SHA and its subject. The failure prints
  both remedies verbatim: `git commit -s` for work not yet committed,
  `git rebase --signoff <base>` for commits that already exist. A guard that
  fails without a remedy is one people learn to route around.

  Read-only permissions, the plain `pull_request` event, and
  `fetch-depth: 0`, because a shallow checkout would walk an empty range and report
  clean while examining nothing. Merge commits are skipped: GitHub writes
  those itself when a branch is updated from the web.

  Proved by planting the violation, in a scratch repository for the script
  and in the workflow file for the guard: an unsigned commit fails and names
  itself, a sign-off with no address still fails, a merge commit does not
  fire, an empty range passes rather than erroring, and each of the seven
  pinned facts fails when removed. Two of those plants found the guard
  reading the wrong thing rather than the workflow being wrong: `\s+` matched
  the job-level `contents: read` when the top-level one was flipped to
  `write`, and the sign-off assertion was satisfied by a header comment
  rather than by the grep. Both are tightened.

- **A sign-off section in CONTRIBUTING.md**, stating plainly that the DCO is
  a certification of origin and not a copyright assignment, linking the text
  being certified, and giving the reason a single-maintainer project bothers:
  a repository that cannot account for the provenance of its own history
  cannot answer a corporate legal review and cannot change its own licence.
  Guarded, so the document and the workflow cannot drift apart.

  CodeQL flagged that last guard twice, and was right twice. It began as
  `/developercertificate\.org/`, which also matches
  `https://notdevelopercertificate.org/`; anchoring it to the full origin
  fixed that and left the real complaint standing, since an unanchored
  URL-shaped pattern still matches *inside* a longer URL. The subject was
  never a URL: it is a markdown document, and the question is whether it
  links the text. So the assertion is a containment check on the exact link
  target now, with no regex at all. It rejects a bare mention in prose, a
  subdomain impostor, and the domain embedded in somebody else's query
  string, none of which the first version rejected.

- **docs/licensing.md**, for somebody deciding whether to depend on this. It
  answers the three questions LICENSE leaves open: what the licence covers
  today, what will never move out of it, and what it never covered at all.

  The promise it makes is that no analysis this repository can perform today
  moves out of the open set, and the argument is not generosity: the case for
  trusting a figure here has always been that the code producing it can be
  read, so a withheld capability would break the product's thesis before it
  broke its licence. What is not open is anything needing infrastructure
  somebody else operates. None of it exists, and if it is ever built it ships
  proprietary from its first commit rather than being moved out of the open
  set. What is reserved is the name, which the licence has never covered.

  The list of what is open is derived, not typed. `licensing.test.js` reads
  every non-private package manifest plus each shipping surface directory and
  fails when one is missing from the page, checks that every published package
  really declares MIT, pins the three promises by the shape of their claim so
  the prose can be rewritten and the promise cannot vanish with it, and
  asserts the page is linked from the section a deciding reader actually
  reads. This repository has four recorded cases of a hand-typed fact going
  stale (1.51.2, 1.53.2, 1.53.3, 1.60.3), which is why nothing here is typed.

  Proved by planting eight violations: a published package dropped from the
  page, a shipping surface dropped, a brand new package nobody named, a
  package declaring GPL-3.0, each of the three promises reworded away, and the
  page unlinked from the index section. All eight fail, and each names what
  went missing.

  One of those six assertions bounded a section of `docs/README.md` by
  naming the heading that follows it, which is the failure `publish.test.js`
  has ratcheted against nine times before. It caught this one on the commit
  that tracked the file, not before: that guard walks `git ls-files`, so an
  untracked test is invisible to it and the rule bites the moment the file is
  staged. Rewritten to use `sectionOf`, and checked by inserting a section
  between the two headings, which the old form would have swallowed.

  Two open items are named on the page rather than implied: Apache-2.0 is
  under consideration and undecided, and the licences of vendored and
  development dependencies have not been audited. Runtime dependencies outside
  this repository are zero by design and a guard already holds that.

Nothing installable changes: no package code, no command, no flag.


- **`packages/mcp/server.json` and an `mcpName` on the MCP package**, the two
  files the official MCP registry reads. The registry hosts metadata rather
  than artefacts: it records that a name maps to a package on npm and verifies
  the claim by reading `mcpName` back out of that package, so three facts in
  two hand-edited files have to agree.

  `publish.test.js` holds them in the same lockstep as the six version
  manifests, and `docs/releasing.md` names the file in the release checklist.
  The namespace prefix is pinned as well: GitHub authentication grants only
  `io.github.<user>/*`, and a name off that prefix is refused at publish time
  by a registry the maintainer must already be logged into to find out.
  Cheaper to fail in CI.

  Proved by planting six violations: a version left behind in either place,
  `mcpName` removed, the two names drifting apart, both names moved off the
  granted namespace consistently, and a pointer at a package this repository
  does not publish.

  **Publishing itself is not done here.** It needs `mcp-publisher login
  github`, which is the maintainer's account. This is the repository half.

Nothing installable changes: no package code, no command, no flag.

### Changed

- **The Action's one line names both of its gates.** `action.yml` builds two
  argument vectors, `check` against a token budget and `profile` against a
  spend budget, and seven of its eighteen inputs exist only for the second.
  Its description said "Token budget for prompts" and stopped, so the single
  sentence the Marketplace shows described a version that stopped being the
  whole story several releases ago. Every other assertion about this file is
  about its inputs and its script; nothing looked at the sentence on top.

  `security.test.js` now reads the modes out of the script, requires the
  description to name what each one gates, and checks the 125-character limit
  the Marketplace enforces. Proved by planting four violations: the old
  description, the spend gate dropped from the sentence, a description over
  the limit, and a third mode with no phrase pinned for it, which fails
  naming the mode rather than passing quietly.

## 1.79.0 — "The dash the sweep left behind"

### Changed

- **The Spanish catalogues carry no em-dash.** The owner asked for it to
  leave the product; the web app was swept by hand and the terminal was
  not, so `trazum position --locale es` printed two of them in the middle
  of a Spanish paragraph. 338 occurrences are gone from
  `packages/cli/src/i18n/es.ts` and `packages/core/src/i18n/es.ts`, each
  judged one at a time rather than substituted in bulk: an explanatory
  continuation became a colon, an aside a comma, a bracketed clause a pair
  of parentheses, and the two table cells that used a dash as a placeholder
  now say what they mean ("ninguno", "otro", "sin veredicto").
- **English is deliberately untouched.** The em-dash is ordinary English
  punctuation and this product's whole English voice rests on it, from the
  READMEs to `en.ts`. Sweeping one English file and not the rest would make
  the product read as though two people wrote it. If English should follow,
  that is a separate and much larger decision, and it should be asked for
  rather than assumed.

### Added

- **A guard, so the sweep is a rule instead of an edit.** `i18n.test.js`
  walks the repository for every `i18n/es.ts`, asserts it found at least
  three so it cannot pass by finding nothing, and fails on an em-dash in
  any of them with the file and line named. It checks **both spellings**:
  the literal character and the `\u2014` escape. That second half is not
  defensive tidiness. The first version of this sweep searched for the
  character alone and reported the catalogue clean while 32 escaped
  em-dashes sat in it, one of which was still printing in Spanish; the
  test suite caught it, and the guard now covers what the sweep missed.

### Fixed

- Six Spanish assertions in the CLI suite that pinned the old punctuation.
  Nothing about them was wrong: they were doing their job, which is why the
  sweep could not land quietly.

## 1.78.0 — "A sentence no locale could reach"

### Changed

- **The position document carries codes, not sentences.** Its three
  sibling documents already state the rule in the contract itself:
  "codes rather than prose so a consumer can branch and the renderings
  carry the sentences". This one baked English paragraphs into the
  document, and the first Spanish run showed exactly what that costs — a
  localized heading over an untranslated block. `cannotSay` is now
  `session-limit-at-the-doors` and `no-ceiling-configured`, and both the
  terminal and the web app carry the sentence in the reader's language.

  **This is a document contract change.** A consumer reading
  `cannotSay` as display text gets codes now; the sentences moved to the
  renderings, where the same consumer can no longer be broken by a
  reworded caveat. `docs/json-output.md` is updated in the same commit.

### Guarded

- The document's own guard asserts every entry matches `^[a-z][a-z-]*$`:
  the property the prose version could never have, since a space is the
  cheapest evidence of a sentence. And the web suite holds the join both
  renderers depend on — every code core can emit has a sentence in both
  locales, so a new code can never reach a visitor as a bare slug.

## 1.77.1 — "The folder name stands"

### Fixed

- **An alias that survived only the bundled catalogue.** Two functions
  built a catalogue index and 1.77.0 taught aliases to one of them, so a
  dated model id priced correctly until somebody passed `--pricing-live`
  and then eight calls quietly left the totals. Found by running 1.77.1
  against a real bill: 10,238 calls became 10,230. There is one index
  builder now, `indexModels`, and the guard prices the same id through the
  bundled catalogue, a live-shaped feed and a hand-written overlay.

- **An overlay declaration silently discarded.** The same change made
  membership tests see aliases, so an overlay declaring an id that is
  another model's alias was neither patched nor added: an operator stated
  a price and nothing happened, without a word. Membership is tested by
  real id now, and an explicit declaration outranks a convenience alias.

- **Two small ones from the same session.** `trazum switch` printed an
  ASCII `->` where every other report prints `→`, and an unknown-option
  error listed a command's own flags twice when they overlapped the global
  ones. A refusal that stutters reads like a tool unsure of what it takes.

- **A decoding presented as a fact, when the encoding could not support
  one.** 1.77.0 labelled by the last segment of a Claude Code project
  folder, on the theory that its `/`-as-`-` path encoding could be undone.
  It cannot: **both `/` and `-` map to `-`**, so nothing in the folder name
  says which dashes were separators. The first real run found it in
  minutes: `-Users-mac-ai-job-search-ai-job-search` was labelled `search`
  and `-Users-mac-Desktop-Pulse-Coffee-pulse-coffee` was labelled
  `coffee`, two projects renamed to a word that was never their name, with
  a report then attributing money to them.

  The folder name now stands as it is, minus the leading separator. It is
  longer than the guess and it is the one thing here that is certainly
  true: a reader can find the folder it names. Both real folders are
  fixtures in the suite now, asserted by the wrong labels they must never
  produce again.

## 1.77.0 — "The agent's bill, told honestly"

### Added

- **A dated id prices as the model it is.** [The 1.77
  plan](docs/plan-1.77.md): `ModelPricing` gains `aliases`, and the
  catalogue indexes every alias beside its id, so
  `claude-haiku-4-5-20251001` — the canonical API id, while the catalogue
  lists the short form a person recognises — stops landing in `unpriced`.
  Declared one line at a time, **never derived**: a rule that stripped
  anything resembling a date from an id would be a machine guessing that
  two ids bill alike, which is the one guess this product does not make.
  An id that merely resembles a known one is still unknown, and the guard
  says so in both directions.

- **`stop_reason`, carried at last.** The transcript records it on the
  assistant message and the converter never read it, so truncation, the
  retry bill and the coverage gate all answered "cannot be measured" about
  a log whose own source knew. Read and emitted now, and nothing is
  inferred: a turn without the field still produces a record without it.

### Changed

- **A folder of projects is a folder of workloads.** For a directory
  target, `from-claude-code` labels by project folder by default, with
  `--no-label-from-project` to decline and `--label` still winning. A
  single file is untouched: one file is one workload only if the caller
  says so. The flag has existed since the folder walk did and nobody found
  it, which is why a real forty-day run produced a label on 0 of 10,393
  records and the report could then only describe a mixture. The web app's
  folder drop has labelled by project since 1.70; the two surfaces
  disagreed about the same gesture.

- **The label is the decoded project name.** Claude Code names those
  folders by encoding the project's absolute path, `/` becoming `-`, so
  `-Users-mac-Trazum` is a path wearing a costume. The last segment of the
  encoding is the project's own directory name, which is the word a person
  would have chosen; the raw folder name stands whenever decoding would
  leave nothing.

### Fixed

- **`<synthetic>` is not a model.** Claude Code writes it for turns it
  produced locally — interrupts, error notices — which carry a usage
  object of zeros that no provider ever billed. Priced, they were noise in
  the totals; they are excluded **by name** now, counted, and reported.
  Matching the exact string rather than anything in angle brackets is
  deliberate: a pattern that swallowed an oddly-named real model would
  delete spend from a bill without saying so.

### Changed

- **No em-dash reaches a visitor.** Two hundred and seventy-one of them
  removed from copy somebody reads: 123 in the English dictionary, 94 in
  the Spanish, 45 across the landing page's five languages, nine in
  components and route bodies. Not a find-and-replace: an em-dash does
  four different jobs and each wanted a different repair, and about
  thirty strings had to be reshaped into two sentences because the
  alternative was a comma splice or a second colon in a line that
  already carried one. Spanish got Spanish punctuation rather than
  translated English punctuation. Scope is what a visitor can see; the
  em-dashes in code comments stay, because they are source rather than
  app. Verified from the rendered page rather than from a grep: the
  landing page and the Spanish app were loaded in a browser and their
  text searched. The whole suite stayed green without touching a single
  assertion, which is what "match on ids, not on prose" buys.

### Fixed

- **A sign-in that was built, working and invisible.** With no GitHub
  app configured the header renders nothing, which is the honest
  rendering for a visitor but left the operator with no signal at all:
  no button, no error, no line to read, and therefore no way to tell a
  deployment deliberately running anonymous from one misconfigured.
  `authConfig` already computes a one-line reason for exactly this
  moment and `/api/auth/session` dropped it on the floor; it is returned
  now. It names environment variables, never their values, and those
  names are in the public documentation. The header still renders
  nothing: absence remains the right answer for a visitor, and only the
  endpoint an operator can curl gained one.

- **The CLA gate, corrected by the API rather than by reasoning.** Its
  first live runs failed three pull requests, and each failure taught
  something the previous reading had got wrong. The action does not
  create the branch it writes signatures to, so `cla-signatures` had to
  exist first. Then: it resolves a committer as `commit.author.user ||
  commit.committer.user || commit.author || …` and compares `login ||
  name` against each allowlist pattern **exactly**, case included. The
  source suggested the capitalised commit name, because the agent's
  commit email looked like one no account would own — but GitHub
  resolves `noreply@anthropic.com` to the account `claude`, so the
  lowercase login is what arrives, and `Claude !== claude`. Asking the
  commits API what identity it actually reports is what settled it. Both
  spellings are listed now: the login for today, the commit name for the
  day that email is unlinked.

- **A default nobody chose.** `lock-pullrequest-aftermerge` is true
  unless set, which locks the conversation on every merged pull request.
  It is explicitly false: a merged PR is still where somebody asks why a
  change was made.

### Guarded

- The allowlist is pinned to the identities that actually commit here,
  and the locking value must be stated rather than inherited
  (`security.test.js`). A misconfigured gate does not degrade
  gracefully — it blocks every pull request and blames the contributor
  rather than the line that is wrong. Verified as a detector: removing
  an identity turns the test red.

## 1.76.0 — "The tour that does the work"

### Added

- **The tour stopped describing and started doing.** [The 1.76
  plan](docs/plan-1.76.md): each step, as it opens its tab, performs the
  thing its card is talking about — the sample prompt optimised in front of
  the visitor (through the Optimiser's own auto pass, out of their
  history), the comparison run over the pair on screen, the sample month
  priced in Bill exactly as a paste would, and the terminal **typing** real
  commands character by character and executing them through the same path
  the visitor's Enter uses. The walk grows from seven steps to ten: the
  playground's one step becomes three (`trazum profile usage.jsonl`,
  `trazum optimize prompt.txt`), and a new "the CLI, complete" step closes
  the loop with `trazum position usage.jsonl` and the one line that
  installs the other forty-two-command reality. Copy rewritten in both
  locales to say what just happened rather than what would.

- **The demo bus** (`lib/demo.ts`): a typed union and a module-scoped Set —
  no DOM, no React, no `window` events. The tour dispatches; the component
  that owns the page decides what the action means, through its existing
  run path, with a latest-ref so a dispatch always sees today's state.

- **The typing hand yields.** A visitor keystroke or edit cancels the hand
  mid-word and their input wins — it is their terminal. Reduced motion
  types instantly. A hand still writing when the tab unmounts is cancelled
  with it.

### Guarded

- **Every demo is real** (`tour.test.mjs`): each `playground-run` line is
  executed in the test against the shipped samples and must answer — a
  renamed sample or broken invocation fails in CI, not in front of a
  first-time visitor. Demo dispatch exists only in the Tour's step effect
  (grepped across every other component), the cancel contract is pinned in
  two places, and the bus is held to the no-fetch invariant.

### Fixed

- **The CLA gate's first live run found two defects**: the action does not
  create its signatures branch (`cla-signatures` now exists), and the
  repository's own agent — committing as "Claude" under the owner's
  account — was not allowlisted, so every PR would have demanded a
  signature from a name that cannot sign. Allowlisted — and verified
  against the action's source rather than guessed: it compares
  `committer.login || committer.name`, and this agent's commits carry an
  email no GitHub account owns, so the raw name is what the pattern must
  match. Reading that source also surfaced a default nobody chose,
  `lock-pullrequest-aftermerge: true`, which locks the conversation on
  every merged pull request; it is now explicitly false, because a merged
  PR is still where somebody asks why a change was made.

### Changed

- **The README became the front door it claimed to be.** Four thousand
  lines answered every question in one file and therefore none quickly;
  now the README holds the thesis, the forty-two-command table, the first
  five minutes, the surfaces, the models, the limitations and the privacy
  answer — and the deep chapters moved verbatim to
  [`docs/commands.md`](docs/commands.md), anchors preserved, every link
  re-pointed and machine-checked. Nothing was cut: the same prose exists,
  one page over, and the README says so where each chapter used to be.

### Added

- **The Contributor License Agreement, gated in CI.** `docs/cla/CLA.md` — an
  individual CLA whose preamble says what it is for: the project stays MIT,
  contributors keep their copyright, and the maintainer receives a licence
  broad enough (sublicensing and relicensing included) that future modules
  under other terms never need a per-contributor permissions hunt. Signing
  is one sentence in the pull request, recorded by
  `contributor-assistant/github-action` into `.github/cla-signatures.json`
  on its own branch; maintainer and bots are allowlisted. The workflow is
  the repository's one argued exception to the `pull_request_target` ban —
  it checks out nothing, and the security guard now pins exactly that: the
  exception exists only for `cla.yml`, only while no checkout appears in
  it, and the guard fails if the file leaves or the event does.

## 1.75.0 — "The readable terminal"

### Added

- **The style module.** [The 1.75 plan](docs/plan-1.75.md):
  `packages/cli/src/style.ts` — the six painters moved out of `index.ts`
  unchanged, and around them what eleven hand-built tables had each rebuilt
  badly: `visibleWidth` (a string's width with its ANSI codes not counted —
  every hand-rolled `padStart` miscounted the moment a painted cell reached
  it), `padCell`, one `table` renderer with per-column alignment and dimmed
  headers, `bar` (a share the line already states, as `█████░░░░░`, printed
  for a pipe too because it is content, not paint), and `sectionHeading`
  (the heading bold, completed to the report's width with a dim rule — an
  anchor line a scrolling eye can stop on). Colour detection gained one
  door: `FORCE_COLOR=1` paints under a pipe, because the guard below needs
  to see colour to strip it. `NO_COLOR` still wins in a terminal; a bare
  pipe still gets plain bytes.

- **Fifty-four section headings ruled, three reports barred.** The profile's
  spend split, its per-label and per-model rows each carry the proportion
  bar beside the percentage they already stated; the split rows stopped
  being dimmed wholesale — the money split is data, not provenance. Every
  section heading across the CLI's reports — profile, optimize, models,
  init, switch, rollup, position, and the rest — gets the rule. The two
  `where` headings that are sentence fragments flowing into their answer
  ("Prompts in X go to…") stay bold and unruled on purpose: a rule in the
  middle of a sentence reads as the sentence's object.

- **`trazum models` through the shared renderer.** The first consumer of
  `table()`: same columns, same figures, dimmed header, alignment measured
  ANSI-aware.

### Guarded

- **Colour adds nothing, and hides nothing** (`style.test.js`). The same
  command runs painted (`FORCE_COLOR=1`) and plain (`NO_COLOR`), the ANSI
  codes are stripped from the painted run, and the two must be
  byte-identical — decoration that does not survive the strip is content
  hiding in a channel a pipe cannot see, and content that survives only
  when painted is the same defect mirrored. A second assertion keeps the
  pipe plain: no ANSI ever reaches a non-TTY without `FORCE_COLOR`, which
  is also the guard on every other test's regexes. A third pins the rule
  and the bar as content: they must appear in the plain run too.

### Changed

- Nothing installable beyond the above: no new figures, no reworded
  sentences, no reordered sections, no dependency. A reader who memorised
  the plain report reads the painted one with the same memory — that
  sentence is now a test rather than a promise.

## 1.74.0 — "Any model's money"

### Added

- **Bring your own price card, in the browser.** [The 1.74
  plan](docs/plan-1.74.md): the Bill tab accepts a dropped or pasted pricing
  document, two shapes detected not configured — the overlay JSON the
  config's `pricing` key takes (through the real `parsePricingOverlay`, so a
  malformed card refuses with the parser's own sentence in the banner), and
  a raw OpenRouter `/models` response transformed in the page by the pure
  `openrouterOverlay` — the same transformation the CLI runs on a live
  fetch, run here on a file, no-fetch invariant intact. From there every
  figure in the tab — the profile, the levers, the what-if, the context
  pressure — prices Qwen, Llama, or the model only your company runs. A
  banner names how many models the card touched and how many are new, and
  clearing it restores the bundled snapshot and re-prices in place.

- **`trazum switch` — the forty-first command.** The decision every what-if
  serves, priced: the reprice-backed delta with its sign said in words, the
  movable calls, the over-context and already-on-target money named, the
  measured window, break-even as a declared `--migration-usd` over the
  measured daily saving — division on the past, denominator attached, with
  both refusals rendered by name (`no-saving`, `no-clock`) — and, with
  `--cases`, the evaluation the switch requires priced at the log's own
  mean call, two calls on the incumbent and one on the candidate per case,
  because the cost of knowing the cheaper model is good enough is part of
  the cost of switching. Every rendering ends on the refusal: quality is
  `trazum route`'s verdict, and the command to get it is printed.

- **`trazum ownrate` — the forty-second.** A self-hosted model's $/MTok
  derived from the operator's own declared numbers — GPU dollars per hour
  over measured tokens per second at a declared utilisation — with the
  pricing-overlay snippet printed ready to paste, complete on purpose: the
  first draft omitted `cacheMinTokens`, `tier` and `capability`, the overlay
  parser rightly refused it, and a round-trip guard now proves the snippet
  pastes (`parsePricingOverlay` accepts the command's own output whole). The
  unknowns are declared as the catalogue's own `unknown`/`null`, never
  guessed.

### Honest gaps, stated

- **No quality column, anywhere in this arc.** Cost is arithmetic; quality
  is an evaluation that costs provider calls. The bridge — dropping a
  `route`/`eval` verdict into the Bill tab so quality stands beside cost —
  is named as the natural 1.75 and not built here.
- **No forecast in the break-even.** It divides a declared cost by a
  measured rate and says over how many days that rate was measured. A log
  with no timestamps has no rate, and the answer is the `no-clock` refusal
  rather than an invented calendar.
- **The sign convention crossed a boundary and was caught.** `repriceProfile`
  carries `target - current` (negative is cheaper); `switchAnalysis` states
  `savingUsd` with its own name and proves it in both directions, because a
  sign read across that boundary ships a break-even for a switch that loses
  money.

## 1.73.1 — "The result follows the scenario"

### Fixed

- **Changing the model re-prices the Optimizer's answer.** The result panel
  held whatever the last press of Optimise computed, so flipping the model
  selector left a report priced for another model on screen, labelled with
  the old name — a reader comparing models saw "nothing changes" (the token
  reduction *should* not change: the rules are deterministic text transforms
  and the counter is one heuristic, deliberately not a per-vendor
  tokenizer). Now, once a result exists, a change to the scenario — model,
  calls, output tokens, cache hit rate, batch, level, reorder — re-runs the
  free deterministic pass, debounced, so the dollars and the advisories
  follow the selector. Two refusals hold the shape: the auto-run never fires
  before the reader's first Optimise, and never while the LLM or suggestion
  pass is enabled — a dropdown change must never spend a provider call
  unasked. Automatic runs also stay out of the reader's history.
  `optimizer-reprice.test.mjs` pins all four properties.

### Added

- **The `humanizer` skill, vendored.** From
  [blader/humanizer](https://github.com/blader/humanizer) at `e2e92e7`, MIT:
  thirty-five patterns of AI-sounding prose and a two-pass rewrite
  discipline, covering the one lane no vendored skill covered — the
  human-facing English this repository writes constantly. Vendored as
  `SKILL.md` only, into the **tracked** `.claude/skills/` tree with a new
  `VENDORED.md` registry, because the earlier vendoring round's registry
  lived under the gitignored `.agents/` and survived nothing. The registry
  carries the style caveat (the skill's em-dash and bold-label rules lose to
  this repository's voice sample) and records one idea adopted without
  vendoring, from addyosmani/agent-skills: reviews get the artifact and the
  contract, never the conclusion.

## 1.73.0 — "The guided tour"

### Added

- **A guided tour of the five doors, offered not imposed.** [The 1.73
  plan](docs/plan-1.73.md): a first visit gets a one-line dismissible offer
  above the lede, the rail's resources group gains a permanent launcher, and
  the tour itself is a dimmed page, one ringed panel and a card — welcome,
  then optimise, write, compare, the bill and the playground, each step
  opening the tab it describes and saying what question that door answers,
  ending where the visitor can type their first command. Steps are data
  (`lib/tour.ts`), copy is dictionary (`t.tour`, both locales), and the
  overlay is this repository's own ~180 lines rather than a tour library: a
  ring whose box-shadow is the backdrop, a card that positions below or
  above the target and centres when there is no target on screen — which is
  what a phone gets. `Escape` leaves, focus travels with the card, the step
  body is announced politely, and the one scroll respects
  `prefers-reduced-motion`. Tabs became controlled in `App` so a step can
  open its door; the first-visit flag lives under `trazum:tour-seen`, read
  and written behind try/catch like every storage access here.

### Honest gaps, stated

- **The tour never auto-plays.** Software that grabs the mouse on arrival
  has taught the visitor the wrong first lesson; the offer is a banner with
  a start button, the suite asserts no effect opens the overlay, and the
  Library tab — signed-in only — deliberately has no step.
- **No analytics on tour progress.** Where a visitor left the walk is a
  number this product does not collect, the same as every other number about
  the visitor.
- **`tour.test.mjs` holds the joins:** the no-fetch invariant over both new
  files; every ringed step's `data-tour` anchor exists in some component
  source, with the planted-absent anchor proving the detector can fail;
  every step speaks both locales with genuinely different words; every step
  opens a tab `App` renders and every public door has a step; the storage
  accesses sit inside try/catch; and the reduced-motion branch picks instant
  scrolling.

## 1.72.0 — "The playground"

### Added

- **A terminal in the web app, running the CLI's pure subset.** [The 1.72
  plan](docs/plan-1.72.md): a new Playground tab holds a quote-aware
  tokenizer, a command registry and an in-memory file map seeded with sample
  files — a deliberately wasteful `prompt.txt`, a measured `usage.jsonl`
  month, an OTLP GenAI `spans.otlp.json`, a Claude Code `transcript.jsonl`
  and a `trazum.config.json` ceiling. Ten commands run in the page through
  the same `@trazum/core` functions the CLI imports — `models`, `rules`,
  `optimize`, `check`, `profile`, `position`, `diff`, `semantic` (the
  structural half), `from-otel` and `from-claude-code` — plus `ls`, `cat`,
  `clear` and `help`. Converter output written with `-o` lands beside the
  samples, so the whole 1.71 pipe runs in front of the visitor:
  `trazum from-otel spans.otlp.json -o converted.jsonl`, then
  `trazum profile converted.jsonl`. Arrow-key history, both locales, and a
  clock pinned inside the sample month so the demo does not decay with the
  calendar. Nothing is uploaded and nothing is fetched.

### Honest gaps, stated

- **The other thirty commands are named as CLI-only, not hidden.** `help`
  ends on where they live — anything needing a network, a credential, the
  filesystem or a running process (`gateway`, `serve`, `watch`, `connect`,
  `eval`, live pricing) belongs to the installed CLI, and typing one gets
  that answer rather than silence. The LLM half of `semantic` and
  `optimize`'s model-assisted pass stay where the credential lives.
- **`playground.test.mjs` holds the invariants:** the no-fetch guard covers
  both new files; every advertised command runs against the samples in both
  locales and says something; the `from-otel → profile` loop is proven end to
  end; and a prompt planted in the OTLP sample is grepped out of every
  conversion and every priced output — `cat` legitimately shows the file's
  own text, the conversions never carry it.

### Fixed

- **`github/codeql-action` bumped to 4.37.8, both halves in one commit.**
  Dependabot raised init and analyze as two pull requests (#417, #418) and
  each alone fails the guard that keeps every sub-action of one repository on
  the same commit — by design. Superseded both, the way the workflow's own
  comment instructs.

## 1.71.2 — "The README the npm page never showed"

### Fixed

- **The npm page for every package now shows its README.** The release
  workflow published each package with `npm publish -w @trazum/<pkg>` from the
  repo root. That builds the tarball with the README inside it (`npm pack
  --dry-run` confirmed the file was there), but leaves the `readme` field of
  the version metadata empty, so npmjs.com rendered "This package does not have
  a README" over a package whose tarball contained one. 1.70.0, 1.71.0 and
  1.71.1 all shipped that way. Each package is now published from its own
  directory (`working-directory: packages/<pkg>`), which is what makes npm read
  the README into the metadata. Provenance is unaffected. The fix only reaches
  npm from this release forward; the already-published versions cannot be
  amended.

### Guards

- **`publish.test.js` now forbids `npm publish -w` in the release workflow** and
  asserts each package is published from its own directory with `--access
  public` and `--provenance`. The old guard matched `npm publish -w ...` to
  count the steps, so it would have gone green on the exact bug; it now checks
  the shape that keeps the README, with the `-w` form proven to fail it.

## 1.71.1 — "The help, in the language it was asked in"

### Fixed

- **`trazum --help --locale es` documents `from-claude-code` and `from-otel`
  again.** The Spanish help is one large per-locale template, so the type
  system cannot catch a command a translation forgets. `from-claude-code` (from
  1.69) and `from-otel` (from 1.71) were both absent from the Spanish USAGE
  block and had no `OPCIONES DE` section, so a Spanish reader could not learn
  from `--help` that the two conversion commands exist. Both are now in the
  USAGE block and each has its options section, translated. The error messages
  for those commands were already localised; the gap was only the help text.

### Guards

- **`help-enumerations.test.js` now runs the help in every reviewed locale, not
  just English.** The existing suite proved the English help lists every command
  and gives each one an options section, but it only ever spawned the English
  help, so the Spanish hole went unseen. It now asserts USAGE parity and an
  options section per flag-bearing command for each locale in `LOCALES` beyond
  English, and carries a planted Spanish USAGE block missing a `from-` line to
  prove the check fails on the shape it was written for.

## 1.71.0 — "The universal cost lens"

### Added

- **`trazum from-otel`: the cost lens over OpenTelemetry.** [The 1.71
  plan](docs/plan-1.71.md) generalises the `from-claude-code` pattern to the
  standard the ecosystem is converging on. A new core `otelRecords(text)`
  reads the OTLP/JSON any GenAI exporter produces — one document or
  newline-delimited spans — and turns each LLM-call span into a usage-log
  record: the model (`gen_ai.response.model` or `gen_ai.request.model`), the
  timestamp (`startTimeUnixNano`), a label (the span's `gen_ai.operation.name`
  or the resource's `service.name`, so a per-service bill falls out), and the
  input/output token counts. Spans that are not LLM calls are counted and
  skipped, never priced. The **fortieth command** walks a file or directory of
  `.json`/`.jsonl`/`.ndjson`, writes the usage log to `-o` or stdout, and
  reports on stderr how many spans were LLM calls, how many were skipped, and
  how many carried no cache data. `--label-from-service` labels by the
  resource's `service.name`. This makes Trazum complementary to every
  observability tool — LangSmith, Helicone, LiteLLM — reading whatever
  telemetry a team already emits rather than competing with the tool that
  emits it.

- **The web Bill tab reads OTLP too.** The folder drop gains a third arm: a
  dropped OpenTelemetry export is detected by `looksLikeOtel` and converted in
  the page with `otelRecords`, priced beside any transcripts and usage logs in
  the same drop — *drag your OpenTelemetry export onto Trazum* joins *drag your
  ~/.claude/projects*. No fetch, same invariant. The ingest banner names how
  many LLM spans were priced, how many non-LLM spans were skipped, and how many
  carried no cache data. Both locales.

### Honest gaps, stated

- **No cache TTL split, because OTel has none.** OpenTelemetry has not
  standardised the cache-write TTL split, so an OTel-sourced record carries no
  `cache_creation` object and the cache verdicts read *cannot tell* rather than
  a fabricated one — the same refusal as inventing a price. Cache reads are
  taken only where a `gen_ai.usage.cache_read_input_tokens`-shaped key is
  actually present. The converter says so on stderr and the documentation states
  it plainly.
- **Nothing but the numbers crosses.** Prompt and completion content, trace ids
  and every other span attribute stay in the span; `otel.test.js` plants a
  prompt and a trace id in a fixture and greps the whole conversion output for
  them, the same privacy proof the transcript converter carries. The
  `from-otel` CLI suite and `folder-ingest.test.mjs` extend it to the run and
  the web arm.
- **Vendor converters not guessed at.** LangSmith, Helicone and LiteLLM are
  named as next, not built now: a converter for a documented-but-unseen format
  is an estimate wearing a parser's clothes. Each ships when a real export of it
  is seen.


## 1.70.0 — "One drag"

### Added

- **The landing speaks five languages.** English and Spanish — the two this
  project has reviewed — plus machine-drafted French, German and Portuguese,
  so the marketing surface reaches the world while the tool keeps making its
  precise claims only in the languages a human has checked, the same split
  `maintainers.ts` draws for the trimming dictionaries. The unreviewed
  languages carry a visible note — *machine-drafted, not reviewed by a native
  speaker; a correction is one GitHub issue away* — and the landing keeps its
  own locale storage key, so a French visitor reads a French landing and
  lands in the English tool rather than being pushed into a half-reviewed
  one. Completeness is compiler-enforced (a missing key does not build);
  `marketing.test.mjs` pins the five locales, the unreviewed notes, and the
  separate key. German and Portuguese for the app's own chrome are now a
  fill-in-the-blanks contribution the type system completes; the tool's
  precise reports stay en/es until a reviewer for another language exists.
  On **more LLM vendors**: the bundled price table is a reviewed snapshot,
  and inventing a price would be this product's one unforgivable sin — so
  coverage beyond it stays where it already is, the live OpenRouter overlay
  (`--pricing-live`), which prices hundreds of models across dozens of
  providers as published data and adds no caching advice it cannot source.

- **One drag: your ~/.claude/projects folder onto the web app.** [The 1.70
  plan](docs/plan-1.70.md): the Bill tab's drop zone now accepts a folder,
  descends it for transcripts (`webkitGetAsEntry` on drop, a
  `webkitdirectory` picker as the alternative), and converts every one in
  the page with the 1.69 converter — labelled by its project directory, so
  the per-project bill appears by itself — priced beside any usage logs in
  the same drop. A new core `looksLikeClaudeCodeTranscript` routes each
  file (keyed on the `type: 'assistant'` envelope carrying `message.usage`,
  not the word "assistant", so a usage log labelled `assistant-work` is not
  mistaken for one), and a banner above the report says what was converted,
  collapsed and streamed, ending on the sentence that earns the feature:
  the transcripts were read in this tab, the numbers kept and the words
  not. No install, no upload, no third step — the whole 1.69 pipe collapsed
  to a gesture. `claude-code.test.js` gains the detector's both-direction
  fixtures; `folder-ingest.test.mjs` holds the no-fetch invariant with the
  new code inside it, proves a mixed folder-plus-log drop prices as one
  bill with three labels, and confirms the planted transcript words never
  cross into the priced stream. Both locales; verified live.

- **A landing, sold the way the product measures.** `/landing` is the
  product's one Persuade surface: a scrollytelling story
  (IntersectionObserver reveals that are never attached under
  `prefers-reduced-motion`), the four doors, and three figures that are the
  product's own output with their sources named — no testimonials, no logo
  wall, no projection. Both locales from a page-local typed dictionary,
  sharing the app's locale storage key (one product, one language choice),
  held by `marketing.test.mjs`: no fetch, reduced motion respected,
  measured figures pinned, external links rel-protected — and **no price
  anywhere**, guard-enforced: a pricing page was built alongside and
  removed the same day by the owner's call. The project stays open source
  for now, and the guard keeps a euro figure or a pricing route from
  creeping back without a decision.


### Changed

- **The storefront caught up with the product.** The README's web-app
  screenshots dated from 2026-08-12 — before the redesign, the grouped
  rail, the resource links and the Position card existed — and the live
  demo born today was linked from nowhere. Both hero screenshots retaken
  at 2x from the current production build (light and dark, alt text
  updated to the figures actually on screen), and the README now links
  **[trazum.vercel.app](https://trazum.vercel.app)** at the top with the
  one sentence that matters: nothing you paste leaves your browser.

- **Pricing a record stopped re-deriving the price table's answers.**
  `effectivePricing` and `multipliersFor` run once per record when a usage
  log is priced, and a `--cpu-prof` over a 200k-line profile showed the
  first of them alone burning 0.7 of the 2.4 seconds — almost all of it
  parsing the promo's end date with `new Date(...)` 200,000 times. Both are
  now memoised per model (a `WeakMap`, so an overlay's models are collected
  with the overlay; results frozen, so a caller mutating a shared answer
  throws where the mutation is instead of corrupting every later read).
  Behaviour is unchanged to the millisecond — `on` still decides whether
  the promo applies on every call — and 2,847 core+CLI tests hold it.
  Measured, not estimated: the bench's `profile-200k` ratio fell from
  10.01 to 8.74 on this machine, and a single-model synthetic 200k-line
  profile from 2,660ms to 1,923ms (−28%). The web app's Bill tab inherits
  the same speedup unchanged, because it prices with the same functions in
  the browser. Startup and `optimize-1mb` were profiled too and
  deliberately left alone: the module-graph compile dominates startup, and
  a refactor of the CLI's import graph is not worth 150ms — said here
  rather than half-done.

### Fixed

- **The web app builds on Vercel.** `output: 'standalone'` — added for the
  Docker/N0 image — breaks Vercel's build, whose pipeline does its own file
  tracing (`ENOENT` on `.next/next-server.js.nft.json`; found by deploying
  a demo, not by reading about it). The flag is now conditional on not
  running under Vercel (`VERCEL=1` is set in every Vercel build), so the
  container image, the N0 manifest and the local standalone preview keep
  exactly the output they had, and Vercel gets the default output its
  platform expects. A Vercel project linked to this repository redeploys
  the demo from `main` on every merge.

## 1.69.0 — "The agent's own bill"

### Added

- **The agent's own bill — `trazum from-claude-code`.** [The 1.69
  plan](docs/plan-1.69.md)'s arc: the thirty-ninth command turns the
  transcripts Claude Code already writes under `~/.claude/projects/` into a
  usage log, so `profile`, `position`, the gates and the web tab price the
  agent's sessions without instrumenting anything — and without reading
  what was said. The conversion (`claudeCodeRecords` in core, pure) takes
  model, timestamp, session id and the API's own `usage` object — the
  `cache_creation` TTL split included, which feeds the TTL-fit verdict
  directly — and nothing else: a fixture plants a secret in the message
  text, the `cwd` and the branch name, and the suite greps the entire
  output for each. Measured before designed: one API call is written as
  one line per content block (25,490 lines → 16,079 calls on a real
  session — counting lines overbills by a third), so records deduplicate
  by `requestId` keeping the last line; and a first run over a whole
  project found 311 calls whose lines differ only by counts growing —
  responses captured mid-stream — which the converter counts as `streamed`
  without alarm, reserving `disagreements` for what streaming cannot
  explain. The first draft alarmed on both; that was the message crying
  wolf about the norm. Everything collapsed or passed over is summarised
  on stderr, never silently. Along the way a guard hole closed: the
  README's command-count guard mapped number words only up to thirty-two,
  so every claim above it had been silently skipped since the
  thirty-third command — the table now reaches forty-four and the
  `COMMAND_FLAGS` parsers learned quoted, hyphenated keys, of which
  `from-claude-code` is the first. Both locales; project and plugin skills
  teach the pipe.

- **Trazum is a Claude Code plugin, from this repository.** `claude plugin
  marketplace add Davmunrey/Trazum` then `claude plugin install
  trazum@trazum` installs the `trazum` skill and the MCP server together.
  The plugin's skill is *derived*, not duplicated:
  `scripts/build-plugin-skill.mjs` produces it from the project's own
  `.claude/skills/trazum/SKILL.md` with exactly two transforms — the
  invocation becomes `npx -y @trazum/cli` and the in-repo build section is
  replaced — and `claude-plugin.test.js` runs the same derivation and fails
  the build on any other difference, so a hand edit to the plugin copy
  cannot survive. The plugin manifest's version joins the manifests'
  lockstep (releasing.md updated), the marketplace card and the plugin
  describe themselves with one sentence held equal by the guard, and the
  MCP config reaches `@trazum/mcp` through the registry with no env block —
  there is no secret this server needs, and a committed env value is how a
  credential ends up in a marketplace. Submission to
  anthropics/claude-plugins-community goes through Anthropic's review form
  (direct PRs there are auto-closed); the repository is ready for it as it
  stands.

- **Three more vendored skills, eight repositories triaged.** From
  mattpocock/skills (MIT): `tdd` (the red-green loop with tests worth
  keeping), `diagnosing-bugs` (a phased discipline for hard bugs) and
  `writing-for-agents` (how to write documents agents consume — the craft
  behind every SKILL.md in this directory). Its `code-review` skill stays
  out: its name collides with the harness's built-in `/code-review`, and
  vendored files are never edited here. The other seven repositories
  reviewed the same day (public-apis, apache/maka, volcengine/OpenViking,
  basecamp/omarchy, akitaonrails/ai-memory, block/buzz,
  anthropics/claude-plugins-community) carry no vendorable skill content
  that serves this repository — products, platforms and lists, orthogonal
  to a prompt-cost tool; claude-plugins-community is noted in VENDORED.md
  as a distribution channel for Trazum's own plugin, an owner's decision.
  All recorded with source commit and license in `.agents/skills/VENDORED.md`.

- **Three vendored skills, and the provenance said out loud.** The agent
  skill set under `.agents/skills/` grows `karpathy-guidelines` (behavioural
  guardrails against LLM over-engineering — surgical changes, simplicity
  first, verifiable success criteria; MIT, from
  multica-ai/andrej-karpathy-skills), plus `ui-styling` and `design-system`
  from nextlevelbuilder/ui-ux-pro-max-skill (MIT) — the two sub-skills that
  serve `apps/web`'s actual stack (shadcn/radix + Tailwind, token
  architecture); the rest of that repository (Gemini logo generation,
  banners, slides, social photos) was deliberately left out as off-mission.
  A new `.agents/skills/VENDORED.md` records source repository, commit and
  license for what was added, verifies the already-vendored taste-skill
  family byte-identical against its upstream (twelve directories, zero
  drift), and names what was *not* done: an `impeccable` refresh, whose
  sanctioned path (`npx impeccable update`) this environment's permission
  policy blocked — a hand-assembled partial sync of an installer-generated
  layout would be worse than the drift.

## 1.68.0 — "The browser catches up"

### Added

- **The position, in the tab — the fourth door.** [The 1.68
  plan](docs/plan-1.68.md)'s first three chapters: the Bill tab grows a
  Position card that renders the 1.67 `PositionDocument` in the browser —
  every configured ceiling with its measured spend, window, denominators and
  verdict; the distance line as division labelled as division, rendered only
  when `positionReport` granted it (never re-derived — a guard proves the
  card cannot restate arithmetic the document withheld). The ceilings come
  from the reader's own `trazum.config.json`, pasted and read by the same
  `parseConfig` the CLI uses — same validation, same error sentences,
  verbatim; a config that validates but configures no ceilings is told so
  rather than shown an empty report. Both locales, with the CLI catalogue's
  own sentences word for word. Nothing leaves the page, held by the same
  no-fetch guard as the rest of the tab. A new `position-ui.test.mjs` holds
  the fourth door to the other three textually (no second JSON parser, no
  session key rendered, source stated) and functionally (the exact call path
  the card takes produces the document the CLI produces: quiet day as a
  measured $0, unseen label named, sessionUsd in `cannotSay`, unpriced
  records counted). 408 web tests green; verified live in light, dark and
  Spanish, error states included. One honest correction recorded in the
  plan: "what-if in the browser" was sketched as a chapter and turned out to
  have already shipped — the Bill tab has carried it since the levers work.

## 1.67.1 — "Ready to travel"

### Fixed

- **A nested Tabs no longer inherits the shell's orientation.** Tailwind's
  named groups match ANY ancestor, not the nearest: the web app's tabs
  primitive styled its list and triggers through `group-data-[orientation]/tabs:`,
  so the Optimizer's little result/diff switcher — a horizontal Tabs inside
  the app shell's vertical one — rendered as a column of two plain lines,
  and the `line` variant's active marker, with both orientations' `after:`
  rules matching at once, collapsed to a 2×2px dot floating over the card
  heading. Seen in light, dark and mobile alike; the primitive now reads the
  element's own `data-orientation`, which Radix stamps on the list and every
  trigger and which cannot cross a Tabs boundary. The parent-override guard
  in `ui.test.mjs` learned the new spelling — the same declarations defend
  the same properties — and the planted-defect cases still fire. 393 web
  tests green.

### Added

- **The rail groups its destinations and links out to the project.** The web
  app's five tabs sat in one undifferentiated column; the rail now names what
  each cluster is for — *Work on a prompt* (Optimise, Write, Compare, and the
  Library when signed in) and *Measure* (Your bill) — with quiet uppercase
  eyebrows that collapse to hairline separators in the icon-only rail, plus a
  *Resources* block of external links: the GitHub repository (inline mark —
  the icon library dropped brand icons), the npm CLI package, and the
  documentation tree. Each link opens in a new tab, says so to a screen
  reader, and reveals a small outward arrow on hover or keyboard focus. The
  labels are data, not submenus — nothing hides behind an extra click. All
  strings exist in English and Spanish; the library-tab gate guard in
  `ui.test.mjs` learned the trigger's new data-driven spelling (the entry is
  admitted by a conditional spread on `signedIn`) and its planted ungated
  variants still fail. 393 web tests green; verified by screenshot in light,
  dark, mobile drawer and collapsed rail.

- **Deployable on N0, with the update path written down.** A root
  `Dockerfile` (multi-stage over the workspace: core built, then the web app
  with Next's `standalone` output), an `n0-app.json` manifest — Postgres,
  a migration service that applies `apps/web/db/*.sql` and stops on error,
  and the web entrypoint — plus the two workflows that make updates travel:
  Gitea Actions builds the image inside the N0 workspace on every mirrored
  commit, and a GitHub workflow mirrors `main` there, doing nothing (and
  saying so) until the `N0_*` secrets exist. The manifest embeds the SQL
  because the platform writes `config_files` before the container starts —
  and `n0-manifest.test.js` holds the embedded copy byte-identical to
  `apps/web/db` in both directions, requires every env object to be a
  secret declaration rather than a credential, and requires the web image
  to stay a loud placeholder until a real workspace exists. The web app
  gains `output: 'standalone'`; deploy doctrine in
  [docs/deploy-n0.md](docs/deploy-n0.md) — pin the SHA (`:latest` does not
  update a cached tag), preview before promote, and the deploy itself stays
  a decision, not a push hook.

## 1.67.0 — "The month ends on a measured position"

Released 2026-08-24. The 1.67 arc closes, and with it the whole
[1.65–1.67 plan](docs/plan-1.65-1.67.md): the format is adoptable, the
policy has one judge at three doors, and the month has a measured position
every surface can state — with a pre-commit hook that is one pipe.

### Added

- **The position travels — chapter two of the 1.67 arc.** The same
  `positionReport`, through the surfaces that already exist. `trazum
  position --html-out` writes the position as one self-contained page —
  every sentence the terminal's own, through the same message catalogue,
  with the caveat block (unmeasurable ceilings, deliberate non-answers,
  unpriced records) rendered **before** the positions because a forwarded
  page gets cropped from the bottom; hostile labels arrive as text, never
  markup, and a test drives both locales. The MCP server grows a seventh
  tool, `position`: the log text and the ceilings in, the same document
  out — the `limits` argument validated by the config file's own parser,
  session keys grouped by and never shown, and no forecast field anywhere.
  No new daemon, no scheduler: `watch` remains the thing that runs on
  yours.
- **One pipe, no shell loop — chapter three of the 1.67 arc.**
  `check --files-from -` reads a file list from stdin — the shape
  `git diff --name-only` already produces — so the pre-commit recipe in
  `docs/ci.md` is now one pipe: `git diff --cached --name-only | trazum
  check --files-from -`. Refusals and budgets are directory mode's own;
  only which files are looked at changes. Paths that are not prompt files,
  paths the config ignores, and deletions are dropped and **counted out
  loud** — "checking 2 of 4 listed, 2 dropped" — and a commit that touches
  no prompts passes without ceremony, because a hook that fails on a
  README edit is a hook somebody uninstalls. The baseline gate is
  deliberately skipped under a partial list — it compares the whole
  repository against the committed record, and two changed files would
  read as thirty-eight removals — and the skip is stated on every run
  rather than discovered in an incident.
- **The position, as one answer — chapter one of the 1.67 arc.**
  `trazum position <usage.jsonl>` states where the month stands against
  every configured ceiling — `spend.monthlyUsd`, `limits.dayUsd`, each
  `limits.byLabel` entry — measured from the named log alone, priced record
  by record, with the denominator on every figure: days measured against
  days elapsed, the window each figure covers, and the source stated in the
  document (`source: "usage-log"` — the store's provider-billed standing is
  a different measurement and is never merged in). The line people actually
  want is division, labelled as division: *"at $5.00/day over 8 measured
  days, the ceiling is 12.0 days away — division on the past, not a
  forecast"* — **absent**, never zeroed, under the seven-day floor
  (`MIN_SCALE_DAYS`, the same floor every scaled figure respects), on an
  `over`, and on a zero rate; no field anywhere names a date, and a test
  holds that. A stale log is `cannot-tell` for the month (the
  `budgetPositions` rule) while a quiet day is a measured $0 (the doors'
  rule), stated side by side deliberately. What the log cannot measure is
  named with its reason — `no-clock`, `no-labels`, `nothing-recorded`,
  `label-unseen` (renamed? idle? neither is "under budget") — and what the
  document deliberately does not answer is written in it: the per-session
  ceiling is judged per call at the doors, because a session is not a
  calendar scope. The document is the **nineteenth named contract**:
  `conform` detects and enforces it, `trazum schema position` exports it,
  `positionReport` in `@trazum/core` computes it pure (the library's own
  output goes through the library's own checker), and the contract table in
  `docs/json-output.md` is held both ways against the real emission. The
  CLI grows to thirty-eight commands.

## 1.66.0 — "One policy, three doors"

Released 2026-08-24. The 1.66 arc closes: **per-label, per-session and
per-day USD ceilings, stated once, judged once, enforced identically at
whichever door the call arrives** — and a test that goes red the day any
door starts agreeing by coincidence again.

### Added

- **The doors hold the line — chapter three of the 1.66 arc.** The gateway's
  402, `serve`'s cost answer and `spend_guard` over MCP all carry the same
  `policy` judgement, produced by `judgeLimits` — none of the three does
  arithmetic of its own. `three-doors.test.js` proves the sibling-agreement
  property the hard way: the same policy, the same measured position and the
  same call go through all three doors and the judgements must match **field
  for field** — then a door is deliberately broken twice (a forged field, and
  `serve` started without its measured side) to show the comparison can
  fail. The measured side is a usage log: `--log` on `serve` and `gateway`
  (per-label and per-session spend live in a usage log, not in the store's
  provider buckets), `position` figures passed explicitly to `spend_guard`,
  whose `limits` argument is validated by the config file's own parser so a
  pasted policy and a committed one cannot mean different things. The
  gateway reads `metadata.trazum_session` at the same seam as the label;
  session identifiers are used to judge and never echoed, recorded or
  printed, and the suite greps every door's output for the key to prove it.
  A crossed ceiling is HTTP 402 `limit-over` at the gateway, `no` at the
  guard, and `policy.verdict: "over"` in the cost answer. Unpriced records
  in the `--log` are counted and announced at startup — money the policy
  cannot see, said out loud. Also fixed on the way in, reproduced first
  against the shipped build: `serve` **crashed outright** on
  `{"inputTokens": -5}` — the core's negative-figure refusal was an uncaught
  throw inside the request handler, taking the whole oracle down; it is a
  400 now.
- **Refusal is legible, and silencing one leaves a record — chapter four.**
  Every over-limit refusal names the limit, the measured spend and the
  period in one sentence, built once (`limitSentence`) and spoken by every
  door — an agent can log it and a person can audit it without re-running
  anything. The `waive` mechanism applies to limits unchanged: gates
  `limits.dayUsd`, `limits.sessionUsd` and `limits.byLabel:<label>`, each
  with the mandatory reason and expiry. A waived ceiling keeps its `over` —
  the measurement is the measurement — but the policy does not refuse it,
  the waiver rides in the judgement with the reason and end date so every
  answer from every door is the record of the silence, and the day it
  expires the ceiling refuses again.
- **The library judges it — chapter two of the 1.66 arc.** `judgeLimits` in
  `@trazum/core`: one function takes the `limits` policy, the measured
  position and a proposed call, and answers **within**, **over** or
  **cannot-tell** — one judgement per applicable ceiling, each carrying the
  limit, the measured spend, the window it covers and where the scope would
  stand after the call. Nothing is re-derived: every ceiling is judged by
  `answerCost`, the same single-budget semantics every door has used since
  1.44, refusals included (negative token counts throw, an unpriced model is
  a cannot-tell, and `restsOn` says whether the verdict needed the
  estimate). Two refusals are the module's own and both close the same
  loophole: per-label ceilings judging a call that names no label, or a
  session ceiling judging a call with no session, answer `cannot-tell` —
  a call that omits its label does not slip past the ceiling, it becomes
  unjudgeable, with the smallest ceiling named as the one it might be
  dodging. Verdict precedence is the only safe one: over, then cannot-tell,
  then within, because "within" must mean everything was judged. An empty
  policy is `no-policy`, never "within".
- **The policy has one shape — chapter one of the 1.66 arc.** A `limits`
  block in `trazum.config.json`: per-day (`dayUsd`), per-session
  (`sessionUsd`) and per-label (`byLabel`) USD ceilings — the enforcement
  policy every door will read, stated once. Deliberately separate from
  `spend`: a report gate is read after the fact over a log, an enforcement
  ceiling is read before a call is made to refuse it, and two surfaces
  reading "the same" value from different slices of config is the 1.62 arc's
  defect waiting for its input. Validation is stricter than `spend` in
  exactly one way: every ceiling must be a **positive** finite number,
  because a zero enforcement ceiling refuses every call at that door — an
  outage dressed as a policy, and the error says what to write instead.
  Unknown keys inside `limits` are named with the nearest real key rather
  than ignored. The help documents the block in both locales and the skill
  names it, both held by the existing derived guards.

## 1.65.0 — "The format anyone can adopt"

Released 2026-08-24. The 1.65 arc closes: **a document can be checked against
this format by a tool that has never installed this product.** Eighteen named
contracts, exportable schemas, and a producer's page whose examples are run —
not read — by the build.

### Added

- **The producer's page — chapter three of the 1.65 arc.** `docs/format.md`
  grows the section a connector author actually needs: **emit-this-minimum**
  examples for the two contracts that exist to be written by tools that are
  not Trazum (a usage-log record whose only required field is `model`, and an
  outcome report exactly as `@trazum/core` computes one), the additive
  promise restated from the producer's side (*add anything, redefine nothing,
  never write `0` for a measurement nobody took*), and where the schemas
  live — `trazum schema` piped to any off-the-shelf validator, with the `$id`
  stated as an **identifier, never fetched**. Held the only way that cannot
  rot: `producer-page.test.js` extracts every labelled example from the page
  and runs it through `trazum conform` — the product, not a re-implementation
  — then guts a required field from each and requires the gutted copy to
  fail, and the `$id` quoted in prose is compared to the one the schema
  actually carries.
- **The schema leaves the repository — chapter two of the 1.65 arc.** A
  `schema` command prints an authored JSON Schema (draft 2020-12) for any
  named contract, so a document can be checked by **any off-the-shelf
  validator with no Trazum installed**. The schemas state required fields
  and their types and stop there — `additionalProperties` is never `false`,
  because these documents gain fields without a version bump. Held to
  `conform` by construction, not coincidence: `requiredFieldsOf` exports the
  exact list `conform` enforces, the guard compares every schema's
  `required` to it (it caught five drifts and a missing `noRate` before the
  chapter was an hour old), and every schema-shaped minimum round-trips
  through both doors while gutting any field fails both. The suite's
  validator is thirty lines over the subset the schemas use — the
  zero-dependency rule, kept — and is handed planted defects before
  anything trusts it. Two carve-outs are stated where they live: the cost
  answer's verdict union is open by the format's own rule, and the outcome
  report's rate/refusal exclusivity is relational — carrying it is what
  `conform` is for.

- **Every contract answers to its name — chapter one of the 1.65 arc.** The
  seven documented contracts `--contract` could not name — `fleet`,
  `spend-guard`, `first-run`, `pulse`, `rule-yield`, `gateway-refusal` and
  `bench` — get names, required-field rules and detection, held to the same
  discipline as the eleven: detection ordered so a fleet (a list of full
  profile reports) classifies before the profile check and a spend-guard
  verdict (which contains a cost answer) before the cost answer, the same
  reasoning the roll-up already carries. `docs/format.md` stops saying the
  claim is narrower in the product than on the page: **`--contract` names
  eighteen of them**, and the derived guard that compares the table's column
  to `CONTRACT_NAMES` moved the sentence itself. Each new contract is proved
  by the document it rejects: the documented minimum conforms, and gutting
  any required field fails with the field named.

- **[The plan through 1.65, 1.66 and 1.67](docs/plan-1.65-1.67.md), written
  before the code.** The owner's five open-source paths, carried exactly as
  far as they go as code, with the not-code halves named in "what stays out"
  rather than dressed up as chapters. **1.65 — the format anyone can
  adopt**: all eighteen contracts answer to a `--contract` name, and an
  authored JSON Schema per contract leaves the repository, held to agreeing
  with `conform` by a two-direction guard. **1.66 — one policy, three
  doors**: per-label/session/day USD limits stated once, judged once in the
  core, enforced identically by the gateway, `serve` and `spend_guard` —
  with the same call pushed through all three doors and the verdicts
  required to match. **1.67 — the month ends on a measured position**:
  month-to-date spend against every limit with the denominator on every
  figure and no projection anywhere, travelling through JSON, the HTML door
  and MCP; plus `check` reading a file list from stdin so a pre-commit hook
  is one pipe.

## 1.64.0 — "The report somebody forwards"

**The 1.64 arc closes, delivered in full**: the profile and the roll-up have
an HTML door, the caveats are load-bearing in both, and the parity guard
makes each page a projection of the JSON rather than a rival account of it.
All four chapters landed on `main` before this minor; the minor is the story
finishing.

### Added

- **[The plan for 1.64](docs/plan-1.64.md), written before the code.** One
  arc: *the report somebody forwards*. The profile and the roll-up gain an
  HTML door — one self-contained file, no external assets, both locales,
  printable — rendered from the same document `--json` prints, never from
  the log, so no second computation exists to disagree with the first. The
  caveats (unpriced models, skipped lines, `cannotSay`) render with the same
  weight as the totals they qualify, and the closing chapter is a parity
  guard that walks every dollar and token in the HTML back to the document
  in both directions, proved by breaking the renderer both ways. Stays out,
  by name: charting libraries, template languages, serving. The chapters run
  as 1.63.x and close at 1.64.0.


- **The roll-up ships the same door, and the parity guard closes the loop —
  chapters three and four of the 1.64 arc.** `trazum rollup` gains
  `--html-out`, written on both output paths (a side file that vanished
  under `--json` is the fault the profile's `--csv-out` already taught this
  repository): one self-contained page for the team-facing document, where
  **each contributor's gaps render under that contributor's own name** —
  pooling them is the averaging the roll-up exists to refuse — and every
  `cannotSay` caveat, `overlap-invisible` included, sits in the caveat block
  ahead of the tables, impossible to crop out of a forwarded copy. Rejected
  contributions, repeated contributors and identical contributions land in
  the same block, by name. And **the parity guard**: a test walks every
  dollar figure anywhere in the page and every count in a numeric table
  cell back to the document the page was rendered from — nothing invented —
  and walks the document's headline figures forward into the page — nothing
  dropped. Both directions were handed the failure they exist for before
  being trusted: a forged dollar is named, a forged cell is named, and a
  page scrubbed of its headline is caught. The first draft of that last
  proof replaced one occurrence and blamed the guard for seeing the
  survivor — the one priced model's row legitimately equals the total, and
  the fixture, not the guard, was wrong.

- **The profile leaves the terminal — chapters one and two of the 1.64
  arc.** `trazum profile` gains an HTML door beside the Markdown one: one
  self-contained file — inline CSS, no scripts, no external assets, both
  locales, printable — for the person who pays the bill and does not run
  CLIs. It is a projection of the document `--json` prints: the renderer
  takes the exact same input object as the Markdown renderer, built once
  for both doors, so no second computation exists to disagree with the
  first. **The caveats are furniture, not footnotes**: unpriced models,
  unreadable lines, a log with no clock or no sessions, an unsettled cache
  TTL and a stale price table render in a bordered block *ahead of* the
  detail tables, at the same weight as the totals they qualify — and the
  suite asserts their presence by content and their position by offset,
  plus the other direction: a run with nothing to caveat earns a report
  with no block, because a box that always renders is a box nobody reads.
  Labels and model ids come from somebody's log, so everything interpolated
  is escaped, tested with a label that is itself an HTML injection.

### Fixed

- **`profile --json --markdown-out` crashed with a ReferenceError — since
  1.59, on every release, and no test had ever asked.** Under `--json` the
  terminal path never runs, and the side-file writer reached for that
  path's `levers` binding, which was never initialised. The HTML door's
  test drove both flags together and the flag turned out not to silently
  do nothing but to loudly do nothing. Reproduced against the published
  1.63.0 before fixing; the side-file writer now derives `levers` and the
  cache verdict itself.

### Release mechanics

- Five manifests, `@trazum/core` in three places, lockfile at **1.64.0**;
  README Action pins advanced to `bdca0df` (1.63.0).

## 1.63.0 — "Scale is measured, not assumed"

**The 1.63 arc closes.** Chapters one and two landed at 1.62.1; chapters
three and four landed on `main` just before this; the minor is the story
finishing, and its own contribution is the closing condition [the
plan](docs/plan-1.62-1.63.md) committed to: **the gate goes live.**

### Added

- **`trazum.bench.json`, committed, and CI held to it.** The Build-and-tests
  job now runs the ratio gate against the recorded baseline with a stated
  factor of 3× — generous on purpose: a tripwire for the quadratic-regex
  class of regression, not a micro-benchmark. Recorded and immediately
  cross-validated on a machine whose CPU changed between the recording run
  and the gating run: wall clocks moved ~1.5×, ratios held (5.47→5.33,
  11.08→11.14) — the machine cancels out, measured rather than claimed. The
  plan's named risk stands: a workload whose ratio proves too noisy on
  shared runners loses its gate loudly in the release notes, never left
  flaking.

- **Memory holds a line — chapter four of the 1.63 arc.** The 25MB usage log
  profiles within a stated **384MB heap ceiling**, asserted in the suite the
  only way that is honest on any machine: the probe runs in a child process
  with V8's old space capped at the line, so "fits" is enforced by the engine
  rather than inferred from an RSS reading a memory-rich runner would inflate
  by collecting lazily. Deterministic 25MB log (the fuzzer's LCG, a fixed
  clock), every line parsed, none skipped. The line was proved to bind in
  both directions before it was trusted: the same probe dies at 64MB, and a
  deliberate memory hog dies under a 48MB cap inside the suite itself, so
  the flag is not decoration. Observed peak RSS for the run: ~158MB, which
  is the headroom the release notes publish next to the promise. Moving the
  line is a release-notes decision, the same as the token band.

- **The refusal ceiling — chapter three of the 1.63 arc.** Above 400,000
  characters an input that claims to be a prompt is refused with the size and
  the limit named, never ground through. The number now lives exactly once,
  as `MAX_INPUT_CHARS` in `@trazum/core`; the two web routes, the share
  endpoint and the MCP server — which each carried their own `400_000`,
  agreeing by coincidence — now derive from it, and a new suite guard holds
  every other prompt-ceiling constant in the repository to deriving rather
  than restating (with three named non-door exceptions: the localStorage
  history bound, the prompt library's row bound, and a name length — each
  with its reason written beside it, because "it is different" is the
  sentence that stops being true quietly). The CLI's prompt doors —
  `optimize`, `check`, `diff`, `eval`, `prune`, `semantic`, the prompt half
  of `route`, and every directory walk that feeds prompts to the optimiser —
  hold the same line; a global `--max-input <chars>` raises it deliberately,
  and lowering it is equally legitimate. **Logs and documents are never held
  to it**: `profile` and `conform` read inputs fifty times this size by
  design, and the null at those call sites is written out so a reader sees
  the decision.

### Changed

- **One CodeQL query excluded, out loud and owner-approved:
  `js/file-access-to-http`.** Merging the refusal ceiling surfaced four medium
  alerts — the three provider calls in `llm.ts` and the counter in
  `tokenizer.ts`, each "file data in an outbound network request". That shape
  is exfiltration in most software; here it is the contract: `--exact-tokens`
  and `--llm` send the prompt to the API the caller configured, opt-in by
  flag, gated on the caller's own credential, documented as doing exactly
  that. The protection the query wants exists in the security suite as tests —
  which modules may reach the network at all, and that no command calls out
  unasked. The exclusion was put to the repository owner as a question and
  approved before it landed; it lives in `.github/codeql/codeql-config.yml`
  with the full reasoning attached, reviewed and diffable rather than a
  dismissal buried in a settings page. Every other security-extended query
  stays on.

### Release mechanics

- Five manifests, `@trazum/core` in three places, lockfile at **1.63.0**;
  README Action pins advanced to `214aa43` (1.62.1).

## 1.62.1 — "This machine, measured"

**Chapters one and two of [the 1.63 arc](docs/plan-1.62-1.63.md)**: the bench
exists, and the gate it feeds is a ratio, never a wall clock.

### Added

- **The ratio gate — chapter two of the 1.63 arc.** Every bench workload is
  now also timed against a fixed calibration loop run in the same process,
  right after it — an integer loop no release has a reason to touch,
  deliberately not the product's own code, so a ratio moves only when the
  workload does. `wallMs / calibrationMs` is the number a gate can hold: a CI
  runner lies about wall time to the workload and the yardstick by the same
  amount, and the lie cancels out. `--record <file>` writes the measured
  ratios as a committed baseline (`schemaVersion: 1`, covered by the
  versioning freeze the way `trazum.baseline.json` is — an unknown version is
  a loud error naming `--record`, never a best-effort read); `--against
  <file> --max-ratio <n>` exits 1 when any measured workload is past its
  recorded ratio times the stated factor. The factor is required, not
  defaulted — how much regression is too much is a policy, the same rule as
  pulse's threshold. The JSON shape never changes with the gate flags: the
  verdict is the exit code and sentences on stderr, the way `check` has
  always gated. A workload measured but absent from the baseline fails
  rather than passing silently, because a silent skip reads as coverage.
  Proved by breaking it: the suite gates a real run against a baseline whose
  recorded ratio is absurdly small and watches the build go red with the
  workload named.

- **`trazum bench` — this machine, measured.** Chapter one of the 1.63 arc:
  the standard workloads — a 1MB prompt at both levels, a 200,000-line
  profile, a 10,000-file walk, a 20,000-line roll-up — one shot each, wall
  time and peak RSS, as a table and as `--json`. **No comparison and no
  judgement**: the number is for a person with a change in hand, before and
  after; the CI gate is the next chapter's ratio, not a wall clock smuggled in
  here. Each workload runs in its own child process (this same CLI with
  `--workload`), because a peak is a fact about a process — five workloads
  sharing one heap would each report the high-water mark of whichever ran
  biggest before them, and the test proves the isolation by watching a peak
  sit *below* its predecessor, which a shared process cannot produce. The
  inputs are generated with the hostile-input suite's own LCG against a fixed
  pricing date — deterministic, and never written to the project, which the
  test proves by running the bench inside an empty directory and looking.
  "Peak heap" from the plan is reported as **peak RSS** and named as such:
  a heap high-water mark is not observable from inside a synchronous run
  without instrumentation that would itself move the number.

### Fixed

- **Landing the bench collected four debts, each from a guard doing its job.**
  Three fired on the first push: the bench document had no CLAIMED harvest,
  `docs/format.md` had no row (its count and the README's moved to seventeen
  of eighteen, and the two count guards learned the indefinite article on the
  way — "a eighteenth" was the sentence they would have demanded), and the
  `--json` command partition had bench in neither list. The fourth was the
  security suite: `child_process` is allowed in exactly one file, and the
  bench's spawn had landed in the CLI instead — it moved into `git.ts` as
  `runSelf()`, under the same stated rules, with nothing loosened.

### Release mechanics

- Five manifests, `@trazum/core` in three places, lockfile at **1.62.1**;
  README Action pins advanced to `b55038e` (1.62.0).

## 1.62.0 — "Held to its own standard"

**The 1.62 arc closes.** Its five chapters landed in 1.61.1 and 1.61.2, in the
order [the plan](docs/plan-1.62-1.63.md) committed to; the minor is the release
where the story finishes, and this is what finished. The properties now held —
by tests that fail the build, not by sentences:

- **`optimize` never throws**, over a seeded corpus of hostile atoms: RTL and
  CJK text, lone surrogates, null bytes, zero-width characters, CRLF, unclosed
  fences, 3,000-character tokens.
- **`optimize` never grows the token count**, at both levels.
- **`optimize` is idempotent** — the pipeline runs to a fixed point, and
  `optimize(optimize(x))` is byte-identical to `optimize(x)`.
- **Protected spans survive byte-for-byte** — code blocks, inline code and
  URLs, asserted across the whole corpus, with bait the rules want to rewrite
  planted inside protected spans so the assertion can actually fail.
- **Money is never negative** — no document this package can build carries a
  negative dollar figure, whatever the input, and no two doors to the same
  value disagree about what fits through.
- **Unreadable lines are named** — `profileUsage`, `conform` and `rollUp`
  never throw on any text; what they cannot read they report by line number.

### Added

- **[`docs/hardening.md`](docs/hardening.md)** — the properties above stated
  as a page a stranger can read: where each is enforced, why every defect the
  stress session found is pinned as a named case outside the fuzzer's seed
  schedule, what a bounded fuzzer does not prove, and how to reproduce a
  verdict. Linked from the documentation index in the deciding-whether-to-trust
  section, next to the doctrine it borrows its standard from.

### Changed

- The documentation index's account of the plans was written when there were
  five and never counted past them; it now counts seven, and the arcs table
  says the 1.62 arc landed rather than that it is in progress.

### Release mechanics

- All five manifests, the `@trazum/core` dependency in the CLI, the MCP server
  and the web app, and the lockfile move to **1.62.0**.
- The three README Action pins advance to `cd1588c`, the 1.61.2 release
  commit.

## 1.61.2 — "An input nobody had tried"

**Seven defects, one stress session, one shape**: an input nobody had tried,
taken quietly. Chapters one to five of [the 1.62
arc](docs/plan-1.62-1.63.md), landed in the order the plan committed to.

### Fixed

**A seventh defect, found while proving the mask property could fail.** The
chapter that holds code blocks, inline code and URLs to byte-for-byte survival
started with a zero that proved nothing — the corpus held no code a rule
wanted to touch — so bait atoms went in: a verbose phrase and double spaces
*inside* protected spans. **They came out rewritten, with every mask believed
to be on.** On ``` ``` `span` ``` ``` shapes, the segmenter scanned every
pattern over the whole text and dropped overlaps afterwards, which loses more
than the overlap: `inline-code` matched from the *third backtick of a closing
fence* to the real span's opening backtick — an illegitimate match, later
dropped — but its scan position had already advanced past the real span, so
the legitimate match was never seen and the span was left mutable.

Each pattern now scans with the earlier patterns' ranges reserved, and a match
that overlaps a reservation restarts **after the reservation** rather than
after itself. The mask property — every protected span survives `optimize`
byte-for-byte, over the whole hostile corpus — is chapter four of the 1.62
arc, and it holds now, with the bait atoms in the corpus so the zero can never
go vacuous again.

### Added

**The plan through 1.62 and 1.63** — [docs/plan-1.62-1.63.md](docs/plan-1.62-1.63.md),
written before the code and out of a stress session that found six defects in
an afternoon, all one shape: **an input nobody had tried, taken quietly.** The
1.62 arc holds the product to its own standard under hostile input; the 1.63
arc turns today's good performance numbers into measurements the build is held
to. Its first three chapters land below.

**`packages/core/test/hostile-input.test.js` — the stress session as a
fixture.** A seeded, deterministic fuzzer (same seed, same verdict, any
machine; ~5s, bounded) over a corpus of hostile atoms — RTL, CJK, lone
surrogates, zero-width characters, control bytes, CRLF, unclosed fences, 3KB
tokens — holding `optimize` to three of its own promises: **never throws,
never grows tokens, idempotent**. Plus a malformed-log corpus for
`profileUsage` (negative, non-finite, string and `__proto__` token counts) and
the property that **no input can produce negative money**. Every defect below
is pinned as a named case outside the fuzzer's seed schedule, because a seed
schedule rotates the moment an atom is added.

### Fixed

**`optimize` was not idempotent: run on its own output, it saved more.** On 1
input in 4,000, `emphasis` stripped `IMPORTANT:` and left two lines equal but
for a space — and `whitespace`, which would have collapsed it, had already
run, so `duplicate-lines` never saw the pair. The writer's acceptance test,
failed by the tool that grades it. The pipeline now runs to a **fixed point**
(bounded at a named constant; pass two exists for the cascades, pass three
confirms), rule hits and savings aggregate across passes rather than
appearing as duplicate rows, and the property `optimize(optimize(x)) ===
optimize(x)` is enforced over the whole corpus. Cost: ~40% on a 1MB prompt,
the price of the confirming pass.

**`spend_guard` said yes to a lie.** `outputTokens: -500` priced the call at
**−$0.0075** and the verdict came back `yes` — a negative estimate lowers the
projected spend, so an agent that lies about its output tokens buys itself an
approval. `answerCost` now refuses negative or non-finite token counts, which
closes every door that routes through it — `serve`'s `POST /cost`, the
gateway, and the guard — and the MCP tool refuses them as an
`InvalidArguments` the protocol knows how to carry.

**A negative budget was judged; a negative volume was billed.** `assemble`
took `budget: "-5"` and returned the verdict `over` — a judgement against a
limit that cannot exist — and `callsPerMonth: -100` priced a prompt at
**−$1.26 a month**, a number no bill ever had. Anything that is not a
positive finite number now lands where it belongs: no budget, no volume,
said with the verdict's own reason. `prompt_writer` additionally refuses them
by name, because its schema said `minimum: 1` and the runtime never enforced
it — **a schema the runtime does not enforce is documentation wearing a
guard's clothes.**

**`--cache-hit-rate 2` was accepted while the config refused it.**
`usage.cacheHitRate: 2` in `trazum.config.json` fails with *"a fraction
between 0 and 1"*; the same value through the flag was accepted and quietly
skewed the caching advisory. **Two doors to the same value cannot disagree
about what fits through.** The flag now refuses, in both locales, naming the
config's own rule.

**Every fix was proved by breaking the product**: the fixed point reduced to
one pass fails two cases; the negative-token refusal deleted fails the
negative-money property.

## 1.61.1 — "Nothing was holding these"

**A patch, and both entries are the same act**: take something this repository
says about itself, ask what would fail if it stopped being true, and find out by
**emptying it**. Ten claims and six pages had the same answer — nothing.

### Added

**Six more pages could have been deleted in silence.** The probe that found
`docs/doctrine.md` unguarded — empty a source and re-run the suites — was run
over every prose page in the repository. Six broke **nothing at all**:
`docs/ci.md`, `docs/running.md`, `docs/accounts.md`, `docs/authoring-rules.md`,
**`SECURITY.md`** and **`VERSIONING.md`**. The last two are the ones worth
naming: one tells somebody how to report a vulnerability, and the other defines
what this project's three version numbers mean, which every release depends on.

Six bespoke guards would have left the seventh page unguarded, so
`packages/core/test/every-page.test.js` is derived from the filesystem. It holds
every page to the three things a page goes wrong about quietly: **it says
something** (a page gutted to a heading fails), **it links only to files that are
there**, and **it shows only commands this CLI dispatches** — the last derived
from `COMMAND_FLAGS`, so the docs and `USAGE` cannot disagree with the product or
with each other. 30 pages, 219 relative links and 50-odd documented invocations,
all checked.

What that proves is narrow and worth stating: nothing mechanical can check that
what a page *says* is true. But the failure the probe found was not a subtle
mischaracterisation — it was six pages nothing was holding at all.

**And the guard caught prose on its first run.** `Executable trazum not found`,
quoted in a changelog entry, came back as a command called `not`. Exempting the
file would have been the wrong fix — a guard that needs an allowlist to stay
quiet is a guard somebody deletes — so the pattern was tightened to what an
invocation actually is: something that **begins** its command, at a line start,
inside a code span, or after a shell prompt. Both cases are kept as tests.


**Four of the five promises `docs/json-output.md` opens with were prose.** Only
*absence is null and never zero* was enforced, on five fields of one document.
The other four held — measured, not assumed, over **414 dollar figures and 296
token counts** across the profile, the roll-up and the prompt draft — which is
exactly the state in which a promise quietly stops being true, because nothing
would say so.

`packages/core/test/format-promises.test.js` runs all of them over every
document this package can build, and **takes the bullets out of the section
first**: deleting a promise from the page fails here, so the guard cannot
outlive the claim or the claim the guard.

**Rounding is the awkward one, and it is asserted backwards.** The absence of
rounding cannot be proved from one document, so what is checked is the shape of
the failure: a document whose dollars had been through `toFixed(2)` would carry
**none** with more than two decimals, and this one has to carry a majority.

**Every check was proved by breaking the product, not the test.** Rounding every
dollar on the way out of `profileUsage`, returning one as a string, adding a
half to a token count, and putting a session key into the document — each fails.
And rewording the promise section without changing a promise must not, which it
does not.

## 1.61.0 — "A prompt this tool cannot improve"

**The arc closes.** Trazum had only ever read prompts somebody else wrote; it
writes one now, by asking. Six chapters, all six delivered — the questions, the
assembly, the three measured claims, the terminal, the web, and MCP.

**What it will not say is the part worth reading.** Not that the prompt is good:
that is a judgement about text nobody has run. It says the checklist is complete
with its gaps named, what the prompt costs with the estimate marked as one, and
that `trazum optimize` recovers **nothing** from it — which is the only one of
the three this product could ever have staked its name on, because the tool
grading the output is the same tool that would have to find the fault.

**One thing the plan named and this release did not build**: the optional
model-assisted polish. It needs a credential this repository does not have, and
inventing what a model would have said is the estimating-and-measuring merge
that 1.36–1.40 spent five releases removing. Named, not faked, and still open.

### Added

**Chapter six of 1.61: `prompt_writer` over MCP.** An agent asked to write a
prompt for something has the same problem a person has — it does not know what
it has not been told — so this hands it the questions rather than the answers.
Call it with what you know; get back the next question worth asking and whatever
can be assembled so far.

**`next` carries the wording, not just the id.** An agent handed a bare id would
either invent the question or skip it, and a question nobody asks is a slot
nobody fills. The two slots that fill no section say so in their own wording —
*"this changes the estimate, never the prompt"* — because an agent told only
"which model is this for?" would reasonably expect the answer in the text. Any
slot with a null section whose question does not say it fails.

**Stateless, and asserted as such**: the same answers produce a byte-identical
reply, and an earlier call leaves no trace in a later one.

**The `__proto__` test parses the wire form.** In a JS object literal that name
sets the prototype rather than a key, so a test written that way proves nothing;
over MCP the arguments arrive as JSON, where it is an ordinary own property. The
tool writes only catalogue ids into a map with no prototype — the shape CodeQL
named on `/api/write`, fixed here before it could be written twice.

**And a count stopped being a check.** `rpc.test.js` asserted `tools.length === 5`,
a literal that had to be bumped every time a tool arrived; a number somebody
edits to make a suite pass has stopped asserting anything. It compares against
`TOOLS` now.


**Chapter five of 1.61: the interview on the web.** A `Write` tab and
`POST /api/write`, the same fourteen questions and the same
`prompt-draft` document as the terminal.

**The route is stateless on purpose.** The browser holds the answers and sends
all of them every time. A session would mean that endpoint knowing what somebody
is halfway through writing, which is the thing the rest of this product refuses
to hold — and nothing there calls a model either, so the surface that has a
network by definition is held to the same rule as the one that does not.

**The browser asks the server what to ask next rather than deriving it.** `next`
and `missing` look alike and mean different things: `missing` holds only the
*required* slots, and the interview carries on through the optional ones.
Deriving one from the other is how a form starts skipping questions, and the
test asserts the two disagree on a real answer set.

**Skipping is offered as an answer**, not left as an empty box. A question a
reader cannot decline is a question they will answer badly to get past — and a
bad answer goes into the prompt, where a decline leaves nothing.

**An unpriced model comes back with a verdict, not a 400.** It is one of the
three answers this format gives; refusing it would turn a measurement into a
failure the caller has to handle. An unknown *slot* is refused, because ignoring
one would hand back a draft with no way to tell it from an answer the assembly
had no use for.

**The sentence this mode refuses to say is rendered, and guarded.** Copy that
exists in a catalogue and appears nowhere is a promise nobody reads.

### Fixed

**CodeQL called the route's answer loop a remote property injection, and it was
right about the shape.** The first version iterated the request's own keys, so
the property being assigned was a string the caller chose — `__proto__` among
them. The slot check would have refused that one, but **a write whose *target*
is caller-controlled is only ever as safe as the guard immediately above it**.
The loop runs over the catalogue now, so the writable keys are a fixed literal
set, and the map is created with no prototype to reach in the first place. Sent
`__proto__`, `constructor`, `prototype` and `toString` anyway, and asserted
`Object.prototype` is untouched.

**Two things an existing guard and a second reading caught in this chapter's own
work.** The `Write` tab shipped without `forceMount` on the reasoning that
mounting it would cost one request per page load from readers who never open it
— which traded somebody's half-answered interview for a request cheaper than the
page's own assets. **The answers live only in the browser**, and Radix unmounts
an inactive tab by default. The guard names the property rather than the tabs
and was right. And the mode was put first in the rail while `defaultValue` still
opened Optimise, so the reader would land with the second row highlighted; the
rail's order and the default tab are one decision, not two.

## 1.60.4 — "You describe it, it asks"

**Trazum has only ever read prompts somebody else wrote.** `optimize` finds the
waste in one, `check` holds it to a budget, `rules --measure` says what each
rule recovers — and every one of them starts from a prompt somebody already
guessed their way into. The most expensive waste is not the filler the rules
remove; it is **the paragraph that should never have been written and the
constraint nobody stated.**

This release is the first four chapters of the arc that goes the other way. You
say what you want, the tool asks what it needs, and what comes back is a prompt
whose cost and cleanliness are known before it is ever sent. Plus the guard for
the one page in this repository that had none.

### Fixed

**`-o` on a new command was accepted, ignored, and the prompt went to stdout.**
The parser rewrites `-o` to `out` on the way in, so `stringFlag(args, 'o')` can
never match anything — a flag that parses and does nothing, which is the defect
this CLI refuses one layer up with *"Did you mean --max-growth?"*. Caught by the
test that asserted the file, not by reading. **The same dead read had been
sitting in `baseline` as a fallback**, `?? stringFlag(args, 'o')`, which could
not fire either; removed rather than left as an alternative nobody can reach.


**`optimize` accepted any string as a level and silently ran `safe`.** The rule
loop skips aggressive rules unless the level *is* `aggressive`, so a typo — or a
plausible-sounding `balanced`, which this product has never had — produced
safe-level results with nothing said. The CLI has always refused
`--level balanced` by name; **a library caller got the quiet downgrade
instead**, which is the swallowed-flag defect one layer down. It now refuses,
naming the levels that exist. Nothing correct depended on the old behaviour: no
program means `safe` by writing something else.

**And the previous chapter's own test was measuring `safe` twice.** It iterated
`safe`, `balanced` and `aggressive` and said "all three levels" in its own name.
There are two. The zero survived the correction — both real levels recover
nothing from a draft — but the sentence did not, and the sweep now comes from
`RULE_LEVELS` rather than a list typed into the test, so a level added tomorrow
is covered without anybody remembering.

**The slot-table guard read the whole page, and the page grew a second table.**
Chapter one's check harvested every backticked first cell in
`docs/prompt-writer.md`, which was right until this chapter added the three
claims — whose rows are `complete`, `cheap` and `clean` — and it reported three
slots that do not exist. **[Bound an assertion by its subject, never by its
neighbour](docs/doctrine.md)**, which this repository has a helper for and that
test was not using. Bounded to `## The slots` now, and still failing in both
directions: a slot dropped from the table, and a phantom row added to it.

**It was CI that caught it, and it should not have been.** `npm run verify` ran
green, then the page gained the new table, then the commit went out — the local
run was of the code and not of the change. The correction is in the record
rather than in a habit nobody can check.

**`RULE_LEVELS` is exported.** The package had the union and no list, so the
valid set was not discoverable from `@trazum/core` at all.

### Added

**Chapter four of 1.61: `trazum write` on a terminal.** Two ways in and one
document out — the questions asked one at a time, or a JSON object through
`--answers` — with **the prompt on stdout and everything else on stderr**, so
`trazum write --answers a.json > prompt.txt` is a file with a prompt in it and
not a file with an interview in it.

**Input running out is not a decline, and finding that out cost a real bug.**
`readline` on a piped stream closes as soon as the buffer drains, and a question
asked after that never settles: the event loop emptied and the process left with
**status 0 and nothing printed** — an interview that stopped halfway and
reported success. A terminal now gets `readline` and a pipe gets the lines read
in order, because a script piping answers is really handing over a list. A
truncated interview refuses, names the slots it never asked, and is asserted not
to report them as declined.

**A misspelled slot id is answered with the nearest one**, the same way this CLI
already answers a misspelled flag. A missing required answer refuses with each
slot named beside what it would have unlocked, and never writes half a prompt to
stdout.

**Three existing guards caught what this chapter forgot**, in order: the flag
allowlist had no `write` entry, the README's command table and its three counts
had not moved, and the check that every `--json` command is covered or named as
an exception refused to let a new one be absent from both.

**Chapter three of 1.61: the three claims, measured.** Every assembled draft now
carries `measured` — `complete`, `cheap` and `clean` — or **null** when there is
no prompt to measure, never an object of zeros.

**`complete` is a checklist with its gaps named and no score.** A grade out of
ten is precisely what *nothing continuous invents a number* forbids, and the
test asserts the object has exactly four keys so a score cannot arrive later
without somebody noticing.

**`cheap` keeps the estimate inside an object that says it is one.**
`provenance` is always `estimated` and travels with the figure, because nobody
has sent this prompt yet. `monthlyUsd` is **null when it cannot be priced**,
never 0 — zero reads as free. The budget answers three ways and never bare:
`within`, `over`, or `cannot-tell` with `no-budget`, `no-model` or
`model-unpriced` beside it. Priced separately from the tokens and the rules,
because `optimize` throws on a model it cannot price and an unpriced model is
one of the three answers here rather than a crash.

**`clean` reports what this tool's own rules still recover**, and finds nothing
in its own output — with the opposite direction asserted too, so an empty list
is not the only answer the measurement can give.


**Chapter two of 1.61: the assembly, and the claim the arc is judged on.**
`assemble()` puts the answers under headings in the fixed section order and
returns a `prompt-draft`. Nothing is paraphrased — the words are the author's,
and a writer that rewrote them would be answering a question nobody asked it.

**`trazum optimize` recovers nothing from a draft the templates produced**, at
all three levels, measured by running it. That is the arc's acceptance test: a
writer whose output this tool still improves would be selling the cure for a
disease it had just caused, and the number proving it would be printed here.
**And the zero is not vacuous** — the same draft with a verbose phrase pushed
into it has to come back non-zero, or a rules engine that found nothing in
anything would satisfy the check forever.

**The same answers assemble the same bytes in every locale.** The headings are
English everywhere on purpose: they are structure rather than prose, and a
heading that moved with `TRAZUM_LOCALE` would make the prompt a function of the
machine that ran the interview.

**The refusal and the output are the same fact read two ways.** `prompt` is
`null` — never `''` — when required answers are missing, and `missing` is empty
**exactly when** `prompt` is a string; the test asserts the equivalence in both
directions over four answer sets rather than asserting each half separately. A
declined slot stays out of `missing` and in its own list: a decision is not a
gap. A section nobody answered is omitted rather than written empty, and a slot
that fills no section (`model`, `budget`) puts no words in the prompt at all.

**`prompt-draft` joins the interchange format** — the eleventh contract
`--contract` accepts, the sixteenth document. This was the plan's own test of
the two releases before it, and all three guards fired as designed: the new
table needed a claim, `docs/format.md` and `README.md` needed their counts moved
to sixteen and a seventeenth, and the article map refused to guess one for a new
contract name. A fourth caught the rest — the library-documents guard from #361
required the draft to be handed to the package's own checker, since it is a
contract `@trazum/core` can build with nothing but answers.


**Chapter one of 1.61: the questions.** `@trazum/core` now carries the slot
catalogue and the interview behind `trazum write` — fourteen slots, four of them
required, three of them gated on an earlier answer. No model decides what to
ask: the catalogue is fixed, the gates are predicates over the answers so far,
and the same answers produce the same interview on any machine.

**The three asking rules are run, not commented.**

- *A question is only asked when its answer can change the output.* Every gate
  is handed an answer set that opens it and one that does not — **a gate that is
  always true, or never true, does nothing**, and both directions fail. A JSON
  schema is not asked for when the answer is prose.
- *The interview stops.* It reports `done` when every open slot has an answer or
  a decline, and the opposite direction is asserted too: `done` on an empty
  interview would be a stop rule that stops before it starts.
- *A refusal never arrives bare.* Unanswered required slots are named, including
  one that only a previous answer opened — `output-schema` cannot be missing
  until the shape is `json` or `table`, and must be missing the moment it is.

**Answered, declined and unanswered are three states, not two.** `null` is a
decline: somebody was asked and said no. It closes the follow-up a real answer
would have opened, and it is named in the output rather than silently dropped.

**Ids in core, words in the CLI**, the same split the rules catalogue uses. Both
locales are held to the catalogue in both directions — a slot nobody can ask
fails, and copy for a slot that does not exist fails too — plus the check that
would catch one locale being served the other's words.

`docs/prompt-writer.md` documents the catalogue and is derived: a slot the code
has and the page does not fails, and so does a row for a slot that is gone.


**A plan for 1.61, written before the code: the prompt writer.** Trazum has only
ever read prompts somebody else wrote — `optimize` finds the waste in one,
`check` holds it to a budget, `rules --measure` says what each rule recovers,
and every one of them starts from a prompt somebody already guessed their way
into. The arc goes the other way: you say what you want, the tool asks what it
needs, and what comes out is a prompt whose cost and cleanliness are known
before it is ever sent.

**The tension is stated first and resolved without a footnote.** A prompt writer
is a generative feature in a deterministic product. The interview and the
assembly are deterministic — a fixed slot catalogue, rules over the answers, a
fixed section order, byte-identical output for identical answers — and the only
generative step is optional, credential-gated, and **named and not built** while
this repository has no credential, the same treatment 1.54.0 and 1.57.0 get.

**It refuses to claim "the perfect prompt"** — a quality judgement about text
nobody has run. Three measurable claims replace it: complete against a checklist
with its gaps named, cheap against the configured budget with the estimate
marked as one, and **clean against Trazum's own rules**. That third is the arc's
real test: if `optimize` can still recover tokens from a prompt this tool just
wrote, the templates are wrong and the number says so.

`ROADMAP.md`'s `## Next` names 1.61.0 — the first thing planned above 1.60.0 —
with the three arcs that stay open below it kept where they are, and
`docs/README.md` indexes the plan beside the five before it.


**`docs/doctrine.md` was the one prose contract here with no guard at all, and
that was measured rather than assumed.** Emptying the file and re-running the
suites broke nothing. Every other page that makes checkable claims — the
contract file, the interchange index, the usage-log format, `CONTRIBUTING`, the
README, the roadmap — fails a test when it goes stale. The doctrine did not, in
the file whose whole subject is checking what enforces your own rules, and where
the rule *a rule you wrote for yourself is a claim like any other* lives.

`packages/core/test/doctrine.test.js` does not enforce the rules — most are about
judgement and one says outright that no test can hold it. It enforces the page:
the rules the preface names still exist under those names, no rule is written
twice, a rule said to have joined at a release is named on that record, and the
links resolve. It opens by requiring the page to have rules in it at all, which
is the check that would have caught the emptiness that started this.

**Italics in the preface are now reserved for rule names**, and the guard is
what makes that true rather than a style note: every italic phrase there is read
as a rule and any that is not one fails. A preface that emphasises freely is a
preface where a renamed rule hides. **It fired on the first draft of the
paragraph announcing it** — the sentence describing the new test emphasised a
phrase that was not a rule, and the check refused it.

## 1.60.3 — "A document nobody lists"

**Two chapters, one shape.** `docs/json-output.md` calls itself the contract and
`docs/format.md` is the index a connector author works from. Between them they
specify every document Trazum emits — and between them, six contracts had no
guard and three documents were on neither list. The second finding is a
consequence of the first, which is the whole point of putting them in one
release: **a document nobody lists is a document nobody checks.**

### Fixed

**`docs/json-output.md` called itself the contract, and six of its fifteen
tables had no guard.** The file's second sentence named one test — and one test
is what it had: nine of the fifteen documents were genuinely harvested by a
parity check somewhere in the repository, six were not, and nothing anywhere
recorded which was which. Two of the six had drifted. **The roll-up document
listed three top-level fields and `trazum rollup --json` emits nineteen** — the
merged bill, both periods, the duplicate and overlap findings and the typed
`cannotSay` caveats were absent from the contract a consumer builds against,
and `notMerged` sat beside a documented `rejected` where a reader handling one
would miss the other. The fleet document never mentioned `schemaVersion`, the
one field this file's own promise section calls the only thing you must branch
on. Both tables are complete now, and the roll-up's rows carry the refusals
rather than only the arithmetic — a shared day's dearest label is null, the
repeats are named and never subtracted.

### Added

**`packages/cli/test/contract-coverage.test.js` — the inventory beside the
promise.** It takes every `##` heading in `docs/json-output.md` whose section
carries a field table, matches each against the test that harvests it, and
fails on a table nobody claims *and* on a claim for a table that is no longer
there. A claim is not taken on trust: the file named has to pass the heading to
a call, because a heading in a comment is not enforcement. It also walks all
three packages' test directories for harvests the map does not know about — the
direction that would have caught the six. The six unguarded tables — fleet,
roll-up, annual record, pulse, rule-yield and the outcome report — are now held
both ways by running the command (or, for the outcome report, the library
function; no command emits it).

**And the harvest is proved on documents written for the purpose.** It has to
tell a section carrying a table from two that carry only prose, and read a row
naming four fields (`root`, `files`, `prompts`, `truncated`) and one naming a
nested field documented and deliberately never emitted (`promises.arrivedUsd`)
— otherwise every "both ways" check above is agreeing with a misreading.

**`docs/format.md` undercounted the interchange format by three, and the guard
on that count agreed with it.** The front door of the format — the page a
connector author works from — said Trazum emits twelve documents and defines a
thirteenth. `trazum pulse --json`, `trazum rules --measure --json` and the
gateway's HTTP 402 body each have a contract table, a `schemaVersion` and
something that emits them, and were in neither the table nor the count.
`README.md` said twelve in the same breath.

**The sentence was already guarded — against the table.** `interchange.test.js`
has held the opening count to the rows beneath it since the day it said seven
with ten rows, and it derives the ordinal rather than typing it. It could not
have caught these three: **both halves it compares are written by hand**, so a
document missing from the table and missing from the sentence leaves the two in
perfect agreement. The missing half was never the arithmetic — it was the table
against the contracts that exist.

Fifteen emitted and a sixteenth defined, in both places. The new guard derives
the list from the contract tables in `json-output.md` and matches it against the
front-door table **by the anchors the rows link to**, failing on a table the
page omits and on a row pointing at a section that carries no table. It holds
`README.md` to the same count, compares the `--contract` column to the names the
CLI accepts as a set — the existing checks allow a contract named only in prose
— and holds the plan's two tables, in `json-output.md` and `plan-format.md`, to
each other. The three omitted documents were also three of the six with no
parity guard until the entry above, which is not a coincidence: **a document
nobody lists is a document nobody checks.**

## 1.60.2 — "Checked by running"

**A patch, and every entry in it is the same act.** With the plan finished as far
as it can go, the work is taking a claim this project makes about itself and
asking what enforces it — then measuring by running rather than by reading. Four
findings, one of which reached installable code.

### Changed

**And the other rule that constrains everything was enforced by a disclosure
check, not by a run.** *The deterministic core stays free and offline — no
feature may make a network call a prerequisite for optimising a prompt* is the
first of the two rules `ROADMAP.md` opens with, and the thing a reader is most
likely checking when they open `SUPPORT.md`.

Two things enforced it, and neither ran the command. `outbound-surfaces.test.js`
derives every module that *can* reach the network and requires each to be named
in the prose — a good rule and a **different** one, because a module can be
disclosed, listed and documented and still sit on the path of `trazum optimize`.
And `security.test.js` scans **`packages/core/src` only** for `fetch`, allowing
it in two named modules; a source scan, over one package, of a property that is
about what a command does at runtime — the CLI is not in it at all.

It is now proved the only way it honestly can be — **by removing the network and
running the command.** `fetch` is replaced with a thrower before the CLI loads,
and `optimize`, `check` and `rules` have to work with it gone; the report has to
come back **byte-identical** to a run with the network intact.

**And the stub is proved to bite**, which is what makes the rest mean anything:
`--pricing-live` under the same stub has to fail *and carry the stub's own
marker*, because a stub that silently failed to install would leave every
assertion above passing and nothing proved.

Measured before it was written down: it holds, in the library and through the
binary. The guard is the part that was missing.


**One of the two rules that constrain everything here was checked on one
English sentence.** *A locale changes the report, never the optimisation* is one
of the two rules `ROADMAP.md` opens with, and the README says it is enforced by
tests. It was — by a single prompt in two locales.

A rule stated universally and checked on one example is a claim that happens to
be true, which is the shape this project named at 1.59.0: *a rule you wrote for
yourself is a claim like any other.*

The sweep now reads the corpus off disk — **35 prompts** across the language
corpus, the rule corpus and `examples/` — and the locales off `LOCALES`, and runs
every prompt at both levels in every locale. What "the same" means is enumerated
rather than sampled: the optimised text, `tokensBefore`, `tokensAfter`,
`tokensSaved`, `reductionPct`, every rule id with its hits and saving, and every
advisory id.

**And the opposite direction is asserted too**, because a build that returned the
English report for every locale would satisfy every equality perfectly: somewhere
in the corpus a rule fires, and its title has to come back different.

Measured before it was written down: the invariance holds on all 70 pairs. The
guard is the part that was missing, not the property.


### Fixed

**The profile was the one contract of the ten whose `schemaVersion` existed only
if you went through the CLI.** `docs/format.md` promises that every document
carries it and `conform` rejects a document without it — so `profileUsage()`, the
function in the package whose whole job is emitting this format, returned a
document `trazum conform` refuses.

**Nobody could have noticed from inside.** Every test that checked a profile
against the contract added `schemaVersion` first, because the CLI does, and a
fixture built the way the CLI builds it can never catch the CLI doing the work. A
connector author reading `docs/format.md` and using `@trazum/core` would have
found out from a rejection.

It is stamped by `profileUsage` now, where every other contract's builder stamps
its own — the plan, the annual record, the roll-up, the cost answer. The CLI's
own stamp is gone, and the compiler caught it as redundant, which is the change
proving itself.

**The guard checks the class, not the instance**: every document this package can
build with nothing but its own exports is handed straight to its own checker.
Proved by removing the field and watching `conform` reject it, and the eight
contracts the test cannot reach from the package alone are **named**, because two
documents checking out is not the format checking out.

Same shape as #290 on this project's record, where `outcome-report` was a
contract whose only implementation failed it for nine releases.


## 1.60.1 — "What else does this fail on"

**A patch, and nothing installable changed.** The arcs are done as far as they
can go — six of nine, with the other three open and named — so this is the
honest shape of the work that follows a plan: a guard that was checking the
wrong thing, the document it was supposed to be checking, and the rule that
would have caught both.

### Changed

**A rule joined [the doctrine](docs/doctrine.md), and it is the other half of one
already there.** *Prove a guard by breaking it* has been on that list for arcs.
The half nobody writes down is **and prove it does not fire on anything else** —
a guard that fails on its defect *and* on things that are not its defect gets
deleted after enough false alarms, and by then nobody remembers whether it was
ever right.

Two instances on this project's own record, the same shape both times — a proxy
that correlated with the property until it did not. A `docs/releasing.md` guard
that matched every quantity word near "manifest" and failed two correct
sentences, and the padding-versus-format guard fixed below. The question that
catches it is not *does this fail on the bug* but **what else does this fail
on**, and the cheap way to answer is to run the finished check against the real
thing, whole.

### Fixed

**A guard that asserted padding and called it format.**
`transcript-format.test.js` checks that the README's `trazum doctor` transcript
writes its money column the way the command does. It did that by taking the
`~ ` prefix off the first money line of a live run and requiring every transcript
line to use the same one.

**That space is right-alignment, not format.** A live run prints `~ $10.59`,
`~  $8.82` and `~$0.5300` in the same column, because `$0.5300` is two characters
wider than `$8.82`. So the guard agreed or disagreed depending on how wide this
repository's own figures happened to be — and it broke the day a config changed
them, on a change that had nothing to do with the README.

It now measures what the column actually promises: **the text starts at the same
offset on every row, priced or not**, on both sides — the command's block is the
yardstick and the transcript is compared against it. Proved by handing it the
defect it was written for.

**And that defect was real.** The transcript's two unpriced rows were indented
eleven columns where the command indents twelve, so *Below the cacheable minimum*
sat one space left of the priced rows above it. Found by measuring both, not by
reading either.


## 1.60.0 — "Our own medicine, measured"

**A minor closes an arc, and this one closes the last arc the 1.52–1.60 plan
named.** It does not close the plan: 1.54.0 and 1.57.0 are blocked on provider
credentials this repository does not have, and 1.58.0 is an editor extension —
a distribution commitment rather than a feature. **Six of the nine arcs are
delivered; the other three stay open and named**, which is what the plan said it
would do with an arc it could not build rather than renumbering the gap away.

**The arc committed in advance to a scoreboard**, and it reports one of three.
*The record is self-reported* is no longer true. *No outcome is recorded* is
weakened, not overturned. *This project has no usage log of its own* stands in
full, with the reason written down rather than worked around.

Everything below is about this project rather than about the product, except
`ignore`, which had to exist before the project could take its own gate.

### Added

**And the arc closes on the number it could not produce**, which is what it said
in advance it would do. The fourth and final chapter of arc 1.60.

| Admission | After the arc |
|---|---|
| The record is self-reported | **No longer true** — five defects found by CodeQL and by nothing here |
| No outcome is recorded for any of it | **Weakened** — one outcome on the record, the 0.5% above |
| This project has no usage log of its own | **Still true, in full** |

**Why the third stands**: this project would have to spend money on models and
record it, and it does not spend. What could be counted is the cost it *imposes*,
which is counted, under a heading that says it is a different sentence.

**Why the second is only weakened**: *whether it helps* needs somebody it helped.
*Whether it is used* has one available instrument and it was refused on the
record — npm download counts are fetches, not uses, and mirrors, CI runners and
bots are in the total, so the figure bounds **above** and nothing bounds below.
`A floor can prove "over" and can never prove "under"` is on this project's own
doctrine list; quoting a ceiling as evidence of adoption is that rule inverted.

One of three is less than the arc hoped for and exactly what it committed to
report. A guard grades the scoreboard against the page, so a later edit cannot
promote a second admission quietly.


**`ignore` — saying which files are prompts, when the extension cannot.** A new
config key, and the feature that had to exist before this repository could take
its own gate. Directory mode decided from the extension alone, so a repository
with a corpus of `.txt` files got every fixture walked, budgeted and baselined,
and there was no way to say otherwise — no ignore list, no include list, nothing.

```json
{ "extensions": [".txt"], "ignore": ["**/fixtures/**", "**/corpus/**"] }
```

Globs relative to the walk root. A matched directory is **not descended into at
all**, so an ignored tree costs one comparison rather than one per file in it. A
pattern that climbs out of the project with `..`, or an absolute one, is refused
the same way a budget pattern is — on a pull request the config comes from
whoever opened it. Threaded through every walk that already consulted
`extensions`, because the two halves of *what counts as a prompt here* disagreeing
is the same defect one layer down.

Found by needing it: the first honest config for this repository made
`trazum doctor` report *35 of 37 prompts have no budget* and list this project's
own test fixtures.


**And the loop this product sells was inert in the repository that sells it.**
The third chapter of arc 1.60. `trazum init` writes a config, `trazum baseline`
records what a repository's prompts cost, `trazum check` fails a build when they
grow — all three shipped arcs ago, all three are what `docs/ci.md` tells other
people to run, and **this repository had no config and no baseline of its own**.

`trazum.config.json` and `trazum.baseline.json` are committed now, CI runs the
gate, and the gate was proved by growing the prompts past the limit and watching
it exit 1 rather than by reading the flag.

**A gate flag that silently gates nothing**, found the first time the CLI was
pointed at this repository: `check --baseline` against a config with no
`baseline` block prints nothing and exits 0, because the flag is read as
`config.baseline !== undefined && boolFlag(...)` — a missing block *disables* the
gate instead of failing the run. A green build, from a command invoked with the
flag that asks for the check.

**And the reason no baseline was ever committed here.** At the root with the
default extensions, `trazum baseline` records **74 prompts and 509,255 tokens** —
the README, the changelog, the roadmap — because directory mode defaults to
`.txt .md .prompt .tmpl` and this is a documentation-heavy repository. The gate
is scoped to `examples/`, and the scoping is the honest fix rather than a
workaround: the prompts this project actually ships to models live inside `.ts`,
where the baseline gate cannot see them at all.

Guards: the committed baseline is checked against the tree file by file, the
config's `baseline` block is asserted present (without it the gate is the no-op
above), the workflow is asserted to still carry the step, and the gate itself is
run against a scratch copy grown past the limit.


**This project had never counted the tokens it puts on your bill.** The second
chapter of arc 1.60. Four system prompts ship inside `@trazum/core` and are sent
to a model on every `--llm`, `--suggest`, `--semantic` and examples-review run —
on your key, on your bill, before a single token of your own prompt is counted. A
tool that reports other people's prompt cost and had never counted its own is the
self-report problem in its most literal form.

Measured by running the optimiser on them, at the aggressive level:

| Prompt | Tokens | Recovered |
|---|---|---|
| `suggest` | 291 | 2 |
| `semantic` | 382 | 4 |
| `refiner` | 198 | 0 |
| `example-review` | 305 | 0 |

**1176 tokens, and this project's own rules recover 6 of them — half a per
cent.** Eleven of the twelve rules are inert on all four. The honest reading is
not that the rules are bad: these are prompts written to be read by a model, with
no politeness, no hedging and nothing repeated, which is the shape the
dictionaries have nothing to say about. The same result `rules --measure`
produced on `examples/`.

**What it establishes, and what it does not**, both on
[our own medicine](docs/our-own-medicine.md). It records **one outcome** — on the
only corpus this project owns, the feature this product leads with recovers 0.5%
— which by the standard set in 1.50.4 is a real outcome rather than an inference,
and the first on that page about the product working rather than about the
process around it. It establishes **nothing** about whether users benefit (four
prompts written by the person who wrote the rules are the least representative
corpus imaginable), nothing about the model-side passes those tokens buy, and it
is **still self-reported** — the optimiser marking its own work, one layer in.

**The admission it does not overturn.** *This project has no usage log of its
own* is still true and the page still says so: this measures the cost the project
**imposes**, not the cost it **incurs**. A guard asserts the page keeps saying so,
because claiming an admission fell when it did not would be the exact failure the
page exists to catch.

**The uncomfortable arithmetic is published rather than left to a sceptic.** At
about one per cent recovered, any prompt under roughly thirty thousand tokens
costs more in this project's own instructions on a single `--suggest` run than
the rules recover from it. Different budgets — a per-call cost you opt into
against a saving on every call forever — and the first thing a sceptical reader
would compute.

The guard derives the four prompts from the package's own exports, so a fifth
shipped without being measured fails the build; the published figures are checked
against what the optimiser produces, so they cannot drift from the prompts; and
both are proved against a fabricated fifth export and a fabricated row.


## 1.59.0 — "A language needs a maintainer"

**A minor, and it closes an arc out of order.** 1.57.0 and 1.58.0 are still open
and stay open: 1.57's remaining chapter needs a provider credential this
repository does not have, and 1.58 is an editor extension, which is a
distribution commitment rather than a feature. An arc that can be finished is
worth more than a slot left idle waiting for one — the same call 1.55.0 made, for
the same reason, and the gaps stay gaps rather than being renumbered away.

**The arc asked for one thing and got it**: make the maintainer requirement a
real, documented role with a real bar, and then admit that whether it lands is
not a scheduling question. Three chapters did that. What it deliberately did not
do is add an eighth language.

**The uncomfortable half is that the arc's own premise had been broken since
before the arc existed.** The rule was *a dictionary is a judgement about a
language and this project will not make it in a language nobody here reads*. Five
such dictionaries were already shipping. That is now a row on
[our own medicine](docs/our-own-medicine.md) and a rule in
[the doctrine](docs/doctrine.md).

### Added

**And the worklist that role asks for can now be printed.** The third chapter of
arc 1.59. The page asks somebody to read one dictionary's entries and judge them
one at a time — and until now that request could not be scoped, because the
entries live in one flat array per rule with a `// Dutch` comment marking where
each language starts. A prospective maintainer had to read `phrases.ts` to find
out how much they were agreeing to.

```bash
node scripts/dictionary-worklist.mjs nl        # or fr, de, pt, it
node scripts/dictionary-worklist.mjs fr --json
```

**The grouping was real and existed only as a comment.** `phrases.test.js`
already parsed those markers to check no language section was thin, so the
structure was derivable and simply unavailable to anybody outside this
repository's test suite.

**Two things the counting found.** The page said "a few hundred short phrases"
and it is **thirty to thirty-eight** — an afternoon, not a project, and the
figure was wrong in the direction that discourages volunteers. And English has 89
entries against Spanish's 81, so the five unreviewed dictionaries are also less
than half the size of the two somebody read; that is recorded on the page and not
addressed.

**The guard is a second, different parse.** The worklist slices between language
markers; the check counts the whole array and fails if the two disagree — an
entry written above the first marker belongs to no section, would appear on
nobody's worklist, and would still be editing people's prompts. Proved against a
fabricated dictionary with exactly that shape. The five counts the page quotes
are checked against what the script produces, so the number a volunteer is shown
cannot drift from the work.

**Found by running it:** piping the output into `head`, which is what the
documented usage invites, printed an EPIPE stack trace from a script that had
already done its job.

**The warning now reaches the branch where it matters most.** 1.56.2 said which
five of the seven dictionaries nobody here reads, on the branch where no rule
fired — and that is the branch where the prompt is *untouched*. The second
chapter of arc 1.59 puts it where the change is: when a rule fires on a prompt
whose own language is one of the five, the report says the entries that just
edited it were never agreed by a speaker, and to read the diff.

**Gated on the prompt's own detected language**, so an English or Spanish prompt
never sees it and it does not become a footer under every report.
`detectTextLanguage` answers `null` on a prompt too short or too mixed to place,
and this stays silent then: not-detected is not not-unreviewed, but guessing a
language in order to warn about it would put a Dutch warning on a Portuguese
prompt — the same overreach the detector exists to refuse.

Proved by running, in both directions: a Dutch prompt that fires the filler
entries gets the line, an equally wordy English prompt does not, and a Dutch
prompt too short to place fires a rule and still gets nothing.


### Changed

**A rule joined [the doctrine](docs/doctrine.md), and it is the only one there
that no test can enforce.** *A rule you wrote for yourself is a claim like any
other* — learned by breaking it. The rules in that document are enforced by
tests because a rule with nothing checking it drifts as fast as a number with
nothing checking it; the ones about the project's own conduct drift faster,
because a test asserts what the code does and nothing asserts that the project
still does what it said it would.

The cheapest available check is written down with it: put the promise next to
the inventory. This one was found by writing the rule and the catalogue into the
same document and noticing they did not match.


## 1.56.2 — "What this project was claiming about itself"

**A patch, and the number is the honest one.** A minor closes an arc. Two arcs
each gained their first chapter here — 1.59, *a language needs a maintainer*,
and 1.60, *our own medicine, measured* — and neither is closed. Nothing here is
a new command; both chapters are the same act done twice: a sentence this
project had been saying about itself turned out to be wrong, and was measured
rather than argued with.

### Added

**Five of the seven phrase dictionaries were written by nobody who reads the
language, and now the report says so.** The first chapter of arc 1.59 — *a
language needs a maintainer*. The dictionaries cover English, Spanish, French,
German, Portuguese, Italian and Dutch, and the coverage line named all seven in
one sentence, which reads as seven dictionaries of equal standing. Two of them
are languages this project reports in, which is the only evidence in this
repository that anybody here reads them. For the other five, nothing in the
history says a speaker ever agreed that removing an entry leaves the prompt
asking for the same thing.

**The roadmap and the catalogue disagreed, and the catalogue is the one users
meet.** An eighth language has been held back for several arcs on the stated
grounds that a dictionary is a judgement about a language and this project will
not make it in a language nobody here reads. Seven dictionaries shipped anyway.

**The evidence that reading the list is not enough is a bug this project already
shipped**: `INTENSIFIERS` carried `molto`, `muito` and `heel`, each an
intensifier *and* a quantifier, so *you have much time* became *you have time*
in three languages at once. Spanish avoids exactly that trap — `muy` yes,
`mucho` no — because somebody who speaks Spanish wrote it. The three were caught
by running prompts through the rules, which is a far weaker instrument than a
speaker, and one bug found by the weaker instrument is not a review.

**`DICTIONARY_STANDING`** records `reviewed` or `unreviewed` per language with
what was actually done to the entries, and `trazum optimize` prints the
unreviewed set on the branch where an empty result would otherwise reassure —
its own line, in both report languages, so the day somebody maintains all seven
it is deleted rather than reworded.

**[docs/language-maintainer.md](docs/language-maintainer.md)** is the role made
real: what a maintainer decides (five questions, none of them "is this the right
translation"), what is asked of them, what is deliberately not asked, and what
happens when nobody holds it — the language stays, its record says `unreviewed`,
and nothing pretends otherwise.

**It is also a row on [our own medicine](docs/our-own-medicine.md)**, and a
different shape from the others there. Every other row is a claim nothing
checked; this one is a rule this project wrote for itself and then broke, held up
for several arcs as the reason an eighth language was not scheduled while five
unread dictionaries were already shipping. No guard catches that — only
re-reading the rule against the catalogue does.

**What this chapter does not do** is promise an eighth language. Whether the
role is ever filled is not a scheduling question, and the page says so.

**Nothing is deleted.** A Dutch prompt is better served by a dictionary that
fires and says it was never reviewed than by silence.

The guards are derived, not written: `maintainers.test.js` reads the `reviewed`
set off the report catalogues on disk, so a French report translation fails the
build until somebody decides what it means for the French dictionary; the
document is checked against the code's unreviewed set rather than against a
list; and both checks are proved against a fabricated table and a page with a
language quietly dropped.

### Changed

**One of the three things this project could not say about itself has stopped
being true.** [docs/our-own-medicine.md](docs/our-own-medicine.md) ends with
three admissions, and arc 1.60 asks for at least one of them to fall to a
measurement rather than an argument. The third was *"every miss above was found
and written down by the same process that made it"*.

**Five defects on the record were found by CodeQL** — in 1.8.0, 1.46.0, 1.50.3,
1.53.4 and 1.55.0 — and not one by a test in this repository. They are tabulated
on the page with what each found: an SSRF where a validated URL and a fetched URL
were different expressions, a time-of-check/time-of-use race on a size bound, two
unanchored host patterns that a lookalike domain satisfies, a ReDoS in a guard
this project had just written whose own proof would have passed against the
vulnerable version, and a file-system race on the pull request that introduced
it.

**The 1.8.0 entry is the one that carries the weight**: CodeQL kept that alert
open twice, against this project's judgement, and was right both times. A
self-report cannot contain that shape by definition.

**And what it does not establish is written beside it.** CodeQL is not an
independent audit — it runs because this project turned it on and would stop the
day somebody here deleted a workflow. It is an outside instrument whose rules
this project did not write and cannot argue with, which is narrower than "somebody
audited us" and is what was actually measured. The other two admissions — no
usage log of its own, no outcome recorded for any of its work — are untouched,
and a test asserts the page still says so.

The list of releases is guarded: `docs.test.js` fails if one named in the table
stops mentioning CodeQL in its notes, so the claim cannot grow past its evidence.


### Fixed

**`docs/releasing.md` listed two of the three places `@trazum/core` is pinned.**
The recipe named `packages/cli` and `packages/mcp`; `apps/web` pins it as well,
so anybody following the steps left the web app resolving a registry copy of the
previous version instead of the workspace. Found by `publish.test.js` while
cutting this release, and the recipe now says three.


## 1.56.1 — "What the rules actually do"

**A patch, and the number is the honest one.** A minor closes an arc, and the
arc in progress is 1.57 — *the optimiser earns its name again* — whose thesis is
what belongs on the model's side of the line. Nothing here answers that. What is
here is the groundwork the arc could not proceed without: the deterministic side
measured, exercised and pinned, so a decision about what to add is made against
figures instead of against a headline percentage nobody can reproduce.

### Added

**`trazum rules --measure <dir>` — and what does each rule actually recover?**
The first chapter of arc 1.57, and it starts by measuring the number the whole
arc is about. The README says plainly that the deterministic rules recover about
one per cent, which is the fair complaint about this tool — and it is an
**aggregate**, consistent with every rule pulling its weight and equally
consistent with two rules doing all of it beside five that have never changed a
byte of anybody's prompt. Nobody here had measured which, and deciding what
belongs on the model's side of the line is a question about what the dictionary
side already covers.

**The rule order decides what the reader is told, and now something says so.**
The measurement showed three deletion rules each recovering the same tokens,
which looked like a defect worth chasing. It is not: a repeated stanza is a
repeated *block* and also a set of repeated *lines*, all three can find it, and
whichever runs first takes it. The applied run credits exactly one rule — the
leave-one-out measurement credits all three because each *would* have caught it
alone, and those are different questions.

**What had no guard was the consequence.** Coarsest-first means the same saving
is reported as *one repeated paragraph* instead of *three repeated lines*, and
the only reason written down for that order was that block deletions leave less
text for the rest to walk. A reorder would have changed what users read while
every number stayed identical and no test noticed. The order is pinned now,
adjacency included, and the comment says what it actually decides.

**A corpus that exercises every rule.** `rules --measure` could only ever
answer "inert here", because nothing in this repository contained what most
rules look for. Twelve fixtures now do — one per rule, each a short realistic
prompt carrying exactly what that rule is written to find — and the guard is
derived from the rule catalogue, so a rule added without a fixture fails the
build rather than joining a list nobody reads.

**And building it split one field into two.** `inertHere` was "saved nothing",
which quietly merged *never fired* with *fired and recovered nothing*. Those
look identical in a saving column and mean opposite things: the first is a fact
about the corpus, the second is a finding about the rule. `emphasis` is the
case — it lowercases shouted words, so the prompt changes, the instruction
changes, and the token count does not move. It now lands in
`firedWithoutSavingHere` instead of being filed beside rules nothing exercised.

**Two figures per rule, and they are never added together.** `alone` is what a
rule saves as the only rule running; `marginal` is what the whole set loses when
it is removed. They diverge exactly where rules overlap — on a prompt with a
repeated stanza, `duplicate-blocks`, `near-duplicate-blocks` and
`duplicate-lines` each recover forty tokens alone and **nothing** at the margin,
because the other two still find it. Reporting `alone` alone makes an
overlapping rule look load-bearing; reporting `marginal` alone makes it look
inert. `sumOfAlone` sits beside `tokensSaved` and the gap between them is stated
as the overlap rather than resolved into a total, because a single figure there
is the one number that cannot be true.

**The floor is separated out, and finding that was the point.** The optimiser
normalises whitespace whether or not any rule is enabled. The first version of
this measurement credited that to the rules — and run over this repository's
tokenizer corpus it reported that the optimiser saved twenty-one tokens and that
every rule was redundant, a sentence assembled entirely out of somebody else's
arithmetic. `floor` is now its own field and `tokensSaved` is the rules' work
alone.

**"Inert" is always said about the corpus.** A rule that finds nothing in these
files has not been shown to find nothing anywhere, and the difference is the
whole distance between "delete this rule" and "measure it on something else".

And a path defect found by running it: `--measure <dir>` read the walk's
relative names without putting the root back on, so it worked only from a run
whose working directory happened to be the root — which is the one case a first
probe uses.

Recorded rather than asserted: **on the two sample prompts this repository
ships, the deterministic rules recover nothing at all** — every rule lands in
`inertHere`. That is not a defect in the rules or in the samples. It is the
reason the measurement exists, because an aggregate quoted from elsewhere is not
a measurement of what is here.


## 1.56.0 — "Something that runs"

**The arc's question was whether alerting can be given without becoming a
hosted service holding other teams' metrics. The answer is yes for the
noticing, and no for the last hop — and both halves are now written down.**

What shipped is not a runtime. It is three things that make the *absence* of a
run visible: `history` names the calendar stretches no report covers, so a
series with a hole in it stops reading like a shorter one; `trazum pulse` gives
the outside view of a scheduled job, because the thing that would tell you a
watcher stopped was the watcher; and [docs/running.md](docs/running.md) is the
reasoning, the recipes and the place the answer runs out.

### Added

**[docs/running.md](docs/running.md) — something that runs, and why it is not
us.** The arc asked whether alerting can be given without becoming a hosted
service holding other teams' metrics. The answer is yes for the noticing, and
this page is that answer with its reasoning, its recipes and the place it runs
out.

What has to run and why the four jobs are separate — a single "run everything"
command would hide which of them stopped. Recipes for cron, systemd timers,
GitHub Actions and Windows Task Scheduler, each one a command this repository
actually accepts. Where the credential lives on each platform, and why Trazum
adds no new place for a key to sit.

And a section on **where the answer runs out**, because a page that only listed
what works would be advertising: a laptop is not a scheduler; the last hop is
still yours and Trazum cannot page you or know you are on holiday; a watcher can
only judge what has been pulled; and nothing here watches the watcher's watcher,
because the chain has to end at the thing you already trust to tell you when it
breaks.

**`trazum pulse` — did the things that are supposed to run, run?** `watch
--once` is built for a scheduler: a cron entry is the whole daemon, and its
state file records each cycle precisely so a restart is honest about the
stretch it did not watch. That file was read by exactly one thing, and that
thing was the next cycle.

**So nothing could tell you the watcher had stopped, because the thing that
would tell you was the thing that stopped.** A dead cron produces silence, and
a watcher with nothing to report produces silence too. `pulse` is the outside
view: the age of the last watch cycle, the age of the last pull into the store,
and how far the stored measurements reach — with `--max-stale-hours <n>` to
turn a run that stopped into a failing exit code.

**It runs nothing and hosts nothing**, which is the arc's question answered
rather than dodged: something has to notice, and the something is already in
your CI. A step running this on the schedule you already have turns a dead cron
into a red build without Trazum holding anybody's metrics.

Three refusals: a first run that never happened is **not late**, because there
is no cadence to be late against, so `never-run` never gates. Without a stated
threshold nothing is judged at all — how stale is too stale is a policy. And
**how far the measurements reach is never judged by the same threshold**: a
store pulled ten minutes ago whose newest record stops two days back is a
healthy cron in front of a provider that reports late.

**And a whole class of flag defect is now guarded.** `--max-stale-hours 36`
shipped, built, ran, printed a full report and gated on nothing: the flag was
not in `VALUE_FLAGS`, so it parsed as a boolean and `36` became a positional
argument. Nothing failed anywhere. A test now derives the rule from the source —
anything read with `stringFlag` or `numberFlag` takes a value by definition —
and it is proved against the exact line that shipped.

**A series with a hole in it is not a shorter series, and `history` now says
which it is looking at.** The first chapter of arc 1.56 — *something that runs*
— and it turns out most of that arc is not a runtime at all. A scheduled job
that stopped three weeks ago does not announce itself; it just stops adding
points, and a series missing its last three weeks and a series that only ever
covered a fortnight are the same document until somebody states the difference.

`unmeasured[]` names every stretch of calendar time between the first report's
start and the last one's end that **no report covers** — with the days, the
instants, and the reports either side. It is arithmetic on the spans and never
an inference about a schedule: this module has no idea how often anybody meant
to run anything, and guessing a cadence in order to call a gap *late* would be
the tool deciding what somebody's routine is.

**And the caveat travels on the finding.** A run is consecutive *reports* and
read as consecutive *time*: four rising periods with an unmeasured fortnight
between the second and the third was reported as "climbing for four periods",
when the climb may have reversed and come back inside the hole. Each run now
carries `unmeasuredDays`, and the terminal prints it on the run's own line —
a caveat one section away arrives after the reader has already formed the
sentence.

**`overlappingReports[]`** names two reports covering some of the same days.
`history` never sums across periods, but a reader with the document in a
spreadsheet will, and two exports over the same fortnight count it twice. Named
and never merged: which of the two is the better measurement is not knowable
from here.

A gap shorter than a whole day is not reported — that is the seam between two
adjacent exports, not a stretch nobody measured — and the day count is floored
rather than rounded, so a gap this tool calls three days is at least three days.


## 1.55.0 — "More than one machine"

**The arc closes on a format and a merge, not a service.** Everything in this
repository assumed one operator with the files on disk. Four people who each
measured their own traffic had no way to combine what they measured without one
of them gathering files by hand — and the tool whose whole argument is that it
reads your bill without uploading it could not be the place everybody's bill got
uploaded either. So the answer is a document and an arithmetic: each contributor
runs `profile --json` where their traffic already is, and `trazum rollup` merges
what comes back.

**1.54.0 is not skipped by accident, and the number is not reused.** The arc it
names — the counter, per family — needs provider API keys this work did not
have, and inventing a band is exactly the estimating-and-measuring merge this
project spent 1.36–1.40 removing. The hole in the sequence is the record that an
arc was jumped rather than dropped, and renumbering the plan to hide it would
rewrite a document whose whole value is having been written before the code.

### Added

**`trazum rollup` — several people's bills, one roll-up.** Everything here
assumed one operator with the files on disk: `--by-source` and `owners` divide a
bill somebody already collected, and nothing combined bills nobody collected
together. Each contributor now runs `profile --json` where their traffic already
is and hands over the document; `rollup` merges them. A directory argument rolls
up every `.json` inside it, so a shared folder people drop a document into is a
roll-up without a shell loop.

**A format and a merge, not a service.** Nothing is uploaded and there is no
account. That is the constraint the arc was written under: a tool whose argument
is that it reads your bill without uploading it cannot also be the place
everybody's bill is uploaded.

**Four refusals, because most of a profile does not merge.** Findings computed
from individual calls — percentile shapes, conversation growth, repeated turns,
truncation retries — are named in `notMerged` with the contributors that have
them, rather than dropped. A day drawn from two contributors has **no** dearest
label: the merged answer needs per-label-per-day spend no document carries, and
taking the larger of two answers is wrong whenever a runner-up in both adds up
to more than either winner. A contribution that does not conform is rejected by
name and exits 1, because a machine that contributed nothing must not read like
a machine that spent nothing. And the largest single call is a **maximum**,
never a sum — four machines' largest calls added together is a call that never
happened, in the direction that makes a context window look tight.

**Each contributor's gaps stay with that contributor.** Unreadable lines,
unpriced calls, no clock, a partial clock, no sessions, no labels, duplicate
lines: each listed under the machine that has it. Summed, they would say "3% of
this roll-up is unpriced" when the truth is "one of your four machines is 90%
unpriced and the other three are clean", which is the averaging-away the arc
exists to refuse.

**The one thing it cannot do, said every time.** Overlap between contributors is
unmeasurable: two people exporting the same traffic double the bill, and a merge
of summaries cannot see it, because the raw lines a duplicate check needs are in
no document. Every roll-up of more than one contributor carries
`overlap-invisible` in `cannotSay` — and `conform` **fails** a roll-up that does
not, along with one that rejected a contribution and does not say so. A format
that carried the fields and lost those refusals would hand somebody a doubled
total that looks audited.

**`roll-up` is the tenth `--contract` name.** Detection tests it before
`profile` on purpose: a roll-up carries `byLabelAndModel` too, so testing the
profile first would accept every roll-up as a profile and never apply the two
refusals only a roll-up has to carry.

**A roll-up can now contribute to another roll-up.** Three teams roll up their
own machines and the organisation rolls up the three. `rollup` accepts a
`roll-up` document wherever it accepts a `profile`: every summable part carries
the same field names, which is what makes the arithmetic free.

What is not summable is carried through deliberately, because each piece is a
refusal that has to survive nesting or the format is worse than no format.
**Contributors are flattened, never collapsed** — twelve machines stay twelve
machines with twelve sets of gaps, each carrying `via`, the roll-up it arrived
through. **Rejections travel**, with their `via`, so a machine whose document did
not conform cannot be made to disappear by adding a layer. **Caveats are
unioned**, so an inner roll-up that could not see overlap does not become an
outer one that could. And a finding an inner roll-up refused to merge does not
become mergeable by being handed on — the same finding from two roll-ups is one
entry naming both sets of machines.

**And the double count nesting makes possible is named.** Handing over both a
roll-up and one of the machines inside it counts that machine's money twice; the
documents differ, so the identical-document check is blind to it and the *name*
is what sees it. `repeatedContributors` states it and subtracts nothing — two
teams genuinely running `api.json` is possible, and deciding between them by
removing money is the repair this tool does not make.

**A span is not a period, and the roll-up now knows the difference.** A log
whose latest record is the 5th may be a log of a quiet week or a log that
stopped being written on the 5th — the records cannot tell those apart, and the
first version read every contributor's span as its period. A profile run with
`--since`/`--until` already carried the window it asked for; the roll-up carries
it through as `claimed`, keeps `claimedSpan` apart from the observed `span`, and
names every day inside a bounded claim that recorded nothing. Contiguous runs
rather than a list of dates, so a year-long claim with three days of traffic is
a handful of entries instead of three hundred and sixty-two strings.

A contributor that claimed nothing gets `no-claimed-period` rather than having
its span quietly promoted to one; a claim with a single end gets
`claim-not-bounded`; and a claim longer than ten years is **kept and not
walked**, because these documents come from elsewhere and `untilMs: 1e15` is a
malformed document rather than a team with a long memory.

`undatedExcluded` travels too — the records a contributor's own window could not
place — and is `null` when there was no window, never `0`, because zero would
say a window excluded nothing.

### Fixed

**`--help` retyped the list of contracts, and it stopped at `cost-answer`.** Two
releases each added one and the help text named neither, one section below the
USAGE block that a whole test suite exists to keep provider names out of. The
list is now interpolated from `CONTRACT_NAMES`, and a test reads the names out
of the CLI's own refusal and asserts every one appears.

**The README said Trazum emits ten documents; the format page said eleven and
twelve.** Two pages, three numbers, one table. Both now derive from the same
count, and the guard that checks the format page's ordinal derives it from the
row count instead of matching the literal `twelfth` — the guard against a stale
count had itself gone stale.

**The roll-up statted a target before reading it.** `stat`, branch on
`isDirectory()`, then read the path — a check-then-act, and CodeQL reported it
as a file-system race on the pull request that introduced the command. It asks
once now: attempt the directory listing, read the error code, and let `ENOTDIR`
mean *this is a file*. There is no window between two operations when there is
only one. Guarded at the source rather than by behaviour, because both shapes
behave identically on a filesystem nobody is racing — which is every filesystem
a test runs on.

**Five copies of the help-screen defaults lived in one test file.** Adding a
field to `HelpDefaults` made every one of them throw at the first `.join`: five
failures, one cause. The help screen is rendered from data precisely so its
enumerations cannot go stale, and a test that retypes that data is the staleness
one layer down.


## 1.53.4 — "What it says and what it does"

### Changed

**The web app got the layer the palette never had.** It carried two greys —
`--ink` and `--ink-soft` — so a paragraph a reader is meant to read and a
footnote they are meant to skip had the same weight. Three tiers is the
smallest number that lets a page say *read this*, *read this if you want* and
*this is here for the record*. A second border tier came with it, for edges
that separate regions rather than parts.

**And state became a token.** Hover and pressed were reached for ad-hoc —
`bg-muted` at one call site, `bg-accent` at another — so two controls doing the
same thing looked different, and changing what hover feels like meant finding
every one. `--layer-hover` and `--layer-active` are defined once, **and
redefined in the dark block**: a token whose only definition lives in the light
palette is one the dark theme silently inherits, which is how a page ends up
drawing one theme's hover on the other theme's surface.

**The application's chrome became a sidebar.** Wordmark, tagline, account and
language all sat at the same altitude as the work, so nothing said "this is the
chrome and the rest is the product". It was first pulled into a full-width bar;
that bar became a rail, because the thing that was missing was not altitude but
a place for navigation to live. 236px expanded, 60px collapsed, the preference
kept in `localStorage` so it survives a visit. Below `lg` the same rail arrives
as a drawer with a scrim, and closes three ways — Escape, the scrim, and
choosing a mode, which is what it was opened for.

**One rail, not one per breakpoint.** The first draft rendered it twice, inside
an `lg:hidden` block and again inside a `hidden lg:flex` one. Hidden is not
absent: that put two tablists on the page controlling the same panels, two
`role="tab"` elements per mode for a screen reader to read out, and two account
components each fetching the session. Visibility is a style; duplication is a
bug.

**A phone had 261 pixels of a 390 pixel screen.** The tabs root is a flex
container and `orientation="vertical"` leaves it a row, so the mobile bar became
a 128px *column* standing beside the content. It is a column below `lg` and a
row at it now. Invisible in every screenshot, because the only ones taken had
the drawer open over it, and obvious the moment the bounding boxes were printed.

**The three modes read as navigation.** They were dressed as a settings toggle:
a small pill group in the sunken grey, the weight of a rule-level switch. They
are not one control with three positions — Optimise shortens a prompt, Compare
judges two of them, Your bill reads a usage log, which are three different jobs
on three different inputs.

**Collapsed, their labels are hidden rather than removed.** `sr-only`, not
unrendered: a `title` attribute alone would rest a tab's whole accessible name
on the weakest source the accessibility tree has, on the one control a reader
has no other way to identify.

**The account control became a menu.** A badge, an avatar, a name and a Sign out
button in a row fitted a full-width header and fits neither width the rail has.
The identity is the trigger now and the actions live behind it, opening upward
at 236px and sideways at 60px so it can never open off the screen. Signing out
is rare and destructive and no longer sits one stray click from the navigation.
The "temporary session" warning moved inside, where there is room for the
sentence that explains it, and sits above that sentence rather than run into it:
*"temporary session This deployment keeps sessions in memory"* is not a sentence
in either language.

**The rail has two columns, and every number in them is derived.** A nav row is
8px of the list's padding, 1px of transparent border and 10px of its own — so
every glyph sits at 19 and every label at 46. The wordmark carried its own 12px
and hung seven pixels left of the column it heads; the account row's gap is
`5px` rather than 10, which is 10 minus the 5 its 22px avatar exceeds a 17px
icon, so both columns hold across two different glyph sizes. Collapsed, all five
glyphs centre on the same half-pixel.

**A cascade the class list hid.** The collapsed mode icons measured 12.5px left
of centre while every other glyph in the rail measured half a pixel.
`TabsTrigger` carries its own `group-data-[orientation=vertical]/tabs:justify-start`,
and a `[&_button]:justify-center` from the list is the same declaration at lower
specificity — so tailwind-merge did its job, the class list was correct, and the
computed value was still `flex-start`. The override belongs on the trigger, in
the same variant.

**Three waits, each in the shape of what is coming.** Optimise, Compare and
Library shared one defect: the button changed its label and the panel that will
hold the answer went on showing its empty state, so the only sign of life was at
the far side of the screen from where the reader is looking. Each draws the real
rows of its own report now — the caveat and the headline figure for Compare,
three list rows for Library — so nothing jumps when the answer lands. Each
carries `role="status"` and `aria-live="polite"`; Library keeps its sentence for
anyone listening rather than looking.

**The empty result panel names what the report will contain.** It was one
italic sentence centred in a grey box — the shape of a panel apologising for
being empty — and it is the first thing every reader sees, before they have
typed anything. It now says that nothing has happened yet, what to do, and the
three things pressing the button actually gets you.

### Fixed

**A guard stopped guarding, twice, and both times it was this work that found
it.** `ui.test.mjs` required the Library trigger to be spelled
`<TabsTrigger value="library">` with nothing after it — so giving it a title
broke a test with nothing to say about titles, and widening it to allow
attributes still required them on one line, so wrapping the tag over four lines
broke it again. It matches the open tag and any whitespace now, and is handed
three ungated triggers it must reject rather than one. What is guarded is the
gate, not the spelling.

**Every README transcript was run, and twenty of them were not transcripts.**
The page is headed *"Real output, transcribed"*. Ten commands were checked by
executing them and comparing line for line — `rank`, `blame`, `diff`,
`baseline`, `check`, `route`, `prune`, `quality`, `eval`, `profile` — with each
difference handed to an independent reader who had to reproduce it before it
counted. Twenty-nine survived, and all but four are one shape: **a transcript
that stops early and is not marked abridged**, so a reader takes a partial
output for a whole one. The README already had the convention — a bare `…` line
inside the fence — and simply had not used it.

Four were not that.

*`--max-growth` is a token count, not a percentage.* The page said
`--max-growth 10` fails "a prompt that grew more than 10%". It compares
`tokenDelta > limit`. Measured both ways: a prompt that grew **50%** but five
tokens passes `--max-growth 10`, and one that grew **3%** but thirty tokens
fails it. This is a gate people put in CI.

*`blame`'s headline figure was six times too high.* The block priced +759
tokens at 50,000 calls as +$1,138.50 a month. Run on a constructed history,
+500 tokens at 50,000 calls prints +$125.00 — a rate of $5 per million, which
is what the catalogue lists for Claude Opus 5 and what the sibling `diff` block
on the same page already agrees with. The figure is +$189.75, and the two
blocks had been contradicting each other.

*`profile` handed the reader the wrong homework.* The block's whole point is
the command it gives you to check its own claim, and it printed
`trazum eval <prompt> --cases <cases> --model claude-sonnet-5` where the tool
prints `trazum route <log> --prompt-file <prompt> --cases <cases> --yes`.

*`check`'s report had been re-laid-out around its own transcript.* The status
column moved from the end of the row to the front, a header line and a summary
line appeared, and the token count no longer matched the snippet printed
directly above it — 34, not 43, for the very code the page shows. The snippet
now carries both prompts it reports on, so every number in the block is
derivable from the page itself.

**And the caveats had been quietly falling out of the transcripts.** `quality`
prints two — that a before-and-after is not an experiment, and that it cannot
see what else you deployed that day — and the block had replaced the first with
a blank line and dropped the second. `blame`'s "±10%" estimate note, `rank`'s
two definitions, `prune`'s yardstick sentence (cut mid-clause and ended with a
full stop the tool never prints), `route`'s "agreement is not correctness",
`eval`'s "read the cases below before shipping this", and `baseline`'s "if the
growth is intended, re-record" were all absent. Every one is the sentence that
bounds the claim above it. A refusal never arrives bare, and neither does a
measurement.

**`trazum watch` reads the store, and the section that documents it never said
so.** It shows `trazum watch --once` under the words "what a cron entry runs",
and on a fresh checkout that command refuses: *"Nothing has been measured yet:
the store at .trazum/store is empty."* The refusal is exemplary — it names the
store, names `trazum connect <provider> --store` as what fills it, and says why
watching nothing would be wrong. The page just never mentioned the prerequisite,
so the reader met it after writing the cron entry rather than before. One
sentence, and it borrows the tool's own words.

The transcript below it cannot be reproduced here — filling the store needs a
provider credential this session does not have — and that is said rather than
worked around. What WAS checked and holds: `trazum connect` with no argument
answers *"Available: anthropic, openai"*, says the credential comes from the
environment and is never stored, and points at `--dry-run`, exactly as the
prose claims; `--dry-run` names both the prefixed and unprefixed variables for
each provider and the scope each one wants, also exactly as claimed; and
`trazum gateway` with no argument names anthropic, openai, deepseek and google
while the page states no count beside them, which is the rule that has been
broken thirteen times elsewhere.

**And `trazum serve`'s response was missing the one field the page insists on.**
The block is presented as a complete JSON document; `answerCost` returns
`schemaVersion: 1` from every one of its four branches and the type declares it
non-optional, so a consumer copying that shape would not know the field is
there — on a page that elsewhere calls it *"the only thing you must branch on"*.
`reason` and `call.basis` were absent too. It says which fields it trims now,
and does not trim that one.

Checked and clean in the same pass, and recorded as such: `docs/format.md`'s
three `conform` invocations all run exactly as written — a plain file,
`--contract profile` against a real report, and `-` with `--json` over stdin —
and it has no example documents to parse, only those commands. `optimize
--reorder --diff` reproduces its four lines word for word on a prompt built to
the shape the flag exists for. `optimize --suggest` calls the model and could
not be run here, which is said rather than guessed at.

**The `--json` contract was checked, and it holds — but its harvest could have
stopped reading without saying so.** `docs/json-output.md` documents
thirty-five top-level fields and `json-contract.test.js` enforces them in both
directions against a real run: nothing emitted is undocumented, nothing
documented goes unemitted, and the two fields a plain run does not produce are
covered by the flags that produce them. That is a clean result and it is
recorded as one.

The weakness was in how the test read the table. Its field pattern was
`[a-zA-Z]+`, and no field is spelled with a digit today, so it read all
thirty-five rows and nothing was wrong. The day somebody adds `p95Usd` and
documents it, the name would stop being harvested, the "emits every field it
documents" check would stop covering it, and nothing would say so — the shape
this repository has been caught by more than a dozen times. The harvest counts
the rows now and fails on any it cannot read, which was proved by planting a
nested path in the real document and watching the suite name it.

**And one figure was a string the tool cannot produce.** `profile`'s
conversation-shape line wrote a median of `$0.02`; it interpolates
`formatUsd(shape.medianUsd)`, and `formatUsd` gives four decimals under a
dollar and five under a cent — precisely so a figure that rounds to nothing at
two decimals does not print as `$0.00` beside a column of real money. It is
`$0.0200`. A guard now takes the rule from that function rather than from any
list typed beside it, and checks every dollar amount in every fenced block on
the page; the sweep found this one and nothing else.

**A completeness pass asked what every lens had missed, and found four more.**
The frames *during* a transition, the dark theme's overlay layer, Windows High
Contrast, and the requests the page issues on load — four places nobody had
looked because every other check measured a settled state in a default theme.

*In dark mode the scrim brightened the page instead of dimming it.* It was
`bg-foreground/40`, and `--foreground` in dark is a near-white, so the layer
whose whole job is to recede became a 40% white wash: the page behind it
measured a relative luminance of 0.0157 closed and 0.1681 open — eleven times
brighter — while the drawer in front of it sat at rgb(38,36,32). The thing you
were meant to be looking at read as a dark hole punched into a bright field.
The scrim has a token of its own now, defined once and deliberately not
redefined for dark. Measured after: light dims from 0.9007 to 0.2731, dark from
0.0156 to 0.0108.

*Expanding the rail threw its contents across the page.* Only `width` is
animated, so every label re-renders at full size on the first frame while the
box is still 60px — and with nothing clipping it at `z-50`, the language toggle
was drawn and answered hit-tests 70px into the main column for the first ~50ms
of every expand. Proved by releasing the clip again afterwards:
`elementFromPoint(130, 842)` returns the "Español" button at rail widths of 60,
66 and 91px without it, and nothing with it.

*Under Windows High Contrast the current mode became untellable.* The rail
signals it with a background tint and nothing else — the `line` variant's
marker is switched off, because in a vertical list it sticks out of the rail —
and a tint is exactly what forced-colors replaces. Active and inactive rows
both measured rgb(232,232,232); all that survived was 31 terracotta pixels
inside a 17px glyph. The selected tab takes a `Highlight` outline there: a
shape rather than a surface.

*The session was fetched twice on every load,* by two components reading
different fields of one answer — and two answers to one question can differ. A
session expiring between them puts the Library tab on the page for a reader the
account control has already decided is signed out. One fetch now, passed down;
the account control takes the session as a prop and still renders nothing until
it arrives.

**Two documents described a header the app no longer has.** `README.md` and
`docs/accounts.md` both said the Sign in button and the "temporary session"
warning live in the header. They live in the sidebar and in the account menu.

**Three guards, each proved by breaking it — and each cried wolf first.**

*Styling a shadcn primitive from its parent*, which loses to the primitive's
own variant-prefixed declarations and says nothing. The guard reads what the
trigger defends out of `tabs.tsx` rather than a list typed beside it. Its first
version flagged `[&_button:hover]:bg-layer-hover`, which collides only in a
state the trigger does not define and is measured winning in both themes; its
second flagged `[&_button[data-state=active]_svg]:text-terracotta`, which lands
on the icon rather than the button. State and element are each half the rule.
And its extractor could not see the two worst offenders it was written for,
because `[^\]]*` stops at the first `]` and both of them carry their own
brackets.

*A focus indicator that computes to nothing* — `outline-none` with only a
`focus-visible:outline-<n>` beside it. Shown firing on the pair that shipped
and staying silent on the ring that replaced it.

*A desktop preference read inside the rail.* Its first version flagged
`<Account collapsed={railCollapsed} />`, the child's own prop name; it ignores
an attribute name now and still catches `collapsed={collapsed}`.

**And CodeQL found one in the guard itself.** The extractor's alternation was
ambiguous — both branches could begin with `[` — so every `[[]` in the input
had two readings and the star multiplied them: 0.2ms at ten repetitions, 93.6
at twenty-two, 6,051 at twenty-eight. Excluding `[` from the plain-character
branch leaves one branch able to consume a bracket, and the same input takes
0.01ms.

**The test written to prove that fix would have passed against the vulnerable
version.** It fed the pattern a plain run of sixty `[`, which the ambiguous
form chews through in 0.08ms — the recurring trap of this repository, an
assertion that only ever sees inputs it cannot fail on, this time inside the
proof for the defect itself. A test file is not exempt from being a guard.

**An audit of the shell found nine more, and every one was measured.** Five
lenses swept the running app — geometry, keyboard, colour, Spanish, breakpoints
— and each finding was handed to an independent reviewer who had to reproduce
the numbers before it counted.

*The active row had no surface, in either theme.* The same cascade as the
collapsed icons, twice more: the trigger carries
`group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent` and a
`dark:` copy of it one step higher, so `bg-layer-active` from the list computed
to `rgba(0,0,0,0)` and the collapsed rail signalled the current mode by icon
hue alone. Fixing light left dark untouched, because the dark rule outranks the
light one.

*A closed drawer kept five controls in the tab order.* Off-screen is not gone:
at 390px the second Tab landed on a Close button at x=-248, and five
consecutive presses changed zero pixels on screen.

*The drawer claimed modality and did not enforce it.* It is a `dialog` with
`aria-modal` now, focus moves in on open, Tab wraps inside, and Escape returns
it to the hamburger.

*Two contrast floors.* `--ink-faint` measured 2.90:1 light and 3.60:1 dark
everywhere it was used; inactive tab labels 3.77:1 in light only, where the
dark theme had a token and the light one had shadcn's `/60` opacity. The
faint tier is now the lightest warm grey clearing 4.5:1 on both the rail and
the raised menu — a narrow band, because a legibility floor outranks a visual
tier.

*Focus indicators.* The account trigger had `outline-hidden` and nothing in its
place, and every other ring in the rail was at half alpha — 2.03:1 against a
floor of 3:1. All five controls paint a full-strength ring now, verified by
pixel diff rather than by reading the classes.

*Spanish, and a stacked toggle.* The Spanish tagline ran 13px under the
drawer's close button and lost three characters to it; the collapsed language
buttons rendered 18px against a declared 28, because `flex-1` in a column makes
two buttons share the group's height.

*A desktop preference reached a phone drawer,* producing a 248px overlay
containing a 60px rail — no wordmark, every label `sr-only`, and no expand
control, because the only one is `lg:flex`. And *crossing to a desktop with the
drawer open* left a full-screen scrim and a locked body with no visible control
to lift either.

**Four of the eleven were introduced while fixing the others**, and each was
found by running rather than by reading: a focus trap that read its container
once and silently did nothing, a retry that stopped at finding a candidate
rather than at moving focus, an `outline-none`/`outline-2` pair computing to
`outline: none 0px`, and a comment claiming controls had no focus indicator on
the strength of a probe that read the computed style three percent into a
transition.

Nothing about what the app computes changed. The web suite goes from 351 to 367
— the Library gate assertion was rewritten twice, and three guards were added
below.


## 1.53.3 — "Two surfaces, two formats"

### Fixed

**A transcript had stopped being a transcript.** `trazum doctor`'s money column
in the README read `~$4,912`. The command prints `~ $4,912` — tilde, space,
dollar. The transcript was taken before the column was spaced and never
re-taken, on a page headed *"Real output, transcribed"*.

**A naive rule here would have broken the correct surface.** `optimize`'s
advisory suffix is `` ` ~${amount}/month` `` — **no** space, deliberately,
because it trails a sentence rather than heading a column. Banning `~$` across
the documentation would have failed `~$327.40/month` in two READMEs, which is
exactly what the tool prints. The subject is the doctor transcript, not the
character sequence — so the guard takes the column's shape from **running
`doctor`** at test time, and separately asserts the sentence-trailing form
survives a future tidy-up that tries to make the tildes "consistent".

**One fix was reverted for being the same defect again.** The first pass also
added *"(58 days ago)"* to the transcript's prices line, because the command
prints an age now. That number is relative to today and would be wrong
tomorrow — a count that ages on its own, in a paragraph about counts that age
on their own. Only the spacing, which is a fact about the formatter and not
about when the run happened, was kept.

**The npm page presented twenty-one of thirty-two commands as though they were
all of them.** `packages/cli/README.md` is what npm renders — for most people
the first and only page they read. Its `## Commands` table stopped without
saying it stops, and the sentence beneath it said *"`trazum --help` documents
every flag"*: flags, never commands. `trazum gateway`, the only thing in this
product that can refuse a call **before** the money is spent, had no row and no
mention.

The fix is not to list all thirty-two on a page like that. It is to say the
table is a selection and point at the tool — the same rule this repository
applies to a skipped test and a half-measured day: **silence about
incompleteness reads as completeness.** That sentence is also only true now
because the previous release put every command in `--help`.

**Writing that disclaimer produced the very defect it was fixing, twice in one
paragraph.** The first draft enumerated the eleven omitted commands — a list
typed beside the thing, stale the moment a command is added, which is exactly
what the last four fixes had been removing. The second said *"a dozen more"*
when there are eleven. Both are refused now: the disclaimer may state no count
and name at most one command as an example.

**And the check written to catch the second one did not catch it.** It listed
`a dozen` in lower case and was case-sensitive; the draft began the sentence
*"A dozen more"* and sailed straight through. A guard that reads as coverage and
covers nothing — found by running the probe rather than by reading the regex,
and now handed both phrasings directly.

**An existing guard caught this work's own test.** The first version bounded the
`## Commands` section by finding the next heading by hand, which
`publish.test.js` refuses: bounding a section by its neighbour has silently
broken a harvest nine times in this repository, and `sectionOf()` exists as the
one home for the rule. Writing it again inside a file about that same class of
defect would have been the joke completing itself.


## 1.53.2 — "What the tool says about itself"

### Fixed

**An Action pin could point at a commit that is not on `main`, and every check
passed.** The guard on the README's `uses:` lines is thorough — a 40-character
SHA, never a tag, with a version comment verified against **that commit's own**
manifest rather than the working tree. All of it is satisfied by the pre-squash
head of a feature branch, which says exactly the right version and is deleted
the moment the pull request merges. GitHub can garbage-collect it, and a
workflow pinned there stops resolving with no warning to anybody.

This was caught while preparing this very release: the sha to hand was the
branch commit, not the squash-merge on `main`. It is now also gone from the
clone, which is the hazard demonstrating itself. The pin must be an ancestor of
`origin/main`, and a clone without that ref reports the pin as unverified rather
than passing over it.


**Two commands had no options section, and one had two.** `trazum ladder` takes
`--since`, `--until` and `--label`; `trazum owners` takes `--since` and
`--until`. Neither had an `OPTIONS FOR` section, so a reader had no way to learn
from the help that they take a window at all — and both are commands whose whole
point is judging a period.

**`eval` had two sections under the same heading, with different content.** One
listed `--export promptfoo` and `-o`; the other carried the paragraph explaining
that it costs **three** provider calls per case — the original twice to measure
the model's own run-to-run variance, and the optimised once — and exits 1 on
divergence. Whichever a reader scrolled to, they got half, and the duplicate
heading meant neither half announced itself as one. Merged into a single
section, in both locales.

A guard now derives the commands that take flags of their own from
`COMMAND_FLAGS`, minus the globals, and requires each to have **exactly one**
section. A command that gains its first flag fails until somebody writes what it
does; a heading that appears twice fails naming itself. The duplicate check is
handed the shape it exists for rather than only today's corrected help.

**`trazum profile` was missing from `--help`.** Not a small one: `profile` is
the command almost every refusal in this product points a reader at — *"trazum
profile prices a mistral log you export"*, the `--max-usd` gate that fails a
build on the bill, the `--json` documents `history` reads. It had a full flag
allowlist and its own `OPTIONS FOR profile` section, and it was absent from the
list of commands the help presents.

Nothing noticed because the *"thirty-two commands"* figure the README states is
guarded against `COMMAND_FLAGS`, which had all thirty-two. The USAGE block had
thirty-one, and **no check compared the product's own two lists with each
other**. A guard now does, in both directions: a command that is dispatched and
absent from USAGE fails, and so does a USAGE line promising a command the CLI
does not have — because a fix for the first that invented the second would
satisfy one check and mislead every reader.

**`--help` said the gateway fronts two providers while the gateway itself said
four.** The USAGE block read `trazum gateway <anthropic|openai>`; running
`trazum gateway` with no argument answers *"Known: anthropic, openai, deepseek,
google."* A reader meets both within a minute of each other, and the wrong one
is the first.

It went stale during the release whose entire subject was that list. Nothing
caught it, because the guard that exists for exactly this — the one comparing
`docs/gateway.md` against the compiled upstream table — was pointed at the
documentation, and the same sentence lived inside the product.

**The fix is not a longer list kept in sync.** It is `<provider>`, in both
commands and both locales, with the enumeration left to the refusal that
derives it. A list of providers typed beside the thing has now gone stale in
`docs/gateway.md`, in `ROADMAP.md` and in the help text itself; the answer each
time was to stop writing the list, not to correct it.

A guard now refuses any USAGE line whose `<a|b>` group names two or more
providers — the provider set derived from the catalogue, the upstream table and
the connector list together, so it covers a name defined in any of them. It is
handed the exact line it was written for, and separately the innocent shapes
(`<file|dir|->`, `[--dry-run | --yes]`) it must not fire on. And the other half
is asserted too: both refusals still name every provider they support, because
removing the list from USAGE would be a regression if nothing else told a reader
what to pass.


## 1.53.1 — "The band stays inside the family it was measured in"

### Fixed

**Claude's band had leaked out of Claude — 1.54's second chapter, and three
defects with one root.** `±10%` is the estimator's error measured against
Claude's tokenizer over twenty-one samples, and `--exact-tokens` counts with
Anthropic's endpoint. Both facts were true, neither was enforced, and three
claims escaped the family they were measured in.

**`optimize --exact-tokens` handed the user's own model id to Anthropic.**
`countTokensAnthropic({ apiKey, model: result.usage.model })` — correct on a
Claude model, and on `gpt-5` either a confusing upstream error or a number
counted with the wrong tokenizer and labelled **exact**, which is the strongest
word this tool uses about a count. It refuses by name now, naming the model and
its family and pointing at that provider's own tooling. **The family check runs
before the key check**, because telling somebody on another family to go find an
`ANTHROPIC_API_KEY` sends them after a credential that could not have helped
them.

**The context-overflow advisory said "The call will fail" to every family.** The
most absolute sentence this product produces, with no dollar figure to soften
it — and the margin behind it was Claude's. On a family nobody has measured, an
estimate over the window is *always* uncertain however far over it looks,
because the margin that would settle it is the unknown. The fix is not a second,
wider band: inventing a number would be the same mistake with worse arithmetic.

**And both context advisories sent every reader to `--exact-tokens`.** *"Settle
it with --exact-tokens; the counting endpoint is free"* — pointing most of the
seven priced families at a counter for a different tokenizer, and, since this
release, at a command that refuses them. The advice is bounded rather than
deleted: the family it works for still gets it.

`BAND_CALIBRATED_PROVIDER` and `bandGoverns()` are exported so the fact has a
name. A missing provider reads as **not covered**, never as covered — the
flattering reading of missing information is the one this project does not take.

**Two things this found in itself.** The provider-less refusal said the model
*"is not a model in the price catalogue at all"*, which is false in the only
case that reaches it: `provider` is optional on a priced model and `--pricing`
lets anybody supply one, so the model is in the catalogue and its family is what
is missing. Found by running the branch rather than reading it. And the new
guard's first draft asked for a prompt 1.01x a 1,000,000-token window but grew
the text by doubling, producing 1,966,080 tokens — landing in the *certain*
branch and failing a correct implementation over a badly built input.

**`threshold-honesty.test.js` legitimately failed nine models**, because it
recognises hedging by vocabulary and the new sentences hedge in words its list
did not know. `may be` became `\bmay\b`, plus *"not knowable"* and *"cannot be
said"*. Widening a guard's accept-list to make a change pass is how a guard
becomes decoration, so the pattern is now handed the flat sentences it exists to
refuse and must reject all three.

### Added

**The band harness measures four families, not two — 1.54's first chapter.**
Trazum prices seven providers with an estimator calibrated on one, and
`ROADMAP.md` has called the per-family error *"the one number that settles"*
whether to take a real tokenizer as a dependency. Nobody had measured it, and
until 1.53 nobody honestly could: the harness can only reach an endpoint this
repository already trusts with a credential.

The 1.53 arc made two more of them facts. OpenAI measures through
`https://api.openai.com/v1/chat/completions` and Google through
`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
— both the gateway's own upstreams, both reading a count this repository already
knows how to read. **Google deliberately does not use a counting endpoint.** One
may well exist; nobody here has ever sent a key to it, and an endpoint recalled
rather than committed is exactly what the previous arc spent itself refusing. So
it measures with `:generateContent` at one output token and pays for it, rather
than guessing and saving pennies.

**Neither has been run against the real service.** Nothing in this environment
has a key. What ships is the shape; the numbers arrive when somebody runs it.

**The measuring script is tied to the gateway's allowlist.** It sends a real API
key to every family it measures — the same act the gateway performs, from a file
nobody thinks of as security-sensitive, and in fact the file where DeepSeek's
endpoint sat while the gateway was still refusing DeepSeek as unsupported. Its
origins must now be ones the gateway forwards to, so adding a family requires
the same deliberate edit to `security.test.js` that adding an upstream does. A
measuring script is not a side door.

**And exactly one family may claim the published band**, counted from the
harness source rather than from the fixtures — which do not exist on a clean
checkout, the same absence that once let this suite report "0 failures" for a
directory that was not there.

### Fixed

**"Nothing else has been measured" told a reader on GPT nothing about their own
figures.** The suite emitted one skip naming `deepseek`, because that was the
only other provider the day the sentence was written — so two families arriving
at 1.53 would have gone unmentioned by a message bounded by what happened to
exist when it was typed. Each measurable family now gets its own named skip
carrying its own command, derived from the harness, and drops out of the list
the moment its fixture appears. The twelfth time this project has bounded a
message by its neighbour rather than by its subject.

**A check that could never have fired.** The new "the harness reaches nothing
the gateway does not front" assertion would never have run against anything it
should reject: a brand-new host fails the decision check above it first. The
case it actually exists for is subtler — a host already decided about, and
decided to be something *other* than an upstream, which would satisfy every
other check in the file. It is handed exactly that now. Third occurrence this
session of a filter over today's correct values proving nothing.


## 1.53.0 — "Four of the seven, and why the other three are not here"

No breaking changes. The minor closes the 1.53 arc: the question *"which of my
providers can Trazum gate live, and why not the rest?"* now has a complete
answer that checks itself.

### Added

**Every host this repository names is now decided about, in one place.**
`https://generativelanguage.googleapis.com` sat in `packages/core/src/llm.ts`
carrying a real API key while `docs/gateway.md` listed Google among the
providers the gateway could not front. Neither file was wrong. What was missing
was anywhere holding **both** facts at once, so nobody could see that one
answered the other — and it took a hand-run dump of every `https://` string in
the repository to notice, at 1.52.1, releases after it became true.

That dump is kept now. The host set is derived from source; the decision about
each host is deliberate, the same asymmetry `outbound-surfaces.test.js` proved.
A host that appears in a file and is not in the map fails by name, and the only
way to pass is to say what it is — the review Google's host never got. Untracked
files are scanned too, so a new destination fails at the desk rather than at CI.

**And a provider endpoint the gateway could front sets off an alarm.** The
vocabulary of decisions includes *"model call, not yet fronted"*, which nothing
is permitted to carry: the day a Mistral, xAI or Moonshot host arrives here, the
only honest label for a plain-credential model endpoint fails the build with the
chapter to write. The check is handed a planted map as well as the real one,
because a filter run only over today's correct values proves nothing about
tomorrow's — the same lesson the gateway's anchored-pattern check learned.

**Bedrock and Vertex are recorded as unfrontable, with the reason proven from
this repository's code rather than from anybody's understanding of the vendor.**
Both defaults interpolate a region into the host: `bedrock-runtime.${region}`
and `${location}-aiplatform`. Bedrock's SigV4 signature is given that host, so a
proxy rewriting the origin would forward a signature matching nothing; Vertex's
per-caller origin is exactly the caller-chosen destination the gateway compiles
its upstreams in to prevent. `docs/gateway.md` now says so, because somebody
whose calls go through Bedrock deserves to read why rather than assume it is
coming. The test re-checks both claims against `llm.ts` rather than trusting its
own prose.


## 1.52.1 — "Two more providers, from facts already here"

### Added

**The gateway fronts Google — 1.53's third chapter, and the first where the
model is in the URL.** Four of seven.

**Every fact needed was already committed here, which is why this chapter could
be written and three others still cannot.** `packages/core/src/llm.ts` has sent
a real API key to `https://generativelanguage.googleapis.com` at
`/v1beta/models/{model}:generateContent`, in an `x-goog-api-key` header rather
than the query string, since the Gemini provider landed.
`packages/core/src/usage.ts` has read `usageMetadata` back since the Gemini
importer landed. Host, path, credential header and response shape: four facts
this repository holds, none recalled.

**The one forwarded path becomes a pattern, and that is narrower than it
sounds.** Google puts the model in the URL, so "the one path" cannot be a
literal for it. The pattern is anchored at both ends and its model segment
accepts only `[A-Za-z0-9._-]` — a stricter grammar than a string comparison
against something a caller could have put a `?` or a `..` in. `security.test.js`
now extracts pattern paths as exactly as it extracts literal ones, asserts each
is anchored, and refuses any that accepts arbitrary text. Without that, the
first pattern would have reached a credential-forwarding proxy **without
appearing in the allowlist at all** — the hole opening in the same commit that
made it possible, with the guard still passing.

**And the URL sent upstream is rebuilt, never echoed.** A pattern that matched
is evidence the request was well formed; it is not permission to forward the
string that satisfied it. Eight hostile paths are refused by test — a smuggled
query string, traversal in the model segment, a second path segment, a
different operation, text appended after `:generateContent`, a prefix before
the version — and each asserts the upstream saw **no connection at all**, not
an error relayed back.

**`:streamGenerateContent` is not forwarded, and Google's streamed shape is not
read.** Its buffered shape being established does not establish its streamed
one. `streamingUsageReader('google')` returns nothing for both an OpenAI-shaped
event and a Gemini-shaped one, so the two facts cannot be quietly merged by a
later edit.

**The gateway fronts DeepSeek — 1.53's second chapter.** Three of seven, up from
two.

**The host is not a new fact, and that is the whole reason this chapter could be
written.** `scripts/measure-token-band.mjs` has sent a real API key to
`https://api.deepseek.com/chat/completions` since the band harness learned a
second provider. Reusing an endpoint this repository already trusts with a
credential is the difference between *adding* an upstream and *inventing* one —
and the path genuinely has no `/v1`, which is exactly the detail recall gets
wrong.

The remaining four providers are still unfronted for that reason and no other:
their hosts appear nowhere in this repository, and compiling one in from memory,
into the single place a user's credential is forwarded, is what the doctrine
forbids treating as known.

**`WIRE_SHAPES` puts "which response shape does this provider speak" in one
place.** DeepSeek serves the OpenAI format, so reading `prompt_tokens` out of it
is the same code — but the buffered reader and the streaming reader each had
their own `provider === 'openai'` test, and two parallel lists of provider names
always eventually disagree. Both resolve through the map now.

**A provider absent from that map gets null, not a guess.** `mistral`, `xai`,
`moonshot` and `google` are asserted to read as nothing rather than being
scraped for fields that might mean tokens — and the gateway then reports the
call as *unmeasured*, which is true, instead of recording a number nobody can
defend.

**Adding an upstream means editing an allowlist inside a security test**, and
that friction is the point: `security.test.js` compares the exact origins and
paths, extracted rather than searched for, so a new destination for somebody's
credential cannot arrive without a deliberate edit to a file that exists to
notice.

**Everything derived adapted on its own**, which is what the last two chapters
were for: the gateway's provider list grew, #309's gap guard dropped a case
without being touched, and `trazum connect deepseek` still says the true and
now-different thing — priced, fronted, no connector.

### Fixed

**The buffered path went unmeasured in silence, on the other side of one
`if`.** 1.52 taught the streaming path to say *this call is unmeasured* when no
usage event arrived, and left the buffered branch recording nothing and saying
nothing. Found by a Gemini response with no counts in it: the call was
forwarded, answered, and vanished from the total without a word. It now names
the cause — but only when the provider called the response **ok**, because an
upstream error carries no counts for the honest reason that it produced none,
and announcing those would bury the ones that actually spent money.

**A third unmeasured cause would have inherited the second one's sentence.**
`gateway.unmeasured` was a two-branch ternary whose `else` explained OpenAI's
`stream_options.include_usage` — so the new cause would have told a Gemini user
about a setting that does not exist in their SDK. One branch per cause now, no
`else`. The eleventh time this project has bounded a message by its neighbour
instead of by its subject.

**`docs/gateway.md` said "five of the seven, still" through an entire release
in which it became four.** The table beside that sentence was guarded against
`UPSTREAMS`; the sentence introducing the table was not. The count is gone —
there is no number to get wrong if there is no number — and a guard now fails
any spelled or digit count in that paragraph. `ROADMAP.md` carried the same
stale *two* and lost its number the same way. The eleventh occurrence of a
count written above a derived list, and the third file to lose one.

**A provider Trazum prices but cannot front was refused as though it were a
typo — 1.53's first chapter.** `trazum gateway mistral` and `trazum gateway
bogus` got the same sentence:

```
Error: "mistral" is not a provider this gateway speaks for. Known: anthropic, openai.
```

One of those is a **gap in this tool with a real workaround**; the other is a
misspelling. Telling them apart is the difference between a user reaching for
`trazum profile` and a user checking their keyboard. `trazum connect` did the
same thing.

Seven providers are priced. Two are fronted by the gateway and two have
connectors — that gap is the whole subject of the 1.53 arc, and **the first
honest thing to do about it is stop describing it as the user's mistake.**

Both refusals now answer three cases instead of two, and the priced-but-
unsupported one says what is true: that the gap is real and on the roadmap,
that `trazum profile` prices an exported log from that provider today, and —
the part worth stating — **what you do not get**, which is a refusal before the
money is spent, the whole point of the gateway.

The split is derived from the catalogue rather than a list kept beside it, so a
provider added to pricing starts getting the better answer, and one that gains
an upstream stops needing it, without anyone remembering either.

### Added

**A guard that generates itself from the gap.** It walks every priced provider
without an upstream or a connector and asserts the refusal names the provider as
priced, does not use the typo wording, and points somewhere — *a refusal never
arrives bare*.

Its first assertion is that **the gap exists at all**: if every priced provider
is ever supported, the suite fails and says to delete it rather than quietly
testing nothing.

Proven in both directions, and the second is the one that matters. Reverting to
one answer fails ten of the twelve. **Greeting every unknown name as
priced-but-unsupported** — the tempting over-fix — fails the assertion that a
name Trazum has never heard is still refused as one: that version would tell
somebody who mistyped `nonesuch` that Trazum prices their imaginary provider.


## 1.52.0 — "The gateway in a real path"

### Added

**What a call it could not measure costs — 1.52's fourth chapter, which closes
the arc's work.** #304 recorded nothing for a forwarded call whose usage never
arrived, which is right, and told nobody, which is not. The money is spent
either way: the provider generated what it generated and will bill for it, so a
period's total is short by exactly those calls.

**The second cause is the one that matters, and it is not a failure.** Two
causes reach the new `unmeasured` callback:

- `stream-broke` — the connection died before the event carrying the counts.
  Rare, and a real error.
- `no-usage-event` — the stream ended cleanly and carried no counts. On OpenAI
  that is **every streaming call** without `stream_options: {include_usage:
  true}`, so it is the common case rather than the exception. A gateway that
  stayed silent here would under-report most of somebody's bill and look precise
  doing it.

The gateway names the field to set, not only the symptom, and keeps a running
count that is **never folded into the measured one**. A total that swallowed the
difference would be wrong in the flattering direction, and *not-recorded is not
not-happened* is the rule everywhere else here.

Proven in both directions. Removing the two calls fails both tests by name;
reporting a call as unmeasured **and** recording it fails the assertion that
naming a gap must not also inflate the total it warns about.

**The first draft of the broken-stream test conflated two different failures.**
It destroyed the upstream socket in the same tick as the first write, so the
response never reached the gateway at all and the 502 *upstream unreachable*
path ran instead — a different failure with a different answer, and the test saw
neither cause. Destroying it after the stream has genuinely begun is what makes
it a *broken stream* rather than a *dead upstream*. Found by running the real
thing and reading what actually happened rather than reasoning about it.

**A refusal arrives before the first byte, or not at all — 1.52's third
chapter.** The ordering was already right; nothing asserted it, and nothing said
it.

**On a refusal the provider is not contacted at all.** The status code is the
weaker half of that: the property worth having is that **the caller's prompt
never leaves the machine**. A gateway that forwarded first and refused afterwards
would have spent the money it was refusing and sent the text somewhere while
claiming to stand in front of it.

**Once bytes are flowing, the call is committed.** The status line is long gone,
so a 402 could not be *sent* as a refusal even if the budget ran out mid-answer
— it would arrive as garbage inside somebody's response. So it does not arrive:
a stream that started, finishes.

`docs/gateway.md` now states the limit that follows rather than leaving it to be
discovered: **a call that begins inside the budget can end outside it**, by
exactly the cost of one answer. Cutting a reply off partway to save the
difference would corrupt what the caller is reading to protect a figure already
spent, and this gateway will not do that.

Two tests, each proven against the failure it forbids:

- Refusing a call and asserting the upstream saw **no connection at all**.
  Inverting the order — forward, then judge — fails it by name: *"the gateway
  called the upstream on a call it refused"*.
- Exhausting the budget **while a stream is in flight**, after the first event
  has reached the caller, and asserting the answer still arrives whole at 200.
  Planting a per-chunk budget check fails it: the stream terminates mid-answer,
  which is exactly the production failure it describes.

The first draft asserted a refusal type of `trazum_budget_exceeded`, which does
not exist — the real one is `trazum_budget_refusal`. Caught on the first run,
and worth noting because the wrong name sat in front of the assertions that
mattered and would have masked them.


## 1.51.2 — "The stream, and fourteen things nothing was checking"

### Added

**The gateway relays a streamed answer as it arrives — 1.52's first chapter.**
Until now `gateway-server.ts` read `await upstreamResponse.text()` for *every*
response. For `"stream": true` — nearly all production traffic, and every agent
loop — the caller waited for the entire answer and then received it at once, so
**time to first token became the total generation time**.

The page had the argument against itself already: reading a budget file per
request would *"put Trazum's own latency between you and your provider on every
call — a cost this tool would otherwise be reporting on somebody else."*
Buffering a stream was a far larger version of that, in the same file.

**The provider decides, not the request.** A body asking to stream can still
come back whole, so the branch turns on the `content-type` that actually
arrived rather than on what was asked for.

**`streamingUsageReader`** reads the counts off the events on their way past and
holds three numbers and a partial line — never the text. That is the same
promise the buffered path makes, kept structurally rather than by intention.

- **Anthropic** puts input and cache counts on `message_start` and a *running*
  output total on each `message_delta`. The last one wins. Summing them would
  report a bill several times the real one, in the direction that makes this
  tool look like it found money it did not.
- **OpenAI** sends usage only when the caller passed `stream_options:
  {include_usage: true}`. Without it the stream carries no counts and the
  gateway records **nothing — not zero**. A call whose usage never arrived is
  not a free call, and zero is the flattering direction.
- **A line that never ends is refused** past 1 MB rather than buffered. A proxy
  that promised to hold no text must not be turned into one holding a gigabyte
  by an upstream that omits a newline; losing those counts surfaces as "usage
  not recorded", which is the honest failure.
- **A stream that breaks partway** destroys the socket — the head is already
  sent, so there is no status left to change — and notes the call as unmeasured.
  The money was spent and its counts rode an event that never arrived; recording
  the partial counts would be a measurement of the part that arrived, read as
  the cost of the whole.

**The end-to-end test cannot pass against a buffering proxy — it hangs.** The
stub upstream emits `message_start` and then holds; the test asserts the first
event reached the caller *before* releasing the rest. Restoring the old relay
does not fail the assertion, it deadlocks: the proxy waits for a body that will
not end until the test that is waiting for the proxy lets it. Proven by doing
exactly that, under a timeout.

The type is `GatewayUsage`, not `MeasuredUsage` — `measured-profile.ts` already
uses that name for a label's coverage across a log, and two types with one name
is a rename waiting to be got wrong.

**A plan through 1.60.0** — [docs/plan-1.52-1.60.md](docs/plan-1.52-1.60.md),
nine arcs, written before the code as the four before it were. Under the
numbering adopted at 1.50.1 a minor closes an arc, so 1.52.0 … 1.60.0 land one
thesis each.

**The plan says which of its arcs are measured and which are intentions**, and
that is the part worth arguing about. The first three answer things that are
wrong or missing today and cite the line of code:

- **1.52.0 — the gateway in a real path.** `gateway-server.ts` relays with
  `await upstreamResponse.text()`, buffering the whole upstream reply before
  writing a byte back. For `"stream": true` — nearly all production traffic —
  time to first token becomes the total generation time. The page argues that
  reading a budget file per request would put Trazum's latency between you and
  your provider; buffering a stream is a much larger version of that, in the
  same file.
- **1.53.0 — every provider you pay for.** Seven priced, **two** connected, and
  the gateway fronts **two**. Five providers can be priced from a hand-exported
  log and cannot have their bill read automatically or their calls gated live.
- **1.54.0 — the counter, per family.** The estimator is calibrated on Claude
  over 21 samples and prices seven families. `ROADMAP.md` has called the
  per-family error the one number that settles the real-tokenizer question, and
  nobody has measured it.

The remaining six — 1.55.0 through 1.60.0 — are **an ordering of intentions, not
commitments about content**, and each says so in its own section. Presenting all
nine with equal confidence would be merging a measurement with a projection on
the roadmap of a tool whose first doctrine rule forbids exactly that.

**The order changed while writing it.** The token band went first in the draft,
because it is the question the roadmap has carried longest. It is third now: a
shipped feature most callers cannot use outranks an open question somebody wrote
down. That reordering is in the document rather than silently applied.

**What would reorder it is written down** instead of left to be inferred — a
user with a provider Trazum prices and cannot gate, a measured band that comes
back far out, or somebody volunteering as a language maintainer.

`ROADMAP.md`'s `## Next` now carries the plan, and names the three *Under
consideration* entries this schedules: the tokenizer question (1.54.0), cost
alerting (1.56.0) and the editor extension (1.58.0). It said "Nothing is
planned" since #288, which was true when it was written and is not now.

### Fixed

**`SUPPORT.md`'s "No telemetry" section claimed to enumerate every network call
and listed three of seven.** It said *"The only network calls any of them make
are the ones you asked for: `connect` reaching a provider's usage API,
`--pricing-live` fetching a price feed, `eval`/`route`/`prune`/`--suggest`
making the model calls they warn you about first."*

Missing:

- **`trazum gateway`**, which forwards your entire prompt and your credential to
  the provider, and has done since 1.50.3.
- **`--exact-tokens`**, which calls Anthropic's `count_tokens` endpoint.
- **`trazum watch --webhook`**, which POSTs an alert to a URL you gave it.
- Vertex AI's token exchange, when Vertex is the configured endpoint.

Every one of those is a call somebody asked for, and that is not the point. The
sentence claimed to enumerate them, **on the page a reader opens to check
whether this tool phones home**, and an enumeration missing its largest member
is wrong however defensible each omission is on its own.

The section is now a table: what reaches out, where it goes, and what asks for
it — with the gateway called out for a second reading, because forwarding a
prompt and a credential is what standing in the path means, and a reader
deserves that said plainly rather than found out.

**`docs/plan-format.md` was checked and is entirely correct** — the eight
top-level fields, the eight action fields, the five `kind` values and the five
refusal reasons all match `plan.ts` and a plan emitted for the purpose. Reported
because a page that survives the check is worth recording too.

### Added

**`outbound-surfaces.test.js`: every module that can reach the network is named
in `SUPPORT.md`.** The file set is derived; the map from file to prose is
deliberate. That asymmetry is the design — a new module that can call out fails
by name, and the only way to make it pass is to decide what the page should say
about it, which is the review a new outbound surface deserves. A fourth
assertion refuses any count in front of the list.

**The guard's first draft missed the gateway, which is the surface it was
written to find.** `gateway-server.ts` assigns `const doFetch = context.fetchImpl
?? fetch` and calls `doFetch(...)`; matching only `fetch(` and `fetchImpl(`
skipped it. Aliases assigned from `fetch` are resolved now.

**Its second draft missed a planted module entirely**, because it derived the
file list from `git ls-files` and the probe was written but not yet staged. CI
would have caught it after the commit — which is precisely the reassurance that
lets a guard be useless where it is actually used, at the desk, before the
commit. It reads untracked-but-not-ignored files too.

**And the fix's own first draft wrote "six" above a table of seven rows** — the
same failure corrected in three other files this session, committed again by the
person who had just corrected them. There is no number there now.

**The CI page's first example has never worked.** `docs/ci.md` opened its GitHub
Actions section with:

```yaml
with:
  path: prompts/
  max-tokens: '900'
```

**There is no `path` input and there never has been.** `git log -S"  path:"` on
`action.yml` finds it in no revision; the input has been `target` since 0.11.0,
with `file` as a deprecated alias. The page shipped at 1.48.0 and has said
`path` since the release that introduced it — so the first example on the page a
reader lands on to set up CI was wrong from the day it was written, across
**sixteen releases**.

**What kept it from being worse is the Action's own refusal.** With no `target`
and no `usage-log` it stops with *"Set the 'target' input to the prompt file or
directory to check, or 'usage-log' to gate the spend."* A reader copying the
example got a red build naming the right input — not a green build gating
nothing. That distinction is the whole difference between a wasted afternoon and
a budget everybody believed in, and it is the argument for writing a refusal
even where nobody expects to need one.

The example now uses `target`, and the paragraph under it says what `file` is,
that no `path` input exists, and what the Action does when given neither.

**The rest of the page was checked and is correct.** Every flag in its GitLab,
Jenkins, CircleCI and pre-commit examples was matched against `COMMAND_FLAGS`
for the command it follows: no unknown flag anywhere.

### Added

**`action/test/documented-inputs.test.mjs`, deriving the input list from
`action.yml`.** Every `with:` key in a Trazum Action example, in any tracked
markdown file, must be an input the Action declares.

Run across the corpus rather than the one broken page, because `README.md`
carries three of these examples and **all three were right the whole time** — a
guard that only ever saw the file it was written for would not have shown that.
Proven in both places: restoring `path:` fails naming `docs/ci.md`, and a
planted `targets:` typo in the README fails naming the README.

**The agent-facing skill listed nine config keys. The schema knows seventeen.**
`.claude/skills/trazum/SKILL.md` is what an agent reads before answering a
question about this tool, so a gap in it is not a documentation gap — it is a
wrong answer given to somebody who asked.

The eight it never named: `labels`, `spend`, `sources`, `store`, `waive`,
`outcomes`, `ladders`, `owners`. That is the entire budget surface, the fleet,
the waiver record, and **the vocabulary the whole 1.51 arc rests on**. An agent
asked *"can Trazum tell me whether the cheaper model made things worse?"* would
have consulted this list, not found `outcomes`, and said no — about the one
capability that release existed to add.

The section is now a table: every key, what it settles, and the sub-keys of the
three whose *shape* an agent has to produce rather than merely mention. It ends
by saying which key to suggest first when somebody asks whether a change made
things worse.

**The rest of the file was checked and is correct** — "three provider calls per
case" matches `evaluate.ts`, the ±10% band matches `ESTIMATE_ERROR_BAND_PCT`,
and the 1.25x/2x cache write premiums match `COST_MULTIPLIERS`. Its command
coverage is deliberately narrower than the CLI's, so an absent command is scope
rather than drift, and is not asserted.

### Added

**`skill-doc.test.js`, deriving the key list from `CONFIG_KEYS`.** Four
assertions: every top-level key is named; the sub-keys of `spend`, `outcomes`
and `ladders` are named, because those are the three an agent must fill in
rather than mention; and the cache multipliers and the error band are quoted as
the code holds them, since the skill tells an agent to report a cache loss
"plainly rather than softening it" and quotes the premium as its evidence.

The sub-key lists stay internal to the schema. Exporting them so a test could
import them would widen the public surface to suit the test; an in-package test
may reach into its own package instead.

**Two things went wrong writing it, and both are the same habit paying off.**
The guard failed the replacement table on `spend.monthlyUsd` — I had omitted it
while writing out a list whose whole point was completeness. And the multiplier
assertion demanded `**2x**` in bold, because that is how `packages/cli/README.md`
writes it, and so failed a sentence in this file that says `2x` plainly and is
entirely correct. The number is the claim; the bold is a house style that
differs per file.

Proven by restoring the original nine-key line — *"the schema accepts these and
SKILL.md does not name them: labels, spend, sources, store, waive, outcomes,
ladders, owners"* — and by planting a stale multiplier.

**A mislabelled index sent readers looking for an API key to a page about
signing in with GitHub.** `docs/README.md` described `docs/accounts.md` as
*"Provider accounts — Connecting a provider so usage arrives on its own"*. That
file is about the **web app's** accounts: GitHub OAuth, the prompt library,
share links, what the database holds. It contains no provider key, no admin API
and no mention of `trazum connect`.

`docs/usage-logs.md` then ended its connector paragraph with *"See
`accounts.md` for the key"* — written trusting the index. **A
mislabelled index does not stay one mistake**; it propagates into every document
that consults it, and it did so within two changes. Both were mine: the index
row at 1.51.1, the cross-reference in #296.

The index row now says what the file is. `usage-logs.md` names the variable
outright — `TRAZUM_ANTHROPIC_ADMIN_KEY`, or `ANTHROPIC_ADMIN_KEY` — and links to
the README's `trazum connect` walkthrough, because a reader who wants a key
should be given the key rather than another hop.

**The OpenAI connector's credential was documented nowhere at all.** Found by
the guard below, not by reading. `trazum connect openai` has existed since 1.41,
the command's own refusal says *"Available: anthropic, openai"*, and the README
section explains how the two providers' reports differ — while showing only
Anthropic's `export` line. `TRAZUM_OPENAI_ADMIN_KEY` and `OPENAI_ADMIN_KEY`
appeared in **no markdown file in the repository**, so setting up the OpenAI
connector required reading `connector.ts`. The section now gives both
invocations, both variables, and what each key must be able to do — read a usage
report, never spend.

### Added

**`credential-pointers.test.js`, deriving both checks from `CONNECTORS`.**

There is no mechanical way to assert that a one-line index summary describes a
file honestly. There is a mechanical way to assert the consequence that hurt: **a
sentence promising a credential must point at a file that names one.** Links are
matched only where the prose actually promises a key, so a page naming
`ANTHROPIC_API_KEY` inline — which needs no pointer — is not dragged in.

The second assertion runs the other way: every connector's credential must be
named in the documentation at all. That is the one that found OpenAI.

Proven both ways. Restoring *"See `accounts.md` for the key"* gives
*"accounts.md → accounts.md, which names no connector credential"*; removing the
OpenAI export line again gives *"these connectors exist and their credential is
documented nowhere: openai"*.

**The gateway fronts two providers. Its page named one.** `docs/gateway.md`
opened with `trazum gateway anthropic` and never mentioned `openai` — which the
gateway has spoken for since 1.50.3, added in the same commit that wrote the
page. The command's own refusal says *"Name the provider to stand in front of.
Known: anthropic, openai."* The product named both; the documentation named one.
A reader on OpenAI could read the page end to end and conclude the gateway was
Anthropic-only.

The page now carries the compiled-in table — provider, upstream origin, and the
single path each forwards — which is also the first time either forwarded path
appeared in the documentation at all.

**"It forwards exactly one path" was counting the wrong subject.** That sentence
is the security argument — *"a gateway that forwarded any path would be a
general proxy for your API key"* — and the property holds: one path **per
provider**, two in total. The claim is now stated per provider and points at the
table.

### Added

**`gateway-doc.test.js`, asserting the page against `UPSTREAMS`.** Three checks,
every subject derived from the compiled-in table: each provider is named, each
origin and forwarded path appears verbatim, and the "exactly one path" sentence
must say *per provider* while more than one provider exists.

The path assertion is the one that matters. The page's security claim is about
*which* path is forwarded, so asserting the property abstractly would let the
page keep the argument and lose the specifics.

**Its first draft would have fired on a correct page.** Requiring each provider
as inline code failed `anthropic` as well, which the original page named
perfectly well inside its opening `bash` block — naming a provider in an example
command is naming it. Caught by running the check against the original text, not
just the new one. Matching is now word-boundary, and the probe isolates exactly
the real gap: *"the gateway fronts these and docs/gateway.md does not name them:
openai"*.

**The product tells you to record an `outcome`. The page it sends you to never
mentioned the field.** `docs/usage-logs.md` exists to answer one question —
*what do I put in the log, and what does each field buy me?* — and it named
**nine of the fourteen keys** `parseUsageLine` accepts.

`outcome` and `trazum_outcome` appeared **nowhere in the file**, five releases
after 1.50.4 introduced them. The profile report says, in the product, that this
is *"the one field that changes what every other figure here means: without it
this tool can say a workload got 40% cheaper and cannot say whether it stopped
working."* A reader could follow that advice to this page, record every field it
named, and get the same warning again.

**Five aliases were also missing** — `ts`, `created_at`, `created`,
`conversation_id` and `finish_reason`. Omitting an alias breaks no log; it makes
somebody rewrite one that already worked, or conclude that truncation detection
is Anthropic-only because their OpenAI records say `finish_reason`. The page now
carries a table of every accepted spelling, in the order the parser tries them,
and says why `trazum_outcome` exists: so a field-name collision is not a reason
to go unmeasured.

### Added

**`usage-logs-doc.test.js` — the page that says what Trazum reads, against what
it reads.** Keys are harvested from `parseUsageLine` and **bounded to it**: the
normalised `UsageRecord` reuses several of the same names further down the
module, so a harvest over the whole file would assert the output shape while
claiming to assert the input one.

A second assertion checks the `outcome` row still says *what recording it buys*,
not merely that the word appears. The row exists to answer "why would I record
this?", and its answer is the only one in the table that is not about cost.

**Its first draft passed while the alias was undocumented.** Matching each key
as a bare substring, `ts` was found in the ```ts language tag on a code fence —
so an accepted-and-undocumented key read as documented. Caught by running the
check against the real page before trusting it, which is the habit the tenth
occurrence of *bound an assertion by its subject* bought. Keys are now matched
as the page actually writes a field: inline code, or a JSON key in an example.

Proven three ways: removing the alias table names all six it hides, removing the
`outcome` row fails by name, and gutting the row's explanation while leaving the
word fails the second assertion.

**`docs/releasing.md` said "both manifests" and "both publish steps". There are
three.** The release document was written when `@trazum/core` and `@trazum/cli`
were the only publishable packages, and `@trazum/mcp` never reached the prose:

- *"the tests before **either** upload"*
- *"so **both manifests** carry `publishConfig.access: \"public\"`"*
- *"and **both publish steps** pass `--access public`"*

The bash block six lines above it already lists three publishes, so the page
contradicted itself, and **no test opened `docs/releasing.md` at all.**

The sentence immediately after is the one that stings. It explains that
`publish.test.js` *"derives the set of publishable workspaces from the root
`workspaces` globs — so a workspace added later has to make the choice rather
than inherit one"*. The mechanism was built for exactly this growth. The prose
describing the mechanism was not.

### Added

**A guard, counting from the same derivation the paragraph describes.**
`PACKAGES` — the workspaces globs minus anything `private` — is the count, so
adding a fourth publishable package fails the sentence rather than quietly
outgrowing it.

**Its first draft was wrong, and its own probe caught it.** Matching every
quantity word beside "manifest", "publish step" or "upload" across the whole
file failed **two true sentences**: *"all five manifests — root, `packages/core`,
`packages/cli`, `packages/mcp`, `apps/web`"*, which counts the version manifests
a release bumps and enumerates itself, and *"a failure that happens between two
uploads"*, where "two" means consecutive rather than total.

That is this repository's most-broken rule — *bound an assertion by its subject,
never by its neighbour* — arriving for a **tenth** time, in a guard written
three changes after the doctrine entry was rewritten to warn about it. It was
caught before merge only because the guard was run against the real file rather
than against the defect alone. The assertion is now bounded to the sentences
making the publish-access claim, which is its actual subject.

Proven both ways: restoring *"both manifests"*, *"both publish steps"* and
*"either upload"* each fails naming the phrase and the real count, and the two
true sentences pass untouched. A guard that cries wolf gets deleted, so the
second half is not optional.

**`npm test` said "core + cli test suites". It runs five.** `CONTRIBUTING.md`
printed four commands with a comment beside each explaining what it covers. Two
were written before `@trazum/mcp` existed and never revisited:

- `npm run build      # core + cli` — it builds **three** workspaces.
- `npm test           # core + cli test suites` — it runs **five**: core, the
  CLI, MCP, the web app and the Action.

**The same omission had reached CI's step names**, from the same cause: *Build
library and CLI* and *Tests (core, CLI, web, Action)*. So the MCP package's
tests ran on every pull request under a label that did not mention them, and a
contributor whose check failed there had to read the workflow to find out what
had actually run.

**Nothing was broken by this** — every suite ran, and `verify` remains a
superset of what CI does. What was wrong is the thing a stranger reads to decide
whether their change is covered. Someone adding an MCP tool could reasonably have
concluded `npm test` did not reach it, and either skipped it or duplicated it.

Correcting the CI label turned up a smaller one: the build step called
`@trazum/core` *"library"*. It is not wrong English — core is the library — but
a step name is what a contributor scans when a check goes red, and the package
it names should be the package they can grep for. It now says core.

### Added

**`contributing.test.js` — what the documentation says each command runs,
against what it runs.** Coverage is computed from `package.json` by walking each
script's `-w @trazum/…` flags **and any script it calls**, so `verify` resolves
through `build`, `test` and `typecheck` without a list kept anywhere. Four
assertions: the comment beside `npm run build`, `npm test` and `npm run
typecheck`, plus the CI step names read out of `ci.yml`.

**Membership, not wording.** The sentence may be phrased however reads best —
`# all four workspaces` is accepted for `typecheck` because it is a true
statement about every one of them — as long as each workspace the script really
drives is named. A count would have gone stale exactly as the prose did.

Proven by restoring all four original texts. `npm run build` reports *"runs
these and its comment does not name them: @trazum/mcp"*; `npm test` reports
*"@trazum/mcp, @trazum/web, action"* — three of its five suites hidden by one
comment; the CI names report *"Build library and CLI" omits @trazum/core* and
*omits @trazum/mcp*, and *"Tests (core, CLI, web, Action)" omits @trazum/mcp*.

**The README told you Anthropic's cache floor was 512. It spans 512 to 4,096,
and the error ran in the direction that promises money.** The provider-facts
table under *Every model you pay for by the token* said *"Cache minimum | 512 on
Anthropic, 1,024 on OpenAI and Moonshot, 2,048 on Gemini Pro"*. `cacheMinTokens`
is a property of the **model**, not the provider: 512 on Fable 5, Mythos 5 and
Opus 5; 1,024 on Opus 4.8, Sonnet 5 and Sonnet 4.6; 2,048 on Opus 4.7; **4,096
on Opus 4.6 and Haiku 4.5**.

A reader on Haiku 4.5 who trusted the table would have built a prefix eight
times too short and expected a cache saving that could never arrive. This
project's own rule is that a floor proves over, never under, and its front page
was breaking it about the floor itself.

**The code was never wrong.** `trazum models` prints the real figure per model
and every cache advisory has always read `cacheMinTokens` — the 1.14 work on
`below-cache-minimum` exists precisely because the floor is per model. Only the
prose summarising it by provider was wrong, which is the failure mode of any
table that flattens a per-item fact into a per-group one.

**Two more rows had gone stale by omission.** DeepSeek was missing from the
cache-read row and xAI from the row saying how caching starts. Nothing false was
written about either; they were added to the catalogue and not to the prose,
which is how a table stops being a description and becomes a snapshot.

### Added

**`pricing-prose.test.js` — the money table, checked against the catalogue it
describes.** Six rows of hard numbers about what caching and batching cost, hand
written, read by nothing until now. Five assertions, all deriving their subjects
from `BUNDLED_CATALOGUE` rather than from a list typed beside them:

- every priced provider appears in the table at all;
- every provider with a cache is named in the cache-read row;
- every provider with a cache is named on one side of the automatic/explicit
  split;
- **no single cache minimum is attributed to a provider that has several** —
  the defect itself, stated as a property;
- every distinct cache minimum in the catalogue is named somewhere in the row.

Membership is asserted rather than counted, for the reason this repository has
now learned nine times.

Proven by planting each defect back. The original row fails **two** of them
independently — *"Anthropic has 4 different cache minimums (512, 1024, 2048,
4096) and the row states one figure for it"* and *"these cache minimums are in
the catalogue and named nowhere in the row: 4096"*. Dropping DeepSeek gives
*"DeepSeek reads cache at 10% and the cache-read row does not name it"*;
dropping xAI gives the matching failure on the other row.

**A comment saying "the six below" above a list of five — in the change whose
whole argument was that a gap should be named rather than counted.** The
`--json` interchange suite explained which commands it could not drive and
closed with *"The six below are the ones a usage log alone can drive, and they
are named rather than counted so the gap is visible."* There were five, and
`history` appeared in neither half: not in the covered list, not among the
named exceptions. The one command the sentence could not account for was the
one it made invisible.

`history --json` is in fact fine — `history.test.js` drives it on three dated
reports and parses its stdout whole — so this was a hole in the *account*, not
in the coverage. That is worth saying precisely rather than inflating: nothing
shipped broken. The exception now names where it is proven and why, because "it
is tested elsewhere" is the sentence that stops being true without anybody
noticing, and the count is gone.

### Added

**"Every command that accepts `--json` is covered here or named as an
exception".** The partition is asserted from `COMMAND_FLAGS` rather than kept by
hand: every command whose flags include `json` must appear in the driven list,
in the covered-elsewhere map with a reason, or in the needs-more-than-a-log
list. Twelve commands, three buckets, no remainder.

Proven in both directions. A new `--json` command classified nowhere fails with
*"these commands emit --json and appear in neither the covered list nor a named
exception, which is how `history` went missing from both"*. An exception left
behind after its command stops accepting `--json` fails the other way, so an
excuse cannot outlive the thing it excused.

**The doctrine prescribed the fix that kept causing the failure.** *Bound an
assertion by its subject, never by its neighbour* is the rule this repository
has broken more than any other, and its own entry in `docs/doctrine.md` ended
with: *"The fix is the same in every case: **name the end as well as the
start**."*

That is exactly what every repair had done, and naming the new neighbour only
moves the trap one section further along. The canonical document was telling
every future reader to re-arm it. It now draws the distinction that took nine
occurrences to state: **"until the next heading, whatever it is" is the
subject's own extent; "until the heading called X" is a neighbour.** The first
survives an insertion; the second is a trap with a delay on it.

The entry's history was also wrong. It said "four contract harvests"; there were
**eight**, plus a ninth that claimed a bound it did not have. Corrected, along
with the count — six to nine — and the README's advisory count added as the
occurrence the rule gained after it was written.

**`docs/our-own-medicine.md` had stopped being current**, which for the document
whose entire subject is this project's own record is the failure it exists to
catch. It was missing #288, #289 and #290, and its claim that *"the two long
ones are the interesting ones"* was overtaken: the front page contradicted
itself about the advisory count for **fifty-two releases**, longer than either.
It also carried the same wrong tally as the doctrine. Both are now the same
numbers, because they are the same facts.

**A guard against undocumented commands accepted any backticked word.** "Every
command is mentioned in the README" filtered on `trazum <id>` **or** `` `<id> ``
— a backtick followed by the name, anywhere in the file. The README has
eighty-nine backticked lowercase words that are not commands, several of them
plausible names for one: `batch`, `cache`, `label`, `locale`, `drift`. Planting
a command called `cache`, documented nowhere, **passed**. All thirty-two
commands satisfy the strict form already, so the loose clause was covering
nothing and hiding the next command added.

**`trazum report --year --json` emitted a stream no machine could read.** It
printed the human report and *then* appended the document, and its help said
"Also emit". Every other `--json` in this CLI is the document **instead of** the
report. So the one command emitting the `annual-record` contract was the one
command whose output `| jq` and `| trazum conform -` both choke on.

**The test covering it did `stdout.indexOf('{')` and parsed from there** — a
step no consumer can take. The assertion passed, the defect was invisible, and
the guard standing next to the bug was working around it. `--json` now returns
before any prose, the help in both locales says "The record as data", and the
test parses the whole of stdout.

**`--contract` refused two contracts that exist.** The CLI kept a hand-written
copy of the contract names for `--contract`, and it stopped at `cost-answer`:
`outcome-report` (1.50.4) and `annual-record` (1.51.0) had field rules, had
cross-rules, and were answered with *"is not a contract"* — the list telling the
caller they had made a typo when the list was the thing that was wrong. The
names are now a single `CONTRACT_NAMES` export in `@trazum/core`, with the union
derived from it. One home per fact.

**`@trazum/core` produced an `outcome-report` its own contract rejects.**
`conform` requires `schemaVersion` of every document — the one field checked
outside the per-contract rules, because a consumer branches on it and its
absence cannot be told from a pre-contract document. `outcomeReport()` never
emitted one, from 1.50.4. A format whose reference producer fails it is worse
than no format: anybody mirroring this output, which is exactly what
`docs/format.md` invites, would have inherited the defect and looked
interoperable.

**`docs/format.md` was wrong about the format in three ways at once**, on the
page whose entire job is telling another tool what it can build against:

- It opened with *"Trazum emits seven documents. All seven are contracts"* while
  its own table listed **ten** rows, three lines below the sentence.
- It named neither `outcome-report` nor `annual-record`, so the two newest
  contracts were undiscoverable from the page that exists to list them.
- It flattened two distinctions worth keeping. Three of the documents it lists
  have no `--contract` name, and one — the outcome report — is **defined but
  never emitted**: `trazum profile` renders it as terminal text and no command
  writes it as JSON. It is a contract so that *your* tool can produce one and
  have it checked, which is a different promise from "Trazum will hand you one".

The page now says eleven emitted plus one defined-not-emitted, carries a
`--contract` column saying which nine are nameable, and documents the two
missing contracts in `docs/json-output.md`.

**Eight contract harvests were bounded by naming their neighbour.** Every parity
test that reads its promised fields out of `docs/json-output.md` did:

```js
const start = doc.indexOf('## The first-run document');
const end = doc.indexOf('## The gateway refusal document');
```

Correct exactly until a section is inserted between the two — which documenting
the outcome report and the annual record did. Four suites failed at once,
demanding `slices`, `year` and `missingMonths` of documents that have nothing to
do with them. **This is the ninth occurrence of bounding an assertion by its
neighbour**, and the first that was systemic rather than a single test: the
comment above one of them already said it was "the sixth time in this file's
life", and the fix each previous time was to name the next neighbour again.

A ninth harvest was worse. `gateway-proxy.test.js` carried the comment *"Bounded
to its own section, like every other harvest in this repository"* above
`doc.slice(start)` — running to the end of the file, bounded by nothing. It
passed only because that section happens to be last. A comment asserting a
property the code does not have is worse than no comment: it is what a reviewer
reads instead of the code.

All nine now use one `sectionOf(document, heading)` helper that ends at **the
next heading, whatever it is**. A section that moves, is renamed or gains a
neighbour keeps working; a section that is deleted fails loudly naming itself,
which is the correct outcome and is proven by deleting one.

**"a outcome-report".** Every contract name that existed before 1.50.4 began
with a consonant, so `conform`'s heading hard-coded `a`. Making the two new ones
reachable exposed it. The first fix was also wrong — a letter-only vowel test
turned the correct *"a usage-log"* into *"an usage-log"*, because `usage` opens
on /juː/. The rule is now bounded to the closed set of contract names, and a
test refuses to let a new name through whose initial English decides by sound.

**The README disagreed with itself about the number of advisories, for
fifty-two releases.** The hero says *"fourteen findings"*. Three lines below it,
the paragraph that carries the actual argument said **"Thirteen advisories"** —
the same claim, a different noun, and wrong. `AdvisoryId` has fourteen members.

**A guard was standing right next to it and could not see it.** "The counts the
README claims are the counts the code has" reads the `AdvisoryId` union out of
source rather than hardcoding a number, and asserts the README says
`"<word> findings"`. It does. When the fourteenth advisory landed at 1.9.1 the
guard forced the hero sentence and said nothing about the sentence under it,
because it was bounded to the word *findings* rather than to its subject — **the
number of advisories**. Every release since shipped a front page contradicting
itself on the load-bearing number of the pitch.

That is the **eighth** time in this repository an assertion has been bounded by
a neighbour instead of by its subject, and the first time the cost was on the
front page rather than in a test fixture.

### Added

**`packages/cli/test/interchange.test.js`** — the format held to what it says
about itself, in five guards, each proven by planting the violation:

- **`--json` parses as one JSON document**, for the five commands a usage log
  alone can drive. The ones needing a prior document, a credential, a running
  loop or a paid call are **named rather than counted**, so the gap is visible.
- **The annual record survives a pipe into `conform`**, which is the whole
  claim the format page makes.
- **The reference producer conforms**: an outcome report from `@trazum/core`
  passes the check this repository publishes. The other parity tests check the
  document against the doc; this one checks what is actually produced.
- **Every `CONTRACT_NAMES` member is named by `docs/format.md`**, and the count
  it claims matches the rows of its own table minus the one it says is not
  emitted — counting the rows is the only version of that check a stale sentence
  cannot satisfy on its own.
- **No `--contract` name is offered that the CLI would refuse.**

**`test-utils/section.mjs`** — the shared bound described above, with the whole
history of why in it.

**A ratchet on the class: "no test bounds a section of prose by naming the
section after it".** Nine occurrences were repaired one at a time; this is what
closes the class. It walks every suite and fails on `indexOf('## …')`, because
the pattern is easy to re-introduce and reads perfectly well in review. Proven
by putting the old two-`indexOf` bound back into `init.test.js` and watching it
fail naming the file.

### Changed

**The guard now checks both nouns, and refuses any stale count beside a correct
one.** Two halves, because requiring the right phrase is only half the job:

- The README must say `"<word> findings"` **and** `"<word> advisories"`, both
  matching the union, matched case-insensitively — the second begins a sentence
  and a lowercase-only pattern would have been the same bug again.
- **No number word may precede either noun unless it is the real count.** An
  inclusion check passes on a document that states a figure twice and disagrees
  with itself; this half fails it.

**Proven against the live defect rather than a probe.** Widening the guard made
it fail on the README as it stood — `the README should say "fourteen advisories"
(the code has 14)` — which is the strongest form of proof available: the
violation was already in the repository. Both halves were then re-planted
afterwards and each failed naming the wrong figure. The README now says
fourteen in both places.

`CHANGELOG.md` still says "thirteen advisories" under 1.9.0 and that is left
alone. It was true of 1.9.0, and rewriting history to satisfy a guard is the
failure this file exists to prevent — the same split `RELEASES.md` already draws
between its standing header and its record.

**`ROADMAP.md`'s forward-looking section was narrating a past.** `## Next` opened
with *"the arc in progress is `docs/plan-1.51.md`"* — after every chapter of that
arc had shipped and the arc had landed at 1.51.0. It is exactly the failure
1.51.1 fixed in the three plan documents, one section further down in a file
those fixes touched, and it went unnoticed while they were being made. A reader
deciding whether to depend on this would have read work that is finished as work
that is coming.

`## Next` now says **nothing is planned**, because nothing is: four arcs have
been planned in advance and all four are delivered, and there is no fifth. The
delivered arcs are stated as delivered, with 1.51.0's ten chapters named.

### Added

**A guard on the roadmap: "the section called Next points forward, or says it
does not".**
The invariant is deliberately not *"`Next` must be full"* — a project with
nothing planned is a real state, and a roadmap that manufactures a queue to look
busy is worse than an empty one. It is that the section either **names a version
newer than anything released**, or **says plainly that nothing is planned**.
Doing neither leaves only one reading: delivered work described as forthcoming.

Proven in both directions. Restoring the old *"the arc in progress"* opening
fails the test by name, quoting the newest released version. Replacing it with a
genuine forward plan naming a higher version passes **without** the escape
phrase, which is the half that matters — a guard satisfiable only by a magic
sentence would be answered by pasting the sentence.

The version comparison is numeric rather than lexical, because `'1.9.0'` sorts
above `'1.51.0'` as a string and that is precisely the version pair this
repository has.

## 1.51.1 — "A front door"

**Nothing installable changed.** The three tarballs differ from 1.51.0 in their
version number and nothing else: no source file moved, no output changed, and
`npm install` gives you exactly what it gave you yesterday. This release exists
because the reorganisation below needs a number — `RELEASES.md` and `ROADMAP.md`
are indexed by version, and work that stays under `Unreleased` is work neither
of the two documents a reader consults will ever mention. Said here rather than
left for somebody to discover by diffing.

### Added

**A documentation index: `docs/README.md`.** Fifteen documents under `docs/` and
eight at the root, and no front door to any of them. Each was reachable — from a
link inside another document the reader had to already be reading — which is not
the same as findable. The only path through the documentation was the one
somebody happened to be standing on.

The index is arranged by **what the reader came here to do**, not by what the
files are called: deciding whether to use this, using it, extending it,
maintaining it, or reporting a problem. A person choosing the tool and a person
releasing it want different documents, and a list sorted alphabetically serves
neither. It closes with the four planned arcs presented as what they now are —
delivered history, with the thesis and the version each one landed at.

**`CODE_OF_CONDUCT.md`.** Missing, and named in no file. It is written in this
project's own voice rather than adopted wholesale, and it is explicit about the
part most codes of conduct leave vague: enforcement here is one person, who is
also the person most complaints would be about, and the document says so and
says what to do about it instead of implying a committee exists.

**`.github/PULL_REQUEST_TEMPLATE.md`.** The issue templates have existed since
1.9.0; the pull request side had nothing. It asks for the two things this
repository actually holds a change to that nothing else checks — what the change
*refuses* to do, and whether a new guard was proven by planting the violation and
watching the test fail naming it.

**A guard on the documentation itself: `packages/core/test/docs.test.js`.**
Prose is the part of this repository nothing compiles.

- **Every relative link in every Markdown file resolves to a file that exists** —
  Markdown links and `<img src>` alike, fenced code blocks excluded because a
  path inside an example is text. Anchors are deliberately not checked: heading
  text drifts for good reasons, and a guard that failed on a renamed section
  would be answered by deleting the guard.
- **Every file in `docs/` is named by `docs/README.md`.** An index that adding a
  document is enough to fall out of is an index with a shelf life. This is the
  ratchet that keeps the front door from going stale the way the documentation
  did in the first place.

**What the probe found.** Planting the violations — a link to a file that is not
there, and a document deleted from the index — the index half failed by name and
**the link half passed**. `git ls-files` lists what is *committed*, and the file
whose links had just been broken was new and untracked. The guard was blind
precisely when a document is most likely to be wrong: the moment it is written.
It now enumerates with `--cached --others --exclude-standard`, and the planted
link fails naming both broken targets.

### Changed

**The three delivered plans say so at the top.** `docs/plan-1.36-1.40.md`,
`plan-1.41-1.50.md` and `plan-1.51.md` opened in the future tense describing work
that has all shipped — three forward-looking documents narrating a past. Each now
carries a banner naming what landed and where, and pointing at
[docs/our-own-medicine.md](docs/our-own-medicine.md) for what the arc refused to
ship. The bodies are **kept exactly as written**, for the reason
`plan-1.30-1.35.md` already gave when it was retired: a plan that edits itself to
match what happened is no longer a record of having been a plan.

**`README.md` ends by pointing somewhere other than itself.** A new *The rest of
the documentation* section names the index and the four documents a reader is
most likely to want directly, and the contents list carries it. The *Roadmap and
contributing* section now also names the code of conduct, support and security.

**`CONTRIBUTING.md` and `SUPPORT.md` lead to the index and the code of conduct.**
Both were reachable only from the README, which is the one document a returning
contributor no longer reads.

### Not changed

**Nothing was deleted, and the reason is on the record rather than assumed.**
Every `docs/*.md` file was checked for inbound links before this pass: the
loneliest has three, the median seven. Nothing was orphaned and nothing was
superseded — the disorder was that there was no way *in*, not that there was
junk. Deleting a document to satisfy the shape of a tidy-up would have cost a
reader something real to make this entry read better.

## 1.51.0 — "The record, and the minor"

### Added

**`trazum report --year` — the year, from what was already written down.**
Chapter ten of `docs/plan-1.51.md`, the last of the arc.

**No new data.** Everything comes from the store and the plans a team already
keeps, and nothing is computed that cannot be checked against a document that
already exists. That constraint is the design: an annual report is the document
most likely to be quoted out of the room it was written in, and the one nobody
goes back to verify.

**Three outcomes, never two.** "Eleven of fourteen arrived" reads better than
"eleven arrived, one did not, and two could not be judged" — and the second
sentence is the one that tells somebody their measurement has a hole in it. A
year is where the temptation to collapse them is strongest.

**Missing months are named, never filled.** A year report that quietly covers
nine months and prints an annual total is wrong by a quarter and says nothing
about it.

**There is deliberately no `arrivedUsd`.** A verification says *whether* each
action landed; it has never carried a per-action dollar figure for the saving
that arrived. Summing one out of the observations would mean deciding which of
several numbers per action is "the saving" — a judgement the verification refused
to make and this module has no standing to make on its behalf. So the year says
what was promised and how many promises were kept, and says plainly that it
cannot put a figure on the kept ones. The alternative is precisely the
annual-report arithmetic this document exists to replace.

**It lists its own blind spots** in a `cannotSay` array, which is the only reason
the rest of it is worth acting on.

**It reports the record, not the team.** No per-person anything — an annual
document is exactly where a cost tool starts being used for performance review,
and the way not to be is to hold no data that could be. A test asserts the
document carries no field that could name somebody.

**`conform` grows an outcome chapter and an annual chapter**, so another tool
emitting this format has to handle a missing numerator the same way. The standard
is only worth something if its refusals travel with it.

**Cross-field rules in `conform`.** The refusals worth carrying turned out to be
**relational**: a per-field contract can say "a number or null", and it cannot say
"null when nothing was recorded, and a number otherwise" — which is the whole
refusal. A rate of `0` is valid when calls were recorded and none succeeded, and a
lie when nothing was recorded at all, and the difference lives in a different
field.

**`docs/our-own-medicine.md`** — this project's own record, kept the way it asks
users to keep theirs: what each arc refused to ship, what it got wrong and for how
long (a version claim wrong for seventeen releases; a roadmap running in two
directions for twenty-four), and what it cannot say about itself. It ends without
a score, because every miss on it was found by the same process that made it.

**The doctrine, second edition** — two rules added from this arc: *cheaper per
call is not cheaper per outcome* and *an unallocated share is never spread*.

### Fixed

**The annual record attached an outcomes object whenever calls were parsed**,
rather than whenever an outcome was recorded — so a year with no outcomes at all
reported "0 of 120 recorded" and the honest sentence was unreachable. A zero
dressed as a measurement, which is the exact failure that field's own contract
forbids. Caught by a test written for the sentence that could not print.


## 1.50.11 — "The commitment"

### Added

**`trazum commitment` — what a committed-use deal would have been worth on the
traffic you actually had.** Chapter nine of `docs/plan-1.51.md`. Providers sell
these, and every team that signs one is doing arithmetic in a spreadsheet against
a number they guessed — the failure this product exists to end, at the highest
stakes it occurs, because the guess is annual and signed.

```
  month       list  would pay    saving
  2026-01   $5,000     $4,000   +$1,000
  2026-02   $5,000     $4,000   +$1,000
  2026-03  $600.00     $3,000   -$2,400
  2026-04   $4,000     $3,200  +$800.00

  Net over 4 measured months: $400.00.
  ! 1 of them fell short, and the floor you would have paid for capacity nobody
    used comes to $2,520.
```

**Both directions priced, because one direction is the sales pitch.** A
commitment is a **floor** as well as a discount. The deal above is net positive
and one month cost $2,520 — netted together that disappears, and the
disappearing is what a vendor's slide relies on. The unused floor is kept as its
own figure and never folded into the saving.

**An as-if calculation, and the wording never blurs it.** "On the traffic you
actually had, this would have saved $X" is a measurement of the past; "you will
save $X" is a claim about the future, refused here as everywhere since 1.27.
Nothing is annualised, extrapolated or fitted to a trend, and the document
carries `provenance: 'measured-past'` for a machine reader.

**The shortfall risk is a count of real months, never a probability.** "Three of
your last twelve would have fallen short" is a measurement. "There is a 25%
chance of shortfall" is a model of a distribution nobody fitted, wearing the
authority of arithmetic. Only the first is available from a log, so only the
first is printed — with the measured spread beside it.

**Partial months are dropped, not scaled.** A fortnight replayed against a
monthly floor is a shortfall the traffic never had.

**Fewer than three whole months is a refusal**, with how many more would settle
it: a commitment is signed for a year, and an answer from one month is a
year-long decision made on a fortnight of evidence. The break-even is stated
anyway, because it is a fact about the deal rather than about the traffic.

**A history shorter than the term still gets an answer, with the gap marked.**
Six months against a twelve-month deal is a real answer about six months; what
it must not do is go unsaid.

### Fixed

**The README's Action pins were advanced to the wrong commit.** Reaching for the
last merge SHA in hand gave the *feature* commit for chapter eight, labelled as
if it were the release that follows it. The pin guard from 1.31 resolved the SHA,
compared it against the version in the comment and failed by name three times.
Every release since 1.28 has had two candidate commits here and the wrong one is
always the more recent, which is what makes that guard load-bearing rather than
decorative.

**`formatUsd` rendered a value just under a thousand in the sub-thousand
format.** `5000 - 5000 * 0.8` is `999.9999999999999`, which took the two-decimal
branch and came out as `$1000.00` — a string the thousands branch would never
produce, sitting in a column beside `$5,000` and reading as a different currency
format for the same magnitude. The branch is chosen on the **rounded** value now,
so the boundary is the number a reader sees rather than the number the machine
holds. Found by looking at a real commitment table.

**A signed column was using the unsigned formatter.** `formatUsd` renders a
negative as `$-2,400`, which reads as a typo; in a column where every row can go
either way the sign carries the whole meaning, so it belongs in front of the
currency where a reader expects it. `formatSignedUsd` has existed since 1.30 for
exactly this and was not reached for.


## 1.50.10 — "Whose money"

### Added

**`trazum owners` — whose money.** Chapter eight of `docs/plan-1.51.md`. The
fleet answered *which service* in 1.37; nobody has answered *whose budget*, which
is the question that decides whether anything on the list gets done. A report
saying "the bill is $40,000 and here is $9,000 of savings" is read by four people
who each assume it is one of the other three's problem.

```
  owner      spend  budget  calls
  payments  $62.00   $8.00     62  over
  support   $38.00  $20.00     38  over
  platform      $0  $10.00      0  not measured
```

**The unallocated is its own line, and it is never spread.** Splitting
unattributed spend proportionally across the owners you *do* know is the single
most common lie in cost reporting. It is attractive because it makes every line
add up. What it does is make **every team's figure wrong**, by an amount nobody
can see, in a direction nobody can check — and it does it hardest to whoever
instruments best, because their known spend is largest and they therefore absorb
the biggest share of somebody else's mystery.

The labels in it are named: "unallocated: $15" invites somebody to divide it, and
"unallocated: $15 from `internal-eval`" invites somebody to claim it.

**Shared cost is declared, and the rule travels with the report.** The argument
then happens about *the rule* — "why is search 60/40?" — rather than about the
number, which is an argument nobody can win because nobody can see where the
number came from. Splits are keyed by the exact label rather than by a pattern,
because a shared split is a negotiated fact about one workload and a glob would
let a new label silently join somebody's bill.

**A split that does not sum to 1 is a configuration error, not a rounding
problem** — 0.9 loses a tenth of that workload's money and 1.1 invents a tenth,
both silently. The workload goes to unallocated **whole** rather than having 90%
applied and the rest vanish, so it sits somewhere visible next to the problem
that explains it.

Also caught, all at once: a split naming an owner nobody declared, a "shared"
workload with a single owner (a pattern written the long way, where reading it as
a share invites a second owner to be added without the first being adjusted), a
negative share, and a budget for an owner with no patterns.

**An owner with no measured data is not an owner under budget** — the
`fleetBudgetMissing` refusal from 1.37, applied to people. A team whose logs never
arrived passes every budget it has, forever, and a green tick beside their name
tells somebody the opposite of the truth. Every declared owner gets a line even
with no traffic, because that refusal cannot be printed for somebody who is not on
the page.

Attribution is by the most specific matching pattern, the same tie-break sources
and budgets use — two rules for pattern precedence in one tool is one rule too
many.

### Fixed

**A test whose arithmetic was wrong, caught by the assertion rather than by
reading it.** The unallocated share in the CLI suite was written as 13.0%, copied
from a smoke test with a different fixture; over 85 calls it is 17.6%. The
assertion failed on its first run, which is the suite working — but it is the
second time this week a hand-computed figure in a test was wrong, and both times
the code was right.


## 1.50.9 — "The semantic pass"

### Added

**`trazum semantic` — the findings a dictionary cannot see.** Chapter seven of
`docs/plan-1.51.md`. The rules engine has deferred these since 0.1.0 for one
honest reason: a dictionary cannot see meaning, and **a model that hallucinates
a finding is worse than a rule that misses one.** A missed finding costs
somebody nothing; an invented one costs them an afternoon and the next
finding's credibility.

Two few-shot examples teaching the same boundary in different words, an
instruction restated four paragraphs later, a policy a clarification
contradicts — the cases the near-copy detector deliberately does not flag.

**The price is printed before anything is sent, and `--yes` is required.**
Without it, the price is the entire output of a run. A tool that spends
somebody's money to tell them how to spend less has to be the first thing
audited by its own arithmetic, and it has to ask.

**The model proposes; the deterministic layer disposes.** Every quoted passage
is checked **character for character** against the prompt — the strongest signal
available, because a model reporting on a prompt while paraphrasing what it
quotes has stopped reading and started writing, and everything else in that
response is suspect. Then the spans must be distinct and must not overlap; a
near-copy the rules engine already catches is dropped rather than charged for
twice; a near-copy labelled a *contradiction* is rejected, because two passages
that say the same thing cannot disagree and a model that mislabels one has made
every other label in the response worth less.

**Nothing the model says about size is believed.** Tokens are counted here, from
the spans, with the counter everything else uses.

**A ceiling, never a saving.** Merging a paraphrase pair means writing one
passage that does the work of both, and nobody knows yet how long that is — so
the figure is what deleting the smaller half would recover, named as the ceiling
it is. A **contradiction gets no figure at all**: it is worth fixing because the
prompt is wrong, not because it is long, and a dollar amount would sell the
wrong reason to fix it.

**What did not survive is printed, with its reason.** A pass that showed only
its accepted findings would hide its own hit rate, which is the most useful
thing a reader can know about whether to run it again.

### Security

**Three guards that the pass never becomes a prerequisite**, each proven with a
planted probe: the verification module makes no call of any kind (no `fetch`, no
URL, no `process.env`, no `await`); nothing the model returns is trusted about
size; and the verbatim check runs before any similarity work, so a proposal
whose evidence is invented is rejected before its other claims are examined.

The core keeps working with no key, no network and no model. That has been true
since 0.1.0 and this does not change it — which is why the verification lives in
the package that has no network and only the call lives in the CLI.

### Fixed

**The already-detected threshold was 0.8 and claimed in a comment to match the
deterministic pass. It did not.** `rules.ts` drops a duplicate example at
**0.92**, and the error ran the dangerous way: every pair between 0.8 and 0.92
is one the rules engine does *not* catch, and this layer was silently throwing
those away — discarding exactly the findings the chapter exists to surface,
while a comment asserted the opposite. The constant is 0.92 now and a test reads
the threshold out of `rules.ts` and compares them, so the two can never drift
apart again.

**A guard that guarded nothing, caught by its own probe.** The check that the
verbatim test runs before any similarity work compared the first occurrence of
`'span-not-found'` against the first `jaccard(` — and `'span-not-found'` appears
in the type union near the top of the file, so it always came first and the
assertion passed whatever the loop did. Planting the reordering left it green.
It is bounded to the function body now, and it fails on the probe. **This is the
seventh time in this repository an assertion was bounded by something other than
its subject**, and the first time the probe is what caught it rather than a
later release.


## 1.50.8 — "The quality gate"

### Added

**`trazum quality` — the gate that fails a build for the failure that matters.**
Chapter six of `docs/plan-1.51.md`. CI has been able to fail a build for tokens
since 1.4 and for dollars since 1.21; a prompt edit that quietly made the product
worse has never been gateable — which means every saving this tool has ever
recommended went into a repository with its most important consequence
unmeasured.

```
  before 71.0% (8,400 outcomes)   after 64.0% (8,400 outcomes)

  ✗ The resolution rate moved from 71.0% to 64.0% on 16,800 measured outcomes,
    and this change saves $0.5000 a call. Both halves are measured; neither is
    an estimate.
```

**Named `quality` rather than `check --against-outcomes`, which is what the plan
called for.** `check` reads *prompt files* and gates on tokens; it has never
opened a usage log, and a command that takes either a prompt or a log depending
on a flag is two commands wearing one name. The split-by-time is also not a
`check` idea — there is nothing in a prompt file with a timestamp on it.

**This is a before-and-after, not an experiment, and that shapes everything.** An
experiment splits traffic at random so the arms differ only in the thing under
test. This splits by *time*, so everything else that changed at the same moment
is in the difference too. Most of the module is therefore spent looking for
reasons **not** to blame the prompt.

**Three confounders, any of which forces `cannot tell` with the confounder
named** — a refusal to blame, not a hedge attached to one:

- **The model mix moved.** The drop may be entirely somebody else's migration.
- **The volume moved.** A workload whose traffic doubled usually has a different
  population — a new surface, a new customer, a campaign — and the questions
  being asked are not the questions from before.
- **Outcome coverage moved.** The one nobody thinks of: a team that starts
  instrumenting its hard cases sees its measured rate fall without anything
  having got worse. Comparing two rates over differently-selected populations is
  the most convincing wrong answer this module could produce.

They print on **every** verdict, including green ones. A rate that held while the
model changed underneath is not evidence the prompt is fine either.

**A confounder outranks the statistics.** Checked after the sample sizes and
before the verdict, so a build is never failed on a difference something else
could equally explain — even when the drop is enormous and statistically
unambiguous.

**"Not measurably worse" is never "held", and `cannot tell` exits 2.** Three
outcomes, never two. A gate that spelled the first two the same way would pass a
real regression it merely lacked the power to see, and one that exited 0 on
"cannot tell" would turn every underpowered window into a green build.

**A hundred outcomes a side**, not the ten a rate needs elsewhere. This one fails
builds: the cost of a wrong `dropped` is somebody reverting a good change and
losing the saving; the cost of a wrong `cannot tell` is waiting a day.

**It uses `experiment`'s statistics**, deliberately — one implementation of a
two-proportion comparison, so a gate and a deliberate experiment can never
disagree about the same two numbers and leave a team trusting whichever answer
they preferred.

**What it cannot see, it says.** A `dropped` verdict means the rate fell and the
three things it can check did not move. That is a smaller claim than "the prompt
did it", and it is the largest one the evidence supports.


## 1.50.7 — "The experiment"

### Added

**`trazum experiment` — two arms on real traffic.** Chapter five of
`docs/plan-1.51.md`. `eval` compares two prompts on cases somebody wrote and
`route` compares two models on the same; both measure agreement in a laboratory,
and the traffic is the only place the real question gets answered.

The moment a comparison runs on real traffic, three failures become available
that a laboratory does not have, and each has an answer here.

**A winner where there is none.** Two arms always produce two numbers and one of
them is always larger. The verdict is three-valued the way `verify`'s has been
since 1.39 — and *not separable* comes with the number of outcomes per arm that
would settle it:

```
  · Not separable on this traffic: the 95% interval on the difference includes
    zero. One number is larger, and that is not a finding. About 2,449 outcomes
    per arm would settle the difference observed so far.
```

"Not significant" tells a reader nothing about whether to wait a day or abandon
the idea. When both arms record the *same* rate the figure is `null` rather than
a very large number, because no sample size separates a difference of zero and a
big number would read as "keep going" when there is nothing to find.

**Peeking.** `--min-outcomes` is required, and a stopping rule declared after
looking at the numbers is not a stopping rule. Nothing can prevent an early read;
what this does is make it **visible to whoever reads the result later** — and the
line prints whether or not the arms separated, because a separable result read
too early is still both, and collapsing them hides the inconvenient half.

**Quality reported without its price.** The interesting arm is almost never
better *and* cheaper. It is better and dearer, and the decision turns on a figure
nobody computes: the difference in spend over the difference in successes, per
call so arms with different traffic shares compare. Dividing raw totals would
report a marginal cost that moves when the split changes and the behaviour does
not.

**Wilson score intervals per arm and Newcombe's on the difference**, both chosen
because they behave at the sample sizes an experiment actually starts with — a
symmetric interval runs past 0 or 1 for most of the first week. The intervals are
returned rather than only the verdict, so a reader who disagrees with the
threshold can see the numbers it was applied to.

**Nothing is auto-promoted.** A winner is a finding; taking it is a decision with
a name attached, and it lands in the plan like everything else.

An undeclared outcome value stays out of both arms: a typo in an exporter must
not decide an experiment.


## 1.50.6 — "The ladder"

### Added

**`trazum ladder` — is cheap-first-escalate-on-failure saving money, or is it a
bill?** Chapter four of `docs/plan-1.51.md`.

"Route to the cheap model first and escalate a failure" describes a policy that
saves money and a policy that costs money **equally well**. One number separates
them, and nobody works it out in their head because the shape of the arithmetic
is not obvious: **an escalation pays twice**, since the cheap attempt is not
refunded.

```
  support  claude-haiku-4-5 → claude-opus-5
    $0.2000 a call cheap, $1.00 dear. Break-even escalation rate: 80.0%.
    Measured: 10.0% (10 of 100 calls escalated).
    ✓ Saving $0.7000 a call against never having built it.

  triage  claude-haiku-4-5 → claude-opus-5
    $0.2000 a call cheap, $1.00 dear. Break-even escalation rate: 80.0%.
    Measured: 90.0% (90 of 100 calls escalated).
    ✗ Costing $0.1000 a call MORE than never having built it.
```

Both are configured identically. The only difference is a measured escalation
rate no configuration file can show you.

**A three-rung ladder is priced against its top rung**, never its middle — the
alternative is the model that would have been used without a ladder, and
comparing against the middle reports a saving against a model nobody was going
to use.

**No sign is claimed within two points of break-even.** Inside that band the
answer flips on ordinary week-to-week variation, and "saving" on Monday and
"costing" on Thursday from the same policy teaches a reader to ignore the figure.

**`escalateOn` is required and never defaulted.** "Anything that is not a
success" is the tempting default and it is wrong: adding a word to the
vocabulary would silently start sending traffic to a more expensive model. A
control loop must not change behaviour because somebody documented a new word.

**`validateLadder` catches the most expensive possible typo**: escalating on a
value the vocabulary declares a *success*, which pays twice for work that already
worked, on every call, while looking exactly like a cost-saving measure in the
config. Also a ladder that would silently never fire, rungs that go *down* (not a
ladder — a routing rule that escalates to something cheaper and reports a saving
for it), duplicates, unknown models and one-rung ladders. All reported at once
rather than one per run, and a misconfigured ladder exits 1 because it is the one
finding here that is wrong *now*.

**An undeclared value stays out of the denominator as well as the numerator.** A
typo must not move a control loop's break-even: with 90 resolved, 10 escalated
and 100 misspelled, counting the typos reports a 5% escalation rate instead of
10%, and a ladder judged on half its real rate is a ladder nobody switches off.

**Trazum does not run the escalation, and says so.** A ladder escalates *after* a
failure is known — after the answer came back and usually after something
downstream judged it — so the retry belongs in the caller's own loop. What ships
is the policy and the arithmetic that says whether the policy is worth running.

**The escalation signal is the caller's, never inferred** from length, latency,
refusal text, a stop reason or a retry. The same refusal `outcome` makes, for a
sharper reason: a report built on a guess prints a wrong number, and a control
loop built on a guess sends real traffic to a more expensive model on the
strength of that guess, forever, and bills for it.


## 1.50.5 — "Cost per outcome"

### Added

**Cost per outcome — the finding a total cannot make.** Chapter three of
`docs/plan-1.51.md`. 1.50.4 recorded the numerator; this divides by it, which
sounds like arithmetic and is almost entirely a set of decisions about when
*not* to do the arithmetic.

```
What an outcome costs
  workload  per call  per success  recorded
  dear         $1.00        $1.00    100.0%
  cheap      $0.1000        $2.00    100.0%

  → cheap is #2 by cost per call and #1 by cost per success.
```

`dear` costs **ten times more per call and half as much per resolution**.
Anybody optimising on the first number has been moving the wrong one, and until
now nothing in this product could say so.

**Per success divides recorded spend, never the whole bill.** The obvious
implementation divides everything a workload spent by the outcomes it resolved.
It is wrong in the direction that makes a product look worse than it is: any call
carrying no outcome is spend with no chance of appearing in the denominator, so
the ratio is inflated by exactly the uninstrumented share — silently, and by an
amount invisible from the figure. A team instrumenting half its traffic would
read double the real cost per resolution, conclude the feature is uneconomic, and
kill it.

**Five reasons a figure is withheld rather than stated**, each named in the cell
where the figure would have been: fewer than ten recorded successes, coverage
below 80%, money spent with nothing resolved (a real and alarming measurement,
not a division by zero dressed up), nothing recorded, and no vocabulary declared.

**Two orders, and the product prints both.** Cheapest per call and cheapest per
success are different rankings, and picking one would be this tool making the
choice it spent 1.50.4 refusing to make. The disagreement between them is itself
reported.

**A withheld slice has no rank.** It is left out of the per-success order
entirely — giving it a position would place it on the strength of a number this
module declined to state, and a reader who sees a rank assumes a rate.

`outcomeTallyByLabel` and `outcomeTallyByModel` join the profile document, each
slice carrying its own `calls` and `totalUsd` so a coverage share describes the
workload rather than the file it came from.

### Fixed

**The rank-disagreement test missed the sharpest case there is.** It flagged a
slice whose two ranks differ by more than one place, and with two rankable
slices a *complete reversal* is a distance of exactly one — so the clearest
possible instance of the finding was filed as noise. A change at the top now
counts regardless of distance: whoever is dearest per call and whoever is
dearest per resolution are the two names in the conversation, and them being
different names is the entire point of computing both.

**A fixture whose two ratios were accidentally equal.** The first version of the
ranking test built a "cheap" workload and a "dear" one that both came to exactly
$1.00 per resolution, so the test that was supposed to prove the orders diverge
proved nothing. Caught because the assertion failed rather than because anybody
checked the arithmetic.


## 1.50.4 — "The outcome"

### Added

**An `outcome` on the usage record — the counterpart every figure here has been
missing.** Chapter two of `docs/plan-1.51.md`. Everything Trazum reports is a
cost: it can say a workload got forty per cent cheaper and cannot say whether it
stopped working. The missing field is not something this tool can compute; it is
something only the caller knows.

Recorded beside `label` and `session`, read from `outcome` or `trazum_outcome`,
and declared in the config:

```json
{ "outcomes": { "values": ["resolved", "escalated", "abandoned"], "success": ["resolved"] } }
```

**The rate is by spend, never by call.** In the worked example in the README,
forty of fifty-five calls succeeded — 73% by call and **48.2% by spend**,
because the expensive half of the traffic was the half that failed. The two
figures diverge exactly when it matters, and a call-weighted rate would have
read as a healthy product.

**`outcomes.success` is required, and may be empty.** Which of your words counts
as success is a judgement about your product rather than your bill, and this tool
has no standing to make it — one that decided `escalated` was a failure would be
wrong at every company where escalation is the correct, designed outcome for a
class of request. Leaving the field optional would send that question straight
back here to be answered by a default nobody chose. `[]` is allowed: a product
that records only failures has declared something real, and the report then says
it cannot state a rate rather than inventing one.

**Never inferred.** No absence of complaint counts as success, no short
conversation counts as resolution, no retry counts as failure. Each is a
plausible heuristic that would become a metric somebody optimises against —
which is how a tool ends up rewarding conversations that ended early because the
user gave up.

**Nothing recorded is not a rate of zero.** A rate of zero is a real and terrible
measurement; "nobody told us" is a different sentence and `noRate` spells it
differently. A tool that reported 0% success for an uninstrumented product would
get somebody fired over a number that measured nothing.

**An undeclared value is named, not bucketed.** A misspelled `resolvd` is a
broken exporter, and folding it into the failure side would report a product
regression that never happened — the direction that gets somebody paged at four
in the morning. It is excluded from both halves of the rate and listed by name.

**Every printed rate carries what it does not cover.** The share of the bill that
carried no outcome is stated beside it, because a rate over an eighth of the
spend is a rate about an eighth of the spend.

`outcomeTally` joins the profile document (measurement only, no judgement — an
aggregate, never a list of calls) and `fieldCoverage` gains `outcome`.

### Security

**Three guards that an outcome is recorded and never inferred**, each proven by
planting the violation:

- the outcome module may not mention `session`, `stop_reason`, `truncated`, a
  timestamp, a retry or a repeat;
- the parser's assignment is compared exactly, so no `?? 'resolved'` fallback
  can be appended;
- the rate's type must stay `number | null` with a `noRate` beside it.

The privacy line does not move: an outcome is a small enumerated value, tallied
as an aggregate, never alongside content.

### Fixed

**A profile assertion was bounded by a phrase rather than by its subject.** The
cache-TTL test asserted the whole report contained no `cannot say whether`, and
the new outcome-coverage line says "cannot say whether it stopped working" for
entirely unrelated and correct reasons — so a true assertion started failing on a
sentence about a different subject. It matches the TTL hedge's own sentences now.
Sixth occurrence of this shape in the repository, and the second this week.


## 1.50.3 — "The gateway"

### Added

**`trazum gateway` — in the path of the call, and able to say no.** Chapter one
of the arc in `docs/plan-1.51.md`. Everything else here either answers a
question an implementation may ignore or reports on a bill after it arrived; a
connector's export is a batch job on somebody else's schedule, so the runaway is
always reported after it ran. Standing between the caller and the provider fixes
both: usage is measured from the provider's own response as it comes back, and a
refusal is a refusal.

Point your SDK's base URL at it. It speaks the provider's wire format, so there
is no new client and no code change.

**It refuses; it does not substitute.** A call over budget gets HTTP 402 with the
cheaper alternatives named — never silently swapped, trimmed or downgraded. The
caller asked for something specific, and a proxy that quietly answers a different
question is worse than one that fails, because the failure is visible and the
substitution is not.

That is enforced in the **type**, not in a comment: a decision is either
`forward`, which carries nothing the caller did not send, or `refuse`, which
carries no body at all. There is no shape in which the core hands back a modified
request, so substitution cannot arrive later as a reasonable-looking field.

**402 rather than 429, deliberately.** Every provider SDK retries a 429
automatically — that is what the code means to them — so answering a budget
refusal with one would turn a single refusal into a retry storm against a gateway
that refuses every time, driven by the caller's own client library. 402 is
literally correct and in nobody's default retry list. A 502 with
`trazum_upstream_unreachable` is kept distinct: "your provider is down" and "you
are out of money" send somebody to fix different things.

**`--on-cannot-tell` is required and has no default.** `fail-open` lets the call
through and records it as **unjudged** — never "within budget" — while
`fail-closed` refuses it. Both are defensible and only the operator knows which
failure their product can survive. Picking one for them would be the most
consequential decision in their architecture, made silently at install time.

**`spend.substitute`** — substitution only where somebody wrote it down, with a
required `reason` for the same purpose a waiver's is. Every substituted call is
marked, so no later report treats it as the call the caller made, and it never
fires because the gateway could not *judge*: swapping a model because a budget
could not be read would be answering a different question for a reason that has
nothing to do with the request.

### Security

**Five guards on a component that stands between somebody and their provider**,
each proven by planting the violation and watching the test fail by name.

- **The credential is not even borrowed.** The caller's own headers are
  forwarded untouched and never read — stronger than the connector's *borrowed,
  never held*, and checked as the absence of any read, because code that reads a
  secret and happens not to log it today is one refactor from logging it.
- **The upstream is compiled in.** A flag naming the host would make this a
  credential-forwarding open proxy: anything that could rewrite a config on disk
  could point a company's API key at a machine it chose. The guard compares the
  **exact** origins rather than searching for them — CodeQL flagged the first
  version as two unanchored host patterns and was right about more than the
  lint, because `match(/https:\/\/api\.anthropic\.com/)` also passes on
  `https://api.anthropic.com.evil.com`, which is the single substitution
  somebody attacking that file would make. A guard against a redirected
  credential that a lookalike host satisfies is worse than no guard, because it
  reads as coverage. Proven by planting the lookalike.
- **Nothing about the payload is written down**, and the interfaces have nowhere
  to put it: the decision function is handed a description and never the body,
  and the recording callback takes counts.
- **`forward` cannot carry a request**, asserted against the type.
- **The refusal is 402**, asserted against the handler.

Plus loopback binding with one definition of the address, and exactly one
forwarded path — the one that spends tokens.

### Documentation

**docs/gateway.md**, and the refusal body is contracted in
`docs/json-output.md` with a two-direction parity test.

### Fixed

**Two source harvests in `security.test.js` were bounded by their neighbour.**
The `init` and `feedback` guards sliced from their function to `commandModels`
*by name*, so inserting `commandGateway` between them silently widened both to
include it — and one immediately started reporting on its neighbour's source.
The same failure the `docs/json-output.md` parity tests have had five times.
Both are bounded to the next function now, whatever it turns out to be, and the
first-run contract harvest — which was last in the file and therefore unbounded
— is bounded before the section that would have broken it.


**`ROADMAP.md`'s Released section ran in two directions.** Entries were being
prepended from 1.26.0 onward, so the file went 0.1.0 upward to 1.25.0, jumped
to the newest release, and then counted *backwards* to 1.26.0. A reader
following it forwards went 1.25.0 → 1.50.2 → 1.50.1 and out the bottom at
1.26.0 — the story's ending pasted into its middle, running the wrong way.

Twenty-four releases were added into that break without it being noticed,
including every one written this week. It reads oldest-first throughout now,
and the section says so at the top with the reason: each entry explains what
the previous one made possible, so it only reads correctly forwards.
`RELEASES.md` and `CHANGELOG.md` are the newest-first documents.

**The waiver record was written beside the terminal, not beside the config.**
`trazum profile` recorded a waiver use in the *process's* working directory,
which is a different place whenever somebody runs
`trazum profile ../logs/x.jsonl --config ../repo/trazum.config.json`. This
repository's own test suite does exactly that from `packages/cli`, so sixty
records of a fixture's decisions accumulated in a package directory — and a
`git add -A` swept one copy onto `main`, where it has been a tracked file for
two releases.

A waiver is a decision a *repository* made; the record of using it belongs with
the file that made it. It is written beside the config now. No config means no
waivers, so there is nothing to write and the old fallback is never reached.

**Removed: `packages/cli/.trazum/waivers.jsonl`**, which was that stray file.
It was never anybody's decision — it was a fixture's, recorded in the wrong
place and committed by accident.

**A guard for the class, proven with a planted file.** Runtime state that a run
of Trazum can produce — anything under `.trazum/`, a `trazum-summary.md`, a
`plan.json` — may not be *tracked* in this repository. Checked against the
tracked tree rather than the working tree, because an untracked file is
somebody's local mess and a tracked one is everybody's.

**`ROADMAP.md`'s Next section still described a delivered arc as planned.** It
announced ten releases "planned in order through 1.50.0" — all ten of which had
shipped — and repeated the 1.50.1-through-1.50.9 pinning that `docs/plan-1.51.md`
had already dropped for being wrong two releases in. Rewritten: the finished arc
is named as finished, the arc in progress points at the plan that does not pin
numbers, and the reason it does not is stated.


## 1.50.2 — "The feedback loop"

### Added

**`trazum feedback`.** Trazum has no telemetry — no ping, no install hook, no
anonymous counter, nowhere — which means the only signal about whether any of
this works is what somebody chooses to say. This makes saying it one word:
where to report a rule that changed what a prompt asks for, a bug, a question or
a security problem, plus a blank issue link already carrying the version, the
runtime and the platform, printed in full first so nothing travels that the
sender has not read.

Nothing about their work goes in it — not the config, not a prompt, not a label,
not a figure. Those are exactly what a good report needs and exactly what only
the reporter can decide to share, and a command that helpfully attached them
would be the leak this product exists not to be.

**`trazum --version`.** The CLI could not say which version it was, in a tool
whose bug reports need that above everything else. It is read from the manifest
beside the built entry point rather than baked in by a generator, so it cannot
drift from what npm installed, and it answers before the config loads — which is
exactly when somebody is asking.

**SUPPORT.md**, which GitHub surfaces in the issue flow: where to go, what not
to paste into a public page, the no-telemetry statement, and an honest note on
what download counts and stars do *not* tell anybody.

### Security

**Four guards on the claim that this sends nothing**, each proven by planting
the violation and watching the test fail by name. `trazum feedback` may not
reach the network; may not open a browser on somebody's behalf, because that is
a request they did not read; may not put anything about their work into the
prefilled body; and no published package here may declare an install hook, which
is how a CLI usually acquires telemetry without a line of its own code changing.

The command needed guarding hardest precisely because it is *shaped* like a
telemetry feature. A reader cannot tell the two apart from the output, so the
sentence it prints is worth exactly as much as the check behind it.

### Documentation

**`docs/plan-1.51.md` stops pinning a patch number to each chapter.** The first
draft assigned 1.50.1 through 1.50.9, and then 1.50.1 and 1.50.2 both arrived
without being in it — the numbering itself, and this. Work outside a plan is not
a failure of the plan; a plan that pretends otherwise goes stale on contact. The
order is the commitment, and the table now says so.


## 1.50.1 — "The numbering"

**A patch that changes what a patch means**, which is the only release where
that is not a contradiction.

### Changed

**The version number now carries the narrative.** Work here is planned in arcs
of about ten releases with a single thesis — `docs/plan-1.41-1.50.md` was *the
loop is complete and inert*, and everything from the connector to the
conformance check served it. From now on a **chapter of the arc in progress is
a patch**, and the **minor is spent only on the release that lands the thesis**.
So the next arc runs 1.50.1 through 1.50.9 and finishes at 1.51.0 — which is
not "the release after 1.50.9" but the one where a story ends.

**What that costs, and it is stated rather than buried.** Under strict semver a
patch adds nothing, and here it will: a patch release can add a command, a flag,
a document format or a rule. Somebody pinning `~1.50.0` expecting only bug fixes
will receive features. It cannot *break* them — the 1.x freeze is untouched and
is the promise that actually matters — but "you get more than you expected" is a
real surprise, and `VERSIONING.md` now says so in its own section rather than
leaving it to be discovered from a diff. `^1.50.0` behaves identically under
either scheme and is the intended range.

The reason the field was available to reassign: inside a frozen 1.x line, minor
and patch are *both* additions-only, so the distinction between them was never
load-bearing for safety. It was carrying nothing.

**The deprecation window got longer and stays as written.** "At least two minor
versions" is now roughly twenty releases rather than two. That is a
strengthening, and it was not rewritten to preserve the old duration, because
the old duration was never the thing being promised — the clause exists so a
deprecation outlives the attention span of whoever wrote it.

### Documentation

**`docs/plan-1.51-1.60.md` is now `docs/plan-1.51.md`**, renumbered: nine
chapters as 1.50.1 through 1.50.9, landing as 1.51.0. The arc, its thesis and
every release's content are unchanged — only what they are called.

The 1.40.0 changelog entry below still names the old path. That is deliberate:
below the first version heading this file is a record, and rewriting a shipped
entry to match a later rename would be falsifying history to tidy a link.

**`VERSIONING.md` opens with what the three numbers mean** instead of with a
caveat about a pre-1.0 world nobody is in any more, and `docs/releasing.md`
answers "which number" before step one rather than assuming the answer is
obvious.

## 1.50.0 — "The standard"

### Added

**`trazum conform` — the contracts become something to build against.** Ten
documents, all enforced in both directions by parity tests in this repository,
and until now no way for anybody else's emitter to find out whether what it
produces satisfies one short of reading the source and hoping.

It answers **two questions and keeps them apart**. *Does this conform* —
required fields, present and the right type — exits 1 when they are not, so it
gates in CI. *What can a valid document of this shape not answer* — with the
field that would unlock each — never gates, because choosing not to log
sessions is a decision, not a defect, and a check that failed on it would be
Trazum telling somebody what to record.

The second half is the useful one. A usage log with a model and token counts
conforms completely and supports about a third of the product; an emitter that
only ever hears "valid" ships it and never finds out why the cache verdict never
appears.

Unknown fields are never a problem: these documents gain fields without a
version bump, so a checker that rejected tomorrow's field would be one nobody
upgrades. A zero standing in for absence *is* reported, as its own kind of
problem, because it is the mistake that produces a wrong report rather than a
rejected one — and always in the flattering direction.

**docs/doctrine.md.** Twenty rules, each with the release that learned it by
getting it wrong first: measured never merges with estimated without saying
which half is which; not-recorded is not not-happened; three outcomes, never
two; no series becomes a forecast; a floor can prove *over* and never *under*;
quiet is not clean; a refusal never arrives bare; a credential is borrowed,
never held; one key, one denominator; record, do not reconstruct; report the
record, not the team. They had been discovered one release at a time inside a
changelog. Written down together, they are the argument for why anybody should
trust a cost figure — from this tool or any other.

**docs/format.md.** The ten contracts in one index, what `schemaVersion`
promises and what only a version bump may change, what is deliberately in none
of them, and the rules a provider connector must follow to be one.

### Fixed

**`--contract` was silently a boolean, and so is any value flag nobody
registers.** A flag missing from `VALUE_FLAGS` parses as `true` and its value
falls into the positionals — so the command reads `undefined`, ignores the
argument it was given, and produces a confident answer about the wrong thing.
Nothing errors: `rejectUnknownFlags` is satisfied, because the flag *is* known.

Caught on the same afternoon it was written, by a test that expected a bad
contract name to be refused and watched a report come back instead. A guard now
fails the build when a flag the help documents as `--x <value>` is not
registered as taking one — the help text being the checkable promise — proven by
removing `contract` again and watching it fail by name.


## 1.49.0 — "The live budget"

### Added

**The live budget: one measured number, wherever it is asked for.** By 1.48
there were four ways to ask Trazum about money — a gate in CI, the terminal,
the local endpoint an agent consults, the browser — and no guarantee any two
agreed. Each computed its own answer from whatever it happened to be holding.
Four right answers to four slightly different questions is how a CI failure and
an agent's refusal come to disagree in front of somebody.

`budgetPositions` in `@trazum/core` turns a budget into a **standing**: a limit,
a calendar month, the measured spend inside it, and how much of that month was
measured at all. `trazum store` prints it and `trazum serve` answers with it, so
they cannot drift.

**`spend.monthlyUsd`**, a new key and deliberately not a reuse of `maxUsd`.
`maxUsd` gates whatever period a log happens to cover; this gates a calendar
month. Same units, different denominators. Nothing infers one from the other: a
repository with a per-log gate and no monthly budget has no monthly position,
and the tools say so rather than picking a number of the right shape.

**A period nobody measured is not a period under budget** — the
`fleetBudgetMissing` rule from 1.37, applied to time. Elapsed days with no
measurement are counted and named; nothing measured at all is `cannot-tell`,
never `within`. `$0 of $400` is the healthiest-looking budget a dead store can
produce.

**The burn is a shape, never a date.** `ahead`, `on-pace`, `behind`,
`cannot-tell` — a comparison of two shares that have both already happened. The
type carries `readonly forecast?: never` and a test asserts the serialised
object contains no field naming a date, because it is the single most requested
number this module will ever be asked for and every future reader will be
tempted to add it.

**A floor can prove `ahead` and can never prove `behind`.** Partial coverage
means the consumed figure is a floor: the unmeasured days spent something and
nobody knows how much. A floor that has already outrun the calendar is
unarguable; a comfortable-looking floor proves nothing.

### Fixed

**`trazum serve` was comparing the whole store against a per-log budget.** It
read `spend.maxUsd` — the gate for one log — and set it against every record the
store held, which can be a year, then served the result as a budget position
with no way for a caller to tell. The disagreement between `serve` and CI was
exactly as large as the machine's history. It reads the month's standing now.

**`serve`'s answer carries the period rather than the store's span**, so a
caller judging staleness is told which month the figure is about instead of when
the oldest record was pulled.

**The `serve` test suite was pinned to August 2026.** Its fixture used a literal
date, which was inside the current month by luck; the budget being a *month*
would have made it stop being measured the moment the calendar moved on — a
suite that passes for eleven months and then fails for reasons nobody
remembers. The fixture is relative to the current UTC month now.


## 1.48.0 — "The cost review"

### Added

**Waivers get their history — the gap 1.40 named and could not fill.** 1.40
wanted to say *this finding has been waived three times in a row* and refused
to, because the only material available was the config as it stands, and a past
reconstructed from a present is a guess wearing a record's clothes. The fix is
**recording**, not inferring.

When a waiver silences a gate, `trazum profile` appends one dated line to
`.trazum/waivers.jsonl`: the gate, the reason and expiry **as they stood at that
moment**, the commit when CI exported one, and the figures the gate actually
judged. `trazum history` reads them back and reports the habit — how many uses
across how many days, every reason and expiry in the order first seen, and a
typed verdict.

The verdict is the point. **`renewed-without-revisiting`** — the expiry moved
while the reason did not — is the shape a decision takes when nobody is looking
at it again, and it is kept apart from **`reason-changed`**, which is somebody
looking. Counting both as "waived four times" would flatten the one signal worth
having. Neither is called wrong: plenty of real constraints outlive their first
estimate, and this reports the record, never the team.

Three rules hold it up. **Nothing is back-filled** — the history begins the day
recording began and says so. **A use is recorded when a waiver silences
something, not when it is written** — a waiver nobody's build has hit is dead
config, reported separately, and either the gate stopped failing (good news
nobody wrote down) or it names a situation that never arises. And **a failure to
write never fails the build**: the gate's job is the exit code, so a read-only
checkout or a full disk is reported and the gate's own verdict stands.

There is deliberately no prune, no compaction and no `--clear`. A record of
decisions the tool can erase is a record nobody can rely on; deleting the file
is something a person does with `rm`, having seen it.

**docs/ci.md.** Worked recipes for GitLab CI, Jenkins, CircleCI and a
pre-commit hook — the same binary and the same two exit codes, with every
example's exit code checked against the built CLI before being written down. No
vendor plugin: each would be a second code path with its own bugs and its own
way of drifting from the exit codes it is supposed to relay, and the limitation
is stated rather than papered over.

### Documentation

**The README documented no waivers at all.** A required config key with an
expiry mechanism that is the whole point of the feature, and the front door had
never mentioned it — found while writing the release, not by a guard. It has a
section now, including the record above.

**`trazum history --json` gains its `waivers` field in the contract**, with the
habits, the verdicts and the `neverUsed` list that keeps dead config out of the
habit count.


## 1.47.0 — "The browser sees the bill"

### Added

**The plan and the verification, in the browser.** The bill has been readable
in a tab since 1.36; everything the loop does *with* a bill — rank the actions,
save the decision, come back later and ask whether it worked — lived only in a
terminal, which made the web app a demo of the smallest half of the product.
The Bill tab now renders the plan under the report: ranked actions, each with
the money as a projection **or** a measured stake and never both, the typed
assumption it rests on, and the command that would check that assumption. Two
totals, kept apart, with a line saying why they are never added.

**The document is the bridge, and it is the same document.** *Save plan.json*
writes byte-for-byte what `trazum plan -o` writes. Commit it, gate on it in CI
with `trazum verify`, or open it back here — one contract, no server between
the two surfaces. Opening a saved plan turns the log in the tab into the check
on it: three outcomes, never two, with the three cannot-tell reasons kept
distinct, and the plan's own price-table date compared against today's so a
repricing is never read as a team missing a target.

Saved as a **file, not a link**. A link would mean this page storing somebody's
bill somewhere, which is an access-control question nobody has designed — the
same call the store made in 1.42, for the same reason.

**`parsePlanDocument` in `@trazum/core`.** One validator for the plan format,
shared by the terminal and the browser, returning a typed refusal rather than
throwing — a refusal has to be rendered in one and localised in the other, and
an exception with an English message baked in can be neither. It reports which
action is malformed and what about it: a plan can hold a dozen actions and only
one be wrong.

### Fixed

**The CLI accepted files that were not plans.** `trazum verify` checked
`schemaVersion === 1 && Array.isArray(actions)` and stopped there, which admits
an `actions` array of arbitrary objects. `verifyPlan` would then read `label`
off `undefined`, match it against no slice in the log, and report `cannot-tell:
workload-vanished` for every one — a verification of a document that was never
a plan, rendered exactly like a real one. The shared validator now checks the
three fields verification actually reads, and the CLI's refusal names which
action and why instead of only that something is wrong.

**The web app was building against `@trazum/core@1.36.0` — for ten releases.**
`apps/web/package.json` pinned an exact core version, as `packages/cli` and
`packages/mcp` do, and unlike those two it was never in the release recipe
because the web app is not published. npm honours an exact pin that does not
match the workspace by installing a **real copy from the registry** into
`apps/web/node_modules`, which shadows the workspace symlink. So the browser
could not see the fleet, the plan, verification, the series, the connector, the
store, the watch, the endpoint, the guard or `init` — ten releases of core —
and every check passed the whole time, because nothing was broken. The wrong
thing was being checked. The pin now tracks the repository, and a guard fails
the build when any workspace depends on a `@trazum/core` that is not this one.

### Documentation

**docs/plan-format.md.** What a plan document holds, field by field, and the
five ways a file gets refused as one — so the format is something a team can
commit and diff rather than an artefact of whichever version wrote it.


## 1.46.0 — "Five minutes"

### Added

**`trazum init` — the first five minutes.** Everything since 1.41 raised the
ceiling; this lowers the floor. One command that does what a person would do on
their first afternoon: walks for prompt files, reads source files for which
provider the code calls (the `where` machinery from 1.7, which has always
refused to guess), notices a usage log or a connector credential, and writes a
`trazum.config.json` out of what it can actually justify. Then it prints the
single most valuable thing it found, **arithmetic before the figure** — the
calls, the label, the model, what they cost, and only then the saving. A tool
that opens with a dollar amount nobody can check gets closed.

It is a detection, not a wizard. Nothing is asked. `--dry-run` prints the config
and writes nothing; `--yes` replaces one already there; without it an existing
config is left alone; `--json` emits the whole proposal and writes nothing.

**Four keys it refuses to write, which is the substance of the release.**

- **A budget, ever.** A log says what your traffic *was*; a budget says what it
  *may cost*, which no log can answer. "The measured month plus twenty per
  cent" would be Trazum inventing a threshold and then grading somebody against
  it. The measured figure is handed over; the limit stays with the person who
  can set one.
- **A monthly rate from a short window.** Twenty-eight days minimum, so every
  weekday appears the same number of times. And a separate refusal for the
  quiet case: if *any* call in the log carries no timestamp, no rate is stated
  at all — those calls cannot be placed inside the span a rate would divide by,
  and dividing anyway makes the figure come out high with nothing to show why.
- **A cache hit rate from a log with no cache columns.** Not recorded is not
  not-happened. A zero there would tell every later caching advisory that
  caching is doing nothing — a finding invented out of a missing field. A log
  that *does* record cache writes and reports zero reads is a different thing
  entirely: that is a measurement, and it is written.
- **`usage.batchEligible`, in either direction.** Whether the work tolerates a
  batch window is a product decision no log records. `false` would silently
  delete the batch lever from every report this config touches; `true` would
  sell a saving on latency nobody agreed to give up.

It also declines a model when the source names a *provider* and no model.
`trazum where` prints a provider's default because a reader can see it is a
guess; a config file cannot — six weeks later it reads as somebody's decision,
and every price in every report rests on it.

**Every refusal arrives with what would settle it**, typed rather than as prose
— the rule `spend_guard` established for a call in 1.45, applied here to a file.

**`proposeInit` in `@trazum/core`.** The judgement is a pure function over
observations the CLI collected: no filesystem anywhere near it, so every rule
above is tested without one, and `--dry-run` is the same code path minus the
write rather than a second implementation that drifts.

**docs/usage-logs.md.** Worked examples for the four shapes people actually
have — an Anthropic response, an OpenAI response, a Vercel AI SDK `onFinish`
hook, an OTel collector — with real records rather than a schema dump, and a
table of which finding each optional field buys. Linked from `init`'s output,
because the moment somebody needs it is the moment the tool says "no usage
found". Every example in it was run through `trazum profile` before it was
written down; one claim did not survive that (a JSON *array* in a `.json` file
is not read) and the page says so instead.

### Fixed

**`init` no longer needs a working config to run.** Every command loads
`trazum.config.json` before dispatch and throws when it will not parse —
correct for the rest of them, since "defaults" for a budget means "no budget"
and a silent revert is a green build that should have been red. But `init` is
the command somebody runs *because* their setup is broken, and it was the one
command a broken setup could stop from running. It now survives the failure
with nothing carried forward — no keys, no budgets, no locale — and refuses to
write over the file it could not read, naming it. The refusal had been written
two hours earlier in the same release and was unreachable code standing behind
a throw; it was found by a test that expected it to fire and watched a parse
error arrive instead.

### Security

**Three guards on the first run, each proven with a planted probe.** `init` has
the widest reach in this product and the least trust behind it: it runs in a
directory it has never seen, before anybody has read a page of documentation.
So the build fails if `commandInit` reaches the network or an LLM (the
deterministic core has been the entry point since 0.1.0, and a tool whose
introduction costs money is one nobody introduces); if it reads the *value* out
of `findCredential` rather than the variable name (checked as what is
destructured, not as what is printed — a version that pulls the key out and
happens not to log it today is one refactor away from logging it tomorrow); or
if it writes any file other than `join(root, CONFIG_FILENAME)`.

**A time-of-check/time-of-use race, found by CodeQL in code written the same
day.** `init` bounds how large a source file it will read, and it took that
measurement with `stat(path)` and then read `readFile(path)` — two lookups of
the same name, where what arrives the second time need not be what was measured
the first. The bound would have been enforced against a file that was no longer
there. It now opens the file once and stats *the handle*, which is the same
inode by construction. A fourth guard holds the fix in place, because it is
invisible in the output: both versions print exactly the same thing, and only
one of them is checking the file it reads.

### Documentation

**The first-run document is contracted.** `trazum init --json` has a section in
docs/json-output.md with a two-direction parity test, **bounded to its own
section** — and the spend-guard harvest above it was bounded in the same commit,
because an unbounded harvest starts enforcing the next shape's fields the moment
a new contract is appended. That has now happened five times in this file, so
the bound is written before the section that would break it rather than after.

**README leads with `init`.** Getting started opened with `optimize
your-prompt.txt` — the smallest thing in the tool — for twenty-two releases. It
opens with `npx @trazum/cli init` now, and the command table gains a row.


## 1.45.0 — "The agent's budget"

### Added

**`spend_guard`: the thing spending the money can finally ask, and be told
no.** The MCP server told an agent what a prompt costs; it could not tell it
whether it was allowed to spend, which is the only answer that changes what a
model does next. Fifth of the ten in docs/plan-1.41-1.50.md.

**A refusal never arrives bare.** An agent told "denied" and nothing else has
two moves — send it anyway, or fail the user's request — and both are worse
than the call it wanted to make. Every `no` carries the cheaper ways to make
the *same* call: a smaller model, a batch window, or both. Each is priced for
this call rather than for a month, because the caller is deciding one call
right now and a monthly figure is the right number at the wrong moment. Each
names what it assumes, typed as everywhere since 1.38. Alternatives appear on
a `yes` too: an agent allowed to spend that could spend less should be told.

**An alternative the prompt does not fit in is not an alternative.** A cheaper
model with a smaller context window does not make the call cheaper — it makes
it impossible. Those are filtered before they are offered rather than offered
and blamed later, and the surviving ones carry `fits: true` so the rule lives
in the type rather than in a filter nobody reads.

**Route and batch combine, never add.** The batch discount applies to the
cheaper model's price, as `billLevers` has done since 1.23 — the head
arithmetic `plan` exists to kill does not get to reappear at the tool surface.

**It never spends to answer, and never says yes to what it cannot judge.** No
provider call, no model call, no pull — a cost guard that costs money to
consult is a joke with a bill attached. And `cannot-tell` stays
`cannot-tell`: a guard that permits whatever it cannot see permits everything
the moment a figure goes missing.

New core module `guard.ts` (`guardSpend`), and `spend_guard` on the MCP
server beside the four tools that were already there.

### Security

**A tool may not cause spending.** An agent that could trigger a provider pull
by asking a question is a denial-of-service with good manners, and the bill
lands on whoever installed the cost tool. A guard fails the build if the MCP
tool surface reaches the connector's fetch path, the node entry point or the
filesystem — proven with a planted probe. The exact-set tools test carries the
review that admitted `spend_guard`, as it has done for `profile_usage`.

### Documentation

**The cost answer document is contracted at last.** `serve`'s `POST /cost`
response should have been in docs/json-output.md when it shipped in 1.44 and
was not — the one machine-readable output consumers build against hardest,
undocumented. It is there now, with the spend-guard document beside it and a
two-direction parity test over both.

**`RELEASES.md` no longer states a published version nothing checks.** Its
header claimed 1.28.0 was on npm while the manifests moved through 1.45.0 —
seventeen releases of a stranger being told the wrong thing about what
`npm install` gives them. `publish.test.js` now asserts that number equals the
version the manifests publish, which is checkable because the merge that bumps
the manifests is the merge that pushes the tag `release.yml` publishes on.
Proven by planting 1.28.0 back and confirming the failure names both numbers.

## 1.44.0 — "The answer in milliseconds"

### Added

**`trazum serve`: the answer in milliseconds.** Everything this tool knows sat
behind a process launch, a config walk and a log parse — fine for a report and
useless for a decision being made right now, because by the time the report
exists the call has been paid for. A local endpoint now answers the two
questions that matter at call time: what will this cost, and is there budget
left. Fourth of the ten in docs/plan-1.41-1.50.md.

**This is where the temptation to merge halves is strongest, and the shape
refuses to.** The budget consumed is `measured` — the provider billed it. The
cost of the described call is `estimated` — nobody has sent it. The composed
figure exists, because callers need it, and never travels without both halves
beside it. `restsOn` says whether the verdict needed the estimate at all:
`measured` when the budget is already past its limit, `measured+estimated`
when it takes this call to cross. A caller reading only the verdict still
cannot mistake one for the other.

**Three outcomes, and the reasons kept apart.** `within`, `over`,
`cannot-tell` — and the three ways of not being able to tell are distinct
because their fixes are: no budget configured, nothing measured, or a model
the catalogue cannot price. Answering "within" for an unpriced model would
answer whether *current* spend fits, which is not what was asked.

**It degrades rather than failing.** With no store and no budget it still
prices the call and says the budget half is unknown. Offline is a mode, not a
failure. The measured position is read once at start — a file read in the hot
path cannot promise milliseconds — so every answer carries the window that
figure covers rather than implying it is current to the second.

### Security

**The first time Trazum listens, and the surface is kept small enough not to
need an auth story.** It binds `127.0.0.1`, compiled in, with no flag,
environment variable or config key able to change it: this holds a company's
spend, its model mix and its budgets and answers whoever asks.
`checkedEndpoint` has guarded outbound requests since 1.14 on the principle
that a caller *selects* an endpoint rather than naming one, and this is the
inbound counterpart. There is no auth for the same reason there is no `--host`
— a token checked over loopback is theatre, since whoever can reach the socket
can read it out of the process holding it. Bodies over 1 MB are refused
unread, and every path but `/health` and `/cost` is a 404. Three guards fail
the build over it, each proven with a planted probe.

### Fixed

**The README command-count guard had been blind since "sixteen".** Its word
list stopped there, and an unknown number word is skipped rather than failed —
so the claim went unchecked for five releases, exactly while it was changing
every time. Extended past thirty, hyphenated forms included, and proven
against a wrong count. A guard that quietly stops guarding is worse than no
guard, because it still reads like one.

## 1.43.0 — "The watch"

### Added

**`trazum watch`: the afternoon it happened, said that afternoon.** Every gate
in this product fired when a human ran a command, and the failures worth
catching — a retry loop, a prompt that grew, a model swapped in a deploy —
happen at 3pm on a Tuesday. Third of the ten in docs/plan-1.41-1.50.md.

**One cycle is the primitive.** `--once` measures, keeps, evaluates, emits and
remembers; `--interval 15m` is that cycle in a timer. One code path, so a cron
entry, a foreground watcher and every test all exercise the same thing. The
interval has a five-minute floor: usage APIs are rate limited, and a tight
loop is a way for a tool that exists to save money to get somebody's key
throttled.

**An alert fires on a measured crossing, never on a projection.** Each
crossing carries `provenance: 'measured'` as a field even though it can hold
one value today — so a later change cannot smuggle an estimate past a
consumer by leaving the question unasked. "You have spent $412 of a $400
budget" is a fact; "you will exceed" is a forecast, refused at every window
length since 1.27.

**A day still being measured is not judged, and not passed either.** At noon,
a threshold over that day is a threshold over half a day, so it is reported as
not-yet-judgeable with how much is covered. **A day already over budget fires
whatever the hour**, because it does not become less over budget at midnight —
the coverage floor suppresses an unripe verdict, never a real crossing. The
floor sits below perfection because a usage API's last bucket lags minutes
behind, and a gate that waits for a whole day never judges anything.

**A restart is not amnesia, and quiet is not clean.** A crossing already
reported does not alert twice — and is not called fine either: it comes back
as `suppressed`, prints as STILL OVER, and the run still exits 1. The stretch
between cycles that nobody watched is named once, because a watcher that
resumes in silence implies coverage it did not have.

**Three transports, all boring.** A non-zero exit code so cron mails it, a
JSON event on stdout for any pipeline, and `--webhook` for wherever the alerts
already go. A receiver that is down is reported and swallowed: the crossing
already went out through the other two, and losing them because a receiver
fell over would make the quietest failure the loudest one.

New core module `watch.ts` (`evaluateWatch`, `firedKey`), browser-safe: the
pulling, the storing, the sleeping and the sending live in the CLI.

### Security

**The alert webhook is a new outbound surface, and three guards fail the build
over it.** A URL carrying credentials is refused, because URLs end up in logs,
shell history and error messages. Plain http is refused off loopback, because
an alert carries spend figures across a network — loopback is allowed, since
pointing a watcher at your own alerting daemon is the ordinary case rather
than the attack, and this is deliberately *not* the SSRF case
`checkedEndpoint` guards: the URL is in the operator's own config, not an
anonymous request body. The payload's shape is pinned to figures and gate
names, and the delivery path may not throw. Each guard was proven with a
planted probe before being trusted.

### Changed

**`spend.maxCacheLossUsd` is now a config key**, not only a flag. It has gated
since 1.21 and only from an invocation, which made it a policy `watch` could
not read — and a policy that lives in one command line is a policy nothing
else can act on.

## 1.42.0 — "The store"

### Added

**The store: a year of measured spend on disk, and not one prompt inside it.**
A connector that re-downloads a month every time it runs is a connector nobody
leaves on, and `history` needed a directory somebody curated by hand.
`connect --store` keeps what it pulled, under `.trazum/store`. Second of the
ten in docs/plan-1.41-1.50.md.

**Convergence, not accumulation.** A record's identity is its provider,
window, model and grouping. Re-pulling an overlapping window is the same fact
restated, so the later pull wins — a window pulled again is at worst as
complete as it was. Overlapping pulls are therefore idempotent, which is what
lets a scheduled job run hourly over a rolling day without inventing money.

**Deduplication that cannot lie.** Two records the store cannot tell apart — a
window of no length, a record naming no model — are kept as *two* and reported
as possibly-double, never merged on a guess: quietly smaller is the flattering
direction. A line that will not parse costs that line and is named with its
file and number, never the month around it. A record from a newer schema is
kept and counted rather than guessed at.

**What it holds, and what it never holds.** Token counts, billed dollars and
the account's own workspace and key identifiers — never prompt text, never
completion text, never a credential. A store a team can back up without a
privacy review is the only kind worth having, and the inventory says so on
every run rather than leaving somebody to guess about their own file.

**Append-only, with compaction as an explicit errand.** A pull appends one
block per month file and rewrites nothing: a crash loses the tail of a block
rather than a year, and two runs interleave whole blocks rather than
half-lines. Convergence resolves at read time. Only `store --prune` rewrites,
because collapsing a log is the one operation that destroys something and it
must never happen as a side effect of a pull.

**Pruning refuses a policy nobody wrote down.** With neither `store.keepDays`
in the config nor `--keep`, it refuses and names both — deleting measurements
on a guessed policy is not a default anybody should get by accident. What went
is reported with the span it covered and the dollars it held, and `--dry-run`
says all of that before anything goes. A bucket that *ends* inside the
retained period is kept whole, because half a bucket measures nothing.

**`trazum history --store`** builds the series straight from what is kept.
Bucketed sources carry no label — a usage API groups by model and workspace,
never by workload — so the label series is **absent and said to be**, rather
than empty and misread as "no workload moved". Reading stored `--json` report
files keeps working unchanged.

New core module `store.ts` (`resolveStore`, `recordsFromBuckets`,
`bucketsFromRecords`, `storeInventory`, `pruneRecords`), browser-safe: the
filesystem half lives in the CLI. New config block `store.keepDays`, with no
default on purpose.

### Fixed

**An empty store no longer hides what it could not resolve.** Records it
cannot tell apart, unparseable lines and records from a newer schema are real
measurements on disk; reporting "the store is empty" over them would hide
exactly what the reader needs to see.

**A call count that does not exist is no longer printed as zero in a series.**
`history` periods carry `calls: null` from a source that serves no request
count, and the row omits the count instead of claiming no traffic.

## 1.41.0 — "The connector"

### Added

**`trazum connect <provider>`: your bill, read from the provider.** Every
command in this product reads a file somebody produced by hand, and the export
step is where adoption dies — the person who would benefit most from a cost
report is the person least likely to have a `usage.jsonl` lying around. This
reads the bill straight from Anthropic's and OpenAI's usage APIs. First of the
ten in docs/plan-1.41-1.50.md.

**The credential is borrowed, never held.** Keys are read from the environment
at the moment of the call (`TRAZUM_ANTHROPIC_ADMIN_KEY`,
`TRAZUM_OPENAI_ADMIN_KEY`, with the provider's own variable as a fallback) and
never written to a config, a cache, a report or an error message. Redaction
runs over everything that can reach a terminal — including credential material
quoted back inside somebody else's error body, because a leak through their
message is still a leak through Trazum's output. Each connector documents the
narrowest key that works: a usage report needs read access and nothing that
could spend money. The endpoint is compiled in rather than accepted from a
flag, the same posture the LLM layer has taken since 1.14.

**A connected report is a restricted report, and says so.** Usage APIs serve
sums over a window, not one row per call. The totals, the model split, the day
series and the cache verdict all work; the per-call findings — input shapes,
truncation retries, repeated turns, session costs, context pressure, doubled
rows — are listed as unavailable with why and what would unlock them. It
carries its own document shape rather than a `UsageProfileReport` with holes
in it, so no per-call finding can ever read a zero this code wrote: not
recorded is not not-happened, enforced by the type system.

**The asymmetry between providers is kept, not papered over.** OpenAI's usage
endpoint serves a request count and Anthropic's does not, so one connected
report carries per-call averages and the other says why it carries none —
`calls` is `null`, never `0`. OpenAI reports cached tokens inside the input
total, so the uncached half is the subtraction: billing both at face value
would charge the same tokens twice, once at the dearer rate.

**A partial pull is a partial pull, out loud.** A rate limit, a page cap, an
expired cursor, an unreadable entry or a bucket with no readable window all
return what arrived with the gap named — never a total that quietly describes
less traffic than the caller asked about. `--dry-run` prints exactly what
would be called and which variable the key would come from, sending nothing
and needing no credential; `--payload <file>` prices a response you already
have, with no credential and no network.

**Four guards fail the build rather than promising any of this.** No
real-shaped provider key material may be committed anywhere in the repository
— shaped against what a real key looks like, so an obviously fake fixture in a
test stays legal and a leaked key does not. The module that holds a key may
not call `console` or write a file at all. Every provider response body that
reaches an error must pass through `redact` on the way. And the connector
endpoints must stay compiled in, with no flag naming a URL — the SSRF posture
`checkedEndpoint` has enforced for the LLM layer since 1.14.

New core module `connector.ts` (`CONNECTORS`, `normalizeAnthropicUsage`,
`normalizeOpenAIUsage`, `bucketedProfile`, `bucketedCacheEconomics`),
browser-safe: the fetch, the credentials and the pagination live in the CLI,
the same split `openrouterOverlay` has had since 1.13. The connected document
is contracted in docs/json-output.md.

### Changed

**`--since`/`--until` parsing is shared.** The window parser was local to
`profile`; `connect` needs the same grammar, and two parsers for one flag pair
is one too many.

### Documentation

**The plan through 1.50.** `docs/plan-1.41-1.50.md` sets out the next arc —
ten releases, one thesis. Through 1.40 the loop became complete and stayed
inert: every command waits for a human to type something, so nobody runs it
on the afternoon a retry loop burned a quarter of the month, and the agent
spending the money has no way to ask what it costs or whether there is
budget left. The arc turns Trazum from a tool you run into something that
runs — connector, store, watch, a local answer in milliseconds, an agent's
spend guard, five-minute onboarding, the bill in the browser, cost review in
CI, one live measured budget every surface reads, and finally the
interchange format and stability guarantees other tools can build on.

Four rules are added to the doctrine for the new territory, because acting
on a schedule, over a network, holding credentials, and answering a machine
each bring a new way to lie: the deterministic core stays free and offline;
a credential is borrowed, never held; nothing continuous invents a number;
and a machine reader gets the provenance too, as separate typed fields.
ROADMAP's "Next" now points at the new arc.

**The plan through 1.60.** `docs/plan-1.51-1.60.md` sets out the arc after
it, because the one through 1.50 leaves the product's oldest gap untouched:
every figure Trazum prints is a denominator with no numerator. It can say a
workload got 40% cheaper and cannot say whether it stopped working, which is
why "route this to a cheaper model" has been an arithmetic claim with a
quality question attached since 1.23.

Two things close it, and the arc opens with both: a gateway in the path of
the call — which refuses, and never silently answers something else — and an
outcome signal the caller records and Trazum never infers. On top of those:
cost per resolved outcome through every existing report, the escalation
ladder priced with its double spend and its break-even rate, experiments on
real traffic with a three-valued verdict and a declared stopping rule,
quality gates in CI, chargeback with the unallocated named rather than
spread, committed-use analysis stated as an as-if over measured months
rather than a forecast, and finally the semantic findings the rules engine
has deferred since 0.1.0 — now checkable, and still verified before anybody
sees them.

Two rules join the doctrine: a proxy refuses and never answers something
else, and quality is recorded, never inferred.

## 1.40.0 — "The long run"

### Added

**`trazum history <dir>`: the long run.** Every comparison in Trazum is
between two logs, and a product's cost problem is rarely visible in two — it
is visible in twenty. `history` reads a directory of *stored reports* (the
`--json` documents `profile` already writes) plus any saved plans beside
them, and builds the series no pairwise comparison can see: a workload that
climbed a little every period, a model share rising since a named report
while the totals look flat, a cache share decaying slowly enough that no
single week's report called it a finding — and the same action planned again
and again with nobody executing it, dated.

**Still no forecasts.** Shapes are named as consecutive movement — at least
three consecutive rises or falls, since a named report, with the first and
last values — never a line fitted through the points, and never a word about
next month. The same refusal `modelMixDrift` has carried since 1.27, now at
series length.

**Derived from stored reports, never re-parsed logs**, so a year of JSON
output is enough and the raw logs can be thrown away — which is what the
privacy story requires anyway. Reports with no span are on no timeline and
say so; JSON files that are neither a report nor a plan are named, never
absorbed; fewer than three dated reports is a refusal naming
`profile --against` as the right tool for a pair. The history document is
contracted in docs/json-output.md.

New core module `history.ts` (`buildHistory`, `storedReportFrom`, `MIN_RUN`),
browser-safe: documents in, series out.

## 1.39.0 — "Did it work?"

### Added

**`trazum verify <plan.json> --against <newer.jsonl>`: did it work?** Every
optimisation tool says what you *would* save; almost none says what you
*did*. This holds a saved plan to the log that came after it, with **three
outcomes and never two**: the change arrived, it did not arrive, or it
cannot be told — because the workload vanished, the fields the detection
needs stopped being recorded, or tokens cannot say which tier billed them
(the Batch API is invisible in token counts, and the verification says so
instead of assuming it happened). The third outcome is the honest one and
the one every other tool renders as the first.

Differences are attributed, not just stated: every plan action now records
its baseline (calls, dollars, tokens per call at plan time), and the
verification prints the world's movement beside each verdict — calls 3 → 6,
output/call 1,000 → 1,200 — so "the prediction was wrong" can be told from
"the traffic doubled". A plan priced under one catalogue and verified under
another is flagged (`pricesChanged`): the tool must not blame a team for a
saving that arithmetic revoked.

`--gate` makes promises checkable in CI: exit 1 when an action did not
produce what the plan promised, or became unverifiable because the team's
own log dropped the fields the detection needs — "not recorded" must not
read as "fixed". A workload that merely vanished fails nothing. `--json`
emits the verification document (contracted in docs/json-output.md);
`--markdown-out` writes the verdicts for a CI summary.

New core module `verify.ts` (`verifyPlan`, typed outcomes and reasons),
browser-safe: two documents in, one verdict out.

## 1.38.0 — "The plan"

### Added

**`trazum plan <log>`: not a list of findings, a ranked plan.** The report
names findings; a person then decides what to do first by adding savings in
their head — and savings on the same slice do not add ($12.60 plus $10.50
against a $21.00 slice, the arithmetic the levers module has documented as
wrong since it shipped). `plan` does the composition once, correctly: route
and batch on one slice arrive as a single pre-combined action, never a sum,
so the plan's total is additive by construction.

Projected savings and money already spent are separate columns everywhere:
the truncation action's stake is the measured retry bill, the cache action's
stake is the cache module's own delta (and it exists only for a settled loss
— an unsettled verdict is a missing field, and "add the field" is the
report's advice, not a plan's). Every action carries what the log cannot
confirm — typed assumptions, localized at render time, matchable
structurally by a later verification — and the command that can check one
when it exists.

`-o plan.json` saves the plan dated, with the catalogue that priced it on
record, so a later log can be held to it and "the prediction was wrong" can
be told from "the prices changed". `--min-usd` names how many actions it
dropped and their combined worth, and the saved document's totals cover
exactly the actions it holds — the file never contradicts itself.
`--markdown-out` and `--json` as everywhere else; the document is in
docs/json-output.md.

New core module `plan.ts` (`buildPlan`, `planLabelName`, typed
`PlanAssumption`), browser-safe: everything is derived from figures the
report and levers already computed.

## 1.37.0 — "The fleet"

### Added

**`profile --by-source`: the fleet.** One service's logs merge into one
honest bill; twelve services' logs merge into a bill that hides which one is
bleeding. The config's new `sources` block names services as glob patterns
over log paths; `--by-source` walks the directory recursively, assigns each
file to the most specific matching pattern (the budget patterns' own
precedence rule), and renders one summary per service plus a rollup that
names the source where the money is.

The findings are the ones a merged bill cannot make: the same workload
running on different models in different sources (judged on each source's
dearest model for the label, so one stray experiment call is not reported as
a migration); caching that pays for the fleet in aggregate while losing money
in a named source (reported only when the aggregate pays — when the aggregate
itself loses, the whole-fleet report already shouts, and repeating it per
source would be the same alarm in pieces); and sources whose logs cover
different periods flagged in the copy, because the shares compare totals and
a 3-day log looking cheap beside a 30-day one has nothing to do with cost.

`spend.bySource` gates each service against its own budget in the same run,
failing with the service named — the fleet total can be fine while one
service bleeds. A budgeted source with no logs is named, not passed: a
service that did not appear is not a service under budget. Files matching no
source pattern are named loudly — a log in no report is spend missing from
every bill. `--json` emits the fleet document: full per-source reports plus
the rollup, documented in docs/json-output.md.

New core module `fleet.ts` (`assignSources`, `fleetRollup`), browser-safe —
it reads no files; the CLI keeps its monopoly on I/O.

## 1.36.0 — "The estimate stops guessing"

### Added

**`optimize --from-log`: the multiplication stops guessing.** Every saving
`optimize` prints is `token delta × usage`, and until now every part of the
usage half was typed by a human — the real call count, output size, cache
share and model were all guesses with defaults. `--from-log <usage.jsonl>`
measures all four from the log, and the rendering names which figures are
measured, because "measured × estimated" and "estimated × guessed" are
different claims about the same dollar sign.

The refusals are the design: typed flags (`--calls`, `--output-tokens`,
`--cache-hit-rate`, `--model`) are refused beside it — measuring and typing
the same figure is a contradiction, not a preference order. Scaling to a
month requires a full week of data, because three weekdays scaled up is a
Tuesday with a multiplier; under the floor the figures cover exactly the
period measured and nothing says "month". A label with no priced traffic is
an error naming the labels that have some, never a $0 saving that reads as
"worthless" instead of "unmeasured". The label resolves from `--label` or
from the config's `labels` map read in reverse, with ambiguity refused by
name. And `--from-log` implies `--cost`: a log with billed counts is proof of
a metered API, whatever the terminal bills like.

Multi-model labels say which model the figures use and its share of spend;
slices that never recorded output say their output half is $0 measured, not
$0 assumed. New core module `measured-profile.ts` with `measuredUsage()` and
`labelCoverage()`, both exported.

**`optimize --all-labels`: which prompt to edit first.** Every prompt in the
config's `labels` map, optimised and priced against its own measured traffic,
ranked by what the change is worth — ranked by traffic and not by prompt
length, because a big prompt on a dead workload is worth less than a small one
on a busy one. Requires `--from-log`: ranking savings that were all multiplied
by the same typed guess ranks prompts by length and calls it a priority. Both
coverage mismatches are named at the end: a label carrying measured spend with
no prompt mapped (the workload nobody can optimise because nobody said where
it lives), and a mapped prompt whose label has no traffic (retired, renamed,
or a typo silently doing nothing). A mapped file that cannot be read is named
too — the mapping exists; the file does not.

## 1.35.0 — "The reader who is not in the terminal"

### Added

**`--markdown-summary`: the short form, for a reader who is not in the
terminal.** The person who owns the budget usually does not run the CLI, and
handing them the whole report is handing them a document to skim — where the
one figure that changed is as easy to miss as it was in the terminal. The
summary states the gate verdict, the bill, what changed against a previous
log with its largest driver, and the single lever worth the most. Then it
stops: twelve lines against ninety.

It is a **view over the same report, never a different set of figures** — a
reader who opens both cannot find them disagreeing — and it is returned
before the full rendering rather than filtered out of it, so a section added
later cannot leak into the short form by forgetting to opt out. With no
previous log it says so rather than implying a stability nobody measured.

**The privacy promise covers both files.** The sentence above the drop zone
said "the log", singular, on a page that has accepted two since the
comparison shipped. The second one was always read in the tab like the first;
now the promise says so where somebody about to open it will read it.

## 1.34.0 — "Findings as policy"

### Added

**`waive` in `trazum.config.json`: a finding decided about, on the record.**
Trazum finds the same thing every run, and a team that has looked at a
failure and chosen to live with it had no way to say so — so the finding
shouted forever and the report lost authority. A waiver names a gate, a
reason in prose, and an expiry date. All three are required: a waiver with no
end date is a finding deleted with extra steps, and a reasonless one is a
silence nobody can audit.

**Waived is shown as waived, never hidden.** The failure still prints in full,
the bill still counts it, and the waiver prints beneath it with the reason and
the days remaining. Only the exit code goes quiet.

**An expired waiver fails the gate it silenced**, naming the date it expired
and the reason somebody wrote — that expiry is the entire mechanism by which a
waiver stays a decision rather than becoming a habit.

Waivable: `maxUsd`, `maxDayUsd`, `maxSessionUsd`, `maxCacheLossUsd`,
`maxGrowthUsd`, and `byLabel:<label>` for one label's budget. Deliberately
**not** waivable: the growth gate's coverage refusal. That failure says the
comparison cannot be made, and a waiver on unmeasurability would be a
decision to stop measuring rather than a budget decision with an end date.

## 1.33.0 — "The log it could not read yet"

### Added

**Gemini's log shape, recognised.** `usageMetadata` appears in no other
provider's response, which is what makes reading it honest — no guessing
which provider a field belongs to. `promptTokenCount`, `candidatesTokenCount`
and `cachedContentTokenCount` are read, with the cached half subtracted from
the prompt count through the same mechanism as OpenAI's `cached_tokens`,
because Gemini sets the same double-charge trap. `finishReason: "MAX_TOKENS"`
joins the truncation contract's three-way reading. The bundled catalogue has
priced `gemini-2.5-pro` and `gemini-2.5-flash` since the seven-provider work —
what was missing was reading the log their SDK actually writes, and a Gemini
model the catalogue does not know still parses and lands in `unpricedModels`
as everywhere.

**`--dry-run`: what the log could answer, before you wire it in.** The
question somebody has before putting Trazum in CI is not "what did we spend"
but "will this log support the gates I want" — and answering it with a full
report makes them read a bill to discover a field is missing. `trazum profile
<log> --dry-run` states readiness per capability (totals, per-workload,
clock, sessions, stop reasons, the cache split), names unpriced models, and
produces no dollar figure at all, so nothing in it can be mistaken for spend.
It refuses to run beside a gate — a gate over a report that was never
produced would exit green having judged nothing — distinguishes "nothing
wrote to the cache" from a missing split, and exits non-zero when nothing
parses, because an unreadable log is not a ready one.

## 1.32.0 — "The routing decision, priced whole"

### Added

**`--what-if` corrects the figure the target would refuse to bill.** A cache
entry only forms above a model's minimum prompt size, and a slice whose
largest call sits under the target's minimum could not create one — so the
standard repriced figure grants cache traffic discounted rates the target
would never concede, an error in exactly the flattering direction. Each
affected slice now carries the correction in place, on every surface and in
the JSON (`cacheBeyondTarget`: the target's minimum and the no-cache price —
the figure the target would actually bill). Silent when the calls clear the
minimum, when there was no cache traffic, or when the target's minimum is
unknown: nothing is claimed against a threshold nobody stated.

The web bill renders the same correction beside the same row, at the same
threshold — surface parity, as everywhere.

**The move, batched — the decision's other half.** `--what-if` now states
what the moved bill becomes with the target's Batch API on top, discounted on
the *target's* rates and never summed with the move (the same rule the levers
learned when two added savings exceeded the slice they came from). Over-context
money stays out of the batched figure exactly as it stays out of the moved
one. Hedged the only honest way: whether these calls can wait for a batch
window is not in the log, and every surface says so. In the JSON as
`whatIf.batchOnTarget`, null when the target sells no batch discount — a
different statement from a $0 saving.

## 1.31.0 — "The gate that explains itself"

### Added

**A failing gate says what to change.** A gate printed a verdict and an exit
code, and the person reading it is in CI — the one place nobody opens the
full report. Every failure now carries the slice holding the money, its share
of the bill, and the largest lever the report already priced, with whether
that lever covers the overage stated rather than left to be inferred. It
points and does not recommend: whether the cheaper model can do the work, and
whether those calls can wait for a batch window, is the reader's to judge, and
the copy says so on every surface.

Written once and called by all four spend gates, because four hand-rolled
copies of the same three sentences is four chances for one of them to soften.
The day gate skips the contributor line it already prints for itself.

**`--max-usd` says how much room a pass had, when it was tight.** A pass 2%
under budget and a pass 60% under are different states of the world and only
one of them is quiet news. Said under a tenth of the budget, with the
threshold in the sentence, on the whole-bill, per-day and per-conversation
gates alike.

**The verdict reaches the CI summary.** The gates spoke on stderr and stopped
there, so a run summary carried the whole report and not the one sentence
explaining why the build was red — the reader had to open the raw log to find
it. `--markdown-out` now leads with the verdict: a failure quoted and bold so
it survives being skimmed, its explanation beneath it unmarked, a pass stated
plainly without shouting. Collected by wrapping the gates' own stderr rather
than by a list each gate must remember to join, so a gate added later reaches
the summary automatically.

## 1.30.0 — "The report as a diff"

### Added

**Coverage drift in `--against`: what the comparison stopped being able to
see.** The drivers name the dollars that moved; nothing named the findings
that stopped being measurable. A log where `session` was on 98% of calls and
is now on 4% has not fixed its conversation growth — it stopped recording the
field that would show it, and every session-shaped finding went quiet for a
reason that has nothing to do with the bill. A fixed finding and a blinded log
are opposite facts that the dollars render identically; only coverage tells
them apart, so the comparison now states any field whose share moved by 20
points or more, in either direction, loud on a collapse and quiet on a gain.

**The findings a collapsed field took with it, named.** "Some findings are
silent" is not something a reader can act on; knowing that conversation
growth, per-conversation cost, repeated turns, truncation retries and the
cache-TTL fit are now silence rather than absence tells them exactly which
sections of the report to distrust. One list per field, on all three surfaces.

**The comparison gate refuses a comparison it cannot make.** `--max-growth-usd`
now fails when the current log stopped recording a field the previous one
carried, before it judges the dollars at all. The bill can hold perfectly flat
while the log went blind, and a gate passing there would be certifying a
comparison nobody could check — the same refusal `--max-day-usd` makes on a
clockless log and `--max-session-usd` on a sessionless one. A field that
*appeared* never refuses: seeing more is not a reason to stop.

**Coverage drift on every surface.** The MCP's `profile_usage` and the web
bill render the same finding at the same 20-point threshold, so an agent
relaying "spend flat, all clear" cannot do so off a log that stopped
measuring.

## 1.29.0 — "The budget, the overlay and the small log"

### Added

**`pricing_overlay` on the MCP's `profile_usage`: the CLI's price table,
as text.** The MCP report could name an unpriced model and then point at
the CLI to price it — a dead end for the agent already holding the answer
in its context. The new argument takes the same JSON document a
`--pricing` overlay file holds, passed as text because this server takes
no paths (that absence is the security design, and it stays). Models the
overlay adds or overrides price the whole report — `what_if` included —
and the report says the overlay is in effect, with the overlay's own
`lastReviewed` date, so its dollars are never mistaken for the bundled
table's. A malformed overlay is refused with the parser's own reason,
never a report quietly priced as if nothing had been asked.

**The figure that survives a small log.** `sessionCosts` refuses slices
under five conversations, and rightly — a percentile over four is the
largest of four wearing a percentile's name. But a log of three
conversations still has a most expensive one, and a maximum is a fact at
any count. When the percentiles refused and the log still carries
sessions, the CLI, the MCP report and the web bill now state the count
and the single worst cost — the same figure `--max-session-usd` judges —
and stand the line down the moment the percentiles can speak.

**`--max-session-usd`: the unit an agent product blows up in.** A month's
budget and a day's budget both pass while one conversation loops its way
through $400. The new gate judges the single most expensive conversation in
the log — a fact at any session count, which is why the report gained
`sessionSpend` (`sessions` and `maxUsd`, no minimum) alongside the
percentile-gated `sessionCosts`. Arms from the flag or from
`spend.maxSessionUsd` in `trazum.config.json`, flag winning.

The refusals: a log with **no sessions fails** rather than passes — "not
measured" is not "under budget" — and a conversation that started before
the log is counted only for its recorded turns, so a pass is a floor and
the pass message says so. The session key never appears in any output,
including the failure, and a test pins it.

## 1.28.0 — "The retry bill, the series and the standing word"

### Added

**`spend.maxDayUsd`: the day budget as repository policy.** `--max-day-usd`
existed as a flag, which makes it one CI invocation's opinion; the config is
the repository's standing word. The flag still wins when both are present,
like every gate here, and the config path inherits the flag's refusal: a log
with no timestamps fails the day budget rather than passing it, because "not
measured" is not "under budget".

**`--csv-shape model-day`: the drift, day by day.** `modelMixDrift` states
two halves; a chart wants the whole series. The new shape writes one row per
UTC day *and model* — `day,model,usd,calls`, the long format a pivot table
or a plotting library takes as-is — and `spendByDay` in `--json` now carries
the same per-model split on every day. Model ids are formula-defused like
every other untrusted cell, no total row as in every shape, and the
unpriced stay out because their dollars were never computed.

**`truncationRetries`: the "billed again" half, measured.** The truncation
finding has always said cut-off answers are *frequently retried, billed
again* — and that second half was an assertion, because nothing counted the
retries. Now it is a measurement: a truncated answer followed within two
minutes by another call in the same conversation is the shape a retry has,
and both sides of the pair are in the log. The wasted attempt's full price
and the follow-up's travel together, with the checkable denominator —
"2 of 3 truncated answers" and "2 of 2" are different sentences, and the
reader gets the right one.

Attributed to the **truncated call's slice**, because that is where the
`max_tokens` ceiling that caused the pair lives and where the fix is
applied. Compared only against the immediately previous call in the session
(the bounded-memory design `repeatedTurns` uses); a single pair is not
reported — one retry is an anecdote; and the hedge is in every rendering:
the log cannot see content, so whether each pair was a retry is the
reader's to know. Needs a session, a clock and a stop reason.

In the terminal (inside the truncation section, next to the ceiling the
answers actually needed), in `--json`, in the CI summary and in the MCP
`profile_usage` tool.

## 1.27.0 — "The ceiling, the drift and the tab in step"

### Added

**The Bill tab catches up, four findings at once.** The browser lacked the
CLI's newest sections: the doubled-bill warning (`duplicateLines`, placed
above the totals it would inflate), the same request sent again
(`repeatedTurns`), the ceiling in sight (`contextPressure`) and the moving
mix (`modelMixDrift`). All four render in the tab now, computed in the page
like everything else there, with the CLI's own thresholds — 85% loud on
pressure, fifteen points on drift — because two surfaces summarising one log
differently is a second opinion nobody asked for. Verified by driving the
built page in Chromium with a log that triggers all four at once, zero
network requests recorded.

**`modelMixDrift`: the migration a total cannot show.** A bill can grow with
no workload growing — traffic quietly moving from the cheap model to the
expensive one, a deploy that flipped a default, a fallback that became the
main path. Day totals cannot show it (both models land in the same number)
and per-model totals cannot either (a total has no direction). The log's days
are split chronologically in half and each model's **share of the priced
spend** in each half is stated, exactly.

`null` — not empty — under four dated days: one day against one day is
weather presented as climate. The renderings speak only past fifteen points
of movement (a presentation threshold, stated in the copy), while `--json`
carries every model's exact shares either way — the data states, the
rendering judges. And never a forecast: where the mix goes next is not in the
log, so it is not said.

In the terminal, `--json`, the CI summary and the MCP `profile_usage` tool.

**`contextPressure`: the ceiling, seen coming.** Input grows turn by turn or
document by document, costs nothing extra to grow, and then one call crosses
the model's context window and the API refuses it outright — the bill looks
fine right up to the day the product breaks. The distance is knowable from
what the log already carries: each slice's largest call (input, cache reads
and writes) against its own model's window, reported from half the window up,
loud from 85%.

What it refuses: **no prediction of when**. A straight line through two
points is a guess wearing arithmetic's clothes; the share is a fact and the
trajectory is the reader's to know. The maximum rather than a percentile,
for `reprice`'s reason — one call over the window is one failed call, and an
average hides exactly the call that matters. Unpriced models are absent: a
model with no catalogue entry has no window to compare against, and
inventing one would turn a missing fact into a false comfort.

In the terminal, in `--json` as `contextPressure` (computed once in the CLI
and passed to every rendering, because the denominator lives in the possibly
overlaid catalogue), in the CI summary, and in the MCP `profile_usage` tool.

Also: the README's action pins advanced to the 1.26.0 commit.

## 1.26.0 — "The release that releases itself"

### Changed

**Merging the release PR is now the release.** The workflow gained a `decide`
job: every push to main runs a seconds-long registry preflight, and the one
push whose manifests name an unpublished version — a merged release PR — goes
on to verify, publish all three packages, create the `v<version>` tag on the
merge commit, and publish the GitHub release from `RELEASES.md`. Ordinary
merges skip in seconds; a pushed tag remains the manual override;
`workflow_dispatch` stays dry-run only. One release at a time, enforced by a
non-cancelling concurrency group — cancelling a publish mid-flight is how a
half-released set of packages happens.

**The publish can no longer fail on npm's broken trusted publishing.** The
publish steps accept an environment-scoped `secrets.NPM_TOKEN` as the
authentication fallback: absent, OIDC is the auth exactly as before; present,
the token authenticates and the release goes out either way. Provenance
survives both paths — the attestation is signed with the job's OIDC identity,
which is independent of how the upload authenticates. The `security.test.js`
rule narrowed rather than vanished: only `release.yml` may reference the
secret, only as `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, and npm token
*material* committed anywhere still fails the build. The old absolute rule
had forced four releases onto a laptop, which protects the secret by moving
the publish to the least auditable place available.

**The documentation sweep is enforced, not remembered.** `publish.test.js`
now requires the manifest version to appear as a heading in `CHANGELOG.md`
and by name in `ROADMAP.md` — `RELEASES.md` was already enforced — so a
release prep that skips the docs fails `verify` before it can merge. The
release checklist in `docs/releasing.md` adds the grep sweep for the stale
references no test can know about.

**The documentation caught up with the registry.** 1.25.0 is on npm — published
by hand from a clean clone of the tag after npm's trusted publishing rejected
the workflow's OIDC token on four real attempts against `v1.11.0`, with every
GitHub-side claim verified correct. The docs now say so instead of describing
the state of a week ago:

- `RELEASES.md` header: all three packages at 1.25.0; 1.11.0–1.24.0 named as
  real releases the registry never saw; no provenance on 1.25.0, and why.
- `docs/releasing.md`: the trusted-publisher section downgraded from "reported
  done" to **still not working**, with the v1.11.0 evidence that the mismatch
  lives on npm's side; a *Releasing by hand* procedure added — the one 1.25.0
  actually used — including publishing **before** pushing the tag, so the
  workflow's preflight skips the uploads and still creates the GitHub release.
- `README.md`: the three action pins advanced from the 1.10.0 commit to the
  1.25.0 one, labels verified against the pinned commit by `security.test.js`.
- `ROADMAP.md`: the Released section no longer stops at 1.9.0 — the
  1.10.0→1.25.0 arc is recorded, with the registry gap stated.
- `packages/cli/README.md`, `packages/mcp/README.md` and the Claude skill:
  `profile`'s rows now name the surface that exists — directories and `.gz`,
  `--what-if`, the drill-downs, the four money gates, the three output formats.

## 1.25.0 — "The retry, the archive and the shape in the tab"

### Added

**Rotated logs are read as they are: `.gz` included.** `logrotate`, Docker's
json-file driver and every cloud log export compress yesterday's file, so a
directory of a month's logs is one plain file and twenty-nine gzipped ones.
Directory mode read the plain one and said nothing about the rest — a month's
bill reported from a day of it, in the flattering direction, which is exactly
the failure directory mode was added to prevent. `.jsonl.gz`, `.ndjson.gz`,
`.log.gz` and `.json.gz` are now read in the same pass, and `--against`
accepts them too.

Decided by **extension, not by sniffing the first two bytes**: a `.jsonl`
whose contents happen to start with `0x1f8b` is far more likely a corrupt log
than a mislabelled archive, and silently treating it as one would turn a
diagnosable error into an empty report. A `.gz` that will not decompress is an
error naming the file, never a skip.

**`repeatedTurns`: the same request, sent again.** A conversation's input
grows with every turn — that is the whole point of `conversations`. So two
consecutive calls in one conversation carrying *exactly* the same input size,
seconds apart, is the shape of something going wrong rather than something
working: a retry after a timeout, an agent step repeating because a tool call
failed, a loop that re-sends the whole context and gets nowhere. The retried
call is billed in full, and on an agent workload the input is the bill.

`duplicateLines` catches the same line recorded twice; this catches two
*different* calls that sent the same thing.

Each call is compared only to **the one immediately before it in the same
session**, inside a one-minute window, and only when the log carries both a
session and a clock. Not to every earlier call: a workload legitimately
sending a fixed-size prompt would light up under a looser rule, and holding
every size a session ever sent would grow without bound. A negative gap is
skipped rather than counted — a log out of time order is not a repeated call.

It cannot see content, so it cannot tell a retry from two genuinely identical
requests a second apart. Every rendering says the pattern is *usually* a retry
or a loop, never that it is one, and one lone repeat is not reported at all —
a single retry after a timeout is ordinary.

In the terminal, in `--json` as `repeatedTurns`, in the CI summary, and in the
MCP `profile_usage` tool. The session key groups the turns and never appears
in any of them, which a test enforces.

**The input shape, in the browser.** The Bill tab gained the card the terminal
and the CI summary already had: how big a slice's calls are, whether the large
ones are much larger than the ordinary one, and how much of that size was
billed at the cache-read rate. Same four-times-the-median threshold and the
same two sentences — two surfaces summarising one log differently is a second
opinion nobody asked for. Measured in the page like everything else in that
tab; verified in Chromium against both shapes, with zero network requests.

## 1.24.0 — "How big, how uneven, and the day it spiked"

### Added

**The CI summary says what the terminal says.** `--markdown-out` is what a
pull request comment and a GitHub job summary show, which is where most people
will ever read this report — and three findings the terminal makes were
missing from it. A finding the summary omits is a finding nobody sees.

- **The doubled-bill warning**, above the figures it would inflate rather than
  below them: a summary showing a total nobody can trust is worse than one
  showing no total.
- **How big the calls are**, with the same four-times-the-median threshold and
  the same two sentences, because a summary that words a finding differently
  is a second opinion nobody asked for.
- **The `--what-if` repricing**, with the assumption *above* the figure here
  too. A pull request comment is exactly where a dollar amount with the caveat
  underneath would be read as a recommendation and merged.

### Fixed

**"1 lines are exact duplicates".** The duplicate-line sentence took a
pre-formatted count and could not agree with its own verb. It takes a number
now and reads "1 line is an exact duplicate" — in both languages, where the
Spanish had the same fault.

**`inputShapes`: how big the calls actually are.** `outputShapes` said where
the *output* spend concentrates; input had a total and nothing else — and on a
RAG or agent workload input is most of the invoice. "Input is 63% of this
bill" is true and unactionable. Whether the p95 call carries twelve times the
median call's input is the part somebody can act on, and the two shapes want
opposite responses: a cap on whatever is growing, or a shorter prompt every
call sends.

Everything the model read counts as input — fresh tokens, cache reads and
cache writes — because that is the size of the request, which is what a
context window and a retrieval cap are about. `cachedShare` then says how much
of it was billed at the cache-read rate, so a large slice that is caching
correctly does not read as an emergency.

Every figure is a **bucket ceiling**, never an interpolated percentile: "half
the calls fit within 1,024 input tokens" is exact for the number named, where
interpolating between buckets would invent a call nobody made. Slices with
fewer than twenty calls are left out entirely rather than reported at a
precision they do not have — a p95 over four calls is the largest of the four
wearing a percentile's name.

In the terminal, in `--json` as `inputShapes`, and in the MCP `profile_usage`
tool.

**`--max-day-usd`: the gate a total cannot arm.** A month at $3,000 against a
$4,000 budget passes while one afternoon's runaway loop burned $900 of it.
`--max-usd` gates the sum handed in; this gates the worst single UTC day
inside it, which is the shape a loop, a bad deploy or a retry storm actually
has — and it names that day's biggest label, so the spike arrives with a
suspect attached.

Two refusals it inherits from the rest of the tool. A log with **no clock at
all** cannot be judged by day and **fails**: "not measured" is not "under
budget", and a gate that silently green-lights an unmeasurable log is worse
than one that was never armed. And calls with no `ts` are in the bill and in
none of the days, so a *pass* says how many were left out — the worst day is a
floor by whatever they held, while a failure stands regardless.

## 1.23.0 — "What if it were the other model?"

### Added

**The same repricing in the browser.** The Bill tab gained the `--what-if`
card: pick a model and this bill is repriced onto it in the page, with the
same refusals the CLI makes — the assumption above the figure, calls too large
for the target's context window named as impossible rather than priced as
cheap, spend already on that model kept out of the difference. Repriced
client-side like everything else in the tab: the log does not leave it to be
compared. Verified by driving the built page in Chromium, with zero network
requests recorded.

**`--what-if <model>`: these exact calls at another rate card.** The levers
section picks its own candidate; this answers the question the reader arrived
with — "`classify` spent $4,000 on the frontier model, what would those calls
have cost on the small one?". Every token in the answer was actually billed,
so this is the same move `cacheEconomics` makes: arithmetic, not the guess
about content that `profile` refuses to make.

It is built so it cannot be read as advice. The caveat prints **before** the
figure, because a dollar amount with small print underneath is a
recommendation. It says outright that it knows nothing about whether the
cheaper model could do the work, and that a model answering at greater length
or getting retried would not send these counts at all.

Three refusals carry the honesty:

- **Calls the target could not have accepted are named, not priced.** A
  250k-token call against a 200k window fails; it does not get cheaper. Those
  slices are listed as impossible and their money is excluded from every
  total. The ceiling is judged on the **largest single call**, never a mean —
  one call over the line is a failed call, and an average hides it.
- **Spend already on the target stays out of the difference.** A $10,000 bill
  of which $9,900 is already cheap would otherwise report a 1% difference and
  read as "not worth doing". It is stated separately instead.
- **Models with no current price are named.** Their cost on the target is
  knowable; the difference is not, because there is no current figure to
  subtract from.

Available as `trazum profile <log> --what-if <model>`, in `--json` as `whatIf`
(with `sameTokensAssumed` inside the object, so a consumer cannot print the
figure without the caveat), and as `what_if` on the MCP `profile_usage` tool.
An id the catalogue cannot price is an error in all three: a flag that
silently does nothing is worse than a missing feature.

`UsageBreakdown` gained the fields that make it possible — `cacheWrite5mTokens`
and `cacheWrite1hTokens` (the two write TTLs are billed at 1.25x and 2x input,
and the ratio is not constant across providers, so a combined total cannot be
repriced) and `maxCallInputTokens`.

**A doubled bill, caught.** Reading a directory of rotated logs — which 1.18
made easy — makes double-counting easy too: a log exported twice, an
overlapping export, a copy left in the folder. The total then reads high and
nothing else in the report can see it. `duplicateLines` counts lines identical
to an earlier one and prices exactly what they added, so the reader knows how
much to distrust the figure above.

Counted **only over records with a clock**: same counts, same label and
session, *same millisecond*. Two real calls colliding on all of that is
possible and unlikely; without a timestamp it is ordinary, so clockless
records are excluded rather than guessed at. The comparison is over the raw
line rather than a hash, because a hash collision would report a duplicate
that is not one — and this figure exists to make somebody distrust a total.
It states the count and the money and stops: whether it is a double export or
a genuinely busy millisecond is the reader's to know.

## 1.22.0 — "The gate, the window and the spreadsheet"

### Added

**`--csv-shape day|hour`, the series a spreadsheet gets asked to chart.**
`--csv-out` wrote one table: label and model. The time series is what somebody
actually pastes into a chart, so it is now a choice rather than extra columns
— **one row shape per file**, because a spreadsheet that has to filter before
it can sum is a spreadsheet somebody sums wrong. The day table carries each
day's biggest label; a day whose calls carried no label at all leaves those
cells empty rather than inventing a name. No total row in any shape, still,
and a shape it does not know is refused by name.

**Relative windows: `--since 7d`, `--until now`.** "The last week" is what a
nightly job asks for, and computing a date in a shell to say it is the step
that gets skipped. Days and hours (`7d`, `24h`), plus `now` for the other
bound. Measured against **this machine's clock, not the log's** — a real
difference on an exported log — and said out loud beside the window line; when
a relative window finds nothing, the refusal names the clock difference as the
likely reason instead of leaving the reader to guess.

**The token budget, against what actually goes up the wire.** `budgets` gates
a prompt *file*; the log records what the *call* carried — system prompt,
retrieved context, conversation history, tool results. When `labels` maps a
workload to a file and a budget covers it, the report now states the gap: a
2,000-token budget on calls carrying 50,000 input tokens governs roughly 4% of
what is sent, and nobody looking at a green build would know it. Only said
when the budget covers less than half the call, because a budget doing its job
is not news; the share is named as approximate, since the budget counts a
file with the estimator while the log counts what the provider billed; and it
never says the budget is wrong — only that it is smaller than the bill.
Cached tokens count towards the call, because a cached token was still sent.

## 1.21.0 — "What the log does not say"

### Added

**The README catches up with eight releases.** The profile section now
documents what the tool actually reports: the shape of the day and the Batch
API question it answers, what one conversation costs (median against p95),
conversations that never came back and the ceiling/fact split their figure
carries, and the coverage section. The CI-gate section gains the third gate
(`--max-cache-loss-usd`, reading the worst case), `spend` budgets in the
config, and the floor note every gate now prints; the output section names
`--csv-out`, directory mode and the documented `--json` contract.

**The coverage section reaches the MCP and the browser.** `profile_usage`
lists the missing fields with counts an agent can act on, and the web Bill
tab shows them in the gaps footer — same counts, same silence on a complete
log. An agent told "labelled" by a boolean would stop asking; told "12/40,000"
it does the right thing.

**"What this log cannot answer yet."** Every finding past the totals needs a
field the log format does not require, and a reader who never adds them sees a
report quietly missing half of itself — with no way to tell "nothing to
report" from "nothing recorded". The report now names each missing field with
what it would unlock, from exact counts: `"label" on 0/40,000 records`,
`"session" on 12/40,000`. **Counts rather than booleans**, because twelve
labelled records out of forty thousand is not a labelled log and a boolean
would call it one. Coverage is counted over records that *parsed*, priced or
not — whether a field is present is a property of the log, not of the price
catalogue — and the cache-TTL line is counted only over records that actually
wrote to the cache. A complete log gets no section at all: a paragraph of
things that are fine is the paragraph readers learn to skip.

## 1.20.0 — "When, and what you can build on"

### Added

**The shape of the day, drawn.** The web Bill tab gains a 24-bar chart of
spend per UTC hour — divs, like the day chart, no library — with the hours
holding 80% of the spend in the warning colour and the same sentence the
terminal prints. Hours with no traffic are drawn as **empty rather than
skipped**: a chart that closed the gaps would make every workload look flat,
and flat is exactly the finding that points at the Batch API. Verified in a
real browser, zero network requests.

**`--json` becomes a contract.** `docs/json-output.md` documents every
top-level field, the output carries a `schemaVersion` to branch on, and
`json-contract.test.js` enforces the promise **in both directions**: a
documented field that disappears fails, and a field emitted without a line in
the doc fails too. Anything built on the machine-readable report could not
previously tell "old Trazum" from "no data"; the promise is now explicit —
fields are added without a version bump, dollars are unrounded numbers,
absence is `null` or `[]` and never zero, and nothing carries a session key.

**The shape of the day, and the lever it points at.** `spendByHour` buckets
exact per-record dollars by hour of the UTC day, and the report states the
measure that needs no threshold to explain: the **fewest hours holding 80% of
the spend**. Two hours is interactive traffic somebody is waiting on, where
the Batch API's 24-hour turnaround does not fit; twenty is the shape
background work has, and background work is exactly what the Batch API halves
the price of. The sentence names the lever and **never claims the saving** —
whether a workload can wait is a product decision counts cannot make, and the
levers section already prices the batch route for whoever decides it. UTC,
stated, for the reason `spendByDay` is: a local-hour bucket would make the
same log answer differently in two offices.

## 1.19.0 — "Which workload, and at what rate"

### Added

**The truncation suspects reach every rendering.** `--markdown-out`, the MCP's
`profile_usage` and the web Bill tab all name which workloads pay for answers
cut off at `max_tokens`, with the same denominator — calls that recorded a
stop reason — and the same silence when one label is the whole log. The
markdown and the MCP also carry the ceiling the finished answers needed.

**Truncation, with suspects.** The report could say a bill paid for answers
cut off at `max_tokens` and not which workload was paying. It now names them,
ranked by wasted output, with the rate stated over **calls that recorded a
stop reason** — never over every call, because a workload logging the field
half the time is not a workload whose other half completed, and both numbers
print so the denominator is visible. A 40% rate is a `max_tokens` setting
that is wrong; 1% is a long tail, and the two call for opposite responses.
Beside them, the ceiling the finished answers actually needed — 95% fit
within N output tokens — measured on these calls and promised for nothing.

**The drill-down reaches the browser: click a workload, see it alone.** The
web Bill tab's per-label table becomes clickable — the CLI's `--label`,
without retyping the command. The banner carries the awkward half out loud:
every share below is a share of *that workload's* bill, not of the log, which
is otherwise read as "chat is 100% of our spend". Both logs of a comparison
are filtered the same way, as on the CLI, and a drill-down inside a
drill-down is not offered — it would filter an already-filtered report and
quietly produce an empty one. Verified in a real browser: $7.00 → $5.00 on
clicking `chat`, the sibling workload gone from the table, the whole log
restored on clearing, and zero network requests throughout.

## 1.18.0 — "The bill, where the decisions are made"

### Added

**`profile` reads a directory of rotated logs.** Logs rotate — one file per
day for a month — and making somebody `cat` them together before a profile
will read them is a setup cost that gets a tool skipped. A directory is read
in name order (which for dated names is time order) as one bill, with the
number of files stated: a report over "the logs" that silently skipped one is
a total wrong by an unknown amount. A file with no trailing newline is joined
without gluing its last record to the next file's first. A directory with
nothing readable is an error naming the extensions it looked for, never an
empty report that would read as "you spent nothing".

**`profile --csv-out`, the report for whoever signs off the bill.** One row
per label and model — the grain a routing or budget decision is made at —
written from `@trazum/core`'s `profileToCsv`. Three deliberate refusals:
**no total row**, because a total inside a data file gets summed with the data
and doubles every figure downstream; **empty dollar cells for unpriced
models**, never zeros, because `0` would claim those calls were free while
their tokens are real; and a label that starts with `=`, `+`, `-` or `@` is
prefixed with an apostrophe, because a usage log is data and a spreadsheet
would otherwise run it.

Two bugs the feature's own tests caught, both now fixed: under `--json` the
side files (`--csv-out`, `--markdown-out`) were never written at all — a flag
that silently did nothing — and the "wrote to" notice went to stdout, turning
a parseable JSON document into a parse error. Both output paths now write the
files, and the notice goes to stderr under `--json`, the rule the money gates
already followed.

**Money budgets that live in the repository: `spend` in `trazum.config.json`.**
`budgets` gates the tokens a prompt file may hold; `spend` gates the dollars a
usage log records — `maxUsd` for the whole log, `byLabel` for each named
workload against its own limit in the same run. A per-workload budget is a
policy several people agree on, and a policy that lives in one CI invocation
is a policy nobody can read. Flags still win over the config, as everywhere.

Two refusals keep it honest. A budgeted label with **no calls in the log** is
reported as *not measured*, never as a pass: a workload that did not appear is
not a workload that came in under budget. And per-label budgets are **not
applied under `--since`/`--until`**, because a window makes "what this label
spent" mean a slice, and a budget written for the whole period would be gating
against something it does not describe.

## 1.17.0 — "What the report cannot see"

### Added

**The conversation cost reaches the MCP and the browser.** `profile_usage`
speaks the median, the p95 and the tail sentence; the web Bill tab renders
them in the conversation card, the tail in the warning colour. Same
thresholds, same refusal of a mean, from the same core measurement.

**What one conversation costs.** The question a total cannot answer: whether
$4,000 is forty thousand cheap conversations or four hundred expensive ones —
the figure a per-seat price or a quota is set from. `sessionCosts` reports the
**median** conversation, its p95 and its maximum per label and model, exact
billed counts summed per conversation, with a mean deliberately refused (one
runaway agent loop drags a mean up and hides the ordinary case). A p95 past
ten times the median is called out as a tail a quota can catch; a p95 beside
the median is a workload that is simply expensive, and the report says that
instead. Slices with fewer than five conversations are dropped — a median over
four is one of the four. Session keys group turns and never appear.

**A gate says when its figure is a floor.** A gate can only judge the money
it can see, and three things hide spend from it: unreadable lines, models the
price table does not know, and clockless calls dropped by a time window. When
any of them is present the gates now say so beside the verdict — a pass means
"the part I could read fits", never "the bill fits". Silent passes on partial
data were the flattering omission still left in the money gates.

**`--against` warns when the two logs cover the same days.** Comparing
overlapping periods puts the same calls on both sides of the subtraction, so
part of the reported growth is the same money counted twice. Warned between
the totals line and the drivers built from it, and only when both logs carry
a clock — unknown stays silent rather than reassuring.

**The comparison reaches `--markdown-out`.** The section the terminal has had
since 1.11: totals with the sign convention, the overlap warning, drivers per
label and per model, and a previous log with nothing priced reported as its
own answer. A CI summary that compared two logs was showing only one of them.

## 1.16.0 — "The worst case, on the record"

### Added

**The day series reaches the markdown.** The spend-per-day table the peak
sentence summarises — day, exact dollars, calls, and the biggest label of the
day — for the CI summary and PR comment readers who want to see the week.
Capped at the most recent 14 days with the earlier ones counted out loud
(silent truncation reads as "covered everything"), absent for a single day
because one row is the total again, and the full series still rides `--json`
as `spendByDay`.

**The price table's age, said out loud when it matters.** Every dollar a
profile prints uses the bundled price table, and the one fact that silently
invalidates all of them is a table the provider has re-priced since. Past 45
days — the threshold is in the sentence — the terminal, the markdown, the MCP
and the web all say so loudly: the review date, the age, and that the report
is wrong by exactly whatever changed, with `--pricing-live` as the fix.
`--json` carries `pricing.lastReviewed`/`pricing.ageDays` always, as
provenance. The tests pin the rule rather than the calendar: whether the line
appears is derived from the table's own date at run time, so a freshly
reviewed table asserts the opposite behaviour and passes the same suite.

**`--max-cache-loss-usd`, the third money gate — and it reads the worst case
on purpose.** Exit 1 when caching added more than the limit to the bill. When
the log did not record which write TTL was paid, the settled figure and the
1-hour worst case can straddle the limit, and a gate reading the flattering
half would pass exactly the bills it exists to catch — so the gate reads the
ceiling and its failure message says which claim fired: a settled loss
(exact, the same tokens at the published input rate), or a ceiling only the
missing `cache_creation` field can settle. Fires under `--json` too; wired
into the Action as `max-cache-loss-usd` and self-tested in CI on a +$1.25
loss ($6.25 of 5-minute writes nothing reads back, against $5.00 as plain
input). The read-the-worst-case guard is mutation-tested.

## 1.15.0 — "The same answer on every surface"

### Added

**The comparison is computed once, and reaches the MCP.** `driversBetween`
moves to `@trazum/core` — one implementation of the union-and-subtract whose
sign convention (positive means the bill grew) has flipped once already when
restated by hand — and the CLI, the web and now the MCP all import it. The
MCP's `profile_usage` gains `previous_log`: totals with the convention stated
first, drivers per label and per model with appeared and vanished workloads
named, `label`/`since`/`until` filtering both logs so the comparison stays one
workload and one period, and a previous log with nothing priced reported as
its own answer rather than zero growth. The web comparison gains the same
by-model split the CLI got, from the same shared code.

**The window reaches the browser.** Two date fields on the web Bill tab —
`--since`/`--until` under the CLI's exact rules: a bare date is that whole UTC
day, the same window applies to both logs of a comparison, clockless calls
are excluded and counted out loud, and the CLI's refusals are kept in step (a
window matching nothing names what the log covers instead of rendering a $0
report; a clockless log cannot be windowed; a window that starts after it
ends is an error). Verified in a real browser: $11.00 → $1.00 when windowed
to the cheap day, the refusal naming the span, clearing restoring the whole
log, zero network requests throughout.

**The change by model — where the mix moved.** A workload that keeps its name
and switches from Haiku to Opus reads as "chat grew" in the per-label drivers,
and the reason is the model. `--against` now splits the same change by model —
appeared and vanished models named, one model on both sides deliberately
silent because it would restate the totals line — and both driver sets ride
`--json` as `against.byLabel` / `against.byModel`, computed once beside the
gates so no rendering derives its own.

**The drill-downs reach the GitHub Action.** `label`, `since` and `until`
inputs on the spend gate — one workload's budget, or one period's, in a
workflow. The CLI owns the honesty rules, so a label or window matching
nothing fails the run naming what exists, and clockless calls under a window
are counted out loud in the report. Self-tested in CI with the same hand
arithmetic as the gates: a $5.00 workload passes a $9 budget the $15.00 log
would fail, one day passes it, the dear day fails it, and a window the log
does not cover is refused rather than passing a $0 gate.

## 1.14.0 — "Drill-downs and drive-bys"

### Added

**The window and the ledger reach every rendering.** `--markdown-out` states
the window as the user typed it — rendering the internal exclusive bound would
print the next day and disagree with the terminal — with the undated count as
a loud blockquote, and carries the never-came-back claims with the same
fact/ceiling split, decided by the slice's own reads. The MCP's
`profile_usage` gains `since`/`until` under the CLI's rules (a window matching
nothing is an error naming what the log covers; clockless calls counted out
loud) and speaks both single-turn claims. The web Bill tab renders them in the
cache card, loud only when the slice read nothing.

**Cache writes by conversations that never came back.** A one-turn session
pays the write premium for reuse its own conversation never makes, and it
hides inside healthy totals: long sessions' reads pay for the cache overall
while every drive-by bleeds. `singleTurnCacheWrites` names the slices, prices
those writes at the bill's own rates, and the rendering makes the honesty
split the provider's prefix-keyed cache forces: with cache reads anywhere in
the slice the figure is a **ceiling named as one** — another conversation
sharing the prefix may have read the write, and the log cannot see whose
write a read hit — and with zero reads the ceiling collapses into a loud
fact: those writes bought nothing. Session keys group turns and are never
printed, as everywhere. The guard is mutation-tested and every dollar is hand
arithmetic.

**`profile --since` / `--until`, the drill-down in time.** A UTC day or a full
ISO 8601 timestamp; a bare `--until` date includes that whole day, because a
window that excludes the day it names is a trap sprung on everyone who reads
dates the way humans do. Internally half-open `[since, until)`, so adjacent
windows share no record. The honesty rules carry the feature: a call with no
`ts` cannot be placed inside or outside a window, so it is excluded and
**counted out loud** — the window's figures are a floor on the period, and the
report says so; a window matching nothing is an error naming what the log does
cover, never a $0 report that would pass a `--max-usd` gate over a period the
log does not contain; a window over a clockless log is an error for the
`--max-growth-usd`-without-`--against` reason. With `--against`, both logs get
the same window, and the gates gate the window — profile yesterday against the
day before, with a budget, in one line of CI.

## 1.13.0 — "The bill learns to say no"

### Added

**The most expensive day, and the bill as a CI gate.** `spendByDay` buckets
exact per-record dollars per UTC day — the delta each record adds to the total,
so the day arithmetic can never drift from the bill's — with the top label
attached. The report names the peak day against the **median** day (a mean
would let the spike inflate its own yardstick), loud only past twice it. And
`--max-usd` exits 1 when the log spent more than its budget, `--max-growth-usd`
(with `--against`) when the bill grew past the limit — no period assumed, both
firing under `--json` because CI reads the exit code there. Alone,
`--max-growth-usd` is an error rather than a flag that silently gates nothing.

**The clock reaches every rendering.** `--markdown-out` gains the span line,
the peak day and the TTL verdicts with the failing ones loud; the gap, day and
median helpers live once, shared by both renderings, so they cannot drift. The
web Bill tab draws spend per day — a bar per UTC day, divs rather than a chart
library, the peak bar in the warning colour — verified in a real browser.

**The ceilings a max_tokens cap actually wants.** `OutputShape` gains
`medianWithinTokens` and `p95WithinTokens`: the bucket ceiling at least half
and 95% of the measured answers fit within. Exact over the histogram, `null`
for the open-ended last bucket rather than an invented ceiling, and said in one
line per slice: measured on these calls, promised for nothing.

**`profile --label`, the drill-down.** Once the full report has named a
suspect, the same command profiles that workload alone — every section, the
gates included, over one label's calls. A label that matches nothing is an
error naming the labels that exist, never a silent report over zero calls that
would read as "this workload is free". With `--against`, both logs are
filtered, so the comparison stays one workload.

**The spend gate, packaged into the GitHub Action.** Hand the action a
`usage-log` instead of a `target` and it runs `profile` with `max-usd`,
`against` and `max-growth-usd` — the money gates in a workflow, with the report
in the run summary and a failing gate still writing it. The two modes are
mutually exclusive: one run gates tokens before the money is spent or the
spend itself, and folding both verdicts into one exit code would leave nobody
knowing which gate fired. Self-tested in CI with hand-checkable arithmetic: a
$5.00 log passes a $9 budget, a $15.00 log fails it, +$10.00 growth fails a $5
limit, and naming both modes at once is refused.

**The comparison reaches the browser, and the drill-down reaches the MCP.**
The web Bill tab takes a second usage log and renders "against the previous
log" — the sign convention stated before the first figure, drivers derived over
the union of labels so appeared and vanished workloads are named, and a
previous log with nothing priced reported as its own answer rather than zero
growth. Verified in a real browser with exact arithmetic and zero network
requests. `profile_usage` on the MCP gains the optional `label`, with the
drill-down's rule riding along; the web output shapes gain the max_tokens
ceilings.

## 1.12.0 — "The log gets a clock"

### Added

**A `ts` field on the usage record, and the two findings only a clock can make.**
ISO 8601, epoch seconds or milliseconds, or OpenAI's `created`; parsed under the
same three-state rule as the counts — absent is null, present-and-unreadable
rejects the line into `skippedLines`, because a silently dropped timestamp would
mis-measure every gap it touches.

**The span.** The report states what period the log covers — `This log covers
2026-08-01 → 2026-08-14 (13.0 days)` — and deliberately stops there. Stated,
never extrapolated: the span makes the reader's own monthly arithmetic valid,
while a per-month figure from a partial month would be Trazum doing the guessing
it exists to end. Partial coverage is said in the same breath, and a test asserts
the span alone conjures no monthly figure anywhere.

**Does the cache TTL fit how fast the turns come?** A cache entry lives 5
minutes, or an hour at 2x the write price, and whether either fits depends on a
number the bill never shows: how long the workload waits between turns. Measured
as the median gap between consecutive turns of the same conversation, sorted by
the recorded clock so the answer is independent of the order of the log. Five
states: **expires before reuse** — the mechanism behind a losing cache, with
both honest ways out named; **overlong TTL** — turns seconds apart paying 2x for
an hour of endurance they never use, priced exactly as the same tokens at the
other published rate; **unsettled** when the unrecorded TTL decides it; **fits**
said out loud; and **could not be measured** over writes with no clock, rather
than silence. Rendered in the CLI (both locales), the MCP `profile_usage` tool
and the web Bill tab; `--json` carries `span` and `cacheTtlFit`.

The recording recipe gains `ts` in the README, the onboarding message and the
docs-pinned fixture, so following the documented recipe still produces a report
that asks for nothing more.

## 1.11.0 — "What actually moves the bill"

### Added

**`profile_usage` on the MCP server: an agent can read the bill.** The fourth
tool, and the surface's first with exact figures — they are the provider's own
billed counts, not ±10% estimates. The log is passed as text, never a path, so
the no-paths security design holds; the TTL-unsettled cache verdict, the levers
with the prompt ceiling named as a ceiling, all three truncation states and the
gaps carry over from the CLI; and a test feeds a customer-named session key
through three turns to assert no fragment of it comes back out.

**"Your bill" in the web app: the profile report, read where it was pasted.**
Drop or paste a usage log and the whole report renders — parsed entirely in the
browser against the bundled catalogue. Nothing is uploaded: there is no fetch in
the component, a source test fails if one appears, and the one analytics event
carries two booleans. Verified live by driving the built page in a browser and
counting network requests during analysis: zero.

### Fixed

**The web lever line glued the slice's spend to the saving's share.** "up to
$0.4669 (72%)" against a by-label table calling the same slice 100% of the bill
— `shareOfBill` describes the combined saving, and the render passed `spentUsd`
beside it. Caught on a screenshot, not by any source assertion; it now carries
`combinedUsd` as the CLI always has, and a test pins which field feeds which
line. The same screenshot surfaced "1 calls are not in these totals": every
counted web message now takes its count as a number and conjugates the singular
in both locales, pinned by a test that walks all seven counted messages in both
catalogues.


### Added

**The cache loop, closed: `labels` in the config maps a usage-log label to its
prompt file, and `profile` reads the file and says why a failing cache fails.**

The report could say "caching loses money on `support-rag`" and nothing more —
the log carries counts, not content. With the map it names the reason: a stable
prefix under the model's cache minimum (writes that can never become reads),
stable tokens stranded behind the first placeholder (`--reorder` moves them), or
a healthy file whose problem is byte-identity between calls. A mapped file that
does not exist is said out loud rather than skipped.

Every sentence carries *"as it is today — the log may predate it"*: the file is
whatever the repository holds now, which may not be what produced the log, and a
fresh file presented as the history's explanation would be a figure attributed to
something it does not describe.


### Added

**`profile` prices the answers that were cut off.** With `stop_reason`
(Anthropic) or `finish_reason` (OpenAI) in the log — the API returns both beside
`usage` — the report names the one category of a bill that is waste without a
counterpart: answers that hit the `max_tokens` ceiling were paid in full, are
frequently retried and billed again, and the truncated attempt bought nothing.
Three states, kept apart: waste found, none found on a log that measured, and a
log that never recorded a stop reason — which gets the missing-field message,
because silence there reads as a clean bill of health on a question the log
never asked.

**`profile --against <previous.jsonl>` — the bill as a watched metric.** Nobody
adds five thousand a month in one day; bills grow four percent a week while
every snapshot looks reasonable. The comparison prints the delta with the diff
convention — positive means the bill grew — and ranks the drivers by their
contribution to the change, not by bill size, because the second-biggest
workload can be the whole story of the growth. Appeared and vanished workloads
are named. No period is assumed: the call counts print beside the money so the
reader judges comparability first.

**`profile --markdown-out <file>`** writes the report as GitHub-flavoured
markdown for a job summary or a PR comment, rendered from the same message
catalogue as the terminal — two renderings of one finding drift the moment they
are worded twice, and the sign conventions here have each already produced a bug
when restated by hand.


### Fixed

**Cache billing noise was reported as conversation growth.** Found by adversarial
review, against a fix made the same day: the growth baseline was the cheapest
turn's billed *cost*, and per-turn cost varies with the cache multiplier even when
the input never grows — an identical 10,000-token turn costs 12.5x more as a cache
write than as a cache read. An ordinary 5-minute-TTL agent whose conversation
stayed completely flat reported **77.5% of its bill as "conversation growth"** and
was told to trim history that was not there, while the report's own min/max token
figures proved the claim false on the same screen. Growth is measured in
**tokens** now — exact, order-independent, immune to billing rates — and the
dollars are that token share of what the session actually spent.

**A numeric session id was dropped and then denied.** `session: 12345` — an
auto-incremented conversation id, which is what half the databases in existence
produce — was silently ignored by the string-only reader, and the report printed
"No call in this log carried a session": a false claim about a log that carried
one on every line. Finite numbers are identifiers now, for `label` and `session`
both; booleans and objects stay out, because `session: true` names nothing.

**`route --label` with a misspelt label asserted a verdict about calls it never
selected.** The fall-through answer was "no route on this log clears 1% of the
bill: these calls are already on the cheapest model of their family" — two
falsehoods at once when the log had a 60% route under a different name. A label
nothing carries now gets the typo answer: the labels that exist.


### Fixed

**A workload literally named `unlabelled` merged into the missing-label bucket.**
The sentinel was the string `'unlabelled'`, so 200 calls somebody had given that
name and 200 calls with no label at all reported as one row of 400 — a figure
attributed to something it does not describe — and the "none of these calls
carried a label" logic could fire over a log where half of them had. The sentinel
is the empty string now, the one value a parsed label can never be; the terminal
shows the missing bucket as `(no label)` so the two cannot read identically
either.

**A label containing a newline corrupted the structured keys.** Labels are half of
keys that split on `\n` — `byLabelAndModel`, the conversation tracker, the
output-shape tracker — so `label: "rag\nclaude-haiku-4-5"` truncated the label to
`rag` and mangled the model half. Whitespace inside a label is normalised to a
single space at the parse boundary, protecting every consumer at once.


### Fixed

**The conversation measurement depended on the order of the log.** Growth was
anchored on the first record seen per session — a fact about the log's ordering,
not about the conversation. The identical workload exported newest-first, an
ordinary shape for a warehouse export, computed a *negative* growth and the whole
section silently vanished: the largest line on an agent bill, gone because
somebody's log was sorted the other way.

The anchor is the **cheapest turn** now, which is order-independent, equals the
opening turn on any genuinely growing conversation, and keeps the figure an exact
ceiling — no truncation strategy can pay less than the cheapest turn per turn. A
test runs the same workload forward, reversed and re-sorted and requires identical
results up to floating-point associativity.

The wording followed: *smallest turn* and *largest turn*, never *opening* and
*closing*, because the report must not claim an order it cannot know. For the same
reason a shrinking conversation and its growing mirror — literally
indistinguishable once order is unknown — now produce the same report, which
replaces a test that demanded the impossible. `ConversationGrowth` renames
`firstTurnTokens`/`lastTurnTokens` to `minTurnTokens`/`maxTurnTokens` (unreleased
API).


### Fixed

**`profile --json` omitted the levers.** The flagship section — "What would
actually move this bill", the reason the command exists — was terminal-only, so
any pipeline, dashboard or CI step reading the JSON never saw it. A finding the
machine-readable output omits is a finding the reader's tooling will never
surface. The JSON now carries `levers` beside the cache verdict, the
conversations and the output shapes, and a test asserts every section the
terminal renders has a machine-readable counterpart.


### Added

**`trazum profile` now says where the output spend concentrates** — the actionable
half of "output dominates", which was the biggest line on the measured bill (87%)
and the one the report could only state as a total.

Two bills with identical output spend want opposite responses, and only the shape
tells them apart:

```
  chat on Claude Opus 5: 5.9% of calls hold 71.5% of the output spend — the
  ones answering with more than 8,000 tokens, out of $33.01 of output on
  this slice.
  That is a tail, and a tail has a cause: a path through the prompt that
  invites an essay, a call with no max_tokens, a retrieval that returned a
  book. Finding it is a morning; it is not "make everything shorter".
```

against:

```
  summaries on Claude Opus 5: the output spend sits where the calls are —
  100.0% of them hold 100.0% of $45.00. There is no tail to hunt.
```

The figure is **the smallest group of calls holding at least half the output
spend** — a median over money rather than a threshold somebody picked, found by
walking the distribution down from the longest answers. "At least half" is meant
literally: the walk stops on a bucket boundary, and claiming exactly half would be
a precision the histogram does not have. The threshold named is always a bucket
edge, so "calls answering with more than N tokens" is exact.

Counted in fixed buckets in the pass `profileUsage` already makes — 64-token
resolution where answers actually land, coarser in the tail — so memory is bounded
by slices × touched buckets, not by the log. Per label **and** model, because a
distribution mixed across two prices describes neither. `outputShapes` and
`createOutputShapeTracker` are exported from `@trazum/core`.


### Fixed

**`1 calls`, and `1 llamadas` in Spanish.** Reachable on ordinary input — a
one-call log, a label covering one call, a slice of one — on the totals line, the
breakdown rows and the levers.

Two messages in the English catalogue already did the agreement by hand while a
dozen did not, so the fault was never that somebody forgot: getting it right was a
choice made per message. Both catalogues have a `plural` helper now and the count
arrives already agreeing with its noun, so the next message written gets it for
free and neither language can get it right while the other does not.

The guard runs over both catalogues rather than over a list of strings, and checks
the plural as well as the singular — a fix that hard-coded `1 call` would have
passed every assertion about one and been wrong on every real log.


**Following this tool's own recording recipe produced a report that asked for two
more fields.** The onboarding message described a log with a `model` and a `usage`
object; the headline README snippet carried `label` marked "optional" and no
`session` at all. A reader who copied either was told on their first run that no
call carried a session, and — since #128 — that no call carried a label, so the two
largest findings the command makes could not be made.

There is one recipe now and it is complete. `label` says which workload and
`session` says which conversation; both are one line, neither can contain prompt
text, and the session key is grouped by and never printed. A test records the
documented snippet and fails if the report complains about anything, so the docs
and the tool cannot drift apart again.


**A log with no labels was reported as though `unlabelled` were a workload.** A
2,000-call classifier and a 400-call RAG pipeline with no label between them merge
into one slice, and the levers section then offered **a single route for both** —
two workloads that need different answers, priced as one.

Worse in `trazum route`, which measures exactly one prompt: it named
`unlabelled on Claude Opus 5 → Claude Sonnet 5, worth $14.88` and would have
attributed that verdict to a figure covering 2,400 calls the measurement never
touched. A number describing something other than what was measured, which is the
fault this repository keeps finding in itself.

Both say so now. The conversation-growth section already told the reader to add its
field when it was missing; labels got the same treatment, because the fix is one
line in their logger and it is what makes every figure below attributable.


**Three product faults, found by running the tool as a new user would rather than
by reading it.**

**`optimize` never said where the money was.** It is the first command anybody
runs, and it reports the smallest line item on the bill — measured, about 1%. On
the bundled example it prints `-0.4%` and `no rule found anything to trim`, and
then stopped. Everything that moves 40% to 80% lives in `profile`, which needs a
usage log a new reader does not have and has no reason to go looking for. A tool
that learned that and only said it in the command you reach last has not said it.
Every `optimize` run now closes with the four levers named and the command that
prices them.

**A named scenario was answered with a hint to name it.** Inside Claude Code the
report switches to tokens-only, and `--calls 50000` was met with "pass --cost if
this prompt is bound for a metered API" — telling somebody to do the thing they had
plainly just tried to do. It now says the scenario went unpriced and why.

The first attempt at this made `--calls` imply `--cost`, which was wrong and the
existing tests were right to fail it: `--calls` is a scenario parameter with a
default that several commands take purely to size a finding, so making it price
things would hand dollar figures to anybody who had put it in an alias precisely
because they had configured the tool not to show them. `--cost` stays the one way
to ask.

**A line that said nothing twice.** A 225-token prompt against a million-token
window reported `Context window: 0.0% → 0.0%` — the one line whose job is to say
what a saved token buys. It now distinguishes three cases, and the first attempt at
that was itself wrong: equal shares can mean "nothing against a million tokens" or
"10% of a Haiku window that one token did not move", and using the negligible
wording for both told a reader holding a tenth of the window they were under a
tenth of a percent. Caught by its own test.

### Added

**`trazum profile` now measures what re-sending the conversation costs.**

A chat or agent workload sends the whole conversation back on every turn: turn one
is a system prompt and a question, turn twenty is a system prompt, nineteen previous
exchanges and a question. On an agent bill that growth is routinely **the largest
single line**, and nothing in this package could see it — a prompt file shows the
system prompt and not the history, and a total shows the sum and not the shape.

```
What re-sending the conversation costs

  agent on Claude Opus 5: input goes from 600 tokens on the opening turn to
  5,000 on the closing one, over conversations of up to 12 turns.
  If every turn had cost what its own first turn cost, that input would have
  been $7.20 instead of $33.60 — so at most $26.40 of this bill is
  conversation growth (57.9%).
```

Reported as a **ceiling**: what the workload would have cost if every turn had cost
what its own first turn cost. That subtraction is exact; the split between re-sent
history and the user's own new messages is not knowable from counts, and inventing
one would be the flattering direction. Saying nothing because the split is unknowable
would be worse.

It needs one field — `session`, or `conversation_id`, whichever the log already has
— and **Trazum never prints it**. In a real log a session key is often an account id,
a ticket number or an email address, so it is used to group calls and count turns,
every figure comes out per label, and tests assert the value appears nowhere in the
report or in `--json`. A log with no session field says so rather than staying
quiet: "nothing recorded" and "nothing to report" are answers a reader would act on
differently.

Measured in the pass `profileUsage` already makes, so a megabyte log is never held
in memory: what the tracker keeps is bounded by the number of conversations.
`conversationGrowth` and `createConversationTracker` are exported from
`@trazum/core`.


**`trazum route` — the loop the levers section could only point at.**

`profile` prices a route exactly: the same tokens at a cheaper model's published
rate. It can say nothing whatever about whether that model still does the job, so
it printed a figure and a homework assignment — and homework does not get done.

```bash
trazum route usage.jsonl --prompt-file prompts/support.txt --cases cases.txt --yes
```

```
  support-rag on Claude Opus 5 → Claude Sonnet 5, worth $12.60 of this bill (60.0%).

  The cheaper model agrees with the original 94% of the time. The original
  agrees with itself 91% of the time — that is the yardstick, not 100%.

  ✓ HOLDS — the difference is inside the original model's own noise.
```

It finds the slice worth the most on its own, so the reader does not have to know
which workload to point it at. **The yardstick is the expensive model's own
run-to-run variance**, measured on the same cases in the same run: a route is safe
when the cheaper model agrees with the original more closely than the original
agrees with itself, and any other bar would be a number somebody chose.

Three provider calls per case — two on the original, one on the candidate — and it
prints the count and stops unless `--yes` is given, exactly as `prune` does. It
reports `INCONCLUSIVE` rather than inventing a verdict, and says **agreement is not
correctness** on every verdict including the good one.

`evaluate` gains `candidateProvider`, which is the whole routing axis and needed no
new yardstick — the baseline still runs twice on the original model. `EvalReport`
gains `candidateModel`, because a report naming one model could not say what it had
compared.

### Fixed

**The levers section named a command that cannot test a route.** It printed
`trazum eval <prompt> --cases <cases> --model <candidate>`, and `eval` runs against
whatever `TRAZUM_LLM_MODEL` says — `--model` only prices the report. The
instruction sent the reader to a measurement that never touched the candidate
model. It names `trazum route` now, which does.


**`trazum profile` now prices what would actually move the bill** — the answer to
the fairest complaint this product has had.

> *"if it only saves €200 to a company spending €20k, it's rubbish"*

The €200 is right. The rules recover about **1%**: three tokens out of three
hundred and six, measured on an ordinary support prompt. The conclusion is not that
the number is wrong but that shortening the prompt was never where the money was.

| lever | what it moves |
|---|---|
| **which model the call goes to** | Opus 5 → Sonnet 5 is **40%** off; → Haiku 4.5 is **80%** |
| **the Batch API** | **50%** flat, on input and output |
| prompt caching | 3–4× the rules |
| shortening the prompt | **~1%** |

So the report prices the other rows, from the log the reader already has:

```
What would actually move this bill

  → support-rag on Claude Opus 5 — up to $16.80 of this bill (52.2%)
    400 calls, $21.00 spent
    · route it to Claude Sonnet 5, $12.60
    · send it through the Batch API, $10.50
    Whether that holds is an evaluation question, not an arithmetic one, and
    nothing here has seen a single answer. Measure it: trazum eval <prompt>
    --cases <cases> --model claude-sonnet-5

  For comparison: shortening the prompt text can touch $18.00 at the very
  most — 85.7% of this bill, and only if you deleted every input token.
```

On that estate the levers come to **80% of the bill**. Every figure is arithmetic
on tokens that were billed: the same counts at another model's published rate, the
same tokens at the provider's batch multiplier. Nothing modelled, nothing
extrapolated.

Four refusals, each of them a bug caught while building it:

- **The options are combined, never summed.** Batching a routed call discounts the
  *cheaper* model, so the pair is $16.80 — not the $23.10 an addition gives, which
  is more than the $21.00 that slice had ever cost.
- **A route is never called safe.** That is a quality question arithmetic cannot
  answer, and this has seen no prompt and no answer. It prints the `eval` command
  instead of a recommendation, and steps down **one** capability rung rather than
  to the cheapest model on the shelf — frontier to small is a bigger number and a
  different product.
- **No figure is "per month".** A log covers whatever period somebody recorded.
- **Nothing crosses a vendor.** A cheaper model at another provider is a migration.

The ceiling on prompt shortening prints underneath, on purpose: a 1% win reported
without saying 1% of *what* is not information. It counts retrieved context and
conversation history too, so it is generous — the real figure is far below it.

`profileUsage` gains `byLabelAndModel`, because a route is decided per model and a
label spanning two of them has no single answer. `billLevers` is exported from
`@trazum/core`.

### Fixed

**Four faults in the cache verdict, found by an adversarial review of the code
that had just been written.** Sixteen agents across four lenses, every finding
handed to an independent verifier told to refute it. Ten survived, and they
reduce to four.

**The verdict was computed from a total the code itself calls a floor.** A log
carrying only the flat `cache_creation_input_tokens` cannot say which TTL a write
used, so the cheaper 5-minute rate is assumed — and that assumption moves the
*verdict*, not only the total. Reported delta is `0.25w - 0.9r`; at the 1-hour
rate the truth is `w - 0.9r`, so the **sign** disagrees for any workload reading
back between 0.28 and 1.11 tokens per token written. Measured on a million written
against three hundred thousand read back: `Caching took $0.1000 off this bill`,
where the truth at 2x was a **$3.65 loss**. A $3.75 swing across the sign, taken
in the flattering direction, printed as a fact.

The economics now carry `worstCaseDeltaUsd` and `worstCaseVerdict`, priced per
model because the ratio between the two rates is 1.6 on Anthropic and 1.0 where a
write costs what input costs. When the two verdicts disagree, neither is reported
— and the confident sentence does not print at all, which is the second half of
the fix: the first attempt added a caveat and left the assertion above it.

**Losing labels were named by bill size and truncated at three in silence**, while
the money beside them was summed over every loser. Four bleeding labels printed
three names and a figure charging them with a fourth's loss, and the worst cache
in an estate — usually on a small workload — was the one dropped. Ranked by loss
now, with the remainder counted.

**"Caching pays off overall" printed under a total the line above had just called
level.** The sentence no longer restates a verdict it is not in a position to make.

**A pricing overlay could not declare `multipliers`,** so a model added through
`--pricing` inherited Anthropic's 1.25x/2x writes. Trazum computed a premium that
provider never charged, reported an impossible caching loss, and told the reader
to turn caching off — while three documents claimed that could not happen to a
provider whose writes cost what input costs. Overlays carry `multipliers` now,
validated like every other key: an unknown rate name is an error with a
suggestion, a zero multiplier is refused along with the negatives, and `batch:
null` stays distinct from leaving it out.

### Added

**`trazum profile` now says whether the caching actually paid for itself** — the
one finding in this repository that can contradict the advice the rest of it
gives.

Trazum tells people to cache. On Anthropic a cache **write** costs 1.25x plain
input, and **2x** at the one-hour TTL, so a prefix that changes faster than it is
reused pays that premium and gets nothing back: those calls are cheaper with
caching switched off. Nothing else on the report could say so. The cache hit rate
cannot — it reads **97.8%** on the log used to test this, while one of the two
workloads on it is burning money.

```
  Cache hit rate 97.8% of billable input.
  Caching took $0.2675 off this bill, against the same tokens uncached.
  ! Caching pays off overall, but it costs $0.1250 on: rag. The total hides that.
```

Computed **per label as well as over the whole log**, because that is the case
worth having it for: a profitable cache on one workload and a bleeding one on
another net out to a comfortable total, and an aggregate is exactly where a loss
like that hides. Both sides are priced **per model**, so a provider whose writes
cost the same as plain input — OpenAI, Gemini — is never accused of a loss it
cannot have and could not switch off if it did.

This is the only counterfactual in `profile`, and it is not an exception to the
module's no-savings rule so much as the line that rule draws. A saving means
imagining a prompt nobody wrote. This means imagining the *same tokens at a
different rate*, which is arithmetic: caching changes the multiplier on a token,
never the token.

`--json` carries the verdict as `cache` and `cacheByLabel` rather than leaving a
consumer to re-derive it — **positive `deltaUsd` means worse**, the opposite of
every other figure Trazum emits, and two implementations of that convention would
eventually disagree. `cacheEconomics` is exported from `@trazum/core`.

### Fixed

**`profile` claimed caching had never been used on a bill made of cache writes.**
The message was keyed off a null cache hit rate, and the rate is undefined — zero
reads over zero attempts — on a log whose calls are entirely cache writes with no
plain input. So "Caching was never used on these calls" printed above a bill that
was 96% cache writes. It is keyed off whether caching was used now, which is a
different question and the one the sentence asks.

**Three faults in `profile`, found by an adversarial review of the code that had
just been written, and all three understated the bill.** Twenty-four agents across
four lenses — money honesty, the parser, the report's claims, security — each
finding then handed to an independent verifier told to refute it. Everything that
survived was in the flattering direction, which is the one direction this tool
exists not to take.

**A 1-hour cache write was priced at the 5-minute rate.** Anthropic charges 1.25x
input for a 5-minute entry and **2x** for a 1-hour one. `cacheWrite1h` was computed
in `pricing.ts` and never used by anything. Ten million tokens of 1-hour writes on
Opus 5 reported **$62.50** against a real **$100.00** — 37.5% under, on the largest
line of that bill, silently.

Worse, the information needed was in the log and was being thrown away: the API
returns a `cache_creation` object splitting the two, and the parser read only the
flat total. It reads the split now. When a log carries only the flat count the
cheaper rate is used **and the report says so** — the total is a floor for those
calls, and it uses the word.

**A count that was present but unreadable became a silent zero.** The guard was
`if (input < 0 && output < 0)` — an AND — so a record survived when only one of the
two failed to parse. A stringified `"200000"` out of `jq`, or a `null` out of a
Postgres JSON round-trip, produced a clean zero indistinguishable from a real one,
and the line never reached `skippedLines`, so nothing on screen said a number had
been dropped.

Measured: **$0.0150 against a true $2.015**, and the headline flipped to "output is
100% of this bill, so shortening prompts has a low ceiling" on a workload that was
almost entirely prompt. The one piece of advice the command exists to give, exactly
inverted.

Absent and corrupt are different things now. An absent field is a zero somebody may
legitimately mean — a log recording only what its author cared about is not
corrupt. A field that is *there* and unusable rejects the line, which puts it in
`skippedLines` where the report names it.

**A wholly unpriced log printed a report of zero rather than no report.** The empty
guard required both the priced and unpriced counts to be zero, so a log whose every
model was unknown fell through and printed a full report built from a zeroed total:
`0 calls · $0`, four zero rows, a meaningless "Input is 0.0% of this bill", and — on
a log holding a hundred thousand cache-read tokens — the flatly false **"Caching was
never used on these calls."** Two affirmatively wrong claims, and the only correct
line on screen was the quietest one.

### Added

**`trazum profile <log.jsonl>` — the command on top of the usage reader.** Reads a
usage log and prints where the money went: the bill, the split across input, cache
reads, cache writes and output with each one's share, the cache hit rate that
actually happened, and a breakdown by label and by model.

It leads with the part of the bill worth arguing with. When output is over half it
says so and names the two controls that move it — shorter answers and
`max_tokens` — because at that point shortening prompts has a low ceiling and the
rest of this tool is about shortening prompts.

**Money is never suppressed here, unlike every other report.** The rest of the CLI
hides dollar figures on a subscription host, because a saving quoted to somebody on
a flat plan is money that does not exist. This log records metered API calls
somebody was already billed for: the bill exists wherever Trazum happens to be
running, so the host has no bearing on it. A test pins that, since the general rule
is the opposite.

**Every part prints, including the zero rows.** A row missing because it was zero
reads as a row somebody forgot, and "your cache writes are zero" is a finding — it
is how you see at a glance that caching is off.

### Fixed

**The headline claim printed twice.** When output was both the largest part and
over half, the report said "Output is 61.8% of this bill" and then "Output is 61.8%
of this bill, so shortening prompts has a low ceiling here" on the next line. The
same fact in adjacent lines reads as a bug because it was one; only the sentence
that says more prints now.

**The command-count guard could not tell a live claim from a record.** It covers
`RELEASES.md`, which was right — the count drifted there once and went unnoticed
for two merges — but it read the whole file, so "Twelve commands now, up from four"
in the **1.8.0 notes** failed against a thirteenth command. That sentence is true
about 1.8.0.

Below the first version heading `RELEASES.md` is a record, and rewriting it to
match the present is falsifying history to satisfy a test. The standing header is
still checked, which is where the drift it was written for actually lived — proven
by reintroducing that drift and watching it fail.

**The second guard in this release to need that distinction**, after the one on the
published error band. Worth noticing as a pattern: a file that mixes current claims
with dated ones needs a guard that knows which half it is reading.

### Added

**`profileUsage` — reading what the provider actually charged, rather than
estimating what a file would cost.** The first piece of the answer to the thing
this release measured and could not fix: on an ordinary support prompt the
deterministic rules recover about **1%** of the monthly figure, while output
tokens alone were **87%** of it. A tool that reads `prompts/*.txt` cannot see
retrieved context, conversation history, tool results or answers, and on a RAG or
agent workload those are nearly the whole invoice.

It takes a JSON Lines usage log and says where the money went — by label, by model,
split across input, cache reads, cache writes and output — plus the cache hit rate
that actually happened.

**It reads a file, and that is the design.** Not a proxy, not an SDK wrapper.
Trazum's security position is that prompts do not leave the machine they are on,
asserted by tests rather than promised, and sitting in the request path trades that
away for convenience.

**The format is the one the API already returns.** `model` plus the `usage` object
from any Anthropic response, flattened or nested. OpenAI's shape is accepted too,
with the one real difference handled: OpenAI counts cached tokens **inside**
`prompt_tokens` while Anthropic reports them beside `input_tokens`, so treating
them alike bills the cached half at the full rate as well as the cached rate.

**There is nowhere to put prompt text.** The record shape has no content field, so
a usage log handed to Trazum cannot contain a prompt even by accident — a stronger
promise than "we do not look at it".

**And it reports no saving**, deliberately. Attributing "you could have saved X" to
a call that already happened means guessing what the call should have been, which
is exactly what this exists to stop doing.

### Fixed

**A model the catalogue does not know was making the total too low.** Found in the
first smoke run of the module above, and it is the same fault as the three
advisories fixed earlier in this release: counts were accumulated **before** the
price lookup could fail, so an unpriced call contributed its tokens to the totals
and its dollars to nothing. `total.inputTokens` included it, `total.inputUsd` did
not, and a cost-per-token taken from that report was wrong by however much of the
log was unpriced — silently, and in the flattering direction.

A production log will contain models this catalogue has never heard of: a
fine-tune, a preview, a competitor. They are now kept entirely separate, so every
token in the priced total is a token the dollars describe, and the size of what
could not be priced is visible rather than folded into a number that looks
complete.

### Fixed

**A high-severity advisory in `nanoid`, reachable only from the web app's build.**
`GHSA-2v37-7h3g-55p8` — a custom generator can loop indefinitely when size is zero.
It arrives transitively: `@tailwindcss/postcss` → `postcss` → `nanoid`, in
`apps/web`, which is `private: true` and deployed rather than published.

**No published package is affected, and that is asserted rather than assumed.**
`@trazum/core` carries zero dependencies and the CLI and MCP server carry only each
other, which `security.test.js` enforces from the root `workspaces` globs. The
exposure was a build-time tool in a private app.

Fixed in the lockfile, 3.3.17 → 3.3.18, and **verified transitively** rather than by
reading `npm audit` once. That distinction is in `SECURITY.md` for a reason: the last
time this repository cleared an advisory, Dependabot raised the direct dependency to
`next@16` and left the vulnerable `postcss` and `sharp` pinned in the lockfile, so
the advisories survived the upgrade meant to fix them. Reinstalled from the lockfile
and re-audited: 0 vulnerabilities.

### Changed

**The README's action pin advanced to the 1.10.0 commit.** It can only move after
the merge it names exists — `security.test.js` asks git what version the pinned
commit declares in its own manifest, so a pin cannot be advanced inside the commit
it points at and cannot carry a label its target does not have.

## 1.10.0 — "Every hard edge, both sides"

**A minor rather than a patch, because it changes every report.** The published
error band drops from `±15%` to `±10%`, which moves the number printed beside every
token count Trazum has ever shown, and a fourteenth finding joins the list.

The band moved because **kana and han do not cost the same**. Charging one token per
CJK character put Japanese at +11.2%, the worst error in the corpus, while Chinese
sat at -3.2% under the identical rule. No new measurements were needed — the finding
was in the twenty-one samples already committed.

Then three advisories turned out to share one fault: an estimate with a ±10% band
compared against an absolute threshold, and the answer stated as a fact. One offered
$48.67 a month that could not be collected. One promised money on a prefix that
might not clear the cache minimum. One said "the call will fail" as a certainty, and
said nothing at all in the case where a prompt that seemed to fit really might not.
All three are fixed, and a guard derived from the pricing catalogue now covers the
pattern across eighteen models so it cannot ship a fourth time.

**1.9.1 was prepared and never published.** Its tag failed three times against a
trusted-publisher configuration that npm kept refusing, and everything in it is
contained here. This release supersedes it.

### Added

**A guard so the threshold fault cannot be shipped a fourth time.** The same
mistake was found and fixed three times this release — an estimate with a ±10% band
compared against an absolute threshold, and the answer stated as a fact.
`threshold-honesty.test.js` asserts the property instead of the three instances.

It is **derived from the pricing catalogue**, not from a list of thresholds typed
into a test: eighteen models, four distinct cacheable minimums, six distinct context
windows, and a model added later with a new window is covered without anybody
remembering to. Weak about wording, strong about presence — it does not care what
the caveat says, only that a report facing a line its own error band straddles
admits it somewhere. Pinning the phrasing would make it a copy test.

**Silence is a failure, not a skip**, and getting that wrong is how the first
version missed the bug it was written for. It skipped when no relevant finding
existed — which is precisely the quiet failure mode — so deleting `context-near-limit`
left it green. The one legitimate silence is a threshold the model does not have.

Coverage stated exactly in the file: reintroducing faults 2 and 3 fails it, both
halves of 3 included. Fault 1 does not, because its property is different — "offers
a saving the tool would refuse to deliver" rather than "admits uncertainty" — and
that one is guarded by the advice-matches-action sweep in `cache-minimum.test.js`.
Two properties, two tests, said out loud rather than implied.

The first version also fed the cache advisories a bare token count with a
placeholder prompt, and those advisories reason about the stable prefix of the real
text. A two-token prompt labelled 486 tokens is nowhere near any minimum, so it
reported eighteen failures against correct code — a test measuring its own fixture.

### Added

**`context-near-limit`, for the prompt that fits by estimate and might not fit at
all.** The third place a ±10% number was compared against a hard threshold and the
answer stated as fact, after `cache-prefix-reorder` and `prompt-caching`. This one
carries no dollar figure and was the most absolute of the three: **"The call will
fail."**

It was wrong in both directions. An estimated 205,000 tokens against a 200,000
window can truly be 184,500 — the call succeeds, and the reader was sent to split a
prompt that fitted. An estimated 199,000 can truly be 218,900, which does not fit,
and **nothing warned at all**.

The silent direction is the worse one and it is the new advisory. A prompt over the
window fails outright rather than degrading, so there is no partial result to
notice and no other finding covers it.

### Fixed

**`context-overflow` no longer states a prediction as a fact.** Barely over the
line it says the call will *probably* fail and names `--exact-tokens`; far over, it
still says the call will fail, because it does. Hedging there would be its own
dishonesty.

Neither fires on a number the caller measured. An exact count near the edge is not
uncertain, and telling somebody their measurement might be wrong pushes them toward
a check they have already done — the same rule the other two advisories follow.

**Three advisories, one fault, found by asking twice whether it had a twin.** The
pattern is worth naming because it will recur: any comparison of an estimate
against a hard threshold has two failure modes, and the quiet one is usually worse
than the loud one. The sweep tests now cover the seam around each threshold rather
than sampling either side of it.

Adding the id made the typed union fail the web app's catalogues and a derived
guard fail the README's count of findings. Both are the mechanisms working.

### Fixed

**`prompt-caching` hedged in one direction and promised money in the other.** Found
by asking whether the bug just fixed in `cache-prefix-reorder` had a twin. It did.

`below-cache-minimum` hedges when an estimated prefix lands just *under* the
threshold — the real one may already be over, and withholding the largest saving
Trazum offers on the strength of a ±10% figure is wrong advice. `prompt-caching`
did **not** hedge when an estimate landed just *over* it. With a ±10% band an
estimated 528-token prefix can truly be 475, and then nothing caches at all and the
dollar figure printed beside the advisory is uncollectable.

Same fault as the reorder advisory, opposite direction, and this is the direction
with money attached. The hedge qualifies the figure rather than withdrawing it —
the prefix probably does clear the line — and names `--exact-tokens`, which settles
it for free.

Only on an estimate. A caller who supplied their own counter has an authoritative
prefix, and telling them it might be wrong pushes them toward a check they have
already done.

### Added

**A test that no size around the threshold makes an unqualified claim.** Whichever
advisory fires, if the band around the estimated prefix straddles the minimum, the
text has to say so. Swept across the window rather than asserted on two samples,
because the fault was an asymmetry between two code paths and only a sweep can show
the seam between them is closed.

It reads the prefix from `analyzeCachePrefix` rather than scraping `~528` out of the
sentence. The first version did scrape it, defaulted to "straddles" when the regex
missed, and reported two failures against correct behaviour — a test asserting its
own parsing instead of the property.

### Fixed

**`cache-prefix-reorder` was offering money that could not be collected.** It fired
whenever enough stable content sat after the first placeholder and priced moving it
forward at 90% off — without asking whether the prefix that rearrangement would
build actually clears the model's cacheable minimum.

On a 306-token support prompt against Claude Opus 5's 512-token minimum, the best
prefix any ordering can produce is 302. Nothing caches at any ordering. The
advisory offered **$48.67 a month**, in the same report as `below-cache-minimum`
telling the reader caching would not work here at all — two findings contradicting
each other, with the dollar sign winning the argument.

`reorderForCache` had refused these prompts from the start, for precisely this
reason, so Trazum's advice and Trazum's action disagreed: take the advice, run
`--reorder`, watch nothing happen. A money figure in the flattering direction is
the one fault this file exists to catch.

The gate is a strict comparison against the minimum. **No band hedge, and that was
tried first** — widening it by ±10%, on the reasoning that makes
`below-cache-minimum` hedge near the line, opened a window between 466 and 512
tokens where the advisory offered and the command refused. The same fault one layer
up, and the test caught it. The near-the-line case is already handled in the right
place: `below-cache-minimum` names `--exact-tokens`, and once the number is certain
both work from the same certainty.

### Changed

**The advisory names the command that does it.** It described the rearrangement in
prose and left the reader to perform it by hand, while `reorderForCache` sat in the
same package able to attempt it — whole blocks only, refusing any block that refers
back to earlier text, and everything after one. It now prints
`trazum optimize <file> --reorder` and still says to read the diff, because this is
the one transformation that moves text rather than deleting it.

An advisory that withholds the command is the shape of the whole product problem:
Trazum knowing something worth more than what it does about it. On a 1,355-token
prompt the command takes the cacheable prefix from **13 tokens to 1,350**.

### Added

**A test that the advice and the action cannot disagree.** For every size in a
sweep: if the report offers the saving, `reorderForCache` must deliver movement.

One-directional on purpose, and the direction took two attempts to get right. The
first version asserted that `cache-prefix-reorder` and `below-cache-minimum` never
appear together — wrong about the product, not the code: on a prompt with plenty of
movable content both are true and both useful, a diagnosis followed by its fix. The
second asserted the converse as well, and failed against working code because below
200 movable tokens the advisory stays deliberately quiet while the command remains
available. Silence about a small win is not the same fault as a promise about an
impossible one.

### Changed

**The published error band drops from ±15% to ±10%, and the worst measured error
from 11.2% to 6.4%.** No new API calls were needed for this — the finding was
sitting in the twenty-one measurements already committed.

**Kana and han do not cost the same.** Every CJK character was charged one token,
and measured against the counting endpoint that put Japanese at **+11.2%** — the
worst figure anywhere in the corpus — while Chinese sat at **−3.2%** under the
identical rule. One constant cannot be right for both, and the samples say why: the
Japanese file is 58% kana and the Chinese one is 0%.

Kana are a small syllabary that appears in every sentence, so a merge table covers
runs of them and several characters share a token. Han are tens of thousands of
rare characters a merge table cannot cover, and they cost about one each. Measured:
kana 0.75 tokens per character, han 1.05.

```
cjk-japanese   +11.2%  →  -1.5%
cjk-chinese     -3.2%  →  +1.3%
worst in corpus 11.2%  →   6.4%   (code-heavy, which nothing is fitted to)
```

**The signal needs no detector**, which is what separates this from `language.ts`.
A character is kana or it is not; the two samples separate perfectly at 58.3%
against 0.00%. No refusal case, no margin rule, nothing to get wrong on a
three-line prompt.

**Rounding up per run was the first attempt and it was wrong by five points.**
Ordinary Japanese alternates kana and han inside every sentence, so the runs are
short and numerous, and a `Math.ceil` per run charges most of a token for each
boundary — an artefact of where the loop breaks rather than of what the text costs.
CJK accumulates as a fraction now and is rounded once, over the whole document. A
test builds the same characters blocked and alternating and requires the two
estimates to agree within one token.

**The band is 10 rather than 7, and the margin is deliberate.** 6.4 rounded up is
7, and publishing 7 would be a tighter claim than twenty-one samples across six
text types can support: there is no Korean here, no Cyrillic prose, no mixed-script
document, and a seventh type could easily land at eight. A band that becomes false
the first time somebody measures something new is the exact fault this whole
exercise was fixing, so the uncertainty is overstated rather than understated.

### Added

**Accuracy is ratcheted per text type, separately from the published band.** The
band is deliberately loose and that has a cost: a change taking CJK from 1.5% back
to 3.6% passes every band assertion, because both are inside ten. Found while
mutation-testing this very change — setting `HAN_TOKENS_PER_CHAR` back to a round 1
doubles the CJK error and nothing failed.

Each type now carries a floor set to what it has actually reached. They tighten,
never slacken: an improvement lowers its floor in the same commit, and a deliberate
trade raises it with a changelog line, which is a different act from not noticing.
A type added to the corpus without a floor fails the suite rather than going
ungated.

Same idea as `trazum baseline` turned on this repository's own numbers — publish a
ceiling, gate on drift away from what you had.

**`RELEASES.md` and `ROADMAP.md` join `CHANGELOG.md` as records exempt from the
band-consistency guard.** The guard requires every file stating a band to match the
code, which is right for a README and wrong for a release note: "the band is still
±15%" is a true statement about 1.9.0, and rewriting it to say 10 would be
falsifying a record to satisfy a test. The other twenty files it flagged were live
claims and were updated.

### Fixed

**The preflight told the reader to disbelieve it, and it was right.** The caveat
closed with "believe your settings over this check", on the reasoning that the
exchange endpoint is undocumented and a refusal could be the request being wrong.

Then it was tested. `v1.9.1` was tagged against settings that had just been filled
in on all three packages; the check said `rejected`; the publish failed with the
same `E404` it predicted, twice. The check has been right in the only case that
has ever tested it, and the caveat argued the reader out of a true finding — which
is worse than no caveat.

It still says the endpoint is undocumented, because that is true and matters. It
now also says it has been right once, and asks to be believed until it is not.

**And the diagnosis was unreachable for a third time.** The auth check runs before
`verify`, which then prints thousands of lines, and GitHub's logs API returns the
*tail* of a job — so the block naming what npm must match could not be retrieved
while a release was actually failing, twice during v1.9.1. Writing it to the job
summary fixed that for anyone on the run page and not for anyone reading the log,
which is where a failure gets read.

The failure step repeats it now, at the end, where the tail always reaches. Four
lines, and it is the difference between an error and a diagnosis.

### Changed

**The report was leading with its smallest number.** Measured rather than
assumed: on an ordinary customer-support prompt — already reasonably written,
which is what a real one is — the rules recover **three tokens of 306**, worth
$0.75 a month. The advisories listed below them on the same prompt are worth
$345 and $48. The report opened with `-1.0%` and closed with the comparison.

`Start here:` is the first thing in the report now:

```
Start here:
  "This task may not need Claude Opus 5" — $345.45/month, 461× what the
  rules saved.

Input tokens
  306 → 303   -1.0% (estimated, ±15%)
```

That ordering was not a presentation quibble. It taught the reader that
shortening the prompt is what this tool is for, and on any prompt somebody
competent wrote, shortening it is the smallest thing available. The rules earn
their keep on genuine bloat — a duplicated paragraph, "due to the fact that",
where they measure **-23.5%** — and recover close to nothing once it is gone,
because they recover waste rather than creating savings. Both figures are from
the same build, minutes apart, on two prompts.

Nothing about what Trazum computes changed. It already knew the advisory was
worth 461 times more and said so at the bottom of the screen.

One thing got simpler on the way. The line's guard was duplicated — an early
return *and* a filter, both keyed on the same condition — which made it
untestable: removing the guard left the filter still suppressing the line, so a
mutation that priced a flat plan passed. Two checks for one condition is one
check and one place for a bug.

## 1.9.1 — "The preflight"

**A release whose point is that the next one publishes itself.** 1.8.0 and 1.9.0
both went out by hand — the first because the packages did not exist yet, the
second because the trusted publisher had not been configured — so neither carries
provenance. Nothing in the repository could tell you in advance which way a tag
would go.

It can now, with one caveat stated in the entry below: the endpoint it asks is
undocumented, so a refusal can be the check being wrong rather than the settings.
It says so, and it never gates.

### Fixed

**A token claim could have rearranged the summary it was written into.** CodeQL's
third finding on this script, and the same class as the first two: a value that
arrives over the network reaching somewhere it can do more than be read. The job
summary is *rendered markdown*, and the claims are decoded from a JWT fetched from
the runner's token endpoint — so a claim carrying a backtick fence would close the
code block it was meant to sit inside, and everything after it would render as
page rather than as data.

A garbled summary is the mild version. One that reads as though it says something
it does not is the reason to bother.

**The first fix was the shallow one.** Sanitising the claim strings addressed how
they could rearrange a rendered document and left the plainer fact underneath: a
value fetched over HTTP was being written to a file, and CodeQL said so again.

So the block does not quote the token any more. The values printed come from
**this run's own environment** — `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_REF` — which
is the authority on what this job is, while the token is a statement about it made
elsewhere. The token is reduced to one computed word per field: `agrees`,
`DIFFERS`, `absent`. A disagreement is still visible, which was the whole point,
and nothing this process did not author reaches the file. The HTTP status in each
verdict is narrowed to a known integer for the same reason.

It is also a better diagnosis. It prints what to type into npm rather than what
the token happened to say, which is the question somebody reading a refusal
actually has.

**One value still slipped through: the HTTP status.** `rejected (${res.status})`
put a number npm invented into a string that ends up in the file, and narrowing it
to an integer was not enough — the flow is the finding, not the shape of the
value. The status selects one of five labels this file chose, and the unknown case
keeps its number on **stdout only**, because a status nobody can see is a dead end
for whoever has to work out what happened, and a log is not a document this script
is composing.

**And a test was asserting one spelling of one payload.** It checked the summary
did not contain `<script>`, which CodeQL correctly called a bad filter: it would
pass against `<SCRIPT>` and against everything else a hostile value could open. It
asserts the property now — no markup characters in the summary at all — which is
what the code guarantees.

**The auth preflight asked about one package and reported on one package, and
the first real run showed why that is not enough.** It checked the first name
alphabetically — `@trazum/cli` — on the reasoning that a misconfiguration is
all-or-nothing. It is not. The trusted publisher is a setting on three separate
pages, one per package, so configuring two of them is the easiest mistake
available. And the release publishes `@trazum/core` first, so the package that
actually stops a release need not be the one that was asked about.

It asks about every published package now and prints a line for each, so a
partial configuration reads as one:

```
  configured            @trazum/cli
  rejected (404)        @trazum/core
  configured            @trazum/mcp
```

**And "a claim does not match" now says which claim.** That sentence names a
category rather than a field and leaves the reader comparing four settings
against nothing. On a refusal the step prints the four claims npm matches on —
repository, workflow ref, environment, ref — beside the failure. `environment:
(absent)` is the answer whenever it appears: the claim exists only when the job
declares an environment, so an npm rule requiring `release` can never match a
token without it.

The claims are an allow-list and **the token itself is never printed**. Those
values are public metadata about the run; the token beside them is a bearer
credential npm would accept, and a public log is forever. Two tests hold that
line — one fails if the payload is dumped wholesale, one fails if the token is
printed at all.

### Added

**The release workflow can now tell you whether a tag will publish, before you
push the tag.** 1.9.0 was tagged, passed every check, and failed on the last step
with `E404 Not Found - PUT` because the trusted publisher had not been
configured. Nothing was published — but the tag was spent and the release went
out by hand for the second time running, which means no provenance for the second
time running.

Both of the things that went wrong were knowable in advance, and neither was
checked. `scripts/npm-publish-preflight.mjs` asks them now.

**Can this workflow authenticate?** It puts a GitHub-signed OIDC token to npm's
token-exchange endpoint — the same question the upload steps ask — and answers
`configured`, `rejected` or `could not verify`. It runs on `workflow_dispatch`
too, so a dry run finally settles this: before, a dry run proved the environment
gate existed and nothing at all about npm, and the only way to test a trusted
publisher was to spend a version number on it.

**This one never fails the job, deliberately.** The exchange endpoint is npm's
own plumbing rather than a documented API, and a gate built on it would one day
block a release that would have worked — worse than the failure it prevents. It
reports; the upload is still the authority. A test pins that, because "it only
warns" is the kind of property that quietly becomes "it fails on Tuesdays".

**Is any of these versions already spent?** npm never reuses a version, and the
packages publish in dependency order, so the expensive shape is core uploading,
the CLI failing, and core's number being gone. Checking all three against the
public registry before the first upload turns that into a clean abort. This one
**does** fail the job — it reads a documented API, and a version that already
exists is not a maybe. An unreachable registry fails it too: not answering is not
evidence a version is free.

**And npm's 404 no longer names the wrong problem.** Any publish failure now
prints what `E404 Not Found - PUT` actually means, with the four fields to check
and which one people leave blank. That diagnosis existed in `docs/releasing.md`
and was no use to anyone who did not already know to look there.

All five guards are mutation-tested: reporting a taken version as free, treating
an unreachable registry as free, making the auth check fail the job, dropping the
version preflight from the workflow, and tag-gating the auth check so a dry run
cannot answer it. Each one fails the suite.

**CodeQL raised three alerts on the first version of it, and all three were
right.** Both halves of every URL here come out of a file, and a manifest is
trusted by convention rather than by anything enforced — it is whatever is on
disk when the release runs, and this script turns it into a request to a host
that holds publish rights.

So the values are checked at the boundary now, on the same principle as
`checkedEndpoint` in `net.ts`: a name that is not a package name and a version
that is not a version stop the release rather than being sent to a registry to
find out. Every URL is built through one helper that encodes its segments and
then asserts the result is still on the registry's own origin — if a value ever
did reach the path structure, the request does not leave rather than leaving for
somewhere else.

The high-severity one was `name.replace('/', '%2f')`, which encodes the *first*
slash and leaves any others. A scoped name has exactly one, so it worked; it is
the same shape as the regex `release-notes.mjs` built out of a version string,
and hand-rolled encoding that happens to be right is still hand-rolled encoding.
`encodeURIComponent` now, verified against the live registry to accept the
encoded `@`.

Putting the incomplete escape back fails no test, which is the honest outcome
rather than a gap: the name validation makes the two forms equivalent for
anything that reaches them, so a test failing on one would enforce a preference
instead of a requirement. CodeQL is what guards it, and it runs on every pull
request.

### Changed

**The README's action pin advanced to the 1.9.0 commit**, from a 1.0.0 commit it
had been sitting on since that release. The pin can only move after the merge it
names exists, which is why this is a separate change from the release that made
it correct — `security.test.js` asks git what version the pinned commit declares
in its own manifest, so a pin cannot be advanced in the commit it points at, and
cannot be labelled with a version that commit does not carry.

## 1.9.0 — "The error band, measured"

**The release that found out the central claim was false, and fixed it.**

`±15%` had been printed on every report for eight releases, with every dollar
figure descending from it, and nothing in this repository established that it
held. The first run of `measure-token-band.mjs` against the official counting
endpoint found it did not: the numeric sample was 30.6% under, Spanish prose
22.1% under. Nine of eleven samples underestimated, always in the direction that
under-reports cost.

Two things were wrong. Digits were counted at three per token where Claude splits
them far more finely — corrected in isolation, that sample went to -5.0%. And the
estimator turned out to be calibrated **for English specifically**, not for prose:
German measured -37.3% under one divisor that served every language.

The band is measured now, at ±15%, and it landing back on the old number is a
coincidence rather than a restoration: that 15 bounded nothing, and this one
bounds **twenty-one samples across seven languages and six text types**, worst
case 11.2%. Every language divisor has a held-out test in a different register.

Also here: `trazum baseline` and a `check` that gates on drift rather than only on
a ceiling; a pull-request comment that leads with what the branch costs; and
`below-cache-minimum` no longer asserting from an estimate near a hard threshold,
which was wrong advice rather than an imprecise figure.

The sections below are as they accumulated, entry by entry, and were not
consolidated: they are the record of what happened in the order it happened.

### Fixed

**`SECURITY.md` claimed prompts are never stored, and that stopped being true
when `--suggest --cache` shipped.** The sentence was written when it was
unqualified and correct; the cache arrived later and nobody went back to the
security document. It writes the model's raw response, keyed by the prompt, to a
file under the user's home directory.

Nothing about the feature is wrong — it is opt-in, it is local, and the files
are `0600` in a `0700` directory precisely because a prompt is the most sensitive
thing this tool touches. What was wrong is a security document telling a reader
that no such file exists, which is the kind of error that survives review because
it reads as reassurance.

The paragraph now says what is guaranteed (nothing about a prompt reaches a
server that keeps it) separately from what the CLI can be asked to do on the
machine it already runs on, and names where to delete it.

**The repository-hardening checklist listed a step that is done and enforced.**
Pinning every third-party action to a commit SHA was item 6, phrased as
something to run once there is network access. It has been done for several
releases and `security.test.js` fails any `uses:` naming a tag or a branch — so
it is not a checklist item, it is an invariant, and it moved to a section that
says so. The list also had two items numbered `3` and a closing line counting
five of six.

### Changed

**The corpus went from eleven samples to twenty-one, and every divisor now has a
held-out test.** The eleven that set the band left three languages calibrated on a
single sample each, which is a fit rather than a measurement: a divisor chosen to
minimise the error on one file will always look good on that file.

Ten samples were added, in two rounds. The first round gave Italian, Portuguese
and Dutch a sample each — three languages that had a divisor by inheritance and no
evidence — and the second gave every calibrated language a **second** sample in a
different register: the first set are support prompts, the second are code-review
prompts, different vocabulary and different length. That second sample is what
turns the first from a fit into a finding, and all seven held:

```
                calibrated on   held out on
english             +1.0%          +0.4%
german              -9.2%          -8.5%
french              -1.2%          -5.8%
spanish             -6.2%          -9.7%
```

The divisors moved as a result — Italian and Dutch had been taking English's 4 —
and the corpus-wide worst case is unchanged at 11.2%, on Japanese, which no
divisor touches. Nothing in twenty-one samples is outside `±15%`.

**Italian had to be rebuilt, and the reason is worth recording.** Its first
function-word list was half Spanish: `per con del una sempre` are as common in one
as the other, so they earned nothing, the margin rule tied, and an Italian
code-review prompt came back `null`, fell through to the English divisor and
measured -21.9%. The detector was working exactly as designed — it refuses rather
than guesses — and the fault was a word list that could not tell the two apart.
The replacement is words Italian has and Spanish does not. Over-correcting it
broke the prose sample instead, which is the shape of this whole file: a list
tuned on one register is a list tuned on one register.

**What a hundred samples per language would have bought, and why they were not
written.** The counting endpoint is free, so the constraint was never money. It is
that every sample here was written by the same hand, and ninety more of those is
ninety more of the same bias — a tighter-looking number resting on nothing new.
Twenty-one real prompts bound the band honestly; a hundred invented ones would
bound it decoratively. The corpus grows one sample at a time now, and the samples
worth adding are the ones that came from somebody's actual work.

### Fixed

**`below-cache-minimum` was asserting from an estimate, and near the threshold
that made it wrong advice.** It compares the stable prefix against a hard limit —
512 tokens on Claude Opus 5 — and then tells the reader caching will not work
here. The prefix is estimated, so a prompt measured at 505 tokens could really be
at 540 and cache perfectly well. Not an imprecise figure: a reader told to stop
looking at the single largest saving Trazum offers.

Near the line it now says so, and names the way to settle it — `--exact-tokens`,
against an endpoint that is free. Far below the line it stays quiet, because a
hedge on every case is a hedge nobody reads.

**And it does not hedge a number the caller measured.** `count` defaults to
`estimateTokens`; a caller who supplied their own counter has an authoritative
figure, and telling them it might be wrong is its own kind of dishonesty — it
pushes them toward a check they have already done.

Both directions mutation-tested: hedging always fails the exact-counter test,
hedging never fails the near-threshold ones.

This was listed as *known, not fixed* one release ago. The window shrank when
language detection took the worst estimate from −37.3% to −9.2%; it did not close,
which is why this is a fix rather than a note.


### Fixed

**The estimator was calibrated for English and silently wrong for every other
Latin language.** Measured across eleven samples: German −37.3%, Spanish −22.9%
and −22.1%, French −15.1%, English +1.0%. Nine of eleven underestimated, always in
the direction that under-reports cost. Characters per token says why — English
3.44, French 2.66, Spanish 2.53, German 2.02 — while one divisor of 4 served all
of them.

`estimateTokens` now detects the language and divides accordingly:

```
german-prose        -37.3%  →   -9.2%
spanish-unaccented  -22.9%  →   -6.5%
spanish-prose       -22.1%  →   -6.2%
french-prose        -15.1%  →   -1.2%
worst in corpus      37.3%  →   11.2%   (Japanese, untouched)
```

The published band drops to **±15%** — the measured worst case rounded up, the
same rule that briefly made it 25. Landing back on the number that was a guess for
eight releases is a coincidence, not a restoration: that 15 bounded nothing, and
this one bounds eleven samples across four languages and six text types.

**The signal is not accents, and that was tested rather than assumed.** A Spanish
sample with zero diacritics measured −22.9% against −22.1% for accented Spanish,
which killed the hypothesis the previous release recorded. What separates these
languages is which words they are made of, so `language.ts` counts function words
— `the of and to` against `der die und ist` against `que los las del`.

**It answers `null` when unsure, and most of its tests are about earning that.**
A three-line prompt, a JSON schema, English instructions wrapped around a Spanish
example: no answer is safe for any of them, and a wrong language applies another
language's divisor to text that does not want it. `null` falls back to the English
divisor, which is what the estimator always did. Two bars guard it — four distinct
function words minimum, and a 1.6× margin over the runner-up — and removing either
one fails the suite.

One caveat stated plainly rather than buried: the four Latin divisors are
calibrated on one or two samples each, so their residuals are in-sample and
optimistic by construction. The band is set by the seven samples nothing was
fitted to. The honest test is the next held-out sample in Spanish, French or
German, and the corpus grows one sample at a time now.

### Known, not fixed

`below-cache-minimum` compares an *estimated* prefix against a hard 512-token
threshold, so an underestimate can report "caching will not work here" when it
would — wrong advice, not just an imprecise figure, and it costs the reader the
largest saving Trazum offers. The worst estimate on measured text is now −9.2%
rather than −37.3%, which shrinks the window considerably but does not close it.
The advisory should hedge near the threshold; that is its own change.


### Added

**The corpus can grow now, and three samples were added to falsify a
hypothesis.** Measuring the band left one finding unexplained: Spanish prose
comes out 22.1% under while English comes out 1.0% over, and accents are not the
cause — weighting them from 2 to 5 moves the figure three points. The candidate
explanation is merge-table coverage: text that is not English costs more tokens
per character whatever its diacritics.

`spanish-unaccented.txt` is the test that can prove that wrong. It is Spanish with
**zero** accented characters, so if accent density were a usable detector for "this
is not English" — and on the old corpus it separated perfectly, 0.00% against
1.71% — this sample would slip past it and stay underestimated. If instead it
lands where accented Spanish lands, the phenomenon is the language and the accents
were a coincidence of one file. `french-prose.txt` (1.83% accented) and
`german-prose.txt` (1.64%) say whether other Latin languages behave like Spanish
or like English.

Adding them required fixing something first. **The freshness digest covered the
whole corpus, so it could not tell an edited file from an added one** and answered
both with "re-run the script" — correct for an edit, wrong for an addition,
because it retires eight measurements that cost an API call each to admit one new
sample. The corpus was effectively frozen: growing it was gated on a key nobody
wanted to spend.

Digests are per sample now, via `digestOfOne`, and the two cases get what each
deserves. A file that changed since it was measured **fails** — its measurement
describes different text, which is the dangerous case because it passes while
being wrong. A file with no measurement **skips out loud** and is named, with the
command to run, because a gap in coverage is something to report rather than a
reason to distrust what has been measured. The existing fixture was migrated
without new API calls, which is sound only because the whole-corpus digest still
matched: that match is the proof those eight files are the ones that were
measured.

One guard had to be loosened to its intent rather than its letter: it asserted
`import { digestOf }` literally and failed the moment `digestOfOne` was imported
alongside it — a guard that breaks when you use more of the thing it protects.

**A global correction factor was tried and rejected.** The best available (×1.05)
takes the worst case from 22.1% to 18.2%, and does it by pushing Japanese from
+11% to +17% and English from +1% to +6%. That is redistributing error, not
reducing it, and it damages the two samples the estimator gets right.


### Fixed

**The ±15% error band was never true, and now it is measured.** Eight releases
printed it on every report and every dollar figure descended from it, while
nothing in this repository established that it held. The first run of
`scripts/measure-token-band.mjs` against the official counting endpoint found two
of eight samples outside it, **both underestimating**:

```
numeric-heavy    estimated 277, actual 399   -30.6%
spanish-prose    estimated 352, actual 452   -22.1%
```

Underestimating tokens means under-reporting cost. Trazum was telling people
their prompts were cheaper than they are — the flattering direction, and the worst
one for a tool whose whole argument is honest cost accounting.

**One constant was simply wrong.** Digits were counted at three per token; Claude
splits long runs far more finely, because a merge table cannot cover every number.
Correcting it in isolation — nothing else touched — takes the numeric sample from
−30.6% to **−5.0%** and moves no other sample more than four points.

**The Spanish error is not about accents, and that matters.** Weighting accented
characters from 2 to 5 moves that sample by three points. Spanish words tokenize
into more tokens than English words of the same length *even when they are pure
ASCII*, because Spanish is thinner in the merge table — so no per-character-class
constant can fix it, and one Spanish sample cannot calibrate a signal that would.
English prose lands at +1.0%, which says the estimator's structure is sound and
its coverage of non-English text is not.

So the published band is now **±25%**: the measured worst case (22.1%) rounded up,
because eight samples cannot bound a worst case tightly and the honest direction
to be wrong in is the pessimistic one. It is `ESTIMATE_ERROR_BAND_PCT`, exported
from the core — it had been a literal in twenty-three files with its only
machine-readable copy in a test, which is why correcting it meant a hand sweep
across three locale catalogues, four READMEs, the MCP tool descriptions, the web
app and the demo. A guard now fails when any file states a band the code does not
publish, with `CHANGELOG.md` excluded because rewriting history to match the
present is the opposite of a changelog.

The roadmap predicted CJK would be the problem. CJK is fine at −3.2% and +11.2%.
It was wrong about which text type and right that one number cannot cover all of
them.


### Changed

**1.8.0 is on npm.** `@trazum/core`, `@trazum/cli` and `@trazum/mcp` were
published by hand on 2026-08-13. The first publish had to be manual — a trusted
publisher is configured on a package's settings page, and that page does not
exist until the package does — so every release after this one goes through a tag
with no credential anywhere.

The documentation caught up: the "not published yet" notes are gone from
`RELEASES.md`, the front page and both package READMEs, and `Getting started`
leads with `npx @trazum/cli` instead of instructions for building from source,
which are now folded away for people working on Trazum itself.

**The guard that watched those notes was keying on the wrong thing, and the
publish proved it.** It asked whether `v1.8.0` was tagged, on the reasoning that
`release.yml` publishes on a tag and nothing else — checkable offline, which a
test in CI should be. But the first publish could never go through a tag, so no
tag was pushed, and the repository went on telling every visitor that nothing was
installable while three packages sat on the registry. That is the second signal
this claim has outlived; the first asked whether the changelog had a heading for
the manifest version, which is a release cut here rather than a package on npm.

There is no third proxy. Publication does not reverse, so the assertion is
one-directional now: no file may claim nothing is published. `docs/releasing.md`
records both traps the real publish hit — a `404 Not Found - PUT` is npm hiding
an auth failure behind a missing-scope error, and `npm view` 404s for minutes
after a successful publish because the packument propagates behind the tarball.


### Fixed

**npm was silently rewriting the manifest of both published binaries.** Every
`npm publish` answered `"bin[trazum]" script name was cleaned` — npm stripping
the `./` from `"./dist/index.js"` and uploading a manifest that differs from the
one in this repository. On npm 12 the same correction reads *"was invalid and
removed"*, which would put a package declaring a `bin` and carrying no executable
on the registry: `npx @trazum/cli` would resolve and then do nothing.

Caught on the first real publish attempt, in the wall of `npm notice` lines
nobody reads during the one command this repository cannot take back. Both
manifests now say `dist/index.js`, which npm has nothing to correct, and a guard
asserts it for every publishable workspace — plus that the target actually
travels in the tarball, since a `bin` pointing outside `files` is the same defect
arriving by a different route.

### Fixed

**The CLI test suite passed in CI and failed on a contributor's laptop.** Seven
tests, the first time anybody ran `npm run verify` on a machine whose locale is
not English — which was during a release, on the maintainer's Mac, with `LANG`
set to `es_ES.UTF-8`. Three spawns in `i18n.test.js` built their environment
inline from `process.env` and asserted on English output, so they inherited
whatever the machine said. A CI runner leaves `LANG` unset, so the bug was
invisible to the only place that was looking.

Five variants of that environment object had grown across the test files by then.
Three of them cleared `LANG`, `LC_ALL` and `TRAZUM_LOCALE`; **none** cleared
`LC_MESSAGES`, which `detectLocale` also reads — so even the files following the
"correct" pattern were one variable away from the same failure.

There is one environment now, in `packages/cli/test/env.mjs`, and it clears the
list of variables **imported from the detector** rather than a copy of it.
`LOCALE_ENV_VARS` is exported from `packages/cli/src/i18n/index.ts` and the
detector maps over it, so the list is the implementation: a variable added there
is read by the detector and cleared by the tests in the same commit, or in
neither.

It clears rather than pinning `TRAZUM_LOCALE: 'en'`, which was the first attempt
and was wrong — that outranks the project config, so every test taking its
language from `"locale": "es"` in `trazum.config.json` would have reported in
English and asserted against the wrong catalogue. Clearing the environment leaves
the precedence chain intact and only removes the machine from it.

Two guards keep it: one fails when any test file builds a spawn environment
inline, naming the file, and one asserts the shared environment clears every
variable the detector reads. Both mutation-tested, including reverting a file to
the exact shape that carried the bug.


### Added

**The pull-request comment leads with what the branch costs.** The Action has
been posting a budget table since it shipped: a list of files and whether each
one fits its ceiling. Useful, and not the question a reviewer is holding. What a
pull request proposes is a change, so the comment now opens with the change —
against the baseline recorded on the base branch — and puts the ceiling check
underneath it.

```
> [!CAUTION]
> **This branch adds 64 tokens (+67.4%) to the prompts here** — over the limit of 0 tokens, 5%.

| | Prompt | Baseline | Now | Change |
|:--:|---|--:|--:|--:|
| 🆕 | prompts/triage.md | – | 64 | +64 |

Monthly cost **$129.75 → $132.95** (+$3.20)
```

Only the directions that cost money are itemised. A list of every file that
shrank buries the two rows somebody has to act on — though a branch that made
things cheaper still gets its headline, because that is worth saying.

The rendered block comes from the same outcome the exit code was computed from,
so a green comment and a red build cannot disagree. It shouts only when a
threshold was actually crossed, names every limit that was crossed rather than
the first, and refuses to print a monthly delta when the scenario or the price
list moved — a figure in a pull-request comment gets quoted in a meeting, and two
different measurements subtracted is not a saving.

**No change to the Action was needed.** It already posts whatever
`check --markdown-out` writes, so the report carrying the cost diff is the whole
mechanism.

### Added

**`trazum baseline`, and a `check` that fails on drift rather than only on a
ceiling.** `budgets` answers "does this file fit". That is a ceiling, and a
ceiling has a blind spot: a repository sitting at 95% of every budget passes
forever while a pull request adds four hundred tokens across a dozen files.
Nothing busted, bill up. A baseline answers the other question — did this get
worse than the commit we agreed on — and it is the twelfth command.

`trazum baseline [dir]` records what the estate costs now to a file you commit.
With a `baseline` block in `trazum.config.json`, `trazum check` on a directory
reads it and gates on it **with no flag**, because a gate you have to remember to
pass an argument to runs in the author's terminal and not in CI. `--no-baseline`
skips it for one run.

The behaviour the whole thing turns on: a prompt that is *new* counts. Comparing
only the paths present in both documents would let a five-thousand-token addition
through every threshold — it is in neither the grown list nor the baseline total
— so the demonstration case is a run where every budget is green, no existing
file grew, and the build fails anyway because somebody added a file.

**The threshold is in tokens, and the money is only reported.** A dollar figure
comes from the token count, the usage scenario and the price list, and two of
those move for reasons that have nothing to do with the prompts. A baseline
holding dollars would fail a build the day a model was repriced, calling a price
change a regression, and a gate that cries wolf is a gate somebody deletes. When
the scenario or the price list has moved, the report says which one instead of
subtracting two different measurements and presenting the difference as a saving.

**A declared-but-missing or corrupt baseline fails the run.** A gate the config
asked for and could not execute is not a pass; otherwise deleting one file
silently switches CI off. That includes a hand-edited `totals.tokens` that
disagrees with its own per-file counts — the corruption that otherwise looks
completely normal. Neither threshold has a default and omitting both is a config
error, because every default here is silently wrong: zero tolerance gets the
block deleted within a week, and a generous one is a gate passing things nobody
agreed to.

`trazum.baseline.json`'s format joins the frozen API in `VERSIONING.md`, and it
is the strongest of those promises because the file is committed: it outlives the
Trazum that wrote it, so the document carries a `version` and an unknown one is a
loud error rather than a best-effort read.

Internally, the directory walk that decides what counts as a prompt was extracted
from `checkDirectory` so both commands share it. Two walks would be two
definitions of the estate, and the baseline would end up recording files the gate
never checks.

### Changed

**Trazum was selling the weakest half of itself.** The front page led with "cut
what your prompts cost", and directly underneath it the demo — real output, not
a mock-up — showed the rules recovering $24.00 a month while a single advisory
sitting above them was worth $528.40. Twenty-two times more. The tool has been
telling the truth about that gap for several releases; the pitch had not caught
up.

The framing now leads with the finding rather than the trim. The headline is
that most of an LLM bill is not the prompt, the advisories come first in *What
it actually does* with the trimming after them, and the caption under the demo
points at the two lines that make the argument instead of hoping the reader
notices. The package descriptions, the web app's title, tagline and lede all say
the same thing in both locales.

Nothing about the product changed — no rule, no advisory, no number. This is the
description catching up with what was already being measured.

The two counts the pitch now rests on — thirteen advisories, twelve rules — are
asserted against `RULES` and the `AdvisoryId` union, so a fourteenth advisory
cannot ship while the front page still says thirteen.

### Fixed

**The zero-dependency invariant was documented for three packages and enforced
for two.** `security.test.js` looped over a typed list — `packages/core` and
`packages/cli` — while `SECURITY.md` credited the invariant to all three
published packages. `packages/mcp` hand-rolls its JSON-RPC layer for exactly
this reason, and the test named as the reason had never heard of it. The list is
derived from the root `workspaces` globs now, with an assertion that the
derivation found the MCP server at all, so a suite that quietly resolves to
nothing cannot report "0 failures" from having checked nothing.
`CONTRIBUTING.md`'s first rule said "the core and the CLI" and now says what is
actually enforced, including why `apps/web` is exempt.

**Nothing checked that the README's images exist.** A moved or renamed asset
renders a broken-image placeholder to every visitor on the front page and tells
the person who moved it nothing. Local `src` and `srcset` paths are now asserted
to exist, absolute URLs deliberately excluded — somebody else's uptime is not
something a test here can hold.

The README's layout diagram also described `apps/web` as "Optimise and Compare",
one tab short since the prompt library shipped.

### Added

**A real screenshot of the web app on the README**, light and dark, swapped by
`prefers-color-scheme` so it matches the theme the reader is already in. Captured
from the production build rather than drawn, on the same wordy support prompt the
CLI demo uses.

### Changed

**The web app got a display voice, two tiers of depth, and browser surfaces that
belong to its own palette.** It had been correct and characterless: shadcn's
shapes wearing Trazum's colours, one system sans doing every job from the
wordmark to the percentage that is the entire point of the page, and a dark
theme in violet-grey borrowed from every other dashboard. Nothing about the
identity changed — paper, terracotta and ink are exactly what they were — but
the page now looks like it was built rather than assembled.

Fraunces Variable is self-hosted from npm and carries the wordmark and the
figures; the CSP's `font-src 'self'` holds, so no font is fetched from a foreign
host at runtime. Elevation is now two tiers and only two: working surfaces get a
hairline and a breath of shadow, and the result panel — the page's one focal
moment — drops its border rather than drawing the same edge twice. The dark
palette was warmed to the same umber cast as the light one so the terracotta
sits on Trazum's paper in both schemes. Selection, caret, focus ring and
scrollbars are themed from the palette, and the body sets tabular figures,
because every number on this page is a measurement and measurements align or
they wobble.

Two defects went with it. The reorder callouts were drawing a 3px coloured rule
down one side — a border doing a highlight's job — and are now a terracotta
wash. And on a narrow screen the history card sat between the Optimise button
and the answer the reader had just pressed it for; the two column wrappers
collapse to `display: contents` below `lg`, which makes every card a grid item
and lets history take `order-last` without moving a line of markup.

### Added

**The README leads with the receipts, and every markdown file caught up with the
code.** The front page now opens with a transcribed — not mocked — `optimize` run
as an SVG terminal, down to the closing line where Trazum admits the advisory is
worth 22× what the rules saved. The first draft of that SVG contained exactly one
invented figure, which its own header comment forbids; it was caught and replaced
with the real third advisory. A new guard derives the front page from the
workspace manifests: the architecture diagram had silently omitted `@trazum/mcp`
for the whole day that package existed, and now the next package added has to
appear in the README or `publish.test.js` fails.

The sweep also caught: `SECURITY.md` crediting zero dependencies to "the core and
the CLI" when three packages now carry the invariant; `CONTRIBUTING.md` counting
three workspaces and describing `phrases.ts` as "Spanish (and, in time, other)"
seven languages later; `docs/releasing.md` publishing two packages when the
workflow publishes three; the CLI README's command table listing five commands of
eleven; and `VERSIONING.md` freezing every API surface except the newest one —
the MCP server's tool names and input schemas are now part of the promise.
`RELEASES.md` and `ROADMAP.md` gained the account of everything that shipped
under 1.8.0's banner since their last update, provider layer and measurement
layer both.


**Automatic recovery from container rollbacks, at `scripts/recover-workspace.sh`
and a Claude Code SessionStart hook.** The remote environment this repository is
developed in restored its container disk to a stale snapshot more than twenty
times across two working sessions — every tracked file reverted, mid-work,
silently, always to the same commit. The first draft of this very script was
destroyed by the failure it exists to repair, one commit short of being safe.

**A script inside the repository cannot prevent that**, and this one does not
claim to: it reverts along with everything else. What survives a rollback is the
remote, so recovery is always fetch, reset to origin/main, reinstall — and the
script makes those one safe move. The rollback signature is precise (HEAD strictly
*behind* origin/main) and everything else is refused: a tree that is ahead is work
in progress, a diverged tree is a choice no script should make (exit 1), and
uncommitted changes are stashed by name before any reset rather than discarded.

`.claude/hooks/session-start.sh` runs it at the start of every Claude Code on the
web session — and only there, guarded on `CLAUDE_CODE_REMOTE`, because on a local
machine the tree is the developer's own and resets are not a hook's call.

Eleven behavioural tests drive the real script against real git repositories in
temp directories, including the one that matters most: the rollback also reverts
`.git`'s remote-tracking refs, so a script that compared HEAD to `origin/main`'s
*ref* would see them equal and announce nothing to recover. The fixture builds
exactly that state, and only a real fetch passes it. Thirteen mutants, thirteen
killed — among them "the stash disappears", "an ahead tree also gets reset" and
"a push appears", each the difference between a recovery script and a data-loss
tool with a reassuring name.

The definitive fix is platform-side — recreating the environment so it stops
restoring a stale snapshot — and is not something a repository can do to itself.

### Added

**`trazum prune <file> --cases <file>` — which few-shot examples earn their tokens,
measured rather than guessed.** The eleventh command.

The `redundant-examples` advisory asks a textual question: does this example look like
an earlier one? This asks a stronger one: does removing it change any answer? Two
examples can be textually unalike and teach the same thing, and the few-shot section
is routinely most of a prompt.

Leave-one-out against the prompt's own noise floor. Ask the full prompt twice to
learn how much the model disagrees with *itself*, then remove one example and ask
again; a removal that moves the answer less than that did no observable work. The
thresholds come from `evaluate`'s `verdictFor` rather than a second set.

**The only command that asks before spending.** The bill is `(2 + examples) × cases`
— 220 calls for a nine-example prompt over twenty cases. Without `--yes` it prints the
figure and stops, and it prints it *before* looking for a provider, so the cost is
visible without a key configured. `plannedCalls` is exported and pure, and a test
asserts the number it promises is the number spent.

**It reports "no effect on these inputs" and never "delete this."** An example may
exist for a case the given inputs do not contain. Nothing is edited, and the strength
of the claim is bounded by the inputs — which only the caller can judge.

`withoutExample` locates blocks by position rather than by
`prompt.replace(text, '')`: a copy-pasted few-shot section contains identical blocks,
and a text replace would match the first occurrence for both, so measuring the
removal of the second would describe the removal of the first.

Twelve mutants, twelve killed. Two defects came out of it that no test would have
found, because both were about *reading* the output:

- The first draft duplicated `agreement` from `evaluate.ts` as a bag-of-words F1
  while that one is Jaccard over normalised text — two different numbers under one
  name, with a comment in the copy claiming they were the same measure. `agreement`
  and `pooled` are now exported and shared, which makes the comment true.
- The report put a green tick beside "0% agreement without it", which reads as
  approval next to the one line meaning "leave this alone", and printed `Example:` as
  every block's identifying line. Both only visible by running it against a local
  stand-in provider, which is how they were found.

**`@trazum/mcp` — Trazum as an MCP server, so an agent can price and budget a
prompt before it sends it.** Three tools over stdio: `check_prompt`,
`optimize_prompt`, `list_models`. It runs on the caller's machine, one process
spawned by the client exactly like the CLI — no service to host, and no prompt
leaves the machine.

`check_prompt` has three outcomes rather than two, which is the reason it exists:
inside budget, over budget but the rules would fix it, or over budget with content
that has to be cut. A boolean throws away the actionable half.

**What it cannot do is the design.** No paths — every tool takes text, and the
package imports `@trazum/core` rather than `@trazum/core/node`, so the file-reading
capability is *absent* rather than unused. No network: `--suggest` and `eval` are
deliberately not exposed, because a tool an agent can invoke in a loop must not be
able to spend the caller's money. No writes.

**The JSON-RPC layer is written by hand, and that was not the first attempt.** It
used `@modelcontextprotocol/sdk` and thirteen tests passed against a real process.
Then `publish.test.js` refused it: every publishable package here carries no runtime
dependencies outside the repository, and the reason `security.test.js` gives — every
dependency is somebody else's code running on untrusted text — applies to an MCP
server with *more* force than anywhere else in Trazum. Relaxing the invariant at the
point it matters most would have been backwards, so the invariant won.

What that costs is stated in the module: the implementation covers `initialize`,
`notifications/initialized`, `tools/list`, `tools/call` and `ping`, and answers
anything else with `-32601`. It has been driven by a raw newline-delimited client in
the tests, not by every MCP client in existence.

Writing it by hand immediately produced the bug that justifies testing it: the
notification check sat *inside* the method switch, listing the two `notifications/*`
methods by name. A notification is defined by the **absence of an id**, not by its
method, so `{"jsonrpc":"2.0","method":"initialize"}` with no id got a reply —
a protocol violation some clients tolerate and others hang on, which is the worst
kind because it works in testing. A test that asked for the rule rather than for the
two names found it.

Seventeen mutants: fifteen killed by tests, two by the compiler. Four new guards in
`publish.test.js` and the release workflow had to be updated too — a third
publishable package needs a README, a LICENSE, provenance, and a publish step
ordered after `@trazum/core`, and every one of those was a test failure rather than
something anybody remembered.

**A `.pre-commit-hooks.yaml`, for teams who manage hooks with pre-commit.**
`scripts/pre-commit` stays the recommended path; this is for the repositories that
already have a `.pre-commit-config.yaml`, which in practice means Python shops whose
prompts live in `.py` string literals.

Two hooks rather than one with a flag: `trazum-check` is a gate and fails the
commit, `trazum-doctor` never does. Collapsing them would let a `--survey` argument
silently turn a gate into a report.

**It needs the first npm publish to work, and says so.** The `trazum` executable
comes from `additional_dependencies` rather than from installing this repository,
and the two alternatives were tried rather than reasoned about: installing the repo
root gives `Executable trazum not found`, because the root is a private workspace
root with no `bin`; adding a `bin` plus a `prepare` that builds gives
`Workspaces not supported for global packages`, because pre-commit installs with
`npm install -g`.

The mechanism is verified with locally packed tarballs standing in for the registry
— the gate fails a prompt over budget, passes one inside it, and the survey hook
exits 0. The registry lookup is the only untested part.

**An advisory for a schema the request could carry instead of the prompt.** The
one finding here that is not a trade-off.

A prompt that spells out its output shape in a fenced block pays for it in input
tokens on every call, and gets the weaker of the two available guarantees for the
money: prose asks the model to comply, a response schema makes the decoder comply.
`output_config.format`, `response_format`, `responseSchema` — every major API takes
the same shape as a request parameter. Moving it is cheaper *and* stricter.

**Reported, never done.** It is not a change to the prompt but to the code that
sends the prompt, and a rule that deleted the schema would leave a prompt asking
for a shape it no longer describes, sent by a client nobody updated — strictly
worse than the prompt it started from. A test asserts the schema and its fences
survive `--level aggressive`.

**The one way it could do harm, and what stops it.** A fenced JSON block is either
an output contract, which moves for free, or data a few-shot example needs, which
breaks the prompt if moved. Nothing guesses: a block counts only when a phrase from
the new `OUTPUT_CUES_BY_LANGUAGE` appears in the 240 characters before it. A schema
with no cue is left alone; a prompt in a language the dictionaries do not cover
raises nothing at all — a false negative, which is the right direction to be wrong
in, and stated as one rather than papered over.

The cue is matched through `normalizeForCompare`, so `FORMATO DE SALIDA —` and
`formato de salida:` are the same phrase, and it is quoted back **verbatim from the
prompt** rather than translated: it is the author's text, not the report's.

**The figure is attached and the uncertainty is in the words.** Trazum knows how
many tokens the block holds, which is reproducible; it cannot know from here
whether a given provider offers the parameter. Withholding the number for that
reason would be the wrong trade — it is right *if* the move is available — so the
advisory says plainly that it does not check. The same posture as
`model-downgrade`, which carries a figure and admits to being a keyword heuristic.

Thirteen mutants, thirteen killed. One found a real defect: the first draft
filtered out keys shorter than three characters, copied from the restated-format
detector where it stops a two-letter key matching a word in prose. Nothing is
matched against prose here, so all it did was undercount schemas whose fields are
called `id` or `ok`. Deleting it changed no test, which is what a line with no
reason looks like; it is gone, with a test for short field names in its place.

### Added

**`trazum doctor` finds preambles that could share a cache entry and do not.** The
first finding in this repository that no single prompt can produce.

Prompt caching is a byte-for-byte prefix match, so twelve prompts assembled from
the same system preamble — identical except that one has a trailing tab, another
reordered two bullets, and a third writes `E-Commerce` where the rest write
`e-commerce` — occupy twelve cache entries and share nothing. Every one of those
files is individually fine, which is exactly why no per-prompt analysis finds it.

`drift` says which kind of work it is: `whitespace` means the text already agrees
and a formatter fixes it; `wording` means somebody has to pick one.

Three refusals, and they are the design:

- **Grouped by the *first* block.** Caching matches from the start of the request,
  so prompts whose opening paragraphs differ share nothing however identical the
  rest is. Grouping on a later block would name prompts that can only be made to
  share a prefix by reordering their instructions — the one transformation this
  repository keeps out of `aggressive` for being dangerous.
- **Gated on the model's own cacheable minimum**, via a new exported
  `cacheableMinimum`. A model whose caching is `unknown` — what the live pricing
  overlay assigns to one it has never seen — yields `Infinity`, so nothing is
  reported. Telling somebody to unify a preamble across twelve files to enable
  caching their provider may not offer spends their afternoon, and unlike a wrong
  number on a report nothing later corrects it. The same directory against Haiku
  4.5, minimum 4,096, produces nothing for a 1,398-token preamble.
- **Prompts already byte-identical are not reported.** They share an entry today.

**No dollar figure, and that is a finding rather than a gap.** The saving lives in
the cache hit rate, and `cacheHitRate` is an *input* to the cost model rather than
something it derives — `--cache-hit-rate` applies one value to every prompt, so the
model has no term for how many distinct cache entries exist. Pricing this would
mean inventing how the calls are spread across the group, which is the one thing
here only the operator knows. A test asserts structurally that no field on the
result looks like money.

Thirteen mutants, eleven killed. The two survivors are equivalent rather than
uncovered — two independent guards cover the same case, so no test can distinguish
them — and both are documented in the test file so nobody removes one believing the
other carries the weight.

### Fixed

**A suite crashed on every clean checkout and exited 0.** `token-band.test.js` read
`fixtures/` with an unguarded `readdirSync`, and that directory does not exist until
somebody runs `scripts/measure-token-band.mjs`. So it threw ENOENT during suite
construction, node's runner printed the stack as a diagnostic, reported `fail 0` and
exited 0 — which is precisely what the top of that file forbids: *"'0 failures' from
a check that measured nothing is the most misleading thing a suite can report."* The
skip beneath it was written for a directory that exists and holds no per-provider
file; it never covered the directory being absent, which is this repository's normal
state. Found while diagnosing an unrelated `verify` failure.

### Fixed

**The README claimed prompts are never stored on any server.** They are, once the
prompt library is switched on: `trazum_prompt_versions.text` holds the text of
every saved version, and has since the library shipped. The library is off by
default, so the sentence was true in the configuration everybody develops in and
false in the one an operator opts into.

That is the same shape as the Content-Security-Policy that blocked analytics
nobody had enabled, found the same day — and worse in one respect. A broken policy
eventually breaks visibly for the operator who enabled it. A privacy sentence is
read once, by somebody deciding whether to trust the thing, and nothing ever tells
them it was wrong.

The section now states both configurations and names the column. Three tests keep
it honest: the schema is asserted still to store prompt text, so if that ever
stops being true the claim can go back to being absolute and a failing test says
so rather than the guard going quiet; the exact sentence that was wrong may not
reappear; and both configurations have to be identified by the thing that selects
them. `docs/accounts.md` was already accurate and is now linked from here.

Five mutants, five killed, the first of them the original defect put back verbatim.

**The new Content-Security-Policy blocked analytics, silently.** `connect-src
'self'` shipped in the same change as the nonce, and `Analytics.tsx` posts to
`https://eu.i.posthog.com`. An operator setting `NEXT_PUBLIC_POSTHOG_KEY` got a
page that rendered perfectly and sent nothing, with the reason visible only in a
browser console nobody was reading.

Nothing caught it because the key is unset in CI and in development: the
configuration where it breaks is the one no test exercises. Found by reading the
policy next to the component while reviewing an unrelated `posthog-js` bump —
not by any check in this repository.

The host now comes from `lib/analytics`, which both files read, so the policy
and the request cannot name different hosts again. With no key the policy is
byte-for-byte what it was; with one, `connect-src` gains exactly one origin.

It is an **origin**, never the configured string. A policy is built by joining
text with `;`, so a host of `evil.test; script-src *` would not have widened
`connect-src` — it would have appended a directive of somebody else's choosing.
`new URL().origin` discards everything a host source may not contain, and a
value that will not parse, or is not https, widens nothing at all.

Verified against a built server in both configurations: with the key set,
`connect-src 'self' https://eu.i.posthog.com` and nine of nine script tags still
nonced; without it, the previous policy unchanged. The badge keeps its own
`default-src 'none'; sandbox` either way. Nine mutants, nine killed.

**CodeQL was one merge away from being permanently broken.** Dependabot raised
`github/codeql-action/init` and `github/codeql-action/analyze` 3.37.6 → 4.37.6 as
two pull requests, because they are two sub-paths of one action and it treats
sub-paths independently. They are not independent: `analyze` reads the
configuration `init` wrote and refuses one written by a different version —
`Loaded a configuration file for version '4.37.6', but running version
'3.37.6'`. Each pull request was red on its own for that reason, which is the
harmless failure. The harmful one is merging both halves in either order and
stopping halfway: the security job goes red and stays red, while every other
check on every later pull request is green.

Both are now bumped in one commit, and a test keeps them together — grouped by
`owner/repo` rather than by a list naming `codeql-action`, because the next
action split this way will not be that one. Verified against the real thing: the
test was run with the workflow put into each of the two pull requests' exact
states, and failed on both.

The bump was not optional maintenance either. v3 targets Node 20, which Actions
has deprecated and is already force-running on Node 24.

### Added

**A Content-Security-Policy with a real `script-src`.** The web app had
`frame-ancestors 'none'` and nothing else — enough to stop clickjacking, and
nothing at all against script injection, so React's escaping was the only thing
between an XSS and full exploitation. It was documented as a limitation rather
than dressed up as a policy, and this is the limitation removed.

It needed middleware, because it needed a nonce. A policy worth having excludes
inline script, the App Router serves its flight data in inline `<script>` tags,
and a static header must therefore either allow `'unsafe-inline'` — permitting
exactly the attack the policy exists to stop — or break the app. The value has
to differ per response, and a config header is one string for every response.

`default-src 'self'`, `script-src` with a per-request nonce plus
`strict-dynamic`, `connect-src 'self'` to close the exfiltration channel,
`base-uri`, `object-src`, `form-action`. `'unsafe-eval'` only outside
production. `style-src` keeps `'unsafe-inline'`, which is the one concession and
the cheap one: a stylesheet cannot execute.

**Verified against a built server rather than asserted.** Nine of nine script
tags carrying the nonce from the header, a different nonce on every request, the
page rendering, and `/badge/<token>` keeping its own `default-src 'none';
sandbox` — tighter than the site policy, and excluded from the matcher rather
than trusted to win, because this repository already shipped one change that
silently replaced it with something looser.

Thirteen mutants, all killed — the last one only after the test was fixed. It
asserted `headers.set('content-security-policy'`, which
`response.headers.set(…)` two lines below also satisfies, so deleting the
**request** header left it green. Deleting it is not cosmetic: measured on a
built server, nine script tags and *zero* nonces. Next reads the policy off the
request to learn which nonce to stamp, so without that line the header is
perfect and the page is dead.

Two of the new tests were also caught matching their own comments — once on
`default-src 'none'` from the paragraph about the badge, once on `randomUUID`
from the sentence explaining why it is not used. Both now read the source with
comments stripped, which is the third time this repository has needed that.

### Added

**Bedrock and Vertex, with their credentials signed by hand.** The last two
providers whose auth is not a bearer token, and the reason there is no SDK here:
`@trazum/core` has zero runtime dependencies and a test that fails the build if
one appears, because every dependency is somebody else's code reading your
prompts. The AWS and Google SDKs are two hundred packages between them to
authenticate one request. SigV4 and the service-account JWT are about three
hundred lines, on WebCrypto so the browser-safe entry point stays browser-safe.

**Bedrock goes through Converse, not `InvokeModel`.** That is what makes it one
provider instead of six: `InvokeModel` takes each model family's own body shape —
Anthropic's `messages`, Meta's `prompt`, Amazon's `inputText` — so supporting
"Bedrock" through it means a 400 for every model nobody thought about.

**Vertex caches its access token.** A token lasts an hour and `--suggest` over a
directory makes one call per prompt; without the cache, forty prompts are eighty
requests, half of them to an endpoint that rate-limits. One cache per provider
instance, so two providers in one process cannot leak a token into each other's
requests.

Google's three HTTP-200 failures are now read by one shared function rather than
two copies. Two copies of "is this answer complete" is one copy too many when the
whole point is that a truncated rewrite reads like a finished one — and the error
names Vertex or Gemini, because those are different consoles.

**Neither has been exercised against the real service**, and neither has the
OpenRouter feed or the Gemini endpoint. This environment's network policy denies
all of them. What the tests prove is stated in the files themselves: the shape is
right, and the first real call is what proves it works.

**CodeQL caught a weak assertion, and the weak assertion was hiding a bug.**
Three host checks in the new tests used unanchored regexes, so
`/oauth2\.googleapis\.com/` would also have matched
`https://evil.example/?x=oauth2.googleapis.com`. Not a vulnerability — the URL is
one this code built — but an assertion that would pass against a request to the
wrong host is not testing what it names. Rewritten to compare parsed hosts and
paths.

Asserting the path exactly is what then surfaced the real defect: Bedrock model
ids contain a colon, AWS's own URLs carry it unencoded, and the comment in the
provider claimed `encodeURIComponent` leaves it alone. It does not — it produces
`%3A`. The signature matched either way, because the same string is signed and
sent, so nothing else in the suite could have noticed; the request would simply
have gone to a path AWS does not document. The colon is preserved now and the
slash is not, because a slash in a path is a new segment and a provisioned-model
ARN contains both.

Twenty-eight mutants: twenty-six killed, two documented equivalents. Three of the
kills only became possible after the tests got better — deleting the region from
the SigV4 key chain, deleting the service, and dropping the `AWS4` prefix from the
secret all left every test green, because the region and service *also* appear in
the credential scope inside the string to sign. "Different region, different
signature" is true of a signer whose key derivation is entirely wrong. The chain
is now derived a second time from the specification and compared.

The two equivalents are the header sort: removing it changes nothing while the
literal list is already in order, and reordering the literal changes nothing
while the sort is there. Doing both at once is killed, which is what shows the
ordering is actually asserted.

### Added

**A native Gemini provider**, and the reason it needs one while eleven other
providers do not.

`openai` in `TRAZUM_LLM_PROVIDER` is not "OpenAI", it is the wire format — so
OpenRouter, LiteLLM, Groq, Together, Fireworks, DeepInfra, DeepSeek, Mistral,
Cerebras, SiliconFlow, Ollama and vLLM are all a base URL away and always were.
The README now names each one with its exact URL, because true and undocumented
is not much better than false.

Google's API is a different document: the system prompt is `systemInstruction`
rather than a turn, and the answer is a candidate's parts. What actually earns
it a function is that **three of its failure modes arrive as HTTP 200** — a
blocked prompt (`promptFeedback.blockReason`, with no candidates at all), a
truncated answer (`finishReason: MAX_TOKENS`), and a candidate with no text. A
client that checks `res.ok` treats all three as success, and the second is the
worst thing that can happen to a rewrite pass: half an answer reads exactly like
a whole one. All three throw.

The key goes in `x-goog-api-key`, not the `?key=` that Google's own examples
use, which writes a live credential into every proxy log and `Referer` between
here and there. The model name is escaped into the path, and the endpoint goes
through the same gate as every other outbound call.

Eleven mutants, all killed — one of them by the type checker, which is a real
kill: removing the empty-text guard stops the function compiling because the
return type stops being a string.

### Added

**`--pricing-live`: prices from OpenRouter instead of a table somebody typed.**
The bundled catalogue is stale the day after it is written and only ever covered
the providers whoever wrote it reached for — so a user on Groq or Together got no
figure at all, from a tool whose entire output is figures. OpenRouter publishes
price and context window for hundreds of models across dozens of providers, as
data, at a URL.

Opt-in, because it is a network call: rule 1 is that no feature makes one a
prerequisite for optimising a prompt. The CLI fetches and hands the core a
value; `openrouterOverlay` is a pure transformation, so it is testable without a
network. Through `checkedEndpoint` and `SAFE_FETCH_INIT` like every other
outbound call here, so redirects are refused rather than followed to the
metadata network. A `--pricing` file still wins: somebody who wrote prices down
meant them.

**What that feed does not publish, and what is done about it.** It has no
opinion on whether a model has prompt caching or the minimum prefix it caches
at — and that is the input to the largest saving Trazum reports, an order of
magnitude above what the trimming rules recover.

So `CachingMode` gains `unknown` and `cacheMinTokens` becomes nullable, and a
model that arrives from the feed carries both. The caching advisory declines,
and `trazum models` prints a dash rather than a zero. The two available lies are
symmetrical and both worse than silence: claim caching works and Trazum offers a
saving nobody can buy at any price — the Mistral bug in a new costume — and
claim it does not and Trazum hides the biggest saving there is.

`Capability` and `tier` gain `unknown` for the same reason, so a model whose
capability nobody recorded is neither recommended to somebody else nor told it
is overpowered. For a model the bundled catalogue already has, only price in,
price out and context window are refreshed: the rest was written by somebody who
looked it up, and replacing a researched fact with a blank is not a refresh.

### Fixed

**An added model could carry no `capability` at all.** `applyPricingOverlay`
required six fields for a model the bundled catalogue does not have, and
`capability` — a required field of `ModelPricing` — was not among them, so
`as ModelPricing` produced an object the type says cannot exist. Now required,
which is why two overlay fixtures needed a line.

Ten mutants over the new code; nine killed and one documented equivalent. Two of
the kills were bugs of mine rather than of the tests:

- The unknown-capability guard was written as an early `return`, which skipped
  every advisory *after* the model check — output-dominated, contradictory
  instructions — none of which has anything to do with a model's tier.
- `TIER_ORDER.unknown` was set above every real tier, which makes the downgrade
  comparison *true* for every prompt; the only thing then standing between that
  and a recommendation was an unrelated provider filter. Two accidents covering
  for each other is not a design. It is `-Infinity` now, so the ordering carries
  the rule and the guard beside it is deliberate redundancy — that is the
  equivalent mutant.

### Fixed

**The token-band measurement could never have passed, and nobody could know.**
`measure-token-band.mjs` hashed the corpus with NUL separators and
`token-band.test.js` hashed it with spaces, so the two digests could not match.
The first real measurement would have failed its freshness check with *"the
corpus changed since it was measured — re-run scripts/measure-token-band.mjs"*
— advice that produces the same failure however many times it is followed.

It went unnoticed because running the script costs an API key nobody had spent.
The one workflow that discharges this project's central claim had never been
executed end to end, and the check guarding it was broken in the way that
surfaces only the first time it matters.

Fixed structurally rather than by making the copies agree, since two copies
agreeing is the state it was in when it broke: `scripts/corpus-digest.mjs` is
the single implementation and both sides import it. A guard asserts neither has
grown a second one — and it builds its own needle at runtime, because written as
a literal the assertion matches its own source and fails on the file it defends.

**And a fourth raw control byte in a source file.** Writing that shared module
put a real NUL into it on the first attempt, exactly as happened in
`reorder-properties.test.js`, `github.ts` and `measure-token-band.mjs` before
it. Caught this time by checking the bytes rather than the diff. The separator
is written as an escape.

### Added

**`measure-token-band.mjs --provider deepseek`**, and the distinction that makes
it safe to have.

`±15%` is the estimator's accuracy against *Claude's* tokenizer — the family it
was calibrated on, and the one every published claim refers to. Trazum prices
seven providers with that one estimator, and how far off it is on the others is
a question [ROADMAP.md](ROADMAP.md) has open with a decision resting on it:
*within 5% across families and a real tokenizer dependency is not worth taking;
40% out and it is.*

So each provider writes its own fixture and only Anthropic's governs the
published band. A cross-family fixture asserts corpus freshness and coverage,
prints the error per text type, and asserts nothing about a band it was never
calibrated for — with a guard that it cannot claim otherwise. Reading a DeepSeek
number as the published band would be the same class of error as calling a
release published because a changelog heading exists.

Two things the script now says out loud before sending anything: DeepSeek has no
free counting endpoint, so every sample is a real completion with
`max_tokens: 1` and the prompt half is billed; and a run against it does not
discharge the ±15%.

### Fixed

**`blame` reported a git it could not run as a repository with no history.**
`git()` collapsed every failure into `null` — git missing, git exiting non-zero,
and *the process failing to start at all* — and `revisionsFor` turned `null`
into `[]`. So a fork the kernel refused with `EAGAIN`, which is a fact about the
machine for one instant, reached the author as `git has no commits touching
p.txt`: a confident claim about their repository, made without having asked it
anything.

That is the shape of [#58](https://github.com/Davmunrey/Trazum/issues/58) — zero
rows, exit 0, once on CI, never reproducible — and it is the shape that cannot
be diagnosed afterwards, because its output is identical to the true answer.
Failing to run git now throws `GitUnavailableError`; an empty history still
returns an empty list. Transient spawn failures (`EAGAIN`, `ENOMEM`) are retried
once, bounded by the loop rather than by a condition inside it.

**This does not prove `EAGAIN` caused that CI failure.** Nobody knows, and the
issue was honest about it. What changed is that this failure can no longer
disguise itself as an empty history.

Eight mutants, all killed, and two of them were the tests being wrong rather
than the code. The first version of the regression test drove the CLI with
`PATH` stripped and passed against every mutant including the bug restored,
because `blame` checks `gitAvailable` before asking for revisions — the process
never reached the code under test. The second was worse: mutating the retry into
an unbounded loop did not surface as a surviving mutant, it surfaced as the
suite hanging until the runner killed it, which in CI is a job that burns its
whole timeout instead of failing in a second. The loop is now bounded by
construction.

**A broken anchor in the README, and nothing looking for one.**
`#reordering-for-the-cache-reorder` pointed at a heading whose real slug has
three hyphens, because GitHub turns `cache: --reorder` into `cache---reorder`. A
dead anchor renders as ordinary text and silently does nothing, so no other
check could see it. All 25 in-page links are now verified.

**Documents that had gone out of date with the release.** `RELEASES.md` claimed
1.8.0 was on npm and installable; nothing is published, there is no tag, and
`npm view @trazum/core` returns 404. The guard that exists to catch exactly this
missed it because it read "is there a `## X.Y.Z` heading in the changelog",
which is *a release cut in this repository*, not *a package on a registry*.
Preparing 1.8.0 satisfied it and switched the assertion off. It now asks git for
a tag, which is what `release.yml` actually triggers on.

The same claim is now checked in both directions across `RELEASES.md` and both
package READMEs — the ones that open with `npm install @trazum/…` and *are* the
npm page. Untagged, the notice is required; tagged, it is forbidden. A note that
has to be removed by hand at release time is a note that survives three
releases.

`ROADMAP.md` and `docs/releasing.md` follow: the `release` environment exists
and has been exercised by a dry run, the first publish has to be made by hand
because a trusted publisher is configured on a package page that does not exist
until the package does, the manifest count is four rather than three, and the
action-pin step describes the guard as it now works.

### Changed

**The README is navigable.** 1,431 lines with no way in: five badges, a table of
the ten commands and what each answers, and a contents list. Nothing was
removed.

## 1.8.0

**The first version published to npm**, and it collapses everything since the
1.0.0 milestone into one release. Those milestones are numbered 1.1.0 to 1.8.0
in [ROADMAP.md](ROADMAP.md) and none of them was ever tagged or uploaded — the
scope did not exist. Publishing as 1.8.0 rather than 1.1.0 makes the version on
npm agree with the record in this repository, which is the only thing the number
has to do. 1.1.0 through 1.7.0 will never appear on the registry, because they
never existed anywhere a consumer could reach.

### Added

**`--cache-suggestions`: `--suggest` answers from disk when the question has not
changed.** A content-addressed cache under `$XDG_CACHE_HOME/trazum/suggestions`,
keyed on provider, model, system prompt and the author's prompt, kept for seven
days. Re-running `--suggest` over a directory after editing two files out of
forty makes thirty-eight fewer requests. `trazum --clear-suggestion-cache`
empties it, with no command and no config read.

Opt-in, and printed on stderr every time it answers: a hit is a week-old
response from something that is not a pure function, and the other three
model-touching flags all make you ask twice.

The **raw response** is stored, not the checked suggestions. All five checks in
`suggestRewrites` — `before` appears byte for byte, nothing touches protected
content, `after` introduces none, it actually saves tokens, overlaps are dropped
— re-run on a hit, so an answer from last week is judged by this week's rules
instead of replaying an older version's verdict. Same reasoning as recomputing
token counts on read rather than storing them.

Files are 0600 in a 0700 directory that this code creates. The cache holds
prompt text, which is the most sensitive thing the tool touches.

**This is not the API's prompt caching, and the reason is a number.** The
roadmap item asked for `cache_control` on the stable prefix. The minimum
cacheable prefix is 512 tokens on the most generous model and 4,096 on others;
Trazum's suggest system prompt is 291 tokens; and a prefix below the minimum is
*silently* not cached — no error, `cache_creation_input_tokens: 0`. Everything
after the system prompt is the author's text, which differs on every call, so no
placement of `cache_control` helps. Marking it would have looked like an
optimisation, cost one line, changed nothing, and been undetectable.
`suggest-cache.test.js` measures the prompt against the published minima per
model, so if a model ever lowers its floor below 291 the claim fails loudly
rather than staying in a comment that has quietly stopped being true.

**A README badge at `/badge/<token>.svg`.** The share link, as a picture.

It rides on the share token rather than inventing one. A badge is strictly less
information than the page at `/c/<token>`, and a second capability for a smaller
disclosure would have been two things to revoke instead of one.

**It is recomputed on every load**, like the page. A badge is the single most
likely artefact to be looked at a year from now, and a stored number is the most
likely thing to have quietly stopped being true — which is the failure mode of
every hand-written "saves 30%" line in every README.

**It always answers 200.** Unknown, expired and malformed tokens all render the
same neutral badge. A non-2xx makes GitHub's image proxy show a broken image,
telling every reader of the page that something is wrong without saying what; the
three cases have to be indistinguishable anyway; and a revoked link should stop
reporting rather than announce that it used to exist.

The document is inert — no script, no `foreignObject`, no external font or
stylesheet — and served with `nosniff` and `default-src 'none'; sandbox`, because
an SVG from your own origin is a *page* when navigated to rather than embedded in
an `<img>`. Everything interpolated is XML-escaped even though the only inputs
are numbers this route computed: "no untrusted text reaches here" is a property
one commit can break.

Cached for five minutes, unlike everything else behind a share token. Safe
because the token is in the URL, and necessary because a README badge is fetched
by every reader of the page through an image proxy.

Nineteen mutants, nineteen killed, after three survived a first pass and each
was a test that had only asked the easy half:

- **Only the label was tested for escaping**, never the message — so deleting
  the message's escape changed nothing any assertion could see. Both are
  constants or numbers today, which is exactly why one of them went untested.
- **`textWidth('WWWW') > textWidth('iiii')`** holds whether or not capitals get
  their own width, because `i` is narrow either way. Compared against `wwww` now.
- **The UUID-guard problem again**, one route over: a malformed token produces
  the same neutral badge whether or not it is refused before the lookup, so the
  test watches whether the store was asked rather than what came back.

Also two assertions that were wrong rather than the code: one required the SVG to
contain no `http` at all, which its own XML namespace fails, and one required no
`"/>` anywhere, which every `<rect>` ends with.

**A deployment overview at `/admin`.** The last of the team features, and the one
whose hardest part was deciding what it is allowed to claim.

The request was "aggregate spending across the org", and neither half of that
phrase survives contact with what Trazum knows. **It has never seen a bill, an
API call or a token counter** — it reads prompt text and measures it. A dashboard
headed "spend" would print a figure nobody can reconcile against an invoice, and
the rule here is that a number a reader cannot reproduce by hand does not get
printed. So the headline is input tokens, which is a property of a prompt alone,
and the second figure is what running the rules would remove — measured by
running them, the standard `trazum rank` is already held to. No score. The
disclaimer sits above the first number rather than in a footnote, because a
footnote is read second.

**And there is no organisation model**, which is also a decision rather than an
omission: a self-hosted instance *is* the team. The alternative was reading
GitHub organisation membership, which would mean asking for `read:org` on every
sign-in so that some deployments could skip an environment variable. Sign-in asks
for `read:user` and nothing else, and keeping that true is worth more than the
convenience.

`TRAZUM_ADMINS` is unset by default and unset means the page **does not exist** —
`404`, identical to the `404` a signed-in non-admin gets, because a `403` would
confirm a dashboard is here and that they are outside it.

It reports counts, prompt names and logins, and never a line of anybody's prompt.
An admin is an operator, not an auditor of what their colleagues wrote, and
"which prompt is expensive" is answerable from a name. One overview reads at most
500 prompts; past that the page states both numbers instead of reporting a total
that quietly covers part of the deployment.

**A guard caught its own author.** `census` was first written as a method on
`PromptStore`, with a comment calling itself "the documented hole" in the rule
that every lookup binds an owner — and the guard written to enforce that rule
failed on it immediately, which was the guard being right. A rule with an
exception written inside it is a rule somebody adds a second exception beside. It
moved to its own `AdminStore` interface, the way `ShareStore.findShare` already
had, so "every `PromptStore` lookup binds an owner" stays a true sentence rather
than a mostly-true one.

Fixing that surfaced one more: the guard read `PromptStore` by slicing from its
declaration **to the end of the file**, which was fine while it was the last
interface there and reported `AdminStore.census` as a hole the moment it was not.
Third unbounded slice in this repository to read past the thing it meant — the
previous one read a `returning` list into an `on conflict` clause.

Sixteen mutants, sixteen killed — but only after three of them survived the first
pass, and all three were tests that had encoded the easy case:

- **A GitHub username may be entirely digits.** A version of `adminSource` that
  checked the numeric-id list against the login as well passed everything,
  because no fixture had an account whose username collided with somebody's id.
  It does now: listing `1001` means boss's account and must not admit whoever
  registered the *username* `1001`.
- **Ranking by size and ranking by waste give the same answer** whenever the
  biggest prompt is also the most wasteful, which was the only case the fixture
  had. A long prompt of unique prose against a short one full of known filler
  tells them apart — and telling them apart is the whole value of the ranking,
  because the long one is what an admin would have guessed.
- **"Some `notFound()` precedes the census call"** stayed true when the admin
  guard was deleted, because the signed-out guard above it kept the ordering.
  Each of the four guards is now required by name.

One more fixture lesson, the same one as always: the prompt this suite used to
represent "wordy" was *"You should always make sure to carefully read the entire
text below"*, which reads bloated and which no rule touches. Every savings
assertion was comparing zero to zero.

**Share links for comparisons.** `POST /api/shares` publishes a comparison at
`/c/<token>`, readable by anyone holding the URL with no account at all.

This is the first thing in Trazum with a bearer-capability security model, and
almost every decision follows from naming that honestly rather than treating it
as "the prompt library but public".

**The token is the secret**, 32 bytes from the same CSPRNG that mints session
cookies — not a slug, not a short id, not derived from the content. Stored in the
clear, and the asymmetry with sessions is deliberate: hashing a session token
means a leaked table is hashes rather than live logins; hashing this one would
protect nothing, because the row it points at *is* the secret.

**Reading writes nothing.** No view counter, no last-seen column, and the schema
says why it does not have one. An unauthenticated request that can cause a write
is a lever, and "how many people opened this" is not worth being one.

**Expiry is a default, not an option.** Thirty days unless you choose 7, 90 or
never. A link that never expires is a permanent publication made by somebody
thinking about the next ten minutes, so `never` exists and has to be asked for.
Expired is indistinguishable from never-existed — "this link has expired" tells a
stranger the token was real, which is one bit more than they had.

**Kept out of search twice**, by two defences that fail differently: `noindex` in
the page metadata stops indexing, `robots.txt` stops the fetch. Plus
`no-referrer`, because the token is in the path and one outbound navigation would
otherwise put the whole capability in someone else's access log.

**The settings are canonicalised from a whitelist.** They are replayed into the
core on every future view, by a reader who did not choose them and cannot see
them, so the parser builds a fully-populated object from known keys rather than
merging over what arrived. Numbers are clamped — refusing a whole publication
over a call volume of −1 helps nobody — but the model id and rule ids are
rejected outright, because a silent fallback would price the comparison against
something the sharer did not pick.

The warning lives **above** the button and is always visible. A confirm dialog is
a thing people dismiss; a sentence above the control is a thing they read while
deciding.

Eighteen mutants, eighteen killed — but only after the pass found the one that
mattered most:

**The share URL could have been built from the `Host` header and no test would
have noticed.** Every request in the suite was constructed on the same origin as
`TRAZUM_PUBLIC_URL`, so a header-derived URL came out byte-identical and the
assertion passed either way. The failure it was hiding is not cosmetic: a link
built from a client-supplied host points wherever the client said, and is then
handed to a colleague by somebody who trusted it. There is now a request whose
`Host` deliberately disagrees with the configuration.

Also: a test asserting the shared page never reaches for
`dangerouslySetInnerHTML` failed on the page's own comment saying exactly that —
the second time this repository has made that mistake, after a schema comment
about `force row level security`. Both tests now strip comments before reading
the source.

**A prompt library with version history.** The first thing accounts were for.

Everything about it follows from one question: *what did last month's edit do to
this prompt?* A store that answers that has to be append-only, has to price every
version the same way, and has to be unable to show one person another person's
work. Each of those is a decision that was cheaper to make now than to migrate to.

**Append-only.** Saving over a prompt writes a new row; nothing updates one. A
history you can edit is not a history.

**A save that changed nothing writes nothing** and answers `200` with
`saved: false` — not an error, because pressing Save on unedited text is a
reasonable thing to do, and not a duplicate row, because the history's only job
is showing what moved. The UI turns that flag into "no changes to save"; a screen
that says "Saved" when nothing was written is training its reader to distrust it.

**Token counts are recomputed on read, never stored.** This is the decision that
looks wrong from a caching point of view and is not. The history is a chart. Two
versions saved a year apart, each priced by the estimator of its day, produce a
line that moves when the estimator changed and the prompts did not. Recomputing
every version with today's costs a little and is the only way any two of them are
comparable to each other.

**Somebody else's prompt is 404, not 403.** A 403 confirms the id is real, which
turns the route into an oracle for enumerating other people's libraries, and a
legitimate caller can do nothing with the distinction because they were never
getting in. Enforced in the query rather than after it: every store method takes
an owner id and puts it in the `where` clause. `PromptStore` has no lookup that
takes an id without an owner at all, so a handler *cannot* tell "not yours" from
"not there" — the mistake is unrepresentable rather than untested, and a guard
pins that shape because the way it comes back is somebody adding a convenience
method.

Ceilings — 200 prompts, 500 versions, 100k characters — are refused loudly rather
than trimmed silently. Evicting the oldest version to make room deletes the record
the prompt was kept for.

Seventeen of eighteen mutants killed, including every ownership predicate in both
drivers. Three findings from the pass, all of which had passed the suite first:

- **The Postgres prompt driver had no tests at all.** The route suite runs
  entirely on the memory driver, so every ownership assertion in it passed
  against SQL that selected by id alone. `prompts-postgres.test.mjs` now drives
  all six methods and sweeps the recorded statements mechanically: anything that
  names a prompt must also bind an owner, and anything that binds one must
  compare it.
- **The UUID check on the path segment looked decorative and is not.** Every
  test around it asserted the outcome — 404 — which holds with the check removed,
  because the memory driver answers `null` for any key it does not hold. Bind
  `'../../etc/passwd'` to a `uuid` column and Postgres raises, which is a 500
  where the caller should have had a 404. What distinguishes the two is not the
  answer but whether the store was asked, so that is what the test now watches.
- **One mutant survives and is documented on the line it survives.** The memory
  driver's version sweep on delete changes nothing observable: the prompt is
  gone, ids are UUIDs, nothing will ask again. What it costs is memory — which is
  exactly the kind of line somebody deletes during a cleanup because no test
  complained.

### Changed

**The prompt lives at page level now, next to the scenario.** The Library tab has
to save the prompt that is on screen and put a restored version back on it, and
neither is possible for a sibling holding its own copy — two components with two
copies of "the prompt" is how a library quietly stores something else. Same
reasoning that moved the usage scenario, same shape: a hook the page owns.

**A tab test counted tabs when it meant to check a property.** "Keeps both tabs
mounted" asserted there were exactly two `TabsContent` and that both were
`forceMount`, and it failed the moment a third arrived — on a tab that
deliberately is not one, because the library holds nothing the server does not
already have and is better re-read on return. Rewritten to assert the actual
invariant: a tab holding state the server does not have must stay mounted, and
anything opting out has to be named. Mutation-tested both ways.

**Sign in with GitHub.** Optional, off by default, and the first thing in this
repository that stores anything about a person.

The reason it exists is that everything a team wants — a prompt library with
history, a budget somebody else set, an organisation's spend in one place —
needs an answer to "who is asking", and there wasn't one. So this change is the
foundation and deliberately not the features: identity, a session, and a store
those can be built on.

Off by default is load-bearing rather than polite. Most people running Trazum
run it for themselves, and a tool that suddenly requires a database to start is a
tool they stop running. With no `TRAZUM_GITHUB_CLIENT_ID`, `authConfig` reports
disabled with a reason, `/api/auth/*` answers 503 naming the variable to set, and
the header renders nothing at all. Not a disabled button: a disabled button is a
promise, and the endpoint behind it is a 503.

**No framework.** The OAuth flow is about two hundred lines — authorize,
exchange, read the profile — and hand-writing it keeps `apps/web` at one new
dependency (`postgres`, which has none of its own) instead of a tree. The three
things a framework would have gotten right are gotten right here, and each is
worth naming because each looks like a detail:

- The redirect URI is built from `TRAZUM_PUBLIC_URL` and never from a request
  header. `Host` is client-supplied; a callback built from it lets an attacker
  send a victim to `/api/auth/github` with `Host: evil.example` and collect the
  authorisation code. GitHub's own callback allowlist would catch that one case,
  which is not a reason to depend on one checkbox in someone else's console.
- `state` is verified **before** the code is exchanged. Verifying it afterwards
  passes every functional test and defends against nothing, so the order is
  asserted directly: the test counts calls to a recording `fetch` and requires
  zero.
- The `__Host-` cookie is cleared as `Secure` even when the deployment is not.
  A `__Host-` cookie without `Secure` is rejected outright — including the one
  meant to delete it — so getting this wrong makes sign-out appear to work and
  do nothing.

Sessions are opaque 256-bit tokens rather than signed claims, stored as SHA-256.
Revoking one is a `DELETE`, which is the property a JWT does not have, and a
leaked table is hashes rather than cookies. Sign-out deletes the row before
clearing the cookie; the other order leaves a live session the browser has
forgotten — invisible, unrevokable, valid for a month.

Two store drivers behind one interface. Memory is the default and reports
`ephemeral: true`, which `/api/auth/session` passes to the browser and the header
draws as "temporary session" — because on a platform that runs several instances
the alternative is being signed out at random with no explanation. Postgres is
the other, and its schema enables row level security with no policies: that
blocks the REST layer platforms like Supabase put in front of `public`, while
Trazum, connecting as the table owner, is exempt. `ENABLE` and not `FORCE` —
`FORCE` applies the policies to the owner too and locks the app out of its own
tables, which is the stricter-looking word and the one that takes the site down.

Twelve mutants, twelve killed: state checked after the exchange, the `__Host-`
delete without `Secure`, the redirect filter without `//`, the expiry boundary at
`<` instead of `<=`, the sweep that could delete a live session, an upsert that
resets `created_at`, a token exchange that trusts the HTTP status (GitHub answers
a bad code with 200 and an `error` field), storing the raw token, accepting HTTP
off localhost, a cacheable session response, and a cross-origin sign-out.

Honest about the gap: the Postgres driver has never run against Postgres. Its SQL
is checked against a recording tagged template, which catches a mistyped column, a
value bound in the wrong position and a `DELETE` whose predicate is too wide, and
cannot catch SQL that Postgres would reject. `docs/accounts.md` says so, and lists
the rest of what is not covered.

### Added

**Guards that the published packages are actually public.** A scoped package is
*restricted* by default, and this project is open source — so the two manifests
carry `publishConfig.access: "public"` and both release steps pass
`--access public`. Both were already correct; nothing checked either.

The failure that would have gone unnoticed is the quiet one. On a free account a
missing `--access public` fails the publish, which is fine. On a paid one it
**succeeds** and uploads a package nobody outside the org can install — a
release that looks entirely normal, and unpublishable after 72 hours.

Three assertions: every publishable manifest declares public access; the release
workflow publishes exactly the publishable set, each with `--access public` and
`--provenance`; and nothing is publishable by accident, with `apps/web` staying
`private: true` so a Next application never reaches a registry as though it were
a library.

The set of workspaces is now derived from the root `workspaces` globs rather
than listed. It had been a hardcoded pair, which made the whole file blind to
any workspace added after it was written — a new publishable workspace now
fails the suite until somebody decides what it is. Eight mutants, all killed.

**Route invariants, checked against every route rather than the ones with
tests.** Five API subsystems landed in five consecutive merges — auth, share
links, the library, the admin overview, the badge — each getting its rules
right because the author remembered them. Nothing was checking, and "remembered
five times" is not a property.

Two invariants, read from source: every state-changing handler in a route that
reads credentials reaches a same-origin check, and any response a route builds
by hand carries `no-store`. Routes are walked from `app/api`; the exemption for
`/api/optimize` and `/api/compare` is derived from their reading no cookie and
no session, not from a list, so either one stops being exempt the moment it
reads one.

**The gap this closes is measured, not asserted.** Deleting the same-origin
check from `DELETE /api/prompts/[id]` passes the entire pre-existing web suite:
every write funnels through one `requireCaller`, so the behavioural tests prove
*that function* refuses a hostile `Origin` and prove nothing about whether a
given handler asked it to. Five such mutants survive everything except the new
file. Going the other way, changing `requireCaller`'s condition to `if (false)`
survives the new file — `sameOrigin(` is still there to match — and is killed by
the behavioural tests. Neither layer is redundant; neither covers the other's
mutant. Ten mutants, all killed once both layers run.

Both guards were wrong before they were right. The cache-control one originally
asked whether a route *used the response helpers*, which is a proxy for the
property rather than the property, and failed against `/api/auth/session` — a
route that sets `no-store` correctly on both branches without them. Its stated
premise was false too: `jsonError` and `redirect` set no cache-control at all,
and the comment claimed they did. They carry no session data, so that is fine;
asserting it without checking was not.

### Fixed

**A rate limiter that could be turned into a way to take the deployment down.**
The expired-entry sweep ran on *every* miss once the map passed `sweepAbove`,
and a miss is any key not seen before. `clientKey` reads `x-forwarded-for`,
which this module already documented as freely spoofable — so an attacker
rotating that header made every request a miss, and every request an O(n) walk
of a map their earlier requests had grown. Almost nothing was reclaimed while
they did it, because entries in the current window have not expired yet.

Measured rather than reasoned about:

```
                 before                            after
N= 20000    1,410ms   149,985,000 compares      14ms   10,001
N= 40000    7,576ms   749,975,000 compares      19ms   10,001
N= 80000   46,759ms 3,149,955,000 compares      79ms   10,001
```

Doubling the requests multiplied the work by 4.4, then 7.6. Eighty thousand
requests — not an interesting number of requests — was 46 seconds of a
single-threaded event loop during which the deployment serves nobody. The
limiter answered every one of them correctly; it just answered quadratically.

Sweeping at most once per window makes the total linear. Memory is unchanged
and worth stating: a window's worth of distinct keys is held until the next
sweep, which is inherent to counting per key rather than a consequence of the
fix, and it does not accumulate across windows.

The limiter now exposes a `sweeps` count, so the test asserts the sweep's
frequency instead of trusting a comment about it — the bug was invisible from
outside, since every verdict it gave was right. Eight mutants, all killed.
Asserted on the count and not on elapsed time: a timing assertion on shared CI
hardware is a flake generator, and the count is the thing that changed.

**The roadmap said the web app's features would deliberately never be built.**
`ROADMAP.md` listed **Prompt library** under "Under consideration" with the
reasoning *"storing prompts is a different product, and one that would mean
sending them to a server. Trazum's privacy story is that it never does"* — while
the app shipped a prompt library with version history, share links, an admin
overview and a badge. Seven user-visible surfaces existed and the document
mentioned none of them, one of them by explicitly explaining why it never would.

That reasoning was also a conflation worth naming rather than deleting. Rule 1
binds the *optimiser*: the CLI sends nothing, needs no account and works with the
network unplugged, and none of that changed. It never said nobody may run a
service that stores what they chose to save to it. The entry is struck through
and kept, because a roadmap that silently removes what it went back on has no
record of having gone back on anything.

Added: milestone sections for the account-and-sharing work and for
`--cache-suggestions`, and a guard deriving every route from `apps/web/app` and
requiring the roadmap to name it. The guard is deliberately narrow — it proves
the document knows a surface exists, not that what it says about it is true —
and it caught two of its own defects first: a substring match let `/api/admin`
satisfy `/admin`, and `/c` counted as documented by accident because two
characters occur inside almost any path.

**Japanese is now stated as a deliberate absence rather than a gap.** There is no
Japanese trimming dictionary and one is not planned — deciding a phrase says
something in more words than it needs is a judgement about the language. But
`--reorder`'s backward-reference list *does* cover Japanese and Chinese, matched
without word boundaries. Those are different claims: refusing to rearrange needs
only enough of a language to spot a phrase pointing backwards, while offering to
shorten means asserting the shorter version still asks for the same thing.

**The help-text guard could not see a flag that belongs to no command.** It
derives its list from the unknown-flag rejection message, which is printed
per-command — so `--clear-suggestion-cache`, an errand that runs with no command
named, was documented nowhere in either locale and the suite stayed green. A
second guard now reads `main()` for flags handled before dispatch and requires
each in the help. Both are derived rather than listed, which is the reason the
first one exists: a hardcoded list is how `--reorder` shipped fully implemented
and absent from `--help`.

That flag also did not work. It was handled below the branch that prints usage
when no command is given, so `trazum --clear-suggestion-cache` printed the help
and cleared nothing — silently, which is the failure mode the flag list is there
to prevent. Found by an end-to-end test counting requests at a socket rather
than by reading the code.

**A control-character filter written with control characters.** The first draft of
the `?next=` guard spelled its character class literally, which put a NUL and a
run of C0 bytes into `github.ts` and made the source file binary — the same defect
this repository shipped once before in `reorder-properties.test.js` and had to be
told about by a guard. Replaced with a code-point comparison, which cannot carry
the bytes it is checking for. An intermediate repair was worse: a class written as
`[ -]` matched space through hyphen, so every path with a hyphen in it — which is
most of them — was silently redirected to `/`. Both are pinned by tests.

**`RELEASES.md` said "Nine commands" for two merges after there were ten.** The
guard written to catch exactly this drift read `README.md` only, so correcting the
README was mistaken for correcting the count. Widened to both files — and then
found to be blind anyway: the pattern was lowercase-only and the sentence starts
with a capital, so `Nine commands` had never been visible to it. Both fixed, and
the guard mutation-tested in both files and both cases rather than trusted.

Widening it also made it cry wolf on "the two commands that answer *which prompt
is worth an afternoon* and *who made this one expensive*", which is correct prose
counting a subset. A restrictive `that` or `which` now marks a subset the way
`other` already did — a guard that fails on true sentences gets deleted.

### Changed

**Rate limiting is one function with private buckets.** Both API routes carried a
copy of the same sliding window, with a comment on one saying the duplication was
deliberate because a shared `Map` would let comparisons spend the optimise budget.
That is right about the state and wrong about the code: `createRateLimiter` hands
each caller its own `Map`. The sign-in routes were going to be the third and
fourth copy.

Its limit is thirty a minute per address rather than the ten a sign-in route
appears to need, because the limiter keys on an address and not on a person: ten
is generous for an individual and refuses the eleventh person behind a corporate
NAT.

**The price list says how old it is, not just when it was checked.** `doctor` and
`models` print `Prices reviewed 2026-06-24 (46 days ago)`.

Every dollar figure Trazum prints descends from that list. The date alone makes the
reader subtract against today to learn the one thing they wanted — whether to trust
the figures — and a reader who is not already suspicious will not bother, which is
exactly the reader the line is for.

No threshold and no warning: "stale" would be a number nobody could check, and the
age is the fact. `reviewAgeDays` takes `now` as a parameter, for the reason
`computeSavings` takes a `Date`. Compared at UTC midnight on both sides, so the
answer does not shift by one depending on what time of day the command runs, and so
a daylight-saving gap cannot turn two days into one.

A future date reports unknown rather than negative days — that is a typo or a wrong
clock, and "reviewed in −12 days" reads as a bug either way.

**A guard that no test could distinguish, until one could.** Deleting the
`YYYY-MM-DD` format check failed nothing: every malformed value it had been checked
against is `NaN` to `Date.parse` regardless. The input that separates them is
`"2026-06"` — `Date.parse("2026-06T00:00:00Z")` is **2026-06-01**, a day nobody
wrote, and without the guard an overlay carrying that string gets an age computed
from an invented day of the month and printed as confidently as a real one. Found by
mutation, and now pinned.

### Added

**`suggest-fixes: true` on the Action — the optimised prompt as a GitHub suggested
change**, applied with one button.

**A suggestion, not a commit.** The obvious build commits the fix to the pull request
branch, which needs `contents: write` on the workflow of everybody who installs this
action, against a `SECURITY.md` that documents `contents: read`, no
`pull_request_target`, and has a test asserting it. Widening that is a decision for the
people running the workflow. A `suggestion` block needs only the `pull-requests: write`
the comment mode already requires, lands in the same place with the same one click, and
leaves the maintainer as the one who commits.

Safe level only — the aggressive level is defensible when a human reads the diff it
produced, and a one-click apply is not that moment; asserted by a test that also refuses
to let the level come from the environment. Never fails the build: no pull request, a
read-only fork token, an oversized prompt or a partly-changed file are all notices.

Two defects found by running it, both invisible to reading:

- **It would have suggested deleting the trailing newline of every prompt in the pull
  request.** `optimize` returns text with no trailing newline *even when no rule fires*
  — `"Classify {{t}}.\n"` comes back as `"Classify {{t}}."` with `rules: []` — so a
  plain `optimized !== original` is true for virtually every file on disk. The
  comparison now ignores the terminator, and the suggestion omits it, because inside a
  fence the lines *are* the replacement lines.
- **Every anchor was one line past the end of the file.** `"abc\n".split("\n")` has
  length 2, so `line` pointed at a phantom last line and GitHub would have answered 422
  — on essentially every file, quietly, as a declined API call.

One test fixture was wrong too: 600 identical padded paragraphs collapse to 42
characters, because the duplicate-blocks rule removes them all, so the size guard never
fired. Distinct paragraphs now.

23 tests, five mutants — both defects above, a hunk parser that requires the optional
comma, suggesting on a partial diff, and the aggressive level.

### Added

**`trazum doctor --otlp-out <file>` — the survey as OpenTelemetry metrics.** Five
gauges: tokens per prompt, over-budget per prompt, the unbudgeted count, and each
advisory's monthly figure and prompt count. The model and call volume are resource
attributes, because a dollar figure whose scenario is not recorded beside it is a
number nobody can check later.

**Trazum writes the payload; it does not send it.** Pushing to a collector means
holding an endpoint and a credential, and this project has twice shipped an SSRF where
a URL reached `fetch` without being the URL that was checked. A file has no such
failure mode, and the pipeline that already holds the credential can post it.

No `@opentelemetry/*` dependency: the JSON encoding is a documented wire format and
this package has none. Two of its rules fail *silently* — a collector does not reject a
malformed payload, it charts it wrong — so both are pinned:

- **64-bit integers are JSON strings.** `timeUnixNano` and `asInt` are `int64`; a
  collector reading `1786000000000000000` as a double loses the last digits of every
  timestamp it stores.
- **Money is `asDouble`.** `asInt` would report `$4,912.40` as `4912`, and nothing
  downstream would look wrong.

`toOtlpMetrics` takes the timestamp as a parameter rather than calling `Date.now()`,
for the reason `computeSavings` takes a `Date`: a function that reads the clock can
only be asserted for shape, and here the timestamps are half the payload. Eleven core
tests, four CLI tests, five mutants — each of the two encoding rules, the millisecond
conversion, empty series, and unbudgeted prompts reported as within budget.

### Fixed

**A test file was binary, and the guard against exactly that did not look in test
directories.**

`packages/core/test/reorder-properties.test.js` joined a token bag on a **raw NUL**:

```js
const bag = (text) => text.split(/\s+/).filter(Boolean).sort().join('<NUL>');
```

One byte, typed as a literal instead of `\0`. git calls such a file binary, so every
change to those 400-prompt property tests rendered as `Bin 8385 -> 8386 bytes` and no
reviewer could read a line of it.

This is the same defect as `scripts/measure-token-band.mjs`, which spent three commits
unreviewable — one of them fixing a security finding *in that file*. The guard written
afterwards, `every source file is reviewable as a diff`, walked
`packages/core/src`, `packages/cli/src` and `scripts`. The relapse landed in
`packages/core/test`, one directory outside its reach, and the guard sat green beside
it for as long as it existed.

**A test directory is where it matters most.** Tests are the argument that the code is
right; a test nobody can read in a diff is an assertion taken on trust, which is the
thing this repository spends its effort refusing to do.

The walk now covers both packages' `src` and `test`, `apps/web`, `action`, `scripts`
and `.github`, and the staleness floor rises from 40 files to 100 so a future
re-narrowing fails loudly instead of passing over less. Verified by putting the byte
back: the widened guard names the file, the old roots do not.

Repo-wide scan afterwards: 341 text files, one NUL, now zero.

### Added

**`trazum diff --all <before> <after>` — a whole prompt library at once.** `diff`
answered the question for one prompt; a team refactoring forty of them wants it
answered forty times and totalled, and running the command by hand loses the total,
which is the figure the decision turns on.

**A prompt on only one side is named, never counted.** A refactor that deletes a
prompt and one that renames it look identical from a token count, so folding the
deletion into the total would report a library getting cheaper when a file went
missing. They are listed under `only before` / `only after` and excluded from the
totals, with a line saying why.

**`--max-growth` applies per prompt, not to the total** — the rule `check` already
states about budgets. In the worked example the total is `+3` and `--max-growth 10`
still fails, because one prompt grew 14 while another shrank 11. A gate on the total
would pass that, and the prompt that doubled is the one somebody has to look at.

Sorted worst first, the sign convention stated above the first figure, and the totals
asserted to equal the sum of the per-prompt figures they claim to total. Four mutants,
each killed: deletions folded into the totals, the gate moved to the total, the
convention moved below the figures, and the list sorted best-first.

**The command count in the README drifted again while this was being written.** Adding
`doctor` made "nine commands" wrong in two places, in a file corrected two commits
earlier for exactly this. `publish.test.js` now checks it against `COMMAND_FLAGS`, and
checks that every command is mentioned in the README at all — a command nobody
documented is a command nobody runs. The guard distinguishes "ten commands" from "the
other nine commands", because the second is correct prose and a guard that cries wolf
gets deleted.

### Added

**A pre-commit hook, at `scripts/pre-commit`.** `ln -s ../../scripts/pre-commit
.git/hooks/pre-commit` and a commit whose own prompts are over budget is refused
before it reaches CI.

**It asks `trazum doctor --json` rather than running `trazum check prompts/`,** and
that is the design rather than an implementation detail. `check` exits 1 when
anything under a directory is over budget — right for CI, wrong for a hook, because
it would refuse a commit that touches one file over a different prompt somebody else
committed last month. A hook that fails for reasons outside the commit is a hook
people learn to pass `--no-verify` to, and then it is worse than no hook, because it
taught them the habit too. So the hook intersects `doctor`'s over-budget list with
the files actually staged.

It gets out of the way rather than guessing: nothing staged, no Trazum installed, no
prompts found, an unreadable config — none of those are a budget failure, so none of
them block a commit. Each says so once and exits 0.

Two defects found by running it, both of the same kind — a message that promises
something it does not deliver:

- **It announced a list of over-budget prompts and printed nothing under it.** The
  detail line matched path, tokens and budget on one line, and `doctor --json`
  pretty-prints. It blocked the right commit and said nothing useful about why. It
  names the paths now and points at the command for the figures, rather than parsing
  multi-line JSON in `sh`.
- **The scope guard latched open on an empty array.** `"overBudget": []` closes on
  the line that opens it, so `inside = 1` stayed set for the rest of the document and
  a `path` key in any later section blocked the commit — the exact bug the scoping was
  added to prevent. Ten tests, four mutants, including one that puts each defect back.

Stated in the README because it is real: Trazum reads the working tree, not the staged
blobs, so a prompt staged and then edited further is judged on the newer text.

### Added

**`trazum doctor [dir]` — the survey before the gate.** Which prompts nothing is
watching, which are already over budget, and what every advisory adds up to across
the whole workspace.

**There is no score, and that is the design.** A health check invites one, and a
number assembled from weights nobody can reproduce gets quietly tuned until the
output looks right — `rank` refused it for the same reason. So `doctor` invents no
judgement at all: every finding is an advisory `optimize` raises on that prompt on
its own, summed, so any figure can be checked against a single file. A test adds up
the individual runs and requires the total to match, which it does to the last
float. "16 prompts only need a cheaper model" is sixteen copies of one advisory,
each with a file name beside it.

Two things it reports that nothing else did: **prompts no budget pattern matches**,
because an unwatched prompt is how the cost got there, and **prompts already over
budget** — before a red build says so, which is too late to think about it.

**It exits 0 even when it finds things.** `trazum check` is the gate. The model
recommendation is a keyword heuristic, and gating a build on a keyword heuristic
teaches people to re-run until green, which costs more than the tool ever saves.

Offline and free, like the rules. It deliberately does not check prompts against
their own `--suggest` recommendations: that is an LLM call per prompt, and this is
the command you run over forty files before deciding to spend anything. Four
mutants, each killed — averaging instead of summing, dropping the advisories that
carry no figure, printing the whole unbudgeted list instead of capping and counting
it, and exiting 1 on a finding.

### Fixed

**The README described a tool that only shortens prompts, and two counts in the
docs had drifted.**

Nine commands have landed since that front page was written, and it had been
updated by inserting a paragraph into whichever section each one belonged to —
which is exactly how a summary goes stale while every detail below it stays
correct. "What it actually does" listed four things, all of them `optimize`. A
reader who stopped there never learned that `rank` says which of forty prompts is
worth an afternoon, that `blame` names the commit, or that four commands write
markdown for a pull request comment. There is a table now, and the architecture
diagram includes the Action, which it had never mentioned.

`Layout` was missing a whole workspace (`action/`), plus `scripts/` and the eleven
core modules added since it was written.

Two numbers were simply wrong. The README advertised **580 tests** where the real
figure had reached **798**. `RELEASES.md` claimed **thirteen** deterministic rules
where there are **twelve**, and listed "restated output formats" among what they
cut — an advisory that is deliberately never cut, so that sentence was wrong twice.

Both are now checked rather than corrected. `publish.test.js` compares the rule
count in prose against `RULES.length`, refuses to let an advisory be described as
something the rules cut, and fails if the README ever advertises a test total
again — because a total across four suites cannot be verified from one of them, and
a number nobody maintains is worse than no number. Three mutants, each killed by
reintroducing the exact error it replaces.

**A blame test threw away the evidence when it failed.** `shows the most recent N`
was the only test in `blame.test.js` that checked neither the exit code nor passed
the command's output into an assertion, so when it failed once on CI the entire
report was `0 !== 3` — which is what "the table has no rows" looks like whether the
history was short, the path was rejected, or git never answered. The output was
right there in the variable, unused.

It carries the output now, and asserts the exit code first. Verified by forcing the
failure: the report goes from `0 !== 3` to `Error: git has no commits touching
p.txt.`

**This is not a fix for that failure.** It has never reproduced here — 26 runs
including under 8× CPU load — and the identical commit passed in the same CI minute
on the other event, so it is intermittent and its cause is still unknown. What
changed is that the next occurrence will say something.

### Added

**`comparePrompts` reaches the web app, as a Compare tab and `POST /api/compare`.**
Two versions of a prompt, the token delta, what it costs, and which advisories and
rules the edit introduced or resolved.

The whole hazard of this surface is a **sign**. Everywhere else in Trazum a
positive number is money you get back; here every figure is `after - before`, so
positive means the edit made things worse. Getting that backwards throws nothing,
fails no typecheck, and tells somebody their prompt got cheaper on the commit that
doubled its cost. So the convention is stated **above** the figures rather than
beside them — a reader arriving from the Optimise tab has the opposite expectation
already loaded, and a caveat under the number is a caveat read after the
conclusion — and most of the new tests assert a direction rather than a value,
including the swapped-pair case that a `Math.abs` mutant walks straight through
otherwise.

`optimizeBoth` is off by default and the default is the interesting half: the edit
changed the text as written, so the text as written is what the reader is being
asked about. Trimming both sides first hides a prompt that doubled in length and
happened to double in courtesy. Honoured only on a literal `true`, like every other
boolean these routes take. A missing `before` and a missing `after` are told apart,
because one message for two fields leaves the caller guessing.

**The usage scenario is now owned once, by the page.** It sits beside the locale in
`App`, for the same reason and with the same shape: both tabs price their answers
through it, and setting 50,000 calls on one while reading 10,000 on the other would
make the two answers incomparable while looking like they were about one workload.
`Optimizer` reads it from a prop and writes back through it; the history panel
restores all five fields in one update rather than five, because five setters on
shared state is five renders and, in between, four scenarios that are nobody's.

**And `formatUsd` stops being defined twice.** The web app had a copy that was
byte-identical to the one `@trazum/core` exports, for as long as it existed. The
core also had the `formatSignedUsd` that Compare needed.

Nine mutants. Two are worth naming. One test asserted the *absence* of local
scenario state in `Optimizer`, and a mutant renaming the local to `callsPerMonth2`
satisfied every pattern looking for `const [callsPerMonth,` while the two tabs went
back to disagreeing — a test that enumerates ways to be wrong is always one rename
behind, so it asserts the positive property now: every field read from
`scenario.usage`, every setter delegating to `scenario.set`. The other is that the
sharing *behaviour* cannot be seen from source at all, and was verified by driving
the built page in a headless browser: set the calls on Compare, read them back on
Optimise, and the reverse.

**`rank` and `blame` take `--markdown-out`.** The flag existed on `check` and
`diff`, which meant the two commands that answer *which of these forty prompts is
worth an afternoon* and *who made this one expensive* could not put their answers
where those decisions get made. Both now render a table for a job summary or a
pull request comment, written before any exit code is set and independently of
`--json` — the file's job is to survive the run.

Every string but the heading comes from the same `t.rank` / `t.blame` objects the
terminal report reads. Not tidiness: a second copy of "there is no score" is a
second thing to keep true, and whoever eventually softens one of those sentences
will soften the copy they happened to be looking at. `blame`'s priced movement
moved into a shared `netCostOf` for the same reason — two copies of that
arithmetic is precisely how a comment and a job log start disagreeing about one
history.

**A third escaper, `mdTextCell`, for untrusted prose in a table cell.** `mdCell`
is safe and announces "this is code" by wrapping in `<code>`; the first draft of
the blame report used it for the author and the subject, so the table typeset a
person's name as a code span and an English sentence with it. Correct, and plainly
wrong the moment it was rendered. The new one keeps `mdCell`'s entity encoding —
no `|` in the output at all, so the row cannot split — and adds the inline-markdown
set, which `mdCell` never needed because backticks make its content literal.

This is the least trusted input in the repository: on a pull request from a fork,
the commit subject is written by whoever opened it, and it lands in a table
maintainers read. Verified by building a repository with `grow | </table><script>`
as a commit message and asserting every row still has five cells.

Five mutants, each killed. One of them was killed only by a fixture coincidence —
reverting to `mdCell` kept the table intact and failed just the hostile test,
because `&#124;` happened to differ — so a test that asks the actual typographic
question went in beside it.

**`--suggest` is on the web too**, as two switches: one asks the model for
phrase-level rewrites, the second takes them. Turning the first off clears the
second, and the request derives the pair rather than sending both — a switch out
of step would otherwise produce a `400` for a combination nobody chose.

The proposals sit **above the saving**, one line each, with a count of what the
checks threw out. Same placement and the same reason as the reordering notice: a
figure read before its caveat is a figure nobody agreed to.

**And the web suite calls the route handler for real.** Every test in `apps/web`
until now read source and asserted on the text of it, which was honest about the
two rendering bugs it was written for and could not have seen the one below.
`test/api.test.mjs` sends requests: `next/server` is redirected to the platform's
own `Response.json` through a stable `module.register` hook — not
`--experimental-test-module-mocks`, because a suite should not depend on a flag a
Node minor can rename — and the core, the rules and both catalogues are the real
modules. Eight tests, four mutants, each killed by the one test meant for it.

`apps/web/package.json` declares `"type": "module"` as part of this. Loading a
`.ts` route from plain Node otherwise warns on every run that the file "doesn't
parse as CommonJS" and is being reparsed — a fair warning, and one worth fixing
rather than muting with `--disable-warning`, since every config in that directory
was already `.mjs`. Build, typecheck and both suites verified after.

The CI step that runs them is renamed from **"Core and CLI tests" to "Tests (core,
CLI, web, Action)"**, which is what `npm test` at the root has been doing for a
while. A step labelled for two of the four suites invites a reader of a green build
to think the other two are unchecked, and invites somebody adding a suite to write
a step that already exists.

### Fixed

**`applySuggestions` on its own returned `200` and applied nothing.**

Found by sending it, not by reading the diff. The response came back with a
complete report, no `suggestions` key, and the prompt untouched — the one thing the
caller asked for silently did not happen. Nothing about the source looked wrong:
the field parsed, the literal-`true` guard around it was correct, and the branch
that would have used it was simply never entered.

That is the same failure as a misspelled field being accepted, which this endpoint
already refuses for `disableRules` and `usage.model`, and which the CLI already
refuses for the matching pair of flags — *"a flag that quietly does nothing is the
same failure as a typo'd flag being accepted"*. There was no reason for the HTTP
surface to be the lenient one. It is a `400` now, refused **before** any call to
the model, so a malformed request never costs one.

Only a literal `true` is refused, because only a literal `true` would have been
honoured: `applySuggestions: "false"` asks for nothing and gets nothing, which is
what it says.

### Security

**The trimming rules only trimmed in two languages, and the report did not say so.**

`--reorder` was fixed to refuse safely in nine languages. The rules that actually
cut tokens still had dictionaries for English and Spanish alone, so:

```
en   22 →  11   2 rules
es   25 →  14   2 rules
fr   25 →  25   0 rules     ← nothing
de   20 →  20   0 rules     ← nothing
```

A French or German author ran Trazum, read `No rule found anything to trim`, and
took it to mean their prompt was already efficient. It meant Trazum could not read
it. Same defect `--reorder` had, one layer over: the tool knew something it was
not telling anybody.

Two fixes, in that order. **The report now names its coverage** whenever no rule
fires — stated rather than detected, because guessing a prompt's language is one
more thing to get wrong and naming the coverage cannot be. And **French, German,
Portuguese, Italian and Dutch** join the six dictionaries, so the trimming and the
reordering finally cover the same set of Latin-script languages.

### Fixed

**A dictionary translated word by word changed meaning.** The first pass at those
five languages shipped `muito`, `molto` and `heel` as intensifiers. All three are
also quantifiers, and `INTENSIFIERS` is dropped outright at the aggressive level:

```
Hai molto tempo per rispondere.   →   Hai tempo per rispondere.
```

"You have much time" became "you have time". Spanish had this right all along —
`muy` is on the list and `mucho` deliberately is not — and translating word for
word instead of by role lost the distinction. Found by running the five languages
through the rules, not by reading the list.

Both halves are now tested. One suite keeps those three words out and asserts the
quantifier sentences come back byte-identical. The other counts entries per
language per dictionary, because the behavioural test passes on whatever the
fixture happens to contain — which is exactly how a two-language hole survived a
full suite for this long. Portuguese and Italian dropping to a single firing rule
the moment `molto` came off the list is what surfaced the need for it: the
fixtures had been carrying the claim.

### Added

**[RELEASES.md](RELEASES.md) — release notes for people**, and the workflow now
publishes a GitHub release from them.

Until now, tagging published to npm and created **no GitHub release at all**. The
tag existed, the page behind it was empty, and anyone following a "what changed?"
link arrived at a file list. This changelog is thorough and it is not what you
hand somebody who has forty seconds — it is the maintainer's record, written for
whoever has to understand a decision two years from now.

`scripts/release-notes.mjs` extracts one version's section, and the release job
pipes it into `gh release create`. Writing the notes in a pull request beats
typing them into a web form at the moment of releasing, which is the moment least
suited to writing anything carefully.

Five tests make the file load-bearing rather than decorative: the version in the
manifests must have a section, the newest section must be the pending release or
the current version, the file must say nothing is published while nothing is
published — the exact claim ROADMAP.md got wrong — and the extractor must return
one section and fail loudly for a version it has never heard of. All checked
against mutants, including one that makes the extractor swallow the next release's
notes.

The release job's `contents` permission widens from `read` to `write`, which
`gh release create` requires. Stated rather than slipped in: that job now holds a
token that can push to the repository. The checkout is still
`persist-credentials: false`, so the working tree's remote has no token to reuse,
and the only step touching the API creates a release from a file already in the
commit.

### Fixed

**ROADMAP.md filed five versions under "Released" that were never released.**

There is no git tag in this repository, the `@trazum` scope does not exist, and
this file — which states at the top that `Unreleased` means merged-but-untagged —
holds every one of 1.1.0 through 1.5.0 right here. Two documents, one of them
wrong, and nothing checking either against the other.

It matters beyond tidiness: "Released" is what somebody reads before deciding
whether they can install this. The discipline in this repository is not claiming
what has not been checked, and this was the least-checked claim in it.

Those milestones now sit under **Merged into `main`, not yet released**, which
says what is true: the ordering is a useful record, the numbers will not appear on
npm, and the first publish collapses all of it into one version. The two things
needed before any of it ships are named there, and both belong to the maintainer.

Three tests keep the record honest from here — every version the roadmap calls
released must have a changelog entry, nothing under "not yet released" may already
be released, and the manifests must carry the newest version the changelog has
actually cut. All three were checked against mutants; the first reproduces the
original bug by name.

Also on the roadmap: an entry for the five commands merged today, and **cost
alerting** added to `Under consideration` with the reason it is not scheduled — it
needs a service holding other teams' prompt metrics on a schedule, and `check
--max-tokens` in CI already covers the threshold case for anyone content to have
the answer arrive on a pull request instead of in Slack.

### Added

**`trazum eval --export promptfoo` — hand the run to your own harness.**

Agreement is the question Trazum is qualified to ask, and it is not the question
a team needs answered before shipping. Theirs is whether the classifier still
hits 94%, whether the JSON still parses, whether the refusal rate moved — and
those are assertions about their task, which this tool has no business
inventing.

So it builds the part it *can* get right: a suite in which the only variable is
the prompt, with both versions, every case bound to the correct template
variable, and the same provider on both sides. `defaultTest.assert` is left for
the team.

It makes **no API call and needs no key** — the whole point is to hand the run
over — and it warns about the things that would quietly make a run meaningless:
a `${x}` placeholder promptfoo will not substitute, a prompt with three
placeholders and one value per case, a provider whose id had to be guessed.

The only assertion seeded is `is-json`, and only when the prompt shows a fenced
JSON block. That is not an opinion about the task; the prompt already demands it.

JSON rather than YAML, which promptfoo reads just as happily. This package has
no dependencies and is not acquiring a YAML emitter, and a hand-rolled one is a
quoting bug waiting for the first prompt with a colon, a tab, or a line ending
in a space.

### Fixed

The JSON detection used `findRestatedFormat`, which was the wrong question
wearing a convenient shape: that function answers "is this prompt wasting tokens
restating its own schema?", so a prompt demanding JSON *cleanly* got no
assertion while a wasteful one did — exactly backwards. It now looks for a
fenced block tagged `json`, or an untagged one that parses as JSON, and the
report says how many assertions were seeded rather than claiming "no assertions"
unconditionally.

### Added

**`trazum rank <dir>` — which of these prompts to fix first.**

The obvious shape for this was a complexity score out of a hundred, and it is
the wrong shape. A number nobody can reproduce by hand cannot be argued with,
and the weights that turn four measurements into one get tuned until the ranking
looks right — which is fitting the metric to the answer.

So the ordering is the one quantity that is not a matter of opinion: **what
optimising each prompt would actually recover**, obtained by running the
deterministic rules rather than evaluating a formula. The structural
measurements are printed beside it as the *explanation* — tokens per sentence
(verbosity independent of length), few-shot examples and what they cost, a
restated output format, and the share of the prompt that is protected content.

That last one earns its place: a prompt that is 83% code has far less headroom
than its size suggests, and a ranking that hid it would send somebody to spend
an afternoon on a file that cannot move.

Source files contribute their marked prompt, never the code around them. One
with no marker is skipped **and counted**, so a repository whose prompts mostly
live in code does not show a short list and look complete.

Two tests hold the line against a score reappearing: `PromptProfile` may not
grow a field whose name contains "score", "rating", "grade", "index" or
"complexity", and neither may the ranking's JSON.

### Fixed

Two problems in that work, both visible only by running it:

- **A single unmarked source file aborted the whole ranking.** `sourceFileOf`
  throws for a source file with no `// trazum:prompt` marker, which is right for
  `optimize` — you named that file, and optimising it would rewrite your code —
  and wrong for a command walking a directory. One stray `.ts` killed the other
  thirty-nine.
- **Four prompts showed `$0.25` and looked like four equivalent jobs.** Three of
  them recovered a single token, which at 50,000 calls is twenty-five cents. The
  arithmetic was right and the presentation was not. Rather than invent a
  threshold nobody could check, the token count is printed beside the money.

### Added

**`optimize --suggest` — rewrites proposed one phrase at a time.**

`--llm` hands the model the whole prompt and takes the whole answer back, which
is all-or-nothing in both directions: a result that fails one safety check
leaves the author with nothing, and one that passes is a wholesale rewrite they
must read end to end before trusting. `--suggest` asks which exact phrases say
something in more words than they need, and returns a list small enough to judge
on sight — `You should always make sure to → Always`.

The model proposes; the prompt decides. Every suggestion is checked against the
text before it is shown and dropped rather than reconciled: `before` must appear
byte for byte (a model asked to quote will tidy the punctuation as it goes), it
must not touch code, URLs, placeholders or tags, `after` must not introduce any,
it must actually save tokens, and overlapping suggestions are refused because
applying both produces text neither described. A phrase occurring several times
is rewritten everywhere it appears *outside* protected content rather than the
whole suggestion being refused for one occurrence in a code block.

Nothing is applied unless asked. `--apply-suggestions` takes them and the
headline figures move with the change; on its own it is an error rather than a
no-op, for the same reason a misspelled flag is.

The model is asked about the **optimised** prompt, not the one as written —
re-finding what the rules already took spends a call to be told what Trazum knew
for free.

### Fixed

The first version of the CLI test for this deadlocked and had to be killed by
the timeout. It drove the binary with `spawnSync`, which blocks the test
process's event loop, so the fake LLM server living in that process could never
answer the child it was waiting on. A fake server in the test process only works
if the test process is free to run.

### Added

**`trazum blame <file>` — when this prompt got expensive, and what change did it.**

Git already knows who edited a prompt and when. What it does not know is that
three lines added to a system prompt at 50,000 calls a month is a bill rather
than a diff. `blame` walks the file's history, counts the tokens at each commit,
and puts both facts on one line — with the net movement priced through the same
usage profile `optimize` uses, and the single worst commit named.

`--prompt` tracks one marked prompt inside a source file, so refactoring the
imports is not read as the prompt growing. Renames are followed. `--limit`,
`--json`, and the pricing flags behave as everywhere else.

This is the first thing in the repository that runs another program, so it
happens in one module written as though it were the whole attack surface: no
shell, every path after a `--` separator, object names validated as 40 hex
digits before being glued to anything, bounded timeout and buffer, and no
credential prompting. Six invariants in `security.test.js` assert all of that,
each checked against a mutant — including that `git.ts` stays the *only* file
importing `node:child_process`.

**Every command now honours `--` as the end of options.** Without it there was
no way to name a file called `-x.txt` or `--output=…` on the command line at
all; the parser saw a flag and refused before the path reached anything.

### Fixed

Two bugs found while building the above, both by running it:

- **A renamed prompt reported no history before the rename.** `nameAt` asked
  `git log --follow --max-count=1 <sha> -- <today's name>`, which returns nothing
  for commits where that name did not exist — so every revision before a move
  showed "not present" while the data sat there under the old name. One `git log`
  for the whole history now pairs each commit with the path it touched.
- **`--limit` was ignored.** It was accepted by the command's flag list but never
  added to `VALUE_FLAGS`, so `--limit 6` parsed as a boolean and the count was
  the next positional argument. It silently walked the default 20 every time.

### Security

**`--reorder` had no safety at all outside English and Spanish.** Not a missing
feature — a silent failure.

`BACKWARD_REFERENCES` was one flat list of English and Spanish phrases, applied
to every prompt. The module's own documentation says its entire design is about
what it refuses; for a French, German, Portuguese, Italian, Dutch, Japanese or
Chinese author it refused nothing. "Résumez le texte ci-dessus" was hoisted above
the text it points at and reported as a saving. Every test in the suite passed,
because every test asked the question in the two languages that worked.

Seven more languages now, grouped per language so the coverage is a thing you can
look at rather than infer. Japanese and Chinese match without word boundaries —
the boundary test asks whether the neighbouring character is a letter, and in
上記のテキスト it always is, so a boundary-matched CJK list would have read like
cover and provided none.

**And a fourth refusal, for the scripts still missing.** Cyrillic, Arabic,
Hebrew, Hangul, Devanagari, Thai and Greek: nothing moves, and the report names
the script and says why. A single such instruction inside an otherwise English
prompt is enough to stop it — that is the case where a missed reference does
damage, and the cost of being wrong is a saving the author can still take by
hand. Adding a language is adding an array.

Three tests keep this honest rather than trusting it: the README's list of
languages must match the table, no phrase may be capitalised (it could never
match), and no covered language's phrases may use an uncovered script. All were
checked against mutants.

### Fixed

Two pluralisation slips in the reorder report, both visible in the output above:
"1 tokens back, every call" and "Left 1 block where they were".

### Changed

**The web app is rebuilt on shadcn/ui, wearing Trazum's own palette.**

The components are shadcn's — Radix underneath, so the model and level pickers
are properly keyboard-navigable and the toggles announce themselves, which the
bare `<select>` and `<input type="checkbox">` never did. The colours are the ones
that were already here: `--primary` derives from `--terracotta`, `--background`
from `--paper`, and so on down. Taking shadcn's neutrals would have made this
look like every other application assembled from the same registry, and the
whole point of theming through CSS variables is that you do not have to.

Two changes are not cosmetic. The result and the diff are **tabs** rather than a
toggle button whose label named the state you were not in — that button was read
backwards about half the time. And the endpoint field is the picker the previous
release made it, now rendered as one.

Animation comes from react-bits' `CountUp`, `AnimatedContent` and `ShinyText`,
rebuilt on `requestAnimationFrame` and CSS keyframes: upstream builds them on
`motion`, and one animated integer is not worth a 50 KB dependency in a project
whose published packages have none. `prefers-reduced-motion` switches all of it
off in one rule rather than component by component.

### Fixed

**Two bugs in that rework that compiled, typechecked, and were wrong.** Both were
found by opening the page, not by reading the diff.

The results summary rendered *blank*. `AnimatedContent` waited for an
`IntersectionObserver`, and a reader who scrolls down to reach the Optimise
button gets their result mounted above the viewport — so the observer reported
"not intersecting" and a 214px card sat there at zero opacity. Content that
appears in response to an action is not scroll-triggered content; it animates on
mount now, and waiting for the viewport is opt-in.

The Copy and Clear buttons each fell onto their own row. `CardHeader` is a grid,
so the `flex-row justify-between` on it merged in and did nothing — the two
utilities are in different groups, so nothing overrode anything and the class
list read as though it should have worked. They use shadcn's `CardAction` slot,
which is what the grid has a rule for.

`apps/web` has tests for the first time, and they encode exactly these two: a
component whose default hides content, and a layout override that is silently
ignored. Both were checked against a mutant that reintroduces the bug.

### Fixed

**The alert gate raced the analysis it reads, and failed the merge that fixed
both alerts.** `open-alerts` and `codeql` started together: the gate finished one
second in, CodeQL uploaded a minute later, so the gate judged the merge against
the state of the commit before it and reported two findings at line numbers that
no longer existed. A red build for a fix that worked is how people learn to
re-run until green.

It now runs `needs: codeql`, and — because the alert index settles after the
upload returns — checks that every row it is about to report carries the SHA
being built, retrying for up to 90 seconds and failing rather than passing if it
cannot read current state. A gate that cannot see the present has no business
reporting green.

The test for it caught nothing at first: `/needs:\s*codeql/` matched the comment
explaining the dependency. Fourth time in this repository. It strips YAML
comments now and asserts against a mutant with the line deleted, so "can this
assertion fail?" is answered rather than assumed.

### Security

**CodeQL reopened the SSRF alert on the fix below, and it was right a third
time.** Both earlier attempts hardened the wrong layer. The taint does not start
at `TRAZUM_LLM_BASE_URL`, which an operator sets on their own machine — it starts
at `POST /api/optimize`, whose body carried a `baseUrl` that the deployed server
would then fetch. That is server-side request forgery by construction, and no
amount of validating the string fixes it: the host filter reads a *name*, and a
name an attacker registered resolves wherever they choose.

**So the request body no longer names an endpoint. It selects one.**
`TRAZUM_ALLOWED_LLM_ENDPOINTS` is a comma-separated list the operator writes, and
the value that reaches `fetch` is the entry from that list — the string that
arrived over HTTP is compared and then dropped. The list is empty by default, so
a deployment that has not thought about this cannot be pointed anywhere at all.
Nobody loses the capability: `TRAZUM_LLM_BASE_URL` and the CLI still go anywhere
you like. What changed is who is allowed to choose. The web UI's free-text field
is now a picker over what the server actually accepts, because offering a text
box that always answers 400 is worse than offering nothing.

**A redirect walked past the entire host filter, and had all along.** Every check
in `net.ts` reads the URL the caller named, and `fetch` follows redirects by
default — so an endpoint that passed validation could answer
`302 Location: http://169.254.169.254/latest/meta-data/` and the request went
there anyway, `authorization` header included. One HTTP response, and the whole
filter was decorative. Every server-side call now carries `redirect: 'error'`,
plus `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`. This one mattered
for the CLI as much as for the deployed app, which is why it is fixed in the
provider rather than in the route.

**And a third door nobody had looked at.** `countTokensAnthropic` takes a
`baseUrl` and sends an `x-api-key` to it, with no validation whatsoever. Both
providers had been hardened twice over while this sat open, because it is called
a counter rather than a provider. It goes through the same gate now.

### Security

**The alert gate found two things on its first real run**, which is the argument
for it in one sentence. Both were invisible to every pull-request check.

**The SSRF fix did not close the alert, and CodeQL was right.** Validating at
construction checked `baseUrl` and then fetched
`` `${baseUrl.replace(/\/$/, '')}/chat/completions` `` — two different
expressions, so the thing checked was never the thing used and nothing on the
path from option to fetch was a barrier. A later edit could have moved the check
without anything noticing.

The validator now **returns the value to use** rather than approving one, and the
fetch uses what it returned. Re-parsing normalises it too:
`https://host/v1/../../admin` passed as a string and resolved to `/admin` on the
wire; it is resolved before the request now.

**And a time-of-check to time-of-use race I introduced an hour earlier.** The
symlink guard was `lstat` then `readFile`, which resolves the name twice — CodeQL
opened it as high severity. It is now a single `open` with `O_NOFOLLOW`: one
syscall, and the handle is the file that was checked.

This repository had already been caught by the identical `stat`-then-read pattern
in the config reader and fixed it the same way. I wrote it again anyway, which is
the more useful half of the finding: the guard against a class does not live in
anybody's memory.

**A third thing turned up while fixing those two: one file had no diff.**
`scripts/measure-token-band.mjs` used a raw NUL byte as a hash field separator,
which is enough for git to call the file binary. Its three commits — including
the one that fixed the SSRF finding above — rendered as
`Bin 7652 -> 7654 bytes`, and nothing anywhere warned that a security fix had
gone through unreadable. The byte is now written `\0`, which produces the same
digest, and a test refuses a raw NUL in any source file: the other invariants
here all assume somebody can read the code.

### Security

**A job now fails the build when `main` carries an open critical or high alert.**

CodeQL's pull-request check reports *new alerts in the code that pull request
changed*. A finding already open on `main` is not new, so every later pull
request goes green beside it — which is exactly what happened: **eleven
consecutive green runs with a critical SSRF alert open the whole time**, found
only because somebody opened the Code scanning page and looked.

Green on a pull request is not green on the repository, and nobody should have to
remember the difference.

Four decisions in the job worth stating:

- **It reads `security_severity_level`, not `severity`.** The first is the
  CVSS-style rating the UI shows as "Critical"; the second is the query's own,
  where today's critical was merely `error`. Reading only the second would have
  let it through.
- **`security-events: read`.** A job that could dismiss an alert is a job that
  could dismiss the alert it was written to surface.
- **Skipped on pull requests.** There it would report the base branch's state and
  fail somebody's unrelated work for a finding they cannot fix from their branch.
- **It can actually fail.** The `jq` filter was checked against a realistic
  payload — one critical, one medium, one with no severity field at all — before
  it was committed. A gate that cannot fail is worse than no gate, because it
  looks like coverage.

`SECURITY.md` gains the row, and two tests assert the job still asks the right
question and stays read-only.


**`optimize` pointed at a source file used to rewrite your code.** Handed
`src/prompts.ts` it optimised the *whole file* — imports, `const client = new
OpenAI();`, all of it — counted 83 tokens of code the model would never see, and
priced it against Claude Opus 5 on a file that plainly imports `openai`.

Then the capitalisation rule turned `import OpenAI` into **`Import OpenAI`**,
which does not compile, and `-o` wrote it back over the file. That is the worst
behaviour this repository has shipped, and it was the default.

It now reads the marked prompt and leaves the file alone — 43 tokens instead of
83, and the output is the prompt rather than mangled TypeScript.

**It refuses rather than guessing**, in three places:

- **An unmarked source file.** Optimising TypeScript as prose does not produce a
  worse prompt, it produces broken code. The refusal names the marker syntax, so
  it costs the reader one comment.
- **A file holding several marked prompts** — it lists them and asks for
  `--prompt`. Optimising "the first one" silently is how the wrong prompt gets
  rewritten.
- **A marker it cannot read**, naming the line and the reason.

**Detection now feeds the price**, closing the gap `trazum where` opened: an
import names who and never which, so the provider's stand-in model is used and
the report says GPT-5 rather than Claude. The layering is unchanged and now has
one more rung — a flag beats config, config beats detection, detection beats the
built-in default. Reading the code is better than assuming, and worse than being
told.

`--prompt <name>` is new. A plain `.txt` prompt and stdin go through exactly as
before, which is asserted rather than assumed.


### Security

**The SSRF filter was one level too far out.** `openAiCompatible` fetches whatever
`baseUrl` it is handed, with no validation of its own. The web route validated a
body-supplied URL before calling it, and that was the only thing standing between
a public deployment and the internal network — which `SECURITY.md` claims as a
property of the filter, not of one caller remembering to use it.

`openAiCompatible` and `anthropicProvider` now validate their own endpoint at
construction, so a provider that can never safely work does not exist to be
handed around. `openAiCompatible` is an exported library function: "the caller
checks" is a promise about every future caller, including ones outside this
repository.

The distinction that makes this safe without breaking anything is **who chose the
URL**:

- From `TRAZUM_LLM_BASE_URL` — the operator configuring their own machine.
  `providerFromEnv` passes `allowInsecure: true`, because `http://localhost:11434`
  for Ollama is the documented normal case and refusing it would break every
  local setup.
- From an HTTP request body — a stranger naming a host for this server to fetch.
  Validated, and now twice: the route still turns the reason code into a sentence
  in the reader's language.

Verified by hand across the shapes that matter: the cloud metadata address, plain
localhost, an RFC1918 address and credentials in the URL are all refused; a public
https endpoint and an operator-configured Ollama both work.

**`measure-token-band.mjs` followed symlinks.** The script posts corpus file
contents to the counting endpoint — that is its job, and CodeQL flagging the
file-to-network flow describes the job rather than a bug. What it made worth
checking was the edge: `readdir` plus `readFile` follows a symlink, and the corpus
is a test-fixture folder people drop things into. One named
`few-shot.txt -> ~/.aws/credentials` would have been posted to an API without a
word. `walkPrompts` has skipped symlinks since it was written; this script had
simply never been held to the same rule.

It now refuses a symlink by name and prints every file it is about to send before
sending any of them. The repository tells people not to paste a private prompt
into a public issue; posting one to an API deserves the same warning, and consent
has to be informed to be consent.

**Both alerts had been open on `main` for hours** without appearing on any pull
request. The CodeQL check on a PR reports *new* alerts in the changed code, so a
finding on `main` stays green on every subsequent PR — worth knowing about the
tooling, not just about these two.


**The report reads like a report.** Twelve releases added sections to it and
nobody had looked at the whole thing at once. Printed end to end, three problems
were obvious:

- **The amounts were unreadable as a set.** Four advisories worth $506, $422,
  $170 and nothing, each with its figure trailing the end of a different-length
  title. They exist to be compared, and comparing them meant hunting for four
  numbers in four sentences. The amount now has a column of its own, right
  aligned, with the detail indented to the title so the prose forms one block
  instead of stepping around the numbers.
- **Nothing said what to do first.** The rules saved $1.25 and the top advisory
  was worth $506 — a 405× difference the reader had to notice for themselves. A
  closing line names it: `Start here: "This task may not need Claude Opus 5" —
  $505.80/month, 405× what the rules saved.`
- **`--reorder` printed a heading, a blank line and a shrug** when there was
  nothing to move and nothing refused. The token count above had already said
  nothing changed. That block now appears only when there is a move or a refusal
  to report.

Two things caught by looking at the output rather than the diff: the closing line
lowercased the advisory title, turning "Claude Opus 5" into "claude opus 5" — a
product name mangled to fit a sentence — and it was the one line in the report
not wrapped to the common width, so it ran off a narrow terminal.

A test that matched `Nothing could safely move.` was rewritten to assert the
behaviour instead: that the prompt came back unrearranged. A test pinned to a
line that says nothing is what keeps that line alive.


**On a subscription, Trazum stops printing money.** Inside Claude Code, Codex or
Cursor you pay the same whatever your prompt costs, so a monthly figure is
arithmetic about tokens dressed as cash — and "$184/month" told to somebody on a
flat plan is not a rounding error, it is money that does not exist.

The report now says what the saving actually buys there: tokens back per call,
and the share of the context window they free. The window is the real currency
inside an agent — every token the system prompt holds is one the conversation
cannot.

**Advisories whose only pitch is money are dropped too**, which the first version
got wrong. Suppressing the price beside each title left `model-downgrade`'s detail
reading "you would go from $843.00 to $337.20 per month" in prose underneath.
`model-downgrade`, `batch-api`, `output-dominated` and `promo-pricing` now go
entirely; caching, context overflow, contradictions and redundant examples stay,
because latency, headroom and correctness are still real on a plan.

The test for this is blunt on purpose — **no dollar sign anywhere in the output**.
A softer assertion would have passed the version with money in the prose.

Two escape hatches, and the reasoning behind them matters more than the flags:
the host says where *Trazum* runs, not where the prompt goes. Somebody editing a
production prompt inside Cursor wants the dollars, so `--cost` brings them back
without leaving the editor, and `--tokens-only` forces the other direction
anywhere. `--cost` wins when both are given.

Also fixed before it shipped: forced with `--tokens-only` on GitHub Actions, the
report announced that "GitHub Actions bills by subscription", which is simply
false. It now distinguishes being told from having detected. And `unknown` billing
is treated as `unknown` rather than as a subscription — guessing wrong there would
hide the product's main output from most of the people using it.


**`trazum where` — which provider a prompt is actually sent to.** Pricing seven
providers turned the Claude default into a wrong number: a file calling OpenAI was
billed against Claude Opus 5 without comment. This reads what the code already
says instead of assuming.

Four kinds of evidence, strongest first: `model=` on a `trazum:prompt` marker, a
quoted model id, a base URL, an SDK import. Every answer names the line it came
from — a detection that cannot be checked is a guess, and the dollar figure that
follows from it would be a guess too.

Three things it gets right that the first version got wrong, each caught by
running it rather than reading it:

- **A base URL beats the SDK it was pointed at.** Moonshot, DeepSeek, xAI and
  Groq are all called through the OpenAI SDK with a different `base_url` — their
  documented usage. Treating that as a contradiction refused to price a perfectly
  ordinary client; pricing it as OpenAI would have been wrong for a large slice of
  everyone using this.
- **It priced an OpenAI file as Claude.** Detection found the provider, found no
  model, and fell through to the global default — printing "goes to openai" and
  "priced as Claude Opus 5" three lines apart. It now uses that provider's own
  model and says that is what happened.
- **Nearest capability, not an exact match.** Neither OpenAI nor DeepSeek has a
  `large` model, so matching the default's capability exactly found nothing and
  the fallback fired anyway. A ladder with different rungs is the normal case.

**It refuses when a file names two providers**, names both, and assumes nothing.
Detection sits between config and defaults: a flag beats config, config beats
detection, detection beats the built-in default.

With no file it reports the host — Claude Code, Codex, Cursor, GitHub Actions, CI
or a plain terminal — and **warns when that host bills by subscription**, because
a monthly saving is arithmetic about tokens there rather than money anybody gets
back. That is the first half of the Cursor/Claude Code question the roadmap has
been holding: not a full report in a different unit, but no longer quoting a
dollar figure to someone on a flat plan without saying what it is.

A third quadratic line-number lookup, found by the hostile-input tests before it
shipped — 36 seconds on a file repeating a model id. Same shape as `extract.ts`,
written again after fixing it there; a binary-searched line index this time,
because the matches arrive out of order and a forward-only counter cannot work.


**The report no longer claims a Claude number for a model that is not Claude.**
Pricing seven providers left the token estimator where it was — tuned against
Claude's tokenizer — while `±15%` kept printing beside GPT and Kimi figures. That
band was never measured for those families, and stating it was a precision claim
nobody had earned:

```
1,021 → 1,020   -0.1% (estimated — the counter is calibrated on Claude, not GPT-5)
```

Anthropic models still show `±15%`, where the band is at least the claim it was
written for. `--exact-tokens` remains the answer for figures you can budget from.

Documents the multi-provider work that shipped alongside it: a table in the README
of what actually differs between providers — cache read rates, cache minimums,
whether caching starts automatically, and which providers have no batch API or no
caching at all — plus the two things deliberately left out and why.

The `Tokenizer per model family` entry under `Under consideration` is heavier than
it was, and says so. And the error-band entry now explains **once** that it will
keep being renumbered by anything that ships before it, rather than re-justifying
the move each time: it is the only item on the roadmap whose completion is not
ours to schedule, and holding shippable work behind it would be the wrong trade
every time.


**Trazum prices models from seven providers, not one.** OpenAI, Google, Moonshot,
DeepSeek, xAI and Mistral join Anthropic in the bundled catalogue.

The data was the easy half. The hard half was that **the cost multipliers were
global constants** — one cache-read rate, one cache-write rate, one batch
discount for everything — and global made them quietly wrong the moment a second
provider existed. They now live on the model, defaulting to Anthropic's values so
nothing that worked before changes.

Three of them were not inaccuracies but **savings that do not exist**, and all
three were found by running the catalogue rather than by reading it:

- **Kimi, DeepSeek and Grok have no batch API.** The global constant offered them
  a 50% discount that cannot be bought — $139 a month in the test that caught it.
  `batch: null` now means "there is no batch API", which is deliberately different
  from not having said.
- **Mistral has no prompt caching.** A zero cache minimum satisfied `0 >= 0`, so
  the caching advisory fired and offered $100 a month of a feature that does not
  exist. Introduced by this very change and caught before it left the branch.
- **The batch saving was computed as `cost × discount`**, which equals the saving
  only when the discount is exactly 0.5. Latent on Anthropic, wrong on the first
  provider with any other rate.

Gemini and Grok read cache at 25% of input against Anthropic's 10%, so the same
prompt cannot be worth the same fraction on both. The advisory now quotes each
provider's real rates — and **stops naming `cache_control` to people who do not
have it**: OpenAI, Moonshot and DeepSeek cache automatically above a threshold,
and the report says so instead of naming a parameter that does not exist for them.
The advice to move stable content forward is identical either way, because a
prefix is a prefix.

**A cheaper model means a cheaper model, not a different supplier.** Recommendations
are now scoped to the current provider. Dropping from Opus to Sonnet is a one-line
change; moving to another vendor is a different API, different behaviour and a
migration — and this advisory is already caveated as a keyword heuristic rather
than a judgement about answer quality. Unscoped, it was telling Claude users to
switch to `gpt-5-nano`.

### Deprecated

- **`ModelPricing.tier`** — replaced by **`capability`**, on a vendor-neutral scale
  of `small | mid | large | frontier`. Anthropic's ladder used as the generic axis
  reads as nonsense the moment the model is not Anthropic's: telling somebody on
  Kimi that their task "looks like haiku complexity" is a label meaning something
  other than what it says.

  **Migration:** replace `model.tier` with `model.capability`, mapping
  `haiku → small`, `sonnet → mid`, `opus → large`, `frontier → frontier`.
  `cheapestOfTier` and `cheapestOfTierIn` still take the old names.

  Per [VERSIONING.md](VERSIONING.md), `tier` keeps working unchanged for the whole
  of 1.x and is removed in 2.0. Both fields are populated on every model and a test
  asserts they never disagree — if they drift, half the code ranks one way and half
  the other, and the difference is invisible until a recommendation is wrong.

### Added

- `multipliersFor(model)` — the cache and batch rates that apply to one model,
  defaults filled in. Anything computing a cost should go through it rather than
  reading `COST_MULTIPLIERS`, which remains exported and remains correct for
  Anthropic.
- `ModelPricing.provider`, `.caching`, `.multipliers` and `.recommendable`. The
  last replaces a hardcoded model id inside `cheapestInTier` — a model behind a
  private programme is real and worth pricing, but recommending a switch to
  something the reader cannot buy wastes their time.
- An optional `provider` argument on `cheapestOfTierIn`, so a caller who genuinely
  wants "cheapest anywhere" can still ask.

**On the prices themselves:** they are written from what was known when this
landed, not read off each provider's page today, and `PRICING_LAST_REVIEWED` says
when. The tests check them for coherence — output dearer than input, a plausible
window, a cache minimum only where there is a cache — never for accuracy, which no
test here can do. The local pricing overlay corrects any of them without upgrading
the library.


**Reordering for the cache is on the web.** It is the largest saving Trazum can
make — a $0 caching saving against a $184 one on a 1,178-token support prompt —
and it was reaching only people who had cloned the repository and built the CLI.
The web is the front door; the biggest thing the product does should not require
a terminal to find.

Opt-in over HTTP for the same reason it is opt-in on the command line, and the
reason is stated in the route rather than left in the diff: every other
transformation the endpoint performs deletes text whose absence is local, and this
one *moves* text, where order carries meaning. Nothing about it is less safe here
— the same deterministic core, nothing sent anywhere, the prompt returned
byte-identical when it cannot act — but "the browser did it quietly" is not
something this endpoint should be able to do.

- **Honoured only on a literal `true`.** A string, a number and `null` are all
  ignored: the body is untrusted, and a truthy check would let `"false"` rearrange
  somebody's prompt.
- **`original` stays what the caller sent**, so the diff the browser draws shows
  the move instead of hiding it behind the deletions.
- **Refusals come back in the response** and render whether or not anything moved.
  The panel is deliberately not styled like the green savings box — that is a
  saving to enjoy, this is a change to review — and it sits above the money so the
  number is read after the caveat rather than instead of it.

Verified against the running server rather than the module underneath it: the
endpoint moves and reports, omits `reorder` entirely when it was not asked for,
returns the prompt byte-identical with both refusals named when it declines, and
ignores a non-`true` value three ways. The checkbox and its warning render in both
locales.

`ROADMAP.md` records what is deliberately **not** coming to the web — the pricing
overlay, config-aware defaults and budgets — with the reasoning, rather than
leaving three unexplained gaps. A textarea for pasting prices into somebody else's
server is not the overlay feature wearing a different hat; it is a worse one, with
no review and no provenance.

The queue was renumbered so `Released` runs unbroken: embedded prompts became
1.3.0 and the web 1.4.0, and **the error band moved to last**. Its corpus, harness
and test all shipped; the measurement needs the official counting endpoint and a
key, so it is the only entry whose completion is not ours to schedule. Holding two
releases that could ship behind one that cannot would have been the wrong trade,
and the file says so rather than renumbering quietly.


**`check` now reads prompts embedded in source files.** It read `.txt`, `.md`,
`.prompt` and `.tmpl`; real prompts live in TypeScript template literals and
Python strings, so adopting Trazum meant refactoring them into standalone files
first — the largest barrier to adoption the tool had.

```ts
// trazum:prompt support-system
export const SUPPORT = `You are a support agent.

Customer message: ${message}`;
```

**It reads a marker rather than guessing.** Inferring which string in a file is a
prompt is a heuristic, and a heuristic inside a CI gate fails builds over log
lines and SQL queries. `//`, `#`, `--` and `<!-- -->` cover the languages prompts
live in.

`${x}` needed no handling at all: it is exactly the shape `segment.ts` already
protects, so an embedded prompt gets the same cache-prefix analysis, rule
protection and `--reorder` treatment as a `{{x}}` template, with no second code
path to drift.

- **Each prompt is budgeted on its own**, not summed into the file. Four prompts
  in a file are four things to govern, and the imports around them are not tokens
  the model will see.
- **The id is path-prefixed** — `src/prompts.ts#support-system`, or
  `src/prompts.ts:12` for a bare marker — so existing `budgets` globs cover
  embedded prompts without new syntax.
- **Source files are scanned without being opted into.** Requiring config to
  discover a marker somebody just wrote is how `eval` came to be fully implemented
  and completely undiscoverable. An unmarked source file is dropped silently.

**A marker Trazum cannot read fails the build.** A prompt assembled by
concatenation has no text until it runs; Trazum declines it and names the line
rather than governing the fragment it can see. The author marked that prompt to
have it governed, and a green build saying otherwise is the same lie as "0
failures" from a run that measured nothing.

Scanned character by character rather than with a regex, and the hostile-input
tests earned their place immediately: the obvious line-number lookup was quadratic
in the number of markers — 15.5 seconds on a file holding 20,000. Caught before it
shipped rather than after.

One more found in review, by CodeQL: `<!-- trazum:prompt greeting--!>` produced the
name `greeting--!>`, because `--!>` is the *comment end bang* the HTML parser also
accepts and only `-->` was being stripped. Fixed for both terminators, and the
class closed behind it — a name is now constrained to an identifier charset rather
than "whatever is left on the line", falling back to the `file:line` id when it is
not one. The name is printed in reports and matched against budget patterns; it
should never have been arbitrary text.

`diff` for embedded prompts is still to come; `check` is the gate and came first.


**The ±15% error band now has a corpus, a harness and a test.** It is printed on
every report, appears in both READMEs, in the estimator's own doc comment and in
`VERSIONING.md` as part of the frozen API — and `estimateTokens` was tested for
exactly three things: zero on empty input, monotonic growth, and never returning
`NaN`. Nothing measured its accuracy, and every dollar figure Trazum prints
descends from it.

Eight corpus samples, chosen to exercise the branches the estimator actually has:
prose in English and Spanish, Japanese and Chinese, code with fenced blocks,
few-shot Input/Output pairs, a punctuation-heavy Markdown table, and dense
numerics. `scripts/measure-token-band.mjs` (`npm run measure:tokens`) counts them
against the official endpoint and subtracts the message envelope, so the figures
describe the text rather than the request around it.

`token-band.test.js` asserts the band per sample. Three deliberate choices in it:

- **It does not pass quietly while unmeasured** — it skips out loud and names the
  command. "0 failures" from a check that measured nothing is the most misleading
  thing this suite could report, which is the same reasoning that makes `check`
  treat an unbudgeted run as an error rather than a pass.
- **It requires the docs to admit the band is unverified** until ground truth
  exists, so `±15%` cannot harden from a design target into a fact nobody
  established. `tokenizer.ts` and the README now say so.
- **It carries a digest of the corpus**, because a fixture describing text that
  has since been edited passes while describing something else.

Both paths were exercised before committing: a synthetic fixture confirmed the
band assertions fire per type with an actionable message, and that editing the
corpus afterwards fails on the digest. **The synthetic fixture was then deleted** —
fabricated numbers are exactly what this test exists to prevent, and committing
them to make a suite look green would be the same failure wearing a lab coat.

**Needs the maintainer once:** `ANTHROPIC_API_KEY=... npm run measure:tokens`. The
endpoint is free and does not run the model. Commit what it writes and the
assertions go live; if the bands differ materially by type, the reports stop
printing one number for all text.


**A tag now publishes the release.** Publishing is the one action in this
repository that cannot be undone — npm allows unpublishing for 72 hours and then
the version number is spent for good — and until now it was also entirely manual.
A tag matching `v*.*.*` runs full `verify`, reports exactly what each tarball
would contain, and then publishes both packages.

**Trusted publishing (OIDC), not a stored `NPM_TOKEN`.** That is the decision in
this change rather than an implementation detail. A long-lived publish token would
be the highest-value credential the project holds, sitting in secrets permanently
for something used a few times a year — and unlike every other secret here, a leak
is not recoverable by rotation alone, because whatever was published under it
stays published. OIDC needs `id-token: write` and stores nothing. Provenance comes
free with it, so a consumer can verify a tarball was built from this repository at
this commit.

Three refusals, each a mistake with no correction afterwards, and each with a test:

- **The tag and the manifests must agree.** `publish.test.js` already asserts
  every manifest carries the same version; the workflow checks that the shared
  version is the tagged one.
- **`verify` runs before anything is published**, and it is the same `verify` a
  pull request runs. A release gate that checks less than the pull-request gate
  lets through exactly what the tag was for.
- **`workflow_dispatch` is dry-run only** — every publish step is gated on a tag.

`@trazum/core` publishes first, because the CLI depends on it at an exact version
and the other order leaves a window where installing the CLI fails.

**Still needs the maintainer once:** the `@trazum` scope does not exist on npm, so
it has to be created and this repository configured as a trusted publisher.
[docs/releasing.md](docs/releasing.md) is new and has the exact fields, the
cutting-a-release checklist, and what to do when a release goes wrong — including
the field that is easy to get wrong: npm's *Environment* must read `release`, or
the OIDC claims do not match and the publish is rejected with an error about the
token rather than about the mismatch.

Until it is done a tag push runs every check and fails at the publish step — which
is the right failure, having published nothing.

**Issue templates, so a tester has somewhere to land.** `.github/` had CODEOWNERS,
Dependabot and workflows but no way for anyone to report anything. Two forms: a
bug report, and *"a rule changed what my prompt asks for"* — the second one
separate and labelled `correctness`, because Trazum's entire claim is one sentence
and a rule that saves tokens while quietly changing the meaning is the failure the
product exists to prevent, not a smaller version of a good outcome.

Both forms ask for a reproduction and both warn, before anything else, not to
paste a prompt containing anything private: Trazum runs entirely on your machine
and never sends a prompt anywhere, but an issue is a public web page. Security
reports are routed to a private advisory rather than an issue, and blank issues
stay enabled — the reports nobody anticipated are usually the interesting ones.


**Property tests for `reorderForCache`, over 400 generated prompts.** The
hand-written fixtures each ask one question about one prompt, and a fixture list
only asks the questions it encodes — which is how two quadratic patterns, a CRLF
bug and a leading-blank-line bug all shipped in the same module and were caught
one at a time afterwards.

Eight properties, checked across every generated case: content is conserved (no
word deleted or invented), a refusal returns the prompt byte-identical, a move
always grows the prefix and the figure reported matches what the advisories'
analyser computes, moved blocks keep their relative order, backward references
and placeholder blocks never move, the transformation is idempotent, the author's
line ending survives, and the prompt neither opens with a blank line nor ends
differently from how it was given.

Generation is seeded rather than random, so a failure names a case you can
reproduce by reading the seed out of the message.

All eight pass. Three failed on first run and all three were the *assertions*
being wrong rather than the code: `indexOf` from zero finds the first copy of a
repeated block, so a duplicate read as an out-of-order move; the generator emitted
mixed line endings and then asked whether endings were preserved; and a moved
block legitimately brings its own indentation to the front when the placeholder
sits on the first line. Each is now written to ask what it meant to ask.


**A piped `--reorder` said nothing about what it had done.** Redirecting the
output takes the "prompt and nothing else" path, which is right for every other
transformation — they delete, and the diff shows it. This one moves text, and
piping it made both the move and the refusals invisible. That is precisely what
the module promises not to do: *"a saving Trazum chose not to take is one the
author cannot evaluate."*

One line now goes to **stderr**, so stdout still carries the prompt and nothing
else:

```
trazum: moved 1 block (~1,001 tokens) into the cacheable prefix. Run without redirecting output for the reasons.
trazum: nothing could safely move; 2 blocks left in place. Run without redirecting output for the reasons.
```

**The version comment added yesterday named a version that does not exist.** The
README's SHA pin read `# 1.1.0` against manifests reading `1.0.0` — no such tag,
no such package. The test written to stop exactly this class of drift only
required `#\s*v?\d`, so it passed. It now compares the comment against
`package.json`, and fails on the string it was shipped with. A test that admits
only the shape of an answer will accept a wrong one.


**The README recommended a tag that did not exist.** `Davmunrey/Trazum@v1.0.0`
was the copy-pasteable Actions example for a whole release, and no such tag was
ever pushed — so anyone following the quickstart got a workflow that could not
resolve its own action.

It was also the wrong *shape*. [SECURITY.md](SECURITY.md) says every third-party
action is pinned to a commit SHA because a tag is a movable pointer, and
`security.test.js` enforces that on every workflow in this repository. The README
was telling readers to do the thing the project refuses to do itself.

Both examples now pin to a commit SHA with the `# 1.1.0` comment Dependabot reads,
and a new test extends the SHA-pin rule from *what this repository runs* to *what
it tells other people to run* — the docs had drifted for a release with nothing
checking. The test fails on the old README, which is the only evidence that it
checks anything.


**`trazum optimize --reorder` moves the stable instructions in front of the
placeholder.** Since 0.2.0 the `cache-prefix-reorder` advisory has pointed at the
largest saving Trazum knows about and no command could take it. Prompt caching is
a byte-for-byte prefix match, so everything after the first `{{placeholder}}` is
re-read at full price on every call. Measured on a 1,178-token support prompt: 14
tokens cacheable as written, 1,174 after rearranging the same content — the
difference between a $0 caching saving and a $184 one at 50,000 calls a month on
Opus.

**Opt-in, and deliberately not part of `aggressive`.** Every other transformation
deletes text whose absence is local. This one moves text, and order carries
meaning: "Summarise the text above" is correct where it sits and nonsense in front
of the text it points at. `aggressive` promises "read the diff"; this asks whether
the order mattered, which is a different question.

What it refuses, which is most of the module:

- A block containing a backward reference (`above`, `the following`, `anterior`, …)
  stays put — **and so does everything after it**, because moving a later block
  past a pinned one changes their order relative to each other. The phrase list is
  generous in both locales on purpose: a false positive costs a saving that was
  available, a false negative silently changes what the prompt asks for.
- Only whole blank-line-separated blocks move, so a sentence is never severed from
  the paragraph that qualifies it and the placeholder's own line travels with it.
- Nothing moves without a placeholder, or below the model's cacheable minimum.

A refusal returns the prompt **byte-identical** and names the phrase responsible:
"no saving here" and "there was a saving and it was not safe to take" are
different answers, and only the second one is actionable. `--diff` compares
against what you wrote rather than against the rearrangement, so the move is not
hidden behind the deletions; `--json` carries the whole decision under `reorder`,
refusals included. `check` rejects the flag — it is a gate, and a gate does not
rewrite. `reorderForCache` is exported from `@trazum/core` for callers who want
the decision without the CLI.

### Fixed

Two defects in the rejoined seams, both found by writing the fixtures that had
been missing rather than by a report:

- A placeholder on the **first line** left the rearranged prompt opening with a
  blank line. With no head for the moved blocks to sit after, the usual leading
  gap put whitespace at byte zero — which changes the cache prefix for nothing.
- A **CRLF** prompt came back with mixed line endings, because the seams were
  rejoined with bare newlines regardless of what the author used. In a
  byte-for-byte prefix match a changed byte is a changed price, and in a
  repository it is a diff on every line nobody asked for. The prompt's own line
  ending is now preserved, as is whatever it ended with — collapsing runs of blank
  lines remains the whitespace rule's job, not this one's.

- **Two quadratic patterns** in the new module, found by pointing the existing
  ReDoS suite at it rather than by reading it. `split(/(?<=\n)(?=\s*\n)/)`
  re-consumed a run of blank lines at every position inside it — 13.9s on 120 KB
  of newlines — and `/\s*$/` on a prompt holding a long whitespace run that does
  *not* end in one took **31 seconds at 200 KB**, inside the 400 KB the HTTP API
  accepts. Both are now a linear scan and a `trimEnd`.

  The suite drives `optimize`, which never reaches `reorderForCache`, so nothing
  covered it: a fixture list only asks the questions it encodes. `reorderForCache`
  now has ten fixtures of its own, each sized so the old pattern is well past the
  budget rather than near it.

The cacheable-minimum bar is on the **resulting prefix**, not on the amount moved
— `minPrefixTokens`, not `minTokens`. Those are different questions, and asking
the second one refused a real saving: a prompt whose 1,265-token head already
cached gained nothing from 359 stranded tokens, because 359 is below Opus's
512-token minimum. It reported "nothing could safely move", which is not what
happened.

The declined list in the report is capped at three lines and now says how many it
did not print. A report that shows three of nine reads as "three".

`--reorder` and `--markdown-out` were both **accepted and undocumented** — absent
from `--help` in either locale. The parity test named four *required* flags and
passed the whole time; it now derives the list from what the binary actually
accepts, by reading the allow-list the CLI prints when it rejects an unknown flag.
`--markdown-out` had been undocumented since 0.11.0.


**A post-1.0 roadmap.** `Next` was empty after 1.0.0 — honest, since every planned
item had shipped, but the file's stated purpose is that "the ordering is a
commitment", and it was committing to nothing.

Four entries, and two of them exist because writing the roadmap turned up things
worth saying out loud:

- **1.2.0 — Releasing without remembering.** A tag-triggered workflow, using npm
  trusted publishing rather than a stored `NPM_TOKEN`: a long-lived publish token
  would be the highest-value credential this project holds, sitting in secrets
  permanently for something used a few times a year. It must refuse to publish a
  version that does not match the tag.
- **1.3.0 — The error band, measured.** `±15%` is printed on every report and
  asserted nowhere. `estimateTokens` is tested for zero-on-empty, monotonic growth
  and not-`NaN`; nothing checks its accuracy, and every dollar figure descends from
  it. It is also one number for all text, which the CJK case suggests is not true.
- **1.4.0 — Prompts where they actually live.** Trazum reads `.txt`/`.md`/
  `.prompt`/`.tmpl`, so prompts embedded in TypeScript or Python require
  refactoring an application before Trazum can be adopted at all.
- **1.5.0 — The front door catches up.** The web app optimises and nothing else,
  five releases behind the CLI. Last on purpose: it changes how the product looks
  rather than whether its numbers are right.

Release automation was written as 1.1.0 and is now 1.2.0, because writing the entry
established that it **cannot ship**: publishing needs the `@trazum` scope to exist
on npm, which is the maintainer's to create. Holding the queue behind a
prerequisite outside the repository would have been worse than reordering it, and
`ROADMAP.md` says so in the file rather than only here — the ordering is a
commitment, so a change to it owes a reason.

The `Tokenizer per model family` entry under `Under consideration` now says it is
pending the error-band measurement rather than reading as a pure dependency-cost
decision. Measuring the band is what settles whether a real tokenizer is needed.

Also fixes a doubled `---` left in `ROADMAP.md` by the 1.0.0 edit.

## 1.0.0

**The public API is frozen.** A breaking change waits for 2.0. This is the last
release in which anything can change shape without a major.

[VERSIONING.md](VERSIONING.md) now states what that covers and, as importantly,
what it does not — and it states the **deprecation procedure** rather than leaving
it to be decided case by case:

- `@deprecated` in the JSDoc, naming the replacement. That is the strike-through
  in an editor, which is the only warning most people will ever see.
- A **Deprecated** section in that release's changelog, with the migration written
  out — the actual before-and-after, not "use the new thing".
- Continues working for **at least two minors and six months**, whichever is
  longer. Deprecating and removing in consecutive releases is a breaking change
  wearing a notice.
- Removed only in a major, whose changelog repeats the migration.

A deprecated export **never starts warning at runtime**. A library that prints to
somebody else's stderr because *we* changed our mind is a library people vendor to
make quiet.

Newly named as covered, because they were being depended on either way: the
`--json` shape and units, the CLI's **exit codes**, `@trazum/core/node` as a real
entry point, and the `trazum.config.json` and pricing-overlay schemas. Newly named
as *not* covered: the prose and layout of the human reports — parse `--json`, not
the table.

### Publishable

Both packages would previously have shipped something wrong. Now asserted by
tests in `publish.test.js`, because a published package is the one artefact this
repository cannot take back:

- **A `LICENSE` file**, not just a `"license"` field. The field is metadata; the
  tarball has to carry the terms or nobody who installs it has been given them.
- **A README.** The npm page *is* the README, and both were empty.
- **`engines`.** Without it npm installs silently on a Node too old to run the
  code, and the failure surfaces as a syntax error in somebody else's build.
- **`prepublishOnly`**, which builds and tests. `files: ["dist"]` means the
  tarball is whatever happens to be on disk, so publishing without building would
  have shipped the previous version's code under the new version's number —
  completely silently, and the worst possible outcome.
- **`src`.** Every emitted source map references `../src/*.ts` and carries no
  inlined content, so shipping the maps without the sources gave a debugger a file
  it could not load. That is worse than no map, which would simply step through
  the compiled output. It also means you can read exactly what runs on your
  prompts, which for a zero-dependency library is rather the point.

Publishing itself stays manual. It is the one action here that cannot be undone
after 72 hours.

### A rule can be contributed without reading the engine

New [docs/authoring-rules.md](docs/authoring-rules.md): the four-line rule
contract, what the masking pass already guarantees (a rule cannot break code,
URLs or placeholders because those characters are not in the string it receives),
why **`safe` is a promise** rather than a default, and the three tests a rule
needs — the third being the false-positive case nearly everyone skips.

It also documents the ReDoS fixture **shape** that finds real bugs. Repeated
tokens do not: both bugs found in this repository needed a prefix plus a long
non-terminating run, and the fixtures that missed them were all repeated words.

`CONTRIBUTING.md`'s security-invariant list said "four things" and had drifted to
eight. Corrected, with the import-graph invariant and the two Actions ones added.

### Pricing came off the release cycle

Prices change on someone else's schedule, and until now correcting one meant
upgrading the library — which is backwards: a stale price is a wrong number in a
budget decision.

A **pricing overlay** is a JSON file layered over the bundled catalogue:

```json
{ "lastReviewed": "2027-01-15",
  "models": { "claude-opus-5": { "inputPerMTok": 6 } } }
```

Point at it with `pricing` in `trazum.config.json` or `--pricing <file>`. The
bundled catalogue stays the default, so Trazum is still correct out of the box
and needs no setup.

- **A separate `@trazum/pricing` package would not have solved this.** You would
  still need to install something to get current numbers. A JSON file in your own
  repository actually decouples it, and keeps both properties that matter: the
  core still makes no network call, and it still has no dependencies.
- **The catalogue is a value, not module state.** `applyPricingOverlay` returns a
  *new* catalogue; nothing mutates. A caller who overlays prices does not change
  what any other caller sees, which is what stops one consumer's local prices
  leaking into another's report — and what makes it testable at all.
- **Every report says when overlaid prices were used, and for which models.**
  Without that, a figure from the bundled catalogue and a figure from somebody's
  JSON file look identical. `OptimizationResult` gains `pricingSource`.
- `lastReviewed` is **required** in an overlay, and becomes the catalogue's date.
  An overlay of unknown age is worse than the bundled catalogue, whose age is
  printed on every report; and claiming the bundled date over corrected prices
  would be a lie about provenance.
- Overriding a known model needs only the fields that changed. **Introducing a
  model needs all of them**, because a half-defined model would price at nothing
  and report a saving that does not exist. `"promo": null` withdraws a promotion
  that ended early.
- `withExactTokenCounts` **throws** if a result was priced against an overlay and
  the same catalogue is not passed back. Silently reverting to bundled prices
  would make the token counts and the money come from different sources, with
  nothing in the report to show why.
- `cheapestOfTierIn` ranks a tier on the **effective** price, so a model inside a
  promotional window is compared at what it actually costs today.
- Validation is as strict as the config parser's, same reasoning: a typo'd
  `inputPerMtok` would silently price against the bundled number, and a budget
  decision made on a price nobody applied is the whole failure being prevented.
- `usage.model` validation **moved** from `parseConfig` to `loadConfig`. An
  overlay can introduce a model, and the path to the overlay is a key of the very
  document being parsed — so the parser cannot know the catalogue yet. The check
  is still loud, just raised where "unknown model" can be answered truthfully.
- Tests grow from 390 to 406, including a new `publish.test.js` suite.

**Every third-party GitHub Action is now pinned to a commit SHA.** `SECURITY.md`
listed this as a known limit; it no longer is. A tag can be moved and a branch
moves by design, so `@v3` means "whatever that publisher pushes there next", with
the caller's token and secrets in scope.

- The sharpest case was `actions/dependency-review-action@v5`, whose majors are
  published as **branches** rather than tags — a reference that is *designed* to
  move. (Worth recording: I first read the tag list and concluded `@v5` did not
  resolve at all. It does — `refs/heads/v5` — and the branch is the point.)
- Pinning only freezes a version if nothing bumps it. `.github/dependabot.yml`
  already has a `github-actions` entry, and the trailing `# vN` comment is what
  it matches on.
- Two new invariants: every `uses:` outside this repository must be a 40-character
  commit SHA, and every pin must carry a version comment. A pin with no comment
  is a line nobody can review and nothing will ever update.

## 0.11.0

**Breaking, for the GitHub Action only:** `file` and `max-tokens` are no longer
required inputs. `file` still works and is now a deprecated alias for `target`;
rename it when convenient, and the Action warns when it sees the old name.
Nothing in the library or CLI changed shape. Migration: `file:` → `target:`.

The reports now land where the review happens. `trazum check` and `trazum diff`
grow a `--markdown-out <file>`, and the Action writes that file to
`$GITHUB_STEP_SUMMARY` and — optionally — posts it as a pull request comment
that **replaces its own previous one** rather than adding another.

**Three bugs 0.10.0 introduced in the Action, all the same shape.** Config
support shipped in the CLI while `action.yml` kept passing `--level safe` and
`--locale en` unconditionally. The CLI layers flags over config over defaults,
so an always-present flag meant a project's own `level` and `locale` were never
read; `max-tokens: required: true` meant config budgets were unreachable; and
`file: required: true` meant neither directory mode nor `diff` was exposed at
all. Every optional flag is now added only when it was actually given. **A
default that silently overrides a project's own setting is worse than no
default.**

- **`--markdown-out`** on `check` and `diff`. Written before anything sets an
  exit code, so a report exists precisely when it is needed. A failure to write
  is reported and swallowed: a full disk must not turn a passing check into a
  failing build.
- **The step summary is not behind an input.** It needs no token, no permission
  and no pull request, and has no failure mode worth a switch.
- **The reporting steps carry `if: always()`.** A composite action skips the rest
  of its steps once one fails, so without it the summary would appear only on
  runs nobody needs a report for. The budget verdict is re-raised in a final
  step, and a *missing* outcome counts as failure — a check that never reached
  its own last line is not a green build.
- **`comment: true`** posts the report, found by an invisible marker in the body
  rather than by author. `gh pr comment --edit-last` matches by author, so any
  other step in the job commenting as `github-actions[bot]` would have had its
  comment overwritten. `comment-key` separates two runs that report on different
  things in the same pull request.
- **A green report is collapsed inside `<details>`; a failing one is not.** A
  green table that stays green on every push is the thing a maintainer learns to
  skip — and once they skip it, they skip the red one too.
- **Commenting can never fail the build.** No pull request, a read-only token on
  a fork, comments disabled, an unreachable API: each records a notice and
  carries on, because the report already reached the step summary. A tool that
  turns "could not comment" into a red build gets deleted from the pipeline
  rather than configured. A 401/403 says so in one line and says explicitly *not*
  to reach for `pull_request_target`, which runs a writable token against code
  the contributor controls.
- The poster lives in `action/post-comment.mjs`, outside the workspaces and in
  plain ESM with no dependencies. It needed no security invariant relaxed —
  editing one for convenience is not a reason.
- **Table cells are `<code>` with HTML entities, not backtick spans.** The
  obvious version — wrap in backticks, escape `|` as `\|`, widen the fence past
  the longest backtick run — did not handle a backslash, which CodeQL caught:
  given `a\|b.txt` it emitted `` `a\\|b.txt` ``, and whether that survives
  depends on whether the row splitter reads `\\|` as an escaped pipe or as an
  escaped backslash followed by a live one. It happens to work in cmark-gfm.
  An escaper whose correctness rests on that is not an escaper. With entities
  there is **no `|` in the output at all**, so no scanner can split the row;
  backticks inside `<code>` are literal, so the fence arithmetic disappears; and
  a backslash needs no treatment. Three hazard classes collapse into one rule.
  Paths come from a repository, and on a pull request from whoever opened it.
- The check verdict counts **only what was measured**. "All 3 prompts are within
  budget" over a set where one had no budget claims something nobody
  established.
- New security invariants: every `${{ }}` in `action.yml` must be a *bare* env
  assignment or a condition; the reporting steps must carry `if: always()`; the
  comment step must be unable to fail the job; and a missing outcome must default
  to failure. The old "every input reaches the CLI" assertion was a usefulness
  check dressed as a security one, and it broke the moment an input legitimately
  gated a step instead of being forwarded — replaced by the positional rule,
  which is what actually matters.
- Tests grow from 303 to 359, including a new `action/test` suite wired into
  `npm test`.

**A security guardrail was ineffective, and is now enforced with positive
controls.** Carried over from the previous unreleased entry.

The test asserting *"inputs reach the Action's shell through the environment,
never interpolated into `run:`"* did not do that. Two independent causes: its
`run:` body pattern required a newline after the optional block indicator, so a
single-line `run:` was never recognised as a run block at all; and it searched
that body only for `${{ inputs.* }}`, which is the *safest* value in the set
because it is workflow-authored. The dangerous ones were outside what it looked
at entirely — `github.event.pull_request.title`, `...body` and
`github.head_ref` are written by whoever opened the pull request.

- `action.yml` itself was never vulnerable, and still is not: every input goes
  through `env:`, no `run:` body interpolates anything. What was broken was the
  guardrail meant to keep it that way, and `SECURITY.md` claimed more than the
  test asserted. Both are corrected.
- The rule is now **positional and source-blind**: nothing may be interpolated
  into a `run:` body, ever. Provenance is not something a regex can judge, and a
  step that derives an input from a PR title turns a "safe" source unsafe
  without touching the file the test inspects.
- The harm never depended on the token being writable. Substitution happens
  before bash parses, so the payload runs on the caller's runner with whatever
  secrets that job has in scope.
- **Five positive controls** the scanner must flag, plus a negative control:
  `action.yml` quotes an expression inside a prose comment explaining the rule,
  and a test that fails when you document the reasoning teaches people to stop
  documenting it. The version this replaced had no positive control, which is
  exactly why it passed for every shape it could not see.
- Also asserts that no workflow and not `action.yml` uses
  `pull_request_target` — the event a reviewer reaches for the moment they find
  a fork PR cannot post a comment, and the one that runs a writable token
  against contributor-controlled code. 0.11.0's natural wrong turn now needs
  arguing in a pull request rather than arriving quietly.
- Found while designing 0.11.0, which would have been written in exactly the two
  shapes the test could not see.
- Tests grow from 301 to 303.

## 0.10.0

`trazum.config.json` and directory mode. Two of the three items left over from
0.9.0; PR comment mode for the Action is still open.

**`trazum check prompts/`** checks every prompt under a directory against
per-pattern budgets from the config file — one CI step for a repository of
prompts rather than one step per file.

**The config parser refuses anything it cannot validate, including an unknown
key.** That is the design, not strictness for its own sake: a lenient parser
restores defaults silently, and for a budget the default is *no budget* — a
green build for a prompt nobody measured. Same reasoning as `--max-growh` being
rejected rather than ignored in 0.9.0.

- `trazum.config.json`: `level`, `locale`, `disable`, `usage`, `budgets`,
  `maxGrowth`, `extensions`. Found by walking up from the working directory and
  stopping at the repository root, so a subdirectory inherits the project's
  settings and nothing above the checkout is ever read. `--config <file>` skips
  the search.
- **Flags beat the config; the config beats the defaults.** A config able to
  override an explicit flag would make every flag a suggestion.
- New `--no-<flag>` for booleans, so a setting the config switched on is not one
  you have to edit the repository to escape. `--no-max-tokens` is refused rather
  than silently accepted, and an unknown `--no-x` is quoted the way it was typed
  instead of as `--x`.
- Budgets resolve to the most specific matching pattern, with "specific" given a
  stated definition — most literal characters wins, longest pattern breaks a
  tie. Pattern order in the file never matters. The JSON report names the
  pattern each budget came from.
- A file no pattern covers is listed as `(no budget)`, not skipped; and a run
  where nothing at all was budgeted is an error. "Checked 40 files, 0 failures"
  from a run that measured nothing is the most misleading output this tool could
  produce.
- `maxGrowth` in the config arms the `diff` gate exactly as the flag does.
  Absent both, growth alone still exits 0.
- `locale` in the config is outranked by the environment — the only setting
  where that is true. A repository choosing the language of its CI logs should
  not choose the language of a contributor's terminal.
- New glob matcher, written as a segment-wise dynamic program rather than a
  regex translation. `**` compiled to `(?:[^/]*\/)*` is the nested-quantifier
  shape that backtracks exponentially, and these patterns come from a file in
  the repository — on a pull request, from whoever opened it. Bounded in pattern
  and path length, with a time-budget test over the shapes that break the regex
  version.
- The directory walk **does not follow symlinks**, caps depth and file count,
  and reports when a cap stopped it early. A link to `/etc` would turn "check
  the prompts folder" into printing token counts for files outside the project;
  a link loop would turn it into a hang.
- **New entry point, `@trazum/core/node`**, holding everything that reads the
  filesystem: `loadConfig` and `walkPrompts`. The main entry point stays free of
  Node builtins, which it has to be — `apps/web` bundles it for the browser, and
  a single `node:fs` import anywhere in that graph fails the build outright. The
  pure halves (`parseConfig`, `budgetFor`, the types and key lists) are on both.
- Two new security invariants. The first names which modules may read the disk;
  the second **walks the import graph from the main entry point** and fails if
  any Node builtin is reachable from it. The first version of this change shipped
  with only the module allow-list, which passed while `config.ts` was also
  re-exported from `index.ts` — a file allow-list is not a boundary, the import
  graph is. That matters beyond the build: the web app hands `optimize()` a
  prompt straight from a request body, so a file read reachable from that entry
  point would be path traversal available to anyone who can reach the API.
- The config file is measured and read through **one file handle**. Calling
  `stat(path)` and then `readFile(path)` resolves the name twice, so what gets
  read is not necessarily what got measured, and a symlink swapped in between
  defeats the size limit. Found by CodeQL.
- Budget patterns are checked for absoluteness with an explicit pattern rather
  than `path.isAbsolute`, which is platform-dependent: on Linux it reads
  `C:\prompts` as relative, so a Windows-shaped pattern would pass validation on
  a Linux CI runner and then match nothing.
- `editDistance` moves into core as `nearestName` and is now shared between the
  unknown-flag and unknown-key suggestions rather than duplicated.
- Tests grow from 228 to 301.

## 0.9.0

New `trazum diff` command and `comparePrompts()` API: compare two versions of a
prompt and report what the edit cost. `optimize()` answers "how much fat is in
this prompt"; this answers the question a pull request actually raises —
somebody edited this, did it get worse?

**The design decision that keeps it honest.** Every other figure Trazum prints
is a *saving*: before minus after, positive is good. Every figure here is a
*delta*: after minus before, positive is **bad**. Mixing those two conventions
in one report is the easiest way to make a cost tool lie, so the comparison
lives in its own module, nothing in it is named a saving, and the negation
happens exactly once, at the boundary.

- Reports what the edit broke, not only what it cost: advisories that appeared
  and rules that started firing, plus the same in reverse when the edit
  improved things.
- Measures the text **as written** by default, not what the rules would leave.
  A pull request changed the file on disk, so the file on disk is what the
  reviewer is being asked about — otherwise a prompt that doubled in length but
  happened to double in courtesy would report no change. `--optimized` switches
  the figures to the post-rules text.
- **The gate is opt-in.** Growth alone exits 0; `--max-growth 10` is what makes
  it exit 1. A tool that fails a build nobody armed gets removed from the
  pipeline rather than fixed.
- `--max-growh` is rejected with "Did you mean --max-growth?" rather than
  ignored — a silently-swallowed gate flag means CI green while the author
  believes a limit is set.
- New `formatSignedUsd()`: `+$9.25` and `-$9.25`, because `formatUsd` renders a
  negative as `$-9.25`, which reads as a typo. Negative zero is collapsed, so a
  change that did not happen is never shown with a direction.
- `deltaPct` is 0 rather than `Infinity` when the original was empty.
- Tests grow from 196 to 228.

## 0.8.0

New `trazum eval` command and `evaluate()` API: run both prompt versions over a
set of inputs and report whether the optimisation changed the answers. Every
other number Trazum reports is arithmetic; this is the one question arithmetic
cannot answer.

**The design decision that makes it worth anything.** A model asked the same
question twice does not answer identically, so "the optimised prompt diverged
on 3 of 10 cases" means nothing on its own — it might be better than the
original manages against itself. The original therefore runs **twice** per case
first, and that self-agreement is the yardstick the rewrite is judged against.
It costs a third call per case and it is the only reason the verdict means
anything.

- Four verdicts: `indistinguishable`, `within-noise`, `diverges`, and
  `inconclusive` — the last for when the original cannot agree with itself
  often enough to judge anything against. A confident verdict off an
  inconsistent baseline would be worse than admitting the test does not work.
- Exits 1 on `diverges`, so it can gate a pull request the same way
  `trazum check` gates a token budget.
- Prints the call count before spending anything.
- A template gets its first placeholder filled rather than the input appended:
  appending would test a prompt nobody runs.
- Cases come from a file, one per line (`#` comments and blanks ignored) or a
  JSON array. A file that merely starts with `[` falls back to line mode rather
  than erroring.
- Bounded concurrency, default 3. The baseline pair stays sequential within a
  case: issuing both at once invites a provider to serve one from cache and
  report a variance of zero.
- Tests grow from 179 to 196.

## 0.7.0

- New `reviewExamples`: the paraphrase case the deterministic detector refuses
  to guess at. Two examples teaching the same lesson in different words score
  around 0.54 on word overlap — close enough to two genuinely distinct examples
  (~0.20) that catching them by similarity would mean flagging examples that
  teach different things. Deciding that "arrived quickly" and "arrived fast"
  demonstrate the same pattern needs a model, so this sits behind the optional
  LLM layer, costs a call, and never runs during an ordinary `optimize()`.
- Returns `null` below two examples, so the caller does not pay for a foregone
  answer.
- **The response is treated as untrusted input, because it is.** Indices are
  range-checked against the examples that exist, self-references dropped,
  overlapping groups collapsed so the same tokens are never counted twice, and
  the model's stated reason truncated. A model answering with prose produces an
  empty review — not a crash, and not a saving the prompt could not deliver.
- A provider **error** still throws. A bad answer is the model's problem and
  gets absorbed; a broken endpoint is the caller's configuration and hiding it
  would waste their afternoon.
- The CLI runs it under `--llm`, reports it as a suggestion to read rather than
  a change made, and includes it in `--json`.
- Shortens the GitHub Action's description to 113 characters: the Marketplace
  rejects anything over 125, which blocked publishing.
- Tests grow from 164 to 179.

## 0.6.0

**Fixes a rule that left a broken sentence behind.** `self-check` matched
"double-check your answer before responding" but not the subject and modal in
front of it, so `"You MUST double-check your answer before responding."` became
`"You must."` — a sentence that says nothing, in place of one that said
something. Whatever can open one of these instructions is now listed ahead of
the bare form, in both languages.

That bug had been there since the rule shipped. It surfaced within a minute of
the feature below existing, which is the argument for the feature.

- `RuleResult.changes`: each rule now reports a short list of what it actually
  changed, as before/after pairs. `hits` still carries the true total.
  `aggressive` has always come with the advice "read the diff", and the diff
  was one undifferentiated block for every rule at once — not review, a wall of
  text with a warning attached. Now an aggressive run is judged rule by rule,
  and a single rule you disagree with is disabled with `--disable` instead of
  abandoning the level that saves the most.
- Empty rather than truncated when a change is too large to summarise. An empty
  list reads as "nothing to show here"; a truncated one would read as "this is
  all that happened", which would be a lie.
- Bounded by construction, like everything else that touches untrusted text:
  the common prefix and suffix are trimmed in linear time, and anything still
  too large is skipped rather than diffed. Covered by the same adversarial
  fixtures as the ReDoS suite.
- Shown in the CLI and the web app for aggressive rules, and for every rule
  under `--diff`.
- New public API: `extractChanges`, `DEFAULT_CHANGE_LIMIT`, and the
  `RuleChange` type.
- Tests grow from 145 to 164.

## 0.5.0

A third structural finding, same posture as the first two: it reports, it does
not cut.

- New `restated-output-format` advisory. A prompt that shows its schema in a
  code block and then walks the same fields in prose is paying for the schema
  twice; the block is the version worth keeping, since it is unambiguous and
  the protection pass guarantees Trazum never edits it. Priced per month.
- Reads *illustrative* schemas, not only valid JSON. Prompts routinely contain
  trailing commas, `...` and `<placeholders>`, and refusing to parse those
  would skip exactly the prompts worth checking — so key extraction is a
  depth-aware scan rather than `JSON.parse`.
- Only top-level keys count, so a nested field name cannot be mistaken for one.
- Three restated fields minimum. Naming one or two in prose is ordinary
  clarification ("set `escalate` to true when the customer asks for a human")
  and flagging it would turn the advisory into noise.
- New public API: `findRestatedFormat`, and the `RestatedFormat` type.
- Tests grow from 138 to 145.

### Dependencies

- `next` 15 → 16, which is what finally cleared the three high-severity
  `postcss` and `sharp` advisories. Bumping the direct dependency was not
  enough on its own: the lockfile kept the vulnerable transitives, and the
  blocking audit is scoped to the published packages so it never saw them.
  `npm audit` over the whole tree now reports 0 vulnerabilities. The lesson is
  recorded in `SECURITY.md`.
- `actions/checkout` and `actions/setup-node` 4 → 7, clearing the Node 20
  deprecation warning every run was printing.
- `actions/dependency-review-action` 4 → 5.

## 0.4.0

Structural analysis: findings that live in the *relationship* between two
places in a prompt, which no phrase dictionary can see because neither place is
wrong on its own. Both are advisory — Trazum points, it does not cut.

- **Fixes a corruption bug in `duplicate-lines`.** The rule was deleting the
  shared `Output:` line from a second few-shot example, leaving it with an
  input and no output. Two examples mapping different inputs to the same answer
  is often exactly why both are there. Labelled example fields (`Input:`,
  `Output:`, `Q:`, `A:`, and Spanish equivalents) are now exempt from
  line deduplication. This affected the `safe` level, so it could silently
  damage a prompt anyone ran through Trazum.
- New `contradictory-instructions` advisory across four axes: response
  language, output format, response length, and whether to show the reasoning.
  Reported as a **warning** with both conflicting sentences quoted. It carries
  no dollar figure — being wrong has no price tag.
- New `redundant-examples` advisory: few-shot examples that are near-copies of
  an earlier one, with the tokens they cost per month. It detects copy-paste
  accumulation (~0.89 similarity for a copied example with one field changed),
  and deliberately **not** paraphrases (~0.54), which sit too close to
  genuinely distinct examples (~0.20) to separate without a model.
- **Advisories now sort by severity before money.** Sorting purely on the
  dollar figure buried an overflowing context window — and now a contradiction
  — underneath a saving of a few dollars.
- New public API: `findContradictions`, `analyzeExamples`, `findExamples`, and
  the `jaccard` / `normalizeForCompare` similarity helpers, which moved to a
  shared module so the duplicate rules and the structural analysis cannot
  disagree about what "near-duplicate" means.
- Adding a contradiction axis now fails to compile until every catalogue names
  it, the same guarantee `RuleId` gives rules.
- Tests grow from 75 to 94.

### Security

Hardening for an open repository taking outside contributions. Full reasoning
in [SECURITY.md](SECURITY.md).

- **Fixes four SSRF filter bypasses.** The web app's private-host blocklist
  allowed `https://[::ffff:169.254.169.254]` — the IPv4-mapped IPv6 form of the
  cloud metadata address, which Node normalises to `[::ffff:a9fe:a9fe]` and the
  old patterns did not match. Also allowed: a trailing-dot hostname
  (`localhost.`), the carrier-grade NAT range (`100.64.0.0/10`), and
  credentials embedded in the URL, which would have been forwarded to whatever
  the host resolved to and written into any log recording the endpoint.
- The filter moved from the Next.js route into `@trazum/core` as
  `validateLlmEndpoint` / `isPrivateHost`, so the most security-sensitive code
  in the project is unit-tested instead of living untested in an API handler.
  It returns a reason code rather than a message, so callers localise it and
  tests assert on the decision.
- **Fixes two ReDoS denial-of-service bugs**, both reachable from the public
  HTTP endpoint, both found by CodeQL after the first round of ReDoS tests had
  passed:
  - `whitespace` — a **`safe`-level rule present since 0.1.0**. Its
    trailing-whitespace pattern restarted at every position inside a whitespace
    run and failed from each one when the run did not end the line: 17 seconds
    on a 100 KB line of spaces, well inside the 400 KB the API accepts.
    Anchored to the start of a run, it is now 3 ms at 400 KB.
  - The few-shot label patterns added in this release ended in three adjacent
    unbounded quantifiers, measured at O(n²) — 651 ms at 40 000 spaces, about a
    minute at the size cap. Their quantifiers are now bounded.
  - The ReDoS suite gained the fixture shape it was missing. The original
    fixtures were all *repeated tokens*, which exercise the happy path over and
    over; neither bug needed that, they needed a plausible prefix followed by a
    long run that never completes the match.
- New `security.test.js` enforcing four invariants on every pull request: the
  SSRF filter fails closed, the core and CLI carry zero runtime dependencies,
  `fetch` appears only in the two modules that exist to make calls, and no
  regex exhibits catastrophic backtracking under pathological input.
- Workflows run with `permissions: contents: read` by default,
  `npm ci --ignore-scripts`, and `persist-credentials: false`.
- Added CodeQL (`security-extended`), dependency review, a weekly `npm audit`,
  Dependabot, `CODEOWNERS`, and an importable branch ruleset at
  `.github/rulesets/main-branch.json`.
- `SECURITY.md` documents the threat model, private reporting, the settings an
  admin still has to switch on, and the limits that are not covered — DNS
  rebinding, per-instance rate limiting, and actions pinned to tags.

## 0.3.0

**Breaking.** `buildAdvisories()` takes an options object instead of trailing
positional arguments: `buildAdvisories(prompt, tokens, usage, { on, count, locale })`
replaces `buildAdvisories(prompt, tokens, usage, on, count)`. The `Rule`
interface no longer carries `title` or `rationale` — rules carry an `id`, and
copy is resolved from the message catalogue with `getMessages(locale).rules[id]`.
`OptimizationResult.rules` is unchanged, so consumers of the report need no
migration.

The repository is now English end to end — source, comments, tests,
documentation, CLI, web and CI. Spanish was not removed; it was moved out of
hardcoded prose into a locale, which is the only version of "add a language"
that survives a second one.

- Per-locale message catalogues in `@trazum/core`, `@trazum/cli` and
  `@trazum/web`, with English as the declared source of truth.
- `RuleId` is a typed union: adding a rule fails to compile until every
  catalogue describes it.
- `optimize()` and `refineWithLlm()` accept a `locale`, and the result carries
  the locale it was produced in.
- New `matchLocale()`, which returns `null` when its input names no locale we
  ship — that is what lets a caller fall through to the next configuration
  source instead of mistaking a fallback for a choice. `resolveLocale()` now
  walks a whole `Accept-Language` list, so `fr-FR,es;q=0.9` resolves to Spanish
  rather than defaulting to English.
- CLI: `--locale`, then `TRAZUM_LOCALE`, then the POSIX locale variables. The
  flag is read straight from argv, so even a bad-argument error is reported in
  the requested language. `trazum rules` now reads its copy from the core
  catalogue, so it can no longer drift from the report.
- Web: `Accept-Language` is negotiated on the server, so first paint already
  matches the reader; a switcher in the masthead overrides it and the choice is
  remembered. `generateMetadata` negotiates too, so link previews follow.
  The API route localises its own errors as well as the report.
- The web starter prompt now exists per language, since the phrase
  dictionaries are per-language and the example exists to show rules firing.
  Switching language never overwrites a prompt you wrote.
- `GET /api/optimize` no longer returns rule copy: it was locale-blind, and the
  report carries its own.
- Sample prompts are `examples/sample-prompt.en.txt` and
  `examples/sample-prompt.es.txt`; the action self-test runs against both.
- The GitHub Action takes a `locale` input.
- Tests grow from 47 to 75, adding catalogue-parity coverage so a locale cannot
  silently go stale, plus a CLI suite covering locale resolution. `npm test` now
  runs both packages.
- New `ROADMAP.md`, `VERSIONING.md` and `CONTRIBUTING.md`.

## 0.2.0

- Cacheable-prefix analysis (`analyzeCachePrefix`): the prompt-caching advisory
  computes its saving over the real stable prefix — everything before the first
  template placeholder — instead of over the whole prompt, which in a template
  never caches in full.
- New `cache-prefix-reorder` advisory: detects stable instructions sitting
  after the first placeholder, which today never cache, and prices moving them
  in front.
- Packaged GitHub Action (`Davmunrey/Trazum@main`) for `trazum check`: token
  budgets in CI with nothing to install, with a self-test in the repository's
  own CI.

## 0.1.0

First release.

- Deterministic core (`@trazum/core`): 12 rules across two levels, isolation of
  code/URLs/templates/XML, dependency-free token estimator, pricing catalogue
  with promotions, and savings advisories (caching, Batch API, model tier,
  context window).
- Optional, pluggable LLM layer (OpenAI-compatible endpoints, the Claude API,
  or a custom provider) with safety checks: a candidate is only accepted when
  it is shorter and preserves the protected content.
- CLI (`@trazum/cli`): `optimize`, `check` (token budgets for CI), `models` and
  `rules`; clean output when redirected, plus `--json`, `--diff` and
  `--exact-tokens`.
- Web (`@trazum/web`): Next.js interface with a word-by-word diff, local
  history, an editable cost scenario and a configurable LLM pass.

- **The web app builds on Vercel.** `output: 'standalone'` — added for the
  Docker/N0 image — breaks Vercel's build, whose pipeline does its own file
  tracing (`ENOENT` on `.next/next-server.js.nft.json`; found by deploying
  a demo, not by reading about it). The flag is now conditional on not
  running under Vercel (`VERCEL=1` is set in every Vercel build), so the
  container image, the N0 manifest and the local standalone preview keep
  exactly the output they had, and Vercel gets the default output its
  platform expects. A Vercel project linked to this repository redeploys
  the demo from `main` on every merge.
