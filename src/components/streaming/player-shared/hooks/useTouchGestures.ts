import { useRef, useEffect } from 'preact/hooks';

interface TouchGesturesProps {
  containerRef: { current: HTMLDivElement | null };
  onDoubleTap: (direction: 'left' | 'right') => void;
  onSingleTap: () => void;
  enabled?: boolean;
}

/**
 * Éléments qui gèrent eux-mêmes le toucher : un tap dessus ne doit ni basculer les
 * contrôles ni compter pour un double-tap. Le fond du chrome (div plein écran
 * « pointer-events-auto » quand les contrôles sont visibles) n'en fait PAS partie :
 * un tap sur la zone vide doit pouvoir masquer les contrôles.
 */
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [role="slider"], [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [data-no-tap-toggle], [data-player-overlay-action], [data-tv-video-controls-row]';

/** Tolérance de mouvement (px) : au-delà, c'est un glissé (scrub, scroll), pas un tap. */
const TAP_MOVE_TOLERANCE = 12;

export function useTouchGestures({ containerRef, onDoubleTap, onSingleTap, enabled = true }: TouchGesturesProps) {
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const singleTapTimeoutRef = useRef<number | null>(null);
  // Callbacks en ref : le listener reste stable. Avant, il était ré-enregistré à chaque rendu
  // (≈ 4×/s pendant la lecture) et le cleanup annulait le single-tap en attente → tap ignoré.
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;
  const onSingleTapRef = useRef(onSingleTap);
  onSingleTapRef.current = onSingleTap;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let start: { x: number; y: number; ignored: boolean; moved: boolean } | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.touches.length !== 1 || !target || target.closest(INTERACTIVE_SELECTOR)) {
        start = null;
        return;
      }
      const touch = e.touches[0];
      start = { x: touch.clientX, y: touch.clientY, ignored: false, moved: false };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (
        Math.abs(touch.clientX - start.x) > TAP_MOVE_TOLERANCE ||
        Math.abs(touch.clientY - start.y) > TAP_MOVE_TOLERANCE
      ) {
        start.moved = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || s.moved) return;
      const now = Date.now();
      const rect = container.getBoundingClientRect();
      const x = s.x - rect.left;
      const y = s.y - rect.top;

      if (lastTapRef.current) {
        const timeDiff = now - lastTapRef.current.time;
        const xDiff = Math.abs(x - lastTapRef.current.x);
        const yDiff = Math.abs(y - lastTapRef.current.y);
        if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
          const direction = x < rect.width * 0.35 ? 'left' : x > rect.width * 0.65 ? 'right' : null;
          if (direction) {
            // Double-tap gauche/droite : seek ±10 s (le single-tap en attente est annulé).
            if (singleTapTimeoutRef.current) {
              clearTimeout(singleTapTimeoutRef.current);
              singleTapTimeoutRef.current = null;
            }
            lastTapRef.current = null;
            if (e.cancelable) e.preventDefault(); // pas de click / zoom fantôme
            onDoubleTapRef.current(direction);
            return;
          }
        }
      }

      lastTapRef.current = { time: now, x, y };
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      // Pas de click synthétique sur la vidéo (sinon le tap mettait aussi en pause).
      if (e.cancelable) e.preventDefault();
      singleTapTimeoutRef.current = window.setTimeout(() => {
        singleTapTimeoutRef.current = null;
        onSingleTapRef.current();
      }, 250);
    };

    const handleTouchCancel = () => {
      start = null;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    };
  }, [containerRef, enabled]);
}
