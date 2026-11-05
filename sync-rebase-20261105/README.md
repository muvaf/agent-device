# Local app sync: rebase after the runner merge

PR: https://github.com/callstack/agent-device/pull/4225

The five sync commits were rebased from `442a6ce44414fcc88ee8a3d5c4bad6de7dfda324` onto upstream main at `e6ac165961def2f7b80336d2c04586a3ace32ce0`.
The previous head was `bafbb7556c3ba186274ba11ceafa6a5db8b26dc9`; the new head is `12c2b679c3443ba8e7c6def74a47843bdb385cf3`.

All five commits are patch-equivalent in [git range-diff](range-diff.txt). No conflict resolutions or new behavior changes were needed. The upstream diff now contains only the 38-file sync layer; the runner replacement is already on main.

An independent, read-only review inspected all six files changed by both new main and the sync commits. It found no rebase regressions. The updated shared cancellation signatures, runner snapshot bindings, and instance allocation defaults remain intact. Artifact draining and cache ownership remain unchanged.

The existing bounded-wait review finding in the Apple launch-confirmation test and optional cleanup suggestions are outside this rebase-only update. They are not claimed fixed.

Earlier live iOS and Android changed-binary, stopped-state, and delta-upload evidence remains attributed to the pre-rebase source in [review4](../review4/README.md). No new live-device run is claimed for this patch-equivalent rebase.

## Validation

`pnpm check:affected --run --head HEAD` passed at the rebased head with `exactCommit: true` and no checkout changes. The related suite passed all 1,305 tests. The full unit suite passed 17,399 tests with one skip, followed by 76 passing script tests and six skips. Provider integration, Node integration, package, compatibility and all other runnable checks passed.

See [the receipt](affected-receipt.json), [gate summary](affected.log), and [individual logs](validation-logs). GitHub-owned checks listed as skipped in the receipt remain CI obligations. This does not claim a new live-device run or a new `pnpm check` run.
