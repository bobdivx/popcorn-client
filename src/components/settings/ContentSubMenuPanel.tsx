import { useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Film, Search, RefreshCw, HardDrive, ExternalLink, Layers } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { getBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';
import { canAccess } from '../../lib/permissions';
import { DsSettingsSectionCard, DsCard, DsCardSection } from '../ui/design-system';
import { ChevronRight } from 'lucide-preact';
import TmdbConfig from './TmdbConfig';
import TorrentSyncManager from './TorrentSyncManager';
import LibRbitSettings from './LibRbitSettings';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type ContentItem =
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof Film;
      permission?: string;
      kind: 'link';
      href: string;
      isExternal?: boolean;
    }
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof Film;
      permission?: string;
      kind: 'inline';
      content: ComponentChildren;
    };

export default function ContentSubMenuPanel() {
  const { t } = useI18n();
  const [librqbitWebHref, setLibrqbitWebHref] = useState('#');

  useEffect(() => {
    const base = (getBackendUrl() || serverApi.getServerUrl() || '').trim().replace(/\/$/, '');
    setLibrqbitWebHref(base ? `${base}/librqbit/web/` : '#');
  }, []);

  const items: ContentItem[] = [
    {
      id: 'tmdb',
      titleKey: 'settingsMenu.tmdb.title',
      descriptionKey: 'settingsMenu.tmdb.description',
      icon: Film,
      permission: 'settings.indexers',
      kind: 'inline',
      content: <TmdbConfig embedded />,
    },
    {
      id: 'indexers',
      titleKey: 'settingsMenu.indexersConfigured.title',
      descriptionKey: 'settingsMenu.indexersConfigured.description',
      icon: Search,
      permission: 'settings.indexers',
      kind: 'link',
      href: '/settings/indexers',
    },
    {
      id: 'sync-categories',
      titleKey: 'settingsMenu.syncCategories.title',
      descriptionKey: 'settingsMenu.syncCategories.description',
      icon: Layers,
      permission: 'settings.indexers',
      kind: 'link',
      href: '/settings/sync',
    },
    {
      id: 'sync',
      titleKey: 'settingsMenu.sync.title',
      descriptionKey: 'settingsMenu.sync.description',
      icon: RefreshCw,
      permission: 'settings.sync',
      kind: 'inline',
      content: <TorrentSyncManager />,
    },
    {
      id: 'librqbit',
      titleKey: 'settingsMenu.librqbit.title',
      descriptionKey: 'settingsMenu.librqbit.description',
      icon: HardDrive,
      permission: 'settings.server',
      kind: 'inline',
      content: <LibRbitSettings />,
    },
    {
      id: 'librqbit-web',
      titleKey: 'settingsMenu.librqbitWeb.title',
      descriptionKey: 'settingsMenu.librqbitWeb.description',
      icon: ExternalLink,
      permission: 'settings.server',
      kind: 'link',
      href: librqbitWebHref,
      isExternal: true,
    },
  ];

  const visible = items.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      {visible.map((item) => {
        const Icon = item.icon;
        if (item.kind === 'link') {
          const external = item.isExternal
            ? { target: '_blank' as const, rel: 'noopener noreferrer' }
            : {};
          return (
            <a
              key={item.id}
              href={item.href}
              {...external}
              data-astro-prefetch={!item.isExternal ? 'hover' : undefined}
              className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
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
        }
        return (
          <DsSettingsSectionCard
            key={item.id}
            icon={Icon}
            title={t(item.titleKey)}
            accent="violet"
          >
            <div className="min-w-0">{item.content}</div>
          </DsSettingsSectionCard>
        );
      })}
    </div>
  );
}
