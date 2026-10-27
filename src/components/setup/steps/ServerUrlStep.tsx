import { useState, useEffect, useRef } from 'preact/hooks';
import { getBackendUrl, hasBackendUrl, setBackendUrl as saveBackendUrl, getConfiguredBackendUrl, isBackendUrlSameAsClientUrl } from '../../../lib/backend-config.js';
import { STORAGE_BACKEND_START_RESULT, type BackendStartResult } from '../../IndexRedirect';
import { serverApi } from '../../../lib/client/server-api';
import { getPopcornWebBaseUrl } from '../../../lib/api/popcorn-web';
import { useI18n } from '../../../lib/i18n';
import { redirectTo } from '../../../lib/utils/navigation.js';
import { shouldDisplayQRCode } from '../../../lib/utils/device-detection';
import QRCode from 'qrcode';
import { useConfirmDialog } from '../../ui/useConfirmDialog';
import { StepHeader, Alert, Spinner, IconArrowRight } from '../wizardUi';

interface ServerUrlStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
  /** Quand true (ex: premier lancement sans URL), afficher directement le formulaire URL sans écran de choix */
  skipInitialChoice?: boolean;
  /**
   * Quand true : si une URL serveur est déjà enregistrée (ex. récupérée par la connexion rapide
   * QR / code provisoire), la vérifier en silence et passer l'étape sans clic si elle répond.
   */
  autoAdvanceIfConfigured?: boolean;
}

/** URL déjà validée automatiquement (une seule tentative auto par URL et par page). */
let autoValidatedBackendUrl: string | null = null;

export type InstallationChoice = 'firstTime' | 'alreadyConfigured' | 'localAccount';

