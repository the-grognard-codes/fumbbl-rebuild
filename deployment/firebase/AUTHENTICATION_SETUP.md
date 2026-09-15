# Firebase Authentication environment setup

This repository deliberately contains no Firebase credentials, Microsoft client secrets, service-account keys, users, or sessions. A project owner must make the following console-only configuration in each project; never reuse a provider registration or user store between environments.

| Environment | Firebase project | Auth domain | Email-link return URL |
| --- | --- | --- | --- |
| DEV | `dev-moles-under-the-pitch-org` | `dev.molesunderthepitch.org` | `https://dev.molesunderthepitch.org/login/complete` |
| PROD | `moles-under-the-pitch-dot-org` | `molesunderthepitch.org` | `https://molesunderthepitch.org/login/complete` |

For **each** project:

1. Register a separate Firebase web app and place only its public web configuration in that environment's CI variables.
2. Add only that environment's custom domain to Firebase Authentication authorized domains, then configure its custom email-link domain and the return URL above.
3. Enable Google, Microsoft, and email-link sign-in separately. Use separate Google and Microsoft registrations; put each Microsoft client secret only in its matching Firebase provider configuration.
4. Use dedicated test users in DEV. Do not export, import, copy, link, or migrate PROD users, provider secrets, or authentication sessions.
5. Configure the future Java service from the matching template in `templates/server-auth/`. Token verification must require the exact project ID, issuer, and audience; a DEV token must fail PROD validation and a PROD token must fail DEV validation.

For local work, run Firebase emulators against the DEV project identity only:

```text
firebase emulators:start --project dev-moles-under-the-pitch-org
npm run assemble --prefix deployment/firebase -- --environment local --allow-placeholder-config
```

`local` always uses the DEV project identifier and writes an Auth emulator URL into the generated public configuration. It never selects PROD.
