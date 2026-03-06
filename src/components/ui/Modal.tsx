import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: preact.ComponentChildren;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

/**
 * Composant Modal TV-compatible avec focus trap et navigation clavier
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className = '',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Focus trap : empêcher le focus de sortir du modal
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [data-focusable]'
    );

    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTabKey);

    // Focus le premier élément focusable
    setTimeout(() => {
      firstFocusable?.focus();
    }, 100);

    return () => {
      modal.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  // Sauvegarder l'élément actif avant l'ouverture
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      // Restaurer le focus après fermeture
      if (previousActiveElementRef.current) {
        setTimeout(() => {
          previousActiveElementRef.current?.focus();
        }, 100);
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Gérer Escape pour fermer
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeOnEscape, onClose]);

  // Animation d'entrée/sortie
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-full sm:max-w-md',
    md: 'max-w-full sm:max-w-lg',
    lg: 'max-w-full sm:max-w-2xl',
    xl: 'max-w-full sm:max-w-4xl',
    full: 'max-w-full',
  };

  const node = (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[9999] flex items-stretch sm:items-center justify-center p-0 sm:p-4 ${
        isAnimating ? 'animate-fade-in' : ''
      }`}
      style={{ zIndex: 2147483647 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal : style glass (C411) avec bordure violette + barre gradient */}
      <div
        ref={modalRef}
        className={`relative z-10 w-full ${sizeClasses[size]} ds-modal-glass flex flex-col h-full sm:h-auto max-h-[100vh] sm:max-h-[92vh] ${
          'scale-100 opacity-100'
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barre gradient en tête */}
        <div className="ds-card-bar flex-shrink-0" aria-hidden />
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between ds-card-section border-b border-[var(--ds-border)] pb-4">
            <h2
              id="modal-title"
              className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg truncate pr-2"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-overlay)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
              aria-label="Fermer"
              tabIndex={0}
              data-focusable
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="ds-card-section flex-1 min-h-0 overflow-y-auto overscroll-contain pt-0">
          {children}
        </div>
      </div>
    </div>
  );

  // Important: portal vers <body> pour éviter les stacking contexts
  // (ex: header fixed / parents transform) qui peuvent passer au-dessus de la modal.
  if (typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }

  return node;
}