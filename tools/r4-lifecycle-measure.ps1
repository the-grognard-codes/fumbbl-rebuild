# Retained synthetic fixtures only. Never starts/stops a service or deletes data.
[CmdletBinding()]
param(
    [string]$JdbcUrl = 'jdbc:mariadb://127.0.0.1:23320/ffb_local',
    [string]$PasswordFile = 'containers/local/.secrets/db_root_password'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if ($JdbcUrl -ne 'jdbc:mariadb://127.0.0.1:23320/ffb_local') {
    throw 'This measurement is restricted to the retained isolated setup-test database on port 23320.'
}
$evidence = Join-Path $root ('.notes/overhaul-analysis/verification/r4/run-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $evidence | Out-Null
$priorUrl = $env:R4_TEST_JDBC_URL
$priorFile = $env:R4_TEST_PASSWORD_FILE
try {
    $env:R4_TEST_JDBC_URL = $JdbcUrl
    $env:R4_TEST_PASSWORD_FILE = (Resolve-Path -LiteralPath $PasswordFile).Path
    $output = Join-Path $evidence 'maven.log'
    $errors = Join-Path $evidence 'stderr.log'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test RecoveryApplicationTest#isolatedJdbcLifecyclePressure -Offline'
    $run = Start-Process powershell -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $output -RedirectStandardError $errors
    $runHandle = $run.Handle
    $samples = [System.Collections.Generic.List[object]]::new()
    $testProcessId = $null
    while (!$run.HasExited) {
        if (!$testProcessId -and (Test-Path -LiteralPath $output)) {
            $match = Select-String -LiteralPath $output -Pattern 'R4_MEASUREMENT_PID=(\d+)' | Select-Object -First 1
            if ($match) { $testProcessId = [int]$match.Matches[0].Groups[1].Value }
        }
        if ($testProcessId) {
            $testProcess = Get-Process -Id $testProcessId -ErrorAction SilentlyContinue
            if ($testProcess) {
                $samples.Add([pscustomobject]@{ utc = [DateTime]::UtcNow.ToString('o'); processId = $testProcessId; rssBytes = $testProcess.WorkingSet64; peakRssBytes = $testProcess.PeakWorkingSet64; cpuSeconds = $testProcess.TotalProcessorTime.TotalSeconds })
            }
        }
        Start-Sleep -Milliseconds 500
        $run.Refresh()
    }
    $run.WaitForExit()
    $samples | Export-Csv -LiteralPath (Join-Path $evidence 'process-samples.csv') -NoTypeInformation
    [ordered]@{ jdbcUrl = $JdbcUrl; command = $arguments; exitCode = $run.ExitCode; processor = (Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors); memoryBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; sampleIntervalMs = 500; scope = 'Application/JDBC lifecycle through existing communication worker; no browser or network socket' } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $evidence 'configuration.json') -Encoding UTF8
    $summary = Select-String -LiteralPath $output -Pattern 'R4 JDBC lifecycle measurement: .* (\{.*\})$' | Select-Object -Last 1
    if ($summary) { $summary.Matches[0].Groups[1].Value | Set-Content -LiteralPath (Join-Path $evidence 'measurement.json') -Encoding UTF8 }
    Write-Output "R4 evidence: $evidence"
    if ($run.ExitCode -ne 0 -or !$summary) { throw "Lifecycle measurement failed: $($run.ExitCode); evidence retained." }
} finally {
    $env:R4_TEST_JDBC_URL = $priorUrl
    $env:R4_TEST_PASSWORD_FILE = $priorFile
}
