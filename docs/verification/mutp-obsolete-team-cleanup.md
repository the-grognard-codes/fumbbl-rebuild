# Obsolete saved-team cleanup (#262)

Status, 2026-10-12: **local review cleanup completed**. The script deleted 36 obsolete saved teams and preserved all five current teams. The owner's successful GCP DEV and PROD inventories each found zero saved teams and zero obsolete rows, so neither hosted database needs deletion.

## Selection boundary

The current account saved-team envelope is format 3 with draft version 2. It has a team name and every player's name and jersey number. The earlier account scaffold is envelope format 2 with legacy draft version 1; it has no team or player names or jersey numbers and cannot be frozen as a current named match team. The older local diagnostic scaffold is envelope format 1 with the same nameless draft shape. These exact, internally consistent legacy envelopes qualify for this owner-requested cleanup in `ffb_v2_saved_teams` and `ffb_saved_teams`, respectively. The classifier checks the envelope, table, owner namespace, team ID, document version, catalog version, and parsed draft together. It never selects by creation date, catalog version alone, current validation status, or a malformed document.

Format-3 saved teams, including teams on retired catalogs, remain stored. Malformed or metadata-mismatched rows remain stored for separate investigation. Only the two saved-team tables are delete targets. The schema defines no saved-team child table or foreign key into either; the tool rechecks that there are no inbound foreign keys before planning or deleting. Frozen match teams live in prepared-match documents, with checkpoints, transcripts, results and replays in separate tables. The cleanup never updates those tables or account rows.

## Inventory evidence, 2026-10-11

Read-only SQL against the verified `ffb-match-review-database-1` container (Compose project `ffb-match-review`, service `database`) found schema marker 7:

| Environment | Account format 2 | Account format 3 | Local format 1 | Other / access |
| --- | ---: | ---: | ---: | --- |
| Local match-review | 22 | 5 | 14 | Strict classifier selected 22 account and 14 local rows; 5 current rows excluded |
| Remote development | 0 | 0 | 0 | Owner's successful cloud-wrapper inventory, reported 2026-10-12 |
| Production | 0 | 0 | 0 | Owner's successful cloud-wrapper inventory, reported 2026-10-12 |

The initial local review inventory scanned 27 account and 14 local saved-team rows. Its strict parser selected 36 obsolete rows and excluded 5 current rows. The reviewed, ignored plan is `.tools/obsolete-local-review.plan.json`, SHA-256 `175f073e77ebd542546872d1b00eb255b8dae52182f63ca45e97596097ef4306`. A freshly generated copy matched its selected entries and digest exactly and was applied on 2026-10-12. The plan contains selected IDs and owner subjects, so keep it private. Its entries contain only table, team ID, owner, document version, and fingerprint; no document JSON. The temporary local credential file was removed after inventory. Hosted inventories were subsequently run by the owner through the cloud wrapper and found zero saved teams in both configured DEV and PROD databases.

An isolated temporary MariaDB database copied only the schema marker and both saved-team tables from local review. The wrapper selected the same 36 obsolete rows and excluded the same 5 current rows. After one selected copy's metadata changed, apply reported `PLAN_ROW_CHANGED` and both copied table counts stayed 27/14, confirming transaction rollback. Restoring that row and applying the original isolated plan deleted 36 and retained 5; repeat apply deleted 0 with 36 already absent; final inventory found 0 obsolete and 5 excluded. The source database still counted 27/14 afterward. The isolated database, its plan and its temporary credential were removed. That validation run did not apply to the real local-review, development or production databases.

## Actual local cleanup, 2026-10-12

The owner explicitly requested execution with `tools/obsolete-saved-team-cleanup.mjs`. The operator verified the running `ffb-match-review` database/server container labels, loopback port `23317`, database `ffb_local`, schema marker 7, current server distribution, and the reviewed plan's endpoint/digest. It paused the local review game server and generated a private fresh plan; all 36 selected entries and the SHA-256 matched the reviewed plan exactly.

Before apply, the operator retained a private SQL backup of both saved-team tables at `.tools/obsolete-teams-local-20261012-JiaCUe/saved-teams-before.sql`, SHA-256 `df7f9fe8259a7d6b60f118d9b9f61da967b3f979aed95e1498f02c6c167c180d`. The directory permits only the current Windows account and SYSTEM. The plan and sanitized verification record remain alongside the backup; the temporary administrator password file was removed after execution.

The local script reported `committed=true deleted=36 alreadyAbsent=0`, followed by `postCommitVerification=complete remainingObsolete=0 currentOrExcluded=5`. A separate inventory reported `accountScanned=5 localScanned=0 obsolete=0 excluded=5`. The five retained saved-team rows compared byte-for-byte equal before and after. Extended checksums for all 15 non-target database tables matched, covering accounts, match/history and preferences. The original local review server restarted and returned to healthy status. No source runtime was rebuilt or deployed during the operation; no code was staged or committed. Current-team selection and existing match resume/replay remain available for the owner's manual UI validation.

## Operator procedure

