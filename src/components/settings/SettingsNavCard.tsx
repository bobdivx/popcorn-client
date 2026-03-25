import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { ChevronRight } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export type NavCardAccent = 'violet' | 'green' | 'yellow' | 'red';

export interface NavCardBadge {
  text: string;
  variant?: 'subscription' | 'warning' | 'beta';
}

interface BaseProps {
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: NavCardAccent;
  /** Badge affiché dans le footer (ex : "Abonnement requis") */
  badge?: NavCardBadge;
  /** Remplace le ChevronRight — ex : badge d'état de l'abonnement */
  rightSlot?: ComponentChildren;
}

/** Carte navigable via `<a href>` */
export interface SettingsNavCardLinkProps extends BaseProps {
  href: string;
  onClick?: never;
  isExternal?: boolean;
  /** Clic sur le lien (ex. navigation SPA query-only : appeler preventDefault) */
  onLinkClick?: (e: JSX.TargetedMouseEvent<HTMLAnchorElement>) => void;
}

/** Carte navigable via `<button onClick>` (sous-panel inline) */
export interface SettingsNavCardButtonProps extends BaseProps {
  onClick: () => void;
  href?: never;
  isExternal?: never;
}

export type SettingsNavCardProps = SettingsNavCardLinkProps | SettingsNavCardButtonProps;

function CardInner({
  icon: Icon,
  title,
  description,
  accent = 'violet',
  badge,
  rightSlot,
}: BaseProps) {
  const { t } = useI18n();
  return (
    <div class="sc-nav-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div class={`sc-nav-icon sc-nav-icon--${accent}`}>
          <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden />
        </div>
        <div class="sc-nav-chevron">
          {rightSlot ?? <ChevronRight className="w-5 h-5 mt-0.5" aria-hidden />}
        </div>
      </div>
      <div class="sc-nav-title">{title}</div>
      <div class="sc-nav-desc">{description}</div>
      <div class="sc-nav-footer" aria-hidden>
        {badge && (
          <span class={`sc-nav-badge sc-nav-badge--${badge.variant ?? 'subscription'}`}>
            {badge.text}
          </span>
        )}
        <span class="sc-nav-open">{t('common.open')}</span>
      </div>
    </div>
  );
}

export function SettingsNavCard(props: SettingsNavCardProps) {
  if ('href' in props && props.href) {
    const { href, isExternal, icon, title, description, accent, badge, rightSlot, onLinkClick } = props;
    const externalProps = isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {};
    return (
      <a
        href={href}
        data-astro-prefetch={isExternal ? undefined : 'hover'}
        data-settings-card
        data-focusable
        class="sc-nav-link"
        tabIndex={0}
        onClick={onLinkClick}
        {...externalProps}
      >
        <CardInner
          icon={icon}
          title={title}
          description={description}
          accent={accent}
          badge={badge}
          rightSlot={rightSlot}
        />
      </a>
    );
  }

  const { onClick, icon, title, description, accent, badge, rightSlot } = props as SettingsNavCardButtonProps;
  return (
    <button
      type="button"
      onClick={onClick}
      data-settings-card
      data-focusable
      class="sc-nav-btn"
      tabIndex={0}
    >
      <CardInner
        icon={icon}
        title={title}
        description={description}
        accent={accent}
        badge={badge}
        rightSlot={rightSlot}
      />
    </button>
  );
}
