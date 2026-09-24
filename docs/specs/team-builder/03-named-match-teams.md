# 03 — Named match teams

## Outcome

Creating or joining a match independently revalidates an owned saved team and freezes its names, jersey numbers, roster choices and resolved catalog facts. Existing matches retain their original snapshots.

## Work

- At both `preparedMatch/create` and `preparedMatch/join`, keep the current owner, account scope and expected-document-version checks. Load the current saved team, run the same Java legality implementation used by the builder, reject retired/unsupported catalogs, and freeze only an accepted current version. A prior builder validation result never substitutes for this check.
- Extend `FrozenTeam`, match document serialization and the engine converter with a team name, player names, jersey numbers and separate roster slots. Preserve position names as catalog facts. Set the native engine's team/player names and numbers from the frozen values rather than IDs or `Home`/`Away` placeholders.
- Version any changed match, recovery and public projection shapes. New setup/play views show the frozen names and jersey numbers to participants and permitted spectators. Keep account IDs, provider identity and private saved-team documents out of public match data; existing coach labels may remain `You`/`Opponent` or `Home`/`Away`.
- Keep older match/recovery formats interpretable under their recorded versions. Do not rewrite active matches or derive a frozen team from a later saved-team edit or catalog update.

## Acceptance

- Create and join each reject a foreign, deleted, stale, invalid or retired team without creating or advancing a match. An exact accepted retry cannot freeze a different team.
- Two matches may use the same owned saved team. After its owner edits or deletes it, both original match teams retain the original names, jersey numbers, positions, skills and catalog values across process restart.
- Opponent and authorized spectator projections display the named match team while exposing no account identity or private saved-team document. Older retained match snapshots continue to follow their pinned compatibility behavior.

## Likely files and focused checks

`V2PreparationService`, `FrozenTeam`, `FrozenTeamEngineConverter`, `MatchJson`, `SetupSession`, recovery readers/writers, browser prepared/setup decoders and projection fixtures. Use focused create/join, engine-conversion, restart/recovery and recipient-projection checks; run the required build gate for changed modules. Compare old and new snapshot versions explicitly.
