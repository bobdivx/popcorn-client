# Lecteur Lucie

Le **Lecteur Lucie** est un lecteur vidéo alternatif qui utilise des segments WebM au lieu du format HLS traditionnel.

## Principe de fonctionnement

Le lecteur Lucie fonctionne différemment du lecteur HLS standard :

- **Format vidéo** : Les vidéos sont toujours converties en **WebM** (codec VP9 + Opus)
- **Segments fixes** : Les segments font toujours **5 secondes** chacun
- **Numérotation incrémentale** : Les segments sont récupérés par numéro incrémental (0, 1, 2, 3, etc.)
- **Manifest JSON** : Un fichier JSON retourne toutes les informations nécessaires (nombre de segments, durée totale, codecs, résolution, etc.)

## Architecture

```
src/components/streaming/lucie-player/
├── LuciePlayer.tsx              # Composant principal du lecteur
├── types.ts                     # Définitions TypeScript
├── hooks/
│   └── useLuciePlayer.ts        # Hook principal pour la logique de lecture
├── index.ts                     # Exports publics
└── README.md                    # Cette documentation
```

## Utilisation

### Intégration basique

```tsx
import { LuciePlayer } from '@/components/streaming/lucie-player';

<LuciePlayer
  src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
  infoHash="abc123"
  fileName="movie.mkv"
  filePath="/path/to/movie.mkv"
  torrentId="torrent-123"
  onClose={() => console.log('Fermeture du lecteur')}
  onError={(error) => console.error('Erreur:', error)}
/>
```

### Via UnifiedPlayer

Le lecteur Lucie est intégré dans le `UnifiedPlayer` et peut être sélectionné avec l'option `useLuciePlayer`:

```tsx
import UnifiedPlayer from '@/components/streaming/player-core/components/UnifiedPlayer';

<UnifiedPlayer
  src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
  useDirectPlayer={false}
  useLuciePlayer={true}  // Active le lecteur Lucie
  lucieProps={{
    infoHash: "abc123",
    fileName: "movie.mkv",
    filePath: "/path/to/movie.mkv",
    onClose: handleClose,
  }}
  // ... autres props
/>
```

## Structure du Manifest JSON

Le serveur doit retourner un manifest JSON avec la structure suivante :

```json
{
  "duration": 7200.5,           // Durée totale en secondes
  "segmentCount": 1440,         // Nombre total de segments
  "segmentDuration": 5.0,       // Durée de chaque segment (toujours 5s)
  "videoCodec": "vp9",          // Codec vidéo
  "audioCodec": "opus",         // Codec audio
  "width": 1920,                // Largeur de la vidéo
  "height": 1080,               // Hauteur de la vidéo
  "fileId": "unique-file-id"    // ID unique (optionnel)
}
```

## API Backend attendue

Le lecteur Lucie attend les endpoints suivants du backend :

### 1. Manifest JSON
```
GET /api/lucie/manifest.json?path=<path>&info_hash=<hash>
```
Retourne le manifest JSON avec les informations de la vidéo.

### 2. Segments vidéo
```
GET /api/lucie/segment/<segment_number>?path=<path>&info_hash=<hash>
```
Retourne le segment WebM correspondant au numéro demandé.

**Exemple** :
- Segment 0 : premières 5 secondes
- Segment 1 : 5-10 secondes
- Segment 2 : 10-15 secondes
- etc.

## Fonctionnalités

- ✅ Lecture avec MediaSource Extensions (MSE)
- ✅ Buffering automatique (5 segments à l'avance = 25 secondes)
- ✅ Sauvegarde de la position de lecture
- ✅ Reprise depuis la dernière position
- ✅ Support des séries (skip intro, épisode suivant)
- ✅ Contrôles vidéo complets (lecture, pause, seek, volume, plein écran)
- ✅ Support TV/télécommande
- ✅ Plein écran automatique sur mobile
- ✅ Animation de chargement personnalisée avec badge "Lucie Player"

## Avantages vs HLS

1. **Segments fixes** : Toujours 5 secondes, plus prévisible
2. **Format uniforme** : Toujours WebM, pas de conversion HLS
3. **API simple** : Pas de playlists M3U8, juste des segments numérotés
4. **Contrôle total** : Gestion manuelle du buffering avec MSE

## Limitations actuelles

- ❌ Pas de sélection de qualité multiple (une seule qualité)
- ❌ Pas de pistes audio alternatives
- ❌ Pas de sous-titres intégrés (pour l'instant)
- ⚠️ Nécessite un navigateur supportant MediaSource Extensions
- ⚠️ Nécessite le support du codec WebM VP9 + Opus

## Support navigateur

Le lecteur Lucie nécessite :
- MediaSource Extensions (MSE)
- Codec WebM avec VP9 (vidéo) et Opus (audio)

Navigateurs supportés :
- ✅ Chrome/Edge 78+
- ✅ Firefox 75+
- ✅ Safari 14.1+
- ✅ Opera 65+

## Développement

### Ajouter des fonctionnalités

Pour ajouter des fonctionnalités au lecteur Lucie :

1. **Modifier le hook** : `hooks/useLuciePlayer.ts` pour la logique
2. **Modifier le composant** : `LuciePlayer.tsx` pour l'UI
3. **Ajouter des types** : `types.ts` pour les nouvelles interfaces

### Debug

Le lecteur Lucie log toutes ses opérations dans la console avec le préfixe `[useLuciePlayer]` :

```javascript
console.log('[useLuciePlayer] Récupération du manifest:', manifestUrl);
console.log('[useLuciePlayer] Segment 5 ajouté avec succès');
```

## Comparaison avec HLS

| Caractéristique | HLS Player | Lucie Player |
|----------------|-----------|--------------|
| Format | M3U8 + segments TS | JSON + segments WebM |
| Codec | H.264/H.265 | VP9 + Opus |
| Durée segment | Variable | Fixe (5s) |
| Qualités multiples | ✅ Oui | ❌ Non |
| Pistes audio | ✅ Oui | ❌ Non |
| Sous-titres | ✅ Oui | ❌ Non |
| Seek distant | ✅ Avec reload | ✅ Native MSE |
| Buffering | Géré par hls.js | Manuel (MSE) |

## Roadmap

Fonctionnalités prévues :
- [ ] Support des qualités multiples
- [ ] Pistes audio alternatives
- [ ] Sous-titres intégrés
- [ ] Préchargement intelligent basé sur le réseau
- [ ] Support AV1 (en plus de VP9)
