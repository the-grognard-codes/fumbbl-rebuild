#Requires -Version 7.2
# Offline checks using a temporary key, configuration and token cache.
$ErrorActionPreference = 'Stop'

function Assert-Result([bool]$Condition, [string]$Message) {
	if (-not $Condition) { throw $Message }
	Write-Host "PASS: $Message"
}

function Invoke-RestMethod([string]$Method, [uri]$Uri, [hashtable]$Headers, $Body, $ContentType) {
	$request = "$Method $($Uri.AbsolutePath)"
	$mockGitHub.requests.Add($request)
	switch ($request) {
		'GET /repos/fixture-owner/fixture-repo/installation' { return @{ id = 1 } }
		'POST /app/installations/1/access_tokens' {
			Start-Sleep -Milliseconds $mockGitHub.mintDelay
			# The real Invoke-RestMethod turns the API's ISO 8601 string into a UTC DateTime.
			return @{ token = $mockGitHub.mintedToken; expires_at = [DateTime]::UtcNow.AddHours(1) }
		}
		'GET /app' { return @{ slug = 'fixture-app' } }
		'GET /users/fixture-app%5Bbot%5D' {
			if ($mockGitHub.failUserLookup) { throw 'Simulated user lookup failure' }
			return @{ id = 42 }
		}
		default { throw "Unexpected GitHub API call: $request" }
	}
}

$helper = Join-Path $PSScriptRoot 'github-app-token.ps1'
$savedAppHome = $env:MUTP_GITHUB_APP_HOME
$fixture = Join-Path ([IO.Path]::GetTempPath()) "mutp-gh-app-tests-$([Guid]::NewGuid())"
$keyPath = Join-Path $fixture 'test-key.pem'
$cachePath = Join-Path $fixture 'token.json'
$hostsPath = Join-Path $fixture 'gh/hosts.yml'
$mockGitHub = @{
	requests = [Collections.Concurrent.ConcurrentBag[string]]::new()
	mintedToken = 'test-initial-token'
	mintDelay = 0
	failUserLookup = $false
}
try {
	New-Item -ItemType Directory -Path $fixture | Out-Null
	$env:MUTP_GITHUB_APP_HOME = $fixture
	$rsa = [Security.Cryptography.RSA]::Create(2048)
	try {
		[IO.File]::WriteAllText($keyPath, $rsa.ExportPkcs8PrivateKeyPem())
	}
	finally {
		$rsa.Dispose()
	}
	@{
		clientId = 'fixture-client'
		privateKeyPath = $keyPath
		owner = 'fixture-owner'
		repo = 'fixture-repo'
	} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixture 'config.json')

	& $helper -Mode ensure
	$originalHosts = Get-Content -Raw -LiteralPath $hostsPath
	Assert-Result ($originalHosts.Contains($mockGitHub.mintedToken)) 'Initial mint installs the token for gh'

	$cache = Get-Content -Raw -LiteralPath $cachePath | ConvertFrom-Json
	$cachedLifetime = [DateTimeOffset]$cache.expiresAt - [DateTimeOffset]::UtcNow
	Assert-Result ($cachedLifetime -gt [TimeSpan]::FromMinutes(55) -and $cachedLifetime -le [TimeSpan]::FromHours(1)) 'The cache records the token expiry in UTC'
	$cache.expiresAt = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')
	$cache | ConvertTo-Json | Set-Content -LiteralPath $cachePath
	$expiredCache = Get-Content -Raw -LiteralPath $cachePath

	$mockGitHub.mintedToken = 'test-refreshed-token'
	$mockGitHub.failUserLookup = $true
	$lookupFailed = $false
	try {
		& $helper -Mode ensure
	}
	catch {
		if ($_.Exception.Message -ne 'Simulated user lookup failure') { throw }
		$lookupFailed = $true
	}
	Assert-Result $lookupFailed 'A failed identity lookup aborts refresh'
	Assert-Result ((Get-Content -Raw -LiteralPath $cachePath) -ceq $expiredCache) 'Failed refresh leaves the cache eligible for retry'
	Assert-Result ((Get-Content -Raw -LiteralPath $hostsPath) -ceq $originalHosts) 'Failed refresh leaves the existing gh config intact'

	$mockGitHub.failUserLookup = $false
	& $helper -Mode ensure
	$refreshedHosts = Get-Content -Raw -LiteralPath $hostsPath
	Assert-Result ($refreshedHosts.Contains($mockGitHub.mintedToken)) 'The next invocation retries and installs the refreshed token'

	$mockGitHub.requests.Clear()
	Set-Content -LiteralPath $hostsPath -Value $originalHosts -NoNewline
	& $helper -Mode ensure
	Assert-Result ((Get-Content -Raw -LiteralPath $hostsPath) -ceq $refreshedHosts) 'A valid cached token repairs stale gh credentials'

	Remove-Item -LiteralPath $hostsPath
	& $helper -Mode ensure
	Assert-Result ((Get-Content -Raw -LiteralPath $hostsPath) -ceq $refreshedHosts) 'A valid cached token recreates missing gh credentials'

	[IO.File]::SetLastWriteTimeUtc($hostsPath, [datetime]::new(2020, 1, 1, 0, 0, 0, [DateTimeKind]::Utc))
	$lastWriteTime = [IO.File]::GetLastWriteTimeUtc($hostsPath)
	& $helper -Mode ensure
	Assert-Result ([IO.File]::GetLastWriteTimeUtc($hostsPath) -eq $lastWriteTime) 'The helper leaves matching gh credentials in place'
	Assert-Result ($mockGitHub.requests.Count -eq 0) 'Cache repair and reuse make no GitHub requests'

	$expiredCache | Set-Content -LiteralPath $cachePath -NoNewline
	$mockGitHub.mintedToken = 'test-concurrent-token'
	$mockGitHub.mintDelay = 300
	$apiMock = ${function:Invoke-RestMethod}.ToString()
	$barrier = [Threading.Barrier]::new(2)
	try {
		$workers = 1..2 | ForEach-Object -Parallel {
			$ErrorActionPreference = 'Stop'
			$mockGitHub = $using:mockGitHub
			Set-Item Function:Invoke-RestMethod ([scriptblock]::Create($using:apiMock))
			$barrier = $using:barrier
			if (-not $barrier.SignalAndWait([TimeSpan]::FromSeconds(10))) { throw 'Concurrent helper did not start' }
			& $using:helper -Mode ensure
		} -ThrottleLimit 2 -AsJob
		$workers | Receive-Job -Wait -AutoRemoveJob
	}
	finally {
		$barrier.Dispose()
	}
	$mints = @($mockGitHub.requests | Where-Object { $_ -eq 'POST /app/installations/1/access_tokens' })
	Assert-Result ($mints.Count -eq 1) 'Concurrent calls share a single refresh'
	$hostsAfterParallel = Get-Content -Raw -LiteralPath $hostsPath
	Assert-Result ($hostsAfterParallel.Contains($mockGitHub.mintedToken)) 'Concurrent calls leave gh using the refreshed token'
}
finally {
	$env:MUTP_GITHUB_APP_HOME = $savedAppHome
	$resolvedFixture = Resolve-Path -LiteralPath $fixture -ErrorAction SilentlyContinue
	if ($resolvedFixture -and $resolvedFixture.Path -eq $fixture) {
		Remove-Item -Recurse -Force -LiteralPath $resolvedFixture.Path
	}
}
