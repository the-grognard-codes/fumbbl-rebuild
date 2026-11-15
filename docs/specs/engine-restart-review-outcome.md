# Deferred engine restart review findings (#530)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/530

The local engine health servlet parses numeric peer addresses and uses
InetAddress.isLoopbackAddress rather than two string spellings. A bounded
numeric-literal guard prevents hostname DNS lookup; IPv6 zone identifiers do not
affect loopback classification. Forwarded headers never influence access.

Dev-local restart is on-failure:3, documented in its README. This retains
recovery from a fatal engine exit while stopping repeated startup failure.
Configuration changed only in source; the running user's stack is untouched.

Unknown request types have no wire name. A separate logName method supplies the
INGRESS operational label. Transport tests preserve that label and adapter tests
ensure it is never echoed as a response type. UUID context accepts either case
and logs canonical lower case without a redundant length check.

Regressions first reproduced three failures: expanded/alternate loopback,
uppercase match ID context, and unknown wire name. Focused route, transport and
adapter tests then passed (60 tests). Full Maven clean install and a source-only
compose configuration check are recorded in the PR. No runtime restart or soak
is required or performed for this slice.
