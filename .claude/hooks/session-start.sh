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
#   2. Make sure dependencies are installed, so tests and typechecks work from
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

if [ ! -d node_modules ]; then
  npm install --ignore-scripts
fi
