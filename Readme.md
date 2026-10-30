# Moles Under the Pitch

An independent browser client and Java server inspired by the venerable tabletop
fantasy-football game. This project is not affiliated with any publisher or existing
online service.

MUTP supports browser clients only. Browser V2 is the product protocol. Browser V1
remains explicitly selected local diagnostic tooling; its retirement is separate.
See the [browser client guide](browser-client/README.md),
[development and release guide](docs/development-and-release.md), and
[Unreleased changes](CHANGELOG.md).

## Development startup

The supported full local application starts with:

```powershell
node tools/dev-local.mjs --start
# Rebuild and restart a managed instance:
node tools/dev-local.mjs --restart
```

Follow [deployment usage](deployment/README.md) for prerequisites, local credentials,
and service ownership. This starts local services and does not publish remotely.
The current V2 runtime uses the existing Firebase authentication and separately
provisioned browser database. It exposes `/browser/v2`; other game-server routes
return 404. The [local diagnostic profile](containers/local/README.md) explicitly
selects `local.browser.v2.enabled=false` for `/browser/v1`.

## Reproducible build and tests

From the repository root in PowerShell:

```powershell
./tools/bootstrap.ps1
./tools/target-build.ps1 test -Module ffb-server -Test BrowserJettyContractTest
./tools/target-build.ps1 verify
npm test --prefix browser-client
npm run build --prefix browser-client
npm run build:play --prefix browser-client
```

The target launcher requires Temurin 21.0.11+10 and accepts `-JavaHome` (required
on Linux). Shared engine code retains Java 8 source/target compatibility; the
server targets Java 21 and Jetty 12. See the
[runtime policy](containers/local/runtime-compatibility.md),
[Windows setup](docs/windows-development-setup.md), and
[Ubuntu setup](docs/ubuntu-development-setup.md).

## Components

| Directory | Purpose |
| --- | --- |
| `ffb-common/` | Shared rules, models and native engine commands used by browser adapters and recovery. |
| `ffb-server/` | Browser endpoints and authoritative game engine. Game sequences use `Step` and `SequenceGenerator` classes. |
| `ffb-tools/` | Roster and engine development utilities. |
| `ffb-statetest/` | Native game-state regression tests. |
| `browser-client/` | TypeScript/React/Pixi browser application and V1 diagnostics. |
| `assets/game/` | Canonical browser artwork and asset tooling. |
| `site/` | Public site, authentication entry and merged-PR updates. |
| `computer-player/` | Browser-protocol computer opponent. |

The standard server entry point is
`com.fumbbl.ffb.server.FantasyFootballServer`. It accepts `-inifile path` and
optional `-override path`; V2 is selected when no protocol override is supplied.
Use the supported environment launchers to load secret files, verify the schema,
and enforce local/native profile restrictions. Runtime startup does not provision
or reset a database. Browser-owned match services persist current results/recovery.
