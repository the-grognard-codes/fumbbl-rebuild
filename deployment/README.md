# Build and deployment usage

Use `dev-local`, `dev-remote`, or `prod` explicitly when requesting work in chat.
Specify whether the request is to build only or to build and deploy. Run the CLI
commands below from the repository root.

The project CLI requires an explicit environment. DEV targets run the complete
browser suite locally; PROD runs the same suite on GitHub before deployment.

## DEV local

Rebuild the current working files and restart the local review stack:

```powershell
node tools/deploy.mjs --environment dev-local
```

Chat request:

> Rebuild and restart dev-local using my current working files.

This includes uncommitted edits and serves the application at
`http://localhost:5000/play`. It rebuilds Hosting and the isolated local game
server, then restarts the managed local services. Browser validation completes
before running services are stopped. The existing local setup and credentials
are required.

The existing `node tools/dev-local.mjs --restart` command remains supported and
runs the same mandatory preflight. Use that script's `--start` to build and start
the stack, or `--stop` to stop it. It does not accept `--rebuild`.

## DEV remote

Validate committed remote `main` locally, then request its Hosting deployment:

```powershell
node tools/deploy.mjs --environment dev-remote
```

Chat request:

> Build and deploy main to dev-remote.

The CLI fetches the exact remote `main` commit and validates it in a temporary
detached worktree, leaving the active branch and working files in place. It
removes that generated worktree, verifies that remote `main` has not moved, and
requires a successful GitHub `Checks` run for the same commit. An ongoing run is
watched; an absent or failed run stops deployment.

It then dispatches `Deploy Firebase Hosting (DEV)` with the validated SHA. The
workflow independently verifies the requested SHA is current `main` and has
successful checks, builds from it, and deploys to `dev.molesunderthepitch.org`.
The CLI prints the deployment request; use `gh run list --workflow
firebase-deploy-dev.yml` and `gh run watch <run-id> --exit-status` to follow it.

The command does not include local uncommitted edits or unpublished branch
commits. Changes must reach `main` through the normal commit, PR, and merge
process. Merging runs the faster GitHub checks; DEV publishing is now explicit
through this CLI, rather than automatic after a merge.

If the CLI reports no successful Checks run, start one and rerun the CLI after
it passes:

```powershell
gh workflow run maven-verify.yml --ref main
```

Dispatching `Checks` alone does not publish DEV or run the local browser suite.

## PROD

Deploy an existing release tag whose commit belongs to `main`. Replace the
example tag with the intended existing `moles-v*` tag:

```powershell
node tools/deploy.mjs --environment prod --release-tag moles-v1.2.3
```

Chat request:

> Build and deploy moles-v1.2.3 to PROD.

The CLI dispatches the PROD workflow. It resolves the tag to a commit, verifies
ancestry in `main`, and runs every hosted and interaction browser suite on
GitHub runners against that commit. Deployment depends on successful complete
coverage; failed, skipped, cancelled, missing, or stale execution blocks it.

After validation and any configured production approval, the workflow builds
from that same commit and deploys Hosting to `molesunderthepitch.org`. The CLI
does not create or push a tag. Direct dispatch with
`gh workflow run firebase-deploy-prod.yml --ref main -f release_tag=moles-v1.2.3`
uses the same mandatory GitHub validation gate.

Legacy tags created before this validation split lack compatible browser
validation tooling and fail the new release gate. Roll back those versions
using Firebase Hosting's saved release history; see the release runbook.

## Build only

To assemble a Hosting artifact locally without publishing it, select the
artifact environment explicitly:

```powershell
node deployment/firebase/scripts/assemble.mjs --environment local-dev
node deployment/firebase/scripts/assemble.mjs --environment dev
node deployment/firebase/scripts/assemble.mjs --environment prod
```

Run the one command matching the intended environment. Each assembles the
current working files into `deployment/firebase/hosting/` and generates
`firebase.generated.json`; it does not start services or deploy Hosting.

Chat request:

> Build the dev-remote Hosting artifact from my current working files only.

## Branch and working tree behavior

| Target | Source used for deployment |
| --- | --- |
| `dev-local` | Current branch and working files, including uncommitted edits. |
| `dev-remote` | Committed `main`, checked out on the GitHub runner. |
| `prod` | Specified release tag from `main`, checked out on the GitHub runner. |

Selecting an environment does not switch the active local branch, commit, pull,
push, merge, or synchronize its working files. DEV remote fetches the requested
commit objects and creates/removes its own temporary detached worktree. Builds
still generate their normal output files. Request other Git operations
separately when they are needed.

The DEV remote and PROD commands above deploy Hosting. Their Java game servers
have a separate deployment process; DEV local rebuilds its local review server.

## Validation and diagnostic commands

Local browser validation installs the lockfile dependencies, ensures the matching
Chromium is available, builds the site, and runs all suites with fresh coverage
reports. Installed browsers are reused; passing results are never reused. Linux
developers must also have Playwright's system dependencies installed.

PR and `main` GitHub checks retain Java, native state tests, assets, unit tests,
Hosting artifact checks, service checks, and security checks. Their `Static
delivery` result covers those static checks and browser inventory registration;
it no longer claims that browsers ran. Fewer independent browser validations
before DEV is an accepted tradeoff; PROD always requires the GitHub suite.
Local execution is enforced by the supported project CLI. GitHub verifies the
requested SHA and fast Checks, but does not independently certify a local test
pass. Direct low-level DEV workflow dispatch is an operator trust boundary,
rather than the supported publication path.

To request an additional full browser run on GitHub without deploying:

```powershell
gh workflow run maven-verify.yml --ref main -f full_browser_validation=true
```

Chat request:

> Run the complete browser suite on GitHub for main without deploying.

See [Firebase Hosting assembly](firebase/README.md) for artifact details,
[development and release](../docs/development-and-release.md) for release setup
and rollback, and [game service deployment](game-service/README.md) for Java
server deployment.
