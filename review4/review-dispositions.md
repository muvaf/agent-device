# Review thread dispositions

## #4224

[4473052124](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052124): Fixed: the deadline test now asserts COMMAND_FAILED, the exact deadline message, limrun_download_timeout, and timeoutMs. It cannot pass on an arbitrary command error.

[4473052167](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052167): Fixed: the test waits until the destination contains the streamed partial bytes before aborting, then verifies removal.

[4473052179](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052179): This no longer applies. createLimrunIosRunner binds the shared Apple lifecycle with its scoped remote tool provider, including launch-console admission. The launch-console test writes output from the remote simctl execution to the requested capture file; the previous live run also exercised it. Keeping the supported user-facing wording.

[4473052193](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052193): No change needed here, consistent with the maintainer’s assessment of the shared-runner-products thread. Packaging copies the overlays supplied by the selected Xcode toolchain; absence of an overlay glob alone does not establish that this toolchain requires it. The remote build/package and live runner evidence covers the actual packaged overlays. An unconditional presence requirement would reject toolchains that do not ship those frameworks.

[4473052212](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052212): Fixed at the shared owner: kernel/await-with-signal maps TimeoutError to AppError(COMMAND_FAILED) with reason operation_deadline_expired. Limrun uses this helper directly; the broad host-kit entry gains no eager import.

[4473052224](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052224): The SDK/server default is ForegroundIfRunning, so omitting it preserves this URL-install behavior. The subsequent sync-install PR explicitly uses launchMode None for install/reinstall, matching local install-only behavior; live checks verify the app remains stopped. The maintainer also confirmed this thread no longer applies.

[4473052234](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052234): Fixed: both download timeout paths carry reason limrun_download_timeout and timeoutMs. Caller cancellation remains request_canceled, and an existing AppError is preserved.

[4473052247](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052247): Fixed: a reader’s first read, including reconnect, obtains appLogTail before starting its live streams. The regression test verifies retained history is returned on that first read.

[4473052255](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052255): Updated the capability annotation and regenerated capabilities.md. It now distinguishes runner foreground state from a session-identity fallback that omits state.

[4473052273](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052273): Fixed in the shared kernel helper: the abort callback removes its listener immediately, including already-aborted signals and promises that never settle. Tests check listener counts before and during cancellation.

[4473052282](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052282): Fixed: runner disposal aborts lifetime, drains preparation and removes staging in finally even if runner finalization rejects. A regression test forces that failure and checks cleanup.

[4473052298](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052298): Fixed: pending preparation has an owned controller and independently cancellable waiters. The last canceled waiter aborts and drains it; another live waiter retains ownership. New callers drain an already-aborted generation before retrying. Tests cover both concurrent waiters and arrival during cleanup.

[4473052308](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052308): Fixed: factsFor now accepts an explicit liveSession boolean, and callers pass true/false.

[4473052315](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052315): Fixed: the fixture omits the empty callback, so an unexpected runner command throws. The open assertion also requires exactly one launch.

[4473052337](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052337): Fixed: a missing runner path now produces INVALID_ARGS with reason limrun_runner_products_invalid and an actionable runner-path/toolchain hint.

[4473052356](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052356): Fixed: the test waits until the deployment callback enters before aborting, so it exercises cancellation in flight.

[4473052363](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052363): Renamed the test to describe falling back to the live instance probe.

[4473052375](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052375): Fixed: device-session tests spread stubLimrunRuntimeDependencies and override only the members they exercise.

[4473052380](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052380): Fixed: both provider scenario fixtures scope the Apple tool provider to context.signal, mirroring production request cancellation. The runner HTTP fixture separately exercises the production createLimrunIosRunner path.

[4473052390](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052390): Fixed: the SDK fixture now stubs the public wait() method rather than calling private _handleStdout/_handleExit methods. The malformed-inventory fixture was updated similarly.

[4473052401](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052401): Fixed: the fixture documents its shared iOS runtime, constructs a runner for each supplied session.device, and throws on unexpected runner commands instead of returning an empty reply.

[4473052415](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052415): Fixed: stageFile deletes the staged URL when reading or parsing the successful upload response fails. Cleanup uses lease lifetime rather than the canceled request, and preserves the original failure. A bad-response regression test verifies deletion.

[4473052423](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052423): Fixed: the fixture clock uses node:timers/promises sleep with the supplied AbortSignal. The stale unreachable-clock comment was removed.

[4473052439](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052439): Renamed the test to cover its actual scope and documented that shared open is stubbed in this snapshot-focused test.

