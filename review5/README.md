# PR #4224: follow-up verification

This evidence addresses [the review of 442a6ce](https://github.com/callstack/agent-device/pull/4224#issuecomment-6657233731).
The tested implementation is `7e18ad0a6fcdb4b677df5b94602afddaaf8fedcb`.
The prior reviewed implementation is `442a6ce44414fcc88ee8a3d5c4bad6de7dfda324`.

## Retry and snapshot regression tests

The tests use the actual forwarded HTTP fixture and `createInteractor().snapshot()` or the shared `prepareRunner` entrypoint. They cover a canceled run whose slot remains occupied, short startup budgets, admission timeout, explicit cancellation, sparse capture responses with no nodes or a zero-sized root, and a caller-specific recovery hint.

The retry-deadline cases assert that the operation has settled before the admission timer fires. An admission-timeout case tests that fallback separately. Explicit cancellation must retain `request_canceled`.

The same test patch and command run against both implementations:

```sh
pnpm exec vitest run --project unit-core \
  src/core/interactors/limrun-ios-runner.test.ts \
  src/core/interactors/limrun-ios-runner-errors.test.ts \
  -t 'a canceled run that keeps its slot|sparse capture|product-specific'
```

At `442a6ce`, five cases fail and two pass. At `7e18ad0a6`, all seven pass. The failures detect missing retry deadlines, lost conflict errors, discarded zero-node capture quality, and overwritten caller hints. The existing zero-sized-root classification and caller-cancellation behavior remain passing controls.

The base checkout is disposable and has its own frozen dependency install and build. See [the test patch](regression-tests.patch), [base log](regression-base.log), and [head log](regression-head.log).

## Release runner packaging

Both builds use the build and packaging commands from `.github/workflows/release-ios-runner.yml`, without publishing a release. The Swift sources, build script and packaging script are unchanged between the prior reviewed implementation and the tested head.

```sh
AGENT_DEVICE_XCUITEST_PLATFORM=ios \
AGENT_DEVICE_XCUITEST_DESTINATION='generic/platform=iOS Simulator' \
AGENT_DEVICE_IOS_CLEAN_DERIVED=1 \
AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH=<isolated-derived-directory> \
sh scripts/build-xcuitest-apple.sh

AGENT_DEVICE_IOS_RUNNER_DERIVED_PATH=<same-derived-directory> \
sh scripts/package-ios-simulator-runner.sh <verification-version> review5 <asset-directory>
```

Xcode 26.4 (17E192), selected through `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, bundles `Testing.framework` and all four toolchain `_Testing_*.framework` overlays. Every packaged overlay binary matches its toolchain source byte for byte. The resulting archive's SHA-256 is `5e6f94b212231a1b6e1a71764b5e08479c27c846dc5aae6d2a5e0f541030b82d`.

Xcode 27.1 (27A9269) also builds and packages successfully. Its runner does not bundle `Testing.framework`, so the conditional overlay copy does not apply. `lib_TestingInterop.dylib` is included. This second archive was inspected, not live-tested.

See the [26.4 build](release26-build.log), [package log](release26-package.log), [framework inventory](release26-packaging.json), [overlay checksums](release26-overlay-checksums.json), [27.1 build](release-build.log), [27.1 inventory](release-packaging.json), and [archive checksums](release-archive-checksums.json).

## Live packaged-runner verification

The extracted Xcode 26.4 archive was supplied through `AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP`. The final built SDK ran against one attached Limrun simulator, `ios_euna_01m6nv2xv5evzv5tsxabp0f1qf`, using an isolated daemon state directory.

Three connections each returned 21 interactive snapshot nodes and `appstate` with `source: runner` and `state: runningForeground`. The third connection followed termination of our daemon after the second lease was closed and released. This does not claim recovery from killing an active XCTest owner. That separate scenario remains covered by the previous [review4 evidence](../review4/README.md).

The final requests contain three preparation events and three launch events: one preparation event per cold launch. The initial harness queried appstate before the runner was ready and received the documented `source: session`; the corrected harness takes a snapshot before asserting live runner state.

See [the harness](reuse.mjs), [live results](live-release-runner.log), [prepare/launch diagnostics](prepare-launch-diagnostics.json), and snapshot JSON files. The daemon was stopped with `--clean`, all leases were released, and the instance was deleted; see [cleanup](instance-lifecycle.log). No physical-phone run is claimed.

The prolonged-409 cases are HTTP-fixture evidence, not a claim that a production slot was observed held until the deadline. The underlying intermittent XCTest capture stall is also not claimed fixed.

## Exact-commit gate

`pnpm check:affected --run --head HEAD` passed at `7e18ad0a6fcdb4b677df5b94602afddaaf8fedcb` with `exactCommit: true` and no checkout changes. The unit lane reports 1,923 test files, 17,297 passing tests and one skipped test, followed by 76 passing script tests and six skips. Build, package, related tests, provider integration, Node integration, compatibility, XCTest selection and packaging checks also passed.

See [the receipt](affected-receipt.json), [gate summary](affected.log), and [individual command logs](validation-logs). Checks explicitly assigned to GitHub in the receipt, including device and full coverage lanes, remain CI obligations. This is an affected-gate result, not a new `pnpm check` claim.

## Review and scope

[Independent review](independent-review.md) found no remaining production issues. Generic waiter extraction is deferred because the existing owners have different retry-retention and cleanup rules. PR #4225 is unchanged in this review round.
