#Requires -Version 7.2
<#
.SYNOPSIS
Mints and caches GitHub App installation tokens so an agent can use gh and git as the app.

.DESCRIPTION
Reads the app's client ID, private key path and owning account from config.json in the
data directory (default: %LOCALAPPDATA%\mutp-github-app, override with MUTP_GITHUB_APP_HOME).
Without a "repo" entry, tokens cover every repository the app is installed on for that
account; with one, they are limited to that repository.

Installation tokens last one hour; this script reuses a cached token until it has less
than 15 minutes left, then mints a new one. The cache is encrypted with Windows DPAPI.
The script syncs gh's hosts.yml in <data>\gh with the current token. The gh shim in
.\shim calls -Mode ensure before each gh command to refresh the token or repair
the gh config if needed.

Modes:
  status          Shows the app, scope and token expiry. Never prints the token.
  ensure          Refreshes the token if needed and prints nothing.
  env             Prints, as JSON, the environment variables that make gh and git act as the app.
  codex-config    Prints the lines to put in Codex's [shell_environment_policy.set] section.
  identity        Prints the bot's git author name and email as JSON.
  token           Prints a current token. Avoid in shared terminals and logs.
  git-credential  Git credential helper protocol (git passes get/store/erase).

See docs/agents/github-app.md.
#>
# Deliberately not an advanced script ([CmdletBinding()] or [Parameter()]): git pipes the
# credential request on stdin, which only a simple script can read through $input.
param(
	# Positional: git appends get, store or erase to the helper command.
	[string]$GitOperation,
	[ValidateSet('status', 'ensure', 'env', 'codex-config', 'identity', 'token', 'git-credential')]
	[string]$Mode = 'status'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ApiRoot = 'https://api.github.com'
$ApiVersion = '2022-11-28'
$MinimumRemaining = [TimeSpan]::FromMinutes(15)
$CredentialHelperKey = 'credential.https://github.com.helper'
$ShimDirectory = Join-Path $PSScriptRoot 'shim'

function Get-DataDirectory {
	if ($env:MUTP_GITHUB_APP_HOME) { return $env:MUTP_GITHUB_APP_HOME }
	if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is not set; set MUTP_GITHUB_APP_HOME instead.' }
	return Join-Path $env:LOCALAPPDATA 'mutp-github-app'
}

function Get-AppConfig {
	$path = Join-Path (Get-DataDirectory) 'config.json'
	if (-not (Test-Path -LiteralPath $path)) {
		throw "Missing $path. Create it as described in docs/agents/github-app.md."
	}
	$config = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
	foreach ($field in 'clientId', 'privateKeyPath', 'owner') {
		if (-not $config.PSObject.Properties[$field] -or -not $config.$field) {
			throw "config.json is missing '$field'."
		}
	}
	if (-not (Test-Path -LiteralPath $config.privateKeyPath)) {
		throw "Private key not found at $($config.privateKeyPath)."
	}
	return $config
}

function Get-Repository($Config) {
	if ($Config.PSObject.Properties['repo'] -and $Config.repo) { return [string]$Config.repo }
	return $null
}

# Identifies what a cached token was minted for, so changing config.json forces a new one.
function Get-TokenScope($Config) {
	$repository = Get-Repository $Config
	$target = if ($repository) { "$($Config.owner)/$repository" } else { "$($Config.owner)/*" }
	return "$($Config.clientId) $target"
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
	return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# The app authenticates as itself with a JWT signed by its private key (RS256, at most 10 minutes).
function New-AppJwt($Config) {
	$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
	$header = @{ alg = 'RS256'; typ = 'JWT' } | ConvertTo-Json -Compress
	# iat is backdated 60 s to tolerate clock drift; exp stays under GitHub's 10-minute ceiling.
	$payload = @{ iat = $now - 60; exp = $now + 540; iss = $Config.clientId } | ConvertTo-Json -Compress
	$unsigned = (ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))) + '.' +
		(ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payload)))
	$rsa = [Security.Cryptography.RSA]::Create()
	try {
		$rsa.ImportFromPem((Get-Content -Raw -LiteralPath $Config.privateKeyPath))
		$signature = $rsa.SignData(
			[Text.Encoding]::ASCII.GetBytes($unsigned),
			[Security.Cryptography.HashAlgorithmName]::SHA256,
			[Security.Cryptography.RSASignaturePadding]::Pkcs1)
	}
	finally {
		$rsa.Dispose()
	}
	return "$unsigned.$(ConvertTo-Base64Url $signature)"
}

