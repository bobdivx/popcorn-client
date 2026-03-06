# Guide d'intégration du lecteur Lucie

Ce document explique comment intégrer et utiliser le lecteur Lucie dans l'application Popcorn.

## Vue d'ensemble

Le **lecteur Lucie** est un lecteur vidéo alternatif qui utilise des segments WebM de 5 secondes au lieu du format HLS traditionnel. Il fonctionne en parallèle des lecteurs HLS et Direct existants.

## Architecture

```
┌─────────────────────┐
│  VideoPlayerWrapper │  ← Point d'entrée
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   UnifiedPlayer     │  ← Sélection du lecteur
└──────────┬──────────┘
           │
     ┌─────┴─────┬─────────────┐
     ▼           ▼             ▼
┌─────────┐ ┌─────────┐  ┌──────────┐
│  Direct │ │   HLS   │  │  Lucie   │
│ Player  │ │ Player  │  │  Player  │
└─────────┘ └─────────┘  └──────────┘
```

## Intégration dans VideoPlayerWrapper

Voici comment intégrer le lecteur Lucie dans votre `VideoPlayerWrapper` existant :

```tsx
import { useState } from 'preact/hooks';
import UnifiedPlayer from '../player-core/components/UnifiedPlayer';

export default function VideoPlayerWrapper({
  mediaInfo,
  onClose,
}: Props) {
  const [playerType, setPlayerType] = useState<'hls' | 'direct' | 'lucie'>('hls');
  
  // Déterminer l'URL source en fonction du type de lecteur
  const getSourceUrl = () => {
    if (playerType === 'lucie') {
      // URL du manifest JSON pour Lucie
      return `/api/lucie/manifest.json?path=${encodeURIComponent(mediaInfo.filePath)}&info_hash=${mediaInfo.infoHash}`;
    } else if (playerType === 'hls') {
      // URL HLS classique
      return `/api/local/stream/${encodeURIComponent(mediaInfo.filePath)}/playlist.m3u8?info_hash=${mediaInfo.infoHash}`;
    } else {
      // Lecture directe
      return `/api/local/direct/${encodeURIComponent(mediaInfo.filePath)}?info_hash=${mediaInfo.infoHash}`;
    }
  };

  return (
    <div id="video-player-wrapper">
      {/* Sélecteur de lecteur (optionnel) */}
      <div className="player-selector">
        <button onClick={() => setPlayerType('hls')}>HLS</button>
        <button onClick={() => setPlayerType('lucie')}>Lucie</button>
        <button onClick={() => setPlayerType('direct')}>Direct</button>
      </div>

      <UnifiedPlayer
        src={getSourceUrl()}
        useDirectPlayer={playerType === 'direct'}
        useLuciePlayer={playerType === 'lucie'}
        loading={false}
        loadingMessage="Chargement..."
        closeLabel="Fermer"
        onClose={onClose}
        onDirectError={(e) => console.error('Erreur Direct:', e)}
        onDirectLoadedData={() => console.log('Direct chargé')}
        onHlsError={(e) => console.error('Erreur lecteur:', e)}
        onHlsLoadingChange={(loading) => console.log('Chargement:', loading)}
        hlsProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.filePath,
          torrentId: mediaInfo.torrentId,
          tmdbId: mediaInfo.tmdbId,
          tmdbType: mediaInfo.tmdbType,
          onClose,
        }}
        lucieProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.filePath,
          torrentId: mediaInfo.torrentId,
          tmdbId: mediaInfo.tmdbId,
          tmdbType: mediaInfo.tmdbType,
          onClose,
        }}
      />
    </div>
  );
}
```

## Détection automatique du lecteur

Pour choisir automatiquement le meilleur lecteur en fonction de la source :

```tsx
const determinePlayerType = (filePath: string, sourceType: string): 'hls' | 'direct' | 'lucie' => {
  // Utiliser Lucie si le serveur supporte le format
  if (sourceType === 'lucie' || filePath.includes('lucie=true')) {
    return 'lucie';
  }
  
  // Utiliser Direct pour les fichiers locaux supportés nativement
  if (sourceType === 'local_' && isNativelySupported(filePath)) {
    return 'direct';
  }
  
  // Par défaut, utiliser HLS
  return 'hls';
};

const isNativelySupported = (filePath: string): boolean => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['mp4', 'webm', 'ogg'].includes(ext || '');
};
```

