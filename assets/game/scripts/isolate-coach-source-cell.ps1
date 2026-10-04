# Isolates a pose whose neighboring source-sheet cell crosses its nominal grid.
# The measured rectangle encloses the complete connected player artwork. No
# source pixels inside the rectangle are painted, erased, or resampled.
param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Output,
  [Parameter(Mandatory=$true)][int]$Left,
  [Parameter(Mandatory=$true)][int]$Top,
  [Parameter(Mandatory=$true)][int]$Right,
  [Parameter(Mandatory=$true)][int]$Bottom
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Source).Path)
try {
  if ($Left -lt 0 -or $Top -lt 0 -or $Right -gt $image.Width -or $Bottom -gt $image.Height -or $Left -ge $Right -or $Top -ge $Bottom) {
    throw 'Invalid measured isolation rectangle.'
  }
  $crop = $image.Clone([System.Drawing.Rectangle]::FromLTRB($Left,$Top,$Right,$Bottom),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    foreach ($point in @(@(0,0),@(($crop.Width-1),0),@(0,($crop.Height-1)),@(($crop.Width-1),($crop.Height-1)))) {
      $alpha = $crop.GetPixel($point[0],$point[1]).A
      if ($alpha -gt 8) { throw 'Isolation rectangle clips visible artwork.' }
      if ($alpha -gt 0) { $crop.SetPixel($point[0],$point[1],[System.Drawing.Color]::Transparent) }
    }
    New-Item -ItemType Directory -Path (Split-Path $Output -Parent) -Force | Out-Null
    $crop.Save([System.IO.Path]::GetFullPath($Output),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $crop.Dispose() }
} finally { $image.Dispose() }
