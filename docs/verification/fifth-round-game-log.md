# Fifth round: readable Game Log (T11)

The log uses native Player Action reports for declarations and freezes accepted native action descriptions in optional version-1 `decision.logPresentation` metadata. Normal sentences show player/team names and canonical targets; raw choice tokens and identifiers appear only in the optional compact debug line below an entry.

Committed movement uses the native commit revision, source player and origin. Each accepted continuation updates the same summary to the actual reached square. One four-square plan yields one summary; four separately submitted squares yield four. Pickup failures retain the reached square, the failed attempt, and any separate reroll attempt. This presentation does not alter native movement, dice consumption, request fingerprints, retry deduplication, or the pending-route checkpoint format. An older pending-route checkpoint supplies its original origin and commit revision on continuation.

Native primary-roll reports add optional version-1 `logRoll` facts: base, physical successful d6 target, actual net modifier, and canonical square. They come from the resident native game and typed reports. Secure the Ball uses 2+; passes use PA and the native range penalty, with accurate/inaccurate/fumble wording from `passResult`. Native model changes locate pickup/catch/movement checks throughout a multi-square plan. The source reports remain intact.

Game Log settings appear above the scrolling history: Debug **OFF**, Movement **OFF**, Roll modifiers **ON**. Choices use browser local storage, tolerate denied storage, and immediately reformat old and new entries. Hiding modifiers retains the actual roll, adjusted target, base and result. Hiding Movement retains declarations, check attempts and consequences. The incremental cache detects equal-length history replacement, and paging/scroll position stays anchored to readable entries through setting changes. Switching matches resets the history window.

Existing transcript format 2, history byte/record bounds and strict state snapshots remain unchanged. Optional presentation metadata is bounded and validated. Legacy records remain readable from native reports, including the explicit Secure the Ball flag; unknown accepted action tokens are hidden rather than turned into invented descriptions. Legacy completed movements without commit metadata have no fabricated summary.

## Verification

- 31 unique focused native tests: log scenarios, native turn/movement checks and checkpoint recovery. New scenarios cover both coach orientations, one plan versus four commits, individual/planned interrupted pickups, exact retries, continued rerolls, Secure the Ball and all three primary pass outcomes.
- 212 client tests, including all eight combinations of the three controls over native fixture families, legacy decoding, presentation bounds, exact retry formatting, and malformed/denied preference storage.
- Browser checks cover native declarations/results, committed movement, reload persistence, 160-entry initial history, earlier paging, scroll preservation and equal-length replaced history. Existing chat/font/HUD/menu checks are also run.
- TypeScript and hosted site build; independent Standards and Spec reviews before publication. Current run logs: `.tools/t11-*`. Native visual evidence: `.tools/fifth-round-evidence/T11/native-log-controls.png`.

No deployment is included.
