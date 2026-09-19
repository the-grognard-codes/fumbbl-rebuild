# Game-service public API boundary

Historical H2 `/session/v1` proof only; it is not the active application runtime.
The consolidated player/watch host is specified in
[the v2 route matrix](../browser-client/public-api-v2.md). Its account and match
authority is marker-6 MariaDB, not this proof's account store.

This is the complete route inventory for the local `game-service` host. The host
serves one versioned WebSocket endpoint and no HTTP API, static content, proxy or
legacy route. The catch-all host servlet explicitly returns `404 Not Found` for
every path except the exact `/session/v1` mapping. It does not inspect request
credentials or forward requests.

## Projection matrix

| Projection / route family | Initial release status | Authentication and authorization | Recipient projection and permitted behavior | Selected denial |
| --- | --- | --- | --- | --- |
| Player session: `/session/v1` | Available only as a WebSocket upgrade | Exact configured HTTPS `Origin`; Firebase identity; current `PLAYER` scope before every valid mutation and recipient snapshot; server-owned invitation/member slot rule | Own slot, the other slot's `occupied`/`connected` presence, ordered minimal events, opaque code and self slot. Permits authenticate, create, accepted join/reconnect, reissue/release under the creator rule, chat and leave. No account id, provider identity, email, role, private team data, dice, engine or replay projection. | Plain HTTPS request: `405`; missing/foreign origin or query credentials: `403`; rejected authentication: close `4001`; expired credential: close `4003`; duplicate connection: close `4009`; valid WebSocket failures use versioned error payloads. |
| Spectator: `/spectator`, `/spectate/v1`, `/session/v1/spectator` | Explicitly unavailable | No authentication is evaluated | No DTO, protocol message, read or mutation exists | `404` |
| Admin/support: `/admin`, `/support` | Explicitly unavailable | No browser principal or game-protocol operator scope is accepted | No DTO, operation or mutation exists. Operator/cloud access remains outside this host protocol. | `404` |
| Result/replay: `/results/v1`, `/replay/v1` | Explicitly unavailable from this host | No authentication is evaluated | No result or replay projection, read or mutation exists | `404` |
| Legacy/FUMBBL: `/legacy`, `/fumbbl` and all other paths | Explicitly unavailable | No authentication is evaluated | The host never proxies to FUMBBL, the desktop server or another service. | `404` |

`/session/v1` is a narrow local player-session proof, not a browser route into
the separate R2 recoverable engine runtime. Adding that integration requires an
explicit compatible match identifier, participant mapping and recipient DTO
contract; it is not inferred from an invitation code.

## Exposure rule

A new route or WebSocket message is unavailable until this matrix names its
authentication/scope check, membership or visibility rule, redacted recipient
DTO, permitted operations and denial behavior. A missing browser link is never
an authorization control. Spectator, admin/support, result/replay and legacy
exposure require their respective owner decisions and independently tested
contracts before this matrix may be changed.
