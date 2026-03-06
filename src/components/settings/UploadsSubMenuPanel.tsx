import { useState, useEffect } from 'preact/hooks';
import { ListPlus, Upload, ChevronRight, Download, ListChecks, SlidersHorizontal } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { DsCard, DsCardSection } from '../ui/design-system';

const BASE_URL = '/settings/uploads/';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type UploadItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof ListPlus;
  href: string;
  /** Si true, la carte est grisée (indexeur non configuré) */
  muted?: boolean;
};

/**
 * Menu Uploads : grille de cartes comme Téléchargements / Maintenance.
 * Chaque carte mène vers une sous-page (Torrents du client, Publication C411).
 */
export default function UploadsSubMenuPanel() {
  const { t } = useI18n();
  const [uaConfigured, setUaConfigured] = useState(false);
  const [loadingUa, setLoadingUa] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingUa(true);
    serverApi.getC411UploadCookies().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        const configured =
          Boolean(res.data.upload_assistant_enabled) && Boolean(res.data.upload_assistant_path);
        setUaConfigured(configured);
      }
      setLoadingUa(false);
    });
    return () => { cancelled = true; };
  }, []);

  const items: UploadItem[] = [
    {
      id: 'client-torrents',
      titleKey: 'settings.clientTorrentsList.title',
      descriptionKey: 'settings.clientTorrentsList.description',
      icon: ListPlus,
      href: `${BASE_URL}client-torrents/`,
    },
    {
      id: 'reseed',
      titleKey: 'settings.reseedPanel.title',
      descriptionKey: 'settings.reseedPanel.description',
      icon: Download,
      href: `${BASE_URL}reseed/`,
    },
    {
      id: 'upload-assistant',
      titleKey: 'settings.uploadTrackerPanel.title',
      descriptionKey: 'settings.uploadTrackerPanel.description',
      icon: Upload,
      href: `${BASE_URL}upload-assistant/`,
      muted: !loadingUa && !uaConfigured,
    },
    {
      id: 'upload-trackers',
      titleKey: 'settings.uploadTrackerPanel.manageTrackersTitle',
      descriptionKey: 'settings.uploadTrackerPanel.manageTrackersDescription',
      icon: SlidersHorizontal,
      href: `${BASE_URL}trackers/`,
    },
    {
      id: 'my-uploads',
      titleKey: 'settings.myUploadsPanel.title',
      descriptionKey: 'settings.myUploadsPanel.description',
      icon: ListChecks,
      href: `${BASE_URL}my-uploads/`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {items.map((item) => {
        const Icon = item.icon;
        const muted = item.muted ?? false;
        return (
          <a
            key={item.id}
            href={item.href}
            data-astro-prefetch="hover"
            data-settings-card
            className={`block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible ${muted ? 'opacity-70' : ''}`}
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
