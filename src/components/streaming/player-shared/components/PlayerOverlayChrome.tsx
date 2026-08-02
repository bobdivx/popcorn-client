import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface PlayerOverlayChromeProps {
  children: ComponentChildren;
  /** Fermer / annuler (Escape + bouton X + bouton bas optionnel). */
  onClose?: () => void;
  closeLabel?: string;
  /** Afficher le bouton d’action en bas (Annuler / Fermer). */
  showBottomAction?: boolean;
  /** Conteneur role/aria. */
  role?: string;
  className?: string;
  contentClassName?: string;
}

/**
 * Shell commun des overlays in-player : fade, Escape/Back, X haut-gauche, action bas.
 */
export function PlayerOverlayChrome({
  children,
  onClose,
  closeLabel = 'Fermer',
  showBottomAction = true,
  role,
  className = '',
  contentClassName = '',
}: PlayerOverlayChromeProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const code = e.keyCode ?? e.which;
      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'Back' ||
        key === 'BrowserBack' ||
        key === 'GoBack' ||
        code === 27 ||
        code === 8 ||
        code === 461 ||
        code === 10009;
      if (!isBack) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className={`player-overlay absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30 ${className}`}
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      aria-busy={role === 'status' ? true : undefined}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title={closeLabel}
          aria-label={closeLabel}
          tabIndex={0}
          data-focusable
          className="absolute z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-[opacity,transform,background-color] duration-200 active:scale-95"
          style={{
            top: 'calc(1rem + env(safe-area-inset-top, 0px))',
            left: 'calc(1rem + env(safe-area-inset-left, 0px))',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      <div
        className={`player-overlay-content text-center max-w-md w-full px-4 sm:px-6 flex flex-col items-center ${contentClassName}`}
      >
        {children}

        {onClose && showBottomAction && (
          <button
            type="button"
            onClick={onClose}
            title={closeLabel}
            aria-label={closeLabel}
            tabIndex={0}
            data-focusable
            className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-black min-h-[44px] transition-[opacity,transform,background-color] duration-200 active:scale-95"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
