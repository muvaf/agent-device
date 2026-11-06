# Limrun Android shared reads

Final source: `7ba110ad70704bc88616498beb32e81d7b809d47`.
Base: `0a3b01890`.

`pnpm check:affected --run --head HEAD` passed with `exactCommit: true`. See [receipt](receipt.json), [gate output](gate-final3.log), and [unit summary](unit-summary.txt). All runnable checks passed, including 17,524 unit tests, provider integration, replay compatibility, wire compatibility, and capability documentation. Skipped checks remain owned by CI or manual lanes; they are not claimed as passed.

## Live verification

[live.json](live.json) records the built runtime at `be921a195914e10bca4f78440cc0406b1d91a0db`. The final commit differs only in the capability annotation and generated capability documentation. A Limrun Android 15 emulator ran a debuggable native app. The snapshot used `android-helper` with matching version `0.21.37-dev`. `get text` returned the expected app label, with zero `interaction_read_fallback` diagnostics. Frame and process-memory samples were available. The heap download contained 33,521,897 bytes and the `JAVA PROFILE 1.0.3` header. The session, retained lease, daemon, and test instance were cleaned up.

The [verification script](live.mjs) uses private instance credentials from an untracked JSON file; that file and the heap are intentionally absent. Commands use the built Node client through the daemon and provider, not direct ADB sampling.

## Regression checks

In an isolated worktree, copy the new `packages/provider-limrun/src/android-perf-runtime.test.ts` to the unchanged base, then run:

```sh
pnpm exec vitest run --project unit-core packages/provider-limrun/src/android-perf-runtime.test.ts
```

[Base](regression-base.log): one failure because the owner refuses the live text operation. [Head](regression-head.log): one pass.

For the ADB-routing test, run:

```sh
pnpm exec vitest run --project unit-core src/sdk/limrun-android-performance.test.ts
```

The [unmodified head](routing-unmutated.log) passes. Removing the provider scope with [this mutation](routing-mutation.patch) makes the [same test fail](routing-mutated.log): sampling becomes unavailable instead of returning the expected remote metric. The isolated worktree was removed; the reviewed source stayed clean.

## Review and deferred work

[Independent review](review.md) found no actionable issues. Native profiling remains disabled. The [live profiling probes](native-followup.json) failed on the tested image: Simpleperf rejected its event and Perfetto startup timed out. Neither success nor full native profiling parity is claimed.
