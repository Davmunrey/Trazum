# Getting help, and telling us something

`trazum feedback` prints all of this in your terminal, with a blank issue link
that already carries your version, runtime and platform. **It sends nothing** —
see [No telemetry](#no-telemetry) below.

## Where to go

| What | Where |
| --- | --- |
| **A rule changed what my prompt asks for** | [Open the report](https://github.com/Davmunrey/Trazum/issues/new?template=wrong_optimisation.yml) — this is the one that matters most |
| Anything else that is wrong | [Bug report](https://github.com/Davmunrey/Trazum/issues/new?template=bug_report.yml) |
| A question, or an idea you are not sure about | [Discussions](https://github.com/Davmunrey/Trazum/discussions) |
| A security problem | [Privately, as an advisory](https://github.com/Davmunrey/Trazum/security/advisories/new) — never a public issue. [SECURITY.md](SECURITY.md) says what is in scope |
| What is planned, and what was deliberately not | [ROADMAP.md](ROADMAP.md) — including the entries under *Under consideration* that were considered and left out |
| How any of it actually works | [docs/README.md](docs/README.md) — the documentation index, arranged by what you are trying to do |
| What is expected of everyone here | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — including what a single-maintainer project can honestly promise |

Blank issues are on. A template that does not fit is a reason to write freely,
not a reason to give up, and the reports nobody anticipated are usually the
interesting ones.

## The report that matters most

Trazum's whole claim is one sentence: *it reduces what an AI call costs without
changing what the prompt asks for.* A rule that saves tokens and quietly moves
the meaning is not a smaller version of a good outcome — it is the failure this
product exists to avoid, and it is treated as more urgent than anything else.

The same goes for a **figure that is wrong**. Every number here is meant to be
reproducible from the log you gave it; if one is not, that is a bug in the
arithmetic and not a matter of taste.

**Do not paste anything private.** An issue is a public page, and a usage log
names your workloads and your spend. A shape — "a slice with 40k input tokens
and no cache reads" — is almost always enough.

## No telemetry

Trazum does not phone home. There is no ping, no install hook, no anonymous
usage counter, and no crash reporter, in the CLI, the library, the MCP server or
the web app. Every network call any of them can make is one you asked for, and
here is the whole list, each tied to the flag or command that reaches for it —
named rather than counted, because a count is the half that goes stale:

| What reaches out | Where it goes | What asks for it |
| --- | --- | --- |
| `trazum connect` | the provider's usage API | you name the provider |
| `--pricing-live` | the OpenRouter price feed | the flag |
| `eval`, `route`, `prune`, `--suggest`, `--llm`, `semantic` | your configured `TRAZUM_LLM_*` endpoint | the command, which prints the call count and stops without `--yes` |
| Vertex AI, when that is your endpoint | Google's token endpoint, to exchange the service account for a token | the same commands, only on Vertex |
| `--exact-tokens` | Anthropic's `count_tokens` endpoint | the flag. It is not charged for tokens |
| `trazum gateway` | the provider you named, at a compiled-in host | **the whole point of the command** — it stands in the path of your calls and forwards them |
| `trazum watch --webhook` | the URL you gave it | the flag, and only when a threshold is crossed |

**The gateway is the one to read twice.** It forwards your prompt and your
credential to the provider, because that is what standing in the path means. It
holds neither: the body is counted and dropped, the credential is passed through
untouched, and the host is compiled in so no config on disk can redirect it.
[docs/gateway.md](docs/gateway.md) is the full account.

That is enforced rather than promised. The build fails if `trazum feedback`
reaches the network or opens a browser on your behalf, if anything about your
work reaches the prefilled issue body, or if any published package declares an
install hook — which is how a CLI usually acquires telemetry without a line of
its own code changing.

So we cannot see how many people run this, which commands they use, or what
breaks. **The only signal is what you tell us**, which is why the command above
exists and why it is one word.

## What we can see, and what it does not tell us

Public, and worth being honest about the limits of:

- **npm download counts.** A number that includes CI runners, mirrors and
  registry crawlers. It says something about reach and nothing about use.
- **GitHub stars, forks and clones.** Approximately the same, for a different
  audience.
- **Issues and discussions.** The only one of the three that carries a reason.

## Response

This is a small project. There is no support contract and no promised response
time, and pretending otherwise would be worse than saying so. Security reports
get looked at first; a wrong-optimisation report second.

## If you are changing something

[CONTRIBUTING.md](CONTRIBUTING.md) covers the workflow, and
[docs/doctrine.md](docs/doctrine.md) covers the reasoning most pull requests end
up arguing with — worth reading before rather than after.
