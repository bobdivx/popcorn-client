import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { DsCard, DsCardSection } from './DsCard';

const ACCENT_ICON_BG: Record<string, string> = {
  violet: 'var(--ds-accent-violet-muted)',
  green: 'rgba(200, 230, 201, 0.35)',
  yellow: 'rgba(255, 249, 196, 0.4)',
};
const ACCENT_ICON_COLOR: Record<string, string> = {
  violet: 'var(--ds-accent-violet)',
  green: 'var(--ds-accent-green)',
  yellow: '#c9b800',
};

export type SettingsSectionCardAccent = 'violet' | 'green' | 'yellow';
export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'neutral';

export interface DsSettingsSectionCardProps {
  /** Icône affichée dans le bloc coloré (comme Vue d'ensemble) */
  icon: LucideIcon;
  /** Titre de la section */
  title: string;
  /** Couleur d'accent de l'icône (défaut: violet) */
  accent?: SettingsSectionCardAccent;
  /** Badge de statut optionnel sous le titre */
  statusBadge?: { text: string; variant?: StatusBadgeVariant };
  /** Contenu de la carte */
  children: ComponentChildren;
  /** Variante de la carte (glass = style C411) */
  cardVariant?: 'elevated' | 'glass';
  /** Afficher la barre gradient en tête (style C411) */
  showBar?: boolean;
  /** Classes additionnelles sur la carte */
  className?: string;
  /** Classes additionnelles sur la section */
  sectionClassName?: string;
}

/**
 * Carte de section Paramètres — même design que les cartes de la Vue d'ensemble :
 * icône dans un bloc coloré, titre, optionnel badge, puis contenu.
 * À utiliser sur toutes les sous-pages (Indexers, Interface, etc.) pour une UI cohérente.
 */
export function DsSettingsSectionCard({
  icon: Icon,
  title,
  accent = 'violet',
  statusBadge,
  children,
  cardVariant = 'elevated',
  showBar = false,
  className = '',
  sectionClassName = '',
}: DsSettingsSectionCardProps) {
  const iconBg = ACCENT_ICON_BG[accent] ?? ACCENT_ICON_BG.violet;
  const iconColor = ACCENT_ICON_COLOR[accent] ?? ACCENT_ICON_COLOR.violet;

  return (
    <DsCard variant={cardVariant} className={`min-w-0 overflow-hidden ${className}`.trim()}>
      {showBar && <div className="ds-card-bar flex-shrink-0" aria-hidden />}
      <DsCardSection className={`flex flex-col min-h-[120px] min-w-0 overflow-hidden ${sectionClassName}`.trim()}>
        <div className="flex items-start justify-between gap-3">
          <span
            className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
            style={{ backgroundColor: iconBg, color: iconColor }}
            aria-hidden
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
          </span>
        </div>
        <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
          {title}
        </h2>
        {statusBadge ? (
          <span
            className={`ds-status-badge ds-status-badge--${statusBadge.variant ?? 'neutral'} mt-3 w-fit`}
            aria-hidden
          >
            {statusBadge.text}
          </span>
        ) : null}
        <div className="mt-4 flex-1 min-w-0">{children}</div>
      </DsCardSection>
    </DsCard>
  );
}
