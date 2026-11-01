# Support page device guidance: implementation outcome

Issue: [#390](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/390), part of [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388). Specification: [support-device-guidance.md](support-device-guidance.md).

Branch: `feat/support-device-guidance`, based on `main` at `01a21242d`. Implementation is in the isolated `.tools/worktrees/support-device-guidance` worktree. The root checkout's unrelated changes are preserved. No commit, push, merge or deployment was performed.

## Delivered

- `/support` now describes desktop-first coaching, landscape tablets, phone website/replay/spectating, mouse/keyboard and touch input.
- Recommended CSS viewport targets are 1920 × 900 desktop, 1366 × 768 smaller laptop/landscape tablet, and 1024 × 600 replay. Full-screen 1080p at 100% scale/zoom remains the primary desktop reference.
- Conservative measured fit references are 1350 × 300 live and 980 × 320 replay with page scrolling. These are bounded measurement results from #388, not universal minima or comfortable-play claims. They do not create access gates. Deferred compact-layout limitations link to #389.
- A native keyboard/touch slider offers 100/125/150/175/200% OS/display scaling. Each dimension is rounded up after multiplying the CSS target by scale. Browser zoom is assumed to be 100%; separate prose explains additional zoom, browser bars/taskbar and tablet logical scaling. The slider changes the explanation only, not game or device settings.
- Static 100% examples and a calculation explanation remain available without JavaScript; the otherwise inactive slider stays disabled.
- Future animation estimates include desktop four-core/8 GB entry and 16 GB headroom, iPad 10/A16 entry and M1 Air/Pro headroom, and flagship Galaxy Tab S8/S9 tiers with 8 GB+ RAM. Manufacturer sources verify model facts, not MUTP performance. FE/A devices need separate evaluation. See [the hardware evidence](../research/animated-hardware-guidance-2026.md).
- Existing site styling, shared header/account menu and contact/privacy guidance are retained. New CSS is loaded only on `/support`; game runtime and shared styles were not changed. CHANGELOG.md records the user-visible change; updates.json is untouched.

## Self-review

Checked scope against the specification, formula rounding (including 1366 × 125% = 1707.5 → 1708), unchanged CSS targets, accessible slider label/value/focus, no-script behavior, mobile overflow, official source links, and the distinction between estimated hardware and tested layout. Corrected the browser test's ambiguous status selector: HTML output already has an implicit status role. Removed unnecessary implementation wording from the public hardware section. No gameplay or appearance/timing assertions required changes.

## Validation

- `npm.cmd run build` in `site`: passed, including asset validation/sync, TypeScript checking, Vite product build and static site generation. A later `node scripts/build.mjs` refreshed only the static artifact after a prose correction.
- `npm.cmd run check` in `site`: passed, 19 required inputs and 180 update entries.
- `npm.cmd test` in `site`: passed, 12 tests.
- `npm.cmd test` in `browser-client`: passed, 433 tests.
- `node --test site/test/support-browser.test.mjs`: passed, including all 25 calculated width/height pairs, keyboard boundaries, emulated touch, invariant CSS labels, no-script fallback and no horizontal overflow at 768/390/320 CSS pixels. Reran successfully after the final prose edit.
- Desktop (1440 × 1000 viewport) and mobile (390 × 900 viewport) full-page screenshots inspected: `test-output/support-page/desktop.png` and `mobile.png`. Tests block external fonts, so captures also exercise fallback fonts; no physical-device visual certification is implied.
- `node browser-client/test/reconnect-ui.mjs`: passed, play and builder authentication recovery.
- `node browser-client/test/pending-recovery-ui.mjs`: passed, ordinary action and uncertain-result retry behavior.
- `node tools/validation/browser-suites.mjs --family hosted`: first nine suites passed (28 tests): account-menu, play (15 tests), current-games, spectate, updates, support, builder, m5d-blitz and m5e-result (6 tests, including replay). Following the artifact interruption described below, `node --test site/test/m5f-keyboard-browser.test.mjs` passed both tests and `node --experimental-strip-types browser-client/test/client-path-ui.mjs` passed both base-path checks. All 11 registered hosted suites therefore have passing results; the interrupted aggregate run did not emit a complete success report.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 -Task test -Module ffb-server`: BUILD SUCCESS with pinned Temurin 21.0.11+10 and Maven 3.9.9. Common: 19 passed. Server: 625 discovered, 620 passed, 5 skipped; zero failures/errors. Skips are opt-in isolated-database checks: BrowserSchemaMariaDbTest, Marker6SchemaTest, SkillUsePreferenceSchemaIntegrationTest, RecoveryJournalMariaDbTest and V2PreparationJdbcTest. Their database configuration was not supplied. This is 639 executed Java tests passed, not a claim that the five integration checks ran.
- `git diff --check`: passed.

## Test setup and reruns

The first two sandboxed Java attempts failed while javac resolved cached JAR paths (`AccessDeniedException`), first through the worktree junction and then with the canonical cache path. The same pinned launcher was rerun with approved elevated tool access. No Java source or dependency changes were made.

The hosted runner's keyboard suite encountered a local HTTP failure while the static output was being rebuilt after a prose correction. This was a validation scheduling error: rebuilding deletes/replaces `site/dist`, which tests were serving. The affected keyboard suite was rerun against the completed artifact; the final client-path suite was run separately because the runner had stopped early. Earlier suites had completed successfully. No game fix was made for that transient artifact failure.

## Remaining limits

Hardware estimates are not benchmarks of the future combined animation workload. Physical iPad/Mac, Android tablet, Windows-versus-Linux graphics and thermal testing remain outstanding; Chromium touch emulation is not Android/iPad hardware validation. No new OS/browser version floor was adopted. Full native/statetest and all interaction shards were not required for this support-only slice and were not run. The hosted game checks use their existing local fixtures, not a deployed server or complete real-match acceptance run. Compact layout corrections remain deferred in #389.

The owner accepted the local visual review and authorized commit, PR validation, merge, branch cleanup and DEV/PROD static Hosting deployment on 2026-11-01. The local preview has been stopped. Publication and deployment results are recorded on issue #390; the initial validation above predates CI and release validation.

## Session retrospective

Following `.agents/skills/retro/SKILL.md`, two environment improvements are suggested, in priority order:

1. Add a local build/test lock or serve immutable build snapshots so `site/scripts/build.mjs` cannot replace artifacts beneath `tools/validation/browser-suites.mjs`. Existing hosted CI already builds before testing, and this slice registers its new suite there; the gap is concurrent local invocations, not missing CI coverage.
2. Add a worktree preflight for pinned JDK/Maven cache access. The repository already has a pinned launcher and Maven CI; early file-resolution checks would expose sandbox/junction access failures before compiling. Prefer one setup diagnostic over adding broad rules to AGENTS.md.

These are follow-up suggestions, not additional product or tooling changes in this slice.
