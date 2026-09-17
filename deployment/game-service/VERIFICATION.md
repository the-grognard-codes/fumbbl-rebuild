# Verification record

The affected checks for this feature are:

| Check | Coverage | Local result |
| --- | --- | --- |
| `mvn -f game-service/pom.xml clean verify` on Java 21 | Signed Firebase JWTs, revoked/disabled users, durable account records, bounded session history and queues, real local TLS WebSocket integration | 17 tests passed; shaded JAR built |
| `npm test --prefix site` | Fresh-token authentication, expiry/re-authentication, duplicate policy, reconnect after stale presence | 4 tests passed |
| `npm run test:browser --prefix site` | Headless Chrome with mocked Firebase and WebSocket modules, two isolated contexts, UI states, Google/email completion and sign-out | 3 tests passed |
| `npm run check --prefix site` | Required page assets and supported auth providers | Passed |
| `npm run verify-environment --prefix deployment/firebase` | Fixed DEV/PROD project, WSS and CSP separation | Passed |
| Assembly and `verify-hosting-artifact` for DEV and PROD | Hosted `/play`, matching public configuration, generated Hosting policy | Passed with placeholder public Firebase configuration |
| `bash -n` on provisioning, activation, host-install, shutdown-schedule, start, and stop scripts | Bash syntax | Passed with Git Bash on 2026-09-17 |

The JWT tests generate temporary RSA keys and certificates and exercise the
Firebase Admin SDK itself. Google certificate and account responses are mocked;
the tests do not use real Firebase users. The TLS integration tests use a real
Java TLS listener and Java WebSocket clients, with a test identity verifier.
Together these cover protocol integration and cryptographic rejection separately.

The legacy Maven reactor and diagnostic browser engine were not changed except
for the required changelog entry and were not rerun. CI adds the standalone
service verification and browser auth checks to its existing suite.

Not executed: cloud provisioning, DNS changes, certificate issuance/renewal,
deployed WSS smoke tests, real Google sign-in, or real same/cross-device email
completion. The owner chose provisioning scripts to run. Complete the live
acceptance steps in [README.md](README.md) after deploying the two environments.

PROD preflight was read-only checked on 2026-09-16: billing, Compute Engine,
Firebase Auth, IAM, the default VPC, owner access, quotas, and an empty Compute
inventory were present. The targeted ingress-deny rule created by
`provision.sh prod` protects `moles-game` from the default network's broad SSH
allow. No production resource was created by this check.
