# Microsoft sign-in and Support outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/479
Branch: `feature/microsoft-sign-in-ux`

## Delivered

- Google and Microsoft have equally sized and styled controls, with email links
  below. The page uses a focused layout, clear labels, visible keyboard focus and
  touch targets of at least 44px. Production omits environment configuration;
  development and local profiles retain a short distinction from the live site.
- Microsoft uses Firebase's `OAuthProvider('microsoft.com')` and the existing
  popup flow. Secrets remain in provider configuration. No account linking,
  credential migration or token-boundary changes were introduced.
- Pending guards prevent duplicate popup, email and completion requests. Popup
  errors restore keyboard focus and explain cancellation, blocking, network,
  account conflicts, rate limits and unavailable providers.
- Email sending and completion tolerate blocked browser storage. Completion
  handles invalid/expired links and network recovery. Existing allowed return
  destinations remain `/play`, `/teambuilder` and `/spectate`.
- The site build emits `/signin` from the same rendered source as `/login`.
  Both entry addresses preserve the existing query parameters.
- Support documents Microsoft popup/account selection, organization restrictions,
  recovery and account conflicts. Both auth pages link to sign-in help.
- Current setup documentation and the Unreleased changelog describe Microsoft
  support. The new browser regression suite is registered in hosted coverage.

## Verification

- `node --test site/test/signin-browser.test.mjs`: passed with Firebase SDK stubs,
  including correct providers, user activation, return whitelisting, `/signin`,
  pending guards, error recovery, email storage/completion and startup failures.
- `site/test/support-browser.test.mjs`, `site/test/account-menu-browser.test.mjs`
  and `site/test/spectate-browser.test.mjs`: passed. Support includes no-script,
  keyboard, touch, topic navigation and existing scaling checks.
- `npm.cmd run check --prefix site` and `npm.cmd test --prefix site`: passed
  (12 unit tests).
- `node --test tools/test/validation.test.mjs`: passed (15 tests); browser
  inventory includes the new sign-in suite.
- Both DEV and PROD full Hosting assemblies and artifact checks passed.
- Firebase Hosting's local serving library returned the sign-in page for
  `/signin` and `/signin/`, preserving `returnTo` and `reason`.
- Rendered desktop, intermediate, 390px and 320px layouts were checked for
  overflow, equivalent provider controls, visible focus and touch geometry.
  Desktop and phone captures with the actual site fonts were visually reviewed.
- `git diff --check`: passed. Self-review preserved project isolation, allowed
  destinations and unrelated site/game behavior. Java modules were unchanged.

Preview captures: `test-output/microsoft-sign-in/signin-prod-1280.png` and
`test-output/microsoft-sign-in/signin-prod-390.png`.

## Remaining validation and delivery

Real Microsoft account consent and organization-specific access policies were
not exercised; browser coverage uses SDK stubs. The implementation is uncommitted
and has not been pushed or deployed. Publication authorization for the preceding
verification-file correction does not apply to this feature.

## Provider icons and favicon follow-up

The owner requested provider icons and a site favicon and pointed to the existing
brand package. Sign-in buttons now use locally served official Google and Microsoft
marks with equivalent light treatments. The approved MUTP optical SVG and 16/32px
PNG exports in `brand-package-v4` generate the site's SVG, PNG and multi-size ICO
favicons. Every built HTML page receives content-versioned icon links.

Google's current branding requires Google Sans for its button; narrow detector
exceptions record that provider-specific font and its parser match. MUTP's general
typography and canonical brand artwork are unchanged. Source URLs and usage notes
are in `site/src/assets/sign-in-providers/README.md`.

The sign-in and account-navigation browser checks passed with the new assets;
the browser loaded both provider marks and decoded all three favicon formats.
Site checks and all 12 site unit tests passed. Updated desktop/mobile captures
were reviewed with site fonts. Both environment artifact checks include the
provider assets and generated favicons.

## Local Microsoft failure diagnosis

The owner reported `auth/invalid-credential` on localhost. Read-only checks found
Microsoft enabled in both Firebase projects with the recreated client IDs and
configured secrets. User-activity logging was disabled in both projects. No
cloud logging or provider settings were changed.

Client failures now log only fixed event/method/environment metadata, validated
Firebase error codes and Microsoft `AADSTS` identifiers, when present. The same
codes appear with the recovery message. Raw SDK errors, email addresses and
credentials are excluded. Browser regressions first failed for missing diagnostic
fields, then passed after the changes, including synthetic private error data
that must not be emitted.

An unattended real-SDK check on localhost reached Microsoft's account-entry
screen; it did not enter credentials or establish a user session. A separate
in-memory client probe used an intentionally invalid authorization code and
returned `AADSTS9002313` for both apps. That result does not establish whether
either secret is valid and is not the owner's reproduced failure.

The owner was asked to capture the provider code in the failed
`accounts:signInWithIdp` response. The diagnostic helper now extracts that code
from the SDK error message when Firebase preserves it. At that stage, the actual
post-account failure was unconfirmed pending that evidence. The local build was restored
to `local-dev`, and HTTP checks confirmed the updated helper is served on port
5000. No additional remote deployment occurred.

## Confirmed Microsoft audience mismatch and fix

The owner's failed Firebase response identified `invalid_request`: the Microsoft
registration has a Consumer audience, which rejects the default `/common`
authority. The returned OAuth state was not copied into repository artifacts.

The Microsoft provider now sets `tenant: 'consumers'`, matching the existing
personal-account-only registration. Google is unchanged. Sign-in and Support
explain that Microsoft sign-in currently accepts personal accounts; no Entra
settings or secrets were changed.

The browser regression first failed because no consumers authority was specified.
The unattended real-SDK loop also failed after observing `/common`. Both passed
after the fix: a real request used `/consumers/oauth2/v2.0/authorize` and reached
Microsoft's personal-account entry page on `login.live.com`, without an OAuth
error. No account credentials were entered and full user consent remains an
owner validation step.

Local-dev assembly, sign-in and Support browser checks, site input checks and
`git diff --check` passed. The local build is restored to the `local-dev` profile
with the corrected flow. Changes remain uncommitted and undeployed remotely.

## Owner validation

The owner confirmed that Microsoft sign-in now works on localhost. Using the
same email as an existing Google-backed MUTP account produced
`auth/account-exists-with-different-credential`, and the intended recovery message
was displayed. This validates that the corrected Microsoft flow reaches Firebase
account resolution and that the existing account-conflict handling works.

The existing account remains accessible through its original sign-in method.
Provider linking is outside this implementation and was not performed or
authorized. Remote publication remains pending separate authorization.

## Delivery authorization

After accepting the implementation, the owner authorized staging all changes,
committing, opening a PR, waiting for CI, merging into main, removing the local
and remote feature branch after merge, updating the completed-features tracker,
and stopping dev-local. The tracker entry is included in this delivery. Hosting
deployment is not part of this authorization.
