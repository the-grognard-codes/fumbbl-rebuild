#Requires -Version 7.2
<#
.SYNOPSIS
Sets up this Windows machine so Codex runs gh and git as the GitHub App.

.DESCRIPTION
Run it from a PowerShell 7 session in this checkout:

    ./tools/github-app/setup-machine.ps1

It does every machine-side step from docs/agents/github-app.md:
  1. Checks for git and gh (installs them with winget when -InstallPrerequisites is set).
  2. Finds this machine's private key: a .pem already in the key folder, the newest
     <app>.*.private-key.pem in Downloads, or -PrivateKeyPath. If there is none, it opens
     the app's settings page so you can generate one, and waits for the download.
  3. Moves the key into the key folder and restricts it to your account and SYSTEM.
  4. Writes %LOCALAPPDATA%\mutp-github-app\config.json.
  5. Mints a first token and shows its status.
  6. Backs up ~/.codex/config.toml and writes the app's lines into its
     [shell_environment_policy.set] section (skip with -SkipCodexConfig).
  7. Checks that gh and git, as the app, can reach the repository.

Generating the key is the only step done by hand, in the browser.
It is safe to run again; each run reuses the key already in place.
See docs/agents/github-app-machine-setup.md.
#>
param(
	[string]$ClientId = 'Iv23liF8vWOoLkIBDlKm',
	[string]$Owner = 'the-grognard-codes',
	[string]$AppSlug = 'grognard-codex',
	# An existing .pem to use instead of searching the key folder and Downloads.
	[string]$PrivateKeyPath,
	[string]$KeyFolder = 'C:\secure\grognard-codex',
	[switch]$InstallPrerequisites,
	[switch]$SkipCodexConfig
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$tokenScript = Join-Path $PSScriptRoot 'github-app-token.ps1'
$enterScript = Join-Path $PSScriptRoot 'enter.ps1'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Write-Step([string]$Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }

# 1. Prerequisites ---------------------------------------------------------------------
Write-Step 'Checking git and gh'
$packages = [ordered]@{ git = 'Git.Git'; gh = 'GitHub.cli' }
foreach ($tool in $packages.Keys) {
	if (Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue) {
		Write-Host "$tool found."
		continue
	}
	if (-not $InstallPrerequisites) {
		throw "$tool is not on PATH. Install it (winget install --id $($packages[$tool]) -e) or rerun with -InstallPrerequisites."
	}
	winget install --id $packages[$tool] -e --accept-source-agreements --accept-package-agreements
	if ($LASTEXITCODE -ne 0) { throw "winget could not install $($packages[$tool])." }
	# Pick up the new install without reopening the terminal.
	$env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
		[Environment]::GetEnvironmentVariable('PATH', 'User')
	if (-not (Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue)) {
		throw "$tool was installed but is not on PATH yet. Open a new terminal and run this script again."
	}
}

# 2. Find the private key ----------------------------------------------------------------
Write-Step 'Finding the private key'
$keyPattern = "$AppSlug.*.private-key.pem"
function Find-NewestKey([string]$Folder) {
	if (-not (Test-Path -LiteralPath $Folder)) { return $null }
	return Get-ChildItem -LiteralPath $Folder -Filter $keyPattern -File |
		Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$downloads = Join-Path $HOME 'Downloads'
$key = $null
if ($PrivateKeyPath) {
	$key = Get-Item -LiteralPath $PrivateKeyPath
}
else {
	$key = Find-NewestKey $KeyFolder
	if ($key) {
		Write-Host "Reusing the key already in $KeyFolder."
	}
	else {
		$key = Find-NewestKey $downloads
	}
}
if (-not $key) {
	$appPage = "https://github.com/settings/apps/$AppSlug"
	Write-Host "No key found. Opening $appPage"
	Write-Host 'Under "Private keys", click "Generate a private key". The browser downloads a .pem file.'
	Write-Host 'Generate a new key for this machine; do not copy the other machine''s key.'
	Start-Process $appPage
	while (-not $key) {
		Read-Host "Press Enter once the .pem is in $downloads"
		$key = Find-NewestKey $downloads
		if (-not $key) { Write-Host "Still no $keyPattern in $downloads." -ForegroundColor Yellow }
	}
}
Write-Host "Key: $($key.FullName)"

# 3. Store and lock down the key -------------------------------------------------------
Write-Step "Storing the key in $KeyFolder"
New-Item -ItemType Directory -Force -Path $KeyFolder | Out-Null
$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
# *S-1-5-18 is SYSTEM, written as a SID so it works on any Windows display language.
icacls $KeyFolder /inheritance:r /grant:r "$($account):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls could not restrict $KeyFolder." }

$keyFolderFull = [IO.Path]::GetFullPath($KeyFolder).TrimEnd('\')
if ((Split-Path $key.FullName -Parent).TrimEnd('\') -ne $keyFolderFull) {
	$destination = Join-Path $KeyFolder $key.Name
	if (Test-Path -LiteralPath $destination) { throw "$destination already exists; remove it or pass -PrivateKeyPath $destination." }
	Move-Item -LiteralPath $key.FullName -Destination $destination
	$key = Get-Item -LiteralPath $destination
}
# A moved file keeps its old permissions; reset it to inherit the folder's.
icacls $key.FullName /reset | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls could not reset permissions on $($key.FullName)." }

$allowed = @($account, 'NT AUTHORITY\SYSTEM')
$unexpected = @((Get-Acl -LiteralPath $key.FullName).Access |
	Where-Object { $allowed -notcontains $_.IdentityReference.Value })
if ($unexpected.Count -gt 0) {
	throw "The key is still readable by: $(($unexpected.IdentityReference.Value | Sort-Object -Unique) -join ', ')."
}
Write-Host "Only $account and SYSTEM can read the key."

# 4. config.json ---------------------------------------------------------------------
Write-Step 'Writing config.json'
$dataFolder = if ($env:MUTP_GITHUB_APP_HOME) { $env:MUTP_GITHUB_APP_HOME } else { Join-Path $env:LOCALAPPDATA 'mutp-github-app' }
New-Item -ItemType Directory -Force -Path $dataFolder | Out-Null
$configPath = Join-Path $dataFolder 'config.json'
$newConfig = [ordered]@{ clientId = $ClientId; privateKeyPath = $key.FullName; owner = $Owner } | ConvertTo-Json
if (Test-Path -LiteralPath $configPath) {
	$oldConfig = Get-Content -Raw -LiteralPath $configPath
	if ($oldConfig.Trim() -ne $newConfig.Trim()) {
		Copy-Item -LiteralPath $configPath -Destination "$configPath.$stamp.bak"
		Write-Host "Backed up the old config to $configPath.$stamp.bak"
	}
}
Set-Content -LiteralPath $configPath -Value $newConfig -Encoding utf8NoBOM
Write-Host $configPath

# 5. First token -----------------------------------------------------------------------
Write-Step 'Minting a first token'
& $tokenScript -Mode status | Out-Host

# 6. Codex config.toml ---------------------------------------------------------------
if ($SkipCodexConfig) {
	Write-Step 'Skipping Codex config.toml (-SkipCodexConfig)'
}
else {
	Write-Step 'Updating Codex config.toml'
	$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
	$tomlPath = Join-Path $codexHome 'config.toml'
	New-Item -ItemType Directory -Force -Path $codexHome | Out-Null

	# The token script keeps the existing PATH and unrelated GIT_CONFIG_* entries.
	$appLines = @(& $tokenScript -Mode codex-config | Where-Object { $_ -notmatch '^\s*#' })
	$ownedKey = '^\s*(PATH|GH_CONFIG_DIR|GIT_CONFIG_[A-Z0-9_]+|GIT_AUTHOR_[A-Z]+|GIT_COMMITTER_[A-Z]+)\s*='
	$header = '[shell_environment_policy.set]'

	$raw = if (Test-Path -LiteralPath $tomlPath) { Get-Content -Raw -LiteralPath $tomlPath } else { '' }
	$newline = if ($raw -match "`r`n") { "`r`n" } else { "`n" }
	$lines = [Collections.Generic.List[string]]::new()
	if ($raw) { $lines.AddRange([string[]]($raw -split "`r?`n")) }

	$start = -1
	for ($i = 0; $i -lt $lines.Count; $i++) {
		if ($lines[$i] -match '^\s*\[shell_environment_policy\.set\]\s*$') { $start = $i; break }
	}
	if ($start -lt 0) {
		while ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -eq '') { $lines.RemoveAt($lines.Count - 1) }
		if ($lines.Count -gt 0) { $lines.Add('') }
		$lines.Add($header)
		$lines.AddRange([string[]]$appLines)
		$lines.Add('')
	}
	else {
		$end = $lines.Count
		for ($i = $start + 1; $i -lt $lines.Count; $i++) {
			if ($lines[$i] -match '^\s*\[') { $end = $i; break }
		}
		for ($i = $end - 1; $i -gt $start; $i--) {
			if ($lines[$i] -match $ownedKey) { $lines.RemoveAt($i) }
		}
		$lines.InsertRange($start + 1, [string[]]$appLines)
	}

	if ($raw) {
		Copy-Item -LiteralPath $tomlPath -Destination "$tomlPath.before-github-app-$stamp.bak"
		Write-Host "Backed up config.toml to $tomlPath.before-github-app-$stamp.bak"
	}
	Set-Content -LiteralPath $tomlPath -Value ($lines -join $newline) -Encoding utf8NoBOM -NoNewline
	Write-Host "Wrote $($appLines.Count) lines under $header in $tomlPath"
}

# 7. Check gh and git as the app ---------------------------------------------------------
Write-Step 'Checking gh and git as the app'
$remote = (git -C $repoRoot remote get-url origin).Trim()
$check = @"
. '$($enterScript.Replace("'", "''"))' | Out-Null
`$repos = gh api installation/repositories --jq .total_count
if (`$LASTEXITCODE -ne 0) { throw 'gh could not call the API as the app.' }
Write-Host "gh: the app can see `$repos repositories."
git ls-remote '$remote' HEAD | Out-Null
if (`$LASTEXITCODE -ne 0) { throw 'git could not authenticate to $remote as the app.' }
Write-Host "git: authenticated to $remote as `$env:GIT_AUTHOR_NAME."
"@
pwsh -NoProfile -Command $check
if ($LASTEXITCODE -ne 0) { throw 'The check as the app failed; see the output above.' }

Write-Step 'Done'
if (-not $SkipCodexConfig) {
	Write-Host 'Restart the Codex desktop app, or reload the VS Code window, so Codex picks up config.toml.'
}
Write-Host 'For the Codex CLI in a terminal: . ./tools/github-app/enter.ps1, then codex.'
