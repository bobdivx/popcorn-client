import { useState, useEffect } from 'preact/hooks';
import { Film, Search, RefreshCw, Layers, ChevronRight, ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';
import TmdbConfig from './TmdbConfig';
import TorrentSyncManager from './TorrentSyncManager';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

const CONTENT_BASE = '/settings/content';

type ContentLinkItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Film;
  permission?: string;
  href: string;
  isExternal?: boolean;
};

const CONTENT_ITEMS: ContentLinkItem[] = [
  {
    id: 'tmdb',
    titleKey: 'settingsMenu.tmdb.title',
    descriptionKey: 'settingsMenu.tmdb.description',
    icon: Film,
    permission: 'settings.indexers',
    href: `${CONTENT_BASE}?sub=tmdb`,
  },
  {
    id: 'indexers',
    titleKey: 'settingsMenu.indexersConfigured.title',
    descriptionKey: 'settingsMenu.indexersConfigured.description',
    icon: Search,
    permission: 'settings.indexers',
    href: '/settings/indexers',
  },
  {
    id: 'sync-categories',
    titleKey: 'settingsMenu.syncCategories.title',
    descriptionKey: 'settingsMenu.syncCategories.description',
    icon: Layers,
    permission: 'settings.indexers',
    href: '/settings/sync',
  },
  {
    id: 'sync',
    titleKey: 'settingsMenu.sync.title',
    descriptionKey: 'settingsMenu.sync.description',
    icon: RefreshCw,
    permission: 'settings.sync',
    href: `${CONTENT_BASE}?sub=sync`,
  },
];

function getContentSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'tmdb' || sub === 'sync' ? sub : null;
}

export default function ContentSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getContentSubFromUrl);

  useEffect(() => {
    setSub(getContentSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getContentSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  const visible = CONTENT_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  // Sous-page : TMDB ou Sync
  if (sub === 'tmdb') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'tmdb')!;
    const Icon = item.icon;
    return (
      <div className="space-y-6">
        <a
          href={CONTENT_BASE}
          data-astro-prefetch
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span>{t('common.back')}</span>
        </a>
        <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
            <span
              className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
              style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
              aria-hidden
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
              <span className="ds-text-tertiary text-sm">{t(item.descriptionKey)}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 min-w-0">
            <TmdbConfig embedded />
          </div>
        </div>
      </div>
    );
  }

  if (sub === 'sync') {
    const item = CONTENT_ITEMS.find((i) => i.id === 'sync')!;
    const Icon = item.icon;
    return (
      <div className="space-y-6">
        <a
          href={CONTENT_BASE}
          data-astro-prefetch
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span>{t('common.back')}</span>
        </a>
        <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
            <span
              className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
              style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
              aria-hidden
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
              <span className="ds-text-tertiary text-sm">{t(item.descriptionKey)}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 min-w-0">
            <TorrentSyncManager />
          </div>
        </div>
      </div>
    );
  }

  // Grille de cartes cliquables (menu principal)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const Icon = item.icon;
        const external = item.isExternal
          ? { target: '_blank' as const, rel: 'noopener noreferrer' }
          : {};
        return (
          <a
            key={item.id}
            href={item.href}
            {...external}
            data-astro-prefetch={!item.isExternal ? 'hover' : undefined}
            data-settings-card
            className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
          >
            <DsCard variant="elevated" className="h-full">
              <DsCardSection className="flex flex-col h-full min-h-[120px]">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                    style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                    aria-hidden
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                </div>
                <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                  {t(item.titleKey)}
                </h2>
                <span className="ds-text-tertiary text-sm mt-3">{t(item.descriptionKey)}</span>
                <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                  {t('common.open')}
                </span>
              </DsCardSection>
            </DsCard>
          </a>
        );
      })}
    </div>
  );
}
