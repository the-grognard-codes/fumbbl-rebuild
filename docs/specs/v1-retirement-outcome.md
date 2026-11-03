# V1 retirement implementation report

Date: 2026-11-03. Branch: `retire-browser-v1`. Status: implemented and validated; ready for manual review.

## Scope and delivery

Tracked in [#429](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/429),
[#430](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/430), and
[#431](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/431).
The recovery-control finding is tracked in [#435](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/435).
See [agreed scope](v1-retirement.md) and [capability inventory](v1-retirement-inventory.md).

The server now hosts V2 only. V1 selection fails before startup; the old endpoint,
fixture adapter, control file, probe, client panels and executable demos are removed.
Shared transport now depends on `BrowserConnection`, and shared UI lives in `GameView`.
Default browser builds produce the V2 bundle; public `/play/...` URLs and independent
development artwork previews are preserved. Useful renderer checks run against
the V2 UI with test-only fault injection. Shared persisted formats remain supported.

Old Compose/setup/copy workflows are retired. No existing V1 database, backup volume
or ignored credential file was migrated or deleted. No commit, push, merge or remote
deployment has been performed. The initial working tree was clean.

## Review and fixes

- Self-review and independent review found no product regression in the shared
  transport or rendering extraction. The extracted GameView body is unchanged.
- Fixed recovery-test expectations to include the public save/resume projection.
- Recovery test process cleanup restarts the inspected immutable container ID even
  if post-kill assertions fail; target checks refuse other projects, ports or volumes.
- Updated live acceptance to select touchback recipients through the pitch before
  confirmation, matching the existing product behavior. Verified against a retained
  real match, advancing exactly one revision. Test team names are now unique across runs.
- Fixed #435: explicit Reconnect works when a connected socket has lost its match
  view. Regression checks prove state reload without automatic mutation and retain
  the original pending request for a separate explicit retry. Latest browser unit
  tests (460), build and the reconnect UI test passed after this fix.
- Host Maven cache access required approved execution outside the sandbox. Stubbed
  cloud-tool tests needed the standard Windows PowerShell module path. All 96 tool
  tests subsequently passed. Existing ADC credentials were renewed by the user.

## Verification

| Check | Result / evidence |
| --- | --- |
| Focused server runtime/transport and native adapter tests | Passed: 117 server tests with one opt-in skip, five migrated native tests; `.tools/v1-retirement-server-focused-final.log`. |
| Final startup and endpoint tests | Passed, including retired endpoint 404; `.tools/v1-retirement-startup-final.log`. |
| Browser unit tests after dead V1 codec removal | 460 passed; `npm test --prefix browser-client`, `.tools/v1-retirement-browser-unit.log`. |
| TypeScript and V2 bundle | Passed: `npm run build --prefix browser-client`, `.tools/v1-retirement-browser-build.log`. |
| Focused renderer/HUD/setup/recovery UI | Passed: `npm run test:renderer`, `node test/coach-hud-ui.mjs`, `node test/setup-drag-ui.mjs`, `node test/reconnect-ui.mjs`, `node test/pending-recovery-ui.mjs` from browser-client. |
| DEV entry / artwork preview smoke | Passed: default redirect, preserved match query/fragment and three independent artwork routes. |
| Tooling | 96 passed: `node --test tools/test/*.test.mjs` with standard Windows PowerShell module path and local V2 Hosting running; `.tools/v1-retirement-tool-tests-final.log`. |
| Standalone game-service | 29 passed, clean verify succeeded; `.tools/v1-retirement-game-service.log`. |
| Clean Java reactor | Passed: 934 executed tests, 12 opt-in skips; `tools/target-build.ps1 verify`, `.tools/v1-retirement-reactor.log`. |
| Real V2 match/replay/restart acceptance | Passed across a retained continuation: full time at revision 254, valid 0–0 result, 255 replay events. Both coaches agree. Pending-decision, terminal-before-result-save and terminal-committed process kills all preserve state, exact retry and checkpoint/journal hashes. `.tools/v1-retirement-live-pass/acceptance.json` and `process-recovery.json`. |
| Clean-image retained replay | Passed for both coaches: event 51, both camera ends, perspective/top-down views, pitch/dugout inspection, zero mutation requests. `.tools/v1-retirement-replay-final/replay-cutover.json`; screenshots inspected. |
| Recovery harness safety and retained evidence | Five tests passed: `node --test tools/test/v2-process-recovery.test.mjs`, including rejection of unrelated containers/storage and mismatched retained match evidence. |
| Full browser preflight | Passed: all 63 interaction and 10 hosted suites, four workers, 410.1 seconds. Run through `node tools/dev-local.mjs --start`; reports `.tools/validation/local-browser-YsGYld/*.json`, log `.tools/v1-retirement-dev-local.log`. These checks ran against the uncommitted working tree; report commit IDs identify its base. |

## Manual validation handoff

Dev-local is running at **http://localhost:5000/play**. The supported
`node tools/dev-local.mjs --start` command exited successfully after browser preflight,
the review server image build, database/server health checks, Firebase ADC validation,
the real browser/proxy authentication and reconnect check, and computer-player startup.
A subsequent `GET /play` returned 200. Evidence: `.tools/v1-retirement-dev-local.log`.
Use the normal sign-in and match preparation flow for manual testing.

The completed acceptance stack is stopped with its data retained; the review stack,
Hosting, proxy and computer-player service remain running. No further implementation
or required validation is pending. GitHub issues remain open for review, and all code
is uncommitted on the working branch. The opt-in Java integration tests skipped by
the ordinary reactor were not enabled; real-server acceptance provides the separate
live play/replay/recovery evidence described above.

## Validation observations

The live run exposed one `PERSISTENCE_FAILED` response; exact retry succeeded.
A later participant publication returned `VIEW_UNAVAILABLE`; explicit reload
restored the authoritative revision without mutation. Database permissions,
stored byte counts and lock counters were valid. An instrumented continuation
captured 186 consistent journal appends and no SQL/budget failures; the original
transient cause was not established. All temporary diagnostics were removed.
The unusable Reconnect control exposed by the latter error is addressed in #435.

Recovery acceptance permits any valid final score, including this match's 0–0
draw. The separate normal scoring-acceptance mode still requires a touchdown.
No claim is made that this particular live recovery match exercised a touchdown.

## Session retrospective

Following `.agents/skills/retro/SKILL.md`, two environment improvements are suggested
for separate work:

1. Move the existing mounted/standard ADC validation ahead of expensive browser
   validation and image builds in the dev-local workflow. Credential expiry was
   the only prerequisite requiring human intervention during this session.
2. Normalize the child Windows PowerShell module path in the test runner. Four
   tool tests initially failed because inherited module discovery hid `Get-FileHash`;
   a process-local standard module path made the existing checks pass.

The existing mandatory browser shard runner and build checks remain the validation
entry points; no parallel validation framework or global instruction changes were added.
