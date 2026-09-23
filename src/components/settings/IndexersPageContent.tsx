import { useI18n } from '../../lib/i18n/useI18n';
import IndexersManager from './IndexersManager';

export default function IndexersPageContent() {
  const { t } = useI18n();

  return (
    <div className="hub-page">
      <header className="hub-header">
        <h1 className="hub-title">{t('settingsPages.indexers.title')}</h1>
        <p className="hub-subtitle">{t('settingsPages.indexers.subtitle')}</p>
      </header>
      <IndexersManager />
    </div>
  );
}
