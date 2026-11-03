# Historical report cleanup

Audited tracked and untracked surviving Java source against each class name and namespace-qualified ReportId reference. The following reports had no surviving emitter or Java reference outside themselves. At the branch base, all gameplay emitters were in deleted older-edition packages; ReportGameOptions explicitly existed only for old-format compatibility. Existing artifact compatibility was waived.

| Removed source | Serialized ID | SHA256 before removal |
| --- | --- | --- |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportBiteSpectator.java` | `biteSpectator` | `c5d9eb8e1025c5ffdaf222fe854d3ff928b524faaefee33f1396d8857e2c150c` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportBombExplodesAfterCatch.java` | `bombExplodesAfterCatch` | `28d6195c535d0fd65491024f30a2f74dba61e215bd4e45a2c8d6f0798ec2fd1f` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportCardEffectRoll.java` | `cardEffectRoll` | `e5d1b09bd787e061cb4d002a70deaa00a32d97601f43086fdf4baa214965b82c` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportGameOptions.java` | `gameOptions` | `cf93836e5279c14de65012930549f601434eab6d381acb806f52d2492d4115e7` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportPassDeviate.java` | `passDeviate` | `7d938c3b18f568ba5b17504b52b5f8cdd65ece152c91d5ba5a0bfcbeda91c4d4` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportPettyCash.java` | `pettyCash` | `acaa34062fa486351ca4e1ad022e3237e698a8d3c64942a81a7b5372ce33b713` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportPilingOn.java` | `pilingOn` | `241d32f3b3e716222f8dbf3bea905defb046b8303a9d2c6e7de092522761e8e0` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportSafeThrowRoll.java` | `safeThrowRoll` | `cc3ebe4edf6e78f05292e70479ffee8500faf11b86893de94f685f44500245c4` |
| `ffb-common/src/main/java/com/fumbbl/ffb/report/ReportWeepingDaggerRoll.java` | `weepingDaggerRoll` | `0ae46b445439a05c4a9939815d84eacafa8a45699e7efa06585724fc6e79faa8` |

Removed the corresponding ReportId declarations and browser scalar-roll recognition for safeThrowRoll, weepingDaggerRoll, cardEffectRoll and bombExplodesAfterCatch. The petty-cash log handler now recognizes only the surviving freePettyCash report. Generic gameOptions JSON, current petty-cash rules and other namespaces remain.

Also removed ReportId.SPECTATORS, KICKOFF_OFFICIOUS_REF, KICKOFF_THROW_A_ROCK and NO_PLAYERS_TO_FIELD after a full identifier search found only other namespaces (step IDs, JSON fields, animations and a turn mode). Their independent current concepts are preserved.

The original 632-entry registration snapshot is unchanged. Bb2025RegistrationTest subtracts these nine dead registrations explicitly and retains the previously documented Kick Team-Mate addition; any other registry drift still fails.

Validation delegated to the parent after this slice: no Maven or browser tests run during concurrent reactor execution.
