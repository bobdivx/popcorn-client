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
    try {
      if (sessionStorage.getItem('popcorn_demo_leaving') === '1') {
        sessionStorage.removeItem('popcorn_demo_leaving');
        setDemoMode(false);
        window.location.replace(`${window.location.origin}/`);
        return;
      }
    } catch {
      // ignore
    }
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
