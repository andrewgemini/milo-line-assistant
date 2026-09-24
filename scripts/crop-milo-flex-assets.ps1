param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Add-Type -AssemblyName System.Drawing

$sourceHome = Join-Path $Root "client/public/milo-flex/source/home-reference.png"
$sourceBoard = Join-Path $Root "client/public/milo-flex/source/flex-theme-board.png"
$screensDir = Join-Path $Root "client/public/milo-flex/screens"
$heroesDir = Join-Path $Root "client/public/milo-flex/heroes"
New-Item -ItemType Directory -Force -Path $screensDir, $heroesDir | Out-Null

function Save-Crop {
  param(
    [string]$Source,
    [string]$Destination,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )
  $image = [System.Drawing.Image]::FromFile($Source)
  try {
    $rect = New-Object System.Drawing.Rectangle($X, $Y, $Width, $Height)
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($image, (New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
      }
      finally { $graphics.Dispose() }
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally { $bitmap.Dispose() }
  }
  finally { $image.Dispose() }
}

Copy-Item -Force $sourceHome (Join-Path $screensDir "home.png")
Save-Crop $sourceHome (Join-Path $heroesDir "home.png") 0 0 941 470

$screenCrops = @(
  @{ Name="menu"; X=320; Y=300; W=233; H=442 },
  @{ Name="save-complete"; X=590; Y=300; W=238; H=442 },
  @{ Name="summary-day"; X=865; Y=300; W=249; H=442 },
  @{ Name="summary-period"; X=1150; Y=300; W=263; H=442 },
  @{ Name="analysis-budget"; X=34; Y=836; W=391; H=248 },
  @{ Name="transactions"; X=454; Y=836; W=307; H=248 },
  @{ Name="utility"; X=795; Y=836; W=299; H=248 },
  @{ Name="settings-help"; X=1138; Y=836; W=265; H=248 }
)

foreach ($crop in $screenCrops) {
  Save-Crop $sourceBoard (Join-Path $screensDir ($crop.Name + ".png")) $crop.X $crop.Y $crop.W $crop.H
}

$heroCrops = @(
  @{ Name="menu"; X=320; Y=300; W=233; H=125 },
  @{ Name="save-complete"; X=590; Y=330; W=238; H=125 },
  @{ Name="summary-day"; X=865; Y=300; W=249; H=82 },
  @{ Name="summary-period"; X=1150; Y=300; W=263; H=62 },
  @{ Name="analysis-budget"; X=34; Y=836; W=391; H=68 },
  @{ Name="transactions"; X=454; Y=836; W=307; H=62 },
  @{ Name="utility"; X=795; Y=836; W=299; H=92 },
  @{ Name="settings-help"; X=1138; Y=836; W=265; H=78 }
)

foreach ($crop in $heroCrops) {
  Save-Crop $sourceBoard (Join-Path $heroesDir ($crop.Name + ".png")) $crop.X $crop.Y $crop.W $crop.H
}

Get-ChildItem $screensDir, $heroesDir -File | Sort-Object FullName | Select-Object FullName, Length