## Configuration du backend (Rust)

Le backend doit fournir deux endpoints pour le lecteur Lucie :

### 1. Endpoint du manifest JSON

```rust
// backend/src/server/routes/media/lucie.rs

use axum::{Json, extract::Query};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct LucieManifestQuery {
    pub path: String,
    pub info_hash: String,
}

#[derive(Serialize)]
pub struct LucieManifest {
    pub duration: f64,
    pub segment_count: usize,
    pub segment_duration: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub width: u32,
    pub height: u32,
    pub file_id: Option<String>,
}

pub async fn get_manifest(
    Query(params): Query<LucieManifestQuery>,
) -> Result<Json<LucieManifest>, AppError> {
    // 1. Obtenir les informations du fichier
    let video_info = get_video_info(&params.path, &params.info_hash).await?;
    
    // 2. Calculer le nombre de segments (durée totale / 5 secondes)
    let segment_duration = 5.0;
    let segment_count = (video_info.duration / segment_duration).ceil() as usize;
    
    // 3. Créer le manifest
    let manifest = LucieManifest {
        duration: video_info.duration,
        segment_count,
        segment_duration,
        video_codec: "vp9".to_string(),
        audio_codec: "opus".to_string(),
        width: video_info.width,
        height: video_info.height,
        file_id: Some(generate_file_id(&params.path, &params.info_hash)),
    };
    
    Ok(Json(manifest))
}
```

### 2. Endpoint des segments

```rust
use axum::{
    body::Body,
    extract::{Path, Query},
    response::Response,
};
use tokio_util::io::ReaderStream;

#[derive(Deserialize)]
pub struct SegmentQuery {
    pub path: String,
    pub info_hash: String,
}

pub async fn get_segment(
    Path(segment_number): Path<usize>,
    Query(params): Query<SegmentQuery>,
) -> Result<Response<Body>, AppError> {
    // 1. Calculer la position temporelle du segment
    let segment_duration = 5.0;
    let start_time = segment_number as f64 * segment_duration;
    
    // 2. Transcoder le segment avec FFmpeg
    let segment_data = transcode_webm_segment(
        &params.path,
        &params.info_hash,
        start_time,
        segment_duration,
    ).await?;
    
    // 3. Retourner le segment
    let stream = ReaderStream::new(segment_data);
    let body = Body::from_stream(stream);
    
    Ok(Response::builder()
        .header("Content-Type", "video/webm")
        .header("Cache-Control", "public, max-age=31536000")
        .body(body)?)
}

async fn transcode_webm_segment(
    path: &str,
    info_hash: &str,
    start_time: f64,
    duration: f64,
) -> Result<impl AsyncRead, AppError> {
    // Commande FFmpeg pour transcoder un segment en WebM
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args(&[
        "-ss", &start_time.to_string(),
        "-i", path,
        "-t", &duration.to_string(),
        "-c:v", "libvpx-vp9",
        "-c:a", "libopus",
        "-b:v", "2M",
        "-b:a", "128k",
        "-deadline", "realtime",
        "-cpu-used", "4",
        "-f", "webm",
        "pipe:1",
    ]);
    
    let child = cmd.stdout(Stdio::piped())
        .spawn()?;
    
    Ok(child.stdout.unwrap())
}
```

### 3. Enregistrement des routes

```rust
// backend/src/server/routes/media/mod.rs

pub mod lucie;

pub fn media_routes() -> Router {
    Router::new()
        // Routes existantes
        .route("/api/local/stream/:path/playlist.m3u8", get(hls::playlist))
        .route("/api/local/stream/:path/:segment", get(hls::segment))
        // Nouvelles routes Lucie
        .route("/api/lucie/manifest.json", get(lucie::get_manifest))
        .route("/api/lucie/segment/:number", get(lucie::get_segment))
}
```

