# Firebase Authentication environment setup

This repository deliberately contains no Firebase credentials, Microsoft client secrets, service-account keys, users, or sessions. A project owner must make the following console-only configuration in each project; never reuse a provider registration or user store between environments.

| Environment | Firebase project | Firebase web `authDomain` | Email-link return URL |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `dev-moles-under-the-pitch-org.firebaseapp.com` | `https://dev.molesunderthepitch.org/login/complete` |
| PROD | `molesunderthepitch-dotorg` | `molesunderthepitch-dotorg.firebaseapp.com` | `https://molesunderthepitch.org/login/complete` |

For **each** project:

1. Register a separate Firebase web app and keep its public web configuration in `scripts/environment.mjs`. It is versioned with the selected Hosting artifact.
2. Add only that environment's custom domain to Firebase Authentication authorized domains, then configure its custom email-link domain and the return URL above.
3. Enable Google, Microsoft and email-link sign-in separately. Use separate Google and Microsoft registrations for DEV and PROD. For Microsoft, configure the matching application (client) ID and client secret in Firebase, and register `https://<authDomain>/__/auth/handler` as a **Web** redirect URI in Entra. Keep client secrets in Firebase, never in browser configuration or source files.
4. Use dedicated test users in DEV. Do not export, import, copy, link, or migrate PROD users, provider secrets, or authentication sessions.
5. Configure the isolated Java service following [game-service deployment](../game-service/README.md). Its environment mapping fixes the project ID and site Origin. Token verification requires the exact project ID, issuer, and audience; a DEV token must fail PROD validation and a PROD token must fail DEV validation. Credentials stay outside the repository; Compute Engine uses its dedicated attached service account.

Google, Microsoft and email-link completion default to `/play`; the sign-in page also preserves the allowed `/teambuilder` and `/spectate` return destinations. `/signin` serves the existing `/login` page without changing query parameters. Cross-device email completion asks for the original email address; it never obtains that address from an invite. Invitations contain only a random session code. Email addresses and Firebase identifiers are never included in game messages.

The current Microsoft registrations accept personal accounts only
(`PersonalMicrosoftAccount` / Consumer audience). The browser therefore sets
`tenant: 'consumers'` on the Microsoft OAuth provider. Firebase defaults to
`common`, which Microsoft rejects for Consumer-only registrations. To support
organizational accounts later, align both registrations' supported account types
with the chosen authority before changing this parameter.

Firebase ID tokens are bearer credentials, not one-time tickets. The service rejects a second active connection for an authenticated account and retains its session slot for reconnect. It does not claim to detect universal JWT replay.

Failed sign-in and email-link completion emit browser-console warnings prefixed
`[MUTP auth]`, containing only the event, method, environment and validated Firebase
error code, plus Microsoft `AADSTS` identifiers when present in the SDK error.
The same codes are shown with the recovery message. These diagnostics
do not send telemetry to a server or log email addresses, raw SDK errors, OAuth
credentials or tokens. Identity Platform user-activity logging is a separate
project setting; enabling it is not part of a Hosting deployment.

For local work, run Firebase emulators against the DEV project identity only:

```text
firebase emulators:start --project dev-moles-under-the-pitch-org
npm run assemble --prefix deployment/firebase -- --environment local
```

`local` always uses the DEV project identifier and writes an Auth emulator URL into the generated public configuration. It never selects PROD.
