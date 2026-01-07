import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi, type StreamResponse } from '../lib/client/server-api';

interface VideoPlayerProps {
  contentId: string;
  title?: string;
  onClose?: () => void;
}

export default function VideoPlayer({ contentId, title, onClose }: VideoPlayerProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Array<{ lang: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadStream();
  }, [contentId]);

  const loadStream = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!serverApi.isAuthenticated()) {
        setError('Vous devez être connecté pour lire le contenu');
        setLoading(false);
        return;
      }

      const response = await serverApi.getStream(contentId);

      if (!response.success) {
        setError(response.message || 'Erreur lors du chargement du stream');
        return;
      }

      if (response.data) {
        setStreamUrl(response.data.hlsUrl || response.data.streamUrl);
        if (response.data.subtitles) {
          setSubtitles(response.data.subtitles);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (videoRef.current && streamUrl) {
      // Configurer les sous-titres si disponibles
      if (subtitles.length > 0) {
        // HLS.js gère les sous-titres automatiquement si dans le manifest
        // Sinon, on peut les ajouter manuellement
      }
    }
  }, [streamUrl, subtitles]);

  if (loading) {
    return (
      <div class="flex flex-col items-center justify-center h-screen bg-black">
        <span class="loading loading-spinner loading-lg text-white"></span>
        <p class="text-white mt-4">Chargement du stream...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex flex-col items-center justify-center h-screen bg-black text-white">
        <div class="alert alert-error max-w-md">
          <span>{error}</span>
        </div>
        <button class="btn btn-primary mt-4" onClick={loadStream}>
          Réessayer
        </button>
        {onClose && (
          <button class="btn btn-ghost mt-2" onClick={onClose}>
            Fermer
          </button>
        )}
      </div>
    );
  }

  if (!streamUrl) {
    return (
      <div class="flex flex-col items-center justify-center h-screen bg-black text-white">
        <p>Aucun stream disponible</p>
        {onClose && (
          <button class="btn btn-ghost mt-4" onClick={onClose}>
            Fermer
          </button>
        )}
      </div>
    );
  }

  return (
    <div class="fixed inset-0 bg-black z-50">
      {onClose && (
        <button
          class="absolute top-4 right-4 z-10 btn btn-circle btn-ghost text-white"
          onClick={onClose}
        >
          ✕
        </button>
      )}
      {title && (
        <div class="absolute top-4 left-4 z-10">
          <h2 class="text-white text-xl font-bold">{title}</h2>
        </div>
      )}
      <video
        ref={videoRef}
        class="w-full h-full"
        controls
        autoPlay
        playsInline
      >
        <source src={streamUrl} type="application/x-mpegURL" />
        {subtitles.map((sub) => (
          <track
            key={sub.lang}
            kind="subtitles"
            srcLang={sub.lang}
            src={sub.url}
            label={sub.lang}
          />
        ))}
        Votre navigateur ne supporte pas la lecture vidéo.
      </video>
    </div>
  );
}
