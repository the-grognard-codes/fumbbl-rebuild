# M4 workstreams — implementation prompt reference

Status: planning reference produced from the accepted roadmap, PRD, ADRs, kickoff record, and M3e handoff on 2026-09-11. It breaks M4 into independently reviewable tranches; it does not authorize deployment, account-provider procurement, credential changes, catalog expansion, or any deletion/reset of retained evidence.

**R6 planning update, 2026-09-24:** The owner-approved match-screen MVP at `browser-client/src/PitchPreview.tsx` is a local DOM/SVG simulation, preserved alongside `/ui-ux-draft-v2`. Hosted `/play` uses the authenticated `/browser/v2` client and has not adopted the MVP's artwork, layout or mock action logic. The revised roadmap assigns renderer choice, MVP-to-live integration and separate setup/live presentation to M5; M4 R6 supplies current-client release checks and acceptance criteria to rerun on the M5 candidate. The dated DEV/PROD deployment records below supersede this reference's initial no-deployment assumption; this update authorizes no new publication.

## M4 outcome and dependency map

**DEV installation, 2026-09-21:** nginx, native marker-6 runtime and MariaDB are
installed; existing DEV account links are preserved. The exact WSS/CSP client
artifact was published with explicit owner approval; served-artifact parity and
real-browser WSS/reconnect checks passed. The owner subsequently confirmed DEV
create/join, synchronized start and spectating. See
[installation evidence and limits](verification/r3-d/dev-install-20260921.md).

**PROD installation and owner acceptance, 2026-09-21:** separately authorized
nginx, private marker-6 runtime, MariaDB and Hosting rollout completed. Automated
transport checks passed. The owner signed in with three accounts, created/joined
a game, started it as Player A with Player B immediately updated, and spectated
successfully. See [PROD evidence and remaining limits](verification/r3-d/prod-install-20260921.md).
This does not establish operational recovery, backup/restore, capacity or general
public-service readiness.

**Current owner decision — 2026-09-18 R3-C simplification:** authenticated
viewing is enabled by default. Every newly accepted account receives PLAYER and
SPECTATOR application grants; membership in a particular match alone authorizes
its game decisions. Players and spectators share the same public board, resource,
action and decision presentation, with spectators read-only. This supersedes the
earlier mutual-consent and separate neutral-projection requirements below.
A spectator toggle is a possible later feature, not part of this slice. The one
active development path is the Firebase/MariaDB `/browser/v2` runtime and shared
React client. The H2 `/session/v1` proof and marker-5 `/browser/v1` runtime remain
historical references, not parallel account systems for active play. See
[implementation evidence and remaining checks](verification/r3-c-simplification/README.md).

**R3-C completion record (2026-09-19):** complete for the approved local M4
scope. The current protocol matrix documents the sole player and spectator
surface, the server rejects unavailable route families, and the contract suite
checks the route, origin, membership and read-only boundaries. The owner
completed a three-account DEV loopback acceptance: create, accepted join, game
activation and authenticated spectator connection. This is local evidence only;
it does not claim public TLS, deployment, R3-D/R3-E, or full-R3 completion.


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

