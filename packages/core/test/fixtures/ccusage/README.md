# ccusage's own output, from synthetic sessions

Every `.json` file here is what ccusage 20.0.51 printed, unedited. The
sessions it read are the two files under `sessions/projects/`, written for
this test: eleven assistant turns with token counts and no real prompt,
answer, person or project. Nothing here came from anybody's own
`~/.claude`.

`packages/core/test/ccusage.test.js` and `packages/cli/test/from-ccusage.test.js`
read these files. The converter they test is `packages/core/src/ccusage.ts`.

## The version

| | |
| --- | --- |
| npm package | `ccusage@20.0.51`, published 2026-11-14, integrity `sha512-2Q40S//OvJ02/ouCZy25QagJ6LZ56ApHZSh11pGUIZifGCP9HLS3rqZPm0/AkcL3z3/t3gU5w6AT+5Ke7gl5Cw==` |
| the binary it runs on macOS arm64 | `@ccusage/ccusage-darwin-arm64@20.0.51`, integrity `sha512-Z8dPlNxgZy8QhYZuMZT81Pf861RmuBAGuhLeoZqXL1vlle67Zp21fpHvvP3pnYXHqdmyEKBE57peqzIGjnN9nA==`; `bin/ccusage` sha256 `81a9af33657b5bf6247975ae8e5969ac71367c5a579fd4edeb946dc03ac0aa02` |
| source read for the shapes | <https://github.com/ccusage/ccusage/tree/v20.0.51>, commit `225896dbc139164ef6580144fbafea77fd6cd9d6` |

Since version 18 the npm package is a wrapper (`src/cli.js`) that runs a
native binary from an optional dependency. Both were fetched with `npm pack`
into a temporary directory and run from there; nothing was installed.

## The commands

In a temporary directory holding the two packed tarballs:

```sh
npm pack ccusage@20.0.51 @ccusage/ccusage-darwin-arm64@20.0.51
tar -xzf ccusage-ccusage-darwin-arm64-20.0.51.tgz
```

Each report was then written with the network denied and the real home's
agent folders unreadable (macOS `sandbox-exec`), an empty home in a temporary
directory, and `CLAUDE_CONFIG_DIR` pointing at `sessions/` in this folder.
`--offline` makes ccusage price from the tables compiled into the binary
rather than fetch LiteLLM's file:

```sh
PROFILE='(version 1)(allow default)(deny network*)(deny file-read*
  (subpath "'"$HOME"'/.claude") (subpath "'"$HOME"'/.codex") (subpath "'"$HOME"'/.gemini")
  (subpath "'"$HOME"'/.config") (subpath "'"$HOME"'/.local") (subpath "'"$HOME"'/.cache"))'
run() {
  sandbox-exec -p "$PROFILE" \
    env -i HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/xdg-config" XDG_CACHE_HOME="$TMP/xdg-cache" \
      CLAUDE_CONFIG_DIR="$FIXTURE/sessions" TZ=UTC NO_COLOR=1 PATH=/usr/bin:/bin \
      ./package/bin/ccusage "$@"
}
run claude daily --json --offline --timezone UTC             > claude-daily.json
run claude daily --instances --json --offline --timezone UTC > claude-daily-instances.json
run claude daily --no-cost --json --offline --timezone UTC   > claude-daily-no-cost.json
run claude weekly --json --offline --timezone UTC            > claude-weekly.json
run claude monthly --json --offline --timezone UTC           > claude-monthly.json
run claude session --json --offline --timezone UTC           > claude-session.json
run daily --json --offline --timezone UTC                    > daily.json
run weekly --json --offline --timezone UTC                   > weekly.json
run monthly --json --offline --timezone UTC                  > monthly.json
run session --json --offline --timezone UTC                  > session.json
run daily --sections daily,monthly,session --json --offline --timezone UTC > daily-sections.json
```

Every command exited 0. Run twice, the second time against the copy of the
sessions in this folder, each run wrote the same bytes.

The two weekly reports were written later, on 2026-11-22, by the same binary
(the same sha256) run the same way against the copy of the sessions in this
folder. In that run `claude daily` wrote the same bytes as `claude-daily.json`
here, and each weekly report, written twice, wrote the same bytes both times.
The report focused on Claude Code starts its weeks on Sunday (`"week":
"2026-10-25"`), and the report across every agent on Monday (`"period":
"2026-10-26"`).

`claude …` is the report focused on Claude Code, which is all ccusage wrote
before version 18. The others are the report across every agent ccusage
finds, the default since then; with an empty home, Claude Code is the only
one it finds.

## The sessions

Two projects, as Claude Code names its folders after the working directory.
All times UTC.

| When | Project folder | Model | Speed | Input | Output | 5-minute writes | 1-hour writes | Cache reads |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2026-10-31 09:00 | `-home-dana-acme-payroll` | claude-opus-5-5 | standard | 1,200 | 800 | 20,000 | 0 | 0 |
| 2026-10-31 09:05 | `-home-dana-acme-payroll` | claude-opus-5-5 | standard | 300 | 1,500 | 0 | 0 | 20,000 |
| 2026-11-02 10:00 | `-home-dana-acme-payroll` | claude-opus-5-5 | fast | 2,000 | 1,000 | 0 | 10,000 | 0 |
| 2026-11-02 10:10 | `-home-dana-acme-payroll` | claude-opus-5-5 | standard | 500 | 2,000 | 0 | 0 | 10,000 |
| 2026-11-02 14:00 | `-home-dana-side-project` | claude-sonnet-5-5 | | 4,000 | 600 | 8,000 | 0 | 0 |
| 2026-11-03 08:00 | `-home-dana-side-project` | claude-haiku-5-5 | | 40,000 | 500 | 0 | 0 | 0 |
| 2026-11-03 08:01 | `-home-dana-side-project` | claude-haiku-5-5 | | 40,000 | 500 | 0 | 0 | 0 |
| 2026-11-03 08:02 | `-home-dana-side-project` | claude-haiku-5-5 | | 40,000 | 500 | 0 | 0 | 0 |
| 2026-11-03 09:00 | `-home-dana-side-project` | claude-haiku-4-5-20251001 | | 3,000 | 200 | 0 | 0 | 0 |
| 2026-11-03 10:00 | `-home-dana-side-project` | claude-sonnet-4-20250514 | | 250,000 | 1,000 | 0 | 0 | 0 |
| 2026-11-03 11:00 | `-home-dana-side-project` | claude-3-7-sonnet-20250219 | | 1,000 | 100 | 0 | 0 | 0 |

Each turn is there for something the converter has to get right:

- the fast turn, which ccusage names `claude-opus-5-5-fast`;
- the 1-hour cache write, which only `cacheCreation1hTokens` tells apart;
- three Claude Haiku 5.5 turns of 40,000 input tokens each: each is under the
  100,000-token line its price changes at, and their day's total is over it,
  which a row that sums them cannot say;
- a Claude Sonnet 4 turn of 250,000 input tokens, whose tokens past 200,000
  ccusage prices at a long-context rate; the catalogue's row for that model
  says the pricing page publishes one rate and no long-context band;
- a Claude Sonnet 3.7 turn, a model ccusage prices and the catalogue does not;
- two project folders that are paths, which must not reach the output.
