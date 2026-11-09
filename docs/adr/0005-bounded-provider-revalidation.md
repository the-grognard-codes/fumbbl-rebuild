# Reuse provider checks for five seconds on requests; authorize pushes locally

Accepted for [#337](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/337)
on 2026-10-22. Remote Firebase account checks contribute about 102 ms to each
measured gameplay operation; reuse a successful check for at most five seconds
from its start, measured on a monotonic clock, without extending it on hits.
Initial authentication still verifies revocation, and every incoming request checks
token expiry and refreshes local account, identity and scopes; an expired provider
check must refresh successfully before authorization proceeds.

For incoming requests, this deliberately changes Firebase-only disablement/revocation
visibility from per-operation lookup to a maximum five-second cache window. Local lifecycle and
permissions remain immediate. A lookup failure or rejection invalidates cached
sessions for that provider identity, never authorizes from expired data, and is
not cached as success. Entries are bounded to 1,024 per authenticator, keyed by
account, issuer, subject, authentication time and token expiry; bearer tokens are
never retained. Monotonic timing prevents wall-clock changes from extending the
provider window, while token expiry uses UTC wall time. A process restart simply
loses positive checks and requires fresh verification.

## Accepted amendment: local authorization for passive pushes

Accepted on 2026-11-09 for
[#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507).
Approval: [maintainer's option A decision](../specs/engine-worker-publication-authorization.md#maintainer-approval).
This explicitly amends the original per-operation provider rule for unsolicited
server pushes. Incoming requests retain the original authentication, revocation,
five-second success reuse and failure behavior described above.

State publication, chat publication and preparation-change notifications refresh
local account, identity, scopes and relevant membership/role state and check the
recipient's existing token expiry before each push. They make no provider call
and do not require a still-fresh provider-success entry. Local authorization or
database failure denies delivery; local suspension or scope/membership removal
stops subsequent pushes. Enrollment alone never grants lasting authority.

An already authenticated, still-locally-authorized recipient may therefore keep
receiving pushes after Firebase-only disablement or token revocation until its
existing ID token expires, unless an earlier incoming request detects the
revocation. The maximum passive exposure is the token's remaining lifetime,
roughly up to one hour for standard Firebase ID tokens
([Firebase session documentation](https://firebase.google.com/docs/auth/admin/manage-sessions)).
Push delivery cannot refresh the token, extend its expiry or extend the provider
success cache. An observed explicit provider disablement/revocation must not
leave the rejected session subscribed.

Provider outages alone do not stop eligible passive pushes while local checks
and token expiry still pass. Requests that need provider verification continue
to fail closed on lookup failure and invalidate the provider success cache as
before; this exception never authorizes an incoming command, chat message, team
edit, state read, reconnect or token refresh from expired provider verification.
Restart/reconnect still requires normal initial authentication.

This accepts delayed passive viewing cutoff for a game service to avoid a
background refresher, extra provider traffic and refresher failure/lifecycle
complexity. A suspended or compromised session could continue receiving its
permitted match state and chat during that window. Use local account/scope
controls for prompt moderation or emergency cutoff. A background provider
refresher is not required. [ADR 0006](0006-single-engine-worker.md) still bounds
local JDBC and aggregate publication work; implementation and validation of
this policy remain tracked by #507.
