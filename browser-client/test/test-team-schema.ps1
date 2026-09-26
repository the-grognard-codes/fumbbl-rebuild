#Requires -Version 7.4
$ErrorActionPreference = 'Stop'
$schema = Join-Path $PSScriptRoot '../team-request.schema.json'
$draft = @{
    draftVersion = 2; teamName = 'Schema Humans'
    catalogVersion = 'bb2025-human-2026-09-25.1'; ruleset = 'BB2025'
    rosterId = 'human'; presetId = 'human-exhibition-1150'; captainId = $null
    players = @(1..11 | ForEach-Object { @{ id = "p$_"; slot = $_; jerseyNumber = $_; playerName = "Player $_"; positionId = 'lineman'; skillIds = @() } })
    resources = @{ rerolls = 2; assistantCoaches = 0; cheerleaders = 0; apothecary = 1; dedicatedFans = 0 }
}
$request = @{ version = 1; type = 'validateTeam'; requestId = 'schema-test'; draft = $draft }
$validJson = $request | ConvertTo-Json -Depth 20 -Compress
if (!(Test-Json -Json $validJson -SchemaFile $schema)) { throw 'Valid draft rejected by schema' }
$invalid = @(
    $validJson.Replace('"BB2025"', '"BB2020"'),
    $validJson.Replace('"human"', '"unknown"'),
    $validJson.Replace('"rerolls":2', '"rerolls":-1'),
    $validJson.Replace('"rerolls":2', '"rerolls":2.5'),
    $validJson.Replace('"rerolls":2', '"rerolls":"2"'),
    $validJson.Replace('"rerolls":2', '"total":0,"rerolls":2'),
    $validJson.Replace('"catalogVersion":"bb2025-human-2026-09-25.1"', '"catalogVersion":"unknown"'),
    $validJson.Replace('"draftVersion":2', '"draftVersion":1'),
    $validJson.Replace('"jerseyNumber":1', '"jerseyNumber":0'),
    $validJson.Replace('"teamName":"Schema Humans"', '"teamName":""')
)
foreach ($candidate in $invalid) {
    if ($candidate -eq $validJson) { throw 'Schema mutation did not apply' }
    if (Test-Json -Json $candidate -SchemaFile $schema -ErrorAction SilentlyContinue) { throw 'Invalid draft accepted by schema' }
}
Write-Output 'Schema checks passed: one valid draft and ten invalid contracts.'
