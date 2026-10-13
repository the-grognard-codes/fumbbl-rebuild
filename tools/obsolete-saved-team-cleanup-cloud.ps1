[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prod')]
    [string]$Environment,
    [ValidateSet('inventory', 'plan', 'apply')]
    [string]$Mode = 'plan',
    [string]$PlanSha256,
    [switch]$PrintCommands
)

$ErrorActionPreference = 'Stop'
$Environment = $Environment.ToLowerInvariant()
$Mode = $Mode.ToLowerInvariant()
if (($Mode -eq 'apply' -and $PlanSha256 -cnotmatch '^[0-9a-f]{64}$') -or
    ($Mode -ne 'apply' -and $PlanSha256)) {
    throw 'Apply requires -PlanSha256 with the digest printed by plan; other modes do not accept a digest.'
}
$repository = Split-Path -Parent $PSScriptRoot
$archive = Join-Path $repository 'ffb-server/target/ffb-server.zip'
$hostScript = Join-Path $repository 'deployment/game-service/cleanup-obsolete-teams-host.sh'
if (!(Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "Build first: mvn -pl ffb-server -am '-DskipTests' package"
}
$archiveTime = (Get-Item -LiteralPath $archive).LastWriteTimeUtc
foreach ($name in @('ObsoleteSavedTeamCleanupMain', 'ObsoleteSavedTeamCleanup', 'JdbcObsoleteSavedTeamStore')) {
    $source = Join-Path $repository "ffb-server/src/main/java/com/fumbbl/ffb/server/team/$name.java"
    if ((Get-Item -LiteralPath $source).LastWriteTimeUtc -gt $archiveTime) {
        throw "Cleanup package is stale. Rebuild: mvn -pl ffb-server -am '-DskipTests' package"
    }
}
$archiveDigest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$project = if ($Environment -eq 'dev') { 'dev-moles-under-the-pitch-org' } else { 'molesunderthepitch-dotorg' }
$upload = ".mutp-team-cleanup-$archiveDigest"
$connection = @('--project', $project, '--zone', 'us-central1-a', '--tunnel-through-iap')

function Invoke-CloudCommand {
    param([string[]]$CloudArguments)
    if ($PrintCommands) {
        $quoted = $CloudArguments | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }
        Write-Output ('gcloud ' + ($quoted -join ' '))
        return
    }
    & gcloud @CloudArguments
    if ($LASTEXITCODE -ne 0) {
        # Preserve the cleanup CLI's exit 3: commit succeeded or acknowledgement
        # was lost, so inspect inventory before considering another apply.
        exit $LASTEXITCODE
    }
}

# Fixed paths/digests and enum selections are the only remote shell inputs.
Invoke-CloudCommand (@('compute', 'ssh', 'moles-game') + $connection + @('--command',
    ('umask 077; mkdir -p -- "$HOME/{0}"; chmod 700 -- "$HOME/{0}"' -f $upload)))
# PSCP's SFTP transport treats ~ literally. A relative destination starts in
# the login home directory, matching the $HOME path created through SSH above.
Invoke-CloudCommand (@('compute', 'scp', $archive, $hostScript, "moles-game:$upload/") + $connection)
$remote = 'sudo -n bash "$HOME/{0}/cleanup-obsolete-teams-host.sh" {1} {2} "$HOME/{0}/ffb-server.zip" {3}' -f
    $upload, $Environment, $Mode, $archiveDigest
if ($Mode -eq 'apply') { $remote += " $PlanSha256" }
Invoke-CloudCommand (@('compute', 'ssh', 'moles-game') + $connection + @('--command', $remote))
