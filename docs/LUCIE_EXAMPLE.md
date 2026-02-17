# Exemple d'utilisation du lecteur Lucie

Ce document présente des exemples concrets d'utilisation du lecteur Lucie.

## Exemple 1 : Utilisation directe du composant LuciePlayer

```tsx
import { LuciePlayer } from '@/components/streaming/lucie-player';

function MyVideoPage() {
  return (
    <div className="video-container">
      <LuciePlayer
        src="/api/lucie/manifest.json?path=movies/avatar.mkv&info_hash=abc123"
        infoHash="abc123"
        fileName="avatar.mkv"
        filePath="/media/movies/avatar.mkv"
        torrentId="torrent-123"
        tmdbId={19995}
        tmdbType="movie"
        onClose={() => console.log('Lecteur fermé')}
        onError={(error) => console.error('Erreur:', error.message)}
        onLoadingChange={(loading) => console.log('Chargement:', loading)}
      />
    </div>
  );
}
```

## Exemple 2 : Utilisation via UnifiedPlayer (recommandé)

```tsx
import UnifiedPlayer from '@/components/streaming/player-core/components/UnifiedPlayer';
import { useState } from 'preact/hooks';

function VideoPlayerWithSelector() {
  const [playerType, setPlayerType] = useState<'hls' | 'lucie'>('hls');
  
  const mediaInfo = {
    path: '/media/movies/avatar.mkv',
    infoHash: 'abc123',
    fileName: 'avatar.mkv',
    torrentId: 'torrent-123',
    tmdbId: 19995,
    tmdbType: 'movie' as const,
  };

  // Construire l'URL en fonction du type de lecteur
  const sourceUrl = playerType === 'lucie'
    ? `/api/lucie/manifest.json?path=${encodeURIComponent(mediaInfo.path)}&info_hash=${mediaInfo.infoHash}`
    : `/api/local/stream/${encodeURIComponent(mediaInfo.path)}/playlist.m3u8?info_hash=${mediaInfo.infoHash}`;

  return (
    <div className="video-page">
      {/* Sélecteur de lecteur */}
      <div className="player-selector">
        <button 
          onClick={() => setPlayerType('hls')}
          className={playerType === 'hls' ? 'active' : ''}
        >
          Lecteur HLS
        </button>
        <button 
          onClick={() => setPlayerType('lucie')}
          className={playerType === 'lucie' ? 'active' : ''}
        >
          Lecteur Lucie
        </button>
      </div>

      {/* Lecteur unifié */}
      <UnifiedPlayer
        src={sourceUrl}
        useDirectPlayer={false}
        useLuciePlayer={playerType === 'lucie'}
        loading={false}
        loadingMessage="Chargement de la vidéo..."
        closeLabel="Fermer"
        onClose={() => console.log('Fermeture')}
        onDirectError={(e) => console.error('Erreur:', e)}
        onDirectLoadedData={() => {}}
        onHlsError={(e) => console.error('Erreur lecteur:', e)}
        onHlsLoadingChange={(loading) => console.log('Chargement:', loading)}
        hlsProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.path,
          torrentId: mediaInfo.torrentId,
          tmdbId: mediaInfo.tmdbId,
          tmdbType: mediaInfo.tmdbType,
          onClose: () => console.log('HLS fermé'),
        }}
        lucieProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.path,
          torrentId: mediaInfo.torrentId,
          tmdbId: mediaInfo.tmdbId,
          tmdbType: mediaInfo.tmdbType,
          onClose: () => console.log('Lucie fermé'),
        }}
      />
    </div>
  );
}
```

## Exemple 3 : Détection automatique du meilleur lecteur

