# Local app installation through Limrun sync

The provider change replaces asset uploads with `syncApp` for local iOS apps and Android APKs. Shared platform code still owns install/reinstall sequencing and artifact cleanup. Signed asset URL installation retains its existing path. The CLI has no new flag.

## Source branches

| Repository | Branch / commit | Change |
| --- | --- | --- |
| [Limrun](https://github.com/limrun-inc/limrun/tree/codex/sync-install-only) | `83cf67db2` | iOS sync accepts `launchMode: 'None'`; simulator integration regression test. |
| [scrcpy-webrtc](https://github.com/limrun-inc/scrcpy-webrtc/tree/codex/sync-install-only) | `eecda1b4` | Android sync accepts the same mode. |
| [TypeScript SDK](https://github.com/limrun-inc/typescript-sdk/tree/codex/sync-install-only) | `d9eff9814` | Optional launch mode on both clients; iOS bundle symlinks transfer their contents. |
| [Customer docs](https://github.com/limrun-inc/docs/tree/codex/sync-install-only) | `a18960b` | Direct local-file sync and launch-mode examples. |

The default SDK launch mode remains `ForegroundIfRunning`. Agent-device explicitly requests `None` and disables watching. Local installs on attached instances use instance credentials without an organization API key. SDK callers may select `RelaunchIfRunning` explicitly.

## Agent-device dependency staging

The agent-device patch is [agent-device.patch](agent-device.patch), based on `c3c281fb4c782fd19023f4bb3a43570d023a54c9`. It is also present locally on `codex/limrun-sync-install`. It has not been pushed as a shipping branch because the new SDK is not released. Existing review branches were not changed.

Validation uses an isolated checkout with its own dependencies. Both SDK dependency entries point to a package built from the SDK branch. No build-policy allowlist, cast, or suppressed type error was added to agent-device. A source-commit dependency required a package-manager build exception, so it was abandoned.

The final packed SDK artifact has SHA-256 `c5ef0379980e1c1dfa5608486b650ca7ab97d2ad0691b5a924b11d3c5b842eb5`. The package's version remains its source branch's `0.69.0`; this is a local validation artifact, not the published npm release.

The final isolated validation snapshot is `e95f827bcde71df1aeee1c6cb45dcbf3274056f2`. It must not be pushed: its package manifest and lockfile contain a local artifact path. After the SDK release, update both normal dependency versions and the lockfile, then validate the final shipping commit.

## Tests and review

- SDK lint, build, type checks, package checks: passed. [Log](agent-device-sync-sdk-lint2.log).
- SDK suite: 1,057 passed, 28 skipped; 85 suites passed, 6 skipped. [Log](agent-device-sync-sdk-tests2.log).
- Symlink regression: new tests failed 5 of 22 before the SDK fix; all 22 passed after it. [Before](agent-device-sync-symlinks-before.log), [after](agent-device-sync-symlinks-after.log).
- Agent-device install/reinstall regression: the same command failed all four cases on base and passed all four with the patch. The base failure was the obsolete organization-key requirement. [Base](agent-device-sync-base-regression.log), [patched](agent-device-sync-head-regression.log).
- Focused agent-device tests: 36 passed, including cleanup after cancellation for provider-owned and caller-owned materialized artifacts. [Log](agent-device-sync-head-focused.log).
- Initial full agent-device gate: passed at `78b29d52747c4e4341d2fecbe6763ccc12892938`, `exactCommit: true`. It used the SDK before the symlink correction. 17,096 unit tests passed, 1 skipped; 1,276 related tests and 250 provider integration tests passed. [Receipt](validation-initial/receipt.json).
- Final full agent-device gate: passed at `e95f827bcde71df1aeee1c6cb45dcbf3274056f2`, `exactCommit: true`, using SDK `d9eff9814`. All runnable checks passed. 17,096 unit tests passed, 1 skipped; 1,276 related tests and 250 provider integration tests passed. [Receipt](validation-final/receipt.json).
- iOS: Swift syntax check and Go integration-test compilation passed. The full simulator workflow passed, including `TestSyncInstallWithoutLaunching` in 6.05 seconds. [Simulator CI run](https://github.com/limrun-inc/limrun/actions/runs/41708578913) verifies initial install, unchanged-build reinstalls, no unsolicited launch, default launch, and explicit relaunch.
- Android native build: blocked by the same 38 missing virtual-camera API errors on base `539259dfb3f96e150e0526640cef9df43c12f7d9` and head `eecda1b4`. No Android device pass is claimed. [Base log](agent-device-sync-android-base-build.log), [head log](agent-device-sync-android-build.log).
- Independent review found one P2, skipped symlinked iOS bundle contents. The SDK fix addresses it; the follow-up review reported no remaining findings.

Android build command, used unchanged on base and head:

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME=/Users/muvaf/Library/Android/sdk \
./gradlew :server:testDebugUnitTest :server:assembleDebug
```

Agent-device regression command, used unchanged on base and patched code:

```sh
pnpm exec vitest run test/integration/provider-scenarios/limrun-deployment-cancellation.test.ts \
  -t 'syncs with instance credentials'
```

## Rollout order

1. Merge and deploy the iOS and Android server changes. Older servers interpret an unknown mode as launch.
2. Release the SDK changes.
3. Update agent-device to that published SDK version, validate its final commit, and push the provider change.
4. Merge the customer docs with the released behavior.

No PRs were opened, no servers were deployed, and no npm package was published during this change.
