# PR4196 live recording verification

Source `ad71d0391615ee336f0157941f473e204cfd0be8`. Verified 2026-11-03 after rebasing onto current main. The repository remained clean and unchanged.

Own `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm build:android`, and worktree-scoped `pnpm clean:daemon` passed. The test used SDK 0.68.1 and quality 5 for both the daemon and independent recorder.

Commands: `node verify.mjs android`, then `node verify.mjs ios`. The attached script reads the operator's existing Limrun credentials, creates its own instance with a 45-minute hard timeout, and always closes its session, daemon, forwarding proxy and instance. It edits no repository source.

| Platform | Runtime | Instance | CLI result |
| --- | --- | --- | --- |
| android | Android 15/API 35, limdroid_x86_64_only | `android_euna_01m6h7s87mf878054h753zm8w0` | 13 passed, 1 expected injected 503 failure |
| ios | iOS 26.4, iPhone 16 Pro | `ios_euna_01m6h7t5h8f87b4z7zyrcw5c85` | 13 passed, 1 expected injected 503 failure |

## Command flow

Each flow runs `connect limrun --platform <platform>`, opens Settings, and takes a screenshot. An independent SDK recorder starts with an explicit ID. The daemon then records/stops normally, records/stops with one download failure followed by retry, and starts a third recording finalized by `close`. Each invocation's full arguments, JSON output, stderr, exit code and timestamps are in its transcript.

## Retry and isolation proof

A localhost HTTP/WebSocket proxy forwards the daemon's unchanged requests to the real Limrun instance. It records recording control messages and MP4 downloads. For exactly one download, it responds 503 before forwarding. The first `record stop` reports that failure. The second succeeds using the identical URL. The captured control stream has exactly one remote stop for that recording across both commands.

After start, normal stop, failed download, retry and close, an incompatible-quality probe is rejected by the shared encoder. Android additionally returns 403 when the still-active external recording file is requested. After close, a separate visual change succeeds, and stopping the original external recording ID still succeeds. The downloaded external MP4 spans the daemon operations. The probes are behavioral observations, not fixed-delay assumptions.

## Outputs and cleanup

| Platform | File | Codec/dimensions | Duration | Bytes |
| --- | --- | --- | --- | --- |
| android | `normal.mp4` | h264 360×808 | 1.608222s | 27003 |
| android | `retry.mp4` | h264 360×808 | 1.382322s | 28114 |
| android | `close.mp4` | h264 360×808 | 1.621644s | 45177 |
| android | `external.mp4` | h264 360×808 | 10.003322s | 283172 |
| ios | `normal.mp4` | h264 602×1310 | 0.871667s | 174695 |
| ios | `retry.mp4` | h264 602×1310 | 0.758333s | 51092 |
| ios | `close.mp4` | h264 602×1310 | 0.901667s | 53925 |
| ios | `external.mp4` | h264 602×1310 | 7.638333s | 753478 |

All eight MP4s passed ffprobe validation and a full `ffmpeg -v error -i <file> -f null -` decode. File hashes and exact commands are in the summaries.
- android: scoped daemon stopped; public API confirmed instance termination at `2026-11-03T17:37:33.810Z`.
- ios: scoped daemon stopped; public API confirmed instance termination at `2026-11-03T17:38:02.028Z`.

The one initial harness setup failure was a missing root-level `ws` resolution, before any instance was created. The script now resolves `ws` from the SDK's own dependencies. No runtime/product failure occurred.

Publication must exclude each `instance-private.json` and the `state/` directories. Published transcripts redact API and instance tokens, including URL query tokens.

The recordings are included for inspection: [Android normal](android/normal.mp4), [retry](android/retry.mp4), [close](android/close.mp4), [external](android/external.mp4); [iOS normal](ios/normal.mp4), [retry](ios/retry.mp4), [close](ios/close.mp4), [external](ios/external.mp4).
