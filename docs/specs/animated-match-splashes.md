# Feature: Animated BB3-style match event splashes

Date: 2026-11-16. Owner decisions: in-match event splashes only (no title or
loading screen). Work runs unattended overnight; follow the
[overnight iteration protocol](#overnight-iteration-protocol) and take the work
as far as it will go.
Tracker: [#565](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/565).

## Abstract

Turn the existing static match splash into short, punchy animated sequences in
the spirit of Blood Bowl 3's event cards: the pitch dims, a backdrop wipes
across, a team-coloured ribbon sweeps in, the headline slams down with weight, a
supporting line follows, and the card leaves cleanly. Extend the same system to
every moment a coach should not miss: all eleven BB2025 kick-off events, weather
at the start and on every change, half-time, the final whistle, and selected
high-drama moments as stretch goals.

The look is MUTP's own SNES-era pixel art, not a copy of BB3's artwork, fonts or
layouts. "Similar to BB3" means the pacing, energy and readability.

## Objective

Make major match moments feel like events while keeping every guarantee the
current splash already gives: authoritative ordering, short durations scaled to
playback speed, safe dismissal, no click-through, correct spectator, reconnect
and replay behaviour, and reduced motion.

## Context / Existing Behavior

- [`MatchSplash.tsx`](../../browser-client/src/MatchSplash.tsx) (50 lines) and
  [`match-splash.css`](../../browser-client/src/match-splash.css) (43 lines)
  render one static card for three kinds defined in
  [`match-announcements.ts`](../../browser-client/src/match-announcements.ts):
  `turnover`, `touchdown` and `turnStart`. `announcementDuration` returns
  3000 ms (turnover/touchdown) or 1500 ms (turn start) divided by the playback
  rate. Props: `announcement`, `onDismiss`, `hold`, `exiting`, `rate`, optional
  `icon` and `colors` (`accent`, `secondary` → `--splash-accent`,
  `--splash-secondary`). The card shows a helmet (`MatchArt`), team name,
  headline and optional reason; Escape and a close button dismiss it.
- The design record is [match-transition-announcements.md](match-transition-announcements.md)
  (#408). Its rules on classification, ordering, dedupe by stable event id,
  required choices dismissing and suppressing splashes, spectator support, no
  replays on load/reconnect and no bursts on replay seek all remain in force.
- Team colours shipped ([team-colors-outcome.md](team-colors-outcome.md), #443)
  with primary/secondary ramps; splash helmets already recolour through the
  shared consumer (`TeamColorArtProvider.tsx`, `useTeamColorContext`).
- Engine values: kick-off results in
  `ffb-common/src/main/java/com/fumbbl/ffb/kickoff/bb2025/KickoffResult.java`
  — `GET_THE_REF`, `TIME_OUT`, `SOLID_DEFENCE`, `HIGH_KICK`, `CHEERING_FANS`,
  `WEATHER_CHANGE`, `BRILLIANT_COACHING`, `QUICK_SNAP`, `CHARGE`,
  `DODGY_SNACK`, `PITCH_INVASION`. Weather in
  `ffb-common/src/main/java/com/fumbbl/ffb/Weather.java` — `SWELTERING_HEAT`,
  `VERY_SUNNY`, `NICE`, `POURING_RAIN`, `BLIZZARD` (plus `INTRO`, which must
  never produce a splash). Display names come from the engine, not hard-coded
  strings in the client.
- Existing related UI: `DrivePhaseTracker.tsx`, `ConditionGlyph.tsx`, the
  weather icon work (#161), `MatchEventLog.tsx`, `LiveMatchScoreboard.tsx`.
- Tests: `browser-client/test/match-announcements.test.ts`,
  `match-announcements-ui.mjs` with `announcement-ui-harness.tsx`,
  `team-colors-ui.mjs`, `playback-ui.mjs`, `match-dom-growth-ui.mjs`.
- Panning and DOM-growth performance are active concerns (#527, #492). Splash
  animation must add no per-frame React work, no layout and no retained DOM.

## In Scope

- An animated phase model (enter, impact, hold, exit) shared by all kinds.
- Distinct treatments per kind (see the visual specification below).
- New announcement kinds: `kickoff`, `weather`, `halfTime`, `fullTime`, and the
  stretch kinds listed in Tier 3.
- Team colour for ribbons and accents from saved team colours, with MUTP
  neutral defaults.
- Small reusable pixel-art assets: backdrop strip, ribbon, burst, kick-off and
  weather emblems, a whistle, a scoreboard plate.
- A review page showing every kind in every state, plus reduced motion.
- Any minimal, compatible projection or event fields needed to classify the new
  kinds authoritatively, with contract tests.

## Out of Scope

- An app title or loading splash.
- Audio, voice-over, crowd sound or music.
- Changing rules, turn flow, kick-off resolution, weather rolls or the computer
  coaches.
- New player sprites or team crests.
- Copying BB3 artwork, fonts, logos or exact layouts.

## Visual specification

All timings are at playback rate 1 and divide by the rate. "Impact" uses
pixel-stepped motion (`steps()`), which suits the SNES look better than smooth
easing.

| Kind | Headline | Secondary line | Colour | Signature motion | Total |
| --- | --- | --- | --- | --- | --- |
| Touchdown | `TOUCHDOWN!` | Scorer's name and number, team name, new score | Scoring team | Ribbon sweeps from the scoring team's end; headline drops in large with a 2-frame overshoot; pixel confetti burst in team colours; scoreboard plate ticks the score | 3000 ms |
| Turnover | `TURNOVER` | The existing authoritative reason | Affected team, desaturated | Headline slams and the card shakes for 3 stepped frames; ribbon cracks or tears | 2000 ms |
| Start of turn | `START OF TURN n` | Team name | Active team | Quick ribbon slide and headline fade-scale; no burst | 1500 ms |
| Kick-off event | Engine display name (for example `QUICK SNAP`), or `CHANGING WEATHER` | Engine effect summary, or the resulting condition and its rules reminder for Changing Weather | Kicking or affected team when relevant, otherwise neutral | Emblem spins/flips into place (stepped), then headline. Changing Weather uses the resulting condition's artwork and motion. | 2500 ms |
| Weather | Condition name | Short rules reminder (for example "Pouring rain: −1 to catch, pick up and hand-off") | Neutral, tinted per condition (heat orange, sun gold, rain blue-grey, blizzard white) | Weather emblem with a looping 4–6 frame pixel effect (heat shimmer, sun rays, rain streaks, snow) behind the card | 2500 ms |
| Half-time | `HALF-TIME` | Team columns with the score beneath each name | Both teams split | Sports whistle and starburst | 3000 ms |
| Final whistle | `END OF MATCH` (or `MATCH CONCEDED`), from the same server headline as the log | Team columns with the score beneath each name, and the outcome | Winner's colours, or split for a draw | Sports whistle, with a starburst for a win | 4000 ms |

Common phase timings: backdrop wipe in ≈150 ms; ribbon sweep ≈200 ms; headline
impact ≈200 ms; secondary text fade ≈150 ms; hold for the remainder; exit wipe
≈200 ms. The hold absorbs differences so `announcementDuration` stays the only
source of total time. Rule-text summaries must be checked against
[bb2025-rules-reference.md](bb2025-rules-reference.md) and the engine's actual
behaviour; prefer the engine's own description text when it exists.

## Functional Requirements

1. **Phase model.** CSS drives the entrance and impact. The card's playback
   rate stays fixed from the start of the entrance through exit. Exit completes
   on `animationend` with a timer fallback. The until-dismissed preference
   keeps the card visible until dismissed. If the next splash is already
   queued when exit starts, only the card exits and the same shade keeps the
   pitch dimmed and blocks input during the 125 ms gap, scaled by playback
   rate. The final or only card fades the shade and uses the normal 350 ms
   gap, also scaled by playback rate. Natural exit, Escape and the close
   button follow the same rules. Escape during the short gap opens the next
   card immediately. If that card is suppressed during the gap, the shade
   fades out. The board keeps the outgoing revision's score and turn through
   the exit and gap, including when the next card is in another revision.
   A required choice cancels the run and lets the current card
   exit while the choice is available. If a new card arrives during the fade,
   the same shade darkens from its current opacity. Reduced motion uses
   opacity-only transitions between cards.
2. **Authoritative sources only.** Kick-off results, weather (initial and every
   change, including `WEATHER_CHANGE` kick-offs), half boundaries and match end
   come from authoritative events or projection fields. If any is missing from
   the V2 projection or event stream, add the smallest compatible field with
   protocol contract tests on both server and browser sides. Never infer from
   dice, logs or client-side counters. `INTRO` weather never shows.
3. **Ordering.** New kinds join the existing queue: initial weather before the
   first kick-off; kick-off result after the kick and its event resolve (after
   any staged placements are confirmed for Solid Defence / Quick Snap / Charge)
   and before the receiving team's first turn start. Changing Weather is one
   2500 ms card with the authoritative resulting condition, even when the roll
   leaves the condition unchanged. If kick-off splashes are hidden, a changed
   condition still shows as its own weather card when weather splashes are
   enabled. A touchdown that ends a half shows Touchdown then Half-time or
   End of Match. The final whistle is always last, including after a concession.
   Overtime and its announcements are a separate feature.
4. **Existing guarantees kept.** Dim the pitch and block pitch input; prevent
   click-through; preserve keyboard focus; Escape and the close button dismiss;
   required choices dismiss active splashes and suppress queued ones (events
   stay in the log); dedupe by stable event id; nothing replays on initial load
   or reconnect; replay seek causes no bursts; coaches and spectators see them.
5. **Colour.** Ribbons, bursts and accents use the relevant team's primary and
   secondary colours, with shading derived from the team-colour ramps. Ensure
   legible contrast for every one of the 16×16 colour pairs (test the extremes
   and identical primary/secondary), falling back to a dark or light outline
   when contrast is too low.
6. **Live text.** Headlines, names, reasons and scores remain accessible text,
   announced once through the existing live region. Nothing textual is baked
   into images.
7. **Reduced motion.** Under `prefers-reduced-motion` and any in-app motion
   setting already honoured elsewhere: plain fade in and out, no shake, burst,
   sweep, spin or looping weather effect.
8. **Performance.** Animate only `transform`, `opacity` and non-layout custom
   properties. No JavaScript animation loop and no React state updates during a
   phase. Assets are small sprite sheets loaded once and cached. The splash DOM
   is removed after exit. `match-dom-growth-ui.mjs` must show no growth across
   50 splashes.
9. **Responsive.** Desktop, Android tablet and phone layouts, portrait and
   landscape. Long team names scale down or wrap to two lines without clipping.
10. **Settings.** Respect the existing until-dismissed preference. Stretch:
    a per-kind toggle (for example hide Start of Turn) in the existing settings
    surface, persisted where similar preferences already live.

## Tiers

Complete tiers in order. Each tier ends green, committed and pushed.

- **Tier 1 — Animated core.** Phase model and animated treatments for the
  existing three kinds; reduced motion; tests updated; review page entries.
- **Tier 2 — New kinds.** Kick-off (all eleven), weather (all five, initial and
  change), half-time, full time/concession, with authoritative classification,
  ordering, tests and review page entries.
- **Tier 3 — Polish and drama (stretch).** Pixel confetti/burst sprites,
  weather loop effects, scoreboard tick, contrast fallback across all colour
  pairs, per-kind toggles. Optional high-drama kinds if they come from
  authoritative events and stay short: `CASUALTY` / `DEAD` for a player removed
  as a casualty, `INTERCEPTION`, `PERFECT PASS`/`CATCH` on a scoring pass,
  `SENT OFF` on an ejected fouler. Each must respect required-choice
  suppression and must not delay play more than the existing budget.
- **Tier 4 — Iterative visual polish (until stopped).** Repeat the visual
  review loop below, improving art, timing and readability.

## Acceptance Criteria

- Every kind renders in the review page at desktop and Android sizes with Human
  and Orc teams, at least three saved colour pairs (including identical
  primary/secondary and a low-contrast pair), and reduced motion.
- Unit tests classify the new kinds from authoritative fixtures, including:
  initial weather then kick-off then turn-start ordering; a `WEATHER_CHANGE`
  kick-off; each kick-off enum value; touchdown ending a half; full time after a
  concession; no splash for `INTRO`.
- `match-announcements-ui.mjs` covers the phases (enter, impact, hold, exit,
  DOM removed), dismissal mid-phase, until-dismissed hold, required-choice
  suppression, reconnect with no old splashes, replay seek without bursts,
  spectators and reduced motion.
- Frame captures (at least 6 frames per kind) or short recordings are saved
  under `.tools/animated-splashes/` and summarised in the outcome report.
- Browser unit tests, all affected UI drivers, TypeScript, production build, and
  `mvn clean install` if any Java changed, all pass.

## Overnight iteration protocol

This work runs unattended. Do not stop at the acceptance criteria.

1. Open a **draft PR** as soon as Tier 1 is green, and push after every tier
   and every iteration that passes checks. Keep the PR description updated with
   a tier checklist, the latest captures and remaining ideas.
2. After each tier, and repeatedly in Tier 4, run a **visual review loop**:
   capture every kind at desktop and phone size; critique each capture in
   writing against this checklist (readability at a glance within 0.5 s, team
   identity obvious, motion feels weighty not floaty, nothing clipped, contrast
   on all colour pairs, consistent with MUTP pixel art and the pitch, no jank
   while panning); then fix the weakest three items and capture again. Record
   each round (before/after captures and the critique) in the outcome report.
   Do at least three rounds before calling any tier finished.
3. Never leave a commit that breaks earlier tiers. Run the focused tests every
   iteration and the full validation at the end of each tier.
4. If a decision belongs to the owner (for example how loud a Casualty splash
   should be), record the question and both options in the outcome report,
   implement the more conservative option behind a clearly named constant, and
   continue.
5. If a tier is blocked by something outside this issue, record the blocker
   with evidence and move on to the next independent item.
6. Before your session ends, finish the current iteration cleanly, push, and
   write `docs/specs/animated-match-splashes-outcome.md`: tiers completed,
   requirement-by-requirement status, review rounds, validation evidence,
   open questions for the owner and the next three improvements you would make.

## Execution environment

This issue owns the shared dev-local stack for live checks (`node tools/dev-local.mjs --start` from your worktree). If its state shows another worktree owns it, do not take it over; use the announcement UI harness instead and note it. Stop dev-local when you finish.

## Execution environment (shared)

Three Codex sessions (#565, #566, #567) run at the same time on the owner's
main PC.

- **Use your own new git worktree**, for example
  `git worktree add ../fumbbl-rebuild-wt/<issue> -b <branch> origin/main`.
  Never work in the main checkout or in another session's worktree. Install
  `browser-client` dependencies inside your worktree.
- **dev-local is a single shared stack** (fixed ports 5000, 22232 and 22234,
  one shared state file). Only #565 may start or use it. Others must not start,
  stop or restart it.
- **Ports.** Pick free ports for Vite and any test servers. If a test driver
  hard-codes a port, add an environment-variable override instead of racing for
  it.
- **Maven.** Build from the root reactor (`mvn clean install`, or
  `mvn -pl <module> -am …`) so modules resolve from your worktree, not from
  another branch's snapshot in the shared `~/.m2`.
- **Load.** Builds and UI drivers from three sessions compete for CPU and RAM.
  If a timing-sensitive test fails, rerun it once before debugging, and note
  contention in the outcome report.
- **Shared files.** Only #565 edits `CHANGELOG.md`. Do not edit files that
  belong to another issue's scope.

## Constraints

- Ensure the themes are all supported on Android, Windows, and Linux.
- MUTP colours, typography, style and themes are preserved. Reuse the existing
  splash component, CSS tokens and team-colour scaffolding.
- No new runtime dependencies (no animation libraries).
- BB2025 only. Rules stay unchanged.
- Preserve unrelated working-tree changes. Follow repository conventions and
  `AGENTS.md` (Java 21, import order, service classes, test naming).
- Record the user-visible change under Unreleased in `CHANGELOG.md`.

## Implementation Guidance

- Extend `MatchAnnouncementEvent` with new kinds rather than adding a second
  queue; keep `announcementDuration` the single timing source.
- Drive phases with CSS keyframes and `animation-delay` computed from
  `--splash-rate`.
- Tint one greyscale ribbon/burst sheet through custom properties or the
  existing team-colour recolouring path rather than authoring per-team art.
- Weather emblems can reuse or extend the #161 weather icon work if it has
  landed; otherwise create small emblems and note it.

## Validation

- Add or update unit tests and the announcement UI driver as above.
- Run `npm run review:splashes` in `browser-client` to capture the interactive
  review page at desktop, tablet and phone sizes.
- Run the browser unit suite, affected UI drivers, TypeScript and the
  production build every tier; `mvn clean install` if Java changed.
- Inspect real matches in the dev server (dev-local quick start), including a
  computer match against Bogruk, to see splashes in live order.

## Delivery authority

Create branch `codex/565-animated-splashes` from current `main`. Commit, push
and keep a draft PR referencing #565 updated throughout. Do not merge, mark the
PR ready, or deploy; the owner reviews in the morning.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
