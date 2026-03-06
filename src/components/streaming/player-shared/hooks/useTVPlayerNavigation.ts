import { useEffect, useState, useRef, useMemo } from 'preact/hooks';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { useSeekStepAcceleration } from './useSeekStepAcceleration';

const BACK_KEY_CODES = [27, 8, 461];
const BACK_KEYS = ['Escape', 'Backspace', 'Back', 'BrowserBack', 'GoBack'];

interface UseTVPlayerNavigationProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
  onPlayPause: () => void;
  onSeek: (direction: 'left' | 'right', stepSeconds?: number) => void;
  onVolumeChange: (direction: 'up' | 'down') => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onClose?: () => void;
  /** Si fourni, ajoute un contrôle « Paramètres / Qualité » accessible à la télécommande (avant plein écran). */
  onOpenQualityMenu?: () => void;
  duration: number;
  currentTime: number;
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
  onOpenQualityMenu,
  progressBarRef,
}: UseTVPlayerNavigationProps) {
  const [focusedControlIndex, setFocusedControlIndex] = useState(0);
  const [focusedOnProgress, setFocusedOnProgress] = useState(false);
  const isTV = isTVPlatform();
  const controlsTimeoutRef = useRef<number | null>(null);
  const { getSeekStep, recordKeyDown, recordKeyUp } = useSeekStepAcceleration();
  const hasBack = !!onClose;
  const controls = useMemo(() => {
    const c = [
      { id: 'playpause', action: onPlayPause },
      { id: 'mute', action: onToggleMute },
    ];
    if (onOpenQualityMenu) c.push({ id: 'quality', action: onOpenQualityMenu });
    c.push({ id: 'fullscreen', action: onToggleFullscreen });
    if (hasBack) c.unshift({ id: 'back', action: onClose! });
    return c;
  }, [hasBack, onClose, onPlayPause, onToggleMute, onToggleFullscreen, onOpenQualityMenu]);

  const isBackKey = (e: KeyboardEvent) =>
    BACK_KEYS.includes(e.key) || BACK_KEY_CODES.includes(e.keyCode ?? e.which);

  const handleBack = () => {
    if (onClose) onClose();
    else onToggleFullscreen();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Quand les contrôles sont masqués : OK/Retour sur webOS peut envoyer le même code que Retour (461).
      // Interpréter comme "afficher les contrôles" au lieu de quitter (évite de quitter au premier appui sur OK).
      if (!showControls && isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setShowControls(true);
        setFocusedControlIndex(hasBack ? 1 : 0); // focus sur Play/Pause, pas sur Retour
        return;
      }
      if (isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }
      const kc = e.keyCode ?? e.which;
      const key = e.key || (kc === 13 ? 'Enter' : kc === 32 ? ' ' : kc === 37 ? 'ArrowLeft' : kc === 38 ? 'ArrowUp' : kc === 39 ? 'ArrowRight' : kc === 40 ? 'ArrowDown' : '');
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
      if (!showControls && [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        setShowControls(true);
      }
      switch (key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (showControls) {
            if (focusedOnProgress) onPlayPause();
            else {
              const control = controls[focusedControlIndex];
              if (control) control.action();
            }
          } else onPlayPause();
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const stepLeft = getSeekStep('left');
          recordKeyDown('left');
          onSeek('left', stepLeft);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const stepRight = getSeekStep('right');
          recordKeyDown('right');
          onSeek('right', stepRight);
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          if (showControls && !focusedOnProgress) {
            if (focusedControlIndex === 0) {
              setFocusedOnProgress(true);
              progressBarRef?.current?.focus();
            } else {
              setFocusedControlIndex(focusedControlIndex - 1);
            }
          } else onVolumeChange('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (showControls && focusedOnProgress) {
            setFocusedOnProgress(false);
            setFocusedControlIndex(0);
          } else if (showControls && !focusedOnProgress && focusedControlIndex < controls.length - 1) {
            setFocusedControlIndex(focusedControlIndex + 1);
          } else if (showControls && !focusedOnProgress && focusedControlIndex === controls.length - 1) {
            onVolumeChange('down');
          } else onVolumeChange('down');
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
    const handleWebOSBack = () => handleBack();
    const handleKeyUp = (e: KeyboardEvent) => {
      const kc = e.keyCode ?? e.which;
      const key = e.key || (kc === 37 ? 'ArrowLeft' : kc === 39 ? 'ArrowRight' : '');
      if (key === 'ArrowLeft' || key === 'ArrowRight' || kc === 412 || kc === 417) recordKeyUp();
    };
    // Capture phase : intercepter les flèches avant que le navigateur ne déplace le focus (ex. depuis la barre de progression).
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('webosback', handleWebOSBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('webosback', handleWebOSBack);
    };
  }, [showControls, focusedControlIndex, focusedOnProgress, onPlayPause, onSeek, onVolumeChange, onToggleMute, onToggleFullscreen, onClose, onOpenQualityMenu, controls, setShowControls, getSeekStep, recordKeyDown, recordKeyUp]);

  // Sur TV : afficher les contrôles au montage uniquement. Ne pas forcer la réaffichage
  // quand ils se cachent (sinon ils ne se cachent jamais). Le keydown handler affiche
  // déjà les contrôles quand l'utilisateur appuie sur une touche.
  useEffect(() => {
    if (isTV) setShowControls(true);
  }, [isTV, setShowControls]);

  // Sur TV : mettre le focus sur la barre de progression quand les contrôles s'affichent (au montage ou réaffichage).
  useEffect(() => {
    if (!isTV || !showControls) return;
    setFocusedOnProgress(true);
    const id = setTimeout(() => progressBarRef?.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [isTV, showControls]);

  // Sur TV : masquer les contrôles après 5 s d'inactivité. Ne pas réinitialiser le timer à chaque
  // re-render (ex. currentTime) sinon les contrôles ne se masquent jamais sur webOS.
  useEffect(() => {
    if (!isTV || !showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      return;
    }
    if (controlsTimeoutRef.current !== null) return; // déjà un masquage programmé
    controlsTimeoutRef.current = window.setTimeout(() => {
      controlsTimeoutRef.current = null;
      setShowControls(false);
      setFocusedOnProgress(false);
    }, 5000);
    return () => {
      // Ne pas clear ici à chaque re-run : on clear seulement au démontage (effet ci-dessous).
    };
  }, [isTV, showControls, setShowControls]);

  // Cleanup du timer au démontage du lecteur.
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };
  }, []);

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
