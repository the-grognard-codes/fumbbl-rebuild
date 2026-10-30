# Browser-only support: implementation outcome

Date: 2026-10-29 (America/New_York)

Branch: `feature/browser-only-support`, based on
`cedc06d4aa280fd4765b0726e4691592f82ceac1` (`main`).

Design: [browser-only-support.md](browser-only-support.md).
Issues: [#379](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/379),
[#380](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/380),
[#381](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/381).

Final issue results: [#379](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/379#issuecomment-6514229950),
[#380](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/380#issuecomment-6514227313),
[#381](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/381#issuecomment-6514223824).

## Delivery status

Implementation, self-review and required validation are complete. The managed
dev-local application is running at **http://localhost:5000/play** with Hosting,
nginx, the V2 Java game service, database and computer daemon. A fresh authenticated
Human/Orc match completed 2?1 through both halves, recovered identically after an
actual JVM restart while suspended, and its completed result/replay passed after
a second JVM restart. V1 diagnostic smoke also passed.

The user renewed Google ADC after the initial `SESSION_EXPIRED` blocker. The
normal launcher refreshed its mounted copy; the final ADC health check is OK.
No authentication configuration or permissions were changed.
At the initial handoff, no files were staged, committed or pushed; no PR, merge or
remote deployment was performed. Issues remained open for delivery review. The checkout was clean at the
start. Existing databases, volumes, user credentials and unrelated containers
were preserved. Task-owned disposable test containers and temporary server secrets were removed.
Ignored synthetic acceptance credentials/evidence remain under `.tools/` for
local review; no credentials are included in tracked files.

## Implemented outcome

- Removed `ffb-client`, `ffb-client-logic`, and `ffb-resources` from source and the
  Maven reactor. Removed desktop icon-cache builders. Existing byte-identical
  browser weather artwork already lives in canonical `assets/game`; historical
  provenance remains accurate.
- Removed desktop command sockets/servlets, sessions, replay services, handlers,
  administration/file endpoints, persistence queues, launch links, and exclusive
  shared protocol, preference, setup, sketch and presentation definitions.
- Retained shared native commands, model changes, event logs, rules and assets
  used by browser projection/recovery. Browser adapters still own persistence;
  the engine queue serializes work and records native events without desktop
  transport/session routing. Native ownership tests now use trusted coach roles.
- V2 is the default server selection. V1 requires an explicit `false` selection
  and local mode. Invalid selections fail rather than silently choosing V1.
- New databases receive browser tables only. Existing inert historical tables
  are tolerated without importing their games or deleting existing data. Removed
  obsolete coach/admin secret provisioning and mounts; real secret files are untouched.
- Updated current operational documentation, agent instructions, CI, container
  health checks and build context. CI's existing `Validate` context now checks
  current browser boundaries instead of building a frozen desktop-era checkout.
  Container packaging starts clean and excludes generated classes/dependencies.
- Added [Unreleased changes](../../CHANGELOG.md). The public updates page remains
  actual merged-PR history. No browser appearance, timing, gameplay, rules or
  sequencing change was intended; presentation assertions were preserved.

## Self-review

### Standards

Independent standards review found no hard violations. The optional observation
was duplicated strict boolean validation at the server and pre-secret local
profile boundary; these checks intentionally protect both entry points.

### Spec

Initial review requested changes for remaining desktop-only lifecycle, setup,
replay logging, transient overlays, sketch serialization and dialog definitions.
Those findings were fixed. Native log suffix constants accidentally removed
during cleanup were restored. Final spec recheck: **APPROVE**, no actionable
findings. The runtime image's `curl` availability was verified.

Final replay acceptance exposed a driver error: after inspecting a reserve
player it left the expanded dugout over Seek. The failure reproduced in a
narrowed 2-second click check. Minimizing the dugout made that check pass at the
same 1280?660 viewport. The driver now performs that real UI step before Seek;
its complete two-coach replay check passed. No browser product code or visual
assertions were changed. The one-line driver fix was self-reviewed.

## Validation evidence

Logs and synthetic evidence are under ignored `.tools/`; no credentials are
included in this report or the GitHub results.

| Check | Exact command / selector | Result |
| --- | --- | --- |
| Full Maven reactor | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 verify -JavaHome .tools/browser-only-jdk/jdk-21.0.11+10` | PASS: 935 reported, 924 passed, 11 environment/opt-in skips; no failures/errors. Log: `.tools/browser-only-verify.log`. |
| Final focused clean server package | Pinned Maven 3.9.9 / JDK 21.0.11+10, `-Pmockito5 -pl ffb-server -am -Dtest=<selectors below> -Dsurefire.failIfNoSpecifiedTests=false clean package` | PASS: 40/40, zero skips. Three real JDBC checks used task-owned MariaDB 11.8.9 on loopback port 23329. Log: `.tools/browser-only-final-java.log`. |
| Final container | `docker compose -f containers/local/compose.match-review.yaml build server` | PASS: clean package, shared/server tests (644 reported, 639 passed, 5 opt-in skips). Log: `.tools/browser-only-image-clean.log`. |
| Browser unit | `npm.cmd test --prefix browser-client` | PASS: 433/433. |
| Browser assets | `npm.cmd run assets:check --prefix browser-client` | PASS: 30 checks, 430 assets. |
| Browser builds | `npm.cmd run build --prefix browser-client`; `npm.cmd run build:play --prefix browser-client` | Both PASS. |
| Mandatory complete browser gate | `FFB_BROWSER_TEST_WORKERS=2 node --input-type=module -e "import { validateLocalBrowser } from './tools/validation/browser-local.mjs'; await validateLocalBrowser(process.cwd());"` | PASS: all 56 interaction suites and 10 hosted suites, no failures/skips; 853.1 seconds. Reports: `.tools/validation/local-browser-h342Nd/`. |
| Local lifecycle/tooling | `node --test tools/test/dev-local.test.mjs tools/test/dev-local-clear-games.test.mjs tools/test/acceptance-local-server.test.mjs tools/test/review-mount-source.test.mjs tools/test/match-review-start.test.mjs tools/test/review-current-matches-index.test.mjs tools/test/game-service-start.test.mjs` | PASS: 41/41. |
| Validation/release tooling | `node --test tools/test/validation.test.mjs tools/test/browser-local.test.mjs tools/test/deploy.test.mjs` | PASS: 27/27. |
| Shell syntax | `bash -n` individually for `create-host-secrets.sh`, `test-host-secrets.sh`, `stage-dev-runtime.sh` under `deployment/game-service/proxy/` | PASS. No remote scripts executed. |
| Real V1 smoke | Final image, isolated synthetic-token container; `java -cp 'FantasyFootballServer.jar:lib/*' com.fumbbl.ffb.server.local.BrowserLocalProbe` | PASS: both coaches join, pending native choice resolves, views converge. `.tools/browser-only-v1-result.json`. |
| V2 startup | Existing mount references, `docker compose -f containers/local/compose.match-review.yaml up -d server`; HTTP checks on `127.0.0.1:22234` | PASS: healthy; `/browser/v2` returns 405 for plain HTTP; `/browser/v1`, `/command`, `/admin`, `/gamestate`, `/backup`, `/replay` return 404. `.tools/browser-only-v2-startup.json`. |
| Managed dev-local | `node tools/dev-local.mjs --start` | PASS: mandatory browser preflight repeated with default 4 workers (all 66 suites; 633.3 seconds), current builds, clean server image, ADC, Hosting, nginx, Java proxy gate and computer daemon; `Dev-local ready`. Log: `.tools/browser-only-dev-local.log`; gate reports: `.tools/validation/local-browser-d954pZ/`. |
| Fresh authenticated V2 match | `COACH_ACCEPTANCE_PERFORMANCE=0 COACH_ACCEPTANCE_COMPUTER=0 node --experimental-strip-types .tools/browser-only-live/real-server-match-with-restart.mjs` with synthetic token/evidence file environment variables | PASS: real Firebase login; UI-built validated Human/Orc teams; both coaches and spectator converge; escaped chat, reconnect/pending actor, wrong-coach/spectator/stale request rejection, route preview/confirm, save/agreed resume, both halves, full time, identical results and backward replay seek. Final revision 407, score 2?1, 408 events. `.tools/browser-only-live/evidence/acceptance.json`; `.tools/browser-only-live-match.log`. |
| Actual suspended-match recovery | Temporary match driver adds `.tools/browser-only-live/restart-hook.mjs` at the existing suspended checkpoint; identity-checked `docker restart --time 30 <local-server-id>` | PASS: same container/image, new JVM start time; revision 49 restored as SUSPENDED for home, away and spectator with identical canonical SHA-256. `.tools/browser-only-live/evidence/actual-server-restart.json`. |
| Actual completed-match restart | `node .tools/browser-only-live/restart-completed.mjs` | PASS: verified local server restarted again, same image/container and preserved database; healthy before replay. `.tools/browser-only-live/evidence/completed-server-restart.json`. |
| Post-restart real replay | `node --experimental-strip-types .tools/browser-only-live/real-server-replay-headless.mjs` with fresh completed-file/token/evidence environment variables | PASS: both coaches load the exact native result; Last/FULL_TIME and Event 51 seek; home/away camera ends, perspective/top-down, 390 cells, all 22 player IDs retained, pitch/dugout inspection, zero mutation requests. `.tools/browser-only-live/replay-after-restart/replay-cutover.json`; `.tools/browser-only-replay-after-restart.log`. |
| Final local proxy / ADC | `node --test deployment/game-service/proxy/live-local-test.mjs`; `node tools/match-review-adc-check.mjs` | PASS after both restarts: real V2 authentication gate through nginx on initial connection/reconnect; ADC OK. `.tools/browser-only-final-proxy.log`. |
| Distribution boundary | ZIP/JAR inventory audit of clean local archive and JAR copied from the running final image | PASS: V1/V2 retained; retired client/transport/service/setup/sketch types and AWS backup libraries absent. |
| Whitespace | `git diff --check` | PASS. |

Final focused selectors:

```text
BrowserDiagnosticsStartupTest,BrowserRuntimeSelectionTest,BrowserEngineQueueTest,
BrowserJettyContractTest,BrowserV2RouteTest,BrowserSchemaMariaDbTest,
SkillUsePreferenceSchemaIntegrationTest,RecoveryJournalMariaDbTest,
RecoveryNativeJsonTest,RecoveryArtifactJsonTest,CompletedMatchTest,
SetupSessionConcessionTest,NativeOutcomeCaptureTest
```

The full reactor ran before the last review removals of unused types/logging.
After those fixes, the focused clean package and complete shared/server container
tests ran again on the final source. Browser source did not change. The full
native suite included 34 fresh full matches and 34 successful session restores
using in-memory repositories; that is engine evidence, not authenticated browser
acceptance or a real JVM restart against the running V2 service. Those were
subsequently verified separately by the fresh authenticated checks above.

Default full-reactor skips were the opt-in methods in `Marker6SchemaTest`,
`SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`,
`V2PreparationJdbcTest`, `R5CompletedFixtureGeneratorTest`,
`R5RestoredContinuationTest`, `RecoveryApplicationTest` (two),
`RecoveryArtifactInspectionTest`, and `V2RuntimeIntegrationTest` (two).
The final focused run separately enabled real skill-preference/journal JDBC
tests and fresh browser-schema bootstrap. Historical R5 fixtures were not imported.

The installed pinned JDK directory contained no executable. The existing pinned
archive was extracted under `.tools/browser-only-jdk`; no host installation was
changed. Sandboxed javac hit an `AccessDeniedException` resolving a cached JAR;
Java verification ran outside the sandbox using the same pinned tools/settings.
An incremental compiler inconsistency disappeared with the clean build.

## Integrated acceptance and handoff

Fresh synthetic acceptance match: `fdd9f565-96cf-3925-bb24-d0eda90eac62`.
Final runtime image:
`sha256:730294c0ccab6603a95e1927ce60b543924968d4ebfe7fe3d22aac13af4b3262`.
The suspended checkpoint's canonical digest before/after restart was
`accc43c1d1a8df83ae28bf7d2665674d0896c1f1d7b25d10931922af17e925b9`.

The ignored match driver is a copy of `browser-client/test/real-server-match.mjs`
with resolved imports and the actual-restart hook inserted at its existing durable
suspension checkpoint. The ignored replay driver copies the corrected
`browser-client/test/real-server-replay.mjs`, resolves imports and selects headless
Chrome. Gameplay, projection and replay assertions are unchanged. The narrowed
overlap reproduction and screenshot are retained under clearly named ignored
`.tools/browser-only-live/replay-diagnostic/` paths; debug instrumentation is absent
from tracked code.

Live and replay screenshots were inspected. No appearance or timing changes
needed new assertions. The current-source 66-suite browser gate passed twice;
the later driver-only correction was verified by its failing narrowed reproduction,
passing correction and complete real two-coach replay run.

All planned acceptance checks are complete. At initial handoff, dev-local was left
running for visual review and the implementation remained uncommitted.

The user subsequently accepted the result and authorized committing all changes,
opening a PR, waiting for validation CI, merging into main, deleting local/remote
working branches, and stopping dev-local. Final PR and delivery status are recorded
on the linked GitHub issues. Remote deployment is outside this request.

## Session retrospective

The repository's `retro` and `writing-for-agents` guidance was applied. Two
environment improvements would reduce future setup/debug work:

- Check that the pinned target JDK has both executables before a long validation
  run; report the already-cached archive as a recovery option.
- Keep generated classes/dependencies out of container contexts and clean before
  packaging retired-source changes. This guard is included in this implementation.

No unrelated global policy, credential or tool installation changes were made.
