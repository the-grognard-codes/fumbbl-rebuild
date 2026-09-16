# Firebase Hosting assembly

`npm run assemble --prefix deployment/firebase -- --environment dev` or `--environment prod` builds the public site and browser client, then creates one deployable artifact in `deployment/firebase/hosting/`:

- `/` is the static project site.
- `/play` is the independently built browser client.
- `/login/complete` completes email-link authentication against the explicitly selected Firebase project.

The repository-root `firebase.json` deploys that artifact. Its root `.firebaserc` maps `dev` to `dev-moles-under-the-pitch-org` and `prod` to `molesunderthepitch-dotorg`. The build rejects an omitted or unknown environment and never consults a developer's active Firebase CLI project. Public Firebase web configuration is generated at build time from the three `FIREBASE_WEB_*` variables; see the environment examples. Do not commit Firebase credentials, OAuth secrets, service-account keys, or production-only configuration.

The CI workflows authenticate with GitHub OIDC and Google Workload Identity
Federation (WIF), then let the Firebase CLI use Application Default
Credentials. There are no `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_TOKEN`
secrets. Each GitHub environment supplies its own public `FIREBASE_WEB_*`
variables plus the matching WIF provider and deploy-service-account identifiers.
`main` deploys to DEV only after `Checks` succeeds. An approved `moles-v*` tag
is the production deployment reference. See
[development-and-release.md](../../docs/development-and-release.md) for setup,
release, and rollback instructions.

Authentication registration and token-boundary instructions are in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). The project has no connection to existing FUMBBL accounts.
