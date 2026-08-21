# The gateway

```bash
trazum gateway anthropic --on-cannot-tell fail-closed
trazum gateway openai    --on-cannot-tell fail-closed
```

Then point your SDK's base URL at what it prints and change nothing else. It
speaks the provider's own wire format, so there is no new client, no wrapper and
no code change.

**Two providers, and the command names them itself.** `trazum gateway` with no
argument answers *"Name the provider to stand in front of. Known: anthropic,
openai."* Each is compiled in with exactly one forwarded path — the one that
spends tokens:

| Provider | Upstream | The only path forwarded |
| --- | --- | --- |
| `anthropic` | `https://api.anthropic.com` | `/v1/messages` |
| `openai` | `https://api.openai.com` | `/v1/chat/completions` |

Everything else in Trazum either answers a question you can ignore or reports on
a bill after it arrived. This is the one thing that can say **no**.

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

## The refusal body

Documented field by field, with a two-direction parity test, in
[json-output.md](json-output.md#the-gateway-refusal-document).
