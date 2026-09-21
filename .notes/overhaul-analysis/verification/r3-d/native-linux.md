# Native DEV configuration and integrated Linux transport

2026-09-19 follow-up, requested after the nginx handoff candidate. This is
configuration and local validation, not a VM rollout or full R3-D closeout.

## Implemented

- `NativeMarker6ServerMain`: separate DEV-only entry point; every property must
  match the packaged `native-dev.properties` contract. No arbitrary endpoints,
  secret paths, debug/migration flags, PROD selection or extra properties.
- New native namespace: loopback MariaDB `ffb_m6_dev`, account
  `ffb_m6_runtime`, and distinct `/opt`, `/etc`, `/var/lib` and `/var/log`
  `moles-game-v2-dev` directories. These resources were **not provisioned**.
- Existing marker-6 read-only schema verification runs before serving. State,
  backup and log directories must already exist without symlink redirection.
  A non-truncating file lock holds single-host storage ownership until process
  exit, including through shutdown hooks. Partial runtime startup now registers
  its resource-drain hook before `server.run`.
- Inactive systemd candidate: distinct user, unprivileged loopback JVM, restricted
  write paths, no automatic restart. No systemd unit was installed/enabled.
- Real Linux TLS-to-Jetty integration fixture using the real v2 adapter and
  communication worker, synthetic principal verification and empty membership.
  Test doubles exist only under `src/test`, not in the runtime artifact.

No rules/catalog/replay/recovery schema or concurrency changes. The prior dirty
worktree was preserved. No credential, grant, volume, retained database or active
match was changed. No cloud calls, deployment, DNS/firewall edits or VM restart.

## Commands and results

From the repository root, with the local Docker CLI on PATH (this workstation
used `C:/Users/jaken/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`):

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Test NativeMarker6ServerMainTest,LocalServerMainTest,BrowserV2RouteTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Test NativeMarker6ServerMainTest,LocalServerMainTest,Marker6SchemaTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Offline
docker build --file deployment/game-service/proxy/Dockerfile.test --build-context serverclasses=./ffb-server/target/classes --build-context testclasses=./ffb-server/target/test-classes --build-context commonclasses=./ffb-common/target/classes --tag ffb-r3d-proxy-test:20260919 deployment/game-service/proxy
powershell -ExecutionPolicy Bypass -File deployment/game-service/proxy/test-linux.ps1
git diff --check
```

- Initial focused Java: 10 passed. Final native/schema selector: 8 passed,
  one opt-in database test skipped. Native tests vary/remove every profile field,
  reject legacy/H2/PROD/retained targets, and verify exclusive lock acquisition,
  reacquisition after release and preservation of an existing sentinel file.
- Final full Java regression: common 174 passed; server 222 discovered,
  220 passed, two skipped; zero failures/errors. Skips: Marker6SchemaTest's actual
  MariaDB check and V2PreparationJdbcTest; no isolated database configuration was
  supplied. This is not evidence of native database provisioning or recovery.
- Linux: two integration tests passed, zero skips. TLS boundary retained three
  accepted upgrades and 22 denied cases. Real nginx/Jetty/v2-worker path passed
  nine protocol assertions: denied unauthenticated browse, rejected synthetic
  credential, accepted synthetic credential, scoped browse, same-socket browse
  after nginx reload, non-member setup rejection, and three reconnect assertions
  proving reauthentication is required before browsing again.
- Linux also executed the actual native entry point with its valid profile but
  absent provisioned directories. It exited 1 with only the generic startup
  denial and did not create the state directory.
- Whitespace check passed. Browser UI did not change; no new browser acceptance
  is claimed and its prior passing tests were not rerun.

Java/Maven: Temurin 21.0.11+10, Maven 3.9.9, target profile/offline cache, Windows
11 host. Linux fixture: Debian trixie, nginx 1.30.5, Temurin 21.0.11+10, Node
20.19.2, OpenSSL 3.5.7. Node is used for the standalone transport harness, not
the site's Node-24 build gate. Docker server 29.7.2.

nginx base digest:
`sha256:0aa2d81d65bc0cac0407e738b8f07d312c8685a84225fcb4db7bcbdd8c9bdf11`.
Existing runtime dependency base `ffb-server:3.4.0-m6.1` resolved to
`sha256:b5746a43786051dd0a1989a4228bf8ddeca0a2ee358082683d9f2381cc3fcb6f`.
Final test image:
`sha256:cb79d8234a5b5c399fd8d7bc0826d9cd352faab78c724bc0980518918e054b9a`.
Node/OpenSSL packages were installed only inside the test image, not on the VM
or host. Test image packages are version-recorded, not a production dependency
lock or a capacity recommendation.

## Retained evidence and isolation

Final exited test container: `r3d-native-ef8334653f5d4e13916b66629e744493`.
Final create-only evidence directory:
`.tools/r3d-native-ef8334653f5d4e13916b66629e744493/`.
It contains `test-output.txt`, `.tools/r3d-integrated-2VQM8A/result.json`, generated
one-day fixture certificate/key/config, and status-only nginx logs. Earlier
failed/successful fixture directories and exited containers remain retained.

Inspected final container settings: `network=none`, `ports={}`, `user=101:101`,
`readonly=true`, `exit=0`; all capabilities dropped, no-new-privileges, 128 PID
and 768 MiB limits. Only test scripts and a fresh synthetic evidence directory
were mounted. No retained data, ADC or credentials were mounted.

The first Linux attempt found an nginx temporary-directory ownership failure
under capability dropping and a Java readiness timeout scanning Windows-mounted
classes. The final harness runs unprivileged with compiled classes in the Linux
image; integration completes in about three seconds. A Windows lock test initially
tried reading a mandatorily locked file; it was corrected to check preservation
after releasing the lock. These failures did not affect retained services.

Final read-only inspection showed the retained game container still running
(started `2026-09-19T20:07:06Z`), marker-6 database running (started
`2026-09-18T06:40:09Z`), and R2 reference database running (started
`2026-09-18T06:40:08Z`). No restart operation was issued against them.

## Remaining gates

Native database target-only provisioning/copy and approved grants, real Firebase
and MariaDB-backed create/join/watch/play, recovery parity, long idle behavior,
VM capacity, external isolation and authorized cutover remain outstanding.
The local file lock is not distributed database fencing. The systemd unit has
not been verified against the actual VM's users, filesystem or service manager.
The reload test uses the same synthetic certificate and is not live Certbot
renewal acceptance. Existing container-only copy tooling was not broadened to
write an arbitrary native database. PROD remains unavailable. No public-service
readiness or full R3-D completion is claimed.
