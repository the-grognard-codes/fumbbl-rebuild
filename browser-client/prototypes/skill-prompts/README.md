# Circular skill prompt mockups

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/359

Branch: `prototype/skill-decision-prompts`. Status: owner selected Orbit's main
circle in its original cyan/blue palette, with the Crest source picker's
navy/gold palette confined to the source picker. The preview defaults
to high contrast. Production implementation is complete locally; see the
[outcome report](../../../docs/specs/revised-skill-prompts-outcome.md).
No commits, pushes or remote deployment. The subsequently requested dev-local
stack and its complete validation are recorded in the outcome report.

Scope update: block-dice skill reroll controls are excluded and require a later
feature. Block-related skill **use** prompts (Grab, Juggernaut, Wrestle, Tackle,
etc.) remain in scope. Existing block reroll mockups below are retained as
historical design references, not implementation requirements.

Implementation: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/361.
The owner explicitly approved revising non-block reroll policy: an available
built-in reroll (including Dodge/Sure Feet) is offered first; declining resolves
the original roll without Pro/team fallback. Other sources are offered only
when no eligible built-in exists, including limited usage spent on an earlier
distinct roll. A used reroll never grants another reroll of the same roll.
Always Use preferences remain authoritative. This approved policy change is
the explicit exception to the original presentation-only scope.

Question: Which circular skill-use / skill-reroll treatment is easiest to read
and operate while keeping the pitch visible?

## Review

Run from the repository root:

```powershell
npm.cmd --prefix browser-client run mockups:skill-prompts
```

