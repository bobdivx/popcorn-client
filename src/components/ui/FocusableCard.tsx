import { useRef, useEffect } from 'preact/hooks';

/** Détection TV calculée une fois (évite un test UA/DOM à chaque rendu de carte). */
let cachedIsTv: boolean | null = null;
function detectTv(): boolean {
  if (cachedIsTv) return true;
  if (typeof document === 'undefined') return false;
  const tv =
    document.body?.dataset?.tv === 'true' ||
    navigator.userAgent.toLowerCase().includes('tv') ||
    !!document.body?.classList.contains('tv-platform');
  // Ne mémoriser que le « oui » : le marquage TV du <body> peut arriver après le 1er rendu.
  if (tv) cachedIsTv = true;
  return tv;
}

interface FocusableCardProps {
  children: preact.ComponentChildren;
  className?: string;
  style?: preact.JSX.CSSProperties;
  onClick?: (e: MouseEvent | KeyboardEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  href?: string;
  tabIndex?: number;
  /** Libellé pour la télécommande / lecteur d'écran (ex. titre du média) */
  ariaLabel?: string;
  /** Désactive focus:scale (évite le chevauchement des tuiles browse). */
  noScale?: boolean;
  /** Marque l’élément focusable comme carte torrent (outline TV sur le wrapper). */
  asTorrentCard?: boolean;
  /** Cible principale d'une ligne [data-tv-list-item] (téléchargements). */
  listPrimary?: boolean;
}

/**
 * Composant wrapper pour cartes avec gestion du focus pour Android TV
 */
export function FocusableCard({ 
  children, 
  className = '',
  style,
  onClick,
  onFocus,
  onBlur,
  href,
  tabIndex = 0,
  ariaLabel,
  noScale = false,
  asTorrentCard = false,
  listPrimary = false,
}: FocusableCardProps) {
  const cardRef = useRef<HTMLDivElement | HTMLAnchorElement>(null);
  // Handlers lus via ref : les écouteurs DOM ne sont posés qu'une fois (pas de detach/attach
  // à chaque rendu quand le parent passe une closure inline).
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const hrefRef = useRef(href);
  hrefRef.current = href;

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    // Gestion du clavier pour TV
    const handleKeyPress = (evt: Event) => {
      const e = evt as KeyboardEvent;
      const code = e.keyCode ?? (e as KeyboardEvent & { which?: number }).which;
      const activate =
        e.key === 'Enter' ||
        e.key === 'NumpadEnter' ||
        e.key === 'OK' ||
        e.key === 'Select' ||
        e.key === ' ' ||
        code === 13 ||
        code === 23 ||
        code === 66 ||
        code === 32;
      if (activate) {
        e.preventDefault();
        const click = onClickRef.current;
        const link = hrefRef.current;
        if (click) {
          click(e);
        } else if (link) {
          window.location.href = link;
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
  }, [noScale]);

  const isTV = detectTv();
  const scaleClass = noScale ? 'outline-none' : (isTV ? 'tv-card gtv-focusable focus:scale-105 outline-none' : 'focus:outline-none');
  const baseClasses = `group cursor-pointer ${scaleClass} ${className}`;
  const commonProps: any = {
    ref: cardRef as any,
    className: baseClasses,
    style,
    tabIndex,
    role: href ? undefined : 'button',
    'aria-label': ariaLabel ?? (href ? undefined : 'Card cliquable'),
    'data-focusable': true,
    ...(listPrimary ? { 'data-tv-list-primary': true } : {}),
    ...(asTorrentCard
      ? { 'data-torrent-card': true, 'data-focusable-card': true, 'data-browse-tile': true }
      : {}),
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
      onClick={(e) => onClickRef.current?.(e as any)}
    >
      {children}
    </div>
  );
}