| Decision | Choices to record | Blocks | Owner Input |
| --- | --- | --- | --- |
| Account and credential lifecycle | Confirm Firebase Authentication with Google and email links as the supported providers; define who can disable/revoke a user, account-deletion/retention behavior, dedicated test-identity ownership, and the review/rotation process for the service's cloud credentials. | R3-A lifecycle policy and live acceptance evidence | Google and email links will be the supported providers in the initial release.  Microsoft will be added as a follow up feature, but guidance for this method of authentication should mostly mirror the former two methods.  The Owner (jacob@thegrognardcodes.com) will be the only site admin on initial deployment.  We will need a method for adding site admins.  Site administrators for molesunderthepitch.org should have administrative powers/tools common for a site of its type.  Disabling, revoking, banning users.  Unlocking accounts if and when that becomes a feature, etc.  Now that we have proven Google and email link access, having test identities that can be used would speed up development.  I can see 5-6 unique accounts being needed to implement thorough testing for both play, administration, and team building.  Only the Owner will need test identity access at this time.  You will need to document all credentials, tokens, certiticates which are not perpetual and which need manual review or renewal.  This is an ongoing request and should be documented as new objects are added.  The owners cloud credentials will be periodically rotated manually. |
| Principal scopes | Define the initial application scopes: player, any future read-only spectator, and separately administered support/admin access. State whether a user may hold more than one scope and how scopes are granted and revoked. | R3-A authorization model and R3-C projections | Initial scopes will be player, spectator, owner, and administrator.  Users may hold any number of scopes.  The site owner for example, will be both Player and Owner and Administrator.  Scopes for player and spectator will be granted to any user that successfully logs in using Google Auth or email links.  Please advise on what methods are appropriate for adding administrative users which would have the ability to remove/revoke a user's account.  Site administrators for server / GCP functions is outside the scope of access at this point, or rather, we can consider the Owner role to be solely in that role. |
| Invitation policy | Choose recipient-bound invitations or explicitly transferable bearer codes; set invitation lifetime, revocation/reissue behavior, acceptance limit, and behavior when a reserved player leaves or the session is abandoned. | R3-B durable invitation semantics | Invitation lifetime should be 15 minutes, or until a game is active, in which case the invite link should last until the conclusion of the game.  Game timeouts and abandonments should be determined by the chess style game clock which should prevent a single player from stalling the game indefinitely assuming one player still remains actively connected.  In cases where both player's have abandoned the game it should persist for 24 hours then be deleted.  The invitation policy must work in a way where Player A can join a game, generate a sharable link, and then post that through whatever channels they prefer and anyone that clicks on the link will be taken to the proposed game.  Player B can then join using the link.  Spectators complicate this method but I don't know of a more streamlined method for open game announcements where Player A doesn't know who their opponent will be when creating the link.  Two additional features will be required for this.  A toggle will need to be available for both Player A and Player B to enable or disable spectators.  If either player has it set to disabled, spectators will not be allowed to join/view the game.  If spectators are allowed, the first person to select JOIN will be Player A's opponent.  If this doesn't seem logical please advise.  The second feature needed will be a save game state request.  Life events sometimes mean a game must be finished hours or days after it has started.  We need a method in which both players mutually select something like "save game state for later" which then stores the game state on the game server where it can be retrieved and resumed later. |
| Public route policy | Decide which, if any, spectator, admin, result/replay, and legacy projections will be exposed in the first public release. The safe default is that each is unavailable. | R3-C final matrix and R3-D enforcement | Spectator will be required for the initial release.  Admin, result/replay, and legacy projections should all be backlogged as features which will be implemented but are out of scope for the initial release.  Spectator should post a link to join any in-progress games where spectator has been enabled (see above). |
| Display-name policy | Decide whether public player names will ever replace `You`/`Opponent`; if so, define their source, validation, moderation, retention, and safe rendering rules. | R3-E name/projection tests | This is not required on initial release, we can keep each player defined as "You/Opponent" for now.  Having user's display their names will be something that requries mapping to an account or some kind of server side storage so that email/google account doesn't have to be directly shown.  A quick interim feature should be backlogged to allow players define their name in the match creation dialog. |

No new provider, OAuth credential, paid service, or public deployment may be created merely to make these decisions. The existing DEV Firebase setup may continue to be used only within the authorization already granted for this proof.

**Recorded invitation clarification (2026-09-17; supersedes the earlier
15-minute/24-hour values in the table):** the creator may explicitly
release a claimed but disconnected opponent before activation; doing so revokes
the old bearer code and issues a replacement. Creator reissue also invalidates
the previous pending code immediately. Pending invitations and fully
disconnected abandoned sessions use a one-hour lifetime.

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

**Superseded policy record:** the following R3-C.1 design and integration
prerequisite are retained for traceability only. The 2026-09-18 owner decision
replaces them with authenticated viewing by default and one shared game view.
A future spectator toggle is backlogged without a selected implementation.
See [current protocol and route matrix](../../browser-client/public-api-v2.md).

