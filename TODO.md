# TODO

- [ ] **M5 authoritative success percentages.** Add a reviewed, versioned
  `/browser/v2` contract for any per-step or whole-path success percentage shown
  on the DOM/SVG movement overlay. Define whether each value includes rerolls,
  distinguish it from a dice target such as `3+`, and verify the calculation
  against BB2025 engine cases and actor/spectator projections. Until the server
  supplies this information, omit percentage labels from the live client; do
  not derive odds from the local parity preview's illustrative risk colors.

- [ ] **R4 storage admission policy.** Define the configured FUMBBL-owned
  storage roots and enforce the requested 5 GiB per boot-disk admission cap
  before a new durable write. The policy must account for match results,
  recovery checkpoints, future transcript/chat records and database overhead
  without deleting accepted history, backups, database volumes or retained
  synthetic evidence. It must fail closed with a distinct retry-safe response,
  record usage/rejection metrics, and be characterized against an isolated
  MariaDB volume. Shared operating-system, unrelated service, and MariaDB log
  use must not be attributed to FUMBBL without an explicit storage-root mapping.

- [ ] **R4 concurrent-match envelope.** Measure the current single-worker
  runtime under a declared mixture of 32 resident active matches, reconnects,
  durable checkpoints, slow recipients and completed-session release. Record
  queue delay, p95/p99 accepted-action/reconnect latency, heap/RSS, CPU,
  MariaDB/container resource use, failures and cleanup. This measurement does
  not authorize parallel per-match mutation or multi-instance ownership.

- [ ] **R4 operational telemetry and procedures.** Export the existing
  lifecycle/transport/storage counters through a reviewed local metrics surface,
  define logs, dashboards, alerts, accountable responders, retention and
  runbooks for the future centralized logging/metrics stack. Keep endpoints,
  credentials, alert destinations and deployment integration out of scope until
  production operations are explicitly authorized.

- [ ] **R4.1 mutual save and restore.** Complete and accept the deliberate
  two-player save/resume experience after the MVP: consent/reject/cancel controls,
  durable compatible checkpoint, paused/rebased clock, 30-day saved-match window,
  restart/backup recovery and a real browser/MariaDB save-resume journey. Track an
  ordinary disconnected original player separately and allow recovery for only 24
  hours from that disconnect; it must remain a deliberate two-player choice rather
  than a disconnect outcome. Coordinate its retained state and replay coverage
  with `browser-client/replay-transcript-chat.md`.

- [ ] **Versioned complete transcript and match chat.** Replace replay format 1
  through a reviewed format/migration boundary that records accepted action
  intent, authoritative dice/report outcomes, revision snapshots and durable
  timestamped player chat. Remove obsolete format-1 replay artifacts/reader as
  part of build-phase migration; provide the same authoritative information to
  players and spectators, let players control live spectator subscriptions only,
  make every completed replay public, preserve exact retries and server-side
  authorization, and do not treat browser-local sample chat as authoritative.
  See `browser-client/replay-transcript-chat.md`.

- [ ] **R3-A account lifecycle and profile capability.** Before exposing
  persistent user-owned teams, profile avatars, custom display names, or other
  account data, define and implement the owner-operated lifecycle: audited
  administrator grant/revoke and disable/revoke actions; account deletion,
  anonymization and retention rules for identity links, teams and profile
  assets; credential review/rotation cadence; and a tested operational runbook.
  Keep Firebase identity verification separate from application authorization,
  never self-grant privileged scopes, and preserve membership/recovery records
  according to the approved retention policy. This must be a versioned,
  projection-safe change; it does not authorize a public admin route or alter
  existing accounts now.
- [ ] **R5 non-blocking follow-up: full Slice 2 browser completion test.** R5 is
  accepted as complete and this item does not block R6 or other future work. After
  an approved versioned `/browser/v2` completed-result/replay surface exists,
  repeat the separate current-version restore acceptance with two independent
  sessions for the original fixture users. Verify both users' paused-decision
  projections and completed result/replay, direct data parity, authorization
  denials, retained exact-request reconciliation without re-execution, and one
  authoritative post-restore continuation. Keep restore-time equality separate
  from intentional later changes, retain the backup and restored environment,
  and do not substitute mocked browser responses for the live completed-replay
  check.

- [ ] **R5.1 operational failure and rollback boundaries.** This is deferred,
  non-blocking follow-up work. Schedule it after the planned review and any
  significant, explicitly versioned game-engine changes, then select and document
  the new current compatibility tuple before creating or choosing its retained
  backup. Do not reuse the r4.1 fixture merely for convenience, convert historical
  checkpoints without a supported requirement, or upgrade active matches in
  place. Using new isolated copies, identify the actual supported migration path;
  same-version restore has no migration, and an unsupported predecessor path must
  be recorded as such. If marker-5-to-6 or another predecessor migration remains
  supported, interrupt it between meaningful durable steps and prove that MariaDB
  DDL commit behavior leaves a state that safely completes or fails closed without
  serving matches. Exercise genuine bounded backup-output and database-storage
  exhaustion without filling the host or retained volumes. Verify controlled
  persistence uncertainty and retry/recovery, then demonstrate rollback by
  restoring a named pre-change backup into another fresh destination. Record the
  exact backup boundary, later writes that rollback loses, the traffic-stop point,
  and when forward recovery is required. Preserve every accepted restore, failed
  exercise environment, backup, volume, and synthetic fixture.

- [ ] **R5.2 final runbook and closure rehearsal.** After the engine/runtime
  compatibility re-baseline and R5.1 exercises, consolidate all R5 slices into an
  operator runbook and acceptance matrix. Perform another create-only restore of
  the selected current-version backup into an empty, non-aliasing local destination
  with the compatible immutable runtime. Record restore duration, exact commands,
  tool/runtime/database versions, configuration references, fixture hashes,
  integrity and direct-data comparisons, all six operational exercises (database
  outage, partial migration or an explicit unsupported determination, full disk,
  ambiguous commit, process restart, and rollback), and the precise rollback
  boundary. Reconcile the retained exact request without re-execution and complete
  the deferred two-user paused/completed browser verification only after the
  approved UI surface exists. Scan reviewable evidence for credentials, bearer
  tokens, private recovery material, and private dice. State that support covers
  only the tested tuple; do not claim historical conversion, another M4 gate, or
  public-service readiness from this rehearsal.


- [ ] **Containerized deployment parity across local, DEV, and PROD.** Replace
  the native nginx/systemd JVM deployment candidate with a reviewed containerized
  deployment approach. Build versioned Java and nginx images through the same
  pipeline and promote the same immutable artifacts between environments, keeping
  environment-specific configuration and secrets external. Decide whether Java
  and nginx should use separate containers; the current combined image is a local
  test fixture, not a production deployment artifact. Cover persistent MariaDB
  and backup storage, private backend networking, TLS renewal, health checks,
  resource limits, rollback, and active-match drain/compatible-runtime handling.
  Validate local-to-DEV-to-PROD parity without resetting retained data or upgrading
  active matches in place. This is future work only; public deployment and
  infrastructure changes require separate authorization.
