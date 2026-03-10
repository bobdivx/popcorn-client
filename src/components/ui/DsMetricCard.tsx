import type { ComponentType } from 'preact';

import type { ComponentChildren } from 'preact';

interface DsMetricCardProps {
  /** Emoji ou composant icône */
  icon: string | ComponentType<{ size?: number; strokeWidth?: number; class?: string }>;
  label: string;
  value: string | number;
  /** Couleur d'accent (bordure + valeur) — cohérent avec le design élevé */
  accent?: 'violet' | 'green' | 'yellow';
  /** Clic optionnel (affiche chevron) */
  onClick?: () => void;
  className?: string;
  /** Contenu personnalisé affiché à la place de la valeur brute (images, texte riche, etc.) */
  children?: ComponentChildren;
  /** Masque l’icône + le label dans l’en-tête quand on veut une carte très visuelle. */
  showHeader?: boolean;
}

const accentColor: Record<NonNullable<DsMetricCardProps['accent']>, string> = {
  violet: 'var(--ds-accent-violet)',
  green: 'var(--ds-accent-green)',
  yellow: 'var(--ds-accent-yellow)',
};

export function DsMetricCard({
  icon,
  label,
  value,
  accent = 'violet',
  onClick,
  className = '',
  children,
  showHeader = true,
}: DsMetricCardProps) {
  const isButton = typeof onClick === 'function';
  const Wrapper = isButton ? 'button' : 'div';
  const color = accentColor[accent];
  return (
    <Wrapper
      type={isButton ? 'button' : undefined}
      class={`ds-card ds-metric-card rounded-xl p-4 sm:p-5 text-left relative min-w-0 transition-opacity hover:opacity-95 ${isButton ? 'cursor-pointer' : ''} ${className}`.trim()}
      style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: color }}
      onClick={onClick}
    >
      {showHeader && (
        <>
          {typeof icon === 'string' ? (
            <span class="ds-metric-card__icon text-xl sm:text-2xl" style={{ color }} aria-hidden>{icon}</span>
          ) : (
            <span class="ds-metric-card__icon inline-flex" style={{ color }} aria-hidden>
              {(() => {
                const Icon = icon as ComponentType<{ size?: number; strokeWidth?: number }>;
                return <Icon size={20} strokeWidth={1.5} />;
              })()}
            </span>
          )}
          <p class="ds-text-secondary mt-1 text-xs font-medium">{label}</p>
        </>
      )}
      {children ? (
        <div class="mt-1">{children}</div>
      ) : (
        <p class="ds-metric-card__value font-bold text-xl sm:text-2xl mt-0.5 tabular-nums" style={{ color }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      )}
      {isButton && (
        <span
          class="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 bg-white/10 text-white/90"
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M17 7H7M17 7V17" />
          </svg>
        </span>
      )}
    </Wrapper>
  );
}
