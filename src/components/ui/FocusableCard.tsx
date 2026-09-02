import { useRef, useEffect } from 'preact/hooks';

interface FocusableCardProps {
  children: preact.ComponentChildren;
  className?: string;
  onClick?: (e: MouseEvent | KeyboardEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  href?: string;
  tabIndex?: number;
  /** Libellé pour la télécommande / lecteur d'écran (ex. titre du média) */
  ariaLabel?: string;
  /** Désactive focus:scale (évite le chevauchement des tuiles browse). */
  noScale?: boolean;
}

/**
 * Composant wrapper pour cartes avec gestion du focus pour Android TV
 */
export function FocusableCard({ 
  children, 
  className = '', 
  onClick,
  onFocus,
  onBlur,
  href,
  tabIndex = 0,
  ariaLabel,
  noScale = false,
}: FocusableCardProps) {
  const cardRef = useRef<HTMLDivElement | HTMLAnchorElement>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    // Gestion du clavier pour TV
    const handleKeyPress = (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === 'OK' || e.key === 'Select' || e.key === ' ') {
        e.preventDefault();
        if (onClick) {
          onClick(e);
        } else if (href) {
          window.location.href = href;
        }
      }
    };

    // Gestion du focus pour TV - assurer visibilité et z-index
    const handleFocus = () => {
      if (noScale) return;
      if (typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
        return;
      }
      if (element) {
        element.style.zIndex = '10';
      }
    };

    // Gestion du blur pour réinitialiser z-index
    const handleBlur = () => {
      if (element) {
        element.style.zIndex = '';
      }
    };

    element.addEventListener('keydown', handleKeyPress);
    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    return () => {
      element.removeEventListener('keydown', handleKeyPress);
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
    };
  }, [onClick, href, noScale]);

  const isTV = typeof document !== 'undefined' && (document.body?.dataset?.tv === 'true' || navigator.userAgent.toLowerCase().includes('tv') || document.body?.classList.contains('tv-platform'));
  const scaleClass = noScale ? 'outline-none' : (isTV ? 'tv-card gtv-focusable focus:scale-105 outline-none' : 'focus:outline-none');
  const baseClasses = `group cursor-pointer ${scaleClass} ${className}`;
  const commonProps: any = {
    ref: cardRef as any,
    className: baseClasses,
    tabIndex,
    role: href ? undefined : 'button',
    'aria-label': ariaLabel ?? (href ? undefined : 'Card cliquable'),
    'data-focusable': true,
    onFocus,
    onBlur,
  };

  if (href) {
    return (
      <a href={href} draggable={false} {...commonProps}>
        {children}
      </a>
    );
  }

  return (
    <div
      {...commonProps}
      onClick={(e) => onClick?.(e as any)}
    >
      {children}
    </div>
  );
}
