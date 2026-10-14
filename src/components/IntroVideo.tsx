import { useEffect, useRef, useState } from 'preact/hooks';

interface IntroVideoProps {
  onEnded: () => void;
  onSkip?: () => void;
}

export default function IntroVideo({ onEnded, onSkip }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

  const skipIntroEntirely =
    typeof document !== 'undefined' &&
    (document.documentElement.getAttribute('data-webos') === 'true' ||
      document.documentElement.getAttribute('data-tv-platform') === 'true');
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    videoRef.current?.pause();
    onEnded();
  };

  // TV / webOS : pas d'intro. Ailleurs : passage auto si la vidéo ne démarre pas en 6 s.
  useEffect(() => {
    if (skipIntroEntirely) return finish();
    const t = setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.currentTime < 0.5) finish();
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Afficher le bouton skip après 2 secondes
    const skipTimer = setTimeout(() => {
      setShowSkip(true);
    }, 2000);

    // Démarrer la lecture automatiquement
    const video = videoRef.current;
    if (video) {
      video.play().catch((error) => {
        console.warn('Erreur lors de la lecture automatique:', error);
        // Si la lecture automatique échoue, permettre à l'utilisateur de cliquer
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }

    return () => {
      clearTimeout(skipTimer);
    };
  }, []);

  const handleEnded = finish;
  const handleSkip = finish;

  if (skipIntroEntirely) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
        onEnded={handleEnded}
        onError={finish}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source src="/intro.mp4" type="video/mp4" />
        Votre navigateur ne supporte pas la lecture de vidéos.
      </video>
      
      {showSkip && (
        <button
          onClick={handleSkip}
          autoFocus
          data-focusable
          className="ed-cta absolute bottom-8 right-8"
          aria-label="Passer l'intro"
        >
          Passer
        </button>
      )}
    </div>
  );
}
