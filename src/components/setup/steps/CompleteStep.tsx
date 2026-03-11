import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { SyncProgress } from '../components/SyncProgress';
import { useI18n } from '../../../lib/i18n';
import { getLocalUsers, getLocalUserForSync } from '../../../lib/api/popcorn-web';
import { TokenManager } from '../../../lib/client/storage';

interface CompleteStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onComplete: () => void;
}

// Particules de confetti légères (CSS pur)
function Confetti() {
  const colors = ['#7c3aed', '#a78bfa', '#8b5cf6', '#c4b5fd', '#6d28d9', '#ddd6fe'];
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${(i * 5.5 + 2) % 98}%`,
    delay: `${(i * 0.12) % 2}s`,
    duration: `${2.2 + (i % 3) * 0.4}s`,
    size: i % 3 === 0 ? 8 : i % 3 === 1 ? 6 : 5,
  }));

  return (
    <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:16px;">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(200px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-20px',
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            background: p.color,
            borderRadius: '2px',
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
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
    const syncLocalUsers = async () => {
      try {
        const cloudToken = TokenManager.getCloudAccessToken();
        if (!cloudToken) return;
        const localUsers = await getLocalUsers();
        if (!localUsers || localUsers.length === 0) return;
        const cloudUserId = TokenManager.getUser()?.id;
        if (!cloudUserId) return;
        for (const localUser of localUsers) {
          if (!localUser.isActive) continue;
          try {
            const existingUser = await serverApi.getLocalUser(localUser.id);
            if (existingUser.success && existingUser.data) continue;
            const syncResponse = await getLocalUserForSync(localUser.id);
            if (!syncResponse.success || !syncResponse.data) continue;
            const userData = syncResponse.data;
            await serverApi.createLocalUser({
              cloud_account_id: cloudUserId, email: userData.email,
              password_hash: userData.password_hash, display_name: userData.display_name || undefined,
            });
          } catch { /* ignore par user */ }
        }
      } catch { /* ignore */ }
    };
    syncLocalUsers();
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
    <div style={{ position: 'relative', minHeight: '420px', overflow: 'hidden', borderRadius: '16px' }}>
      <style>{`
        @keyframes complete-pop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes complete-ring {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes complete-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .complete-icon-wrap {
          animation: complete-ring 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .complete-check {
          animation: complete-pop 0.4s 0.15s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .complete-title {
          animation: complete-fade-up 0.4s 0.25s ease both;
        }
        .complete-sub {
          animation: complete-fade-up 0.4s 0.35s ease both;
        }
        .complete-body {
          animation: complete-fade-up 0.4s 0.45s ease both;
        }
        .stat-pill {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          background: rgba(124,58,237,0.08);
          border: 1px solid rgba(124,58,237,0.15);
          border-radius: 8px;
          font-size: 12.5px;
        }
        .stat-pill-num { font-weight: 700; color: #c4b5fd; font-size: 15px; }
        .stat-pill-label { color: rgba(255,255,255,0.45); }
      `}</style>

      {/* Vidéo en fond d'écran */}
      <video
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
        }}
        autoPlay
        muted
        playsInline
        onEnded={() => { if (!isSyncing) onComplete(); }}
      >
        <source src="/intro.mp4" type="video/mp4" />
      </video>
      {/* Overlay sombre pour garder le contenu lisible */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1 }} />

      {/* Contenu par-dessus */}
      <div style={{ position: 'relative', zIndex: 2, padding: '4px 0' }}>
      <div style="text-align:center;margin-bottom:28px;position:relative;">
        <div style="position:relative;display:inline-block;">
          {showConfetti && <Confetti />}
          <div class="complete-icon-wrap" style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,rgba(124,58,237,0.2),rgba(109,40,217,0.1));border:2px solid rgba(124,58,237,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <div class="complete-check" style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(124,58,237,0.5);">
              <svg style="width:26px;height:26px;color:#fff;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        <h2 class="complete-title" style="font-size:24px;font-weight:700;color:#fff;margin:0 0 8px;">
          {t('completeStep.configurationComplete')}
        </h2>
        <p class="complete-sub" style="font-size:14px;color:rgba(255,255,255,0.4);margin:0;">
          {t('completeStep.clientReady')}
        </p>
      </div>

      {/* Statut de synchronisation */}
      <div class="complete-body">
        {checkingSync ? (
          <div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:20px;text-align:center;">
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:rgba(255,255,255,0.45);font-size:13.5px;">
              <div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.15);border-top-color:rgba(124,58,237,0.7);border-radius:50%;animation:wizard-pulse 0.6s linear infinite;" />
              {t('completeStep.checkingStatus')}
            </div>
          </div>
        ) : isSyncing ? (
          <div style="margin-bottom:20px;">
            <div style="padding:14px 16px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:12px;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:8px;height:8px;border-radius:50%;background:#60a5fa;animation:wizard-pulse 1.2s ease-in-out infinite;" />
                <span style="font-size:13px;font-weight:600;color:#93c5fd;">{t('completeStep.syncInProgress')}</span>
              </div>
              <p style="font-size:12.5px;color:rgba(255,255,255,0.4);margin:0;">{t('completeStep.waitOrAccess')}</p>
            </div>
            <SyncProgress />
          </div>
        ) : syncComplete ? (
          <div style="padding:14px 16px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:12px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
            <svg style="width:16px;height:16px;color:#4ade80;flex-shrink:0;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M5 13l4 4L19 7" />
            </svg>
            <span style="font-size:13px;color:#86efac;">{t('completeStep.syncComplete')}</span>
          </div>
        ) : null}

        {/* Stats si disponibles */}
        {syncStatus?.stats && Object.keys(syncStatus.stats).length > 0 && (
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
            {Object.entries(syncStatus.stats).slice(0, 4).map(([key, count]) => (
              <div key={key} class="stat-pill">
                <span class="stat-pill-num">{count}</span>
                <span class="stat-pill-label">{key}</span>
              </div>
            ))}
          </div>
        )}

        {/* Boutons */}
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          {isSyncing ? (
            <>
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                class="wizard-btn-secondary"
                onClick={onComplete}
                style="font-size:13.5px;"
              >
                {t('completeStep.accessDashboardNow')}
              </button>
              <button
                class="wizard-btn-primary"
                disabled
                style="opacity:0.4;cursor:not-allowed;"
              >
                <div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:wizard-pulse 0.6s linear infinite;" />
                Synchronisation...
              </button>
            </>
          ) : (
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              class="wizard-btn-primary"
              onClick={onComplete}
              style="padding:12px 28px;font-size:14.5px;"
            >
              {t('wizard.complete.startUsing')}
              <svg style="width:15px;height:15px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
