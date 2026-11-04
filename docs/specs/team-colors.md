# Feature: Saved team colors across builder and match presentation

Date: 2026-11-03.

Status: completed and merged in [PR #446](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/446) on 2026-11-04 after accepted manual review and passing CI. Dev-local is stopped. Remote deployment remains outside scope.

Tracker: [#438](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/438).

Prerequisite: [shared sprite-format proof](shared-sprite-format-proof.md) and [format contract](shared-sprite-format-contract.md). The proof and contract landed in [PR #444](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/444), commit `615df5fc9`. Team-color implementation is ready for review on `feature/saved-team-colors`.

## Abstract

Let coaches select and save primary and secondary team colors in the static-site team builder and carry those choices consistently into supported pitch artwork, player busts, team-name helmets and turn-start/turnover/touchdown splashes. Preserve accepted static artwork wherever recolorable coverage is unavailable.

## Objective

Turn the proven material-index and palette format into usable team customization with a durable team identity, consistent presentation and safe compatibility with existing teams and assets.

## Context / Existing Behavior

The proof establishes 16 color choices with 16 shades each, explicit fixed/primary/secondary material assignments, shared bust recoloring and a Human helmet crop. It demonstrates ordinary cached textures in the current renderer and shared portrait identity. The proof is a separate development fixture; product persistence, team-builder wiring and live match consumption are not implemented by it.

The public builder supports Human and Orc, each with six positions. Both have complete accepted static pose/portrait catalogs, but those production sources are flattened. The public builder uses account-owned server documents; edits remain in memory until the current draft is validated and saved. Existing saved-team revision checks and owner authorization apply. There is no active-match edit lock.

Create/join validates and freezes the selected saved-team revision; later source edits/deletion do not affect that match. Relevant integration seams include `team-protocol.ts`, `saved-team-protocol.ts`, `TeamDraft`, `BrowserTeamJson`, `SavedTeamJson`, `FrozenTeam` and `MatchTeamArt`, plus setup/recovery/transcript decoders. Current formats have no team-color fields and use strict decoding, so contract changes must be coordinated. Public import/export is deferred. The V1 retirement removed the old diagnostic TeamPanel import/export UI; preserve supported stored-data compatibility without restoring that retired surface.

The feature occupies the team-colors step of the agreed sequence: sprite proof → team colors → Old World Classic stadium → core gameplay animations → expanded coverage.

## In Scope

- Persist a primary and secondary color choice per team using stable palette IDs.
- Add separate primary/secondary swatch grids to the static-site team builder, each eight columns by two rows.
- Display the selected color name beside each grid with its Primary/Secondary label. Keep visible names out of grid cells while retaining accessible names, keyboard operation and clear selection states.
- Apply saved choices consistently to supported pitch poses, shared player bust consumers, team-name helmets and turn-start/turnover/touchdown splashes.
- Preserve accepted static fallback for artwork that has not been converted or is unavailable.
- Carry team-color data through relevant persistence, launch and viewing boundaries, with compatibility behavior for existing teams.
- Convert complete Human and Orc active static pose/portrait catalogs and both team helmets. Cover every supported position and standing/ground pose; retain the existing geometry and facing/mirror behavior. Inventory the active runtime assets explicitly, excluding archived and unused variants.
- Preview unsaved colors immediately in builder busts and a compact helmet/pitch-player preview; persist through the existing Validate/Save flow.
- Freeze selected colors with each team's saved revision at match create/join; carry the snapshot into viewing, recovery and replay.

## Out of Scope

- Arbitrary RGB selection or changes to the approved 16-color/16-shade palette.
- Automatic opponent kit substitutions or local red/blue, black/white overrides.
- Stadium/supporter recoloring and stadium artwork.
- Production action-to-animation routing or broader animation production.
- Team identity changes beyond the two color choices, such as custom logos or uploaded textures.
- A new public import/export interface or recoloring broader UI themes/accents.

## Functional Requirements

1. Both colors use the same approved palette. Support all 256 ordered pairs, including identical selections and identical or similar opposing kits.
2. Save stable palette IDs rather than renderer indices or display names. Default new and legacy saved Human teams to Navy/Ivory (`navy`, `ivory`) and Orc teams to Black/Orange (`black`, `orange`). Resolve missing legacy pairs deterministically without an unsolicited bulk database rewrite. Persist the effective pair on the next normal save/copy. Reject partial pairs and unknown IDs on new-format writes/imports through existing validation; do not silently substitute a color for invalid input.
3. Preserve fixed materials, alpha, source geometry and existing placement semantics under recoloring. Apply the sprite contract's source and validation requirements.
4. Use the shared portrait identity for player cards, builder entries, dugouts and player-choice consumers, including interception. Inventory remaining variants during implementation.
5. Color ownership follows the team, independently of coach end, camera orientation, half or home/away presentation position.
6. Unsupported, missing or failed recolorable assets retain their existing static artwork without blocking interaction. Complete Human and Orc coverage is a release acceptance requirement; fallback must not conceal omitted in-scope conversions. Do not replace a missing pose with a different position/design simply to display team colors.
7. Keep caches bounded, release owned resources and avoid repeated per-frame recoloring. Use the existing rendering and asset-delivery paths.
8. Owners edit colors through existing saved-team authorization, catalog compatibility and revision checks. Do not add an active-match edit lock. Selecting a swatch immediately updates unsaved builder previews and invalidates prior validation like other draft changes. Normal Validate/Save persists the pair; existing load/discard behavior restores the persisted pair. Copy preserves effective colors. A failed/conflicting save must not falsely appear persisted.
9. Freeze each selected pair with that team's validated saved revision at match creation/join, independently for each participant. Later saved-team edits/deletion must not recolor active matches, reconnects, spectators or replays. Carry the frozen pair through canonical team presentation and transcript/recovery data; never look up the current saved team to render a past match.
10. Historical matches lacking color metadata retain their original artwork. Distinguish this absence from an explicitly recorded default pair; do not apply saved-team default migration to frozen historical matches. Maintain a versioned compatibility path across strict decoders and supported saved-data formats without restoring retired V1 diagnostics or adding a public import/export UI.
11. Reuse the approved palette and material rules for all artwork consumers. Keep broader UI colors, splash accents, team badges unrelated to helmet art and site themes unchanged. Any future palette revision must preserve the interpretation of previously recorded colors.

## Acceptance Criteria

- A saved team restores both selected colors after reload, copy and normal save/update; account ownership, catalog locks and stale-revision checks still apply.
- Two accessible 8×2 grids show all choices, independent selections and selected names beside their labels.
- Covered pitch players, busts, helmets and all three splash kinds use the same team palette, including both teams sharing a pair.
- New and legacy saved teams use the specified roster defaults. Missing pairs migrate only through the documented compatibility path; partial/unknown new-format values fail validation. Supported serialized saved-team round trips retain colors.
- Editing a saved team after match create/join affects future snapshots only. Active match, spectator, reconnect/recovery and replay views retain the recorded pair. Historical matches without colors retain original art.
- Team colors do not change ownership with camera orientation, coach end, halftime or home/away presentation.
- Unsupported or failed artwork retains the accepted static fallback without blocking team use or match interaction.
- Every active Human and Orc position has all supported static poses, a recolorable bust and its roster helmet; the manifest inventory and visual review show no in-scope omissions.
- All palette pairs preserve fixed pixels, alpha and geometry; actual consumer sizes, palette extremes and resource behavior are verified.
- Unsaved swatch changes update builder busts and the compact helmet/pitch preview immediately; normal Validate/Save persists them and failed saves retain truthful draft state.
- A repeatable full-match resource check records asset size, cold/warm rendering cost and bounded cache/resource lifetime for both rosters and repeated kit changes. Performance measurements and observed overhead are report-only, with no performance acceptance gate (confirmed 2026-11-03). Resource cleanup, bounded caches and non-blocking fallback remain functional requirements.

## Constraints

- Preserve MUTP colors, typography, themes and existing UI patterns; target Android, Windows and Linux and record environments actually validated.
- Follow the shared sprite contract and team sprite standard for any art conversion.
- Respect existing authorization, team lifecycle, match state and replay boundaries.
- Work on a new implementation branch after scope approval; preserve unrelated changes. Do not commit or push without explicit authorization.

## Implementation Guidance

Use existing team storage, validation and launch contracts as the authoritative integration boundaries. Extend the shared asset resolver/cache path rather than recoloring independently in individual UI components. Keep art conversion and application wiring as explicit deliverables within the same feature. The proof's bounded three-design decoder and verbose JSON payload are not a production loader: provide a versioned asset inventory, bounded loading/caches and source/delivery checks suitable for both complete rosters. Preserve contract semantics if the transport is compacted.

Implement the durable team/snapshot contract first. Human and Orc conversion can proceed independently after the sprite proof lands. Builder integration depends on the persistence contract and converted previews; match integration depends on the frozen presentation contract and both complete asset packs. Publish the integrated feature only after the full inventory and lifecycle acceptance checks pass.

## Validation

Cover saved-color round trips, ownership/revision rejection, missing-versus-invalid legacy input, builder interaction and accessibility, shared consumer identity, team ownership across orientation changes, lifecycle snapshots and historical replay preservation, resource release and asset-load fallback. Test both teams sharing identical colors. Reuse contract invariance checks across all 256 pairs and every converted asset, then inspect native/integer zoom and actual consumer sizes. Test a saved-team edit after match freeze and prove both current/recovered views and recorded playback retain the original pair.

Run asset export/sync/checks, focused shared-art and protocol tests, browser interaction/lifecycle checks, both browser builds and the required game-server build/tests. Validate Android, Windows and Linux where available and explicitly report any untested target. Record observed cold/warm rendering and memory/cache bounds on named environments. No all-device claim follows from the Windows proof alone.

## Agreed Product Decisions

- Q1 approved: complete Human and Orc supported static poses, busts and helmets; retain fallback as compatibility/failure protection.
- Q2 approved: owners edit through the existing builder flow; selected colors freeze at match create/join with the saved revision, preserving active matches and replays.
- Q3 approved: new/legacy saved teams use roster defaults (Human Navy/Ivory; Orc Black/Orange); historical matches without recorded colors retain their original artwork.
- Q4 approved: preview unsaved colors immediately in builder busts and a compact helmet/pitch-player preview; persist through existing Validate/Save, with no separate autosave path.

## Completion Notes

### Implementation Slices

| Issue | Deliverable | Prerequisite |
| --- | --- | --- |
| [#439](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/439) | Saved palette IDs, legacy compatibility and frozen match snapshots | Sprite proof/contract landed (#393) |
| [#440](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/440) | Complete Human static poses, busts and helmet conversion | Sprite proof/contract landed (#393) |
| [#441](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/441) | Complete Orc static poses, busts and helmet conversion | Sprite proof/contract landed (#393) |
| [#442](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/442) | Builder 8×2 grids, live previews and normal save flow | #439, #440, #441 |
| [#443](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/443) | Frozen-color match rendering, lifecycle/resource checks and final acceptance | #439, #440, #441, #442 |

All slices are implemented locally, including both complete rosters. The [outcome report](team-colors-outcome.md) records acceptance evidence, platform limits and the running dev-local instance. Performance results are report-only by confirmed decision on 2026-11-03. Issues remain open for review and later authorized publication.

Implementation must follow the usual workflow on a new working branch, include self-review, required checks, full-roster visual evidence, a local review server and an outcome report against every acceptance criterion. Documentation and issue publication alone do not complete this feature. No production animation, stadium work or live deployment is implied by this request.
