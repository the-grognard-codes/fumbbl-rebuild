#Requires -Version 7.2
<#
.SYNOPSIS
Returns the current PowerShell session to your own GitHub identity after enter.ps1.

.DESCRIPTION
Dot-source it: . ./tools/github-app/exit.ps1
It removes the variables and the gh shim that enter.ps1 added.
#>
if ($MyInvocation.InvocationName -ne '.') {
	throw 'Dot-source this script so it can change the current session: . ./tools/github-app/exit.ps1'
}

$names = @(
	'GH_CONFIG_DIR', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
	'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL',
	'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'
)
foreach ($name in $names) {
	Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
}
$shimFolder = Join-Path $PSScriptRoot 'shim'
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -and $_ -ne $shimFolder }) -join ';'
Write-Host 'gh and git in this session use your own identity again.'
