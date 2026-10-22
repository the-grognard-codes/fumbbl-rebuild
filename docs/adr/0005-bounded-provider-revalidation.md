# Reuse successful provider lifecycle checks for a fixed five seconds

Accepted for [#337](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/337)
on 2026-10-22. Remote Firebase account checks contribute about 102 ms to each
measured gameplay operation; reuse a successful check for at most five seconds
from its start, measured on a monotonic clock, without extending it on hits.
Initial authentication still verifies revocation, and every operation checks
token expiry and refreshes local account, identity and scopes; an expired provider
check must refresh successfully before authorization proceeds.

This deliberately changes Firebase-only disablement/revocation visibility from
per-operation lookup to a maximum five-second cache window. Local lifecycle and
permissions remain immediate. A lookup failure or rejection invalidates cached
sessions for that provider identity, never authorizes from expired data, and is
not cached as success. Entries are bounded to 1,024 per authenticator, keyed by
account, issuer, subject, authentication time and token expiry; bearer tokens are
never retained. Monotonic timing prevents wall-clock changes from extending the
provider window, while token expiry uses UTC wall time. A process restart simply
loses positive checks and requires fresh verification.
