
Description courte
Popcorn vous permet de trouver, organiser et regarder vos contenus en quelques secondes grâce à des indexeurs configurables et une interface simple à prendre en main.

Description détaillée
Popcorn est une application de lecture et d’agrégation de contenus pensée pour les passionnés de séries, de films et d’anime. Configurez vos propres indexeurs, parcourez un catalogue unifié et lancez la lecture instantanément avec un lecteur moderne, fluide et sans publicité. Vos réglages (indexeurs, préférences de lecture, langue, thèmes, etc.) sont synchronisés dans le cloud pour retrouver la même expérience sur tous vos appareils, mobile comme TV. Popcorn met l’accent sur les performances, la confidentialité et la transparence : aucune donnée n’est partagée avec des tiers, tout le trafic est chiffré, et vous gardez le contrôle complet sur vos sources et votre bibliothèque.



# Guide de Publication sur Google Play Store

Ce guide explique comment préparer et publier les applications Android Popcorn (Mobile et TV) sur le Google Play Store.

## Prérequis

- Compte développeur Google Play (frais d'inscription unique de 25$)
- Keystore de production pour signer les applications
- Accès aux pages légales hébergées sur popcorn-web :
  - Politique de Confidentialité : `https://votre-domaine.com/privacy-policy`
  - Conditions d'Utilisation : `https://votre-domaine.com/terms-of-service`
  - Suppression de Compte : `https://votre-domaine.com/account-deletion`

## 1. Création du Keystore de Production

**⚠️ IMPORTANT** : Le keystore de production est essentiel. Perdre ce keystore signifie que vous ne pourrez plus mettre à jour votre application sur le Play Store. Sauvegardez-le dans un endroit sûr et sécurisé.

### 1.1 Créer le keystore

```powershell
# Naviguer vers le répertoire du projet Android
cd src-tauri\gen\android

# Créer le keystore (remplacez les valeurs par vos informations)
keytool -genkeypair -v -storetype PKCS12 -keystore keystore.jks -alias popcorn-key -keyalg RSA -keysize 2048 -validity 10000

# Vous serez invité à saisir :
# - Mot de passe du keystore (notez-le dans un gestionnaire de mots de passe)
# - Informations sur votre organisation
# - Mot de passe de la clé (peut être le même que le keystore)
```

### 1.2 Configurer keystore.properties

Créez un fichier `keystore.properties` dans `src-tauri\gen\android\` :

```properties
storeFile=keystore.jks
storePassword=VOTRE_MOT_DE_PASSE_KEYSTORE
keyAlias=popcorn-key
keyPassword=VOTRE_MOT_DE_PASSE_CLE
```

**⚠️ SÉCURITÉ** : 
- Ne commitez JAMAIS `keystore.jks` ou `keystore.properties` dans Git
- Ajoutez-les au `.gitignore`
- Stockez-les dans un gestionnaire de secrets (1Password, Bitwarden, etc.)

### 1.3 Sauvegarde du keystore

1. Copiez `keystore.jks` dans un emplacement sécurisé (disque externe, cloud chiffré)
2. Notez les mots de passe dans un gestionnaire de mots de passe
3. Créez plusieurs copies de sauvegarde dans différents emplacements

## 2. Génération des Android App Bundles (AAB)

Le Play Store exige des AAB (Android App Bundle) depuis août 2021. Les APK ne sont plus acceptés pour les nouvelles applications.

### 2.1 Générer un AAB pour Mobile

```powershell
# Depuis la racine du projet popcorn-client
npm run android:build:aab:mobile
```

### 2.2 Générer un AAB pour TV

```powershell
npm run android:build:aab:tv
```

### 2.3 Générer les deux variantes

```powershell
# Générer Mobile
npm run android:build:aab:mobile

# Générer TV
npm run android:build:aab:tv
```

### 2.4 Emplacement des fichiers générés

Les AAB signés seront copiés dans :
- `popcorn-web/app/Popcorn_Mobile-vX.X.X.aab`
- `popcorn-web/app/Popcorn_TV-vX.X.X.aab`

Les fichiers sont également disponibles dans :
- `src-tauri/gen/android/app/build/outputs/bundle/arm64Release/`

## 3. Vérification des AAB

### 3.1 Vérifier la signature

```powershell
# Vérifier la signature d'un AAB
jarsigner -verify -certs "chemin/vers/votre-app.aab"
```

### 3.2 Vérifier avec bundletool (optionnel)

Si vous avez installé `bundletool` :

```powershell
# Télécharger bundletool depuis : https://github.com/google/bundletool/releases
bundletool validate --bundle="chemin/vers/votre-app.aab"
```

## 4. Préparation du Play Console

### 4.1 Créer les applications

1. Connectez-vous à [Google Play Console](https://play.google.com/console)
2. Créez deux applications séparées :
   - **Popcorn Mobile** (package: `com.popcorn.client.mobile`)
   - **Popcorn TV** (package: `com.popcorn.client.tv`)

### 4.2 Informations requises pour chaque application

#### Informations de base
- **Nom de l'application** : Popcorn Mobile / Popcorn TV
- **Description courte** (80 caractères max)
- **Description complète** (4000 caractères max)
- **Icône** : 512x512 px (PNG, 32 bits)
- **Capture d'écran** : Au moins 2, jusqu'à 8 (minimum 320px de hauteur)
- **Bannière** (pour TV) : 1280x720 px

#### Informations de contenu
- **Catégorie** : Utilitaires / Divertissement
- **Classification du contenu** : Compléter le questionnaire
- **Public cible** : Adultes / Famille

#### Politique et confidentialité
- **Politique de confidentialité** : URL vers `https://votre-domaine.com/privacy-policy`
- **Politique de suppression de compte** : URL vers `https://votre-domaine.com/account-deletion`

### 4.3 Déclaration de sécurité des données

Dans la section "Sécurité des données" du Play Console, déclarez :

1. **Types de données collectées** :
   - Identifiants (email, nom d'utilisateur)
   - Données de configuration (indexers, préférences)
   - Données d'authentification (tokens JWT)

2. **Utilisation des données** :
   - Authentification
   - Synchronisation cloud
   - Amélioration du service

3. **Partage des données** :
   - Aucun partage avec des tiers

4. **Sécurité** :
   - Chiffrement en transit (HTTPS)
   - Chiffrement au repos
   - Authentification sécurisée (JWT)

## 5. Upload des AAB

### 5.1 Créer une version de production

1. Dans Play Console, allez dans **Production** > **Créer une version**
2. Cliquez sur **Créer une nouvelle version**
3. Téléversez votre fichier AAB (.aab)
4. Remplissez les notes de version (obligatoire pour la première publication)

### 5.2 Notes de version

Exemple pour la première version :

```
Première version de Popcorn Mobile

Nouvelles fonctionnalités :
- Streaming de contenus via indexers de torrents
- Synchronisation cloud de la configuration
- Interface moderne et intuitive
- Support multi-indexers
- Authentification sécurisée
```

### 5.3 Soumettre pour révision

1. Vérifiez que toutes les sections sont complètes (icônes, captures, descriptions)
2. Vérifiez que les politiques de confidentialité sont accessibles
3. Cliquez sur **Soumettre pour révision**

## 6. Processus de révision

### 6.1 Délais

- **Première publication** : 1-7 jours
- **Mises à jour** : Quelques heures à 2 jours

### 6.2 Points de contrôle courants

Google vérifie :
- ✅ Conformité aux politiques de contenu
- ✅ Politique de confidentialité accessible et complète
- ✅ Fonctionnalités de l'application
- ✅ Sécurité et permissions
- ✅ Classification du contenu

### 6.3 En cas de rejet

Si votre application est rejetée :
1. Lisez attentivement le message de rejet
2. Corrigez les problèmes identifiés
3. Soumettez à nouveau avec une nouvelle version

## 7. Mises à jour futures

### 7.1 Incrémenter la version

Avant chaque build, le script incrémente automatiquement :
- `version` dans `tauri.android.mobile.conf.json` ou `tauri.android.conf.json`
- `versionCode` (numéro de build)

### 7.2 Générer une nouvelle version

```powershell
# Pour Mobile
npm run android:build:aab:mobile

# Pour TV
npm run android:build:aab:tv
```

### 7.3 Uploader la mise à jour

1. Dans Play Console, créez une nouvelle version
2. Téléversez le nouveau AAB
3. Ajoutez les notes de version
4. Soumettez pour révision

**⚠️ IMPORTANT** : Utilisez toujours le même keystore pour signer les mises à jour. Un keystore différent empêchera la mise à jour.

## 8. URLs des pages légales

Assurez-vous que ces URLs sont accessibles publiquement (pas derrière authentification) :

- **Politique de Confidentialité** : `https://votre-domaine.com/privacy-policy`
- **Conditions d'Utilisation** : `https://votre-domaine.com/terms-of-service`
- **Suppression de Compte** : `https://votre-domaine.com/account-deletion`

Remplacez `votre-domaine.com` par votre domaine réel (ex: `popcorn.example.com`).

## 9. Checklist avant publication

### Application
- [ ] AAB généré et signé avec le keystore de production
- [ ] Version et versionCode correctement incrémentés
- [ ] Application testée sur différents appareils
- [ ] Aucune erreur de build

### Play Console
- [ ] Application créée dans Play Console
- [ ] Informations de base complétées (nom, description, icône)
- [ ] Captures d'écran ajoutées (minimum 2)
- [ ] Politique de confidentialité URL configurée
- [ ] Déclaration de sécurité des données complétée
- [ ] Classification du contenu complétée
- [ ] Notes de version rédigées

### Pages légales
- [ ] Politique de confidentialité accessible publiquement
- [ ] Conditions d'utilisation accessibles publiquement
- [ ] Page de suppression de compte accessible publiquement
- [ ] Toutes les pages sont responsive et lisibles

### Sécurité
- [ ] Keystore de production créé et sauvegardé
- [ ] `keystore.properties` configuré (non commité dans Git)
- [ ] Mots de passe stockés dans un gestionnaire de secrets
- [ ] Plusieurs copies de sauvegarde du keystore

## 10. Commandes rapides

```powershell
# Build AAB Mobile
npm run android:build:aab:mobile

# Build AAB TV
npm run android:build:aab:tv

# Vérifier la signature d'un AAB
jarsigner -verify -certs "chemin/vers/app.aab"
```

## 11. Support et ressources

- [Documentation Google Play Console](https://support.google.com/googleplay/android-developer)
- [Guide de publication Android](https://developer.android.com/distribute/googleplay/start)
- [Politiques Google Play](https://play.google.com/about/developer-content-policy/)
- [Guide de sécurité des données](https://developer.android.com/privacy-and-security/declare-data-use)

## 12. Dépannage

### Erreur : "AAB non signé"
- Vérifiez que `keystore.properties` est correctement configuré
- Vérifiez que le keystore existe dans `src-tauri/gen/android/`
- Vérifiez les mots de passe dans `keystore.properties`

### Erreur : "Keystore introuvable"
- Assurez-vous que le keystore est dans `src-tauri/gen/android/keystore.jks`
- Vérifiez le chemin dans `keystore.properties` (relatif au répertoire Android)

### Erreur : "Signature invalide"
- Vérifiez que vous utilisez le même keystore que pour les versions précédentes
- Vérifiez les mots de passe dans `keystore.properties`

### AAB trop volumineux
- Les AAB sont optimisés automatiquement par Google Play
- La taille maximale est de 150 MB (hors extensions)
- Utilisez des App Bundle Features si nécessaire

---

**Note** : Ce guide est spécifique à Popcorn. Adaptez les noms de packages et les URLs selon votre configuration.
