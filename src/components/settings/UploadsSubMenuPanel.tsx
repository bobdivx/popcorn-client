import { useState, useEffect } from 'preact/hooks';
import { Upload, Download, ListChecks, SlidersHorizontal, Activity, Shield } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { getCachedSubscription, hasPayingAccess, loadSubscription } from '../../lib/subscription-store';
import { SettingsNavCard } from './SettingsNavCard';

const BASE_URL = '/settings/uploads/';

type UploadItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Upload;
  href: string;
  permission?: string;
  requiresSubscription?: boolean;
};

/**
 * Menu Uploads : grille de cartes comme Téléchargements / Maintenance.
 * Chaque carte mène vers une sous-page (Torrents du client, Publication C411).
 */
export default function UploadsSubMenuPanel() {
  const { t } = useI18n();
  const [isPayingSubscriber, setIsPayingSubscriber] = useState(() => {
    const cached = getCachedSubscription();
    return cached !== null ? hasPayingAccess(cached) : false;
  });

  useEffect(() => {
    const cached = getCachedSubscription();
    if (cached !== null) {
      setIsPayingSubscriber(hasPayingAccess(cached));
      return;
    }
    loadSubscription()
      .then((data) => setIsPayingSubscriber(hasPayingAccess(data)))
      .catch(() => setIsPayingSubscriber(false));
  }, []);

  const items: UploadItem[] = [
    {
      id: 'ratio',
      titleKey: 'ratioAdmin.title',
      descriptionKey: 'ratioAdmin.subtitle',
      icon: Shield,
      href: '/settings/ratio/',
      permission: 'settings.server',
      requiresSubscription: true,
    },
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

  const visible = items.filter((item) => {
    if (item.permission && !canAccess(item.permission as any)) return false;
    if (item.requiresSubscription && !isPayingSubscriber) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => (
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
