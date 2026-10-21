# Public passing range guidance

Ticket #115 adds the optional `passing` object to projection v4. Its own `version: 1` identifies the bounded contract. Existing v4 snapshots without this object, including historical transcript records, remain valid. Active native Pass state supplies fresh guidance on load and after accepted actions, including before pickup. Ending the action removes it.

| Field | Contract |
| --- | --- |
| `version` | Exactly 1 |
| `playerId` | Current active passer, present on the pitch |
| `from` | Canonical passer square, matching the projected player |
| `weatherPenalty` | Native Very Sunny passing modifier, currently 0 or 1 |
| `rangeLimited` | Native Blizzard restriction to Quick and Short distances |
| `ranges` | 26 strings of 15 characters, indexed by canonical x then y |

Each cell contains the native `PassingDistance` shortcut: Q Quick Pass, S Short Pass, L Long Pass, B Long Bomb or R Pass to Partner. A hyphen means no permitted passing distance, including the passer's own square. The service calls the current game's `PassMechanic.findPassingDistance`; it does not maintain another range table. Weather penalty comes from the initialized native pass modifier factory.

Colors describe the range with any weather shift; they do not describe success probability or possession. Only server-issued actions authorize a throw. Movement remains indicated separately by cyan dashed outlines. The legend retains range names, marks restricted categories unavailable and explains the penalty; pinned or keyboard targets provide canonical text details.

The browser rejects unknown fields or versions, malformed grids, mismatched active identity/origin, and issued pass targets outside the permitted grid. Legacy recovery comparison omits new guidance only when it was absent from the saved public view; present guidance must match the regenerated native projection.

Native `PassRangeProjectionTest` exports deterministic fixtures and compares their contents. `passing-presentation.test.ts` validates decoding and presentation, while `pass-ranges-ui.mjs` checks production components and inputs. These fixture checks complement real-server acceptance.

## BB2025 Hail Mary and bomb guidance

Issues [#325](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/325) and
[#329](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/329) introduce
`passing.version: 3` for HMP ball throws and bomb throws. Versions 1 and 2 retain
their existing contracts. Version 3 adds `action` (`pass` or `bomb`) and the
boolean `hailMary` to the version-1 fields.

For HMP, every permitted cell is `B`, including the thrower's square: distance
does not change the Long Bomb PA test. During Blizzard, the server uses ordinary
Quick/Short geometric eligibility while still publishing `B` for eligible
squares. Ordinary bomb throws retain the native range bands. Weather penalties
continue to shift colors; the HMP legend states Long Bomb difficulty and that
the throw is inaccurate at best.

The browser validates the action family and HMP-only `B`/`-` grid, and validates
issued ball/bomb targets against that grid. A synchronized, checkpointed
`ActingPlayer.hailMaryPassMode` preserves HMP selection during `PASS_MOVE`;
the target commit resolves it to the existing native HMP action. Bomb modes use
the existing bomb action values. Switching modes retains the current activation
and allowance, including skill-permitted second bombs.

`HailMaryWorkflowTest` exports ball/bomb journeys for both coaches and weather
states, checks movement and recovery, and verifies PA roll facts. Browser unit
and interaction tests decode those native captures, inspect the controls and
range overlay, and exercise reload and replay presentation.
