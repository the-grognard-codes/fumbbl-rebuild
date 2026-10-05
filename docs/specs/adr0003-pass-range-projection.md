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
