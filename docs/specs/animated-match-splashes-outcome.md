# Animated match splashes — implementation outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/565
Draft PR: https://github.com/the-grognard-codes/fumbbl-rebuild/pull/569
Branch: `codex/565-animated-splashes`; isolated worktree `.worktrees/565`.

## Delivered

Tiers 1 and 2 are complete. Tier 3 adds optional decoration and per-kind preferences; additional high-drama event kinds remain disabled. Tier 4's visual iteration is complete for this delivery, with nine capture/review rounds across the three implementation stages. The PR remains draft; no merge or deployment was performed.

| Requirement | Result and evidence |
| --- | --- |
| Animated core events | Shared enter → impact → hold → exit phases; stepped ribbons, headline impacts, restrained turn start and torn turnover treatment. |
| Event timing | Total durations include exit: turn 1.5s, turnover 2s, touchdown/half 3s, kickoff/weather 2.5s, final 4s. The card keeps its starting playback rate and animation-end completion has a timer fallback. |
| Authoritative kickoff | All 11 engine enum results; pending events survive staged placement/bonus actions and checkpoints, then precede the first playable turn. |
| Weather | Five engine weather kinds cover initial and changed conditions. Changing Weather includes the server's resulting condition, even when the roll leaves it unchanged. A separate weather card can play when kickoff cards are hidden and the condition changed. |
| Half and final | Native half/match completion, scorer name/number and authoritative score; winner, draw and concession treatment. |
| Queue and recovery | Required choices take priority. The shade stays up between queued cards, including across transcript revisions. Announcement checkpoint recovery requires all eight fields. |
| Accessibility | Persistent live region, explicit dismiss/Escape, no focus transfer or click-through, reduced-motion fades with decorative movement disabled. |
| Team identity | Saved ramps, camera-aware ribbon direction, split-team ribbons and independent black/white contrast edges. All 256 primary/secondary combinations tested. |
| Optional polish | Short team-colour bursts, five-step weather effects, score pulse and final plate entrance. Seven local visibility preferences preserve gameplay/log facts. |
| Review tooling | `browser-client/splash-review.html`: every engine variant, winner/draw/concession, saved colours, speed, camera direction and manual paused frame inspector. |

CSS keyframes drive the card's entrance and impact using transform and opacity. React commits the active card, its exit and its removal. Headline, reminder and score remain DOM text on a stable dark plate. Original emblems and weather masks live in `assets/game/ui/match-events`.

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
The touchdown card now pairs each team's score with its name in two columns. It reads both scores from the touchdown revision and highlights the scoring team. The scorer remains on a separate line when the event includes one. The announcement UI check and all 543 browser unit tests passed, and captures verified the layout at four viewport sizes.

For kickoff art review, serve the browser client with Vite and open `/splash-review.html?event=kickoff`. The Variant picker offers all 11 engine results. Replay animation restarts the selected splash, and Inspect frames lets reviewers stop on individual frames. The four-viewport captures are under `.tools/animated-splashes/kickoff-art-review/`.

The final whistle now reads End of Regulation for normal wins and draws. Concessions retain their own title. The post-game summary and potential overtime remain separate work.

All kickoff variants have event artwork. Get the Ref reuses the mole referee from Argue the Call, and Changing Weather uses the actual resulting weather. If the same native sync includes its weather change, the kickoff card includes that fact and the queue plays one card. Both facts remain in the log. The standalone weather card remains available when kickoff splashes are disabled.

The art review includes all 11 kickoff results, all five resulting conditions for Changing Weather, and the End of Regulation and concession cards. Captures at four viewport sizes are in `.tools/animated-splashes/kickoff-emblems/`. The generated art, reuse notes and prompts are documented in `assets/game/ui/match-events/README.md`.

Half-time and End of Regulation share a conventional silver sports whistle and a short stepped tilt and settle. Weather and Changing Weather cards feather the existing condition sprites into the effects with an elliptical mask. The mask stays in reduced motion and the whistle entrance and moving weather effects are removed. Captures at four viewport sizes are in `.tools/animated-splashes/whistle-weather/`.

The current finish title is End of Match. Half-time and the finish cards use the touchdown score columns, with the score read from the event's transcript revision. The final result appears below the columns. Half-time uses the shared starburst in both team colours and its card has no pitch markings. Four-viewport captures and reduced-motion checks are in `.tools/animated-splashes/match-score-cards/`.

## Independent review follow-up — 2026-11-18

The match log and splash share the engine's final headline. A single BB2025 service owns kickoff team attribution and weather reminders. The server observes weather from its setter and sends structured scorer and resulting-weather data. The engine test compares its generated kickoff and weather facts against the committed browser fixture.

The browser driver checked that the same shade stays opaque and intercepts input across the 125 ms gap at 1×, including across revisions, with Escape, a close-button click and a natural exit. A required choice immediately has input while the shade fades. Reduced motion uses opacity only for the chained cards. The last or only card still fades the shade and uses the normal 350 ms gap at 1×.

A long turnover reason fits the card and reaches full opacity at 1× and 4×. It has about 1.1 seconds at full opacity at 1× and 275 milliseconds at 4×. The latter is too short to reliably read a long reason at speed. The reason remains available in the log and the existing until-dismissed setting keeps the card visible.

The production browser build, all 545 browser unit tests, announcement, menu, playback, team-colour, reconnect and DOM-growth drivers passed. `npm run review:splashes` captured 488 frames at four viewport sizes under `.tools/animated-splashes/independent-review/`.

## Shade handoff review — 2026-11-18

The playback queue decides the handoff when it reaches the next visible beat, including across transcript revisions. The browser regression covers a suppressed next card, a card hidden during the gap, a required choice that leaves the old card in its exit animation, and a new card that reverses an in-progress shade fade. Escape during an empty gap opens the queued card immediately.

The server test rolls Quick Snap, High Kick and Charge through native kickoff steps with each team kicking and checks the emitted splash team in the transcript. The eight-field announcement checkpoint requirement still applies. Finish or reset any in-flight DEV matches before deploying these changes, since pre-deploy saves with the old five-field format cannot resume on the new runtime.

The next review caught a score and turn update beneath a card that had yet to exit. Playback now stages the completed revision while it finds the next visible beat and commits that revision after the exit and gap. The browser regression verifies the old score and turn stay visible through the gap and the next card still shares the same shade.

The first shade entrance uses CSS keyframes at the rate of the first card in the run. If the card exits early, the entrance freezes at its current opacity while the outer shade fades. CSS transitions still reverse the outer fade when another card arrives. React state holds the active card's rate, and Escape reads the gap callback when pressed.
