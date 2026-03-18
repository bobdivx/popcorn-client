import { useEffect, useState, useRef, useMemo } from 'preact/hooks';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { useSeekStepAcceleration } from './useSeekStepAcceleration';

const BACK_KEY_CODES = [27, 8, 461, 4];
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
  /** Miniatures scrub disponibles (TV) : les flèches naviguent dans les vignettes, Enter seek. */
  scrubThumbnails?: { count: number; intervalSeconds?: number; durationSeconds?: number } | null;
  /** Seek direct vers un timestamp (secondes) — utilisé quand Enter est pressé sur une vignette scrub. */
  onScrubSeek?: (timeSeconds: number) => void;
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
  scrubThumbnails = null,
  onScrubSeek,
  duration,
  currentTime,
}: UseTVPlayerNavigationProps) {
  const [focusedControlIndex, setFocusedControlIndex] = useState(0);
  const [focusedOnProgress, setFocusedOnProgress] = useState(false);
  const [focusedOnScrub, setFocusedOnScrub] = useState(false);
  const isTV = isTVPlatform();
  const focusedOnScrubRef = useRef(false);
  focusedOnScrubRef.current = focusedOnScrub;

  // --- Scrub thumbnails (TV) ---
  const scrubThumbnailsActive = !!(scrubThumbnails && scrubThumbnails.count > 0);
  const [tvScrubIndex, setTvScrubIndex] = useState(0);

  // Refs pour éviter les closures périmées dans les listeners capturés.
  const tvScrubIndexRef = useRef(0);
  tvScrubIndexRef.current = tvScrubIndex;
  const scrubThumbnailsRef = useRef(scrubThumbnails);
  scrubThumbnailsRef.current = scrubThumbnails;
  const onScrubSeekRef = useRef(onScrubSeek);
  onScrubSeekRef.current = onScrubSeek;
  const scrubAutoSeekTimeoutRef = useRef<number | null>(null);

  /** Calcule le timestamp (secondes) correspondant à l'index de vignette. */
  const timeForScrubIndex = (idx: number) => {
    const st = scrubThumbnailsRef.current;
    if (!st || !st.count) return 0;
    const count = st.count;
    const dur = (st.durationSeconds ?? 0) > 0 ? st.durationSeconds! : duration;
    if (!dur) return 0;
    const safe = Math.min(count - 1, Math.max(0, Math.floor(idx)));
    const interval = st.intervalSeconds;
    if (interval && interval > 0) return Math.min(dur, safe * interval);
    return ((safe + 0.5) / count) * dur;
  };

  // Initialiser l'index depuis la position courante quand les contrôles apparaissent.
  useEffect(() => {
    if (!isTV || !scrubThumbnailsActive || !showControls) return;
    const st = scrubThumbnails!;
    const dur = (st.durationSeconds ?? 0) > 0 ? st.durationSeconds! : duration;
    if (!dur || !st.count) { setTvScrubIndex(0); return; }
    const idx = Math.min(st.count - 1, Math.max(0, Math.floor((currentTime / dur) * st.count)));
    setTvScrubIndex(idx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTV, scrubThumbnailsActive, showControls]);

  // Sur TV : si les miniatures scrub sont disponibles, considérer la rangée de vignettes comme zone de focus par défaut.
  useEffect(() => {
    if (!isTV || !showControls) return;
    if (scrubThumbnailsActive) {
      setFocusedOnProgress(false);
      setFocusedOnScrub(true);
    } else {
      setFocusedOnScrub(false);
    }
  }, [isTV, showControls, scrubThumbnailsActive]);

  // Sur TV : valider automatiquement la position après 2s sur une vignette (debounce).
  useEffect(() => {
    if (!isTV || !showControls) return;
    if (!scrubThumbnailsActive || !focusedOnScrub) return;
    if (!onScrubSeekRef.current) return;
    if (scrubAutoSeekTimeoutRef.current != null) {
      window.clearTimeout(scrubAutoSeekTimeoutRef.current);
      scrubAutoSeekTimeoutRef.current = null;
    }
    scrubAutoSeekTimeoutRef.current = window.setTimeout(() => {
      scrubAutoSeekTimeoutRef.current = null;
      const targetTime = timeForScrubIndex(tvScrubIndexRef.current);
      onScrubSeekRef.current?.(targetTime);
    }, 2000) as unknown as number;
    return () => {
      if (scrubAutoSeekTimeoutRef.current != null) {
        window.clearTimeout(scrubAutoSeekTimeoutRef.current);
        scrubAutoSeekTimeoutRef.current = null;
      }
    };
  }, [isTV, showControls, scrubThumbnailsActive, focusedOnScrub, tvScrubIndex]);
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

  /** Relance le compte à rebours de masquage des contrôles (5 s). */
  const resetControlsTimeout = () => {
    if (!isTV) return;
    // En navigation vignettes : ne pas masquer l'UI, sinon la rangée disparaît avant qu'on puisse naviguer.
    if (scrubThumbnailsActive && focusedOnScrubRef.current) return;
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      controlsTimeoutRef.current = null;
      setShowControls(false);
      setFocusedOnProgress(false);
    }, 5000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Quand les contrôles sont masqués : OK/Retour sur webOS peut envoyer le même code que Retour (461).
      if (!showControls && isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setShowControls(true);
        setFocusedControlIndex(hasBack ? 1 : 0);
        return;
      }
      if (isBackKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }
      const kc = e.keyCode ?? e.which;
      const keyRaw = e.key || '';
      const key =
        keyRaw ||
        (kc === 13 || kc === 23 || kc === 66
          ? 'Enter'
          : kc === 32
            ? ' '
            : kc === 19
              ? 'ArrowUp'
              : kc === 20
                ? 'ArrowDown'
                : kc === 21
                  ? 'ArrowLeft'
                  : kc === 22
                    ? 'ArrowRight'
            : kc === 37
              ? 'ArrowLeft'
              : kc === 38
                ? 'ArrowUp'
                : kc === 39
                  ? 'ArrowRight'
                  : kc === 40
                    ? 'ArrowDown'
                    : '');
      // Certaines TV exposent "Left"/"Right" au lieu de "ArrowLeft"/"ArrowRight".
      const codeRaw = (e as any).code as string | undefined;
      const fromCode =
        codeRaw === 'ArrowLeft' || codeRaw === 'ArrowRight' || codeRaw === 'Enter' || codeRaw === 'Space'
          ? (codeRaw === 'Space' ? ' ' : codeRaw)
          : // Android TV / certains devices
            (codeRaw === 'DPadLeft' ? 'ArrowLeft' : codeRaw === 'DPadRight' ? 'ArrowRight' : codeRaw === 'DPadCenter' ? 'Enter' : '');
      const keyNormalized =
        (key === 'Left' ? 'ArrowLeft' : key === 'Right' ? 'ArrowRight' : key === 'Select' ? 'Enter' : key) || fromCode;

      // kc=23 : touche OK sur certaines TV (Enter spécial). Pas de stopPropagation car on veut que
      // la logique ci-dessous (ex. scrub) puisse aussi traiter l'événement normalement.
      if (kc === 23) e.preventDefault();

      // Touches media Play/Pause (varie selon plateformes).
      // IMPORTANT: sur Android TV, kc=19 correspond à DPAD_UP (pas Play/Pause).
      if (kc === 415 || keyNormalized === 'MediaPlayPause') {
        e.preventDefault();
        onPlayPause();
        return;
      }

      // --- Navigation vignettes scrub (TV) ---
      // Quand les miniatures sont disponibles et les contrôles visibles, les flèches naviguent
      // dans le carousel et Enter/OK lance le seek vers la vignette sélectionnée.
      const isScrubKey =
        scrubThumbnailsActive &&
        (kc === 412 ||
          kc === 417 ||
          kc === 21 ||
          kc === 22 ||
          kc === 23 ||
          keyNormalized === 'ArrowLeft' ||
          keyNormalized === 'ArrowRight' ||
          keyNormalized === 'Enter' ||
          keyNormalized === ' ');

      // Important: même si showControls=false, une première pression sur ←/→ doit déjà
      // entrer en mode vignettes (afficher les contrôles + déplacer la sélection).
      if (isScrubKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!showControls) setShowControls(true);

        const count = scrubThumbnailsRef.current?.count ?? 0;
        if (count <= 0) return;

        // En mode scrub: les flèches ne doivent pas manipuler d'autres zones.
        setFocusedOnProgress(false);
        setFocusedOnScrub(true);

        if (kc === 412 || keyNormalized === 'ArrowLeft') {
          setTvScrubIndex((prev) => Math.max(0, prev - 1));
          resetControlsTimeout();
          return;
        }
        if (kc === 417 || keyNormalized === 'ArrowRight') {
          setTvScrubIndex((prev) => Math.min(count - 1, prev + 1));
          resetControlsTimeout();
          return;
        }
        if (keyNormalized === 'Enter' || keyNormalized === ' ') {
          const targetTime = timeForScrubIndex(tvScrubIndexRef.current);
          onScrubSeekRef.current?.(targetTime);
          resetControlsTimeout();
          return;
        }
      }

      // --- Codes webOS seek (hors mode scrub) ---
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

      if (!showControls && [' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(keyNormalized)) {
        setShowControls(true);
      }

      if (isTV && showControls && keyNormalized) resetControlsTimeout();

      switch (keyNormalized) {
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
          if (showControls) {
            // En mode vignettes scrub : ↑ met le focus sur les vignettes (ou remonte dans les boutons si déjà dessus).
            if (scrubThumbnailsActive) {
              setFocusedOnProgress(false);
              if (!focusedOnScrub) {
                setFocusedOnScrub(true);
                return;
              }
              // Déjà sur scrub → remonter dans les boutons
              setFocusedOnScrub(false);
              setFocusedControlIndex(Math.max(0, focusedControlIndex - 1));
              return;
            }
            if (!focusedOnProgress) {
              if (focusedControlIndex === 0) {
                setFocusedOnProgress(true);
                progressBarRef?.current?.focus();
              } else {
                setFocusedControlIndex(focusedControlIndex - 1);
              }
            } else onVolumeChange('up');
          } else onVolumeChange('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (showControls) {
            // En mode vignettes scrub : ↓ descend vers les boutons depuis scrub.
            if (scrubThumbnailsActive) {
              setFocusedOnProgress(false);
              if (focusedOnScrub) {
                setFocusedOnScrub(false);
                // garder l'index actuel, ou revenir au premier bouton si out of range
                setFocusedControlIndex((idx) => Math.min(Math.max(0, idx), Math.max(0, controls.length - 1)));
                return;
              }
              if (focusedControlIndex < controls.length - 1) setFocusedControlIndex(focusedControlIndex + 1);
              else onVolumeChange('down');
              return;
            }
            if (focusedOnProgress) {
              setFocusedOnProgress(false);
              setFocusedControlIndex(0);
            } else if (focusedControlIndex < controls.length - 1) {
              setFocusedControlIndex(focusedControlIndex + 1);
            } else {
              onVolumeChange('down');
            }
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
    // Phase capture : intercepter toutes les touches avant que le DOM ne déplace le focus.
    // On garde `window` (le plus standard). Éviter `document` pour ne pas double-déclencher selon les WebViews.
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('webosback', handleWebOSBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('webosback', handleWebOSBack);
    };
  }, [showControls, focusedControlIndex, focusedOnProgress, scrubThumbnailsActive, onPlayPause, onSeek, onVolumeChange, onToggleMute, onToggleFullscreen, onClose, onOpenQualityMenu, controls, setShowControls, getSeekStep, recordKeyDown, recordKeyUp]);

  // Sur TV : afficher les contrôles au montage uniquement. Ne pas forcer la réaffichage
  // quand ils se cachent (sinon ils ne se cachent jamais). Le keydown handler affiche
  // déjà les contrôles quand l'utilisateur appuie sur une touche.
  useEffect(() => {
    if (isTV) setShowControls(true);
  }, [isTV, setShowControls]);

  // Sur TV : mettre le focus sur la barre de progression quand les contrôles s'affichent.
  // En mode scrub (miniatures), on ne focus pas la barre : la navigation se fait via le keyboard handler.
  useEffect(() => {
    if (!isTV || !showControls) return;
    if (scrubThumbnailsActive) {
      // Pas de focus DOM : le carousel est piloté par tvScrubIndex.
      setFocusedOnProgress(false);
      return;
    }
    setFocusedOnProgress(true);
    const id = setTimeout(() => progressBarRef?.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [isTV, showControls, scrubThumbnailsActive]);

  // Sur TV : masquer les contrôles après 5 s d'inactivité.
  useEffect(() => {
    if (!isTV || !showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      return;
    }
    // En navigation vignettes : ne pas planifier l'auto-hide.
    if (scrubThumbnailsActive && focusedOnScrubRef.current) return;
    if (controlsTimeoutRef.current !== null) return; // déjà un masquage programmé
    controlsTimeoutRef.current = window.setTimeout(() => {
      controlsTimeoutRef.current = null;
      setShowControls(false);
      setFocusedOnProgress(false);
    }, 5000);
    return () => {};
  }, [isTV, showControls, setShowControls, scrubThumbnailsActive, focusedOnScrub]);

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
    tvScrubIndex,
    focusedOnScrub,
  };
}
