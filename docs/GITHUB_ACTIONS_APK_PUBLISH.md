# Publication des APK vers popcorn-web

## Configuration requise

Pour que le workflow `publish-apk-to-web.yml` fonctionne, vous devez configurer un **Personal Access Token (PAT)** GitHub avec les permissions nécessaires.

### 1. Créer un Personal Access Token

1. Allez sur GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Cliquez sur "Generate new token (classic)"
3. Donnez un nom au token (ex: "popcorn-web-publish")
4. Sélectionnez les permissions suivantes :
   - `repo` (accès complet aux repositories)
5. Cliquez sur "Generate token"
6. **Copiez le token immédiatement** (il ne sera plus visible après)

### 2. Ajouter le token comme secret GitHub

1. Dans le repository `popcorn-client`, allez dans Settings → Secrets and variables → Actions
2. Cliquez sur "New repository secret"
3. Nom : `POPCORN_WEB_TOKEN`
4. Valeur : Collez le token que vous avez créé
5. Cliquez sur "Add secret"

### 3. Vérifier les permissions du token

Le token doit avoir accès au repository `bobdivx/popcorn-web`. Si le repository est privé, assurez-vous que :
- Le token a la permission `repo` (accès complet)
- Le compte GitHub associé au token a accès au repository `bobdivx/popcorn-web`

## Fonctionnement du workflow

### Déclenchement

Le workflow se déclenche automatiquement après :
- La réussite du workflow "Build Android APK" (mobile)
- La réussite du workflow "Build Android TV APK" (TV)

Il peut aussi être déclenché manuellement depuis l'onglet Actions.

### Étapes du workflow

1. **Téléchargement des artifacts** : Récupère les APK depuis les workflows de build
2. **Vérification des signatures** : Vérifie que les APK sont signés (seuls les APK signés sont envoyés)
3. **Checkout du repo popcorn-web** : Clone le repository cible
4. **Copie des APK** : Copie les APK signés dans le dossier `apk/`
5. **Commit et push** : Commit et push les changements vers `bobdivx/popcorn-web`

### Filtrage des APK

**Seuls les APK signés sont envoyés.** Le workflow :
- Vérifie la signature de chaque APK avec `apksigner`
- Ignore les APK non signés ou avec une signature invalide
- N'envoie que les APK valides vers le repository

### Structure dans popcorn-web

Les APK sont placés dans :
```
popcorn-web/
  └── apk/
      ├── Popcorn_Mobile-v*.apk
      └── Popcorn_TV-v*.apk
```

## Dépannage

### Le workflow ne se déclenche pas

- Vérifiez que les workflows de build se terminent avec succès
- Vérifiez que le workflow `publish-apk-to-web.yml` est présent dans `.github/workflows/`

### Erreur "Permission denied" ou "Authentication failed"

- Vérifiez que le secret `POPCORN_WEB_TOKEN` est bien configuré
- Vérifiez que le token a les permissions `repo`
- Vérifiez que le token n'a pas expiré

### Aucun APK n'est envoyé

- Vérifiez que les APK sont bien signés dans les workflows de build
- Vérifiez les logs du workflow pour voir pourquoi les APK sont rejetés
- Vérifiez que les artifacts sont bien créés dans les workflows de build

### Les APK ne sont pas dans popcorn-web

- Vérifiez les logs du workflow pour voir si le commit/push a réussi
- Vérifiez que le repository `bobdivx/popcorn-web` existe et est accessible
- Vérifiez que la branche `main` ou `master` existe dans le repository cible

## Vérification manuelle

Pour vérifier manuellement qu'un APK est signé :

```bash
# Sur Linux/Mac
apksigner verify --print-certs app.apk

# Sur Windows (avec Android SDK)
apksigner verify --print-certs app.apk
```

Un APK signé devrait afficher des informations sur le certificat.
