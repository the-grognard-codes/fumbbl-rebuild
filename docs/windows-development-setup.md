# Windows development setup

For the separate Ubuntu 26.04 WSL toolchain, see the
[Ubuntu development setup guide](ubuntu-development-setup.md).

Run the setup job from a normal Windows terminal in the repository root:

```cmd
.\tools\setup-windows.cmd -CheckOnly
.\tools\setup-windows.cmd
```

`-CheckOnly` makes no installations. Run it on both the laptop and the Windows PC
to compare tool availability. The default install covers the full local toolchain;
use `-SkipDocker` if you do not run the local Java/Compose stack, or
`-SkipBrowser` if you do not run Playwright browser tests. Rerunning the job skips
winget tools already found. Winget installers may request Windows elevation. Open a new
terminal afterward so newly installed commands are on `PATH`.

| Tool | Project requirement | Setup source |
| --- | --- | --- |
| Windows x64, PowerShell 5.1+, winget | Windows build and setup scripts | Windows / App Installer |
| Git and GitHub CLI | Checkout, issues and pull requests; Git Bash can run shell scripts | winget `Git.Git`, `GitHub.cli` |
| Temurin JDK 21.0.11+10 | Pinned and tested JDK for every Java module; minimum supported JDK is 21 | winget `EclipseAdoptium.Temurin.21.JDK` version `21.0.11.10` |
| Maven 3.9.9 | Project Java build launcher | `tools/bootstrap.ps1` downloads and checksum-checks it under `.tools/` |
| Node.js 26.x and npm | Browser client, site, Firebase artifact assembly and computer player; package engines require `>=26 <27` | winget `OpenJS.NodeJS` version `26.7.0` |
| Browser packages and Chromium | Browser builds and Playwright tests | `npm ci --prefix browser-client`, then Playwright's Chromium installer |
| Firebase CLI | Local emulators or manual Hosting operations | `npm install -g firebase-tools` |
| Google Cloud CLI | Google Cloud administration, game-service deployment and local Application Default Credentials when needed | winget `Google.CloudSDK` |
| Azure CLI | Future Microsoft Entra OAuth administration; Microsoft sign-in is currently deferred | winget `Microsoft.AzureCLI` |
| Docker Desktop with Linux engine and WSL 2 | Local Java/database stack and Compose acceptance | winget `Docker.DockerDesktop`; Windows WSL setup |

All Node tooling uses the same 26.x runtime. Setup pins 26.7.0, while existing
26.x installations are accepted. Use the same Node installation for browser
builds and the computer player. After upgrading, reopen the terminal and check
`node --version` and `npm.cmd --version`. In Windows PowerShell, use `npm.cmd`
if execution policy blocks the installed `npm.ps1` wrapper; no policy change is needed.

If setup reports another major, run `where.exe node` to find older installations
on `PATH`. To install the pinned version directly:

```powershell
winget install --id OpenJS.NodeJS --exact --version 26.7.0 --source winget
```

There is no root npm application. Install packages with
`npm.cmd ci --prefix browser-client`; the root `package.json`, lockfile and
`node_modules` created by `npm install nvm` are unnecessary. The npm `nvm`
package is a placeholder, not a Node version manager.

The batch job uses the single [Java 21 and Maven manifest](../tools/target-build-toolchain.json).
The project launchers select their configured tools rather than ambient `java`
or Maven installations. `build.ps1` delegates to `target-build.ps1`. Moving the checkout
requires rerunning bootstrap because `.tools/java-home.txt` contains an absolute
path. The batch job does this automatically.

For an existing laptop checkout after the repository rename, changing the local
folder name is optional. Update its Git remote and refresh the saved Java path
if you move the folder:

```powershell
git remote set-url origin https://github.com/the-grognard-codes/fumbbl-rebuild.git
./tools/bootstrap.ps1
```

Reopen the project from its new location and update any editor workspace or
terminal shortcuts that store the old absolute path. GitHub and cloud CLI
logins are stored outside the checkout and do not need repeating for a folder
rename.

Docker Desktop requires WSL 2, hardware virtualization and a restart on some
Windows systems. Check `wsl --version`; if WSL is missing, run `wsl --install
--no-distribution` in an elevated terminal, restart Windows if requested, then
start Docker Desktop with its Linux engine. Verify with `docker info` and
`docker compose version`. Installing the Docker package alone does not start its
engine or configure WSL. Run `./containers/local/setup.ps1` only
when preparing the local stack; it generates machine-local secrets.

Account access is separate from installing the CLIs. Use `gh auth login`,
`firebase login`, `gcloud init`, and `az login` only for the accounts and tasks
you need. Local Google credentials for the game service may also require
`gcloud auth application-default login`. The Azure CLI does not create a
Microsoft Entra app registration or enable Microsoft sign-in. CI Hosting
deployments use GitHub OIDC rather than a developer's local Firebase login.

After setup, these commands check the project toolchains and web dependencies:

```powershell
./tools/build.ps1 info
./tools/target-build.ps1 info
npm test --prefix browser-client
npm run check --prefix site
npm run verify-environment --prefix deployment/firebase
```

See the [development and release guide](development-and-release.md) for the
full build and deployment checks, and the [local container guide](../containers/local/README.md)
for Compose startup. A working checkout does not require the cloud CLIs or
Docker until those workflows are used.

## Codex permission profiles

The repo's `.codex/config.toml` defines `fumbbl-project` and its parent
`cross-project-toolchains`. The parent extends the built-in `:workspace` profile,
so opening the repo does not require a pre-existing user profile. Machine-specific
tool and cache grants under `[permissions.cross-project-toolchains.filesystem]`
in your user-level `~/.codex/config.toml` merge into the parent when present.
See the [Codex permission-profile documentation](https://learn.chatgpt.com/docs/permissions).

If an older checkout reports that `fumbbl-project` extends an undefined profile,
apply the updated repo config or add this parent definition to that repo config:

```toml
[permissions.cross-project-toolchains]
extends = ":workspace"
```

The name is `cross-project-toolchains` (plural). Reopen the project after updating
the configuration. Check filesystem grants against each PC's actual paths;
linked worktrees also need write access to the main checkout's shared Git directory.

Installer details: [Firebase CLI](https://firebase.google.com/docs/cli),
[Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk),
[Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli-windows),
and [Docker Desktop with WSL 2](https://docs.docker.com/desktop/setup/install/windows-install/).
