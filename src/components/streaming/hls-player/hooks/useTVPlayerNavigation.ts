import { useEffect, useState, useRef, useMemo } from 'preact/hooks';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { useSeekStepAcceleration } from './useSeekStepAcceleration';

/** Codes clés pour le bouton Retour sur télécommande TV */
const BACK_KEY_CODES = [
  27,   // Escape (standard)
  8,    // Backspace
  461,  // VK_BACK - Android TV, LG WebOS Magic Remote
];
const BACK_KEYS = ['Escape', 'Backspace', 'Back', 'BrowserBack', 'GoBack'];

interface UseTVPlayerNavigationProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
  onPlayPause: () => void;
  /** direction + pas optionnel en secondes (10, 30 ou 60 selon maintien de la touche) */
  onSeek: (direction: 'left' | 'right', stepSeconds?: number) => void;
  onVolumeChange: (direction: 'up' | 'down') => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onClose?: () => void;
  duration: number;
  currentTime: number;
  /** Ref de la barre de progression pour y déplacer le focus (télécommande TV) */
  progressBarRef?: { current: HTMLElement | null };
}

export function useTVPlayerNavigation({
  showControls,
  setShowControls,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onClose,
  progressBarRef,
}: UseTVPlayerNavigationProps) {
  const [focusedControlIndex, setFocusedControlIndex] = useState(0);
  const [focusedOnProgress, setFocusedOnProgress] = useState(false);
  const isTV = isTVPlatform(); // Android TV, LG WebOS, Apple TV
  const controlsTimeoutRef = useRef<number | null>(null);
  const { getSeekStep, recordKeyDown, recordKeyUp } = useSeekStepAcceleration();

  // Contrôles : Back (si onClose), Play, Mute, Fullscreen
  const hasBack = !!onClose;
  const controls = useMemo(() => {
    const c = [
      { id: 'playpause', action: onPlayPause },
      { id: 'mute', action: onToggleMute },
      { id: 'fullscreen', action: onToggleFullscreen },
    ];
    if (hasBack) {
      c.unshift({ id: 'back', action: onClose! });
    }
    return c;
  }, [hasBack, onClose, onPlayPause, onToggleMute, onToggleFullscreen]);

  const isBackKey = (e: KeyboardEvent) =>
    BACK_KEYS.includes(e.key) || BACK_KEY_CODES.includes(e.keyCode ?? e.which);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      onToggleFullscreen();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Bouton Retour télécommande : toujours fermer et revenir à MediaDetail
      if (isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }

      // Gestion par key ET keyCode pour compatibilité WebOS / Apple TV / LG télécommande classique
      const kc = e.keyCode ?? e.which;
      const key = e.key || (kc === 13 ? 'Enter' : kc === 32 ? ' ' : kc === 37 ? 'ArrowLeft' : kc === 38 ? 'ArrowUp' : kc === 39 ? 'ArrowRight' : kc === 40 ? 'ArrowDown' : '');

      // Touches média LG WebOS télécommande classique (Play 415, Pause 19, Rembobiner 412, Avance 417)
      if (kc === 415 || kc === 19) {
        e.preventDefault();
        onPlayPause();
        return;
      }
      if (kc === 412) {
        e.preventDefault();
        recordKeyDown('left');
        onSeek('left', getSeekStep('left'));
        return;
      }
      if (kc === 417) {
        e.preventDefault();
        recordKeyDown('right');
        onSeek('right', getSeekStep('right'));
        return;
      }

      // Touche pour afficher les contrôles si masqués (sauf volume)
      if (!showControls && [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        setShowControls(true);
      }

      switch (key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (showControls) {
            if (focusedOnProgress) {
              // Sur la barre de progression, Enter = play/pause
              onPlayPause();
            } else {
              const control = controls[focusedControlIndex];
              if (control) {
                control.action();
              }
            }
          } else {
            onPlayPause();
          }
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const stepLeft = getSeekStep('left');
          if (e.shiftKey || e.ctrlKey) {
            recordKeyDown('left');
            onSeek('left', stepLeft);
          } else if (showControls) {
            if (focusedOnProgress) {
              recordKeyDown('left');
              onSeek('left', stepLeft);
            } else if (focusedControlIndex > 0) {
              setFocusedControlIndex(focusedControlIndex - 1);
            } else {
              recordKeyDown('left');
              onSeek('left', stepLeft);
            }
          } else {
            recordKeyDown('left');
            onSeek('left', stepLeft);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const stepRight = getSeekStep('right');
          if (e.shiftKey || e.ctrlKey) {
            recordKeyDown('right');
            onSeek('right', stepRight);
          } else if (showControls) {
            if (focusedOnProgress) {
              recordKeyDown('right');
              onSeek('right', stepRight);
            } else if (focusedControlIndex < controls.length - 1) {
              setFocusedControlIndex(focusedControlIndex + 1);
            } else {
              recordKeyDown('right');
              onSeek('right', stepRight);
            }
          } else {
            recordKeyDown('right');
            onSeek('right', stepRight);
          }
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          if (showControls && !focusedOnProgress) {
            setFocusedOnProgress(true);
            // Déplacer le focus DOM sur la barre de progression pour que la télécommande
            // cible bien le slider (navigation D-pad, lecteurs d'écran).
            progressBarRef?.current?.focus();
          } else {
            onVolumeChange('up');
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (showControls && focusedOnProgress) {
            setFocusedOnProgress(false);
          } else {
            onVolumeChange('down');
          }
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          onToggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          onToggleFullscreen();
          break;
      }
    };

    // LG WebOS : événement personnalisé pour le bouton Retour
    const handleWebOSBack = () => {
      handleBack();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const kc = e.keyCode ?? e.which;
      const key = e.key || (kc === 37 ? 'ArrowLeft' : kc === 39 ? 'ArrowRight' : '');
      if (key === 'ArrowLeft' || key === 'ArrowRight' || kc === 412 || kc === 417) {
        recordKeyUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('webosback', handleWebOSBack);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('webosback', handleWebOSBack);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [
    showControls,
    focusedControlIndex,
    focusedOnProgress,
    onPlayPause,
    onSeek,
    onVolumeChange,
    onToggleMute,
    onToggleFullscreen,
    onClose,
    controls,
    setShowControls,
    getSeekStep,
    recordKeyDown,
    recordKeyUp,
  ]);

  // Afficher les contrôles automatiquement sur Android TV
  useEffect(() => {
    if (isTV && !showControls) {
      setShowControls(true);
    }
  }, [isTV, showControls, setShowControls]);

  // Auto-masquer les contrôles après 5 secondes sur TV
  useEffect(() => {
    if (!isTV || !showControls) return;

    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
      setFocusedOnProgress(false);
    }, 5000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isTV, showControls, setShowControls]);

  return {
    isTV,
    focusedControlIndex,
    setFocusedControlIndex,
    focusedOnProgress,
    setFocusedOnProgress,
    hasBack,
    controlsCount: controls.length,
  };
}
