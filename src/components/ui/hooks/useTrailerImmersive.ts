import { useEffect, useRef, useState } from 'preact/hooks';

interface UseTrailerImmersiveOptions {
  /**
   * URL du trailer vidéo
   */
  trailerUrl?: string;
  /**
   * Durée d'arrêt avant d'afficher le trailer (en ms)
   */
  delay?: number;
  /**
   * Désactiver l'animation
   */
  disabled?: boolean;
  /**
   * Callback appelé quand le trailer commence à jouer
   */
  onTrailerStart?: () => void;
  /**
   * Callback appelé quand le trailer s'arrête
   */
  onTrailerStop?: () => void;
}

/**
 * Hook pour gérer l'animation Trailer Immersif
 * 
 * Comportement :
 * - Détecte 1.5 seconde d'arrêt sur une carte
 * - Charge et affiche la vidéo trailer en arrière-plan
 * - Dégradé radial noir pour garder le texte lisible
 * - Animation trailer-immersive pour transition fluide
 * - Pause automatique quand le focus change
 */
export function useTrailerImmersive({
  trailerUrl,
  delay = 1500, // 1.5 seconde par défaut
  disabled = false,
  onTrailerStart,
  onTrailerStop,
}: UseTrailerImmersiveOptions = {}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (disabled || !trailerUrl) return;

    const element = cardRef.current;
    if (!element) return;

    // Preload pour les cartes visibles (Intersection Observer)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !videoRef.current) {
            // Précharger les métadonnées pour les cartes visibles
            const video = document.createElement('video');
            video.src = trailerUrl;
            video.preload = 'metadata';
            video.load();
            video.remove(); // Retirer immédiatement, on garde juste les métadonnées en cache
          }
        });
      },
      { rootMargin: '100px' } // Précharger pour les cartes à 100px de la vue
    );

    observer.observe(element);

    const handleFocus = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Attendre le délai avant de charger le trailer
      timeoutRef.current = window.setTimeout(() => {
        setIsLoading(true);
        onTrailerStart?.();

        // Créer ou réutiliser l'élément vidéo
        let video = videoRef.current;
        if (!video) {
          video = document.createElement('video');
          video.className = 'absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-1000 z-0';
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.autoplay = true;
          videoRef.current = video;

          // Insérer la vidéo dans le conteneur
          const container = element.closest('[data-torrent-card]') || element;
          if (container instanceof HTMLElement) {
            container.style.position = 'relative';
            container.insertBefore(video, container.firstChild);
          }

          // Charger la vidéo uniquement après le délai (pas de "loading" sur <video>)
          video.preload = 'none'; // Ne pas précharger avant le délai

          // Gérer le chargement de la vidéo
          video.addEventListener('loadeddata', () => {
            setIsLoading(false);
            setIsPlaying(true);
            const v = videoRef.current;
            if (!v) return;
            v.classList.add('animate-trailer-immersive');
            v.style.opacity = '1';
          });

          video.addEventListener('error', () => {
            setIsLoading(false);
            setIsPlaying(false);
            if (video) {
              video.remove();
              videoRef.current = null;
            }
          });
        }

        if (!video) return;

        // Charger la vidéo uniquement après le délai (lazy loading)
        if (video.src !== trailerUrl) {
          video.src = trailerUrl;
          video.preload = 'metadata'; // Précharger les métadonnées uniquement
          video.load();
        } else {
          video.play().catch(() => {
            // Ignorer les erreurs de lecture automatique
          });
          setIsLoading(false);
          setIsPlaying(true);
          video.style.opacity = '1';
        }
      }, delay);
    };

    const handleBlur = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Arrêter et masquer la vidéo
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.style.opacity = '0';
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.remove();
            videoRef.current = null;
          }
        }, 1000); // Attendre la fin de la transition
      }

      setIsPlaying(false);
      setIsLoading(false);
      onTrailerStop?.();
    };

    // Utiliser focusin/focusout qui remontent (bubble) dans le DOM
    // Cela permet de détecter le focus sur les enfants (ex: <a> dans FocusableCard)
    element.addEventListener('focusin', handleFocus);
    element.addEventListener('focusout', handleBlur);
    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);
    element.addEventListener('mouseenter', handleFocus);
    element.addEventListener('mouseleave', handleBlur);

    return () => {
      observer.disconnect();
      element.removeEventListener('focusin', handleFocus);
      element.removeEventListener('focusout', handleBlur);
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
      element.removeEventListener('mouseenter', handleFocus);
      element.removeEventListener('mouseleave', handleBlur);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, [trailerUrl, delay, disabled, onTrailerStart, onTrailerStop]);

  return {
    cardRef,
    isPlaying,
    isLoading,
    videoRef,
  };
}