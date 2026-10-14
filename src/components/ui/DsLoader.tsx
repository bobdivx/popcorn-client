import type { ComponentChildren } from 'preact';

export type DsLoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface DsLoaderProps {
  size?: DsLoaderSize;
  text?: string;
  className?: string;
  /** Conservé pour compatibilité (le loader éditorial n'affiche plus de logo). */
  withLogo?: boolean;
  /** Contenu optionnel affiché au-dessus du trait (icône custom). */
  children?: ComponentChildren;
}

/**
 * Indicateur de chargement unique de l’app (style éditorial, identique à l’écran de démarrage) :
 * - xs / sm : anneau fin corail (boutons, chips, cartes) ;
 * - md / lg / xl : trait corail animé + libellé en capitales espacées (overlays, pages, lecteur).
 */
export function DsLoader({ size = 'lg', text, className = '', children }: DsLoaderProps) {
  if (size === 'xs' || size === 'sm') {
    return (
      <span
        class={`ed-spinner ed-spinner--${size} ${className}`.trim()}
        role="status"
        aria-busy="true"
        aria-label={text || undefined}
      />
    );
  }
  return (
    <div
      class={`ed-loader ed-loader--${size} ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={text || undefined}
    >
      {children ? <div class="ed-loader__core">{children}</div> : null}
      <div class="ed-loader__line" />
      {text ? <p class="ed-loader__label">{text}</p> : null}
    </div>
  );
}

export default DsLoader;
