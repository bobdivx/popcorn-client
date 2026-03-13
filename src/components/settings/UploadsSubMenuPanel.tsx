import { useState, useEffect } from 'preact/hooks';
import { Upload, Download, ListChecks, SlidersHorizontal, Activity } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { SettingsNavCard } from './SettingsNavCard';

const BASE_URL = '/settings/uploads/';

type UploadItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Upload;
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
      id: 'seeding-diagnostic',
      titleKey: 'settings.seedingDiagnostic.title',
      descriptionKey: 'settings.seedingDiagnostic.description',
      icon: Activity,
      href: `${BASE_URL}seeding-diagnostic/`,
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
      {items.map((item) => (
        <div key={item.id} style={item.muted ? 'opacity:0.6;pointer-events:none;' : undefined}>
          <SettingsNavCard
            href={item.href}
            icon={item.icon}
            title={t(item.titleKey)}
            description={t(item.descriptionKey)}
          />
        </div>
      ))}
    </div>
  );
}