- [A · Orbit](http://127.0.0.1:5183/pitch-preview?variant=A): selected layout,
  cyan ribbon, navy surface, inset pill buttons, open center; gold source picker.
- [B · Crest](http://127.0.0.1:5183/pitch-preview?variant=B): gold ribbon,
  broad curved answer segments, horizontal question band.
- [C · Dial](http://127.0.0.1:5183/pitch-preview?variant=C): ice-blue ribbon,
  round answer buttons, instrument marks and framed question.

Use the floating bottom switcher or left/right arrow keys. Arrow keys in form
controls retain their normal behavior. The variant is saved in the URL;
other state is local to the page and resets on reload.

Try Wrestle, failed Pick Up, block rerolls with original dice, a long skill name,
an untimed decision, and skill/preference choices. Placement controls cover
midfield, a sideline and a player near the viewport corner. Camera and contrast
controls expose additional viewing conditions. Run/pause, seek, final 20%, and
15/30/60-second allowances demonstrate the ribbon without waiting a full timer.

All three concepts have the same choices, actions and local preview timing.
Actual game legality and deadlines remain server responsibilities.

## Agreed design

- Circular prompt with faded black outline, existing MUTP font and palette.
- Explicit full skill/decision wording across the center; Yes above and No below
  for decisions with a legal decline action. No player name in the circle.
- Countdown is a depleting perimeter ribbon. Numeric seconds occupy the ribbon
  track itself at three o'clock. The number remains readable when the colored
  arc has passed it. At 20% of the configured starting duration, the arc and
  number treatment turn red; no flash or pulse.
- Keep existing deadlines and timeout continuations. Untimed decisions have a
  static perimeter, with no invented clock. Recovery must retain the deadline.
- Protect the prompted player, involved opponent, ball and relevant dice.
  Allow a farther position with a subtle connecting pointer. Uninvolved players
  can be behind the prompt.
- Keep physical dice separate from the circle, in their usual board area.
- For in-scope multiple choices, use a compact adjacent source chooser, then a circular
  confirmation. Back changes the selection without an action; No uses the
  existing decline. The current block dice / block reroll interface is excluded
  from production changes in this feature.
- Preserve server-offered modifying-skill and preference options for in-scope
  prompts. Block per-die/subset reroll choices belong to the later feature.
- Preserve action identities, mechanics and result resolution, with the explicit
  approved skill-first reroll policy described above.
- Implement the selected design only after owner visual review. Preserve
  unrelated edits; no commit/push without an explicit request.

## Sequencing and reroll fact check

Verified against the current BB2025 implementation, rather than assuming an
action label implies a usage limit:

- Block and BlitzBlock generators run block rolls (including rerolls), final
  block die selection, Juggernaut, Both Down handling, then Wrestle. If the
  blitzing player declines the Both Down-to-push conversion and Both Down
  continues, its own Wrestle can be offered subsequently. The example concerns
  the attacking player's own Wrestle; Juggernaut's interaction with an
  opponent's Wrestle is a separate effect. See
  `ffb-server/.../step/generator/bb2025/BlitzBlock.java:65-75` and `Block.java:70-80`.
- Pass, Catch and Sure Hands are regular-use skills, with no per-turn usage
  token. Dodge and Sure Feet explicitly use `ONCE_PER_TURN`. A catch can occur
  more than once in a turn (including bounces). The important UI distinction
  is whether the skill is a limited resource, not whether its roll label
  normally occurs once. The same roll still cannot be rerolled twice. See
  `ffb-common/.../skill/common/{Pass,Catch,SureHands}.java`,
  `skill/bb2025/{Dodge,SureFeet}.java`, and
  `ffb-server/.../mechanic/bb2025/RollMechanic.java:411-418`.
- Existing coach preferences already default Pass (ball/bomb), Catch and Sure
  Hands to Always Use, and permit Always Ask. `OptionalSkillUse.automaticCommand`
  consumes the exact native skill choice only under the matching preference.
  Preserve those settings rather than adding a second automatic-use policy.
- Before this feature, native steps could offer the built-in skill first, then
  offer Pro/team alternatives if it is declined. A No to a named skill prompt
  declines that skill; it does not necessarily mean decline every reroll.
  See `OptionalSkillUse.java:93-141`,
  `step/AbstractStepWithReRoll.java:64-78,123-139`, and the specific roll steps.
- The result-modifier-after-die-choice observation is valid for these block
  examples, but cannot be generalized to all D6 decisions. BB2025 `StepPass`
  can expose Strong Passing Game with the Pass reroll decision when it changes
  the result. Hiding/postponing it would change available choices. See
  `step/bb2025/pass/StepPass.java:238-256,277-291` and
  `ffb-common/.../skill/mixed/special/StrongPassingGame.java:25`.

Approved presentation: use a direct named circular prompt for an eligible
built-in non-block reroll, including Dodge/Sure Feet, when confirmation is
required. Honor existing auto-use preferences. Declining accepts the original
roll without another reroll-source prompt. Preserve actually offered modifiers
and normal result resolution: a declined inaccurate Pass may still be caught,
whereas an ordinary failed pickup still publishes its native turnover before
the ball bounces. Availability is server-owned; spent skill usage on an earlier
roll is distinct from attempting to reroll the same roll twice.

Selected Orbit/high-contrast styling was visually inspected. The final
prototype typecheck and capture passed 188 checks with zero errors.

## Prototype boundaries and findings

This follows the existing `browser-client/prototypes/*` dev-only `/pitch-preview`
convention. A local Vite server hosts illustrative state without authentication,
a match connection, persistence or native mutations. It reuses `PitchScenery`,
`PitchProjection`, player artwork and `PolygonDie`. It does not replace a live
match route; this permits interaction review without altering a match. The
switcher is development-only and this entry is outside production builds.

Countdown, pending actions, replay and remount controls are illustrations. In
particular, a preview timeout displays an illustrative outcome; production
must await the authoritative server continuation and must not send an invented
client-side decline. Mockup remounting is not real reconnect acceptance.

Placement considers the complete circle/chooser footprint against protected
sprite bounds, ball and dice. Browser checks caught dice occlusion when the
chooser was below the circle on portrait screens; it now sits alongside it.
Portrait previews crop a normal-width camera to retain readable pitch art,
rather than shrinking the tall/narrow camera to a one-pixel scale. This framing
is isolated to the prototype and does not change production camera behavior.

Production now connects the selected design to native action IDs, retained
deadlines, protected placement, keyboard controls and pending/recovery paths.
It includes regression coverage and a user-facing change-list entry. This
prototype remains a separate illustrative entry; see the implementation outcome
for production checks and the remaining runtime validation gaps.

## Initial prototype baseline — 2026-10-25

The table below records the original design-stage baseline. Current production
results supersede these counts in the [outcome report](../../../docs/specs/revised-skill-prompts-outcome.md).

| Check | Result |
| --- | --- |
| `npx.cmd tsc --noEmit -p prototypes/skill-prompts/tsconfig.json` from `browser-client` | Passed after final UI changes. |
| `node prototypes/skill-prompts/capture.mjs` from `browser-client` | 110 checks passed, zero browser/font/image/HTTP errors. |
| `npm.cmd test` from `browser-client` | 393 passed; zero failures/skips. Includes decision mapping, reroll choices/accounting, reaction clock and recovery units. |
| `npm.cmd run build` from `browser-client` | Passed, including asset sync and production typecheck. Existing large-chunk warning. Prototype is not in the production entry graph. |
| `node --experimental-strip-types test/manual-reroll-ui.mjs` | Passed four native-fixture Pro phase journeys, original block dice, separate d6, reconnect and retained retry. |
| `node --experimental-strip-types test/reactive-decisions-ui.mjs` | Passed skill/square/movement routing, roll timing, monotonic deadline and remount, observer/replay suppression, both team themes and desktop/Android viewport checks. |
| `node --experimental-strip-types test/pending-recovery-ui.mjs` | Passed ordinary pending-action presentation and uncertain-outcome exact retry. |
| `mvn.cmd -B -pl ffb-server -am package` from repository root | Passed under installed JDK 21: common 175/175, server 651 passed plus four skipped; zero failures/errors; server JAR and ZIP built. |
| `git diff --check` | Passed. |

Browser baseline scripts used isolated `FFB_BROWSER_TEST_CACHE_DIR` values under
`browser-client/node_modules` to avoid cache contention. Native build used
`JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`. Initial
sandbox runs encountered `AccessDeniedException` on the pre-existing common
JAR; the same package command passed outside the sandbox. No native source
changes were made to address that environment restriction.

Four database checks were skipped by their existing opt-in assumptions:
`Marker6SchemaTest`, `SkillUsePreferenceSchemaIntegrationTest`,
`RecoveryJournalMariaDbTest`, and `V2PreparationJdbcTest`. Isolated database
configuration was not supplied. Real authenticated live-server play/replay
cutover was not run; the browser checks above use existing native fixtures and
the Maven suite exercises native server behavior. Production UI acceptance
must be repeated against the selected implementation.

The existing reactive browser review reports absent perspective scenery at
portrait aspect ratios in both themes while its reaction assertions pass.
The mockup's isolated framing adjustment is described above; this slice does
not fix that production camera issue.

Visual inspection covered each desktop style, red ribbon state, long labels,
reroll confirmation and chooser, and portrait chooser/long-label views.
Automated checks additionally cover all three variants in portrait/landscape,
protected-element intersections, pending disablement, source/back/decline,
original dice, preference choice, allowance changes, running and remounted
timers, replay illustration, URL reload and keyboard switching.

Detailed visual check ledger: [review/checks.json](review/checks.json).
Baseline logs: `browser-client/test-output/skill-prompts-*.log` (ignored local
artifacts).

## Screenshots

- [A · Orbit](review/A-wrestle.png)
- [B · Crest](review/B-wrestle.png)
- [C · Dial](review/C-wrestle.png)
- [Red final 20%](review/B-urgent.png)
- [Multiple sources](review/B-chooser.png)
- [Reroll confirmation](review/A-reroll.png)
- [Block dice and reroll choices](review/C-block.png)
- [Long skill label](review/C-long.png)
- [Viewport-edge placement](review/B-edge.png)
- [Portrait built-in skill prompt](review/A-portrait-pickup.png)
- [Portrait long label](review/C-portrait-long.png)
- [Top-down, away end, contrast preview](review/top-down-away-contrast.png)

Orbit layout/palette, Crest source-picker palette and skill-first behavior are approved. Production
implementation and its exact validation are tracked in #361 and implementation.md.