function Invoke-GitHub([string]$Method, [string]$Path, [string]$Bearer, $Body) {
	$headers = @{
		Accept                 = 'application/vnd.github+json'
		'X-GitHub-Api-Version' = $ApiVersion
		'User-Agent'           = 'mutp-github-app-token'
	}
	if ($Bearer) { $headers.Authorization = "Bearer $Bearer" }
	$request = @{ Method = $Method; Uri = "$ApiRoot$Path"; Headers = $headers }
	if ($null -ne $Body) {
		$request.Body = $Body | ConvertTo-Json -Compress
		$request.ContentType = 'application/json'
	}
	return Invoke-RestMethod @request
}

function Write-FileAtomically([string]$Path, [string]$Content) {
	$temporary = "$Path.$PID.tmp"
	Set-Content -LiteralPath $temporary -Value $Content -Encoding utf8NoBOM -NoNewline
	Move-Item -LiteralPath $temporary -Destination $Path -Force
}

# Re-read after every mint (hourly at most) so a renamed app's new bot login is picked up.
function Get-Identity($Config, [switch]$Refresh) {
	$path = Join-Path (Get-DataDirectory) 'identity.json'
	if (-not $Refresh -and (Test-Path -LiteralPath $path)) {
		$cached = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
		if ($cached.clientId -eq $Config.clientId) { return $cached }
	}
	$app = Invoke-GitHub GET '/app' (New-AppJwt $Config) $null
	$login = "$($app.slug)[bot]"
	$user = Invoke-GitHub GET "/users/$([Uri]::EscapeDataString($login))" $null $null
	$identity = [pscustomobject]@{
		clientId = $Config.clientId
		appSlug  = $app.slug
		login    = $login
		name     = $login
		email    = "$($user.id)+$login@users.noreply.github.com"
	}
	Write-FileAtomically $path ($identity | ConvertTo-Json)
	return $identity
}

# gh has no token-command hook, so the current token is written where gh reads stored logins.
function Sync-GhHosts([string]$Login, [string]$Token) {
	$ghDirectory = Join-Path (Get-DataDirectory) 'gh'
	New-Item -ItemType Directory -Force -Path $ghDirectory | Out-Null
	$hosts = @"
github.com:
    users:
        "$Login":
            oauth_token: $Token
    git_protocol: https
    oauth_token: $Token
    user: "$Login"

"@
	$hostsPath = Join-Path $ghDirectory 'hosts.yml'
	$expectedHosts = ($hosts -replace '\r\n', "`n").TrimEnd()
	$savedHosts = if (Test-Path -LiteralPath $hostsPath) {
		(([string](Get-Content -Raw -LiteralPath $hostsPath)) -replace '\r\n', "`n").TrimEnd()
	}
	if ($savedHosts -cne $expectedHosts) {
		Write-FileAtomically $hostsPath $hosts
	}
	$configPath = Join-Path $ghDirectory 'config.yml'
	if (-not (Test-Path -LiteralPath $configPath)) {
		Write-FileAtomically $configPath "version: `"1`"`ngit_protocol: https`nprompt: disabled`n"
	}
}

function Read-CachedToken($Config) {
	$path = Join-Path (Get-DataDirectory) 'token.json'
	if (-not (Test-Path -LiteralPath $path)) { return $null }
	try {
		$cached = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
		if (-not $cached.PSObject.Properties['scope'] -or $cached.scope -ne (Get-TokenScope $Config)) { return $null }
		$secure = ConvertTo-SecureString $cached.protectedToken
		return [pscustomobject]@{
			token          = [Net.NetworkCredential]::new('', $secure).Password
			expiresAt      = [DateTimeOffset]::Parse($cached.expiresAt)
			installationId = $cached.installationId
		}
	}
	catch {
		return $null
	}
}

function Find-Installation($Config, [string]$Jwt) {
	$repository = Get-Repository $Config
	if ($repository) {
		return Invoke-GitHub GET "/repos/$($Config.owner)/$repository/installation" $Jwt $null
	}
	try {
		return Invoke-GitHub GET "/users/$($Config.owner)/installation" $Jwt $null
	}
	catch {
		if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
			return Invoke-GitHub GET "/orgs/$($Config.owner)/installation" $Jwt $null
		}
		throw
	}
}

