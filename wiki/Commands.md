> Generated from [`README.md`](https://github.com/Davmunrey/Trazum/blob/main/README.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## The 47 commands

| Command | What it answers |
|---|---|
| [`trazum init`](https://github.com/Davmunrey/Trazum/blob/main/README.md#the-first-five-minutes-trazum-init) | What is in this repository, and what is the one thing worth fixing? *The first command to run.* |
| [`trazum optimize`](https://github.com/Davmunrey/Trazum/blob/main/README.md#cli) | What can come out of this prompt, and what is that worth a month? |
| [`trazum check`](https://github.com/Davmunrey/Trazum/blob/main/README.md#cli) | Does this prompt fit its token budget, and has the repository drifted past its recorded baseline? *Exits 1 when either fails — this is the CI gate.* |
| [`trazum baseline`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-ci-gate-a-budget-is-a-ceiling-a-baseline-is-a-gate) | What does this repository's prompts cost right now? *Records it, to commit.* |
| [`trazum diff`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#did-this-edit-make-it-worse) | What did this edit cost? |
| [`trazum rank`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#which-prompt-to-fix-first-trazum-rank) | Of these forty prompts, which is worth an afternoon? |
| [`trazum doctor`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-whole-workspace-at-once-trazum-doctor) | What is wrong across the whole workspace? |
| [`trazum prune`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#which-few-shot-examples-earn-their-tokens-trazum-prune) | Which few-shot examples earn their tokens? Measured, and it asks before spending. |
| [`trazum blame`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#who-made-this-prompt-expensive-trazum-blame) | Who made this prompt expensive, and when? |
| [`trazum eval`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#does-the-shorter-prompt-still-work) | Does the shorter prompt still do the job? |
| [`trazum where`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#prompts-where-they-actually-live) | Which prompts are hiding inside my source files? |
| [`trazum models`](https://github.com/Davmunrey/Trazum/blob/main/README.md#every-model-you-pay-for-by-the-token) | What does each model cost, and what is its cache minimum? |
| [`trazum profile`](https://github.com/Davmunrey/Trazum/blob/main/README.md#where-the-money-actually-went-trazum-profile) | Where did the money actually go? *Reads a usage log, not a prompt.* |
| [`trazum route`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#is-the-cheaper-model-good-enough-trazum-route) | Is the cheaper model good enough? *Measured, and it asks before spending.* |
| [`trazum plan`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-plan-trazum-plan) | Of everything the log shows, what do I do first, and what is each move worth? |
| [`trazum verify`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#did-it-work-trazum-verify) | Did the plan's savings actually arrive? *Three outcomes, never two.* |
| [`trazum history`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-long-run-trazum-history) | What have twenty reports been saying that no two of them could? *Shapes, never forecasts.* |
| [`trazum connect`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#your-bill-without-the-export-trazum-connect) | What did the provider actually bill me? *Read from their API, nothing exported by hand.* |
| [`trazum store`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#keeping-it-trazum-store) | What have I measured and kept? *Aggregates only — no prompt text, ever.* |
| [`trazum watch`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-afternoon-it-happened-trazum-watch) | Has anything crossed a budget? *Measured crossings only — never a forecast.* |
| [`trazum serve`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#before-the-call-is-sent-trazum-serve) | What will this call cost, and is there budget? *Answered in milliseconds, halves kept apart.* |
| [`trazum gateway`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#in-the-path-of-the-call-trazum-gateway) | Can it stop the call instead of advising against it? *Refuses; never substitutes.* |
| [`trazum ladder`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#is-the-ladder-saving-money-or-is-it-a-bill-trazum-ladder) | Is cheap-first-escalate-on-failure saving money, or costing it? *Break-even rate, stated.* |
| [`trazum experiment`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#two-arms-on-real-traffic-trazum-experiment) | Which of two arms is better on real traffic? *A winner only when there is one.* |
| [`trazum quality`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-gate-that-fails-a-build-for-quality-trazum-quality) | Did that prompt change quietly make the product worse? *Refuses to blame what it cannot attribute.* |
| [`trazum semantic`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-findings-a-dictionary-cannot-see-trazum-semantic) | Does this prompt say the same thing twice, or contradict itself? *The model proposes; the checker disposes.* |
| [`trazum owners`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#whose-money-trazum-owners) | Whose budget does this land on? *The unallocated is never spread.* |
| [`trazum commitment`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#should-you-sign-that-commitment-trazum-commitment) | What would that committed-use deal have been worth? *On measured months, both directions priced.* |
| [`trazum report`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-year-from-what-was-already-written-down-trazum-report) | What did the year actually look like? *No new data, and it lists its own blind spots.* |
| [`trazum schema`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#building-on-the-format-trazum-conform) | Which fields must a document of this format carry? *A JSON Schema, for validators that are not Trazum.* |
| [`trazum conform`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#building-on-the-format-trazum-conform) | Does the document my tool emits conform, and what will it not be able to answer? |
| [`trazum rollup`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#more-than-one-machine-trazum-rollup) | Four of us measured four things — what is the total, and what did merging lose? *A format and a merge, not a service.* |
| [`trazum pulse`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#did-anything-stop-running-trazum-pulse) | Did the things that are supposed to run, run? *Runs nothing itself — your CI is the thing that notices.* |
| [`trazum position`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#where-the-month-stands-trazum-position) | Where does the month stand against every ceiling? *Measured, denominators attached, no forecast anywhere.* |
| [`trazum receipt`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#a-figure-that-still-answers-elsewhere-trazum-receipt) | What did this cost, in a form that still answers when read somewhere else? *Counts, and the money split so it can be added up rather than believed. No prompt text, no answers, no paths: there is no field for them.* |
| [`trazum from-claude-code`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-agents-own-bill-trazum-from-claude-code) | What did my Claude Code sessions cost? *Reads the transcripts already on disk — the numbers only, never the words.* |
| [`trazum from-otel`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-universal-cost-lens-trazum-from-otel) | What did the LLM calls in my OpenTelemetry export cost? *Reads the GenAI spans any exporter already emits — the counts only, never the prompts.* |
| [`trazum from-litellm`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-gateway-everybody-already-runs-trazum-from-litellm) | What did the calls my LiteLLM proxy logged cost? *Reads the spend log the gateway already writes — the counts only, never the prompts, keys or addresses on the same row.* |
| [`trazum from-anthropic`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#what-the-provider-itself-says-trazum-from-anthropic) | What does the provider itself say my organisation used? *Reads the usage report your own admin key fetched; Trazum never holds the credential, and refuses to price a batch row at a standard rate.* |
| [`trazum from-helicone`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-proxy-that-kept-every-request-trazum-from-helicone) | What did the requests my Helicone proxy kept cost? *Prices the model that answered, not the one that was asked for, and counts the substitutions.* |
| [`trazum from-langsmith`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-tree-that-is-not-a-list-trazum-from-langsmith) | What did the model calls in my LangSmith traces cost? *Only the llm runs, because a trace is a tree and summing it bills the same tokens twice — and it refuses to price a call by the client class that made it.* |
| [`trazum switch`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#when-does-the-switch-pay-trazum-switch) | Should we move this traffic, and when does moving pay? *Measured delta, declared migration cost, break-even as division on the past — and the required evaluation itself priced.* |
| [`trazum ownrate`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#the-model-you-run-yourself-trazum-ownrate) | What does my self-hosted model cost per million tokens? *Your GPU rate over your measured throughput — derived from your declaration, never guessed.* |
| [`trazum bench`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#this-machine-measured-trazum-bench) | How fast is Trazum here, and on what? *One shot per workload, no judgement — run it before and after a change.* |
| [`trazum write`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#you-describe-it-it-asks-trazum-write) | What should this prompt say, and what will it cost before I ever send it? *Asks; nothing is generated.* |
| [`trazum rules`](https://github.com/Davmunrey/Trazum/blob/main/README.md#what-it-actually-does) | Which rules exist, and what does each one do? |
| [`trazum feedback`](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#telling-us-something-trazum-feedback) | Where do I report this, and what will you ask me for? *Sends nothing.* |
