#Requires -Version 5.1
# Contract checks with generated fixtures; no build or prior reports are required.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path $root ('.tools/native-shard-checks/' + [Guid]::NewGuid().ToString('N'))
$sources = Join-Path $fixture 'sources'
$reports = Join-Path $fixture 'reports'
New-Item -ItemType Directory -Force -Path $sources, $reports | Out-Null
$manifestPath = Join-Path $fixture 'manifest.json'
$classes = @(1..4 | ForEach-Object { "com.fumbbl.ffb.test.Shard$($_)Test" })
foreach ($class in $classes) {
    $javaFile = Join-Path $sources ($class.Replace('.', '/') + '.java')
    New-Item -ItemType Directory -Force -Path (Split-Path $javaFile -Parent) | Out-Null
    Set-Content -LiteralPath $javaFile -Value "class $($class.Split('.')[-1]) {}" -Encoding Ascii
}
$reason = 'org.opentest4j.TestAbortedException: Assumption failed: intentional fixture'
$original = [ordered]@{
    schemaVersion = 1
    shards = @(@($classes[0]), @($classes[1]), @($classes[2]), @($classes[3]))
    allowedSkips = @{ $classes[0] = @{ optIn = $reason } }
}
$xmlPath = Join-Path $reports "TEST-$($classes[0]).xml"
$originalXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="$($classes[0])" time="1.25" tests="2" failures="0" errors="0" skipped="1">
  <testcase name="works" classname="$($classes[0])" time="1.25" />
  <testcase name="optIn" classname="$($classes[0])" time="0">
    <skipped type="org.opentest4j.TestAbortedException"><![CDATA[$reason
    at fixture.Test.method(Fixture.java:1)]]></skipped>
  </testcase>
</testsuite>
"@
Set-Content -LiteralPath $xmlPath -Value $originalXml -Encoding UTF8
$shell = (Get-Process -Id $PID).Path
$validator = Join-Path $PSScriptRoot 'native-shard.ps1'
$checks = 0

function Write-Manifest($Value) {
    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

function Assert-Validation([bool]$Pass, [string]$ExpectedText) {
    # Windows PowerShell surfaces expected child stderr as ErrorRecords.
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    $output = & $shell -NoProfile -ExecutionPolicy Bypass -File $validator -Shard 1 -ValidateOnly -ManifestPath $manifestPath -SourceDirectory $sources -SurefireDirectory $reports 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    if (($exitCode -eq 0) -ne $Pass -or $output -notmatch [regex]::Escape($ExpectedText)) {
        throw "Unexpected validator outcome (exit $exitCode, expected pass $Pass / $ExpectedText): $output"
    }
    $script:checks++
}

Write-Manifest $original
Assert-Validation $true 'Validated native shard 1'

$changed = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$changed.shards[1][0] = $classes[0]
Write-Manifest $changed
Assert-Validation $false 'Duplicate native class registration'

Write-Manifest $original
$changed = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$changed.shards[0][0] = 'com.fumbbl.ffb.test.DoesNotExistTest'
Write-Manifest $changed
Assert-Validation $false 'Unknown native class registration'

Write-Manifest $original
$newSource = Join-Path $sources 'com/fumbbl/ffb/test/NewTest.java'
Set-Content -LiteralPath $newSource -Value 'class NewTest {}' -Encoding Ascii
Assert-Validation $false 'Missing native class registration'
Remove-Item -LiteralPath $newSource

Move-Item -LiteralPath $xmlPath -Destination (Join-Path $fixture 'saved.xml')
Assert-Validation $false 'No native Surefire XML reports found'
Move-Item -LiteralPath (Join-Path $fixture 'saved.xml') -Destination $xmlPath

$extra = Join-Path $reports "TEST-$($classes[1]).xml"
Set-Content -LiteralPath $extra -Value ($originalXml.Replace($classes[0], $classes[1])) -Encoding UTF8
Assert-Validation $false 'Unexpected native suite'
Remove-Item -LiteralPath $extra

$changed = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$changed.allowedSkips.PSObject.Properties.Remove($classes[0])
Write-Manifest $changed
Assert-Validation $false 'Unexpected native skip'

Write-Manifest $original
$changed = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$changed.allowedSkips.PSObject.Properties[$classes[0]].Value.optIn = 'changed reason'
Write-Manifest $changed
Assert-Validation $false 'Unexpected native skip'

Write-Manifest $original
[xml]$xml = $originalXml
$xml.testsuite.SetAttribute('failures', '1')
$xml.Save($xmlPath)
Assert-Validation $false 'Native suite failed'

[xml]$xml = $originalXml
$xml.testsuite.SetAttribute('errors', '1')
$xml.Save($xmlPath)
Assert-Validation $false 'Native suite failed'

[xml]$xml = $originalXml
$xml.testsuite.SetAttribute('tests', '0')
$xml.Save($xmlPath)
Assert-Validation $false 'Native suite has zero tests'

Write-Host "$checks native shard validation checks passed. Fixture: $fixture"
