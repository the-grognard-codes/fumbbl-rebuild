# Authenticated game protocol v2

**DEV transport update, 2026-09-21:** the installed backend accepts exactly
`wss://game-dev.molesunderthepitch.org/browser/v2`, Origin
`https://dev.molesunderthepitch.org`, with nginx forwarding only to Java loopback.
The paired DEV browser configuration was published with explicit owner approval;
served-artifact parity and real-browser WSS/reconnect checks passed. Signed-in
gameplay acceptance remains pending. PROD remains unavailable. Local policies remain
unchanged. See [DEV installation evidence](../.notes/overhaul-analysis/verification/r3-d/dev-install-20260921.md).

The game host serves exactly `/browser/v2`. All other routes, including
`/browser/v1`, `/session/v1`, `/spectator`, `/admin`, `/command`, `/gamestate`,
`/backup`, result/replay and legacy desktop endpoints, return 404. No proxy to
FUMBBL exists. A normal HTTP request to the socket route is unavailable; invalid
origins, foreign Host headers, raw path variants and query strings (including an
empty `?`) fail the upgrade with 403 (malformed HTTP may receive Jetty's 400;
unmapped paths receive 404). Only HTTP loopback origins
`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5000` and
`http://127.0.0.1:5000` are accepted currently. Docker publishes the v2
container only as `127.0.0.1:22231`. Native local connectors default to
`127.0.0.1`; the explicit `local.transport.container.forwarding=true` option
requires Docker's container marker and permits in-container forwarding only.
The Compose loopback publication is mandatory when that option is used.
The request Host must be `127.0.0.1:<server.base port>` or
`localhost:<server.base port>`; forwarded headers cannot override it.
Local v2 fixes Firebase to the approved DEV project and forbids emulator
credentials. Browser and hosting configuration reject mixed environment fields
before initializing authentication or opening a game socket. DEV permits only its
exact endpoint above; PROD and arbitrary WSS URLs remain unavailable. The older
service's TLS profile tests are not evidence for this v2 runtime; its actual DEV
listener checks are recorded separately in the installation report.

The `local-dev` browser now connects through loopback nginx at exactly
`ws://127.0.0.1:22232/browser/v2`, not directly to port 22231. The proxy requires
Host `127.0.0.1:22232`, the same exact local Origins, GET and WebSocket Upgrade;
rejects query strings and Authorization/Cookie headers; and supplies the fixed
backend Host `127.0.0.1:22231`. It strips forwarded headers and has no fallback
route or upstream retry. Absent routes remain 404; forbidden upgrades are 403
(malformed HTTP may be 400). This is a local diagnostic WS exception, not TLS
acceptance. See [startup and validation](../deployment/game-service/proxy/LOCAL.md).

An opt-in `local.browser.v2.proxy.profile=dev` handoff is now available for
isolated reverse-proxy validation. It replaces local Origins with exactly
`https://dev.molesunderthepitch.org`, requires Host
`game-dev.molesunderthepitch.org`, and forbids wildcard/container forwarding.
It does not itself publish a hosted browser build.
See the [nginx candidate and cutover limits](../deployment/game-service/proxy/README.md).
The native DEV launcher uses a separate exact marker-6 profile, fixed loopback
JDBC/listener addresses and a process-held storage lock. Startup verifies existing
marker-6 storage only; it cannot initialize or migrate a database. Neither this
launcher nor its systemd candidate is installed or activated by the repository.

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
| `preparationChanged` (server event) | Rechecked PLAYER scope and persisted membership of a preparation subscriber | Match ID only; no invitation or team document | Read invalidation only; recipient denial `VIEW_UNAVAILABLE` |
| `setup` | PLAYER plus account-to-match membership before every load/action/retry | Existing R2 public setup state | Existing server-issued decisions and exact retries; non-member `NOT_FOUND` |
| `browse` | SPECTATOR | Up to 100 active marker-6 match IDs, Home vs Away | Read only; copied R2-only rows never listed |
| `watch` | SPECTATOR plus active match with both marker-6 membership rows | Same public state as players; `callerRole:"spectator"` | Live read-only subscription; unavailable/finished/reference match `NOT_FOUND` |
| Admin, support, replay, results, legacy | Not exposed | None | HTTP 404; unknown protocol message `UNSUPPORTED_MESSAGE` |

