# Authenticated game protocol v2 — local development

The game host serves exactly `/browser/v2`. All other routes, including
`/browser/v1`, `/session/v1`, `/spectator`, `/admin`, `/command`, `/gamestate`,
`/backup`, result/replay and legacy desktop endpoints, return 404. No proxy to
FUMBBL exists. A normal HTTP request to the socket route is unavailable; invalid
origins/query parameters fail the upgrade with 403. Only HTTP loopback origins
`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5000` and
`http://127.0.0.1:5000` are accepted currently. Docker publishes the v2
container only as `127.0.0.1:22231`; the connector itself accepts Docker's
forwarded in-container connection. Public TLS/origin exposure remains a separate gate.
Public TLS/origin exposure remains a separate gate.

Each JSON request has `version:2`, `type`, and a unique `requestId`. Authenticate
first with `{type:"authenticate",bearer:<Firebase ID token>}`. Neither client
roles, email, name, UID, dice nor legal actions are accepted as authority. A
successful response exposes only the caller's internal account ID for exact
intent recovery. The newest successful connection replaces the account's old
connection. Every operation and recipient delivery rechecks expiry, Firebase
disabled/revoked identity state and current MariaDB scopes. Failures are generic;
provider/JDBC exception details and request bodies are not logged.

| Family | Authorization before reads/retries | Recipient data | Mutations / denial |
| --- | --- | --- | --- |
| `catalog`, `validateTeam`, `savedTeam` | PLAYER, active identity | Frozen catalog or caller's own saved team | Existing validation/save/load/list; account document format 2; `AUTHENTICATION_REQUIRED`, `AUTHORIZATION`, existing validation/storage codes |
| `preparedMatch` | PLAYER; bearer proof for join; persisted membership for load/activate/creator operations | Frozen prepared game, caller role; fresh invitation code only for creator | create/join/load/activate/reissue/revoke/release; no client-selected account/role |
| `setup` | PLAYER plus account-to-match membership before every load/action/retry | Existing R2 public setup state | Existing server-issued decisions and exact retries; non-member `NOT_FOUND` |
| `browse` | SPECTATOR | Up to 100 active marker-6 match IDs, Home vs Away | Read only; copied R2-only rows never listed |
| `watch` | SPECTATOR plus active match with both marker-6 membership rows | Same public state as players; `callerRole:"spectator"` | Live read-only subscription; unavailable/finished/reference match `NOT_FOUND` |
| Admin, support, replay, results, legacy | Not exposed | None | HTTP 404; unknown protocol message `UNSUPPORTED_MESSAGE` |

Watchers get the final public frame of their active subscription; a completed
match cannot be newly watched or browsed. No spectator chat, account profile,
saved-team document, private dice/checkpoint/request history or replay is sent.
Recipient reauthorization failure stops delivery with `VIEW_UNAVAILABLE`.
The browser clears views on disconnect, sign-out and access loss.

Preparation create selects an owned `teamId` and `expectedDocumentVersion`.
Join supplies the transferable 128-bit `invitationCode` plus an owned team.
Invitations expire after one hour, can be revoked/reissued, and are hashed at
rest. A lost creation/reissue reply may recover the match without recovering its
secret code; the creator explicitly reissues it. No raw code is stored in retry
history. Release is a creator command before activation only, authorized by the
server's current connection registry; it removes the disconnected opponent,
rotates the code and retains audit/retry metadata. Active games are not purged or
reinitialized when browsers leave. R4 retains the durable abandonment/retention
and mutual save-for-later policy work.

Internally, membership supplies trusted home/away to the unchanged R2 engine.
Prepared/recovery/replay formats and the frozen Human catalog remain unchanged.
Account saved-team format 2 versions the ownership namespace separately; legacy
format-1 rows stay untouched. New account imports copy validated choices into a
new owned document and never adopt client-supplied ownership.

All operations use the existing single communication worker and bounded ingress,
connection and asynchronous delivery budgets. No concurrency expansion is made.
The Firebase lifecycle lookup currently runs on that worker: latency/capacity
has not been measured and no public-service readiness is claimed.
