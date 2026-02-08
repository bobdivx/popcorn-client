import { Globe, Moon } from 'lucide-preact';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import UiPreferencesPanel from './UiPreferencesPanel';

const INTERFACE_ITEMS: SubMenuItem[] = [
  {
    id: 'language',
    titleKey: 'account.language',
    descriptionKey: 'account.languageDescription',
    icon: Globe,
    permission: 'settings.ui_preferences',
    inlineContent: () => <UiPreferencesPanel section="language" />,
  },
  {
    id: 'theme',
    titleKey: 'interfaceSettings.theme',
    descriptionKey: 'interfaceSettings.themeDescription',
    icon: Moon,
    permission: 'settings.ui_preferences',
    inlineContent: () => <UiPreferencesPanel section="theme" />,
  },
];

export default function InterfaceSubMenuPanel() {
  const visibleItems = INTERFACE_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={INTERFACE_ITEMS} visibleItems={visibleItems} />;
}
