# Native stack documentation delta review

Reviewed `/Users/muvaf/github.com/callstack/agent-device` at `c3c281fb4c782fd19023f4bb3a43570d023a54c9` against previously reviewed `cf9f2c72c48340a7dfefe72cd2aa53fe09600101`, with base `a2c169fa502a53f1f2a1da25b1cd16b9c731af39`. Read the current AGENTS.md, review instructions, supplied range diff, and exact head-to-head diff.

No findings.

The entire source delta inserts `graceful ` three times: twice in the runner lifecycle paragraph at `src/commands/schema/cli-help.ts:483` and once in the lease lifecycle paragraph at `website/docs/docs/client-api.md:347`. This accurately limits the cleanup claim to the daemon shutdown path that can execute its teardown handlers; it does not promise cleanup after a hard process kill. It preserves the documented lease-release/expiry behavior and replacement-owner exception.

The five-layer stack is preserved in order:

1. `4d65affa7` Android deployment installer, unchanged commit.
2. `acf6cfb85` Apple common tools/runtime, unchanged commit.
3. `15d9310cc` lease retention, changed only by these documentation qualifiers.
4. `3f5029945` recording isolation, patch-equivalent to the reviewed layer.
5. `c3c281fb4` native Limrun runner, patch-equivalent to the reviewed layer.

No runtime code, tests, interfaces, or previous fixes were lost. The checkout was clean. Source remained read-only, and no tests or gates were run. Earlier runtime validation remains attributed to its original tested SHA; this review covers the documentation-only propagation.
