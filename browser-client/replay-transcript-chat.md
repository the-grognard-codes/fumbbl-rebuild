# Versioned full transcript replay and match chat scope

This is a build-phase replacement tranche. Replay format 1 records post-mutation
state snapshots, not every engine report, die roll, accepted input, or chat
message. It is not a compatibility target: there are no real matches to retain,
and format-1 replay artifacts may be removed as part of the reviewed migration.
The current browser chat preview is local sample state and must not be represented
as match history.

## Target contract

A new replay format must preserve, in authoritative order:

| Record | Required content | Visibility / authority |
| --- | --- | --- |
| Match start | Frozen inputs, engine/catalog/runtime identifiers, replay format, immutable participant and team references, and stable side IDs | Server generated; immutable; visible to players and spectators |
| Accepted action | Actor resolved from membership, canonical server-validated action/choice, request ID, revision before/after, server timestamp | Server validates role, dice, legality and timestamp; visible to players and spectators |
| Engine outcome | Ordered native reports and dice outcomes needed to explain the action; resulting projection/checkpoint binding | Visible to players and spectators in the same order and detail |
| Snapshot index | Revision/action sequence to complete authoritative state, with an indexed checkpoint or snapshot cadence | Visible to players and spectators; enables jump to a turn/action without replaying mutable engine work |
| Chat | Server timestamp, persisted sender identity, UTF-8 message and sequence number | Visible to players and spectators; text has limits and no client timestamp |
| Terminal record | Final result, terminal revision and transcript digest | Written atomically with completed result; visible to players and spectators |

Replay reads must restore a chosen record from a stored snapshot plus immutable
transcript entries. They must never issue an engine command, generate dice, infer
unrecorded state, or return a participant-only projection. A spectator receives
the same transcript, dice/report records, snapshots, identity projection and chat
as a player for the same match revision. The viewer needs explicit turn/action
navigation, and the protocol needs a bounded range/index operation rather than
sending a full transcript in one WebSocket frame.

## Identity and presentation contract

Transcript records use server-issued immutable participant IDs, team IDs and side
IDs. They do not contain presentation labels such as `Home`, `Away`, `You`, or
`Opponent`, and they must not encode a viewer-relative identity. At read time, the
viewer resolves those references to the authoritative player and team display
names available for that replay. The protocol may include a server-generated
display projection for each requested viewer, but it remains derived data rather
than part of the transcript contract. If a name later changes or is unavailable,
the server supplies a defined fallback from the persisted identity projection;
the action history and side attribution stay unchanged.

## Live spectator choice and public replays

Players may choose whether live spectators may subscribe to an active match. The
server persists that choice in the match configuration and enforces it before each
live subscription or reconnect; it has no effect on player access or mutation
authority. The choice expires as an access control for live delivery when the
match reaches a terminal state.

Every completed match replay is public. A spectator read role may retrieve the
complete transcript, snapshots, dice/report outcomes and chat for either live
spectator setting. Replay reads do not require membership in the original two
player slots, but the server still establishes the public-spectator read role and
applies the bounded range, rate and resource controls. No replay record is
withheld because live spectators were disabled.

## Required implementation slices

1. Write an ADR for replay format 2: the shared player/spectator projection,
   report and dice representation, timestamp source, snapshot interval, text/byte
   limits, index format, immutable participant/team reference and display-name
   projection, format-1 replacement, and redaction/retention rules.
2. Add a versioned schema migration with separate transcript/chat records or a
   bounded artifact layout. It must use transactional ownership/membership checks,
   CAS where required, a terminal digest, and backup/restore coverage. Remove
   format-1 replay rows/artifacts and their reader after recording the migration
   in the build evidence; no dual-format serving is required.
3. Instrument `SetupSession` at the authoritative command boundary. Persist the
   accepted canonical request and native outcome in the same durable checkpoint
   transaction before acknowledging success. Exact retries must return their
   original result without appending another action, dice record or chat record.
4. Add an authenticated `matchChat` WebSocket family. Validate membership or the
   server-established live-spectator role before reading; assign server timestamp
   and sequence; bound UTF-8 text, rate and retained bytes; broadcast only after
   durable commit. Store the players' live-spectator choice separately from the
   transcript. Completed replay chat is public regardless of that choice. Define
   any spectator-send policy separately. Chat must not share the engine mutation
   path or influence game legality.
5. Replace the result/replay reader and React UI with indexed action/turn
   controls, transcript detail and timestamped chat. Resolve player/team names
   from authoritative identity references; do not hard-code placeholder or
   viewer-relative labels. Unknown replay formats fail closed.
6. Characterize crashes before/after action/chat commit, duplicate requests,
   cross-role access, live spectator denial/allowance, public replay access after
   both settings, reconnect, process restart, backup restore, maximum records and
   storage-admission rejection. Include a real two-player browser/MariaDB run with
   dice, chat, save/resume, terminal completion and replay seeking.

## Decisions still needed

- Snapshot frequency and the maximum retained transcript/chat size once the 5 GiB
  storage admission policy has a configured storage-root definition.
- Chat moderation, deletion/editing policy, export/access policy, and whether
  spectators may send chat. Spectators read the complete historical chat under
  the target contract.

This work does not authorize an in-place upgrade of active matches, broad cluster
mutation, public deployment or credential changes. The reviewed format-1
replacement is authorized to remove obsolete replay artifacts only; it does not
permit deletion or compaction of recovery artifacts, backups, database volumes or
retained synthetic evidence.
