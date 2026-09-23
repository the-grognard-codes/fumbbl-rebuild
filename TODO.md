# TODO

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
