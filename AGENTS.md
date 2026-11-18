# For an agent working in this repository

Trazum prices AI usage and shortens prompts without a model call. This file
is for a coding agent changing the repository. For an agent *using* Trazum,
the skill is [.claude/skills/trazum/SKILL.md](.claude/skills/trazum/SKILL.md).

It is short on purpose. The rules live in [CONTRIBUTING.md](CONTRIBUTING.md)
and in the tests that hold them, and this file points there. Read
CONTRIBUTING.md before the first change; it is the contract, and it explains
why each rule exists.

## Set up

```bash
npm install
npm run build
```

## Know when you are done

```bash
git add -A
npm run done
```

`npm run done` runs every check that can be run before a push, in order, and
says for each one `passed`, `FAILED` with the reason, or `not run` with what
is missing. It exits 0 only when everything that applies passed. `not run` is
not `passed`. [docs/done.md](docs/done.md) is the whole loop: what done means
here, the order to check it in, and what to do about each kind of failure.

Do not report a change as finished on anything less. If a criterion could not
be run on this machine, say which one and why.

## Review before the pull request

[.claude/skills/trazum-review/SKILL.md](.claude/skills/trazum-review/SKILL.md)
reviews a diff against this repository's own rules and reports findings with
file and line. It reviews and does nothing else.

## Three things that are not negotiable

Each is stated in full where the link goes.

- **A price is never derived, estimated or remembered.** It is read from the
  provider's page, with the page and the date:
  [CONTRIBUTING.md](CONTRIBUTING.md), "Changing prices".
- **A new guard is proven by planting the fault it catches** and watching it
  fail. The pull request says what was planted:
  [CONTRIBUTING.md](CONTRIBUTING.md), "Review".
- **A number in a document was measured**, and quoted output is output that
  was produced. If it was not measured, it is not written.

Everything under `.claude/skills/synced/` belongs to somebody else and is not
edited here. `wiki/` and `plugin/skills/` are generated: change the source and
run `node scripts/build-wiki.mjs` and `node scripts/build-plugin-skill.mjs`.
