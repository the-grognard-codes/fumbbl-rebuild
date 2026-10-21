# Block visibility: affected checks

Prepared before implementation validation. The scope is authoritative metadata,
MUTP pitch presentation, native transcript playback, and durable recovery.

## Native selectors

- New `BlockVisibilityTest` in ffb-server consolidates contributor eligibility,
  Guard/Defensive/Eye Gouged, committed freezing, target clearing, native
  ordinary/blitz/uphill, Frenzy/Multiple Block, queued activation, replay and recovery.
- New `BlockHighlightJsonTest`: metadata geometry, identity and team validation.
- `SetupSessionMovementTest`: block and remote blitz forecasts remain native and
  read-only, with contributors calculated at the projected endpoint.
- New Multiple Block prompt adapter: native choices, mixed chooser handoff,
  grouped skill labels and keyboard/pointer target inspection. Added as #321
  after the existing missing adapter was found and the user approved its inclusion.
- Existing `BlockTest`, `BlockLogPresentationTest`, `RecoverySessionTest`,
  `RecoveryScenariosTest`, `PlayerActivationRecoveryTest`, `MultipleBlockActionsTest`
  and `FollowUpActionsTest` as applicable to the changed paths.

## Browser selectors

- New metadata decoder/presentation/geometry unit tests; stale revision, private
  proposals, route endpoints, cancellation and independent Multiple Block context.
- `block-dice-presentation.test.ts`, `movement-interaction.test.ts`,
  `movement-protocol.test.ts`, `pitch-playback.test.ts`, transcript/result/recovery
  decoder tests.
- New integrated block visibility browser journey using native fixture records;
  both coach ends, spectator and result/live replay seek, cancellation/target
  movement, both cameras, below-sprite/above-threat layering, reduced motion and
  390px width.
- Existing follow-up, pushback, block-log, route/blitz, replay and reconnect UI
  selectors when directly affected by the new metadata or timing.

## Broader completion checks

Run browser unit suite, browser production build, relevant browser interaction
suites, and the Maven server/native build/tests using the repository toolchain.
Use focused selectors first; repeat only after relevant changes or failures.
Record actual commands, counts, findings and remaining limitations in the outcome
report. This manifest is planned scope, not evidence that a check has run.
