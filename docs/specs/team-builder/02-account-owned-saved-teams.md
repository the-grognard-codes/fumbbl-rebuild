# 02 — Account-owned saved teams

## Outcome

A signed-in player can create, list, load, edit and delete only their own validated teams. Saved-team responses include useful list metadata and a clear match-eligibility status.

## Work

- Store the named draft from slice 01 in account saved-team document format 3; the existing account format is 2. Preserve the stable server team ID, internal account owner, optimistic document version and server-computed validation. The server obtains ownership only from the authenticated principal.
- Extend owner-scoped list metadata with team name, roster/catalog, document version and eligibility. A retired or unsupported catalog remains visible to its owner but cannot be selected for a new match; no silent catalog migration occurs. Do not allow a malformed or old-format row to break the entire owner list.
- Revalidate on create and update, reject incomplete or invalid teams, and retain versioned compare-and-swap updates. Extend the current request-identity/unknown-commit reconciliation so retries cannot create extra teams or overwrite another version.
- Add an owner-only delete operation with confirmation in the later UI. Delete frees the owner's team capacity and prevents future selection; it does not delete a frozen match. Foreign IDs should reveal no private team content. Define a reconcilable outcome if database acknowledgement is lost.
- Add a forward database migration and update the strict schema verifier. Preserve existing database/backup data and already frozen matches. Existing account-format-2 rows remain stored and nonselectable; they must not break the owner list. There is no legacy site-file import or automatic conversion requirement.

## Acceptance

- Two authenticated accounts see disjoint team lists. Guessing another account's team ID cannot load, update or delete it.
- Save/update reject invalid names, jersey numbers, roster choices and stale document versions without changing stored bytes. Exact create retry returns the same team; an uncertain result can be reconciled by authorized load/list.
- Deleting an owned team removes it from subsequent lists and selection, frees capacity, and leaves a match that already froze it intact. Existing stored rows and frozen matches survive migration without a reset.

## Likely files and focused checks

`SavedTeamService`, `SavedTeamJson`, `JdbcSavedTeamRepository`, `BrowserSavedTeamJson`, account schema migration/verifier, `browser-client/src/saved-team-protocol.ts`, and v2 projections. Use focused service/JDBC, authorization, retry and decoder checks plus the required build gate. Include a real database migration/rollback and restart check in this slice's evidence.
