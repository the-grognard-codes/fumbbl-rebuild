# General site navigation fixes

Scope: [#222](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/222). Branch `fix/general-site-navigation`, base `8655225b75cf67d6637aa37a05c83512b9bf78c8`.

## Intended outcome

Every site page uses the homepage's top bar: Moles Under the Pitch, Team Builder, Play, Spectate, Updates and My account. Match and result routes retain this navigation; the active item reflects the current section. Brand, spacing, colors and responsive layout are shared. The account identity and existing Sign in / Sign out behavior remain intact.

Account option hover colors match Sign out, including placeholder rows. My account uses those same highlight colors. Keyboard focus also receives the highlight. Account Settings, My games, My teams, Match history and Preferences remain disabled placeholders.

Confirmed! must stay anchored at one position across setup, play, action previews, teammate selection and pending actions. Existing hidden states and confirmation eligibility/submitted intents remain unchanged.

## Implementation and relevant checks

A shared static renderer produces the header during site builds and Updates generation. Other page sources include a header marker checked by the existing site input check. Generated output has full navigation before JavaScript loads. Page-specific header overrides are removed, and the match viewport uses the remaining space below the bar. Account popovers paint above the isolated match content.

- Extend the existing account browser journey to compare actual hover styles and verify inactive placeholders, authentication, keyboard dismissal, shared navigation/active item/header styling, and popover bounds on all nine pages plus match/result routes at desktop and mobile widths.
- Run existing play, builder, spectate, Updates and current-games journeys, including short match viewports, resume, native controls and owned-game lifecycle.
- Keep the native match privacy assertion scoped to match content. The header intentionally displays the caller's authenticated email; private native/provider identifiers must remain absent from the match surface and console.
- Run site build, input checks and unit checks. Complete independent Standards and Spec review and final PR CI before merge.

## Local validation

Site build and input checks pass, along with ten site unit tests and fourteen affected hosted browser journeys. Four focused interaction journeys cover the confirmation position, HUD controls, teammate selection and smart Blitz submission. The account journey covers eleven routes at 1224px and 360px widths. Match checks cover same-tab/optional-window launch, direct resume/denial, two coaches and a spectator, reconnect, six viewport sizes (including 1224x330 and 360x800), and opening/closing Game Menu inside the remaining match area. The bounded synthetic console check reports zero errors and no private identifier leakage.

Initial match checks caught the old full-window game-menu positioning and a competing full-height match rule. Both are corrected, and all three play journeys passed on rerun. A navigation locator now targets the primary bar explicitly because setup also contains a Spectate link.

Full CI also exposed an old Blitz layout assertion requiring the pitch to begin at window coordinate zero and end at window height. Its replacement checks the pitch against its actual viewport, verifies that viewport fits below the visible header, and retains all action/pinning/confirmation assertions. The full Blitz journey passed locally after this contract update.

Browser captures use synthetic test identities:

- [Account option highlighting](../../.notes/overhaul-analysis/verification/general-navigation/account-desktop.png)
- [Mobile account menu](../../.notes/overhaul-analysis/verification/general-navigation/account-mobile.png)
- [Shared bar above a short match viewport](../../.notes/overhaul-analysis/verification/general-navigation/match-desktop.png)

Confirmed! now uses one dock anchored to the match viewport, separate from the variable decision panel. Setup and play use the same control and existing eligibility/submission rules. Preview text and teammate cancellation cannot move its center. Hover does not translate the button. The outer match clips focus scrolling; supporting panels still scroll internally.

The position regression first reproduced a 65px setup jump and a sideways shift at 1280x660. It now passes for both coaches at 1280x660, 1920x1080, 375x660, 640x330 and 375x300 across setup, play, additional actions, previews, teammate proposal/cancellation, pending setup/action requests, hidden kickoff/waiting/full-time/spectator states and reappearance. It checks exact x/y within 1px, viewport centering/bounds, no match-container scrolling and submitted setup/action operations. Existing hosted setup/result selectors now locate the shared confirmation dock. All nine hosted play/Blitz/result journeys passed after the change; HUD, teammate and smart Blitz interaction journeys passed too.

- [Confirmation during play (isolated fixture)](../../.notes/overhaul-analysis/verification/general-navigation/confirmation-play.png)
- [Same confirmation position during setup (isolated fixture)](../../.notes/overhaul-analysis/verification/general-navigation/confirmation-setup.png)

Both independent review axes approved the implementation and confirmation follow-up. The Spec review additionally observed that the account popover could extend below a short viewport. It now scrolls internally; the focused account journey passes at 1224x330 and 360x330, keeping Sign out visible within the disclosure and leaving the page at scroll position zero. Final PR CI is required before merge. Existing generated-file edits are preserved separately from this fix.
