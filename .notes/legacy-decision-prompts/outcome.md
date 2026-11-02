# Approved decision-prompt design and artwork

## Merged milestone
[PR #418](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/418) merged on 2026-11-02 at 21:08:35 UTC as `1d7da43d28b2f2a2d6d9c89437b72fec45ac8826`, completing #414. All CI checks passed. One native shard initially failed before tests during the Maven download; rerunning that shard and its dependent aggregate gate passed without code changes. The public Updates entry records this design/artwork milestone only; #415–#417 remain open. Dev-local and the prompt-review server were stopped, preserving database volumes.

## Delivered scope
The owner approved horizontal rectangular mockups for coin toss, kick/receive, apothecary use (single and multiple patients), argue the call, bribe and interception. The final style uses labeled mole coins, existing inducement medical/bribe icons, mole medics, player-card interceptor portraits and the same angry mole referee for both send-off decline choices. Vertical originals and goblin alternatives remain reference material.

The local prototype demonstrates candidate preview/confirmation, pan-linked subject connectors, off-pitch identity and compact screen layouts with fixture data. It is not part of the production build. The reusable repository artwork template retains nine generated images, exact prompts/reference order, two source references and verified hashes. It is not an installed Template Gallery skill.

## Verification
- Owner visually approved the horizontal layout, artwork and final bribe-decline change.
- Prototype TypeScript: `npm.cmd exec tsc -- --project prototypes/legacy-prompts/tsconfig.json` passed.
- `node prototypes/legacy-prompts/capture.mjs --horizontal`: 30 checks passed, zero browser/asset errors; updated horizontal screenshots and detail comparisons inspected.
- `npm.cmd test -- --test-reporter=dot` in browser-client: all 464 tests passed.
- `npm.cmd run build:play` in browser-client: asset validation/sync, TypeScript and production Vite build passed.
- Eleven retained PNG hashes and nine exact prompt records verified. `git diff --check` passed.
- CI validation is required before the authorized merge; the PR is the authoritative record of CI conclusions.

## Remaining implementation
This completes design/artwork issue #414 only. Secret Weapon source/rules and sequencing work remains in #415; production rectangular prompt integration in #416; production interception preview/confirm in #417. These issues must remain open. No production live-play, replay, recovery or native Android/Linux acceptance is claimed for this design milestone.

## Publication authority
The owner authorized staging all changes, committing, opening a PR, waiting for successful CI, merging to main, deleting the working branches, recording completed work and stopping all dev-local/review servers. Site deployment was not requested. The public completed-work entry must describe this design/artwork milestone and use actual merged PR metadata.
