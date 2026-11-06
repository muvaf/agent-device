# Limrun Android shared reads

Final source: `99be56862fdadcbbfa38aebbf48b2dbac7964dcc`. PR: [#4268](https://github.com/callstack/agent-device/pull/4268). All current live results and validation below were collected from this exact commit on November 6, 2026.

## Validation

`pnpm test:coverage` passed the complete coverage suite and repository-wide thresholds. [Full output](coverage-full.log). `pnpm check:coverage-changed --base origin/main` passed at 100% changed-line coverage. [Changed-line report](changed-coverage.log).

`pnpm check:affected --run --head HEAD` passed with `exactCommit: true`, including 17,526 unit tests and provider integration. See the [receipt](receipt.json) and [gate output](gate-final.log). GitHub-owned device and compatibility checks skipped locally remain CI obligations. They are not claimed as passed.

## Live validation at the final commit

[live.json](live.json) records the final source SHA, a native Android app, and the SDK commands through the daemon and actual Limrun runtime. The snapshot used `android-helper` with version `0.21.37-dev`, matching package.json. `get text` returned the expected label with **zero `interaction_read_fallback` diagnostics**. Its debug trace contains 13 events, including `android_snapshot_helper_capture`, proving the live helper read ran. Both frame and memory samples were available. The HPROF download contained **33,515,185 bytes** and began with **JAVA PROFILE 1.0.3**. The app session, retained lease, daemon, and emulator were cleaned up.

The [harness](live.mjs) can be copied with [fixture](fixture) under `.tmp/limrun-review-evidence` in a checkout at the named SHA. Install and build agent-device first, then set `LIMRUN_API_KEY` and `ANDROID_HOME` and run `node .tmp/limrun-review-evidence/live.mjs`. It creates a temporary billable emulator and deletes it after validation. The harness differs from the executed copy only in host paths and credential loading. No credentials or heap contents are published.

## Review regressions and production routing

The updated `packages/provider-limrun/src/android-perf-runtime.test.ts` has two tests. Copying it into unchanged PR head `7ba110ad7`, after installing and building that isolated checkout, makes both fail: a lost lease reports the wrong error class, and cancellation during binding still starts work. [Previous-head output](review-regression-base.log). Both pass on the final head; the [focused run](review-focused.log) also passed 908 checks including eager-import budgets, shared text semantics, and the provider scenario.

`test/integration/provider-scenarios/limrun-android-performance.test.ts` allocates a Limrun lease, opens Settings, and dispatches `perf memory sample` through the real daemon and provider runtime. Only cloud SDK and ADB transport boundaries are substituted. It asserts parsed memory values and the session tunnel serial. No test manually binds performance operations on this path.

The binding tests also execute frame reads and HPROF snapshots with complete inputs, including `artifactsDir`, and check text reads after lease loss. The provider uses the shared element-text binder and capability facts for admission. Cancellation propagation into already-running native ADB performance commands remains a separate cross-platform change, as discussed in review.

[Independent review](review.md) found no outstanding issues. Earlier evidence remains in this branch's history; this final-commit run supersedes the earlier orphaned-commit live run. Native profiling remains outside this PR.
