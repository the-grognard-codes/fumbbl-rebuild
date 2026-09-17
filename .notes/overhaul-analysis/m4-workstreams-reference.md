# M4 workstreams — implementation prompt reference

Status: planning reference produced from the accepted roadmap, PRD, ADRs, kickoff record, and M3e handoff on 2026-09-11. It breaks M4 into independently reviewable tranches; it does not authorize deployment, account-provider procurement, credential changes, catalog expansion, or any deletion/reset of retained evidence.

## M4 outcome and dependency map

M4 is the public-service-readiness milestone. Its acceptance is not a single build or test run. It requires process-failure recovery at a pending decision, role/projection verification, a measured load envelope, a successful separate-environment backup restore, and recorded content provenance. Runtime, authentication, operations, and release acceptance must be independently recorded.

```text
R1 Runtime/transport ─────┬──> R3 Identity and route policy ──┐
                           ├──> R4 Capacity and retention ─────┼──> R6 release evidence
R2 Durable recovery ──────┼──> R5 Backup/operational failure ─┤
R3 Identity/route policy ─┘                                   │
R6 Renderer/content checks ───────────────────────────────────┘
```

Begin R1 and R2 in parallel. R3 needs an owner-approved account-provider and credential-lifecycle decision before production integration. R4 must use the recovery and runtime behavior actually delivered; R5 must back up and restore the compatible versions introduced by R1/R2. R6 is independently executable, but its evidence joins the final release record.

## Shared prompt preamble — include in every tranche request

> You are implementing one bounded M4 tranche in the FUMBBL rebuild. Preserve unrelated working-tree changes; do not reset, delete, truncate, or recreate existing database/backup volumes or retained synthetic evidence. The current accepted baseline is Java/Maven, the authoritative BB2025 Java engine, MariaDB/JDBC, React/Vite, and versioned JSON WebSockets. The frozen Human catalog, engine behavior, and replay schema are out of scope unless this tranche explicitly versions and validates a compatibility boundary. Keep server authority: membership/role checks precede every mutation, read, and retry; client input never determines dice, legality, or private state. Maintain one-at-a-time match mutation unless measured evidence justifies a separately reviewed concurrency change.
>
> Do not publish, deploy publicly, provision a cloud account, select/pay for an account provider, or change credentials. Preserve loopback/local safety until the required authorization and TLS/origin work are accepted. Do not upgrade active matches in place: drain them or retain a compatible runtime until completion, and demonstrate format/engine parity before any transition.
>
> Start by reading the M3e acceptance report, `browser-client/disconnect.md`, `browser-client/action-coverage.md`, schema-4 migration material, accepted ADRs, and the M4 handoff. Work in a small, reviewable slice. Add focused characterization/contract tests and exact evidence for all changed behavior. Run the narrowest meaningful checks first, then the risk-appropriate Maven/browser/database checks. Record commands, versions, fixtures, configuration, result data, and known limits. Do not claim public-service readiness or another tranche's gate from local-only evidence.

## R1 — Runtime and transport maintenance

**Objective:** replace the unsupported Java 8 server runtime/Jetty 9.4 direction with a supported runtime and Jetty line while preserving the Java 8 characterization baseline as a comparison oracle.

**Scope:** build/toolchain configuration, dependency compatibility inventory, Jetty 12.x integration, WebSocket framing/origin/queue/timeout/async-callback checks, and a controlled runtime compatibility boundary. Keep MariaDB/JDBC unless a demonstrated driver/server incompatibility requires a separately documented update.

**Must deliver:**

- A reproducible Java 8 baseline result and a separately reproducible target-runtime build/test result; record exact JDK vendor/version and dependency versions.
- An upgrade to a supported Jetty 12.x line, with tests for valid/invalid framing, decoded-size limits, origin enforcement appropriate to the environment, bounded slow-client queues/resync, timeouts, asynchronous callbacks, and clean close/failure behavior.
- A compatibility policy for active matches, including engine/catalog/replay/recovery artifact versions and a no-in-place-upgrade rule until parity is proven.
- Dependency and API changes documented as intentional compatibility adaptations, not silent behavior changes.

