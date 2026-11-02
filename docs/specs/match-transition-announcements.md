# Feature: Turnover, touchdown, and start-of-turn splash announcements

Tracker: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/408

Branch: `feature/match-transition-announcements`, isolated worktree `.worktrees/match-announcements`.

## Abstract
Add a consistent match splash graphic for TURNOVER, TOUCHDOWN, and "<Team> START OF TURN <turn>" announcements in Browser V2. Reuse the Human/Orc scoreboard helmets, with the blue Human helmet as fallback, and provide optional future colour accents with neutral MUTP production styling.

## Objective
Make major match transitions immediately understandable: why a turn ended unexpectedly, which team scored, and whose numbered turn is starting.

## Context / Existing Behavior
The match log can show only "Turn ends" after a consequential action, leaving the coach to infer the cause. Throw Team-Mate collisions with friendly players and throws that leave the pitch are examples where the turnover reason is difficult to identify.
A touchdown also ends a turn automatically, but should receive its own announcement. Deliberately ending a turn should lead to the next start-of-turn announcement without a TURNOVER splash.

## In Scope
- A new reusable splash graphic/component with three announcement variants.
- Authoritative event classification and ordered presentation for turnovers, touchdowns, and actual team-turn starts.
- A concise turnover reason and affected team; scoring-team identity for touchdowns.
- Existing default helmet icon reuse and an unwired team-colour presentation scaffold.
- Accessible, responsive presentation integrated with the existing match animation queue and event log.

## Out of Scope
- Changing gameplay, turnover rules, scoring, turn counters, or computer-player decisions.
- Wiring team colours to saved-team data, adding colour pickers, or creating team-customisation storage.
- New custom team crests, icon uploads, audio announcements, or replacement player sprites.
- Publishing or remotely deploying the implementation. The later delivery authorization includes starting dev-local for manual validation.

## Functional Requirements
1. Show TURNOVER when an authoritative rules-triggered turnover ends a team's turn. Include the affected team and a short readable cause, such as "<player> knocked down performing a block." or "Team-mate <player> knocked down by a thrown player" or "<player> failed to pick up the ball.  Reference the player whose action instigated the TURNOVER when appropriate.  Use a generic reason if the authoritative cause is unavailable; never infer it from a failed die roll alone.
2. Do not classify every automatic turn end as a turnover. A deliberate End Turn produces no TURNOVER splash; a touchdown produces TOUCHDOWN instead. Half/full-time boundaries, setup, disconnection, and recovery must not produce spurious turnovers.
3. Show TOUCHDOWN for each confirmed score, with the scoring team's name and helmet icon. Do not also show TURNOVER for the same scoring transition, including a touchdown during the opposing team's turn.
4. Show "<Team> START OF TURN <turn>" once when a normal playable team turn begins. Resolve the team name and turn number from authoritative match state. Respect half/extra-time numbering and skipped or adjusted turns; do not increment a client-side counter. Setup and kickoff bonus actions must not masquerade as ordinary numbered turns.
5. Sequence presentation after the causative action and its dice, movement, injury, and ball resolution. Present TURNOVER before the next team's start splash. Present TOUCHDOWN before subsequent drive/setup presentation; wait for an actual playable turn to show its start splash.
6. Create a new cohesive MUTP splash graphic with distinct turnover, touchdown, and turn-start treatments. Provide clear headline, team identity/icon, and optional reason areas. Keep text as accessible live text rather than baking names, numbers, or reasons into artwork.
7. Reuse the Human/Orc scoreboard helmet graphics, with the blue Human helmet as fallback. Include an explicit replaceable icon slot.
8. Add optional team-colour inputs/tokens and an independently tintable accent region (for example, a ribbon, border, or backdrop). Leave production team-colour lookup unwired. Use neutral MUTP defaults and demonstrate sample colours only in previews/tests.
9. Dim the entire pitch slightly and temporarily block pitch actions. Default to 3 seconds for turnover/touchdown and 1.5 seconds for turn start, scaled to playback speed, with safe dismissal through the brief exit fade and a persistent until-dismissed preference. Prevent click-through and preserve keyboard focus. Required choices dismiss active splashes and suppress queued announcements that would delay the choice; retain those events in the log. Integrate with existing playback/input gating rather than pausing the server.
10. Support both coaches and spectators. Deduplicate by stable event identity across delivery retries and reconnect/catch-up; do not replay old splashes on initial load or reconnect. Replays should show announcements when advancing through their events, with seeking avoiding a burst of historical announcements.
11. Preserve a readable announcement and turnover reason in the match log so transient information remains available. Support reduced motion and assistive-technology announcements without relying solely on colour.

## Acceptance Criteria
- A friendly-player Throw Team-Mate collision and a thrown player leaving the pitch each show exactly one TURNOVER with the correct team and cause.
- A failed roll that is successfully rerolled, or a non-turnover failed landing without the ball, does not show TURNOVER.
- Deliberate End Turn shows only the next playable team's start announcement.
- A confirmed score shows exactly one TOUCHDOWN for the scoring team, without a redundant TURNOVER.
- Each real team-turn start displays the correct team name and authoritative turn number, including first turns, half transitions, and adjusted/skipped-turn cases.
- Announcements respect action resolution and drive/setup ordering; rapid computer turns do not overlap, reorder, or drop them.
- Duplicate delivery, reconnect, and initial catch-up do not generate duplicate or stale splashes; replay advancement and seeking behave as specified.
- All three variants use the existing helmet, and preview examples demonstrate the colour scaffold without any production team-colour data integration.
- Long team names, reasons, and narrow viewports remain readable without clipping. Reduced-motion mode, keyboard dismissal, screen-reader text, and click-through prevention work.
- The game log retains enough detail to understand the announced event after the splash disappears.

