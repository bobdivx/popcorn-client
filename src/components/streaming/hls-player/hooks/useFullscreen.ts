import { useState, useEffect } from 'preact/hooks';

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  return isFullscreen;
}

/**
 * Vérifie si le document est actuellement en plein écran
 */
export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * Active le plein écran pour un élément donné avec support multi-navigateurs
 */
export function requestFullscreen(element: HTMLElement): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Fullscreen API not available'));
  }

  // Vérifier si déjà en plein écran
  if (isFullscreenActive()) {
    return Promise.resolve();
  }

  // Essayer les différentes APIs fullscreen selon le navigateur
  if (element.requestFullscreen) {
    return element.requestFullscreen();
  } else if ((element as any).webkitRequestFullscreen) {
    return (element as any).webkitRequestFullscreen();
  } else if ((element as any).mozRequestFullScreen) {
    return (element as any).mozRequestFullScreen();
  } else if ((element as any).msRequestFullscreen) {
    return (element as any).msRequestFullscreen();
  }

  return Promise.reject(new Error('Fullscreen API not supported'));
}

/**
 * Désactive le plein écran avec support multi-navigateurs
 */
export function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Fullscreen API not available'));
  }

  if (document.exitFullscreen) {
    return document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) {
    return (document as any).webkitExitFullscreen();
  } else if ((document as any).mozCancelFullScreen) {
    return (document as any).mozCancelFullScreen();
  } else if ((document as any).msExitFullscreen) {
    return (document as any).msExitFullscreen();
  }

  return Promise.reject(new Error('Fullscreen API not supported'));
}

/**
 * Active ou désactive le plein écran pour un élément donné
 */
export function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) {
    return Promise.reject(new Error('Element is null'));
  }

  if (isFullscreenActive()) {
    return exitFullscreen();
  } else {
    return requestFullscreen(element);
  }
}
