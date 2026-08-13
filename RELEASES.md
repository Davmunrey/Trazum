# Releases

Release notes for people. [CHANGELOG.md](CHANGELOG.md) is the record for
whoever maintains this — every decision, every reversal, every reason. This file
is what you read when somebody says "what's new" and you have forty seconds.

Same facts, different job. Nothing here is softened: if a release fixed
something embarrassing, it says what it was.

**All three packages are on npm at 1.9.0**, published 2026-08-13 and installable
today: `@trazum/core`, `@trazum/cli` and `@trazum/mcp`.

Everything under 1.8.0 is a milestone recorded in this repository and never
uploaded anywhere, 1.0.0 included. The numbering is kept because the ordering is
the useful part — 1.8.0 is the first version that exists outside this repository,
not the eighth release.

`RELEASES.md` is checked against the manifests by `publish.test.js`, so a version
cannot be tagged without its notes being written first. That is the point of the
file being here rather than pasted into a GitHub form at release time.

---

## 1.9.1 — "The preflight"

**Maintenance, and the point of it is that the next release publishes itself.**

1.8.0 and 1.9.0 both went out by hand — the first because the packages did not
exist yet, the second because the trusted publisher had not been configured — so
neither tarball carries provenance. Nothing in the repository could tell you in
advance which way a tag would go, so 1.9.0 found out by spending the tag.

Two questions get asked before anything is at stake now, and a dry run from the
Actions tab can answer them without spending a version:

- **Will npm accept this workflow's identity?** Asked against npm's token
  exchange, once per package, because the setting lives on three separate pages
  and doing two of them is the easiest mistake available.
- **Is any of these version numbers already spent?** npm never reuses one, and
  the packages publish in dependency order — so without this, core uploading and
  the CLI failing costs the whole set a version.

**One honest caveat.** The endpoint behind the first question is not documented;
how to call it was worked out by probing. A refusal can therefore be the check
being wrong rather than your settings, and it cannot tell those apart — so it
says so and never blocks a release. Only a tag settles it.

Also: `E404 Not Found - PUT` from npm is an authentication failure, not a missing
package. The workflow explains that itself now instead of leaving it in a
document you would have to already know to read.

**Nothing in the library, the CLI or the reports changed.** If you are not
releasing Trazum, this version is identical to 1.9.0 for you.

---

## 1.9.0 — "The error band, measured"

**Trazum was under-reporting what your prompts cost, and now it does not.**

Every report printed `±15%`, every dollar figure descended from it, and nothing
had ever checked it. Measured against Anthropic's official counting endpoint, it
was false: nine of eleven samples underestimated, the worst by 30.6%.
Underestimating tokens under-reports cost — the flattering direction, and the
worst one for a tool whose whole argument is honest cost accounting.

**If you use Trazum on anything other than English, this release changes your
numbers.** The estimator turned out to be calibrated for English specifically:
German came out 37.3% under, Dutch 28.3%, Italian 23.8%, Spanish 22.9%,
Portuguese 18.1%, French 15.1% — against English at +1.0%. It now detects the
language and counts accordingly, and the figures it gives you go **up**, because
they were too low.

| language | before | now |
|---|---:|---:|
| German | −37.3% | +1.3% |
| Dutch | −28.3% | −2.1% |
| Italian | −23.8% | +2.0% |
| Spanish | −22.1% | +3.1% |
| Portuguese | −18.1% | −5.7% |
| French | −15.1% | +0.4% |
| Numeric-heavy text | −30.6% | −5.0% |

The band is still `±15%`, and that is a coincidence rather than a restoration:
the old one bounded nothing, and this one bounds **twenty-one measured samples
across seven languages and six text types**, worst case 11.2%. Every language has
a held-out sample in a different register, so the calibration fits a language
rather than a template.

**`trazum baseline`** records what a repository's prompts cost, to a file you
commit. `trazum check` then fails the build when the estate drifts past it — the
question a per-file budget cannot answer, because a repository at 95% of every
budget passes forever while a pull request adds four hundred tokens across a
dozen files. Thresholds are in tokens, never dollars: a repriced model would
otherwise fail a build for a change nobody made.

**The pull-request comment leads with what the branch costs**, not with a table of
which files fit their ceilings. No change to the Action was needed.

**One advisory was giving wrong advice.** `below-cache-minimum` compared an
*estimated* prefix against a hard 512-token threshold and told you caching would
not work. Near the line an underestimate made that false, and it cost the reader
the largest saving Trazum offers. It hedges there now and names `--exact-tokens`,
which is free.