**Acceptance evidence:** existing behavior is characterized on Java 8; the target runtime passes the relevant reactor, browser-contract, and live local WebSocket checks; no duplicate action/dice/resource use occurs under retry; and no active match is silently reinitialized or reinterpreted.

**Out of scope:** durable restart recovery itself (R2), real-provider authentication (R3), capacity benchmarks (R4), external deployment, and catalog expansion.

## R2 — Durable in-progress engine recovery

**Objective:** recover an unfinished, authoritative match after a process kill without altering the pending decision, actor, resources, dice state, or request semantics.

**Scope:** versioned recovery artifact and repository/lifecycle behavior. The artifact must cover engine stack/dialog, frozen inputs, authoritative revision, dice state, accepted request history/idempotency information, and pending terminal persistence. Keep recovery data distinct from browser DTO and replay-format versions.

**Must deliver:**

- A defined recovery format and compatibility/rejection policy; pin engine, catalog, replay, and recovery versions.
- Atomic or explicitly recoverable persistence boundaries, including terminal commit ambiguity; preserve membership checks before every mutation/read/retry after restoration.
- Process-kill tests during pre-match, placement, defending-team decision, drive/half transition, and terminal commit.
- Evidence that restoration presents precisely the original decision, actor, resources, and revision, and that an acknowledged/lost-ack request is replayed without a second engine execution.

**Acceptance evidence:** real process termination—not graceful browser reconnect or completed-result read—followed by restart and two-client verification for every listed failure point. Include persisted/recovered artifact inspection and failed-recovery behavior for unsupported/corrupt versions.

**Out of scope:** generalized event-sourcing rewrite, historical replay import, capacity cleanup policy (R4), and public identity provider work (R3).

## R3 — Real identities and production route policy

**Current status (2026-09-17): partially complete.** The isolated DEV game-session proof has replaced the local diagnostic credential prompt on hosted `/play` with Firebase Authentication. Google and email-link users receive a fresh Firebase ID token only after WSS opens. The service verifies signature, expiry, issuer, audience, project, disabled-user and revocation state; maps the verified issuer/UID to a provider-neutral internal account; and never places the token in a URL, outbound message, or application log. It enforces one live connection per account, private two-player invitation-code sessions, reconnect, membership checks, bounded ordered chat history, exact DEV/PROD Origin configuration, and TLS-only game transport. The local diagnostic client remains an explicit local-only configuration.

The proof also has signed-JWT verifier tests, TLS WebSocket protocol tests, DEV-to-PROD and PROD-to-DEV rejection tests, invalid/malformed/expired-token tests, missing/foreign-Origin and query-token rejection tests, plus a successful two-browser-profile DEV acceptance run. Chat and event UI rendering uses `textContent` and exposes only `You` and `Opponent`.

It does **not** yet provide application scopes, durable invitation records or revocation, spectator/admin/result/replay/legacy projections, a complete route matrix, or the independent role/projection evidence required to close R3.

**Objective:** extend the verified session proof into scoped, revocable identities and a route/recipient policy suitable for public exposure. R3 is an M4 workstream; it does not reopen M3 engine, result, or replay implementation.

### Owner decisions required before dependent implementation

The Firebase proof establishes a provider choice in practice, but the following decisions must be recorded by the owner before the dependent R3 slices are accepted. These are product and access-policy choices, not implementation details that an agent should infer.

