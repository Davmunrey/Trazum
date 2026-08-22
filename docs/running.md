# Something that runs, and why it is not us

Everything in Trazum happens when somebody runs a command. The failures worth
catching — a retry loop, a prompt that grew, a model swapped in a deploy —
happen at 3pm on a Tuesday, and a report somebody runs three weeks later is an
obituary.

So something has to run on a schedule. This page is about what that something
is, why it is deliberately **not a Trazum service**, and exactly where that
answer runs out.

## The short version

| You need | Trazum gives you | You supply |
| --- | --- | --- |
| Measurements arriving on their own | `trazum connect <provider>`, idempotent over overlapping windows | The scheduler |
| A crossing judged the afternoon it happens | `trazum watch --once`, whose state file survives a restart | The scheduler |
| An alert reaching a person | A non-zero exit code, `--json` on stdout, `--webhook <url>` | The inbox, the channel, the URL |
| Knowing the scheduler itself stopped | `trazum pulse --max-stale-hours <n>` | Somewhere that already runs on a schedule — your CI |

**There is no account, no upload and no hosted anything.** That is not an
omission somebody means to fix later: a tool whose whole argument is that it
reads your bill without uploading it cannot also be the place everybody's bill
is uploaded. The reasoning is in [the doctrine](doctrine.md); this page is what
follows from it in practice.

## What actually has to run

Four things, and they are separate on purpose — a single "run everything"
command would hide which of them stopped.

**1. Pull.** `trazum connect <provider> --store` writes measured usage into
`.trazum/store/`. Re-pulling an overlapping window is **idempotent**: two
records covering the same window, from the same provider, for the same model
and grouping, are the same fact restated and the later pull wins. That is what
lets an hourly job run over a rolling day without inventing money.

**2. Judge.** `trazum watch --once` reads the store, evaluates the gates you
configured, and emits what crossed. It is the primitive; the foreground loop is
this same function in a timer, so there is one code path and no daemon-only
behaviour nobody exercises.

Its state file (`.trazum/watch.json`) is what makes a restart honest. Without
it a resumed watcher re-alerts on yesterday's crossing — noise nobody reads —
and implies it was watching the whole time, which is a claim it cannot make.
With it, the crossing stays quiet and the unwatched stretch gets named once.

**3. Keep.** `trazum store --prune --keep <n>` bounds the file a year of this
produces. Nothing here needs the raw logs, which is what the privacy story
required anyway.

