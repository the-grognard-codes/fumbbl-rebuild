Implemented on `feature/dice-readability` and ready for manual validation. Dev-local is running at http://localhost:5000/play.

Approved icons and concise event/result captions are wired into non-block dice. Independent controls under Game Menu > Interface persist per browser. Live/replay/recovery, Pro/original rolls, projected scatter arrows, retained injury animations, and contributing casualty dice are covered. Kickoff Deviation uses explicit D8+D6/D3 metadata without changing rolls or mechanics. Catch v3 and Weather v1 are retained.

Validation:

- 489 browser unit tests passed; TypeScript/Vite build and 571-asset delivery checks passed.
- All 63 interaction suites and 10 hosted suites passed in the mandatory startup preflight (two workers).
- Clean server `verify` passed: 950 tests reported, 938 executed, zero failures/errors, 12 opt-in skips.
- Focused Pro/reconnect, pending recovery, native numeric replay, direction/timing/preference checks passed; desktop/mobile pitch captures were inspected.
- Dev-local Docker build, healthy server/database, V2 proxy/reconnect test, Hosting, and computer-player startup passed.
- HTTP verification confirmed `/play` and all 78 served SVGs against the canonical files.
- `git diff --check` passed.

Review fixes included preserving animation state across visibility toggles, mobile group overflow, native Pro reroll captions, and updating old casualty/Pro appearance assertions. A transient double-click timeout passed in isolation and subsequent two-worker full runs; no gesture logic was weakened.

The full report is `.notes/dice-readability/implementation-report.md`; evidence includes `runtime-ready.json`, `server-test-summary.json`, and `.tools/validation/local-browser-Qfv6NS`. Unrelated working-tree changes are preserved. No commit, push, remote deployment, or merge has been performed.
