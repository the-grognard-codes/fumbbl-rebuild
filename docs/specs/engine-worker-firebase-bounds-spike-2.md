# Firebase bounds: owned DNS and TCP feasibility continuation

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504).
Branch: `fix/firebase-bounds-publication-authorization`.
Prior evidence: [initial failed candidate](engine-worker-firebase-bounds-spike.md).
Status: mechanism proved in focused experiments; independent review and clean
boundary validation pending before production implementation.

## Decision and mechanism

On 2026-11-10 the maintainer replied "Yes, proceed." to the previous handoff.
Work continues with #504 first, preserving the original #504 → #507 order and
the feasibility gate. This continuation evaluates the first offered path, an
owned cancellable DNS/transport design; #507 has not been split.

The new candidate avoids the JVM's uninterruptible DNS path. It uses
`dnsjava:dnsjava:3.7.1` for the wire codec only, with application-owned,
nonblocking UDP/TCP channels and positive remaining-deadline selector waits.
All DNS channels close synchronously before lookup return. It validates peer,
transaction, question, class, opcode and relevant owner/alias records; alias
cycles, excess addresses and incomplete frames fail closed. Lookup is bounded
to eight questions per address family, eight alias traversals per answer, 16
addresses and a 65,535-byte DNS message. A single DNS deadline covers UDP and
truncated-response TCP fallback. No background lookup or DNS retry survives it.

Before HTTP execution, DNS is resolved inside the operation. The pinned Jetty
12.1.13 public `Transport.Wrapper` then uses the resolved socket address while
retaining the original URI host for SNI/HTTPS identity validation. Its public
`newSelectableChannel()` seam registers each actual TCP channel with the
operation **before connect**. A second channel attempt for that HTTP request is
refused. On timeout the candidate aborts the request and closes those channels;
late channel creation is rejected/closed too. It stops/removes operation-owned
destinations before releasing the operation. This is more than a timed future:
the actual DNS/TCP/TLS network resources are cancelled and their closure tested.

The experiment uses a 1,000 ms provider operation, a 900 ms I/O deadline (100 ms
for parsing/cleanup), a 200 ms DNS cap and 250 ms connect cap. Up to eight HTTP
calls share that I/O deadline. It consumes the merged `BrowserRequestTiming`
budget, admitting only when the full operation plus a provisional 150 ms
remaining-work reserve fits the original 2,000 ms task. An operation cannot reset
that budget or create a nested allocation. These are proven candidate values,
not a claim that all subsequent native/JDBC work fits the reserve in production.

Firebase Admin **9.4.3**, google-http-client **1.45.3**, OAuth **1.30.1** and
credential-library **1.30.0** remain unchanged. The codec is currently test-scoped;
no production transport/authorization behavior has changed. The codec's version
was verified against Maven Central metadata and its pinned
[source](https://github.com/dnsjava/dnsjava/tree/v3.7.1).
Jetty's extension is a documented public
[transport interface](https://github.com/jetty/jetty.project/blob/jetty-12.1.13/jetty-core/jetty-io/src/main/java/org/eclipse/jetty/io/Transport.java).
No SDK internals, reflection, patching or interrupt-only cancellation is used.

## Credential and retry coverage

Real synchronous `verifyIdToken(token, true)` verifies a synthetic RSA-signed
token through real DNS and TLS key fetch, OAuth and revocation responses, sharing
one operation. User, service-account and compute-engine credentials are built
through the public `HttpTransportFactory`. Service-account credentials use
`createWithCustomRetryStrategy(false)`; the other tested credential paths have
no I/O-backoff handler. The compute case includes its actual HTTP metadata refresh
in the same operation as TLS key/revocation calls.

All HTTP statuses ≥300 are converted to terminal I/O failures before Firebase's
retry/credential-response handlers. Real OAuth 503 responses produce one OAuth
attempt and no backoff for user/service credentials. Initial experiments retain
the contrasting default SDK/credential backoff evidence. Redirects are disabled;
compressed responses are rejected, request/response bodies are capped at 256 KiB,
and headers have finite count/length limits. Production work must retain safe
typed status classification rather than the candidate's generic status message.

External-account/WIF, impersonated, executable/file-sourced and other credential
types remain unsupported by this proof. Production must explicitly reject them,
rebind allowed ADC types to the owned factory and preserve startup-only discovery.
This does not authorize default-transport refresh or silently bypass a deadline.

## Numeric evidence

The complete focused selector passed **48 tests, zero failures/errors/skips**:

```powershell
pwsh -NoProfile -File tools/target-build.ps1 test -Module ffb-server -Test FirebaseOwnedTransportCandidateTest,FirebaseDnsCandidateTest,FirebaseTransportFeasibilityTest,FirebaseV2PrincipalAuthenticatorTest,FirebaseSessionVerificationTest,JdbcRequestDeadlineTest
```

Log: `.tools/slice3-spike-r2-focused.log`. Times below include operation-owned
cleanup; fixture shutdown/peer-observation waits are outside that operation.

| Case | Observed result |
| --- | --- |
| Cold user / service / compute verification | 452 / 53 / 51 ms; three DNS queries for user/service, one compute metadata call |
| Delayed cold key/OAuth/revocation (350 ms per phase) | Rejected at 905 ms; three attempts share one deadline |
| Stalled service-account OAuth refresh | Rejected at 903 ms; two HTTP attempts (key + OAuth), no backoff |
| Stalled upload | Rejected/released at 908 ms; write incomplete, channels=0, peer closure confirmed |
| Stalled TLS handshake | Rejected/released at 914 ms; channels=0, peer closure confirmed |
| Real OAuth 503, user / service | 25 / 19 ms; key + one OAuth call, no SDK retry |
| Local refused connection | 3 ms; no HTTP headers sent, channels=0 |
| Silent DNS / stalled DNS TCP fallback | 211 / 254 ms in focused run; channels=0, TCP peer closure confirmed |
| Invalid certificate / wrong hostname | Rejected with SSL handshake failure; trust and HTTPS identity checks retained |
| Insufficient shared budget / late channel creation | No DNS/network request; late actual channel is closed |

Windows refused full-backlog connections immediately, so that test is labeled
refusal, not a stalled-connect proof. A separate Java 21.0.11+10-LTS probe ran
inside a task-owned **internal** Docker network against an unused address.
It observed a genuine pending-connect timeout, returned/released at **648 ms**,
with one attempt, zero open channels and zero remaining kernel TCP entries.
No host firewall, published port, existing container or dev-local volume changed.
The labeled probe container/network were removed after verification.
Log: `.tools/slice3-owned-connect-linux.log`.

To reproduce the Linux probe after compiling tests, generate a test classpath
using the project-local Maven `dependency:build-classpath` goal with
`-Dmdep.outputFile=.tools/slice3-spike-classpath.txt`, then run:

```powershell
pwsh -NoProfile -File tools/spikes/firebase-owned-connect.ps1
```

The script accepts only jars in the project-local repository and mounts only
class files/jars read-only, drops capabilities, and verifies task labels before
cleanup. The fixture key has no real provider identity or permissions; only
the loopback TLS fixture trusts it. Production trust stores are untouched.

## Acceptance boundary

Focused experiments prove a supported whole-operation transport mechanism,
including the previous DNS gap and real cold credential routing. Clean server
verification, browser checks and independent review are pending. Only after
that boundary passes will #504 production transport/credential wiring, breaker
classification, cache/fail-closed regressions and real provider/JDBC validation
begin. #507 remains behind those production controls, with approved option A
and the 0/1/16-target one-query contract unchanged.
