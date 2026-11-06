Latest review follow-up: [378f995d1 checks, shared inventory refusal, and fresh live results](review3/README.md). Earlier evidence retains its original source SHA.

# Limrun instance lifecycle validation

Source: `e28ba51b85266098a2ccf40fbbb4db83e89d789b`. Base: `a68693c72`. All published live results below were collected from the final source commit on November 6, 2026.

## Automated checks

`pnpm check:affected --run --head HEAD` passed with `exactCommit: true`. See the [receipt](validation/receipt.json) and its command logs. The run includes formatting, lint, type checking, layering, Fallow, build/package checks, Node integration, 256 provider integration tests, 1,296 affected tests, and 17,541 passing unit tests (1 skipped). GitHub-authoritative coverage, native builds, and device lanes remain CI obligations; their local skips are listed in the receipt.

The same regression command, `pnpm exec vitest run src/cli/commands/connection-runtime-shutdown.test.ts`, gives four failures and two passes on unchanged base `a68693c72`, after copying only that test into an installed and built base checkout. See [base output](base-comparison.log). All six cases pass on the branch, including the final affected/unit run. The four failures reproduce allocation or heartbeat during shutdown without a live session.

Independent review covered the implementation and later fixes. No findings remain. The initial full gate found startup module growth from a static release-helper import; moving the import to the release operation fixed that check without changing its budget. The final receipt supersedes earlier failed attempts.

## Live checks

| Route | Result | Evidence |
| --- | --- | --- |
| Limrun Android and iOS CLI | Connect without allocation; refuse unallocated shutdown; boot creates; repeated boot reuses; shutdown deletes; next boot creates a new instance; native snapshot; refuse standalone shutdown of an active session; close with shutdown deletes | [CLI results](live/live-all.json) |
| Android retained owned lease | `close --shutdown` releases a retained lease and terminates its instance | [Results](live/retained-android-created.json) |
| iOS retained owned lease | Same retained-lease deletion behavior | [Results](live/retained-ios-created.json) |
| Android retained attachment | Close with shutdown detaches; reattach; standalone shutdown detaches; external instance stays ready after both operations | [Results](live/retained-android-attached.json) |
| iOS retained attachment | Same attach/detach behavior | [Results](live/retained-ios-attached.json) |
| Local iOS simulator | Boot, open Settings, native snapshot, close with shutdown; simctl confirms `Shutdown` | [Results](live/local-ios.json) |

Android snapshots report `androidSnapshot.backend: android-helper` and `helperVersion: 0.21.37-dev`, matching package.json. The iOS simulator runner was built from this checkout with Xcode 26.4, packaged with `scripts/package-ios-simulator-runner.sh`, and supplied through `AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP`. Both platforms use their Settings app. Local iOS used a temporary iPhone 17 Pro on iOS 26.4.

All sessions, daemons, cloud instances, and the temporary local simulator were cleaned up. `local-ios.json` records an expected `SESSION_NOT_FOUND` for its redundant finally-block close after the successful close. Expected refusal responses elsewhere are deliberate negative cases, not failed validation.

## Reproduction

The [harnesses](harnesses) use the built CLI and public SDK. Copy them under `.tmp/lifecycle-evidence` in the source checkout, install dependencies, and build first. Set `LIMRUN_API_KEY`, `ANDROID_HOME`, and `AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP` for cloud tests. Run `node .tmp/lifecycle-evidence/live.mjs` for the CLI matrix, and `node .tmp/lifecycle-evidence/retained.mjs <android|ios> <attached|created>` for each SDK case. These scripts create temporary billable instances and delete them in cleanup. The local harness uses Xcode 26.4 and an installed iOS 26.4 runtime; adjust its explicit paths for another host.

The harness copies only replace host paths and credential loading; assertions are unchanged. Credentials are excluded from this evidence. Source checkout and state-directory paths in result files are normalized for publication.
