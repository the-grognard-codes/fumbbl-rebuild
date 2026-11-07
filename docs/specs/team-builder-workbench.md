# Feature: Compact team-builder workbench

GitHub issue: [#470](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/470)

## Abstract

Implement a compact team-builder workbench addressing all four priorities from the November 6 `/teambuilder` critique, preserving MUTP's approved visual identity and existing game contracts.

## Objective

Keep recruitment, roster consequences, resources, budget and completion controls within reach. Let returning coaches enter saved teams directly, and defer optional customization until requested.

## Context / Existing Behavior

The critique scored the builder 20/40. Recruitment/value, editable roster, resources, formations, validation results, Save and saved-team entry occupy separate scroll regions. The owner chose a compact workbench and authorized all four priorities. A guided walkthrough and a modal choice between workflows are a separate backlog item.

## In Scope

- Compact recruitment and editable roster with a nearby spending/resource summary.
- A unified validation/status/save area with useful validation navigation.
- Collapsed optional kit customization, roster reference and formations entry.
- Saved-team and New team access at the start of the workbench.
- Relevant responsive, keyboard, state and behavior checks, documentation and Unreleased entry.

## Out of Scope

- Guided walkthrough or workflow-choice modal in this implementation.
- New rules, server protocol, ownership semantics, artwork or global brand changes.
- Committing, pushing, PR publication, merging or deployment without separate authorization.

## Functional Requirements

1. Keep coach tasks grouped in one workbench; use compact recruitment rows and a compact roster while preserving player identities, jersey numbers, captain and skill editing, ordering and removal.
2. Keep player count, purchased skill points, treasury and resources accessible while editing. Reflow safely at narrow widths and short heights without obscuring controls.
3. Place Validate, validation state, errors and Save together. Preserve exact-draft validation and authoritative server save gates; provide safe focus/navigation to known invalid fields and a useful fallback for unknown validation paths.
4. Make kit customization and roster references optional disclosures. Keep team-color previews and formations fully accessible without inserting them into the required recruit/validate/save sequence.
5. Put saved teams and New team at entry, and preserve account-owned team CRUD, copy and match-selection behavior. Warn before replacing an unsaved draft through New team or Load.
6. Preserve the existing logo, palette, typography roles, portraits, BB2025 catalog and shared replay/recovery data formats.

## Acceptance Criteria

- [x] Recruitment, roster, resource spending and totals form a compact workspace on wide screens and a usable ordered flow on narrow screens.
- [x] Validation and saving are co-located and remain usable for 11/16-player rosters and short/narrow windows.
- [x] Optional customization is collapsed initially and fully operable when opened.
- [x] Saved teams/New team are available before traversing the editor.
- [x] Editing invalidates validation; stale responses cannot enable Save; saved/copy/load/delete and discard guards behave correctly.
- [x] Focused browser/unit checks, production build and visual review pass.
- [x] Outcome evidence and remaining limitations are recorded before delivery.

## Constraints

Work on `feature/team-builder-workbench` in a separate worktree from current main. Preserve unrelated home-page and artwork changes. Keep authority and storage boundaries unchanged. Record user-visible work in CHANGELOG; add public update-history entries only after merge.

## Implementation Guidance

Refine BuilderPanel, BuilderDraftEditor and builder styles. Keep page-specific density local; reuse existing colors, controls, disclosures and FormationManager. Keep optional entry points concise. Review validation focus, disabled states, busy/recovery behavior and sticky elements together.

## Validation

Use meaningful behavior regressions for draft identity/save gating, validation navigation, disclosure state, saved-team entry and unsaved replacement. Exercise empty and populated Human/Orc drafts, narrow/intermediate/wide and short layouts, keyboard focus, long names, validation failures and saved-team operations. Run affected unit/browser checks and the public-site build/check. Java/game-server behavior remains unchanged; assess whether any server check is warranted by the final diff.

## Completion Notes

Implementation is authorized locally. Leave work uncommitted for review; publish/merge/deploy require separate authorization.


## Implementation results

All four approved priorities are implemented and verified locally. See [the outcome report](team-builder-workbench-outcome.md) for requirement mapping, review findings/fixes, exact check results, visual artifacts and limits. Independent finish review: ship; final affected browser suite 6/6 passed. Related future work: [#471](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/471). This issue remains open for the eventual authorized PR and merge record.
