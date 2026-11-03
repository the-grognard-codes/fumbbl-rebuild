$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$batch = $PSScriptRoot
$players = @()
foreach ($direction in @('front45')) {
  $sheet = [System.Drawing.Bitmap]::new((Join-Path $batch "source/$direction-clean.png"))
  try {
    foreach ($row in 0..2) {
      $clip = @('idle','move','fall')[$row]
      foreach ($column in 0..3) {
        $id = "ogre-$direction-$clip-$column"
        $rect = [System.Drawing.Rectangle]::new(($column*362),($row*362),362,362)
        $frame = $sheet.Clone($rect,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try { $frame.Save((Join-Path $batch "source/$id.png"),[System.Drawing.Imaging.ImageFormat]::Png) } finally { $frame.Dispose() }
        $players += @{id=$id;role='ogre';gender='man';sizeClass='big';source="source/$id.png"}
      }
    }
  } finally { $sheet.Dispose() }
}
@{team='Human ogre animation proof';standardVersion='1.1';players=$players} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $batch 'roster.json') -Encoding UTF8
& "$batch/../../../../../../.agents/skills/team-pixel-sprites/scripts/export-sprites.ps1" -RosterPath "$batch/roster.json" -OutputDirectory "$batch/export-v2" -FitReferencePixels 362
