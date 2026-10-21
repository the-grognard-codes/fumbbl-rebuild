# Feature: Better block and blitz visibility

## Abstract
Show the attacker, target and counted offensive/defensive assists throughout block planning and resolution using the approved C2 pitch graphics.

## Objective
Make proposed block strength understandable and identify the blocking player during opponent uphill die selection.

## Context / Existing Behavior
Existing forecasts expose dice without assisting player identities. Three coordinated mockups were reviewed, and Option 3/C2 was selected and refined. The approved reference is `browser-client/prototypes/block-assists/`, with screenshots in `.notes/art-preview/block-assists/`.

Browser MUTP only. Ordinary blocks, blitz blocks, repeated blocks (including Frenzy), and Multiple Block are included. Special attacks replacing normal block resolution and Java desktop changes are excluded. Private previews begin on explicit target selection; committed context is shared with both coaches and spectators. Recompute proposals before the roll, freeze contributing assists after the roll, and clear a block's markers when its target moves, the block finishes, or the proposal is cancelled. Multiple Block keeps both target-direction markers but only the current block's assists. Replay shows committed contexts only; recovery restores them. No backward compatibility for existing games is required. Server presentation metadata is allowed, but mechanics, dice, eligibility and sequence must not change.

## In Scope
- Authoritative presentation metadata for adjacent and remote blitz previews, committed blocks, and per-target Multiple Block context.
- MUTP browser rendering, both coaches, spectators, replay and recovery.
- Focused unit/integration tests, visual review, ChangeList entry, self-review and outcome evidence.

## Out of Scope
- Special attacks replacing normal block resolution; Java desktop UI.
- Gameplay, rules, dice or sequence changes; backwards compatibility for existing game records.
- Staging, committing, pushing, PR creation, merging or deployment.

## Functional Requirements
- Browser MUTP only. Ordinary blocks, blitz blocks, repeated blocks (including Frenzy), and Multiple Block are included. Special attacks replacing normal block resolution and Java desktop changes are excluded. Private previews begin on explicit target selection; committed context is shared with both coaches and spectators. Recompute proposals before the roll, freeze contributing assists after the roll, and clear a block's markers when its target moves, the block finishes, or the proposal is cancelled. Multiple Block keeps both target-direction markers but only the current block's assists. Replay shows committed contexts only; recovery restores them. No backward compatibility for existing games is required. Server presentation metadata is allowed, but mechanics, dice, eligibility and sequence must not change.
- Use approved C2 from browser-client/prototypes/block-assists: ivory compact block arrow with original impact burst; gold offensive circle (radius .1725 pitch squares); cyan defensive diamond (half-diagonal .21) rotated so its forward vertex joins the shaft; defensive chevron flush with its endpoint bar. Shafts start at origin boundaries with no segment inside symbols. Assists render above threats and below sprites. Two glowing chasers traverse opposite origin sides, converge at the shaft, and travel down it. Block glow starts at arrow base, then traverses opposite ends of the unchanged impact shape, meeting with a brighter flare. Preserve reduced motion and MUTP themes.
- Reuse native assist eligibility and existing projection/camera/theme infrastructure. Avoid browser rule duplication.

## Acceptance Criteria
- Explicit proposals show current target/assists only to the acting coach; cancellation, switching targets or stale routes remove/replace them.
- Remote blitz previews show the proposed blocking square and contributors using projected attacker occupancy.
- Committed context is visible to both coaches/spectators through rerolls and uphill opponent die selection.
- After the roll, contributors freeze; markers clear when the target moves or resolution ends. Repeated blocks get fresh context.
- Multiple Block retains both target-direction markers and shows only the current block's assists.
- Replay contains only authoritative committed context; seeking and recovery reproduce it without stale overlays.
- Approved geometry, layering, colors and glow sequence match the reviewed C2 design and remain understandable without animation.

## Constraints
- Create a new implementation branch from current main; preserve related mockups and unrelated working-tree changes.
- Preserve MUTP styling and browser themes on Android, Windows and Linux.
- Follow repository conventions, including a user-visible ChangeList entry.
- On 20 October 2026, after visual approval, the user authorized staging and committing all changes, opening a PR, merging after CI passes, and deleting the local and remote working branch. Deployment and destructive game-data cleanup remain outside this authorization.

## Implementation Guidance
Use small presentation services and a strict metadata contract, persisting committed context alongside native/replay/recovery state. Keep normal native block calculations authoritative. Full per-slice issue bodies are mirrored in `.notes/block-assist-visibility/`; the tracked issues are linked below.

## Validation
- Build an affected-test manifest before code changes. Run narrow native and browser selectors before broader suites.
- Check adjacent/remote blitz, Guard/cancelled assists, opponent uphill choice, rerolls, movement/cancellation, repeated and Multiple Block, all roles, replay seek, reconnect/recovery, both cameras/ends and reduced motion.
- Run relevant unit/browser suites and game-server build; diagnose failures and record exact outcomes.

## Completion Notes
Implementation, review and validation are complete. The user approved manual testing and authorized delivery through a PR after successful CI. Track evidence in `docs/specs/block-assist-visibility-outcome.md` and the linked issues. The local review stack was stopped for delivery.

## Delivery slices
Implementation branch: `feature/block-assist-visibility`, originally from main `926dc8ea9e1e245161f86b198d0bf0c5bd128c6b`, rebased on 20 October 2026 onto `f10f348200bd45f4e813e701c5547f951bbcce55` (optional skill-use preferences, #322).

1. [#318 — Authoritative block context, previews and durable replay/recovery metadata](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/318).
2. [#319 — Approved browser markers and preview/committed presentation](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/319) — depends on #318.
3. [#320 — Integrated lifecycle validation, ChangeList and outcome](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/320) — depends on #318 and #319.
4. [#321 — Native Multiple Block prompt adapter](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/321) — prerequisite discovered during validation; explicitly approved by the user. Expose existing native target-specific die/reroll choices and ownership, with target-labelled keyboard/pointer inspection. Preserve engine rules and sequence.
