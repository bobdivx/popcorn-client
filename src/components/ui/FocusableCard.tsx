import { useRef, useEffect } from 'preact/hooks';

interface FocusableCardProps {
  children: preact.ComponentChildren;
  className?: string;
  onClick?: (e: MouseEvent | KeyboardEvent) => void;
  href?: string;
  tabIndex?: number;
}

/**
 * Composant wrapper pour cartes avec gestion du focus pour Android TV
 */
export function FocusableCard({ 
  children, 
  className = '', 
  onClick,
  href,
  tabIndex = 0 
}: FocusableCardProps) {
  const cardRef = useRef<HTMLDivElement | HTMLAnchorElement>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    // Gestion du clavier pour TV
    const handleKeyPress = (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (onClick) {
          onClick(e);
        } else if (href) {
          window.location.href = href;
        }
      }
    };

    // Gestion du focus avec scrollIntoView pour TV
    const handleFocus = () => {
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'nearest'
        });
        // Assurer que l'élément est toujours visible avec z-index
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

  const baseClasses = `card-tv focus-tv-glow transition-all duration-300 ${className}`;
  const commonProps: any = {
    ref: cardRef as any,
    className: baseClasses,
    tabIndex,
    role: href ? undefined : 'button',
    'aria-label': href ? undefined : 'Card cliquable',
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