**Historical R3-C.1 spectator consent and visibility:** add a read-only spectator
projection only for an in-progress match whose two player slots both currently
allow spectators. Each player has an independent allow/deny control; the
effective policy is allow only when both allow. Consent is selected before
activation and becomes immutable for the active match; a player who does not
want spectators after activation may abandon under the match's separately
defined lifecycle rather than changing spectator access mid-game. Browsing and
watching require an authenticated principal with `SPECTATOR` scope. Discovery
and the spectator projection use only neutral `Home`/`Away` labels: no player or
team names, account data, player chat, private prompts, legal actions, dice
state or recovery data. A stale, guessed or non-visible match must fail as
`NOT_FOUND`; spectator messages have no mutations. This is separate from the
player invitation: the first valid player to use the shareable invitation
remains the opponent, not a spectator.

**R3-C.1 integration prerequisite:** the currently accepted R2 runtime still
uses isolated local home/away fixture subjects, while R3-A's scoped principals
are implemented in the separate `game-service` proof. Before exposing
spectators, introduce a separately versioned, R2-compatible runtime boundary
that maps authenticated principals to persisted match membership and checks
`SPECTATOR` scope before every browse, watch, reconnect and recipient snapshot.
Persist the two pre-activation consent values in compatible recovered match
metadata. Do not upgrade active R2 matches in place; retain their compatible
runtime until completion.

**Recorded runtime transition decision (2026-09-18):** R2 marker-5 storage and
`/browser/v1` are retained offline only as the accepted recovery reference and
synthetic-evidence reproducer. New development matches must use the
R2-compatible marker-6 runtime and `/browser/v2`; `/browser/v1` is not an alias,
redirect or fallback for it. The v2 runtime becomes the sole enabled local
development route only after it has passed authentication, membership,
spectator-projection and recovery-parity checks. No marker-5 volume or retained
evidence is modified or removed during this transition.

#### R3-D — Transport, Origin, and local/public separation

**Closed for the defined R3-D scope, 2026-09-21.** Exact route/Host/Origin
enforcement, hosted TLS, local loopback isolation, environment/credential
separation and denial contracts are evidenced by the linked local and hosted
checks. The owner accepted DEV and PROD create/join/start/spectator testing.
Historical pending statements below describe earlier slices, not the final status.
R3-E, operational recovery, backup/restore, capacity and general public-service
readiness remain separate gates; R3-D closure does not close all of R3 or M4.

**2026-09-21 hosted follow-up:** authorized DEV and PROD marker-6/nginx/Hosting
installations and owner-reported create/join/start/spectator acceptance are now
complete. Exact public TLS/Host/path/Origin denial, private backend ports and
renewal reload checks passed. See [PROD evidence](verification/r3-d/prod-install-20260921.md).
This supersedes the historical unavailable-endpoint and pending-cutover statements
below; it does not claim recovery or general public-service readiness.

**2026-09-19 bounded local hardening:** exact v2 Host/raw-path/Origin and
query rejection, native diagnostic loopback defaults with explicit Docker
forwarding, fixed local DEV identity configuration, and browser/build profile
isolation are implemented. See [commands, results and limits](verification/r3-d/README.md).
The TLS foundation described below belongs to the earlier game service; it is
not evidence of TLS on the authoritative marker-6 v2 runtime. R3-D remains open
for that runtime's approved hosted authority/TLS profile and real TLS tests.
DEV/PROD browser game endpoints remain explicitly unavailable; no deployment
or database transition was performed.

**Owner-approved nginx direction, 2026-09-19 follow-up:** a DEV-only loopback
nginx candidate and opt-in Java handoff are implemented with local TLS tests.
See [proxy evidence](verification/r3-d/proxy.md). The VM/IP/DNS and live
certificate hooks are unchanged. Native marker-6 VM/storage configuration,
Linux/integrated acceptance and authorized cutover remain open; PROD is not enabled.

**Native/Linux follow-up:** the strict native DEV launcher/profile and inactive
systemd candidate are now implemented. Real Linux nginx-to-Jetty/v2-worker
authentication, reconnect and graceful-reload checks passed. See
[native/Linux evidence](verification/r3-d/native-linux.md). Native database
provision/copy, real Firebase/MariaDB play/recovery acceptance, capacity and VM
activation remain open. No retained storage, service credentials or live listeners
were changed.

