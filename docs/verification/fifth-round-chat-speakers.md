# Fifth UI round: chat speaker identity

Issue #194 removes coach/internal-ID suffixes from chat. Coach labels use the authoritative match-team role/name, adding Home/Away only for colliding names. Spectators use Spectator1 through SpectatorN in muted violet, distinct from home cyan, away gold and system text. Status messages use Match.

The server allocates each spectator ordinal at the first accepted posted message in the full ordered match history. Repeated posts and exact retries keep the number. Late pages carry authoritative numbers and therefore do not renumber accounts based on the currently visible page. Restoration reconstructs the same mapping from the existing durable format-1 history without rewriting it; public pages use version 2. The client strictly validates both public versions, bounds ordinals and rejects inconsistent numbering/private fields. Legacy public version 1 remains readable with a generic Spectator label when it supplies no ordinal.

## Evidence

- Native MatchChat and RecoverySession tests pass: coach/spectator order, deduplication, request reuse, rate/content limits, first-post numbering, rejected posts, more than one page, repeated spectators on a late page, checkpoint restart and unchanged durable history/game revision.
- Client tests decode exported native pages and reject malformed, private, duplicate or inconsistent numbering. Speaker formatting covers team-only labels, colliding names, numbered/legacy spectators and Match status.
- Browser checks render the native first and late pages in independent viewers, verify labels and distinct computed colors, reload history, display same-name coach qualifiers and Match status. Existing font sizes, keyboard/touch composer, draft and sending checks pass. Screenshots: `.tools/fifth-round-evidence/T10`.
- Logs: `.tools/t10-native.log`, `.tools/t10-node.log`, `.tools/t10-ui.log`. Final check counts and independent reviews are recorded in the pull request.

No deployment or database migration is included.
