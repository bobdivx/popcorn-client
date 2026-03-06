import { useEffect } from 'preact/hooks';
import { setDemoMode } from '../lib/backend-config';
import { redirectTo } from '../lib/utils/navigation';
import { useI18n } from '../lib/i18n/useI18n';
import HLSLoadingSpinner from './ui/HLSLoadingSpinner';

/**
 * Point d'entrée de la démo : active le mode démo et redirige vers le dashboard
 * sans passage par setup/login.
 */
export default function DemoEntry() {
  const { t } = useI18n();

  useEffect(() => {
    setDemoMode(true);
    redirectTo('/dashboard');
  }, []);

  return (
    <div className="flex justify-center items-center min-h-screen bg-base-100">
      <div className="text-center max-w-md mx-4">
        <HLSLoadingSpinner size="lg" text={t('demo.entryLoading')} />
      </div>
    </div>
  );
}
