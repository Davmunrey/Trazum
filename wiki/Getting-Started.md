> Generated from [`README.md`](https://github.com/Davmunrey/Trazum/blob/main/README.md) by `scripts/build-wiki.mjs`.
> Edit that file, not this page: an edit here is overwritten by the next build,
> and a wiki that has drifted from the repository is worse than no wiki.

## Getting started

**Node.js 20 or newer.** `npx` can download the package; local analysis requires
no API key. Choose the task that matches the data you already have:

```bash
npx @trazum/cli bill ./usage-export.jsonl
npx @trazum/cli optimize ./prompt.txt --cost
```

The first reads recorded usage. The second estimates changes to a prompt;
its projected savings are not a provider invoice. See the
[quick start](https://github.com/Davmunrey/Trazum/blob/main/docs/quick-start.md) for a reproducible example and next steps.

### The first five minutes: `trazum init`

Run `npx @trazum/cli init` in your project to inspect prompts and available
usage, write a config and identify a finding. Read
[what init writes and refuses to overwrite](https://github.com/Davmunrey/Trazum/blob/main/docs/setup.md#the-first-five-minutes-trazum-init).

### CLI

Install with `npm install -g @trazum/cli`, or keep using `npx`.
[CLI examples and configuration](https://github.com/Davmunrey/Trazum/blob/main/docs/setup.md#cli) cover token budgets,
reports, CI and pricing overrides. [Command reference](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md).

### The rest of the commands, in their own book

[Find a command by task](https://github.com/Davmunrey/Trazum/blob/main/docs/commands.md#find-a-command).
`trazum --help` lists commands; `trazum <command> --help` explains its flags.

### Web

[Open the Playground](https://trazum.vercel.app/?tab=playground) to try sample
files. For local development, run `npm install`, `npm run build`, then
`npm run dev:web`. [Web setup and API recipes](https://github.com/Davmunrey/Trazum/blob/main/docs/setup.md#web).

### Signing in (optional)

Accounts are disabled by default. Enabling them adds a saved prompt library
and share links backed by the deployment operator's database.
[Account setup and data handling](https://github.com/Davmunrey/Trazum/blob/main/docs/accounts.md).

### Deploying to Vercel

[Deployment instructions](https://github.com/Davmunrey/Trazum/blob/main/docs/setup.md#deploying-to-vercel),
[environment variables](https://github.com/Davmunrey/Trazum/blob/main/.env.example), and [N0 deployment](https://github.com/Davmunrey/Trazum/blob/main/docs/deploy-n0.md).

### Library

Install `@trazum/core` to use analysis in your application.
[Library examples](https://github.com/Davmunrey/Trazum/blob/main/docs/setup.md#library) and [package API](https://github.com/Davmunrey/Trazum/blob/main/packages/core/README.md).
