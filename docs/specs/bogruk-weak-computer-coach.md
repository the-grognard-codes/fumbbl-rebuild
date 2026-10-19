# Feature: Bogruk the Almost Clever, a Weak computer coach

## Abstract

Add Bogruk alongside Coach Bugman - Random in the existing computer-match flow.
His description is **“Loves a risky play, especially when there’s a perfectly good safe one.”**
Bogruk pursues the ball and scores, but sometimes chooses a plausible gamble when
a safer play would have served the same objective.

## Objective

Provide an entertaining BB2025 opponent that a casual player who understands the
basic rules can beat. Bogruk must exploit obvious openings and score against an
undefended team. Weakness comes from limited judgment and identifiable tactical
mistakes, rather than failed transport, arbitrary movement, or deliberately failed
rolls. No numerical win-rate guarantee is required.

## Context / Existing Behavior

The `computer-player/` daemon uses `/browser/v2`, service authentication, and a
separate worker for each match. Bugman selects random server-offered actions and
uses bounded setup handling and a turn-action limit. The existing selection,
membership, frozen-clone identity, and browse display support only Bugman.

The [BB2025 reference register](bb2025-rules-reference.md) links the user-selected
Blood Bowl Base rules and publisher errata/commentary. It is a source index, not
an offline rulebook. Read the relevant references before implementing decision
logic. Compare them with actual engine behavior and document material differences;
this feature does not change game rules to reconcile them.

## In Scope

- A selectable Bogruk identity with difficulty **Weak**, alongside unchanged Bugman.
- Durable identity, deterministic policy continuity, and request retry guarantees.
- Basic offense, defense, movement, blocking, fouling, ball transfers, setup,
  kickoff, rerolls, skills, and all mandatory choices exposed by the engine.
- Inspectable heuristics, bounded planning, configurable risk settings, diagnostics,
  focused tests, representative full-match validation, and documentation.
- All rosters available through the existing BB2025 computer-match flow.

## Out of Scope

- Mid or other coach levels, including their named standard formations.
- Machine learning, training, expert search, elaborate passing combinations,
  multi-turn tactical plans, clock management, or deliberate stalling.
- Bespoke tactics for every unusual skill or special action. These still require
  legal resolution and continued participation.
- Rules-engine changes, other rulesets' behavior, broad transport/authentication/
  lifecycle rewrites, new artwork, unrelated UI redesign, and deployment.
- Wholesale copies of third-party rulebooks, errata, or commentary.

## Functional Requirements

1. **Selection and identity:** expose Bogruk's name, Weak difficulty, and description
   in the normal opponent selector. Preserve the selected identity and policy across
   activation, reconnect, worker recovery, save/resume, and completion/browse views.
   Existing Bugman matches remain compatible and keep their random policy.
2. **Information and legality:** use only the coach's legitimate visible state,
   server-issued alternatives, player ratings/skills, and available outcome guidance.
   The server remains authoritative for legality, dice, and outcomes. Add only
   necessary compatible policy-facing state, with contract coverage.
3. **Offense:** approach and collect reachable loose balls; advance the carrier in
   the correct playing direction; use support, protection, assists, and useful
   forward positions. Consider simple handoffs and short passes when they clearly
   improve scoring or ball safety. Handle both directions and direction changes.
4. **Scoring priority:** always take an available scoring route requiring no dice,
   ahead of unrelated actions or deliberate mistakes. Evaluate risky scoring routes
   against useful alternatives. Never deliberately stall, retreat with possession
   to preserve it, or regroup/reform instead of pursuing progress. Necessary lateral
   or backward detours toward a forward objective, loose ball, or opposing carrier
   are allowed.
5. **Defense:** contest loose balls, pressure the opposing carrier, obstruct scoring
   routes, and stand up eligible players when useful. Prefer purposeful positioning
   over arbitrary movement.
6. **Blocks and fouls:** normally prefer useful favorable blocks, considering
   strength, assists, dice ownership, and relevant skills. Resolve block faces,
   pushes, follow-ups, and rerolls with basic judgment. Estimate foul removal benefit
   against sending-off risk and the fouler's value using a documented heuristic.
7. **Risk and frustration:** default to a 30% chance of selecting a deliberate
   suboptimal play per eligible team turn, increasing to 50% after one completed
   possession turn without forward ball progress and 70% after two or more.
   Reset frustration on forward ball progress, possession change, or a new drive.
   Allow at most one deliberate tactical mistake per team turn. A mistake is a
   legal, purposeful alternative that could succeed, such as a risky lane-clearing
   block when a safer dodge or route exists. An accepted choice consumes the
   allowance regardless of its dice result;
   bad dice on a sensible decision do not. Carrier gambles are allowed, except
   when a no-dice scoring route is available. Support risky blocks, poor ordering,
   low-value fouls, and unnecessary dodges/rushes; purposeful play stays dominant.
8. **Risk configuration:** centralize and document settings, inject randomness for
   tests, and permit recklessness to be disabled. Given the same policy version,
   saved decision state, and subsequent game states, policy choices must remain
   reproducible through reconnect and save/resume. Server dice are independent.
