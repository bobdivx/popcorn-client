import { Upload, Download, ListChecks, SlidersHorizontal, Activity } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { SettingsNavCard } from './SettingsNavCard';

const BASE_URL = '/settings/uploads/';

type UploadItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Upload;
  href: string;
};

/**
 * Menu Uploads : grille de cartes comme Téléchargements / Maintenance.
 * Chaque carte mène vers une sous-page (Torrents du client, Publication C411).
 */
export default function UploadsSubMenuPanel() {
  const { t } = useI18n();

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
        <SettingsNavCard
          key={item.id}
          href={item.href}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
        />
      ))}
    </div>
  );
}
