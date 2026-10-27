# Chat and game-log window sizing

Approved requirements, 2026-10-27. Branch: `feature/chat-log-window-sizing`, based on `main` at `2b6f715af`.

## Slices

- [#366](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/366): independent sizes and linked dugout layout.
- [#367](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/367): chat scrolling and unread notifier; depends on #366.

+## Abstract
Add independent live-match chat and game-log size controls matching the dugouts.

## Objective
Recover pitch space on smaller screens and allow reviewing more history.

## Context / Existing Behavior
Live chat/log have fixed responsive heights. Dugouts have three independent sizes. Replay has a separate tabbed history layout.

## Constraints
Preserve MUTP styling, themes and browser platform support (Android, Windows, Linux). Preserve unrelated work. No mechanics/rules changes. No commits, pushes, remote deployment or replay layout changes. Work on feature/chat-log-window-sizing.

## In Scope
- Three states per window: minimized, default, maximized; buttons step one state with unavailable controls hidden.
- Reuse dugout arrow visuals and dimensions; text controls sit to their left with padding.
- Fixed responsive widths; minimized shows title and expand button; maximized grows vertically.
- Independent stacks: chat/left dugout, game log/right dugout. Preserve gap, selected dugout mode and current height. Avoid resource/inducement elements, game menu and other controls.
- Recalculate space on viewport, resources and dugout changes; clamp history height and scroll internally on short screens.
- Small independent local size preferences, normal defaults and graceful storage failure.
- Game log continues updating hidden and restores at newest entries.

## Out of Scope
Chat unread behavior is a separate dependent slice. Replay layout changes and dugout size persistence.

## Functional Requirements
Minimize steps maximized -> default -> minimized; expand steps minimized -> default -> maximized. Hidden content continues receiving messages/events. Reopening game log follows latest; chat retains previous scroll position. Recovered live matches use identical controls. Maximized may offer no extra space on constrained viewports.

## Acceptance Criteria
- All nine chat/log combinations remain independent.
- Both stacks maintain their gap and avoid surrounding controls, including short/mobile viewports.
- Resizing either history window never reduces the dugout's selected view.
- Preferences restore after reload; replay retains its tabs.
- User-facing change-list entry.

## Implementation Guidance
Share dugout arrow markup/styles; scope new layout to live overlay history. Keep rendered message components mounted.

## Validation
Unit tests for preferences and geometry where meaningful; browser regression for modes, persistence, keyboard/touch, all dugout combinations and viewport constraints. Run browser unit/build checks, required browser coverage and Java build/tests. Verify live/replay/recovery. Before handoff close review servers and start one dev-local stack.

## Completion Notes
Record review fixes, exact commands, evidence and limitations in docs/specs/chat-log-window-sizing-outcome.md and on this issue. Leave uncommitted work for review.

## Chat scrolling and unread acceptance

## Abstract
Add independent live-match chat and game-log size controls matching the dugouts.

## Objective
Recover pitch space on smaller screens and allow reviewing more history.

## Context / Existing Behavior
Live chat/log have fixed responsive heights. Dugouts have three independent sizes. Replay has a separate tabbed history layout.

## Constraints
Preserve MUTP styling, themes and browser platform support (Android, Windows, Linux). Preserve unrelated work. No mechanics/rules changes. No commits, pushes, remote deployment or replay layout changes. Work on feature/chat-log-window-sizing.

## In Scope
- Chat continues receiving messages while minimized and freezes its pre-minimize scroll position, even if it was at bottom.
- Show an unobtrusive pulsing chat-bubble icon beside Chat in the title bar while unread messages remain, including minimized state.
- Clear only when visible chat reaches the latest messages; simply restoring chat does not clear unread state.
- Respect reduced motion with static indicator. Retain existing bottom-follow behavior while visible.
- Game log has no unread indicator and restores at newest entries.

## Out of Scope
Unread persistence across application restarts; changes to replay unread behavior; game-log unread tracking.

## Functional Requirements
Track newly arriving messages without treating initially loaded history as unread. Preserve draft, composer and keyboard/touch behavior. Minimized composer cannot capture input invisibly.

## Acceptance Criteria
- Incoming chat while minimized leaves scroll frozen and displays notifier.
- Restoring above bottom preserves position and notifier; reaching bottom clears it.
- Visible chat follows new messages only if already at bottom; unread reflects arrivals while reading older messages.
- No notifier for game-log updates.
- Static accessible notifier under reduced motion.

## Implementation Guidance
Blocked by #366 (sizing and linked layout). Extend existing MatchChatPanel behavior; retain mounted content and keep replay behavior unchanged.

## Validation
Browser tests for arrivals while minimized both at bottom and scrolled back, restore, read-to-bottom, visible arrivals, reduced motion, composer/draft preservation and keyboard/touch. Run required unit/browser/server checks and document actual platform coverage.

## Completion Notes
Record evidence and review results beside the local design mirror; leave work uncommitted.


## Status and evidence

Both slices are implemented, self-reviewed and approved by the user. Unit, complete browser, game-service and main Maven verification passed, with existing opt-in native skips documented in [the outcome report](chat-log-window-sizing-outcome.md). Dev-local readiness was verified for visual review, then the managed stack was stopped at the user's request, retaining database volumes. On 2026-10-27 the user authorized staging all changes, committing, opening a PR, merging after CI, and deleting the feature branches. Final PR/merge evidence is recorded on GitHub issues #366 and #367.

## Accepted display exception (2026-10-27)

At 375x300 CSS pixels the Debug button can overlap the left stack: only 48px remain between Debug and the confirmation control, while the two minimized title bars and their gap require 66px. The user explicitly requested ignoring this collision pending a separate revision of the minimum supported display sizes. Keep resource/menu clearance and other geometry assertions at that size; exempt only Debug collision there. Other tested viewports retain Debug clearance. Do not relocate Debug or reduce the dugout's selected view.

## Visual review follow-up (2026-10-27)

The start-of-drive sequence tracker must also remain clear of maximized history and its corresponding dugout. Left-side window/dugout sizing must not change right-side objects, and vice versa. Reproduced the tracker shrinking from 220px to 65px when expanding the opposite window. Scope its dock measurements to its own side and budget its height against the default history size; history then maximizes below the rendered tracker. This prevents a circular size dependency and preserves the tracker view when changing history size. Add receiving-home/away regressions for opposite windows/dugouts, same-side expansion, stable layout, refresh and ordinary-play handoff. Validation for this follow-up is recorded in the outcome report.

The user also explicitly deferred tracker clearance with an expanded dugout at 640x330: the legacy short-screen style allows a 134px dugout, making it impossible to fit the tracker, both headers and the controls without reducing the dugout view. Preserve that view and defer this undersized case to the upcoming display-requirements work. Compact-dugout clearance and side-isolation assertions remain in place at 640x330; expanded-dugout clearance is checked at the larger viewports.

Follow-up complete: focused tracker/chat/recovery regressions, 420 browser unit tests, production build, 198 affected Java tests, full browser gate (335.0s) and required Docker server build passed. The single dev-local instance was refreshed and HTTP/proxy/container/computer readiness verified. See the outcome report for exact coverage and accepted exceptions.
