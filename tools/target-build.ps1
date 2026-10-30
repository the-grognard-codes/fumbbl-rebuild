#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('info', 'focused', 'test', 'install', 'verify')]
    [string]$Task = 'verify',
    # Defaults to the configured JDK or the manifest's pinned Windows install.
    # Java 21 is the minimum; validation uses the exact Temurin pin.
    [string]$JavaHome,
    [string]$Test,
    [string]$Module,
    [string]$NativeIncludesFile,
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $root '.tools'
$manifest = Get-Content (Join-Path $PSScriptRoot 'target-build-toolchain.json') -Raw | ConvertFrom-Json
$windowsHost = [Environment]::OSVersion.Platform -eq 'Win32NT'

if (!$JavaHome) {
    $configuration = Join-Path $toolRoot 'java-home.txt'
    if (Test-Path -LiteralPath $configuration) {
        $JavaHome = (Get-Content -LiteralPath $configuration -Raw).Trim()
    } elseif ($windowsHost) {
        $JavaHome = $manifest.java.defaultWindowsHome
    } else {
        throw 'Run tools/bootstrap.ps1 -JavaHome /path/to/jdk or supply -JavaHome pointing to JDK 21 or newer.'
    }
}
$JavaHome = (Resolve-Path -LiteralPath $JavaHome).Path
. (Join-Path $PSScriptRoot 'check-java.ps1')
Assert-SupportedJava $JavaHome $manifest.java | Out-Null

$launcher = if ($windowsHost) { 'bin/mvn.cmd' } else { 'bin/mvn' }
$maven = Join-Path (Join-Path $toolRoot $manifest.maven.directory) $launcher
if (!(Test-Path -LiteralPath $maven)) {
    throw "Maven $($manifest.maven.version) is missing. Run tools/bootstrap.ps1 first."
}
$settings = Join-Path $root '.mvn/settings.xml'
$mavenArguments = @('--batch-mode', '--no-transfer-progress', '--show-version',
    '--settings', $settings, '--global-settings', $settings,
    "-Dmaven.repo.local=$(Join-Path $toolRoot $manifest.repositoryDirectory)")
if ($Offline) { $mavenArguments += '--offline' }
if (($Test -or $Module) -and $Task -ne 'test') { throw '-Test and -Module are only supported with the test task.' }
if ($NativeIncludesFile) {
    if ($Task -ne 'verify') { throw '-NativeIncludesFile is only supported with the verify task.' }
    $NativeIncludesFile = (Resolve-Path -LiteralPath $NativeIncludesFile).Path
    if (!(Test-Path -LiteralPath $NativeIncludesFile -PathType Leaf)) { throw "Native includes file is not a file: $NativeIncludesFile" }
    $mavenArguments += "-Dnative.shard.includesFile=$NativeIncludesFile"
}
switch ($Task) {
    'info' { $mavenArguments += '--version' }
    'focused' {
        $mavenArguments += @('-pl', 'ffb-statetest', '-am',
            '-Dtest=BlockTest,ShadowingTest,HandOffTurnoverTest,SafePassTest,SwarmingEndTurnTest,RulesTest,ReRollApiEquivalenceTest,BrowserEngineQueueTest',
            '-Dsurefire.failIfNoSpecifiedTests=false', 'test')
    }
    'test' {
        if ($Module) { $mavenArguments += @('-pl', $Module, '-am') }
        if ($Test) { $mavenArguments += @("-Dtest=$Test", '-Dsurefire.failIfNoSpecifiedTests=false') }
        $mavenArguments += 'test'
    }
    'install' { $mavenArguments += @('clean', 'install') }
    'verify' { $mavenArguments += @('clean', 'verify') }
}

# Scope every Maven/JDK setting to this child process invocation and restore the
# caller exactly, including a previously unset variable.
$environmentNames = @('JAVA_HOME', 'MAVEN_SKIP_RC', 'MAVEN_ARGS', 'MAVEN_OPTS')
$previous = @{}
foreach ($name in $environmentNames) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$result = 1
Push-Location $root
try {
    $env:JAVA_HOME = $JavaHome
    $env:MAVEN_SKIP_RC = 'true'
    $env:MAVEN_ARGS = ''
    $env:MAVEN_OPTS = '-Dfile.encoding=UTF-8'
    $mavenIdentity = if ($windowsHost) { (& $maven --version 2>&1 | Out-String) } else { (& sh $maven --version 2>&1 | Out-String) }
    if ($LASTEXITCODE -ne 0 -or $mavenIdentity -notmatch "Apache Maven $([regex]::Escape($manifest.maven.version))") {
        throw "Target requires project-local Apache Maven $($manifest.maven.version); rejected $maven."
    }
    if ($windowsHost) { & $maven @mavenArguments }
    else { & sh $maven @mavenArguments }
    $result = $LASTEXITCODE
} finally {
    Pop-Location
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
exit $result
