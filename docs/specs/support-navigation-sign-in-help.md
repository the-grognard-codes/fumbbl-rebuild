# Feature: Support navigation and sign-in help

GitHub issue: [#474](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/474)

## Abstract

Make Support a help destination with opening topic links, Google/email sign-in troubleshooting and an early contact route, addressing priority 3 of the November 6 public-site critique.

## Objective

Let a coach who cannot sign in reach relevant help immediately, while retaining the existing device guidance and working scaling calculator.

## Context / Existing Behavior

Support opens with device recommendations and places contact details after the hardware reference. Its sections have headings but no topic navigation. Google and email-link authentication have no dedicated troubleshooting content or direct help link from their entry/completion pages.

## In Scope

- Native opening links to sign-in help, contact, viewing sizes, scaling/zoom, input guidance and hardware guidance.
- Plain-language Google help for popup/cancellation/account-selection problems and account recovery.
- Email-link help for delivery delays, spam/junk/filter checks, address mistakes, same/different-browser completion and failed/expired links.
- Early contact guidance and direct Support links from sign-in and email completion.
- Owner-approved follow-up: remove the two redundant sign-in-page kickers and
  raise their four action-button labels to 12px using page-scoped styling.
- Existing style, no-JavaScript operation, keyboard/touch anchors, responsive verification, documentation and Unreleased entry.

## Out of Scope

- Authentication transport, pending/error handling, provider configuration or account-linking changes (critique priority 2 remains separate).
- Global navigation/typography redesign, revised hardware recommendations or calculator algorithms.
- Commit, push, PR, merge or deployment without separate authorization.

## Functional Requirements

1. Opening topic links reach every major help/reference section without custom JavaScript.
2. Google/email troubleshooting appears before device reference material; contact is reachable from the opening navigation and before that reference.
3. Help matches the implemented popup and email-completion paths, gives safe recovery actions and avoids unverified sender names or link-expiry promises.
4. Support can be reached directly from sign-in and email-link completion.
5. Retain current device qualifications, calculator labels/status/keyboard/touch/no-script behavior, layout-fit disclosure, support address and account-separation messaging.

## Acceptance Criteria

- Topic links work with keyboard, pointer/touch and JavaScript disabled; targets and focus are clear.
- Google and email troubleshooting can be read without signing in; missing email guidance includes Spam/Junk and mail filters.
- Contact is available without traversing technical guidance.
- Desktop/narrow/zoomed layouts fit, and existing calculator/disclosure regressions pass.
- Relevant build, site unit/check and focused browser verification pass; outcome and limitations are recorded.

## Constraints

Create a new working branch from current main. Preserve the approved Pixel Pitch identity and unrelated changes. Do not send test emails, complete provider sign-in, change authentication/security settings or publish without authorization.

## Implementation Guidance

Refine the Support HTML/CSS, reuse native anchors/details, add small help links to the two sign-in pages, and extend the existing Support browser regression. Verify guidance against the current auth source and primary Google/Firebase documentation.

## Validation

Production site build, site check/unit tests, source audit and focused Support/account-header browser checks. Exercise native anchors, disclosures, no-script help, 320px/mobile/desktop and a narrow equivalent of zoom. No Java/game-server behavior changes; server tests are not required for this static help slice.

## Completion Notes

The owner accepted the implementation and authorized committing all changes, publishing a PR, waiting for successful CI, merging to main and deleting the working branch. Keep this checkout and return it to main. The closing PR records final delivery evidence; remote site deployment is outside this delivery.

## Implementation results

Implemented on `feature/support-navigation-sign-in-help`, accepted for delivery.
The production build, site check, 12 site unit tests, two focused browser suites,
source audit and whitespace checks pass. Native anchors, method disclosures,
calculator behavior and direct help routes work with the exercised keyboard,
touch and no-script paths. The final Support suite also passed after the
explicit 1rem topic-link sizing refinement.

See [the outcome](support-navigation-sign-in-help-outcome.md) for scope mapping,
computed sizing, screenshots, design exceptions, guidance sources and limits.

The owner subsequently approved the small sign-in-page cleanup flagged by the
hook. Both kickers are removed and all four action-button labels now measure
12px at 1280, 390 and 320px widths. The affected browser suite, 24-input site
check and scans of both sign-in pages pass. Authentication logic is unchanged.
