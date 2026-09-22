# R4 bounded resident lifecycle

This change applies to the checkpoint-enabled R2 application (including marker-6
v2). It changes residency, not authoritative game/recovery/replay formats. The
legacy noncheckpoint runtime retains its lifetime limit. Do not replace a running
JVM that owns active games; drain it or retain its compatible runtime. Existing
r2.2 and r2.3 checkpoint validation and native round-trip assertions still apply.

## Lifecycle and release

| State | Resident engine / durable behavior |
| --- | --- |
| Prepared | No active engine. An unpublished initial checkpoint may exist. Activation keeps the existing staged-checkpoint/CAS contract. |
| Active | Up to 32 resident engines, on the existing single communication worker. Every mutation checkpoints before acknowledgement. |
| Recoverable but not resident | Original checkpoint, request history, dice, decision and clock remain authoritative. Authorized access restores them; it never starts a new game. |
| Idle | After 30 minutes without an authorized application read/action, the next authorized application operation releases eligible idle engines. This is a memory release only. |
| Terminal, result pending | The terminal checkpoint precedes result persistence. Keep the engine resident until result reconciliation; exclude it from idle eviction to retain the pending peer-notification signal. A process loss still uses existing R2 terminal-checkpoint reconciliation. |
| Completed | Release only after result commit succeeds, or an authorized reconciliation verifies identical committed result and terminal checkpoint. Exact retries retain their recorded result; new mutations return `MATCH_COMPLETED`. |
| Failed | Persist the failed marker before release. Repeated authorized loads fail closed with `SESSION_UNAVAILABLE`; unsupported/corrupt artifacts retain existing R2 rejection codes. Do not initialize another engine. |

Idle cleanup is opportunistic: a completely idle process may retain its bounded
pool until the next authorized operation. It evicts memory only. Reads, including
spectator reads already authorized by v2, count as activity. Rejected unauthenticated
requests cannot trigger cleanup. Clocks retain their original start/wall-time
semantics across eviction: **this is not a clock pause or mutual save**. A backward
wall-clock adjustment can delay cleanup; it cannot delete recovery or execute work.

The 33rd non-idle resident admission returns `ACTIVATION_LIMIT`. It does not evict
an active engine to make room, stage a new game, or queue unbounded work. Once an
eligible engine completes, fails durably, or expires from the resident cache, an
authorized retry can use the released slot. Completed reads/retries do not require
a resident slot. They transiently reconstruct and validate the terminal checkpoint
using the existing R2 validator, compare its complete replay with the committed
result, and only then consult request history. Terminal status prevents any engine
command or dice roll. This costs CPU and temporary heap; it is deliberately not a
second, weaker checkpoint parser or an unbounded completed-engine cache.

## Data retention and limits

| Data | Limit and behavior |
| --- | --- |
| Setup/play request history | 8,192 records per lifetime. Exact recorded retries precede the limit check. New work returns `REQUEST_HISTORY_LIMIT`; no record is silently evicted. |
| Public replay | Existing 16 MiB maximum, reserving 128 KiB before accepting a new action. `REPLAY_LIMIT` rejects before executing new native work. |
| Private recovery artifact | Existing 32 MiB maximum. A failed checkpoint/serialization discards the uncertain resident and reconciles the previous durable artifact under R2 semantics; no success acknowledgement is issued for the lost write. |
| Retained checkpoint IDs | JDBC admits at most 1,024 distinct checkpoint records by default; a server-owned constructor setting can lower this limit. Staged, active, failed, abandoned and completed records all count. `RETENTION_LIMIT` rejects a new staging insert before prepared activation. Existing checkpoint updates, duplicates and already-staged activations remain usable at capacity. |
| Completed result | Existing schema-4 document envelope and replay format 1 remain unchanged. |
| Evicted/failed/abandoned recovery and completed results | Retained indefinitely in this local slice. No TTL deletion, history pruning, checkpoint rewriting, replay compaction, or automatic forfeiture is enabled. |

The retained-record cap is a fail-closed admission policy, not a measured capacity
claim. Initial insert transactions lock the existing schema-marker row, count
recovery IDs and insert while holding that lock. This serializes cooperating JDBC
writers without changing the single match mutation worker. Duplicate IDs still
take the normal CAS path. Existing databases above the cap are preserved and may
update their records, but cannot admit another ID. No DDL or conversion is needed.
Older binaries do not enforce this quota; retain/drain their active games and stop
their new admissions before claiming a shared quota. Do not upgrade their games
in place.

The bounds are **not a total database disk quota**. Newly admitted recovery JSON is
bounded by count and per-artifact size; prepared rows, legacy completed artifacts,
physical database files/logs and backup generations have no new global quota here.
Free-disk admission and a reviewed deletion/tombstone policy remain an R4 gate.
Deleting an accepted request still needed for recovery is not a permitted cleanup
operation. Retained synthetic evidence and existing volumes are never cleanup
targets. Operators must not use restart, DELETE, TRUNCATE or volume recreation as
a retention strategy. Backup/restore must retain checkpoints, results, memberships,
frozen inputs and their compatible runtime together; this slice changes none of
the accepted R2/R3 backup boundaries.

