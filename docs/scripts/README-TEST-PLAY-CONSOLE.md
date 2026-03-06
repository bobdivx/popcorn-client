# Test des prérequis Play Console

Ce script permet de tester localement si tous les prérequis sont remplis avant d'uploader vers Google Play Console.

## Installation des dépendances

### Sur Linux/Mac

```bash
# Installer Python 3 si nécessaire
python3 --version

# Installer les dépendances Python
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

### Sur Windows

```powershell
# Installer Python 3 si nécessaire
python --version

# Installer les dépendances Python
pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
```

## Utilisation

### Sur Linux/Mac

```bash
# Rendre le script exécutable (première fois seulement)
chmod +x scripts/test-play-console-api.sh

# Exécuter le test
./scripts/test-play-console-api.sh \
  "./artifacts/Popcorn-v1.0.66.aab" \
  "$GOOGLE_SERVICE_ACCOUNT_JSON" \
  "com.popcorn.client.mobile"
```

### Sur Windows (PowerShell)

```powershell
# Utiliser bash (Git Bash, WSL, ou Git pour Windows)
bash scripts/test-play-console-api.sh `
  "./artifacts/Popcorn-v1.0.66.aab" `
  "$env:GOOGLE_SERVICE_ACCOUNT_JSON" `
  "com.popcorn.client.mobile"
```

### Avec le script PowerShell (alternative)

```powershell
.\scripts\test-play-console-upload.ps1 `
  -AabPath "./artifacts/Popcorn-v1.0.66.aab" `
  -ServiceAccountJson $env:GOOGLE_SERVICE_ACCOUNT_JSON `
  -PackageName "com.popcorn.client.mobile"
```

## Ce que le script teste

1. **Existence de l'application** : Vérifie si l'application existe dans Play Console avec le package name exact
2. **Permissions du service account** : Vérifie si le service account a les permissions nécessaires
3. **Versions existantes** : Liste les versions déjà présentes dans le track "internal"

## Résultats

- ✅ **Succès** : Tous les tests passent, vous pouvez procéder à l'upload
- ❌ **Échec** : Le script indique exactement ce qui manque et comment le corriger

## Exemples d'erreurs et solutions

### Erreur : "L'application n'existe pas"

**Solution** :
1. Allez sur https://play.google.com/console
2. Créez une nouvelle application
3. Utilisez le package name exact : `com.popcorn.client.mobile`
4. Complétez les métadonnées minimales (nom, description, icône)

### Erreur : "Permissions insuffisantes"

**Solution** :
1. Dans Play Console : Paramètres → Accès et autorisations
2. Ajoutez le service account : `github-play-publisher@ma-prusa.iam.gserviceaccount.com`
3. Donnez la permission : "Gérer les versions de test (bêta, alpha, interne)"

## Intégration dans le workflow

Le script est automatiquement exécuté dans le workflow GitHub Actions avant l'upload. Si les tests échouent, le workflow s'arrête avec un message d'erreur clair indiquant ce qui doit être corrigé.