9. **Deployment and kickoff:** protect valuable players where legal constraints
   permit, but allow gaps that agile teams may exploit. Do not implement Mid's
   Chevrons, Boat, or other named formation library. Vary kick placement to attempt
   deeper and shallower landings instead of always aiming at the central sweet spot.
10. **Participation:** handle coin/receive, setup, kickoff events, rerolls, skills,
    reactions, block choices, and unfamiliar mandatory choices with a safe legal
    fallback. End exhausted activations and turns without loops, repeated rejected
    requests, or premature endings while obvious productive actions remain.
11. **Recovery and diagnostics:** reassess after resolved actions, possession
    changes, turnovers, and reconnects. Retry unanswered requests with their original
    request IDs. Persist policy state consistently with accepted game actions so
    retries cannot consume risk twice or reset it. Log lightweight decision reasons
    and deliberate-risk selections without credentials or private game data.
12. **Bounds:** cap decision work so four concurrent daemon matches remain
    responsive. Preserve existing request, state-size, and recovery bounds.

## Acceptance Criteria

- The normal browser flow starts the selected Bogruk or Bugman match, with distinct
  correct coach identity and preserved roster-selection behavior.
- With recklessness disabled, deterministic scenarios prove loose-ball collection,
  forward possession, guaranteed scoring priority, favorable blocking, defensive
  pressure, useful ball transfers, and coherent successive activation decisions.
- Controlled randomness proves purposeful risky blocks, low-value fouls,
  unnecessary movement risks, one-mistake limits, and 30/50/70% frustration settings.
- Scoring priority cannot be overridden by recklessness or supporting violence.
- Setup protects valuable players while allowing gaps; kick targets vary.
- Both playing directions, unavailable players, turnovers, reactions, rerolls,
  unfamiliar mandatory choices, and common relevant skills work correctly.
- Representative automated BB2025 full matches finish without policy-caused stalls
  or invalid-action loops. No flaky win-rate assertions are used.
- Reconnect, worker recovery, and save/resume preserve identity and policy choices,
  do not duplicate accepted actions, and do not replenish the mistake allowance.
- Random-policy, transport, browser contracts, and affected server regressions pass.

## Constraints

- Use branch `docs/bogruk-bb2025-references`; preserve unrelated working-tree changes.
- Follow Java 8 compatibility, repository coding conventions, and ruleset isolation.
- Preserve Android, Windows, and Linux compatibility in affected user-facing flows.
- Preserve MUTP colors, typography, themes, and existing UI scaffolding.
- Avoid new dependencies when existing facilities suffice.
- Add a user-facing entry to the latest `VersionChangeList` in `ChangeList.java`.
- The user authorized the usual branch/implementation/review/validation/commit/push/
  PR/merge workflow on 18 October 2026. Deployment is outside this handoff.

## Implementation Guidance

Keep the existing random policy as a separate selectable implementation. Evaluate
legal candidate actions against football objectives, retain an activation objective
across successive decisions, and occasionally commit a worse purposeful alternative.
Prefer existing projected movement/block guidance to duplicate rules calculations.
Persist only the state needed for identity and reproducible policy continuity.

## Work Slices and Issue Tracking

GitHub owns issue status. Issue links and acceptance evidence are maintained here
alongside the durable design. Implementation follows issue creation, per the
repository issue-tracker workflow.

Parent: [#301](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/301).

- [x] [#302 — Identity and durable policy contract](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/302)
- [x] [#303 — Bogruk decisions and worker integration](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/303), depends on #302's contract.
- [ ] [#304 — End-to-end acceptance and delivery](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/304), depends on #302 and #303.
- [ ] [#309 — Legal Secure the Ball reroll prompts](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/309), discovered during #304's real browser match; required to complete it.

1. **Identity and durable policy contract** — owner: primary implementation agent.
   Add coach selection, server-side identity/authorization/routing, compatible
   durable policy metadata/state, projection contract, and recovery regressions.
2. **Bogruk decisions and worker integration** — owner: computer-player workstream.
   Depends on slice 1's agreed contract. Implement heuristics, planning, risk,
   deployments, prompts, diagnostics, deterministic tests, and worker integration.
3. **End-to-end acceptance and delivery** — owner: primary implementation agent.
   Depends on slices 1 and 2. Exercise complete matches/recovery and browser startup,
   add the change-list entry, review standards and spec separately, run required
   builds, and record acceptance evidence and the closing PR.

## Validation

Start with focused selectors for the changed contracts and decisions. Run
`npm test` in `computer-player/`, relevant browser unit/UI tests and browser build,
affected game-server tests, and `mvn clean install`. Exercise a representative local
BB2025 match against Bogruk and automated full-match scenarios with varied rosters.
Check affected live-play, replay, reconnect, save/resume, and exact-request retries.
Record available platform checks and identify platforms not exercised. Investigate
failures and repeat affected checks until resolved or a concrete blocker remains.

## Completion Notes

Record source references, default risks and intentional mistake examples, exact
checks/scenarios and results, review findings and fixes, unresolved limitations,
platform coverage, issue/PR links, and the merged acceptance outcome in a companion
`bogruk-weak-computer-coach-outcome.md` report.
