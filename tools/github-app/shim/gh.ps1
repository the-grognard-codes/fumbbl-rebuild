#Requires -Version 7.2
# Stands in for gh when this folder is first on PATH: refreshes the GitHub App token if it
# is close to expiry, then runs the real gh with the same arguments and input.
# See docs/agents/github-app.md.
$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot '..\github-app-token.ps1') -Mode ensure

$shimFolder = $PSScriptRoot.TrimEnd('\')
$realGh = Get-Command gh -CommandType Application -All |
	Where-Object { (Split-Path $_.Source -Parent).TrimEnd('\') -ne $shimFolder } |
	Select-Object -First 1
if (-not $realGh) { throw 'gh was not found on PATH outside the GitHub App shim folder.' }

if ($MyInvocation.ExpectingInput) {
	$input | & $realGh.Source @args
}
else {
	& $realGh.Source @args
}
exit $LASTEXITCODE
