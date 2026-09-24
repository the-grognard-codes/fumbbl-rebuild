# Active match publication implementation spec

## Problem Statement

A match change can be durably accepted while the rules for notifying other live viewers are coordinated across match handling, access checks, and the WebSocket adapter. The current completion notification uses a consumable in-memory flag. This makes ordinary updates, terminal reconciliation, recipient authorization, and viewer lifecycle harder to understand and verify together. The active product route is `/browser/v2`; historical `/browser/v1` process-kill evidence does not verify current v2 publication behavior.

## Solution

Give active match publication one module that owns live viewer enrollment and removal, checks each recipient's current access, obtains the permitted view for that recipient, and offers best-effort updates after a public-state change. Match handling returns an explicit publication outcome instead of a consumable completion flag. The actor's request-correlated reply remains in request handling. Preserve observable v2 behavior, storage formats, and the single match-mutation worker.

## User Stories

1. As an acting player, I want my accepted match action acknowledged with my request ID, so that I can reconcile the exact request.
2. As the other player, I want an authorized live update after an accepted public-state change, so that my board reflects the current match.
3. As a spectator, I want the public view after an accepted change, so that I can follow the match without receiving player-only state.
4. As a player, I want the view appropriate to my match role, so that I see the correct actions and prompts.
5. As a player whose access was revoked, I want further match state withheld, so that the prior subscription does not bypass current authorization.
6. As a spectator whose access was revoked, I want further match state withheld, so that a prior watch request does not grant lasting access.
7. As a connected viewer, I want a failed access check for another viewer to leave my authorized update unaffected, so that recipients are evaluated independently.
8. As a disconnected viewer, I want to reload the authoritative match state after reconnecting, so that missed best-effort updates do not determine my state.
9. As a player resolving an uncertain terminal commit, I want my exact retry to reconcile without another engine execution, so that match results and resources remain correct.
10. As the other connected player, I want the reconciled final state offered once when the existing terminal-retry rules call for publication, so that I can see full time.
11. As a watching spectator, I want the final public frame before my live subscription ends, so that I see how the match finished.
12. As a player making a save/resume decision, I want its accepted public-state change reflected in other live views, so that both players see the current status.
13. As a player loading a match without a newly publishable outcome, I want no redundant peer update, so that a read does not look like a new change.
14. As a player repeating an already acknowledged action, I want no second mutation or ordinary duplicate broadcast, so that retry is safe.
15. As a maintainer, I want the viewer and publication rules behind one seam, so that a change to recipient policy has one primary place to verify.
16. As an operator, I want the existing bounded transport behavior retained, so that a slow viewer cannot create an unbounded outbound queue.
17. As a maintainer of the offline v1 diagnostic path, I want its remaining caller to consume the explicit match outcome, so that the old completion flag can be removed without introducing a second mechanism.

## Implementation Decisions

- Follow the accepted Active match publication ADR and the existing decision to keep one-at-a-time match mutation.
- The v2 publication module owns live active-match viewer enrollment, removal on disconnect or connection replacement, recipient selection, per-recipient access checks, permitted view construction, and best-effort sends.
- Active match publication includes accepted changes to public state during setup and play, save/resume status changes, and full time. Pre-activation preparation notices remain on their existing path.
- The acting player's correlated response remains with request handling and is sent before updates to other viewers, preserving current ordering.
- Match handling returns its response together with an explicit publication decision. Publish an accepted, nonduplicate, non-load setup/play/save/resume operation only after its required durable work succeeds. Do not publish a failed operation, ordinary load, or ordinary exact duplicate. A successful reconciliation of an uncertain terminal commit may request the final update once while that runtime retains the pending terminal session, including when the reconciling request is a load. Remove the consumable completion flag and update both existing callers of the shared match-handling module.
- The publisher preserves the current player-role view and spectator public view. It rechecks each recipient immediately before obtaining and offering a view. Player recipients require current player scope and membership. An already enrolled spectator requires current spectator scope; do not repeat the active-match admission check for the final frame because completion makes the match inactive. A denied recipient receives the current unavailable response and is removed from the live viewer set; other eligible viewers continue.
- An ordinary load and an exact duplicate do not create another update. An existing terminal-reconciliation outcome can still request the final update once. A failed or uncommitted match change is not published.
- Delivery remains best effort. The one-time terminal decision is scoped to the surviving runtime and is not a guarantee that a frame reaches a viewer or can be replayed after restart. Reconnect uses an authorized fresh snapshot where the current route permits it. Existing bounded queues and slow-client disconnection remain in place.
- Keep current browser message shapes, request IDs, storage and recovery formats, native rules, and single-worker ordering. Do not introduce a new external port solely for testability; use the existing in-process protocol seam and test stand-ins.
- `/browser/v1` is an offline diagnostic path with no compatibility promise. Its full removal is tracked separately; this work updates its remaining shared match-outcome call rather than preserving the old flag.

## Execution Order

1. Add the explicit match-handling outcome and focused tests for accepted changes, failures, ordinary retries, and terminal reconciliation. Remove the consumable completion flag.
2. Extract live active-match viewer enrollment, recipient authorization, view construction, and sending into one v2 publication module. Keep preparation notices and the actor's correlated response in request handling.
3. Wire the v2 adapter to the new outcome and publication module, then update the remaining offline v1 caller. Preserve current browser frames and actor-before-peer send order.
4. Run focused adapter and recovery tests, then add and run the isolated MariaDB v2 terminal-retry integration test and affected suites. Record any unavailable required test as unverified; a skipped database test is not a pass.

## Testing Decisions

- Assert observable messages, recipient views, durable outcomes, and retry behavior through the v2 protocol seam. Tests should survive changes to the publisher's internal state and method layout.
- Cover enrollment, disconnect/replacement, actor exclusion, player and spectator views, per-send revocation, independent recipient handling, ordinary accepted updates, save/resume, full time, reads, and exact duplicate requests.
- Exercise the explicit match outcome with current-source recovery tests: failed terminal persistence must not publish; an uncertain terminal commit followed by exact retry must reconcile without another write or engine execution and offer the final frame once.
- Require one targeted v2 integration test with real isolated MariaDB behavior for uncertain terminal completion, an exact retry, and the connected peer's final view. Use the existing v2 runtime integration and recovery application tests as prior art.
- Update tests that currently assert the consumable completion flag to assert the observable outcome and recipient messages. Keep relevant repository, recovery serialization, and transport tests.
- Run focused v2 adapter and recovery tests first, then the affected server and native test suites. Do not count the pinned historical v1 process-kill run as validation of the current runtime.

## Out of Scope

- Guaranteed or durable notification delivery, acknowledgements from viewers, an outbox, replay of missed live updates, and a new process-kill campaign.
- New publication counters or changes to transport metrics.
- Preparation-change publication, browser protocol changes, result/replay exposure, game rules, and storage schema or checkpoint format changes.
- Full removal of `/browser/v1`, which is a separate backlog item.

## Further Notes

The accepted [Active match publication ADR](../adr/0001-active-match-publication.md) refines ADR-004. Historical v1 recovery evidence remains useful as an R2 record but does not establish behavior for today's v2 runtime. This spec describes a behavior-preserving architecture change; tests must protect the existing access and terminal-reconciliation guarantees.
