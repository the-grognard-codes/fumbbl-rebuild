# R4 resident release and local lifecycle pressure

2026-09-21. Baseline commit `86953b7d9a23bb1a4344d0318eb8b08d5932658c`.
Unrelated `AGENTS.md`, `TODO.md`, `.agents/` and sprite-standard edits were present
at entry and are preserved. No commit, deployment, service restart, runtime
cutover, credentials change, database reset or deletion was performed.

This is a bounded R4 implementation and component-level measurement, **not full
R4/public-service acceptance**. See the [lifecycle and retention contract](../../../../containers/local/session-retention.md).
R4.1 now has a local implementation candidate with a separate format-3 checkpoint
boundary. Free-disk admission/deletion policy and end-to-end browser load measurement
remain open.

## Implemented behavior

- Checkpoint-enabled completed engines leave the resident pool only after durable
  result completion/reconciliation. The existing R2 validator verifies terminal
  checkpoints and complete result equality before returning exact retained retry
  responses. Completed requests consume no resident slot and execute no native
  command. Compatible checkpoint/replay/engine/catalog formats remain unchanged.
- Durably failed engines are released and fail closed on recovery. Idle active
  engines are evicted from memory after 30 minutes, opportunistically after the
  next authorized operation. All durable state remains; clocks do not pause.
  Terminal engines with uncertain result persistence remain resident until an
  accepted reconciliation, preserving peer completion notification.
- The resident cap remains 32. Non-idle full-pool admission returns
  `ACTIVATION_LIMIT` before staging new recovery. A test fills all 32, proves the
  exact expiry boundary and authorization ordering, admits a new game after idle
  eviction, and reconciles a lost acknowledgement from the original checkpoint.
- Worker-only counters report residency, releases, restore count and admission
  rejection. The permanent completed-ID acknowledgement set is removed. The v2
  adapter now consumes completion notifications on accepted responses, including
  reconciled loads/duplicates, while reauthorizing recipients as before.
- A final retention guard caps new JDBC checkpoint IDs at 1,024 (the constructor
  can lower the limit). A schema-row lock serializes initial count/insert admission.
  At capacity, new staging returns `RETENTION_LIMIT` before activation; existing
  checkpoints, duplicate/CAS operations and active games remain usable. No data
  is evicted or converted. This bounds new checkpoint retention, not whole-database
  disk space, prepared rows or backup generations.

## Declared workload and boundaries

The repeatable command is:

```powershell
powershell -ExecutionPolicy Bypass -File tools/r4-lifecycle-measure.ps1
```

It is restricted to `jdbc:mariadb://127.0.0.1:23320/ffb_local`, the existing
`ffb-setup-test-db-20260920` container/volume. It reads the existing password file
without exporting its contents. It creates uniquely identified synthetic prepared
match, checkpoint and result rows and retains them. Frozen synthetic source teams
are in memory; this workload does not exercise v2 account or saved-team creation.
Playable/reference databases and backup volumes are not modified. Only the
existing isolated test volume receives new synthetic match/recovery data.

Each successful run completes 34 sequential native BB2025 Human matches in one
application instance: 1,360 accepted decisions, 34 completed reconnects, exact lost-
ack retries, fresh completed-action rejection, and checkpoint byte/generation
invariance on retry. Default native setup, both halves and full-time processing
are used. The driver selects end-turn actions and injects deterministic **test-only**
kickoff dice; it is not broad gameplay diversity or a client-controlled dice path.
The measured pool has one active engine at a time, not 32 simultaneous games.

Queue runs submit application operations through `BrowserMatchTransport` and the
real existing `ServerCommunication` worker. No worker partitioning or additional
mutation executor is introduced. Queue p95 measures enqueue-to-start, action p95
measures enqueue-to-durable-response, and reconnect p95 measures terminal load to
validated response. There are no TCP/browser round trips in these latency numbers.
Ingress high-water is one under this intentionally serial workload. For each
completed match a real `BrowserMatchDelivery` with a deliberately blocked sink
receives 65 small frames: the 64-message limit closes it with 1013, records the
overload and clears all queued bytes. These are 34 delivery fault fixtures, not
34 real slow browser sockets. Existing byte-limit/watchdog contracts run separately.

