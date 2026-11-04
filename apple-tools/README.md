# Shared Apple tools validation

Source: `b663be74c1b2194330360793ab9187848be9a449`. Base: `8c416a75980d888985886d9d6eada2f9a51d3ea8`. Date: 2026-11-04.

This branch extracts common Apple simulator files, app metadata, lifecycle sequencing, and runner operations. It does not switch the Limrun provider to XCTest yet. The next layer is on [`codex/limrun-native-runner`](https://github.com/muvaf/agent-device/tree/codex/limrun-native-runner); sync-based installs follow on [`codex/limrun-sync-install`](https://github.com/muvaf/agent-device/tree/codex/limrun-sync-install). Those branches still contain their earlier prerequisites and will be rebased as the common layers merge.

## Automated validation

`pnpm check --base 8c416a75980d888985886d9d6eada2f9a51d3ea8 --head b663be74c1b2194330360793ab9187848be9a449` passed with `exactCommit: true`. The [receipt](validation/receipt.json) and adjacent command logs cover tooling, dependency analysis, packaging, XCTest selection, the unit suite, and smoke tests. The unit suite passed 17,226 tests and skipped one. A skipped native smoke lane is not live-device evidence.

`pnpm test:integration:provider` passed all 245 tests across 68 files at the same clean head. [Output](validation/provider-integration.log). GitHub coverage and CI device lanes retain their own authority.

The [deadline regression experiment](regression/README.md) failed before the fix and passed after it. The [independent review](review/review.md) records the accepted finding, fix, and clean follow-up review. The rebase preserved upstream screenshot masking and added a guard against silently ignoring it on provider-owned runner captures.

## Local iOS simulator

[Reproducible script](simulator/verify.mjs), [commands and observations](simulator/transcript.json), and [image decode output](simulator/image-decode.json).

The script ran against a newly created iPhone 17 Pro simulator on iOS 26.4, build 23E244, with Xcode 27.1, build 27A9269. `prepare ios-runner` built and started the current runner in a dedicated DerivedData directory. The CLI and direct platform probes both used the current built JavaScript, with separate runner ownership after stopping the CLI daemon.

The CLI passed app listing, Settings open/relaunch, snapshot, a masked screenshot, close, and local install/reinstall of the built runner host app. The direct platform probe found 37 installed apps, read Safari metadata, resolved Safari as the owner of `https:`, and captured a 73-node XCTest snapshot. With a scoped tool provider forcing runner screenshots, the shared screenshot implementation copied a valid 402×874 PNG from the simulator. It also rejected a screen mask before runner capture. Both the [simctl screenshot](simulator/simctl.png) and [runner screenshot](simulator/runner.png) decoded with ffmpeg.

The file probe copied bytes `00 80 ff` from the installed app's real data container and verified an exact match. Clearing app state removed that file and recreated the expected data directories. Reinstall then passed. All scoped daemons and runners stopped, device status reported no claims, and the owned simulator was shut down and deleted.

Two earlier script attempts exposed probe setup mistakes, not source changes: the direct probe initially omitted the required runner host binding, then assumed Xcode had installed the separate runner host app. The final script binds the normal owner and explicitly installs that app. Both earlier simulators were also deleted. The successful run above used unchanged source.

## Physical iPhone

The first attempt stopped before test execution. Xcode could not make the connected iPhone 14 Pro available, and a direct CoreDevice lock-state query reported `passcodeRequired: true`. See [startup diagnostic](phone/blocked-startup.json) and [commands and cleanup](phone/blocked-summary.json). The daemon stopped and device status reported zero claims. No physical-device test pass is claimed for this attempt.

The [physical replay recipe](phone/verify.py) takes the phone UDID and signing team through environment variables. It runs [the scrolling lifecycle replay](phone/physical-scroll-lifecycle.ad), which handles General being below the viewport on this phone. The original stock replay and its earlier base/head comparison remain separately documented in [review3](../review3/README.md).