## Constraints
- Support browser use on Android, Windows, and Linux.
- Preserve MUTP colours, typography, style, and themes; reuse existing CSS and UI scaffolding.
- Browser V2 is the product runtime. Canonical raster assets, if needed, belong in assets/game and must follow existing packaging conventions.
- Use authoritative match events/state; do not parse human-readable log strings to determine game semantics.
- Backward compatibility with older transcript/protocol formats is not required. Current-version recovery remains required. Do not change rules to manufacture presentation events.
- Create a new implementation branch, preserve unrelated working-tree changes, and follow repository conventions.
- Record the implemented user-visible change under Unreleased in CHANGELOG.md. Update site/updates.json only after merge.
- Do not commit, push, publish, or deploy without explicit authorization.

## Implementation Guidance
- Start by tracing native end-turn/score reports and the Browser V2 presentation queue. Inspect browser-client/src/pitch-playback.ts, use-pitch-playback.ts, presentation-timing.ts, and match-log.ts.
- Represent announcement kind, stable event identity, team identity, turn number, and optional reason as structured presentation data. Carry a structured reason from the server only where existing events cannot reliably express it.
- Separate reusable visual framing from event selection and scheduling. Use a replaceable icon slot and optional colour tokens; confirm the existing team-identity helmet asset before implementation.
- Prepare a reviewable visual preview of all three splashes at desktop and mobile sizes, including neutral defaults and sample future colour accents.
- Explicitly handle score precedence and team-turn boundaries rather than treating any change of active side as a turnover.

## Validation
- Add focused native/protocol tests only where event or reason projection changes, using synthetic matches rather than private production logs.
- Add browser regression tests for classification, ordering, deduplication, start-turn identity/numbering, deliberate end-turn exclusion, touchdown precedence, and replay/reconnect behaviour.
- Exercise rapid computer turns, a pending choice after resolution, reduced motion, keyboard interaction, long team names, and narrow layouts.
- Run the relevant unit/browser suites and required game-server/build checks using the repository's pinned toolchain. Capture visual evidence and record any unverified platform coverage.

## Completion Notes
- Implemented on `feature/match-transition-announcements`; the approved work is committed locally and rebased onto remote main `10928a6bc` for merge preparation.
- Native transition events, playback scheduling, accessible splash UI, durable log details, and regression/visual coverage are implemented.
- See [the outcome report](match-transition-announcements-outcome.md) for acceptance evidence, validation results, and the dev-local handoff.
## Approved review decisions
- Prominent pitch overlay; slightly dim the whole pitch and block pitch actions. The log need not remain visible.
- Turnover/touchdown default to 3 seconds; turn start defaults to 1.5 seconds; durations scale with playback speed. Safe dismissal with a brief exit fade.
- Persist an until-dismissed preference. Reduced motion removes movement effects; accessible announcements avoid duplicates.
- Manual-validation refinement: place the persistence checkbox only in Game Menu > Game Settings. Remove the splash footer, Continue button, and checkbox. Use a smaller content-sized banner and a top-right close box when persistence is enabled; retain existing automatic timings otherwise.
- Initial load/reconnect/hidden-tab recovery establish a baseline and discard historical splashes. Replay advancement presents events; seeking suppresses skipped events.
- Required choices take priority: dismiss active splashes and suppress queued announcements delaying a choice. Preserve all details in the log. Ordinary rapid computer turns retain ordered splashes.
- Reasons prioritize the confirmed cause and directly affected player, mentioning the initiator when useful. Fuller details remain in the log.
- Reuse Human/Orc scoreboard helmets; blue Human helmet is fallback. Optional colour accents remain unwired to production team data.
- No backward compatibility with older transcript/protocol formats is required; current-version recovery, replay, and deduplication are required.

## Delivery slice
One integrated, independently verifiable slice covers authoritative transition/reason projection, browser scheduling/log/UI, regression and visual evidence, and a running dev-local stack. These changes share one event contract and acceptance boundary.

## Authorization
Create issue and new working branch; implement, self-review, validate, and start dev-local. The owner subsequently approved the result and requested rebasing onto remote main and preparation for merge. The owner subsequently authorized staging/committing, publishing a PR, waiting for CI, merging into main, removing the local/remote working branches, adding the completed-feature tracker entry, and stopping dev-local. Remote deployment remains outside scope.

## Approved banner refinement
- Replace the solid announcement card with a transparent banner over a softly dimmed pitch. Fade the dimming and banner in/out using the dice presentation cadence (200 ms), with a 350 ms clear pause before resuming the queue, including queued consecutive announcements. Replay speed scales both timings.
- Keep the existing reading durations and Game Settings persistence preference. Reduced motion removes fades while retaining the clear pause; mandatory choices and recovery cancel both fade and pause immediately.
