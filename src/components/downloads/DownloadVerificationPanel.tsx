import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { CheckCircle, AlertTriangle, XCircle, Loader2, Trash2 } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import { useI18n } from '../../lib/i18n/useI18n';
import type {
  ClientTorrentStats,
  TorrentVerificationResponse,
  VerificationCheck,
  VerificationCheckStatus,
} from '../../lib/client/types';

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 30000; // Réduit de 60s à 30s pour un feedback plus rapide
const SHOW_CANCEL_AFTER_MS = 10000; // Afficher le bouton d'annulation après 10s sans peers

export interface DownloadVerificationPanelProps {
  infoHash: string;
  torrentName?: string;
  /** Arrêt du polling quand health est ok ou error, ou après timeout */
  onComplete?: (result: TorrentVerificationResponse | null) => void;
  /** Appelé à chaque réponse de vérification pour synchroniser les stats (ex. progression) avec le parent */
  onStatsUpdate?: (stats: ClientTorrentStats | null) => void;
  /** Afficher le panneau même après complétion (sinon on peut le masquer côté parent) */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Appelé quand l'utilisateur veut annuler et supprimer le torrent */
  onCancelAndRemove?: (infoHash: string) => void;
}

function StatusIcon({ status }: { status: VerificationCheckStatus }) {
  const className = 'size-5 shrink-0';
  switch (status) {
    case 'ok':
      return <CheckCircle class={`${className} text-emerald-500`} aria-hidden />;
    case 'warning':
      return <AlertTriangle class={`${className} text-amber-500`} aria-hidden />;
    case 'error':
      return <XCircle class={`${className} text-red-500`} aria-hidden />;
    case 'pending':
    default:
      return <Loader2 class={`${className} animate-spin text-slate-400`} aria-hidden />;
  }
}

function CheckRow({ check }: { check: VerificationCheck }) {
  return (
    <div class="flex items-start gap-3 rounded-lg bg-slate-800/60 px-3 py-2 transition-all duration-300 overflow-hidden">
      <StatusIcon status={check.status} />
      <div class="min-w-0 flex-1 overflow-hidden">
        <div class="font-medium text-slate-200 truncate">{check.label}</div>
        <div class="text-sm text-slate-400 truncate" title={check.message}>{check.message}</div>
      </div>
    </div>
  );
}

