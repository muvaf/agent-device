# Review follow-up validation

Final source: `378f995d1e8ed21854911293986ad718a1c27ec8`, rebased onto `df8391a63ef2dc2be72a1ecc5208e1a9572109e9`. [PR #4275](https://github.com/callstack/agent-device/pull/4275).

## Automated checks

`pnpm check:affected --run --head HEAD` passed with `exactCommit: true`: 17,579 unit tests, 356 affected tests, and 257 provider integration tests. See the [receipt](receipt.json), [gate output](gate.log), and [command logs](validation/). GitHub owns full coverage, native builds, and the device lanes listed as skipped in the receipt.

Before rebase, [71 focused tests](focused.log), [five provider-policy tests](policy.log), and [typecheck](typecheck.log) passed. After rebase, [61 close/lifecycle and metadata tests](rebased-focused.log), [five runner-lifecycle tests](runner-test-after.log), and [typecheck](rebased-typecheck.log) pass. The first final gate found one stale exact-object expectation for the new connection capability; [that failed run](first-gate-failure.log) is retained. Only that test expectation changed before the pre-rebase gate passed. The rebase review later found a pending-release test expecting the old missing-interactor error; [the reproduced failure](runner-test-before.log) is fixed in the final run.

The headless regression fails on `b32b21848` with the misleading AVD-selector refusal. See [base output](headless-base.log). The three request/inventory regressions also fail on that base: two requests select local devices instead of refusing, and one ignores authoritative lease metadata. See [base](inventory-base.log) and [head](inventory-head.log). Both base runs used installed, built, isolated checkouts with only test changes.

Independent review found an allocated-proxy session regression in the intermediate refactor. Its two-device fixture fails on `76ecb5f9d` with `AMBIGUOUS_MATCH` ([output](proxy-before.log)) and passes after restoring held-device reuse for allocated sessions. [Final review](review.md) reports no remaining findings.

## Live checks at the final source

| Case | Result |
| --- | --- |
| Owned Limrun Android and iOS instances | Connect; refuse unallocated shutdown; boot/create; reuse; shutdown/delete; recreate; open Settings; native snapshot; refuse standalone shutdown while held; close with shutdown; confirm deletion |
| Packaged SDK without a lease, Android and iOS | `open`, `boot`, headless boot, and `shutdown` each return `DEVICE_NOT_FOUND`, `provider_instance_unallocated`, and allocation guidance |
| Booted local iOS simulator during SDK refusals | Remains booted throughout; deleted by the harness afterward |

[Cloud results](live-all.json), [cloud log](live.log), [SDK/local results](unallocated.json), [SDK log](unallocated.log). All four cloud instances were confirmed terminated; all sessions and daemons were stopped, and the temporary local simulator was deleted.

The rebase includes upstream Apple runner changes. The iOS runner was [rebuilt](runner-build.log) and [packaged](runner-package.log) from the rebased sources before the live checks. [Range-diff](range-diff.txt) records the rebase. The earlier [attached/retained and local shutdown matrix](../review2/README.md) remains attributed to its original SHA.

## Reproduction

Put [live.mjs](live.mjs) and [unallocated.mjs](unallocated.mjs) under `.tmp/lifecycle-review-evidence/review3` in the agent-device source checkout. Install and build first, including the Android helper. Supply `LIMRUN_API_KEY`, `ANDROID_HOME`, and `AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP`; then run the scripts from the checkout root. The local check requires Xcode with the iOS 26.4 simulator runtime and iPhone 17 Pro device type. These published harnesses replace host-specific source paths and credential-file reads with the current directory and environment variables.
