$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$artRoot = Split-Path $PSScriptRoot -Parent
$preview = [System.Drawing.Bitmap]::new(960,660)
$graphics = [System.Drawing.Graphics]::FromImage($preview)
$graphics.Clear([System.Drawing.Color]::FromArgb(23,30,40))
$titleFont = [System.Drawing.Font]::new('Segoe UI',18,[System.Drawing.FontStyle]::Bold)
$labelFont = [System.Drawing.Font]::new('Segoe UI',9)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(246,233,208))
$grass = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(74,89,35))
$grid = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(112,124,66))
$graphics.DrawString('64px CHIBI TEAMS / NATIVE SIZE', $titleFont, $ink, 24, 10)
$graphics.DrawString('Sprites shown at 1x: 64x64 tiles; ogre and troll 80x80. No display smoothing.', $labelFont, $ink, 24, 44)
$teamIndex = 0
foreach ($teamName in @('humans','orcs')) {
  $teamRoot = Join-Path $artRoot ($teamName + '-team-64px-chibi-v1')
  $entries = Get-Content -LiteralPath (Join-Path $teamRoot 'manifest.json') -Raw | ConvertFrom-Json
  $sectionY = 76 + $teamIndex * 286
  $graphics.DrawString($teamName.ToUpper(),$titleFont,$ink,24,$sectionY)
  $index = 0
  foreach ($entry in $entries) {
    $cellX = 24 + ($index % 8) * 114
    $cellY = $sectionY + 38 + [Math]::Floor($index / 8) * 116
    $graphics.FillRectangle($grass,$cellX,$cellY,104,96)
    $graphics.DrawRectangle($grid,$cellX+20,$cellY+24,64,64)
    $sprite = [System.Drawing.Bitmap]::new((Join-Path $teamRoot $entry.file))
    $graphics.DrawImageUnscaled($sprite,[int]($cellX+52-$sprite.Width/2),[int]($cellY+88-$sprite.Height))
    $sprite.Dispose()
    $shortLabel = $entry.id.Replace('-woman',' F').Replace('-man',' M').Replace('line-orc','line').Replace('lineman','line').Replace('-',' ')
    $graphics.DrawString($shortLabel,$labelFont,$ink,$cellX,$cellY+98)
    $index++
  }
  $teamIndex++
}
$preview.Save((Join-Path $artRoot 'teams-64px-chibi-v1-pitch-preview.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$preview.Dispose()
$titleFont.Dispose()
$labelFont.Dispose()
$ink.Dispose()
$grass.Dispose()
$grid.Dispose()