Windows 11; AMD Ryzen 7 260 / Radeon 780M, 8 cores / 16 logical processors;
16,438,054,912 bytes physical memory. Temurin 21.0.11+10-LTS, project Maven 3.9.9,
MariaDB 11.8.9, JDBC 3.5.8, schema marker 6. This is a shared developer laptop with
other local services running, not an isolated host-sizing experiment. JVM defaults
are used (the direct in-memory run reports a 4,110,417,920-byte maximum heap).
No memory/CPU/container tuning is introduced.

Each run directory contains its command, configuration, raw Maven output,
500-ms OS process samples and JSON measurement. Heap is sampled after each action;
RSS is the test JVM's Windows working set. Process peak RSS and CPU seconds include
test setup/JIT, not just the timed action interval. CSV samples include timestamps
and PID. They do not measure container/database RSS or CPU. The failed first run
is retained separately; no successful data is substituted for it.

| Run | Matches / accepted actions | Action p95 | Reconnect p95 | Queue p95 | Sampled heap peak | Process peak RSS | CPU at last sample |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Direct JDBC baseline](run-20260921-175718-f0210eff/measurement.json) | 34 / 1,360 | 82.7088 ms | 94.4435 ms | Not measured | 172,237,624 B | 392,683,520 B | 94.594 s |
| [Worker run 1](run-20260921-180337-6b6970e8/measurement.json) | 34 / 1,360 | 79.9998 ms | 87.0304 ms | 0.0664 ms | 145,951,000 B | 352,813,056 B | 94.641 s |
| [Worker run 2](run-20260921-180652-40a5c6c9/measurement.json) | 34 / 1,360 | 76.3345 ms | 82.8874 ms | 0.0616 ms | 152,761,216 B | 360,513,536 B | 86.844 s |
| [Final worker run, retention guard enabled](run-20260921-203518-69fc403c/measurement.json) | 34 / 1,360 | 66.4332 ms | 73.6121 ms | 0.0590 ms | 158,850,776 B | 381,501,440 B | 81.813 s |

All three worker runs ended with 34 completed releases, zero resident sessions, zero
ingress/delivery queue depth and zero delivery bytes. Each recorded 34 expected
slow-disconnect/overload events; there were no unexpected workload failures or
ingress rejections. The terminal checkpoint and generation remained byte-for-byte
unchanged after each retry. All **136** synthetic completed matches from the four
successful database runs remain stored; their IDs are in each measurement JSON.
Native games use random initial coin outcomes, so replay/checkpoint byte counts
vary slightly even with deterministic kickoff fixtures.

The final run's maximum serialized snapshot was 18,331 bytes; checkpoint: 507,613
bytes; replay: 125,153 bytes. Run 2 observed 18,368 / 507,636 / 125,860 bytes. The
database reports `max_allowed_packet=16,777,216`,
`innodb_flush_log_at_trx_commit=1`, `sync_binlog=0`. **This test copy's packet setting
does not cover the maximum 32-MiB recovery artifact.** It was not changed. The
half-MiB workload cannot certify the configured recovery-size ceiling or storage
exhaustion behavior. The existing R2 deployment's separately documented packet
setting is not evidence about this copy.

## Checks and exact commands

