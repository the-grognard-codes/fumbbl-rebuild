# Setting up another machine for the Codex GitHub App

Use this guide to make Codex act as `grognard-codex[bot]` on a second Windows machine, such
as a desktop PC. The app is already registered and installed (see
[the GitHub App guide](github-app.md)). Each machine needs its own private key, its own
`config.json` and its own Codex settings. The script does all of that except generating
the key, which you do in the browser.

## 1. Install the tools (once)

From any PowerShell window:

```powershell
winget install --id Microsoft.PowerShell -e
```

```powershell
winget install --id Git.Git -e
```

```powershell
winget install --id GitHub.cli -e
```

Open a new **PowerShell 7** (`pwsh`) window so PATH picks up the new tools.

## 2. Get the repository

Skip this step if the checkout already exists.

```powershell
git clone https://github.com/the-grognard-codes/moles-under-the-pitch.git "$HOME\Git-Hub\moles-under-the-pitch"
```

Git signs in as you the first time (Git Credential Manager). Only Codex uses the app.

## 3. Run the setup script

```powershell
cd "$HOME\Git-Hub\moles-under-the-pitch"; ./tools/github-app/setup-machine.ps1
```

[`setup-machine.ps1`](../../tools/github-app/setup-machine.ps1) carries out these steps:

1. Checks for `git` and `gh`. Add `-InstallPrerequisites` to have it install them with winget.
2. Looks for a key in `C:\secure\grognard-codex`, then for `grognard-codex.*.private-key.pem`
   in Downloads. If neither has one, it opens the app's settings page. Click
   **Generate a private key** and press Enter once the file has downloaded.
   **Generate a new key for this machine** instead of copying the laptop's key, so that
   you can revoke one machine's key without affecting the other.
3. Moves the key into `C:\secure\grognard-codex` and limits access to your account and SYSTEM.
   It stops with an error if anyone else can still read the key.
4. Writes `%LOCALAPPDATA%\mutp-github-app\config.json`, which holds the client ID, the key
   path and the owner. If an older file exists, it backs that file up first.
5. Mints a first token and prints the app, its scope and the expiry. It never prints the token.
6. Backs up `~/.codex/config.toml`. Then, in its `[shell_environment_policy.set]` section, it
   replaces `PATH`, `GH_CONFIG_DIR`, `GIT_CONFIG_*`, `GIT_AUTHOR_*` and `GIT_COMMITTER_*`
   with the app's values. Other entries in that section stay as they were. Add
   `-SkipCodexConfig` to leave the file alone.
7. Checks the setup by running `gh api` and `git ls-remote` as the app in a child shell.

You can run the script again safely. Each run reuses the key already in the key folder.

## 4. Restart Codex

Quit and reopen the Codex desktop app, or reload the VS Code window if you use the Codex
extension. Then ask Codex to run `git config user.name; gh api user --jq .login`. It should
show `grognard-codex[bot]` and an error from `gh api user`. An app token cannot call
`/user`, so that error shows gh is using the app's token rather than yours.

For the Codex CLI in a terminal, use `enter.ps1` instead of editing `config.toml`:

```powershell
. ./tools/github-app/enter.ps1; codex
```

## If something fails

| Symptom | Fix |
|---|---|
| `Missing ...config.json` or `Private key not found` | Run the setup script again. |
| `401` or `A JSON web token could not be decoded` | The key was deleted on the app page, or the clock is wrong. Delete the `.pem` in `C:\secure\grognard-codex` and run the script again to generate a new key. |
| `404` when it looks up the installation | The app isn't installed for `the-grognard-codes`, or the repository isn't one of the repositories the app has access to. |
| Codex still commits as you | Codex hasn't reloaded `config.toml`. Restart it. If it still commits as you, open `~/.codex/config.toml` and check that the `[shell_environment_policy.set]` section contains the app's lines. |
| You moved the checkout | Run the script again. The `PATH` and credential-helper lines contain absolute paths. |

To remove the app from this machine, delete `%LOCALAPPDATA%\mutp-github-app` and the key
folder, restore the `config.toml.before-github-app-*.bak` backup, and delete this machine's
key on the [app page](https://github.com/settings/apps/grognard-codex).
