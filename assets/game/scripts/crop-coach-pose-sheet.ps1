# Splits an image-generated 4x2 source sheet into the seven body sources and a
# dedicated portrait source. Artistic content is never altered here.
param(
  [Parameter(Mandatory=$true)][string]$Sheet,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$Archetype
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$poses = @('front','back','front45','back45','side','prone','stunned','portrait')
$source = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Sheet).Path)
try {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  for ($index = 0; $index -lt 8; $index++) {
    $column = $index % 4
    $row = [int][Math]::Floor($index / 4)
    $left = [int][Math]::Floor($source.Width * $column / 4)
    $right = [int][Math]::Floor($source.Width * ($column + 1) / 4)
    $top = [int][Math]::Floor($source.Height * $row / 2)
    $bottom = [int][Math]::Floor($source.Height * ($row + 1) / 2)
    $crop = $source.Clone([System.Drawing.Rectangle]::FromLTRB($left,$top,$right,$bottom),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      foreach ($point in @(@(0,0),@(($crop.Width-1),0),@(0,($crop.Height-1)),@(($crop.Width-1),($crop.Height-1)))) {
        $alpha = $crop.GetPixel($point[0],$point[1]).A
        if ($alpha -gt 8) { throw "Sheet cell has cut artwork: $Archetype/$($poses[$index])" }
        if ($alpha -gt 0) { $crop.SetPixel($point[0],$point[1],[System.Drawing.Color]::Transparent) }
      }
      $crop.Save((Join-Path $OutputDirectory ($Archetype + '-' + $poses[$index] + '.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $crop.Dispose() }
  }
} finally { $source.Dispose() }
