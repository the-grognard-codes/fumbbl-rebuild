# Moles Under the Pitch: Firebase Login Checklist

## Production layout

| Address | Purpose |
| --- | --- |
| `https://molesunderthepitch.org/` | Public project and “What is it?” page |
| `https://molesunderthepitch.org/play` | HTML5 client |
| `https://molesunderthepitch.org/login/complete` | Magic-link completion route |
| `https://PROJECT_ID.firebaseapp.com` | Firebase-managed OAuth callback handler |

Squarespace is the domain registrar and DNS manager only. Firebase Hosting serves
the public site and browser client at `molesunderthepitch.org`.

## Firebase project and ownership

- [ ] Create a personally owned Firebase production project, separate from FUMBBL
      accounts and infrastructure.
- [ ] Secure the owner Google account with a passkey or multi-factor authentication
      and a recovery method.
- [ ] Begin on the Firebase Spark plan and set a reminder to review usage before
      enabling billing-backed services.
- [ ] Create a separate Firebase development project or use Firebase emulators for
      local work.
- [ ] Keep Firebase as the authentication authority for new Moles Under the Pitch
      accounts; keep the Java server as the authority for gameplay and league data.

## Domain and Firebase Hosting

- [ ] Enable Firebase Hosting and deploy a minimal static root page.
- [ ] Add `molesunderthepitch.org` as a Firebase Hosting custom domain.
- [ ] Add Firebase's ownership TXT record in Squarespace DNS.
- [ ] Replace only the apex web-hosting A and AAAA records with the exact Firebase
      records shown by the Firebase custom-domain wizard.
- [ ] Preserve unrelated DNS records, especially mail-related MX and TXT records.
- [ ] Optionally add `www.molesunderthepitch.org` and redirect it to the apex domain.
- [ ] Confirm that Firebase has provisioned TLS and that the root page loads over
      HTTPS.
- [ ] Configure Hosting rewrites so `/play` and `/login/complete` return the HTML5
      application instead of a 404 page.
- [ ] Configure production security headers and restrict browser connections to the
      game-server origin.

## Public project page

- [ ] Publish the project and “What is it?” page at the root URL.
- [ ] Include the independent-project and non-affiliation statement.
- [ ] Publish a privacy-policy URL and a support-contact address for the provider
      consent screens.
- [ ] Link the public page to `/play` when the client is ready.

## Firebase Authentication

- [ ] Register the Firebase web application for `molesunderthepitch.org`.
- [ ] Add `molesunderthepitch.org` to Firebase Authentication's authorized domains.
- [ ] Add local development and preview domains only when required; do not leave
      broad temporary domains authorized.

### Google sign-in

- [ ] Enable Google as a Firebase Authentication provider.
- [ ] Configure the Google consent-screen branding, support email, homepage, and
      privacy-policy URL.
- [ ] Request identity only; do not request Google API scopes such as Drive or
      Contacts.

### Microsoft sign-in

- [ ] Register a Microsoft Entra application that accepts personal Microsoft
      accounts and work/school accounts.
- [ ] Register Firebase's generated `firebaseapp.com` OAuth callback with Microsoft
      Entra.
- [ ] Add the Microsoft client ID and client secret to Firebase's Microsoft provider
      configuration only.
- [ ] Record the client secret expiry date, rotation procedure, and accountable owner.
- [ ] Request basic identity only; do not request Microsoft Graph permissions.

### Passwordless email links

- [ ] Enable Firebase's email-link sign-in provider.
- [ ] Set the return URL to `https://molesunderthepitch.org/login/complete`.
- [ ] Configure the root custom domain as the email-link domain.
- [ ] Review and test the default email template, including its branding and support
      contact.
- [ ] Implement no password sign-up, password login, or password-reset user interface.

## Client and Java-server integration

- [ ] Add Google, Microsoft, and “email me a sign-in link” options to the browser
      login screen.
- [ ] Handle login cancellation, expired links, cross-device email completion, and
      provider-denied access clearly.
- [ ] Send Firebase ID tokens to the Java server only over HTTPS or WSS.
- [ ] Verify every Firebase ID token on the server before creating a game session.
- [ ] Key new accounts to Firebase's stable user ID, never to email alone.
- [ ] Retain a provider-neutral internal identity-link model for a future FUMBBL data
      migration.
- [ ] Do not implement linking, merging, or migration behavior for existing FUMBBL
      accounts in this project phase.

## Security and release checks

- [ ] Keep client secrets, service-account keys, and production configuration out of
      the repository.
- [ ] Restrict browser API keys and permitted origins appropriately.
- [ ] Validate intended return paths and reject open redirects.
- [ ] Cover provider-neutral authentication policies with local test doubles.
- [ ] Test Google, Microsoft, and magic-link flows with dedicated test accounts on
      desktop and mobile browsers.
- [ ] Confirm invalid, expired, replayed, and mismatched-account tokens are rejected.
- [ ] Confirm direct navigation to `/login/complete` behaves correctly.
- [ ] Document owner access, Firebase recovery, Microsoft-secret rotation, and static
      site rollback procedures.

## Deferred scope

- [ ] Define an owner-approved migration plan for existing FUMBBL accounts.
- [ ] Choose hosting for the Java/WebSocket server and its database separately from
      Firebase Hosting.
