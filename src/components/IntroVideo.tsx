import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  playIntroWithSound,
  resolveBootIntroGif,
  resolveBootIntroMp4,
  unmuteIntroOnFirstGesture,
} from '../lib/utils/boot-intro';

interface IntroVideoProps {
  onEnded: () => void;
  onSkip?: () => void;
  /** Première image réellement affichée (vidéo en lecture ou GIF) : l'écran de chargement peut s'effacer. */
  onStarted?: () => void;
  /** Variante visuelle : sting marque type Netflix (défaut) ou overlay pédagogique. */
  variant?: 'brand' | 'tutorial';
}

function resolveIntroMp4(): string {
  if (typeof window === 'undefined') return resolveBootIntroMp4();
  return resolveBootIntroMp4(window.location.protocol);
}

function resolveIntroGif(): string {
  if (typeof window === 'undefined') return resolveBootIntroGif();
  return resolveBootIntroGif(window.location.protocol);
}

/** Codes télécommande TV : Retour / Escape uniquement pour passer sans focus « Passer ». */
function isBackKey(e: KeyboardEvent): boolean {
  const code = e.keyCode ?? e.which;
  return (
    e.key === 'Escape' ||
    e.key === 'GoBack' ||
    e.key === 'BrowserBack' ||
    code === 27 ||
    code === 461 || // webOS Back
    code === 10009 || // Tizen/Samsung Back
    code === 8 // Backspace (certaines TV)
  );
}

/**
 * Intro d’ouverture type Netflix : plein écran, animation marque, lecture jusqu’à la fin.
 * Sur Android TV / webOS : pas de skip forcé, Retour pour passer, fallback GIF si le MP4 échoue.
 */
export default function IntroVideo({ onEnded, onSkip, onStarted, variant = 'brand' }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const onStartedRef = useRef(onStarted);
  onStartedRef.current = onStarted;
  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    onStartedRef.current?.();
  }, []);

  // Filet : ne jamais laisser l'écran de chargement par-dessus l'intro si `playing` ne part pas.
  useEffect(() => {
    const t = window.setTimeout(markStarted, 2500);
    return () => window.clearTimeout(t);
  }, [markStarted]);
  const [useGifFallback, setUseGifFallback] = useState(false);
  const [introSrc] = useState(resolveIntroMp4);
  const [gifSrc] = useState(resolveIntroGif);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    markStarted();
    videoRef.current?.pause();
    onSkip?.();
    onEnded();
  }, [onEnded, onSkip, markStarted]);

  // Pas de bouton « Passer » : l'intro va jusqu'au bout. Plafond absolu (30 s) en plus des
  // garde-fous ci-dessous, pour ne jamais bloquer l'app si la vidéo cale en cours de lecture.
  useEffect(() => {
    const hardCap = window.setTimeout(finish, 30_000);
    return () => window.clearTimeout(hardCap);
  }, [finish]);

  // Lecture auto du MP4 avec le son (apps TV / Android / Tauri) ; repli muet si le
  // navigateur refuse l'autoplay sonore (web), puis GIF si même la lecture muette échoue.
  useEffect(() => {
    if (useGifFallback) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stopUnmute: (() => void) | null = null;
    playIntroWithSound(video)
      .then((mode) => {
        if (cancelled) return;
        if (mode === 'muted') stopUnmute = unmuteIntroOnFirstGesture(video);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[IntroVideo] Lecture auto impossible, fallback GIF:', error);
        setUseGifFallback(true);
      });
    return () => {
      cancelled = true;
      stopUnmute?.();
    };
  }, [useGifFallback]);

  // Fallback GIF : durée type sting Netflix (~4,5 s) puis fin.
  useEffect(() => {
    if (!useGifFallback) return;
    const t = window.setTimeout(finish, 4500);
    return () => window.clearTimeout(t);
  }, [useGifFallback, finish]);

  // Garde-fous : jamais bloqué.
  // - pas de lecture effective en 8 s → GIF ou fin ;
  // - sinon fin forcée à durée + 1,5 s si `ended` ne part pas.
  useEffect(() => {
    if (useGifFallback) return;
    const t = window.setTimeout(() => {
      if (doneRef.current) return;
      const v = videoRef.current;
      if (!v || v.paused || v.readyState < 2 || v.currentTime < 0.25) {
        console.warn('[IntroVideo] Intro non lue après 8 s, tentative fallback GIF');
        setUseGifFallback(true);
        return;
      }
      const remaining = Number.isFinite(v.duration) ? Math.max(0, v.duration - v.currentTime) : 6;
      window.setTimeout(finish, Math.min(remaining, 20) * 1000 + 1500);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [useGifFallback, finish]);

  // Retour / Escape : passer. OK/Entrée ne passent PAS globalement (comportement Netflix + évite le piège TV).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBackKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [finish]);

  // z-[9000] : au-dessus de la navbar (z-200) et de l'accueil pré-rendu dessous ;
  // sous l'écran de chargement unique (#popcorn-loading-fallback, z-9999).
  return (
    <div
      className="fixed inset-0 z-[9000] bg-black flex items-center justify-center"
      role="dialog"
      aria-label="Introduction Popcornn"
      data-intro-variant={variant}
    >
      {variant === 'tutorial' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 max-w-2xl mx-4 pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md border border-white/30 rounded-xl p-4 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Bienvenue dans Popcorn</h2>
            <p className="text-gray-300 text-sm">
              Découvrez rapidement les fonctionnalités. Vous pouvez passer cette vidéo à tout moment.
            </p>
          </div>
        </div>
      )}

      {useGifFallback ? (
        <img
          src={gifSrc}
          alt=""
          className="w-full h-full object-contain"
          onLoad={markStarted}
          onError={() => finish()}
        />
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          preload="auto"
          onEnded={finish}
          onPlaying={markStarted}
          onError={() => {
            console.warn('[IntroVideo] Erreur MP4 intro, fallback GIF');
            setUseGifFallback(true);
          }}
        >
          <source src={introSrc} type="video/mp4" />
        </video>
      )}

    </div>
  );
}
