# The pricing dataset

[Documentation](README.md) / [JSON output](json-output.md) · [Releasing](releasing.md)

Trazum's price catalogue, `packages/core/src/pricing.ts`, published as JSON with
every release, for anybody who wants the prices without the tool: one row per
model and rate, each with its provider, its unit, the page the price was read
from and the day it was read (#784).

It is the catalogue serialised and nothing else. `scripts/pricing-dataset.mjs`
writes it from the built `@trazum/core`; no document is written by hand, no
figure in it is computed, and nothing is fetched to make it.

## Where it is

Every version is at two addresses, which serve the same bytes:

| What | Address |
| --- | --- |
| A version's document, on the site | `https://trazum.vercel.app/datasets/pricing/<version>.json` |
| The same file, on the release | `https://github.com/TrazumAPP/Trazum/releases/download/v<version>/trazum-pricing-<version>.json` |
| The JSON Schema of the format | `https://trazum.vercel.app/datasets/pricing/schema-1.json` |
| Every version, with its digest and its changes | `https://trazum.vercel.app/datasets/pricing/changelog.json` |

A version's address never changes and its file is never rewritten: a release
writes a new one. The release asset, `trazum-pricing-<version>.json`, is listed
in the release's `SHA256SUMS`, and `changelog.json` gives the SHA-256 of every
version's file, so a copy can be checked against either.

3.0.1 is the first version. Its document was written after that release was
cut, from a catalogue whose prices are 3.0.1's, so it is on the site and not
on the 3.0.1 release, and `changelog.json` names no release asset for it. It
holds 734 rows for 91 models, as
`node scripts/pricing-dataset.mjs` counted them.

## What a document holds

| Field | What it is |
| --- | --- |
| `version` | The Trazum release it was published with |
| `catalogue` | The file it was built from, the SHA-256 of that file's text, and the oldest provider review date in it |
| `licence` | `MIT`, and the licence text at that release's tag |
| `sourcesArePer` | Always `provider`: see [Sources and dates](#sources-and-dates) |
| `defaults` | The ratios the catalogue applies to a model that states none |
| `models` | Every priced model as the catalogue holds it without its prices: id, name, provider, aliases, capability, context window, cache minimum, caching mode, cache lifetimes, whether it is recommended, its retirement and its notes |
| `rows` | One per model and rate |
| `changes` | What moved since the version published before it |

A row:

```json
{"id":"gpt-6-astra:input:tier=flex:band=over-272k","model":"gpt-6-astra","provider":"openai","rate":"input","unit":"usd-per-million-tokens","value":10,"serviceTier":"flex","band":{"id":"over-272k","when":{"kind":"input-tokens-above","tokens":272000}},"sources":["https://developers.openai.com/api/docs/pricing"],"reviewed":"2026-11-16"}
```

| Field | Always | What it is |
| --- | --- | --- |
| `id` | yes | The model, the rate and each qualifier below, joined by `:`. Unique in a document, and the key `changes` uses |
| `model`, `provider` | yes | The catalogue's model id, and who sells it |
| `rate`, `unit`, `value` | yes | Below |
| `sources`, `reviewed` | yes | The pages the provider's prices were read from, and the day |
| `serviceTier` | no | A service tier other than the standard one (`flex`, `fast`, `ultrafast`), which replaces the standard rates and their bands whole |
| `band` | no | A conditional rate: `when` says when it applies (a prompt over or at least a number of input tokens, a call inside hours of the UTC day, or a call at fast speed) |
| `until` | no | A past period: the rate applied to a call before this instant, and after the period before it ended |
| `promo` | no | A promotional rate, until a date inclusive, with the day the page was last read still stating it |
| `geo` | no | The geography a multiplier applies to |

A row with none of the five qualifiers is the standard rate today.

## Rates and units

| `rate` | `unit` | What it is |
| --- | --- | --- |
| `input` | `usd-per-million-tokens` | Input tokens |
| `output` | `usd-per-million-tokens` | Output tokens |
| `cache-read` | `multiple-of-input-rate` | A cache hit, as a multiple of the input rate that applies |
| `cache-write` | `multiple-of-input-rate` | A cache write of the shorter lifetime the provider sells |
| `cache-write-long` | `multiple-of-input-rate` | A cache write of the longer lifetime |
| `batch` | `multiple-of-standard-rates` | A batch call, as a multiple of the input and output rates; `null` means the provider has no batch API |
| `batch-cache-read` | `multiple-of-batch-input-rate` | A cache hit in a batch call, where the provider's batch table prices it differently |
| `inference-geo` | `multiple-of-every-rate` | Running in the geography `geo` names, applied to every token rate |
| `web-search` | `usd-per-thousand-searches` | A search the model makes, on top of the tokens |

The ratios are published as ratios because the catalogue holds them as ratios.
Multiplying one by an input rate is the reader's arithmetic, and the dataset
does not do it for you: a dollar figure for a cache read is not in the
catalogue, so it is not in the dataset.

**A ratio a model does not state has no row.** The catalogue then applies its
default, which `defaults` gives once: a model with no `cache-read` row reads
the cache at `defaults["cache-read"]`, and so on. A past period with no ratio
row takes the model's own row first, then the default. A `batch` row of
`null` is a statement, that the provider has no batch API, and is not
replaced by the default.

## Sources and dates

The catalogue records when it last read each provider's prices, one date per
provider, and which pages it read that day, in `PROVIDER_REVIEWED` and
`PROVIDER_SOURCES`. It records no source for a single model. So every row of a
provider carries that provider's pages and date, and `sourcesArePer` says so:
a row's `sources` say where its provider's prices were read on `reviewed`, not
that its own figure was found on every one of those pages. A provider whose
prices sit on several pages, as Mistral's sit on an inference page and three
model cards, lists them all.

The pages are copied from the comment above each provider's date, which says
what was read and found. `provider-sources.test.js` fails on a page that
comment does not name.

## What it refuses

- **An estimated price.** Every value is a figure the catalogue states, which
  a person read off the provider's own page on the date given. Nothing is
  derived, interpolated or carried over from another provider.
- **A zero for an unknown.** A model the catalogue does not price has no rows
  at all, and is not in `models`. A price of zero, below zero or not a number
  stops the build. The one empty value is a `batch` of `null`, which the
  catalogue states.
- **A filled-in field.** A ratio a model does not state is not written with
  the default; the default is in `defaults`, once, with the rule above.
- **A source per model.** None is invented where the catalogue keeps one per
  provider.
- **A network at build time.** The script reads the built package and the
  documents already published, and nothing else.

Models a provider lists and the catalogue leaves unpriced on purpose are
named, with their reasons, in `DELIBERATELY_UNPRICED` in
`scripts/price-drift.mjs` and on the site's `/models` page. They are not rows.

Google, DeepSeek, Moonshot, xAI and Mistral, which `price-drift.mjs` does not
read, are compared weekly with LiteLLM's public model list by `scripts/price-crosscheck.mjs`. LiteLLM is a
signal to re-read a provider's page, not a source: no row here, and no figure in
the catalogue, comes from it.

## Versions and changes

`scripts/prepare-release.mjs` writes the next version's document with the rest
of a release, from the catalogue as built, and rewrites `changelog.json` and
the schema beside it. A version already published is never rewritten:
`node scripts/pricing-dataset.mjs write` refuses one whose file says something
else.

A document's `changes` compare it with the newest version published before
it, read from that published file: `rows.added` and `rows.removed` list ids,
and `rows.changed` lists each id whose fields differ, with each field's value
`from` and `to`. A provider re-read on a new date changes the `reviewed` of
every row of that provider, which is the record that it was read again.
`models` is compared the same way. The first version compares with nothing,
so its `since` is `null` and its lists are empty. `changelog.json` holds every
version, newest first, with its two addresses, its file's SHA-256, its counts
and its `changes`.

The JSON Schema is `schema-1.json`. A change to the shape that a reader's code
would notice is a new format number and a new schema file, and a new version
of the same format is not.

## How it is held

`test/pricing-dataset.test.mjs` reads every row of the document back into the
catalogue's own shape, with code that shares nothing with the builder, and
requires the result to be `MODELS` field for field. It requires every row to
have a page and a date, its provider's; no value of zero; the published
document of the current version to be exactly what the script builds while
`pricing.ts` is the file it records; every published version to satisfy the
schema and to list what changed since the one before; and `changelog.json` and
the schema to be what the script writes. The release's `assets` job builds the
document again from the commit it publishes, and stops before any upload if
the file on the site is not that document.

```bash
npm run build
node scripts/pricing-dataset.mjs          # what the catalogue builds today
node scripts/pricing-dataset.mjs check    # whether the published file is it
```

## Licence

Each document's `licence` is `MIT`, the licence of this repository and of
`@trazum/core`, whose catalogue it serialises, with a link to the licence text
at that release's tag. [What is open, what is not](licensing.md) says what that
licence covers here.
