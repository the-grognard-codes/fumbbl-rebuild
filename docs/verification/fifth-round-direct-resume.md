# T03 direct resume diagnosis

On 2026-10-07, the reported localhost match URL was inspected in the existing
signed-in browser. Reconnect reached Connected and then displayed `NOT FOUND`.
The same account's game-setup preparation load also returned `NOT FOUND`.

The hosting configuration used the loopback v2 socket on port 22232. Its managed
proxy and live listener pointed to the match-review backend on port 22234.
The separate acceptance backend on port 22235 was not selected.

A temporary read-only Java probe used the existing container JDBC configuration;
credentials and provider/account identifiers were never printed or persisted.
For the reported match, the selected database returned:

| Read | Result |
| --- | --- |
| Saved preparation | 1 row, document version 3 |
| Coach memberships | 2 rows |
| Engine checkpoint | 1 row |
| Owners of the saved team visible in this browser | 1 account |
| That team's owner memberships in the reported match | 0 rows |

The probe then used the real `JdbcV2PrincipalDirectory`,
`JdbcMatchMembershipRepository`, and `V2MatchAccess.playerRole` against those
persisted identities. The visible team's owner returned `NOT_FOUND`; the
registered home coach returned `home`. The probe did not verify Firebase tokens,
grant access, mutate the database, or run an engine action. It read existing
identity mappings to test the exact downstream authorization gate.

This explains the observed local failure as an account membership denial before
engine restoration. The data does not support the assumption that the current
browser account is a coach of this match. No account association or authorization
rule was changed. Missing checkpoints instead return `SESSION_UNAVAILABLE`.

Regression coverage exercises fresh same-account native connections, role and
revision preservation, retirement of the prior socket including queued input,
and unknown/wrong-account denials before engine reads. Browser journeys cover
same-tab launch, explicit new-window launch, popup blocking, and fresh direct
loads with an empty session store. Existing real recovery tests cover accepted
activation restoration and fail-closed missing artifacts.

The precise local URL and private identity mappings are intentionally omitted
from this tracked report. The temporary probe is in the ignored `.tools` debug
area; it must not be used as an authentication substitute.