### DEV and PROD through the logged-in cloud CLI

Use the repository's [PowerShell cloud wrapper](../../tools/obsolete-saved-team-cleanup-cloud.ps1) from the repository root. It uses your current `gcloud` login and [Compute Engine SSH](https://docs.cloud.google.com/sdk/gcloud/reference/compute/ssh) / [SCP](https://docs.cloud.google.com/sdk/gcloud/reference/compute/scp) over IAP. Your account needs access to the selected VM and passwordless sudo there. The VM must be running; the wrapper does not start it or change cloud credentials.

The upload uses `moles-game:.mutp-team-cleanup-ARCHIVE_SHA256/`, relative to the remote login home directory. This matches the directory created through SSH using `$HOME`. Windows PSCP's SFTP transport does not expand a leading `~` ([PuTTY limitation](https://www.chiark.greenend.org.uk/~sgtatham/putty/wishlist/sftp-tilde.html)); relative remote targets are resolved against the home directory ([PSCP target documentation](https://the.earth.li/~sgtatham/putty/0.85/htmldoc/Chapter5.html#pscp-usage-basics-target)). If the older wrapper failed with `pscp: remote filespec ~/.mutp-team-cleanup-.../: not a directory`, rerun the same plan command with the corrected wrapper. That failure occurred before the cleanup helper ran, so it did not create a plan or delete rows. This script-only fix does not require rebuilding the server package.

