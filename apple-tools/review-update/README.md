# Review fixes

Reviewed source: `a8758b33fb5f605d1b12c4e287ea69aa5bcab901`. Previous PR head: `b663be74c1b2194330360793ab9187848be9a449`.

The container-path cache now uses the canonical simulator address, including its simulator set. URL-owner discovery again reads metadata serially, matching the prior local implementation. Hosted install results retain their values and fill missing identity, app name, and launch target from the materialized artifact. The reinstall test records distinct hosted and native installs. The unused URL-owner callback was removed; launch confirmation uses the shared scoped tools and existing timeout.

The watchOS interaction admission and snapshot refusal facts are unchanged from base `8c416a759`. They were already present in `packages/platform-apple/src/runtime.ts` at lines 258–259 and 562–589. This iOS refactor does not claim to fix or validate watchOS support.

An independent follow-up reviewer found no further issues at `a8758b33f`, including the scope decision for inherited watchOS behavior.

## Regression proof

A disposable detached checkout at `b663be74c` received its own frozen install and build. Only the updated tests were copied into it. The command was:

```sh
pnpm exec vitest run --project unit-core \
  packages/platform-apple/src/core/simulator-files.test.ts \
  packages/platform-apple/src/core/__tests__/app-resolution-deep-link.test.ts \
  packages/platform-apple/src/deployment/runtime.test.ts
```

[Before](before.log): four failures and 41 passes. The failures expose cross-set file copying, 20 simultaneous metadata reads, and two incomplete hosted-install results. [After](after.log): all 45 tests pass. The focused after run used the uncommitted [fix patch](review-fix.patch); final commit validation is recorded separately. The implementation checkout's SHA and diff remained unchanged during the experiment, and the disposable checkout was removed.

For the installer-selection test, the unchanged production path passed both cases using:

```sh
pnpm exec vitest run --project unit-core \
  packages/platform-apple/src/deployment/runtime.test.ts -t 'reinstall clears'
```

[Control](installer-control.log): two passes. A deliberate mutation in the disposable checkout bypassed the hosted callback and always used native install. [Mutant](installer-mutant.log): the hosted case failed while the native case passed. The assertion observed `native-install` where it required `hosted-install`. This proves the test no longer accepts the wrong installer path.
