# Computer player for browser matches

This standalone process uses the same `/browser/v2` WebSocket as the browser. It authenticates with a dedicated service token, not a Firebase account. The game server freezes the human owner's selected saved-team roster into the away side and gives the clone a distinct in-match team identity. The selected coach is **Coach Bugman - Random** or **Bogruk the Almost Clever - Weak**. No bot saved-team documents or Firebase accounts are needed.

## Configure

Use Node 26 or newer. The local-dev, native DEV, and native PROD server profiles contain the configured SHA-256 hash. Keep the matching token file outside source control and give the computer process read access to it. The token itself must be available on each machine running the daemon; only its hash is in the game-server build. To rotate the token, generate a replacement with `node src/generate-token.mjs --file <absolute-secret-file>`, update the hash in each server profile, replace the corresponding host files through a protected transfer, and restart the server and daemon.

The current token source on the Windows development machine is `C:\secure\coach-bugman-token.key`. Its owner is `JACOB-LEGION\jaken`; the file has an explicit ACL granting full control only to that user, local Administrators, and SYSTEM. Inherited access for other local users was removed from the file. The shared `C:\secure` directory was left unchanged because it contains other files. On 2026-09-28, that token was installed on both Compute Engine VMs without copying it into a codebase or printing it:

| Environment | Host token file | Computer process identity |
| --- | --- | --- |
| DEV (`dev-moles-under-the-pitch-org`) | `/etc/moles-computer-v2-dev/secrets/coach-bugman-token.key` | `moles-computer-v2-dev` |
| PROD (`molesunderthepitch-dotorg`) | `/etc/moles-computer-v2-prod/secrets/coach-bugman-token.key` | `moles-computer-v2-prod` |

Each computer identity is a dedicated non-login OS user and group, separate from the game-server service user. The token's parent directories are `0750 root:<computer group>`; the 43-byte token file is `0640 root:<computer group>`. The computer user can read it, while the game-server user cannot. Its SHA-256 hash was checked against the server profiles on each VM.

The hosted daemon runs as `moles-computer-v2-dev.service` or `moles-computer-v2-prod.service`, using the reviewed units in [`deployment/`](deployment/). Node 26.7.0 and the root-owned application files live under `/opt/moles-computer-v2-<environment>/`; Ubuntu's `libatomic1` is required by that Node binary. The units read the token from the matching `/etc` path above and start when their VMs boot. Each currently allows four concurrent game clients on the 2 GB VM; further games wait in the daemon queue. Check `systemctl status moles-computer-v2-<environment>` and `journalctl -u moles-computer-v2-<environment>` for health and registration. A healthy startup logs `Ready for computer matches; capacity 4.`

For local-dev, `node tools/dev-local.mjs --start` from the repository root rebuilds the game server and starts this daemon automatically, using `C:\secure\coach-bugman-token.key`. Set `FFB_COMPUTER_SERVICE_TOKEN_FILE` to use a different token file. `--stop` and `--restart` also manage the daemon and its game clients. Logs are saved under `.tools/dev-local-computer*.log`.

The match-review stack routes port `22232` to its server on port `22234` and reads `containers/local/server.match-review.ini`; that profile must carry the same hash as `server.marker6.ini`. To start the daemon separately for a manually managed Hosting emulator:

```powershell
cd computer-player
npm run daemon -- --url ws://127.0.0.1:22232/browser/v2 --origin http://localhost:5000 --service-token-file <absolute-secret-file>
```

For hosted DEV use `wss://game-dev.molesunderthepitch.org/browser/v2` and Origin `https://dev.molesunderthepitch.org`; for hosted PROD use `wss://game.molesunderthepitch.org/browser/v2` and Origin `https://molesunderthepitch.org`. The current local-dev, DEV, and PROD profiles share the supplied credential. The process can later run on another machine that can reach the same WSS endpoint. The local loopback WS profile is only for local testing.

The daemon registers for computer work and starts a separate game client for each activated computer match. Each worker reads its coach identity from the server; no separate daemon is needed for Bogruk. It defaults to four concurrent clients, matching hosted DEV/PROD and leaving browser capacity within the server's sixteen-connection limit. Local startup also explicitly selects four. `--max-matches N` overrides the worker limit (1 to 64); account for the dispatcher and browsers when configuring it. Additional matches wait in a queue. Every 30 seconds the daemon refreshes the server's active match list, recovering missed notices and checking that its connection is still healthy. A failed game client is retried while its match remains active, with a delay that grows to at most five minutes; `--refresh-ms N` changes the refresh interval (1,000 to 300,000 milliseconds).

For a single existing computer match, the game client can run directly:

```powershell
node src/main.mjs --match <match-uuid> --url ws://127.0.0.1:22232/browser/v2 --origin http://localhost:5000 --service-token-file <absolute-secret-file>
```