**Local proxy follow-up, 2026-09-20:** `local-dev` now selects loopback nginx on
port 22232, forwarding to the unchanged Java publication on 22231. Exact route,
Origin, Host, query/header rejection and safe logging checks passed; a native
browser reached the real Java authentication gate through nginx on initial
connection and reconnect. Real signed-in play through this path remains a manual
check. This retains the local diagnostic WS exception, not TLS parity or a
DEV/PROD rollout. See [evidence and limits](verification/r3-d/local-nginx.md).

**Completed foundation:** the game service accepts only TLS WebSockets and fixes the allowed Origin, Firebase project, issuer, and audience from the selected DEV or PROD profile. Hosted clients use WSS only; the service rejects query strings before authentication. The local diagnostic client remains separately configured.

**Remaining implementation:** apply the same exact host/path and Origin policy to every route in R3-C, make local development loopback-only for any diagnostic transport, and add configuration tests proving that a local, DEV, or PROD configuration cannot select another environment's Origin, project, route, or insecure transport.

**Evidence:** TLS-required profile tests, exact/missing/foreign-Origin tests, DEV-to-PROD and PROD-to-DEV credential rejection, insecure/query credential rejection, and a documented local loopback check. A production deployment is not R3 work and remains separately authorized.

#### R3-E — Projection-safe rendering, logs, and acceptance record

**2026-09-21 bounded implementation:** all nine current v2 response envelopes
have explicit field contracts and negative private-field tests. Player/watch
role mismatches, foreign uncertain-save documents and creator-only invitation
exposure fail closed in the browser. Coach labels apply the approved
You/Opponent and spectator Home/Away policy. Native projection and service
authorization tests, three-context safe-rendering/console checks, and bounded
read-only DEV journal inspection passed. See [evidence](verification/r3-e/README.md).
The browser candidate is not deployed; real hosted acceptance of this candidate
and broader R3 closure remain separate. No custom-name or new-chat feature is added.

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

**Backlog — R4.1 mutual save-and-resume:** implement a two-player request,
accept, reject and cancellation protocol that suspends a match only after both
current player slots agree. Persist a compatible authoritative recovery
checkpoint, pending-decision/revision/request history and clock state before
acknowledging suspension; resume is restricted to the original members and
must not re-run an accepted action or roll new dice. Define the clock treatment
while suspended, save expiry/abandonment and deletion rules, restart/backup
behavior, and rejection outcomes before implementation. This work depends on
R2 recovery compatibility and joins R4's retention and capacity evidence; it
does not authorize an in-place engine/runtime upgrade.

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

**Objective:** prove the integrated desktop match client works across declared browsers, layouts, zoom levels and assistive technologies, and record a public-use decision for each shipped asset. The local MVP is design evidence, not release acceptance.

**Present surfaces and evidence (2026-09-24):** `/pitch-preview` is an isolated React DOM/SVG simulation; `/ui-ux-draft-v2` preserves the earlier study. The authenticated `/play` route uses `play-entry.tsx`, `V2Client`, the authoritative `/browser/v2` service and DOM `GameView` controls in `SetupPanel.tsx`. The MVP has a 26 x 15 pitch, 64:56 normal-player-to-square ratio (80:56 for large players), 56px fit when space permits and about 48px squares at 1920 x 1080, Human/Orc chibi sprites, resource icons, player cards, dugouts, movement overlays/paths, action strip and log/chat. It supports repeated-click deselection, Space to confirm a pinned valid sample action, Escape, zoom and pan. Its inferred actions, success outcomes, resource counts, log, chat and End Turn are mock state. Selected Chrome/Playwright viewport and fullscreen Fit checks passed; the required cross-browser, zoom and screen-reader matrix has not run. Keep its evidence separate from live match evidence and M1 Pixi/WebGL tests.

### R6-0 — Renderer decision and live UI handoff (M5 implementation, R6 gate)

