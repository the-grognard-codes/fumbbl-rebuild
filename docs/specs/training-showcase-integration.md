# Training harness integration outcome

Date: 2026-11-20 (America/New_York).

## Scope and decision

Consolidate the existing #567 harness, preliminary `/training` UI, #591 shared setup recovery and #592 retention fixes onto current main (`528a3a2bc`). Branch: `codex/training-showcase`. This supersedes the code proposal in draft PR #570 without expanding the AI research program.

The [learning roadmap](computer-opponent-learning-roadmap.md) records the agreed four opponent tiers, human imitation before substantial RL, replay feasibility questions, and future acceptance gates. Research is deferred while graphics, UI polish and additional teams take priority.

## Delivered boundary

- Bounded local evaluations, CPU tuning and optional Python/PyTorch learning tools; no runtime dependency on Python or CUDA for ordinary games or site builds.
- `/training` is a read-only hosted viewer/showcase. An explicitly started loopback launcher enables bounded local game evaluations; it does not expose remote controls or start training on page load.
- Shared setup repair serves Bogruk/Gobbo in normal games and the harness. Integration preserves main's custom-match-ID fixture constructor and current browser transport behavior.
- Simulation mocks do not collect invocation history. Compact results persist, details have byte caps, and conservative cleanup preserves results/checkpoints and requires explicit application.
- Models, virtual environments, raw experiments, classpaths and machine-specific tooling remain ignored. No remote deployment, background training or long run is part of this integration.

## Review fixes

Independent core review found and verified fixes for interruption and attribution edge cases. New trajectory episodes require both compact and terminal records with matching retained decision counts before PPO can use them. Fallback episodes cannot train PPO or claim checkpoint evaluation credit; evaluation checks model identities and promotion requires complete eligible pairs. A changed inference model cannot attach rejected reply metadata to a Bogruk fallback action.

Cleanup rejects linked path components, including the requested output root, and rechecks paths before applying. Atomic JSON updates use exclusive, unique temporary files, clean up failed writes and preserve unrelated predictable temporary files.

The integrated engine smoke caught main's stricter projection audience check.
The harness now explicitly decodes computer projections on accepted and rejected
setup responses, matching normal computer transport. A regression test reproduces
the original rejection and passes with the audience specified; browser privacy
validation remains unchanged.

The historical [harness outcome](computer-coach-training-harness-outcome.md) and [retention outcome](training-retention-setup-outcome.md) describe earlier checkouts. Their local paths and run artifacts remain historical evidence, not integration checkout requirements.

## Validation

The pre-integration retention branch completed the requested 20-game rerun: 20/20, no failures, 220.806 seconds, two 768 MiB JVMs, sampled heap peak 408.45 MiB. This establishes bounded execution reliability, not learned playing strength.

Current-main integration checks:

- 559 browser unit tests passed.
- All 96 final computer-player tests passed, including launcher, retention and projection compatibility.
- Six Python/PyTorch tests passed, including live Node-to-Python inference and interruption/fallback data checks.
- Full static-site build/check, 13 site unit tests, three Chromium journeys and 15 browser inventory/validation tests passed. Desktop/mobile screenshots confirmed the solid training background; established pages retain their prior backgrounds. No design suppressions were added. Source-only warnings for other pages' inherited decorations remain outside this change.
- Two complete games on the integrated branch passed in 68.585 seconds under contention, with one 768 MiB JVM. The loader verified both complete trajectories and all 1,424 decision records. Artifacts: `.tools/training/2026-11-21T03-25-09-771Z-2344` in this worktree. No model weights were trained.
- Full pinned Java 21/Maven reactor `clean install` passed: 1,228 tests, zero failures/errors, 23 skips. All five reactor modules succeeded. The build took 16 minutes 46 seconds; this was regression validation, not a training job.
- `git diff --check` and staged whitespace checks passed. No raw experiments, weights or machine-specific classpaths are included in the change.

## Deferred work

Human replay ingestion, expanded learned decision coverage, new opponent tiers, long learning runs and strength claims remain deferred. No public execution service or replay gallery is introduced. Merging and deployment are separate owner decisions.
