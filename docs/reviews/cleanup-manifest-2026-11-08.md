# Cleanup manifest — 2026-11-08

Local snapshot: `2026-11-09T04:40:09.359133+00:00`. Checkout: `main` at `53edb476af880091bbb88a26e36913f686257ee5`.

**Assessment only. No candidate files, worktrees, processes, containers or deployments were removed or changed.**

Measured **183,908 regular files, 32.33 GiB logical bytes**, in 446 groups. These are apparent file sizes, not promised reclaimable space; hard links, compression and duplicate copies are not deduplicated.

## Artifacts

The full, machine-local evidence bundle is in ignored `.tools/cleanup-audit-20261108/`. Only this summary is intended as a repository document. Local CSVs include filenames and local-work metadata; review before sharing.

- `files.csv`: one row per measured file, size, modification time, owner worktree, Git status, static references, disposition and reason.
- `groups.csv`: directory totals and mixed-disposition counts, sorted by size.
- `references.csv`: target, tracked referrer, line number and match kind; no source excerpts or secret contents.
- `worktrees.json`: registered worktrees, HEADs, local-main ancestry and tracked/untracked status entries.
- `runtime-observations.json`: read-only host observations, recorded separately from repeatable filesystem measurements.
- `exclusions.json`: untraversed links/Git metadata, nested checkouts, scan failures and reference-scan limits.
- `summary.json` and `inventory.py`: aggregate counts and the inventory procedure.

- `recover-inventory.py` and `recovered-inventory.json`: approved metadata-only recovery for two sandbox-denied directories (no file contents read).

The audit directory and this report are excluded from their own inventory. The script has no deletion operation. A rerun updates its artifacts; runtime observations must be refreshed manually, and prior validation/checksums must be regenerated.

## Largest scratch and historical groups

| Path | Files | Logical size | Tracked | Review size | Holds and reference evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| `.tools/validation` | 29,291 | 5.14 GiB | 0 | 5.14 GiB | review-local-artifact:29291; 140 reference sites |
| `.tools/git-cleanup-20261008` | 9,347 | 4.46 GiB | 0 | 4.46 GiB | review-preservation:9347 |
| `.tools/remote-release-20261030` | 6,639 | 2.52 GiB | 0 | 2.52 GiB | protect-sensitive-state:10; review-local-artifact:6629 |
| `.tools/pan-diagnosis` | 14,676 | 2.49 GiB | 0 | 2.48 GiB | protect-sensitive-state:44; review-local-artifact:14632; 3 reference sites |
| `.tools/release-v0.1.11` | 14,669 | 1.79 GiB | 7,080 | 0.00 GiB | protect-worktree:14669 |
| `.tools/worktrees/idle-panning` | 8,243 | 1.75 GiB | 7,080 | 0.00 GiB | protect-worktree:8243; 1 reference sites |
| `.tools/(root files)` | 1,190 | 1.61 GiB | 0 | 1.61 GiB | keep-toolchain:1; review-local-artifact:1102; review-preservation:87; 90 reference sites |
| `.tools/coach-oriented-match-ui` | 1,105 | 1.05 GiB | 0 | 1.05 GiB | protect-sensitive-state:1; review-local-artifact:1104; 9 reference sites |
| `.tools/worktree-preservation-2026-10-07T04-49-46-547Z` | 273 | 0.81 GiB | 0 | 0.81 GiB | review-preservation:273; 1 reference sites |
| `.tools/optional-skill-build` | 12,483 | 0.64 GiB | 0 | 0.64 GiB | protect-sensitive-state:3; review-build-cache:6339; review-local-artifact:6141; 2 reference sites |
| `.tools/smooth-gameplay` | 370 | 0.53 GiB | 0 | 0.53 GiB | review-local-artifact:370; 25 reference sites |
| `.tools/optional-skill-final-build` | 10,041 | 0.52 GiB | 0 | 0.52 GiB | protect-sensitive-state:3; review-build-cache:3898; review-local-artifact:6140; 2 reference sites |
| `.tools/remove-stadium-crowd` | 711 | 0.40 GiB | 0 | 0.40 GiB | review-local-artifact:711; 6 reference sites |
| `.tools/performance-followup` | 225 | 0.37 GiB | 0 | 0.37 GiB | review-local-artifact:225; 21 reference sites |
| `.tools/optional-skill-toolchain` | 490 | 0.32 GiB | 0 | 0.32 GiB | review-local-artifact:490 |
| `.tools/browser-only-jdk` | 490 | 0.32 GiB | 0 | 0.00 GiB | protect-active-process:490; 1 reference sites |
| `.tools/downloads` | 4 | 0.30 GiB | 0 | 0.00 GiB | keep-toolchain:4; 5 reference sites |
| `.tools/tooling checks` | 1,705 | 0.30 GiB | 0 | 0.30 GiB | review-local-artifact:1705 |
| `.tools/fifth-round-evidence` | 259 | 0.27 GiB | 0 | 0.27 GiB | review-local-artifact:259; 2 reference sites |
| `.tools/hardware-research` | 1,091 | 0.27 GiB | 0 | 0.27 GiB | review-local-artifact:1091; 14 reference sites |
| `.tools/repository` | 4,340 | 0.27 GiB | 0 | 0.00 GiB | protect-active-process:4340; 20 reference sites |
| `.tools/r1-java8-baseline` | 11,095 | 0.25 GiB | 0 | 0.25 GiB | protect-sensitive-state:1; review-build-cache:5835; review-local-artifact:5259; 1 reference sites |
| `.tools/remote-release-20261106` | 717 | 0.20 GiB | 0 | 0.20 GiB | protect-sensitive-state:1; review-local-artifact:716 |
| `.tools/prod-release-20260921` | 6,136 | 0.20 GiB | 0 | 0.20 GiB | review-build-cache:3495; review-local-artifact:2641; 7 reference sites |
| `.tools/jdk8u504-b01` | 447 | 0.19 GiB | 0 | 0.19 GiB | review-local-artifact:447; 2 reference sites |

