import { AlertTriangle, X } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';

const POLL_INTERVAL_MS = 15_000; // 15 secondes

/**
 * Banner d'avertissement non-bloquant affiché quand le backend signale un transcodage lourd.
 * Affiche un warning clair : "Transcodage lourd en cours — la lecture peut être bloquée ou lente"
 */
export default function TranscodeWarningBanner() {
  const { t } = useI18n();
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await serverApi.getTranscodeJobs();
        if (res.success && res.data?.resources?.heavy_transcode_warning) {
          setShowWarning(true);
        } else {
          setShowWarning(false);
          // Si le warning disparaît, permettre de le réafficher plus tard
          setDismissed(false);
        }
      } catch {
        // Silently fail - ne pas polluer les logs
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (!showWarning || dismissed) return null;

  return (
    <div
      className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-2xl w-full mx-4"
      role="alert"
      aria-live="polite"
    >
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/20 backdrop-blur-sm p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-100 mb-1">
              {t('settingsMenu.maintenance.transcodeWarning.title')}
            </p>
            <p className="text-sm text-amber-200/90 mb-3">
              {t('settingsMenu.maintenance.transcodeWarning.details')}
            </p>
            <a
              href="/settings?category=maintenance&sub=transcodeJobs"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
              data-focusable
              tabIndex={0}
            >
              {t('settingsMenu.maintenance.transcodeWarning.viewJobs')}
            </a>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-amber-200 hover:text-amber-100 transition-colors"
            aria-label={t('settingsMenu.maintenance.transcodeWarning.dismiss')}
            data-focusable
            tabIndex={0}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
