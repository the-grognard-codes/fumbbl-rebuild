# Historical orphan protocol ID audit

This manifest records identifiers inspected and removed during the BB2025-only
refactor on 2026-11-02. Names below are historical removal evidence, not active
protocol registrations.

## Scope and evidence

- Enumerated existing files with `git ls-files -c -o --exclude-standard`, so the
  audit includes tracked source, untracked moved BB2025 source, and tests. The
  initial Java pass inspected 1,818 files; concurrent integration may change that
  count.
- Parsed each enum declaration and searched surviving Java for the exact,
  case-sensitive constant identifier outside its defining enum. Also checked
  qualified enum references and static imports to distinguish unrelated names.
- Checked case-sensitive serialized names in 3,010 active source, browser,
  fixture, script, and resource text files. Historical `.notes`, documentation,
  agent instructions, archives, and changelogs were outside the runtime evidence
  set. Other enum namespaces and Java method names were reviewed separately.
- No Maven or other tests were run for this handoff, as requested by the parent
  agent while it prepares the reactor. `git diff --check` passed for both enums.

## Removed step IDs

| Constant | Serialized name | Evidence beyond the definition |
| --- | --- | --- |
| `CHECK_STALLING` | `checkStalling` | No Java identifier or active serialized-name reference. |
| `REPORT_STAB_INJURY` | `reportInjury` | No Java identifier reference; matching Java text is an injury-reporting method name, not a step lookup. No browser/resource reference. |
| `SAFE_THROW` | `safeThrow` | No `StepId` reference or serialized-name reference. The separate `ReRolledActions.SAFE_THROW` declaration is preserved. |
| `SELECT_GAZE_TARGET_END` | `selectGazeTargetEnd` | No Java identifier or active serialized-name reference. |
| `SET_ACTING_TEAM` | `setActingTeam` | No Java identifier or active serialized-name reference. |
| `SET_ACTING_PLAYER_AND_TEAM` | `setActingPlayerAndTeam` | No Java identifier or active serialized-name reference. |
| `WILD_ANIMAL` | `wildAnimal` | No Java identifier or active serialized-name reference. |

Retained multi-block and throw-team-mate IDs now have neutral action comments;
their earlier-edition year annotations did not describe the surviving ownership.

## Removed report IDs

Each entry had zero Java identifier references outside `ReportId.java` and zero
active serialized-name references outside that enum.

| Constant | Serialized name |
| --- | --- |
| `WINNINGS_ROLL` | `winningsRoll` |
| `FAN_FACTOR_ROLL_POST_MATCH` | `fanFactorRoll` |
| `INDUCEMENTS_BOUGHT` | `inducementsBought` |
| `CARDS_BOUGHT` | `cardsBought` |
| `CARDS_AND_INDUCEMENTS_BOUGHT` | `cardsAndInducementsBought` |
| `TWO_FOR_ONE` | `twoForOne` |
| `SKILL_USE_OTHER_PLAYER` | `skillUseOtherPlayer` |
| `SWOOP_DISTANCE_ROLL` | `swoopDistanceRoll` |

## Removed browser-only reports

These had no surviving Java emitter/reference. Removed their browser numeric-roll recognition and enum declarations together.

| Report constant | Serialized name | Exact browser reference |
| --- | --- | --- |
| `OFFICIOUS_REF_ROLL` | `officiousRefRoll` | `browser-client/src/dice-presentation.ts:39`, numeric roll ID list. |
| `KICKOFF_RIOT` | `kickoffRiot` | `browser-client/src/dice-presentation.ts:42`, numeric roll ID list. |

## Other unreferenced candidates retained for parent review

Conservative pruning leaves the following without qualified Java references;
their names collide with retained protocol namespaces, resources, or generic
sentinels. They require a separate namespace-aware decision, not deletion of the
surviving concepts that share the names.

- Step IDs: `BUY_CARDS`, `BUY_CARDS_AND_INDUCEMENTS` (dialog IDs);
  `CLOUD_BURSTER`, `FAN_FACTOR`, `PLAY_CARD`, `SELECT_GAZE_TARGET` (report IDs,
  registration fixture and/or current dialog/turn-mode IDs); `FUMBLE_TTM_PASS`
  (step label); `TEST` (generic sentinel).
- Report IDs: `NONE` (generic sentinel), `SPECTATORS` (step ID, JSON field and
  registration fixture), `KICKOFF_OFFICIOUS_REF`, `KICKOFF_THROW_A_ROCK`
  (animation IDs), `NO_PLAYERS_TO_FIELD` (turn-mode ID).

Every ID with a surviving Java reference to its own enum was preserved, including
historically named BB2025 steps and reports.

## Final namespace-specific step pruning

Removed BUY_CARDS, BUY_CARDS_AND_INDUCEMENTS, CLOUD_BURSTER, FAN_FACTOR, PLAY_CARD, SELECT_GAZE_TARGET and FUMBLE_TTM_PASS after checking all surviving tracked and moved Java sources for qualified/static StepId references. Shared dialog/report/label names stay where used; none represents a current registered step. The generic TEST sentinel stays. Removed the recoverFromGaze alias for INIT_ACTIVATION and StepIdFactory old-name fallback: prior-build recovery compatibility was explicitly waived.

The second prior-build alias removeBlitzState for REMOVE_TARGET_SELECTION_STATE was also removed.