[4473052453](https://github.com/callstack/agent-device/pull/4224#discussion_r4473052453): Fixed the subject list to distinguish local Apple runner/Appium/AX subjects from Limrun and Revyl provider behavior.

## #4225

[4473053054](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053054): Fixed in parent #4224: device inventory normalization accepts list -j, list --json, and list devices --json. A parameterized test checks that each returns the provider-owned device ID.

[4473053074](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053074): This is supported through the scoped Apple tool provider. The shared push operation dispatches simctl push through Limrun’s client, with the payload staged using the instance file API. The binding test now invokes the callback, and the existing live evidence includes push. It does not invoke local xcrun for the remote device.

[4473053084](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053084): The shared uninstall operation is bound inside the Limrun Apple tool scope, so its simctl invocation uses the instance client. The parity test verifies remote name resolution and uninstall ordering; live install/reinstall/uninstall runs cover this route. No separate Limrun uninstall implementation is needed.

[4473053095](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053095): Fixed in parent #4224: the test filters launch invocations and asserts exactly one call.

[4473053099](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053099): This provider is for a remote iOS simulator, not a macOS XCTest product resolver. Its runner products are prepared by prepareLimrunRunnerProducts; app metadata is read through the simulator file API and parseApplePlist. Host-local plist reads are intentionally unavailable. Adding local plist access would reintroduce a host dependency for this route.

[4473053108](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053108): The new Limrun runner binds the shared lifecycle and admits launchConsole with a remote Apple tool provider. The old owner-admission rejection no longer applies. The remote console-output test and prior live evidence cover the supported path.

[4473053115](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053115): Keeping the documented support: the new shared Limrun lifecycle admits launchConsole, and its scoped tool provider captures remote simctl output. The remote console-output test covers this path.

[4473053169](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053169): Fixed in parent #4224: the parity test asserts the complete airplane status-bar override arguments.

[4473053176](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053176): Fixed in parent #4224: the test supplies a sendPushNotification mock, invokes the bound operation, and checks its input/result.

[4473053182](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053182): Fixed in parent #4224: the test waits for actual partial bytes on disk before aborting and asserting cleanup.

[4473053194](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053194): Fixed in parent #4224: added a deterministic blocked-write test that aborts while the write is pending and verifies cleanup. The PR description explicitly names this Revyl test scope.

[4473053206](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053206): Fixed: docs distinguish iOS URL/token from Android URL/token plus ADB URL. Versioned help now agrees that local sync installation uses instance credentials; the management API key is needed for discovery/allocation.

[4473053221](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053221): Fixed in parent #4224: the iOS runtime case invokes appState and verifies its result rather than stopping at the availability fact.

[4473053238](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053238): Fixed in parent #4224’s shared kernel cancellation helper: already-aborted listeners are removed immediately, with regression tests for never-settling source promises.

[4473053256](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053256): Fixed in parent #4224: createRunner builds the shared runner for the supplied session.device. The generic fixture no longer hard-codes the first device.

[4473053269](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053269): The English-only Limrun AX alert implementation is removed by parent #4224. Limrun now uses the same Apple runner alert interaction and language configuration as local execution. The prior limitation does not describe this branch, so the wording remains.

[4473053282](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053282): Fixed in parent #4224: the archive checksum read receives input.signal and stops when preparation is canceled.

[4473053294](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053294): Fixed in parent #4224: download normalization returns an existing AppError before consulting either abort signal, preserving typed HTTP failures even if cleanup overlaps cancellation.

[4473053310](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053310): Fixed in parent #4224: only completed app metadata is cached. Concurrent lookups have independent request signals; a held-download test cancels one while the other completes.

[4473053323](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053323): Not applying this suggestion, as the maintainer confirmed: the shared deployment owner removes the artifact when the inner install returns. Returning early from an already-started opaque SDK sync would race its file reads. The outer deployApp remains cancellable and drains the SDK operation. A queued install now checks cancellation before dispatch. Integration tests cover both platforms, late success/failure, and caller-owned materialized artifacts.

[4473053337](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053337): Fixed in parent #4224: the host wrapper uses the request-scoped RunnerContext target, falling back to the session app through the same context getter as the shared runner.

[4473053341](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053341): Not applying this suggestion, consistent with the maintainer’s review. The caller owns materialized-artifact cleanup and must retain those files until opaque SDK sync settles. Returning early here would permit cleanup during SDK reads. The outer deployApp remains cancellable; the materialized-source cancellation test verifies file lifetime.

[4473053351](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053351): Not applying this suggestion, as the maintainer confirmed: an in-flight SDK sync must retain its source until it settles. The outer deployment observes cancellation and drains accepted work. Queued work now checks the signal before SDK dispatch. The iOS cancellation integration tests verify source lifetime for both successful and failed late completion.

[4473053368](https://github.com/callstack/agent-device/pull/4225#discussion_r4473053368): Fixed in parent #4224: clipboard read/write facts are asserted for both iOS and Android devices.

