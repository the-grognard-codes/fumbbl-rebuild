# DEV nginx-to-JVM handoff

**2026-09-21:** DEV backend installed: nginx on 443, native marker-6 Java on
127.0.0.1:22231, MariaDB on 127.0.0.1:3306. Two legacy DEV identity links were
preserved with unchanged internal account IDs. The paired DEV Hosting artifact
was published after explicit owner confirmation. Served-artifact parity and
real-browser WSS/reconnect checks passed; signed-in gameplay acceptance remains
pending. PROD remains unchanged.
See [exact installation results and remaining gates](../../../.notes/overhaul-analysis/verification/r3-d/dev-install-20260921.md).
The candidate descriptions/checklist below record the original preparation;
the linked report supersedes their historical "not installed" status for DEV.

For the running **local-dev** browser path, see [local nginx setup](LOCAL.md).
It uses a separate loopback-only diagnostic configuration; the DEV TLS candidate
below is not what the local play session runs.

Owner-approved direction; original locally prepared candidate described below.
This replaces neither the retained H2 service nor its data. Do not run the older
`install-host.sh` to install this configuration: it installs `/session/v1`, owns
port 443, and restarts Java on certificate renewal.

## Boundary

The intended hosted path is:

`browser --WSS:443--> nginx --WS on 127.0.0.1:22231--> marker-6 Java /browser/v2`

The existing VM IP and `game-dev.molesunderthepitch.org` DNS can remain unchanged.
Firebase Hosting at `dev.molesunderthepitch.org` remains separate. If the existing
game certificate covers `game-dev.molesunderthepitch.org`, nginx can use its
existing full chain and private key; no WebSocket-specific certificate is needed.
Do not copy Firebase Hosting's certificate or commit private keys.

The standalone `dev.nginx.conf` is deliberately bound to **127.0.0.1:24443**.
It is a locally testable candidate, not an activation script. It requires an nginx
prefix with `tls/fullchain.pem`, `tls/privkey.pem`, `logs/` and `temp/`. For an
authorized host rollout, review changing the listener to port 443 and the PEM
paths to the existing managed game certificate paths. Keep the backend private.
There is no plaintext listener or HTTP redirect in this candidate; ACME renewal
is a separate operational concern below.

Java's opt-in handoff is:

```properties
server.local=true
local.browser.v2.enabled=true
local.browser.v2.proxy.profile=dev
server.base=http://127.0.0.1:22231
server.port=22231
local.transport.container.forwarding=false
local.browser.v2.firebase.project=dev-moles-under-the-pitch-org
```

These are transport settings only. The new `NativeMarker6ServerMain` uses the
complete, exact [native DEV contract](../../../ffb-server/src/main/resources/local-schema/native-dev.properties).
The existing Docker launcher and its JDBC guard remain separate and unchanged in
scope. Do not point either launcher at the old service's H2 files.

The proxy profile rejects unknown/PROD selections and Docker wildcard forwarding.
Without the opt-in, the existing local browser behavior remains unchanged.
nginx preserves the approved Origin and sets the fixed public Host; Java checks
both again. Neither layer trusts incoming forwarded headers. Local processes are
inside the backend trust boundary; this is not authentication between OS users.
No JWT, role, or membership decision moves out of Java.

Only `/browser/v2` is forwarded. Raw path variants and all queries, even an empty
`?`, are rejected before upstream contact. Other routes return 404. Wrong Host
or Origin returns 403 (malformed HTTP may return 400); absent/foreign SNI fails
TLS. TLS 1.2/1.3 are permitted. Authorization/Cookie headers are rejected rather
than becoming alternative credential carriers. The existing JSON authentication
frame remains unchanged. Proxy retries are off; there is one upstream and one
engine mutation worker. No load balancing or match migration is introduced.

Access logs contain only status, byte count and elapsed time. Request-related
error logging is disabled because nginx errors can include raw request URLs.
Do not enable debug logs or full HTTP traces. This trades diagnostic detail for
credential safety; alert on status aggregates, process health and testable checks.

## Capacity and disconnect behavior

