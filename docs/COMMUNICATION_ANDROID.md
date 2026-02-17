# 📡 Communication Android <-> Backend

## Vue d'ensemble

Ce document explique comment l'application Android communique avec le backend Rust et comment résoudre les problèmes de communication.

## Architecture de communication

L'application Android utilise Tauri pour communiquer avec le backend :

1. **Commande native-fetch** : Commande Tauri personnalisée qui contourne les limitations ACL
2. **Fallback plugin-http** : Si native-fetch échoue, utilisation du plugin HTTP de Tauri
3. **Retries automatiques** : Gestion des erreurs temporaires avec retries exponentiels

## Configuration requise

### 1. Patch AndroidManifest (OBLIGATOIRE)

Android bloque par défaut le trafic HTTP non chiffré (cleartext traffic) depuis Android 9. Le manifest doit être patché pour permettre les connexions HTTP.

**Application du patch :**

```bash
npm run patch:android
```

Le script `scripts/patch-android-manifest.js` ajoute automatiquement `android:usesCleartextTraffic="true"` dans le manifest.

**Note :** Le patch doit être appliqué après chaque build Android, avant la compilation finale.

### 2. Permissions réseau Tauri

Les permissions réseau sont configurées dans `src-tauri/capabilities/main.json`. Les plages d'IP suivantes sont autorisées :

- `localhost` / `127.0.0.1` : Pour développement local
- `10.0.2.2` : Adresse spéciale de l'émulateur Android pour accéder à localhost de l'hôte
- `10.*` : Toutes les IP privées de classe A (réseaux d'entreprise, VPN)
- `172.*` : Toutes les IP privées de classe B (Docker, certains VPN)
- `192.168.*` : Toutes les IP privées de classe C (réseaux locaux)

### 3. Configuration backend URL

L'URL du backend est détectée automatiquement :

- **Émulateur Android** : `http://10.0.2.2:3000` (par défaut)
- **Appareil physique** : `http://10.0.2.2:3000` ou IP locale configurée manuellement
- **Autres plateformes** : `http://127.0.0.1:3000`

L'URL peut être configurée manuellement dans les paramètres de l'application.

## Dépannage

### Problème : "Le backend n'est pas accessible"

**Causes possibles :**

1. **Backend non démarré**
   - Vérifiez que le serveur Rust est en cours d'exécution
   - Testez l'accès depuis un navigateur : `http://localhost:3000/api/client/health`

2. **URL backend incorrecte**
   - Sur émulateur : doit être `http://10.0.2.2:3000`
   - Sur appareil physique : doit être l'IP locale de la machine hôte (ex: `http://192.168.1.100:3000`)
   - Vérifiez dans les paramètres de l'application

3. **Cleartext traffic non activé**
   - Vérifiez que le patch AndroidManifest a été appliqué
   - Exécutez : `npm run patch:android`
   - Rebuild l'application

4. **Permissions réseau Tauri**
   - Vérifiez que l'IP du backend est dans les permissions (`src-tauri/capabilities/main.json`)
   - Les plages `10.*`, `172.*`, et `192.168.*` sont autorisées par défaut

5. **Firewall / Réseau**
   - Vérifiez que le port 3000 n'est pas bloqué par le firewall
   - Vérifiez que l'appareil Android et la machine hôte sont sur le même réseau

### Problème : "Command native-fetch not found"

**Solution :**

1. Vérifiez que la commande est bien enregistrée dans `src-tauri/src/lib.rs`
2. Vérifiez que les permissions sont correctes dans `src-tauri/permissions/custom-commands.toml`
3. Vérifiez que les capabilities incluent "custom-commands" dans `src-tauri/capabilities/main.json`
4. Rebuild l'application complètement

**Note :** Si native-fetch échoue, l'application utilise automatiquement plugin-http comme fallback.

### Problème : Timeout / Connexion lente

**Solutions :**

1. **Vérifier la latence réseau**
   - Utilisez `ping` depuis l'appareil Android vers l'IP du backend
   - Vérifiez que la connexion réseau est stable

2. **Augmenter le timeout**
   - Les timeouts sont configurés dans `server-api.ts`
   - Health checks : 5 secondes
   - Requêtes normales : 15 secondes
   - Requêtes longues (sync, torrents) : 30-60 secondes

3. **Vérifier les logs**
   - Utilisez `adb logcat` pour voir les logs Android
   - Cherchez les messages `[popcorn-debug]` pour diagnostiquer

## Tests de communication

### Test manuel

1. **Lancer l'application Android**
2. **Aller dans Settings > Diagnostics**
3. **Lancer les tests de diagnostic**
4. **Vérifier les résultats**

### Test automatisé

```powershell
npm run android:test:communication
```

Ce script :
- Installe l'APK si nécessaire
- Lance l'application
- Capture les logs
- Analyse les erreurs de communication

### Vérification backend

Testez directement depuis un terminal :

```bash
# Vérifier que le backend répond
curl http://localhost:3000/api/client/health

# Depuis l'émulateur Android (si adb est configuré)
adb shell curl http://10.0.2.2:3000/api/client/health
```

## Améliorations récentes

### Retries automatiques

L'application retente automatiquement les requêtes en cas d'erreur temporaire :
- Maximum 2 retries (3 tentatives au total)
- Délai exponentiel : 1s, 2s, 3s max
- Uniquement pour les erreurs récupérables (timeout, erreurs réseau, erreurs serveur 5xx)

### Messages d'erreur améliorés

Les messages d'erreur sont maintenant plus clairs :
- **Timeout** : "Le backend ne répond pas. Vérifiez que le serveur est démarré et accessible."
- **ConnectionError** : "Impossible de se connecter au backend. Vérifiez votre connexion réseau."
- **ServerError** : "Erreur serveur. Veuillez réessayer dans quelques instants."

### Health check amélioré

Le health check fournit maintenant :
- Statut de connexion (reachable / non reachable)
- Latence de la connexion
- Messages d'erreur détaillés

## Références

- [Documentation Tauri Android](https://tauri.app/v1/guides/building/android)
- [Android Network Security Config](https://developer.android.com/training/articles/security-config)
- [Jellyfin API Documentation](https://api.jellyfin.org/) (référence d'architecture)