```powershell
# Focused native, recovery, persistence and transport contracts: 63 passed.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest,BrowserV2AdapterTest,RecoverySessionTest,RecoveryScenariosTest,DefaultSetupSessionTest,SetupSessionTest,JdbcRecoveryRepositoryTest,JdbcMatchRepositoryTest,BrowserMatchDeliveryTest -Offline
# New failed-engine release and full-history boundary checks: 13 passed.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest#failedCheckpointDoesNotRetainAnEngineOrExecuteOnLoad,RecoverySessionTest,BrowserV2AdapterTest -Offline
# Final changed boundaries + ingress/slow-client regressions: 24 passed.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test 'RecoveryApplicationTest#ambiguousCompletionCommitReconcilesRetryAndBroadcastWithoutAnotherWrite+fullPoolRejectsThenIdleEvictionRestoresExactLostAcknowledgement+failedCheckpointDoesNotRetainAnEngineOrExecuteOnLoad,RecoverySessionTest,BrowserV2AdapterTest,BrowserMatchDeliveryTest,BrowserMatchTransportTest' -Offline
# Additional completed-load/retry test with every resident slot occupied: 1 passed.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest#fullPoolRejectsThenIdleEvictionRestoresExactLostAcknowledgement -Offline
# Retention JDBC unit contracts + application rejection: 11 passed.
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test JdbcRecoveryRepositoryTest,RecoveryApplicationTest#retentionAdmissionRejectsBeforeActivationAndPreservesExistingRecovery -Offline
# Real isolated database last-slot race/update/retry: 1 passed.
$env:R4_TEST_JDBC_URL='jdbc:mariadb://127.0.0.1:23320/ffb_local'
$env:R4_TEST_PASSWORD_FILE=(Resolve-Path containers/local/.secrets/db_root_password).Path
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest#isolatedJdbcRetentionSerializesLastSlotAndPreservesExistingCheckpoint -Offline
# Authenticated v2/native/JDBC integration on final source: 1 passed.
$env:M6_TEST_JDBC_URL='jdbc:mariadb://127.0.0.1:23320/ffb_local'
$env:M6_TEST_PASSWORD_FILE=(Resolve-Path containers/local/.secrets/db_root_password).Path
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test V2RuntimeIntegrationTest -Offline
npm.cmd test --prefix browser-client
npm.cmd run build --prefix browser-client
npm.cmd run test:browser --prefix site
```

Browser unit tests: 49 passed. TypeScript/Vite build passed; the existing >500 kB
chunk advisory remains. Mounted browser regressions: 2 passed (creator automatic
start and two-player/spectator/reconnect flows). They use headless local Chrome 153.0.8010.50,
mocked identity/WebSocket responses, and 1440x1080 contexts in the board test.
They do not convert the Java measurement into a browser load test. Node 26.7.0,
npm 11.19.0; the declared Node 24 CI environment was not run.

The final real-JDBC v2 check used synthetic provider identities with actual account
membership, native setup, spectator authorization and exact checkpoint retry.
Retained match `16e6fc2e-4165-3fcc-ae40-c5f256a75f14` remains recoverable at revision 2.
It is not an external account-provider or fresh OS-kill test. Raw command logs are
in [checks](checks/); [final source hashes](source-hashes-final.json) distinguish
the final source from the earlier pre-quota measurement state.

The affected-test manifest is `RecoveryApplicationTest` (commit/retry/release,
capacity/idle/failure/pressure), `RecoverySessionTest` (format and 8,192-history
boundary), `RecoveryScenariosTest` (native checkpoints across JVMs),
`DefaultSetupSessionTest`, `SetupSessionTest`, `BrowserV2AdapterTest`,
`JdbcRecoveryRepositoryTest`, `JdbcMatchRepositoryTest`, `BrowserMatchDeliveryTest`
and `BrowserMatchTransportTest`. No rule code or schema was changed; there is no
new migration or fresh process-kill/backup-restore claim.

## Corrections and limits

- Initial sandbox Maven compilation could not access a cached OAuth jar; the
  authorized host build passed. The failure log is retained.
- The first pressure fixture reused a deterministic create request ID, so its
  second synthetic document correctly conflicted with the first checkpoint. The
  fixture now uses unique request IDs; no product validation was weakened.
- The first JDBC fixture tried to create `home`/`away` as marker-6 account owners;
  its foreign-key check correctly rejected it before match creation. The corrected
  component workload uses in-memory synthetic team sources and real JDBC for the
  target match/checkpoint/result paths. It does not claim account-provider coverage.
