Independent lease delta review

Previous reviewed head: db876b93d5d5d25ae8f060bb562dbe8f20a8be88
Reviewed head: ea3dbea24f2f71f631226c0ced937f7ab37cb505
Merge base: a2c169fa502a53f1f2a1da25b1cd16b9c731af39

No findings.

The delta adds "graceful" to three daemon-shutdown references in CLI help and client API documentation. Each change correctly limits the cleanup promise to shutdown that executes the daemon's teardown path. It does not promise cleanup after a crash or forced termination. The wording matches ADR 0005 and the existing shutdown sequence, which drains lease ends, finalizes leases, and stops idle retained runner generations.

Git confirms that only those two documentation surfaces changed. Runtime code, tests, lease-end throttling, and replacement-owner behavior are unchanged from the previously reviewed head. The checkout is clean.

Reviewed AGENTS.md and docs/agents/review.md. Source remained read-only. No tests, devices, live services, external comments, or thread resolutions were run or changed for this review.