Review size means bytes labelled for investigation, **not approved deletion**. A group may contain protected files and review candidates; never delete a directory based only on its total.

## Dispositions

| Disposition | Files | Logical size |
| --- | ---: | ---: |
| `keep-project-file` | 7,418 | 1.39 GiB |
| `keep-toolchain` | 37 | 0.31 GiB |
| `protect-active-process` | 5,159 | 0.63 GiB |
| `protect-local-work` | 1 | 0.00 GiB |
| `protect-nested-checkout` | 4 | 0.00 GiB |
| `protect-sensitive-state` | 129 | 0.00 GiB |
| `protect-worktree` | 22,912 | 3.53 GiB |
| `review-build-cache` | 35,338 | 1.11 GiB |
| `review-deployment-source` | 67 | 0.00 GiB |
| `review-generated-deployment` | 1,284 | 0.26 GiB |
| `review-generated-output` | 1,795 | 0.65 GiB |
| `review-local-artifact` | 95,371 | 16.97 GiB |
| `review-notes` | 4,052 | 0.71 GiB |
| `review-preservation` | 10,075 | 6.66 GiB |
| `review-test-output` | 266 | 0.12 GiB |

All `review-*` labels require human/provenance review. `protect-*` and `keep-*` labels are holds. Age is an informational sort key only; recent files can be redundant and old files can remain essential.

## Worktree and runtime holds

- `.`: `main`, HEAD `53edb476af88`, 2 status entries; HEAD ancestor of local main: `True`. Ancestry alone does not account for uncommitted or ignored files.
- `.tools/release-v0.1.11`: `fix/prod-camera-drag-capture`, HEAD `8b991cbd0785`, 0 status entries; HEAD ancestor of local main: `False`. Ancestry alone does not account for uncommitted or ignored files.
- `.tools/worktrees/idle-panning`: `detached`, HEAD `d430b9f362fe`, 23 status entries; HEAD ancestor of local main: `True`. Ancestry alone does not account for uncommitted or ignored files.
- Live Java/Maven processes referenced `.tools/browser-only-jdk`, `.tools/apache-maven-3.9.9` and `.tools/repository`; a live Python process referenced `.tools/exports`. Those paths are held.
- No running nginx processes or Docker containers were observed. This is a point-in-time local check, not proof that all related files are obsolete. The current local review launcher selects `.tools/nginx-1.30.5/nginx.exe`; nginx installations are held.
- Build/dependency output is review-only while builds are in progress. No remote runtime, database, cloud resources, Docker volumes or stopped-container mounts were inspected.

