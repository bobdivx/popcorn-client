# Changelog - Conversion en Client Léger Pur

## ✅ Modifications effectuées

### 1. Suppression du code serveur

- ❌ Supprimé `src/lib/db/turso.ts` (base de données serveur)
- ❌ Supprimé `src/lib/auth/jwt.ts` (authentification serveur)
- ❌ Supprimé `src/lib/auth/middleware.ts` (middleware serveur)
- ❌ Supprimé `src/lib/auth/password.ts` (hachage serveur)
- ❌ Supprimé `src/api-routes-backup/` (routes API serveur)

### 2. Nettoyage des dépendances

**Supprimées** :
- `@libsql/client` (base de données)
- `bcryptjs` (hachage serveur)
- `jsonwebtoken` (JWT serveur)
- `@types/jsonwebtoken`
- `@types/bcryptjs`
- `zod` (validation serveur)

**Conservées** :
- `@astrojs/preact` (UI)
- `@astrojs/tailwind` (styles)
- `preact` (composants)
- `daisyui` (UI)
- `tailwindcss` (styles)
- `@astrojs/vercel` (déploiement web uniquement, pas pour Tauri)

### 3. Correction des composants

- ✅ `LoginForm.tsx` : Utilise maintenant `serverApi.login()`
- ✅ `RegisterForm.tsx` : Utilise maintenant `serverApi.register()`
- ✅ `server-api.ts` : Ajout de la méthode `register()`

### 4. Configuration Astro

- ✅ `astro.config.mjs` : Configuration conditionnelle
  - Mode `static` pour Tauri (client léger)
  - Mode `server` pour Vercel (déploiement web)
  - Adapter Vercel uniquement si ce n'est pas un build Tauri

### 5. Documentation

- ✅ `README.md` : Documentation complète mise à jour
- ✅ `README-ENV.md` : Guide de configuration des variables d'environnement
- ✅ `CHANGELOG-CLIENT-ONLY.md` : Ce fichier

## 🎯 Résultat

Le projet `popcorn-vercel` est maintenant un **client léger pur** qui :

- ✅ Se connecte uniquement au serveur Popcorn distant
- ✅ N'a aucune dépendance serveur
- ✅ Ne nécessite pas Docker
- ✅ Fonctionne en mode static pour Tauri
- ✅ Peut être déployé sur Vercel pour le web

## 📝 Notes importantes

- **Connexion serveur requise** : L'application doit se connecter au serveur `popcorn` distant
- **Configuration** : Définir `PUBLIC_SERVER_URL` dans `.env` ou via l'interface
- **Port par défaut** : Le serveur Popcorn utilise le port `8080` par défaut
