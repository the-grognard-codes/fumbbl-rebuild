# Training lab

Prepare the engine from the repository root. Use the Java environment described in the [training README](README.md).

```powershell
./computer-player/training/prepare.ps1
node computer-player/training/ui-server.mjs
```

On Linux, use `sh computer-player/training/prepare.sh` for the preparation step.
Open **http://127.0.0.1:8787/training**. The launcher binds to IPv4 loopback and validates the exact Host and Origin for this address.

`--root` selects a different prepared harness checkout. `--output` selects the results directory, which defaults to `<root>/.tools/training`. `--port` changes 8787. `--read-only on` disables execution endpoints. Node 26 and the prepared checkout's Java environment are required for execution.

Choose Bogruk/Gobbo, an even game count, seed, time ceiling and resource profile. Leave Workers empty to use the profile's automatic CPU/memory calculation, or enter an override. The harness enforces its existing memory and contention limits. This first UI runs evaluations, not weight training. Start is explicit; simply opening the page does not run games.

Only one run can be owned by this launcher. Independent CLI jobs are not controlled or stopped. Keep the launcher terminal open; closing the browser is safe. Stop cancels the owned run through the harness, which writes its final summary. Ctrl+C stops the owned run and closes the launcher. A killed terminal or machine restart is not resumable through this preliminary UI; inspect saved files and use the command-line harness as appropriate.

Results are discovered to three directory levels, up to 500 runs. The live log is capped at 16,000 characters. Final summaries include all games; the detail table displays up to 10,000. Live CPU/GPU charts, queues, PPO/BC configuration and promotion are deferred.

The Development page links to the read-only showcase at `/training`. Open a `summary.json` to inspect it entirely in your browser. The static page has no launcher connection. Keep the launcher on loopback. See the [research roadmap](../../docs/specs/computer-opponent-learning-roadmap.md) for the deferred computer opponent work.

Checks:

```powershell
node --test computer-player/test/training-ui.test.mjs
npm run build --prefix site
node --test site/test/training-browser.test.mjs
```

The browser check uses the existing browser-client Playwright dependency; `TRAINING_BROWSER_PACKAGE` can point to another local browser-client/package.json when validating an isolated worktree.
