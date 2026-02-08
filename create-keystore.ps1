# Script pour créer le keystore Android
# Usage: .\create-keystore.ps1

# Trouver Java
$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\keytool.exe"))) {
    # Chercher dans les emplacements communs (prioriser JDK 17+)
    $possiblePaths = @(
        "C:\Program Files\Java\jdk-*",
        "C:\Program Files\Eclipse Adoptium\jdk-*",
        "C:\Program Files\Microsoft\jdk-*",
        "C:\Program Files\Amazon Corretto\*",
        "C:\Program Files (x86)\Java\jdk-*"
    )
    
    $foundJdk = $null
    foreach ($path in $possiblePaths) {
        $jdks = Get-ChildItem -Path $path -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer }
        if ($jdks) {
            # Prioriser JDK 17+
            $jdk17Plus = $jdks | Where-Object { $_.Name -match "jdk-1[7-9]|jdk-[2-9][0-9]" } | Sort-Object Name -Descending | Select-Object -First 1
            if ($jdk17Plus) {
                $foundJdk = $jdk17Plus.FullName
                break
            }
            # Sinon prendre le plus récent
            $foundJdk = ($jdks | Sort-Object Name -Descending | Select-Object -First 1).FullName
            break
        }
    }
    
    if ($foundJdk) {
        $javaHome = $foundJdk
    } elseif (-not $javaHome) {
        # Si toujours pas trouvé, essayer de trouver java dans PATH
        $javaCmd = Get-Command java -ErrorAction SilentlyContinue
        if ($javaCmd) {
            $javaPath = Split-Path (Split-Path $javaCmd.Source)
            if (Test-Path (Join-Path $javaPath "bin\keytool.exe")) {
                $javaHome = $javaPath
            }
        }
    }
}

# Si toujours pas trouvé, utiliser le Java Oracle trouvé précédemment
if (-not $javaHome) {
    $oracleJava = "C:\Program Files (x86)\Common Files\Oracle\Java"
    if (Test-Path (Join-Path $oracleJava "bin\keytool.exe")) {
        $javaHome = $oracleJava
        Write-Host "[INFO] Utilisation de Java Oracle trouve: $javaHome"
    } else {
        Write-Host "[ERREUR] Java/JDK non trouve."
        Write-Host ""
        Write-Host "Options:"
        Write-Host "1. Installez Java JDK 17+ depuis: https://adoptium.net/"
        Write-Host "2. Ou specifiez JAVA_HOME manuellement:"
        Write-Host "   `$env:JAVA_HOME = 'C:\chemin\vers\jdk'"
        Write-Host "   .\create-keystore.ps1"
        exit 1
    }
}

$keytool = Join-Path $javaHome "bin\keytool.exe"

if (-not (Test-Path $keytool)) {
    Write-Host "[ERREUR] keytool introuvable dans: $keytool"
    Write-Host "   JAVA_HOME: $javaHome"
    exit 1
}

Write-Host "[OK] Java trouve: $javaHome"
Write-Host "[OK] keytool trouve: $keytool"
Write-Host ""

# Creer le keystore
$keystorePath = "popcorn-release.jks"
$password = "Qs-T++l646464"
$alias = "popcorn-key"

Write-Host "Creation du keystore: $keystorePath"
Write-Host "   Alias: $alias"
Write-Host "   Mot de passe: $password"
Write-Host ""

& $keytool -genkeypair -v `
    -keystore $keystorePath `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $password `
    -keypass $password `
    -dname "CN=Popcorn, OU=Development, O=Popcorn, L=Unknown, ST=Unknown, C=FR"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Keystore cree avec succes: $keystorePath"
    Write-Host ""
    Write-Host "Encodage en base64..."
    
    # Encoder en base64
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $keystorePath))
    $base64 = [Convert]::ToBase64String($bytes)
    
    # Sauvegarder dans un fichier
    $base64File = "keystore-base64.txt"
    $base64 | Out-File -FilePath $base64File -Encoding utf8 -NoNewline
    
    Write-Host "[OK] Base64 sauvegarde dans: $base64File"
    Write-Host ""
    Write-Host "Valeurs a mettre dans GitHub Secrets (repo popcorn-client):"
    Write-Host "   ANDROID_KEYSTORE_BASE64 = (contenu de $base64File)"
    Write-Host "   ANDROID_KEYSTORE_PASSWORD = $password"
    Write-Host "   ANDROID_KEY_PASSWORD = $password"
    Write-Host "   ANDROID_KEY_ALIAS = $alias"
    Write-Host ""
    Write-Host "[ATTENTION] Ne commitez JAMAIS popcorn-release.jks ou keystore-base64.txt dans Git!"
} else {
    Write-Host "[ERREUR] Erreur lors de la creation du keystore"
    exit 1
}