function New-InstallationToken($Config) {
	$jwt = New-AppJwt $Config
	$installation = Find-Installation $Config $jwt
	$repository = Get-Repository $Config
	# With a repo in config.json the token is narrowed to it; otherwise it covers the whole installation.
	$body = if ($repository) { @{ repositories = @($repository) } } else { $null }
	$minted = Invoke-GitHub POST "/app/installations/$($installation.id)/access_tokens" $jwt $body
	# Invoke-RestMethod already turns expires_at into a UTC DateTime. Parsing it again as a
	# string would drop the UTC marker and read the time as local.
	$expiresAt = [DateTimeOffset]$minted.expires_at
	$protected = ConvertTo-SecureString $minted.token -AsPlainText -Force | ConvertFrom-SecureString
	$record = [pscustomobject]@{
		scope          = Get-TokenScope $Config
		installationId = $installation.id
		expiresAt      = $expiresAt.ToString('o')
		protectedToken = $protected
	}
	# Only commit the cache once gh can use the new token.
	Sync-GhHosts (Get-Identity $Config -Refresh).login $minted.token
	Write-FileAtomically (Join-Path (Get-DataDirectory) 'token.json') ($record | ConvertTo-Json)
	return [pscustomobject]@{ token = $minted.token; expiresAt = $expiresAt; installationId = $installation.id }
}

function Get-CurrentToken($Config) {
	# A cache hit must not repair hosts.yml with an old token during another process's refresh.
	$dataPath = [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath((Get-DataDirectory)))
	$lockKey = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
		[Text.Encoding]::UTF8.GetBytes($dataPath.ToUpperInvariant())))
	$mutex = [Threading.Mutex]::new($false, "Global\mutp-github-app-token-$lockKey")
	$ownsMutex = $false
	try {
		try {
			$ownsMutex = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
		}
		catch [Threading.AbandonedMutexException] {
			# The previous process exited. Recheck both files while holding its lock.
			$ownsMutex = $true
		}
		if (-not $ownsMutex) { throw 'Timed out waiting for the GitHub App token cache.' }

		$cached = Read-CachedToken $Config
		if ($cached -and ($cached.expiresAt - [DateTimeOffset]::UtcNow) -gt $MinimumRemaining) {
			Sync-GhHosts (Get-Identity $Config).login $cached.token
			return $cached
		}
		return New-InstallationToken $Config
	}
	finally {
		if ($ownsMutex) { $mutex.ReleaseMutex() }
		$mutex.Dispose()
	}
}

function Remove-CachedToken {
	Remove-Item -LiteralPath (Join-Path (Get-DataDirectory) 'token.json') -ErrorAction SilentlyContinue
}

function Invoke-GitCredential($Config, [string]$Operation) {
	$fields = @{}
	foreach ($line in @($input)) {
		if ($line -match '^([^=]+)=(.*)$') { $fields[$Matches[1]] = $Matches[2] }
	}
	if ($fields['protocol'] -ne 'https' -or $fields['host'] -ne 'github.com') { return }
	switch ($Operation) {
		'get' {
			$current = Get-CurrentToken $Config
			[Console]::Out.Write("username=x-access-token`npassword=$($current.token)`n")
		}
		# Git calls erase after a rejected credential; drop the cache so the next get mints afresh.
		'erase' { Remove-CachedToken }
		default { }
	}
}

function Get-CredentialHelperCommand {
	return '!pwsh -NoProfile -NonInteractive -File "' + ($PSCommandPath -replace '\\', '/') + '" -Mode git-credential'
}

function Get-EnvironmentVariables($Config) {
	$identity = Get-Identity $Config
	return [ordered]@{
		GH_CONFIG_DIR       = Join-Path (Get-DataDirectory) 'gh'
		GIT_CONFIG_COUNT    = '2'
		# An empty helper value clears helpers configured earlier (Git Credential Manager) for github.com.
		GIT_CONFIG_KEY_0    = $CredentialHelperKey
		GIT_CONFIG_VALUE_0  = ''
		GIT_CONFIG_KEY_1    = $CredentialHelperKey
		GIT_CONFIG_VALUE_1  = Get-CredentialHelperCommand
		GIT_AUTHOR_NAME     = $identity.name
		GIT_AUTHOR_EMAIL    = $identity.email
		GIT_COMMITTER_NAME  = $identity.name
		GIT_COMMITTER_EMAIL = $identity.email
	}
}

