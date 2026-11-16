[CmdletBinding()]
param(
    [ValidateSet('low','balanced','high')][string]$Profile = 'low',
    [ValidateSet('es','bc','ppo')][string]$Mode = 'es',
    [ValidateRange(1,86400)][int]$BudgetSeconds = 120,
    [string]$Checkpoint,
    [string]$Data,
    [int]$Workers = 1
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/../..").Path
Push-Location $root
try {
    if (!(Test-Path .tools/training-classpath.txt)) { & "$PSScriptRoot/prepare.ps1" }
    New-Item -ItemType Directory -Force .tools/training | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    if ($Mode -eq 'es') {
        $resume = if (Test-Path .tools/training/es/checkpoint.json) { 'on' } else { 'off' }
        & node computer-player/training/train.mjs --profile $Profile --workers $Workers --budget-seconds $BudgetSeconds --generations 100000 --resume $resume 2>&1 | Tee-Object ".tools/training/es-$stamp.log"
    } else {
        & "$root/computer-player/ml/setup.ps1"
        $python = "$root/.tools/ml-venv/Scripts/python.exe"
        Push-Location computer-player
        try {
            if ($Mode -eq 'bc') {
                if (!$Data) { throw '-Data must name a trajectory run directory' }
                & $python -m ml.train_bc --data $Data --output "$root/.tools/training/bc.pt" --steps 100000 --budget-seconds $BudgetSeconds 2>&1 | Tee-Object "$root/.tools/training/bc-$stamp.log"
            } else {
                if (!$Checkpoint) { throw '-Checkpoint must name a BC/PPO checkpoint' }
                & $python -m ml.train_rl --checkpoint $Checkpoint --output "$root/.tools/training/ppo" --profile $Profile --workers $Workers --iterations 100000 --budget-seconds $BudgetSeconds 2>&1 | Tee-Object "$root/.tools/training/ppo-$stamp.log"
            }
        } finally { Pop-Location }
    }
    if ($LASTEXITCODE) { throw "Training exited with $LASTEXITCODE" }
} finally { Pop-Location }