| Decision | Choices to record | Blocks |
| --- | --- | --- |
| Account and credential lifecycle | Confirm Firebase Authentication with Google and email links as the supported providers; define who can disable/revoke a user, account-deletion/retention behavior, dedicated test-identity ownership, and the review/rotation process for the service's cloud credentials. | R3-A lifecycle policy and live acceptance evidence |
| Principal scopes | Define the initial application scopes: player, any future read-only spectator, and separately administered support/admin access. State whether a user may hold more than one scope and how scopes are granted and revoked. | R3-A authorization model and R3-C projections |
| Invitation policy | Choose recipient-bound invitations or explicitly transferable bearer codes; set invitation lifetime, revocation/reissue behavior, acceptance limit, and behavior when a reserved player leaves or the session is abandoned. | R3-B durable invitation semantics |
| Public route policy | Decide which, if any, spectator, admin, result/replay, and legacy projections will be exposed in the first public release. The safe default is that each is unavailable. | R3-C final matrix and R3-D enforcement |
| Display-name policy | Decide whether public player names will ever replace `You`/`Opponent`; if so, define their source, validation, moderation, retention, and safe rendering rules. | R3-E name/projection tests |

No new provider, OAuth credential, paid service, or public deployment may be created merely to make these decisions. The existing DEV Firebase setup may continue to be used only within the authorization already granted for this proof.

### R3 implementation workstreams

#### R3-A — Principal, scope, and credential-lifecycle model

**Can proceed now:** define provider-neutral interfaces and local doubles for internal principals, scope checks, expiration, disabled/revoked identity handling, and safe audit/log fields. Preserve the current `issuer + subject -> internal account` identity link; do not trust client-provided email, name, role, or UID.

**Requires the owner decisions above:** persist the approved scope grants and lifecycle policy, integrate their granting/revocation mechanism, and write the operational runbook. Firebase token verification alone establishes identity; it does not grant application roles or scopes.

**Evidence:** positive and negative tests for every scope, revoked/disabled/stale credentials, no account creation after rejected authentication, and absence of token, raw UID, email, private account data, and private team data in logs.

#### R3-B — Invitation, player-slot, and reconnect policy

**Can proceed now:** characterize the current session-code proof and write contracts for one account/one player slot, duplicate connection behavior, reconnect ordering, cross-session rejection, and the current process-local inactivity/purge behavior.

**Requires the owner decisions above:** implement durable invitation records with the selected recipient/bearer rule, expiry, revocation/reissue, acceptance behavior, and abandoned-session policy. Do not silently turn the current shareable 128-bit code into a recipient-bound invitation without that decision.

**Evidence:** independent two-player tests for valid acceptance, cross-match and non-invitee attempts, expired/revoked invitation, duplicate intent, disconnect/reconnect, simultaneous reconnect, and every defined failure response.

#### R3-C — Route-projection matrix and public exposure policy

Create and keep the following matrix with the public API specification. A route that is not authorized for the first release must be explicitly unavailable rather than implicitly protected by a missing client link.

| Projection / route family | Initial safe default until authorized | Required matrix fields before exposure |
| --- | --- | --- |
| Player session (`/session/v1`) | Firebase-authenticated player; only the account's own slot plus the other slot's minimal presence/event projection; create, accepted join, chat, leave, and reconnect only | Authentication, player-scope authorization, invitation/membership rule, recipient DTO, permitted mutations, close/error response |
| Spectator | No route or protocol message; reject as unavailable | Authentication and spectator scope, match visibility rule, read-only DTO, no mutation rule, failure response |
| Admin/support | No public route; keep cloud/operator access outside the game protocol | Separate principal/scope, audited operations, recipient projection, permitted mutations, denial response |
| Result and replay | No public route until R2/M3 durable artifacts and the release policy exist | Authentication/scope, participant/public visibility rule, redacted DTO, read-only rule, failure response |
| Legacy endpoints | Not served by the game-service host; reject rather than proxy to FUMBBL or the legacy desktop server | Explicit host/path boundary, authentication/authorization if ever introduced, recipient projection, mutation rule, failure response |

**Can proceed now:** inventory all deployed host paths, add contract tests that unavailable route families return the selected denial (`404` for absent routes or `403` for recognized but forbidden routes), and document the exact game-service/legacy boundary.

**Requires the owner decisions above:** expose any non-player route or finalize its participant/public visibility and administrator policy.

#### R3-D — Transport, Origin, and local/public separation

**Completed foundation:** the game service accepts only TLS WebSockets and fixes the allowed Origin, Firebase project, issuer, and audience from the selected DEV or PROD profile. Hosted clients use WSS only; the service rejects query strings before authentication. The local diagnostic client remains separately configured.

