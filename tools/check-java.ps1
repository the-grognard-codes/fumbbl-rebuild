function Assert-JavaVersion([string]$Details, [int]$MinimumVersion) {
    if ($Details -notmatch 'java.specification.version = (\d+)(\r?\n)' -or
        [int]$Matches[1] -lt $MinimumVersion) {
        throw "JDK $MinimumVersion or newer is required. Run tools/bootstrap.ps1 to refresh the selected JDK."
    }
}

function Assert-SupportedJava($JavaHome, $Specification) {
    $suffix = if ([Environment]::OSVersion.Platform -eq 'Win32NT') { '.exe' } else { '' }
    foreach ($command in @('java', 'javac')) {
        if (!(Test-Path -LiteralPath (Join-Path $JavaHome "bin/$command$suffix"))) {
            throw "Missing $command in JDK: $JavaHome. Run tools/bootstrap.ps1."
        }
    }
    # Process redirection also works on Windows PowerShell 5.1, where native
    # stderr (including java -version) can otherwise become a terminating error.
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $JavaHome "bin/java$suffix"
    $start.Arguments = '-XshowSettings:properties -version'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $details = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $javaExit = $process.ExitCode
    $process.Dispose()
    if ($javaExit -ne 0) { throw "Unable to inspect JDK: $JavaHome" }
    Assert-JavaVersion $details $Specification.minimumVersion
    return $details
}
