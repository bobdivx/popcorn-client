import { useEffect, useRef, useState } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
import { useWizardSteps, getNextStepNumberAfterWelcome } from './hooks/useWizardSteps';
import type { WizardStepId } from './hooks/useWizardSteps';
import { useI18n } from '../../lib/i18n';
import { ServerUrlStep } from './steps/ServerUrlStep';
import { LanguageStep } from './steps/LanguageStep';
import { AuthStep } from './steps/AuthStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { IndexersStep } from './steps/IndexersStep';
import { TmdbStep } from './steps/TmdbStep';
import { DownloadLocationStep } from './steps/DownloadLocationStep';
import { SyncStep } from './steps/SyncStep';
import { CompleteStep } from './steps/CompleteStep';
import { hasBackendUrl } from '../../lib/backend-config.js';
import { serverApi } from '../../lib/client/server-api';
import { PreferencesManager, TokenManager, clearStorageAndCookiesForSetup } from '../../lib/client/storage';
import { redirectTo } from '../../lib/utils/navigation.js';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { syncFieldToCloud } from '../../lib/utils/cloud-sync';
import { getBackendUrl } from '../../lib/backend-config.js';

// Icones SVG pour chaque step (inline pour éviter une dépendance externe)
const STEP_ICONS: Record<string, () => preact.JSX.Element> = {
  auth: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
    </svg>
  ),
  serverUrl: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
      <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
      <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
    </svg>
  ),
  language: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.696.914 1.026a1 1 0 11-1.44 1.389c-.188-.196-.373-.396-.554-.6a19.098 19.098 0 01-3.107 3.567 1 1 0 01-1.334-1.49 17.087 17.087 0 003.13-3.733 18.992 18.992 0 01-1.487-2.494 1 1 0 111.79-.89c.234.47.489.928.764 1.372.417-.934.752-1.913.997-2.927H3a1 1 0 110-2h3V3a1 1 0 011-1zm6 6a1 1 0 01.894.553l2.991 5.992a.869.869 0 01.02.037l.99 1.98a1 1 0 11-1.79.895L15.383 16h-4.764l-.724 1.447a1 1 0 11-1.788-.894l.99-1.98.019-.038 2.99-5.99A1 1 0 0113 8zm-1.382 6h2.764L13 11.236 11.618 14z" clip-rule="evenodd" />
    </svg>
  ),
  welcome: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ),
  indexers: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
    </svg>
  ),
  tmdb: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5H4v2h1V5zM4 7H3v2h1V7zm0 2H3v2h1V9zm0 2H3v2h1v-2zm0 2H3v2h1v-2zm0 2H3v1h1v-1zm2 1h6v-1H6v1zm7 0h1v-1h-1v1zm-8-1H4v1h1v-1z" />
    </svg>
  ),
  downloadLocation: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  ),
  sync: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
    </svg>
  ),
  complete: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
    </svg>
  ),
};

