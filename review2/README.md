# Lifecycle review follow-up

Final source: `b32b218480b9b0950c07861f921d4e2aa6bf4987`. [PR #4275](https://github.com/callstack/agent-device/pull/4275). Live source: `139db478bf7a342366bc1598c5dc44d70921e0f9`; the only later change fixes TypeScript typing in a regression test. All production code is identical.

## Validation

`pnpm check:affected --run --head HEAD` passed with `exactCommit: true`: 17,549 unit tests, 355 affected tests, and 256 provider integration tests. See [receipt](receipt.json) and [gate](gate.log). GitHub owns full coverage, native builds, and device lanes listed as skipped in the receipt.

Nine regression assertions fail on unchanged `e28ba51b8` after copying the new tests into an installed and built isolated checkout. They cover unallocated-provider selection of local devices, scoped-session hints, cleanup-cause loss, Android runtime-hint admission, local session retirement, and unrelated provider lease clearing. [Base failures](base-regression.log), [44 focused tests](focused.log), [final typed regression](final-regression.log). The full gate passes at the final source above. [Independent review](review.md) found no issues.

## Live results

| Case | Evidence |
| --- | --- |
| Android and iOS owned instances: boot, reuse, delete, recreate, open, snapshot, active-session refusal, close with shutdown, deletion confirmation | [CLI results](live-all.json) |
| Retained owned Android lease, close with shutdown and confirmed deletion | [Android owned](retained-android-created.json) |
| Retained owned iOS lease, close with shutdown and confirmed deletion | [iOS owned](retained-ios-created.json) |
| Attached Android: close with shutdown, reattach, boot, standalone shutdown; external instance stays ready | [Android attached](retained-android-attached.json) |
| Attached iOS: same checks; external instance stays ready | [iOS attached](retained-ios-attached.json) |
| Local Android: close and standalone shutdown both succeed, adb confirms offline; unallocated CLI and SDK provider requests leave it booted | [Local Android](local-android.json) |
| Local iOS: close and standalone shutdown both succeed, simctl confirms Shutdown; unallocated CLI and SDK provider requests leave it booted | [Local iOS](local-ios.json) |

The default CLI connection already refuses an unallocated shutdown through tenant admission. The SDK non-tenant request exercises the new `provider_instance_unallocated` device-resolution guard. Both paths leave a booted local device untouched.

Native Android snapshots report `android-helper`, version `0.21.37-dev`. iOS uses the XCTest runner. No Swift code changed; the cloud runner artifact previously built from `e28ba51b8` has the same runner sources. Local platform lifecycle implementations now match main, preserving Android IME restoration before shutdown.

All sessions and daemons were stopped. The temporary simulator and Android AVD were deleted. Attached instances were deleted by the harness only after confirming that agent-device left them ready. A separate API check confirms [all eight instances are terminated](cleanup-check.log).

## Reproduction

The [CLI](live.mjs), [retained lease](retained.mjs), and [local device](local.mjs) harnesses differ from executed copies only in host paths and credential loading. Put them under `.tmp/lifecycle-review-evidence` in the source checkout. Install and build first, including `pnpm build:android`. Supply `LIMRUN_API_KEY`, `ANDROID_HOME`, and `AGENT_DEVICE_LIMRUN_IOS_RUNNER_APP` for cloud runs. Run `node .tmp/lifecycle-review-evidence/live.mjs`, then `node .tmp/lifecycle-review-evidence/retained.mjs <android|ios> <created|attached>`.

Local runs need Xcode with iOS 26.4, and a disposable Android AVD named `AgentDeviceLifecycleReview` under `.tmp/lifecycle-review-evidence/avd`, initially running on port 5568. Run `node .tmp/lifecycle-review-evidence/local.mjs <android|ios>`. The executed Android AVD used an arm64 Android 36.1 image. Never substitute a device or session used by someone else. Cloud harnesses allocate temporary billable instances and delete them in cleanup.
