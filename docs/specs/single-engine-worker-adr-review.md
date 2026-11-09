# Review: single engine worker ADR request

Reviewed: 2026-11-09 against checkout `53edb476af880091bbb88a26e36913f686257ee5`.
Subject: [single-engine-worker-adr.md](single-engine-worker-adr.md).
Checked against: [the ADR template](../agents/adr-template.md), issue #509 and the
maintainer's sequencing comment, #504, #505, #507, #508, #39, ADRs 0002, 0004 and
0005, [the architecture map](../agents/architecture-map.md), and the cited code.

**Verdict:** the request is well structured and follows #509 and the template. Most
of its code claims are correct: the thread name, the unbounded
`LinkedBlockingQueue`, the 16/128 limits, the lane semantics, the untracked
`submitControl`, the watchdog's name and its 100 ms / 2,000 ms / 1 s coalesced
checks, the synchronized adapter entry points, and 0006 as the next ADR number.
It has one real coverage gap and a few factual fixes, listed below. Fix them
before drafting the ADR.

## Defects

1. **A blocking path inside native mutation is not listed and has no owner.**
   [StepRiotousRookies.java:102](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/phase/inducement/StepRiotousRookies.java)
   calls `UtilServerHttpClient.fetchPage` (the FUMBBL name generator) from a game
   Step. That runs on the engine worker in the middle of native mutation, inside
   nested loops (`:56`, `:61`), so it makes one sequential HTTP GET per rookie.
   [UtilServerHttpClient.java:126-133](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/UtilServerHttpClient.java)
   sets only a 10 s connect timeout. It sets no socket timeout and no
   connection-request timeout, so the read has no time limit.
   *Scenario:* the name-generator host accepts the connection and then stalls.
   Every match freezes, the same failure #504 describes, and the stall happens
   between native mutation and the checkpoint.
   The request asks the ADR to "enumerate … other potentially blocking paths", but
   its evidence list and risk table cover only the four filed tickets.
   *Fix:* add this path to Context and evidence and give it a risk-table row. Its
   owner is a new ticket, or the row marks it "unowned; file before acceptance".
   Also require the ADR's list to come from a code sweep of all I/O the worker can
   reach, not from the audit's findings.
2. **The Fortuna description is wrong.** The request (Preconditions, Fortuna
   bullet) says "One synchronized method". [Fortuna.java](../../ffb-server/src/main/java/com/fumbbl/ffb/server/util/rng/Fortuna.java)
   has two, `rekeyGenerator` (`:110`) and `addEntropy` (`:137`). `getByte` (`:92`),
   `getDieRoll` (`:101`) and `generateRandomData` (`:121`) are not synchronized.
   *Fix:* "The synchronized rekey and entropy methods do not make the
   unsynchronized generation path (`getDieRoll`, `getByte`) safe for concurrent use."
3. **Name the mutable statics exactly.** `RULER_WIDTH` is in
   [UtilPassing.java:15](../../ffb-common/src/main/java/com/fumbbl/ffb/util/UtilPassing.java),
   not `Constant`. The current sentence groups both files, so it is not strictly
   wrong. Listing each item makes the audit scope concrete: `UtilPassing.RULER_WIDTH`;
   `Constant.REPLAY_NAME_MAX_LENGTH` and `Constant.MINIMUM_MOVE_TO_STAND_UP`
   (writable `static int`); and the mutable double-brace `HashSet`s in `Constant`.

## Judgement calls

4. **The evidence omits one fan-out site.** #507 lists
   `BrowserV2Adapter.preparationChanged` as a per-recipient reauthorization site.
   The request's Context names only the `ActiveMatchPublisher` loops, and its risk
   row says "per publication recipient". Name `preparationChanged` as well, so the
   ADR's fan-out boundary covers it.
5. **"Obstruct shutdown" is vague.** `ServerCommunication.shutdown` waits 20 s and
   then throws
   ([ServerCommunication.java:63](../../ffb-server/src/main/java/com/fumbbl/ffb/server/net/ServerCommunication.java)).
   The ADR should record that bound, and that a stuck worker thread is still
   running after the timeout.
6. **When is the request complete?** Deliverable 1 stops at a *proposed* ADR, but
   the acceptance criteria require recorded maintainer acceptance. Split the
   criteria into "draft ready for maintainer review" and "accepted". That stops the
   request being reported complete when only the draft exists, and makes the gate
   before #504–#508 clear.
7. **A proposed ADR is listed under "Invariants to check in review".** That
   heading and the "Accepted ADRs stand" bullet suggest the rule is enforced.
   Prefer adding the map line only on acceptance. Otherwise, keep the explicit
   "proposed, not yet enforced" marking the request already requires. The risk is
   low either way.

## Checked, no issue

- The caveat that the queue is not globally bounded.
- The claim that lanes reorder work but do not preempt it.
- The watchdog's limited role.
- The disclosure that the audit file is missing.
- The question of whether JDBC counts as network I/O.
- Preservation of ADRs 0002, 0004 and 0005.
- #504's timeout values, which are correctly flagged as proposals.
- The template sections and header fields.