- The retention unit fixture initially restubbed a throwing Mockito method with
  `when`, invoking that exception during fixture setup. Chained outcomes fixed the
  fixture; all 11 quota/unit/application checks then passed. The real JDBC last-slot
  test also passed: two transactions at a test-specific cap of 108 admitted one
  ID, rejected the other, preserved duplicate/CAS behavior and updated the winning
  checkpoint to generation 2. Both prepared documents and the staged checkpoint
  remain retained. The production cap remains 1,024, not this fixture override.
- Review caught missing notification after ambiguous result commit, premature v2
  notification consumption on a rejected request, and the need to exclude pending
  terminal engines from idle cleanup. Regression tests cover these cases. Final
  independent source review reported no actionable findings.

Supported measured envelope: serial application operations, 34 successive native
lifetimes per run, bounded transport fixture delivery, roughly half-MiB checkpoints
and 123-KiB replays. The 32-resident admission contract is separately characterized.
Do not extrapolate to 32 concurrently active matches, maximum 32-MiB checkpoints,
network latency, real slow browsers, multiple JVM writers, or production capacity.

Per-match request/replay/recovery bounds and the 1,024 checkpoint admission cap
retain uncertain work; whole-database disk growth has no free-space quota. There is no automatic expiry, forfeit or
data deletion for abandoned games. Actual browser/network load, a free-disk
admission policy, deployed metrics collection, and R4.1's reviewed atomic
agreement/clock persistence boundary remain unaccepted. This slice does not claim
another M4 gate or public-service readiness.

## R4.1 implementation candidate record (2026-09-21)

The candidate activates only new authenticated v2 matches in runtime
`ffb-3.4.0-bb2025-r4.1` / private checkpoint format 3. It retains r2.2/r2.3
runtime parsing and does not rewrite activated checkpoints, match documents,
replays, schema marker 6, database volumes, backups or synthetic evidence. The
new format adds private consent/expiry state to the recovery artifact. It has a
256-record save-control exact retry bound and a five-minute proposal limit; an
unfinished r4.1 match becomes a retained, non-resumable `MATCH_ABANDONED` after
30 days without a successful game action, save-control operation or resume.

This is a historical candidate record, not the accepted abandonment policy. The
later policy requires durable per-player ordinary-disconnect timestamps with a
24-hour recovery window, and a separate one-month window only after accepted
mutual save. The candidate must be revised and revalidated in the deferred R4.1
tranche before acceptance.

Focused Java contracts were added for opposite-player consent, self-accept denial,
restart restoration while suspended, ambiguous durable accept acknowledgement,
exact retry, suspended action denial, one-month expiry and turn-clock rebase. The
repeatable offline command is:

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest#mutualSaveRequiresOtherPlayerPersistsAcrossRestartAndAbandonsAfterThirtyDays+lostSaveAcceptanceAcknowledgementReconcilesWithoutASecondSuspension+cancelWinsTheSingleWorkerRaceWithAnOtherwiseValidAcceptance,RecoverySessionTest#r41CheckpointRestoresMutualConsentAndRebasesOnlyThePausedTurnClock -Offline
```

The system `mvn` command is absent, but the repository-owned target tool ran the
focused command with project Maven 3.9.9 and Temurin 21.0.11+10-LTS: **4 tests
passed** (three application consent/restart/ambiguity/expiry/race paths and one session
clock/recovery path). An initial sandboxed invocation could not let ClassGraph
resolve the workspace, so the same offline command was rerun outside that sandbox.
Neither invocation used MariaDB or changed credentials, volumes or retained
evidence. Browser checks ran locally on Node 26.7.0/npm 11.19.0:

```powershell
node --experimental-strip-types --test --test-name-pattern "save/resume" test/setup-protocol.test.ts
npm.cmd run build
```

Both passed; the Vite build retains its existing >500 KiB chunk advisory. No MariaDB,
browser WebSocket, process-restart, backup-restore, capacity or public-service
measurement has been rerun for this candidate. Run the Java command above and the
isolated local database/browser scenarios before accepting R4.1 or updating the
declared R4 envelope.
