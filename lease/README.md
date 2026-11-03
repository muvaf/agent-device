# Retained lease lifecycle verification

Passed at `db876b93d5d5d25ae8f060bb562dbe8f20a8be88` on 2026-11-03. Source stayed clean before and after the run. The test created and deleted its own iPhone 17 Pro simulator `D5ED7C14-ACC9-480E-A3F2-7F1028360BF6`, running iOS 26.4 build 23E244 with Xcode 27.1, Build version 27A9269.

`AGENT_DEVICE_IOS_RUNNER_IDLE_STOP_MS=0` disables idle cleanup so it cannot hide a lease leak. A scoped state directory, runner lease directory, and derived-data directory isolate the daemon and runner. The expiry test sets a 2-second TTL with `AGENT_DEVICE_LEASE_MIN_TTL_MS=1000`. Runner detach uses its default policy.

## Results

All 45 public SDK calls succeeded through the daemon. Each prepared runner served a successful `interactions.swipe` call. Per-request `ios_runner_command_send` events and runner generation records are included in `summary.json`. These calls exercise native XCTest rather than an AX snapshot.

| Case | Observed result |
| --- | --- |
| Retained close | Session list empty; lease heartbeat succeeds; runner listener and generation remain alive. |
| Reopen | The same generation serves another native swipe. |
| Release after second close | The lease ends, runner lease file disappears and listener closes while the daemon stays alive. |
| Expiry after close | The same cleanup occurs without another device command, while the daemon stays alive. |
| `close --shutdown` | Runner listener stops and simulator shuts down; explicit release removes the retained logical lease. |
| Nonretained control | Ordinary close ends both runner and lease; later release reports `released: false`. |
| Graceful daemon shutdown | `daemon stop` without `--clean` stops the retained runner and daemon. |

Final cleanup separately ran `daemon stop --clean` and deleted the task simulator. Both succeeded. TCP listener observations poll for the expected state and record the runner PID, daemon PID, generation and lease file. Full SDK arguments, responses, shell commands, timestamps and cleanup are in `transcript.json`.

## Reproduce

```sh
node verify.mjs --root /path/to/agent-device --expected-sha db876b93d5d5d25ae8f060bb562dbe8f20a8be88 --label lease-review --output /tmp/lease-review
```

The script accepts explicit Xcode directory, runtime and device-type overrides. It creates a fresh simulator and does not use a connected phone. Earlier runs at `23d223660`, `c7be97e9e` and `94a4db632` also passed; the evidence above is from the final commit, including the cleanup retry throttle and documentation clarifications.
