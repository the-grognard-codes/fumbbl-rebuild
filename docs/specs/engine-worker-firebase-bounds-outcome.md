# #504 production outcome

Tracking: [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504).
Branch: `fix/firebase-bounds-publication-authorization`, from main `031495c72`.
Status: provider implementation, integration, clean verification and dev-local startup passed.
The following #507 deliverable remains separate and is not claimed here.

## Feasibility and implementation

The [continued spike](engine-worker-firebase-bounds-spike-2.md) passed before
production implementation. It supersedes the initial resolver candidate's failed
gate, using public pinned SDK/Jetty APIs and owned, cancellable DNS/TCP channels.
The accepted spike was independently reviewed and clean-build/browser validated
at commits `cf140f5dc` and `294d56257` before promotion.

`FirebaseProviderTransport` now supplies both Firebase Admin HTTP and the
credential `HttpTransportFactory`. A single operation owns cold certificate
retrieval, OAuth/metadata refresh, revocation lookup, and destination/channel
cleanup. DNS uses bounded UDP/TCP exchanges with dnsjava as the codec; worker
traffic never invokes the JVM resolver. Original TLS names, certificate trust
and hostname verification remain enforced. Redirects and reconnect attempts
are refused; terminal error statuses cannot reach SDK retry/backoff handlers.
Service-account credential I/O retries are explicitly disabled through the
supported public API. HTTP content encoding is preserved.

Exact supported ADC classes are `UserCredentials`, `ServiceAccountCredentials`
and `ComputeEngineCredentials`. Cached ADC is rebound through its public builder.
The worker wrapper preserves quota-project headers, source scoping and one OAuth
token cache; an observed 401 marks the next operation for refresh without an
in-operation retry. External-account, impersonated, downscoped and other credential
paths are rejected during startup instead of retaining an unbounded transport.
ADC and DNS configuration discovery are prohibited on a request worker.

## Effective settings and security semantics

| Setting | Default / accepted range |
| --- | --- |
| `ffb.firebase.operationMillis` | 1,200 ms; 200–1,850 ms |
| I/O / cleanup reserve | allocation minus 100 ms / 100 ms |
| `ffb.firebase.dnsMillis` | 200 ms; positive, within I/O allocation |
| `ffb.firebase.connectMillis` | 250 ms; positive, within I/O allocation |
| `ffb.firebase.breakerFailures` | 3 consecutive availability failures; 1–128 |
| `ffb.firebase.breakerCooldownMillis` | 5,000 ms; 1–60,000 ms |
| `ffb.firebase.dnsServer` | startup-discovered resolver; optional literal IP, port 53 |
| HTTP / body bounds | at most 8 calls and 256 KiB per body |

Admission requires the whole allocation plus 150 ms of remaining shared request
budget. The originating 2,000 ms absolute deadline is never reset, and subsequent
JDBC calls clamp themselves to it. The measured real fresh-JVM cold path exceeded
the initial 900 ms I/O allocation. A 1,200 ms operation passed with the same
mechanism, including a production-default stalled return at 1,114 ms. The
1,000 ms spike remains a separate, stricter reference fixture.

The dependency-wide breaker counts DNS/refusal/transport/deadline failures,
408/429/5xx and SDK unavailable/deadline/resource-exhausted classifications.
Typed transport classification takes precedence over SDK IOException wrapping.
Invalid, expired, disabled, revoked or missing identities and local denials do
not count as outages. A validated provider success resets availability state
before local SQL, while an ordinary denied identity does not heal it. Exactly
one monotonic recovery probe is admitted; an availability-failed probe renews
cooldown. A denied or unstarted probe only releases its slot, leaving the breaker
open and the original cooldown elapsed so the next identity may probe immediately.
An ordinary denial still neither clears the failure streak nor caches authority.

### Operator policy and retained verification fixtures

Provider HTTPS is restricted to `www.googleapis.com`,
`identitytoolkit.googleapis.com`, `oauth2.googleapis.com` and `accounts.google.com`
on standard HTTPS ports. HTTP is permitted only to the supported compute metadata
hosts/addresses on port 80. URI length is limited to 4,096 characters; user-info,
fragments and redirects are rejected. Outbound headers are limited to 64 names,
256 characters per name and 8,192 per value; each body is limited to 256 KiB.
Requests preserve SDK content encoding. Responses must be unencoded or `identity`;
unexpected response compression is refused rather than decompressed unboundedly.
Unexpected endpoints/encodings fail closed as policy failures through existing
authentication responses. They never silently broaden the host list or fall back
to another transport. SDK/credential upgrades that require new endpoints need a
reviewed policy update and rerun of the pinned transport/credential evidence.

The DNS/transport candidate adapters, loopback TLS tests, `.p12` test fixtures and
Linux physical-connect probe are intentionally retained as regression evidence.
They exercise the promoted production mechanism, including physical cancellation
and SDK retry suppression. Test trust material is confined to loopback test
clients; production constructs its normal trusted TLS context. Maven test sources
and test resources do not become runtime classes/resources in the server JAR.

