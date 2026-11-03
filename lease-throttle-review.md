Independent review of retry-throttle delta

Base: 94a4db632d927807c6588823e6a42bafdcdf6a05
Reviewed head: db876b93d5d5d25ae8f060bb562dbe8f20a8be88
Committed delta exactly matches lease-throttle-reviewed.patch; hash recorded in lease-throttle-regression.json.
Result: no findings.

The existing lease-end owner stores each pending lease's next retry timestamp, sets it ten seconds after an incomplete attempt settles, and filters background retries by that timestamp. The existing in-flight guard prevents overlapping retries. Direct end calls remain immediate and reentrant; shutdown cancel/drain and successful ownership removal are unchanged. No additional timer, configuration field, attempt cap, or lifecycle owner was introduced.

The shared host-kit retryWithPolicy owns an awaited attempt/sleep loop and would change the duration of end and drain; it is not a reusable timestamp helper. The neighboring daemon-session-idle-expiry owner also uses per-resource retry timestamps.

The revised test uses a restored Date.now spy, proves one-second sweeps do not rerun cleanup during the ten-second interval, proves a second failure receives another delay, and proves successful cleanup removes ownership and pending work. Its isolated before/after comparison is recorded separately. The existing shutdown, reentry, replacement-owner and reopen-race tests remain unchanged.

The two documentation edits correctly state that disabling idle stopping does not disable lease cleanup, and a session outside the ended lease keeps the device it has taken over. No external review replies or thread resolutions were posted.

Regression proof: unchanged published source with only the revised test failed at the first 1-second sweep (2 calls instead of 1). Applying the reviewed owner fix made that exact test pass. Frozen install and build succeeded in the disposable worktree. Logs and cleanup are recorded in lease-throttle-regression.json.
