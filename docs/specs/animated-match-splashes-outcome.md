# Animated match splashes — implementation outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/565
Draft PR: https://github.com/the-grognard-codes/fumbbl-rebuild/pull/569
Branch: `codex/565-animated-splashes`; isolated worktree `.worktrees/565`.

## Delivered

Tiers 1 and 2 are complete. Tier 3 adds optional decoration and per-kind preferences; additional high-drama event kinds remain disabled. Tier 4's visual iteration is complete for this delivery, with nine capture/review rounds across the three implementation stages. The PR remains draft; no merge or deployment was performed.

| Requirement | Result and evidence |
| --- | --- |
| Animated core events | Shared enter → impact → hold → exit phases; stepped ribbons, headline impacts, restrained turn start and torn turnover treatment. |
| Event timing | Total durations include exit: turn 1.5s; touchdown/turnover/half 3s; kickoff/weather 2.5s; final 4s. Animation-end completion has a timer fallback. |
| Authoritative kickoff | All 11 engine enum results; pending events survive staged placement/bonus actions and checkpoints, then precede the first playable turn. |
| Weather | Five engine weather kinds, initial and changed conditions; no INTRO or unchanged-weather announcement. Deferred kickoff weather follows its kickoff fact. |
| Half and final | Native half/match completion, scorer name/number and authoritative score; winner, draw and concession treatment. |
| Queue and recovery | Required-choice priority, dedupe, reconnect/hidden-tab recovery, replay seek/speed and spectator coverage remain tested. Old five-field checkpoints remain readable. |
| Accessibility | Persistent live region, explicit dismiss/Escape, no focus transfer or click-through, reduced-motion fades with decorative movement disabled. |
| Team identity | Saved ramps, camera-aware ribbon direction, split-team ribbons and independent black/white contrast edges. All 256 primary/secondary combinations tested. |
| Optional polish | Short team-colour bursts, five-step weather effects, score pulse and final plate entrance. Seven local visibility preferences preserve gameplay/log facts. |
| Review tooling | `browser-client/splash-review.html`: every engine variant, winner/draw/concession, saved colours, speed, camera direction and manual paused frame inspector. |

CSS keyframes use transform and opacity. React updates only at phase boundaries; there is no product per-frame animation loop. Headline, reminder and score remain DOM text on a stable dark plate. Original geometric SVG emblems/masks live in `assets/game/ui/match-events`; weather reuses existing approved sprites. No BB3 artwork or new runtime dependency was copied or introduced.

Kickoff names/descriptions come directly from the engine. Weather reminders were checked against the repository's BB2025 reference index, [its linked weather table](https://bloodbowlbase.ru/bb2025/core_rules/the_game_of_blood_bowl/#weather-table), engine modifier collections and heat handling.

## Visual review and evidence

Local full captures: `.tools/animated-splashes/round-{1,2,3}`, `tier2-round-{1,2,3}` and `polish-round-{1,2,3}`. Final expanded rounds contain 468 captures at 1440×900, 390×844, 1024×768 and 844×390, including six timed frames per kind, exits, engine variants, extreme saved colours and reduced motion. Tracked final representative images: `.notes/art-preview/animated-splashes/{kind}-{1440,390}.png`; existing core harness captures: `.notes/art-preview/match-announcements/`.

- Core rounds fixed missing production font, reduced-motion selector precedence, headline overflow, crowded phone controls and team entrance direction.
- New-event rounds added draw/concession coverage and tablet/landscape checks, corrected emblem aspect ratio, separated reminders from ribbons and opposed split-ribbon entrances.
- Polish rounds confined bursts/weather texture to the emblem area, enlarged wide weather artwork, added independent contrast edges and camera direction. Final round passed frame scrubbing, exit and reduced-motion checks.

No additional casualty/death, interception, perfect-pass/catch or sent-off splashes were enabled. Those are optional scope; this delivery conservatively avoids additional interruptions.

Next three review opportunities: observe pacing during a complete live Bogruk match; evaluate short nonblocking high-drama badges with the owner; check motion/readability on physical low-end mobile hardware.

## Verification

- `tools/target-build.ps1 install`: pinned Maven 3.9.9/JDK 21.0.11 full `mvn clean install` passed all reactor modules in 16m06s. Reports total 1,182 tests, 22 environment-gated skips, zero failures/errors (common 19; server 863/15 skipped; state tests 300/7 skipped).
- Focused `MatchAnnouncementPresentationTest`: 11 tests passed, including all kickoff enums, checkpoint recovery/staging, weather and completion facts. Browser fixture variants are generated from native engine tests.
- `npm test`: 543 tests passed, including all 256 team-colour combinations.
- `npm run build`: TypeScript and production bundle passed.
- `npm run assets:check`: canonical/mirrored assets and asset contract tests passed (578 assets).
- Browser drivers passed: `match-announcements-ui`, `game-menu-events-ui`, `match-dom-growth-ui`, `team-colors-ui`, `playback-ui`, `reconnect-ui`, and final `splash-review-ui` capture round.
- Actual GameView DOM-growth check warms a capped 100-row history, then presents/removes 51 announcements: the 50 iterations after warm-up retain identical DOM counts. The broader driver also covers 450 revisions.

An early UI run was interrupted by source-edit HMR; its clean rerun passed. Test harness corrections respected revision-indexed transcripts and waited for the observable exit state before advancing the mock clock; no product timing workaround was introduced.

## Verification limits

`.git/dev-local-state.json` identifies the main checkout as owner. As required by #565, this worktree did not take over or stop the shared stack. Native engine tests and browser harnesses provide the permitted fallback; an end-to-end live Bogruk match was not observed. Mobile coverage uses browser viewport emulation, not physical Android hardware. The 22 environment-gated Java tests remain skipped.

Bootstrap download failure was recovered using the existing checksum-verified Maven archive and a worktree-local dependency cache. Sandboxed javac failed closing JARs; identical focused/full builds passed with approved host execution. Root checkout user changes were preserved.

## Manual review follow-up — 2026-11-17

Reproduced a held touchdown disappearing after a same-revision next-drive prompt refresh. Revealing its score changed the presented state, so the repeated prompt was misclassified as a new mandatory choice. The pending card now remembers the deferred response revision; genuine new choices and recovery still preempt presentation. A browser regression failed before the fix and passes afterward.

Touchdown scorer and score now occupy separate block lines; legacy reasons retain their original text. Verified desktop/phone captures, 543 unit tests, TypeScript/build, announcement and playback drivers. Local Hosting artifacts refreshed without restarting the live game server. The clarified halftime card now has a short dotted central scrimmage line and faint wide-zone lines. Its heading stays on one line, centered on the scrimmage midpoint; the split-ribbon outline no longer creates a solid center seam. Four-viewport captures assert alignment and single-line text, including reduced motion. TypeScript/build passed and local Hosting was refreshed without restarting the game server.
