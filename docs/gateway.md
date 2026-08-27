# The gateway

```bash
trazum gateway anthropic --on-cannot-tell fail-closed
trazum gateway openai    --on-cannot-tell fail-closed
trazum gateway google    --on-cannot-tell fail-closed
```

Then point your SDK's base URL at what it prints and change nothing else. It
speaks the provider's own wire format, so there is no new client, no wrapper and
no code change.

**The command names the providers itself.** `trazum gateway` with no argument
answers *"Name the provider to stand in front of"* and lists them. A provider
Trazum **prices** but does not front gets a different answer that says so and
points at `trazum profile`, rather than being refused as a typo. Ask the command
how many there are of each; a number written here is a number that goes stale
the next time one moves — as the one that used to be in this paragraph had,
silently, for a whole release.

Each provider is compiled in with exactly one forwarded path — the one that
spends tokens:

| Provider | Upstream | The only path forwarded |
| --- | --- | --- |
| `anthropic` | `https://api.anthropic.com` | `/v1/messages` |
| `openai` | `https://api.openai.com` | `/v1/chat/completions` |
| `deepseek` | `https://api.deepseek.com` | `/chat/completions` |
| `mistral` | `https://api.mistral.ai` | `/v1/chat/completions` |
| `google` | `https://generativelanguage.googleapis.com` | `/v1beta/models/{model}:generateContent` |

### And two that spend nothing

Anthropic's row has a second, shorter list: paths forwarded **without a budget
decision**, because there is no money on the line to decide about.

| Provider | Also forwarded | Why it costs nothing |
| --- | --- | --- |
| `anthropic` | `POST /v1/messages/count_tokens` | Returns a token count and bills nothing. `--exact-tokens` has called it since the band harness needed a ground truth, and this repository documents it as free every time it suggests it. |
| `anthropic` | `GET /v1/models` | Lists what the account may call. No body, no tokens, and the call a client makes on startup to find out what exists. |

**Refusing these was never the stricter answer.** `count_tokens` is the call you
make to find out whether you can afford the other one, so answering it with a 402
blinds a caller at the exact moment they are trying to behave. A budget refusal
only means something when there is money on the line; a refusal on a free call is
theatre with a real cost.

**What it widens, stated plainly.** The origin is still compiled in, so your
credential can still only ever reach one host. What grows is the set of
*operations* somebody who can reach the loopback port may perform with it, from
one to three. That is why the list is literal strings rather than a pattern, why
the method is part of the match, and why a comparison is against the whole path:
`/v1/models/../messages` and `/v1/models?limit=1` are both refused, and
`gateway-free-paths.test.js` plants each of them.

**Nothing that bills belongs on that list.** `POST /v1/messages/batches` is the
near miss: it reads as administrative and it charges. It is refused, and a test
plants it. No test can derive "this operation is free" from an API this project
does not own, so the real defence is that adding a row here is a decision
somebody wrote down: a free path missing from this table fails the build.

**Google's row is the only one with a brace in it**, because Google puts the
model in the URL rather than the request body. That path is matched against an
anchored pattern whose model segment accepts only the characters a model id is
made of, and the URL sent upstream is then **rebuilt** from what matched rather
than forwarded as received. `:streamGenerateContent` and `:countTokens` are
different operations and are not forwarded.

Everything else in Trazum either answers a question you can ignore or reports on
a bill after it arrived. This is the one thing that can say **no**.

## What it cannot stand in front of, and why

Two of the places Trazum sends a model call are not on the table above and never
will be, for the same structural reason rather than for want of work.

**Bedrock.** The endpoint is `https://bedrock-runtime.{region}.amazonaws.com`,
and the SigV4 signature covers the host. A proxy that rewrote the origin would
forward a signature that no longer matches the request it is attached to, so the
call would fail at AWS rather than succeed through Trazum.

**Vertex AI.** The endpoint is `https://{location}-aiplatform.googleapis.com`
for every region but `global`. Fronting it would mean an origin chosen by the
caller — and the gateway compiles its upstreams in precisely so that nothing a
caller controls can decide where their key is sent. A security test compares the
compiled origins exactly, for that reason.

Both are still **priced** and both are still **profiled** from a log you export.
What the gateway offers and they cannot have is a refusal before the money is
spent.

## Why in the path at all

`trazum serve` answers *what will this cost and is there budget* in single-digit
milliseconds, and an implementation may consult it and ignore it. `spend_guard`
gives an agent the same answer in a shape it can act on, and an agent may ignore
that too. Advice an implementation can skip is advice a budget cannot rely on.

