# Résumé : Lecteur Vidéo Lucie

## Vue d'ensemble

Le **lecteur Lucie** est un nouveau lecteur vidéo qui fonctionne en parallèle des lecteurs HLS et Direct existants dans l'application Popcorn. Il utilise des segments WebM de 5 secondes au lieu du format HLS traditionnel.

## Caractéristiques principales

### Format et Segmentation
- ✅ **Format vidéo** : WebM (VP9 + Opus)
- ✅ **Segments fixes** : Toujours 5 secondes
- ✅ **Numérotation incrémentale** : Les segments sont récupérés par numéro (0, 1, 2, 3...)
- ✅ **Manifest JSON** : Un fichier JSON contient toutes les informations (durée, nombre de segments, codecs, résolution)

### Fonctionnalités
- ✅ Lecture avec MediaSource Extensions (MSE)
- ✅ Buffering automatique (5 segments à l'avance = 25 secondes)
- ✅ Sauvegarde et reprise de la position de lecture
- ✅ Support des séries (skip intro, épisode suivant)
- ✅ Contrôles vidéo complets
- ✅ Support TV/télécommande
- ✅ Plein écran automatique sur mobile
- ✅ Badge visuel "Lucie Player" pendant le chargement

## Fichiers créés

### Frontend (popcorn-client)

#### Code source
```
src/components/streaming/lucie-player/
├── LuciePlayer.tsx                    ✅ Composant principal
├── types.ts                           ✅ Définitions TypeScript
├── hooks/
│   └── useLuciePlayer.ts              ✅ Hook de gestion du lecteur
├── index.ts                           ✅ Exports publics
└── README.md                          ✅ Documentation technique
```

#### Documentation
```
doc/
├── LUCIE_SUMMARY.md                   ✅ Ce fichier (résumé)
├── LUCIE_PLAYER_INTEGRATION.md        ✅ Guide d'intégration
└── LUCIE_EXAMPLE.md                   ✅ Exemples d'utilisation
```

#### Modifications
```
src/components/streaming/player-core/components/
└── UnifiedPlayer.tsx                  ✅ Intégration du lecteur Lucie
```

### Backend (popcorn-server)

#### Exemple d'implémentation
```
backend/src/server/routes/media/
└── lucie_example.rs                   ✅ Exemple complet en Rust
```

## API Backend attendue

Le lecteur Lucie attend deux endpoints du serveur :

### 1. Manifest JSON
```
GET /api/lucie/manifest.json?path=<path>&info_hash=<hash>
```

**Réponse :**
```json
{
  "duration": 7200.5,
  "segment_count": 1440,
  "segment_duration": 5.0,
  "video_codec": "vp9",
  "audio_codec": "opus",
  "width": 1920,
  "height": 1080,
  "file_id": "lucie_abc123"
}
```

### 2. Segments vidéo
```
GET /api/lucie/segment/<number>?path=<path>&info_hash=<hash>
```

**Réponse :** Données binaires WebM (Content-Type: video/webm)

## Utilisation

### Exemple simple
```tsx
import { LuciePlayer } from '@/components/streaming/lucie-player';

<LuciePlayer
  src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
  infoHash="abc123"
  fileName="movie.mkv"
  filePath="/path/to/movie.mkv"
  onClose={() => console.log('Fermé')}
/>
```

### Exemple avec UnifiedPlayer
```tsx
import UnifiedPlayer from '@/components/streaming/player-core/components/UnifiedPlayer';

<UnifiedPlayer
  src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
  useDirectPlayer={false}
  useLuciePlayer={true}
  lucieProps={{
    infoHash: "abc123",
    fileName: "movie.mkv",
    filePath: "/path/to/movie.mkv",
    onClose: () => {},
  }}
/>
```

## Implémentation Backend

### Routes Axum (Rust)
```rust
use axum::Router;

pub fn routes() -> Router {
    Router::new()
        .route("/api/lucie/manifest.json", get(get_manifest))
        .route("/api/lucie/segment/:number", get(get_segment))
}
```

### Génération de segment avec FFmpeg
```bash
ffmpeg -ss <start_time> -i <input> -t 5 \
  -c:v libvpx-vp9 -b:v 2M -deadline realtime -cpu-used 4 \
  -c:a libopus -b:a 128k \
  -f webm pipe:1
```

## Comparaison avec les autres lecteurs

| Aspect | HLS Player | Direct Player | Lucie Player |
|--------|-----------|---------------|--------------|
| Format | M3U8 + TS | MP4/WebM direct | JSON + WebM |
| Codec | H.264/H.265 | Original | VP9 + Opus |
| Segmentation | Variable | N/A | Fixe (5s) |
| Buffering | hls.js | Native | MSE manuel |
| Qualités | Multiple | N/A | Une seule |
| Complexité | Moyenne | Faible | Moyenne |

## Avantages

1. **Prévisibilité** : Segments toujours de 5 secondes
2. **Simplicité** : API plus simple que HLS (pas de playlists M3U8)
3. **Contrôle** : Gestion manuelle du buffering avec MSE
4. **Format moderne** : WebM VP9 + Opus
5. **Intégration** : Fonctionne en parallèle des autres lecteurs

## Limitations

1. ❌ Pas de qualités multiples (pour l'instant)
2. ❌ Pas de pistes audio alternatives
3. ❌ Pas de sous-titres intégrés
4. ⚠️ Nécessite MediaSource Extensions
5. ⚠️ Nécessite support WebM VP9 + Opus

## Support navigateur

**Supporté :**
- ✅ Chrome/Edge 78+
- ✅ Firefox 75+
- ✅ Safari 14.1+
- ✅ Opera 65+

**Test de support :**
```javascript
const isSupported = 
  !!window.MediaSource && 
  MediaSource.isTypeSupported('video/webm; codecs="vp9,opus"');
```

## Prochaines étapes

Pour utiliser le lecteur Lucie dans votre application :

1. **Backend** :
   - Implémenter les routes `/api/lucie/manifest.json` et `/api/lucie/segment/:number`
   - Utiliser FFmpeg pour transcoder les segments en WebM
   - Tester avec curl ou un client HTTP

2. **Frontend** :
   - Intégrer dans `VideoPlayerWrapper`
   - Ajouter un sélecteur de lecteur (optionnel)
   - Tester la lecture et le buffering

3. **Optimisation** :
   - Mettre en cache les segments générés
   - Ajuster les paramètres FFmpeg selon le CPU disponible
   - Utiliser l'accélération matérielle si possible

## Ressources

- **Documentation complète** : [README.md](../src/components/streaming/lucie-player/README.md)
- **Guide d'intégration** : [LUCIE_PLAYER_INTEGRATION.md](./LUCIE_PLAYER_INTEGRATION.md)
- **Exemples** : [LUCIE_EXAMPLE.md](./LUCIE_EXAMPLE.md)
- **Code backend** : [lucie_example.rs](../../popcorn-server/backend/src/server/routes/media/lucie_example.rs)

## Support

Pour toute question ou problème :
1. Vérifiez le support navigateur
2. Consultez les logs dans la console (préfixe `[useLuciePlayer]`)
3. Vérifiez que FFmpeg est installé sur le serveur
4. Testez les endpoints API avec curl

## Notes techniques

### Calcul du nombre de segments
```typescript
const segmentCount = Math.ceil(duration / 5.0);
```

### Structure du SourceBuffer
```typescript
const mimeType = 'video/webm; codecs="vp9,opus"';
const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
```

### Buffering automatique
Le lecteur charge automatiquement 5 segments à l'avance (25 secondes de buffer) pendant la lecture.

---

**Auteur** : Système Popcorn  
**Date** : Février 2026  
**Version** : 1.0.0
