# Feature: Remove remote name generation from Riotous Rookies mutation

Tracking: [#514](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/514),
assigned to `the-grognard-codes` before implementation; endpoint cleanup reuses
[#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513).
Source: [#509](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/509)
and [accepted ADR 0006](../adr/0006-single-engine-worker.md).
Status: delivered in [PR #515](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/515),
merged on 2026-11-09; both tracking issues are closed. Validation, review and delivery evidence in the
[outcome report](engine-worker-rookie-local-names-outcome.md).

## Abstract

Name every Riotous Rookie locally as `RiotousRookie #<index>`, using the existing
fallback scheme, instead of making an HTTP request for each rookie during native
mutation.

**Maintainer decision (2026-11-09):** `RiotousRookie #n` names are acceptable for now.
No local name list is required. This request covers local naming only. Removing the
shared FUMBBL endpoint code (`ServerUrlProperty`, `UtilServerHttpClient`, the
`fumbbl.*` properties and related tools) is backlogged separately as
[#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513), which this
change unblocks. See the [combined request review](engine-worker-requests-review.md),
findings R1 and R2.

## Objective

Eliminate this remote dependency from the engine worker while preserving rookie
creation, native dice/step order, durable recovery and replay compatibility.

## Context / Existing Behavior

[StepRiotousRookies.rookieName](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java)
calls `UtilServerHttpClient.fetchPage` from nested inducement/rookie loops. The
shared HTTP helper configures a 10-second connect timeout and no explicit read or
connection-request timeout. A host that accepts and stalls can freeze every match
between native work and checkpoint commit. The Step is in the common rules
collection and is reachable by BB2025.

The Step already accepts a locally computed `RiotousRookie #<index>` name after
an empty response or `IOException`. Removing the HTTP call is an expressly
permitted mitigation in ADR 0006; it does not require hardening an otherwise
unneeded remote lookup.

## In Scope

- Replace remote naming in this Step with its existing local fallback computation.
  Assign `"RiotousRookie #" + index` directly, and delete the Step's now-dead
  `rookieName` and `unquote` methods and their imports, which are local to the Step.
- Preserve the existing index scheme, player identity/number, gender, skills,
  position, rookie count, reports, model changes and checkpoint sequencing.
- Focused multiple-rookie, no-network and native/recovery regression coverage.

## Out of Scope

- A new name-generation service, additional randomness, prefetching or HTTP retries.
- A bundled local name list or any naming scheme other than `RiotousRookie #n`.
- Deleting shared FUMBBL endpoint code and configuration (`ServerUrlProperty`,
  `UtilServerHttpClient`, `IServerProperty.FUMBBL_BASE`/`FUMBBL_PORT`,
  `CollectRosters`, `UtilUrl`), which is owned by
  [#513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513).
- BB2025 mechanics changes, new inducements, parallel mutation or storage migration.
- Rewriting names of existing players, completed matches or stored checkpoints.

## Functional Requirements

- Creating a rookie issues zero external name-generator requests and waits on no
  name-generator future, including when the configured endpoint would stall.
- Use the same fallback string/index the Step currently computes. Preserve the
  existing iteration/index behavior across inducement applications and teams;
  do not change player IDs or jersey-number allocation to implement naming.
- Preserve the number and order of native rolls, including rookie-count and
  gender rolls. Local naming adds no RNG draws and does not consume `Fortuna`
  from another thread. Preserve player properties, reports and step progression.
- Keep mutation and checkpoint handling on the owner. Store names through the
  existing action/checkpoint/transcript boundary; exact retries do not create a
  second rookie or rename an already accepted one. Recovery reads stored names
  without remote calls or accepted-command reexecution.
- Respect the same 2,000 ms aggregate request ceiling and 100 ms healthy p99 target
  as other worker work; removing this HTTP dependency does not prove all other
  work in the activating request is compliant.

## Acceptance Criteria

- Native regressions create multiple rookies for both teams and multiple applicable
  inducement entries, checking names and unchanged IDs, numbers, counts, gender,
  skills, reports and native-roll ordering against fixed expected outcomes.
- A test with an unavailable/stalled local test endpoint configured as the old
  name generator proves rookie creation performs zero HTTP requests and completes
  without waiting for that endpoint.
- Checkpoint restore and exact-retry regressions preserve stored rookie identity
  and name with no duplicate player, extra roll or name-generator access.
- Existing Riotous Rookies/native regressions and relevant recovery suites pass;
  unrelated helper behavior and stored-format compatibility remain unchanged.

## Constraints

- Locate or create/assign the tracking issue before implementation; no issue was
  created by drafting this local request and no assignee is implied.
- Create a new working branch; preserve unrelated working-tree changes.
- Follow BB2025/shared-domain placement, instance-service, import and Java 21
  conventions. Preserve ADRs 0002/0004/0006 and browser replay/recovery formats.
- Record the visible rookie naming change under Unreleased in CHANGELOG.md.
- Do not commit, push, publish, deploy or write GitHub state without authorization.

## Implementation Guidance

Keep the change inside the rookie-creation path. Reuse the existing fallback
calculation instead of adding a dependency or changing the shared HTTP helper.
Prefer native outcome tests with controlled rolls to assertions that merely
search the source for a removed call. Use a local, controlled endpoint for the
no-network proof; do not call the real FUMBBL service from tests.

## Validation

Run focused Step/native state tests, no-network regression and checkpoint/retry
tests. After code changes, run browser unit tests/build and the pinned clean
game-server/native verification with `tools/target-build.ps1 verify`. Inspect
rookie names in a representative V2 match/replay smoke check and preserve existing
saved artifacts' read compatibility.

## Completion Notes

The maintainer's ADR approval is recorded in the
[acceptance record](single-engine-worker-adr.md#maintainer-acceptance).
The 2026-11-09 slice 1 handoff additionally authorizes completing #513 after the
local-name change on the same branch. This extends the original local-name-only
scope above without including slice 2. See the
[outcome report](engine-worker-rookie-local-names-outcome.md) for implementation,
verification, startup evidence and limitations.
