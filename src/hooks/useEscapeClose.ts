import { useEffect, useRef } from 'preact/hooks';

/**
 * Ferme un overlay (panel / portal) sur Escape.
 * Capture au niveau document pour fonctionner même sans focus trap.
 */
export function useEscapeClose(isOpen: boolean, onClose?: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);
}
