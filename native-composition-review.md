# Native stack rebase and composition review

Reviewed `/private/tmp/agent-device-review2-native` at `ede0d474b06bbb7be319aae43f5b5e1183ca14c7`, base `a2c169fa502a53f1f2a1da25b1cd16b9c731af39`, against old stack `47c528ae6`. Reviewed the supplied range diff and the changed lease/Android composition, following current AGENTS.md and review instructions. Source remained read-only. No tests, gates, live services, pushes, or GitHub mutations were performed.

No concrete regression findings.

- The supplied range diff proves the Apple refactor, recording change, and native-runner change are patch-equivalent. The full old-head/new-head diff confines behavioral changes to the accepted Android metadata preservation and the lease cleanup work, plus the new base's README asset. I found no dropped native-runner changes.
- The retained-host path reaches the real managed runner. `src/platform-runtime-resource-cleanup.ts:86` calls `stopIosRunnerSession`; `packages/apple-runner/src/runner-session.ts:702` fences startup and enters the same registry used by `createLaunchedAppleRunnerProvider`. It awaits `disposeRunnerSession`, whose launcher termination closes the Limrun run stream. Cleanup is not dependent on an already-retired daemon session or on the best-effort host-app close that follows it.
- Retained ownership is recorded only for the current session lifetime. Publishing an overlapping replacement removes the old association. Lease cleanup takes the normal session/device locks, checks object ownership again, and skips a live replacement before calling the shared stop. See `packages/daemon/src/core/session-store.ts:107,155` and `packages/daemon/src/server/request-execution-scope.ts:861`.
- If managed termination fails, the shared runner remains registered in its draining state and can be retried. Retained-host cleanup does not release its association on failure, and the expiry sweep retries pending work without starting a duplicate pass. Shutdown cancels queued lease cleanup and drains started work before runner finalization. The new tests cover these ownership/retry transitions and the close-versus-expiry queue.
- The Android composition retains provider metadata and falls back to materialized identity in both install entrypoints. It preserves path-artifact cleanup and prepared-artifact ownership. No cross-layer regression was found from that accepted update.

Affected stack risk: the lease commit changes shared daemon ownership for all retained Apple simulator leases, including local and Limrun sessions. Final validation must therefore retain the release/expiry, replacement-owner, failed-stop retry, and native shared-runner lanes at this rebased head. This code review is not a gate or live-device receipt. The existing stack-size policy issue is not waived by patch equivalence or by this review.

## Final lease-race delta

Reviewed final native head `4af1d6b2e3ea403ed6d81c09c5edc21d952979d1`, including the lease delta `23d223660..c7be97e9e` composed into this stack as `c45c13188`. The old/new stack range diff shows only the two request-execution-scope files changed; Android, Apple, recording, and native-runner patches remain equivalent.

No further concrete findings. The second live-session sweep at `packages/daemon/src/server/request-execution-scope.ts:890` observes the same-lease session that can publish at a new address while retained-host cleanup waits for the device lock. It reuses the original lock/lifetime checks at lines 838–859, so stale refs cannot tear down a replacement and a different lease remains excluded. The pending-entry condition at lines 903–906 now keeps cleanup scheduled while either retained ownership or a matching live session remains. Shutdown cancellation still prevents the second sweep from beginning teardown after close admission shuts.

The added regression uses the real execution-lock machinery and session-store publication to establish the reported ordering. Its mock teardown does not retire the session itself; the production lease-end path must do that for the final assertion to pass. This is an appropriate focused test for the race. No tests or gates were run by this reviewer; the reported 45-test receipt and final live run belong to the root agent. The prior shared-lease validation scope and stack-size caveat remain unchanged.

Final published stack `3a2e80721ce9cf88b3be0414d67839cb506d3220` differs from reviewed `4af1d6b2e` only by the CLI help test assertion. [Independent delta review](lease-final-delta-review.md) confirms no runtime change.