**If you want exact numbers, they are free.** `--exact-tokens` uses the official
counting endpoint, which does not run the model. On non-English prompts it remains
the honest choice; the band above is what the heuristic gets you without a key.

## 1.8.0 — "Everything it had only been pricing" (the first publish)

Trazum 1.0.0 could tell you what a prompt cost. It could not tell you **which**
prompt, **who** made it expensive, whether the shorter version still worked, or
what to do about any of it. That is what everything since has been about.

Twelve commands now, up from four.

### What's new

- **`trazum prune` — which few-shot examples earn their tokens, measured.** Removes
  each example in turn and checks whether any answer moves further than the model
  already moves on its own. It is the only command that asks before spending — the
  bill is `(2 + examples) × cases`, printed before a provider is even looked up —
  and it reports "no effect on these inputs", never "delete this". Nothing is
  edited.

- **`@trazum/mcp` — Trazum as an MCP server, so an agent can budget its own
  prompts.** Three tools over stdio (`check_prompt`, `optimize_prompt`,
  `list_models`), running on your machine like the CLI: no service, no prompt
  leaving the box. The JSON-RPC layer is written by hand because every published
  package here carries zero runtime dependencies — and an MCP server reading
  model-supplied text is the last place to relax that.

- **`trazum doctor` finds preambles that could share a cache entry and do not.**
  Prompt caching matches bytes, so twelve prompts assembled from the same preamble
  — identical except a trailing tab and a stray capital — occupy twelve cache
  entries and share nothing. Each file is individually fine, which is why no
  per-prompt analysis can see it. No dollar figure, deliberately: pricing it would
  mean inventing how your calls spread across the group.

- **An advisory for a schema the request could carry instead of the prompt.**
  `Output format:` followed by a fenced JSON block costs those tokens on every
  call; every major API now takes the same shape as a request parameter, where the
  decoder is constrained rather than persuaded. Cheaper and stricter both — the
  rare finding that is not a trade-off. Trazum reports it and never edits it,
  because it is a change to the call, not the prompt.

- **LLM-agnostic, for real.** `openai` in `TRAZUM_LLM_PROVIDER` is a wire format,
  not a company — point a base URL at OpenRouter, LiteLLM, Groq, Together,
  Fireworks, DeepInfra, DeepSeek, Mistral, Ollama, vLLM or LM Studio and it works.
  Native providers for Anthropic and Gemini, and `bedrockProvider` /
  `vertexProvider` with SigV4 and the service-account JWT signed by hand on
  WebCrypto, because the AWS and Google SDKs are two hundred packages between them
  to authenticate one request. Live prices via an OpenRouter overlay, with every
  fact the feed does not carry marked `unknown` rather than guessed.

- **A real Content-Security-Policy on the web app.** A 128-bit nonce per request,
  `strict-dynamic`, no `unsafe-inline` in `script-src` — verified against a built
  server: nine of nine script tags carry the nonce, and deleting the one
  easy-to-miss line (the policy must ride the *request* headers too) gives nine
  tags and zero nonces.

- **A `.pre-commit-hooks.yaml`** for teams who manage hooks with the pre-commit
  framework, and **automatic recovery from container rollbacks** for anyone
  developing this repository in an environment that restores stale disk snapshots
  — which this one did, more than twenty times.

- **`--suggest` stops paying for answers it already has.** Add
  `--cache-suggestions` and a prompt that has not changed since the last run is
  answered from disk instead of from the model — re-run over forty prompts after
  editing two, and thirty-eight requests do not happen. It is off unless you ask,
  and it says out loud every time it uses a cached answer, because a cached
  answer is what the model said last week and a model is not a calculator. What
  gets stored is the model's raw reply, so every safety check runs again on the
  way out: a suggestion cached in March is still checked against your prompt in
  April by April's rules. Seven days, files nobody else on the machine can read,
  and `trazum --clear-suggestion-cache` when you want it gone.

  The honest footnote: this was meant to be the API's own prompt caching, and
  that turned out to be impossible rather than difficult. The API will not cache
  a prefix shorter than 512 tokens, our suggest instructions are 291, and a
  prefix that is too short is not cached *and does not tell you* — it just
  quietly costs full price. One line of code, zero saving, no way to notice.
  There is now a test that measures the prompt against every model's published
  floor, so if that ever changes we find out from a red build rather than from a
  comment nobody re-checked.

- **A badge for your README.** Every share link is also `/badge/<token>.svg`:
  the token change, in an image you can paste into a repository's front page. It
  is **recomputed every time it loads**, so it follows the prompts instead of
  freezing a number from the day somebody made it — which is the failure mode of
  every hand-written "saves 30%" line in every README. Revoking the link revokes
  the badge, because there is only one thing to revoke. An unknown, expired or
  revoked token renders the same neutral badge rather than a broken image, and
  no character of anybody's prompt ever reaches the picture.

