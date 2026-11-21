#Requires -Version 7.2
<#
.SYNOPSIS
Makes gh and git in the current PowerShell session act as the GitHub App.

.DESCRIPTION
Dot-source it, then start the agent from the same session:

    . ./tools/github-app/enter.ps1
    codex

It mints a token, sets the variables from github-app-token.ps1 -Mode env, and puts the
gh shim first on PATH so every gh command refreshes the token when needed.
Close the session (or run exit.ps1) to go back to your own identity.
For the Codex VS Code extension, use -Mode codex-config instead; see docs/agents/github-app.md.
#>
$ErrorActionPreference = 'Stop'

if ($MyInvocation.InvocationName -ne '.') {
	throw 'Dot-source this script so it can change the current session: . ./tools/github-app/enter.ps1'
}

$tokenScript = Join-Path $PSScriptRoot 'github-app-token.ps1'
$shimFolder = Join-Path $PSScriptRoot 'shim'
& $tokenScript -Mode status | Out-Host
$variables = & $tokenScript -Mode env | ConvertFrom-Json

# A token in these variables would win over GH_CONFIG_DIR and keep gh acting as you.
Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
foreach ($property in $variables.PSObject.Properties) {
	Set-Item -Path "Env:$($property.Name)" -Value $property.Value
}
$env:PATH = (@($shimFolder) + @($env:PATH -split ';' | Where-Object { $_ -and $_ -ne $shimFolder })) -join ';'

Write-Host "gh and git in this session now act as $env:GIT_AUTHOR_NAME. Close the session to switch back."
