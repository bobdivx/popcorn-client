import { useState, useEffect } from 'preact/hooks';
import { isMobileDevice } from '../../../../lib/utils/device-detection';

/**
 * Sur mobile en portrait, forcer `contain` pour ne pas couper la vidéo landscape.
 * En paysage / desktop, respecter le choix utilisateur (cover/contain).
 */
export function useEffectiveVideoFillMode(
  preferred: 'contain' | 'cover' | undefined,
): 'contain' | 'cover' {
  const [isPortraitMobile, setIsPortraitMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isMobileDevice() && window.matchMedia('(orientation: portrait)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(orientation: portrait)');
    const update = () => {
      setIsPortraitMobile(isMobileDevice() && mq.matches);
    };
    update();
    mq.addEventListener?.('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (isPortraitMobile) return 'contain';
  return preferred === 'cover' || preferred === 'contain' ? preferred : 'contain';
}
