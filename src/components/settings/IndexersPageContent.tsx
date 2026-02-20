import { useI18n } from '../../lib/i18n/useI18n';
import { Film, Search } from 'lucide-preact';
import { DsSettingsSectionCard } from '../ui/design-system';
import TmdbConfig from './TmdbConfig';
import IndexersManager from './IndexersManager';

/**
 * Contenu de la page Paramètres → Indexers.
 * Utilise le même design de carte que la Vue d'ensemble (DsSettingsSectionCard).
 */
export default function IndexersPageContent() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 sm:space-y-8">
      <DsSettingsSectionCard
        icon={Film}
        title={t('settingsMenu.tmdb.title')}
        accent="violet"
      >
        <TmdbConfig embedded />
      </DsSettingsSectionCard>

      <DsSettingsSectionCard
        icon={Search}
        title={t('settingsMenu.indexers.title')}
        accent="violet"
      >
        <IndexersManager />
      </DsSettingsSectionCard>
    </div>
  );
}