Do not resize the `e2-small` solely because nginx is added. Measure available RAM,
swap/OOM events, JVM heap/GC, CPU under TLS handshakes, file descriptors, active
sockets, and move latency first. This is a recommendation to measure, not a
claim that the current VM has enough capacity for a particular player count.
One worker and 512 worker connections bound the candidate; each proxied socket
uses both a client and upstream connection, so 512 does not mean 512 players.
Java's existing connection/queue limits still apply.

Proxy buffering is disabled. The 360-second upstream read timeout is above
Java's existing five-minute idle timeout; no new heartbeat or abandonment policy
is introduced. Reconnect still reauthenticates and reloads server-authoritative
state. Test long idle sessions and reconnect through the Linux proxy before
activation. Graceful reloads can retain old workers for live sockets; account for
temporary worker overlap when measuring memory.

## Cutover and renewal checklist (not executed)

1. Inspect the actual VM service, certificate hostname/renewal config, listeners,
   firewall, resource headroom and storage. Preserve all retained artifacts.
2. Complete the native marker-6 runtime/storage handoff and demonstrate recovery
   parity. Drain active matches or retain their compatible runtime. Never replace
   an active engine in place or interpret a restart as match abandonment.
3. Validate nginx's final configuration with `nginx -t`, including on the target
   Linux package. Verify Java listens only on 127.0.0.1 and its port is not
   reachable through public or internal-interface ingress. Do not trust firewall
   rules as a substitute for the loopback bind.
4. During the authorized cutover, release Java's old 443 listener, start the
   correctly configured native v2 backend on loopback, and assign 443 to nginx.
   Reuse the existing static IP; no frontend-site DNS switch is implied.
5. Replace the old Java-restarting certificate deploy hook with a validated
   nginx configuration check and **nginx reload**, not JVM restart. Review the
   existing Certbot authenticator: standalone HTTP-01 needs port 80 available;
   if nginx later occupies 80, choose and test an appropriate renewal method
   rather than stopping the game listener. Do not rotate keys unnecessarily.
6. Verify TLS, exact origins/routes, rejected cross-project credentials, public
   inability to contact the backend, real Firebase create/join/watch, reconnect,
   renewal reload and long-lived sockets. Only then enable the DEV browser WSS
   endpoint in the versioned build profile. PROD remains separately gated.
7. If acceptance fails, keep new admission disabled. Restore the previous
   listener/config only after handling any matches created on the new runtime;
   do not roll back storage or downgrade an active match to the old service.

## Native DEV runtime and storage contract

The new launcher is `com.fumbbl.ffb.server.local.NativeMarker6ServerMain`.
Its properties file must match the packaged native DEV contract exactly: no
missing/extra properties, JDBC parameters, alternate secrets, debug or legacy
flags are accepted. The [systemd candidate](moles-game-v2-dev.service) is not
enabled or installed by any script. It uses a distinct OS account and no bind
capabilities. Automatic restart is deliberately off until recovery/cutover
acceptance; an operator must investigate a startup failure.

| Resource | Fixed native DEV destination |
| --- | --- |
| MariaDB | `jdbc:mariadb://127.0.0.1:3306/ffb_m6_dev` |
| Database account | `ffb_m6_runtime` (already provisioned and appropriately scoped) |
| Java listener | `127.0.0.1:22231` |
| Runtime/config | `/opt/moles-game-v2-dev`, `/etc/moles-game-v2-dev/server.properties` |
| Password files | `/etc/moles-game-v2-dev/secrets/` |
| Retained backup/state | `/var/lib/moles-game-v2-dev/backup` |
| Logs | `/var/log/moles-game-v2-dev` |

These are reviewed candidate namespace choices, not claims that those resources
exist on the VM. No database, user or credentials were created. The target must
already contain a separately provisioned/copied marker-6 schema. Startup runs
the existing read-only marker-6 verification; it never initializes/migrates an
empty or older database. Admin/coach secret fields support the retained bootstrap
only; they do not grant application roles or expose legacy routes.

