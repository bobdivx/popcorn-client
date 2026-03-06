import type { ComponentChildren } from 'preact';

interface LoadingIconProps {
  /** Contenu du cercle central : logo Popcorn (img) ou icône SVG */
  children: ComponentChildren;
  className?: string;
}

/**
 * Icône de chargement type C411 : anneaux tournants + glow pulse + cercle central.
 * Utilise les classes du design-system (loading-icon-*).
 */
export function LoadingIcon({ children, className = '' }: LoadingIconProps) {
  return (
    <div class={`loading-icon-container ${className}`.trim()} aria-hidden>
      <div class="loading-icon-ring-outer" />
      <div class="loading-icon-ring-middle" />
      <div class="loading-icon-glow" />
      <div class="loading-icon-circle">{children}</div>
    </div>
  );
}
