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
  }, [onClick, href]);

  const baseClasses = `card-tv focus-tv-glow ds-focus-glow ds-active-glow transition-all duration-300 ${className}`;
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
      <a href={href} {...commonProps}>
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
