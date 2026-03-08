import type { ComponentType } from 'preact';

interface DsIconButtonProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; class?: string }>;
  onClick?: (e: Event) => void;
  href?: string;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  iconClass?: string;
  disabled?: boolean;
  /** Classes CSS additionnelles (ex. sync-toolbar__btn--danger pour couleur) */
  className?: string;
  /** Pour les boutons type onglet (ex. Vue d’ensemble / Paramètres) */
  'aria-pressed'?: boolean;
}

const iconSize = { sm: 18, md: 20 };
const strokeWidth = 1.5;

export function DsIconButton(props: DsIconButtonProps) {
  const {
    icon: Icon,
    onClick,
    href,
    title,
    ariaLabel,
    size = 'md',
    iconClass = '',
    disabled = false,
    className = '',
  } = props;
  const s = iconSize[size];
  const common = {
    class: 'ds-icon-btn' + (className ? ' ' + className : '') + (disabled ? ' opacity-50 pointer-events-none' : ''),
    title,
    'aria-label': ariaLabel ?? title,
    ...(typeof props['aria-pressed'] === 'boolean' && { 'aria-pressed': props['aria-pressed'] }),
  };
  const iconEl = <Icon size={s} strokeWidth={strokeWidth} class={iconClass} />;
  if (href) {
    return (
      <a href={href} {...common} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} target={href.startsWith('http') ? '_blank' : undefined}>
        {iconEl}
      </a>
    );
  }
  return (
    <button type="button" {...common} disabled={disabled} onClick={onClick}>
      {iconEl}
    </button>
  );
}