## Observation and validation

`SetupApplication.lifecycleMetrics()` is a worker-thread-only, identity-free
operational hook: resident count/limit, activation reservations, completed/failed/
idle releases, resident/retention admission rejections and restored-session count. It is not a public
unauthenticated endpoint or a claim of a deployed monitoring service. No new
concurrency is introduced. Completion-notification bookkeeping is consumed by
both browser adapters only after successful reconciliation.

See [run evidence and remaining gates](../../.notes/overhaul-analysis/verification/r4/README.md).
Real public service capacity, browser/queue latency, storage exhaustion and
save/resume/disconnect-window acceptance must not be inferred from a direct
application benchmark.

## Ordinary disconnect recovery target

An ordinary disconnect is never a request to save, consent to save, concession or
clock pause. The checkpoint must retain a disconnect timestamp for each original
player slot. If either player remains disconnected for **24 hours**, the first
later authorized match operation must durably mark the unfinished match
`ABANDONED`, clear any pending proposal, release its resident engine and return
`MATCH_ABANDONED`. A reconnect by that original player before the boundary clears
only that player's disconnect timestamp; spectator reads never extend recovery.

This check remains serialized on the existing match worker and must checkpoint
before the abandonment response. It does not fabricate a result, forfeit the
match, delete the checkpoint, replay, request history or backup data, or expose
private checkpoint fields. A restarted compatible runtime must restore the
disconnect timestamps before evaluating the window. The 24-hour ordinary-disconnect
window applies only while the match is active.

## R4.1 mutual save and resume

New authenticated v2 activations use private checkpoint runtime
`ffb-3.4.0-bb2025-r4.1`, recovery format 3. It preserves the existing native engine
snapshot, dice queues, pending decision, replay and request history, and adds a
separate private save-control record: last accepted player activity, suspended
clock point, abandonment flag, current proposal (ID, proposer, revision and expiry)
and a bounded exact-request history. Format-2 r2.2/r2.3 checkpoints restore under
their recorded runtime and return `SAVE_RESUME_UNAVAILABLE`; no active game is
upgraded in place. Replay format 1 and the frozen match document remain unchanged.

`saveRequest`, `saveAccept`, `saveReject` and `saveCancel` are setup operations.
Either original persisted player may request a save at the current engine revision.
Only the other original player may accept or reject; only the requester may cancel.
The server derives both seats from current membership before every request, retry,
checkpoint read and checkpoint write. A proposal expires after five minutes when a
later authorized operation observes it. Disconnect, a spectator read, timeout or
missing response never implies consent.

Gameplay continues while a proposal is pending. An accepted native action clears
the proposal in the same checkpoint as its game state; rejected actions do not.
Acceptance sets the suspension point and writes the complete r4.1 checkpoint before
returning `ACCEPTED`. A write with a lost acknowledgement returns
`MATCH_OUTCOME_UNKNOWN`; replaying the exact request restores its recorded response
without executing engine work or rolling dice again. While suspended, new gameplay
returns `MATCH_SUSPENDED`; ordinary authorized loads remain available.

`resumeRequest`, `resumeAccept`, `resumeReject` and `resumeCancel` use the same
two-player protocol and original slots. The accepting resume rebases the persisted
turn-clock start by the suspended duration exactly once, then clears the proposal.
The clock base, proposal state and native snapshot are restored together after a
restart or compatible backup restore. A runtime that cannot parse this checkpoint
fails closed with `RECOVERY_UNSUPPORTED`; operators retain that compatible runtime
until the match is resolved.

An accepted mutual save starts a **one-month** saved-match retention window. It is
separate from ordinary disconnect handling: a player who disconnects without both
players accepting save receives only the 24-hour recovery window above. A completed
resume consumes the saved state; a later accepted save starts a fresh one-month
window. At the first authorized operation after a saved-match expiry, the server
durably marks it `ABANDONED`, clears any proposal, releases its resident engine and
returns `MATCH_ABANDONED`; it cannot resume. There is no background mutation,
concession, result fabrication or automatic deletion. The retained abandoned
checkpoint counts toward the R4 record bound and remains available for
diagnosis/backup; a deletion and tombstone policy requires a separate review.

The current r4.1 candidate records one 30-day activity deadline rather than the
separate 24-hour disconnect timestamps and one-month mutually saved window above.
It is therefore not accepted for this policy and must be revised in the deferred
R4.1 tranche.

Save-control exact-request history is capped at 256 records per match. Exact retries
remain available at the cap; new save-control requests return `SAVE_HISTORY_LIMIT`.
This is distinct from the 8,192 game-action history and has no eviction. All protocol
state is private except the small player/spectator-safe `saveResume` status in a
live setup projection. Replay snapshots do not acquire this field.
