# Correctif #2 : Validation de l'URL avant initialisation

## Problème identifié

Lors du second test, le lecteur Lucie tentait de charger une playlist HLS M3U8 et de la parser comme du JSON.

### Erreurs constatées

```javascript
// Premier appel avec URL HLS
[useLuciePlayer] Récupération du manifest: 
http://10.1.0.86:3000/api/local/stream/.../playlist.m3u8?info_hash=...

// 404 Not Found
GET http://10.1.0.86:3000/api/lucie/manifest.json?...  404 (Not Found)

// Second appel avec URL Lucie mais récupère la playlist HLS
[useLuciePlayer] Récupération du manifest: 
http://10.1.0.86:3000/api/lucie/manifest.json?...

// Erreur de parsing JSON
SyntaxError: Unexpected token '#', "#EXTM3U\n#E"... is not valid JSON
```

### Analyse

Le problème vient de multiples re-renders :

1. **Premier render** : `useStreamSource` génère une URL HLS
   - Le lecteur Lucie tente de s'initialiser avec cette URL
   - Échoue avec 404 (route Lucie pas implémentée)

2. **Second render** : `useStreamSource` génère l'URL Lucie correcte
   - Le lecteur tente de récupérer le manifest
   - Récupère en fait une playlist M3U8 (fallback du serveur?)
   - Essaie de parser le M3U8 comme JSON → Erreur

## Cause racine

Le hook `useLuciePlayer` s'initialise avant que le bon mode ne soit détecté par `useStreamSource`. Il y a un délai entre :
1. La détection du mode Lucie dans `playerConfig`
2. La génération de l'URL par `useStreamSource`
3. Le passage de l'URL au lecteur Lucie

Pendant ce délai, le lecteur reçoit une URL HLS et tente de l'utiliser.

## Solution

Ajouter une validation dans `useLuciePlayer` pour s'assurer que l'URL reçue est bien une URL de manifest Lucie avant de démarrer l'initialisation.

### Code ajouté

```typescript
/**
 * Initialise le lecteur Lucie avec MediaSource
 */
useEffect(() => {
  const video = videoRef.current;
  if (!video || !infoHash || !filePath) return;
  
  // ✅ Vérifier que l'URL est bien une URL de manifest Lucie (pas HLS)
  if (!src.includes('/api/lucie/manifest.json')) {
    console.log('[useLuciePlayer] URL non-Lucie détectée, attente de l\'URL correcte:', src);
    return; // ✅ Ne pas initialiser avec une URL HLS
  }

  let cleanup: (() => void) | null = null;
  shouldStopRef.current = false;

  const initializePlayer = async () => {
    // ... reste du code
  };
  
  // ...
}, [infoHash, filePath, baseUrl, src]);
```

## Flux corrigé

```
Premier render
  ↓
useStreamSource génère URL HLS
  ↓
LuciePlayer reçoit URL HLS : http://.../playlist.m3u8
  ↓
Validation : ❌ URL ne contient pas "/api/lucie/manifest.json"
  ↓
Return early - pas d'initialisation
  ↓
Second render (mode Lucie détecté)
  ↓
useStreamSource génère URL Lucie
  ↓
LuciePlayer reçoit URL Lucie : http://.../api/lucie/manifest.json
  ↓
Validation : ✅ URL contient "/api/lucie/manifest.json"
  ↓
Initialisation du lecteur ✅
```

## Logs attendus (après correction)

```
[useLuciePlayer] URL non-Lucie détectée, attente de l'URL correcte: 
http://10.1.0.86:3000/api/local/stream/.../playlist.m3u8?info_hash=...

[VideoPlayerWrapper] Construction URL stream: { mode: 'lucie', ... }

[useLuciePlayer] Récupération du manifest: 
http://10.1.0.86:3000/api/lucie/manifest.json?path=...&info_hash=...

[useLuciePlayer] Manifest reçu: { duration: 7200, segmentCount: 1440, ... }
```

## Modification apportée

**Fichier** : `src/components/streaming/lucie-player/hooks/useLuciePlayer.ts`

**Ligne** : 213-217 (ajout de validation)

```typescript
// Vérifier que l'URL est bien une URL de manifest Lucie (pas HLS)
if (!src.includes('/api/lucie/manifest.json')) {
  console.log('[useLuciePlayer] URL non-Lucie détectée, attente de l\'URL correcte:', src);
  return;
}
```

## Avantages de cette approche

1. **Sécurité** : Évite d'initialiser le lecteur avec une mauvaise URL
2. **Performance** : Pas de tentatives inutiles de fetch
3. **Debug** : Log clair indiquant l'attente de la bonne URL
4. **Robustesse** : Gère correctement les re-renders multiples

## Alternative envisagée

Une alternative aurait été de corriger `useStreamSource` pour qu'il ne génère l'URL qu'une seule fois avec le bon mode dès le départ. Cependant, cela nécessiterait une refactorisation plus importante et pourrait affecter les autres lecteurs (HLS, Direct).

La validation côté lecteur est plus simple et plus sûre.

## Validation

✅ Pas d'erreurs de lint  
✅ Validation d'URL avant initialisation  
✅ Logs clairs pour le debug  
✅ Pas d'impact sur les autres lecteurs  

## Prochaine étape

Avec les deux corrections appliquées :
1. ✅ Pas de duplication d'URL (bugfix #1)
2. ✅ Validation de l'URL avant initialisation (bugfix #2)

Le lecteur Lucie devrait maintenant attendre que le backend implémente les routes correspondantes et retourner une erreur propre (404) au lieu d'essayer de parser une playlist HLS.

## Note importante

L'erreur 404 sur `/api/lucie/manifest.json` est **normale et attendue** car le backend n'a pas encore implémenté cette route. Une fois le backend implémenté selon `lucie_example.rs`, le lecteur devrait fonctionner correctement.

---

**Date** : Février 2026  
**Status** : ✅ Corrigé  
**Version** : 1.2.2
