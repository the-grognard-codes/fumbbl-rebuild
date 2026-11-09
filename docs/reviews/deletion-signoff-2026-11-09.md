# Deletion proposal for final signoff — November 9, 2026

**Awaiting user signoff. No files have been deleted.**

Recommend approving **A + B: 28,133 local files containing 4.409 GiB**. Sizes are logical file bytes; physical disk space reclaimed can differ because of allocation, compression or hard links.

This proposal removes local originals and redundant scratch copies only. It does not purge cold-storage tarballs, the Drive-linked archive, Git history, branches/worktrees, containers, images or volumes. The suggested 90-day review of ordinary cold-storage archives would be **2027-02-07**; no expiry or deletion is scheduled.

## Approval choices

| Choice | Files | Logical size | What would be removed | Recovery |
| --- | ---: | ---: | --- | --- |
| **A — archived redundant originals** | 24,234 | 4.075 GiB | 23,683 redundant copies; 255 successful logs; 99 inactive nginx run directories (296 files) | Verified cold-storage tarballs; each duplicate also has Git/canonical/retained-copy evidence |
| **B — regenerable duplicate tool/build output** | 3,899 | 0.334 GiB | 490 files in the redundant optional-skill JDK copy, plus 3,409 legacy parity-build target files | JDK files exactly match the retained pinned installation; build output is regenerable. These cache bytes were not archived |
| **A + B — recommended** | **28,133** | **4.409 GiB** | Both sets above | Both recovery policies above |

Approval of **A** means all three `A-*` categories in the frozen file list. Approval of **B** means only `B-regenerable-caches`. Neither choice authorizes deleting whole nonempty directories or adding more paths later.

## Largest affected locations

Counts below are exact file subsets, not permission to wipe the named directories. Held and newly created files in those directories remain.

| Location | Choice | Files proposed | Logical GiB |
| --- | --- | ---: | ---: |
| `.tools/git-cleanup-20261008` | A | 7,983 | 1.916 |
| `.tools/remote-release-20261030` | A | 6,355 | 1.220 |
| `.tools/optional-skill-toolchain` | B | 490 | 0.320 |
| `.tools/tooling checks` | A | 1,613 | 0.296 |
| `.tools/(root files)` | A | 77 | 0.109 |
| `.tools/r1-java8-parity` | A | 5,255 | 0.105 |
| `.tools/remote-release-20261106` | A | 629 | 0.073 |
| `.tools/archive` | A | 203 | 0.033 |
| `.tools/delivery-evidence` | A | 165 | 0.030 |
| `.tools/roster-portrait-export` | A | 12 | 0.021 |
| `.tools/r1-java8-parity` | B | 3,409 | 0.014 |
| `.tools/blitzer-trial-input` | A | 8 | 0.014 |

The complete list additionally covers the 99 nginx runs, small archived logs and other exact duplicate scratch files. The full per-directory breakdown is in `groups.csv`.

## Exact scope to approve

- [Exact file list](../../.tools/deletion-signoff-20261109/proposed-files.csv): every path, category, byte count, modification timestamp, SHA-256, reason and recovery/archive evidence.
- [Grouped summary](../../.tools/deletion-signoff-20261109/groups.csv): directory-level totals.
- [Retained duplicate keepers](../../.tools/deletion-signoff-20261109/retained-keepers.csv): the verified local originals that must remain.
- [Held files](../../.tools/deletion-signoff-20261109/held-files.csv): exclusions and reasons.
- `plan.json`, `summary.json`, `runtime.json`, `reference-holds.csv`, `backup-check.json` and `validation.json` in the same ignored audit folder hold the supporting evidence.

Frozen `proposed-files.csv` SHA-256: **`d2e57e49070c6944b612f09d5891156b508839e2fe56415a0915fa3561f84572`**.

## What stays

- All 620 cold-storage tarballs, their catalogs/checksums, the older Drive archive and the local audit records.
- `.tools/archive-pre-history-rewrite.bundle` (about 1.31 GiB), unique patches/generation inputs, unresolved/uncertain failure evidence, and unique original artwork. Exact redundant copies may appear in A only where a verified local keeper remains.
- The **3,199 explicitly retained local keeper files** used to establish additional duplicate removals. No keeper is in the deletion list.
- Every tracked project file, tracked note and test fixture/evidence file. Notes still linked from current documentation are not being removed in this batch.
- Registered worktrees `.tools/release-v0.1.11` and `.tools/worktrees/idle-panning`, including their pending work.
- The active/pinned JDK, Maven installation/downloads/dependency cache, installed nginx, process-owned `.tools/exports`, current application dependencies and runtime/sensitive state.
- Files used by configured container bind mounts, including stopped containers, and paths/groups referenced by maintained code or documentation.

Specific deferred examples: `.tools/coach-oriented-match-ui` is used by the acceptance compose configuration and test tooling; `.tools/pan-diagnosis` is linked by the idle-panning outcome; `.tools/optional-skill-build` is linked by its outcome report; `.tools/validation` is used by current test/CI tooling. Consolidating those records and references is separate work before any broader removal.

## Holds within the inspected candidate scope

These totals cover the archived originals and selected old cache files inspected for this proposal, not every file in the repository.

| Hold reason | Files | Logical GiB |
| --- | ---: | ---: |
| Incoming maintained code/document reference to file or provenance group | 63,859 | 7.355 |
| Unique/uncertain snapshot, artwork, failure evidence or output: curation required | 4,064 | 3.524 |
| History bundle, patch, original art or generation inputs: retain | 50 | 2.289 |
| Original inventory hold | 7,569 | 0.250 |
| Tracked project/evidence file: keep; document/reference migration is separate work | 1,074 | 0.226 |

## Verification and execution boundary

Each proposed original was read and hashed, with size/mtime stability checked. A paths match their archived payload SHA-256. Duplicate evidence comes from retained clean canonical files, byte-identical Git blobs reachable from local main, or explicitly retained local keeper copies. Successful-log classification requires a positive completion marker without a detected failure marker in the inspected tail; uncertain/failure-named logs were held.

The 175 backing tarballs required by A are present with expected sizes and published checksum-index values; the network catalog hash was rechecked. Their complete payload read-back verification was performed during the earlier archival pass at `2026-11-09T06:01:11.055719+00:00`. This proposal did not reread all archive payloads.

Working-copy HEAD: `53edb476af880091bbb88a26e36913f686257ee5`. Cached `origin/main`: `e9ed91bf81387508bc6785b74004f46af44291cc`. The working copy was not updated or merged. References were checked for the current working copy; a newer checkout requires a fresh reference check.

After signoff, execution must recheck actual archive hashes, source size/mtime/SHA-256, retained recovery copies, Git status, incoming references, worktree registrations, process ownership and mounts. Any changed or newly needed file is skipped and reported; no replacement path is added automatically. Only exact approved regular-file paths may be removed. Empty candidate parent directories may then be pruned only if actually empty, unmounted and within the workspace; nonempty directories and reparse points are never recursively removed.

Approval phrases: **“Approve A + B”**, **“Approve A only”**, or identify specific exclusions. This document and its audit scripts perform no deletions.