Initial authentication still uses `verifyIdToken(bearer, true)`. Five-second
positive reuse stays fixed from lookup start, with token expiry and current
local lifecycle/scopes checked on every incoming operation. Failed checks forget
affected sessions. On failed initial authentication, only a locally verified
signature/claims result can identify entries to forget; no active transport
scope exists for that best-effort local verification. No raw bearer or provider
response body is cached or logged. Diagnostics expose bounded classes, numeric
status/count/timing, and existing fixed error codes. Runtime destruction closes
the owned client and app. No request protocol or durable ordering changed.

## Evidence and review

- Focused boundary: 63 tests passed with no failures/errors/skips, including
  actual DEV Firebase and MariaDB 11.8.9, in
  `.tools/slice3-provider-real-jdbc-final.log` (one subsequent startup-only
  admission regression is included in full validation).
- Actual provider/JDBC: fresh-JVM cold authentication plus account creation
  1,027 ms; fresh lifecycle plus local authorization 155 ms; actual provider then
  late InnoDB lock rejection 1,869 ms with JDBC clamped to 699 ms. A combined
  warmed-JVM run measured 584 / 208 / 1,852 ms respectively. These are actual
  provider calls and database controls, not a bounded provider double.
- Host ADC initially lacked a quota project and produced `SERVICE_DISABLED` /
  403. A direct read-only comparison returned 200 with the DEV quota header.
  Validation then used the exact existing ADC file mounted by dev-local; no
  credentials, permissions or APIs were changed.
- Synthetic real-SDK DNS/TLS/OAuth tests cover user/service/compute factories,
  cold sequential calls, 503, refusal, stalls, upload, trust/hostname failures,
  actual cancellation and late channel creation. The Linux pending-connect
  probe was rerun against the promoted mechanism: 930 ms including request setup
  and cleanup, zero open channels and zero pending kernel sockets, one attempt.
  Its isolated internal network/container were removed after ownership checks.
- A real `ServerCommunication` / `BrowserMatchTransport` test stalls OAuth,
  then executes queued expiry, disconnect and another request, verifies both
  connection and ingress permits are released, and counts no additional I/O
  after breaker opening. The 128-identity burst test proves only three provider
  failures, one cooldown probe, failed-probe reopening and successful recovery.
- Independent standards/security review approved. Spec review requested breaker
  recovery before local SQL and real queue/permit evidence; both were fixed and
  protected with regressions. The independent spec follow-up approved both fixes
  and the measured 1,200 ms allocation, with no remaining actionable findings.

Fresh remote lifecycle checks of 155–208 ms do not establish the 100 ms healthy
p99 target. They retain a fresh TLS connection and internet round trip; ordinary
requests reuse an eligible five-second positive result. Final integrated timing
must report provider misses separately from cache hits and passive publication.

## Full validation and startup

Clean `tools/target-build.ps1 verify` passed in 15:39: 19 common, 760 server and
292 native tests (1,071 total), zero failures/errors, 19 expected opt-in skips
(including this deliverable's separately executed real-provider test).
Evidence: `.tools/slice3-provider-verify.log`. Browser unit tests passed 530/530
and the TypeScript/Vite production build passed in
`.tools/slice3-provider-browser-{unit,build}.log`.
The first dev-local browser run exposed a parallel-load layout assertion
in unchanged `idle-panning-ui.mjs` (15 reads instead of zero). Its isolated rerun
passed with zero irrelevant layout reads. All interaction groups passed in the
complete serial rerun. All 82 interaction/hosted suites passed in 1,138.7 seconds;
reports are in `.tools/validation/local-browser-Kdz8FH`. The manifest records the
starting spike commit `294d56257`; the unchanged browser code was tested while
the production Java changes were in the working tree. No frontend behavior was
changed for this result.

`node tools/dev-local.mjs --start` then completed its full container build/tests,
schema/ADC health checks, Hosting/proxy startup, real authentication-gate checks
on initial connection and reconnect, and computer-service startup. The c72a1b5f4
provider image was healthy at `http://localhost:5000/play` with no unexplained
startup errors. Evidence: `.tools/slice3-provider-dev-local-r2.log`.

The real three-party UI smoke authenticated synthetic DEV identities, created
server-validated Human/Orc teams, played native decisions, delivered durable
escaped chat to both coaches/spectator, and exercised reconnect/save/resume.
It exposed stale harness expectations for roster-validation text and actor-only
formation controls, then a genuine inherited spectator-broadcast projection bug:
actor-only saved formation controls reached a spectator. Strict projection
validation correctly failed. That correction belongs to #507's recipient-privacy
requirement; the final rebuilt three-party smoke is recorded in the #507 outcome.
The failed intermediate evidence remains in `.tools/slice3-provider-ui-smoke-r3`.
