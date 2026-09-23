#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$SkipDocker,
    [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = Get-Content (Join-Path $PSScriptRoot 'target-build-toolchain.json') -Raw | ConvertFrom-Json
$jdkHome = $target.java.defaultWindowsHome
$jdkVersion = if ($target.java.runtimeVersion -match '^(\d+\.\d+\.\d+)\+(\d+)-LTS$') {
    "$($Matches[1]).$($Matches[2])"
} else {
    throw "Cannot derive winget JDK version from $($target.java.runtimeVersion)."
}
$nodeVersion = '24.19.0' # Matches browser-client/README.md; package.json requires Node 24.

function Find-Executable([string[]]$Names, [string[]]$Paths = @()) {
    foreach ($name in $Names) {
        $command = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { return $command.Source }
    }
    foreach ($path in $Paths) {
        if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) { return $path }
    }
    return $null
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user;$env:Path"
}

function Test-TargetJava {
    $java = Join-Path $jdkHome 'bin/java.exe'
    if (!(Test-Path -LiteralPath $java -PathType Leaf)) { return $false }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $java
    $start.Arguments = '-XshowSettings:properties -version'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    try {
        $details = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        return $process.ExitCode -eq 0 -and
            $details -match "java.runtime.version = $([regex]::Escape($target.java.runtimeVersion))" -and
            $details -match "java.vendor = $([regex]::Escape($target.java.vendor))"
    } finally {
        $process.Dispose()
    }
}

function Get-ToolStatus {
    $node = Find-Executable @('node.exe') @((Join-Path $env:ProgramFiles 'nodejs/node.exe'))
    $nodeIdentity = if ($node) { (& $node --version 2>&1 | Out-String).Trim() } else { 'missing' }
    $savedJava = Join-Path $root '.tools/java-home.txt'
    $expectedJava8 = Join-Path $root '.tools/jdk8u504-b01'
    $java8Ready = (Test-Path -LiteralPath $savedJava) -and
        ((Get-Content -LiteralPath $savedJava -Raw).Trim() -eq $expectedJava8) -and
        (Test-Path -LiteralPath (Join-Path $expectedJava8 'bin/java.exe'))
    $mavenReady = Test-Path -LiteralPath (Join-Path $root '.tools/apache-maven-3.9.9/bin/mvn.cmd')
    $appDataNpm = Join-Path $env:APPDATA 'npm/firebase.cmd'
    $localCloud = Join-Path $env:LOCALAPPDATA 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
    $machineCloud = Join-Path $env:ProgramFiles 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
    $azureCli = Join-Path $env:ProgramFiles 'Microsoft SDKs/Azure/CLI2/wbin/az.cmd'
    $userDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
    $machineDocker = Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe'
    $installed = Test-Path -LiteralPath (Join-Path $root 'browser-client/node_modules/playwright/package.json')
    & cmd.exe /d /c 'wsl.exe --version >nul 2>nul'
    $wslReady = $LASTEXITCODE -eq 0

    @(
        [pscustomobject]@{ Requirement = 'winget'; Status = if (Find-Executable @('winget.exe')) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = 'Git'; Status = if (Find-Executable @('git.exe')) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = 'GitHub CLI'; Status = if (Find-Executable @('gh.exe')) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = "Temurin $($target.java.runtimeVersion)"; Status = if (Test-TargetJava) { 'ready' } else { 'missing or wrong patch/vendor' } }
        [pscustomobject]@{ Requirement = 'Maven 3.9.9 (project local)'; Status = if ($mavenReady) { 'ready' } else { 'run bootstrap' } }
        [pscustomobject]@{ Requirement = 'Temurin 8u504 (project local)'; Status = if ($java8Ready) { 'ready' } else { 'run bootstrap' } }
        [pscustomobject]@{ Requirement = 'Node.js 24 / npm'; Status = if ($nodeIdentity -match '^v24\.') { $nodeIdentity } else { "missing or wrong major: $nodeIdentity" } }
        [pscustomobject]@{ Requirement = 'Browser npm packages'; Status = if ($installed) { 'ready' } else { 'run npm ci' } }
        [pscustomobject]@{ Requirement = 'Firebase CLI'; Status = if (Find-Executable @('firebase.cmd', 'firebase.exe') @($appDataNpm)) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = 'Google Cloud CLI'; Status = if (Find-Executable @('gcloud.cmd') @($localCloud, $machineCloud)) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = 'Azure CLI (future OAuth)'; Status = if (Find-Executable @('az.cmd') @($azureCli)) { 'found' } else { 'missing' } }
        [pscustomobject]@{ Requirement = 'WSL 2'; Status = if ($wslReady) { 'available; check version' } else { 'missing or not initialized' } }
        [pscustomobject]@{ Requirement = 'Docker Desktop CLI'; Status = if (Find-Executable @('docker.exe') @($userDocker, $machineDocker)) { 'found; check engine/WSL separately' } else { 'missing' } }
    )
}

