# @trazum/tokenizer-openai

OpenAI's own tokenizer, as an optional counter for [Trazum](https://github.com/Davmunrey/Trazum).

Install it and Trazum counts OpenAI prompts **exactly** instead of estimating
them. Do not install it and nothing changes: `@trazum/core` declares no
dependencies, and every figure goes on saying which counter produced it.

```bash
npm install @trazum/tokenizer-openai
```

## Why it is a separate package

The rank tables are twenty-two megabytes. The zero-dependency promise in
`@trazum/core` is load-bearing for the CI case this product is built around --
**a gate that pulls a twenty-megabyte table into every build is a gate teams
turn off** -- so the only shape that improves the absolute figures without
spending that promise is a package somebody installs on purpose.

Nothing in `@trazum/core` imports this. The counter is passed in through the
`TokenCounter` seam that has been there since the beginning.

## What it is worth

The heuristic in `@trazum/core` is published under a ±33% band **measured
against Anthropic's counter**, and against OpenAI's it has been measured at
**112.4%** out at worst -- more than twice, on German prose. The estimator is
not broken; it is calibrated for a tokenizer that packs Latin text far less
densely than `o200k_base` does. This package removes the question.

Against the 47-sample corpus in this repository, measured through OpenAI's own
API with a real key, this package reproduces every count exactly: 47 of 47, to
the token.

## What it refuses

**A model it does not have the encoding for.** Not a nearby encoding, not the
newest one, not a default. `gpt-5-codex` and any model shipped since the rank
tables were written are refused, because a count produced by guessing which
table to use would go out labelled *exact*, and exact is the strongest word
this tool uses about a number.

**To claim it knows whose a model is.** A Claude model refuses here as
`unknown-encoding` rather than as *wrong family*. This package holds encodings,
not a catalogue.

## What the number is

The token count **of the text**. It is not the token count of a chat request:
an API call wraps each message in role markers and primes the reply, and those
tokens belong to the envelope rather than the prompt.

## Usage

```js
import { openaiCounter } from '@trazum/tokenizer-openai';

const counter = openaiCounter('gpt-5');
if (counter.ok) {
  console.log(counter.encoding);        // 'o200k_base'
  console.log(counter.count('hello'));  // 1
} else {
  console.log(counter.refusal.reason);  // 'unknown-encoding'
}
```

`canCount(model)` answers the same question without parsing a
two-hundred-thousand-rank table, for a caller deciding what to say before it
decides what to do.

## Licence

MIT. Wraps [`js-tiktoken`](https://github.com/dqbd/tiktoken), also MIT.
