# Windows / PowerShell, System.Drawing. Roster schema: see team-sprite-standard.md.
# Copies full-size PNG sources and creates a new pack; never replaces an old pack.
param(
  [Parameter(Mandatory=$true)][string]$RosterPath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [ValidateRange(16,256)][int]$TileSize = 64
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$rosterFile = (Resolve-Path -LiteralPath $RosterPath).Path
$rosterRoot = Split-Path $rosterFile -Parent
$roster = Get-Content -LiteralPath $rosterFile -Raw | ConvertFrom-Json
$players = @($roster.players)
if (!$roster.team -or $players.Count -lt 1) { throw 'Roster requires team and players.' }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) { throw 'Output directory exists; choose a new version.' }
$ids = @{}
$resolvedSources = @{}
foreach ($player in $players) {
  if ($player.id -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$' -or $ids.ContainsKey($player.id)) { throw 'Player IDs must be unique lowercase filename-safe slugs.' }
  if ($player.id -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])$') { throw 'Reserved filename.' }
  if (!$player.role -or !$player.source -or $player.sizeClass -notin @('standard','small','big')) { throw "Invalid roster entry: $($player.id)" }
  $ids[$player.id] = $true
  $sourcePath = if ([System.IO.Path]::IsPathRooted($player.source)) { $player.source } else { Join-Path $rosterRoot $player.source }
  $resolvedSources[$player.id] = (Resolve-Path -LiteralPath $sourcePath).Path
}
function Get-AlphaBounds([System.Drawing.Bitmap]$Bitmap) {
  $left = $Bitmap.Width; $top = $Bitmap.Height; $right = -1; $bottom = -1
  for ($y = 0; $y -lt $Bitmap.Height; $y++) {
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
      if ($Bitmap.GetPixel($x,$y).A -gt 0) {
        $left = [Math]::Min($left,$x); $right = [Math]::Max($right,$x)
        $top = [Math]::Min($top,$y); $bottom = [Math]::Max($bottom,$y)
      }
    }
  }
  if ($right -lt 0) { throw 'Empty transparent image.' }
  return [System.Drawing.Rectangle]::FromLTRB($left,$top,$right+1,$bottom+1)
}
$originalDir = Join-Path $outputRoot 'originals'
$spriteDir = Join-Path $outputRoot 'sprites'
New-Item -ItemType Directory -Path $originalDir,$spriteDir -Force | Out-Null
$manifest = @()
foreach ($player in $players) {
  $sourcePath = $resolvedSources[$player.id]
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  try {
    if ($source.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid) { throw 'Source must be PNG.' }
    foreach ($point in @(@(0,0),@(($source.Width-1),0),@(0,($source.Height-1)),@(($source.Width-1),($source.Height-1)))) {
      if ($source.GetPixel($point[0],$point[1]).A -ne 0) { throw "Source lacks transparent margin: $($player.id)" }
    }
    $bounds = Get-AlphaBounds $source
    $canvas = $TileSize; $fit = [int][Math]::Round($TileSize*60/64)
    if ($player.sizeClass -eq 'small') { $fit = [int][Math]::Round($TileSize*46/64) }
    if ($player.sizeClass -eq 'big') { $canvas = [int][Math]::Round($TileSize*1.25); $fit = [int][Math]::Round($TileSize*76/64) }
    $ratio = [Math]::Min($fit/$bounds.Width,$fit/$bounds.Height)
    if ($ratio -gt 1) { throw "Source too small; use full-size artwork: $($player.id)" }
    $width = [Math]::Max(1,[int][Math]::Round($bounds.Width*$ratio))
    $height = [Math]::Max(1,[int][Math]::Round($bounds.Height*$ratio))
    $sprite = [System.Drawing.Bitmap]::new($canvas,$canvas,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($sprite)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $destination = [System.Drawing.Rectangle]::new([int][Math]::Floor(($canvas-$width)/2),$canvas-$height-1,$width,$height)
        $graphics.DrawImage($source,$destination,$bounds,[System.Drawing.GraphicsUnit]::Pixel)
      } finally { $graphics.Dispose() }
      $finalBounds = Get-AlphaBounds $sprite
      if ($finalBounds.Left -lt 1 -or $finalBounds.Top -lt 1 -or $finalBounds.Right -ge $canvas -or $finalBounds.Bottom -ge $canvas) { throw "Sprite touches canvas edge: $($player.id)" }
      $sprite.Save((Join-Path $spriteDir ($player.id+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $sprite.Dispose() }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $originalDir ($player.id+'.png'))
    $manifest += [pscustomobject]@{id=$player.id;role=$player.role;gender=$player.gender;sizeClass=$player.sizeClass;file=('sprites/'+$player.id+'.png');original=('originals/'+$player.id+'.png');sourceSha256=(Get-FileHash -LiteralPath $sourcePath).Hash;width=$canvas;height=$canvas;tileSize=$TileSize;anchorX=($canvas/2);anchorY=($canvas-1);bounds=@{x=$finalBounds.X;y=$finalBounds.Y;width=$finalBounds.Width;height=$finalBounds.Height}}
  } finally { $source.Dispose() }
}
Copy-Item -LiteralPath $rosterFile -Destination (Join-Path $outputRoot 'roster.json')
[pscustomobject]@{team=$roster.team;standardVersion=$roster.standardVersion;filter='nearest-neighbor';players=$manifest} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'manifest.json') -Encoding UTF8
foreach ($zoom in @(1,3)) {
  $columns = [Math]::Min(4,$manifest.Count)
  $cell = [int][Math]::Ceiling($TileSize*1.25)*$zoom+36
  $rowHeight = $cell+26
  $rows = [int][Math]::Ceiling($manifest.Count/$columns)
  $sheet = [System.Drawing.Bitmap]::new(($columns*$cell),($rows*$rowHeight+40))
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  $font = [System.Drawing.Font]::new('Segoe UI',9)
  $grass = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(74,89,35))
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(23,30,40))
    $graphics.DrawString(($roster.team+' / '+$TileSize+'px / '+$zoom+'x'),$font,[System.Drawing.Brushes]::Ivory,8,8)
    for ($index=0;$index -lt $manifest.Count;$index++) {
      $entry = $manifest[$index]
      $x = ($index%$columns)*$cell
      $y = [int][Math]::Floor($index/$columns)*$rowHeight+40
      $graphics.FillRectangle($grass,$x+4,$y,$cell-8,$cell)
      $image = [System.Drawing.Bitmap]::new((Join-Path $outputRoot $entry.file))
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $target = [System.Drawing.Rectangle]::new([int]($x+($cell-$image.Width*$zoom)/2),$y+$cell-$image.Height*$zoom-4,$image.Width*$zoom,$image.Height*$zoom)
        $graphics.DrawImage($image,$target,0,0,$image.Width,$image.Height,[System.Drawing.GraphicsUnit]::Pixel)
      } finally { $image.Dispose() }
      $graphics.DrawString($entry.id,$font,[System.Drawing.Brushes]::Ivory,$x+4,$y+$cell+3)
    }
    $sheet.Save((Join-Path $outputRoot ('preview-'+$zoom+'x.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $font.Dispose(); $grass.Dispose(); $sheet.Dispose() }
}
Write-Output "Exported $($manifest.Count) players to $outputRoot"