## Deployment and notes evidence

- **102 temporary `.tools/local-nginx-*` directories**, 305 files and 0.97 MiB total, are individually listed in `groups.csv`. These are review candidates for generated per-run configs, logs and PID files. Confirm each run is inactive and its evidence is no longer needed; retain the installed nginx binary and maintained configuration templates.
- `deployment/game-service/proxy/dev.nginx.conf` is read by `integrated-test.mjs`, `render-dev-host.mjs` and `test.mjs`. `local.nginx.conf` is read by `local-test.mjs` and `start-local.mjs`. Keep both pending a complete retirement decision.
- The proxy README identifies `correct-empty-prod-package.sh` and installation procedures as dated, one-shot procedures. This is a retirement-review candidate, not proof that recovery/runbook references can be discarded. Confirm completion and preserve durable recovery guidance first.
- Tracked documentation, deployment runbooks and tooling still reference `.notes/overhaul-analysis/verification/`. Consolidate current operating knowledge and rewrite links before removing historical evidence.
- `test-output/` contains tracked evidence despite its ignore rule. Tracked fixtures, screenshots and ignored output have distinct Git handling; check the file-level status rather than treating the whole directory as disposable.
- `ARCHIVE.md` describes the October 18 preservation inventory. `archive/` is an external Drive link and was not followed. Archive existence, checksums and coverage were not reverified; no duplicate is yet certified removable.

## Proposed cleanup order

1. Review the largest `.tools` groups for completed validation runs and reproducible snapshots. Check unique edits, reproduction inputs, running builds and nested Git metadata. Produce an explicit file allowlist after review.
2. Review preservation bundles against the existing archive using checksums. Retain anything unique or required to recover local work.
3. Consolidate completed-feature notes and repeated captures, retaining decisions, current standards, unresolved reproductions and minimal acceptance evidence. Update incoming links.
4. Review generated deployment bundles separately from maintained nginx/templates/scripts. Retire one-shot procedures only after completion and recovery checks.
5. Validate affected links, tools and tests for each proposed removal batch, then obtain deletion authorization. The manifest itself authorizes no removals.

## Coverage and verification limits

- Traversed the main checkout and nested regular directories, including registered worktree files; tracked status inside registered worktrees uses each owner worktree. Nested unregistered repositories are held and their Git metadata is excluded.
- Did not traverse any reparse point/symlink/junction or `.git` metadata. Dependencies/build output are measured but not executed. All skipped paths and filesystem failures are recorded in `exclusions.json`.
- Two sandbox-denied scratch directories were measured with an approved metadata-only probe: `.tools/teammate-recovery-20261012-jnMJMo` and `.tools/obsolete-teams-local-20261012-JiaCUe`. Their 21 files total 2,377,636 bytes; the separate probe timestamp is recorded. No permission/ownership settings were changed.
- Static reference detection scans tracked UTF-8 text files up to 2 MiB. It resolves path tokens relative to the referrer or root and records literal group-name matches for constructed paths. These heuristics can miss dynamic references, external consumers and untracked scripts; **zero references is not proof of non-use**. Prefix references may apply to many files.
- File contents of potential credentials were not inspected for the inventory. Source/reference scanning records locations, not excerpts. No application build or test suite was run because this task only produces an inventory.
- Modification times indicate filesystem timestamps, not last use or feature completion. Files can change during the scan; recheck existence, sizes, Git state, references and runtime ownership immediately before any approved removal.
- Filesystem/Git inventory errors: **0**. Tracked reference files scanned: **4,032**. Large text files skipped: **19**; sensitive-name files skipped: **5**; unreadable/non-UTF-8 reference files: **1**.

## Manifest verification

Validated unique paths, exact file/group/disposition totals, worktree/toolchain holds, nginx template references, recovered metadata and scan exclusions. Confirmed 1,132 tracked notes and 90 tracked test-output files. Python syntax checks passed. No tracked repository files changed; the pre-existing untracked risk-map document was preserved. Validation evidence is in `validation.json`; `checksums.sha256` records audit-artifact integrity.