Watchers get the final public frame of their active subscription; a completed
match cannot be newly watched or browsed. No spectator chat, account profile,
saved-team document, private dice/checkpoint/request history or replay is sent.
Recipient reauthorization failure stops delivery with `VIEW_UNAVAILABLE`.
The browser clears views on disconnect, sign-out and access loss.

## Hosted match route

`/play` holds saved-team selection, match preparation and spectator browsing.
After an `ACTIVATED` prepared-match response, both players navigate to
`/play/match?matchId=<uuid>`; a spectator uses the same route with `watch=1`.
The match route mounts the existing setup/game view and seeds one `V2Client`
subscription from its validated URL. Reload and reconnect request a fresh
authorized projection. A retained uncertain setup request takes precedence over
the URL and can only be retried with its original request ID and account. A
signed-out direct match link survives the constrained `/play` sign-in return in
session storage; no bearer or provider identity is placed in the URL. Firebase
Hosting's existing `/play/**` rewrite serves both routes.

## R3-E recipient contracts and display names

Coach labels remain `You`/`Opponent` for players and `Home`/`Away` for spectators.
Provider email, UID and display name are never a coach-label source. Catalog and
on-pitch player names remain public game text shared with spectators and are
rendered as React text/attributes, never HTML. Custom coach names remain backlogged.
The active v2 protocol has no chat message; the earlier session-chat foundation
does not authorize adding chat to v2.

Every response has exactly `version`, `type`, `requestId` and the fields below.
Unknown families and extra fields fail closed before rendering; nested team,
preparation and game structures retain their existing decoder contracts.

| Recipient response | Additional fields | Projection boundary |
| --- | --- | --- |
| `authentication` | `code`, `accountId` | Caller's internal account only, for retained intent; never a displayed name |
| `error` | `code` | No provider/JDBC exception, account or team payload |
| `browse` | `code`, `matches` | Each entry has exactly `matchId`, `label`; label is Home vs Away |
| `preparationChanged` | `code`, `matchId` | Authorized subscriber invalidation; no team or invitation |
| `preparedMatch` | `code`, `duplicate`, `callerRole`, `document`, `recoveryMatchId`; optional `invitationCode` | Member's frozen public preparation; non-null invitation only for creator/home |
| `savedTeam` | `code`, `document`, `versionStatus`, `validation`, `teams` | Own-account document, including uncertain-save responses; foreign/extra ownership fields rejected |
| `setupState` | `code`, `duplicate`, `state` | Public engine state; watch requires spectator role, player load requires a player role |
| `catalog` | Existing catalog metadata, positions, skills, resources and unsupported text | Frozen public catalog; no identity or storage internals |
| `teamValidation` | `catalogVersion`, `ruleset`, `valid`, `budget`, `skillPoints`, `messages`, `total` | Server validation of caller-supplied draft, no other account's data |

`v2-projection.ts` and `v2-projection.test.ts` declare/test all nine envelopes.
The existing nested decoders and service/native projection tests cover the
recipient boundaries. New DTOs or fields require explicit positive/negative
projection tests and a reviewed protocol compatibility decision before exposure.

The nested `setupState.state` and replay event state now carry
`projectionVersion:2`. Each player has public `art`, either
`{rosterId,positionId}` derived from the frozen match or `null` when the frozen
identity cannot be matched to an older engine player. The browser accepts the
earlier unversioned state for retained replay compatibility and rejects a
version-two player missing `art` or carrying extra/private art fields. This is
presentation identity only: it conveys no private team document, legality or
odds. Publish the updated game server and browser decoder together; older
browser bundles reject version-two states. The v2 transport envelope and
engine/replay/persistence formats remain unchanged.

