import { useEffect, useRef, useState } from 'preact/hooks';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useWizardActions } from './hooks/useWizardActions';
import { useWizardSteps, getNextStepNumberAfterWelcome, isWizardStepAvailable } from './hooks/useWizardSteps';
import type { WizardStepId } from './hooks/useWizardSteps';
import { TORRENT_FEATURES_ENABLED, isTorrentModuleAvailable } from '../../lib/distribution';
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
import { ensureEmbeddedDesktopBackendUrl } from '../../lib/embedded-desktop';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { dbgLog } from '../../lib/debug/debug-store';
import { serverApi } from '../../lib/client/server-api';
import { PreferencesManager, TokenManager, clearStorageAndCookiesForSetup } from '../../lib/client/storage';
import { redirectTo } from '../../lib/utils/navigation.js';
import DsLoader from '../ui/DsLoader';
import { WIZARD_THEME_CSS } from './wizardTheme';
import { syncFieldToCloud } from '../../lib/utils/cloud-sync';
import { getBackendUrl } from '../../lib/backend-config.js';
import { hasPendingSsoReturn, initNativeSsoListener } from '../../lib/auth/native-sso';

// Coche fine (style éditorial) pour les étapes terminées
function CheckIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5} aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

export default function Wizard() {
  const { t } = useI18n();
  /** Traduction avec repli (clé absente ou locale pas encore chargée). */
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };
  const { loading, setupStatus, checkSetupStatus } = useSetupStatus();
  const [forceShowStepIds, setForceShowStepIds] = useState<WizardStepId[]>([]);
  const [pendingNavStepId, setPendingNavStepId] = useState<WizardStepId | null>(null);
  const initialNeedsSetupRef = useRef<boolean | null>(null);
  const [wizardStartedWithNeedsSetup, setWizardStartedWithNeedsSetup] = useState(false);
  // Direction de l'animation (-1 = vers l'arrière, 1 = vers l'avant)
  const [stepDirection, setStepDirection] = useState<1 | -1>(1);
  const prevStepRef = useRef<number>(1);
  const wdbg = (msg: string) => dbgLog('[WIZ] ' + msg);
  // Évalué au premier rendu (avant les effets des étapes, qui consomment le ticket) : retour
  // Pocket ID en cours → ne pas effacer le stockage (sinon la session tout juste créée est perdue).
  const [ssoReturnAtMount] = useState(() => hasPendingSsoReturn());

  const forceAllSteps = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';
  const isTV = typeof window !== 'undefined' && isTVPlatform();

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
    // Apps Tauri : écouter le retour Pocket ID (deep link) dès l'ouverture de l'assistant.
    initNativeSsoListener();
    if (ssoReturnAtMount) {
      wdbg('mount: retour Pocket ID en cours → stockage conservé');
    } else {
      clearStorageAndCookiesForSetup();
    }
    // Desktop embarqué : le clear du wizard ne doit pas effacer l'URL locale auto-détectée.
    void ensureEmbeddedDesktopBackendUrl({ force: true });
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
    wdbg(`E1 status=${setupStatus ? `ns=${setupStatus.needsSetup} hu=${setupStatus.hasUsers} br=${setupStatus.backendReachable}` : 'null'} ref=${initialNeedsSetupRef.current} hasUrl=${hasBackendUrl()}`);
    if (!setupStatus) {
      if (initialNeedsSetupRef.current === null && !hasBackendUrl()) {
        initialNeedsSetupRef.current = true;
        setWizardStartedWithNeedsSetup(true);
        wdbg('E1 → ref=true (no backendUrl)');
      }
      return;
    }
    const needsSetup = setupStatus.needsSetup;
    if (needsSetup === false) {
      if (initialNeedsSetupRef.current !== true) {
        wdbg('E1 → needsSetup=false & ref!=true → RESET ref=false wSNS=false');
        initialNeedsSetupRef.current = false;
        setWizardStartedWithNeedsSetup(false);
      } else {
        wdbg('E1 → needsSetup=false MAIS ref===true → GARDER (protection mobile)');
      }
    } else if (initialNeedsSetupRef.current === null) {
      initialNeedsSetupRef.current = true;
      setWizardStartedWithNeedsSetup(true);
      wdbg('E1 → needsSetup=true → ref=true');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, setupStatus]);

  useEffect(() => {
    const forceWizard = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('force') === '1';

    const checkAndRedirect = async () => {
      wdbg(`E2 hasUrl=${hasBackendUrl()} step=${currentStep} ref=${initialNeedsSetupRef.current} ns=${setupStatus?.needsSetup} hu=${setupStatus?.hasUsers} br=${setupStatus?.backendReachable}`);
      if (!hasBackendUrl()) { wdbg('E2 → exit no backendUrl'); return; }
      if (loading || !setupStatus) { wdbg('E2 → exit loading/noStatus'); return; }
      if (forceWizard) return;
      if (setupStatus.backendReachable && setupStatus.needsSetup === false && setupStatus.hasUsers === true) {
        const currentStepId = getStepId(currentStep);
        wdbg(`E2 cond OK | stepId=${currentStepId} auth=${serverApi.isAuthenticated()} ref=${initialNeedsSetupRef.current}`);
        if (serverApi.isAuthenticated()) {
          wdbg('E2 → redirectTo /dashboard'); redirectTo('/dashboard');
        } else {
          wdbg('E2 → redirectTo /login'); redirectTo('/login');
        }
      } else {
        wdbg(`E2 → cond NON remplie br=${setupStatus?.backendReachable} ns=${setupStatus?.needsSetup} hu=${setupStatus?.hasUsers}`);
      }
    };

    checkAndRedirect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div class="wz-root" style="align-items:center;justify-content:center;">
        <style>{WIZARD_THEME_CSS}</style>
        <DsLoader size="lg" />
      </div>
    );
  }

  if (!setupStatus && hasBackendUrl()) {
    return (
      <div class={`wz-root${isTV ? ' is-tv' : ''}`} style="align-items:center;justify-content:center;padding:24px;">
        <style>{WIZARD_THEME_CSS}</style>
        <div class="wz-center" style="width:100%;max-width:520px;">
          <span class="wz-brand__name" style="margin-bottom:40px;opacity:0.6;">Popcornn</span>
          <div class="wz-seal wz-seal--err">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.25} aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94 2.4 17.25A1.95 1.95 0 0 0 4.06 20.2h15.88a1.95 1.95 0 0 0 1.66-2.95L13.66 3.94a1.95 1.95 0 0 0-3.32 0z" />
            </svg>
          </div>
          <div class="wz-head wz-head--center" style="margin-bottom:32px;">
            <span class="wz-kicker">{tr('wizard.shell.errorKicker', 'Connexion')}</span>
            <h2 class="wz-title">{tr('wizard.shell.backendUnreachableTitle', 'Backend inaccessible')}</h2>
            <span class="wz-rule" />
            <p class="wz-lead">{tr('wizard.shell.backendUnreachableMessage', 'Impossible de charger le statut du setup. Vérifiez que le backend est démarré.')}</p>
          </div>
          <button type="button" class="wz-btn wz-btn--primary wz-btn--block" data-focusable onClick={openDiagnostics}>
            {tr('wizard.shell.openDiagnostics', 'Ouvrir les diagnostics')}
          </button>
          <div class="wz-version" style="margin-top:24px;">v{appVersion}</div>
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
  const ALL_SIDEBAR_STEPS: WizardStepId[] = ([
    'auth', 'serverUrl', 'language', 'welcome',
    'indexers', 'tmdb', 'downloadLocation', 'sync', 'complete',
  ] as WizardStepId[]).filter(isWizardStepAvailable);
  const SIDEBAR_LABELS: Record<WizardStepId, string> = {
    auth: tr('wizard.shell.steps.auth', 'Connexion'),
    serverUrl: tr('wizard.shell.steps.serverUrl', 'Serveur'),
    language: tr('wizard.shell.steps.language', 'Langue'),
    welcome: tr('wizard.shell.steps.welcome', 'Bienvenue'),
    indexers: tr('wizard.shell.steps.indexers', 'Indexers'),
    tmdb: tr('wizard.shell.steps.tmdb', 'TMDB'),
    downloadLocation: tr('wizard.shell.steps.downloadLocation', 'Téléchargement'),
    sync: tr('wizard.shell.steps.sync', 'Sync'),
    complete: tr('wizard.shell.steps.complete', 'Terminé'),
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
            onNext={() => {
              const n = getNextStepNumber('auth');
              wdbg(`onNext auth → nextStep=${n} ref=${initialNeedsSetupRef.current}`);
              if (n) setCurrentStep(n);
              else wdbg('onNext auth → AUCUNE étape suivante (n=null) !');
            }}
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
        // Version store : étape absente (composant exclu du build) ; serveur sans module torrent : sautée.
        if (!TORRENT_FEATURES_ENABLED || !isTorrentModuleAvailable()) return null;
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
        // Version store : étape absente (composant exclu du build) ; serveur sans module torrent : sautée.
        if (!TORRENT_FEATURES_ENABLED || !isTorrentModuleAvailable()) return null;
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
        // Version store : étape absente (composant exclu du build) ; serveur sans module torrent : sautée.
        if (!TORRENT_FEATURES_ENABLED || !isTorrentModuleAvailable()) return null;
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
  const currentLabel = (currentStepId && SIDEBAR_LABELS[currentStepId]) || steps[currentStep - 1]?.label || '';
  const stepWord = tr('wizard.shell.step', 'Étape');
  const ofWord = tr('wizard.shell.of', 'sur');
  const pager = (
    <div class="wz-pager" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={currentStep} aria-label={`${stepWord} ${currentStep} ${ofWord} ${totalSteps}`}>
      {steps.map((s) => (
        <span
          key={s.id}
          class={`wz-pager__seg${s.number === currentStep ? ' is-active' : s.number < currentStep ? ' is-done' : ''}`}
        />
      ))}
    </div>
  );

  return (
    <div class={`wz-root${isTV ? ' is-tv tv-platform' : ''}`} data-wizard-progress={progressPct}>
      <style>{WIZARD_THEME_CSS}</style>

      {/* ── Rail des étapes (desktop / TV) ── */}
      <aside class="wz-rail" aria-label={tr('wizard.shell.setup', 'Configuration')}>
        <div class="wz-brand">
          <img class="wz-brand__logo" src="/popcorn_logo.png" alt="" />
          <div>
            <span class="wz-brand__name">Popcornn</span>
            <span class="wz-brand__sub">{tr('wizard.shell.setup', 'Configuration')}</span>
          </div>
        </div>

        <p class="wz-rail__kicker">{tr('wizard.shell.stepsTitle', 'Étapes')}</p>
        <ol class="wz-steps">
          {ALL_SIDEBAR_STEPS.map((stepId, index) => {
            const step = steps.find(s => s.id === stepId);
            const isInFlow = !!step;
            const isActive = isInFlow && step!.number === currentStep;
            const isCompleted = isInFlow && step!.number < currentStep;
            const isSkipped = !isInFlow; // Étape auto-skippée (déjà configurée)
            const state = isActive ? 'is-active' : isCompleted ? 'is-done' : isSkipped ? 'is-skipped' : 'is-pending';
            return (
              <li key={stepId}>
                <button
                  type="button"
                  class={`wz-step ${state}`}
                  onClick={() => handleSidebarStepClick(stepId)}
                  aria-current={isActive ? 'step' : undefined}
                  /* TV : la télécommande reste dans le contenu de l'étape (comportement inchangé). */
                  tabIndex={isTV ? -1 : 0}
                  title={isSkipped ? tr('wizard.shell.skippedHint', 'Étape passée automatiquement — cliquez pour modifier') : undefined}
                >
                  <span class="wz-step__num">{pad2(index + 1)}</span>
                  <span class="wz-step__label">{SIDEBAR_LABELS[stepId]}</span>
                  {isCompleted && <span class="wz-step__mark"><CheckIcon /></span>}
                  {isSkipped && <span class="wz-step__mark">{tr('wizard.shell.configured', 'Configuré')}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <div class="wz-rail__foot">
          <button type="button" class="wz-link" onClick={openDiagnostics} tabIndex={isTV ? -1 : 0}>
            {tr('wizard.shell.diagnostics', 'Diagnostics')}
          </button>
          <span class="wz-version">v{appVersion}{appVersionCode ? ` · ${appVersionCode}` : ''}</span>
        </div>
      </aside>

      {/* ── Contenu ── */}
      <main class="wz-main wizard-main">
        {/* Barre mobile / tablette */}
        <div class="wz-topbar">
          <div class="wz-topbar__row">
            <div class="wz-topbar__brand">
              <img src="/popcorn_logo.png" alt="" />
              <span>Popcornn</span>
            </div>
            <span class="wz-topbar__count">
              <b>{pad2(currentStep)}</b> / {pad2(totalSteps)} · {currentLabel}
            </span>
          </div>
          {pager}
        </div>

        <div class="wz-content">
          <div class="wz-content__inner">
            {/* Repère d'étape (desktop / TV) */}
            <div class="wz-content__meta">
              <div class="wz-content__meta-row">
                <span class="wz-content__meta-step">
                  {stepWord} <b>{pad2(currentStep)}</b> / {pad2(totalSteps)}
                </span>
                <span class="wz-content__meta-label">{currentLabel}</span>
              </div>
              {pager}
            </div>

            {/* Messages globaux (error/success du wizard) */}
            {error && <div class="wz-alert wz-alert--error" role="alert" style="margin-bottom:20px;"><div class="wz-alert__body">{error}</div></div>}
            {success && (
              <div class="wz-alert wz-alert--success" role="status" style="margin-bottom:20px;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width={1.5} aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div class="wz-alert__body">{success}</div>
              </div>
            )}

            {/* Contenu animé selon la direction */}
            <div
              key={currentStep}
              class={stepDirection === 1 ? 'wz-enter' : 'wz-enter--back'}
            >
              {renderStepContent()}
            </div>
          </div>
        </div>

        {/* Pied (mobile / tablette ; sur desktop la version est dans le rail) */}
        <footer class="wz-footer">
          <button type="button" class="wz-link" onClick={openDiagnostics}>{tr('wizard.shell.diagnostics', 'Diagnostics')}</button>
          <span class="wz-version">v{appVersion}</span>
        </footer>
      </main>
    </div>
  );
}
