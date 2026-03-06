import { useState, useEffect } from 'preact/hooks';
import { HardDrive, ExternalLink, ChevronRight, ArrowLeft, Shield } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { getBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';
import LibRbitSettings from './LibRbitSettings';

const BASE_URL = '/settings/downloads/';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type DownloadItem =
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof HardDrive;
      permission?: string;
      kind: 'link';
      href: string;
      isExternal?: boolean;
    }
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof HardDrive;
      permission?: string;
      kind: 'sub';
      sub: string;
    };

function getSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'librqbit' ? sub : null;
}

export default function DownloadsSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getSubFromUrl);
  const [librqbitWebHref, setLibrqbitWebHref] = useState('#');

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const base = (getBackendUrl() || serverApi.getServerUrl() || '').trim().replace(/\/$/, '');
    setLibrqbitWebHref(base ? `${base}/librqbit/web/` : '#');
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  const items: DownloadItem[] = [
    {
      id: 'ratio',
      titleKey: 'ratioAdmin.title',
      descriptionKey: 'ratioAdmin.subtitle',
      icon: Shield,
      permission: 'settings.server',
      kind: 'link',
      href: '/settings/ratio/',
    },
    {
      id: 'librqbit',
      titleKey: 'settingsMenu.librqbit.title',
      descriptionKey: 'settingsMenu.librqbit.description',
      icon: HardDrive,
      permission: 'settings.server',
      kind: 'sub',
      sub: 'librqbit',
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

  if (sub === 'librqbit') {
    const item = items.find((i) => i.id === 'librqbit')!;
    const Icon = item.icon;
    return (
      <div className="space-y-6">
        <a
          href={BASE_URL}
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
            <LibRbitSettings />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const Icon = item.icon;
        const href = item.kind === 'link' ? item.href : `${BASE_URL}?sub=${(item as { sub: string }).sub}`;
        const external = item.kind === 'link' && item.isExternal
          ? { target: '_blank' as const, rel: 'noopener noreferrer' }
          : {};
        return (
          <a
            key={item.id}
            href={href}
            {...external}
            data-astro-prefetch={item.kind === 'sub' ? 'hover' : undefined}
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
