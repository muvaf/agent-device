# Review update and physical-device comparison

Date: 2026-11-03.

The current review requested one wording change in #4195: qualify retained-runner cleanup as occurring during **graceful daemon shutdown**. The delta adds `graceful` in three places across CLI help and client API documentation. Runtime code and tests are unchanged from `db876b93d5d5d25ae8f060bb562dbe8f20a8be88`.

- #4195 head: `ea3dbea24f2f71f631226c0ced937f7ab37cb505`.
- Unchanged comparison base: `a2c169fa502a53f1f2a1da25b1cd16b9c731af39`.
- Pending native stack: `c3c281fb4c782fd19023f4bb3a43570d023a54c9`; still five commits. Only the same wording differs from the previous `cf9f2c72c48340a7dfefe72cd2aa53fe09600101` tree.
- #4194 now includes its exact-head Android commands and observed outputs directly in the PR description. Its source remains `4d65affa7cddbb7ad0a3340a4dc36c12b9c13aea`.
- #4196 and the Apple provider branch have no changes in this round.

## Checks

`pnpm check:affected --run --base a2c169fa502a53f1f2a1da25b1cd16b9c731af39 --head ea3dbea24f2f71f631226c0ced937f7ab37cb505` passed with `exactCommit: true`: 17,152 unit tests passed, one skipped, and 304 focused tests passed. [Receipt and logs](validation-records/lease/receipt.json).

[Independent lease review](lease-delta-review.md) found no issues. [Lease range diff](lease-range-diff.txt) and [native range diff](native-range-diff.txt) show the wording-only change. The earlier [45-call simulator lifecycle evidence](../lease/README.md) remains attributed to `db876b9`; it is not relabeled as a new live run.

The native stack's first gate attempt stopped before checks because switching branches left the old lockfile installed in node_modules. [Failed preparation receipt](validation-records/native-stale-dependencies/receipt.json), [diagnostic](native-check-stale-dependencies.log). `pnpm install --frozen-lockfile` repaired the checkout before the gate was rerun.

The rerun passed all selected checks at `c3c281fb4c782fd19023f4bb3a43570d023a54c9` with `exactCommit: true`, including 17,096 unit passes, provider integration, packaging and XCTest selection. [Native receipt and logs](validation-records/native/receipt.json). [Independent native delta review](native-delta-review.md) found no issues and confirmed the five layers are preserved.

## Physical iPhone

Device: connected iPhone 14 Pro, iOS 27.0.1 (24A446). Xcode 27.1 (27A9269). Developer mode enabled; device unlocked. Each run used its own daemon state and DerivedData; no active device claim existed before testing.

The unchanged base was installed and built in a disposable detached worktree. Runs were sequential, with no competing test process. The reviewed checkout stayed clean at its recorded SHA.

The checked-in replay assumes General is visible in Settings. On this phone it is below the viewport. Both source versions fail at step 3 with `REPLAY_DIVERGENCE`, `selector_not_found`, for the same General selector. The diagnostic capture uses `xctest` on both. **The stock physical replay lane did not pass.**

| Flow | Base `a2c169fa5` | Head `ea3dbea24` |
| --- | --- | --- |
| Checked-in physical replay | 0 passed, 1 failed; step 3; 8,771 ms | 0 passed, 1 failed; step 3; 9,485 ms |
| Temporary replay with scrolling and readiness waits | 1 passed, 0 failed; 15,570 ms | 1 passed, 0 failed; 16,753 ms |
| Capture backend in successful replay | `xctest: 6` | `xctest: 6` |
| Final cleanup | daemon stopped; zero claims | daemon stopped; zero claims |

The [temporary replay](physical-scroll-lifecycle.ad) adds a direct scroll before selecting General and readiness waits before selection and after back. It opens Settings, captures, scrolls, selects General, waits for About/Software Update, returns, and verifies General is present. It does not change the repository's test or establish that the unchanged stock lane passed.

Both runs first opened Settings, scrolled to the top, and closed that setup session. The test command was:

```sh
node bin/agent-device.mjs test test/integration/replays/ios/device \
  --platform ios --udid '<phone-udid>' \
  --state-dir '<isolated-state>' --session review3-stock --debug --json \
  --artifacts-dir '<artifacts>' --reporter 'junit:<report-path>'
```

The successful comparison uses the same command with `physical-scroll-lifecycle.ad` as the input, a `review3-scroll` session, and separate artifact paths. [Execution recipe](phone-compare.py) preserves setup and cleanup commands; the phone UDID and signing team are supplied through environment variables.

- Base: [commands, exits and summary](phone/base/summary.json), [stock result](phone/base/stock-result.json), [scroll result](phone/base/scroll-result.json).
- Head: [commands, exits and summary](phone/head/summary.json), [stock result](phone/head/stock-result.json), [scroll result](phone/head/scroll-result.json).

The result files are excerpts from CLI stdout. They retain counts, timing, typed failure, step, and backend diagnostics; Settings account labels, network names, screenshots, and the phone identifier are omitted. The first head-only attempt encountered the same stock failure and also cleaned up successfully; the table reports the subsequent sequential comparison.

All sessions opened by these tests were closed with their original state directory and device selection. Scoped daemons were stopped with `--clean`, and device status reported zero claims. The phone was not shut down. The disposable base checkout was removed.

This comparison establishes a pre-existing replay viewport assumption and a passing physical XCTest interaction flow on both versions. It does not replace the simulator lease tests or claim all physical handoff/fault scenarios were exercised. GitHub coverage, provider integration, and other skipped lanes retain their own authority. Vercel deployment still needs maintainer authorization.