The live nested state advances to `projectionVersion:3` for M5d. Every
server-issued action adds `target`: `null`, `{playerId}`, or `{x,y}` in canonical
pitch coordinates. The target is a display and pinning hint for that exact
action ID at that revision. It does not imply a multi-step route, success odds,
or permission to submit a different action. The decoder still accepts retained
unversioned and version-two replay states. New server/browser bundles must be
published together; older browser bundles reject version three. Recovery
compares historic projection versions against their corresponding current
presentation subset while retaining exact checks for the gameplay fields.
See [R3-E evidence and limits](../.notes/overhaul-analysis/verification/r3-e/README.md).

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

Successful preparation responses subscribe that connection to changes for the
selected match. Join, activation and other successful preparation mutations
(including exact retries) notify other authorized subscribers with
`{version:2,type:"preparationChanged",requestId:null,code:"ACCEPTED",matchId:...}`.
The browser reloads the selected preparation through the ordinary authorized
`load` request and opens play when its lifecycle is `ACTIVATED`; the creator
does not have to press Resume play. Notifications for another selection are
ignored. An in-flight reload coalesces notifications. Neither notification nor
load acknowledges an uncertain mutation. Same-tab reconnect reloads preparation;
opening a player/watch view replaces that subscription. Deploy this updated
client with the updated server: older v2 clients reject this new event family.

Internally, membership supplies trusted home/away to the unchanged R2 engine.
Prepared/replay formats and the frozen Human catalog remain unchanged. Newly
activated v2 engines use private recovery runtime `ffb-3.4.0-bb2025-r4.1`,
recovery shape 3, for the server-owned default setup and mutual save/resume policy.
Existing `r2.2` and `r2.3` checkpoints keep their recorded policy and version when
restored; no active engine is upgraded in place.
On entering each side's ordinary SETUP phase, the first eleven eligible players
in roster-slot order are placed: first three on the line, remaining eight one
square behind. Unavailable players are skipped and extras remain in reserve.
The formation is editable and never auto-confirmed; native setup legality still
applies (including a required captain outside the first eleven, which the player
must swap in). Reads/retries/restoration do not reapply the template. Deployment
is part of the triggering mutation's checkpoint before acknowledgement, not a
client sequence of placements. No native BB2025 rule, dice or replay schema changed.
Account saved-team format 2 versions the ownership namespace separately; legacy
format-1 rows stay untouched. New account imports copy validated choices into a
new owned document and never adopt client-supplied ownership.

All operations use the existing single communication worker and bounded ingress,
connection and asynchronous delivery budgets. No concurrency expansion is made.
The Firebase lifecycle lookup currently runs on that worker: latency/capacity
has not been measured and no public-service readiness is claimed.

R4 checkpoint-enabled activation can return `ACTIVATION_LIMIT` (32 non-idle
resident engines) or `RETENTION_LIMIT` (1,024 retained checkpoint IDs by default).
Neither rejection activates the prepared game or discards an existing checkpoint.
An already-staged activation and existing gameplay/retries remain usable at the
retention limit. Completed reads/retries consume no resident slot. See the
[local lifecycle contract and measured limits](../containers/local/session-retention.md).

For an r4.1 match, `setup` additionally accepts `saveRequest`, `saveAccept`,
`saveReject`, `saveCancel`, `resumeRequest`, `resumeAccept`, `resumeReject` and
`resumeCancel`. Every operation includes the current `expectedRevision`; accept,
reject and cancel include the server-issued UUID `proposalId`. Membership is checked
before every operation and retry. Either original player may request; only the
other accepts/rejects and the requester cancels. `saveResume` in a live setup state
contains only `status`, `proposalId`, `proposer` and `expiresAt`. It never exposes
the checkpoint, dice, request history or clock base. Save and resume each require
two fresh agreements. A suspended game returns `MATCH_SUSPENDED` for gameplay;
after 30 days without a successful player action/save-control operation/resume it
becomes retained `MATCH_ABANDONED`. See the lifecycle contract for checkpoint,
restart, backup, expiry and deletion limits.
