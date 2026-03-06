# Script pour redimensionner le logo a 512x512px pour le Play Store

$sourcePath = "d:\Github\popcorn-client\public\popcorn_logo.png"
$outputPath = "d:\Github\popcorn-client\public\popcorn_logo_512x512.png"

try {
    # Charger l'image
    $img = [System.Drawing.Image]::FromFile($sourcePath)
    
    Write-Host "Dimensions actuelles: $($img.Width)x$($img.Height)"
    Write-Host "Format: $($img.PixelFormat)"
    
    # Creer une nouvelle image 512x512
    $newImg = New-Object System.Drawing.Bitmap(512, 512)
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)
    
    # Configuration haute qualite
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Dessiner l'image redimensionnee
    $graphics.DrawImage($img, 0, 0, 512, 512)
    
    # Sauvegarder en PNG
    $newImg.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Nettoyer
    $graphics.Dispose()
    $newImg.Dispose()
    $img.Dispose()
    
    # Verifier la taille du fichier
    $fileSize = (Get-Item $outputPath).Length / 1KB
    Write-Host ""
    Write-Host "Fichier cree: $outputPath"
    Write-Host "Dimensions: 512x512"
    Write-Host "Taille: $([math]::Round($fileSize, 2)) KB"
    
    if ($fileSize -gt 1024) {
        Write-Warning "ATTENTION: Le fichier depasse 1 Mo ($([math]::Round($fileSize / 1024, 2)) MB)"
    } else {
        Write-Host "OK - Fichier conforme aux exigences du Play Store (< 1 Mo)"
    }
    
} catch {
    Write-Error "Erreur: $($_.Exception.Message)"
    exit 1
}