**Remaining implementation:** apply the same exact host/path and Origin policy to every route in R3-C, make local development loopback-only for any diagnostic transport, and add configuration tests proving that a local, DEV, or PROD configuration cannot select another environment's Origin, project, route, or insecure transport.

**Evidence:** TLS-required profile tests, exact/missing/foreign-Origin tests, DEV-to-PROD and PROD-to-DEV credential rejection, insecure/query credential rejection, and a documented local loopback check. A production deployment is not R3 work and remains separately authorized.

#### R3-E — Projection-safe rendering, logs, and acceptance record

**Completed foundation:** session chat is plain text in the browser and session messages/logs contain no Firebase token, UID, email, or display name. The deployed service does not log authentication or chat contents.

**Remaining implementation:** give every future recipient DTO an explicit projection test, apply the approved display-name policy, and retain a concise release evidence record. Do not inspect or export browser WebSocket frames or HAR files because the browser's private authentication message necessarily contains its own bearer token.

**Evidence:** role-by-role positive and negative browser/service tests that attempt to read or mutate out-of-projection state, plus a bounded browser Console and service-journal inspection without verbose token or HTTP tracing.

### R3 completion criteria

R3 closes only when the owner decisions are recorded, the approved R3-A through R3-E work is implemented, and independent positive and negative tests cover every row of the final route-projection matrix. Required scenarios include cross-match access, stale/disabled/revoked credentials, invitation failure/expiry/revocation, reconnect, duplicate intents/connections, and attempts to read or mutate state outside the recipient projection. The current two-player DEV proof is evidence for part of the player-session row; it is not evidence for absent or future route families.

**Out of scope:** selecting or purchasing a provider without authorization, public deployment, expanding the spectator feature beyond an authorized read-only projection, and implementation of M3 engine/result/replay behavior merely to populate a route matrix.

## R4 — Capacity, retention, and completed-session release

**Objective:** replace the current 32-resident-lifetime ceiling with a bounded, observable session/retention policy that cannot double-execute durable work.

**Scope:** release completed/failed engines, retained request/replay bounds, abandoned-match policy, operational metrics, and declared-workload measurement.

**Must deliver:**

- A documented lifecycle for active, completed, failed, abandoned, and recoverable sessions. Completed engine release occurs only after durable result/retry behavior proves it cannot reinitialize or execute twice.
- Explicit retention/eviction limits for request history and replay/recovery data, with correct behavior at limits and no silent loss of an action awaiting recovery.
- A declared workload, machine/JDK/browser/database configuration, and measured heap/RSS, CPU where practical, queue delay, p95 accepted-action and reconnect latency, snapshot/replay size, failures, and cleanup behavior.

**Acceptance evidence:** repeatable run results—not M3e functional-fault counts—with enough lifecycle pressure to exercise release, eviction, slow clients, reconnect, retry, and abandoned sessions. State the supported envelope and the chosen rejection/backpressure behavior; do not invent production capacity claims.

**Out of scope:** a per-match actor/microservice rewrite, host-sizing purchase, and changing recovery semantics without R2 review.

## R5 — Backups and operational-failure recovery

**Objective:** prove that a compatible backup can restore an M4 match state, including one paused at a decision, into a separate approved environment.

**Scope:** backup manifest/adapter, restore procedure, compatibility versioning, migration failure/rollback boundaries, and failure exercises: database outage, partial migration, full disk, ambiguous COMMIT, process restart, and rollback.

**Must deliver:**

- Backup coverage for schema/data and compatible engine/catalog/replay/recovery/runtime version identifiers; secrets are referenced by secure configuration, never captured as evidence.
- A reproducible restore into a separate local/approved environment that compares membership, frozen teams, results, pending decisions, versions, and recovery/idempotency behavior.
- Clear procedures and tested behavior for database outage, partial migration, full disk, ambiguous commit, restart, and rollback. A schema-4 restart or JDBC fault injection alone is insufficient.

