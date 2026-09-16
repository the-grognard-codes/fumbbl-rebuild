# Development and release guide

This project is educational work alongside FUMBBL. The static web delivery,
Firebase Authentication projects, and future Java service are separate from
existing FUMBBL accounts, credentials, and production systems.

## Components and ownership

| Component | Directory | Purpose and normal owner |
| --- | --- | --- |
| Shared engine | `ffb-common/` | Reusable game rules and engine code; rules/engine contributors. |
| Java game service | `ffb-server/` | Future game service; server contributors. It is built and tested, not deployed by these workflows. |
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

# Complete DEV-shaped Hosting artifact (uses placeholder public config only)
npm run assemble --prefix deployment/firebase -- --environment dev --allow-placeholder-config
npm run verify-hosting-artifact --prefix deployment/firebase -- --environment dev
```

To test the assembled site and email-link completion route locally, assemble
*before* starting Hosting. The emulator serves the generated
`deployment/firebase/hosting/` directory; it does not rebuild it.

```powershell
npm run assemble --prefix deployment/firebase -- --environment local --allow-placeholder-config
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
email-link return URLs, and Google/Microsoft provider registrations in the two
projects. A Hosting release does **not** create or change any Auth provider,
user, session, or existing FUMBBL account.

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

Set these GitHub *environment variables* separately in `development` and
`production`:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name for that environment. |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | That environment's deploy service-account email. |
| `FIREBASE_WEB_API_KEY` | Public Firebase web API key for that environment's web app. |
| `FIREBASE_WEB_MESSAGING_SENDER_ID` | Public sender ID for that web app. |
| `FIREBASE_WEB_APP_ID` | Public Firebase app ID for that web app. |

The identifiers and web configuration are not private keys, but environment
scoping prevents accidental cross-environment use. No service-account JSON,
OAuth client secret, Firebase CLI token, `.env` file, or user/session export
belongs in this repository. `gha-creds-*.json` is an ephemeral CI credential
file and is ignored.

In **Settings > Environments**, set `production` to require approval before
deployment. In **Settings > Rules**, protect `main` and make `moles-v*` tags
immutable as described in [the branch-control checklist](../.github/BRANCH_PROTECTION.md).

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
- A browser-client deployment publishes `browser-client/` output at `/play`.
- Firebase Authentication configuration is a separately administered,
  environment-specific Firebase console task. Its secrets and user stores are
  not deployed by GitHub Actions.
- The Java server is built and tested in `Checks` only. It has no Hosting or
  production target here. Once a server hosting target is chosen, add separate
  DEV and PROD server jobs with the same project/token isolation and
  `production` approval boundary; do not add server deployment to the Hosting
  workflows.
