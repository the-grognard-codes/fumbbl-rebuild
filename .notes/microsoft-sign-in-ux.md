# Microsoft sign-in and Support UX

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/479
Branch: `feature/microsoft-sign-in-ux`

The owner enabled Microsoft in Firebase and confirmed equal prominence for Google
and Microsoft, with email links below. Preserve MUTP's existing identity and
`/login` links, and make `/signin` an alias. Sign-in is an Operate surface;
Support remains a Read surface.

Implement provider selection, pending guards, actionable recovery, a readable
focused sign-in panel and Microsoft Support guidance. Keep existing allowed return
destinations and project isolation. Do not link accounts or modify credentials.

Validate provider and email behavior with browser stubs, the Support page,
shared account navigation, spectate return, narrow and desktop layouts, and both
Hosting artifacts. Real Microsoft consent requires an owner's account and is
reported separately from stubbed browser coverage.

The owner has requested implementation. The earlier publication and CI/CD bypass
authorization applied to verification-file changes, not this feature.

Follow-up: add official Google and Microsoft marks to their sign-in buttons and
use the approved `brand-package-v4` favicon throughout the site. Provider console
app-logo assets remain MUTP artwork; they are not provider button marks. Preserve
the original provider marks and keep both actions equally prominent.

Implementation and verification results are recorded in
[the outcome report](microsoft-sign-in-ux-outcome.md).