**4. Notice that 1–3 stopped.** `trazum pulse`. See [below](#the-thing-that-notices-cannot-be-the-thing-that-stopped).

## Recipes

Each of these runs the same command. Pick whichever your machines already have;
none is better than the others and Trazum does not care which.

**cron** — the exit code is the transport. A non-zero exit makes cron mail the
output to the crontab's owner, which is alerting nobody had to build.

```cron
# Pull hourly, judge what it pulled.
17 * * * * cd /srv/app && trazum connect anthropic --store && trazum watch --once
# Keep the store bounded, weekly.
0 4 * * 0 cd /srv/app && trazum store --prune --keep 400
```

**systemd timer** — when you want the log in `journalctl` and a restart policy.

```ini
# /etc/systemd/system/trazum-watch.service
[Service]
Type=oneshot
WorkingDirectory=/srv/app
Environment=ANTHROPIC_ADMIN_KEY=…
ExecStart=/usr/local/bin/trazum connect anthropic --store
ExecStart=/usr/local/bin/trazum watch --once
```

```ini
# /etc/systemd/system/trazum-watch.timer
[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` matters: a machine that was asleep runs the missed cycle on
wake rather than skipping it silently.

**GitHub Actions** — when the machines are ephemeral and the store lives in the
repository or an artifact.

Pinned by commit rather than by tag, which is what this repository does in its
own workflows and for the same reason: a tag moves.

```yaml
on:
  schedule:
    - cron: '17 * * * *'
jobs:
  watch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - run: npx @trazum/cli connect anthropic --store
        env:
          ANTHROPIC_ADMIN_KEY: ${{ secrets.ANTHROPIC_ADMIN_KEY }}
      - run: npx @trazum/cli watch --once
```

GitHub disables scheduled workflows after a stretch of repository inactivity —
sixty days, at the time of writing, and check their documentation rather than
this page for the current number — and it does not tell you it happened. That is
exactly the failure `pulse` exists for.

**Windows Task Scheduler** — same command, same exit code.

```powershell
schtasks /create /tn "Trazum watch" /sc hourly /tr `
  "cmd /c cd /d C:\srv\app && trazum connect anthropic --store && trazum watch --once"
```

## The credential, in every one of them

**It is borrowed, never held.** Trazum reads the key from a named environment
variable, uses it for the request, and never stores it, logs it, returns it to a
caller or puts it in a URL. What travels between parts of this tool is the
**name** of the variable, not its value.

Each connector accepts two names — a `TRAZUM_`-prefixed one and the provider's
own, so `TRAZUM_ANTHROPIC_ADMIN_KEY` or `ANTHROPIC_ADMIN_KEY` — and
`trazum connect <provider> --dry-run` prints which ones it would look at
without sending anything or needing a credential to say so.

So in each recipe above the secret lives where that platform already keeps
secrets — a systemd `Environment=` line with the unit file mode you already use,
a GitHub Actions secret, a Windows credential store. Trazum adds no new place
for a key to sit, and there is no Trazum config field that holds one.

## The thing that notices cannot be the thing that stopped

`watch --once` writes its state file so a restart is honest. That file is read
by exactly one thing, and that thing is the next cycle.

So until `pulse` existed, **nothing could tell you the watcher had stopped,
because the thing that would tell you was the thing that stopped.** A dead cron
produces silence, and a watcher with nothing to report produces silence too.

```bash
trazum pulse                        # the ages, judged by nothing
trazum pulse --max-stale-hours 36   # exits 1 when something stopped
```

Put that second line in the CI you already run on every push or every night. A
dead cron becomes a red build on somebody else's schedule, and Trazum still
hosts nothing.

Three things it will not do, each for the same reason the rest of this tool
refuses things:

- **A first run that never happened is not late.** There is no cadence to be
  late against, so `never-run` is its own verdict and never gates. A check that
  failed on "you have not adopted this feature" would be nagging, not measuring.
- **Without a threshold, nothing is judged.** How stale is too stale is a
  policy, and a generated number nobody chose is a number nobody trusts.
- **How far the measurements reach is never judged by the same threshold.** A
  store pulled ten minutes ago whose newest record stops two days back is a
  healthy job in front of a provider that reports late. Gating on it would be a
  red build for somebody else's latency.

## Where this answer runs out

Said plainly, because a page that only listed what works would be advertising.

- **If nothing of yours runs on a schedule, none of this helps.** A laptop is
  not a scheduler. If the only machine is one that sleeps, the honest options
  are a CI cron or a small always-on host — both yours.
- **The last hop is still yours.** Trazum can exit non-zero, print a document
  and POST to a webhook. It cannot page you, retry a delivery, deduplicate
  across channels or know you are on holiday. Those are the things a hosted
  alerting product is actually selling, and this is not one.
- **A watcher can only judge what has been pulled.** A provider that reports
  usage a day late means a crossing is judged a day late, and no amount of
  scheduling fixes that. `pulse` reports the reach separately so the two delays
  are never confused.
- **Nothing here watches the watcher's watcher.** If your CI stops running,
  `pulse` stops running with it. The chain has to end somewhere, and it ends at
  the thing you already trust to tell you when it breaks.

## Related

- **[CI](ci.md)** — gating a build on tokens, dollars and quality.
- **[Usage logs](usage-logs.md)** — what can be read, and what each optional
  field unlocks.
- **[JSON output](json-output.md)** — the `pulse` document and every other
  machine-readable one, field by field.
- **[The doctrine](doctrine.md)** — why a measured crossing and never a
  projection, and the rest of the reasoning above.
