import { useEffect, useState } from 'preact/hooks';
import { exitDemoMode, isDemoMode } from '../../lib/backend-config';
import { useI18n } from '../../lib/i18n/useI18n';

/**
 * Barre fixe en bas sur mobile. Le bouton « Démo » de la navbar poussait
 * le menu hors de l'écran (overflow-x caché) : plus aucun moyen de sortir.
 */
export default function DemoExitBar() {
  const { t } = useI18n();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isDemoMode());
  }, []);

  if (!active) return null;

  return (
    <div
      data-demo-exit-bar
      className="xl:hidden fixed inset-x-0 bottom-0 z-[10001] px-3 pt-2 border-t border-amber-500/40 bg-black/85 backdrop-blur-md"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={() => exitDemoMode()}
        className="w-full min-h-12 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-base"
      >
        {t('demo.exitDemo')}
      </button>
    </div>
  );
}
