# Script PowerShell pour corriger tous les blocs JSON dans les fichiers de documentation
# Remplace { par {'{'} et } par {'}'} dans les balises <code>

$files = Get-ChildItem -Path "src\pages\docs" -Recurse -Filter "*.astro"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # Remplacer les accolades dans les balises <code> qui contiennent du JSON
    # Pattern: trouver <code> suivi de { et remplacer toutes les accolades jusqu'à </code>
    
    # Remplacer { par {'{'} et } par {'}'} dans les blocs <code>...</code>
    $content = $content -replace '(?s)(<code>)(.*?)(\{)(.*?)(\})(.*?)(</code>)', {
        param($match)
        $before = $match.Groups[2].Value
        $jsonContent = $match.Groups[4].Value
        $after = $match.Groups[6].Value
        
        # Échapper les accolades dans le contenu JSON
        $escapedJson = $jsonContent -replace '\{', "{'{'}" -replace '\}', "{'}'}"
        
        return $match.Groups[1].Value + $before + "{'{'}" + $escapedJson + "{'}'}" + $after + $match.Groups[7].Value
    }
    
    # Remplacer aussi les accolades simples dans les blocs <code>
    $content = $content -replace '(?s)(<code>[^<]*?)\{([^<]*?)\}([^<]*?</code>)', '$1{''{''}$2{''}''}$3'
    
    if ($content -ne $original) {
        Set-Content $file.FullName -Value $content -NoNewline
        Write-Host "Corrige: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`nTermine!" -ForegroundColor Cyan
