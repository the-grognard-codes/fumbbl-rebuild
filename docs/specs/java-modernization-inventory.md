# Feature: Optional Java source modernization after the Java 21 migration

## Abstract
Backlog inventory prepared on 2026-10-30 against main revision
`a5f9bcf8cdf7ca3298453e401a40dc871e58a374`. The owner chose a focused Java 21
baseline migration now and requested this separate inventory for later review.
This document does not authorize implementation of the optional refactors.

## Objective
Select small, behavior-preserving Java source improvements with a concrete
maintenance benefit after the Java 21 baseline is verified.

## Context / Existing Behavior
The reactor still targets shared modules at Java 8 while the server and standalone
game service target Java 21. The current migration removes older-JVM build and
runtime requirements. Ordinary Java syntax that works on Java 21 needs no rewrite.
Historical documentation remains truthful; current operational instructions change.
Compatible third-party dependencies may continue to contain older bytecode.

## In Scope
Review the candidates below individually, recheck their locations against current
main, and select a bounded subset before creating implementation slices.

| Priority | Candidate and source evidence | Benefit | Risk and validation needed |
| --- | --- | --- | --- |
| First | Pattern binding in `ffb-common/src/main/java/com/fumbbl/ffb/factory/CatchModifierFactory.java:32` and comparable modifier factories | Remove repeated type checks/casts with minimal structural change | Preserve empty results, registration and each ruleset's independent implementation. Add focused Catch coverage if selected; existing adjacent coverage is `DodgeModifierFactoryTest`. Run relevant native rules tests. |
| First | Switch expression in `ffb-common/src/main/java/com/fumbbl/ffb/Direction.java:27` | Express the direction transform as a direct value mapping | Preserve every direction mapping, including unchanged NORTH/SOUTH. No focused `DirectionTest` exists; add exhaustive mapping coverage before refactoring. Run relevant state tests. |
| First | Private immutable carrier in `game-service/src/main/java/com/fumbbl/gameservice/InvitationStore.java:107` | Consider a record for the private four-field `Record` carrier | Preserve expiry sentinel, nullable claimed account and claim/reissue transitions. Verify it remains internal and outside serialization contracts. Existing `InvitationStoreTest` covers store behavior. |
| Later | SQL text blocks in `ffb-server/src/main/java/com/fumbbl/ffb/server/match/JdbcMatchRepository.java:48` and `JdbcMatchMembershipRepository.java:44` | Make SQL easier to read and review | Preserve SQL contents, whitespace where asserted, parameter order, locking and database dialect. Run `JdbcMatchRepositoryTest`, `JdbcMatchMembershipRepositoryTest` and corresponding MariaDB acceptance checks. |
| Later | Direct string mappings in `ffb-common/src/main/java/com/fumbbl/ffb/PlayerChoiceMode.java:49`, `:151` and `:252` | Replace mutable StringBuilder scaffolding with clear return values/switch expressions | Strings and interpolated player counts reach user interfaces. Preserve exact strings and empty defaults. No focused `PlayerChoiceModeTest` exists; add exhaustive value/argument coverage and relevant presentation fixture checks. |
| Later | Pattern binding in equality methods in `ffb-common/src/main/java/com/fumbbl/ffb/DiceDecoration.java:44`, `MoveSquare.java:54`, `PushbackSquare.java` and `TrackNumber.java` | Simplify existing guard-and-cast syntax | Preserve coordinate-based equality, subclass acceptance, null handling, hash behavior and mutable JSON initialization. No focused equality tests were located; characterize these contracts and JSON round trips first. Do not convert these types to records as part of this cleanup. |

### Conditional compatibility item: tools file encoding
`ffb-tools/src/main/java/com/fumbbl/ffb/tools/UtilFile.java:24` and `:38` use
default-charset FileReader/FileWriter while rewriting sorted property files.
Explicit buffered I/O could improve cross-platform reproducibility, but encoding
is a behavior decision rather than a syntax cleanup. Java 21 defaults to UTF-8;
older Windows runtimes may have interpreted files using a legacy code page.
The baseline migration must assess representative non-ASCII inputs. If a real
compatibility fix is needed, it belongs in that migration; otherwise revisit this
candidate only after agreeing supported encodings. No `UtilFileTest` was found.
Cover Unicode, comments, line endings and failed in-place replacement before a change.

## Out of Scope
- Java baseline, bootstrap, CI and container migration: those belong to the
  separately authorized current Java 21 work.
- Blanket conversion of classes to records, loops to streams, or concurrency to
  virtual threads without a demonstrated benefit and an approved contract.
- Rules changes, protocol or persisted-format changes, UI redesign, and performance
  claims unsupported by measurements.
- Consolidation of independent ruleset implementations or inheritance between them.
- Work already tracked by recovery/performance issues #332, #334, #336 and #363.

## Functional Requirements
- Reassess each candidate against current source and test coverage before selection.
- Keep implementation slices small and independently verifiable.
- Preserve behavior, serialization, ordering, exception behavior and ruleset scope.
- Record rejected candidates and their reason instead of forcing a newer construct.

## Acceptance Criteria
- A maintainer selects a specific subset and records why each change helps.
- Each selected slice has an issue, source ownership and focused validation plan.
- Existing contracts are characterized before changes that could affect them.
- Required native, browser and game-service checks pass for implemented slices;
  exact results and any unverified paths are recorded.
- Deferred candidates remain visible without implying they are required to finish
  the Java 21 baseline migration.

## Constraints
Use a new working branch for future implementation and preserve unrelated changes.
Do not commit, push, deploy, or change live services without separate authorization.
Keep game mechanics, public interfaces and stored match data compatible.

## Implementation Guidance
Start with modest pattern-binding or direction mapping changes; evaluate the
private invitation carrier next. Defer broad value-type changes until equality
and JSON contracts have coverage. The ordering above is an initial review order,
not a commitment or an estimate.

## Validation
Candidate test commands, to be run only after a selected implementation:

```powershell
./tools/target-build.ps1 test -Module ffb-common -Test DodgeModifierFactoryTest
./tools/target-build.ps1 test -Module ffb-server -Test 'JdbcMatchRepositoryTest,JdbcMatchMembershipRepositoryTest'
mvn -B -f game-service/pom.xml -Dtest=InvitationStoreTest test
```

New enum, Catch, equality and encoding tests require new selectors. Existing tests
named above have been located; they have not been run for this inventory.
Follow focused tests with the project-required checks for each selected slice.
For recovery/protocol-sensitive changes, verify live-play, replay and recovery
behavior using synthetic fixtures and isolated data, never by modifying retained games.

## Completion Notes
Backlog: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/383

Inventory only. No optional application refactors were made and no execution tests
were required for this documentation/inventory task. GitHub tracks triage and state;
the issue is open with `needs-triage` for later selection.
