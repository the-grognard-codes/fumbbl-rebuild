# Manual skill rerolls — fifth UI round

Issue: [#189](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/189). Scope: T05 of the approved fifth match UI round.

## Result

Each offered manual skill has one icon. Multiple native commands for the same source, such as choosing which dice a star skill rerolls, remain explicit choices under that icon. Keep-dice and native team-resource choices remain available alongside skills.

Clicking Pro runs the native Pro test immediately. A failed test offers a separate retry only when the original native rules permit it. A successful block Pro test asks which original die to reroll; a sole die resolves automatically. Brawler asks which Both Down die to reroll when several qualify and automatically uses a sole eligible die. The native engine controls eligibility, actor ownership, accounting, and the pending phase.

The original block dice remain visible during a Pro-test retry, with the Pro d6 in its own row. Single-die actions retain their original d6 instead of borrowing an earlier block result. Pending tests and die choices survive native checkpoint restoration. Existing combined Pro commands retain their native behavior, and the new shared mechanic hook defaults to no interception in other rulesets.

## Verification

- Native focused suite: 41 checks passed across manual phases, ball/foul actions, dice projection, recovery, and reroll accounting/choices. A subsequent nine-check manual suite passed after adding automatic movement Dodge and Brawler Both Down/Blitz restrictions, bringing the distinct focused checks to 43.
- The source/choice scenarios cover both coaches, Pro success/failure, native Loner/Mascot/team fallback accounting, concurrent sources, one/two/three block dice, uphill ownership, legacy commands, and rejected stale/wrong-actor/duplicate mutations. Pending generic Pro tests and block test/die phases restore with the native command cursor and consume the saved result once.
- All 197 browser-client tests and TypeScript checking passed. The production static-site build passed.
- Thirteen server reroll API/checkpoint normalization checks passed, bringing focused native verification to 56 distinct checks.
- Existing production browser reroll journeys: 56 actor/opponent/spectator cases passed, including late native reports, camera changes, keyboard use, compact viewports, reconnects, and exact retained retries.
- Twenty-two production browser accounting cases passed, preserving native source priority, remaining counts, Mascot/Leader behavior, and exact retries.
- Four new production browser phase journeys use actual native snapshots and transcript records exported by `ManualSkillRerollTest`; only the WebSocket envelope is controlled. They cover both coaches through block and single-die Pro phases, original outcomes, the separate Pro d6, reconnects at pending boundaries, and a lost reply repeated with the complete original request.

Local screenshot evidence is retained under `.tools/fifth-round-evidence/T05/`. Inspection confirms the original dice remain readable and the separate Pro d6 does not become a selectable block outcome. The fixture's clock values and UUIDs come from isolated test sessions; no private match data is included.

## Review and practical limit

Independent Standards and Spec reviews approve. The spec review found an early gap in generic Pro ordering; the final implementation handles that path through the BB2025 native mechanic. Import ordering was corrected and checked. IDE-generated test bytecode briefly contained unresolved types; rebuilding the disposable test classes restored meaningful native verification. Clean CI remains the publication gate.

No deployment is part of this slice.
