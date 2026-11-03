# BB2025-only removal manifest

This is historical audit evidence for issues [421](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/421) and [422](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/422), against base `e356636ba0abb75b68d55fe704a6a256c12d4d02`.

## Inventory and decisions

- [Engine inventory](engine-manifest.json): 783 original Java paths with original SHA256, registration annotations, decision and reason. Removed 553 unsupported implementations; relocated 230 implementations required by BB2025. Every original path is absent and every retained destination exists.
- [Supporting resources](resource-manifest.json): removed 87 unused roster, team, coach, game-state and setup fixtures. Modern product and diagnostic startup use the BB2025 catalog/native builders. No stored database records were deleted.
- [Report cleanup](report-cleanup.md): removed nine additional generic reports whose emitters existed only in retired editions or old-save conversion; records original hashes and coordinated browser/identifier cleanup.
- [Option cleanup](removed-options.md): removed 24 obsolete options with no surviving runtime consumers.
- [Protocol identifiers](orphan-ids.md): records removed orphan identifiers, namespace checks, and the old recovery alias removal.
- [Pathfinding cleanup](pass-block-cleanup.md): removed constrained Pass Block routing and ignored endpoint calculations while retaining normal pathfinding and current On The Ball behavior.

## Retained dependencies

Package names alone were not used as evidence of obsolescence. BB2025 depended on shared implementations and four helpers in older packages: casualty modifiers, injury descriptions, and multiple-roll step state. These now live under BB2025. Abstract helper name collisions were resolved within that package; an unused abstract dodging helper was removed rather than retained under a misleading name.

The current Kick Team-Mate step emits `ReportKickTeamMateRoll`, formerly annotated for an older edition. Its implementation is retained under BB2025 and now registered for new-build report decoding. A JSON round-trip test protects this dependency.

Generic domain implementation registration (`COMMON`) remains alongside BB2025 overrides; it is not a playable ruleset. Only exact `BB2025` input is accepted. Obsolete hierarchy/edition filtering and repeatable registration annotations were removed. Equal-priority duplicate registrations fail explicitly.

The pre-removal snapshot contains 632 selected registrations. The regression test preserves the original snapshot and explicitly accounts for nine unused report removals and the retained Kick Team-Mate addition, leaving 624 expected registrations. Any other registration drift fails.

## Shared source and product surfaces

- Simplified scanner/skill registration, defaults, card effects, obsolete Two For One and vampire-lord branches, passing modifiers and retired injury presentation.
- Removed unused edition-specific dice paths and old routing branches; updated current fixtures and tests.
- Removed 17 retired injury icon symbols/labels; all 11 current symbols remain unchanged. Canonical and browser assets are synchronized.
- Updated maintained agent instructions, diagnostic testing instructions and browser documentation to BB2025-only terminology.
- Added `tools/validation/bb2025-source.mjs` to CI. It scans tracked and untracked active text, excludes explicit historical evidence, and rejects obsolete ruleset names/paths. Both a clean scan and an injected forbidden-reference probe were checked.

Historical changelogs, prior design/outcome records, archives, reference material and Git history remain intact. Existing saved-artifact compatibility was explicitly waived; new-build live play, replay and recovery are validated in the outcome report.
