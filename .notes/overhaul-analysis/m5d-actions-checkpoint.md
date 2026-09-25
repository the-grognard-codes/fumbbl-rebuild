# M5d server action and Blitz checkpoint — 2026-09-25

The live board now highlights server-issued player and square targets. Clicking a target pins the one matching current action; when several actions share a target, the coach chooses one in the nearby action list. Commit and the guarded Space shortcut use the same handler and send the current revision's action ID through `V2Client`. Hover and unpinned Space send nothing. The existing action selector still exposes choices without board targets, including dice, reroll, skill, apothecary, and kickoff prompts. A pinned target draws only a current server step connector; it is not a locally calculated multi-step route or an odds claim.

The nested state is `projectionVersion:3`: every action has public nullable `target` (`{playerId}` or `{x,y}`). The server supplies these values from its issued native actions in canonical pitch coordinates. The decoder accepts older unversioned/version-two states for retained replays. Recovery compares prior public presentation shapes against their exact matching subset of the current view, so version-one and version-two checkpoints can restore without loosening gameplay-state comparisons. Publishing this server and browser requires one paired rollout; no schema upgrade is needed.

## Evidence

- [Real-engine Blitz fixture](../../browser-client/test/fixtures/m5a-blitz-projections.json): nine actor/spectator checkpoints from declaration through movement, block die, push choice, and accepted push. The Java test regenerates it and checks exact bytes. The browser decoder checks structured target metadata and recipient agreement.
- [Hosted Blitz browser test](../../site/test/m5d-blitz-browser.test.mjs): three authenticated roles follow that fixture. The active coach pins and commits each step; the other player and spectator cannot commit. It covers a stale rejection and fresh read, a held pending request, duplicate projection, hover and unpinned Space, Space Commit, and synchronized accepted revisions. It never substitutes local dice or legal actions.
- [Actor movement](verification/m5d/blitz-move-actor.png), [spectator movement](verification/m5d/blitz-move-spectator.png), [actor push](verification/m5d/push-choice-actor.png), and [spectator push](verification/m5d/push-choice-spectator.png) show the current target cues and one-step connector. Fixture players intentionally have no frozen art, so labeled tokens appear.
- The [25-capability mounted sample](verification/m5d/supported-sample.json) selects one real native trace per capability from `supported-actions-v1.json`; its [summary](verification/m5d/mounted-action-summary.json) records owner-only Commit, reconnect, exact lost-acknowledgment retry, and observer sync in two isolated browser contexts. This exercises prompt/action families on the retained local `/setup` client path.
- Focused Java 21 core-turn, projection, setup, ball/foul, and recovery tests pass. Browser unit suite: 72 passed. Hosted site suite: 4 passed. The PR's complete CI remains the merge gate.

## Carried to M5e and R6

- The available v2 contract still lacks full proposed path geometry and authoritative success percentages; `TODO.md` tracks the odds contract. This board shows one issued step at a time.
- M5e will replace the temporary textual score/resource presentation with the complete match shell, results, public history if available, and decorative movement transition. Static player art remains subject to R6 public-use disposition.
- Firefox, Safari, iPad, actual assistive-technology observations, and integrated human visual review remain R6 checks.
