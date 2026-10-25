import { Fragment } from 'preact';
import type { ComponentChildren, JSX } from 'preact';

/**
 * Briques visuelles partagées par la page Paramètres > Modules (tuiles du hub + modales).
 * Design éditorial : corail #f2545b sur #0c0d10, texte #f4f1ec, titres Josefin Sans 300 en
 * capitales, corps Jost, icônes SVG, ni flou ni halo. Tailles `tv:` pour webOS.
 */
export const C = {
  accent: 'var(--ed-accent, #f2545b)',
  bg: 'var(--ed-bg, #0c0d10)',
  ink: 'var(--ed-ink, #f4f1ec)',
  display: "var(--ed-font-display, 'Josefin Sans', 'Jost', sans-serif)",
  body: "var(--ed-font-body, 'Jost', sans-serif)",
  muted: 'rgba(244, 241, 236, 0.6)',
  faint: 'rgba(244, 241, 236, 0.45)',
};

export const headingStyle: JSX.CSSProperties = {
  fontFamily: C.display,
  fontWeight: 300,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.ink,
};
export const subHeadingStyle: JSX.CSSProperties = { ...headingStyle, letterSpacing: '0.06em' };

export const focusRing =
  'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2545b]/70 focus:ring-4 focus:ring-[#f2545b]/50';
export const inputClass = `w-full min-h-[44px] tv:min-h-[56px] rounded-xl border border-white/15 px-4 tv:px-6 text-sm tv:text-lg ${focusRing}`;
export const textareaClass = `w-full rounded-xl border border-white/15 px-4 py-3 tv:px-6 text-sm tv:text-lg font-mono ${focusRing}`;
export const inputStyle: JSX.CSSProperties = { backgroundColor: C.bg, color: C.ink, fontFamily: C.body };
export const monoStyle: JSX.CSSProperties = { backgroundColor: C.bg, color: C.ink };
export const primaryBtn = `inline-flex items-center justify-center gap-2 min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full text-sm tv:text-lg font-medium disabled:opacity-50 ${focusRing}`;
export const primaryStyle: JSX.CSSProperties = { backgroundColor: C.accent, color: C.ink, fontFamily: C.body };
export const secondaryBtn = `inline-flex items-center justify-center gap-2 min-h-[40px] tv:min-h-[52px] px-4 tv:px-6 rounded-full border border-white/20 text-sm tv:text-base disabled:opacity-50 ${focusRing}`;
export const secondaryStyle: JSX.CSSProperties = { color: C.ink, fontFamily: C.body, backgroundColor: 'transparent' };
export const checkboxClass = `h-5 w-5 tv:h-7 tv:w-7 shrink-0 accent-[#f2545b] ${focusRing}`;
export const panelClass = 'rounded-xl border border-white/15 p-4 tv:p-6';

export type IconName =
  | 'module'
  | 'chip'
  | 'key'
  | 'server'
  | 'plus'
  | 'lock'
  | 'search'
  | 'download'
  | 'play'
  | 'stop'
  | 'restart'
  | 'refresh'
  | 'rollback'
  | 'trash'
  | 'log'
  | 'settings'
  | 'warning'
  | 'film'
  | 'folder'
  | 'link'
  | 'compass'
  | 'inbox'
  | 'convert'
  | 'magnet'
  | 'stream'
  | 'list'
  | 'sync'
  | 'users'
  | 'sparkle'
  | 'car'
  | 'tv'
  | 'external'
  | 'arrow';

