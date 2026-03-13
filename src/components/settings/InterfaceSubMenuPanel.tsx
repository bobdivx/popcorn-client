import { useState, useEffect } from 'preact/hooks';
import { Globe, Moon } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import UiPreferencesPanel from './UiPreferencesPanel';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const BASE_URL = '/settings/ui-preferences';

type InterfaceItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Globe;
  sub: string;
};

const INTERFACE_ITEMS: InterfaceItem[] = [
  { id: 'language', titleKey: 'account.language', descriptionKey: 'settingsMenu.interface.languageDescription', icon: Globe, sub: 'language' },
  { id: 'theme', titleKey: 'interfaceSettings.theme', descriptionKey: 'settingsMenu.interface.themeDescription', icon: Moon, sub: 'theme' },
];

function getSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'language' || sub === 'theme' ? sub : null;
}

export default function InterfaceSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getSubFromUrl);

  useEffect(() => {
    setSub(getSubFromUrl());
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

  if (!canAccess('settings.ui_preferences' as any)) return null;

  if (sub === 'language') {
    const item = INTERFACE_ITEMS.find((i) => i.id === 'language')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <UiPreferencesPanel section="language" embedded />
      </SettingsSubPageFrame>
    );
  }

  if (sub === 'theme') {
    const item = INTERFACE_ITEMS.find((i) => i.id === 'theme')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <UiPreferencesPanel section="theme" embedded />
      </SettingsSubPageFrame>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {INTERFACE_ITEMS.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={`${BASE_URL}?sub=${item.sub}`}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
        />
      ))}
    </div>
  );
}
