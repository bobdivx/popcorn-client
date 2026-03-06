import { useEffect, useRef, useState } from 'preact/hooks';

interface IntroVideoProps {
  onEnded: () => void;
  onSkip?: () => void;
}

export default function IntroVideo({ onEnded, onSkip }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkip, setShowSkip] = useState(false);

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

  const handleEnded = () => {
    onEnded();
  };

  const handleSkip = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    onEnded();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source src="/intro.mp4" type="video/mp4" />
        Votre navigateur ne supporte pas la lecture de vidéos.
      </video>
      
      {showSkip && (
        <button
          onClick={handleSkip}
          className="absolute bottom-8 right-8 px-6 py-3 bg-black/70 hover:bg-black/90 text-white rounded-lg font-medium transition-all duration-300 backdrop-blur-sm border border-white/20"
          aria-label="Passer l'intro"
        >
          Passer
        </button>
      )}
    </div>
  );
}
