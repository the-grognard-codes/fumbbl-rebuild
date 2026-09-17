# Moles Under the Pitch two-player game service

This standalone Java 21 service uses Jetty 12 and exposes only `wss://host/session/v1`. It authenticates Firebase ID tokens server-side using Application Default Credentials, keeps provider-neutral internal accounts and identity links in H2, and keeps active game sessions in memory. It has no dependency on existing FUMBBL accounts or the legacy game server.

Required environment: `GAME_ENV` (`dev` or `prod`), `FIREBASE_PROJECT_ID`, `GAME_ORIGIN`, `GAME_KEYSTORE`, `GAME_KEYSTORE_PASSWORD`, `GAME_DB_PATH`. The environment mapping is deliberately fixed: dev is `dev-moles-under-the-pitch-org` and `https://dev.molesunderthepitch.org`; prod is `molesunderthepitch-dotorg` and `https://molesunderthepitch.org`. Both Firebase project and origin must exactly match that mapping. ADC is supplied by the deployment environment; do not put credentials in this repository.

Build and test from the repository root: `mvn -f game-service/pom.xml clean verify`, then `java -jar game-service/target/game-service.jar`. Mount a persistent volume at the configured H2 path and mount the TLS keystore read-only. The service deliberately does not expose HTTP, health, login, account linking, or query-string authentication endpoints. `GAME_PORT` defaults to 8443; the host installer uses 443.

Protocol messages are JSON. First send `{ "type":"authenticate", "token":"Firebase ID token" }`; then use `create`, `join` with a 32-character hexadecimal `code`, `chat` with plain `text`, or `leave`. Every state change broadcasts an ordered `session` snapshot with `code`, `selfSlot`, two `{occupied,connected}` slots and up to 50 events. Events contain only sequence, type, slot and optional text. Leaving receives `{ "type":"left" }`. Error payloads have `{ "type":"error", "code":"..." }`.

There are at most 512 retained sessions. A session expires after both players
have been disconnected for one hour; private slots stay reserved until then.
One verified account may have only one active connection. Duplicates are
rejected, while a disconnected account can rejoin its reserved slot using the
invite. A process restart loses active sessions and chat, but retains accounts.

See [provisioning, TLS renewal and live acceptance](../deployment/game-service/README.md).
