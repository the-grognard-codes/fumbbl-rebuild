# Approved local cleanup — November 9, 2026

Completed `2026-11-09T15:03:11.771246+00:00` after the user approved **A + B** in the [signoff proposal](deletion-signoff-2026-11-09.md).

Removed **28,132 of 28,133 approved files**, containing **4.409 GiB** of logical file contents. Pruned **3,037 empty, unmounted parent folders**. Logical size is not a measurement of physical free-space change; filesystem allocation and other running work can affect that.

## Removed files

| Approved category | Removed files | Logical size |
| --- | ---: | ---: |
| A-nginx-runs | 296 | 0.000914 GiB |
| A-redundant-copies | 23,682 | 4.069583 GiB |
| A-successful-logs | 255 | 0.004515 GiB |
| B-regenerable-caches | 3,899 | 0.334124 GiB |

The removed files were archived redundant originals, successful build/test logs, inactive nginx run files, a duplicate JDK installation and legacy generated build output. Only exact approved regular-file paths were removed; nonempty directories and reparse points were never recursively deleted.

## Retained exception

- `.tools/team-colors-gallery.log` (0 bytes) remains. Windows reported it was open in another process (WinError 32). The process was not stopped and the file was not forced closed.

The retained file was zero bytes, so the logical bytes removed equal the complete approved byte total.

## Preservation and verification

- All **175 supporting network tarballs** were freshly read and SHA-256 verified before deletion (7.621 GiB). Their sizes and modification times were checked again at removal time.
- All **7,852 retained recovery files** passed SHA-256 checks before and after removal. The **3,199 designated local keeper files** remain. Recovery Git objects remain reachable from local main.
- Every removed file was checked for approved path, size, modification time and SHA-256 immediately before unlinking. Runtime processes, configured toolchains, container mounts, worktrees and incoming references were checked again before removal.
- All **620 cold-storage tarballs** remain present at their expected sizes. The pre-history-rewrite Git bundle remains locally and its SHA-256 still matches the preserved payload. The network/Drive archives were not deleted or rewritten.
- No tracked file was deleted. Local HEAD and the pre-existing tracked diff were unchanged by the removal operation. The archive index and this outcome document are updated afterward to record the result.
- The cold-storage symbolic link still resolves to the requested share and is ignored by Git.
- The project toolchain information check still reports **Maven 3.9.9** and **Temurin Java 21.0.11** from the retained pinned installation. `git diff --check` passed. Application build/test suites were not rerun because application code and canonical assets were not changed.

## Audit and recovery

Approved CSV SHA-256: `d2e57e49070c6944b612f09d5891156b508839e2fe56415a0915fa3561f84572`.

- [Exact removed-file list](../../.tools/deletion-signoff-20261109/execution-A-B/deleted-files.csv).
- [Approved scope](../../.tools/deletion-signoff-20261109/proposed-files.csv), including per-file hashes and recovery/archive mappings.
- [Retained local keepers](../../.tools/deletion-signoff-20261109/retained-keepers.csv).
- Execution evidence: `.tools/deletion-signoff-20261109/execution-A-B/` contains the removal journal, result, refreshed runtime/reference snapshots, complete backing-archive hash checks and final verification.

For an archived file, consult the approved/removed CSV to identify its tarball, restore into a separate empty directory using the project-relative path, and compare the recovered SHA-256 with the recorded value before copying it into an active checkout. Category B cache bytes were intentionally not archived; their retained toolchain or archived source project is the recovery basis.
