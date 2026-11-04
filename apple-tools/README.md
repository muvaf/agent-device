# Shared Apple tools validation

Source: `a8758b33fb5f605d1b12c4e287ea69aa5bcab901`. Base: `8c416a75980d888985886d9d6eada2f9a51d3ea8`. Date: 2026-11-04.

This branch extracts common Apple simulator files, app metadata, lifecycle sequencing, and runner operations. It does not switch the Limrun provider to XCTest yet. The next layer is on [`codex/limrun-native-runner`](https://github.com/muvaf/agent-device/tree/codex/limrun-native-runner); sync-based installs follow on [`codex/limrun-sync-install`](https://github.com/muvaf/agent-device/tree/codex/limrun-sync-install). Those branches still contain their earlier prerequisites and will be rebased as the common layers merge.

## Automated validation

`pnpm check:affected --run --base 8c416a75980d888985886d9d6eada2f9a51d3ea8 --head a8758b33fb5f605d1b12c4e287ea69aa5bcab901` passed with `exactCommit: true`: 17,230 unit tests passed, one skipped, and 305 related tests passed. The [receipt and command logs](review-update/validation/receipt.json) identify every executed and skipped check. GitHub coverage and CI device lanes retain their own authority.

The earlier full `pnpm check` at `b663be74c` passed 17,226 unit tests with one skip, plus tooling, package, dependency, XCTest selection, and smoke checks. [Original receipt](validation/receipt.json). The separate provider suite at that earlier head passed all 245 tests across 68 files. [Output](validation/provider-integration.log). These earlier runs are not relabeled as final-head runs.

The [review-update report](review-update/README.md) covers scoped simulator caches, serial metadata reads, hosted installer defaults, and removal of the unused URL-owner override. Regression checks failed on the prior head and passed with the fixes. A deliberate installer-bypass mutation is also detected. Independent follow-up review found no issues at the final head. The earlier [deadline regression](regression/README.md) and [first review](review/review.md) remain available.

## Local iOS simulator

[Reproducible script](review-update/simulator/verify.mjs), [commands and observations](review-update/simulator/transcript.json), and [image decode output](review-update/simulator/image-decode.json).

The script ran against a newly created iPhone 17 Pro simulator on iOS 26.4, build 23E244, with Xcode 27.1, build 27A9269. `prepare ios-runner` built and started the current runner in a dedicated DerivedData directory. The CLI and direct platform probes both used the current built JavaScript, with separate runner ownership after stopping the CLI daemon.

The CLI passed app listing, Settings open/relaunch, snapshot, a masked screenshot, close, and local install/reinstall of the built runner host app. The direct platform probe found 37 installed apps, read Safari metadata, resolved Safari as the owner of `https:`, and captured a 73-node XCTest snapshot. With a scoped tool provider forcing runner screenshots, the shared screenshot implementation copied a valid 402×874 PNG from the simulator. It also rejected a screen mask before runner capture. Both the [simctl screenshot](review-update/simulator/simctl.png) and [runner screenshot](review-update/simulator/runner.png) decoded with ffmpeg.

The file probe copied bytes `00 80 ff` from the installed app's real data container and verified an exact match. Clearing app state removed that file and recreated the expected data directories. Reinstall then passed. All scoped daemons and runners stopped, device status reported no claims, and the owned simulator was shut down and deleted.

Two initial script attempts at the earlier head exposed probe setup mistakes, not source changes: the direct probe initially omitted the required runner host binding, then assumed Xcode had installed the separate runner host app. The final script binds the normal owner and explicitly installs that app. Both earlier simulators were also deleted. The successful run above used unchanged source.

## Physical iPhone

The final head `a8758b33fb5f605d1b12c4e287ea69aa5bcab901` passed the lifecycle replay on the connected iPhone 14 Pro, iOS 27.0.1, build 24A446, using Xcode 27.1. The run passed one test, failed none, and recorded six `apple-runner` snapshot captures in 16,457 ms. It opened Settings, scrolled to General, entered it, returned, and verified General again. The scoped daemon stopped and device status reported zero remaining claims. The phone was not shut down.

[Commands and cleanup](review-update/phone/summary.json), [result excerpt](review-update/phone/result.json), [reproducible script](review-update/phone/verify.py), and [replay](review-update/phone/physical-scroll-lifecycle.ad). The excerpt omits account labels, network names, screenshots, and the device identifier. Redundant cleanup closes may return `SESSION_NOT_FOUND` because the replay already closed its session; final daemon cleanup and device status both succeeded.

The first final-head attempt reused the earlier runner products. Xcode rejected launch with a certificate-trust error even though local `codesign --verify --deep --strict` passed. [Attempt and cleanup](review-update/phone/reused-products-attempt.json), [diagnostic](review-update/phone/reused-products-startup.json). A fresh build in a new DerivedData directory passed at the same unchanged source. This records the observed recovery without claiming a confirmed cause for the reuse failure.

The previous head `b663be74c` also passed after the phone was unlocked: [summary](phone/b663be74c-summary.json). The earlier locked-device startup attempt remains in [its diagnostic](phone/blocked-startup.json) and [cleanup summary](phone/blocked-summary.json). The original stock replay's viewport assumption and its earlier base/head comparison are documented separately in [review3](../review3/README.md).

## Scope

The simulator and physical iPhone runs cover local execution. The forwarded runtime factory and hosted installer hook still have no production provider consumer; their tests exercise the common bindings and injected tools. macOS, tvOS, visionOS, and watchOS were not tested on hardware in this round. The inherited watchOS admission/refusal behavior is unchanged and is kept outside this iOS refactor.
