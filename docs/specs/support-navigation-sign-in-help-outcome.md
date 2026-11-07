# Support navigation and sign-in help outcome

Issue: [#474](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/474).
Branch: `feature/support-navigation-sign-in-help`, based on `c14ef7054`.
The owner accepted the result and authorized committing all changes, publishing
a PR, waiting for successful CI, merging to main and deleting the working
branch. The completed-features tracker includes this feature. The closing PR
records final commit, CI and merge evidence. Dev-local remains stopped; no
provider sign-in, email delivery or remote deployment is part of this delivery.

## Delivered behavior

- Opening topic navigation links to sign-in help, contact, screen sizes,
  scaling/zoom, input guidance and hardware guidance. Native anchors focus the
  destination heading and work without JavaScript.
- Google and email troubleshooting use native disclosures before the device
  reference. Google guidance covers hidden/blocked/closed popups, account choice,
  verification and Google account recovery. Email guidance covers address checks,
  Spam/Junk and filters, delivery time, opening in the original browser or
  confirming the email elsewhere, and requesting a fresh failed/expired link.
- Contact appears before device guidance and remains available through the
  opening navigation. It asks for useful troubleshooting context while excluding
  credentials, codes and sign-in links.
- Sign-in and email completion link directly to the help. Authentication logic,
  configuration and provider behavior are unchanged; the separate pending/error
  handling priority remains outside this slice.
- Existing device qualifications, hardware references, calculator labels/status,
  keyboard/touch/no-script behavior and layout-fit disclosure are retained.

## Verification

- Production build passed (TypeScript, Vite and static assembly).
- Site check passed: 23 inputs and 191 history entries.
- All **12 site unit tests** passed.
- Focused Support and shared-navigation/account-menu browser run: **2 passed**.
  After the explicit topic font-size refinement, the affected Support suite
  passed again with real web fonts enabled for its primary visual captures.
- All six native topic links were exercised with keyboard and pointer, contact
  with touch, and every topic plus both sign-in-page help links with JavaScript
  disabled. Method disclosures remained operable with keyboard and no scripts.
- Existing scaling results, five scale stops, Home/arrow boundaries, touch input,
  no-script fallback and layout-fit disclosure passed.
- Layout fit was checked at 1440, 768, 640, 390 and 320 CSS pixels. All topic links
  measured 16px text and at least 44px height. No horizontal overflow occurred,
  including expanded Google/email help. These are browser checks rather than
  physical-device or full screen-reader acceptance.
- Desktop/phone opening views and expanded mobile help were visually inspected.
  Captures and computed measurements are in `test-output/support-page/`.
- BB2025 source audit and whitespace checks passed. Java/server tests were not
  run because no game, authentication logic, protocol or stored-data behavior
  changed.

## Design triage

The static detector initially misread inherited navigation font sizing; declaring
the existing 1rem size explicitly removed that finding. Computed panel padding is
20–36px at all measured sizes, so the cramped-padding warnings are false
positives. The inherited shared background remains part of this refinement's
approved identity. File-scoped `cramped-padding` and `radial-halo` exceptions were
recorded through the hooks CLI for the Support HTML only. A follow-up scan has no
non-advisory findings. The broader shared navigation/typography priority remains
outside this task; DESIGN.md and PRODUCT.md were not revised.

Post-task hook review confirmed that the two sign-in-page kickers and four
10.88px button labels predated this work. The owner approved including their
cleanup: both kickers are removed, and page-scoped `login.css` sets all four
button labels to 12px. The inherited shared-background exception remains scoped
to those two HTML files; no legibility or eyebrow exception was added.

Follow-up verification: all four labels measured 12px at 1280, 390 and 320px
widths, with no page-level horizontal overflow. The existing confirmation form
was exposed in the no-script fixture to check its layout without attempting
authentication. The affected Support/browser suite and 24-input site check pass;
both sign-in pages have zero non-advisory detector findings. Captures and
`auth-geometry.json` are in `test-output/support-page/`. The narrow email inputs
retain their existing extension past the panel edge, which is outside this
approved label cleanup.

## Guidance sources

The copy was checked against the app's `login.js` and `complete.js` flow and these
primary sources; no fixed delivery or link-expiry time is promised:

- [Firebase email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth): email confirmation, local browser storage and invalid/expired link handling.
- [Google popup controls](https://support.google.com/chrome/answer/95472): site-specific popup recovery.
- [Google account recovery](https://support.google.com/accounts/answer/7682439): account access and work/school administrator help.

## Process note

Native anchors and disclosures provide the new recovery path without adding a
second script or interfering with the working calculator. Extending the existing
browser suite protects navigation and no-script behavior alongside the established
calculator checks. Issue #474 tracks the closing PR and final CI/merge evidence.
