[CmdletBinding()]
param([string]$Python = 'python', [switch]$Cpu)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$venv = "$root/.tools/ml-venv"
if (!(Test-Path "$venv/Scripts/python.exe")) {
    & $Python -m venv $venv
    if ($LASTEXITCODE) { throw 'venv creation failed; supply -Python with a supported Python 3.12+ executable' }
}
& "$venv/Scripts/python.exe" -m pip install --disable-pip-version-check -r "$PSScriptRoot/requirements.txt"
if ($LASTEXITCODE) { throw 'Pinned wheel install failed; retry with a supported Python via -Python. No system Python is changed.' }
Push-Location "$root/computer-player"
try {
    $device = if ($Cpu) { 'cpu' } else { 'cuda' }
    & "$venv/Scripts/python.exe" -m ml.check --device $device
    if ($LASTEXITCODE) { throw 'PyTorch device verification failed' }
} finally { Pop-Location }