An initial SSH failure such as `plink.exe: Remote side unexpectedly closed network connection` occurs before the upload step. It is a separate connectivity failure; that message alone does not establish its cause. Check the selected VM's status and use [Google's SSH troubleshooting tool](https://docs.cloud.google.com/compute/docs/troubleshooting/troubleshooting-ssh-errors#run_the_troubleshooting_tool) with the same IAP route. For PROD:

```powershell
gcloud compute instances describe moles-game --project=molesunderthepitch-dotorg --zone=us-central1-a --format='value(status)'
gcloud compute ssh moles-game --project=molesunderthepitch-dotorg --zone=us-central1-a --tunnel-through-iap --troubleshoot
```

If the VM is stopped, use the normal operator startup procedure first. If it has just started, let it finish booting. Resolve the reported connectivity/access checks before rerunning the plan command; the wrapper does not start VMs, change SSH credentials, or alter firewall/IAM configuration. A failed initial SSH command exits before uploading files or invoking cleanup.

| Selection | Project | VM / zone | Database / native game unit |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `moles-game` / `us-central1-a` | `ffb_m6_dev` / `moles-game-v2-dev.service` |
| PROD | `molesunderthepitch-dotorg` | `moles-game` / `us-central1-a` | `ffb_m6_prod` / `moles-game-v2-prod.service` |

Build the current cleanup package once. No staging or commit is required:

```powershell
mvn -pl ffb-server -am '-DskipTests' package
```

Run DEV first. Plan does not delete rows or stop the game service:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment dev -Mode plan
```

Check the printed `accountScanned`, `localScanned`, `obsolete`, `excluded` counts and `planSha256`. The plan is private on the VM; no database password or saved-team contents are downloaded. A rebuilt package has a different archive digest and needs its own plan. Repeating plan for the same package refuses to overwrite an existing plan, prints current read-only inventory and the separately labeled `existingPlanSha256`, then exits with `PLAN_ALREADY_EXISTS`. The retained plan can represent an older inventory; review that plan before applying it. Use `-Mode inventory` for updated read-only counts. If both scanned counts and `obsolete` are zero, this database has no saved teams to remove; no apply, backup or game-service stop is necessary.

On 2026-10-11 the owner reported PROD `accountScanned=0 localScanned=0 obsolete=0 excluded=0`, followed by `CLEANUP_FAILED DATABASE_OR_PLAN_ERROR`. The Java operator prints inventory before writing the plan with `CREATE_NEW`; an existing plan file reproduces that generic failure. The host helper now detects and reports this case explicitly without replacing the retained file. The actual PROD file state has not been inspected from this workspace. Rerunning the plan command uploads the updated helper without rebuilding the server package; if a different plan-write problem remains, retain the error output for diagnosis.

At a quiet maintenance window, after matches have been saved or finished, stop the native game service and apply that exact DEV plan. Replace the digest placeholder with the 64-character `planSha256` from the DEV plan output:

```powershell
gcloud compute ssh moles-game --project=dev-moles-under-the-pitch-org --zone=us-central1-a --tunnel-through-iap --command='sudo -n systemctl stop moles-game-v2-dev.service'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment dev -Mode apply -PlanSha256 'PASTE_DEV_PLAN_SHA256_HERE'
```

Apply refuses an active, starting or stopping game service. The [host helper](../../deployment/game-service/cleanup-obsolete-teams-host.sh) verifies project, VM, zone and exact database/credential paths. It reads the existing `/etc/moles-game-v2-dev/secrets/db_password` on the host, runs the packaged cleanup CLI with the existing Java 21 binary, and creates a root-private SQL backup of both saved-team tables before deletion. It neither installs the uploaded runtime nor starts or stops a service itself. It uses existing MariaDB root socket authentication for the backup; no new database grant or password is created. Schema marker 7 and the previously documented classifier/transaction guards are still required.

Successful apply prints `committed=true`, aggregate deleted/absent counts, and `postCommitVerification=complete remainingObsolete=0`. Restart DEV, check inventory and manually check retained current teams, match resume and replay:

```powershell
gcloud compute ssh moles-game --project=dev-moles-under-the-pitch-org --zone=us-central1-a --tunnel-through-iap --command='sudo -n systemctl start moles-game-v2-dev.service'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment dev -Mode inventory
```

After checking DEV, repeat for PROD with its separate plan/digest:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment prod -Mode plan
gcloud compute ssh moles-game --project=molesunderthepitch-dotorg --zone=us-central1-a --tunnel-through-iap --command='sudo -n systemctl stop moles-game-v2-prod.service'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment prod -Mode apply -PlanSha256 'PASTE_PROD_PLAN_SHA256_HERE'
gcloud compute ssh moles-game --project=molesunderthepitch-dotorg --zone=us-central1-a --tunnel-through-iap --command='sudo -n systemctl start moles-game-v2-prod.service'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/obsolete-saved-team-cleanup-cloud.ps1 -Environment prod -Mode inventory
```

Run each command individually and inspect its result before the next. Exit 3 reports a committed operation with verification pending or a lost commit acknowledgement: use `-Mode inventory` to reconcile before another apply or restarting the service. Other failures retain the plan and backup for inspection. A schema/profile mismatch fails closed and does not migrate or replace the deployed runtime. The uploaded archive, private plan and backups remain under `/var/lib/moles-obsolete-team-cleanup/ENV/ARCHIVE_SHA256/`; source uploads remain in the operator's private `~/.mutp-team-cleanup-ARCHIVE_SHA256/` directory.

The cloud workflow passed ten local command/guard tests and Bash syntax checks. The upload regression executes the PowerShell wrapper with mocked SSH/SFTP filesystem operations, verifies both files reach the SSH-created directory, and reproduced the reported `not a directory` failure before the fix. The repeated-plan regression reproduced the generic plan failure before the explicit host check and now verifies the retained plan bytes and digest remain unchanged; a non-file plan path is rejected before inventory or digest reads. Tests used mocked cloud/host commands; no DEV/PROD connection or operation was performed while preparing these commands.

### Direct JDBC operator procedure

Use a dedicated administrator connection to the intended MariaDB database. Provide its JDBC URL and username through `MUTP_CLEANUP_JDBC_URL` and `MUTP_CLEANUP_DB_USER`, and point `MUTP_CLEANUP_DB_PASSWORD_FILE` to a private local password file. The password is read by the JVM; it is not passed in arguments or printed. The local match-review database publishes loopback port `23317`; remote environments require an authorized private connection or tunnel. Keep the plan under ignored `.tools/` because it contains private saved-team IDs and owner subjects. Never commit or paste the plan.

1. Build the current distribution: `mvn -pl ffb-server -am '-DskipTests' package`. The wrapper refuses a distribution older than the cleanup source.
2. Run `node tools/obsolete-saved-team-cleanup.mjs inventory ENV`. Record only its aggregate counts. Verify the environment, database/schema marker, and backup or snapshot for that same environment. Pause writers for the deletion window.
3. Run `node tools/obsolete-saved-team-cleanup.mjs plan ENV .tools/obsolete-ENV.plan.json`. The plan is created only if absent. Review its aggregate counts and `planSha256`; the file contains selected row IDs, owners, versions, and hashes but no document JSON.
4. Review the concrete per-environment plan against the owner's authorized legacy-scaffold scope, then run `node tools/obsolete-saved-team-cleanup.mjs apply ENV .tools/obsolete-ENV.plan.json PLAN_SHA256`. The tool verifies the exact file digest, environment and JDBC endpoint, schema marker, database name, every selected row's current legacy classification and full-row fingerprint. It locks rows and deletes them in one transaction with exact document predicates. A changed row aborts the transaction. A lost commit acknowledgement reports an unknown outcome; reconcile by re-running inventory before any further action.
   A confirmed commit is printed before the post-commit inventory. If that read fails, the operator reports `CLEANUP_COMMITTED_VERIFICATION_PENDING`; run read-only inventory and do not immediately repeat apply. A close failure after an acknowledged commit has the same committed/pending status.
5. Run inventory again. It must report `obsolete=0`; a repeated apply reports `deleted=0` and the original count as already absent. Verify current teams remain selectable in My teams and Create/Join, and a match frozen from a deleted legacy team still resumes/replays. Record sanitized before/after counts for each environment.

The owner authorized permanent removal of obsolete saved teams in all environments. Actual local-review apply completed on 2026-10-12 with the safeguards and verification above. The owner's DEV and PROD inventories found zero saved teams and zero obsolete rows, so no hosted apply is needed. No hosted deletion was performed by the agent.
