# Gating on cost, in whatever CI you already run

Trazum is one binary with meaningful exit codes. That is the whole integration
story, and it is deliberate: a tool that only gates on one vendor's CI is a tool
half its readers cannot use, and every vendor-shaped convenience is a second
code path that rots.

**Exit codes are the contract.**

| Code | Means |
| --- | --- |
| `0` | Every gate that ran, passed — or was waived, on the record. |
| `1` | A gate failed, or the run could not be completed. |

Commands that gate: `trazum check` (token budgets and the baseline),
`trazum profile` (money budgets, from flags or `spend` in the config), and
`trazum verify --gate` (a plan's promises).

Everything else exits 0 and reports. `trazum doctor` surveys and never gates —
its model recommendation is a keyword heuristic, and gating a build on a keyword
heuristic teaches people to re-run until green, which costs more than the tool
saves.

## GitHub Actions

The repository ships an Action, which additionally comments on the pull request:

```yaml
- uses: Davmunrey/Trazum@<commit-sha>  # pin to a commit, never a tag
  with:
    target: prompts/          # a file, or a directory using the config's budgets
    max-tokens: '900'
```

The input is **`target`**. `file` is a deprecated alias kept so existing
workflows keep working. There is no `path` input, and giving one fails the run
with *"Set the 'target' input to the prompt file or directory to check, or
'usage-log' to gate the spend"* — the Action refuses rather than checking
something nobody asked about.

Or use the binary directly, exactly as below.

## GitLab CI

```yaml
prompt-cost:
  image: node:20
  script:
    - npx --yes @trazum/cli check prompts/ --max-tokens 900
    - npx --yes @trazum/cli profile logs/ --max-usd 400
  artifacts:
    when: always
    paths: [trazum-summary.md]
```

`--markdown-out trazum-summary.md` on either command writes the same report as
a Markdown file, which GitLab renders as a job artifact.

## Jenkins

```groovy
stage('Prompt cost') {
  steps {
    sh 'npx --yes @trazum/cli check prompts/ --max-tokens 900'
    sh 'npx --yes @trazum/cli profile logs/ --max-usd 400 --markdown-out trazum.md'
  }
  post {
    always { archiveArtifacts artifacts: 'trazum.md', allowEmptyArchive: true }
  }
}
```

A failing gate throws on the `sh` step, which is what marks the stage failed.
Nothing Jenkins-specific is needed and nothing Jenkins-specific is offered.

## CircleCI

```yaml
jobs:
  prompt-cost:
    docker: [{ image: cimg/node:20.11 }]
    steps:
      - checkout
      - run: npx --yes @trazum/cli check prompts/ --max-tokens 900
      - run: npx --yes @trazum/cli profile logs/ --max-usd 400
```

## A pre-commit hook

The one place where speed matters more than completeness, so gate on the
prompts and not on a month of logs:

```bash
#!/bin/sh
# .git/hooks/pre-commit
npx --yes @trazum/cli check prompts/ --max-tokens 900 || {
  echo "Prompt over budget. Commit with --no-verify if you mean it."
  exit 1
}
```

`--no-verify` is named on purpose. A hook somebody cannot get past is a hook
somebody uninstalls, and an uninstalled hook gates nothing.

## Verifying a plan in CI

The plan is the one output meant to be committed
([format](plan-format.md)). Once it is in the repository, a broken promise is as
visible as a broken test:

```bash
trazum plan logs/ -o plan.json          # once, reviewed in a pull request
trazum verify plan.json --against logs/ --gate
```

`--gate` fails on a promise that did not arrive, and on `fields-stopped` — a
team that degraded its own log must not pass on the strength of the silence. A
workload that genuinely vanished, or a tier the log never recorded, reports
`cannot-tell` and fails nothing. **Three outcomes, never two.**

## Gating performance without gating the runner

A wall-clock budget in CI fails on weather: shared runners lie about time.
The bench's gate holds a **ratio** instead — each workload timed against a
calibration loop in the same process, so the runner's speed cancels out of
the number being judged:

```bash
trazum bench --record trazum.bench.json                  # once, committed
trazum bench --against trazum.bench.json --max-ratio 3   # every build
```

Exits 1 when any workload is past its recorded ratio times the stated
factor, on stderr, the way `check` gates. The factor is yours: 3× is a
tripwire for the quadratic-regex class of regression; a tighter factor buys
sensitivity at the price of noise. A baseline whose version the binary does
not know is a loud error naming `--record`, never a best-effort read — the
file is committed, so it crosses upgrades. This repository runs exactly this
step on its own CI.

## Waivers, and their record

A gate failure a team has looked at and decided to live with goes in the config
with a reason and an end date:

```json
{
  "spend": { "maxUsd": 400 },
  "waive": [
    { "gate": "maxUsd", "reason": "the vendor migration lands in March", "until": "2026-04-01" }
  ]
}
```

All three fields are required. A waiver with no end date is a finding deleted
with extra steps, and a reasonless one is a silence nobody can audit. The
failure still prints — waived is shown as waived, never hidden — and only the
exit code goes quiet.

**Every use is written down.** When a waiver silences a gate, Trazum appends a
dated line to `.trazum/waivers.jsonl`: the gate, the reason and expiry *as they
stood at that moment*, the commit when CI exported one, and the figures the gate
judged. `trazum history` reads those lines back and can finally say that a
finding has been waived nine times across four months under one unchanging
sentence whose deadline moved three times — which is a decision nobody is
revisiting, and something no config could ever have told you.

Two rules make that record trustworthy:

- **Nothing is back-filled.** The history begins the day recording began, and
  says so. A past reconstructed from today's config would be a guess presented
  as evidence.
- **A waiver nobody's build has hit is dead config, not a habit**, and the
  report keeps the two apart.

Commit `.trazum/waivers.jsonl` if you want the record shared, or leave it out of
version control if you only want it locally. Trazum never rewrites it and offers
no command to clear it: a record of decisions the tool can erase is a record
nobody can rely on. Delete the file yourself if you mean to.

## What is deliberately not here

No vendor plugin, no marketplace listing, no wrapper action for each CI. They
would each be a second code path with its own bugs, its own release cadence and
its own way of drifting from the exit codes above. One binary, documented
recipes, and any limitation stated rather than papered over.
