# Correctif : Duplication d'URL dans le lecteur Lucie

## Problème identifié

Lors du premier test du lecteur Lucie, une erreur de duplication d'URL s'est produite :

### Erreur constatée
```
[useLuciePlayer] Récupération du manifest: 
http://10.1.0.86:3000http://10.1.0.86:3000/api/lucie/manifest.json?path=...
                        ^^^^^^^^^^^^^^^^^ URL dupliquée
```

### Message d'erreur
```
TypeError: Failed to execute 'fetch' on 'Window': 
Failed to parse URL from http://10.1.0.86:3000http://10.1.0.86:3000/api/lucie/manifest.json?...
```

## Cause racine

Dans `useLuciePlayer.ts`, les fonctions `fetchManifest()` et `fetchSegment()` concaténaient `baseUrl` avec `src`, alors que `src` contient **déjà l'URL complète** générée par `buildStreamUrl()`.

### Code problématique

```typescript
// ❌ AVANT (incorrect)
const fetchManifest = async (): Promise<LucieManifest> => {
  const manifestUrl = `${baseUrl}${src}`;  // ❌ Double URL!
  console.log('[useLuciePlayer] Récupération du manifest:', manifestUrl);
  
  const response = await fetch(manifestUrl);
  // ...
};

const fetchSegment = async (segmentNumber: number): Promise<ArrayBuffer> => {
  const segmentUrl = `${baseUrl}${src.replace('/manifest.json', '')}/segment/${segmentNumber}`;  // ❌ Double URL!
  // ...
};
```

### Flux de données

```
buildStreamUrl() 
  ↓
  génère : http://10.1.0.86:3000/api/lucie/manifest.json?path=...&info_hash=...
  ↓
  passé comme `src` à useLuciePlayer
  ↓
fetchManifest()
  ↓
  concatène : baseUrl (http://10.1.0.86:3000) + src (http://10.1.0.86:3000/api/lucie/...)
  ↓
  résultat : http://10.1.0.86:3000http://10.1.0.86:3000/api/lucie/... ❌
```

## Solution

Utiliser `src` directement sans concaténation avec `baseUrl`, car `src` contient déjà l'URL complète.

### Code corrigé

```typescript
// ✅ APRÈS (correct)
const fetchManifest = async (): Promise<LucieManifest> => {
  // src contient déjà l'URL complète générée par buildStreamUrl
  console.log('[useLuciePlayer] Récupération du manifest:', src);
  
  const response = await fetch(src);  // ✅ Utilisation directe de src
  if (!response.ok) {
    throw new Error(`Échec de récupération du manifest: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('[useLuciePlayer] Manifest reçu:', data);
  return data;
};

const fetchSegment = async (segmentNumber: number): Promise<ArrayBuffer> => {
  // Construire l'URL du segment à partir de l'URL du manifest
  // src contient l'URL complète du manifest, on remplace manifest.json par segment/<number>
  const baseManifestUrl = src.split('?')[0]; // Enlever les query params
  const queryParams = src.includes('?') ? '?' + src.split('?')[1] : '';
  const segmentUrl = baseManifestUrl.replace('/manifest.json', `/segment/${segmentNumber}`) + queryParams;
  console.log(`[useLuciePlayer] Récupération du segment ${segmentNumber}:`, segmentUrl);
  
  const response = await fetch(segmentUrl);
  if (!response.ok) {
    throw new Error(`Échec de récupération du segment ${segmentNumber}: ${response.status}`);
  }
  
  return response.arrayBuffer();
};
```

## Modification apportée

**Fichier** : `src/components/streaming/lucie-player/hooks/useLuciePlayer.ts`

**Lignes modifiées** :
- Ligne 83-95 : Fonction `fetchManifest()`
- Ligne 99-113 : Fonction `fetchSegment()`

## URLs générées (après correction)

### Manifest
```
✅ http://10.1.0.86:3000/api/lucie/manifest.json?path=%2F%2F%3F%2FD%3A%2FGithub%2F...&info_hash=local_e9152646...
```

### Segment (exemple segment 0)
```
✅ http://10.1.0.86:3000/api/lucie/segment/0?path=%2F%2F%3F%2FD%3A%2FGithub%2F...&info_hash=local_e9152646...
```

## Validation

✅ Pas d'erreurs de lint  
✅ URLs correctes (pas de duplication)  
✅ Structure conforme à l'API backend attendue  

## Prochaine étape

Avec cette correction, le lecteur Lucie génère maintenant les URLs correctes. Il reste à :
1. Implémenter les routes backend correspondantes
2. Tester la lecture complète
3. Vérifier le buffering et la navigation

## Leçon apprise

Lors de la construction d'URLs dans les hooks, vérifier si les props reçues contiennent déjà des URLs complètes ou seulement des chemins relatifs. Dans ce cas :
- `src` reçu par `useLuciePlayer` = URL complète ✅
- `baseUrl` reçu par `useLuciePlayer` = Pour référence, mais pas nécessaire pour les requêtes

---

**Date** : Février 2026  
**Status** : ✅ Corrigé  
**Version** : 1.2.1