function CheckIcon() {
  return (
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={3}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function Wizard() {
  const { t } = useI18n();
  const { loading, setupStatus, checkSetupStatus } = useSetupStatus();
  const [forceShowStepIds, setForceShowStepIds] = useState<WizardStepId[]>([]);
  const [pendingNavStepId, setPendingNavStepId] = useState<WizardStepId | null>(null);
  const initialNeedsSetupRef = useRef<boolean | null>(null);
  const [wizardStartedWithNeedsSetup, setWizardStartedWithNeedsSetup] = useState(false);
  // Direction de l'animation (-1 = vers l'arrière, 1 = vers l'avant)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const prevStepRef = useRef<number>(1);

  const forceAllSteps = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';

  const { steps, totalSteps, getStepNumber, getStepId, getNextStepNumber, getPreviousStepNumber } = useWizardSteps(
    setupStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup, hasBackendUrl()
  );
  const { currentStep, setCurrentStep, focusedButtonIndex, setFocusedButtonIndex, buttonRefs } =
    useWizardNavigation(setupStatus, getStepId, getStepNumber, getNextStepNumber, getPreviousStepNumber);

  const { saving, error, success, setError, setSuccess, saveIndexer, saveTmdbKey, saveDownloadLocation, completeSetup } =
    useWizardActions();

  // Suivi de la direction pour l'animation
  useEffect(() => {
    if (currentStep > prevStepRef.current) {
      setStepDirection(1);
    } else if (currentStep < prevStepRef.current) {
      setStepDirection(-1);
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('popcorn-app-ready')), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    clearStorageAndCookiesForSetup();
  }, []);

  useEffect(() => {
    if (!pendingNavStepId) return;
    const stepNumber = getStepNumber(pendingNavStepId);
    if (stepNumber !== null) {
      setCurrentStep(stepNumber);
      setPendingNavStepId(null);
    }
  }, [pendingNavStepId, getStepNumber, setCurrentStep]);

  useEffect(() => {
    if (loading) return;
    // Pas d'URL backend au démarrage = supposer que le setup est nécessaire (valeur provisoire)
    // Ne pas verrouiller : si le backend confirme plus tard needsSetup=false, on doit corriger
    if (!setupStatus) {
      if (initialNeedsSetupRef.current === null && !hasBackendUrl()) {
        initialNeedsSetupRef.current = true;
        setWizardStartedWithNeedsSetup(true);
      }
      return;
    }
    // Le statut réel du backend est disponible — corriger le flag provisoire si nécessaire
    const needsSetup = setupStatus.needsSetup;
    if (needsSetup === false) {
      // Setup déjà effectué : lever le flag provisoire pour permettre la redirection
      initialNeedsSetupRef.current = false;
      setWizardStartedWithNeedsSetup(false);
    } else if (initialNeedsSetupRef.current === null) {
      // Premier statut réel avec needsSetup=true
      initialNeedsSetupRef.current = true;
      setWizardStartedWithNeedsSetup(true);
    }
    // Si initialNeedsSetupRef.current === true et needsSetup === true : ne rien changer
  }, [loading, setupStatus]);

  useEffect(() => {
    const forceWizard = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';

    const checkAndRedirect = async () => {
      if (!hasBackendUrl()) return;
      if (loading || !setupStatus) return;
      if (forceWizard) return;
      if (setupStatus.backendReachable && setupStatus.needsSetup === false && setupStatus.hasUsers === true) {
        const currentStepId = getStepId(currentStep);
        const middleSteps: WizardStepId[] = ['serverUrl', 'language', 'auth', 'welcome', 'indexers', 'tmdb', 'downloadLocation', 'sync'];
        // Bloquer la redirection uniquement si le wizard a VRAIMENT démarré pour un setup nécessaire
        // (pas juste parce qu'il n'y avait pas d'URL backend au départ)
        if (currentStepId && middleSteps.includes(currentStepId) && initialNeedsSetupRef.current === true) return;
        if (initialNeedsSetupRef.current === true) return;
        if (serverApi.isAuthenticated()) {
          redirectTo('/dashboard');
        } else {
          redirectTo('/login');
        }
      }
    };

    checkAndRedirect();
  }, [loading, setupStatus, currentStep, getStepId]);

  const appVersion = (() => {
    try { return ((import.meta as any).env?.PUBLIC_APP_VERSION as string) || 'dev'; } catch { return 'dev'; }
  })();

  const appVersionCode = (() => {
    try {
      const raw = (import.meta as any).env?.PUBLIC_APP_VERSION_CODE as string | undefined;
      return raw ? String(raw) : '';
    } catch { return ''; }
  })();

  const openDiagnostics = () => {
    try { redirectTo('/settings/diagnostics'); } catch { /* ignore */ }
  };

  // ─── Écran de chargement ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-screen" style="background:#07070e">
        <HLSLoadingSpinner size="lg" text="Chargement..." />
      </div>
    );
  }

  if (!setupStatus && hasBackendUrl()) {
    return (
      <div class="min-h-screen flex items-center justify-center p-6" style="background:#07070e">
        <div class="wizard-card max-w-md w-full text-center p-8">
          <div class="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 class="text-white font-bold text-xl mb-2">Backend inaccessible</h3>
          <p class="text-gray-400 text-sm mb-6">Impossible de charger le statut du setup. Vérifiez que le backend est démarré.</p>
          <button class="wizard-btn-primary w-full" onClick={openDiagnostics}>
            Ouvrir les diagnostics
          </button>
          <div class="mt-4 text-xs text-gray-600">v{appVersion}</div>
        </div>
      </div>
    );
  }

  const handleSaveTmdb = async (key: string) => {
    const result = await saveTmdbKey(key);
    if (!result.success) throw new Error(result.message);
    setForceShowStepIds((prev) => (prev.includes('tmdb') ? prev : [...prev, 'tmdb']));
    await checkSetupStatus();
    // Sync incrémentale vers le cloud (non-bloquant)
    syncFieldToCloud({ tmdbApiKey: key }).catch(() => {});
  };

  const handleSaveDownloadLocation = async (path: string) => {
    const result = await saveDownloadLocation(path);
    if (result) {
      await checkSetupStatus();
      // Sync incrémentale vers le cloud (non-bloquant)
      syncFieldToCloud({ downloadLocation: path }).catch(() => {});
    }
  };

  const currentStepId = getStepId(currentStep);
  const progressPct = Math.round((currentStep / totalSteps) * 100);

  // Liste complète des étapes pour la sidebar (toutes visibles, y compris skippées)
  const ALL_SIDEBAR_STEPS: WizardStepId[] = [
    'auth', 'serverUrl', 'language', 'welcome',
    'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete',
  ];
  const SIDEBAR_LABELS: Record<WizardStepId, string> = {
    auth: 'Connexion', serverUrl: 'Serveur', language: 'Langue',
    welcome: 'Bienvenue', indexers: 'Indexers', tmdb: 'TMDB',
    downloadLocation: 'Téléchargement', sync: 'Sync', complete: 'Terminé',
  };

  // Naviguer vers une étape en cliquant dans la sidebar
  const handleSidebarStepClick = (stepId: WizardStepId) => {
    const stepNumber = getStepNumber(stepId);
    if (stepNumber !== null) {
      // Étape dans la liste courante → navigation directe
      setCurrentStep(stepNumber);
    } else {
      // Étape skippée → forcer son affichage puis naviguer
      setForceShowStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]));
      setPendingNavStepId(stepId);
    }
  };

  // ─── Rendu du contenu de l'étape ─────────────────────────────────────────
  const renderStepContent = () => {
    if (!currentStepId) return null;

    switch (currentStepId) {
      case 'serverUrl':
        return (
          <ServerUrlStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onStatusChange={checkSetupStatus}
            skipInitialChoice={true}
            onNext={async () => {
              // Rafraîchir le statut sans rediriger : l'utilisateur vient de saisir son URL
              // et doit passer par les étapes suivantes (bienvenue, indexers, TMDB, etc.)
              await checkSetupStatus();
              // Sync incrémentale de l'URL backend vers le cloud (non-bloquant)
              const savedUrl = getBackendUrl();
              if (savedUrl) syncFieldToCloud({ backendUrl: savedUrl }).catch(() => {});
              const next = getNextStepNumber('serverUrl');
              if (next) setCurrentStep(next);
            }}
          />
        );

      case 'language':
        return (
          <LanguageStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => { const n = getNextStepNumber('language'); if (n) setCurrentStep(n); }}
          />
        );

      case 'auth':
        return (
          <AuthStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={() => { const n = getNextStepNumber('auth'); if (n) setCurrentStep(n); }}
            onStatusChange={checkSetupStatus}
          />
        );

      case 'welcome':
        return (
          <WelcomeStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onNext={async (saveToCloud) => {
              if (typeof window !== 'undefined') {
                localStorage.setItem('popcorn_client_save_to_cloud', String(saveToCloud));
              }
              const freshStatus = await checkSetupStatus();
              // Ordre naturel : après Bienvenue → Indexers puis TMDB (pas de saut direct vers TMDB)
              const next = freshStatus !== null
                ? getNextStepNumberAfterWelcome(freshStatus, forceShowStepIds, forceAllSteps, wizardStartedWithNeedsSetup, hasBackendUrl())
                : getNextStepNumber('welcome');
              if (next !== null) setCurrentStep(next);
            }}
            onNavigateToStep={(stepId) => {
              const id = stepId as WizardStepId;
              setForceShowStepIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
              setPendingNavStepId(id);
            }}
          />
        );

      case 'indexers':
        return (
          <IndexersStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => { const p = getPreviousStepNumber('indexers'); if (p) setCurrentStep(p); }}
            onNext={() => {
              const next = getNextStepNumber('indexers');
              if (next) setCurrentStep(next);
            }}
            onStatusChange={checkSetupStatus}
          />
        );

      case 'tmdb':
        return (
          <TmdbStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => { const p = getPreviousStepNumber('tmdb'); if (p) setCurrentStep(p); }}
            onNext={() => { const n = getNextStepNumber('tmdb'); if (n) setCurrentStep(n); }}
            onSave={handleSaveTmdb}
            onStatusChange={checkSetupStatus}
          />
        );

      case 'downloadLocation':
        return (
          <DownloadLocationStep
            setupStatus={setupStatus}
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => { const p = getPreviousStepNumber('downloadLocation'); if (p) setCurrentStep(p); }}
            onNext={() => { const n = getNextStepNumber('downloadLocation'); if (n) setCurrentStep(n); }}
            onSave={handleSaveDownloadLocation}
          />
        );

      case 'sync':
        return (
          <SyncStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onPrevious={() => { const p = getPreviousStepNumber('sync'); if (p) setCurrentStep(p); }}
            onNext={() => { const n = getNextStepNumber('sync'); if (n) setCurrentStep(n); }}
          />
        );

      case 'complete':
        return (
          <CompleteStep
            focusedButtonIndex={focusedButtonIndex}
            buttonRefs={buttonRefs}
            onComplete={async () => {
              const saveToCloud = typeof window !== 'undefined'
                ? localStorage.getItem('popcorn_client_save_to_cloud') === 'true'
                : false;
              if (saveToCloud) {
                try {
                  const cloudToken = TokenManager.getCloudAccessToken();
                  if (cloudToken) {
                    const { getBackendUrl } = await import('../../lib/backend-config');
                    const { isTmdbKeyMaskedOrInvalid } = await import('../../lib/utils/tmdb-key');
                    const { saveUserConfigMerge } = await import('../../lib/api/popcorn-web');
                    const [indexersRes, tmdbRes, syncRes] = await Promise.all([
                      serverApi.getIndexers(),
                      serverApi.getTmdbKeyExport(),
                      serverApi.getSyncSettings(),
                    ]);
                    const indexers = indexersRes.success && Array.isArray(indexersRes.data)
                      ? indexersRes.data.map((idx: any) => ({
                          id: idx.id, name: idx.name, baseUrl: idx.baseUrl, apiKey: idx.apiKey ?? null,
                          jackettIndexerName: idx.jackettIndexerName ?? null, isEnabled: idx.isEnabled,
                          isDefault: idx.isDefault, priority: idx.priority ?? 0,
                          indexerTypeId: idx.indexerTypeId ?? null, configJson: idx.configJson ?? null,
                        }))
                      : [];
                    const rawTmdb = tmdbRes.success && tmdbRes.data?.apiKey ? tmdbRes.data.apiKey : null;
                    const tmdbApiKey = rawTmdb && !isTmdbKeyMaskedOrInvalid(rawTmdb) ? rawTmdb : null;
                    let syncSettings: any = null;
                    if (syncRes.success && syncRes.data) {
                      const s = syncRes.data;
                      syncSettings = {
                        syncEnabled: s.is_enabled === 1 || s.is_enabled === true,
                        syncFrequencyMinutes: s.sync_frequency_minutes,
                        maxTorrentsPerCategory: s.max_torrents_per_category,
                        rssIncrementalEnabled: s.rss_incremental_enabled === 1 || s.rss_incremental_enabled === true,
                        syncQueriesFilms: Array.isArray(s.sync_queries_films) ? s.sync_queries_films : undefined,
                        syncQueriesSeries: Array.isArray(s.sync_queries_series) ? s.sync_queries_series : undefined,
                      };
                    }
                    const downloadLocation = PreferencesManager.getDownloadLocation();
                    const prefLang = PreferencesManager.getPreferences().language;
                    const language = prefLang === 'fr' || prefLang === 'en' ? prefLang : null;
                    await saveUserConfigMerge({
                      backendUrl: getBackendUrl() || null, indexers, tmdbApiKey,
                      downloadLocation: downloadLocation || null, language, syncSettings, indexerCategories: null,
                    });
                  }
                } catch (e) {
                  console.warn('[WIZARD] Erreur sauvegarde cloud:', e);
                }
              }
              redirectTo('/dashboard');
            }}
          />
        );

      default:
        return null;
    }
  };

  // ─── Layout principal ─────────────────────────────────────────────────────
  return (
    <div class="wizard-root">
      <style>{`
        .wizard-root {
          min-height: 100vh;
          background: #07070e;
          display: flex;
          font-family: system-ui, -apple-system, sans-serif;
        }
        /* Sidebar */
        .wizard-sidebar {
          width: 280px;
          flex-shrink: 0;
          background: linear-gradient(180deg, #0e0815 0%, #0a0812 100%);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          padding: 28px 20px;
          position: relative;
          overflow: hidden;
        }
        .wizard-sidebar::before {
          content: '';
          position: absolute;
          top: -80px; left: -80px;
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .wizard-sidebar::after {
          content: '';
          position: absolute;
          bottom: -60px; right: -60px;
          width: 240px; height: 240px;
          background: radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        @media (max-width: 1023px) {
          .wizard-sidebar { display: none; }
        }
        /* Sidebar logo */
        .wizard-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 36px;
          position: relative;
          z-index: 1;
        }
        .wizard-logo-icon {
          width: 40px; height: 40px;
          border-radius: 12px;
          background: rgba(124,58,237,0.15);
          border: 1px solid rgba(124,58,237,0.3);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .wizard-logo-text { color: #fff; font-weight: 700; font-size: 15px; line-height: 1.2; }
        .wizard-logo-sub { color: rgba(167,139,250,0.7); font-size: 11px; margin-top: 1px; }
        /* Sidebar steps */
        .wizard-step-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: 10px;
          margin-bottom: 2px;
          transition: all 0.18s ease;
          position: relative; z-index: 1;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .wizard-step-item:hover:not(.active) {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.06);
        }
        .wizard-step-item.active {
          background: rgba(124,58,237,0.12);
          border-color: rgba(124,58,237,0.25);
        }
        .wizard-step-item.completed { opacity: 0.7; }
        .wizard-step-item.completed:hover { opacity: 1; }
        .wizard-step-item.pending { opacity: 0.3; }
        .wizard-step-item.pending:hover { opacity: 0.55; }
        .wizard-step-item.skipped { opacity: 0.45; }
        .wizard-step-item.skipped:hover { opacity: 0.75; }
        .wizard-step-bubble {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .wizard-step-bubble.active {
          background: #7c3aed; color: #fff;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.25);
        }
        .wizard-step-bubble.completed {
          background: rgba(124,58,237,0.5); color: #ddd6fe;
        }
        .wizard-step-bubble.pending {
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .wizard-step-bubble.skipped {
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.25);
          border: 1px dashed rgba(255,255,255,0.12);
        }
        .wizard-step-label {
          font-size: 12.5px; font-weight: 500;
          color: rgba(255,255,255,0.9);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .wizard-step-item.pending .wizard-step-label { color: rgba(255,255,255,0.3); }
        .wizard-step-item.completed .wizard-step-label { color: rgba(255,255,255,0.6); }
        .wizard-step-item.skipped .wizard-step-label { color: rgba(255,255,255,0.3); font-style: italic; }
        .wizard-step-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #a78bfa; margin-left: auto; flex-shrink: 0;
          animation: wizard-pulse 2s ease-in-out infinite;
        }
        @keyframes wizard-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
        .wizard-step-edit-hint {
          margin-left: auto; flex-shrink: 0;
          font-size: 9.5px; font-weight: 600;
          color: rgba(167,139,250,0.45);
          letter-spacing: 0.3px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .wizard-step-item:hover .wizard-step-edit-hint { opacity: 1; }
        .wizard-sidebar-footer {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
          position: relative; z-index: 1;
        }
        /* Main content */
        .wizard-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
        }
        .wizard-main::before {
          content: '';
          position: absolute;
          top: 0; right: 0;
          width: 500px; height: 500px;
          background: radial-gradient(circle at top right, rgba(124,58,237,0.04) 0%, transparent 60%);
          pointer-events: none;
        }
        .wizard-content {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 32px 24px;
          overflow-y: auto;
        }
        @media (min-width: 640px) {
          .wizard-content { padding: 40px 48px; }
        }
        @media (min-width: 1024px) {
          .wizard-content { padding: 48px 64px; align-items: center; }
        }
        .wizard-content-inner {
          width: 100%; max-width: 640px;
          position: relative;
        }
        /* Mobile progress */
        .wizard-mobile-bar {
          display: none;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(14,8,21,0.8);
          backdrop-filter: blur(8px);
          position: sticky; top: 0; z-index: 10;
        }
        @media (max-width: 1023px) { .wizard-mobile-bar { display: block; } }
        .wizard-mobile-progress-track {
          height: 3px; background: rgba(255,255,255,0.06); border-radius: 9999px;
          margin-top: 8px;
        }
        .wizard-mobile-progress-fill {
          height: 100%; border-radius: 9999px;
          background: linear-gradient(90deg, #7c3aed, #a78bfa);
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Step animation */
        @keyframes wizard-slide-forward {
          from { opacity: 0; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wizard-slide-back {
          from { opacity: 0; transform: translateX(-28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .wizard-step-forward { animation: wizard-slide-forward 0.32s cubic-bezier(0.16,1,0.3,1) both; }
        .wizard-step-back { animation: wizard-slide-back 0.32s cubic-bezier(0.16,1,0.3,1) both; }
        /* Card */
        .wizard-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 24px;
        }
        /* Inputs */
        .wizard-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 11px 14px;
          color: #fff;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .wizard-input::placeholder { color: rgba(255,255,255,0.25); }
        .wizard-input:focus {
          border-color: rgba(124,58,237,0.6);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        /* Buttons */
        .wizard-btn-primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 11px 24px;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: #fff;
          font-size: 14px; font-weight: 600;
          border-radius: 10px; border: none; cursor: pointer;
          transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
          box-shadow: 0 4px 14px rgba(124,58,237,0.3);
        }
        .wizard-btn-primary:hover:not(:disabled) {
          opacity: 0.92; transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(124,58,237,0.4);
        }
        .wizard-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .wizard-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
        .wizard-btn-secondary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 11px 20px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75);
          font-size: 14px; font-weight: 500;
          border-radius: 10px; cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .wizard-btn-secondary:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.15);
        }
        .wizard-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
        /* Labels */
        .wizard-label {
          display: block; font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.65); margin-bottom: 6px;
          letter-spacing: 0.3px;
        }
        /* Error/success banners */
        .wizard-error {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 10px; padding: 12px 16px;
          color: #fca5a5; font-size: 13.5px;
        }
        .wizard-success {
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.25);
          border-radius: 10px; padding: 12px 16px;
          color: #86efac; font-size: 13.5px;
          display: flex; align-items: center; gap: 8px;
        }
        /* Divider */
        .wizard-divider {
          display: flex; align-items: center; gap: 12px;
          color: rgba(255,255,255,0.2); font-size: 12px;
          margin: 16px 0;
        }
        .wizard-divider::before, .wizard-divider::after {
          content: '';
          flex: 1; height: 1px;
          background: rgba(255,255,255,0.07);
        }
        /* Footer */
        .wizard-footer {
          display: flex; align-items: center; justify-content: center; gap: 12px;
          padding: 16px;
          border-top: 1px solid rgba(255,255,255,0.04);
        }
        .wizard-footer-link {
          font-size: 11.5px; color: rgba(255,255,255,0.3);
          text-decoration: none; cursor: pointer;
          transition: color 0.15s;
        }
        .wizard-footer-link:hover { color: rgba(255,255,255,0.55); }
        .wizard-footer-dot {
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
        }
      `}</style>

      {/* ── Sidebar ── */}
      <aside class="wizard-sidebar">
        <div class="wizard-logo">
          <div class="wizard-logo-icon">
            <img src="/popcorn_logo.png" alt="Popcorn" style="width:22px;height:22px;object-fit:contain;" />
          </div>
          <div>
            <div class="wizard-logo-text">Popcorn</div>
            <div class="wizard-logo-sub">Configuration</div>
          </div>
        </div>

        <div style="flex:1;overflow-y:auto;">
          {ALL_SIDEBAR_STEPS.map((stepId) => {
            const step = steps.find(s => s.id === stepId);
            const isInFlow = !!step;
            const isActive = isInFlow && step!.number === currentStep;
            const isCompleted = isInFlow && step!.number < currentStep;
            const isSkipped = !isInFlow; // Étape auto-skippée (déjà configurée)
            const state = isActive ? 'active' : isCompleted ? 'completed' : isSkipped ? 'skipped' : 'pending';
            const Icon = STEP_ICONS[stepId];
            return (
              <div
                key={stepId}
                class={`wizard-step-item ${state}`}
                onClick={() => handleSidebarStepClick(stepId)}
                title={isSkipped ? 'Étape passée automatiquement — cliquez pour modifier' : undefined}
              >
                <div class={`wizard-step-bubble ${state}`}>
                  {isCompleted ? <CheckIcon /> : Icon ? <Icon /> : (isInFlow ? step!.number : '–')}
                </div>
                <span class="wizard-step-label">{SIDEBAR_LABELS[stepId]}</span>
                {isActive && <div class="wizard-step-dot" />}
                {isSkipped && (
                  <span style="margin-left:auto;flex-shrink:0;font-size:10px;color:rgba(167,139,250,0.4);" title="Configuré, cliquez pour modifier">✓</span>
                )}
                {!isActive && !isSkipped && (
                  <span class="wizard-step-edit-hint">modifier</span>
                )}
              </div>
            );
          })}
        </div>

        <div class="wizard-sidebar-footer">
          <div style="font-size:11px;color:rgba(255,255,255,0.2);">
            v{appVersion}{appVersionCode ? ` • build ${appVersionCode}` : ''}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main class="wizard-main">
        {/* Barre de progression mobile */}
        <div class="wizard-mobile-bar">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="/popcorn_logo.png" alt="" style="width:20px;height:20px;object-fit:contain;opacity:0.8;" />
              <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);">Popcorn</span>
            </div>
            <span style="font-size:12px;color:rgba(167,139,250,0.8);font-weight:500;">
              {currentStep}/{totalSteps} · {steps[currentStep - 1]?.label || ''}
            </span>
          </div>
          <div class="wizard-mobile-progress-track">
            <div class="wizard-mobile-progress-fill" style={`width:${progressPct}%`} />
          </div>
        </div>

        {/* Contenu de l'étape */}
        <div class="wizard-content">
          <div class="wizard-content-inner">
            {/* Messages globaux (error/success du wizard) */}
            {error && <div class="wizard-error" style="margin-bottom:16px;">{error}</div>}
            {success && (
              <div class="wizard-success" style="margin-bottom:16px;">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M5 13l4 4L19 7" />
                </svg>
                {success}
              </div>
            )}

            {/* Contenu animé selon la direction */}
            <div
              key={currentStep}
              class={stepDirection === 1 ? 'wizard-step-forward' : 'wizard-step-back'}
            >
              {renderStepContent()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer class="wizard-footer">
          <button class="wizard-footer-link" onClick={openDiagnostics}>Diagnostics</button>
          <div class="wizard-footer-dot" />
          <span style="font-size:11.5px;color:rgba(255,255,255,0.18);">v{appVersion}</span>
        </footer>
      </main>
    </div>
  );
}
