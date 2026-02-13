import { useRef, useCallback } from 'preact/hooks';

const SEEK_STEPS = [10, 30, 60] as const;
const REPEAT_AT_30 = 3;
const REPEAT_AT_60 = 6;

export type SeekDirection = 'left' | 'right';

export function useSeekStepAcceleration() {
  const lastDirectionRef = useRef<SeekDirection | null>(null);
  const repeatCountRef = useRef(0);
  const getSeekStep = useCallback((direction: SeekDirection): number => {
    if (lastDirectionRef.current !== direction) return SEEK_STEPS[0];
    const n = repeatCountRef.current;
    if (n < REPEAT_AT_30) return SEEK_STEPS[0];
    if (n < REPEAT_AT_60) return SEEK_STEPS[1];
    return SEEK_STEPS[2];
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
