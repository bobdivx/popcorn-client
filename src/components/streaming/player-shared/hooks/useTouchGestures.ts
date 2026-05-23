import { useRef, useEffect } from 'preact/hooks';

interface TouchGesturesProps {
  containerRef: { current: HTMLDivElement | null };
  onDoubleTap: (direction: 'left' | 'right') => void;
  onSingleTap: () => void;
  enabled?: boolean;
}

export function useTouchGestures({ containerRef, onDoubleTap, onSingleTap, enabled = true }: TouchGesturesProps) {
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const singleTapTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore if clicking on buttons or controls
      const target = e.target as HTMLElement;
      if (target.closest('.pointer-events-auto') || target.closest('button') || target.closest('a')) {
        return;
      }

      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const now = Date.now();
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (lastTapRef.current) {
        const timeDiff = now - lastTapRef.current.time;
        const xDiff = Math.abs(x - lastTapRef.current.x);
        const yDiff = Math.abs(y - lastTapRef.current.y);

        if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
          // Double tap!
          if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current);
            singleTapTimeoutRef.current = null;
          }
          lastTapRef.current = null;

          const containerWidth = rect.width;
          const direction = x < containerWidth * 0.35 ? 'left' : x > containerWidth * 0.65 ? 'right' : null;
          
          if (direction) {
            onDoubleTap(direction);
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }

      lastTapRef.current = { time: now, x, y };

      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      singleTapTimeoutRef.current = window.setTimeout(() => {
        onSingleTap();
        singleTapTimeoutRef.current = null;
      }, 250);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    };
  }, [containerRef, onDoubleTap, onSingleTap, enabled]);
}