- **A deployment overview for whoever runs it.** `/admin` adds up every prompt
  saved on the instance and says which ones are worth an afternoon — and it is
  careful about what it claims. It is **not** a spend report: Trazum has never
  seen a bill or an API call, so the headline is input tokens, the second figure
  is what running the rules would remove, and there is no score anywhere,
  because a number nobody can reproduce by hand is a number nobody can argue
  with. It shows prompt names and never prompt text: an admin is an operator,
  not an auditor of what their colleagues wrote. Off unless `TRAZUM_ADMINS` is
  set, and off means the page does not exist rather than refuses.

- **Share links: send a colleague what the edit cost.** A comparison published
  at an unguessable URL that anyone can open without an account, which is what
  "share" has to mean and is also the only thing in Trazum that serves one
  person's prompt to a stranger. So it says what it does **before** the button,
  not after: *this publishes both prompts to anyone who has the URL.* Links
  expire in thirty days unless you pick otherwise, can be revoked, and are kept
  out of search engines two independent ways. Reading one writes nothing —
  no view counter, because an unauthenticated request that can cause a write is
  a lever and a view count is not worth being one. And nothing derived is
  stored, so a link opened next year is priced by next year's rules.

- **A prompt library, with every version you ever saved.** Signed in, Trazum
  keeps your prompts and the whole history of each — because the question worth
  asking about a prompt is not what it costs today, it is what last month's edit
  did to it. History is append-only: saving over a prompt writes a new version
  and never rewrites one, and a save that changed nothing writes nothing and
  says so rather than filling the record with identical rows. Token counts are
  recomputed on read rather than stored, so two versions saved a year apart are
  actually comparable instead of being priced by two different estimators.
  Somebody else's prompt answers **404, never 403** — a 403 confirms the id
  exists — and the store has no lookup that takes an id without an owner, so
  that mistake cannot be written rather than merely not being written.

- **Sign in with GitHub — and the app is unchanged if you don't.** Accounts are
  off by default; a deployment with no GitHub app configured is the anonymous
  tool it always was, with no button and no database. Turn it on and Trazum
  remembers who you are, which is what a saved prompt library and a shared
  budget need to exist at all. It asks GitHub for `read:user` and nothing else
  — no repositories, no email, no write anywhere — and **never stores the
  access token**: it is exchanged, used once to read your login, and dropped.
  Session cookies are 256 random bits stored only as their SHA-256, so a
  database dump is a list of hashes rather than a list of live logins. Any
  Postgres will do; without one, sessions live in memory and the header says
  "temporary session" instead of letting you discover it.

- **`--reorder` — the saving Trazum had been pointing at for months.** Prompt
  caching is a byte-for-byte prefix match, so a stable instruction sitting
  *after* your first placeholder is re-read at full price on every single call.
  The advisory had been saying so since 0.2.0 and no command could act on it.
  Measured on a real 1,178-token support prompt: **14 tokens cacheable as
  written, 1,046 after.** It moves whole blocks, never sentences, and refuses
  the moment a block points backwards — because "summarise the text above" is
  correct where it sits and nonsense in front of the text.
- **`trazum rank <dir>` — which of your forty prompts to fix first.** Sorted by
  what optimising each one would actually recover, measured by running the rules
  rather than evaluating a formula. There is deliberately **no complexity score
  out of a hundred**: a number nobody can reproduce by hand cannot be argued
  with, and the weights that produce it get quietly tuned until the ranking
  looks right, which is fitting the metric to the answer. You get the
  measurements and a definition for each.
- **`trazum blame <file>` — who made this prompt expensive.** Git blame for
  tokens. Git already knows who edited a prompt and when; it does not know that
  three lines added to a system prompt at 50,000 calls a month is a bill rather
  than a diff. Now both facts are on the same line, with the single worst commit
  named.
- **Both of them post to pull requests.** `--markdown-out` was on `check` and
  `diff` only, so the two commands that answer *which prompt is worth an
  afternoon* and *who made this one expensive* could not put their answers where
  those decisions get made. They can now.
- **`optimize --suggest` — rewrites you can judge one at a time.** The LLM pass
  used to be all-or-nothing in both directions: fail one safety check and you got
  nothing, pass it and you got a wholesale rewrite to read end to end. Now it
  proposes phrases — `You should always make sure to → Always` — and each one is
  checked against your prompt before you see it. Eight surviving out of ten is a
  useful morning. A wholesale rewrite that failed one check never was. On the web
  as two switches, with the proposals listed above the saving rather than under
  it.
