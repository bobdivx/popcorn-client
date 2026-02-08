import { useEffect, useState, useRef } from 'preact/hooks';
import { isAndroidTV } from '../../../../lib/utils/device-detection';

interface UseTVPlayerNavigationProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
  onPlayPause: () => void;
  onSeek: (direction: 'left' | 'right') => void;
  onVolumeChange: (direction: 'up' | 'down') => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onClose?: () => void;
  duration: number;
  currentTime: number;
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
}: UseTVPlayerNavigationProps) {
  const [focusedControlIndex, setFocusedControlIndex] = useState(0);
  const isTV = isAndroidTV();
  const controlsTimeoutRef = useRef<number | null>(null);

  // Afficher les contrôles automatiquement sur Android TV
  useEffect(() => {
    if (isTV && !showControls) {
      setShowControls(true);
    }
  }, [isTV, showControls, setShowControls]);

  const controls = [
    { id: 'playpause', action: onPlayPause },
    { id: 'mute', action: onToggleMute },
    { id: 'fullscreen', action: onToggleFullscreen },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (showControls) {
            const control = controls[focusedControlIndex];
            if (control) {
              control.action();
            }
          } else {
            onPlayPause();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey || e.ctrlKey) {
            onSeek('left');
          } else if (showControls && focusedControlIndex > 0) {
            setFocusedControlIndex(focusedControlIndex - 1);
          } else {
            onSeek('left');
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey || e.ctrlKey) {
            onSeek('right');
          } else if (showControls && focusedControlIndex < controls.length - 1) {
            setFocusedControlIndex(focusedControlIndex + 1);
          } else {
            onSeek('right');
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          onVolumeChange('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onVolumeChange('down');
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
        case 'Escape':
          e.preventDefault();
          if (onClose) {
            onClose();
          } else {
            onToggleFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, focusedControlIndex, onPlayPause, onSeek, onVolumeChange, onToggleMute, onToggleFullscreen, onClose, controls, isTV]);

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
    }, 5000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isTV, showControls, setShowControls]);

  return {
    isTV,
    focusedControlIndex,
    setFocusedControlIndex,
  };
}
