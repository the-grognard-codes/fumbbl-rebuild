[CmdletBinding()]
param([string]$JavaHome, [string]$Maven, [string]$Repository)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$manifest = Get-Content "$root/tools/target-build-toolchain.json" -Raw | ConvertFrom-Json
if (!$JavaHome) {
    if (Test-Path "$root/.tools/java-home.txt") { $JavaHome = (Get-Content "$root/.tools/java-home.txt" -Raw).Trim() }
    else { $JavaHome = $manifest.java.defaultWindowsHome }
}
. "$root/tools/check-java.ps1"
Assert-SupportedJava $JavaHome $manifest.java | Out-Null
if (!$Maven) { $Maven = "$root/.tools/$($manifest.maven.directory)/bin/mvn.cmd" }
if (!$Repository) { $Repository = "$root/.tools/$($manifest.repositoryDirectory)" }
$previousJava = $env:JAVA_HOME
Push-Location $root
try {
    $env:JAVA_HOME = $JavaHome
    New-Item -ItemType Directory -Force .tools | Out-Null
    & $Maven --batch-mode --no-transfer-progress --settings .mvn/settings.xml "-Dmaven.repo.local=$Repository" -pl ffb-server -am -DskipTests install
    if ($LASTEXITCODE) { throw 'Training engine compilation failed' }
    & $Maven --batch-mode --no-transfer-progress --settings .mvn/settings.xml "-Dmaven.repo.local=$Repository" -pl ffb-server dependency:build-classpath '-Dmdep.includeScope=test' "-Dmdep.outputFile=$root/.tools/training-dependencies.txt"
    if ($LASTEXITCODE) { throw 'Training classpath resolution failed' }
    $dependencies = (Get-Content .tools/training-dependencies.txt -Raw).Trim()
    "$root/ffb-server/target/test-classes;$root/ffb-server/target/classes;$root/ffb-common/target/classes;$dependencies" | Set-Content .tools/training-classpath.txt
} finally { $env:JAVA_HOME = $previousJava; Pop-Location }
