param([string]$OutputRoot = (Join-Path $PSScriptRoot '../../../characters'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('LumaAtlas' -as [type])) {
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
public static class LumaAtlas {
  public static void Build(string input, string output, string preview) {
    using (var source = new Bitmap(input))
    using (var atlas = new Bitmap(1536,3072,PixelFormat.Format32bppArgb)) {
      if(source.Width!=1678 || source.Height!=937 || source.GetPixel(0,0).A!=0)
        throw new Exception("Expected transparent 1678x937 source");
      var data=source.LockBits(new Rectangle(0,0,1678,937),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
      var pixels=new byte[data.Stride*937]; Marshal.Copy(data.Scan0,pixels,0,pixels.Length);
      int stride=data.Stride; source.UnlockBits(data);
      using(var ag=Graphics.FromImage(atlas)) {
        ag.CompositingMode=CompositingMode.SourceCopy;
        for(int frame=0;frame<34;frame++) {
          int sx=frame>=17?949:250; double breath=(frame%17)/16.0;
          using(var warped=new Bitmap(480,937,PixelFormat.Format32bppArgb)) {
            var wd=warped.LockBits(new Rectangle(0,0,480,937),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
            var dest=new byte[wd.Stride*937];
            for(int y=0;y<937;y++) {
              double sy=y;
              if(y>=380 && y<650) sy+=4*breath*Math.Pow(Math.Sin(Math.PI*(y-380+.5)/270),2);
              int y0=(int)sy,y1=Math.Min(936,y0+1);double f=sy-y0;
              for(int x=0;x<480;x++) {
                int a=y0*stride+(x+sx)*4,b=y1*stride+(x+sx)*4,d=y*wd.Stride+x*4;
                double alpha=pixels[a+3]*(1-f)+pixels[b+3]*f;
                dest[d+3]=(byte)Math.Round(alpha);
                // Interpolate premultiplied color to avoid dark transparent edges.
                for(int c=0;c<3;c++) dest[d+c]=alpha==0?(byte)0:(byte)Math.Round(
                  (pixels[a+c]*pixels[a+3]*(1-f)+pixels[b+c]*pixels[b+3]*f)/alpha);
              }
            }
            Marshal.Copy(dest,0,wd.Scan0,dest.Length);warped.UnlockBits(wd);
            using(var tile=new Bitmap(256,512,PixelFormat.Format32bppArgb)) {
              using(var g=Graphics.FromImage(tile)) {
                g.CompositingMode=CompositingMode.SourceCopy;
                g.InterpolationMode=InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode=PixelOffsetMode.HighQuality;
                // Same aspect ratio as the approved preview, with safe transparent margins.
                g.DrawImage(warped,new RectangleF(0,6,256,499.7333f),new RectangleF(0,0,480,937),GraphicsUnit.Pixel);
              }
              ag.DrawImageUnscaled(tile,(frame%6)*256,(frame/6)*512);
              if(frame==0)tile.Save(preview,ImageFormat.Png);
            }
          }
        }
      }
      atlas.Save(output,ImageFormat.Png);
    }
  }
}
'@
}
$out = [System.IO.Path]::GetFullPath((Join-Path $OutputRoot 'People/luma'))
New-Item -ItemType Directory -Force $out | Out-Null
[LumaAtlas]::Build((Join-Path $PSScriptRoot 'source.png'),(Join-Path $out 'sprites.png'),(Join-Path $PSScriptRoot 'preview.png'))
# Four breaths (4 s) and five blinks (3.2 s) meet at a seamless 16 s loop.
# Add exact blink boundaries to the 50 ms sampling grid to retain the 140 ms blink.
$times = [System.Collections.Generic.SortedSet[int]]::new()
for($t=0;$t -le 16000;$t+=50){[void]$times.Add($t)}
for($i=0;$i -lt 5;$i++){[void]$times.Add($i*3200+2580);[void]$times.Add($i*3200+2720)}
$ordered=@($times);$indices=@();$durations=@()
for($i=0;$i -lt $ordered.Count-1;$i++) {
  $t=$ordered[$i];$phase=($t%4000)/4000.0
  $breath=if($phase -lt .4){.5-.5*[Math]::Cos([Math]::PI*$phase/.4)}else{.5+.5*[Math]::Cos([Math]::PI*($phase-.4)/.6)}
  $frame=[int][Math]::Round(16*$breath)
  if(($t%3200) -ge 2580 -and ($t%3200) -lt 2720){$frame+=17}
  $duration=$ordered[$i+1]-$t
  if($indices.Count -gt 0 -and $indices[-1] -eq $frame){$durations[-1]+=$duration}
  else{$indices+= $frame;$durations+= $duration}
}
$pack=[ordered]@{
  format='mascotte-pack/1';id='luma';name='Luma';author='Mascotte';sheet='sprites.png'
  frame=@{width=256;height=512};pixelRatio=8;scale=3;bubble=@{x=128;y=20}
  animations=@{idle=@{row=0;frames=@($indices | ForEach-Object {$_%6});frameRows=@($indices | ForEach-Object {[int][Math]::Floor($_/6)});fps=20;durations=$durations;loop=$true}}
}
[System.IO.File]::WriteAllText((Join-Path $out 'character.json'),($pack|ConvertTo-Json -Depth 8)+[Environment]::NewLine,[System.Text.UTF8Encoding]::new($false))
Write-Output "Luma: 34 tiles, $($indices.Count) scheduled frames, 16000 ms, transparent 256x512; default display 96x192."
