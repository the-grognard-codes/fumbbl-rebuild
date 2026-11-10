# Slice 3 environment retrospective

These are follow-up candidates, in priority order; this slice does not change
workflow policy, CI permissions or agent instructions. Product acceptance and
security findings are in the [outcome](../specs/engine-worker-slice3-outcome.md).

1. **Run the existing synthetic MariaDB contracts in CI.** The repository already
   runs Java/native verification, browser unit/static checks and a complete
   browser inventory. The actual JDBC tests require `JDBC_BOUNDS_TEST_URL`, which
   the current workflows do not supply. An isolated MariaDB service job could
   execute the local-publication and JDBC budget tests without cloud credentials.
   Source review found a stale schema-marker constant that mock-only coverage
   missed; real SQL coverage protects this boundary more directly than another
   reviewer instruction. Keep credentialed Firebase tests separately opt-in.

2. **Make the existing credentialed three-party smoke an explicit release gate.**
   `browser-client/test/real-server-match.mjs` exercises actual authentication,
   native play, spectator delivery, chat and recovery. It is separate from the
   registered 82 browser suites. Its stale roster-status assertion and canonical
   actor-controls comparison needed repair before it exposed the spectator
   formation leak. Document and execute this existing driver against each release
   candidate with short-lived DEV credentials and private evidence storage;
   retain strict per-recipient projection validation.

3. **Check the same ADC file used by the JVM.** The preflight can explicitly send
   a quota-project header, while the standard host ADC file lacks that setting.
   This session observed preflight success followed by a real JVM 403. Using the
   existing quota-scoped credential file mounted by dev-local made the test match
   the running service. A preflight check of the effective JVM credential profile
   would make that mismatch visible before a lengthy integrated run, without
   exposing credential contents or changing IAM permissions.

4. **Freeze HEAD during multi-group validation.** Committing the native test
   fixture while browser groups were running produced individually passing
   reports with different commit IDs. The final gate correctly rejected them.
   A fixed checkout, or an early HEAD check before each group, would prevent or
   report this sooner. The affected groups were rerun; reports already passing
   at the exact final source commit could be reused unchanged. Do not rewrite
   report commit IDs to make a stale run pass.

5. **Investigate browser performance isolation before changing thresholds.** A
   four-worker run observed 15 idle-panning layout reads; the isolated rerun and
   complete serial run observed zero. Preserve the assertion. Investigate the
   measured quiet interval and host contention, and record worker count alongside
   performance results. The provider boundary passed with one worker; the final
   complete gate passed with two workers after native verification finished,
   with zero HUD rectangle reads. A separate coach-HUD fixture race read the
   composer immediately after an acknowledged send, before its React effect
   completed. The test now waits for actual DOM detachment and retains the same
   assertion; it does not add a fixed sleep or change product behavior.

For tool economy, `rg` is unavailable in this Windows environment. Narrow
`git grep` searches and exact file reads were effective; broad recursive text
scans added noise. No new global instruction is needed for that fallback.