```tsx
import { useState, useEffect } from 'preact/hooks';
import UnifiedPlayer from '@/components/streaming/player-core/components/UnifiedPlayer';

interface MediaCapabilities {
  supportsLucie: boolean;
  supportsHLS: boolean;
  supportsDirect: boolean;
}

function AutoSelectPlayer({ mediaInfo }: { mediaInfo: MediaInfo }) {
  const [capabilities, setCapabilities] = useState<MediaCapabilities>({
    supportsLucie: false,
    supportsHLS: false,
    supportsDirect: false,
  });

  useEffect(() => {
    // Détecter les capacités du navigateur
    const checkCapabilities = async () => {
      const caps: MediaCapabilities = {
        supportsLucie: 
          !!window.MediaSource && 
          MediaSource.isTypeSupported('video/webm; codecs="vp9,opus"'),
        supportsHLS: !!window.Hls,
        supportsDirect: true, // Toujours supporté
      };
      setCapabilities(caps);
    };

    checkCapabilities();
  }, []);

  // Choisir automatiquement le meilleur lecteur
  const selectBestPlayer = (): 'lucie' | 'hls' | 'direct' => {
    // Préférer Lucie si disponible et supporté
    if (capabilities.supportsLucie) {
      return 'lucie';
    }
    // Fallback sur HLS
    if (capabilities.supportsHLS) {
      return 'hls';
    }
    // Dernier recours : direct
    return 'direct';
  };

  const playerType = selectBestPlayer();
  
  const getSourceUrl = () => {
    switch (playerType) {
      case 'lucie':
        return `/api/lucie/manifest.json?path=${encodeURIComponent(mediaInfo.path)}&info_hash=${mediaInfo.infoHash}`;
      case 'hls':
        return `/api/local/stream/${encodeURIComponent(mediaInfo.path)}/playlist.m3u8?info_hash=${mediaInfo.infoHash}`;
      case 'direct':
        return `/api/local/direct/${encodeURIComponent(mediaInfo.path)}?info_hash=${mediaInfo.infoHash}`;
    }
  };

  return (
    <div>
      <div className="player-info">
        Lecteur sélectionné : <strong>{playerType.toUpperCase()}</strong>
      </div>
      <UnifiedPlayer
        src={getSourceUrl()}
        useDirectPlayer={playerType === 'direct'}
        useLuciePlayer={playerType === 'lucie'}
        loading={false}
        loadingMessage="Chargement..."
        closeLabel="Fermer"
        onClose={() => {}}
        onDirectError={(e) => console.error('Erreur:', e)}
        onDirectLoadedData={() => {}}
        onHlsError={(e) => console.error('Erreur:', e)}
        onHlsLoadingChange={() => {}}
        hlsProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.path,
          onClose: () => {},
        }}
        lucieProps={{
          infoHash: mediaInfo.infoHash,
          fileName: mediaInfo.fileName,
          filePath: mediaInfo.path,
          onClose: () => {},
        }}
      />
    </div>
  );
}
```

## Exemple 4 : Séries avec skip intro et épisode suivant

```tsx
import { LuciePlayer } from '@/components/streaming/lucie-player';

function SeriesPlayer({ episode, onNextEpisode }: Props) {
  return (
    <LuciePlayer
      src={`/api/lucie/manifest.json?path=${encodeURIComponent(episode.path)}&info_hash=${episode.infoHash}`}
      infoHash={episode.infoHash}
      fileName={episode.fileName}
      filePath={episode.path}
      torrentId={episode.torrentId}
      tmdbId={episode.tmdbId}
      tmdbType="tv"
      isSeries={true}
      nextEpisodeInfo={{
        seasonNum: episode.seasonNum,
        episodeVariantId: episode.nextEpisodeId,
        title: episode.nextEpisodeTitle,
      }}
      onPlayNextEpisode={onNextEpisode}
      onClose={() => console.log('Fermeture')}
    />
  );
}
```

## Exemple 5 : Gestion de la progression et du buffering

```tsx
import { useState } from 'preact/hooks';
import { LuciePlayer } from '@/components/streaming/lucie-player';

function PlayerWithProgress() {
  const [bufferProgress, setBufferProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div>
      {/* Indicateur de progression */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${bufferProgress}%` }}
            />
          </div>
          <p>Buffering: {bufferProgress}%</p>
        </div>
      )}

      <LuciePlayer
        src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
        infoHash="abc123"
        fileName="movie.mkv"
        filePath="/media/movie.mkv"
        onBufferProgress={setBufferProgress}
        onLoadingChange={setIsLoading}
        onClose={() => {}}
      />
    </div>
  );
}
```

## Exemple 6 : Arrêt manuel du buffering à la fermeture

```tsx
import { useRef } from 'preact/hooks';
import { LuciePlayer } from '@/components/streaming/lucie-player';

