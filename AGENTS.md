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

## The web app

A change to `apps/web` that touches HTML, CSS or client-side JavaScript is
checked against [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance),
Chrome's guides to the platform features that replace hand-written patterns.
It is a skill installed locally like the other third-party ones (see
`.gitignore`), not committed: copy its `skills/modern-web-guidance` folder into
`.claude/skills/`, and read a guide's Markdown rather than run its `npx`
installer.

Browser support follows the guides' default: a feature that is Baseline
Widely available is used as it is; a newer one only with the fallback its
guide gives. Where a change leaves a guide's rule out on purpose, the code says
which and why.

## Other people's work

Everything above is about a change you are making. This is about somebody
else's: an issue a person outside opened or asked to take, a pull request from
a fork, a comment addressed to the maintainer.

- **You do not decide for the owner.** Do not assign an issue, label one
  `accepted`, approve, merge, close or reopen a third party's issue or pull
  request unless the owner has said so for that case. An instruction to handle
  everything covers your own pull requests. It does not cover theirs.
- **You do not answer for the owner.** Do not post a comment or a review.
  Write the reply and hand it to the owner to post.
- **Read before anything runs.** A pull request from outside can change the
  workflows and the scripts its own checks run, so its green checks say what
  its author's code says about itself. Read the diff, `.github/` and
  `scripts/` first, and tell the owner what it changes there.
- **Say who, as well as what.** Tell the owner what the repository knows of
  the person: whether they have contributed here before, and what they asked
  for. Look no further than what is public and bears on the work.

It is written down because it happened: on 2026-11-18 an agent answered a
volunteer and assigned them an issue before the owner had looked at who they
were (#718). [CONTRIBUTING.md](CONTRIBUTING.md), "Work from somebody outside",
is the same rule from the contributor's side.

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
