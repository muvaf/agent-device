# Review fixes and live verification

These checks address [#4224](https://github.com/callstack/agent-device/pull/4224#issuecomment-6643077518) and [#4225](https://github.com/callstack/agent-device/pull/4225#issuecomment-6643019036), on 2026-11-05.

## Native runner (#4224)

The PR has two commits: `94a8d8cd9` exposes shared runner preparation, cancellation and packaging helpers; `442a6ce44414fcc88ee8a3d5c4bad6de7dfda324` switches Limrun to the runner and removes the AX implementation. The prerequisite commit builds and typechecks independently ([build](prerequisites-final-build.log), [typecheck](prerequisites-final-typecheck.log)).

At `442a6ce44`, `pnpm check:affected --run --head HEAD` passed with `exactCommit: true` ([receipt](native-affected/receipt.json)), and `pnpm check` passed with `exactCommit: true` ([receipt](native-full/receipt.json)). The receipts identify GitHub-owned and parked checks as skipped, not passed. No fresh physical-iPhone run is claimed; native Swift is unchanged from the previously verified packaged runner.

### Reused attached simulator

All reuse runs use the same instance, `ios_euna_01m6ng61geftcr26p1gj42axft`. No fresh simulator substitutes for a failed reuse run. [The script](reuse.mjs) allocates an attached lease, opens the fixture and runs an interactive snapshot, closes/releases, repeats, kills its own daemon with an active runner, then connects a third time. Each run stops its remaining daemon cleanly.

| Source | First and second connections | Connection after daemon kill |
| --- | --- | --- |
| Base `0ae3dc2a` | Both snapshots fail after XCTest's 8-second capture time slice; generic `invalid-viewport` wrapper | HTTP 409 with no specific reason |
| Final `442a6ce44` | Both snapshots return 21 nodes | `limrun_xctest_slot_occupied`, with instructions to stop the owning agent-device/Appium run, wait for its stream, or recreate a persistently occupied instance |

See [base output](reuse-base-debug.log), [final output](reuse-final-debug.log), and their [base diagnostic files](base-debug-state/sessions) and [final diagnostic files](final-debug-state/sessions). They retain `limrun.runner.prepare`, `limrun.runner.launch`, request diagnostics, and `runner.log` streams. Limrun's XCTest stream contains test events and keepalives; it is not a full process stdout stream. Logs were copied without session credentials.

A separate run at `7c54bf982` reproduced the capture stall and verified `limrun_runner_snapshot_unavailable`, retaining snapshot-quality details and a close/reopen/recreate hint ([output](reuse-final.log), [diagnostics](final-state/sessions)). The same capture classifier is present in the final head. This change does **not** claim to repair the underlying intermittent XCTest stall or forcibly stop another client's test run. It implements the maintainer's requested typed-failure alternative and preserves runner ownership.

The review fixes also cover reconnect log history, upload and shutdown cleanup, independent metadata reads, preparation cancellation, typed download errors, and test assertions. The obsolete `limrun-ios-tree` producer is removed. All cancellation waits use one kernel owner without adding eager work to host-kit.

## App sync (#4225)

The final sync source is `bafbb7556c3ba186274ba11ceafa6a5db8b26dc9`. Runtime code in live-tested `62536e91c5b478b8a90f16ad531ec1759f583e27` is unchanged in subsequent commits; those declare the test helper dependency/project reference, remove the deleted vendor zone classification, and clean up test fixtures.

[The live script](delta-live.mjs) uses the built `dist` client, installs build one, installs a different rebuilt binary at the same local path, and reinstalls build one. Both apps were compiled remotely from source with a different visible title ([iOS build](ios-fixture-build.log), [Android build](android-fixture-build.log)). The Android fixture includes a stored resource so the APK exceeds the SDK's 64 KB delta threshold. It verifies stopped state after each install and launch afterwards. iOS checks the changed UI; Android compares the installed APK's SHA-256 with the source binary.

| Platform | Binary size | Changed install | Changed reinstall |
| --- | ---: | ---: | ---: |
| iOS | 119,664 bytes | 5,698-byte executable delta | 5,665-byte executable delta |
| Android | 143,816 bytes | 1,632-byte APK delta | 1,629-byte APK delta |

[Final iOS log](delta-ios-final.log) and [final Android log](delta-android-final.log) pass all steps. A test-only fetch observer records actual upload metadata ([observer](observe-sync.mjs), [wire records](sync-wire.jsonl)); it buffers and forwards unchanged request bytes and records no authentication headers. The delta rows prove this exercised the encoder, not an unchanged-file upload.

Running changed-binary installs from base `a95049b9a` reproduces the throwing `@limrun/xdelta3-wasm` stub on **both** platforms ([iOS base](delta-ios-base.log), [Android base](delta-android-base.log)). The final bundle includes the real encoder. Its generated third-party notice retains the pinned source copyright and full Apache-2.0 license; the license test also rejects a version mismatch.

A live session now owns one serialized basis cache, prunes removed files and disposes the cache after accepted SDK work settles. Canceled queued installs never start. In-flight SDK work retains its source files until completion; adding early abort at the inner materialized-install boundary would race source cleanup. Provider errors preserve typed failures or wrap plain SDK errors with `limrun_app_sync_failed`.

The full affected gate passed at `8f01e5cd710454ee4dc71aa547a33194840cdbb4` ([receipt](sync-affected/receipt.json)). The next commit changes two integration mocks to use the public SDK interface; its affected gate passed at `a6a2a7c51` ([receipt](sync-fixtures/receipt.json)). The final commit removes a polling race from an Apple deadline test. `pnpm check:affected --run --base 8f01e5cd710454ee4dc71aa547a33194840cdbb4 --head HEAD` passed at `bafbb7556` ([receipt](sync-ci/receipt.json)). All three receipts have `exactCommit: true`. GitHub-owned checks remain CI obligations.

### CI mutation follow-up

After the first push, all five kernel-errors shards failed their initial test run at merge commit `5465c4b80ea6`, whose PR parent is `a6a2a7c51` ([CI log](sync-ci-mutation-failure.log)). The unchanged Apple launch-confirmation test expected two commands after 1,000 event-loop turns, but saw zero while lazy modules were loading. Commit `bafbb7556` replaces that polling bound with an explicit second-command barrier. It retains the exact command count, deadline assertions, and failure when lookup completes prematurely; no timeout or test selection was loosened.

The same `pnpm gate mutation --modules kernel-errors --shard 1/5` command passes locally both [before](mutation-before.log) at `a6a2a7c51` and [after](mutation-after.log) at `02ebf41eb`, with 72 killed, 4 surviving, and zero errored mutants in each run. The final `bafbb7556` changes only the Promise constructor in that fixture to satisfy the repository's older TypeScript target ([exact delta](mutation-final-fixture.diff)); its affected gate includes the full unit suite. The Linux CI failure was not reproduced on this Mac. The patched local run proves the full selected shard still completes; the new GitHub run remains authoritative for the CI failure. Independent read-only review found no issue in the barrier change.

## Review and cleanup

[All 49 inline review dispositions](review-dispositions.md) record the fix or the reason for rejecting the suggestion.

An independent read-only reviewer inspected the final native and sync runtime deltas and found no remaining concrete regressions. The review prompted the shared-preparation arrival race and queued-sync cancellation fixes, both covered by regression tests. It accepted the smaller design: one shared cancellation owner, one lease-owned cache, and shared Apple execution rather than a second remote runner stack. Its final follow-up requested removal of obsolete vendor comments and private SDK fixture hooks; both are removed.

The Revyl screenshot blocked-write test and physical-iPhone replay adjustment are explicitly included in the native PR scope. Earlier broad live feature evidence remains [here](../remaining/README.md), attributed to its original commits.

The test-owned Xcode and Gradle builders were deleted after compilation. The [final cleanup record](cleanup.json) confirms simulator/emulator deletion and local daemon cleanup. The run does not use or terminate a user's connected phone.
