# PR #518: fair retry admission and delivery recovery

Baseline: `867a3994254e99e239c5b2844887a9a7c6ff2cf9`.
Runtime: `ba9cb1e267ecd6d2d4811726167ea979b775d66f`.

## Dispositions

- [4529047724](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529047724): **accepted**. A typed deferral spends the retry allowance only when its attempt began with at least 500 ms remaining. Short attempts may still succeed. Coalescing carries only counted deferrals; it never grants a new request deadline. Regression: A consumes 1,900 ms on each control task; B repeatedly receives only 100 ms and retains all its retries, then delivers when it receives a fresh allowance. Separate coverage tests repeated late inline states, inherited deferrals and the exact 500 ms boundary.
- [4529047945](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4529047945): **accepted**. At the retry limit, release the retained payload and send `publicationDelayed` / `PUBLICATION_DELAYED` with the match ID and family. Keep enrollment and the existing board. The browser requests fresh setup/load, watch or preparation state; the mounted chat view pages its missing durable history. Computer clients also request a fresh setup view. Duplicate state/preparation notices coalesce while a read is pending. **The silent-drop alternative is rejected**: preserving enrollment alone cannot recover a final handoff when no further publication occurs, recreating the earlier lost-state defect.

## Self-review and security

The notice carries only the already-enrolled match ID and publication family,
never state or an authorization grant. Its projection has exactly six fields;
unknown/private fields, invalid family/code/ID and correlated notices are rejected.
Foreign-match notices cannot change the selected view. It does not acknowledge or
replay an uncertain mutation. Fresh reads follow existing incoming provider,
local authorization and token-expiry checks. The browser continues to clear the
board on actual `VIEW_UNAVAILABLE`; server denial, expiry, database failure and
retention overflow keep their prior fail-closed removal behavior. Passive
publication itself still performs no provider work. The 500 ms threshold only
controls failure counting; it is not a new allocation or delivery guarantee.

The prior report's unavailable-at-retry-limit description is historical and
superseded by this correction. Provider bounds, cache policy and JDBC transport
are unchanged. No merge or remote deployment occurs.

## Validation

- Focused server: **96 tests**, zero failures/errors/skips, including all publication families and preserved enrollment after exhaustion. Later publications still require one fresh local batch and zero provider calls.
- Browser units: **534 passed**. Focused client/projection run: **59 passed**.
- Computer transport: **9 passed**, including a fresh read after delayed large-state delivery.
- Mounted production-browser regression passed both optional-history variants, retained the live pitch while the fresh read was deliberately held, then recovered durable delayed chat.
- TypeScript/Vite build passed after correcting an explicit null guard caught by the first compile; no runtime policy changed for that correction.
- Clean pinned `tools/target-build.ps1 verify`: **1,111 tests**, zero failures/errors, **20 expected opt-in skips**, **15m44s**.
- Full browser gate: **83 suites passed**, **717.5 seconds**, two workers, runtime `ba9cb1e26`. Reports: `.tools/validation/local-browser-hdJfs8`. Existing mounted reconnect UI checks also passed.
- Combined actual Firebase/JDBC/socket boundary: **111 passed**, no skips. Cold authentication **898 ms**, OAuth refresh **249 ms**, late-lock refusal **1,854 ms**, JDBC allowance **698 ms**. For each of STATE/CHAT/PREPARATION, 0/1/16 targets used **0/1/1 queries**; 16-target batches took **9.4-10.1 ms**. Sixteen real sockets used 13 state targets, 13 chat targets and one preparation target, with **zero provider fan-out calls**.

Logs remain in ignored `.tools/pr518-round5-{focused,browser,browser-all,computer,ui-r2,browser-build-r2,browser-gate,verify,real-provider-jdbc,reconnect}.log`.
The prior dev-local startup and three-party live smoke belong to `72b8802cf`;
this round uses the current full browser gate and actual provider/JDBC/socket suite
without repeating those startup/gameplay smokes. They are not represented as fresh results for this revision. The
previous native-profile authentication timeouts and unexplained UI initial wait
remain documented validation limits. This round changes no provider transport
or incoming freshness behavior.