And a connector pulls usage *after the fact* — the runaway is always reported
after it ran, because the provider's export is a batch job on somebody else's
schedule.

Standing between the caller and the provider fixes both. Usage is measured from
the provider's own response as it comes back: no export, no connector lag, no
missing day. And a refusal is a refusal.

## The one thing it must never do

**It refuses; it does not substitute.**

A call over budget is rejected with HTTP 402 and the cheaper alternatives named.
It is never silently swapped for a smaller model, never trimmed, never
downgraded in flight. The caller asked for something specific, and a proxy that
quietly answers a different question is worse than one that fails — the failure
is visible and the substitution is not.

That is enforced in the type, not in a promise. A decision from
`gatewayDecision` is either `forward`, which carries nothing the caller did not
send, or `refuse`, which carries no body at all. There is no shape in which it
hands back a modified request, so substitution cannot arrive later as a
reasonable-looking field.

### Why 402 and not 429

Every provider SDK retries a 429 automatically — that is what the code means to
them. Answering a budget refusal with one would turn a single refusal into a
retry storm against a gateway that refuses every time, driven by the caller's
own client library. 402 Payment Required is both literally correct and in
nobody's default retry list.

A **502** is a different thing entirely: the provider could not be reached. A
caller needs to tell "your provider is down" from "you are out of money", and a
proxy that blurred them would send somebody to fix the wrong thing at the worst
possible moment.

## A refusal arrives before the first byte, or not at all

**The budget is judged before the upstream is opened, and never again during
the call.** On a refusal the provider is not contacted at all: your prompt does
not leave the machine, and no money is spent on a call that was going to be
refused anyway. A gateway that forwarded first and refused afterwards would have
paid for the thing it was refusing.

Once bytes are flowing, **the call is committed**. The status line is long gone,
so a 402 could not be sent as a refusal even if the budget ran out mid-answer —
it would arrive as garbage inside somebody's response. So it does not arrive at
all: a stream that started, finishes.

That is a real limit and it is stated rather than discovered. **A call that
begins inside the budget can end outside it**, by exactly the cost of one
answer. The alternative — cutting a reply off partway to save the difference —
corrupts the thing the caller is reading to protect a figure that is already
spent. `trazum gateway` will not do that.

Both halves are asserted: one test proves the upstream sees no connection at all
for a refused call, and another exhausts the budget *while a stream is in
flight* and proves the answer still arrives whole. Inverting the order fails the
first by name; consulting the budget per chunk fails the second.

## Failure is a decision you make in advance

`--on-cannot-tell` is **required and has no default**.

When the gateway cannot judge — no budget configured, nothing measured for this
period, a model the catalogue cannot price — one of two things happens:

| Policy | What happens | What it costs |
| --- | --- | --- |
| `fail-open` | The call goes through, and the record says it was **unjudged** — never "within budget" | The bill keeps running while nobody is watching |
| `fail-closed` | The call is refused | Your product stops working |

Both are defensible and only you know which failure your product can survive.
Picking one for you would be the most consequential decision in your
architecture, made silently at install time.

## One policy, three doors

The `limits` block in `trazum.config.json` — `dayUsd`, `sessionUsd`,
`byLabel` — is the enforcement policy, and the gateway is one of three doors
that hold it. The other two are `trazum serve`'s cost answer and the
`spend_guard` MCP tool, and all three call **the same judging function** in
`@trazum/core`: none of them does arithmetic of its own, which is why
`three-doors.test.js` can push one call through all three and require the
judgement to match field for field.

What the gateway needs to judge:

- **The policy**: the `limits` block. Without one, every decision carries a
  judgement that says `no-policy` — absent is an answer, not a missing field.
- **The measurement**: `--log <usage.jsonl>`, read once at start. Per-label
  and per-session spend live in a usage log, not in the store's provider
  buckets, so without `--log` every ceiling answers `cannot-tell` — and what
  happens then is your `--on-cannot-tell` decision, like every other
  cannot-tell.
- **The call's identity**: `metadata.trazum_label` and
  `metadata.trazum_session` in the request body, the same seam. A call that
  names neither cannot be judged against a per-label or per-session ceiling —
  it does not slip past; it becomes unjudgeable, with the smallest ceiling
  named as the one it might be dodging. Session identifiers are used to judge
  and never recorded, forwarded, or printed.

