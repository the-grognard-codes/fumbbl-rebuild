# Firebase Authentication environment setup

This repository deliberately contains no Firebase credentials, Microsoft client secrets, service-account keys, users, or sessions. A project owner must make the following console-only configuration in each project; never reuse a provider registration or user store between environments.

| Environment | Firebase project | Firebase web `authDomain` | Email-link return URL |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `dev-moles-under-the-pitch-org.firebaseapp.com` | `https://dev.molesunderthepitch.org/login/complete` |
| PROD | `molesunderthepitch-dotorg` | `molesunderthepitch-dotorg.firebaseapp.com` | `https://molesunderthepitch.org/login/complete` |

For **each** project:

1. Register a separate Firebase web app and keep its public web configuration in `scripts/environment.mjs`. It is versioned with the selected Hosting artifact.
2. Add only that environment's custom domain to Firebase Authentication authorized domains, then configure its custom email-link domain and the return URL above.
3. Enable Google and email-link sign-in separately. Microsoft is deferred; do not enable it for this proof. Use separate Google registrations for DEV and PROD.
4. Use dedicated test users in DEV. Do not export, import, copy, link, or migrate PROD users, provider secrets, or authentication sessions.
5. Configure the isolated Java service following [game-service deployment](../game-service/README.md). Its environment mapping fixes the project ID and site Origin. Token verification requires the exact project ID, issuer, and audience; a DEV token must fail PROD validation and a PROD token must fail DEV validation. Credentials stay outside the repository; Compute Engine uses its dedicated attached service account.

Google and email-link completion both redirect to the fixed `/play` path. Cross-device email completion asks for the original email address; it never obtains that address from an invite. Invitations contain only a random session code. Email addresses and Firebase identifiers are never included in game messages.

Firebase ID tokens are bearer credentials, not one-time tickets. The service rejects a second active connection for an authenticated account and retains its session slot for reconnect. It does not claim to detect universal JWT replay.

For local work, run Firebase emulators against the DEV project identity only:

```text
firebase emulators:start --project dev-moles-under-the-pitch-org
npm run assemble --prefix deployment/firebase -- --environment local
```

`local` always uses the DEV project identifier and writes an Auth emulator URL into the generated public configuration. It never selects PROD.