function ConvertTo-TomlString([string]$Value) {
	return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

function ConvertFrom-TomlString([string]$Text) {
	$Text = $Text.Trim()
	if ($Text.StartsWith("'") -and $Text.EndsWith("'")) { return $Text.Substring(1, $Text.Length - 2) }
	if ($Text.StartsWith('"') -and $Text.EndsWith('"')) {
		return [regex]::Replace($Text.Substring(1, $Text.Length - 2), '\\(["\\])', '$1')
	}
	return $Text
}

# Reads the existing [shell_environment_policy.set] values so the printed lines keep them.
function Read-CodexEnvironment {
	$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
	$path = Join-Path $codexHome 'config.toml'
	$values = @{}
	if (-not (Test-Path -LiteralPath $path)) { return $values }
	$inSection = $false
	foreach ($line in Get-Content -LiteralPath $path) {
		if ($line -match '^\s*\[') { $inSection = $line -match '^\s*\[shell_environment_policy\.set\]\s*$'; continue }
		if ($inSection -and $line -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$') {
			$values[$Matches[1]] = ConvertFrom-TomlString $Matches[2]
		}
	}
	return $values
}

function Get-CodexConfigLines($Config) {
	$existing = Read-CodexEnvironment
	$variables = Get-EnvironmentVariables $Config

	# Keep git config entries already there (except earlier copies of ours), then add ours.
	$pairs = [System.Collections.Generic.List[object]]::new()
	$count = 0
	if ($existing.ContainsKey('GIT_CONFIG_COUNT')) { [void][int]::TryParse($existing['GIT_CONFIG_COUNT'], [ref]$count) }
	for ($i = 0; $i -lt $count; $i++) {
		$key = $existing["GIT_CONFIG_KEY_$i"]
		if ($key -and $key -ne $CredentialHelperKey) { $pairs.Add(@($key, [string]$existing["GIT_CONFIG_VALUE_$i"])) }
	}
	$pairs.Add(@($CredentialHelperKey, ''))
	$pairs.Add(@($CredentialHelperKey, (Get-CredentialHelperCommand)))

	$basePath = if ($existing.ContainsKey('PATH')) { $existing['PATH'] } else { $env:PATH }
	$pathEntries = @($ShimDirectory) + @($basePath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ne $ShimDirectory.TrimEnd('\') })

	$lines = [System.Collections.Generic.List[string]]::new()
	$lines.Add("PATH = $(ConvertTo-TomlString ($pathEntries -join ';'))")
	$lines.Add("GH_CONFIG_DIR = $(ConvertTo-TomlString $variables.GH_CONFIG_DIR)")
	$lines.Add("GIT_CONFIG_COUNT = $(ConvertTo-TomlString ([string]$pairs.Count))")
	for ($i = 0; $i -lt $pairs.Count; $i++) {
		$lines.Add("GIT_CONFIG_KEY_$i = $(ConvertTo-TomlString $pairs[$i][0])")
		$lines.Add("GIT_CONFIG_VALUE_$i = $(ConvertTo-TomlString $pairs[$i][1])")
	}
	foreach ($name in 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL') {
		$lines.Add("$name = $(ConvertTo-TomlString $variables[$name])")
	}
	return $lines
}

$config = Get-AppConfig
switch ($Mode) {
	'status' {
		$current = Get-CurrentToken $config
		$identity = Get-Identity $config
		$repository = Get-Repository $config
		[pscustomobject]@{
			app            = $identity.login
			scope          = if ($repository) { "$($config.owner)/$repository" } else { "all repositories the app is installed on for $($config.owner)" }
			installationId = $current.installationId
			tokenExpires   = $current.expiresAt.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')
			ghConfigDir    = Join-Path (Get-DataDirectory) 'gh'
		} | Format-List
	}
	'ensure' { Get-CurrentToken $config | Out-Null }
	'env' { Get-EnvironmentVariables $config | ConvertTo-Json }
	'codex-config' {
		'# In Codex config.toml, under [shell_environment_policy.set], replace any existing'
		'# PATH, GH_CONFIG_DIR, GIT_CONFIG_* and GIT_AUTHOR_*/GIT_COMMITTER_* lines with these.'
		'# Existing git config entries are kept; TOML rejects duplicate keys.'
		Get-CodexConfigLines $config
	}
	'identity' { Get-Identity $config | Select-Object name, email | ConvertTo-Json }
	'token' { (Get-CurrentToken $config).token }
	'git-credential' { $input | Invoke-GitCredential $config $GitOperation }
}
