# Feature: Guided team-builder workflow choice

GitHub issue: [#471](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/471)

## Abstract

Add a modal choice between the compact team-builder workbench and a guided walkthrough for new MUTP coaches.

## Objective

Let new coaches choose step-by-step help with MUTP's team-building workflow while experienced coaches retain direct access to the compact workbench.

## Context / Existing Behavior

The owner chose a compact workbench for the immediate team-builder improvement and explicitly requested this separate backlog item for a modal workflow choice. This is future work, not part of the current workbench implementation.

## In Scope

- An accessible choice modal offering Compact workbench and Guided walkthrough.
- A guided flow through team identity, recruiting, resources, optional customization, validation and saving, with visible progress and Back/Next controls.
- A discoverable way to switch workflows without losing draft edits.
- Appropriate preference/re-entry behavior, to be settled during feature design.

## Out of Scope

- Teaching tabletop BB2025 rules, new game rules or changed server authority.
- Replacing the compact workbench or duplicating draft/validation/save state models.
- Implementation in the current workbench slice.

## Functional Requirements

1. Offer a clear, keyboard-accessible modal choice; keep Compact workbench immediately available.
2. Guide coaches through MUTP-specific actions while preserving all current team choices and authoritative validation.
3. Use one shared draft, catalog, validation and save pipeline so switching paths retains edits and cannot bypass save requirements.
4. Make the modal dismissible with correct focus restoration and provide a later entry point to change the choice.
5. Decide whether and how the choice is remembered, how existing drafts reopen, and how interrupted walkthroughs resume before implementation.

## Acceptance Criteria

- [ ] Coaches can select either workflow and complete the same saved-team task.
- [ ] Switching/back navigation retains draft state and invalidates validation only when the draft changes.
- [ ] Modal focus, keyboard navigation, dismissal and responsive layouts are verified.
- [ ] Preference and interruption behavior are explicitly designed and tested.

## Constraints

Preserve MUTP's approved identity, BB2025-only catalog, ownership boundaries and existing game data. Treat this as backlog work requiring a separate implementation authorization.

## Implementation Guidance

Build on the compact workbench and existing draft editor contracts. Complete design before choosing modal timing, preference persistence and step boundaries.

## Validation

Cover new and returning coaches, both workflow choices, switching with edits, keyboard/focus behavior, invalid teams, validation/save failures and narrow screens.

## Completion Notes

Backlog requested November 6, 2026. No guided workflow or modal is implemented in the current compact-workbench work.


Related compact-workbench implementation: [#470](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/470).