State, backup and log directories must already exist and resolve to their exact
paths, not symlink aliases into retained data. The state directory must be owned
by the dedicated runtime user, not shared/writable by other users. A non-truncating
`runtime.lock` excludes another native process using that directory. It remains
held through shutdown hooks and is released by process exit, not before engine
shutdown. This is a single-host guard, not distributed database fencing.

Do not copy a live native database into this namespace without a separate
validated, target-only handoff. The existing container copy tool does not yet
provision a native host database. That database handoff, approved account/grants,
real Firebase verification, recovery parity and VM activation remain release
gates. The template does not select or change ADC/service-account credentials.

## Integrated Linux transport check

After compiling the focused Java tests, build a separate local validation image
from the repository root (substitute the local Docker executable if necessary):

```powershell
docker build --file deployment/game-service/proxy/Dockerfile.test --build-context serverclasses=./ffb-server/target/classes --build-context testclasses=./ffb-server/target/test-classes --build-context commonclasses=./ffb-common/target/classes --tag ffb-r3d-proxy-test:20260919 deployment/game-service/proxy
powershell -ExecutionPolicy Bypass -File deployment/game-service/proxy/test-linux.ps1
```

Rebuild after Java changes; the image contains the compiled classes, avoiding
Windows bind-mount scanning overhead. The harness runs unprivileged, read-only,
with all capabilities dropped, networking disabled and no published ports. It
mounts only the test scripts read-only and a fresh writable synthetic evidence
directory. It mounts no database, backup, ADC or secret files. Exited test
containers and `.tools/r3d-native-*` evidence are retained, never overwritten.

The integrated test exercises real Linux nginx TLS, Jetty, BrowserV2Adapter and
the single communication worker. It checks denied unauthenticated reads, rejected
authentication, valid authentication, browse, non-member setup denial, a same-
socket request after graceful nginx reload, and reauthentication on reconnect.
Identity and membership are test doubles. It is not full Firebase/MariaDB/engine
play acceptance and not a VM capacity measurement. Reload uses the same fixture
certificate, not a live Certbot renewal.

## Reproducible local check

Run from the repository root with Node and existing nginx/OpenSSL executables:

```powershell
$env:NGINX_TEST_BINARY=(Resolve-Path .tools/nginx-1.30.5/nginx.exe).Path
$env:OPENSSL_TEST_BINARY='C:/Program Files/Git/usr/bin/openssl.exe'
node --test deployment/game-service/proxy/test.mjs
```

The test generates a disposable one-day self-signed identity for the game
hostname and explicitly trusts only that fixture certificate. It uses ephemeral
loopback ports, runs `nginx -t`, starts no OS service, and terminates only its
own nginx child. Fixtures are retained under `.tools/r3d-proxy-*`; they are not
real service credentials. Linux can run the same test with executable paths
set accordingly. The HTTP backend is a protocol double, not an engine or DB.

Reference: nginx's [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
documents explicit Upgrade/Connection forwarding and upstream inactivity handling.

## Authorized hosted installations

DEV and PROD installation evidence is retained under
`.notes/overhaul-analysis/verification/r3-d/`. See `prod-install-20260921.md`
for the final PROD artifact, checks and remaining manual acceptance.
`prepare-prod-rollout.mjs` renders the reviewed DEV procedures with exact PROD
bindings into a fresh retained directory; `--verify` checks those generated files.
`assemble-prod-client.mjs` preserves the DEV-accepted UI release while selecting
PROD Firebase, WSS and CSP settings. Neither script deploys anything itself.

Build release artifacts in an isolated source snapshot: the shared workspace
contained Java 8-targeted server class files despite the Maven Java 21 release
setting. `compare-runtime-classes.ps1` rejects inventory changes and unexpected
class differences against the accepted DEV artifact. The final isolated PROD
build differs only in the explicit transport/launcher allowlist. Do not reuse
the initially staged, superseded package.

Installation and `correct-empty-prod-package.sh` are one-shot, dated procedures,
not upgrade/reset tools. The latter refuses any accounts, prepared games,
recovery artifacts or connected clients, closes admission and checks again.
Never rerun provisioning on existing storage or replace an active-match runtime.
