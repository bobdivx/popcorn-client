import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { SyncProgress } from '../components/SyncProgress';
import { useI18n } from '../../../lib/i18n';
import { syncLocalUsersToBackend } from '../../../lib/client/local-users-sync';
import { resolveBootIntroMp4 } from '../../../lib/utils/boot-intro';
import { StepHeader, Alert, Spinner, IconArrowRight, IconCheck } from '../wizardUi';

interface CompleteStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onComplete: () => void;
}

export function CompleteStep({ focusedButtonIndex, buttonRefs, onComplete }: CompleteStepProps) {
  const { t } = useI18n();
  const [syncStatus, setSyncStatus] = useState<{ sync_in_progress: boolean; stats?: Record<string, number> } | null>(null);
  const [checkingSync, setCheckingSync] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Synchroniser les utilisateurs locaux
  useEffect(() => {
    void syncLocalUsersToBackend();
  }, []);

  useEffect(() => {
    const startSync = async () => {
      if (syncStarted) return;
      try {
        // Éviter le 409 : ne pas lancer startSync si une sync est déjà en cours (ex. lancée à l'étape Sync)
        const statusRes = await serverApi.getSyncStatus();
        if (statusRes.success && statusRes.data) {
          const syncInProgress = statusRes.data.sync_in_progress || false;
          const progress = statusRes.data.progress;
          const hasActiveProgress = progress && (
            progress.current_indexer || progress.current_category ||
            (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
          );
          if (syncInProgress || hasActiveProgress) {
            setSyncStarted(true);
            return;
          }
        }
        const syncResponse = await serverApi.startSync();
        if (syncResponse.success) {
          setSyncStarted(true);
        } else {
          const msg = (syncResponse as any).error || (syncResponse as any).message || '';
          if (typeof msg === 'string' && msg.includes('déjà en cours')) {
            setSyncStarted(true);
          } else {
            setSyncStarted(false);
          }
        }
      } catch (err: any) {
        const msg = err?.message || err?.error || '';
        if (typeof msg === 'string' && msg.includes('déjà en cours')) {
          setSyncStarted(true);
        } else {
          setSyncStarted(false);
        }
      }
    };
    startSync();
  }, [syncStarted]);

  useEffect(() => {
    const checkSync = async () => {
      try {
        const response = await serverApi.getSyncStatus();
        if (response.success && response.data) {
          const syncInProgress = response.data.sync_in_progress || false;
          const hasStats = response.data.stats && Object.keys(response.data.stats).length > 0;
          const progress = response.data.progress;
          const hasActiveProgress = progress && (
            progress.current_indexer || progress.current_category ||
            (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
          );
          const isActuallySyncing = syncInProgress || hasActiveProgress || (hasStats && !syncComplete);
          setSyncStatus({ sync_in_progress: isActuallySyncing, stats: response.data.stats });
          if (!isActuallySyncing && !syncComplete) {
            setTimeout(() => setSyncComplete(true), 3000);
          }
        }
      } catch { /* ignore */ } finally {
        setCheckingSync(false);
      }
    };
    checkSync();
    const interval = setInterval(() => {
      if (!syncComplete || syncStarted) checkSync();
    }, 2000);
    return () => clearInterval(interval);
  }, [syncComplete, syncStarted]);

  const isSyncing = syncStatus?.sync_in_progress || false;

  return (
    <div class="wz-complete" style={{ position: 'relative', minHeight: '440px', overflow: 'hidden' }}>
      <style>{`
        .wz-complete { border: 1px solid var(--wz-line, rgba(255,255,255,0.09)); }
        .wz-complete__video { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .wz-complete__veil { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; background: rgba(12,13,16,0.72); background: linear-gradient(180deg, rgba(12,13,16,0.55) 0%, rgba(12,13,16,0.82) 55%, rgba(12,13,16,0.96) 100%); }
        .wz-complete__body { position: relative; z-index: 2; padding: 48px 28px 36px; }
        @media (min-width: 640px) { .wz-complete__body { padding: 64px 48px 44px; } }
        .wz-complete__stats { display: flex; flex-wrap: wrap; justify-content: center; margin: 0 -6px 4px; }
        .wz-complete__stats > .wz-stat { flex: 1 1 120px; margin: 0 6px 12px; text-align: center; background: rgba(12,13,16,0.6); }
        .wz-complete .wz-actions { justify-content: center; }
      `}</style>

      {/* Vidéo en fond d'écran */}
      <video
        class="wz-complete__video"
        autoPlay
        muted
        playsInline
        onEnded={() => { if (!isSyncing) onComplete(); }}
      >
        <source
          src={resolveBootIntroMp4(typeof window !== 'undefined' ? window.location.protocol : undefined)}
          type="video/mp4"
        />
      </video>
      {/* Voile sombre pour garder le contenu lisible */}
      <div class="wz-complete__veil" />

      {/* Contenu par-dessus */}
      <div class="wz-complete__body">
        <div class="wz-center">
          <div class="wz-seal">
            <IconCheck />
          </div>
        </div>
        <StepHeader
          center
          kicker="Popcornn"
          title={t('completeStep.configurationComplete')}
          lead={t('completeStep.clientReady')}
        />

        {/* Statut de synchronisation */}
        <div class="wz-stack" style="max-width:560px;margin:0 auto;">
          {checkingSync ? (
            <div class="wz-center">
              <span class="wz-inline" style="justify-content:center;">
                <Spinner />
                <span class="wz-text-sm">{t('completeStep.checkingStatus')}</span>
              </span>
            </div>
          ) : isSyncing ? (
            <div class="wz-stack-sm">
              <Alert tone="info" title={t('completeStep.syncInProgress')}>
                {t('completeStep.waitOrAccess')}
              </Alert>
              <SyncProgress />
            </div>
          ) : syncComplete ? (
            <Alert tone="success">{t('completeStep.syncComplete')}</Alert>
          ) : null}

          {/* Stats si disponibles */}
          {syncStatus?.stats && Object.keys(syncStatus.stats).length > 0 && (
            <div class="wz-complete__stats">
              {Object.entries(syncStatus.stats).slice(0, 4).map(([key, count]) => (
                <div key={key} class="wz-stat">
                  <span class="wz-stat__value">{count}</span>
                  <span class="wz-stat__label">{key}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Boutons */}
        <div class="wz-actions" style="border-top:0;padding-top:0;margin-top:36px;">
          {isSyncing ? (
            <>
              <button
                type="button"
                class="wz-btn wz-btn--ghost"
                disabled
              >
                <Spinner />
                Synchronisation...
              </button>
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                type="button"
                class="wz-btn wz-btn--primary"
                data-focusable
                onClick={onComplete}
              >
                {t('completeStep.accessDashboardNow')}
                <IconArrowRight />
              </button>
            </>
          ) : (
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="button"
              class="wz-btn wz-btn--primary"
              data-focusable
              onClick={onComplete}
            >
              {t('wizard.complete.startUsing')}
              <IconArrowRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
