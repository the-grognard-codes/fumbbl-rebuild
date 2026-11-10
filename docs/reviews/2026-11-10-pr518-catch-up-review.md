# PR #518: catch-up review revisions

Base: `e6944de3f5cc2eead052632ba6da622d0740b1c7`. These revisions supersede the
previous report's claim that waiting for a later publication is adequate recovery.
No merge or remote deployment is authorized or performed.

## Dispositions

1. [Dropped turn handoff](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137402): **accepted**. A retained enrollment does not guarantee another action; the opponent may be waiting for the lost prompt. The publisher now retains only undelivered recipients and automatically retries without another action.
2. [Deferred full time](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137581): **accepted**. The final public snapshot is retained for eligible spectators, delivered after fresh local authorization, and then their enrollment is removed. Immediate removal alone was not chosen because it would still lose the result.
3. [Transient database unavailability](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526137800): **not adopted under the accepted security contract**. `Unavailable` does not prove revocation, but it also cannot establish current local authority. The #507 functional requirements explicitly say errors use "existing unavailable/removal behavior" and that a "local authorization/database failure" stops pushes. Request-allowance exhaustion is separately specified. Treating every `SQLTransientException` as deferral would change that agreed failure policy and conflate unrelated failures (including transaction retry semantics) with request scheduling. `Unavailable` therefore remains fail-closed retirement, with a regression covering all three families. This is a policy choice, not a claim that transient failure proves revocation.
4. [Lost partial chat](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138011): **accepted**. Undelivered recipients receive the retained page automatically; recipients already sent it are removed from the pending list. Subsequent publications join the same FIFO and cannot overtake it. No chat mutation is replayed.
5. [Heal breaker on denied identity](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138251): **rejected as incompatible with the accepted #504 requirement** that "ordinary denied identities do not masquerade as provider recovery." That requirement explicitly keeps the breaker open until validated success. The existing implementation releases the probe immediately without restarting cooldown; another identity can probe at once. A non-availability response is not necessarily a successful complete key/credential/revocation operation. Future parallel provider callers would require a reviewed policy change; their hypothetical addition does not justify changing this contract now.
6. [Catch ordering](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138444): **accepted**. `PublicationDelivery` owns the defer-versus-retire decision for all three families. Recipient-specific projection remains at the caller. A sealed role outcome would not cover JDBC exceptions from projection or enqueue and is unnecessary with one dispatcher.
7. [Exception signatures](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138625): **accepted**. `publication` and `publicationRole` declare and document `PublicationDeferred`, distinguishing budget exhaustion from denial.
8. [Duplicate JDBC classification](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/518#discussion_r4526138801): **accepted**. Only the dispatcher's classifier handles `PublicationDeferred`, `NotStarted`, and `DeadlineExpired`. Batch and projection failures use that same decision.

## Security and scheduling

The original request retains its one absolute deadline. Catch-up is a separate,
coalesced `CONTROL` task on the same engine worker, scheduled by the existing
watchdog once per second; this is not a delivery-latency guarantee. Its queue and
execution time/overruns are included in existing worker metrics. No native
mutation, token refresh, Firebase call, stale authorization grant, or parallel
engine owner is introduced.

Each nonempty attempt uses one fresh local authorization batch for at most 16
remaining enrolled recipients. Final enqueue still checks the original token
expiry and current attempt's budget. Replaced/disconnected/explicitly rejected
enrollments are discarded. Generic SQL errors and known local/expiry denials
still remove recipients. Full-time snapshots remain available even after active
match discovery no longer includes the match.

The FIFO is capped at 64 pending publications and 4 Mi UTF-16 code units of
retained serialized payload (including conservative reservation for each optional
transcript cache), plus bounded recipient metadata. Overflow explicitly sends
unavailable and removes affected enrollments. Pending entries then prune those
enrollments on the next control task. There is no unbounded task-per-recipient
scheduler or indefinite silent loss. A sustained worker stall still delays all
work, as documented by ADR 0006.

## Validation

Independent standards and spec follow-ups both **APPROVE**, with no remaining
actionable findings. Standards review found and prompted a fix for ordinary
gameplay re-enrollment dropping deferred chat: a socket enrollment identity now
survives same-session/match/audience refreshes, while state still yields to a
newer direct load. Removal, disconnect or switching breaks continuity. Both
continuity and leave/rejoin regressions pass. Reviewers ran no builds or tests.

- Focused catch-up/transport/timing/transcript suite: **75 tests passed**, no skips,
  failures or errors (`.tools/pr518-catchup-focused-r4.log`).
- Initial focused run exposed publication timing omitting send-failure cleanup;
  timing now wraps the central attempt, and the unchanged timing regression passes.
- Fresh full verification, browser gate, real provider/JDBC and dev-local results
  will be recorded here after completion. Historical evidence is not relabeled.
