# The plan through 1.60

Nine arcs, in order. Under the numbering adopted at 1.50.1 a **minor closes an
arc** and a patch is a chapter of the one in progress, so this document names
nine theses and the releases that land them: 1.52.0 through 1.60.0.

The ordering is the commitment. **The calendar is not, and no dates appear
here** — for the reason [ROADMAP.md](../ROADMAP.md) has always given, and for a
second one this document should state about itself.

## What this plan is confident about, and where it stops being

The first three arcs answer things that are **wrong or missing today**, and I
can point at the line of code for each. The last four are an ordering of
intentions: they are where I would go next, not commitments about what the
product will contain.

That distinction is the same one the tool itself insists on — a measurement and
a projection do not merge into one figure — and a plan that presented all nine
with equal confidence would be breaking its own product's rule on its own
roadmap. Each arc below says which kind it is.

The first draft of this file put the token-band work first, because it is the
question the roadmap has carried longest. It is second now: a gateway that
cannot stream is a shipped feature most callers cannot use, and an open
question somebody wrote down is less urgent than a thing that is broken.

---

## 1.52.0 — The gateway in a real path — **delivered**

**All four chapters shipped, landing at 1.52.0.** Kept as written, before the
code, rather than rewritten in hindsight. What it still cannot do — two of seven
providers, no refusal once bytes flow — is in [RELEASES.md](../RELEASES.md).

**Measured, not a hunch.** `packages/cli/src/gateway-server.ts` relays the
upstream reply with:

```ts
const text = await upstreamResponse.text();
```

It buffers the whole response before writing a byte back. For `"stream": true`
— which is how nearly all production traffic is served, and every agent loop —
the caller waits for the entire answer and then receives it at once. Time to
first token, the number people actually feel, goes to the total generation time.

The gateway's own page argues that reading a budget file per request would
"put Trazum's own latency between you and your provider on every call — a cost
this tool would otherwise be reporting on somebody else." Buffering a stream is
a much larger version of exactly that, in the same file.

**Chapters, in order:**

1. **Stream through.** Relay the upstream body as it arrives, unmodified, while
   counting. The proxy already holds no text; this makes that structural rather
   than incidental.
2. **Usage from the last event.** Streaming responses carry their token counts
   in a terminating event, not a JSON body. Read it there, and when the stream
   ends without one, record **nothing** rather than a zero — a call whose usage
   never arrived is not a free call.
3. **A refusal arrives before the first byte, or not at all.** A 402 mid-stream
   is worse than no gate: the caller has already started rendering. The budget
   decision happens before the upstream is opened, and once bytes are flowing
   the call is committed. Say so in the document rather than discovering it.
4. **What a broken stream costs.** A connection that dies halfway has spent
   money the provider will bill and the log cannot see. Name it as unmeasured,
   the way every other gap in this product is named.

**What this arc refuses:** buffering "just for small responses", which is a
threshold nobody can check and a latency cliff nobody can predict.

## 1.53.0 — Every provider you pay for — **delivered, at four of seven**

**Kept as written**, before the code, including the number it hoped for. It
shipped as *"Four of the seven, and why the other three are not here"*: two more
fronted from hosts already committed here, two recorded as permanently
unfrontable with the reason proven from `llm.ts`, and three waiting on an
endpoint nobody here can confirm — with a guard that fails the build the day one
arrives.

**Measured.** Trazum prices **seven** providers. It has connectors for **two**
and the gateway fronts **two**:

| | Providers |
| --- | --- |
| Priced | anthropic, openai, google, moonshot, deepseek, xai, mistral |
| `trazum connect` | anthropic, openai |
| `trazum gateway` | anthropic, openai |

So five providers can be priced from a log somebody exports by hand, and cannot
have their bill read automatically or their calls gated live. A budget that
works on two of your seven providers is not a budget; it is a budget for the
part of the bill that happens to be convenient.

**Chapters:** one per provider, each landing a connector, a gateway upstream, or
an explicit refusal — because some of these APIs do not serve a usage report at
all, and *"this provider does not publish one"* is a finding, not a gap to paper
over. Each carries what its API cannot serve, in the shape 1.41 established.

**What this arc refuses:** inventing a usage report by summing what the gateway
happened to see. That is a measurement of Trazum's traffic, not of your bill,
and the two differ by every call that did not go through the proxy.

**Since written.** The table above is the measurement taken when this plan was,
and is left as it was taken. What has happened to it since:

