# Genuine append compaction failure coverage (#531)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/531

The added SetupApplicationJournalTest variant alternates real save requests and
cancellations until the normal journal path first requests compaction. The
native checkpoint is real, and every continuation is produced by
RecoveryJournal.change through SetupApplication.checkpoint. The test repository
retains the checkpoint and all appended entries, assembling them through
RecoveryJournal.restore for each cold load. It does not forge cursor counts,
hashes or journal metadata. It reaches whichever real byte or entry bound comes
first, because large native records can hit the byte bound before 31 entries.

Both RECOVERY_CONFLICT and PERSISTENCE_FAILED leave the original checkpoint,
continuation list, durable generation and assembled payload intact. The live
cursor must be released. One retry reloads the genuine chain and writes exactly
one compacted generation with zero continuation entries. Reconstructed ordered
recovery payload equals the live payload, and a fresh application returns the
same revision with duplicate: true without another append or checkpoint save.

No production code or stored format changes. No user-visible changelog entry is
needed for this tests-only slice. The branch is independent of #535.

Validation: focused SetupApplicationJournalTest passed all four tests. Full
Maven clean install is recorded in the PR. No soak or dev-local stack is needed
for these acceptance criteria.
