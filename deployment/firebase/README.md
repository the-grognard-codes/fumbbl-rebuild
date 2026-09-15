# Firebase Hosting assembly

`npm run assemble --prefix deployment/firebase -- --environment dev` or `--environment prod` builds the public site and browser client, then creates one deployable artifact in `deployment/firebase/hosting/`:

- `/` is the static project site.
- `/play` is the independently built browser client.
- `/login/complete` completes email-link authentication against the explicitly selected Firebase project.

The repository-root `firebase.json` deploys that artifact. Its root `.firebaserc` maps `dev` to `dev-moles-under-the-pitch-org` and `prod` to `moles-under-the-pitch-dot-org`. The build rejects an omitted or unknown environment and never consults a developer's active Firebase CLI project. Public Firebase web configuration is generated at build time from the three `FIREBASE_WEB_*` variables; see the environment examples. Do not commit Firebase credentials, OAuth secrets, service-account keys, or production-only configuration.

The workflows use the exact project IDs and environment-scoped `FIREBASE_SERVICE_ACCOUNT` secrets. Each environment supplies its own public `FIREBASE_WEB_*` variables. The development deployment targets the `dev` Hosting channel; a published GitHub release is the only production deployment trigger.

Authentication registration and token-boundary instructions are in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). The project has no connection to existing FUMBBL accounts.
