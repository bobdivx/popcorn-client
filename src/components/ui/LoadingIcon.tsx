import type { ComponentChildren } from 'preact';
import { DsLoader } from './DsLoader';

interface LoadingIconProps {
  /** Contenu du cercle central : logo Popcorn (img) ou icône SVG */
  children: ComponentChildren;
  className?: string;
}

/**
 * Icône de chargement (cartes / overlays) — même animation que `DsLoader`.
 */
export function LoadingIcon({ children, className = '' }: LoadingIconProps) {
  return (
    <DsLoader size="lg" withLogo={false} className={`ds-loader--block ${className}`.trim()}>
      {children}
    </DsLoader>
  );
}
