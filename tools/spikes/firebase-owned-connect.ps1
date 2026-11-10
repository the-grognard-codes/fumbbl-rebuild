[CmdletBinding()]
param(
    [string]$Image = 'ffb-server:match-review',
    [string]$ClasspathFile
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (!$ClasspathFile) { $ClasspathFile = Join-Path $root '.tools/slice3-spike-classpath.txt' }
if (!(Test-Path -LiteralPath $ClasspathFile)) { throw 'Generate the spike test classpath before running this probe.' }
$repository = (Resolve-Path (Join-Path $root '.tools/repository')).Path
$classpath = @('/work/ffb-server/target/test-classes', '/work/ffb-server/target/classes')
foreach ($entry in ((Get-Content -LiteralPath $ClasspathFile -Raw).Trim() -split [regex]::Escape([IO.Path]::PathSeparator))) {
    $absolute = [IO.Path]::GetFullPath($entry)
    if (!$absolute.StartsWith($repository + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Probe classpath must use only the project-local repository.'
    }
    $classpath += '/work/.tools/repository/' + $absolute.Substring($repository.Length + 1).Replace('\', '/')
}
function Invoke-ProbeDocker([string[]]$DockerArguments) {
    $output = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker probe command failed: $($DockerArguments[0])" }
    return $output
}
$taskLabel = 'firebase-bounds-spike'
$networkName = 'ffb-firebase-spike-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$containerName = $networkName + '-probe'
$networkCreated = $false
try {
    $networkId = Invoke-ProbeDocker @('network', 'create', '--internal', '--label', "ffb.task=$taskLabel", $networkName)
    $networkCreated = $true
    $network = (Invoke-ProbeDocker @('network', 'inspect', $networkName) | Out-String | ConvertFrom-Json)[0]
    $subnet = @($network.IPAM.Config | Where-Object { $_.Subnet -notmatch ':' })[0].Subnet
    $parts = $subnet.Split('/')
    $prefix = [int]$parts[1]
    if ($prefix -gt 28 -or $prefix -lt 8) { throw 'Unexpected probe network size.' }
    $octets = $parts[0].Split('.') | ForEach-Object { [uint64]$_ }
    $base = ($octets[0] -shl 24) -bor ($octets[1] -shl 16) -bor ($octets[2] -shl 8) -bor $octets[3]
    $unused = $base + [uint64][math]::Pow(2, (32 - $prefix)) - 2
    $address = '{0}.{1}.{2}.{3}' -f (($unused -shr 24) -band 255), (($unused -shr 16) -band 255), (($unused -shr 8) -band 255), ($unused -band 255)
    @{ network = $networkName; id = "$networkId"; subnet = $subnet; target = $address; image = $Image } |
        ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $root '.tools/slice3-owned-connect-network.json')
    # Only class files and dependency jars are mounted; no credentials/configuration or database volumes.
    Invoke-ProbeDocker @('run', '--rm', '--name', $containerName, '--label', "ffb.task=$taskLabel", '--network', $networkName,
        '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
        '--mount', "type=bind,source=$repository,target=/work/.tools/repository,readonly",
        '--mount', "type=bind,source=$root/ffb-server/target/test-classes,target=/work/ffb-server/target/test-classes,readonly",
        '--mount', "type=bind,source=$root/ffb-server/target/classes,target=/work/ffb-server/target/classes,readonly",
        '--entrypoint', 'java', $Image, '-Xmx256m', '-cp', ($classpath -join ':'),
        'com.fumbbl.ffb.server.local.FirebaseOwnedConnectProbe', $address)
} finally {
    if ($networkCreated) {
        $remaining = Invoke-ProbeDocker @('ps', '-a', '--filter', "name=^/$containerName$", '--format', '{{.ID}}')
        if ($remaining) {
            $container = (Invoke-ProbeDocker @('inspect', $containerName) | Out-String | ConvertFrom-Json)[0]
            if ($container.Config.Labels.'ffb.task' -ne $taskLabel) { throw 'Unexpected probe container ownership; retained for inspection.' }
            Invoke-ProbeDocker @('rm', '--force', $containerName) | Out-Null
        }
        $network = (Invoke-ProbeDocker @('network', 'inspect', $networkName) | Out-String | ConvertFrom-Json)[0]
        if ($network.Labels.'ffb.task' -ne $taskLabel -or @($network.Containers.PSObject.Properties).Count -ne 0) {
            throw 'Unexpected probe network ownership or attachments; retained for inspection.'
        }
        Invoke-ProbeDocker @('network', 'rm', $networkName) | Out-Null
    }
}