- **`eval --export promptfoo` — your assertions, not ours.** `trazum eval`
  measures whether the model still says the same thing, which is the question
  Trazum is qualified to ask and emphatically not the one you need answered
  before shipping. Yours is whether the classifier still hits 94%. So this builds
  the suite where the only variable is the prompt and leaves `assert` blank on
  purpose. Needs no API key and makes no call — the entire point is handing the
  run over.
- **`trazum where` — which model is this prompt actually going to?** Reads the
  code instead of guessing: a marker beats a quoted model id beats a base URL
  beats an SDK import, and it shows you the evidence with line numbers. A base
  URL beats the SDK it was pointed at, because DeepSeek, Moonshot, xAI and Groq
  all speak to the OpenAI client.
- **Prompts where they actually live.** `// trazum:prompt name` above a template
  literal, and `check`, `optimize`, `rank` and `blame` all read it out of your
  TypeScript instead of asking you to keep a copy in a `.txt` file that drifts.
- **Nine providers' prices, not one.** OpenAI, Google, Moonshot, DeepSeek, xAI
  and Mistral join Anthropic. The data was the easy half — see Fixed.
- **A Compare tab on the web — "what did this edit cost?"** Paste the old version
  and the new one and get the token delta, the monthly figure, and which problems
  the edit introduced or resolved. Every number is *after minus before*, so
  **positive means worse**, which is the opposite of everywhere else in Trazum —
  and the page says so above the figures rather than beside them, because somebody
  arriving from the other tab has the opposite convention already loaded.
- **`trazum diff`, `trazum eval`, directory mode, `trazum.config.json`, a GitHub
  Action** that comments on pull requests, and a **web app** rebuilt on
  shadcn/ui that kept its own palette rather than adopting the one every other
  application built from that registry is wearing.
- **On a subscription, no dollar figures.** Running inside Claude Code or Cursor,
  Trazum reports tokens and context-window headroom and says nothing about money,
  because there is no per-call bill to reduce and arithmetic about tokens dressed
  as dollars is just a wrong number with a currency symbol.

### Fixed

- **`optimize src/prompts.ts` rewrote your source code.** The capitalisation rule
  turned `import OpenAI` into `Import OpenAI`, which does not compile, and with
  `-o` it wrote that back over the file. It also counted your imports as tokens
  you pay a model for, and priced a file that plainly calls OpenAI against Claude
  Opus 5. This was the **default** behaviour. It refuses now, and tells you how
  to mark the prompt.
- **`--reorder` had no safety at all outside English and Spanish.** Not a missing
  feature — a silent failure. The backward-reference list was one flat
  English/Spanish array applied to every prompt, so a French, German,
  Portuguese, Italian, Dutch, Japanese or Chinese author got **none** of the
  refusals the whole design rests on. `Résumez le texte ci-dessus` was cheerfully
  hoisted above the text it points at and reported as a saving. Every test passed
  throughout, because every test asked the question in the two languages that
  worked. Seven languages added, plus a fourth refusal for the scripts still
  missing: a prompt with Cyrillic, Arabic, Hebrew, Hangul, Devanagari, Thai or
  Greek in it is not rearranged at all, and the report says which script stopped
  it.
- **Three providers were offered a batch discount that cannot be bought.** Kimi,
  DeepSeek and Grok have no batch API. The cost multipliers were global
  constants, so all three were quoted 50% off — **$139 a month** in the test that
  caught it. And Mistral, which has no prompt caching, was offered **$100 a
  month** of caching, because a zero cache minimum satisfies `0 >= 0`.
- **The batch saving was computed as `cost × discount`**, which is the saving only
  when the discount is exactly 0.5. Correct on Anthropic by coincidence, wrong on
  the first provider with any other rate.
- **It told Claude users to switch to `gpt-5-nano`.** The cheaper-model advisory
  searched every provider. Dropping from Opus to Sonnet is one line; changing
  vendor is a migration. Scoped to your own provider now.
- **A validated URL and a fetched URL were two different expressions.** The SSRF
  filter checked `baseUrl` and then fetched `` `${baseUrl.replace(/\/$/, '')}` ``
  — so nothing on the path from option to `fetch` was actually a barrier. CodeQL
  kept the alert open and was right to, twice. The check returns the value to use
  now, and the real fix went further: the web app's request body no longer
  **names** an endpoint at all, it **selects** one the operator listed. A host
  filter reads a name, and a name an attacker registered resolves wherever they
  like.
