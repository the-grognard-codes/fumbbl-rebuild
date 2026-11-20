# Development and release guide

This project is educational work alongside FUMBBL. The static web delivery,
Firebase Authentication projects, and isolated Java session service are separate from
existing FUMBBL accounts, credentials, and production systems.

## Components and ownership

| Component | Directory | Purpose and normal owner |
| --- | --- | --- |
| Shared engine | `ffb-common/` | Reusable game rules and engine code; rules/engine contributors. |
| Java game session proof | `game-service/` | Independent Firebase-authenticated WSS service; provisioned separately using `deployment/game-service/`. |
| Existing Java game server | `ffb-server/` | Authoritative V2 game engine server and local acceptance stack. |
| Browser client | `browser-client/` | Independently buildable HTML5 game client; client contributors. |
| Public site | `site/` | Static project pages, updates, privacy, support, and non-affiliation copy; site contributors. |
| Firebase delivery | `deployment/firebase/`, `firebase.json`, `.firebaserc` | Artifact assembly, public build configuration, emulator guidance, and Hosting routing; release maintainers. |
| CI and release controls | `.github/workflows/`, `.github/BRANCH_PROTECTION.md` | Checks and releases; repository administrators. |

The Maven reactor contains `ffb-common/`, `ffb-tools/`, `ffb-server/`, and
`ffb-statetest/`. Browser V2 is the sole server runtime; V1 is retired.
Preserve engine code, historical data-format compatibility and canonical
`assets/game/` resources used by browser play, replay and recovery.

## Local workflows

Use the smallest applicable check while developing. The repository's Java
tooling supplies the pinned Maven and JDK setup described in the root README.

```powershell
# Java server or engine
./tools/bootstrap.ps1
./tools/target-build.ps1 test -Module ffb-server -Test BrowserJettyContractTest
./tools/target-build.ps1 verify

# Browser client
npm ci --prefix browser-client
npm test --prefix browser-client
npm run build --prefix browser-client

# Public project site
npm run check --prefix site
npm run build --prefix site

# Complete DEV-shaped Hosting artifact
npm run assemble --prefix deployment/firebase -- --environment dev
npm run verify-hosting-artifact --prefix deployment/firebase -- --environment dev
```

To test the assembled site and email-link completion route locally, assemble
*before* starting Hosting. The emulator serves the generated
`deployment/firebase/hosting/` directory; it does not rebuild it.

```powershell
npm run assemble --prefix deployment/firebase -- --environment local
firebase emulators:start --project dev-moles-under-the-pitch-org
```

Use `http://localhost:5000/`, `/play`, and `/login/complete`. `local` is tied
to the DEV project identity and Auth emulator (`127.0.0.1:9099`); it can never
select PROD. See [Firebase authentication setup](../deployment/firebase/AUTHENTICATION_SETUP.md)
for the console-side provider configuration.

## Environment boundary

| Environment | Firebase project | Domain | GitHub environment |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `dev.molesunderthepitch.org` | `development` |
| PROD | `molesunderthepitch-dotorg` | `molesunderthepitch.org` | `production` |

Both projects serve the same routes from one Hosting artifact: `/`, `/play`,
and `/login/complete`. The public Firebase web configuration is selected only
by `--environment dev` or `--environment prod`; builds do not use the active
local Firebase CLI project.

Create separate Firebase Authentication user stores, authorized domains,
email-link return URLs, and Google provider registrations in the two
projects. A Hosting release does **not** create or change any Auth provider,
user, session, or existing FUMBBL account. Google, Microsoft and email links are
supported; configure providers independently in each Firebase project.

## Branches, checks, and DEV

Start normal work from up-to-date `main` using one short-lived branch:

```text
feature/<topic>   new isolated work
fix/<topic>       corrective work
```

Open a pull request to `main`. The `Checks` workflow runs Maven baseline and
Java 21 verification, browser-client installation/tests/production build,
static-site validation, and DEV/PROD-shaped Hosting artifact validation. The
workflow retains all Java, service, asset, unit, and artifact checks. Full
browser execution runs locally for DEV and is required on GitHub for PROD.
`Workflow and secret checks` additionally lints Actions
files and scans history for committed secrets.

After merging to `main`, use `node tools/deploy.mjs --environment dev-remote`.
It validates the exact remote main commit in an isolated local worktree,
requires successful GitHub `Checks` for that commit, and dispatches DEV Hosting
deployment. Merges do not automatically publish DEV. See
[deployment usage](../deployment/README.md) for commands and chat requests.

