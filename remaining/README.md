# Remaining Limrun integration validation

Validated on 2026-11-04. Upstream base: `4abff15edaf7a2634f1b2a00edd742a14e808630`.

| Layer | Tested commit | Diff |
| --- | --- | --- |
| Native XCTest integration | `0ae3dc2a41de9f17743bb3f04eab91f516482a9f` | 116 files, 5,095 additions / 5,278 deletions |
| Local install sync | `a95049b9a1a86413d2703c91a6cc7f08ff136f65` | 21 files relative to native parent, 275 additions / 399 deletions |

The prerequisites have merged upstream. The native branch replays only the remaining AX-to-XCTest replacement; the sync branch replays only its install change on that parent. [Native range comparison](native-range-diff.txt), [sync range comparison](sync-range-diff.txt), and [independent review](review.md) record the rebase review.

## Automated validation

- `pnpm check` passed at `69048e55ab7718f4d1d76e7b4658fd56a0365a45`: [full receipt](native-full-validation/receipt.json). The only later native change updates the inherited appstate integration fixture to the shared simctl/tool-provider path.
- Final native: `pnpm check:affected --run --base origin/main --head 0ae3dc2a41de9f17743bb3f04eab91f516482a9f`: [passing exact-commit receipt](native-final-validation/receipt.json): 17,274 unit passes and one skip, 1,280 related passes, and 246 provider-integration passes. All runnable checks passed.
- Final sync: `pnpm check:affected --run --base 0ae3dc2a41de9f17743bb3f04eab91f516482a9f --head a95049b9a1a86413d2703c91a6cc7f08ff136f65`: [passing exact-commit receipt](sync-final-validation/receipt.json): 17,274 unit passes and one skip, 1,285 related passes, and 251 provider-integration passes. All runnable checks passed.

The receipts distinguish local passes from skipped GitHub-authoritative lanes. Required upstream CI is still required; this evidence does not claim a fresh physical-phone run.

The live run exposed an unsupported `simctl get_app_container` call during clear-state. The provider now uses its scoped HTTP file API. The regression fixture rejects that unsupported simctl command. With production code at `f7f7f9a09ee47deaf76230cc2826dd485934bd0d`, the clear-state test fails: [before](container-regression-before.log). At final native head it passes: [after](container-regression-final.log). Command: `pnpm exec vitest run src/core/interactors/limrun-ios-files.test.ts -t "clear state uses the shared reset and preserves container identity without launching"`. The broader file/tools suite also passed [38 tests](container-regression-after.log). The updated inherited appstate test also passes: [log](appstate-integration.log).

## Live native runner

[Script](native-live.mjs), [final log](native-live-final.log), [snapshot](native/snapshot.json), [screenshot](native/screenshot.png), [agent-device video](native/recording.mp4), [independent concurrent video](native/external-recording.mp4), [media decoding checks](media-validation.json).

The final commit passed on a fresh Limrun iOS simulator. Assertions cover install without launch, downloaded plist deep-link ownership, public SDK open, log heartbeat, shared XCTest snapshots, runner appstate, selector taps, delayed text entry, independent concurrent recordings, push staging cleanup, clearing app data while preserving container identity, stopped state, relaunch, and screenshot.

The runner was freshly built with Xcode 26.4 on a Limrun Xcode sandbox: [build script](build-runner.mjs), [build log](build-runner.log). Its `apple/` sources and packaging script are unchanged between the build source `9260aca` and the final native commit.

A reused simulator subsequently hit repeated XCTest tree-capture timeouts: [first](native-live-timeout.log), [second after runner cleanup](native-live-second-timeout.log). A fresh simulator passed without changing production code. This points to instance state but does not establish the root cause. An earlier attempt overlapped the local package rebuild, which restarted the daemon and invalidated its lease: [build-race log](native-live-build-race.log). The completed final run began after that build.

## Live installation sync

[Script](sync-live.mjs), [iOS log](sync-ios-live-final.log), [Android log](sync-android-live-final.log).

At the final sync commit, both platforms passed local app installation, confirmation that installation leaves the app stopped, launch, data-marker creation, reinstall, stopped-state confirmation, removal of old app data, relaunch, uninstall, and a second uninstall reporting that the app is absent. These checks exercise the released SDK's install-only sync path.

## Reproduction and cleanup

The live scripts use isolated agent-device state directories, the public Limrun e2e fixture app/APK, saved CLI credentials, and private instance connection JSON. Adjust their local checkout paths before rerunning; connection files and credentials are intentionally not published. The app bundle path points to the freshly built runner.

Each script closes its session and releases its lease. Daemons were stopped with `--clean`; test simulators and the build sandbox were deleted through the public API. See [native daemon cleanup](native-cleanup.json), [iOS sync cleanup](sync-ios-cleanup.json), [Android sync cleanup](sync-android-cleanup.json), [instance cleanup](instances-cleanup.log), [reused simulator cleanup](reused-ios-cleanup.log), and [Xcode cleanup](xcode-cleanup.json).
