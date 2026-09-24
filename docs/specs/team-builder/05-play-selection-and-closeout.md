# 05 — Play selection and closeout

## Outcome

Play presents the account's saved teams by name and eligibility, then creates or joins a match with the selected current version. The full builder-to-match journey is demonstrated with separate accounts.

## Work

- Replace UUID-only team choices in the public Play lobby with owner-scoped name, roster and version/eligibility metadata. Show retired or unsupported teams with an unavailable reason; do not submit them. Refresh the list after returning from the builder or after an ownership/version change.
- Keep server ownership, catalog and validation checks at create and join; the browser's eligibility display is guidance. Handle a team changed or deleted in another tab by refreshing the selection and explaining the rejection. Keep the existing invitation, preparation notification and exact-retry behavior.
- Verify the integrated path: account A and B each save a team; A creates and B joins with their own team; both match teams show frozen names and jersey numbers; an authorized spectator sees the public roster; source edits/deletion and a restart do not alter the frozen match. A third account cannot use either saved team.
- Remove dead standalone builder references and update user-facing documentation and the latest `VersionChangeList` entry for the visible change. Record version compatibility, exact verification results and any deployment or data-migration follow-up separately.

## Acceptance

- Play offers only the signed-in account's teams for selection, labels them intelligibly, and cannot submit another account's ID through the UI or server. Both create and join revalidate their chosen saved-team version.
- The full two-player and spectator journey agrees on named frozen rosters before and after restart. Team edit/delete affects future selection only. Reconnect and exact retry do not duplicate a team, match or game action.
- A fresh build has no path from the public Team Builder to the retired local JSON rules. Required Java/browser/site checks pass; any unverified hosted rollout is stated explicitly.

## Likely files and focused checks

`browser-client/src/play-entry.tsx`, v2 saved-team list decoder/client, public site copy, `ffb-client-logic/.../ChangeList.java`, and integrated browser drivers. Run focused selection/retry and two-account browser checks, then required project verification. Deployment remains a separate authorized action.