## GitHub OIDC and environment setup

Configure this once as a project/repository administrator. Keep DEV and PROD
separate: each Firebase project gets its own WIF provider and a deploy service
account. Give each deploy account only the Firebase Hosting permissions needed
to release that project's site (normally `roles/firebasehosting.admin`), and
grant only its matching WIF principal `roles/iam.workloadIdentityUser` on that
account. Do not grant either deploy identity access to the other project.

In each provider, use GitHub repository ID `1359398730` and owner ID `317211933`.
DEV accepts the `development` environment on `main`. PROD accepts the `production`
environment in the Deploy Firebase Hosting (PROD) workflow on `main` or an
eligible `moles-v*` tag. The workflows take the full provider resource name with
the Google project number.

### Migrate the existing DEV and PROD providers before the rename

Start this section after [#581](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/581)
has merged and Cloud Shell has checked out that revision or a later `main`.
The previous PROD provisioner ignores `--check` and writes IAM policy. Run the
following as one command. The Git check and the DEV preflight both have to
succeed before the PROD script runs.

```bash
git cat-file -e HEAD:deployment/firebase/scripts/migrate-dev-wif-repository-id.sh &&
  bash deployment/firebase/scripts/migrate-dev-wif-repository-id.sh --check &&
  bash deployment/firebase/scripts/provision-prod-wif.sh --check
```

Use an administrator identity for each project. Confirm the existing deploy
pools and service accounts. If `--check` plans fresh PROD provisioning, stop
and confirm the project and provider before applying the migration.

Save each provider's current mapping and condition and its deploy account's IAM
policy outside the repository. In the same Cloud Shell session, define the
following commands. The snapshots contain configuration and IAM members. Keep
them in your private Cloud Shell home directory. Save the printed directory
path for use if you resume in another session.

```bash
snapshot_dir=$(mktemp -d "$HOME/firebase-wif-XXXXXX")
printf '%s\n' "$snapshot_dir"

select_wif() {
  case "$1" in
    dev) project=dev-moles-under-the-pitch-org; pool=github-dev ;;
    prod) project=molesunderthepitch-dotorg; pool=github-prod ;;
    *) echo 'Expected dev or prod.' >&2; return 2 ;;
  esac
  number=$(gcloud projects describe "$project" --format='value(projectNumber)') || return
  [[ "$number" =~ ^[0-9]+$ ]] || return 1
  deployer="firebase-hosting-deployer@$project.iam.gserviceaccount.com"
  principal_prefix="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository"
  provider_args=(--project="$project" --location=global --workload-identity-pool="$pool")
}

snapshot_wif() {
  gcloud iam workload-identity-pools providers describe github-actions \
    "${provider_args[@]}" --format=json > "$snapshot_dir/$pool.provider.json" || return
  gcloud iam service-accounts get-iam-policy "$deployer" \
    --project="$project" --format=json > "$snapshot_dir/$pool.iam.json"
}

legacy_wif_grants() {
  local change=$1 policy_file member slug granted
  case "$change" in
    remove) policy_file="$snapshot_dir/$pool.current-iam.json"
            gcloud iam service-accounts get-iam-policy "$deployer" \
              --project="$project" --format=json > "$policy_file" || return ;;
    add) policy_file="$snapshot_dir/$pool.iam.json" ;;
    *) return 2 ;;
  esac
  for slug in fumbbl-rebuild fumbbl-rebuild-chatgpt; do
    member="$principal_prefix/the-grognard-codes/$slug"
    granted=$(jq -er --arg member "$member" '
      select(type == "object" and ((.bindings // []) | type == "array"))
      | any(.bindings[]?; .role == "roles/iam.workloadIdentityUser"
        and .condition == null and any(.members[]?; . == $member))
      | tostring' "$policy_file") || return
    if [[ "$granted" == true ]]; then
      gcloud iam service-accounts "$change-iam-policy-binding" "$deployer" \
        --project="$project" --role=roles/iam.workloadIdentityUser \
        --member="$member" --condition=None || return
    fi
  done
}

select_wif dev && snapshot_wif
select_wif prod && snapshot_wif
```

Inspect each snapshot for the reviewed provider configuration and the expected
workload identity grants. Account for additional, conditional, or inherited
grants that could let either workflow impersonate its deploy account before
using the run as proof. Successful verification with both grants present can
use the original binding. The ID-only proof is the fresh run after the
name-based grants are removed and the IAM change has propagated.

1. Apply DEV in Cloud Shell from merged main.

   ```bash
   bash deployment/firebase/scripts/migrate-dev-wif-repository-id.sh
   ```

   From the development checkout, explicitly dispatch DEV on a validated `main`
   commit with the following command. Wait for the run to deploy successfully.

   ```bash
   node tools/deploy.mjs --environment dev-remote
   ```

   In Cloud Shell, remove the DEV name-based grants, allow
   [IAM propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation),
   then run the same DEV dispatch again. Record the successful run link.

   ```bash
   select_wif dev && legacy_wif_grants remove
   ```

2. Create a protected verification tag from merged `main`. The PROD workflow
   excludes `moles-v0-wif-check-*` tags from automatic publishing and rejects
   them as release tags. The existing `moles-v*` tag protection and
   `production` approval apply to this tag.

   ```bash
   git fetch origin main
   verification_tag="moles-v0-wif-check-$(git rev-parse --short origin/main)"
   git tag -a "$verification_tag" origin/main -m 'Verify PROD deployment identity'
   git push origin "refs/tags/$verification_tag"
   ```

   Apply PROD separately in Cloud Shell.

   ```bash
   bash deployment/firebase/scripts/provision-prod-wif.sh
   ```

   Dispatch the PROD identity check from the verification tag and approve the
   `production` environment. In the run, confirm that the `verify-identity`
   job minted an access token by impersonating the deploy account.

   ```bash
   gh workflow run firebase-deploy-prod.yml --repo the-grognard-codes/fumbbl-rebuild \
     --ref "$verification_tag" -F verify_only=true
   ```

   Remove the PROD name-based grants, allow IAM propagation, then dispatch
   the same check again with a fresh workflow run. Record the successful run
   link. This dispatch skips Firebase Hosting publication.

   ```bash
   select_wif prod && legacy_wif_grants remove
   ```

3. If either check fails before the rename, select the affected environment
   with `select_wif dev` or `select_wif prod`. Validate the provider
   snapshot, restore the name-based grants, then restore the original mapping
   and condition together. Wait for propagation, check the affected
   environment, and resolve the failure before repeating the migration.

   ```bash
   jq -e 'select((.attributeMapping | type == "object") and
                 (.attributeCondition | type == "string" and length > 0))
          | {"--attribute-mapping": .attributeMapping, "--attribute-condition": .attributeCondition}' \
       "$snapshot_dir/$pool.provider.json" > "$snapshot_dir/$pool.rollback.json" &&
     legacy_wif_grants add &&
     gcloud iam workload-identity-pools providers update-oidc github-actions \
       "${provider_args[@]}" --flags-file="$snapshot_dir/$pool.rollback.json"
   ```

4. Rename the repository on GitHub after both ID-only checks pass. Reserve
   the old slug so it continues to redirect historical URLs. Update `origin`
   in the main checkout and repeat both checks. Use the new repository slug
   in the PROD dispatch. GitHub can change the OIDC subject format as part of
   the rename. Record the two post-rename run links.

   ```bash
   git remote set-url origin https://github.com/the-grognard-codes/moles-under-the-pitch.git
   git fetch origin
   gh workflow run firebase-deploy-prod.yml --repo the-grognard-codes/moles-under-the-pitch \
     --ref "$verification_tag" -F verify_only=true
   ```

### Switch live URLs and local checkout paths

Once the new GitHub URL resolves, set `liveRepositoryUrl` to
`renamedRepositoryUrl` in `site/scripts/render-updates.mjs`. Update the link to
#389 on the Support page and the clone and remote URLs in the Windows and Ubuntu
setup guides. Preserve the PR history in `site/updates.json` and its coverage
for both URL formats. Regenerate and verify the Development page.

```bash
npm run updates:render --prefix site
node site/scripts/render-updates.mjs --check
npm test --prefix site
```

When moving the Windows checkout:

1. Run `git worktree list --porcelain` and record the linked worktrees. Stop
   tools using the old directory, then move the checkout and reopen it.
2. In the new main checkout run `git worktree repair`. Pass the new absolute
   paths for linked worktrees that moved with the main checkout. Git repairs
   references to the main checkout for linked worktrees outside it as well.
3. Update or stage both paths for the shared `.git` grant in `.codex/config.toml`
   and refresh machine-local editor and agent settings as needed. Update the
   Windows and Ubuntu setup examples and `tools/setup-ubuntu.sh` for their new
   paths, including `~/src/moles-under-the-pitch` when moving a WSL checkout.
4. Rerun `tools/bootstrap.ps1` for the moved Windows checkout. Verify `git status`
   and `git rev-parse --git-common-dir` in the main checkout and linked
   worktrees. Check that a linked worktree can write to its shared Git
   directory, then retire any temporary old-path grant.

### Set the GitHub environment inputs

Set these GitHub *environment variables* separately in `development` and
`production`:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name for that environment. |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | That environment's deploy service-account email. |

The identifiers are not private keys. The public Firebase web configuration is
versioned in `deployment/firebase/scripts/environment.mjs`, so each build has
an auditable environment mapping. No service-account JSON,
OAuth client secret, Firebase CLI token, `.env` file, or user/session export
belongs in this repository. `gha-creds-*.json` is an ephemeral CI credential
file and is ignored.

The deployment workflows prefer these environment variables and also accept
same-named GitHub secrets for `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_DEPLOY_SERVICE_ACCOUNT` while existing configuration is being moved. A
missing or malformed WIF provider now fails before Google authentication with
an actionable workflow error. Keep the identifiers as environment variables
when possible; neither value is a credential.

In **Settings > Environments**, set `production` to require approval before
deployment. In **Settings > Rules**, protect `main` and make `moles-v*` tags
immutable as described in [the branch-control checklist](../.github/BRANCH_PROTECTION.md).

To provision the production WIF provider and its dedicated Firebase Hosting
deployer without creating a service-account key, run the reviewed script from
Google Cloud Shell as a production-project administrator:

```bash
bash deployment/firebase/scripts/provision-prod-wif.sh
```

The script provisions missing PROD resources with ID-based trust. Run it with
`--check` first to see the plan and the two GitHub environment values.

## Production release and rollback

Production releases are immutable tags created from `main`:

```powershell
git switch main
git pull --ff-only
git tag -a moles-v1.2.3 -m "Moles Under the Pitch 1.2.3"
git push origin moles-v1.2.3
```

The tag starts `Deploy Firebase Hosting (PROD)`. It verifies the tag format and
that its commit is an ancestor of `main`, then runs full hosted and interaction
browser validation on GitHub for that exact commit. Successful complete coverage
is required before the deployment job can request `production` environment
approval. After approval it rebuilds from that commit, deploys only to
`molesunderthepitch-dotorg`, and records the tag and full commit in both the
Firebase Hosting release message and GitHub job summary. A maintainer may use
manual dispatch with an existing release tag to publish, or `verify_only` from a
protected `moles-v0-wif-check-*` tag to test service-account impersonation.

For an urgent static rollback, open the PROD Hosting site's **Release history**
in the Firebase console, select the known-good release, and choose **Roll back**.
This creates a new release pointing at that prior version without changing the
tag. For a reproducible code rollback, manually dispatch the PROD workflow with
a prior approved `moles-v*` tag that includes the current browser validation
tooling, and approve the `production` environment after its tests pass. Legacy
tags created before this validation split lack compatible runner/gate scripts
and cannot be redeployed by the new workflow; use Firebase's saved-release
rollback for those artifacts. The release gate remains mandatory.
Record the incident and follow up with a new corrective tag; never move or
reuse a release tag.

## Deployment boundaries

- A static-site deployment publishes `site/` output at `/`.
- DEV and PROD publish the Firebase-authenticated `site/src/play/` page at `/play`.
  Only the explicit `local` assembly uses `browser-client/` diagnostic output.
- Assembly generates `firebase.generated.json` with a policy allowing Firebase
  Auth and only the matching game WSS origin. Hosting deployments must pass
  `--config firebase.generated.json`.
- Firebase Authentication configuration is a separately administered,
  environment-specific Firebase console task. Its secrets and user stores are
  not deployed by GitHub Actions.
- The session service has separate DEV and PROD Compute Engine hosts. Follow
  [the provisioning runbook](../deployment/game-service/README.md); its scripts
  are owner-run and do not add Java deployment to the Hosting workflows.