A crossed ceiling refuses with HTTP 402, `reason: "limit-over"`, and a
`because` sentence that names the limit, the measured spend and the period —
a refusal an agent can log and a person can audit without re-running
anything.

**Silencing a limit leaves a record.** The `waive` mechanism `check` has
applies here unchanged: a `waive` entry with gate `limits.dayUsd`,
`limits.sessionUsd` or `limits.byLabel:<label>`, a reason and an expiry lets
the call through — but the judgement still says `over`, the waiver rides in
it with the reason and the end date, and the day it expires the ceiling
refuses again. A waiver with no end date is not accepted, here or anywhere.

## Substitution, if you want it, written down

```json
{
  "spend": {
    "monthlyUsd": 400,
    "substitute": {
      "claude-opus-5": { "to": "claude-haiku-4-5", "reason": "quarter is over budget; this workload can take it" }
    }
  }
}
```

Absent means refuse rather than swap, which is the only safe default for a
setting whose whole risk is being switched on without anybody noticing. The
`reason` is required for the same purpose a waiver's is: a substitution nobody
wrote a reason for is a caller being answered a different question, with nobody
able to say why six weeks later.

Every substituted call is **marked** in the record, so no later report treats it
as the call the caller made. And a substitution never fires because the gateway
could not *judge* — swapping a model because a budget could not be read would be
answering a different question for a reason that has nothing to do with the
request.

## Your credential is not even borrowed

The connector's rule since 1.41 is *a credential is borrowed, never held*. This
is stronger: your `authorization` and `x-api-key` headers are forwarded
**untouched and never read**. Trazum holds no key for the gateway and cannot
make a call of its own through it.

The upstream host is **compiled in**. A flag naming it would make this a
credential-forwarding open proxy — anything that could rewrite a config on disk
could point your API key at a machine it chose.

It binds to `127.0.0.1` and the address is not a flag, and it forwards exactly
one path **per provider** — the one that spends tokens, listed in the table
above. A gateway that forwarded any path would be a general proxy for your API
key.

## Nothing about the payload is written down

The store has held aggregates since 1.42 and standing in the path changes
nothing about that. The body is read to count tokens and find the model, then
forwarded and dropped. It is never logged, never stored, and never included in a
refusal — a test asserts a refusal carries no trace of the request text.

The interfaces make it structural rather than disciplinary: `gatewayDecision` is
handed a *description* of the call and never the body, and the recording
callback takes counts and has no parameter that could carry text.

## What it measures, and what it estimates

**Measured**: what the provider reported, arriving with the answer — input,
output and cache tokens from the response body. That is the record.

**Estimated**: the input tokens of a call *before* it is sent, used to decide
whether it would cross the budget. Counting exactly would mean an API call to
count before the API call, which is a round trip in a hot path. The refusal says
which half it rested on: `measured` when the budget was already spent and
nothing was estimated, `measured+estimated` when it takes an estimate of this
call to cross.

The budget standing is read **once at start**. A file read in the request path
would put Trazum's own latency between you and your provider on every call — a
cost this tool would otherwise be reporting on somebody else. The refusal
carries `asOfMs` so staleness is visible rather than implied away.

## What a call it could not measure costs

**Some forwarded calls cannot be counted, and the gateway says so instead of
letting the total quietly absorb them.** The money is spent either way — the
provider generated what it generated and will bill for it — so a period's total
is short by exactly these. A zero would be a measurement, and an estimate would
merge the two halves this tool spent an arc separating.

Two causes, and the second is not a failure at all:

| Cause | What happened | How common |
| --- | --- | --- |
| `stream-broke` | The connection died before the event carrying the counts | rare, and a real error |
| `no-usage-event` | The stream ended cleanly and carried no counts | **every OpenAI streaming call** without `stream_options: {include_usage: true}` |

The second is the one to act on. On OpenAI a streamed call reports nothing
unless the caller asks, so a gateway that stayed silent would under-report most
of somebody's bill and look precise doing it. The fix is one field in your
request, and the gateway names the field rather than only the symptom.

```
  unmeasured: the stream carried no usage event — on OpenAI that is every
  streaming call without stream_options.include_usage, so the total below is
  short by these (3 unmeasured so far)
```

The count is kept separate from the measured one and never folded in. That is
the same rule as everywhere else here: **not-recorded is not not-happened**, and
a figure that swallowed the difference would be wrong in the flattering
direction.

## The refusal body

Documented field by field, with a two-direction parity test, in
[json-output.md](json-output.md#the-gateway-refusal-document).
