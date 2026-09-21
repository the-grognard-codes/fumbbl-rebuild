$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives,System.Runtime,System.ComponentModel.Primitives,System.Private.Windows.GdiPlus,System.Private.Windows.Core -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class SpriteExport {
  public static Rectangle Bounds(Bitmap image) {
    int l=image.Width, t=image.Height, r=-1, b=-1;
    for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
      if(image.GetPixel(x,y).A==0) continue;
      l=Math.Min(l,x); t=Math.Min(t,y); r=Math.Max(r,x); b=Math.Max(b,y);
    }
    if(r<0) throw new Exception("Empty sprite");
    return Rectangle.FromLTRB(l,t,r+1,b+1);
  }
  public static void Export(string source,string target,int canvas,int maxSize) {
    using(var input=new Bitmap(source)) {
      Rectangle crop=Bounds(input);
      double scale=Math.Min((double)maxSize/crop.Width,(double)maxSize/crop.Height);
      int w=Math.Max(1,(int)Math.Round(crop.Width*scale));
      int h=Math.Max(1,(int)Math.Round(crop.Height*scale));
      using(var output=new Bitmap(canvas,canvas,PixelFormat.Format32bppArgb)) {
        using(var g=Graphics.FromImage(output)) {
          g.Clear(Color.Transparent);
          g.InterpolationMode=InterpolationMode.HighQualityBicubic;
          g.PixelOffsetMode=PixelOffsetMode.HighQuality;
          g.CompositingQuality=CompositingQuality.HighQuality;
          g.DrawImage(input,new Rectangle((canvas-w)/2,canvas-h-1,w,h),crop,GraphicsUnit.Pixel);
        }
        output.Save(target,ImageFormat.Png);
      }
    }
  }
  public static void Preview(string[] paths,string[] labels,string target) {
    using(var output=new Bitmap(1000,1140)) using(var g=Graphics.FromImage(output))
    using(var title=new Font("Segoe UI",24,FontStyle.Bold))
    using(var label=new Font("Segoe UI",11))
    using(var sub=new Font("Segoe UI",12))
    using(var ink=new SolidBrush(Color.FromArgb(246,233,208)))
    using(var tile=new SolidBrush(Color.FromArgb(66,78,46)))
    using(var border=new Pen(Color.FromArgb(117,129,91))) {
      g.Clear(Color.FromArgb(23,30,40));
      g.DrawString("HUMANS / SAMPLE TEAM 01",title,ink,24,16);
      g.DrawString("16 unique players - 6x pixel preview - blue / ivory",sub,ink,26,58);
      for(int i=0;i<paths.Length;i++) {
        int x=24+(i%4)*244, y=106+(i/4)*254;
        g.FillRectangle(tile,x,y+30,216,216); g.DrawRectangle(border,x,y+30,216,216);
        using(var image=new Bitmap(paths[i])) {
          g.InterpolationMode=InterpolationMode.NearestNeighbor;
          g.PixelOffsetMode=PixelOffsetMode.Half;
          int w=image.Width*6,h=image.Height*6;
          g.DrawImage(image,new Rectangle(x+(216-w)/2,y+30+216-h,w,h),0,0,image.Width,image.Height,GraphicsUnit.Pixel);
        }
        g.DrawString(labels[i],label,ink,x,y+248);
      }
      output.Save(target,ImageFormat.Png);
    }
  }
}
'@
$assetRoot = $PSScriptRoot
$sourceEntries = Get-Content -LiteralPath (Join-Path $assetRoot 'sources.json') -Raw | ConvertFrom-Json
$originalDir = Join-Path $assetRoot 'originals'
$spriteDir = Join-Path $assetRoot 'sprites'
New-Item -ItemType Directory -Force -Path $originalDir,$spriteDir | Out-Null
$manifest = @()
$paths = @()
$labels = @()
foreach ($entry in $sourceEntries) {
  $original = Join-Path $originalDir ($entry.id + '.png')
  if (!(Test-Path -LiteralPath $original)) { Copy-Item -LiteralPath $entry.source -Destination $original }
  $canvas = 36
  $maxSize = 34
  if ($entry.id -like '*ogre*') { $canvas = 45; $maxSize = 43 }
  if ($entry.id -like '*halfling*') { $maxSize = 25 }
  $target = Join-Path $spriteDir ($entry.id + '.png')
  [SpriteExport]::Export($original,$target,$canvas,$maxSize)
  $check = [System.Drawing.Bitmap]::new($target)
  $bounds = [SpriteExport]::Bounds($check)
  if ($check.Width -ne $canvas -or $check.Height -ne $canvas) { throw "Invalid dimensions: $target" }
  if ($check.GetPixel(0,0).A -ne 0) { throw "Opaque corner: $target" }
  $check.Dispose()
  $manifest += [pscustomobject]@{id=$entry.id; file=('sprites/'+$entry.id+'.png'); width=$canvas; height=$canvas; tileWidth=36; tileHeight=36; anchor='bottom-center'; bounds=@{x=$bounds.X;y=$bounds.Y;width=$bounds.Width;height=$bounds.Height}}
  $paths += $target
  $labels += $entry.id.Replace('-',' ')
}
if ($manifest.Count -ne 16) { throw 'Expected 16 sprites' }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $assetRoot 'manifest.json') -Encoding UTF8
[SpriteExport]::Preview([string[]]$paths,[string[]]$labels,(Join-Path $assetRoot 'team-preview.png'))
$manifest | Select-Object id,width,height | Format-Table
