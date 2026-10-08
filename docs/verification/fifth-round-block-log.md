# Fifth round: native block dice and outcomes (T13)

The Game Log reuses the established ivory/cyan dice artwork at 22px, with the native selected die highlighted. Every row retains readable face names and accessible image labels. Original arrays, newly rerolled dice and the resulting current array remain separate chronological entries. Final die choice names the native dialog's coach side, including uphill blocks where the attacker first owns a reroll decision and the opponent later chooses the die. If a native result differs from the physical chosen face, both are retained.

Optional version-1 `logBlock` facts freeze attacker, defender and native chooser role without relying on player ID prefixes. Native block skill reports retain the actual owner and opposing player through `logActors`; accepted optional skill choices use the native dialog's player, including defender choices. Dodge, Tackle, Grab, Side Step and Wrestle wording distinguishes a choice from its native effect. Unowned, unused skill checks do not invent a player or produce a false action.

Optional command `logOutcomes` records actual native coordinate/base-state changes in order. A push prompt is not a resolved movement. Chained pushed players and the attacker's follow-up retain their own canonical destinations. Native `FALLING` can precede a pending Wrestle decision, so the log waits for resolution before announcing a knockdown. Wrestle records both players becoming prone; Block standing outcomes use the resolved native state and native prevention skill. Stun, KO, removal and death remain distinct transitions. These facts decorate public copies without changing native reports, commands, dice consumption, request identity or checkpoint formats.

Debug, Movement and Roll modifiers retain their shared behavior. Images and native block effects remain understandable with any setting, after reload and paging. Legacy records keep their native dice and readable names; missing chooser/outcome context is not fabricated.

## Verification

- Four new native tests export 42 accepted-session cases: six face values, equal/uphill choices, both/one-player Block, Dodge/Tackle, attacker/defender Wrestle and decline, Grab, legal forced chain pushes/follow-up, Pro/Brawler originals and rerolls, Pro-test retries and exact request deduplication, from both coaches.
- All 61 focused native tests pass, covering projection, manual rerolls, prior logs, setup and exact dice/reroll fixture guards. The opponent-owned skill-source guard requires the actual native dialog owner and a nonempty action set; it still excludes the home acting player. Existing source reports remain free of presentation metadata.
- 219 client tests cover native faces/chooser/effects, all eight setting combinations, incremental/exact replay, legacy omission and strict metadata bounds. TypeScript and site build pass.
- The new browser journey renders all 42 native cases with loaded artwork, accessible names and chosen-die styling, then checks settings, reload and paging. All 14 hosted-page browser tests pass, including completed replay with both named faces and the accessible selected die. The existing full interaction pack passes and covers live dice, native rerolls, pushes, playback, movement overlays and log regressions.
- Both exact fixture updates were compared recursively: dice adds 12 `logBlock` values, reroll choices adds 52; every prior field/value is unchanged. No existing outcomes were rewritten.

Independent Standards and Spec reviews both approve the final scoped change. Logs: `.tools/t13-*`; native widget screenshots: `.tools/fifth-round-evidence/T13/`. No deployment is included.
