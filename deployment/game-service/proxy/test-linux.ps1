[CmdletBinding()]
param([string]$DockerExe)
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (!$DockerExe) {
    $command = Get-Command docker -ErrorAction SilentlyContinue
    if ($command) { $DockerExe = $command.Source }
    else { $DockerExe = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
}
if (!(Test-Path -LiteralPath $DockerExe)) { throw 'Supply -DockerExe pointing to the local Docker CLI.' }
foreach ($directory in @('ffb-server/target/classes', 'ffb-server/target/test-classes', 'ffb-common/target/classes')) {
    if (!(Test-Path (Join-Path $repository $directory))) { throw 'Run the focused target-build Java tests first.' }
}
$runId = 'r3d-native-' + [Guid]::NewGuid().ToString('N')
$evidence = Join-Path $repository ('.tools/' + $runId)
New-Item -ItemType Directory -Path $evidence | Out-Null
New-Item -ItemType Directory -Path (Join-Path $evidence '.tools') | Out-Null
$arguments = @('run', '--name', $runId, '--network', 'none', '--read-only', '--user', '101:101',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--pids-limit', '128', '--memory', '768m',
    '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777', '--tmpfs', '/var/cache/nginx:rw,nosuid,nodev,mode=1777',
    '--mount', "type=bind,source=$evidence,target=/work",
    '--mount', "type=bind,source=$PSScriptRoot,target=/checks,readonly",
    'ffb-r3d-proxy-test:20260919')
& $DockerExe @arguments 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'test-output.txt')
$result = $LASTEXITCODE
Write-Host "Retained isolated test container: $runId"
Write-Host "Retained synthetic evidence: $evidence"
if ($result -ne 0) { throw "Linux integration failed (exit $result); inspect only the named test container/evidence." }
