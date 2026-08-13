import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';

export type SettingsCardAccent = 'violet' | 'amber';

export interface SettingsCardProps {
  children: ComponentChildren;
  /** Accent violet (défaut) ou amber (CTA / Boost) */
  accent?: SettingsCardAccent;
  /** Carte imbriquée (étapes, blocs internes) — sans barre gradient */
  nested?: boolean;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Contenu à droite du header (badge, actions…) */
  headerExtra?: ComponentChildren;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'div' | 'article';
}

/**
 * Carte settings réutilisable — design Boost ratio C411
 * (glass, dégradé, barre accent, header icône).
 * Utiliser partout dans Paramètres pour une UI cohérente.
 */
export function SettingsCard({
  children,
  accent = 'violet',
  nested = false,
  icon: Icon,
  title,
  description,
  headerExtra,
  className = '',
  bodyClassName = '',
  as: Tag = 'section',
}: SettingsCardProps) {
  const hasHeader = Boolean(Icon || title || description || headerExtra);
  const frameClass = [
    'sc-frame',
    nested ? 'sc-frame--nested' : null,
    !nested && accent === 'amber' ? 'sc-frame--amber' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconClass = accent === 'amber' ? 'sc-frame-icon sc-frame-icon--amber' : 'sc-frame-icon';

  return (
    <Tag class={frameClass}>
      {hasHeader && (
        <div class="sc-frame-header">
          {Icon ? (
            <div class={iconClass}>
              <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden />
            </div>
          ) : null}
          {(title || description) && (
            <div class="min-w-0 flex-1">
              {title ? <div class="sc-frame-title">{title}</div> : null}
              {description ? <div class="sc-frame-desc">{description}</div> : null}
            </div>
          )}
          {headerExtra}
        </div>
      )}
      <div class={`sc-frame-body ${bodyClassName}`.trim()}>{children}</div>
    </Tag>
  );
}

export type SettingsNestedCardProps = Omit<SettingsCardProps, 'accent' | 'nested'> & {
  accent?: never;
};

/** Raccourci pour une carte imbriquée (étapes wizard, sous-blocs). */
export function SettingsNestedCard(props: SettingsNestedCardProps) {
  return <SettingsCard {...props} nested />;
}