Record an ADR-002 addendum before adopting the MVP board on the live route: keep Pixi for the board or select DOM/SVG after measured match performance, interaction and accessibility comparison. ADR-002 preferred Pixi but expressly allowed reconsidering DOM if a prototype proved simpler. Neither implementation inherits the other's test results. Pixi's Canvas renderer was announced as experimental after the ADR, but the current M1 board explicitly requests WebGL; do not count Canvas or accessibility fallback without testing the exact pinned renderer and a usable DOM control path. [Pixi v8.16 announcement](https://pixijs.com/blog/8.16.0); [current renderer guide](https://pixijs.com/8.x/guides/components/renderers).

Map the approved presentation components to the `/browser/v2` snapshot and server-issued legal actions. The server remains authoritative for role, actor, prompt, legality, targets, resources, dice, outcomes and revisions. Replace MVP sample players, inferred legality and assumed-success commits; version the browser DTO and Java adapter if presentation needs fields the public snapshot lacks. Space and visible Commit must invoke one validated command path. Preserve `V2Client` request IDs, pending-command lock, exact retry, reconnect, save/resume and spectator read-only behavior. The accepted [active-match publication ADR](../../docs/adr/0001-active-match-publication.md) owns viewer enrollment and recipient updates; the UI must not create another publication stream.

**Handoff gate:** two authenticated players and an authorized spectator agree on the current revision, prompt, resources and outcome after an accepted action, rejection/stale action, disconnect/reconnect and pending decision. No new action is sent while outcome is uncertain. Existing labeled DOM grid/action controls remain available until the replacement passes these checks. Assemble the matching DEV Firebase Hosting artifact and verify the live route, asset base paths and CSP against that artifact before any separate publication decision.

### R6-1 — Desktop browser, layout and zoom matrix

Record actual OS/browser versions and execution on current stable Chrome, Edge and Firefox on declared desktop platforms, and Safari on macOS. Test 100% and 200% browser zoom at 1280 x 720 and 1920 x 1080 CSS layouts; include 1920 x 900, 1920 x 820 and a reduced viewport near 1280 x 660 from the accepted [pitch requirements](../art-preview/pitch-and-ui-requirements-v2.md) where practical. Capture CSS content viewport, display scale, screenshots and measurements. Check 26 x 15 square geometry, one-square end zones, 4/7/4 wide-zone markings, sprite clarity/overlap in crowded formations, visible prompt and selected-player details, unclipped decision/End Turn controls, keyboard access to pan/zoom and stable Fit on fullscreen/resizing. List unavailable combinations as untested release gaps, never as passes.

### R6-2 — Keyboard and screen-reader paths

Inventory every live match control and record Tab/Shift+Tab, focus, Enter/Space and Escape paths: player selection/deselection, grid target and path preview, action menu and Commit, block/blitz/foul/pass/handoff, player details, resources, bench/KO/casualties, log/chat, End Turn, setup choices, server prompts, save/resume, reconnect/exact retry and spectator navigation. Hover affordances need focus equivalents; color-coded risk and team identity need text/shape cues. Text entry, dialogs, held keys and invalid/unpinned targets must not trigger Space commit.

Record observed speech and focus order with declared browser/AT pairs, including NVDA with Windows Chrome/Edge and VoiceOver with macOS Safari if supported. Verify selection, actor/prompt, accepted/rejected/pending actions, turn/resources, connection loss, resync, asset/renderer failure and full time. ARIA inspection or automation alone is not screen-reader evidence. Keep an accessible text summary of the focused square/player and native labeled controls.

### R6-3 — Renderer and asset failures

Inject missing/corrupt sprites and fonts, renderer startup failure if a GPU renderer is used, stale state and disconnect. Show labeled fallback tokens, retained legal-action controls and actionable recovery text rather than a blank game view. Check failures never bypass actor/role or pending-command restrictions. Run M1 Pixi/WebGL failure tests separately from the current DOM/live route and document which renderer each observation covers. Fix defects in the owning slice or list reproducible release blockers with impact and retest criteria.

### R6-4 — Asset provenance and public-use disposition

Inventory every asset actually shipped by the match bundle and DEV/PROD Hosting artifacts: Human/Orc 64px chibi packs and earlier exports, ImageGen icon atlas and concept reference, bundled Alegreya SC/Barlow Semi Condensed fonts and OFL notices, pitch textures, site branding/logos, fallback tokens and any legacy imports. For each record path and served route, creator/source, prompt or source manifest, transformation, license/owner-permission evidence, attribution and keep/replace/omit disposition. The sprite source manifests and prompts are under `.notes/art-preview/*-team-64px-chibi-v1/`; icon provenance is in `browser-client/public/preview/mvp-art/PROVENANCE.md`; the [MVP notes](../../browser-client/pitch-layout.md) and [brand guardrails](../../docs/moles-under-the-pitch-branding-assets.md) identify current usage and constraints. Generated-art provenance, neutral test tokens and local catalog evidence do not establish artwork rights. Unresolved public-use permission blocks that asset until the owner/content reviewer records a disposition or the asset is removed/replaced.

### R6-5 — Dedicated setup and live match surfaces (M5 presentation backlog)

The accepted [team-builder ADR](../../docs/adr/0001-account-owned-match-ready-teams.md) already gives `/teambuilder` a separate authenticated builder. `/play` still combines match creation/join, game browsing and live `GameView`. Move preparation to a setup-only route and navigate to a distinct match page only after the server confirms both player slots and activation. Allow authorized spectators into the same read-only match page. Support direct accessible resume after reload/reconnect or an uncertain request; no local animation/flag may assert activation. Keep the same authenticated `V2Client` contract, membership checks, request IDs, revision order, retry/recovery and publication policy. Verify both-player activation, setup-to-play navigation, spectator entry, pending-decision reload and full-time exit. This is a presentation/workflow slice, not a second match authority.

**R6 acceptance record:** retain the executed matrix with versions, CSS viewport and browser zoom, fixtures, screenshots, observed screen-reader speech/focus, defects/retests, renderer decision, live contract checks, fallback results and reviewed asset inventory. Label local MVP, live DOM client and M1 Pixi evidence separately. R6 does not close R1-R5 or establish general public-service readiness by itself.

**Out of scope:** visual redesign, new roster artwork, mobile delivery, rules changes and a public art-license conclusion without owner/content-review evidence.

## Runtime decision — Java 8, 21, and 25

M4 explicitly covers a server-runtime upgrade from Java 8 to Java 21: ADR-001 accepts Java 21 as the new server target, and the M3e handoff calls for separately proving the accepted Java 21/supported-Jetty direction. The current Java 8/Maven checks are a characterization reference, not the M4 end state. Jetty 12 requires Java 17+, so remaining on Java 8 is incompatible with the accepted maintenance direction.

Java 25 is now the newer LTS and is the stronger long-term production target if this project chooses a currently maintained OpenJDK distribution. It is not necessary to unlock the architectural work: Java 21 already supports Jetty 12 and supplies the major modernization features most relevant here (records, pattern matching, virtual threads, structured concurrency as a preview API, and modern TLS/GC/runtime improvements). Java 25 adds newer language/runtime/platform features, but none is required for M4's turn-based service; adopt features only after profiling and compatibility needs justify them. The concrete advantage is lifecycle: Oracle identifies Java 25 as the latest LTS, while its free Java 21 updates are scheduled to move from NFTC to OTN terms after September 2026. Distribution-specific support/licensing differs, so record the chosen vendor and support policy rather than relying on Oracle dates for every distribution.

**Recommendation:** use a staged *verification* upgrade, Java 8 -> 21 -> 25, but do not make Java 21 a long-lived production deployment waypoint. First establish Java 21/Jetty 12 parity exactly as the accepted ADR requires; then run the same full compatibility matrix on Java 25 and make Java 25 the released M4 runtime if it passes. This isolates source/API/Jetty migration failures from 25-specific runtime changes, preserves a dependable diagnostic path, and avoids finishing M4 on an older LTS immediately before its Oracle free-update transition. Keep source/bytecode targeting intentional: compile for the chosen deployment JDK, do not claim Java 8 runtime compatibility after adopting Jetty 12, and pin the exact JDK in CI/container/local evidence.

Primary references: [ADR-001](04-technology-and-decisions.md#adr-001-java-backend-modernize-runtime-independently), [M4 handoff](verification/m3e/m4-handoff.md), [roadmap](06-roadmap-and-prototype.md), [Oracle Java downloads](https://www.oracle.com/java/technologies/downloads/), and [Oracle's Java 21 licensing transition notice](https://blogs.oracle.com/java/jdk-21-approaches-end-of-permissive-license).
