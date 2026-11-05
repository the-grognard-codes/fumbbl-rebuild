# Feature: Review and produce non-block roll event icons

Part of #448. Blocked by: #449 (user approval of inventory and wording).

## Abstract
Create static event icons that complement existing MUTP dice outcomes and skill artwork.
## Objective
Recognize roll purpose without text.
## Context / Existing Behavior
Armor/injury/casualty use animated outcome artwork. Preserve those animations.
## In Scope
Eight samples: dodge, rush, pass, catch, tentacles, weather, deviation (d8/d6), scatter; after sample approval, all remaining approved event assets.
## Out of Scope
Gameplay sprites, new die animations, mechanics changes.
## Functional Requirements
Match existing visual style; skill events resemble skill icons, while action events have separate identities. Inspect at actual dice-display size and across themes.
## Acceptance Criteria
User approves eight samples before remaining art/integration. All approved events have suitable assets or explicitly reviewed reuse.
## Constraints
Preserve MUTP style and unrelated changes; no commit/push.
## Implementation Guidance
Review existing outcome and skill assets before choosing asset production methods. Use approved inventory as asset manifest.
## Validation
Check exported assets, transparency, readability, native-size layout, and theme contrast.
## Completion Notes
Record sample-art approval and asset evidence before UI integration.
