# Local review server ADC reauthentication

The isolated review server mounts a Windows Application Default Credentials (ADC)
JSON file at `/run/adc/application_default_credentials.json` and selects it with
`GOOGLE_APPLICATION_CREDENTIALS` in
[`compose.match-review.yaml`](compose.match-review.yaml). The Java authenticator
passes that credential to Firebase Admin and verifies the browser's Firebase ID
token with revocation checking. A healthy HTTP listener does not prove that this
credential can still call Firebase Authentication.

## How often must it be refreshed?

There is **no universal periodic renewal interval** for an ADC file created by
`gcloud auth application-default login`. Its user refresh token normally obtains
new short-lived access tokens automatically while it remains valid. Google says
refresh tokens can stop working after revocation, six months of nonuse, token
limits, a time-limited grant, or an applicable Cloud session control. A Google
Cloud session control can produce `invalid_grant`; `error_subtype: invalid_rapt`
identifies a session-control failure when Google returns that subtype. Without
the subtype or policy details, this incident's `invalid_grant` cannot establish
which cause occurred. [Google OAuth 2.0 refresh-token guidance](https://developers.google.com/identity/protocols/oauth2#expiration),
[Google Cloud token types](https://docs.cloud.google.com/docs/authentication/token-types).

Google Cloud now documents a **16-hour default session length** for Cloud
console and SDK customers unless an organization sets another policy; a binding
may instead specify 1–24 hours or disable that limit. Google specifically says
local ADC expires with an applicable Google Workspace session and must then be
renewed using `gcloud auth application-default login`. Thus 16 hours is a
plausible cause of a repeat failure, **not a measured expiry for this account**.
Check the account's actual Cloud/Workspace session policy before assigning a
cadence. [Session controls](https://docs.cloud.google.com/access-context-manager/docs/session-controls-for-reauthentication),
[reauthentication](https://docs.cloud.google.com/docs/authentication/reauthentication).

`gcloud auth login` and `gcloud auth application-default login` maintain
**different credentials**. A working Cloud CLI account does not show that the
server's ADC refresh token is valid. On Windows, the standard ADC file is
`%APPDATA%\gcloud\application_default_credentials.json`; this stack may select
another host file through `M6_ADC_FILE`. [ADC lookup and credential
separation](https://docs.cloud.google.com/docs/authentication/application-default-credentials).

## Check and recover

The routine startup path is `node tools/match-review-start.mjs`. It performs
the checks below, renews ADC interactively only after an actual expiry, updates
the isolated review mount, and verifies the restarted server. It does not run
`gcloud auth login`; the Cloud CLI identity is separate and is not required for
signed-in local match play.

1. For this stack, run `node tools/match-review-adc-check.mjs` from the
   repository root. It locates the **mounted** ADC through the exact review
   container and checks both token refresh and Firebase Auth access, without
   printing either token. `SESSION_EXPIRED` means Google returned the
   `invalid_rapt` session-control subtype; `REAUTHENTICATION_REQUIRED` means
   `invalid_grant` without that subtype. `gcloud auth application-default print-access-token > $null`
   in PowerShell checks only gcloud's standard ADC location, which may be a
   different file. `gcloud auth print-access-token` checks the separate CLI
   identity. Never paste a token, credential file, or OAuth authorization code
   into logs or tickets. [ADC token command](https://docs.cloud.google.com/sdk/gcloud/reference/auth/application-default/print-access-token).
2. If ADC is invalid, renew it interactively with
   `gcloud auth application-default login`, preserving any custom
   `--client-id-file`/scopes used for this setup. If the refreshed standard ADC
   file is not the file selected by `M6_ADC_FILE`, update the selected host file
   too, set its quota project to the dev project, and verify it with the mounted
   ADC preflight. Firebase's Admin SDK guide documents additional Desktop OAuth
   client ID and explicit project ID requirements for end-user credentials.
   Confirm a signed-in browser can connect. [Firebase Admin local credential
   guidance](https://firebase.google.com/docs/admin/setup#test-with-gcloud-end-user-credentials).
3. Recreate **only** the isolated review server after renewing its mounted host
   credential file, then validate a real signed-in `/play` connection. Its
   unauthenticated HTTP healthcheck cannot exercise Firebase Admin. The
   container's read-only file mount and restart details are in the local
   [review stack runbook](match-review.md).

Do not schedule blind ADC reauthentication: an expired user session can require
an interactive sign-in, and Google warns against using user credentials for
long-running server-to-server deployments. For a persistent hosted game server,
use its attached service account through ADC; Google recommends that mechanism
for production on Google Cloud. [Google OAuth session-control guidance](https://developers.google.com/identity/protocols/oauth2#expiration),
[ADC attached-service-account guidance](https://docs.cloud.google.com/docs/authentication/application-default-credentials#attached-sa).
