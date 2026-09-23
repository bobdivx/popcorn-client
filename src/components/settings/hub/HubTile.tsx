import type { ComponentType } from 'preact';
import { useState } from 'preact/hooks';

export type HubStatus = 'connected' | 'limited' | 'disabled';

type IconType = ComponentType<any>;

type Common = {
  title: string;
  hint?: string;
  meta?: string;
  status?: HubStatus;
  statusLabel?: string;
  icon?: IconType;
  initial?: string;
  faviconUrl?: string;
  index?: number;
};

type LinkTile = Common & {
  href: string;
  onClick?: (e: MouseEvent) => void;
  isExternal?: boolean;
};

type ButtonTile = Common & {
  onClick: () => void;
  href?: never;
};

export type HubTileProps = LinkTile | ButtonTile;

function TileFace({
  title,
  hint,
  meta,
  status,
  statusLabel,
  icon: Icon,
  initial,
  faviconUrl,
}: Common) {
  const [iconFailed, setIconFailed] = useState(false);
  const letter = (initial || title || '?').trim().charAt(0).toUpperCase();
  return (
    <>
      <span class="hub-tile-icon">
        {faviconUrl && !iconFailed ? (
          <img src={faviconUrl} alt="" onError={() => setIconFailed(true)} />
        ) : Icon ? (
          <Icon strokeWidth={1.8} />
        ) : (
          <span class="hub-tile-initial">{letter}</span>
        )}
        {status ? (
          <span class={`hub-dot hub-dot--${status}`} title={statusLabel || status} />
        ) : null}
      </span>
      <span class="hub-tile-copy">
        <span class="hub-tile-title">{title}</span>
        {status && statusLabel ? (
          <span class={`hub-tile-status hub-tile-status--${status}`}>{statusLabel}</span>
        ) : hint ? (
          <span class="hub-tile-hint">{hint}</span>
        ) : (
          <span class="hub-tile-reserve" aria-hidden />
        )}
        {meta ? <span class="hub-tile-meta">{meta}</span> : null}
      </span>
    </>
  );
}

export function HubTile(props: HubTileProps) {
  const face = (
    <TileFace
      title={props.title}
      hint={props.hint}
      meta={props.meta}
      status={props.status}
      statusLabel={props.statusLabel}
      icon={props.icon}
      initial={props.initial}
      faviconUrl={props.faviconUrl}
    />
  );

  if ('href' in props && props.href) {
    const external = props.isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {};
    return (
      <div class="hub-tile-cell" data-tv-list-item>
        <a
          href={props.href}
          class="hub-tile"
          data-settings-card
          data-focusable
          data-tv-list-primary
          tabIndex={0}
          onClick={props.onClick}
          {...external}
        >
          {face}
        </a>
      </div>
    );
  }

  return (
    <div class="hub-tile-cell" data-tv-list-item>
      <button
        type="button"
        class="hub-tile"
        data-settings-card
        data-focusable
        data-tv-list-primary
        tabIndex={0}
        onClick={(props as ButtonTile).onClick}
      >
        {face}
      </button>
    </div>
  );
}

export function HubAddTile({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const face = (
    <>
      <span class="hub-tile-icon" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 5v18M5 14h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      <span class="hub-tile-copy">
        <span class="hub-tile-title">{label}</span>
        <span class="hub-tile-reserve" aria-hidden />
      </span>
    </>
  );
  if (href) {
    return (
      <div class="hub-tile-cell" data-tv-list-item>
        <a href={href} class="hub-tile hub-tile--add" data-focusable data-tv-list-primary tabIndex={0}>
          {face}
        </a>
      </div>
    );
  }
  return (
    <div class="hub-tile-cell" data-tv-list-item>
      <button type="button" class="hub-tile hub-tile--add" data-focusable data-tv-list-primary tabIndex={0} onClick={onClick}>
        {face}
      </button>
    </div>
  );
}

export function HubGrid({
  children,
  variant = 'page',
}: {
  children: preact.ComponentChildren;
  variant?: 'page' | 'modal';
}) {
  return (
    <div class={variant === 'modal' ? 'hub-grid hub-grid--modal' : 'hub-grid'} data-tv-list role="list">
      {children}
    </div>
  );
}

export function HubSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div class="hub-grid" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} class="hub-skel" />
      ))}
    </div>
  );
}
