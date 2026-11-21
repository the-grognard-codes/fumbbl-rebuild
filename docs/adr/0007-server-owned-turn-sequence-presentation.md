# Let the server describe turn phases and clients order their presentation

Status: proposed
Issue: [#549](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/549)
Request: [turn-sequence contract](../specs/turn-sequence-contract-adr.md)
Evidence: [phase inventory](../specs/turn-sequence-phase-inventory.md), reviewed
2026-11-15 at `65ed24fdb7f242645d5c4673a3aebce7b4b92110`.

Propose server-owned, versioned phase/boundary metadata persisted with accepted
native outcomes, and client-owned splash/input scheduling. This makes cleanup
ordering explicit without making the engine wait for a coach's animation or
until-dismissed preference. The maintainer's 2026-11-14 ordering is a requirement;
this architectural proposal and its format/expiry choices are not yet accepted.

## Decision and boundaries

### Candidate phase model

These are proposed protocol concepts, not additions to `CONTEXT.md` yet. A phase
describes native causality; it is not a new BB2025 rule and is not identical to
the browser's existing `phase` field or the engine's transient `TurnMode`.

| Candidate phase | Entry / exit | Decisions owned here | Splash |
| --- | --- | --- | --- |
| `turnPlay` | Playable numbered team turn; contains zero or more player activations; ends after the action/turn-ending outcome settles | Activation traits, movement/block/pass/catch/reroll, injury/Apothecary, foul send-off responses and Blood Lust feeding | None while the outcome remains undecided |
| `turnCleanup` | A settled touchdown/turnover or voluntary end; exits after applicable cleanup choices/effects | Star of the Show, applicable Secret Weapon player selection, Argue the Call, Bribe and Bribery and Corruption reroll | TOUCHDOWN or TURNOVER first; none for a voluntary end |
| `driveEnd` | Touchdown or half boundary; final drive recovery/removal/effect expiry; exits to half/match end or next drive | Only native decisions actually applicable at that boundary; shared injury/inducement work inherits its causative phase | No extra splash defined |
| `halfEnd` / `matchEnd` | Native half-end test or terminal branch after the preceding cleanup; exits to next-half drive setup or final result | Coin/receive for applicable overtime belongs to next drive; terminal awards/penalty-shootout choices belong to match end | Existing halftime/result UI follows preceding touchdown/cleanup; no new artwork defined |
| `driveStart` / `kickoff` | Pre-setup inducements, two setups, kick target/scatter, kick-off event and ball settlement; exits when first numbered turn is playable | Setup validation, Dwarfen Wisdom/Swarming, kick skills, Charge/High Kick/Solid Defence/Quick Snap choices, injury/Apothecary, touchback and after-kick-off inducements | No START OF TURN during free turns or unresolved kick-off choices |
| `turnStart` | Start-of-own-turn inducements and native turn initialization; exits at first playable selection | Applicable start-turn inducement/skill choices | START OF TURN after those decisions, for a numbered REGULAR turn only |

“Activation” needs a vocabulary decision: this proposal uses `turnPlay` as the
outer phase, with player activation and its outstanding reactions contained
inside it. Ending one player's activation does not necessarily enter team-turn
cleanup. End-of-own/opponent-turn inducements in BETWEEN_TURNS can still alter
the settled outcome before final StepEndTurn, so they remain turnPlay resolution
until that boundary; their enum name alone does not assign cleanup. End-turn sequence steps that settle a catch, injury or Blood Lust still
belong to that causative resolution even if their generator is named EndTurn.

`TurnMode` is preserved separately. Nested interception, Dump Off, bomb, wizard,
reactive movement and target-selection modes inherit their caller's phase.
SETUP can already be the native mode while old-turn Secret Weapon cleanup is
awaiting input. Mode or final actor alone is therefore insufficient evidence.

### Signal and ownership

Propose a bounded ordered `presentation` extension in each new-format transcript
record and its V2 publication. Its candidate items describe phase entry/exit,
the three existing announcement kinds, and a gate/reference for a decision
offered in the final public state. Each includes a stable identity derived from
match, accepted revision, native command number where available, and ordinal;
phase identity also identifies the affected team, half and numbered turn.
These are candidate fields, not an implemented wire schema.

The engine-owning worker assigns phase and causal order at native resolution
sites. It must freeze a legal touchdown/turnover boundary before the first
cleanup decision is exposed, without moving an activation choice behind that
boundary. The inventory identifies a present gap: `StepEndTurn` offers Star of
the Show before `observeTurnEnd`. A later implementation must split emission
from subsequent cleanup, not infer an early celebration from an unsettled
ball/score snapshot or merely reorder UI after an event finally arrives.

Markers describe accepted facts; native steps/dialogs remain rules authority.
The server still validates actor, revision and the current choice. Metadata
does not authorize inputs or allow a client to execute an old queued offer.
Do not duplicate full dialog payloads or private engine state in presentation
metadata. Current prompt/action identities must bind the gate to the actual
public offer; exact field names and maximum sizes need schema review.

Clients consume the same ordered markers, independently scheduling their own
preferences. No splash acknowledgement gates server mutation, AI execution,
checkpointing or another recipient. No engine thread sleeps for presentation.

### Ordering and timing

1. Resolve all causative activation decisions before declaring its outcome.
2. At cleanup, present TOUCHDOWN or TURNOVER before its cleanup dialogs, including
   when event and offer arrive in one update. Voluntary end gets no turnover.
3. Keep splash reading/fade/gap independent of live catch-up. Replay-selected
   speed and reduced motion retain their explicit semantics. Until-dismissed
   cleanup choices wait for dismissal.
4. Continue presenting every queued native move/dice outcome while a splash
   plays; a required choice does not snapshot or discard that backlog. Reveal
   only the latest still-valid offer after its preceding presentation barrier.
5. At drive start, settle setup, kick-off event, free-turn and touchback choices
   before START OF TURN. A kick-off `TurnMode.BLITZ` is distinct from a normal
   Blitz player action during a REGULAR team turn.
6. An off-turn touchdown identifies the scorer's team, not necessarily the
   previous actor. A last-turn touchdown and its applicable cleanup precede any
   halftime/full-time presentation. These rules do not create choices the native
   rules would otherwise omit at full time.

This extends the [announcement ordering decision](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/541#issuecomment-6884610201)
and [#541](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/541);
the native end-to-end edge-case matrix remains
[#547](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/547).

### Durable formats and replay

**Proposed storage choice:** use a new embedded transcript version for new
matches (candidate version 3), with explicit readers for existing version 2 and
the new version. Keep existing active/version-2 artifacts byte-semantically
unchanged; do not silently upgrade them or recompute their recorded digests.
Marker-free legacy playback uses a clearly identified legacy classifier. It
cannot claim phase guarantees for facts never recorded. Unknown future versions
are rejected explicitly, rather than treated as legacy.

The exact record schema currently rejects extra keys. Adding a field silently
to format 2 is therefore not compatible. Before enabling writes, implementation
must establish dual reading for recovery, journal assembly, completed results,
replay and diagnostics; test retained old fixtures; and settle rollout/rollback.
Older binaries may reject new-version writes. That is an explicit deployment
constraint, not a claim of forward compatibility. If the maintainer requires
old binaries to read new writes, choose a different negotiated envelope before
accepting this proposal.

Freeze metadata once with its accepted revision, include it in the same durable
checkpoint or journal tail/CAS and terminal transcript/digest, and publish only
after that commit. Exact retry appends no new marker. Compaction preserves
identities/order; restore consumes recorded continuation and metadata, never
reruns actions, dice or choices to recreate markers. Rebuild a small current
phase cursor during the existing bounded restore pass; normal requests must not
rescan/materialize all history or retain a second expanded transcript.

Preserve current outer recovery/result compatibility unless a separately
reviewed version change is necessary. A new embedded transcript version is not
permission to alter native recovery JSON, journal generations or result limits.

### Failure, recovery, spectators and clocks

- Duplicate delivery deduplicates by recorded identity, never by display text.
  Spectators receive the same public phase facts and no actionable coach input.
  Their animation speed/holds cannot affect a coach or server progression.
- Initial load, reconnect, hidden-tab recovery and replay seeking establish a
  baseline and suppress historical splashes, as the current announcement spec
  does. Restore the current native phase/offer and expose only its still-valid
  decision. Ordinary forward replay plays recorded events in order. The
  maintainer must confirm this baseline exception to splash-before-choice.
- After a crash during cleanup, native continuation/dialog state and recorded
  phase identity resume from the same accepted generation. A refused/unknown
  commit follows existing recovery/uncertainty handling; metadata cannot publish
  a new volatile acceptance. No separate best-effort marker store is allowed.
- **Unresolved:** local presentation does not pause native clocks/decision
  expiry. A held splash may outlive an offer. Preserve current expiry rules
  until an explicit decision changes them; do not silently extend deadlines.
  A later implementation needs an agreed stale-offer/expiry indication, or a
  separately designed asynchronous timing policy. This draft guarantees an
  ordering proposal, not that every delayed offer remains usable indefinitely.

### Budget and admission

Phase assignment/freezing runs on the existing single engine worker under
[ADR 0006](0006-single-engine-worker.md): healthy p99 execution target <=100 ms
and aggregate failure occupancy <=2,000 ms, including existing work. It adds no
remote call, per-recipient provider lookup, worker retry/sleep or blocking
client acknowledgement. Local playback duration is not worker occupancy.

Use constant-size current phase state and work proportional to the new action's
bounded emitted items. Include metadata in existing transcript-record, artifact,
result and publication admission/byte limits before native execution; reserve
the worst permitted marker output. Exact marker-count/byte limits and measured
overhead are open implementation prerequisites, not invented validated numbers.
Do not truncate required markers or acknowledge volatile work when a limit is
exceeded. Existing accepted failure/uncertain-commit semantics still apply.

## Alternatives considered

| Alternative | Benefit | Cost / reason not preferred |
| --- | --- | --- |
| Client derives phases from reports/final snapshots | No new stored field; supports old transcripts | Mixed steps, same-update choices, off-turn scoring and recovery make causal classification incomplete; keep only for legacy data |
| Server supplies markers; client gates presentation | One authoritative classification, independent recipients, no engine animation wait | New schema, emission sites and client scheduler; recommended subject to open decisions |
| Server withholds cleanup until splash acknowledgement | Could align visibility with decision timing | Coach, spectator, AI, disconnect and hold semantics become engine dependencies; a blocking implementation violates ADR 0006; no recommendation to add this handshake |
| Add unversioned keys to existing records | Smaller apparent rollout | Exact-shape readers reject them; falsely claims stored-format compatibility |

## Consequences, consistency and known gaps

[ADR 0002](0002-bounded-match-transcript.md) owns the public durable transcript,
recorded outcomes, digest and admission. This proposal preserves that authority
but needs an explicit embedded-version amendment/rollout decision; it cannot
silently redefine format 2. [ADR 0004](0004-durable-recovery-journal.md) keeps
one generation-CAS transaction and exact recorded continuation; markers must
travel with its tails/compaction. ADR 0006 keeps one owner and bounded execution;
any server wait for a splash would conflict with it. No accepted ADR is amended
or superseded by this proposed document.

Current code already emits durable `matchAnnouncements` and restores native
steps/dialogs. It does not expose the proposed phase model/version, universally
emit before cleanup decisions, or prove the inventory's whole scenario matrix.
#541 fixes client scheduling of available announcements; it does not by itself
close these server/protocol gaps. #547 owns its existing tests. New protocol,
migration and emission implementation tickets wait for acceptance; this work
does not start needs-triage #550.

Before acceptance, the maintainer must resolve the request's vocabulary,
embedded-version/rollback, expiry, reconnect-baseline and size-admission choices.
Then add glossary/invariant links and file implementation slices separately.
No approval date or runtime compliance is asserted here.

Implementation validation must cover each inventory dialog family and shared
hook, activation vs cleanup Argue/Apothecary/Blood Lust, Star of the Show,
same-update event/offer, off-turn/last-turn touchdown, all kick-off free modes,
voluntary end, halftime/overtime/fulltime, send-off chains and each recovery
point. Also require duplicate/CAS/unknown-commit parity, old/new replay and seek,
coach/spectator independence, stale offers, admission and worker-budget evidence.

## Revisit conditions

Revisit after the native matrix exposes an unassignable decision, format/rollout
requirements rule out the proposed embedded version, accepted expiry policy
needs a readiness handshake, or measured marker overhead exceeds ADR 0006's
budget. A different animation feature, legacy artifact or new rules skill cannot
silently change accepted ordering or authorize parallel engine mutation.
