# Android installer live verification

Passed on commit `4d65affa7cddbb7ad0a3340a4dc36c12b9c13aea`, 2026-11-03. The working tree was clean before and after the run. Independent review of `a2c169fa502a53f1f2a1da25b1cd16b9c731af39..4d65affa7cddbb7ad0a3340a4dc36c12b9c13aea` found no regressions.

Device: task-owned Android emulator `emulator-5588`, system image `android-36.1/google_apis_playstore/arm64-v8a`, 720x1280, API 36. The run used session `android-installer-review4194` and a dedicated daemon state directory and TMPDIR in this folder. The app was a real signed native APK built from the included Java/manifest source, package `com.agentdevice.installerreview`. Three versions had distinct versionCode and visible button labels. No Metro server or mocked device operations were used.

## Results

- Public SDK `apps.install` installed v1 through the daemon and returned the correct appId/package. Package-manager inventory reported versionCode 1, the resumed activity was MainActivity, and the interactive snapshot showed `INSTALLER REVIEW VERSION 1`.
- Public SDK `apps.reinstall` replaced v1 with v2 and returned the same package identity. An app-private marker existed before reinstall and was absent afterward. Package-manager inventory and the running app showed v2.
- Public SDK `apps.installFromSource` materialized `source-v3.zip` and installed v3 through the daemon. It returned packageName, appId, and launchTarget `com.agentdevice.installerreview`. The extraction directory `tmp/agent-device-archive-Zq97Su` was observed during installation and no longer existed after it completed. The original ZIP remained. A marker created after reinstall survived the source update. Package-manager inventory and the running app showed v3.
- All three exact CLI `snapshot -i --json` calls reported `androidSnapshot.backend: android-helper` and `helperVersion: 0.21.37-dev`, matching package.json. No UIAutomator fallback was used.
- `close --shutdown` succeeded for the original session/serial/state directory. `daemon stop --clean` confirmed graceful cleanup with no warnings or pending releases. The task-owned emulator exited and the AVD files were removed after its process exited. No other device or AVD was changed.

## Commands and evidence

The existing full gate built TypeScript at this SHA. Native helpers were then rebuilt with:

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
ANDROID_HOME=/Users/muvaf/Library/Android/sdk \
ANDROID_SDK_ROOT=/Users/muvaf/Library/Android/sdk \
AGENT_DEVICE_ANDROID_BUILD_TOOLS=36.1.0 \
PATH='/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin:'"$PATH" \
pnpm build:android
python3 /private/tmp/agent-device-review2/android-live/build-fixture.py
python3 /private/tmp/agent-device-review2/android-live/setup-avd.py
node /private/tmp/agent-device-review2/android-live/run-live.mjs
```

`run-live.mjs` contains the exact SDK calls and assertions. `commands.ndjson` records every shell command, status and duration; `commands/` retains stdout and stderr. `result.json` records SDK results, observed temporary-directory cleanup and all snapshot checks. `fixture-sha256.json` and `helper-sha256.json` identify the binaries. `verified-avd-config.ini` preserves the device configuration.

The first attempt stopped at an evidence assertion because the Android Button rendered its label in uppercase. The product path had installed and launched correctly. That attempt and successful cleanup are retained under `attempt1-label-assertion/`. The final run used a case-insensitive label assertion and wiped only this task's AVD data before beginning.

This run verifies the native local path. A later production provider callback still needs its own live verification when that layer is added.
