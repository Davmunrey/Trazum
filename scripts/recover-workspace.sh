#!/bin/sh
# Detects a rolled-back working tree and restores it to origin/main.
#
# Run it by hand, or let .claude/hooks/session-start.sh run it at the start of
# every Claude Code on the web session:
#
#     sh scripts/recover-workspace.sh
#
# ---------------------------------------------------------------------------
# What this is for, stated honestly
#
# The remote execution environment this repository is developed in restored its
# container disk to an old snapshot roughly twenty times in one working session
# — always to the same commit, mid-work, silently. Every tracked file reverts,
# `node_modules` desynchronises from the lockfile, and the first symptom is a
# build error about a module that "should" exist or a feature that vanished.
#
# **A script inside the repository cannot prevent that.** The restore happens a
# layer below anything committed here, and this file itself reverts along with
# everything else — the first draft of this script was destroyed by the exact
# failure it exists to repair, twenty minutes after it was written and one
# commit short of being safe. What survives a rollback is the remote — origin
# was pushed to before the snapshot was taken — so recovery is always the same
# three moves: fetch, reset to origin/main, reinstall. This script makes them
# one move, with the checks that keep it from destroying anything that is not
# rollback debris.
#
# The actual fix is on the platform side: recreate the environment so it stops
# restoring a stale snapshot. Until then, this turns a confusing half-hour into
# a ten-second command.
#
# ---------------------------------------------------------------------------
# What it refuses to touch
#
# The rollback signature is precise — HEAD strictly *behind* origin/main — and
# everything else is left alone:
#
#   - HEAD equal to origin/main:   nothing happened; say so and stop.
#   - HEAD ahead of origin/main:   that is work in progress, not damage.
#   - HEAD diverged from main:     somebody has to choose; a script must not.
#
# And even on the rollback path, uncommitted changes are stashed before the
# reset rather than discarded. A rollback usually leaves a clean tree, so a
# dirty one means somebody was mid-edit — their work goes into `git stash list`
# with a message naming this script, not into the void.
# ---------------------------------------------------------------------------

set -eu

cd "$(git rev-parse --show-toplevel)"

git fetch origin main

local_head=$(git rev-parse HEAD)
remote_head=$(git rev-parse origin/main)

if [ "$local_head" = "$remote_head" ]; then
  echo "recover-workspace: HEAD matches origin/main ($(git rev-parse --short HEAD)); nothing to recover."
  exit 0
fi

if git merge-base --is-ancestor "$remote_head" "$local_head"; then
  echo "recover-workspace: HEAD is ahead of origin/main — that is work in progress, not a rollback. Left alone."
  exit 0
fi

if ! git merge-base --is-ancestor "$local_head" "$remote_head"; then
  echo "recover-workspace: HEAD and origin/main have diverged. Choosing a side is not a script's call — resolve by hand." >&2
  exit 1
fi

# From here on: HEAD is strictly behind origin/main. The rollback signature.

if [ -n "$(git status --porcelain)" ]; then
  git stash push --include-untracked -m "recover-workspace: uncommitted work found at $(git rev-parse --short HEAD) before reset"
  echo "recover-workspace: uncommitted work stashed — recover it with 'git stash list' / 'git stash pop'."
fi

echo "recover-workspace: HEAD was $(git rev-parse --short "$local_head"), behind origin/main at $(git rev-parse --short "$remote_head"). Resetting."
git reset --hard origin/main

# The snapshot restores node_modules along with everything else, so after a
# reset the installed tree matches a lockfile that no longer exists. `npm ci`
# rather than `npm install`: the lockfile is authoritative and a drifted install
# is the exact state being repaired. Skipped when there is no lockfile, which is
# what the test fixtures are — bare git repositories with no package to install.
if [ -f package-lock.json ]; then
  npm ci --ignore-scripts
  npm run build
fi

echo "recover-workspace: restored to $(git rev-parse --short HEAD)."
