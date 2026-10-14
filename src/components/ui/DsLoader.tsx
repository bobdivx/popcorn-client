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

/** « Chargement... » / « Loading… » → titre display générique. */
function isGenericLoadingText(text?: string): boolean {
  if (!text) return true;
  const cleaned = text.replace(/\.{2,}$/u, '').replace(/…$/u, '').trim().toLowerCase();
  return cleaned === 'chargement' || cleaned === 'loading';
}

/**
 * Indicateur de chargement unique de l’app (style éditorial, identique à l’écran de démarrage) :
 * - xs / sm : anneau fin corail (boutons, chips, cartes) ;
 * - md : trait corail + libellé (overlays compacts) ;
 * - lg / xl : composition page = marque + titre + trait (comme #popcorn-loading-fallback).
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

  const isPage = (size === 'lg' || size === 'xl') && children == null;

  if (isPage) {
    const subtitle = text && !isGenericLoadingText(text) ? text : null;
    return (
      <div
        class={`ed-loader ed-loader--${size} ed-loader--page ${className}`.trim()}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={text || 'Chargement'}
      >
        <div class="ed-loader__brand">Popcornn</div>
        <h1 class="ed-loader__title">Chargement</h1>
        <div class="ed-loader__line" />
        {subtitle ? <p class="ed-loader__label">{subtitle}</p> : null}
      </div>
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
