# Coach-oriented match UI baseline

Tracking issue: [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101). Design: [playable-match specification](coach-oriented-playable-match-ui.md) and [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md).

Slice 1 records the starting contracts and affected checks. It adds no gameplay or renderer behavior. The completed-work reconciliation merged through [PR #100](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/100) at `2d6c0669bc3128ebf871078e9bd111ce5cd7f2d9`; the working tree was clean before branch `codex/coach-pitch-baseline` was created. [The reconciliation report](mvp-ui-reconciliation.md) records the repairs and passing CI. Implementation acceptance remains open.

## Production boundaries

| Responsibility | Existing boundary | Preserve while replacing presentation |
| --- | --- | --- |
| Authenticated match entry | `browser-client/src/play-entry.tsx` â†’ `GameView` in `SetupPanel.tsx`, using `V2Client` | Account/team ownership, independent actor, guarded pending requests, reconnect and completed result |
| Action/route orchestration | `browser-client/src/SetupPanel.tsx` | Offered declarations and targets, route preview/commit, smart continuation, setup and required choices |
| Transport and strict decoding | `v2-client.ts`, `setup-protocol.ts` | Current request IDs/revisions, accepted-response reconciliation, canonical coordinates and exact public fields |
| Shared scene | `LivePitch.tsx`, `LiveDugouts.tsx`, `PitchCompanion.tsx` | Canonical player/drop/square callbacks, off-pitch inspection, keyboard/text fallback |
| Native legality | `ffb-server/.../match/SetupSession.java`, `CorePromptActions.java`, `CoreTurnActions.java` | Current actor/action-ID checks and native commands; no new client rules |
| Server mounting/authentication | `FantasyFootballServer.java`, `BrowserV2Runtime.java`, `FirebaseV2PrincipalAuthenticator.java` | Marker-6 database, approved local profile, authenticated `/browser/v2` and membership isolation |
| HUD details | Existing scoreboard, player-card, clock, decision, history/log and game-menu modules | Bind the approved frames to authoritative facts and existing callbacks |
| Ordered state/replay | Current live playback and retained transcript/result consumers | Observed movements/outcomes; snapshots on reconnect and recorded state on seek |

`MatchPanel.tsx` and the old `full-match-demo.mjs` belong to the legacy v1 path. `usePitchInteraction.tsx` owns a local illustrative preview. Neither is the production v2 mutation path.

The first pitch uses an axis-aligned SVG/DOM surface, rectangular hit testing and canonical-row ordering. The new service must replace all three assumptions together. The old callback contract and tests remain comparison evidence: drag placement/return, rejected setup targets, staged declarations, reviewed routes, direct required choices and guarded end-turn behavior already pass through their current paths.

## Asset inventory

Human and Orc each have six positions and sixteen legacy standing variants. `assets/game/teams/{human,orc}/team.json` maps position IDs to variants; the manifest/master relationship and every assignment are strictly checked by `assets/game/scripts/sync-browser-assets.mjs`. Current `LivePitch.tsx` contains hand-written filename maps and slot-based variant selection.

The replacement needs a separate pose/archetype catalog and shared resolver. The existing position/roster IDs and legacy variant catalogs stay valid; front/back/prone files must never enter random variant selection. The required twelve archetypes produce 84 body assets and twelve distinct portraits. Preserve source images, exact prompts, alpha bounds, anchors, native/enlarged previews and versioned ZIPs. Browser exports remain generated from the canonical `assets/game/` tree. Missing art must retain an operable player/number token.

The approved stadium and ivory/cyan dice originate in the versioned ADR references. Promote production art through the canonical asset pipeline with provenance; production rendering must not depend on a documentation directory or baked sample HUD text. The reference camera and scenery registration are geometric evidence, not live acceptance.

## Affected-test manifest

| Slice/behavior | Focused checks | Broader gate |
| --- | --- | --- |
| Camera service | New forward/inverse, clipping, both ends, pan/resize/zoom and navigation tests | Browser unit tests and type/build checks |
| Art/resolver | Catalog/pose/facing/anchor/fallback tests; all assets at native size | `assets:check`, asset validation and production build |
| Live scene/input | `setup-drag-ui.mjs`, `smart-pitch-ui.mjs`, `push-choice-ui.mjs`, `end-player-action-ui.mjs`; add projected input/view-switch coverage | `npm run test:interaction` |
| HUD/confirmation | Decision, clock, log and player-detail tests; hosted setup/Blitz/result/keyboard tests | Browser units, site unit/browser tests and `build:play` |
| Decisions/playback/replay | Reconnect UI, existing native turn/prompt/route/recovery tests; authoritative dice and seek checks | Native focused tests, browser units and real-server scenario runner |
| Server/protocol extension if needed | Strict decoder, replay schema, recipient projection and recovery tests | Full Java target verification and service checks |
| Computer opponent | Policy/transport tests plus real-server integration | Computer-player Node 26 tests and acceptance runner |
| Final cutover | Full two-coach match, spectator, save/resume, chat, reconnect, replay; actual Chrome/Edge/zoom/keyboard/reduced motion | All required build/regression checks and recorded local acceptance |

The new tests protect geometry, contracts and behavior; they must not merely duplicate renderer calculations or establish playability with mocked snapshots. Focused passing checks are not repeated without changed files or a concrete unresolved concern. Every PR must finish its automated checks before merge.

Supported runtimes: bundled Node 24.19.0 for browser/site, Node 26.7.0 for computer player, exact Temurin 21.0.11+10 via `tools/target-build.ps1` for the Java target. The Java 8 baseline CI job deliberately checks a historical pinned revision. Final Java install uses the target wrapper's clean/install task rather than an arbitrary system JDK. Local raw outputs live under ignored `.tools/coach-oriented-match-ui/`; durable summaries and public CI links belong beside this spec.

## Existing evidence and its limits

PR #100 passed all automated checks, including Java 21, historical Validate, static delivery, Firebase service, workflow lint, secret scan and CodeQL. Local checks passed 122 browser units, all four interaction runners, reconnect, 58 asset checks/build, site checks/six units, eight computer-player tests, portable reference checks and the full Java reactor. State tests ran 192 with zero failures/errors and seven existing opt-in scenarios skipped. The stale `site-browser-final.log` contains a pre-repair failure; `site-placement-final.log` and the final PR static-delivery job establish the repaired placement check.

Native fixture generators and state tests exercise the engine, and browser fixture runners protect rendering/interaction. Direct adapter tests and fake WebSocket peers protect protocol behavior. They do not establish a two-browser live v2 full match. The existing legacy full-match runner reaches native full time through `/browser/v1`; it can inform scenario strategy but cannot close the new acceptance gate.

## Local acceptance prerequisites

Use the actual `/browser/v2` endpoint and the isolated [match-review stack](../../containers/local/match-review.md), started by `node tools/dev-local.mjs --start`. Its proxy is on 22232, isolated Java server on 22234 and database on 23317, with separate review volumes. Hosting at localhost:5000 uses real DEV Firebase authentication; there is no Auth emulator. `node tools/match-review-adc-check.mjs` verifies ADC. Preserve the source `ffb-current-dev` environment. Inspect existing provisioning before startup; do not reclone private account/team data for the acceptance runner. If a fresh database is required, initialize the supported schema and dedicated test data without copying private records.

`LocalServerMain` rejects emulator authentication and PROD configuration. Dedicated DEV Firebase test identities must authenticate through the existing bearer-token flow and receive real match memberships through normal create/invite/join. Start/restart dev-local and refresh administrator/ADC credentials when needed under the owner's authorization; keep tokens and private account records out of reports. The older marker-6 shared-profile acceptance instructions are historical rather than the preferred isolated startup path.

The new runner must prepare genuine Human and Orc frozen teams, drive UI intents from two independent coach clients, observe actual authoritative revisions and transcript/result storage, and verify spectator/read-only convergence. Complete both halves through accepted native decisions. Extend focused native scenarios for removals, resources, routes and big/small players without forcing a fake result. Reconnect, suspend/resume, durable chat, computer play and completed replay remain required. A concrete authentication or isolation blocker must be reported honestly; fixture transport cannot substitute for it.

## Slice ledger

| Slice | State/evidence |
| --- | --- |
| Reconciliation prerequisite | Merged PR #100; all automated checks passed |
| 1. Baseline and inventory | Merged [PR #102](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/102), revision `c2742c8b7fa25fc20b6df255207362c97b86cb0a`; all checks passed |
| 2. Projection service | Merged [PR #103](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/103), revision `7e7ccac4d21926db52d67b5ec76079b49c2a0e44`; independent review approved, 132 browser tests/build and all automated checks passed |
| 3. Art pack and resolver | Merged [PR #104](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/104), revision `17cad7043dbde33a92c7c2fe457d879db8981421`; 84 bodies and 12 portraits accepted at native/enlarged size, strict alpha/catalog/delivery checks, 137 browser tests, both builds and all automated checks passed |
| 4. Live pitch replacement | Merged [PR #105](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/105), revision `b1efe7723f174b33b108a93180dd8e2ccaf1f3b0`; independent input review approved, 138 unit tests, ten site browser tests, five interaction runners and all automated checks passed |
| 5. Live HUD binding | Authoritative resources, BANK/TURN clocks and eight-slot turn tracks; 30% supporting backgrounds, fixed chat/log, opposite-side inspector, compact categorized dugouts and reviewed proposals. Other action/text fallback, native prompts and menu controls retained. Independent review finding repaired; 140 unit tests, ten site browser tests, six interaction runners, route/reconnect checks, both builds and 161 asset checks passed. Publication pending |
| 6. Playback, decisions and dice | Pending |
| 7. Real-server verification and repairs | Pending |
| 8. Cutover and retrospective | Pending |

The final retrospective compares functional evidence with both the spec and the owner's presentation intent. Hosted signed-in release testing, overtime, yaw and a new stadium model remain separately reported work.
