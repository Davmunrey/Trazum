#!/bin/sh
# Make commits in this clone come out as the session's own human, not as the
# platform's bot — and make the DCO hook exist before the first commit needs it.
#
# ## The failure this closes, which happened twice in one day
#
# Claude Code on the web re-asserts `user.name Claude` / `noreply@anthropic.com`
# in *global* git config on every session start, deliberately, for its own
# commit signing. A fresh clone has no repo-local identity, so the first commit
# after any re-clone is authored "Claude" — which this repository's owner has
# ruled out — and carries no Signed-off-by, which CI then rejects. Both
# happened, were fixed by hand, and happened again the next time the container
# was rebuilt.
#
# Repo-local config outlives the platform's global re-assertions because git
# reads the most specific scope first. It dies with the clone, which is why
# this is a script the session hook runs rather than a step somebody remembers.
#
# ## Where the identity comes from, and why nothing here is written by hand
#
# The email is `CLAUDE_CODE_USER_EMAIL`, which the platform sets to the account
# that opened the session. That makes this correct for a fork too: a
# contributor's session asserts the contributor, not this repository's owner —
# deriving the identity from the commit history instead would have attributed
# their work to whoever committed here last.
#
# The name is looked up from what that email already calls itself in this
# repository: first as a commit author, then in a Signed-off-by trailer (squash
# merges keep the trailer and rewrite the author, so on a squash-only main the
# trailer is often the only place the name survives). A session whose email has
# never touched the repository falls back to the email's local part, which is
# honest: it is the only name the clone can prove.
#
# ## What it deliberately does not do
#
# Nothing, when `CLAUDE_CODE_USER_EMAIL` is unset. That is a session no human
# account opened, the bot identity is the true one, and inventing a person to
# attribute it to would be worse than the name it already has.
#
# Never fails the session: a broken lookup here must not wedge startup, and the
# Signed-off-by CI job still catches anything this failed to set.

set -u

say() { echo "assert-commit-identity: $1"; }

email="${CLAUDE_CODE_USER_EMAIL:-}"
if [ -z "$email" ]; then
  say "no session account; leaving the platform identity alone"
  exit 0
fi

# The hook, first, because it does not depend on the lookup below. The
# platform's core.hooksPath stubs chain into the repo-local hooks directory,
# so installing here works under either arrangement. Linked worktrees keep
# their hooks in the common dir, which is why this is not a literal `.git`.
hooks_dir="$(git rev-parse --git-common-dir 2>/dev/null)/hooks"
if [ -f scripts/prepare-commit-msg ] && [ -d "$hooks_dir" ]; then
  cp scripts/prepare-commit-msg "$hooks_dir/prepare-commit-msg" 2>/dev/null \
    && chmod +x "$hooks_dir/prepare-commit-msg" 2>/dev/null \
    && say "sign-off hook installed"
fi

name="$(git log --all --author="<$email>" --format='%an' -1 2>/dev/null || true)"
if [ -z "$name" ]; then
  # `valueonly` keeps the "Name <email>" pair; everything after the space
  # before '<' is the address, so strip from there.
  name="$(git log --format='%(trailers:key=Signed-off-by,valueonly,separator=%x0a)' -100 2>/dev/null \
    | grep -F "<$email>" | head -1 | sed 's/ *<.*//' || true)"
fi
if [ -z "$name" ]; then
  name="${email%%@*}"
  say "no commit or trailer carries $email here; using the address's own name"
fi

git config user.name "$name" 2>/dev/null || exit 0
git config user.email "$email" 2>/dev/null || exit 0
say "commits in this clone are $name <$email>"
exit 0
