# Cold-storage preservation — November 9, 2026

Completed `2026-11-09T06:01:11.055719+00:00` from local HEAD `53edb476af880091bbb88a26e36913f686257ee5`.

Created and verified **69,836 file copies in 620 provenance tar.gz archives**. Source data: **16.804 GiB**. Tarballs: **15.336 GiB**. Compression reduced the byte count by **8.7%**. Metadata is additional.

**Original candidate files removed: 0.** The original project files remain. Only newly generated, verified staging tarballs were moved to the network share, and a failed generated temporary tarball was discarded after a verified retry. This preservation pass does not reclaim disk space occupied by original files.

## Location and Git handling

- Project-root `cold-storage` is a Windows directory symbolic link to `\\192.168.1.250\gdrive\coding\cold-storage`.
- `.gitignore` ignores both the link and a directory at that root path. The link is not tracked; Git does not traverse it for content.
- Batch: `cold-storage/fumbbl-rebuild/2026-11-09/batch-20261109T050910Z/`.
- The older Drive-linked `archive/` and its contents were left intact and were not traversed.

## Stored groups

| Provenance | Archives | Source files | Source GiB | Tarball GiB |
| --- | ---: | ---: | ---: | ---: |
| nginx-runs | 1 | 299 | 0.001 | 0.000 |
| notes | 148 | 1,801 | 0.305 | 0.232 |
| preservation | 50 | 10,017 | 6.656 | 6.415 |
| scratch | 405 | 57,566 | 9.757 | 8.601 |
| test-evidence | 16 | 153 | 0.085 | 0.088 |

The nginx archive preserves **100** selected run directories in their original paths. Recently active runs and the installed nginx binary were held out.

## Scope and holds

This is a selective historical preservation batch, not a complete checkout backup or a runnable deployment. It follows the November 8 inventory and a fresh local process/worktree check. New files after that inventory are outside the batch.

- Retained registered worktrees, pending local work, live-process paths, credentials/sensitive-state holds, current runtime data and maintained deployment source.
- Held whole provenance groups with activity within the 24 hours before planning; independently held recently modified root files and changed metadata.
- Omitted most regenerable dependency/build caches, assembled output and duplicate toolchains. Some older preservation bundles already contain compressed or redundant material.
- Metadata checks initially held 1,576 unreadable files (about 35 MiB), all in a saved scratch Python installation. A later file-open denial required rebuilding the diagnostic archive without another 315 installed Python files (about 100.5 MiB). The surrounding 12,741 diagnostic files were successfully archived. No permissions or ownership were changed.
- Files still referenced by current documentation may be present as archival copies; their originals and live links remain in place. No archived source is automatically certified safe for removal.

## Catalog and recovery

The network batch contains `README.md`, `catalog.json`, `plan.json`, `excluded.csv`, `plan-revisions.json`, `runtime.json`, `publication.json`, the archival procedure, verification test results and `SHA256SUMS`. Every tarball also contains `_cold_storage/manifest.json` with per-file hashes and original paths. The local audit and completion record are in `.tools/cold-storage-20261109/`.

Restore individual tarballs into new empty directories, compare against the catalog, then selectively copy recovered files. Do not extract over an active checkout or run historical deployment procedures as current instructions. The network README includes listing, hash-checking and extraction examples. These archives preserve file bytes and ordinary tar metadata, not a complete Windows ACL/system backup.

## Retention judgment

**A one-time insurance copy is reasonable; indefinite accumulation of all this material is not.** Compression saved little because much of the payload was already compressed or consisted of rendered images and earlier bundles.

- Keep unique decisions, original artwork/generation inputs, unresolved failure reproductions, unmerged patches and minimal acceptance/recovery evidence. Exact accepted deployment binaries can be worth keeping when rebuilds would differ.
- `.tools/archive-pre-history-rewrite.bundle` is a specific high-value exception: about 1.31 GiB of pre-rewrite Git history. Its `git bundle verify` format/prerequisite check passed and reports complete history. Keep one verified copy with its provenance.
- The 69,836 archived paths contain only **16,696 distinct file contents**. About **6.821 GiB** of source bytes repeat identical content (not a direct estimate of compressed storage savings). The records include 17 identical Maven download ZIPs and two identical baseline tar files. Some nested caches remained inside historical snapshots; they do not merit permanent retention. Detailed equality records are in `content-duplication.json`.
- Successful test logs, superseded captures, old nginx run directories, copied source trees already recoverable from Git, installed tools and dependency caches normally do not justify permanent retention. Caches should be regenerated when needed, rather than repeatedly archived.
- Treat ordinary scratch/log archives as 90-day insurance. After that, retain only archives with a named recovery or investigation purpose. Avoid new archives of older archives; use this catalog to find the existing copy.
- A later cleanup should clear inactive regenerable caches first and then verified redundant originals. That requires separate deletion authorization; this request was handled as preservation only. Unique work also needs an independent backup if this network location is its only remaining copy.

## Verification

All 620 tarballs passed local payload-hash and gzip-CRC read-back. All network copies then passed whole-tarball SHA-256, payload-hash, member/index and gzip-CRC validation before the generated staging tarballs were cleared. Small audit records were also hash-compared after transfer. Integrity checks rejected altered payloads, unsafe links, truncated gzip streams and incorrect whole-archive hashes.

The publication set exactly matches the revised allowlist, every planned original still exists, Git ignores the cold-storage link, no link is tracked, local main HEAD is unchanged and `git diff --check` passed. Application builds/tests were not run because no application code or maintained deployment configuration changed.

An unrelated untracked review document, `docs/reviews/2026-11-08-risk-map.md`, was present in the initial Git status but absent at the final check. It was outside the archival allowlist, and this procedure did not write or remove that path. That unrelated change was left alone.
