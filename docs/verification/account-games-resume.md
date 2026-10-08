# Local game access and shared account menu

Scope: [#220](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/220), browser comments following T01/T03. Branch `fix/account-games-and-resume`, base `a54428dd7`.

## Intended behavior

- A signed-in coach can refresh their unfinished games and resume an authorized match in the current tab. Keep durable membership, wrong-account denials, connection replacement, native revision checks and exact-request recovery.
- Local development explicitly provisions the existing current-games query index and verifies its shape. The runtime database identity gains no schema privileges. Maintenance is confined to the named, labelled local review database.
- Computer clients default to four concurrent matches, matching hosted configuration, with the existing queue for the backlog. The dispatcher and workers use five of the server's sixteen connection slots.
- Site headers expose a person silhouette and My account disclosure. Its identity line reads Sign in when signed out and the authenticated email when signed in. Account Settings, My games, My teams, Match history and Preferences remain disabled placeholders. Sign in uses the existing login; Sign out uses Firebase and reports a failed attempt.
- Share one authentication context between the account header and existing page modules. Support keyboard activation, Escape/focus restoration, outside click/focus dismissal and narrow screens.

The user separately authorized deleting all existing local test games. This is local maintenance, not a new product deletion feature. Saved teams, identities, scopes and accounts must survive.

## Diagnosis

The actual signed-in local browser reproduced Disconnected on both setup and direct match pages. A read-only WebSocket probe then observed close 1013, “Local browser connection limit reached”. OS inspection confirmed sixteen active connections: fourteen game workers, their dispatcher and an existing browser. The daemon's prior default was thirty-two workers; this was active saturation, not leaked socket admission permits.

The actual database query also reproduced MariaDB error 1176: `ffb_v2_match_members_account` did not exist. T01 requires that query index, but the one-command local startup had not applied its existing migration.

The focused capacity regression reproduced twenty simultaneously admitted workers before the fix and four afterward. Existing query/index definitions remain unchanged. The new local startup maintenance applies that existing SQL resource, verifies `(account_id, matchid)` with a non-unique index, and returns without writes on later starts. Wrong container, schema marker or index shape fails before migration.

## Affected checks and evidence

| Surface | Meaningful check |
| --- | --- |
| Computer worker capacity | `node --test computer-player/test/transport.test.mjs`: actual daemon/worker processes, backlog, browser capacity, queue advancement, uncertain action exact retry and Windows console behavior |
| Local lifecycle / maintenance | `node --test tools/test/dev-local.test.mjs tools/test/review-current-matches-index.test.mjs`: owner validation, preflight, registration and index installation/idempotency/rejection |
| Account disclosure | `node --test site/test/account-menu-browser.test.mjs`: signed-out/signed-in, disabled placeholders, authentication reuse, Sign out success/failure, keyboard/outside dismissal, mobile bounds and shared headers |
| Existing admission and setup | `node --test site/test/play-browser.test.mjs site/test/current-games-browser.test.mjs site/test/builder-browser.test.mjs site/test/spectate-browser.test.mjs`: same-tab/optional windows, direct resume/denials, owned paging/refresh and surrounding authenticated pages |
| Auth environment policy | `npm --prefix site test`: existing environment/transport and login isolation |
| Local end-to-end | Actual signed-in setup empty state after authorized cleanup, fresh test setup/activation, same-tab match and direct resume; native unauthenticated gate and reconnect |
| Integration | TypeScript/site build, relevant server build checks, Standards and Spec review, final PR CI |

## Local cleanup

Stopped the managed computer process tree and game server before cleanup. Verified the fixed review database container and deleted game records transactionally. Removed 27 prepared games, their 49 memberships, 19 checkpoints, six invitations and 28 preparation requests. All eight game tables were empty afterward. Preserved all eight account/team/preference tables, including 29 accounts and 26 saved teams; before/after counts match. No hosted DEV/PROD data was touched.

## Validation status

In progress. Final browser, review and PR evidence will be recorded before delivery.