| Chapter | Landed | On what already-committed fact |
| --- | --- | --- |
| A priced provider is not a typo | yes | none needed — derived from the catalogue |
| DeepSeek fronted | yes | `scripts/measure-token-band.mjs` sends a key to `https://api.deepseek.com/chat/completions` |
| Google fronted | yes | `packages/core/src/llm.ts` sends a key to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`; `packages/core/src/usage.ts` reads `usageMetadata` back |

**What is still blocked, and why it is not laziness.** `moonshot`, `xai` and
`mistral` are priced and unfronted because their hosts appear **nowhere in this
repository**. Compiling an endpoint in from memory, into the one place a user's
credential is forwarded, is the thing the doctrine forbids treating as known —
and `security.test.js` compares the exact origins, so it cannot happen quietly.
The two chapters that did land are the shape of the answer: an endpoint this
repository already trusts with a real credential can be reused; one nobody here
has ever sent a key to has to be confirmed before it can be.

## 1.54.0 — The counter, per family

**Measured, and already on the record.** The estimator is calibrated against
Claude's tokenizer over a 21-sample corpus, and Trazum prices seven families.
`ROADMAP.md` has said for several releases that the per-family error is *"the
one number that settles"* whether to take a real tokenizer as a dependency —
and that measuring it is what decides, because "within 5% across families and it
is not; 40% out and it is."

Nobody has measured it. The report already refuses to quote a Claude band for a
GPT figure, which is the honest interim answer and no substitute for knowing.

**Chapters:** extend the band harness to each family's own counting endpoint;
publish a band per family; refuse a band where none was measured, by name, the
way the corpus already refuses one for an unmeasured sample; then take the
tokenizer decision **with the number in hand** and write down which way it went
and why.

**What this arc refuses:** a single global band across families, which would be
the estimating-and-measuring merge this project spent 1.36–1.40 removing.

## 1.55.0 — More than one machine — **delivered**

**All three chapters shipped, landing at 1.55.0** — ahead of 1.54.0, which needs
provider keys this repository does not have. The number 1.54.0 is left unspent
rather than renumbered: the hole records that an arc was jumped, and moving the
numbers to close it would rewrite a document whose value is having been written
before the code.

*An intention, not a defect.* Everything assumes one operator with files on
disk. `--by-source` and `owners` divide a bill somebody already collected; there
is no way to combine what several people measured without one of them gathering
files by hand.

The shape worth wanting is a **format and a merge**, not a service: several
records, one roll-up, with each contributor's gaps preserved rather than
averaged away. The interchange format exists precisely so this can be somebody
else's transport.

**Since written.** The first chapter landed, out of order: `trazum rollup` and
the `roll-up` contract. Taken ahead of 1.54.0 because that arc needs provider
keys this repository does not have, and the ordering is a commitment about what
comes next rather than a promise to idle until it can.

What the chapter found, which the paragraph above did not anticipate: **most of
a profile does not merge at all.** Percentile shapes, conversation growth,
repeated turns and truncation retries are computed from individual calls, and a
summary of a summary cannot reproduce them — so the deliverable is as much a
list of refusals as a merge. And the refusal that matters most is one no
implementation can lift: overlap *between* contributors is unmeasurable, because
the raw lines a duplicate check needs are in no document. `conform` fails a
roll-up that does not say so.

Both remaining questions were then answered rather than left open. **A
contributor states the period it claims to cover**, so a missing export can be
told from a quiet week: the window a profile was run under travels into the
roll-up, is kept apart from the observed span, and every silent day inside it is
named. And **a roll-up is a contribution too** — three teams roll up their own
machines and the organisation rolls up the three, with contributors flattened
rather than collapsed and every refusal surviving the nesting.

**Closed at 1.55.0**, and it decided that nothing else belonged in it: three
chapters, and the two questions the arc found on the way answered rather than
carried forward.

## 1.56.0 — Something that runs — **delivered**

**All three chapters shipped, landing at 1.56.0, and the arc's question
answered.** `history` names the
stretches no report covers, so a series with a hole in it is no longer
indistinguishable from a shorter one; `trazum pulse` gives the outside view of a
scheduled job, because the thing that would tell you a watcher stopped was the
watcher; and [docs/running.md](running.md) is the reasoning, the recipes and the
place the answer runs out.

**The answer was not the one the paragraph below feared.** Alerting can be given
without a hosted service — for the *noticing*. Something has to run, and the
something is already in the reader's CI: a step that gates on staleness turns a
dead cron into a red build while Trazum holds nobody's metrics. What cannot be
given without a host is the **last hop** — paging, retrying a delivery,
deduplicating across channels, knowing somebody is on holiday — and that
sentence is now written down rather than left to be discovered.

*An intention.* `history` reads a series nobody is producing on a schedule, and
`watch` runs only while a terminal is open. `ROADMAP.md` has held cost alerting
back because it "needs somewhere to run and something to remember".

The question this arc has to answer honestly is whether that can be given
without becoming a hosted service holding other teams' metrics. If the answer
turns out to be no, the arc's deliverable is that sentence with its reasoning,
and the slot goes to whatever is next.

## 1.57.0 — The optimiser earns its name again

**First chapter landed: the number the arc is about is now measurable.**
`trazum rules --measure` runs the optimiser once per rule alone and once per
rule removed, keeps the two figures apart because they diverge wherever rules
overlap, and separates the normalisation floor from the rules' own work.

What it found immediately: on a prompt with a repeated stanza, three rules each
recover forty tokens alone and nothing at the margin — the overlap was invisible
until something measured it. And on the two sample prompts this repository
ships, the deterministic rules recover **nothing at all**, which is the fair
complaint made concrete rather than quoted.

The arc cannot choose what to add on the model's side of the line without this,
and it did not have it. Two more chapters followed at 1.56.1: a corpus of twelve
fixtures so "inert" is a signal rather than the only available answer, and a
guard on the catalogue's order — which decides whether a repeated stanza is
reported as one paragraph or three lines, for the same saving, and had never
been written down as deciding anything.

**What the arc still owes is blocked.** The remaining chapter is the thesis:
what belongs on the model's side of the line, held to the bar the semantic pass
set. Building a candidate that has never been run against a model is the
measure-by-reading this repository refuses everywhere else, so it waits on a
provider credential — named rather than half-built, the same treatment 1.54.0
gets.

*An intention.* The deterministic rules recover about 1%, which the README says
plainly and which is the fair complaint about this tool. 1.50.9's semantic pass
was the first evidence that the ceiling is higher when a model is allowed to
read the prompt.

This arc asks what else belongs on that side of the line, and holds every
candidate to the bar the semantic pass set: a finding a dictionary cannot make,
verified before it is offered, never applied silently.

## 1.58.0 — Where the prompt lives

*An intention.* Every command here operates on a file after it was written. The
cost of a prompt is most useful while somebody is writing it, and the roadmap
has called an editor surface "the right place for this to live" since 0.10.0,
held back because an extension is a distribution commitment rather than a
feature.

That is still true, and it is the reason this is eighth rather than second.

## 1.59.0 — A language needs a maintainer

*An intention, and the one least in my gift.* The dictionaries cover seven
languages. Adding an eighth is mechanically a catalogue plus entries, and has
been held back because deciding a phrase says something in more words than it
needs is a judgement about that language — one this project will not make in a
language nobody here reads.

So this arc is not "add languages". It is: make the maintainer requirement a
real, documented role with a real bar, and then admit that whether it lands is
not a scheduling question.

## 1.60.0 — Our own medicine, measured

*An intention, and the thesis that closes the arc of arcs.*

[our-own-medicine.md](our-own-medicine.md) ends by listing what this project
cannot say about itself: it has no usage log of its own, no outcome is recorded
for any of its work, and **every miss on its record was found and written down
by the same process that made it.**

That last one is the deepest. By this product's own standard — set in 1.50.4,
that an outcome is recorded and never inferred — the entire self-assessment is a
cost with no counterpart. This arc's job is to make at least one of those three
sentences no longer true, with a measurement rather than an argument.

If it cannot, the honest deliverable is a longer version of that page saying so,
and the arc closes on the number it could not produce.

---

## What is deliberately not here

- **A date, for any of it.** Nine arcs at the pace of the last two would be a
  long time, and a figure I would be inventing.
- **A forecast of the pace.** The tool refuses to turn a series into a
  projection; its roadmap does not get to.
- **Chapter numbers for arcs after 1.52.** The 1.51 plan deliberately dropped
  them and said why: 1.50.1 and 1.50.2 both arrived without being in the plan,
  and work outside a plan is not a failure of the plan.
- **Anything that reorders on a whim.** What *would* reorder this: a user with a
  provider Trazum prices and cannot gate, which moves 1.53 up; a measured band
  that comes back far out, which makes 1.54 urgent rather than tidy; or somebody
  volunteering as a language maintainer, which moves 1.59 whenever they appear.
