# ADR request: turn-sequence phases and presentation

Status: requested; resulting ADR proposed, not accepted.
Source: [#549](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/549),
the [2026-11-14 ordering decision](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/541#issuecomment-6884610201)
and [spec patch](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/541#issuecomment-6885261078).
Reviewed: 2026-11-15, `main` at `65ed24fdb7f242645d5c4673a3aebce7b4b92110`;
pending #541 is distinguished from that base below.
Template: [ADR request template](../agents/adr-template.md).

## Objective

Choose an authoritative phase and presentation contract across native BB2025
steps, durable transcript/recovery, and browser playback. Outcomes that decide
whether a touchdown or turnover occurs must settle before its splash; cleanup
choices follow the full splash; drive-start choices precede turn start. A client
must not infer this solely from a final snapshot's actor, score or `TurnMode`.

This crosses a durable protocol boundary and trades explicit metadata/versioning
against repeated client inference. It also separates engine progress from a
coach's potentially unbounded announcement hold. Those costs warrant an ADR.

## Context and evidence

The [phase inventory](turn-sequence-phase-inventory.md) records the selected
native steps, sequence generators, direct and shared dialog producers, modes,
edge cases and recovery points at the reviewed revision. It is a static source
inventory, not a claim to have executed every optional skill or rules branch.

`StepEndTurn` spans several proposed phases. Its generator first resolves
forgone stalling, dropped-player effects, Apothecary and ball resolution. Inside
the final step, Star of the Show can be offered before `observeTurnEnd` emits a
touchdown. Secret Weapon choices, recovery, next-half/drive setup and start-turn
work follow in the same continuation. The inventory cites those distinct sites.
The checked touchdown path does call `observeTurnEnd` with the scorer; the
issue's abbreviated “not called on a touchdown” note does not describe this
revision. The source gap concerns emission before Star of the Show, rather
than a missing touchdown hook altogether.
The desired ordering is therefore a policy and future emission requirement,
not a description of universal current server compliance.

Main's [announcement spec](match-transition-announcements.md) still contains the
superseded choice-priority prose. The approved ordering patch travels separately
with [#541](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/541), at
`d25833125d855f4e66755692df469cee987274c4` after review fixes. That PR gates
choices behind announcements already supplied to the browser; its synthetic
same-update test does not prove that every native cleanup choice is preceded by
a supplied event. The wider matrix is [#547](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/547).

## Scope and deliverables

- This request, the linked source inventory, and
  [proposed ADR 0007](../adr/0007-server-owned-turn-sequence-presentation.md).
- A phase model, proposed server-owned signal, local presentation ordering,
  durable versioning/replay policy, failure semantics, budget and open decisions.
- Explicit consistency review against ADRs 0002, 0004 and 0006.

No protocol implementation, `StepEndTurn` refactor, animated artwork, rules
change, #547 tests or #550 implementation is included. No accepted ADR or glossary
entry is changed by this draft.

## Required decision content

The ADR must distinguish team-turn play from one player's activation, coarse
browser state from engine `TurnMode`, and a native phase boundary from a local
splash/input barrier. It must assign entry/exit conditions and decision ownership
for turn play/activation resolution, turn cleanup, drive end, half/match end,
drive start/kick-off and turn start.

The candidate is explicit server-owned, versioned presentation metadata frozen
with each accepted revision; clients gate presentation locally without a splash
acknowledgement that pauses the engine. Compare this with inference-only,
server-held dialogs and an unversioned additive extension. State which existing
formats remain readable and how older marker-free transcripts are classified.

The timing contract is the maintainer's decision: live catch-up cannot shorten
reading/fade/gap or cancel splashes; queued native moves/dice continue; cleanup
choices follow their splash even in one update or until-dismissed mode.
Activation outcome choices precede a settled splash. Kick-off free turns do not
produce numbered START OF TURN splashes. This does not invent new halftime or
full-time artwork or change when BB2025 rules actually offer a choice.

## Risks and mitigation ownership

| Risk / trigger | Consequence | Required mitigation or decision | Owner / tracking | Remaining risk |
| --- | --- | --- | --- | --- |
| Mixed native phases or a missed skill hook | Wrong choice/splash order | Source inventory, decision ownership and native end-to-end matrix | Maintainer review of this ADR; #547 | Static enumeration does not execute all branches |
| New metadata changes exact JSON shapes | Old stored matches or replays rejected | Dual reader, explicit format selection, old-fixture parity and rollout gate | Future protocol implementation after acceptance | Old binaries cannot necessarily read new writes |
| Held splash outlives a decision deadline | Coach sees an expired choice | Resolve clock/expiry semantics before implementation; preserve revision validation | Maintainer decision in ADR | Local presentation cannot pause native time |
| Client/AI/spectator acknowledgements gate engine progress | Worker or other matches stall | Local presentation barrier, no blocking splash wait | ADR 0006 / future implementation | Local clients can still lag |
| Crash during Star of the Show or a send-off chain | Duplicate/missing event or repeated choice | Persist phase identity with the same accepted checkpoint/journal tail | ADRs 0002/0004; future recovery tests | No separate volatile marker channel |

## Alternatives and open decisions

The ADR recommends explicit markers plus client-held presentation. The maintainer
must still decide:

1. Whether `turnPlay` containing repeated player activations is the right
   vocabulary; “activation” in the source discussion can mean an individual
   player action or the broader pre-cleanup portion of a team turn.
2. Whether to accept the proposed new embedded transcript version for new
   matches, with dual reading and an explicit legacy classifier, or require a
   different versioned storage envelope. No silent schema extension is assumed.
3. Whether decision expiry and turn clocks continue during a timed/held splash,
   and how a coach is told that a queued offer expired. No timeout extension or
   pause is authorized by this ADR draft.
4. The marker size/count admission budget and native emission sites, especially
   Star of the Show before the present touchdown hook and terminal transitions.
5. Whether the proposed reconnect baseline rule (suppress historical splashes,
   expose the current valid choice) is the desired recovery exception.

## Acceptance criteria

### Draft ready for maintainer review

- [x] Request and proposed ADR exist and cross-reference #549, #541, #547 and
  the announcement spec.
- [x] Inventory cites the selected native steps, generators and dialog producers;
  covers off-turn/last-turn touchdowns, free turns, send-offs and recovery points.
- [x] Proposed signal, alternatives, consequences, compatibility/ADR conflicts,
  budget, failure behavior, revisit conditions and open choices are explicit.
- [x] Documentation links and cited source symbols checked at the stated base.

### Accepted

- [ ] Maintainer approves a final policy with a date and evidence link.
- [ ] Resolve vocabulary, storage/versioning, expiry, baseline and admission choices.
- [ ] Add accepted vocabulary to `CONTEXT.md` and an invariant link to the
  architecture map only after acceptance.
- [ ] File separately scoped implementation and migration/validation tickets.

## Validation and handoff

Documentation-only checks cover relative links, source symbols, catalog coverage
and consistency with accepted ADRs. No build or gameplay claim follows from them.
Implementation must later prove native decision/splash ordering, compatibility,
exact retry/recovery/replay, size admission and worker occupancy with the matrix
in the ADR. The existing #547 and needs-triage #550 were not started.
