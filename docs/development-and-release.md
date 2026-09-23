# Development and release guide

This project is educational work alongside FUMBBL. The static web delivery,
Firebase Authentication projects, and isolated Java session service are separate from
existing FUMBBL accounts, credentials, and production systems.

## Components and ownership

| Component | Directory | Purpose and normal owner |
| --- | --- | --- |
| Shared engine | `ffb-common/` | Reusable game rules and engine code; rules/engine contributors. |
| Java game session proof | `game-service/` | Independent Firebase-authenticated WSS service; provisioned separately using `deployment/game-service/`. |
| Existing Java game server | `ffb-server/` | Game engine server and explicit local diagnostic stack. |
| Browser client | `browser-client/` | Independently buildable HTML5 game client; client contributors. |
| Public site | `site/` | Static project pages, updates, privacy, support, and non-affiliation copy; site contributors. |
| Firebase delivery | `deployment/firebase/`, `firebase.json`, `.firebaserc` | Artifact assembly, public build configuration, emulator guidance, and Hosting routing; release maintainers. |
| CI and release controls | `.github/workflows/`, `.github/BRANCH_PROTECTION.md` | Checks and releases; repository administrators. |

`ffb-client/`, `ffb-client-logic/`, `ffb-resources/`, and `ffb-tools/` retain
their existing Java module roles. Do not move a module merely to make a web
change.

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
user, session, or existing FUMBBL account. Microsoft is deferred.

## Branches, checks, and DEV

Start normal work from up-to-date `main` using one short-lived branch:

```text
feature/<topic>   new isolated work
fix/<topic>       corrective work
```

Open a pull request to `main`. The `Checks` workflow runs Maven baseline and
Java 21 verification, browser-client installation/tests/production build,
static-site validation, and DEV/PROD-shaped Hosting artifact validation. The
workflow currently runs the complete relevant suite rather than relying on
fragile path inference. `Workflow and secret checks` additionally lints Actions
files and scans history for committed secrets.

After a successful merge to `main`, the successful `Checks` run triggers
`Deploy Firebase Hosting (DEV)`. It checks out the exact validated commit,
rebuilds the artifact, and deploys only to
`dev-moles-under-the-pitch-org`. It cannot deploy PROD.

## GitHub OIDC and environment setup

Configure this once as a project/repository administrator. Keep DEV and PROD
separate: each Firebase project gets its own WIF provider and a deploy service
account. Give each deploy account only the Firebase Hosting permissions needed
to release that project's site (normally `roles/firebasehosting.admin`), and
grant only its matching WIF principal `roles/iam.workloadIdentityUser` on that
account. Do not grant either deploy identity access to the other project.

In each provider, restrict the GitHub OIDC trust to this repository and its
matching GitHub environment. DEV must accept only the `development` environment
on `main`; PROD must accept only the `production` environment for `moles-v*`
tags. Use a full provider resource name containing the Google **project number**,
not just a project ID.

After the repository rename, both providers must trust
`the-grognard-codes/fumbbl-rebuild`. In the DEV Google Cloud project, update the
existing provider's `assertion.repository` condition and the deploy service
account's `attribute.repository` principal to that value; remove the old
repository principal after the new one is verified. The production provisioning
script below handles the equivalent PROD change when its existing provider has
the previously configured condition. Review any custom provider condition
before changing it.

The existing GitHub `development` environment uses provider
`projects/589432788264/locations/global/workloadIdentityPools/github-dev/providers/github-actions`
and service account
`firebase-hosting-deployer@dev-moles-under-the-pitch-org.iam.gserviceaccount.com`.
The repository rename requires migrating the existing DEV provider. From Google
Cloud Shell with access to the DEV project, run:

```bash
bash deployment/firebase/scripts/migrate-dev-wif-repository.sh --check
bash deployment/firebase/scripts/migrate-dev-wif-repository.sh
```

The migration matches the reviewed DEV provider condition exactly, changes
only its repository name, and adds the new repository principal to the DEV
deploy account. It stops for review if the condition has changed.
After a successful DEV deployment, remove the old repository principal if it
is still present on the DEV deploy account:

```bash
gcloud iam service-accounts remove-iam-policy-binding \
  firebase-hosting-deployer@dev-moles-under-the-pitch-org.iam.gserviceaccount.com \
  --project=dev-moles-under-the-pitch-org \
  --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/589432788264/locations/global/workloadIdentityPools/github-dev/attribute.repository/the-grognard-codes/fumbbl-rebuild-chatgpt' \
  --condition=None
```

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

The script prints the two `GCP_*` values to add to GitHub's `production`
environment. It creates missing resources and updates the prior repository
condition on an existing provider. It stops for review if that provider has a
different condition. After a successful PROD deployment with the new repository
identity, remove the old repository principal from the production deploy
service account.

## Production release and rollback

Production releases are immutable tags created from `main`:

```powershell
git switch main
git pull --ff-only
git tag -a moles-v1.2.3 -m "Moles Under the Pitch 1.2.3"
git push origin moles-v1.2.3
```

The tag starts `Deploy Firebase Hosting (PROD)`. It verifies the tag format and
that its commit is an ancestor of `main`, then waits for `production`
environment approval. After approval it rebuilds from the tag, deploys only to
`molesunderthepitch-dotorg`, and records the tag and full commit in both the
Firebase Hosting release message and GitHub job summary. A maintainer may use
the workflow's manual dispatch only by naming an existing `moles-v*` tag; it
does not permit an arbitrary branch or SHA.

For an urgent static rollback, open the PROD Hosting site's **Release history**
in the Firebase console, select the known-good release, and choose **Roll back**.
This creates a new release pointing at that prior version without changing the
tag. For a reproducible code rollback, manually dispatch the PROD workflow with
the prior approved `moles-v*` tag and approve the `production` environment.
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
