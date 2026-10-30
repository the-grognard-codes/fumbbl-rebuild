#Requires -Version 5.1
# Compatibility entry point; all current builds use the same Java 21 toolchain.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('info', 'focused', 'test', 'install', 'verify')]
    [string]$Task = 'verify',
    [string]$Test,
    [string]$Module,
    [string]$JavaHome,
    [switch]$Offline
)

& (Join-Path $PSScriptRoot 'target-build.ps1') @PSBoundParameters
exit $LASTEXITCODE
