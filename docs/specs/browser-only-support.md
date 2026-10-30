# Feature: Browser-only support

## Abstract

Retire Java desktop/WebStart clients immediately. MUTP supports Browser V2 as
the product client and retains Browser V1 as development-only diagnostic tooling.

## Objective

Remove functionality exclusively serving retired clients and make the browser
runtime the standard startup path without changing gameplay or browser behavior.

## Context / Existing Behavior

The Maven reactor still builds three desktop modules. Server startup initializes
desktop session/transport services even though browser adapters own their matches.
Some operational documentation and agent instructions still describe desktop use.

## In Scope

- Remove desktop source, packaging, transports, launch links, exclusive shared
  definitions and obsolete build/workflow dependencies.
- Preserve engine code and assets used by either browser path.
- Make V2 normal startup; keep V1 through explicit diagnostic configuration.
- Update current operational documentation, agent guidance, tests and scripts.
- Necessary browser integration/configuration/build/test edits.

## Out of Scope

- Game mechanics, rules, sequencing, browser appearance and new browser features.
- V1 retirement, desktop-feature parity, historical game/save/replay compatibility.
- New authentication/hosting infrastructure or remote publication/deployment.
- Historical documentation and required attribution need not be rewritten.

## Functional Requirements

1. Retire desktop support in one cutover, without transition or compatibility code.
2. Preserve current browser live play, spectating, replay and recovery capabilities.
3. Remove desktop-only capabilities without requiring replacement features.
4. Current documentation must describe only supported operational workflows.

## Acceptance Criteria

- No source, distribution or operational instruction serving exclusively retired
  clients remains. Shared engine functionality is not retired-client code.
- Browser V2 is the normal startup path; explicit V1 diagnostics still work.
- Fresh V2 live play, disconnect/rejoin, supported restart recovery and replay
  playback work. A completed match may be generated through current test tooling.
- Relevant Java tests/server build, browser tests/build and V1 smoke checks run.
- Dev-local starts without issue, or any concrete unresolved blocker is recorded.

## Constraints

- Work on `feature/browser-only-support` from clean, current `main`.
- Preserve unrelated work and existing local databases/credentials.
- Initial implementation handoff remained uncommitted. After acceptance, the user
  authorized staging all changes, committing, opening a PR, waiting for CI, merging
  into main, deleting the working branches, and stopping dev-local. Remote
  deployment remains outside this delivery request.

## Implementation Guidance

| Slice | GitHub issue | Scope | Status |
| --- | --- | --- | --- |
| Desktop distribution | [#379](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/379) | Modules, assets, reactor/build | Implemented; validated |
| Browser-only server | [#380](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/380) | Transport/session retirement, startup | Implemented; live play, actual restart recovery and replay validated |
| Operations and evidence | [#381](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/381) | Docs/agent guidance, integrated validation, dev-local | Implemented; managed dev-local and full acceptance validated |

## Validation

Run focused selectors before reactor verification. Run browser unit tests,
diagnostic/product builds, asset checks, V1 smoke and fresh V2 lifecycle checks.
Record exact commands, results and coverage gaps in `browser-only-support-outcome.md`
and on the issues. Retained fixture evidence alone is insufficient for V2 acceptance.

## Completion Notes

Self-review against this approved scope; fix findings and debug failing checks.
Start the supported dev-local instance and investigate startup failures. Leave
the implementation uncommitted for initial user review and issues open pending delivery.
After acceptance, follow the separately authorized PR/CI/merge and cleanup sequence.

Implementation and exact acceptance evidence: [outcome report](browser-only-support-outcome.md).
