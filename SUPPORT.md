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
the web app. The only network calls any of them make are the ones you asked for:
`connect` reaching a provider's usage API, `--pricing-live` fetching a price
feed, `eval`/`route`/`prune`/`--suggest` making the model calls they warn you
about first.

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
