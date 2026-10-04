# Computer player for browser matches

This standalone process uses the same `/browser/v2` WebSocket as the browser. It authenticates with a dedicated service token, not a Firebase account. The game server freezes the human owner's selected saved-team roster into the away side, gives the clone a distinct in-match team identity, and names it **Bugman's Best**. No bot saved-team documents or Firebase accounts are needed.

## Configure

Use Node 26 or newer. The local-dev, native DEV, and native PROD server profiles contain the configured SHA-256 hash. Keep the matching token file outside source control and give the computer process read access to it. The token itself must be available on each machine running the daemon; only its hash is in the game-server build. To rotate the token, generate a replacement with `node src/generate-token.mjs --file <absolute-secret-file>`, update the hash in each server profile, replace the corresponding host files through a protected transfer, and restart the server and daemon.

The current token source on the Windows development machine is `C:\secure\coach-bugman-token.key`. Its owner is `JACOB-LEGION\jaken`; the file has an explicit ACL granting full control only to that user, local Administrators, and SYSTEM. Inherited access for other local users was removed from the file. The shared `C:\secure` directory was left unchanged because it contains other files. On 2026-09-28, that token was installed on both Compute Engine VMs without copying it into a codebase or printing it:

| Environment | Host token file | Computer process identity |
| --- | --- | --- |
| DEV (`dev-moles-under-the-pitch-org`) | `/etc/moles-computer-v2-dev/secrets/coach-bugman-token.key` | `moles-computer-v2-dev` |
| PROD (`molesunderthepitch-dotorg`) | `/etc/moles-computer-v2-prod/secrets/coach-bugman-token.key` | `moles-computer-v2-prod` |

Each computer identity is a dedicated non-login OS user and group, separate from the game-server service user. The token's parent directories are `0750 root:<computer group>`; the 43-byte token file is `0640 root:<computer group>`. The computer user can read it, while the game-server user cannot. Its SHA-256 hash was checked against the server profiles on each VM.

The hosted daemon runs as `moles-computer-v2-dev.service` or `moles-computer-v2-prod.service`, using the reviewed units in [`deployment/`](deployment/). Node 26.7.0 and the root-owned application files live under `/opt/moles-computer-v2-<environment>/`; Ubuntu's `libatomic1` is required by that Node binary. The units read the token from the matching `/etc` path above and start when their VMs boot. Each currently allows four concurrent game clients on the 2 GB VM; further games wait in the daemon queue. Check `systemctl status moles-computer-v2-<environment>` and `journalctl -u moles-computer-v2-<environment>` for health and registration. A healthy startup logs `Ready for computer matches; capacity 4.`

For local-dev, rebuild and recreate the game server container so it loads the updated INI. The match-review stack routes port `22232` to its server on port `22234` and reads `containers/local/server.match-review.ini`; that profile must carry the same hash as `server.marker6.ini`. Start the separate process for the Hosting emulator:

```powershell
cd computer-player
npm run daemon -- --url ws://127.0.0.1:22232/browser/v2 --origin http://localhost:5000 --service-token-file <absolute-secret-file>
```

For hosted DEV use `wss://game-dev.molesunderthepitch.org/browser/v2` and Origin `https://dev.molesunderthepitch.org`; for hosted PROD use `wss://game.molesunderthepitch.org/browser/v2` and Origin `https://molesunderthepitch.org`. The current local-dev, DEV, and PROD profiles share the supplied credential. The process can later run on another machine that can reach the same WSS endpoint. The local loopback WS profile is only for local testing.

The daemon registers as Coach Bugman - Random and starts a separate game client for each activated computer match. It defaults to 32 concurrent clients; `--max-matches N` sets a limit from 1 to 64. Additional matches wait in a queue. Every 30 seconds the daemon refreshes the server's active match list, recovering missed notices and checking that its connection is still healthy. A failed game client is retried while its match remains active, with a delay that grows to at most five minutes; `--refresh-ms N` changes the refresh interval (1,000 to 300,000 milliseconds).

For a single existing computer match, the game client can run directly:

```powershell
node src/main.mjs --match <match-uuid> --url ws://127.0.0.1:22232/browser/v2 --origin http://localhost:5000 --service-token-file <absolute-secret-file>
```

The policy chooses randomly among server-issued coin, kickoff, reroll, skill and player actions. It uses a legal base formation and bounded reserve substitutions for setup, and ends a turn after at most 30 actions. The server alone resolves rolls and legality. Replace `src/policy.mjs` to add a trained policy without changing the transport or service authentication.

Each game client retains an unanswered request in memory, reconnects after a lost socket, and retries that exact request ID before making another decision. It stops on an explicit rejected action, invalid projection, lost access, or match completion. The service token is read again on every connection.

Run `npm test` for policy and transport checks. No package installation is required.
