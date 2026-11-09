# Architecture map for reviewers

A one-page orientation for agents reviewing or planning work. It names where
things live and which invariants a change must keep. Commands, setup and module
purposes live in [Readme.md](../../Readme.md); vocabulary lives in
[CONTEXT.md](../../CONTEXT.md). Update this map when a seam it names moves.

## Request path for a live match

```text
browser-client/src/play-entry.tsx            product entry (React + Pixi)
  └ v2-client.ts, *-protocol.ts               V2 message encode/decode per feature
      │  WebSocket /browser/v2
ffb-server/.../server/local/
  BrowserMatchServlet, BrowserMatchSocket     transport, connection lifecycle
  BrowserV2Adapter                            the one authenticated V2 protocol:
                                              preparation, play, observation
ffb-server/.../server/match/
  MatchService, V2PreparationService          durable preparation (no engine)
  SetupSession                                setup and engine hand-off
  *Actions (CoreTurnActions, KickoffActions…) browser decisions → native commands
  *Presentation / *Projection                 read-only views sent to browsers
  RecoveryJournal, MatchTranscript            durable checkpoint and transcript
  Jdbc*Repository                             persistence
ffb-server/.../server/
  GameState, StepExecutor                     native engine state and step stack
  step/ (+ step/bb2025/…)                     Step classes: one rules unit each
  step/generator/bb2025/                      SequenceGenerator builders that
                                              push Step sequences for an action
  skillbehaviour/bb2025, mechanic/bb2025      skill and rules mechanics
ffb-common/                                   shared models (FieldModel, enums,
                                              factories) used by server and recovery
```

Other components: `computer-player/` is a browser-protocol opponent;
`game-service/` is a standalone Jetty session service with its own README;
`site/` is the public site and `site/updates.json`; `assets/game/` holds
canonical art synced into the browser by `npm run assets:sync`.

## Invariants to check in review

- **Server is authoritative.** Browser input selects among server-offered
  decisions. Presentation and projection code observes state and never decides
  or changes native rules (see the `GameState` observer comments).
- **One engine worker, bounded dependencies.** Preserve worker ownership, the
  2,000 ms whole-request ceiling, and the narrow local-logging allowance
  ([ADR 0006](../adr/0006-single-engine-worker.md)); implementation gaps remain tracked there.
- **One durable boundary per action.** A successful checkpoint commits an action
  and its outcomes together; exact retries read the checkpoint and append
  nothing; storage admission rejects an action before native execution when it
  cannot reserve room ([ADR 0002](../adr/0002-bounded-match-transcript.md),
  [ADR 0004](../adr/0004-durable-recovery-journal.md)).
- **Recovery never reruns game commands.** It assembles a base checkpoint plus
  bounded continuations and restores through the native restore path; it does
  not rerun commands, dice, clocks or optional-skill decisions (`RecoveryJournal`,
  [ADR 0004](../adr/0004-durable-recovery-journal.md)).
- **Stored formats stay compatible.** Transcript, recovery, saved-team and
  catalog formats are versioned; V2 replay and recovery must read what earlier
  builds wrote unless an ADR retires a format.
- **BB2025 only.** Rules code sits in `bb2025` packages, shared infrastructure
  in `common`; unsupported ruleset input is rejected explicitly.
- **Identity and scope are server-owned.** Every operation checks token expiry
  and refreshes local account, identity and scopes. Incoming requests reuse
  successful Firebase provider checks for at most five seconds; passive pushes
  use local checks and existing token expiry under the accepted option A amendment
  ([ADR 0005](../adr/0005-bounded-provider-revalidation.md)).
- **Accepted ADRs stand.** Flag a conflict with any file in `docs/adr/` rather
  than letting the change override it silently.

## Hotspots

Large files where changes deserve extra scrutiny:
`server/match/SetupSession.java`, `server/match/MatchJson.java`,
`server/step/bb2025/StepEndTurn.java`,
`server/step/bb2025/kickoff/StepApplyKickoffResult.java`,
`ffb-common/.../model/FieldModel.java`, `browser-client/src/GameView.tsx`.
Files named `generated-*.ts` are build output from `assets/game/scripts`; review
the generator, not the output.

## Where the work is described

- Feature specs, outcomes and retros: `docs/specs/` (`<feature>.md`,
  `<feature>-outcome.md`). The spec is the acceptance source for review.
- Decisions: `docs/adr/`. Issues: GitHub, mirrored locally per
  [issue-tracker.md](issue-tracker.md).
- Tests: `ffb-server/src/test` (JUnit), `ffb-statetest` (native game-state
  regressions), `browser-client/test` (node tests and browser suites).
- CI: `.github/workflows/maven-verify.yml` and `browser-validation.yml`.