function Install-WingetPackage([string]$Id, [string]$Version = '') {
    $arguments = @('install', '--id', $Id, '--exact', '--source', 'winget',
        '--accept-package-agreements', '--accept-source-agreements', '--silent')
    if ($Version) { $arguments += @('--version', $Version) }
    Write-Host "Installing $Id $(if ($Version) { $Version })"
    & winget @arguments
    if ($LASTEXITCODE -ne 0) { throw "winget failed for $Id (exit $LASTEXITCODE)." }
}

if ([Environment]::OSVersion.Platform -ne 'Win32NT' -or ![Environment]::Is64BitOperatingSystem) {
    throw 'This setup supports Windows x64 only.'
}

if ($CheckOnly) {
    Get-ToolStatus | Format-Table -AutoSize
    Write-Host 'For Docker, also check: wsl --version; docker info; docker compose version.'
    exit 0
}

if (!(Find-Executable @('winget.exe'))) { throw 'winget is required. Install Windows App Installer, then rerun.' }
& winget --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'winget could not start. Open a normal Windows terminal and retry.' }

if (!(Find-Executable @('git.exe'))) { Install-WingetPackage 'Git.Git' }
if (!(Find-Executable @('gh.exe'))) { Install-WingetPackage 'GitHub.cli' }

if (!(Test-TargetJava)) {
    Install-WingetPackage 'EclipseAdoptium.Temurin.21.JDK' $jdkVersion
}

$node = Find-Executable @('node.exe') @((Join-Path $env:ProgramFiles 'nodejs/node.exe'))
if (!$node -or ((& $node --version 2>&1 | Out-String) -notmatch '^v24\.')) {
    Install-WingetPackage 'OpenJS.NodeJS.LTS' $nodeVersion
}

Refresh-Path
$node = Find-Executable @('node.exe') @((Join-Path $env:ProgramFiles 'nodejs/node.exe'))
if (!$node -or ((& $node --version 2>&1 | Out-String) -notmatch '^v24\.')) {
    throw 'Node.js 24 is not available after winget. Open a new terminal; check other Node installations on PATH.'
}
if (!(Test-TargetJava)) {
    throw "The exact JDK is missing at $jdkHome. Check the winget installation."
}

Push-Location $root
try {
    & (Join-Path $PSScriptRoot 'bootstrap.ps1')
    & (Join-Path $PSScriptRoot 'target-build.ps1') info
    if ($LASTEXITCODE -ne 0) { throw "Java 21 target verification failed (exit $LASTEXITCODE)." }

    $npm = Find-Executable @('npm.cmd') @((Join-Path $env:ProgramFiles 'nodejs/npm.cmd'))
    if (!$npm) { throw 'npm.cmd is missing after Node.js installation.' }
    & $npm ci --prefix browser-client
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)." }

    $firebase = Join-Path $env:APPDATA 'npm/firebase.cmd'
    if (!(Find-Executable @('firebase.cmd', 'firebase.exe') @($firebase))) {
        & $npm install -g firebase-tools
        if ($LASTEXITCODE -ne 0) { throw "Firebase CLI installation failed (exit $LASTEXITCODE)." }
    }

    if (!$SkipBrowser) {
        $playwright = Join-Path $root 'browser-client/node_modules/.bin/playwright.cmd'
        & $playwright install chromium
        if ($LASTEXITCODE -ne 0) { throw "Playwright Chromium install failed (exit $LASTEXITCODE)." }
    }
} finally {
    Pop-Location
}

$localCloud = Join-Path $env:LOCALAPPDATA 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$machineCloud = Join-Path $env:ProgramFiles 'Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
if (!(Find-Executable @('gcloud.cmd') @($localCloud, $machineCloud))) {
    Install-WingetPackage 'Google.CloudSDK'
}
$azureCli = Join-Path $env:ProgramFiles 'Microsoft SDKs/Azure/CLI2/wbin/az.cmd'
if (!(Find-Executable @('az.cmd') @($azureCli))) { Install-WingetPackage 'Microsoft.AzureCLI' }

$userDocker = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
$machineDocker = Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe'
if (!$SkipDocker -and !(Find-Executable @('docker.exe') @($userDocker, $machineDocker))) {
    & cmd.exe /d /c 'wsl.exe --version >nul 2>nul'
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'WSL 2 is missing. Docker Desktop can be installed now, but its Linux engine needs WSL setup and possibly a restart.'
    }
    Install-WingetPackage 'Docker.DockerDesktop'
}

Get-ToolStatus | Format-Table -AutoSize
Write-Host 'Open a new terminal for updated PATH entries.'
Write-Host 'Docker needs WSL 2, first-run setup, and a running Linux engine before local Compose works.'
Write-Host 'Sign in separately with gh auth login, firebase login, gcloud init, and az login as needed.'
