# Ubuntu 26.04 WSL development setup

This is the Linux companion to the [Windows setup](windows-development-setup.md).
The setup job supports Ubuntu 26.04 on x86_64, matching the current
`Ubuntu-26.04` WSL instance. It installs Ubuntu packages from the distribution's
existing sources and downloads the remaining tools directly from their publishers.
It does not register Google, Microsoft, NodeSource, or other third party apt
repositories.

## Run the setup

Use a separate checkout inside the Ubuntu filesystem. The build stores an
absolute Java path in `.tools/java-home.txt`; npm dependencies and Playwright
binaries also differ between Windows and Linux. Sharing a checkout under
`/mnt/c` would make one setup replace files used by the other.

From the existing Windows checkout, install the WSL tools first:

```bash
cd /mnt/c/Users/jaken/Git-Hub/fumbbl-rebuild
bash tools/setup-ubuntu.sh --check
bash tools/setup-ubuntu.sh --tools-only
```

Then clone into Ubuntu and initialize the project toolchains:

```bash
mkdir -p ~/src
git clone https://github.com/the-grognard-codes/fumbbl-rebuild.git ~/src/fumbbl-rebuild
cd ~/src/fumbbl-rebuild
bash tools/setup-ubuntu.sh
```

If the setup script is not yet present in the cloned revision, copy it from
the Windows checkout first:

```bash
cp /mnt/c/Users/jaken/Git-Hub/fumbbl-rebuild/tools/setup-ubuntu.sh ~/src/fumbbl-rebuild/tools/
cd ~/src/fumbbl-rebuild
bash tools/setup-ubuntu.sh
```

`--check` reports what is available without installing anything.
`--tools-only` installs the Linux tools without writing project build files, so
it can run from `/mnt/c`. `--skip-browser` skips Playwright Chromium and its
Linux libraries. The job can be rerun; it verifies publisher SHA256 checksums
for the pinned downloads where published. If Google updates its unversioned
archive, the checksum check will stop the job until the pinned value is updated.
Open a new Ubuntu shell after setup to load the tool paths from `~/.bashrc`.

| Tool | Why it is present | Installation command or source |
| --- | --- | --- |
| Git, curl, certificates, tar, unzip, xz, jq, Python 3, build tools | Checkout, archive handling, Google CLI, Node native dependencies | `sudo apt-get update && sudo apt-get install -y ca-certificates curl git unzip xz-utils tar jq build-essential python3 python3-venv` |
| GitHub CLI | Issues and pull requests | Direct `gh_2.101.0_linux_amd64.deb` from [GitHub releases](https://github.com/cli/cli/releases/tag/v2.101.0) |
| PowerShell 7 | Repository `*.ps1` build launchers and local stack scripts | Direct `powershell_7.6.6-1.deb_amd64.deb` from [Microsoft's Ubuntu instructions](https://learn.microsoft.com/en-us/powershell/scripting/install/install-ubuntu) |
| Temurin JDK 8u504-b01 | Frozen Java 8 reference | Direct [Adoptium archive](https://github.com/adoptium/temurin8-binaries/releases/tag/jdk8u504-b01) under `~/.local/opt`; project's `bootstrap.ps1` pins Maven 3.9.9 |
| Temurin JDK 21.0.11+10 | Current server and game service | Direct [Adoptium archive](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.11%2B10) under `~/.local/opt` |
| Node.js 24.19.0 and npm | Browser client, site, Firebase assembly | Direct [Node release archive](https://nodejs.org/download/release/v24.19.0/) under `~/.local/opt`; browser packages via `npm ci --prefix browser-client` |
| Playwright Chromium and Linux libraries | Browser tests | `browser-client/node_modules/.bin/playwright install --with-deps chromium` |
| Firebase CLI | Emulators and manual Hosting operations | `npm_config_prefix="$HOME/.local" npm install --global firebase-tools` ([Firebase CLI instructions](https://firebase.google.com/docs/cli)) |
| Google Cloud CLI | Cloud administration and local Google credentials | Direct [Google CLI archive](https://docs.cloud.google.com/sdk/docs/downloads-versioned-archives) under `~/.local/opt` |
| Azure CLI | Future Microsoft Entra OAuth administration | Direct Ubuntu 26.04 `azure-cli_2.90.0-1~resolute_amd64.deb` from [Microsoft's package index](https://packages.microsoft.com/repos/azure-cli/pool/main/a/azure-cli/), installed with `sudo apt-get install ./azure-cli.deb`; current Microsoft sign-in remains deferred |
| Docker CLI and Compose | Local Java/database containers | Enable [Docker Desktop WSL integration](https://docs.docker.com/desktop/features/wsl/) for `Ubuntu-26.04` in Windows |

The setup script runs the project launchers with explicit JDK locations. To
repeat those checks in a Linux checkout:

```bash
pwsh -NoProfile -File tools/build.ps1 info
pwsh -NoProfile -File tools/target-build.ps1 info -JavaHome "$HOME/.local/opt/temurin-21.0.11+10"
npm test --prefix browser-client
npm run check --prefix site
npm run verify-environment --prefix deployment/firebase
docker info
docker compose version
```

In Docker Desktop, start the Linux engine and select **Settings > Resources >
WSL Integration > Ubuntu-26.04**. Its Windows installation supplies the Linux
`docker` command in Ubuntu once integration is enabled. Use the same Docker
engine from either platform; there is no separate Docker Engine install in
this job. The local stack still needs its [separate setup](../containers/local/README.md).

Sign in within Ubuntu only for the workflows you use: `gh auth login`,
`firebase login`, `gcloud init`, `gcloud auth application-default login`, and
`az login`. CLI installation does not share account sessions with Windows.
Use Git to move changes between the Windows and Ubuntu checkouts.