export function DownloadVerificationPanel({
  infoHash,
  torrentName,
  onComplete,
  onStatsUpdate,
  dismissible = true,
  onDismiss,
  onCancelAndRemove,
}: DownloadVerificationPanelProps) {
  const { t } = useI18n();
  const [verification, setVerification] = useState<TorrentVerificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const lastVerificationRef = useRef<TorrentVerificationResponse | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const hasPeersRef = useRef(false);
  onCompleteRef.current = onComplete;
  onStatsUpdateRef.current = onStatsUpdate;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  }, []);

  const handleCancelAndRemove = useCallback(async () => {
    if (!infoHash || cancelling) return;
    setCancelling(true);
    stopPolling();
    try {
      // Supprimer le torrent avec les fichiers
      await clientApi.removeTorrent(infoHash, true);
      onCancelAndRemove?.(infoHash);
      onDismiss?.();
    } catch (error) {
      console.error('Erreur lors de la suppression du torrent:', error);
      setCancelling(false);
    }
  }, [infoHash, cancelling, stopPolling, onCancelAndRemove, onDismiss]);

  const finish = useCallback(
    (result: TorrentVerificationResponse | null) => {
      if (completedRef.current) return;
      completedRef.current = true;
      stopPolling();
      setLoading(false);
      onCompleteRef.current?.(result);
    },
    [stopPolling]
  );

  useEffect(() => {
    if (!infoHash) {
      setLoading(false);
      return;
    }

    const fetchVerification = async () => {
      const result = await clientApi.getTorrentVerification(infoHash);
      if (result) {
        lastVerificationRef.current = result;
        setVerification(result);
        onStatsUpdateRef.current?.(result.stats ?? null);
        
        // Vérifier si des peers ont été trouvés
        const peersCheck = result.checks?.find(c => c.id === 'peers');
        if (peersCheck?.status === 'ok') {
          hasPeersRef.current = true;
          // Peers trouvés, cacher le bouton d'annulation
          setShowCancelButton(false);
          if (cancelTimerRef.current) {
            clearTimeout(cancelTimerRef.current);
            cancelTimerRef.current = null;
          }
        }
        
        if (result.health === 'ok' || result.health === 'error') {
          finish(result);
        }
      }
    };

    fetchVerification();

    pollRef.current = setInterval(fetchVerification, POLL_INTERVAL_MS);
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
      finish(lastVerificationRef.current ?? null);
    }, TIMEOUT_MS);
    
    // Afficher le bouton d'annulation après 10s si pas de peers
    cancelTimerRef.current = setTimeout(() => {
      if (!hasPeersRef.current && !completedRef.current) {
        setShowCancelButton(true);
      }
    }, SHOW_CANCEL_AFTER_MS);

    return () => {
      stopPolling();
    };
  }, [infoHash, finish, stopPolling]);

  const isDone = !loading || timedOut;
  const title = isDone ? t('downloads.verificationDone') : t('downloads.verificationTitle');
  const subtitle = isDone && timedOut ? t('downloads.verificationTimeout') : t('downloads.verificationSubtitle');
  // Nom affiché : priorité au nom retourné par l'API (nom réel côté client), sinon le nom passé en props (torrent ajouté)
  const displayName = (verification?.stats?.name?.trim() || torrentName?.trim() || '').slice(0, 200) || null;

  return (
    <div
      class="rounded-xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-lg animate-in fade-in duration-300 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div class="mb-3 flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1 overflow-hidden">
          <h3 class="font-semibold text-white truncate">{title}</h3>
          <p class="text-sm text-slate-400 truncate">{subtitle}</p>
          {displayName && (
            <p
              class="mt-1 text-xs text-slate-500 line-clamp-2 break-words"
              title={displayName}
            >
              {displayName}
            </p>
          )}
        </div>
        <div class="flex shrink-0 items-center gap-1">
          {loading && !timedOut && (
            <Loader2 class="size-6 animate-spin text-slate-400" aria-hidden />
          )}
          {dismissible && isDone && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              class="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-700/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>

      {verification?.checks && verification.checks.length > 0 ? (
        <ul class="flex flex-col gap-2" aria-label="Verification checks">
          {verification.checks.map((check) => (
            <li key={check.id}>
              <CheckRow check={check} />
            </li>
          ))}
        </ul>
      ) : loading && !verification ? (
        <div class="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-4 text-slate-400">
          <Loader2 class="size-5 animate-spin shrink-0" aria-hidden />
          <span>{t('common.loading')}</span>
        </div>
      ) : null}

      {/* Bouton d'annulation si le torrent semble bloqué (pas de peers après 10s) */}
      {showCancelButton && !completedRef.current && onCancelAndRemove && (
        <div class="mt-3 pt-3 border-t border-slate-700/50">
          <div class="flex items-start gap-3 rounded-lg bg-amber-900/30 border border-amber-500/30 px-3 py-2 mb-3">
            <AlertTriangle class="size-5 shrink-0 text-amber-500 mt-0.5" aria-hidden />
            <div class="text-sm text-amber-200">
              {t('downloads.nopeersWarning') || 'Aucun pair trouvé. Ce torrent pourrait ne pas être disponible actuellement.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelAndRemove}
            disabled={cancelling}
            class="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {cancelling ? (
              <>
                <Loader2 class="size-4 animate-spin" aria-hidden />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Trash2 class="size-4" aria-hidden />
                {t('downloads.cancelAndRemove') || 'Annuler et supprimer'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