Bugman's `src/policy.mjs` keeps its random choices, base formation, reserve substitutions and 30-action turn limit. `src/computer-policy.mjs` dispatches Bogruk to `src/bogruk-policy.mjs`; `src/bogruk-board.mjs` supplies visible board estimates and bounded paths. The server alone resolves rolls and legality.

Each game client retains an unanswered request in memory, reconnects after a lost socket, and retries that exact request ID before making another decision. It stops on an explicit rejected action, invalid projection, lost access, or match completion. The service token is read again on every connection.

Run `npm test` for policy and transport checks. No package installation is required.

## Bogruk's decisions

Bogruk pursues loose balls, advances possession, supports his carrier and pressures the opposing carrier. A whole scoring route requiring no dice takes precedence over violence and deliberate mistakes. He considers short passes and handoffs that gain useful ground or safety, uses signed server block guidance when available, and estimates assists for prospective positions. Mandatory choices use basic face/skill/reroll judgment with a legal offered fallback. Unknown skills receive no bespoke tactical search.

Fouls use an intentionally rough value trade: estimated armour-break chance times a KO/casualty chance of 15/36 times the target's value, less the sending-off chance times the fouler's value. Value combines strength, movement, agility and skills; it is not a roster price. This estimate considers assists, Dirty Player and Sneaky Git. It does not model injury modifiers or every foul interaction. Setup puts inexpensive players on the line and valuable players deeper, leaving intentional gaps. Kick aims alternate between shallow and deep areas with varying width.

`BOGRUK_SETTINGS` centralizes the defaults: risk chances `[0.30, 0.50, 0.70]`, 192 decisions per turn, and at most 1,800 queue removals per player search. Each search settles at most the pitch's 390 squares, caches its results for the decision and uses no multi-turn lookahead. Movement budgets, current-step forecasts and attacking direction come from the server; future-step outcomes are estimates. A necessary sideways or backward detour can lead toward a forward endpoint, but retreating with possession or reforming to stall is not an objective.

After the decision budget is exhausted, Bogruk takes an offered decline for optional rerolls or skills and ends ordinary activations. Mandatory faces, pushes and other required choices still resolve through offered actions; the bound never invents End Turn during a prompt. An available no-dice touchdown retains priority.

The default risk chance rises after zero, one, or at least two completed possession turns without forward ball progress. The server observes progress and resets frustration after progress, possession changes or a new drive. The policy can choose at most one worse purposeful alternative per own team turn: a risky block, poor ordering, a low-value foul, or unnecessary movement risk. Choosing the gamble spends the allowance even if it succeeds; ordinary bad dice do not. Setup and kick variety do not consume it. Set `recklessness: false` in the policy options to disable mistakes; tests can inject `random(purpose)` and `riskChances` without affecting server dice.

Private `state.computer` provides opponent ID, pinned policy version, seed, authoritative progress, movement budget and saved policy state. Bogruk returns `{decision, reason, nextPolicyState}`. The checkpoint contains version, turn key, action count, spent-mistake flag and a bounded activation intent (player, kind, target player and endpoint). It contains no stale action IDs or process-local RNG. Random draws use a deterministic hash of seed, revision and purpose; the per-turn risk gate uses the turn key. The worker attaches `computerDecision` to gameplay mutations only. Only the server's accepted checkpoint becomes authoritative; an uncertain retry resends the entire original body unchanged. Bogruk accepts a human save request, waits while suspended, and accepts the human's resume request with its checkpoint intact. Save/resume controls carry no policy metadata and consume no gameplay decisions. Bugman's existing save/resume behavior remains unchanged. Lightweight reason logs identify deliberate risks without logging the token or player rosters.

Rules sources: [BB2025 reference register](../docs/specs/bb2025-rules-reference.md), the linked Blood Bowl Base movement/block/ball-action/skills sections, and the official May 2026 FAQ/commentary. Tactical estimates do not replace engine legality. Full-match engine validation is recorded with the [Bogruk feature](../docs/specs/bogruk-weak-computer-coach.md); policy scenario and transport tests alone do not establish engine-match coverage.

The optional real-engine runner is separate from `npm test`: `node test/engine-match.mjs --java <exe> --classpath <test-and-runtime-classpath> --home-roster Human --away-roster Orc --seed 42 --output <summary.json>`. It starts the server test-scope `BogrukEngineHarness`, plays the human seat with seeded Bugman and the computer seat with Bogruk, checks exact request duplication every 37 decisions and checkpoint restore every 100, and reports scores, reasons, actions, policy timing, invalid/stalled responses and completion. It prints compact progress to stderr every 100 decisions. Defaults are 4,000 decisions and 180 seconds; use `--max-decisions`, `--timeout-ms`, or `--recklessness off` for a specific acceptance scenario. `--capture-state <json>` captures the first computer PLAY projection for local profiling. The server harness currently supports Human and Orc rosters and is not part of the hosted daemon.
