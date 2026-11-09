# Slice 1 outcome: local rookie names and endpoint removal

Date: 2026-11-09. Branch: `fix/local-riotous-rookies-endpoints`.
Base: current `origin/main` at `9b0d2a9ff` (including documentation commit
`ce6ed2ba4`, satisfying RB2). The initial working tree was clean; no isolated
worktree was needed.

Scoped implementation commits: `f2f27e798` (local names, native/recovery tests and
CI registration), followed by `9a4890b47` (endpoint/tool/dependency removal and
changelog). A separate documentation commit records this outcome and ADR status.

Tracking: [rookie issue #514](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/514)
was created and assigned to `the-grognard-codes` before implementation;
[endpoint issue #513](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/513)
was reused and assigned. The handoff explicitly authorizes both on this branch,
with the rookie change first, independently of slice 2.

## Changes and acceptance review

- `StepRiotousRookies` assigns `"RiotousRookie #" + index` directly. Removed its
  `rookieName`/`unquote` methods and unused imports. The existing zero-based
  indices continue across repeated inducement applications and restart for each
  team. Selection of the first applicable inducement type remains unchanged.
- Preserved the native d3/d3 count rolls and subsequent d4 gender rolls, player
  IDs and jersey allocation, position/stats/skills, journeyman status, reserve
  placement, add-player commands, reports and next-step progression. No worker,
  checkpoint, transcript, dice implementation or storage schema was changed.
- Deleted `ServerUrlProperty` and its test, `FUMBBL_BASE`/`FUMBBL_PORT`,
  `UtilServerHttpClient`, `CollectRosters` and both `UtilUrl` classes after caller
  checks. Also removed the collector-only `DivisionContentHandler`,
  `UtilHttpClient` and tools `StringTool`, the unused server `httpmime` dependency,
  and the tools' unused HTTP/codec/logging dependencies. No reader or caller
  remains. No tracked configuration template set the deleted properties.
- Updated Unreleased in `CHANGELOG.md`, the request mirror and ADR 0006's
  dependency inventory/gap/order entries. Historical reviews are preserved.
- Self-review found no mechanics, protocol, persistence-order or unrelated
  product changes. Expanded the recovery regression to exercise creation inside
  an accepted action, compare complete checkpoints on restore and exact retry,
  and preserve a previously stored non-placeholder name. Initial test compilation
  exposed incorrect fixture getter names; corrected them to the native model API.
  Registered the new regression in native CI shard 2 during review so it runs in
  both the full local verify and sharded CI.

## Keystore decision

Deleted the unused `ffb-common/keystore.jks` after PR review. Read-only
`keytool -list -v` without a password during the original investigation
shows one legacy private-key entry (`kalimar`) whose self-signed certificate has
`CN=Kalimar, O=fumbbl.com`, valid January–July 2014. This is certificate identity
metadata, not a URL, hostname connection target or service configuration.
Inspection did not verify keystore integrity or access private-key material.
Tracked-source/configuration/build searches found no use or packaging reference.
The separate game-service TLS configuration uses an operator-supplied PKCS12
file and does not reference this artifact. The original distinction between
certificate metadata and endpoints remains correct; deleting unused key material
is a separate cleanup decision. Keeping it offers no runtime or compatibility
benefit. Deletion does not remove its historical copies from Git history.

## Initial implementation validation

Environment: Windows 11, Node `v26.8.1`, pinned Temurin `21.0.11+10-LTS` and Maven
`3.9.9`. Logs are retained locally under `.tools/rookie-local-validation/`.

| Check | Exact result |
| --- | --- |
| Focused `RiotousRookiesTest` | 4 tests, zero failures/errors/skips |
| Focused native/recovery selector below | 63 tests, zero failures/errors, 2 opt-in database skips; BUILD SUCCESS |
| `npm.cmd test` in `browser-client` | 530 passed, zero failed/cancelled/skipped |
| `npm.cmd run build` in `browser-client` | TypeScript and Vite production build passed |
| `node --test tools/test/validation.test.mjs` | 15 passed, zero failures/skips |
| `tools/target-build.ps1 verify` | BUILD SUCCESS in 18:29; 1,006 reported tests, 990 passed, 16 existing opt-in skips, zero failures/errors |
| Native shard 2 manifest/report validation | Passed: 10 suites, including `RiotousRookiesTest` |
| `node tools/validation/bb2025-source.mjs` | Passed: 3,544 active text files |
| Documented dev-local browser preflight | Passed fresh with 2 workers in 874.5 seconds: 82 suites (70 interaction, 12 hosted), 108 reported test entries, zero failures/skips |
| Documented dev-local startup | Passed: database/game service healthy, Hosting HTTP 200, Firebase ADC OK, real proxy auth/reconnect test passed, computer player ready |
| Native-fixture live/replay browser smoke | Passed: 18 native rookies (10 home, 8 away), every name/number present in both production dugouts, both player cards readable, zero page errors |
| Endpoint/dead-reference source gate | No matches (git grep exit 1), as detailed below |
| `git diff --check` | Passed |

Focused selector (run using `powershell -NoProfile -ExecutionPolicy Bypass -File`):

```powershell
tools/target-build.ps1 test -Test 'RiotousRookiesTest,RecoverySessionTest,RecoveryScenariosTest,RecoveryApplicationTest,SetupApplicationCheckpointTest,SetupApplicationJournalTest,RecoveryJournalTest,RecoveryNativeJsonTest'
```

This includes the 34-full-match lifecycle/retry/capacity regression and native
cross-JVM recovery scenarios. The two skipped tests require the explicitly
opt-in isolated R4 JDBC environment; this selector does not claim those ran.
Full clean verify reported 19 common tests (no skips), 695 server tests (9 skips)
and 292 native tests (7 skips). The existing skips cover opt-in database/schema/
authorization/recovery integrations, history-scaling workloads, and retained
artifact/result/continuation fixtures. None of the four rookie tests skipped.
Native manifest validation used `native-shard.ps1 -Shard 2 -ValidateOnly` with
only that shard's 10 XML reports copied from the successful full verify into
`.tools/rookie-local-validation/native-shard2-reports`.
`RiotousRookiesTest` pins four inducement applications across both teams (20
rookies), exact roll sides/order, genders, stats, Loner, IDs/numbers, reports and
ordered add-player commands. A real loopback HTTP server stalls any request;
the old configuration points at it and rookie creation completes within the
2-second test ceiling with zero requests. Restore and exact retries compare the
complete native/dice/history/transcript checkpoint byte-for-byte.

Endpoint gate over tracked runtime/tool/configuration source:

```powershell
git grep -n -i -E 'fumbbl\.(com|org|net|base|port|namegenerator)|FUMBBL_(BASE|PORT)|ServerUrlProperty|UtilServerHttpClient|CollectRosters|UtilUrl' -- ffb-common/src/main ffb-server/src/main ffb-tools/src/main ffb-statetest/src/main browser-client/src game-service/src/main tools deployment assets ':!*.md'
```

The removed property names remain only in the deliberate test fixture pointing
to loopback and in historical/design documentation. `com.fumbbl` package names,
the certificate organization and roster `nameGenerator` serialization fields
are not service endpoints; the latter remain for saved-format compatibility.

## Startup and smoke evidence

The fresh browser preflight passed under
`$env:FFB_BROWSER_TEST_WORKERS = '2'; node tools/dev-local.mjs --restart`.
All five report files validated against the complete manifest in
`.tools/validation/local-browser-mhdPDH/`. They identify base commit
`9b0d2a9ffc8c10669e361c6fc542d6e381678dab` and were executed against the current
working files, as required by dev-local. The current-source game-server image
build and its clean Java regressions passed, and startup completed successfully.
The rookie smoke uses an actual native
BB2025 fixture, since the exhibition preset deliberately excludes inducement
purchases; no live match or production data is rewritten to inject rookies.

Normal native regression runs no longer export smoke files. For an explicit
export, select the self-contained accepted-creation test and set an absolute
destination (run from the repository root after building):

```powershell
$env:FFB_ROOKIES_SMOKE_FILE = Join-Path (Resolve-Path ffb-statetest/target).Path 'riotous-rookies-smoke.json'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test 'RiotousRookiesTest#acceptedNativeCreationRestoresAndRetriesWithoutRenamingDuplicatingOrRolling'
Remove-Item Env:FFB_ROOKIES_SMOKE_FILE
```

The explicit export writes `ffb-statetest/target/riotous-rookies-smoke.json`.
No prior test needs to run, and the test rejects a relative output path.
The local one-off
`.tools/rookie-local-validation/browser-smoke.mjs` feeds its restored live view
and saved transcript snapshot into the existing production component harnesses.
It checked all 18 names/numbers in both teams' live and replay dugouts and focused
each team's `RiotousRookie #0` player card. Screenshots `rookie-live.png` and
`rookie-replay.png` and `browser-smoke.json` are retained beside the script;
both screenshots were visually inspected. This is a controlled native/V2
presentation smoke, not an inducement purchase in the exhibition UI. The fixture
uses existing numbered fallbacks for dynamically added players' artwork.

Final readiness evidence, captured at approximately 12:39 ET:

```text
Dev-local ready: http://localhost:5000/play
ffb-match-review-server-1: healthy; started 2026-11-09T17:38:50.864794852Z
ffb-match-review-database-1: healthy; started 2026-11-09T17:38:18.266923342Z
Game image: sha256:5ccf6beb77d914cb667d7f5c172017c6e72f5dfcb3e03f36ea0d2d7e76e07a21
GAME_SERVICE_ERROR_LINES=0
COMPUTER_READY=True
COMPUTER_STDERR_BYTES=0
HOSTING_HTTP=200
Review Firebase ADC: OK
```

The supported proxy live test reached the real Java `AUTHENTICATION_REQUIRED`
gate on both the initial WebSocket connection and reconnect through port 22232
without submitting credentials (1 test passed, zero skips/failures). The error
count above scans this startup's game-service log for `ERROR`, `Exception` and
`SEVERE`. Local services remain running for review.

Startup initially detected expired ADC and used the existing gcloud browser
renewal flow successfully. gcloud warned that its standard ADC file had no quota
project; the supported recovery code adds the fixed DEV quota project to the
mounted credential and restarts the service. Both the startup probe and the
subsequent independent `node tools/match-review-adc-check.mjs` returned `OK`.
No startup error remains unexplained.

## Remaining limitations

- This removes the name-generator dependency. It does not implement slice 2 or
  establish the ADR 0006 healthy p99 / aggregate worker deadline for other work.
- Existing native position selection (including its shuffle behavior) is
  unchanged. The fixed regression uses the human roster's single eligible
  lineman position, so its expected native dice vector is unambiguous.
- The loopback regression proves the old configured name-generator path stays
  inert; it does not intercept arbitrary future hard-coded or differently
  configured outbound connections. The caller/source gate independently checks
  the current implementation for a naming-service path. A JVM `ProxySelector`
  does not intercept all socket/client implementations, and changing global
  socket/proxy factories would need process isolation to avoid interference.
- Follow-up review and merge remain subsequent steps. The implementation
  handoff authorizes a pushed branch and PR, not merge or remote deployment.

## Execution notes

The sandboxed GitHub CLI could not read the owner's Windows credential store,
and the sandboxed Java compiler could not open one cached Netty JAR. Following
the installed `EXECUTION_ENVIRONMENT.md`, narrow approved owner-context commands
restored GitHub authentication and dependency-cache access. PowerShell scripts
ran with a process-local execution-policy override. No credentials were copied
into repository files. Existing compiler deprecation and Mockito dynamic-agent
warnings are tooling warnings, not startup failures.

The first dev-local browser preflight (four workers alongside Java validation)
failed in `doubleclick-confirmation-ui.mjs:93`: a 10-second wait for a movement
submission expired. That unchanged suite passed in isolation. Its two repeat
clicks must arrive within 400 ms, making load-sensitive input timing a plausible
cause; the failed run did not capture event timestamps, so this is an inference.
The documented two-worker override was selected for the complete fresh retry;
the final result is recorded above. No unrelated browser behavior was changed
to work around the failure.

## PR #515 review follow-up

The seven review findings were checked against callers, serialization and the
actual Maven graph before changing the branch:

| Finding | Decision |
| --- | --- |
| Unused keystore | Delete it. Certificate metadata was not an endpoint, but an unused key artifact has no retention benefit here. No used TLS key/configuration changes. |
| Preemptive timeout thread | Use `assertTimeout` so native mutation stays on the invoking test thread and is never abandoned at the timeout boundary. The normal passing test had exclusive access even before this change; the reliability concern is valid without treating every test-thread handoff as production parallel mutation. The assertion checks elapsed time after return; the controlled endpoint independently closes stalled requests after 3 seconds. |
| Automatic smoke-file write | Make export opt-in through `FFB_ROOKIES_SMOKE_FILE`, require an absolute destination, and document selecting the self-contained generator test. Ordinary tests have no smoke-file I/O, so they need no `@TempDir`. Previously only the shard containing this class wrote the file, not every native shard. |
| Scope of no-network regression | Accept the coverage limitation and state it explicitly in the test name/comments and this report. Do not claim that a global `ProxySelector`/`SocketFactory` alone can guard every possible client or raw connection. A comprehensive guard needs a separate, isolated network-policy/instrumentation design. The existing controlled-endpoint regression meets the request's specified old-configuration scenario. |
| HTTP dependency mediation | Confirmed the version change; record both actual trees below. Keep removal of the unused direct dependency rather than pinning the accidental old override. |
| Unused getters | Remove both `getNameGenerator()` methods/fallbacks after a repository caller search. Preserve the private fields and all XML/JSON readers/writers, with comments explaining compatibility-only metadata. |
| Blank lines | Remove the leftover empty lines in `IServerProperty`. |

Follow-up validation:

- `tools/target-build.ps1 test -Test 'RiotousRookiesTest,RecoveryNativeJsonTest,RecoverySessionTest,RulesTest'`:
  BUILD SUCCESS, 17 tests passed, zero failures/errors/skips. All affected modules
  compiled, and the existing default smoke file's timestamp stayed unchanged.
- Explicit export to an absolute `.tools/rookie-local-validation/review-smoke.json`
  using the single accepted-creation test: BUILD SUCCESS, 1 test passed, zero
  skips; output contained 16 rookies and 2 transcript records. It requires no
  other test to have executed first.
- Endpoint/dead-reference search: no matches; both unused getter callers are
  gone. `git diff --check` passed.
- Initial PR head `bb3285342` passed all required GitHub checks, including all
  four native shards. The earlier complete build/browser/startup evidence is
  recorded separately above; the review changes target test ownership/export,
  unused model API and the unused artifact. No provider dependency version was
  changed by this follow-up.

### Measured HTTP dependency trees

Both commands used pinned Maven 3.9.9/JDK 21, the same project settings/cache,
and `dependency:tree -Dincludes=org.apache.httpcomponents:* -Dverbose`
(dependency plugin 3.7.0). The before POM and its parent were copied from
`f2f27e798`, immediately before endpoint/dependency removal, into an ignored
directory; the after command used the current `ffb-server/pom.xml`. Both
commands returned BUILD SUCCESS. Full local logs and the invocation script are
under `.tools/rookie-local-validation/dependency-comparison/` and
`.tools/rookie-local-validation/review-dependencies.ps1`.

Before (verbatim filtered tree):

```text
com.fumbbl.ffb:ffb-server:jar:3.4.0
+- org.apache.httpcomponents:httpmime:jar:4.5.2:compile
|  \- org.apache.httpcomponents:httpclient:jar:4.5.2:compile
|     \- org.apache.httpcomponents:httpcore:jar:4.4.4:compile
\- com.google.firebase:firebase-admin:jar:9.4.3:compile
   +- com.google.api-client:google-api-client:jar:2.7.1:compile
   |  +- com.google.http-client:google-http-client-apache-v2:jar:1.45.2:compile
   |  |  +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for conflict with 4.5.2)
   |  |  \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for conflict with 4.4.4)
   |  +- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for conflict with 4.4.4)
   |  \- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for conflict with 4.5.2)
   +- com.google.http-client:google-http-client:jar:1.45.3:compile
   |  +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for conflict with 4.5.2)
   |  \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for conflict with 4.4.4)
   \- com.google.cloud:google-cloud-firestore:jar:3.30.2:compile
      +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for conflict with 4.5.2)
      \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for conflict with 4.4.4)
```

After (verbatim filtered tree):

```text
com.fumbbl.ffb:ffb-server:jar:3.4.0
\- com.google.firebase:firebase-admin:jar:9.4.3:compile
   +- com.google.api-client:google-api-client:jar:2.7.1:compile
   |  +- com.google.http-client:google-http-client-apache-v2:jar:1.45.2:compile
   |  |  +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for duplicate)
   |  |  \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for duplicate)
   |  +- org.apache.httpcomponents:httpcore:jar:4.4.16:compile
   |  \- org.apache.httpcomponents:httpclient:jar:4.5.14:compile
   |     \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for duplicate)
   +- com.google.http-client:google-http-client:jar:1.45.3:compile
   |  +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for duplicate)
   |  \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for duplicate)
   \- com.google.cloud:google-cloud-firestore:jar:3.30.2:compile
      +- (org.apache.httpcomponents:httpclient:jar:4.5.14:compile - omitted for duplicate)
      \- (org.apache.httpcomponents:httpcore:jar:4.4.16:compile - omitted for duplicate)
```

Thus the resolved transport moves from HttpClient 4.5.2 / HttpCore 4.4.4 to
4.5.14 / 4.4.16, already requested by the unchanged provider dependencies. The
initial clean build and real dev-local ADC/access check ran with this after
graph; retaining the dead MIME dependency solely to override it is unwarranted.
