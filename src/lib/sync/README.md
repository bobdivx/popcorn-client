# Sync instance ↔ cloud

Logique de synchronisation entre l’instance locale (backend + préférences) et le cloud (popcorn-web).  
**Un module par type** pour garder la logique claire et réutilisable.

## Modules (cloud → instance)

| Fichier | Type | Description |
|--------|------|-------------|
| `indexers.ts` | indexers | Applique les indexers cloud vers le backend (évite les doublons). |
| `tmdb.ts` | tmdb | Clé API TMDB (jamais de clé masquée). |
| `categories.ts` | categories | Catégories d’indexers (à appeler après indexers). |
| `download-location.ts` | downloadLocation | Emplacement de téléchargement (préférences locales). |
| `sync-settings.ts` | syncSettings | Paramètres de synchronisation (backend Rust). |
| `language.ts` | language | Langue de l’interface (préférences locales). |

## Utilisation

- **Import global** (wizard / après login) : `runAllFromCloud({ config, onProgress, onDoneIncrement })` dans `cloud-import.ts`.
- **Import ciblé** : importer et appeler `applyIndexersFromCloud`, `applyTmdbFromCloud`, etc.

## Sauvegarde vers le cloud

Pour ne pas écraser la config cloud avec une config partielle, utiliser **`saveUserConfigMerge`** (merge avec la config cloud existante) :

```ts
import { saveUserConfigMerge } from '../api/popcorn-web';
await saveUserConfigMerge({ language: 'fr' }, token);  // ne touche pas aux indexers, TMDB, etc.
```
