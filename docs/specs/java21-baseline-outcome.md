# Java 21 baseline outcome

Issue: [#384](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/384).
Branch: `chore/java21-baseline`, based on
`a5f9bcf8cdf7ca3298453e401a40dc871e58a374`.

## Delivered scope

All four reactor modules compile for release 21. Both Maven roots enforce JDK 21
as the minimum, and Mockito 5 is the reactor default without a compatibility
profile. Bootstrap, both build entry points, Windows/Linux setup and CI use the
current target manifest. The old build manifest and JDK download requirement are
removed. The container obtains checksum-verified Maven directly in its pinned
Java 21 build stage rather than using an older-JDK Maven image.

Current setup, runtime and agent instructions describe the Java 21 baseline.
Historical evidence and frozen-revision references remain intact. Compatible
third-party bytecode is allowed. `build.ps1` remains a compatibility entry point
for the same toolchain, including its existing focused selector.

No application Java logic, game mechanics, protocol, native state, replay format
or browser presentation changed. One opt-in V2 integration test was updated to
assert the current schema marker and use current named-team drafts instead of
retired test fixtures, and to compare restored state with the latest accepted
checkpoint. Tooling tests now protect the minimum-JDK contract.

Optional source modernization is deferred to
[#383](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/383), with the
[inventory](java-modernization-inventory.md) recording candidates, risks and
focused validation. The conditional charset review found no calls to
`UtilFile.sortPropertyFile` in current tracked source; all three tracked
`.properties` files contain ASCII bytes and decode as UTF-8. No file semantics
were changed or inferred for untracked external inputs.

## Validation

Commands below ran with Temurin `21.0.11+10-LTS` and Maven 3.9.9 unless noted.
The manifest's default Windows JDK folder lacks executables on this machine;
bootstrap selected the already-retained pinned JDK under
`.tools/browser-only-jdk/jdk-21.0.11+10`. No host JDK installation was changed.
Logs are ignored files under `.tools/`; no credentials or real game data are
included in this report.

| Check | Command / scope | Evidence |
| --- | --- | --- |
| Bootstrap | `tools/bootstrap.ps1 -JavaHome .tools/browser-only-jdk/jdk-21.0.11+10 -Offline` | PASS: Maven checksum verified; saved JDK selection refreshed to Java 21. |
| Tooling, PowerShell 7 | `tools/test-tooling.ps1` | PASS: 17 checks covering offline setup, corrupt archive rejection, paths with spaces, version parsing/rejection, environment restoration and failure propagation. |
| Tooling, Windows PowerShell 5.1 | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-tooling.ps1` | PASS: same 17 checks. `.tools/java21-tooling-ps51.log`. |
| Direct Maven minimum | Maven `validate --offline` with the already-retained older JDK | PASS: `RequireJavaVersion` rejected it before compilation. `.tools/java21-reject-old-jdk.log`. This was a negative check, not an older-JDK build requirement. |
| Focused native/runtime recovery | `tools/target-build.ps1 test -Module ffb-statetest -Test 'BrowserRuntimeSelectionTest,BrowserEngineQueueTest,BrowserJettyContractTest,BrowserV2RouteTest,RecoveryApplicationTest,RecoverySessionTest,RecoveryScenariosTest,RecoveryDiceTest,RecoveryNativeJsonTest,JdbcRecoveryRepositoryTest,LocalSchemaTest,JdbcSavedTeamRepositoryTest'` | PASS: 99 reported, 97 passed, 2 opt-in skips. `.tools/java21-focused-host.log`. Includes 34 serial native full matches and 34 restores. |
| Browser unit | `npm.cmd test --prefix browser-client` | PASS: 433/433. `.tools/java21-browser-unit.log`. |
| Browser builds | `npm.cmd run build --prefix browser-client`; `npm.cmd run build:play --prefix browser-client` | PASS: diagnostic and product builds. `.tools/java21-browser-build.log`, `.tools/java21-browser-play-build.log`. |
| Game service | Pinned Maven/JDK, explicit repository settings, `-f game-service/pom.xml clean verify` | PASS: 29/29 plus shaded packaging. `.tools/java21-service.log`. |
| Container build | `docker build --progress plain -f containers/local/Dockerfile -t ffb-java21-validation:20261030 .` | PASS: 644 reported shared/server tests, 639 passed, 5 opt-in skips; packaged image built. `.tools/java21-docker-build.log`. |
| Packaged diagnostic runtime | Task-owned image, explicit V1 diagnostic configuration, generated tokens, no host server port; existing `BrowserLocalProbe` | PASS: real Java 21 process/WebSocket, two coaches join, native choice resolves and views converge. `.tools/java21-packaged-startup.log`, `.tools/java21-packaged-probe.log`. |
| Project class versions | Read class headers in all five modules and the server JAR copied from the built image | PASS: all project classes have major version 65 (Java 21); packaged JAR contains 3,070 audited project classes. `.tools/java21-class-audit.json`. |
| Script syntax | PowerShell 5.1 parser for all six affected scripts; `bash -n tools/setup-ubuntu.sh` | PASS. Full OS provisioning was not run. |
| Clean reactor | `tools/target-build.ps1 verify -Offline` | PASS: 935 reported, 923 passed, 12 opt-in skips; all modules packaged. `.tools/java21-verify.log`, `.tools/java21-full-summary.json`. |
| Native shard tooling | `tools/validation/test-native-shard.ps1` | PASS: 12 validation checks. |
| Fresh MariaDB schema | `tools/target-build.ps1 test -Module ffb-statetest -Test 'BrowserSchemaMariaDbTest,V2RuntimeIntegrationTest' -Offline` with task-owned loopback database environment | Schema bootstrap PASS (1/1). The first V2 run found the stale restored-state assertion described below; completed-match/replay test already passed. `.tools/java21-v2-jdbc.log`. |
| Final V2/JDBC recovery and replay | `tools/target-build.ps1 test -Module ffb-statetest -Test V2RuntimeIntegrationTest -Offline` with `M6_TEST_JDBC_URL=jdbc:mariadb://127.0.0.1:23339/ffb_browser_only_test` and generated password-file environment | PASS: 2/2, no skips. Synthetic authentication, real JDBC, native decision/default setup restoration, retry without re-execution, terminal-commit reconciliation and completed replay. `.tools/java21-v2-jdbc-final.log`. |
| JDK internals | `jdeps --jdk-internals --multi-release 21 --ignore-missing-deps .tools/java21-validation/FantasyFootballServer.jar` | PASS: no reported JDK-internal API dependency in packaged project classes. Static analysis does not detect every reflective call. |
| Whitespace | `git diff --check` | PASS. |

The complete reactor ran before the final test-only assertion correction; its
default V2 integration methods were skipped without the opt-in database. Both
methods subsequently passed with the final fixture/assertion against real MariaDB.
Application source, packaging and build configuration did not change afterward.

The 12 default skips were the five server opt-in methods in
`BrowserSchemaMariaDbTest`, `Marker6SchemaTest`,
`SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest` and
`V2PreparationJdbcTest`; two `RecoveryApplicationTest` JDBC pressure/retention
methods; `RecoveryArtifactInspectionTest`; the two historical R5 fixture methods;
and both `V2RuntimeIntegrationTest` methods. Fresh schema bootstrap and both V2
methods were enabled separately as recorded above. The other nine opt-ins remain
unverified in this task; no historical fixture or retained game was imported.

## Review and operational boundaries

The initial sandboxed focused run failed because ClassGraph could not resolve
the module directory (`AccessDeniedException`). The same selectors passed
outside the sandbox. Full Maven validation used that established permission
context. Tests, rules and application behavior were not changed to mask it.

The first V2/JDBC run compared restored revision 1 with the initial revision 0.
The assertion now compares the latest accepted state with the reconstructed
spectator view. The final rerun passed both integration methods. The earlier
schema/draft fixture corrections make the existing tests usable with current
schema 9 and named-team documents; no production validation was relaxed.

No pre-existing containers were running at the initial local Docker inspection;
the only existing Java process observed was the editor language service. Task-owned
containers used generated credentials and synthetic fixtures, with the database on
loopback port 23339 and temporary storage. Both test containers and their generated
secret/config files were removed afterward. Existing databases, volumes, credentials
and service configurations were not modified. The task image and nonsecret test
evidence remain available locally.

Retirement of source build paths does not convert pre-R2 in-memory matches into
recoverable artifacts. Current recovery must accept a recorded compatibility tuple;
missing, corrupt and unsupported checkpoints retain their existing failure behavior.
Historical artifacts remain preserved. No hosted process inventory, live shutdown,
deployment or cutover was performed. Packaged authenticated V2 process/restart
acceptance against Firebase remains distinct from the credential-free adapter/JDBC
checks; this task does not create or change external identities.

Physical Android checks, Linux setup installation and unvalidated newer JDKs are
not claimed by these results. No visual or timing assertions needed adjustment.
After local review, the owner accepted the feature on 2026-10-30 and authorized
committing, PR publication, CI-gated merge and local/remote branch cleanup.
Issue #384 and its closing PR record publication and CI state.

## Subsequent dev-local review startup, 2026-10-30

At the owner's request, stopped the managed review services and confirmed no other
review servers were running, then ran `node tools/dev-local.mjs --start` with
current working files. The initial four-worker browser preflight hit 5-second
page-load timeouts. Its task-owned process tree was stopped and the complete gate
was rerun with `FFB_BROWSER_TEST_WORKERS=2`, without changing application code or
test timeouts. All registered interaction and hosted suites passed in 993.7 seconds;
fresh reports are in `.tools/validation/local-browser-0Qywdn`.

The launcher rebuilt the Java 21 image, started the preserved review database and
server, verified Firebase ADC, and started nginx, Hosting and the computer player.
`http://localhost:5000/play` returned HTTP 200. The real V2 proxy check passed during
startup and again afterward, receiving `AUTHENTICATION_REQUIRED` on initial
connection and reconnect without submitting credentials. Both Docker services were
healthy, the computer service reported ready, and no immediate out-of-memory marker
was found. This verifies packaged V2 startup and transport, not an authenticated
match/restart scenario. Existing match data and volumes were retained.

Startup log: `.tools/java21-dev-local-start-two-workers.log`.
