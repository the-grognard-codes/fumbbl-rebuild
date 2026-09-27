# Match window slice 1: contract and fixture baseline

Issue: [#53](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/53), slice 1. Captured from `origin/main` at `7c5ae5a39` on 2026-09-27. This inventory describes the current implementation; the [approved spec](authoritative-match-window-and-gameplay.md) defines the target.

## Test seam

The primary test crosses the authenticated `/browser/v2` boundary: two match members and one authorized spectator receive the native BB2025 engine's state and decisions, act through the same revisioned command path, reconnect, and inspect the durable result. Browser-mounted tests and deterministic engine fixtures cover intermediate screens; focused rule and decoder tests cover contract edge cases. The UI never supplies dice or a second legality implementation. This uses the existing `SetupSession`/`V2Client` boundary and the active-match publication ADR, rather than adding a second public match interface.

## Current projection versus screen needs

| Screen need | Current authoritative source | Gap and owning slice |
| --- | --- | --- |
| Viewer, phase, revision | v2 authentication/membership plus `setupState.state` `callerRole`, `actor`, `phase`, `revision`, `turnMode`, `prompt` | Actor and spectator delivery exists; a public ordered event cursor for lossless catch-up does not. Slice 4. |
| Match-team names | Frozen match-team document has team names; setup projection has only `home`/`away` | Publish public immutable match-team display names without treating the saved team as mutable live state. Slice 2. |
| Scoreboard | Half, drive, turns, score, weather, two reroll counts | Other publicly visible resources and display metadata are missing. Do not copy preview counts. Slice 2. |
| On-pitch player | Player ID, name, roster slot, role, state text, coordinate, nullable art identity; active player ID | Jersey number is not an explicit display contract, and attributes, skills, structured status and movement remaining are absent. Add only public data with audience tests. Slices 2 and 5. |
| Dugout | A null coordinate and free-form state text | Cannot reliably separate reserve, KO, casualty, sent-off and other categories. Slice 2. |
| Legal action | Revision-scoped ID, kind, label, actor, optional player/square target | No distinct source player, special-action variant, rich prompt data, route or roll/hazard metadata. Labels must not become a parser for game rules. Slices 2, 3 and 5. |
| Pitch path | One adjacent `move` action per legal next square; optional target line is decorative | No multi-square preview, waypoints, remaining allowance, path commit, per-step hazards or reroll-free ranking. Slice 5. |
| Dice and decisions | Choice actions exist for several native dialogs; labels can include block face names or roll targets | No typed dice/result scene data or complete popup schema, and several BB2025 choices are not projected. Slices 3, 4 and 6. |
| Match log | Saved replay format 1 has state snapshots after mutations | No complete live decisions, native reports, rolls, modifiers, roll targets, or durable cursor. Slice 4, coordinated with #42. |
| Chat | Preview-only local messages; legacy desktop has a separate talk path | No v2 chat or durable browser history. Slice 7, coordinated with #42. |
| Replay | Completed participant-only result with one indexed snapshot per read | No public full transcript, chat, dice, event seeking or spectator replay. Slices 4, 6 and 7, coordinated with #42. |

Current browser decoder accepts nested projection versions 1–3, with version 3 supplying `target` on every action. A new version must reject missing or extra fields, define old completed replay behavior, and ship with the matching server and browser bundles. It cannot silently add data to version 3. Public fields must be equal for home, away and spectator where the rules reveal the same facts; role-specific permissions stay server-owned.

## Action and prompt inventory

| Family | Current browser v2 | Required follow-up |
| --- | --- | --- |
| Setup and kickoff | Coin, receive/kick, placement, kickoff square, Quick Snap, High Kick, Solid Defence, Charge and touchback choices are projected | Replace generic selection with graphical prompts and bounded pitch/ribbon selection. Include side-specific ownership and confirmation. Slice 3. |
| Common activation | Move/stand, Block, Blitz, Pass, Hand-off, Foul, Throw Team-mate, Secure the Ball, jump mode, forgo, end action/turn | Group all legal declarations in Move, Block, Blitz, Last used and More actions. Preserve target and follow-up steps. Slice 3. |
| Existing block/roll prompts | Block die, team/Pro reroll, generic skill use, push, follow-up, interception, apothecary, argue-the-call | Expose typed dice and exact choices in focused popups. Brawler and other per-die variants need explicit coverage. Slices 3 and 6. |
| Other eligible non-star BB2025 actions | No browser declaration for Kick Team-mate, Punt, Hypnotic Gaze, Multi-Block, Bomb, Stab, Chainsaw, Projectile Vomit, or Breathe Fire | Project only engine-validated actions and combinations, including special Block/Blitz and Chainsaw Foul where permitted. Add deterministic native characterization for each reachable family. Slice 3. |
| Opponent movement reactions | Engine can run Diving Tackle, Tentacles and Shadowing | Expose possible-reaction hazard metadata for route preview and every resulting decision to its owner. Do not promise a reaction will occur. Slices 3 and 5. |
| Wizard and star-specific actions | Frozen exhibition matches do not acquire inducements or field stars | Keep the UI/action contract extensible; actual availability, sprites and acquisition belong to a later workstream. |

The current action family baseline is documented in `browser-client/action-coverage.md` and its 88 native before/request/after traces. Those traces describe an older Human catalog and an earlier unversioned projection; they are behavioral evidence, not a current-version visual fixture or proof that all 108 catalog skills have browser controls. Native action validity stays with the BB2025 engine. `PlayerAction` lists additional context/automatic and star-specific actions that should not be blindly copied into the More actions menu.

## Fixture and visual evidence

| Evidence | What it proves today | What it does not prove |
| --- | --- | --- |
| Nine generated Blitz checkpoints in `m5a-blitz-projections.json` | A real-engine Blitz from selection through three one-square moves, block die and push; all nine include home coach, away coach and spectator projections at equal revisions. A Java test regenerates the exact fixture; a browser decoder test reads each role. | Multi-square commit, dodge/rush interruptions, special attack variants, durable roll reports, or a full match. |
| Five generated movement interruption checkpoints in `m5-route-interruption-projections.json` | Native dodge and rush attempts reach team reroll decisions; each checkpoint contains equal public state for home, away and spectator. Java regeneration and browser decoding protect the current projection. | Automatic route continuation, full target/modifier reports, or skill and opponent-reaction decisions. |
| `crowdedPitchFixtureUsesEnginePlacementAndFrozenArt` and `m5c-crowded-players.json` | A real 22-player setup projection and frozen Human/Orc art mapping for pitch density checks. | Visual parity at every viewport or match action coverage in a crowded state. |
| Existing M5e/MVP match screenshots and the approved bottom-ribbon preview | Baseline live layout gap and desired pitch-first layout at desktop sizes. | Any sample value in the preview being authoritative. |
| Existing 88 native action traces and local full-match demonstration | Supported core choice families, native dice ownership, exact retry and browser controls for the older supported subset. | Newly requested special actions, presentation parity, complete live history, or spectator chat. |

The next slices must add deterministic real-engine checkpoints for a six-square path with three waypoints, partial movement followed by another declaration, dodge/rush and opponent-reaction interruptions, explicit adjacent Blitz, special action variants, all major roll families, two-coach/spectator event delivery, chat, and completed replay. A fixed 22-player viewport capture must accompany the final integrated check. Current human visual evidence remains the user's spectator capture and the approved reference; automated screenshots are acceptance evidence, not a substitute for visual review.

## Versioned contract direction

1. **Projection:** add frozen match-team display identity, player and off-pitch facts, resources, source-player/action-variant identity, and structured prompt data behind an explicit new version. Keep public state compact; exclude the full event history.
2. **Route:** a read-only preview binds the selected player, current revision and ordered waypoints to canonical squares, required rolls and possible reactions. The server validates the complete path again on Commit; an opaque server-issued reference or equivalent validation binds that request to the preview and prevents action-ID spoofing. No preview mutates dice, movement or match revision.
3. **Events:** accepted input, per-square confirmed movement, native reports, dice, terminal outcome and chat receive durable sequence IDs. The log renders only movement/push start and end coordinates, while playback may use intermediate coordinates. Range/index reads are bounded and survive best-effort publication loss. Reconnect uses the current snapshot immediately, then only new events animate.
4. **Commands and permissions:** a role-specific, revisioned action or route commit remains the sole mutation seam. Required prompts use server-issued option IDs. Spectator reads and chat sends are separately authorized; spectators never receive gameplay mutation rights. Exact request retries cannot append a second action, roll or chat record.
5. **Compatibility and rollout:** server DTOs, strict browser decoders, persistence format and schema migrations require paired tests and deployment. In-progress matches are not upgraded in place; completed format-1 replay migration follows #42's reviewed build-phase policy.

## Slice 1 completion evidence

- The nine-checkpoint Blitz and five-checkpoint dodge/rush fixtures include both coaches and a spectator. Java regeneration and browser decoder tests protect both; the kickoff coin prompt and 22-player projection have explicit three-view parity checks.
- The field/action/asset gaps and next versioned seams are recorded above with slice ownership. No sample preview values enter the live projection.
- Existing crowded and action fixtures are identified with their limits. Blocked movement, special attacks and opponent reactions remain uncaptured because the current browser contract has no route or special-action representation; slices 3 and 5 must add real-engine fixtures alongside those contracts rather than fabricate baseline data.
