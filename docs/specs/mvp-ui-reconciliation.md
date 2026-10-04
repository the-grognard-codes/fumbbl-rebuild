# Completed MVP UI work reconciliation

Status: reconciliation in review on 2026-10-04. Base: `68d3d2fcd` (`main`); branch: `codex/reconcile-mvp-ui`. Related existing gameplay issue: [#53](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/53). PR/check/merge evidence will be recorded before starting new implementation.

The owner authorized publishing the completed work before replacing the first pitch MVP. This reconciliation preserves both the existing live application's refinements and the approved angled-pitch reference. It records the [approved integration specification](coach-oriented-playable-match-ui.md); it does not claim that specification is implemented.

## Included work

| Area | Completed change |
| --- | --- |
| Presentation decision | ADR 0003, glossary/layout pointers and four versioned camera studies, with original art/provenance and exact pitch geometry |
| Approved reference | 40-degree travelling perspective, opposite coaches, centered scrolling top-down, moving crowd/stands, fixed translucent HUD and canonical 26×15/390-square pitch |
| Reference HUD | Available-only resource boxes/tooltips, BANK/TURN clocks, hover inspector, compact actions/Confirmed!, chat, event fonts, turn tracks/weather gap and hidden study controls |
| Dice review | Three block/d6 sets, exact faces, transparent exports, short/reduced-motion roll studies; ivory/cyan selected |
| Existing live client | Team-name fitting, public clock display, player status/position details, compact decisions, actions, arrows and match history refinements |
| Server/computer client | Public clock/reserve recovery, player detail projection and periodic computer-job rediscovery with bounded retry |
| Approved next work | Full local real-server integration/acceptance, twelve position archetypes with poses/portraits and a branch-to-merge workflow per slice |

The documentation references remain illustrative: resource counts, timers, messages, action proposals and dice examples there do not send real commands. Their repeated standing cutouts are not the new twelve-archetype pack. The live pitch remains the first-draft overhead renderer until the new integration slices pass their acceptance gate.

## Review and verification

Independent review found three issues in the uncommitted refinements: setup had lost its keyboard/touch placement path; required pitch choices could clip on narrow screens; generic reports dropped team attribution. Repairs restore collapsible placement controls through the existing guarded placement callbacks, keep required choices in a viewport-bounded portal with focus restoration, and translate native team IDs through frozen player identities into team names. Focused tests cover placement/return and rejected drops without dragging, a 375px required-choice viewport, and paired home/away fan rolls.

The first full Java target verification exposed compatibility gaps around the new optional player detail fields and retained replay/checkpoint fixtures. The replay validator now accepts bounded public status and paired position fields while rejecting unknown/private fields, malformed pairs and transient clock state. Projection assertions and retained fixtures include the new public status. A route test also needed two fixed dice: Team Captain rolls before the Dodge reroll. Its destination assertions remain unchanged; the focused method passed eight repetitions and the complete class passed all 18 tests.

| Check | Local result |
| --- | --- |
| Browser unit tests | 122 passed |
| Asset source/delivery check | 58 assets verified |
| Browser production build | Passed; existing chunk-size warning remains |
| Pitch interaction suite | All four runners passed, including keyboard/touch setup and narrow required decisions |
| Reconnect UI | Passed |
| Static site checks and unit tests | Passed; six unit tests |
| Site browser tests | Initial suite passed 9/10 after the UI repairs; updated placement assertion then passed both tests in its file |
| Computer-player tests | Eight passed |
| Reference HUD/hover/tactical checks | Passed, including the newly preserved portable runners |
| Dice export/animation checks | Passed |
| Full Java target verification | All eight reactor modules passed; state tests: 192 run, zero failures/errors, seven existing opt-in scenarios skipped |

Raw local outputs are retained under the ignored `.tools/coach-oriented-match-ui/reconciliation/` directory. Reference interaction checks are reproducible from the versioned `docs/adr/references/0003-angled-pitch-v4/checks/` scripts.

Affected checks: browser unit/protocol/log/clock/player-detail tests, setup/target/push/end-action interaction and reconnect checks; static hosted site/keyboard/result tests; computer-player policy/transport tests; native server projection, checkpoint, persistence and recovery tests; full Java target verification. Reference checks cover camera geometry, HUD/hover/tactical interaction, dice exports and animation.

Local browser runtime: bundled Node 24.19.0. Computer-player runtime: Node 26.7.0. Java target: Temurin 21.0.11+10. The Java 8 CI baseline intentionally checks its pinned historical revision; current Java changes use the repository's target-build wrapper.

## Remaining work

Complete the [coach-oriented playable match specification](coach-oriented-playable-match-ui.md) after this reconciliation merges. It retains the prior authoritative gameplay contracts and replaces their presentation. Full new-view Human-versus-Orc live acceptance, new sprites and the final retrospective remain required; hosted signed-in release acceptance remains separate.
