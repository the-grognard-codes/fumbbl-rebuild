# Jump, Leap and Pogo delivery outcome

[Design](jump-leap-pogo-planning.md) · [Issue #297](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/297) · [PR #298](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/298) · [Validation](jump-leap-pogo-validation.md)

| Agreed outcome | Delivered behavior and evidence |
| --- | --- |
| Smaller adjacent Jump control | Fixed beside Move; faded when no legal landing; desktop and tablet touch journeys passed. |
| Reversible local jump mode | One landing returns to Move; Escape/right-click cancels before undo; confirmation waits for a landing. |
| Full permitted movement planning | First-square and mixed walking/jumping routes; repeated explicit jumps; native Blitz/Foul approaches; stops at unresolved outcomes. |
| BB2025 skill-adjusted guidance | Native legality/targets and Leap/Pogo modifiers; shared penalty palette, neutral outlines, optional skill stripes and Rush triangles. |
| Explicit visible jump path | Curved jump segment with ordinary waypoint; undo removes the whole segment. Both coach views/projections have geometry coverage. |
| Read-only drafts and durable execution | Planning leaves engine state unchanged; confirmation uses native commands; reroll/recovery continuation preserves jump identity. |
| Other gameplay remains available | Walking protocols/checkpoints remain readable; other rulesets retain their native controls; concurrent player skill markers are preserved. |
| Review and publication | Standards/spec findings resolved; conventional feature commit and linked PR; merge waits for repository checks. |

Excluded preferences, double-click shortcuts, persisted unconfirmed drafts and planning beyond unknown block outcomes remain outside scope. No deployment is included.

The audit found and corrected a context-player lookup in the Prehensile Tail forecast helper after reporting it. No broader engine-rules rewrite was required. Full rulebook wording remains independently unverified; native skill tests and the current official FAQ provide the evidence described in the validation record.
