# Firebase Hosting assembly

`npm run assemble --prefix deployment/firebase -- --environment dev` or `--environment prod` builds the public site and authenticated session proof, then creates one deployable artifact in `deployment/firebase/hosting/`:

- `/` is the static project site.
- `/play` is the Firebase-authenticated two-player session proof.
- `/login/complete` completes email-link authentication against the explicitly selected Firebase project.

Assembly generates `firebase.generated.json` from the repository-root `firebase.json`, adding an environment-specific Content Security Policy. Deploy with `firebase deploy --config firebase.generated.json --only hosting --project <matching-project>`. The CI workflows use this generated configuration. Do not deploy the base configuration directly. Its root `.firebaserc` maps `dev` to `dev-moles-under-the-pitch-org` and `prod` to `molesunderthepitch-dotorg`. The build rejects an omitted or unknown environment and never consults a developer's active Firebase CLI project. The public Firebase web configurations are committed in `scripts/environment.mjs`; they are browser identifiers, not service credentials. `gameWebSocketUrl` is fixed by the selected environment: `wss://game-dev.molesunderthepitch.org/session/v1` or `wss://game.molesunderthepitch.org/session/v1`. Do not commit credentials or OAuth secrets.

Only `--environment local` assembles `browser-client/` at `/play` for the explicit local diagnostic stack. DEV and PROD artifacts contain the authenticated page instead. Google and email links are supported; Microsoft is deferred. Java hosting is separate; see [game-service deployment](../game-service/README.md).

The CI workflows authenticate with GitHub OIDC and Google Workload Identity
Federation (WIF), then let the Firebase CLI use Application Default
Credentials. There are no `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_TOKEN`
secrets. GitHub environments supply only their matching WIF provider and
deploy-service-account identifiers; browser configuration is versioned with the
corresponding Hosting artifact.
`main` deploys to DEV only after `Checks` succeeds. An approved `moles-v*` tag
is the production deployment reference. See
[development-and-release.md](../../docs/development-and-release.md) for setup,
release, and rollback instructions.

Authentication registration and token-boundary instructions are in [AUTHENTICATION_SETUP.md](AUTHENTICATION_SETUP.md). The project has no connection to existing FUMBBL accounts.