export function Icon({ name, size = 18, strokeWidth = 1.6 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'chip':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
          <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
        </svg>
      );
    case 'key':
      return (
        <svg {...common}>
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
        </svg>
      );
    case 'server':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="7" rx="1.5" />
          <rect x="4" y="13" width="16" height="7" rx="1.5" />
          <path d="M8 7.5h.01M8 16.5h.01" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M8 5l11 7-11 7z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    case 'restart':
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
      );
    case 'rollback':
      return (
        <svg {...common}>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
        </svg>
      );
    case 'log':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
      );
    case 'film':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M15 9l-2 4-4 2 2-4z" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M4 13l2.5-7h11L20 13v6H4z" />
          <path d="M4 13h5l1 2h4l1-2h5" />
        </svg>
      );
    case 'convert':
      return (
        <svg {...common}>
          <path d="M4 8h13l-3-3M20 16H7l3 3" />
        </svg>
      );
    case 'magnet':
      return (
        <svg {...common}>
          <path d="M6 4v8a6 6 0 0 0 12 0V4" />
          <path d="M6 8h4M14 8h4M10 4v8a2 2 0 0 0 4 0V4" />
        </svg>
      );
    case 'stream':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M10 8.5l4 2.5-4 2.5zM8 21h8" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
      );
    case 'sync':
      return (
        <svg {...common}>
          <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5" />
          <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5M17.5 14.5a5.5 5.5 0 0 1 3 4.5" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z" />
          <path d="M18 16v4M16 18h4" />
        </svg>
      );
    case 'car':
      return (
        <svg {...common}>
          <path d="M5 16V12l2-5h10l2 5v4M3 12h18" />
          <rect x="3" y="12" width="18" height="5" rx="1" />
          <path d="M7 17v2M17 17v2" />
        </svg>
      );
    case 'tv':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
  }
}

/** Icônes au format attendu par `HubTile` (`icon={…}` reçoit `strokeWidth`). */
export const tileIcon = (name: IconName) => {
  const TileIcon = ({ strokeWidth }: { strokeWidth?: number }) => <Icon name={name} size={24} strokeWidth={strokeWidth} />;
  return TileIcon;
};
export const DataModuleTileIcon = tileIcon('module');
export const ProcessModuleTileIcon = tileIcon('chip');
export const TrustKeysTileIcon = tileIcon('key');
export const ServerTileIcon = tileIcon('server');

export type Notice = { kind: 'ok' | 'error'; text: string; details?: string[] } | null;

export function NoticeBanner({ notice, detailsLabel }: { notice: Notice; detailsLabel?: string }) {
  if (!notice) return null;
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      class="rounded-xl border px-4 py-3 text-sm tv:text-lg break-words"
      style={{
        borderColor: notice.kind === 'error' ? C.accent : 'rgba(244, 241, 236, 0.2)',
        color: C.ink,
        backgroundColor: notice.kind === 'error' ? 'rgba(242, 84, 91, 0.1)' : 'rgba(244, 241, 236, 0.04)',
      }}
    >
      <p>{notice.text}</p>
      {notice.details && notice.details.length > 0 && (
        <>
          {detailsLabel && (
            <p class="mt-2 text-xs tv:text-base" style={{ color: C.muted }}>
              {detailsLabel}
            </p>
          )}
          <ul class="mt-1 list-disc pl-5 text-xs tv:text-base" style={{ color: C.muted }}>
            {notice.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function WarningBox({ children }: { children: ComponentChildren }) {
  return (
    <div
      role="alert"
      class="flex gap-3 rounded-xl border px-4 py-3 text-sm tv:text-lg"
      style={{ borderColor: C.accent, backgroundColor: 'rgba(242, 84, 91, 0.08)', color: C.ink }}
    >
      <span class="shrink-0" style={{ color: C.accent }}>
        <Icon name="warning" />
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Liste « terme : valeur » des fiches détail. */
export function FactList({ rows }: { rows: Array<[string, ComponentChildren, string?] | null | false> }) {
  return (
    <dl class="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm tv:text-lg">
      {rows.map((row, i) =>
        row ? (
          <Fragment key={i}>
            <dt style={{ color: C.faint }}>{row[0]}</dt>
            <dd class={row[2] ?? 'break-words'}>{row[1]}</dd>
          </Fragment>
        ) : null
      )}
    </dl>
  );
}

export function errorMessage(
  res: { error?: string; message?: string },
  tx: { errForbidden: string; errGeneric: string }
): string {
  if (res.error === 'Forbidden' || res.error === 'Unauthorized') return tx.errForbidden;
  const msg = (res.message || '').trim();
  if (!msg || /^Erreur \d+$/.test(msg)) return tx.errGeneric;
  return msg;
}

export function formatDate(iso: string | null | undefined, language: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(ms: number, language: string): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(language === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
