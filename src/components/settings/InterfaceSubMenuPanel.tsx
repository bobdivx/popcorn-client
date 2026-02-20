import { Globe, Moon } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsSettingsSectionCard } from '../ui/design-system';
import UiPreferencesPanel from './UiPreferencesPanel';

export default function InterfaceSubMenuPanel() {
  const { t } = useI18n();
  if (!canAccess('settings.ui_preferences' as any)) return null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <DsSettingsSectionCard
        icon={Globe}
        title={t('account.language')}
        accent="violet"
      >
        <UiPreferencesPanel section="language" embedded />
      </DsSettingsSectionCard>

      <DsSettingsSectionCard
        icon={Moon}
        title={t('interfaceSettings.theme')}
        accent="violet"
      >
        <UiPreferencesPanel section="theme" embedded />
      </DsSettingsSectionCard>
    </div>
  );
}
