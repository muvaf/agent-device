# App-sync review follow-ups

PR: https://github.com/callstack/agent-device/pull/4225

Reviewed base: `12c2b679c3443ba8e7c6def74a47843bdb385cf3`.
Final source: `d2c9b9fc16e221ecd68e0bc7d3358a0a2c57a7dc`.

The changes strengthen the retained-license and queued-basis tests, correct two wording issues, and bound the Apple lookup test's real-I/O wait independently of its fake clock. The lookup is aborted during test cleanup. No installation/runtime logic changed, and the branch retains five commits.

## Focused verification

The three changed test files pass all 55 cases. The existing deployment-cancellation integration file passes all 13 cases unchanged. See [focused tests](focused.log) and [cancellation tests](cancellation.log).

## Isolated regression and mutation evidence

A disposable checkout at the reviewed base received its own frozen dependency install and build. Experiments used [the follow-up patch](follow-up.patch); the final [committed delta](final.patch) additionally aborts the owned lookup during test cleanup. Final focused and exact-commit validation cover that cleanup refinement. The experiment checkout was removed, and the implementation checkout remained unchanged during experiments.

| Experiment | Before stronger assertions | After stronger assertions |
| --- | --- | --- |
| Retained Apache license uses CRLF | 1 failed, 1 passed | 3 passed |
| Truncate xdelta notice to the previously asserted copyright line | 2 passed, missing terms undetected | 2 failed, 1 passed |
| Prune the current APK basis as if it were a removed resource | 5 passed, missing basis undetected | 1 failed, 4 passed |
| Withhold the lookup-start notification while its clock is frozen | Not rerun with the old unbounded wait | Both cases fail at the independent guard, without the global test timeout |

After restoring mutations, all 55 focused cases pass. The two missing-notification cases finish in 2.27 seconds combined. See [experiment commands and exits](experiments.json), [reproduction script](experiments.py), and the individual logs in this directory.

## Review dispositions

An independent read-only review found no remaining issues after the lookup cleanup refinement.

The reported premature-cleanup issue does not apply. `deployMaterializedApp` directly awaits its bound operation. On both iOS and Android, the inner sync await receives no caller-cancellation signal and reports cancellation only after sync settles. The outer `deployApp` path separately observes cancellation while the operation drain retains the inner owner. The 13 integration cases exercise retention and cleanup on both platforms.

The reported SDK-metadata deletion does not apply to pinned `@limrun/api` 0.69.1. Its `folder-sync.ts` writes basis copies at source-relative paths through `cachePut`, and `cacheGet` reads those paths. Android bootstrap also writes the APK basis at its source filename. Sync state is fetched from the instance; no separate persistent metadata file is written into this basis directory. No speculative metadata preservation rule was added.

Earlier live install/delta evidence remains attributed to its original source in [review4](../review4/README.md). This round changes tests and wording, so it makes no new live-device claim.

## Exact-commit validation

`pnpm check:affected --run --head HEAD` passed at `d2c9b9fc16e221ecd68e0bc7d3358a0a2c57a7dc` with `exactCommit: true` and no checkout changes. The related suite passed 1,305 tests. The full unit suite passed 17,400 tests with one skip, followed by 76 passing script tests and six skips. Provider integration, Node integration, package and compatibility checks passed.

See [the receipt](affected-receipt.json), [gate summary](affected.log), and [individual command logs](validation-logs). GitHub-owned checks listed as skipped remain CI obligations.
