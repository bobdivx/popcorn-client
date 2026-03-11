import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { clientApi } from '../../lib/client/api';
import type {
  ClientTorrentStats,
  TorrentVerificationResponse,
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

export function DownloadVerificationPanel({
  infoHash,
  torrentName,
  onComplete,
  onStatsUpdate,
  dismissible = true,
  onDismiss,
  onCancelAndRemove,
}: DownloadVerificationPanelProps) {
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

  // Panneau masqué : la vérification continue en arrière-plan (onComplete, onStatsUpdate)
  return null;
}
