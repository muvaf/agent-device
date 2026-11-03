Lease retained-host ownership fix

Reviewed head: c7be97e9e92acbbfb68d9f67cf5b5fa491dac526
Pre-fix rebased head: e7de7e961a1db35364c4d5f77a9f26a330ef61bd

SessionStore preserves device, address, and lease scope when close retires a retained host. Publishing a replacement session removes prior retained ownership. Retained records use object identity so a queued cleanup cannot dispose a newer record.

The existing lease-end owner stops retained hosts through cleanupSessionlessExecutionHost under the same session/device execution locks. It inspects retained records after waiting for live session teardown, covering close retiring while expiry waits. A second live-session sweep catches a same-lease reopen published while the retained device lock was held. Failed cleanup preserves the record and the existing one-second expiry sweep retries it. Cancellation leaves queued cleanup to daemon shutdown; drain still waits for cleanup already running. Direct end calls remain reentrant; only background retry suppresses duplicate in-flight cleanup.

Concrete extra race: host DELETE /admin/leases/L removes the registry entry without request execution locks (host-lease-http.ts). If a reopened same-lease session has not yet published because native open is pending, the first live-session snapshot is empty. Publishing invalidates the retained marker. The second live-session sweep now ends that new session before release returns. Different-lease replacements remain protected. DeviceMutationDrain counts active work for human-control draining; it is not a mutex. Canceled fresh open is separately guarded after the native call and before synchronous publication in session-open-execution.ts, already covered by its existing cancellation regression.

ADR 0007: common execution locks, existing expiry sweep, and shutdown cancel/drain retained. ADR 0019: no concrete platform imports or new process owner. ADR 0005: native retained generation still owns its idle timer/listener policy; existing platform shutdown stops it. ADR 0036: bounded composite close admission unchanged.

The leaseWillEnd contract comment now includes the conservative failed-inspection case. Root added two user-facing help/docs clarifications.

Focused validation: 45 tests passed across four unit-core files. Full pnpm format passed. Root independently reviewed the production design. Isolated regression proof is recorded separately in lease-regression.json. Live device proof and exact broad gate are owned by root.
