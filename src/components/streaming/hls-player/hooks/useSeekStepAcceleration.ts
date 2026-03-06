import { useRef, useCallback } from 'preact/hooks';

/** Pas de seek en secondes : 1er appui = 10s, répétitions = 30s puis 60s */
const SEEK_STEPS = [10, 30, 60] as const;
/** Nombre de répétitions (keydown) avant de passer au palier suivant : 1er = 10s, après REPEAT_AT_30 = 30s, après REPEAT_AT_60 = 60s */
const REPEAT_AT_30 = 3; // 2e, 3e, 4e appui → 30s
const REPEAT_AT_60 = 6; // 5e+ appui → 60s

export type SeekDirection = 'left' | 'right';

/**
 * Hook pour la barre de progression utilisable à la télécommande :
 * - 1ère flèche (ou court appui) : ±10 s
 * - En restant appuyé (répétitions) : ±30 s par appui
 * - Encore plus longtemps : ±60 s par appui
 * Réinitialise le palier au relâchement de la touche (keyup).
 */
export function useSeekStepAcceleration() {
  const lastDirectionRef = useRef<SeekDirection | null>(null);
  const repeatCountRef = useRef(0);

  const getSeekStep = useCallback((direction: SeekDirection): number => {
    if (lastDirectionRef.current !== direction) {
      return SEEK_STEPS[0]; // 10s au premier appui ou changement de sens
    }
    const n = repeatCountRef.current;
    if (n < REPEAT_AT_30) return SEEK_STEPS[0]; // 10s
    if (n < REPEAT_AT_60) return SEEK_STEPS[1]; // 30s
    return SEEK_STEPS[2]; // 60s
  }, []);

  const recordKeyDown = useCallback((direction: SeekDirection) => {
    if (lastDirectionRef.current !== direction) {
      repeatCountRef.current = 0;
      lastDirectionRef.current = direction;
    }
    repeatCountRef.current += 1;
  }, []);

  const recordKeyUp = useCallback(() => {
    repeatCountRef.current = 0;
    lastDirectionRef.current = null;
  }, []);

  return { getSeekStep, recordKeyDown, recordKeyUp };
}
