import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { HubTile, type HubStatus } from './hub/HubTile';

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
  badge?: NavCardBadge;
  rightSlot?: ComponentChildren;
  status?: HubStatus;
  statusLabel?: string;
  meta?: string;
}

export interface SettingsNavCardLinkProps extends BaseProps {
  href: string;
  onClick?: never;
  isExternal?: boolean;
  onLinkClick?: (e: MouseEvent) => void;
}

export interface SettingsNavCardButtonProps extends BaseProps {
  onClick: () => void;
  href?: never;
  isExternal?: never;
}

export type SettingsNavCardProps = SettingsNavCardLinkProps | SettingsNavCardButtonProps;

export function SettingsNavCard(props: SettingsNavCardProps) {
  const { t } = useI18n();
  const status: HubStatus | undefined =
    props.status ?? (props.badge ? 'limited' : undefined);
  const statusLabel =
    props.statusLabel ??
    (props.badge ? props.badge.text : undefined) ??
    (props.status === 'connected'
      ? t('settingsMenu.hub.connected')
      : props.status === 'limited'
        ? t('settingsMenu.hub.limited')
        : props.status === 'disabled'
          ? t('settingsMenu.hub.disabled')
          : undefined);

  const hint = status ? undefined : props.description;
  const meta = props.meta ?? (status ? props.description : undefined);

  if ('href' in props && props.href) {
    return (
      <HubTile
        href={props.href}
        isExternal={props.isExternal}
        onClick={props.onLinkClick}
        icon={props.icon}
        title={props.title}
        hint={hint}
        meta={meta}
        status={status}
        statusLabel={statusLabel}
      />
    );
  }

  const buttonProps = props as SettingsNavCardButtonProps;
  return (
    <HubTile
      onClick={buttonProps.onClick}
      icon={props.icon}
      title={props.title}
      hint={hint}
      meta={meta}
      status={status}
      statusLabel={statusLabel}
    />
  );
}