export function ServerUrlStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange, skipInitialChoice = false, autoAdvanceIfConfigured = false }: ServerUrlStepProps) {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  /** Choix explicite de l'utilisateur : première installation ou déjà configuré ailleurs (ignoré si skipInitialChoice) */
  const [installationChoice, setInstallationChoice] = useState<InstallationChoice | null>(skipInitialChoice ? 'firstTime' : null);
  const [showManualConfig, setShowManualConfig] = useState(skipInitialChoice);
  const [backendUrl, setBackendUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoValidating, setAutoValidating] = useState(false);
  
  // Détection de la plateforme
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [authorizingCode, setAuthorizingCode] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  
  // Résultat du démarrage automatique du backend (Windows/Linux) — pour affichage
  const [backendStartResult, setBackendStartResult] = useState<BackendStartResult | null>(null);

  // Quick Connect state
  const [quickConnectLoading, setQuickConnectLoading] = useState(false);
  const [quickConnectError, setQuickConnectError] = useState<string | null>(null);
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
  const [quickConnectSecret, setQuickConnectSecret] = useState<string | null>(null);
  const [quickConnectQrUrl, setQuickConnectQrUrl] = useState<string | null>(null);
  const [quickConnectStatus, setQuickConnectStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [quickConnectExpiresAt, setQuickConnectExpiresAt] = useState<number | null>(null);
  const [quickConnectRemaining, setQuickConnectRemaining] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const qrCodeContainerRef = useRef<HTMLDivElement>(null);

  // Mise à jour du compteur de secondes restantes (Quick Connect) toutes les secondes
  useEffect(() => {
    if (!quickConnectExpiresAt || quickConnectStatus !== 'pending') {
      setQuickConnectRemaining(null);
      return;
    }
    const updateRemaining = () => {
      const diffMs = quickConnectExpiresAt - Date.now();
      setQuickConnectRemaining(Math.max(0, Math.floor(diffMs / 1000)));
    };
    updateRemaining();
    const id = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(id);
  }, [quickConnectExpiresAt, quickConnectStatus]);

  useEffect(() => {
    const displayQR = shouldDisplayQRCode();
    setIsScannerMode(!displayQR);
    // Préremplir l'URL du backend depuis l'invitation (compte local) si présente dans l'URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlFromInvitation = params.get('backendUrl');
      if (urlFromInvitation && urlFromInvitation.trim()) {
        const trimmed = urlFromInvitation.trim();
        try {
          new URL(trimmed);
          saveBackendUrl(trimmed);
          setBackendUrl(trimmed);
        } catch {
          // URL invalide, ignorer
        }
      }
    }
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).get('backendUrl')) {
      loadBackendUrl();
    } else {
      setLoading(false);
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_BACKEND_START_RESULT);
      if (raw) {
        const parsed = JSON.parse(raw) as BackendStartResult;
        if (parsed.attempted) setBackendStartResult(parsed);
      }
    } catch {
      // ignore
    }
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
      stopScanner();
    };
  }, []);

  // URL déjà enregistrée par la connexion rapide (ou la connexion au compte) : le premier contrôle
  // a pu échouer (réseau du téléphone pas encore prêt, délai court) → l'étape s'affichait avec
  // l'URL préremplie et il fallait cliquer. On revérifie en silence (3 essais) et on enchaîne.
  useEffect(() => {
    if (!autoAdvanceIfConfigured || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('backendUrl')) return;
    if (!hasBackendUrl()) return;
    const saved = getConfiguredBackendUrl()?.trim().replace(/\/$/, '');
    if (!saved || autoValidatedBackendUrl === saved) return;
    autoValidatedBackendUrl = saved;
    let cancelled = false;
    setAutoValidating(true);
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await serverApi.getSetupStatus();
          if (status.success && status.data && status.data.backendReachable !== false) {
            if (!cancelled) onNext();
            return;
          }
        } catch {
          // essai suivant
        }
      }
      if (!cancelled) setAutoValidating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Démarrer Quick Connect pour tous les devices (TV, Desktop, Mobile) quand "déjà configuré"
  // Le code est affiché ici et saisi sur popcorn-web, pas dans le client
  useEffect(() => {
    if (installationChoice !== 'alreadyConfigured') return;
    initQuickConnect();
  }, [installationChoice]);

  // Centrer le QR code dans la vue au moment où il s'affiche (TV télécommande ou mobile scroll)
  useEffect(() => {
    if (!quickConnectQrUrl) return;
    const el = qrCodeContainerRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 100);
    return () => clearTimeout(t);
  }, [quickConnectQrUrl]);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError(null);

      // Même sans URL enregistrée, préremplir avec l'URL par défaut (ex. 127.0.0.1:3000)
      // pour que l'utilisateur puisse valider d'un clic après une connexion cloud.
      const configured = getConfiguredBackendUrl()?.trim().replace(/\/$/, '');
      setBackendUrl(configured || getBackendUrl());
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      setBackendUrl('http://127.0.0.1:3000');
    } finally {
      setLoading(false);
    }
  };

  const resetQuickConnect = () => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setQuickConnectCode(null);
    setQuickConnectSecret(null);
    setQuickConnectQrUrl(null);
    setQuickConnectStatus('pending');
    setQuickConnectError(null);
    setQuickConnectExpiresAt(null);
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError(t('wizard.serverUrl.errors.backendRequired'));
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      // Normaliser l'URL
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        setBackendUrl(normalizedUrl);
      }
      
      // Valider l'URL
      try {
        const urlObj = new URL(normalizedUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
        }
        throw e;
      }

      // Tester la connexion
      const testUrl = `${normalizedUrl}/api/client/health`;
      console.log('[ServerUrlStep] Test de connexion à:', testUrl);
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        setSuccess(`✅ Connexion réussie ! Le serveur est accessible.`);
        // Si l'URL backend est identique à l'adresse du client, demander confirmation avant de sauvegarder
        if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(normalizedUrl)) {
          if (!(await confirm({
            title: t('common.confirm'),
            message: t('wizard.serverUrl.sameOriginConfirmMessage'),
            danger: true,
          }))) {
            setTesting(false);
            return;
          }
        }
        saveBackendUrl(normalizedUrl);
      } else {
        setError(`${t('wizard.serverUrl.errors.connectionFailed')} (${response.status})\n\n${t('wizard.serverUrl.errors.connectionFailedDetails')}`);
      }
    } catch (err) {
      let errorMessage = t('wizard.serverUrl.errors.connectionFailed');
      
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}\n\n${t('wizard.serverUrl.errors.connectionFailedDetails')}`;
      } else if (err instanceof Error) {
        // Essayer de rendre le message d'erreur plus compréhensible
        if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}\n\nLe serveur ne répond pas dans le délai imparti. Vérifiez que le serveur est démarré et accessible.`;
        } else if (err.message.includes('network') || err.message.includes('Network')) {
          errorMessage = `${t('wizard.serverUrl.errors.networkError')}\n\n${t('wizard.serverUrl.errors.networkErrorDetails')}`;
        } else {
          errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}: ${err.message}`;
        }
      }
      
      setError(errorMessage);
      console.error('[ServerUrlStep] Erreur de test:', err);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (!backendUrl.trim()) {
      setError(t('wizard.serverUrl.errors.backendRequired'));
      return;
    }

    try {
      setTesting(true);
      setError(null);

      // Valider et normaliser l'URL
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        setBackendUrl(normalizedUrl);
      }

        try {
          const urlObj = new URL(normalizedUrl);
          if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            setError(t('wizard.serverUrl.errors.invalidProtocol'));
            setTesting(false);
            return;
          }
        } catch (e) {
          if (e instanceof TypeError) {
            setError(t('wizard.serverUrl.errors.invalidUrlFormat'));
            setTesting(false);
            return;
          }
          throw e;
        }
      
      // Si l'URL backend est identique à l'adresse du client (même host + port), demander confirmation
      if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(normalizedUrl)) {
        if (!(await confirm({
          title: t('common.confirm'),
          message: t('wizard.serverUrl.sameOriginConfirmMessage'),
          danger: true,
        }))) {
          setTesting(false);
          return;
        }
      }

      saveBackendUrl(normalizedUrl);
      console.log('[ServerUrlStep] URL sauvegardée:', normalizedUrl);

      // Vérifier le statut du backend
      try {
        const setupStatus = await serverApi.getSetupStatus();
        if (setupStatus.success && setupStatus.data) {
          if (setupStatus.data.backendReachable === false) {
            setError(`${t('wizard.serverUrl.errors.backendNotAccessible')}\n\n${t('wizard.serverUrl.errors.backendNotAccessibleDetails')}`);
            setTesting(false);
            return;
          }
        }
      } catch (statusError) {
        console.warn('[ServerUrlStep] Erreur vérification statut:', statusError);
      }

      onNext();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('save') || errorMsg.includes('Save')) {
        setError(t('wizard.serverUrl.errors.saveError'));
      } else {
        setError(`${t('wizard.serverUrl.errors.connectionError')}: ${errorMsg}`);
      }
    } finally {
      setTesting(false);
    }
  };

  // Initialiser Quick Connect via popcorn-web (sans URL backend - sera récupérée depuis le cloud)
  const initQuickConnect = async () => {
    setQuickConnectLoading(true);
    setQuickConnectError(null);

    try {
      // Appeler l'API popcorn-web pour créer un code de connexion rapide
      const response = await serverApi.initQuickConnect();

      if (!response.success) {
        const cloudDetail = [response.message, response.details].filter(Boolean).join(' — ');
        setQuickConnectError(
          `${t('wizard.serverUrl.errors.quickConnectInitError')}\n\n${t('wizard.serverUrl.errors.quickConnectInitErrorDetails')}` +
            (cloudDetail ? `\n\n${cloudDetail}` : '') +
            `\n\nAstuce locale : choisissez « Première installation » et utilisez http://127.0.0.1:3000`
        );
        return;
      }

      if (response.data) {
        const { code, secret, expiresAt } = response.data;
        setQuickConnectCode(code);
        setQuickConnectSecret(secret);
        setQuickConnectExpiresAt(expiresAt);

        // Générer le QR code pointant vers popcorn-web (sans URL backend)
        const quickConnectUrl = `${getPopcornWebBaseUrl()}/quick-connect?code=${code}`;
        console.log('[ServerUrlStep] URL Quick Connect:', quickConnectUrl);

        try {
          const qrDataUrl = await QRCode.toDataURL(quickConnectUrl, {
            width: 256,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQuickConnectQrUrl(qrDataUrl);
        } catch (qrError) {
          console.warn('[ServerUrlStep] Erreur génération QR code:', qrError);
        }

        // Démarrer le polling pour vérifier l'autorisation
        startPolling(secret);
      }
    } catch (err) {
      setQuickConnectError(`${t('wizard.serverUrl.errors.quickConnectInitError')}\n\n${t('wizard.serverUrl.errors.quickConnectInitErrorDetails')}`);
      console.error(err);
    } finally {
      setQuickConnectLoading(false);
    }
  };

  // Polling pour vérifier l'état du Quick Connect
  const startPolling = (secretToPoll: string) => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await serverApi.getQuickConnectStatus(secretToPoll);

        if (statusResponse.success && statusResponse.data) {
          const newStatus = statusResponse.data.status;
          setQuickConnectStatus(newStatus);

          if (newStatus === 'authorized') {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            await connectQuickConnect(secretToPoll);
          } else if (newStatus === 'expired' || newStatus === 'used') {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (newStatus === 'expired') {
              setQuickConnectError(`${t('wizard.serverUrl.errors.codeExpired')}\n\n${t('wizard.serverUrl.errors.codeExpiredDetails')}`);
            }
          }
        }
      } catch (err) {
        console.error('[ServerUrlStep] Erreur polling:', err);
      }
    }, 2000);
  };

  // Se connecter via Quick Connect
  const connectQuickConnect = async (secretToConnect: string) => {
    setQuickConnectLoading(true);
    setQuickConnectError(null);

    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);

      if (!response.success) {
        setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
        setQuickConnectLoading(false);
        return;
      }

      // Utiliser uniquement l'URL du backend (serveur API popcorn-server), jamais clientUrl
      if (response.data?.backendUrl) {
        console.log('[ServerUrlStep] URL du backend récupérée depuis le cloud:', response.data.backendUrl);
        saveBackendUrl(response.data.backendUrl);
        setBackendUrl(response.data.backendUrl);
      } else {
        console.warn('[ServerUrlStep] Aucune URL backend dans la réponse');
        setQuickConnectError(`${t('wizard.serverUrl.errors.noBackendUrlInCloud')}\n\n${t('wizard.serverUrl.errors.noBackendUrlInCloudDetails')}`);
        setQuickConnectLoading(false);
        return;
      }

      // Connexion réussie : appeler onNext() sans onStatusChange() pour éviter un re-render
      // du Wizard (étape 1 à nouveau) avant que onNext ait pu rediriger ou passer à l'étape suivante
      onNext();
    } catch (err) {
      setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
      console.error(err);
      setQuickConnectLoading(false);
    }
  };

  // Régénérer le code Quick Connect
  const handleRegenerateQuickConnect = () => {
    resetQuickConnect();
    initQuickConnect();
  };

  // ===== Fonctions pour le mode Scanner (Mobile) =====
  
  // Démarrer le scanner QR
  const startScanner = async () => {
    setShowScanner(true);
    setQuickConnectError(null);
    
    // Attendre que le DOM soit prêt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!scannerRef.current) return;
    
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          console.log('[ServerUrlStep] QR code scanné:', decodedText);
          await stopScanner();
          handleScannedQR(decodedText);
        },
        (errorMessage) => {
          // Erreurs de scan silencieuses (normales quand pas de QR visible)
        }
      );
    } catch (err) {
      console.error('[ServerUrlStep] Erreur démarrage scanner:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('permission') || errorMsg.includes('Permission') || errorMsg.includes('denied')) {
        setQuickConnectError(t('wizard.serverUrl.cameraPermissionError'));
      } else {
        setQuickConnectError(t('wizard.serverUrl.qrScanError'));
      }
      setShowScanner(false);
    }
  };
  
  // Arrêter le scanner QR
  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {
        console.warn('[ServerUrlStep] Erreur arrêt scanner:', err);
      }
    }
    setShowScanner(false);
  };
  
  // Traiter un QR code scanné
  const handleScannedQR = async (qrContent: string) => {
    try {
      // Le QR code contient une URL comme: https://popcorn-web.../quick-connect?code=XXXXXX
      const url = new URL(qrContent);
      const code = url.searchParams.get('code');
      
      if (code && code.length === 6) {
        setManualCode(code);
        await authorizeWithCode(code);
      } else {
        setQuickConnectError(`${t('wizard.serverUrl.errors.qrCodeInvalid')}\n\n${t('wizard.serverUrl.errors.qrCodeInvalidDetails')}`);
      }
    } catch (err) {
      // Ce n'est pas une URL, peut-être juste un code
      if (qrContent.length === 6 && /^[A-Z0-9]+$/.test(qrContent)) {
        setManualCode(qrContent);
        await authorizeWithCode(qrContent);
      } else {
        setQuickConnectError(`${t('wizard.serverUrl.errors.qrCodeInvalid')}\n\n${t('wizard.serverUrl.errors.qrCodeInvalidDetails')}`);
      }
    }
  };
  
  // Autoriser avec un code (scanné ou entré manuellement)
  const authorizeWithCode = async (code: string) => {
    setAuthorizingCode(true);
    setQuickConnectError(null);
    
    try {
      // Appeler l'API pour autoriser le code
      const response = await serverApi.authorizeQuickConnect(code);
      
      if (!response.success) {
        setQuickConnectError(`${t('wizard.serverUrl.errors.codeInvalid')}\n\n${t('wizard.serverUrl.errors.codeInvalidDetails')}`);
        setAuthorizingCode(false);
        return;
      }
      
      // Autorisation réussie, maintenant connectons-nous
      // On doit récupérer le secret associé à ce code pour obtenir les tokens
      if (response.data?.secret) {
        const connectResponse = await serverApi.connectQuickConnect(response.data.secret);
        
        if (!connectResponse.success) {
          setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
          setAuthorizingCode(false);
          return;
        }
        
        // Utiliser uniquement backendUrl (serveur API), jamais clientUrl
        if (connectResponse.data?.backendUrl) {
          console.log('[ServerUrlStep] URL du backend récupérée:', connectResponse.data.backendUrl);
          saveBackendUrl(connectResponse.data.backendUrl);
          setBackendUrl(connectResponse.data.backendUrl);
          // Connexion quick-connect réussie : redirection directe vers le dashboard (tokens déjà sauvegardés par connectQuickConnect)
          setAuthorizingCode(false);
          redirectTo('/dashboard');
          return;
        } else {
          setQuickConnectError(`${t('wizard.serverUrl.errors.noBackendUrlInCloud')}\n\n${t('wizard.serverUrl.errors.noBackendUrlInCloudDetails')}`);
          setAuthorizingCode(false);
        }
      } else {
        setQuickConnectError(t('wizard.serverUrl.errors.secretNotReceived'));
        setAuthorizingCode(false);
      }
    } catch (err) {
      console.error('[ServerUrlStep] Erreur autorisation:', err);
      setQuickConnectError(`${t('wizard.serverUrl.errors.authorizationError')}\n\n${t('wizard.serverUrl.errors.authorizationErrorDetails')}`);
      setAuthorizingCode(false);
    }
  };
  
  // Gérer la soumission du code manuel
  const handleManualCodeSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.length === 6) {
      authorizeWithCode(code);
    } else {
      setQuickConnectError(t('wizard.serverUrl.errors.codeWrongLength'));
    }
  };

  // ===== Rendu =====

  const SU_CSS = `
    .su-choices > .wz-option + .wz-option { margin-top: 12px; }
    .su-back { display: flex; align-items: center; margin-bottom: 8px; }
    .su-back > .wz-icon-btn { margin-right: 14px; }
    .su-qc { display: flex; align-items: flex-start; }
    .su-qc__qr { flex-shrink: 0; margin-right: 36px; display: flex; flex-direction: column; align-items: center; }
    .su-qc__qr-box { background: #fff; padding: 14px; border-radius: 2px; }
    .su-qc__qr-box img { display: block; width: 240px; height: 240px; }
    .su-qc__qr-caption { margin: 12px 0 0; max-width: 268px; font-size: 0.75rem; line-height: 1.5; color: var(--wz-ink-faint); text-align: center; }
    .su-qc__side { flex: 1; min-width: 0; }
    @media (min-width: 1280px) { .su-qc__qr-box img { width: 280px; height: 280px; } .su-qc__qr-caption { max-width: 308px; } }
    @media (max-width: 899px) {
      .su-qc { flex-direction: column; align-items: stretch; }
      .su-qc__qr { margin: 0 0 28px; }
      .su-qc__qr-box img { width: 220px; height: 220px; max-width: 64vw; max-height: 64vw; }
    }
    .su-code-label { display: block; margin-bottom: 12px; font-family: var(--wz-display); font-size: 0.62rem; letter-spacing: 0.32em; text-transform: uppercase; color: var(--wz-ink-faint); }
    .su-code { padding: 18px 20px; border: 1px solid var(--wz-accent-line); background: var(--wz-accent-soft); font-family: var(--wz-mono); font-weight: 600; font-size: 2.4rem; line-height: 1.1; letter-spacing: 0.28em; color: var(--wz-ink); text-align: center; overflow-x: auto; white-space: nowrap; }
    @media (max-width: 479px) { .su-code { font-size: 1.8rem; letter-spacing: 0.18em; } }
    .su-status { display: flex; align-items: center; margin-top: 14px; font-size: 0.85rem; color: var(--wz-ink-dim); }
    .su-status > .ed-spinner, .su-status > svg { margin-right: 10px; flex-shrink: 0; }
    .su-status > svg { width: 16px; height: 16px; }
    .su-status.is-ok { color: var(--wz-ok); }
    .su-expiry { margin-top: 10px; font-family: var(--wz-mono); font-size: 0.75rem; letter-spacing: 0.06em; color: var(--wz-warn); }
    .su-steps { list-style: none; margin: 0; padding: 0; }
    .su-steps li { display: flex; align-items: flex-start; }
    .su-steps li + li { margin-top: 12px; }
    .su-steps .wz-num { margin-right: 14px; flex-shrink: 0; }
    .su-steps p { margin: 3px 0 0; font-size: 0.88rem; line-height: 1.55; color: var(--wz-ink-dim); }
    .su-flow { display: flex; align-items: center; margin-top: 18px; font-family: var(--wz-display); font-size: 0.6rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--wz-ink-faint); }
    .su-flow > span + span { margin-left: 12px; }
    .su-flow .is-accent { color: var(--wz-accent); }
    .su-manual-cta { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--wz-line); }
    .su-scanner { width: 100%; max-width: 380px; margin: 0 auto; overflow: hidden; border: 1px solid var(--wz-accent); }
    .su-scan-btn { display: flex; flex-direction: column; align-items: center; width: 100%; padding: 28px 20px; min-height: 0; }
    .su-scan-btn svg { width: 32px; height: 32px; margin: 0 0 12px !important; }
    .su-scan-btn small { display: block; margin-top: 8px; font-family: var(--wz-body); font-size: 0.78rem; letter-spacing: 0.02em; text-transform: none; opacity: 0.85; }
    .wz-root.is-tv .su-code { font-size: 3rem; }
    .wz-root.is-tv .su-qc__qr-box img { width: 300px; height: 300px; max-height: 42vh; max-width: 42vh; }
  `;

  if (autoValidating) {
    return (
      <div>
        <style>{SU_CSS}</style>
        <StepHeader kicker="Serveur" title={t('wizard.serverUrl.connectClientTitle')} lead={backendUrl || getConfiguredBackendUrl() || ''} />
        <div class="su-status">
          <Spinner />
          <span>{t('serverSettings.testing')}</span>
        </div>
      </div>
    );
  }

  // Écran de choix : première installation ou déjà configuré (sauf si skipInitialChoice = affichage direct du formulaire URL)
  if (installationChoice === null) {
    return (
      <div>
        <style>{SU_CSS}</style>
        {confirmDialog}
        <StepHeader kicker="Serveur" title={t('wizard.serverUrl.connectClientTitle')} lead={t('wizard.serverUrl.choiceQuestion')} />
        <div class="su-choices">
          <button
            type="button"
            data-focusable
            onClick={() => {
              setInstallationChoice('firstTime');
              setShowManualConfig(true);
            }}
            class="wz-option"
          >
            <span class="wz-option__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>
            <span class="wz-option__body">
              <span class="wz-option__title">{t('wizard.serverUrl.choiceFirstTime')}</span>
              <span class="wz-option__desc">{t('wizard.serverUrl.choiceFirstTimeDesc')}</span>
            </span>
          </button>
          <button
            type="button"
            data-focusable
            onClick={() => setInstallationChoice('alreadyConfigured')}
            class="wz-option"
          >
            <span class="wz-option__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" /></svg></span>
            <span class="wz-option__body">
              <span class="wz-option__title">{t('wizard.serverUrl.choiceAlreadyConfigured')}</span>
              <span class="wz-option__desc">{t('wizard.serverUrl.choiceAlreadyConfiguredDesc')}</span>
            </span>
          </button>
          <button
            type="button"
            data-focusable
            onClick={() => {
              setInstallationChoice('localAccount');
              setShowManualConfig(true);
            }}
            class="wz-option"
          >
            <span class="wz-option__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg></span>
            <span class="wz-option__body">
              <span class="wz-option__title">{t('wizard.serverUrl.choiceLocalAccount')}</span>
              <span class="wz-option__desc">{t('wizard.serverUrl.choiceLocalAccountDesc')}</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const manualConfigCta = (
    <div class="su-manual-cta">
      <button
        type="button"
        data-focusable
        onClick={() => setShowManualConfig(true)}
        class="wz-option"
      >
        <span class="wz-option__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>
        <span class="wz-option__body">
          <span class="wz-option__title">{t('wizard.serverUrl.manualConfig')}</span>
          <span class="wz-option__desc">{t('wizard.serverUrl.manualConfigDesc')}</span>
        </span>
      </button>
    </div>
  );

  const choiceTitle =
    installationChoice === 'firstTime' ? t('wizard.serverUrl.choiceFirstTime')
    : installationChoice === 'alreadyConfigured' ? t('wizard.serverUrl.choiceAlreadyConfigured')
    : installationChoice === 'localAccount' ? t('wizard.serverUrl.choiceLocalAccount')
    : null;

  // Affichage principal (après choix)
  return (
    <div>
      <style>{SU_CSS}</style>
      {confirmDialog}
      {!skipInitialChoice && !showManualConfig && (
        <StepHeader kicker="Serveur" title={choiceTitle}>
          <div style="margin-top:18px;">
            <button
              type="button"
              data-focusable
              class="wz-link"
              onClick={() => { setInstallationChoice(null); setShowManualConfig(false); resetQuickConnect(); }}
              title={t('common.back')}
            >
              ← {t('common.back')}
            </button>
          </div>
        </StepHeader>
      )}
      {skipInitialChoice && !showManualConfig && (
        <StepHeader kicker="Serveur" title={t('wizard.serverUrl.connectClientTitle')} />
      )}

      {/* Mode mobile "première installation" uniquement (déjà configuré = même flux QR+code que TV) */}
      {isScannerMode && !showManualConfig && installationChoice === 'firstTime' && (
        <div class="wz-stack">
          {/* Message d'accueil clair avec deux options */}
          <div class="wz-panel">
            <h3 class="wz-h3">{t('wizard.serverUrl.mobileWelcome')}</h3>
            <p class="wz-text-sm" style="margin:0 0 18px;">{t('wizard.serverUrl.mobileChoiceIntro')}</p>
            <div class="wz-rows">
              <div class="wz-row">
                <span class="wz-row__icon is-on"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" /></svg></span>
                <div class="wz-row__body">
                  <span class="wz-row__title">{t('wizard.serverUrl.mobileJoinExisting')}</span>
                  <span class="wz-row__desc">{t('wizard.serverUrl.mobileJoinExistingDesc')}</span>
                </div>
              </div>
              <div class="wz-row">
                <span class="wz-row__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>
                <div class="wz-row__body">
                  <span class="wz-row__title">{t('wizard.serverUrl.mobileFirstInstall')}</span>
                  <span class="wz-row__desc">{t('wizard.serverUrl.mobileFirstInstallDesc')}</span>
                </div>
              </div>
            </div>
          </div>

          {quickConnectError && (
            <Alert tone="error" title={quickConnectError}>
              {quickConnectError.includes('caméra') || quickConnectError.includes('permission') ? (
                <>
                  <p style="margin:6px 0 2px;font-weight:500;">{t('wizard.serverUrl.cameraPermissionError')}</p>
                  <p style="margin:0;">{t('wizard.serverUrl.cameraPermissionHelp')}</p>
                </>
              ) : quickConnectError.includes('QR code') || quickConnectError.includes('scanner') ? (
                <>
                  <p style="margin:6px 0 2px;font-weight:500;">{t('wizard.serverUrl.qrScanError')}</p>
                  <p style="margin:0;">{t('wizard.serverUrl.qrScanErrorHelp')}</p>
                </>
              ) : null}
            </Alert>
          )}

          {/* Scanner QR */}
          {showScanner ? (
            <div class="wz-stack-sm">
              <Alert tone="info">{t('wizard.serverUrl.scanQRCodeDesc')}</Alert>
              <div
                id="qr-reader"
                ref={scannerRef}
                class="su-scanner"
              ></div>
              <button
                type="button"
                data-focusable
                onClick={stopScanner}
                class="wz-btn wz-btn--ghost wz-btn--block"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div>
              {/* Bouton Scanner - Option principale */}
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                type="button"
                data-focusable
                onClick={startScanner}
                disabled={authorizingCode}
                class="wz-btn wz-btn--primary su-scan-btn"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" /></svg>
                <span>{t('wizard.serverUrl.scanQRCode')}</span>
                <small>{t('wizard.serverUrl.mobileJoinExisting')}</small>
              </button>

              {/* Séparateur */}
              <div class="wz-divider">ou</div>

              {/* Entrer le code manuellement */}
              <div class="wz-panel">
                <label class="wz-label" for="wz-join-code">
                  {t('wizard.serverUrl.enterCodeManually')}
                </label>
                <p class="wz-help" style="margin:0 0 14px;">
                  {t('wizard.serverUrl.enterCodeDesc')}
                </p>
                <input
                  id="wz-join-code"
                  type="text"
                  value={manualCode}
                  onInput={(e) => setManualCode((e.target as HTMLInputElement).value.toUpperCase())}
                  placeholder="XXXXXX"
                  maxLength={6}
                  class="wz-input wz-input--code"
                  disabled={authorizingCode}
                />
                <button
                  ref={(el) => { buttonRefs.current[1] = el; }}
                  type="button"
                  data-focusable
                  onClick={handleManualCodeSubmit}
                  disabled={manualCode.length !== 6 || authorizingCode}
                  class="wz-btn wz-btn--ghost wz-btn--block"
                  style="margin-top:12px;"
                >
                  {authorizingCode ? (
                    <>
                      <Spinner />
                      Connexion...
                    </>
                  ) : (
                    'Valider le code'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bouton Configuration manuelle */}
          {manualConfigCta}
        </div>
      )}

      {/* ===== Quick Connect (tous devices) : afficher le code + QR, à saisir sur popcorn-web ===== */}
      {installationChoice === 'alreadyConfigured' && !showManualConfig && (
        <div>
          {/* Statut backend : pastille dans le header (Windows/Linux/macOS) — démarrer/arrêter/redémarrer au clic */}
          {quickConnectError && (
            <Alert tone="error" style="margin-bottom:24px;">
              <span>{quickConnectError}</span>
              <div style="margin-top:10px;">
                <button
                  type="button"
                  data-focusable
                  onClick={handleRegenerateQuickConnect}
                  class="wz-link wz-link--accent"
                >
                  Réessayer
                </button>
              </div>
            </Alert>
          )}

          {quickConnectLoading && !quickConnectCode && (
            <div class="wz-center" style="padding:48px 0;">
              <span class="ed-spinner ed-spinner--sm" aria-hidden="true" />
            </div>
          )}

          <div class="su-qc">
            {/* QR : zone dédiée, gardée visible à l'écran (TV) */}
            {quickConnectCode && quickConnectQrUrl && (
              <div
                ref={qrCodeContainerRef}
                id="wizard-qr-code-tv"
                class="su-qc__qr"
              >
                <div class="su-qc__qr-box">
                  <img
                    src={quickConnectQrUrl}
                    alt="QR Code de connexion"
                  />
                </div>
                <p class="su-qc__qr-caption">
                  {t('wizard.serverUrl.tvStep3')}
                </p>
              </div>
            )}

            <div class="su-qc__side">
              {/* Instructions avec étapes numérotées */}
              <span class="wz-section-label">{t('wizard.serverUrl.tvInstructionsTitle')}</span>
              <ol class="su-steps">
                <li><span class="wz-num">01</span><p>{t('wizard.serverUrl.tvStep1')}</p></li>
                <li><span class="wz-num">02</span><p>{t('wizard.serverUrl.tvStep2')}</p></li>
                <li><span class="wz-num">03</span><p>{t('wizard.serverUrl.tvStep3')}</p></li>
              </ol>
              <div class="su-flow" aria-hidden="true">
                <span>TV</span><span>→</span><span class="is-accent">QR Code</span><span>→</span><span class="is-accent">Téléphone</span>
              </div>

              {quickConnectCode && (
                <div style="margin-top:28px;">
                  {/* Code à 6 caractères */}
                  <span class="su-code-label">{t('wizard.serverUrl.tvOrEnterCode')}</span>
                  <div class="su-code">{quickConnectCode}</div>
                  <p class="wz-help">{t('wizard.serverUrl.tvStep4')}</p>

                  {/* Compteur de temps restant */}
                  {quickConnectExpiresAt && quickConnectStatus === 'pending' && (
                    <div class="su-expiry">
                      {t('wizard.serverUrl.tvExpiresIn')} {quickConnectRemaining ?? 0} {t('wizard.serverUrl.tvSeconds')}
                    </div>
                  )}

                  {/* Statut d'autorisation */}
                  {quickConnectStatus === 'pending' && (
                    <div class="su-status">
                      <span class="ed-spinner ed-spinner--xs" aria-hidden="true" />
                      {t('wizard.serverUrl.tvWaitingAuth')}
                    </div>
                  )}
                  {quickConnectStatus === 'authorized' && (
                    <div class="su-status is-ok">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M5 13l4 4L19 7" /></svg>
                      {t('wizard.serverUrl.tvAuthorized')}
                    </div>
                  )}

                  <div class="wz-inline" style="flex-wrap:wrap;margin-top:22px;">
                    {/* Bouton : ouvrir popcorn-web avec le code dans l’URL (comme le QR) */}
                    <a
                      href={`${getPopcornWebBaseUrl()}/quick-connect?code=${quickConnectCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-focusable
                      class="wz-btn wz-btn--primary"
                      style="margin:0 12px 10px 0;"
                    >
                      {t('wizard.serverUrl.openPopcornWebToAuthorize')}
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                    {/* Bouton régénérer */}
                    <button
                      type="button"
                      data-focusable
                      onClick={handleRegenerateQuickConnect}
                      disabled={quickConnectLoading}
                      class="wz-btn wz-btn--quiet"
                      style="margin:0 0 10px;"
                    >
                      Générer un nouveau code
                    </button>
                  </div>
                </div>
              )}

              {/* Clarification : le QR permet aussi de faire la première config depuis le téléphone */}
              <Alert tone="info" style="margin-top:22px;">{t('wizard.serverUrl.tvQrAlsoSetupFromPhone')}</Alert>
            </div>
          </div>

          {/* Bouton Configuration manuelle - visible sur TV/Desktop aussi */}
          {manualConfigCta}
        </div>
      )}

      {/* Section Configuration manuelle */}
      {showManualConfig && (
        <div>
          <StepHeader
            kicker="Serveur"
            title={skipInitialChoice ? t('wizard.serverUrl.connectClientTitle') : (choiceTitle || t('wizard.serverUrl.connectClientTitle'))}
            lead={skipInitialChoice ? "Entrez l'URL de votre serveur Popcorn (ex: http://localhost:3000)" : "Entrez l'URL de votre serveur Popcorn"}
          >
            {!skipInitialChoice && (
              <div style="margin-top:18px;">
                <button
                  type="button"
                  data-focusable
                  class="wz-link"
                  onClick={() => {
                    if (installationChoice === 'localAccount') {
                      setInstallationChoice(null);
                      setShowManualConfig(false);
                    } else {
                      setShowManualConfig(false);
                    }
                  }}
                  title={installationChoice === 'localAccount' ? t('common.back') : t('wizard.serverUrl.backToQrOrCode')}
                >
                  ← {installationChoice === 'localAccount' ? t('common.back') : t('wizard.serverUrl.backToQrOrCode')}
                </button>
                {installationChoice !== 'localAccount' && (
                  <button
                    type="button"
                    data-focusable
                    class="wz-link"
                    style="margin-left:24px;"
                    onClick={() => { setInstallationChoice(null); setShowManualConfig(false); resetQuickConnect(); }}
                    title={t('common.back')}
                  >
                    {t('common.back')}
                  </button>
                )}
              </div>
            )}
          </StepHeader>

          {/* Statut backend : voir la pastille dans le header (démarrer/arrêter/redémarrer) */}

          <div class="wz-stack">
          {error && (
            <Alert tone="error" title={error.split('\n\n')[0]}>
              {error.includes('\n\n') && (
                <div style="white-space:pre-line;">
                  {error.split('\n\n').slice(1).join('\n\n')}
                </div>
              )}
            </Alert>
          )}

          {success && <Alert tone="success">{success}</Alert>}

          {/* Formulaire URL */}
          <div class="wz-panel">
            <label class="wz-label" for="wz-backend-url">
              URL du Backend
            </label>
            <input
              id="wz-backend-url"
              type="url"
              class="wz-input wz-input--mono"
              placeholder="http://192.168.1.100:3000"
              value={backendUrl}
              onInput={(e) => {
                setBackendUrl((e.target as HTMLInputElement).value);
                setError(null);
                setSuccess(null);
              }}
              disabled={testing || loading}
            />
            <p class="wz-help">
              Ex: <code class="wz-code">http://192.168.1.100:3000</code>
            </p>
          </div>
          </div>

          {/* Bouton unique : teste la connexion et passe à l'étape suivante si OK */}
          <div class="wz-actions wz-actions--end">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="button"
              data-focusable
              class="wz-btn wz-btn--primary"
              onClick={handleNext}
              disabled={testing || loading || !backendUrl.trim()}
            >
              {testing ? (
                <>
                  <Spinner />
                  Connexion en cours...
                </>
              ) : (
                <>
                  {t('common.next')}
                  <IconArrowRight />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
