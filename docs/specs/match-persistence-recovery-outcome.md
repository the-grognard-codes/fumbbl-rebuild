# Match persistence recovery for issues 525 and 532

## Scope

- [Issue 525](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/525) covers operator diagnostics and bounded computer-coach recovery.
- [Issue 532](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/532) covers cold loading a long durable match and reconciling its final decision after a refused result write.

## Reproduction

A timed 14-minute dev-local baseline played 119 home decisions in one AI match. At revision 488, a movement returned `PERSISTENCE_FAILED` after 2,297 ms. The trace shows the recovery checkpoint's JDBC commit completed about 965 ms into the request. Two subsequent human loads returned failed responses at 2,036 and 2,176 ms, with zero time in native reconstruction. The 2,036 ms trace shows a JDBC connection attempt at 2,035 ms after reading and processing a large completed preparation. A later direct computer load failed at 2,766 ms. The original issue's revision-275 match was unavailable on this instance.

After reordering JDBC reads, the same live match returned `RECOVERY_CORRUPT`. Read-only inspection found a valid revision-488 checkpoint checksum and matching result events, transcript, and chat. The checkpoint retained a movement route after full time. The native regression reproduced the rejection with a valid terminal checkpoint carrying a leftover route, and the corrected deserializer restored the retained match at revision 488 with an equal completion artifact.

## Implementation and review

- Log safe SQL diagnostics once at each setup persistence mapping. Unknown driver messages may contain game data and are redacted. Correlation fields and known internal messages remain available. The computer coach waits one, two and four seconds and reloads before choosing. An unanswered request still uses the exact original request ID and payload.
- Close the consistent JDBC snapshot before checkpoint decoding and journal assembly. Read preferences before native reconstruction. An active cold load returns the durable view and leaves restore maintenance and abandonment for the next resident request. A failed checkpoint still discards the changed engine and leaves the last durable generation authoritative.
- Complete the already-authorized preparation with a compare-and-swap. A deadline refusal after the final checkpoint returns `COMPLETION_PENDING`. The engine worker retries at most one eligible resident result per timer tick under the existing 2,000 ms budget, even without a coach reconnecting. Each failed timer attempt logs `pending-completion` with the match ID. Retry delays double per match from one second to a 60-second cap. Completed setup reads fetch the checkpoint once before full result validation, and computer setup checks registered membership before verifying the frozen computer coach.
- Clear pending movement and activation when native play reaches full time. Older terminal checkpoints may still contain structurally valid continuation data, so recovery drops it after verifying the terminal state. Active continuations retain their native validation.

## Verification

- The long fixture restores revision 275 from a checkpoint larger than 440 KiB plus seven real journal entries. It refuses a write at the JDBC allowance boundary, cold-loads the prior revision, commits a retry once, and verifies exact duplicate handling.
- Native terminal regressions cover a refused result write across restart, unknown commit reconciliation and completed projection parity. The browser unit suite passed 539 tests. The computer-player suite passed 52 tests, including bounded retry and lost acknowledgements.
- The seven-hour acceptance soak remains separate from the short baseline and the startup checks.
