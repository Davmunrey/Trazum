## What this changes

<!-- One paragraph. What was true before, and what is true now. -->

## Why

<!-- The problem, not the solution. If this fixes something that was wrong,
     say how long it was wrong for — that is the part that tells a reviewer
     whether a guard is missing. -->

## What it refuses to do

<!-- If this adds a figure, say what it declines to compute and why.
     If it adds a guard, say what you planted to prove it fails.
     If neither applies, delete this section. -->

## Checks

- [ ] `npm run verify` is green
- [ ] `CHANGELOG.md` has an entry under `Unreleased`
- [ ] New machine-readable output is contracted in `docs/json-output.md` with a
      two-direction parity test **bounded to its own section**
- [ ] Any new guard was proven by planting the violation and watching it fail