## Configuration avancée

### Cache des segments

Pour améliorer les performances, vous pouvez mettre en cache les segments générés :

```rust
use std::sync::Arc;
use tokio::sync::RwLock;
use lru::LruCache;

pub struct SegmentCache {
    cache: Arc<RwLock<LruCache<String, Vec<u8>>>>,
}

impl SegmentCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            cache: Arc::new(RwLock::new(LruCache::new(capacity))),
        }
    }
    
    pub async fn get_or_generate(
        &self,
        key: String,
        generator: impl Future<Output = Result<Vec<u8>, AppError>>,
    ) -> Result<Vec<u8>, AppError> {
        // Vérifier le cache
        {
            let cache = self.cache.read().await;
            if let Some(data) = cache.peek(&key) {
                return Ok(data.clone());
            }
        }
        
        // Générer le segment
        let data = generator.await?;
        
        // Mettre en cache
        {
            let mut cache = self.cache.write().await;
            cache.put(key, data.clone());
        }
        
        Ok(data)
    }
}
```

### Optimisation FFmpeg pour Lucie

Pour optimiser la génération des segments WebM :

```bash
# Profil rapide (temps réel)
ffmpeg -ss ${START} -i "${INPUT}" -t 5 \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 \
  -c:a libopus -b:a 128k \
  -f webm pipe:1

# Profil qualité (meilleure qualité, plus lent)
ffmpeg -ss ${START} -i "${INPUT}" -t 5 \
  -c:v libvpx-vp9 -deadline good -cpu-used 2 -b:v 3M \
  -c:a libopus -b:a 192k \
  -f webm pipe:1

# Profil HW (utilise l'accélération matérielle si disponible)
ffmpeg -hwaccel auto -ss ${START} -i "${INPUT}" -t 5 \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 6 \
  -c:a libopus -b:a 128k \
  -f webm pipe:1
```

## Tests

Pour tester le lecteur Lucie :

```bash
# 1. Démarrer le serveur
cd popcorn-server
cargo run

# 2. Ouvrir l'application client
cd ../popcorn-client
npm run dev

# 3. Tester avec curl
curl "http://localhost:3000/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
curl "http://localhost:3000/api/lucie/segment/0?path=movie.mkv&info_hash=abc123" > segment0.webm

# 4. Vérifier le segment généré
ffprobe segment0.webm
```

## Dépannage

### Le lecteur Lucie ne démarre pas

Vérifiez que votre navigateur supporte :
- MediaSource Extensions
- Codec WebM VP9 + Opus

```javascript
// Test dans la console du navigateur
console.log('MSE:', !!window.MediaSource);
console.log('WebM VP9:', MediaSource.isTypeSupported('video/webm; codecs="vp9,opus"'));
```

### Les segments se chargent lentement

1. Vérifiez que FFmpeg est bien installé
2. Réduisez la qualité de transcodage (cpu-used=8, deadline=realtime)
3. Activez le cache des segments
4. Utilisez l'accélération matérielle si disponible

### Erreur "SourceBuffer updating"

Le lecteur essaie d'ajouter un segment pendant qu'un autre est en cours de traitement. C'est géré automatiquement par le hook `useLuciePlayer`, mais si le problème persiste, vérifiez les logs du navigateur.

## Migration depuis HLS

Pour migrer un lecteur HLS existant vers Lucie :

1. Remplacez l'URL source par le manifest JSON Lucie
2. Ajoutez `useLuciePlayer={true}` au `UnifiedPlayer`
3. Assurez-vous que le backend expose les routes Lucie
4. Testez la lecture et le buffering

## Conclusion

Le lecteur Lucie offre une alternative simple et efficace au HLS pour les cas où :
- Vous voulez un contrôle total sur le format et le buffering
- Vous préférez WebM à H.264/H.265
- Vous avez des segments de durée fixe
- Vous voulez une API backend plus simple (pas de playlists M3U8)

Pour toute question ou problème, consultez le [README du lecteur Lucie](../src/components/streaming/lucie-player/README.md).
