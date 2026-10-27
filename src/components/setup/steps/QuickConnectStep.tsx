import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { hasBackendUrl } from '../../../lib/backend-config.js';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig, getPopcornWebBaseUrl } from '../../../lib/api/popcorn-web';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { generateQRCode } from '../../../lib/utils/qrcode';
import { StepHeader, Alert, Spinner } from '../wizardUi';

interface QuickConnectStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
  /** Mode compact pour l’étape Connexion (desktop) : QR plus petit, moins d’espace, sans scroll */
  compact?: boolean;
  /** Mode TV : grand QR, gros texte, boutons larges pour télécommande et lecture à distance */
  tvMode?: boolean;
}

export function QuickConnectStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange, compact = false, tvMode = false }: QuickConnectStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  // Mise à jour du compte à rebours chaque seconde
  useEffect(() => {
    if (!expiresAt || status !== 'pending') {
      setRemainingSeconds(null);
      return;
    }
    const update = () => {
      const diffMs = expiresAt - Date.now();
      setRemainingSeconds(Math.max(0, Math.floor(diffMs / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, status]);

  useEffect(() => {
    // Initialiser la connexion rapide au montage
    initQuickConnect();

    // Nettoyer l'intervalle au démontage
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const initQuickConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.initQuickConnect();

      if (!response.success) {
        setError(
          response.message?.includes('Failed to fetch')
            ? 'Impossible de joindre popcorn-web. Vérifiez votre connexion internet.'
            : (response.message || 'Erreur lors de l\'initialisation de la connexion rapide')
        );
        setLoading(false);
        return;
      }

      if (response.data) {
        setCode(response.data.code);
        setSecret(response.data.secret);
        setExpiresAt(response.data.expiresAt);

        // QR code = URL popcorn.app/quick-connect?code=XXX pour redirection au scan (comme ServerUrlStep)
        const quickConnectUrl = `${getPopcornWebBaseUrl()}/quick-connect?code=${response.data.code}`;
        try {
          const qrUrl = await generateQRCode(quickConnectUrl);
          setQrCodeUrl(qrUrl);
        } catch (qrError) {
          console.warn('[QUICK-CONNECT] Erreur lors de la génération du QR code:', qrError);
          // Continuer sans QR code, l'utilisateur peut entrer le code manuellement
        }

        // Démarrer le polling pour vérifier l'état
        startPolling(response.data.secret);
      }
    } catch (err) {
      setError('Erreur lors de l\'initialisation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (secretToPoll: string) => {
    // Nettoyer l'intervalle précédent si existant
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
    }

    // Polling toutes les 2 secondes
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await serverApi.getQuickConnectStatus(secretToPoll);

        if (statusResponse.success && statusResponse.data) {
          const newStatus = statusResponse.data.status;
          setStatus(newStatus);

          if (newStatus === 'authorized') {
            // Arrêter le polling
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            // Se connecter automatiquement
            await connectQuickConnect(secretToPoll);
          } else if (newStatus === 'expired' || newStatus === 'used') {
            // Arrêter le polling
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            if (newStatus === 'expired') {
              setError('Le code de connexion rapide a expiré. Veuillez générer un nouveau code.');
            }
          }
        }
      } catch (err) {
        console.error('[QUICK-CONNECT] Erreur lors du polling:', err);
      }
    }, 2000);
  };

  const connectQuickConnect = async (secretToConnect: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);

      if (!response.success) {
        setError(response.message || 'Erreur lors de la connexion');
        setLoading(false);
        return;
      }

      // Statut serveur seulement si l'URL est connue (enregistrée par connectQuickConnect depuis le
      // compte) : sans URL, le statut viserait l'URL par défaut (10.0.2.2:3000 sur Android, ~30 s
      // d'écran de chargement) ; l'étape suivante (Serveur) permet alors de la renseigner.
      const refreshStatus = () => (hasBackendUrl() ? onStatusChange?.() : undefined);

      // Après connexion rapide : récupérer la config cloud comme après login (AuthStep)
      const cloudToken = response.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
      if (cloudToken) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 200));
          const savedConfig = await getUserConfig();
          const hasSomething =
            !!(savedConfig?.indexers?.length) ||
            !!savedConfig?.tmdbApiKey ||
            !!savedConfig?.downloadLocation ||
            !!savedConfig?.syncSettings ||
            !!savedConfig?.language ||
            !!(savedConfig?.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0);
          if (savedConfig && hasSomething) {
            const missingCategories = !savedConfig.indexerCategories || Object.keys(savedConfig.indexerCategories).length === 0;
            if (missingCategories) {
              syncIndexersToCloud().catch((syncErr) => {
                console.warn('[QUICK-CONNECT] Sync catégories vers le cloud ignorée:', syncErr);
              });
            }
            CloudImportManager.startImport(savedConfig).finally(() => {
              Promise.resolve(refreshStatus()).catch(() => {});
            });
          }
        } catch (configError) {
          console.warn('[QUICK-CONNECT] Impossible de récupérer la configuration cloud:', configError);
        }
      }

      await refreshStatus();
      onNext();
    } catch (err) {
      setError('Erreur lors de la connexion');
      console.error(err);
      setLoading(false);
    }
  };

  const handleManualConnect = async () => {
    if (!secret) {
      setError('Aucun secret disponible');
      return;
    }

    await connectQuickConnect(secret);
  };

  // En TV mode, le QR doit tenir dans la hauteur disponible (viewport 720p - chrome)
  const qrSize = tvMode ? 200 : compact ? 136 : 224;
  const qrPadding = tvMode ? 12 : compact ? 8 : 16;
  const mode = tvMode ? 'qc--tv' : compact ? 'qc--compact' : 'qc--full';

  return (
    <div class={`quick-connect-step qc ${mode}`}>
      <style>{`
        .qc { width: 100%; }
        .qc__hint { margin: 0 0 22px; font-size: 0.92rem; line-height: 1.6; color: var(--wz-ink-dim); }
        .qc--tv .qc__hint { font-size: 1.05rem; }
        .qc__loading { display: flex; align-items: center; justify-content: center; min-height: 180px; }
        .qc--tv .qc__loading { min-height: 320px; }
        .qc--full .qc__loading { min-height: 360px; }
        .qc__grid { display: flex; align-items: center; }
        .qc__grid > .qc__qr { flex-shrink: 0; margin-right: 28px; }
        .qc__grid > .qc__code { flex: 1; min-width: 0; }
        .qc--compact .qc__grid { flex-direction: column; }
        .qc--compact .qc__grid > .qc__qr { margin: 0 0 18px; }
        @media (max-width: 639px) {
          .qc__grid { flex-direction: column; }
          .qc__grid > .qc__qr { margin: 0 0 20px; }
        }
        .qc__qr { display: flex; flex-direction: column; align-items: center; max-width: 100%; }
        .qc__qr-box { background: #fff; border-radius: 2px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; max-width: 90vw; }
        .qc__qr-box img { width: 100%; height: 100%; object-fit: contain; }
        .qc__qr-caption { margin-top: 10px; font-size: 0.75rem; color: var(--wz-ink-faint); text-align: center; }
        .qc__code { text-align: left; }
        .qc--compact .qc__code { text-align: center; }
        @media (max-width: 639px) { .qc__code { text-align: center; } }
        .qc__code-label { display: block; margin-bottom: 10px; font-family: var(--wz-display); font-size: 0.62rem; letter-spacing: 0.32em; text-transform: uppercase; color: var(--wz-ink-faint); }
        .qc__code-value { font-family: var(--wz-mono); font-weight: 600; color: var(--wz-ink); letter-spacing: 0.3em; line-height: 1.1; word-break: break-all; }
        .qc--full .qc__code-value { font-size: 2.25rem; }
        .qc--compact .qc__code-value { font-size: 1.5rem; }
        .qc--tv .qc__code-value { font-size: 2.6rem; letter-spacing: 0.35em; }
        .qc__code-help { margin: 10px 0 0; font-size: 0.8rem; line-height: 1.55; color: var(--wz-ink-dim); }
        .qc__expiry { margin-top: 12px; font-size: 0.72rem; letter-spacing: 0.08em; color: var(--wz-ink-faint); }
        .qc--tv .qc__expiry { font-size: 0.95rem; }
        .qc__authorized { margin-top: 12px; display: flex; align-items: center; color: var(--wz-ok); font-size: 0.85rem; }
        .qc--compact .qc__authorized { justify-content: center; }
        .qc--tv .qc__authorized { font-size: 1.1rem; }
        .qc__authorized::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--wz-ok); margin-right: 10px; flex-shrink: 0; }
        .qc__actions { display: flex; flex-wrap: wrap; align-items: center; margin-top: 24px; }
        .qc__actions > .wz-btn + .wz-btn { margin-left: 12px; }
        .qc--compact .qc__actions { flex-direction: column; align-items: stretch; margin-top: 18px; }
        .qc--compact .qc__actions > .wz-btn + .wz-btn { margin-left: 0; margin-top: 10px; }
        @media (max-width: 639px) {
          .qc__actions { flex-direction: column; align-items: stretch; }
          .qc__actions > .wz-btn + .wz-btn { margin-left: 0; margin-top: 10px; }
        }
      `}</style>

      {!compact && !tvMode && (
        <StepHeader
          kicker="Appareil connecté"
          title="Connexion rapide"
          lead="Scannez le QR code avec un autre appareil déjà connecté, ou entrez le code manuellement."
        />
      )}

      {tvMode && (
        <p class="qc__hint">
          Scannez le QR code avec votre téléphone ou entrez le code sur popcorn-web
        </p>
      )}

      {error && (
        <Alert tone="error" style="margin-bottom:18px;">{error}</Alert>
      )}

      {loading && !code && (
        <div class="qc__loading">
          <span class="ed-spinner ed-spinner--sm" aria-hidden="true" />
        </div>
      )}

      {code && (
        <div>
          <div class="qc__grid">
            {/* QR Code — TV: grand pour lecture à distance, compact: petit, défaut: moyen */}
            {qrCodeUrl && (
              <div class="qc__qr">
                <div
                  class="qc__qr-box"
                  style={{
                    padding: qrPadding,
                    width: qrSize + qrPadding * 2,
                    height: qrSize + qrPadding * 2,
                    maxHeight: tvMode ? '30vh' : undefined,
                  }}
                >
                  <img
                    src={qrCodeUrl}
                    alt="QR Code de connexion rapide"
                    style={{ maxWidth: qrSize, maxHeight: qrSize }}
                  />
                </div>
                {!compact && !tvMode && (
                  <p class="qc__qr-caption">
                    Scannez ce QR code avec un appareil déjà connecté
                  </p>
                )}
              </div>
            )}

            {/* Code à 6 caractères — TV: très gros pour lisibilité à distance */}
            <div class="qc__code">
              <span class="qc__code-label">Code à 6 caractères</span>
              <div class="qc__code-value">{code}</div>
              {!compact && !tvMode && (
                <p class="qc__code-help">
                  Entrez ce code sur un appareil déjà connecté pour autoriser cette connexion
                </p>
              )}

              {expiresAt && remainingSeconds !== null && (
                <div class="qc__expiry">
                  Expire dans {remainingSeconds} secondes
                </div>
              )}

              {status === 'authorized' && (
                <div class="qc__authorized">
                  Code autorisé, connexion en cours...
                </div>
              )}
            </div>
          </div>

          <div class="qc__actions">
            {/* Bouton de connexion manuelle — TV: grande zone focus */}
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="button"
              data-focusable
              onClick={handleManualConnect}
              disabled={loading || status !== 'authorized'}
              class={`wz-btn ${status === 'authorized' ? 'wz-btn--primary' : 'wz-btn--ghost'} ${compact ? 'wz-btn--sm' : ''}`}
            >
              {loading ? (
                <>
                  <Spinner />
                  Connexion...
                </>
              ) : status === 'authorized' ? (
                'Se connecter maintenant'
              ) : (
                'En attente d\'autorisation...'
              )}
            </button>

            {/* Bouton pour générer un nouveau code — TV: visible et focusable */}
            <button
              type="button"
              data-focusable
              onClick={() => {
                if (pollingIntervalRef.current !== null) {
                  clearInterval(pollingIntervalRef.current);
                  pollingIntervalRef.current = null;
                }
                setCode(null);
                setSecret(null);
                setQrCodeUrl(null);
                setStatus('pending');
                initQuickConnect();
              }}
              disabled={loading}
              class={`wz-btn wz-btn--quiet ${compact ? 'wz-btn--sm' : ''}`}
            >
              Générer un nouveau code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