**Acceptance evidence:** a retained backup restored separately, with a paused-decision match and completed result verified by both users and direct data comparison. Record restore time, data/version checks, observed failures, and the exact rollback boundary.

**Out of scope:** cloud-provider selection, production backup credential provisioning, unsupported cross-version restores, and destructive reset of existing evidence.

## R6 — Desktop renderer, accessibility, and content-release checks

**Objective:** establish that the present DOM-controlled desktop client is robust and accessible across declared browsers/layouts, and that public-facing assets have recorded provenance.

**Scope:** actual browser checks at 100% and 200% zoom, 1280x720 and 1920x1080 layouts, current Chrome/Edge/Firefox/Safari, screen-reader flows, keyboard controls, DOM fallbacks, and asset provenance recording. M1 Pixi/WebGL behavior remains a distinct test surface where relevant.

**Must deliver:**

- A browser/accessibility matrix with tested versions/platforms, layout and zoom evidence, keyboard paths for every current match control, and screen-reader evidence for state/prompt/error changes.
- Defects fixed or documented as explicit release blockers; preserve labeled fallback controls and an actionable renderer failure path instead of a blank game view.
- An asset inventory with source, license/permission/provenance status, and public-use disposition. Neutral tokens/local catalog evidence do not constitute an artwork license audit.

**Acceptance evidence:** recorded execution of the matrix plus provenance review. Evidence must distinguish the current DOM match surface from M1 Pixi tests and must not claim that Pixi automatically provides a canvas or accessibility fallback.

**Out of scope:** a visual redesign, new roster artwork, mobile delivery, or a public art-license conclusion without the necessary owner/legal evidence.

## Runtime decision — Java 8, 21, and 25

M4 explicitly covers a server-runtime upgrade from Java 8 to Java 21: ADR-001 accepts Java 21 as the new server target, and the M3e handoff calls for separately proving the accepted Java 21/supported-Jetty direction. The current Java 8/Maven checks are a characterization reference, not the M4 end state. Jetty 12 requires Java 17+, so remaining on Java 8 is incompatible with the accepted maintenance direction.

Java 25 is now the newer LTS and is the stronger long-term production target if this project chooses a currently maintained OpenJDK distribution. It is not necessary to unlock the architectural work: Java 21 already supports Jetty 12 and supplies the major modernization features most relevant here (records, pattern matching, virtual threads, structured concurrency as a preview API, and modern TLS/GC/runtime improvements). Java 25 adds newer language/runtime/platform features, but none is required for M4's turn-based service; adopt features only after profiling and compatibility needs justify them. The concrete advantage is lifecycle: Oracle identifies Java 25 as the latest LTS, while its free Java 21 updates are scheduled to move from NFTC to OTN terms after September 2026. Distribution-specific support/licensing differs, so record the chosen vendor and support policy rather than relying on Oracle dates for every distribution.

**Recommendation:** use a staged *verification* upgrade, Java 8 -> 21 -> 25, but do not make Java 21 a long-lived production deployment waypoint. First establish Java 21/Jetty 12 parity exactly as the accepted ADR requires; then run the same full compatibility matrix on Java 25 and make Java 25 the released M4 runtime if it passes. This isolates source/API/Jetty migration failures from 25-specific runtime changes, preserves a dependable diagnostic path, and avoids finishing M4 on an older LTS immediately before its Oracle free-update transition. Keep source/bytecode targeting intentional: compile for the chosen deployment JDK, do not claim Java 8 runtime compatibility after adopting Jetty 12, and pin the exact JDK in CI/container/local evidence.

Primary references: [ADR-001](04-technology-and-decisions.md#adr-001-java-backend-modernize-runtime-independently), [M4 handoff](verification/m3e/m4-handoff.md), [roadmap](06-roadmap-and-prototype.md), [Oracle Java downloads](https://www.oracle.com/java/technologies/downloads/), and [Oracle's Java 21 licensing transition notice](https://blogs.oracle.com/java/jdk-21-approaches-end-of-permissive-license).