function PlayerWithCleanup() {
  const stopBufferRef = useRef<(() => void) | null>(null);

  const handleClose = () => {
    // Arrêter le buffering avant de fermer
    if (stopBufferRef.current) {
      stopBufferRef.current();
      console.log('Buffering arrêté');
    }
    
    // Fermer le lecteur
    console.log('Fermeture du lecteur');
  };

  return (
    <LuciePlayer
      src="/api/lucie/manifest.json?path=movie.mkv&info_hash=abc123"
      infoHash="abc123"
      fileName="movie.mkv"
      filePath="/media/movie.mkv"
      stopBufferRef={stopBufferRef}
      onClose={handleClose}
    />
  );
}
```

## Exemple 7 : Test du support navigateur

```tsx
import { useState, useEffect } from 'preact/hooks';

function BrowserSupportChecker() {
  const [support, setSupport] = useState({
    mse: false,
    webm: false,
    vp9: false,
    opus: false,
  });

  useEffect(() => {
    const checkSupport = () => {
      const mseSupport = !!window.MediaSource;
      const webmSupport = mseSupport && MediaSource.isTypeSupported('video/webm');
      const vp9Support = mseSupport && MediaSource.isTypeSupported('video/webm; codecs="vp9"');
      const opusSupport = mseSupport && MediaSource.isTypeSupported('video/webm; codecs="vp9,opus"');

      setSupport({
        mse: mseSupport,
        webm: webmSupport,
        vp9: vp9Support,
        opus: opusSupport,
      });
    };

    checkSupport();
  }, []);

  const canUseLucie = support.mse && support.webm && support.vp9 && support.opus;

  return (
    <div className="support-checker">
      <h3>Support navigateur pour le lecteur Lucie</h3>
      <ul>
        <li>MediaSource Extensions: {support.mse ? '✅' : '❌'}</li>
        <li>Format WebM: {support.webm ? '✅' : '❌'}</li>
        <li>Codec VP9: {support.vp9 ? '✅' : '❌'}</li>
        <li>Codec Opus: {support.opus ? '✅' : '❌'}</li>
      </ul>
      <p>
        {canUseLucie ? (
          <strong className="text-green-600">
            ✅ Votre navigateur supporte le lecteur Lucie
          </strong>
        ) : (
          <strong className="text-red-600">
            ❌ Votre navigateur ne supporte pas le lecteur Lucie
          </strong>
        )}
      </p>
    </div>
  );
}
```

## Exemple 8 : Configuration backend avec Axum

```rust
// Fichier: backend/src/server/mod.rs

use axum::Router;
mod routes;

pub fn app() -> Router {
    Router::new()
        // Routes existantes
        .merge(routes::media::hls::routes())
        // Nouvelles routes Lucie
        .merge(routes::media::lucie::routes())
}
```

```rust
// Fichier: backend/src/server/routes/media/lucie.rs

use axum::{
    extract::{Path, Query},
    routing::get,
    Json, Router,
};

// ... (voir lucie_example.rs pour l'implémentation complète)

pub fn routes() -> Router {
    Router::new()
        .route("/api/lucie/manifest.json", get(get_manifest))
        .route("/api/lucie/segment/:number", get(get_segment))
}
```

## Styles CSS personnalisés

```css
/* Styles pour le sélecteur de lecteur */
.player-selector {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #1f2937;
  border-radius: 0.5rem;
}

.player-selector button {
  padding: 0.5rem 1rem;
  background: #374151;
  color: white;
  border: 2px solid transparent;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
}

.player-selector button.active {
  background: #7c3aed;
  border-color: #a78bfa;
}

.player-selector button:hover {
  background: #4b5563;
}

/* Badge Lucie */
.lucie-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(124, 58, 237, 0.2);
  border: 1px solid rgba(167, 139, 250, 0.5);
  border-radius: 9999px;
  color: #c4b5fd;
  font-size: 0.875rem;
  font-weight: 600;
}
```

## Conclusion

Ces exemples couvrent les cas d'usage principaux du lecteur Lucie. Pour plus d'informations :

- Documentation complète : [README.md](../src/components/streaming/lucie-player/README.md)
- Guide d'intégration : [LUCIE_PLAYER_INTEGRATION.md](./LUCIE_PLAYER_INTEGRATION.md)
- Exemple backend : [lucie_example.rs](../../popcorn-server/backend/src/server/routes/media/lucie_example.rs)
