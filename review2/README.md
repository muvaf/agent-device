# Review follow-up at 3848d114b

Source `3848d114b36d6de352ee20827fbb8e4cda9996c1`. The exact-commit affected gate passed. Independent read-only review of `99be56862..3848d114b` found no issues.

The catalog lost-lease regression fails on `99be56862` with `UNSUPPORTED_OPERATION`, then passes here with `DEVICE_NOT_FOUND`. See [base](base-regression.log), [focused tests](focused.log), and [receipt](receipt.json).

The [fresh live run](live.json) used the matching Android helper and recorded a helper capture for get-text with zero fallback events. Frame and memory samples succeeded. The HPROF contained 33,521,774 bytes and the JAVA PROFILE header. Session, lease, daemon, and instance were cleaned up. The [harness](live.mjs) uses the parent directory's fixture and setup instructions. Earlier coverage results in the parent directory belong to `99be56862`; CI will measure coverage at this new head.
