import type { ComponentChildren } from 'preact';

export type DsLoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface DsLoaderProps {
  size?: DsLoaderSize;
  text?: string;
  className?: string;
  /** Forcer le logo (md+ par défaut). Ignoré si `children` est fourni. */
  withLogo?: boolean;
  /** Contenu du centre (icône custom). */
  children?: ComponentChildren;
}

const LOGO_BY_DEFAULT: Record<DsLoaderSize, boolean> = {
  xs: false,
  sm: false,
  md: true,
  lg: true,
  xl: true,
};

/**
 * Indicateur de chargement unique de l’app : arc conique + logo statique.
 * xs = bouton · sm = chip / carte · md = overlay · lg/xl = page / lecteur.
 */
export function DsLoader({
  size = 'lg',
  text,
  className = '',
  withLogo,
  children,
}: DsLoaderProps) {
  const showCore =
    size !== 'xs' && (children != null || (withLogo ?? LOGO_BY_DEFAULT[size]));

  return (
    <div
      class={`ds-loader ds-loader--${size} ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={text || undefined}
    >
      <div class="ds-loader-mark">
        <div class="ds-loader-track" />
        <div class="ds-loader-spin" />
        {showCore && (
          <div class="ds-loader-core">
            {children ?? (
              <img src="/popcorn_logo.png" alt="" class="ds-loader-logo loading-icon-logo" />
            )}
          </div>
        )}
      </div>
      {text ? <p class="ds-loader-label">{text}</p> : null}
    </div>
  );
}

export default DsLoader;
