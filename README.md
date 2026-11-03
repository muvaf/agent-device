# Agent-device Limrun PR review evidence

Verification performed on 2026-11-03 after rebasing onto `a2c169fa502a53f1f2a1da25b1cd16b9c731af39`. This branch contains review evidence only. It is separate from the PR code branches.

| PR or branch | Tested head | Live report |
| --- | --- | --- |
| [#4194 Android installer](https://github.com/callstack/agent-device/pull/4194) | `4d65affa7cddbb7ad0a3340a4dc36c12b9c13aea` | [Install, reinstall and materialized ZIP install](android/README.md) |
| [#4195 Retained leases](https://github.com/callstack/agent-device/pull/4195) | `94a4db632d927807c6588823e6a42bafdcdf6a05` | [Native XCTest reuse, release, expiry and shutdown](lease/README.md) |
| [#4196 Recording sessions](https://github.com/callstack/agent-device/pull/4196) | `ad71d0391615ee336f0157941f473e204cfd0be8` | [Android and iOS recording isolation and download retry](recording/report.md) |

## Regression detection

- Android metadata/identity: the [same tests](android-regression-tests.patch) fail in both path and prepared installs before the fix, then pass afterward. [Before log](android-regression-before.log), [after log](android-regression-after.log), [comparison metadata](android-regression.json). The final exact-commit receipt includes all 17 focused cases and 17,144 unit passes.
- Lease cleanup: [comparison metadata](lease-regression.json) records the old-source failure and fixed-source pass through real close and lease-release handlers. The additional mutation removes only the second live-session sweep and makes the same-lease reopen regression fail. Restoring it passes. Logs and patch hashes are included.
- Recording isolation: [prior regression comparison](prior-regression-proofs.json) remains attributed to its original base/head. The recording patch is unchanged after rebase, as shown in [range diff](recording-range-diff.txt). Current-head live evidence verifies independent recording IDs and one-stop download retry on both platforms.

## Validation and review

| Branch | Result | Evidence |
| --- | --- | --- |
| android | Passed, `exactCommit: true` | [Receipt](validation-records/android/receipt.json), [logs](validation-records/android) |
| lease | Passed, `exactCommit: true` | [Receipt](validation-records/lease/receipt.json), [logs](validation-records/lease) |
| recording | Passed, `exactCommit: true` | [Receipt](validation-records/recording/receipt.json), [logs](validation-records/recording) |
| Apple provider branch | Current-head checks running | Result will be added here. |
| Native runner branch | Current-head checks queued | Result will be added here. |

An earlier lease run at `c7be97e9e` failed one stale help-text assertion; 17,151 other unit tests passed. The final change updates that assertion without changing runtime code. [Failed receipt](validation-records/lease-stale-help-failure/receipt.json) and [focused correction](lease-help-test.log) are preserved.

Each receipt records the exact commit, clean checkout, selected checks, command output and skips. GitHub remains responsible for its device lanes, coverage and provider checks skipped by local selection. Copied logs sit beside each receipt; original absolute log paths in receipts identify the execution worktree.

[Composition review](native-composition-review.md) covers the final rebased native stack and lease-race delta. [Lease ownership review](lease-ownership-review.md), [focused test log](lease-focused-final.log), [Android range diff](android-range-diff.txt), [lease range diff](lease-range-diff.txt), [Apple range diff](apple-range-diff.txt), [native range diff](native-range-diff.txt).

## Cleanup and scope

The live scripts used dedicated emulator/simulator instances and scoped daemon state. They closed their sessions, stopped their daemons and deleted their owned devices. Both remote recording instances were confirmed terminated through the public Limrun API. Transcripts include cleanup results. No connected phone or existing user AVD was used.

The Android run covers the native local installer. A future production installer callback needs live verification when its binding is introduced. The branch-only Apple and native layers are queued behind the independent PRs and are not claimed merge-ready here.
