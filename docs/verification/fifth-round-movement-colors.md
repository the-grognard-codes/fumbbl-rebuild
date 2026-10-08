# Fifth round: native movement colors

T08 / issue #192. Adjacent offered moves and planned route steps use one native calculation for dodge modifiers and the first physical d6 face that succeeds. The projection adds optional `movementForecast` version 1 and route preview version 2; legacy previews and saved views remain readable. Available forecasts disappear from frozen replay snapshots together with their action controls.

No-roll squares retain the existing transparent blue (`#74d6e126`); rush-only squares are darker blue. Following visual feedback, dodge/rush difficulty bands use alpha `4d` (77/255, about 30%) for a stronger highlight while keeping the turf visible. Safe blue squares retain their established alpha `26` (38/255, about 15%). Dodge uses yellow for net zero or a bonus, orange for -1, red for -2, and dark red for -3 or worse. A combined check retains its dodge color and labels both `D n+` and `R n+`. Earlier risk stays on its own entered square. The final target honors native natural-one/six behavior, including a raw threshold above six; native action labels agree with the overlay. No reroll probabilities are estimated.

## Evidence

- Three native forecast tests capture 21 cases: 2+/4+ agility across five penalty levels, a Two Heads bonus, eight Drunkard/weather/opposing-Moles combinations, an unmarked rush, and a safe destination following a dodge. Adjacent and planned forecasts agree; native state remains unchanged.
- 57 focused native checks, 205 client tests, TypeScript and the static-site build pass. Existing passing workflows and native pass-range camera journeys pass.
- Strict decoding rejects private fields, wrong players, unavailable or repeated squares, unsupported versions, and invalid modifiers or targets. Actual activation checkpoints test current restoration, legacy omission, modified-check rejection, and omission from frozen transcript snapshots.
- The full browser interaction suite passes, including the corrected reroll transcript harness. The movement journey waits for every catalog sprite to load and tests focused-marker stacking. It covers all 21 cases from both coach ends at 30/40/50 degrees and top-down, both before selection and during route review. It checks exact labels, filled colors, accessible descriptions, and painted bounds proving waypoint badges do not cover targets.
- Existing native fixture changes are checked against the branch base after removing only the new forecast metadata. Commands, other public state, and outcomes remain identical.
- Text and offset waypoint badges render in a pointer-transparent foreground layer above ordinary and keyboard-focused sprites, with color fills left on the ground. This keeps roll targets readable where a neighboring body overhangs the square.
- Screenshots in `.tools/fifth-round-evidence/T08/` were inspected at the delivered scale, including combined checks and a safe destination reached through earlier risk. Native test players lack frozen artwork mappings; the visual harness displays the existing Human/Orc lineman catalog sprites at those unchanged native coordinates. The lettered boxes in the first screenshot were fallback test tokens.

## Review and limits

Independent standards and intended-outcome reviews identified import ordering, unsafe generic adjacent colors, dotted passing moves, covered waypoint targets, and contradictory raw action targets. All are addressed before publication. User visual feedback refined every band to the established translucent blue styling, then strengthened the risk-band opacity after reviewing the real-sprite screenshots. A CI failure revealed that the synthetic reroll transcript retained live forecasts after removing action controls; the harness now mirrors native frozen snapshots by omitting those forecasts. Standards: APPROVE, zero remaining findings. Spec: APPROVE, zero remaining findings. Unknown legacy movement targets use a neutral fill until authoritative forecast metadata exists. Actual dice, access restrictions, canonical input, and committed movement legality remain native.

No deployment is included. Pickup and movement-reaction badges are the following slice.
