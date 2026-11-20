# Repository rename preparation

[Issue #581](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/581)
is implemented locally on `codex/581-repository-rename`. The
[maintainer runbook](../development-and-release.md#migrate-the-existing-dev-and-prod-providers-before-the-rename)
covers the preflight, migration, rollback, live checks, and checkout move.

- DEV and PROD use the reviewed repository and owner ID conditions while
  retaining their existing environment, workflow, and ref restrictions.
  The scripts preserve extra attribute mappings, require the expected
  dedicated provider, and add the ID grant before switching the condition.
  Reruns repair missing pieces and skip writes after convergence.
- PROD identity verification uses a protected `moles-v0-wif-check-*` tag
  from `main` because the documented production environment accepts tags.
  The check mints an access token in the existing protected workflow.
  The release filters and job guards exclude verification tags from publishing.
- The Development renderer accepts exact PR URLs under both repository slugs.
  The live source, setup, and support links still use the resolving GitHub URL.
  The runbook places the live URL edits after the rename and the path and
  permission changes with the checkout move.

## Local validation

- Both mock `gcloud` suites passed. They exercise read-only preflight, exact
  conditions, mapping preservation, safe refusal, partial recovery, complete
  no-op, and fresh or partial PROD provisioning.
- Actionlint passed for both modified workflows. The PROD tag guard passed
  seven release and verification cases. All 12 Bash blocks in the cutover
  runbook passed syntax checks. The rollback helper rejected a malformed IAM
  snapshot and restored the expected grant in a mock run.
- The renderer matched all 199 historical entries. All 13 site tests, the
  Development browser test, all 555 browser-client unit tests, and all seven
  deploy command tests passed.
- The pinned Maven clean install passed on JDK 21.0.11 with 1,204 tests
  reported, zero failures and 22 skips under the default configuration. The
  approved offline retry outside the Windows sandbox resolved the compiler's
  dependency-file error.
- Independent review found four issues with PROD tag protection, pool-wide
  grants, PROD provisioning recovery, and rollback input validation. The
  changes were re-reviewed after those issues were fixed.

## Live cutover evidence

CI and live GitHub and Google Cloud checks are pending. Record the four
successful workflow run links in issue #581 when the maintainer verifies DEV
and PROD independently with only ID-based access, before and after the rename.
The URL and checkout-path changes take place at the corresponding cutover.
