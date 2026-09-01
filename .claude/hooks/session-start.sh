#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Two jobs, in order:
#
#   1. If the container restored an old disk snapshot — which this repository's
#      environment has done repeatedly, always reverting to the same stale
#      commit — put the working tree back on origin/main before the agent reads
#      a single file. scripts/recover-workspace.sh holds the logic and the
#      safety checks; this hook only invokes it.
#
#   2. Assert whose commits these are. The platform re-asserts its own bot
#      identity in global git config on every session start, so a fresh clone
#      commits as "Claude" with no Signed-off-by until something says
#      otherwise. The identity script derives the human from the session's
#      own account and this repository's history, repo-locally, which is the
#      one scope the platform's re-assertion does not touch.
#
#   3. Make sure dependencies are installed, so tests and typechecks work from
#      the first command. `npm install` rather than `npm ci` on the healthy
#      path: the container state is cached after the hook completes, and an
#      install that can reuse it is what makes the next session start fast.
#      (After a rollback, recover-workspace.sh already ran `npm ci` — the
#      lockfile is authoritative when the tree was just reset.)
#
# Web sessions only. On a local machine the working tree is the developer's
# own, resets are not this hook's call, and they did not ask for an install.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

sh scripts/recover-workspace.sh

sh scripts/assert-commit-identity.sh

if [ ! -d node_modules ]; then
  npm install --ignore-scripts
fi
