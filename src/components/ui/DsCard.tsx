import type { ComponentChildren } from 'preact';

interface DsCardProps {
  children: ComponentChildren;
  /** Variante visuelle */
  variant?: 'elevated' | 'accent';
  /** Padding réduit sur mobile */
  className?: string;
  /** Pour cartes cliquables */
  as?: 'div' | 'section' | 'article' | 'button';
  onClick?: (e: Event) => void;
  role?: string;
}

export function DsCard({
  children,
  variant = 'elevated',
  className = '',
  as: Component = 'div',
  onClick,
  role,
}: DsCardProps) {
  const baseClass = variant === 'accent' ? 'ds-card ds-card-accent' : 'ds-card';
  return (
    <Component
      class={`${baseClass} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? role ?? 'button' : role}
      type={Component === 'button' ? 'button' : undefined}
    >
      {children}
    </Component>
  );
}

interface DsCardSectionProps {
  children: ComponentChildren;
  /** Titre optionnel de la section */
  title?: string;
  className?: string;
}

export function DsCardSection({ children, title, className = '' }: DsCardSectionProps) {
  return (
    <div class={`ds-card-section ${className}`.trim()}>
      {title && <h3 class="ds-title-section">{title}</h3>}
      {children}
    </div>
  );
}