- **`fetch` follows redirects, which quietly voided the entire host filter.** A
  perfectly valid endpoint could answer `302 Location: http://169.254.169.254/`
  and the request went there anyway, `authorization` header included. One HTTP
  response. Every server-side call now refuses redirects.
- **The token counter sent your API key to an unvalidated URL.** Both providers
  had been hardened twice over while `countTokensAnthropic` sat wide open,
  because it is called a counter rather than a provider.
- **A security fix shipped with no reviewable diff.** `measure-token-band.mjs`
  used a raw NUL byte as a hash separator, which is enough for git to call the
  file binary. Three commits rendered as `Bin 7652 -> 7654 bytes` — including the
  one that fixed an SSRF finding **in that file**. It built, it ran, it passed
  every test, and nothing anywhere mentioned that a security fix had gone through
  unread.
- **The alert gate failed the merge that fixed both alerts.** It ran one second
  after starting, a full minute before the CodeQL analysis it reads had uploaded
  anything, and reported two findings at line numbers that no longer existed. A
  red build for a fix that worked is how people learn to re-run until green.
- **`--tokens-only` on GitHub Actions announced that "GitHub Actions bills by
  subscription".** It does not. It bills by the minute.
- **The README recommended `@v1.0.0`, a tag that never existed.** The test written
  in that same pull request only required `#\s*v?\d`, so it passed.
- **A renamed prompt reported no history before the rename** in `blame`. The data
  was there under the old name; the report said there was none.
- **`--limit` was silently ignored** — accepted by the command, never registered
  as taking a value, so every run walked the default 20 and said nothing.
- **`applySuggestions` on its own returned a `200` and applied nothing.** A full
  report, no error, the prompt untouched, and the one thing the caller asked for
  had quietly not happened. The source looked right — the field parsed, the guard
  around it was correct, and the branch that would have used it was never
  entered. It took sending the request. A `400` now, refused before any call to
  the model, so a malformed request never costs one.
- **Two quadratic passes.** One took 13.9 seconds on a large prompt; the other
  took **31**. Both found by hostile-input tests rather than by reading.
- **The results panel in the web app rendered blank.** It waited for an
  `IntersectionObserver`, and anyone who scrolls down to reach the button gets
  their result mounted above the viewport. A 214px card at zero opacity, showing
  nothing, on the page whose job is showing you the answer.

### Changed

- **`ModelPricing.tier` is deprecated in favour of `capability`** — `small | mid |
  large | frontier`. Telling somebody on Kimi that their task "looks like haiku
  complexity" is a label meaning something other than what it says. `tier` keeps
  working for all of 1.x.
- **The report stops claiming a Claude-calibrated band for models it was not calibrated on.** The
  estimator is tuned against Claude's tokenizer, and printing a Claude band beside
  a GPT figure was a precision claim nobody had earned.
- **Money-only advisories are gone from `--tokens-only`.** Suppressing the price
  in the heading and leaving dollars in the prose underneath is not suppressing
  the price.

### Still honest about

The **band was a design target that had not been measured** when this shipped. It is printed on
every report and every dollar figure descends from it. The corpus, the harness and
the test are all written and waiting; the measurement needs the official counting
endpoint and a key, so it cannot happen inside this repository. Until somebody
runs it, the code says so out loud rather than passing quietly — which is the
whole disposition of this project in one sentence.

*Somebody ran it in 1.9.0, and it was false. See the notes at the top of this
file. This paragraph is left as it was written.*

---

## 1.0.0 — "A stable contract"

The API froze. What `optimize` returns, what the rules are called, what counts as
a breaking change — all of it written down in [VERSIONING.md](VERSIONING.md) and
tested rather than intended.

### What's new

- **Twelve deterministic rules**, offline and free, that cut politeness formulas,
  filler, hedges, shouted emphasis, decorative separators and repeated paragraphs
  — without touching code, URLs, template placeholders or XML tags, which are
  copied character for character. A restated output format is *reported* and never
  cut: the schema and the prose walking through it are both defensible, and which
  to keep is the author's call.
- **Two levels.** `safe` has no semantic risk. `aggressive` shows you exactly
  what it changed, phrase by phrase, because "read the diff" is not advice you
  can follow on a diff of everything at once.
- **Advisories for the savings that dwarf trimming** — prompt caching, the batch
  API, whether the task needs the model you picked, and the one nobody wants to
  hear: that your cost is usually in the *output*, and shortening the prompt has
  a low ceiling.
- **`check --max-tokens`** as a CI gate, and **`--exact-tokens`** against the
  official counting endpoint for figures you can actually budget from.
- **English and Spanish**, where a locale changes the report and never the
  optimisation. Same prompt, same output, same advisory ids, whatever language
  you read them in.
