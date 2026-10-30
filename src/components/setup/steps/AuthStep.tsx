import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig, getOidcStatus } from '../../../lib/api/popcorn-web';
import PocketIdButton from '../../PocketIdButton';
import { takeSsoReturn } from '../../../lib/auth/native-sso';
import { PreferencesManager } from '../../../lib/client/storage';
import type { UserConfig } from '../../../lib/api/popcorn-web';
import type { SetupStatus } from '../../../lib/client/types';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';
import { redirectTo } from '../../../lib/utils/navigation.js';
import { setBackendUrl, hasDeploymentBackend, hasBackendUrl, isUsableCloudBackendUrl } from '../../../lib/backend-config.js';
import { isTVPlatform, isTablet } from '../../../lib/utils/device-detection';
import { QuickConnectStep } from './QuickConnectStep';
import { useI18n } from '../../../lib/i18n';
import { dbgLog } from '../../../lib/debug/debug-store';
import { StepHeader, StepLoading, Alert, Spinner, IconArrowLeft, IconArrowRight } from '../wizardUi';
import { LocalAccountSetup } from './LocalAccountSetup';
import { isLocalAccountSetupEnabled, shouldOfferLocalAccount } from '../../../lib/setup/local-account-setup';

interface AuthStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => Promise<SetupStatus | null> | void;
}

type AuthView = 'login' | 'register' | '2fa';

const LARGE_SCREEN_BREAKPOINT = 768;

export function AuthStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange }: AuthStepProps) {
  const dbg = (msg: string) => dbgLog('[AUTH] ' + msg);
  const { t } = useI18n();
  const isTV = typeof window !== 'undefined' && isTVPlatform();
  const [isLargeScreen, setIsLargeScreen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= LARGE_SCREEN_BREAKPOINT
  );
  const [view, setView] = useState<AuthView>('login');
  const [showEmailFormExpanded, setShowEmailFormExpanded] = useState(false); // false = QR/code en premier, true = formulaire email

  // Unifié (QR d'abord, puis email) sur TV, tablette et desktop — et sur téléphone au premier
  // lancement (aucune URL serveur) : l'appairage par QR / code provisoire passe en premier.
  // Évalué au montage (avant que l'assistant n'efface le stockage) : vrai premier lancement seulement.
  const [firstLaunchPairing] = useState(
    () => typeof window !== 'undefined' && !hasBackendUrl() && !hasDeploymentBackend()
  );
  const useUnifiedAuthLayout =
    isTV || (typeof window !== 'undefined' && isTablet()) || isLargeScreen || firstLaunchPairing;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => setIsLargeScreen(window.innerWidth >= LARGE_SCREEN_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

  // Microsoft Store edition: on a fresh embedded server, offer a local account first
  // (no popcornn.app account needed — certification policy 10.3.1).
  const [localAccountAvailable, setLocalAccountAvailable] = useState(false);
  const [showOnlineAccountOptions, setShowOnlineAccountOptions] = useState(false);
  const [localAccountProbeDone, setLocalAccountProbeDone] = useState(() => !isLocalAccountSetupEnabled());
  useEffect(() => {
    if (typeof window === 'undefined' || !isLocalAccountSetupEnabled()) return;
    let cancelled = false;
    // The embedded server may still be starting: retry a few times before giving up.
    const probe = async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        try {
          const res = await serverApi.getSetupStatus();
          if (cancelled) return;
          if (res.success && res.data?.backendReachable !== false) {
            if (shouldOfferLocalAccount(res.data)) setLocalAccountAvailable(true);
            return;
          }
        } catch { /* backend not ready yet */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };
    void probe().finally(() => { if (!cancelled) setLocalAccountProbeDone(true); });
    return () => { cancelled = true; };
  }, []);

  const handleLocalAccountCreated = async () => {
    dbg('local account created on the embedded server');
    if (onStatusChange) await onStatusChange();
    onNext();
  };
  const [restoringConfig, setRestoringConfig] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Register form
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [ssoRequired, setSsoRequired] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!loginEmail.includes('@')) {
      setSsoRequired(false);
      return;
    }
    const handle = window.setTimeout(async () => {
      const status = await getOidcStatus(loginEmail);
      setSsoRequired(status.ssoRequired);
      if (status.ssoRequired) {
        setError(status.message || t('loginForm.sso.required'));
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [loginEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Connexion Pocket ID déjà terminée ailleurs (LoginForm sans URL serveur → /setup?sso_done=1) :
    // reprendre l’assistant après la connexion.
    const params = new URLSearchParams(window.location.search);
    if (params.get('sso_done') === '1') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('sso_done');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch { /* ignore */ }
      const cloudToken = TokenManager.getCloudAccessToken();
      if (cloudToken) {
        setLoading(true);
        void afterCloudLogin(cloudToken).finally(() => setLoading(false));
        return;
      }
    }
    // Retour Pocket ID : ?sso_ticket= (ou retour deep link mémorisé). Ne dépend pas de l’URL serveur.
    const ssoReturn = takeSsoReturn();
    if (!ssoReturn) return;
    if (ssoReturn.error) setError(ssoReturn.error);
    const ticket = ssoReturn.ticket;
    if (!ticket) return;
    dbg('sso ticket reçu → completeCloudSso');
    setLoading(true);
    serverApi.completeCloudSso(ticket).then(async (res) => {
      if (!res.success) {
        dbg(`completeCloudSso KO: ${res.message || res.error}`);
        setError(res.message || t('loginForm.sso.error'));
        setLoading(false);
        return;
      }
      dbg('completeCloudSso OK');
      const cloudToken = TokenManager.getCloudAccessToken();
      if (cloudToken) {
        await afterCloudLogin(cloudToken);
      } else {
        onNext();
      }
      setLoading(false);
    }).catch(() => {
      setError(t('loginForm.sso.error'));
      setLoading(false);
    });
  }, []);

  const afterCloudLogin = async (cloudToken: string) => {
    dbg('afterCloudLogin start');
    try {
      const savedConfig = await getUserConfig();
      dbg(`getUserConfig: ${savedConfig ? `backendUrl=${savedConfig.backendUrl} idx=${savedConfig.indexers?.length ?? 0}` : 'null'}`);
      const hasSomething =
        !!(savedConfig?.indexers?.length) ||
        !!savedConfig?.tmdbApiKey ||
        !!savedConfig?.downloadLocation ||
        !!savedConfig?.syncSettings ||
        !!savedConfig?.language ||
        !!savedConfig?.backendUrl ||
        !!(savedConfig?.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0);
      dbg(`hasSomething:${hasSomething}`);
      if (savedConfig && hasSomething) {
        if (savedConfig.backendUrl && !hasDeploymentBackend() && isUsableCloudBackendUrl(savedConfig.backendUrl)) {
          try {
            setBackendUrl(savedConfig.backendUrl);
            dbg(`backendUrl set: ${savedConfig.backendUrl}`);
          } catch (e) {
            dbg(`backendUrl error: ${e}`);
          }
        }
        const missingCategories = !savedConfig.indexerCategories || Object.keys(savedConfig.indexerCategories).length === 0;
        if (missingCategories) {
          syncIndexersToCloud().catch((err) => console.warn('[AUTH] Sync catégories ignorée:', err));
        }
        // Lancer l'import cloud en ARRIÈRE-PLAN sans bloquer la navigation
        CloudImportManager.startImport(savedConfig).catch((e) => console.warn('[AUTH] Import cloud (bg):', e));
        // Vérifier le statut immédiatement (sans attendre la fin de l'import)
        dbg('calling onStatusChange...');
        // Sans URL serveur, pas de statut (il viserait l'URL par défaut, injoignable sur Android).
        const freshStatus =
          hasBackendUrl() || hasDeploymentBackend()
            ? await Promise.resolve(onStatusChange?.()).catch(() => null)
            : null;
        dbg(`freshStatus: needsSetup=${freshStatus?.needsSetup} hasUsers=${freshStatus?.hasUsers} reachable=${freshStatus?.backendReachable}`);
        dbg(`isAuthenticated:${serverApi.isAuthenticated()}`);
        if (freshStatus && freshStatus.needsSetup === false && freshStatus.hasUsers === true) {
          dbg('→ redirectTo /dashboard');
          redirectTo('/dashboard');
          return;
        }
        dbg('→ onNext()');
        onNext();
        return;
      }
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('401'))) {
        dbg(`ERROR: ${err}`);
      }
    }
    dbg('→ onNext() fallback (no config)');
    onNext();
  };

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (requires2FA && tempToken) {
        if (!twoFactorCode || twoFactorCode.length !== 6) {
          setError('Veuillez entrer le code à 6 chiffres reçu par email');
          setLoading(false);
          return;
        }
        const verifyResponse = await serverApi.verifyTwoFactorCode(tempToken, twoFactorCode);
        if (!verifyResponse.success) {
          setError(verifyResponse.message || 'Code de vérification incorrect');
          setLoading(false);
          return;
        }
        setRequires2FA(false);
        setTempToken(null);
        setTwoFactorCode('');
        const cloudToken = verifyResponse.data?.accessToken || TokenManager.getCloudAccessToken();
        if (cloudToken) await afterCloudLogin(cloudToken);
        else onNext();
        return;
      }

      const response = await serverApi.login(loginEmail, loginPassword);

      if (response.success && (response.data as any)?.requires2FA) {
        const data = response.data as any;
        setRequires2FA(true);
        setTempToken(data.tempToken || null);
        setView('2fa');
        setLoading(false);
        return;
      }

      if (!response.success) {
        let errorMessage = response.message || 'Erreur de connexion cloud';
        if (response.error === 'SsoRequired' || (response.message || '').includes('Pocket ID')) {
          setSsoRequired(true);
          errorMessage = t('loginForm.sso.required');
        } else if (response.error === 'CloudTimeout') {
          errorMessage = response.message || 'Le service cloud met trop de temps à répondre. Réessayez.';
        } else if (response.error === 'CloudUnavailable') {
          errorMessage = 'Le service cloud est indisponible. Vérifiez votre connexion internet.';
        } else if (response.error === 'CloudLoginError') {
          const msg = response.message || '';
          if (msg.includes('401') || msg.includes('incorrect')) errorMessage = 'Email ou mot de passe incorrect';
          else if (msg.includes('timeout') || msg.includes('fetch')) errorMessage = 'Service cloud inaccessible.';
          else errorMessage = `Erreur de connexion: ${msg}`;
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const cloudToken = response.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
      if (cloudToken) await afterCloudLogin(cloudToken);
      else onNext();
    } catch (err) {
      let errorMessage = 'Erreur de connexion cloud';
      if (err instanceof Error) {
        if (err.message.includes('timeout') || err.message.includes('fetch')) {
          errorMessage = 'Impossible de contacter le service cloud.';
        } else if (err.message.includes('401')) {
          errorMessage = 'Email ou mot de passe incorrect';
        } else {
          errorMessage = `Erreur: ${err.message}`;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreConfig = async () => {
    setRestoringConfig(true);
    setError(null);
    try {
      const health = await serverApi.checkServerHealth();
      if (!health.success) {
        setError(`Backend non accessible: ${health.message || 'Erreur inconnue'}`);
        return;
      }
      const cloudToken = TokenManager.getCloudAccessToken();
      if (!cloudToken) { setError("Token d'authentification cloud manquant"); return; }
      const savedConfig = await getUserConfig();
      if (!savedConfig) { setError('Aucune configuration sauvegardée trouvée'); return; }
      if (savedConfig.indexers && savedConfig.indexers.length > 0) {
        let restoredCount = 0;
        for (const indexer of savedConfig.indexers) {
          try {
            const res = await serverApi.createIndexer({
              name: indexer.name, baseUrl: indexer.baseUrl, apiKey: indexer.apiKey ?? '',
              jackettIndexerName: indexer.jackettIndexerName ?? '', isEnabled: indexer.isEnabled !== false,
              isDefault: indexer.isDefault || false, priority: indexer.priority || 0,
              indexerTypeId: indexer.indexerTypeId || undefined, configJson: indexer.configJson || undefined,
            });
            if (res?.success) {
              restoredCount += 1;
              if (savedConfig.indexerCategories && res.data?.id) {
                const indexerCategories = savedConfig.indexerCategories[res.data.id] || savedConfig.indexerCategories[indexer.name];
                if (indexerCategories) {
                  try { await serverApi.updateIndexerCategories(res.data.id, indexerCategories); } catch { /* ignore */ }
                }
              }
            }
          } catch { /* ignore */ }
        }
        if (savedConfig.indexers.length > 0 && restoredCount === 0) {
          setError('Impossible de restaurer les indexers. Le backend est peut-être mal configuré.');
          return;
        }
      }
      if (savedConfig.tmdbApiKey && !isTmdbKeyMaskedOrInvalid(savedConfig.tmdbApiKey)) {
        try { await serverApi.saveTmdbKey(savedConfig.tmdbApiKey.trim().replace(/\s+/g, '')); } catch { /* ignore */ }
      }
      if (savedConfig.downloadLocation) PreferencesManager.setDownloadLocation(savedConfig.downloadLocation);
      onNext();
    } catch (err) {
      setError('Erreur lors de la restauration: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
    } finally {
      setRestoringConfig(false);
    }
  };

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (registerPassword !== registerConfirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    if (registerPassword.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return; }
    setLoading(true);
    try {
      const response = await serverApi.registerCloud(registerEmail, registerPassword);
      if (!response.success) {
        const message =
          response.error === 'CloudUnavailable'
            ? 'Le service cloud est indisponible. Vérifiez votre connexion internet.'
            : response.message || "Erreur lors de l'inscription";
        setError(message);
        setLoading(false);
        return;
      }
      onNext();
    } catch (err) {
      setError("Erreur d'inscription. Vérifiez votre connexion réseau.");
    } finally {
      setLoading(false);
    }
  };

  // Layout TV : Connexion rapide (QR + code) en premier, puis option "Connexion avec email"
  const renderTVLayout = () => (
    <div class="auth-step-tv">
      <StepHeader kicker="Compte Popcornn" title={t('wizard.auth.title')} lead={t('wizard.auth.description')} />

      {!showEmailFormExpanded ? (
        <>
          <div class="auth-step-tv__qr-block">
            <QuickConnectStep
              focusedButtonIndex={focusedButtonIndex}
              buttonRefs={buttonRefs}
              onNext={onNext}
              onStatusChange={onStatusChange}
              tvMode
            />
          </div>
          <div class="wz-divider">Ou</div>
          <div class="auth-step-tv__alt">
            <PocketIdButton emphasize />
          </div>
          <div class="wz-divider">Ou</div>
          <button
            type="button"
            class="wz-btn wz-btn--ghost wz-btn--block auth-step-tv__email-cta"
            data-focusable
            onClick={() => setShowEmailFormExpanded(true)}
          >
            Connexion avec email
          </button>
        </>
      ) : (
        <div class="auth-step-tv__form-block">
          <div class="auth-step-tv__back">
            <button
              type="button"
              class="wz-link"
              data-focusable
              onClick={() => setShowEmailFormExpanded(false)}
            >
              ← Retour au QR code
            </button>
          </div>
          {/* Réutiliser les vues login/register avec styles TV */}
          <div class="auth-tab-bar">
            <button
              type="button"
              class={`auth-tab ${view === 'login' ? 'active' : ''}`}
              data-focusable
              aria-pressed={view === 'login'}
              onClick={() => { setView('login'); setError(null); }}
            >
              {t('wizard.auth.loginTab')}
            </button>
            <button
              type="button"
              class={`auth-tab ${view === 'register' ? 'active' : ''}`}
              data-focusable
              aria-pressed={view === 'register'}
              onClick={() => { setView('register'); setError(null); }}
            >
              {t('wizard.auth.registerTab')}
            </button>
          </div>
          {view === 'login' && (
            <div class="auth-step-tv__form">
              <div class="auth-section-label">Connexion avec email</div>
              {ssoRequired ? (
                <div style="margin-bottom:20px;"><PocketIdButton emphasize /></div>
              ) : (
                <div style="margin-bottom:20px;">
                  <PocketIdButton />
                  <div class="wz-divider">{t('loginForm.sso.or')}</div>
                </div>
              )}
              <form onSubmit={handleLogin}>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wz-input"
                    type="email"
                    placeholder={t('wizard.auth.emailPlaceholder')}
                    value={loginEmail}
                    onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                    required={!ssoRequired}
                    disabled={loading}
                    autocomplete="email"
                  />
                </div>
                {!ssoRequired && (
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wz-input"
                    type="password"
                    placeholder={t('wizard.auth.passwordPlaceholder')}
                    value={loginPassword}
                    onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="current-password"
                  />
                </div>
                )}
                {!ssoRequired && (
                <button
                  ref={(el) => { buttonRefs.current[0] = el; }}
                  type="submit"
                  class="wz-btn wz-btn--primary wz-btn--block auth-step-tv__submit"
                  data-focusable
                  disabled={loading || !loginEmail || !loginPassword}
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
                )}
              </form>
              <div class="auth-switch">
                <button
                  type="button"
                  class="wz-link wz-link--accent"
                  data-focusable
                  onClick={() => { setView('register'); setError(null); }}
                >
                  Pas encore de compte ? S'inscrire
                </button>
              </div>
            </div>
          )}
          {view === 'register' && (
            <div class="auth-step-tv__form">
              <div class="auth-section-label">Créer un compte</div>
              <div style="margin-bottom:20px;">
                <PocketIdButton />
                <div class="wz-divider">{t('loginForm.sso.or')}</div>
              </div>
              <form onSubmit={handleRegister}>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wz-input"
                    type="email"
                    placeholder={t('wizard.auth.emailPlaceholder')}
                    value={registerEmail}
                    onInput={(e) => setRegisterEmail((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="email"
                  />
                </div>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wz-input"
                    type="password"
                    placeholder={t('wizard.auth.passwordMinLengthHint')}
                    value={registerPassword}
                    onInput={(e) => setRegisterPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.confirmPassword')}</label>
                  <input
                    class="wz-input"
                    type="password"
                    placeholder={t('wizard.auth.confirmPasswordPlaceholder')}
                    value={registerConfirmPassword}
                    onInput={(e) => setRegisterConfirmPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <button
                  ref={(el) => { buttonRefs.current[0] = el; }}
                  type="submit"
                  class="wz-btn wz-btn--primary wz-btn--block auth-step-tv__submit"
                  data-focusable
                  disabled={loading || !registerEmail || !registerPassword}
                >
                  {loading ? "Inscription..." : "S'inscrire"}
                </button>
              </form>
              <div class="auth-switch">
                <button
                  type="button"
                  class="wz-link wz-link--accent"
                  data-focusable
                  onClick={() => { setView('login'); setError(null); }}
                >
                  Déjà un compte ? Se connecter
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!localAccountProbeDone) return <StepLoading />;

  if (localAccountAvailable && !showOnlineAccountOptions && !hasSavedConfig && view !== '2fa') {
    return (
      <LocalAccountSetup
        buttonRefs={buttonRefs}
        onCreated={handleLocalAccountCreated}
        onUseOnlineAccount={() => setShowOnlineAccountOptions(true)}
      />
    );
  }

  return (
    <div class={`auth-step-desktop-compact ${useUnifiedAuthLayout ? 'auth-step--unified' : ''}`}>
      {localAccountAvailable && showOnlineAccountOptions && (
        <div style="margin-bottom:16px;">
          <button
            type="button"
            class="wz-link"
            data-focusable
            onClick={() => { setShowOnlineAccountOptions(false); setError(null); }}
          >
            ← {t('wizard.localAccount.backToLocal')}
          </button>
        </div>
      )}
      <style>{`
        .auth-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-gap: 28px;
          gap: 28px;
          align-items: start;
        }
        @media (max-width: 640px) {
          .auth-two-col { grid-template-columns: 1fr; }
        }
        /* Onglets éditoriaux : trait fin, actif souligné corail */
        .auth-tab-bar {
          display: flex;
          border-bottom: 1px solid var(--wz-line);
          margin-bottom: 28px;
        }
        .auth-tab {
          flex: 1;
          min-height: 48px;
          padding: 12px 8px;
          margin: 0 0 -1px;
          background: transparent;
          border: 0;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          color: var(--wz-ink-faint);
          font-family: var(--wz-display);
          font-size: 0.68rem;
          font-weight: 400;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          text-align: center;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
        }
        .auth-tab:hover { color: var(--wz-ink-dim); }
        .auth-tab.active { color: var(--wz-ink); border-bottom-color: var(--wz-accent); }
        .auth-section-label {
          display: block;
          margin: 0 0 16px;
          font-family: var(--wz-display);
          font-size: 0.62rem;
          font-weight: 400;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: var(--wz-ink-faint);
        }
        .auth-field { margin-bottom: 18px; }
        .auth-qr-side {
          border: 1px solid var(--wz-line);
          background: var(--wz-surface);
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .auth-qr-side__title { display: block; margin-bottom: 6px; font-family: var(--wz-display); font-size: 0.74rem; letter-spacing: 0.24em; text-transform: uppercase; color: var(--wz-ink); }
        .auth-qr-side__desc { margin: 0 0 18px; font-size: 0.8rem; line-height: 1.55; color: var(--wz-ink-dim); }
        .auth-2fa-box { margin-bottom: 24px; }
        .auth-restore-banner { margin-bottom: 24px; }
        .auth-switch { margin-top: 22px; text-align: center; }

        /* ─── Layout unifié (TV, tablette, grand écran) ─── */
        .auth-step-tv { max-width: 640px; }
        .auth-step-tv__qr-block { border: 1px solid var(--wz-line); background: var(--wz-surface); padding: 28px 24px; }
        .auth-step-tv__alt { margin-top: 4px; }
        .auth-step-tv__form-block { margin-top: 4px; }
        .auth-step-tv__back { margin-bottom: 28px; }
        .auth-step-tv__form { max-width: 460px; }
        .auth-step-tv__submit { margin-top: 8px; }
        .auth-step-tv .auth-switch { text-align: left; max-width: 460px; }
        .wz-root.is-tv .auth-tab { min-height: 60px; font-size: 0.8rem; }
        .wz-root.is-tv .auth-step-tv__form, .wz-root.is-tv .auth-step-tv .auth-switch { max-width: 560px; }
      `}</style>

      {/* En-tête (sur TV, affiché seulement pour 2FA / config sauvegardée ; sinon le layout TV a le sien) */}
      {(!useUnifiedAuthLayout || hasSavedConfig || view === '2fa') && (
        <StepHeader kicker="Compte Popcornn" title={t('wizard.auth.title')} lead={t('wizard.auth.description')} />
      )}

      {/* Bannière config sauvegardée */}
      {hasSavedConfig && (
        <div class="auth-restore-banner wz-panel wz-panel--accent">
          <span class="wz-kicker" style="margin-bottom:10px;">Configuration sauvegardée détectée</span>
          <p class="wz-text" style="margin-bottom:20px;">
            Une configuration précédente a été trouvée dans votre compte.
          </p>
          <div class="wz-actions__group">
            <button
              type="button"
              class="wz-btn wz-btn--ghost"
              data-focusable
              onClick={() => { setHasSavedConfig(false); onNext(); }}
              disabled={restoringConfig}
            >
              Passer
            </button>
            <button
              type="button"
              class="wz-btn wz-btn--primary"
              data-focusable
              onClick={handleRestoreConfig}
              disabled={restoringConfig}
            >
              {restoringConfig ? <Spinner /> : null}
              {restoringConfig ? 'Restauration...' : 'Restaurer la configuration'}
            </button>
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <Alert tone="error" style="margin-bottom:24px;">{error}</Alert>
      )}

      {/* Vue 2FA */}
      {view === '2fa' && (
        <div>
          <div class="auth-2fa-box">
            <Alert tone="info" title="Code de vérification requis">
              Un code à 6 chiffres a été envoyé à <strong>{loginEmail}</strong>.
            </Alert>
          </div>
          <form onSubmit={handleLogin}>
            <div style="margin-bottom:8px;max-width:420px;">
              <label class="wz-label">{t('wizard.auth.verificationCode')}</label>
              <input
                class="wz-input wz-input--code"
                type="text"
                placeholder={t('wizard.auth.verificationCodePlaceholder')}
                value={twoFactorCode}
                onInput={(e) => setTwoFactorCode((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={loading}
                autocomplete="one-time-code"
                maxLength={6}
                autoFocus
              />
              <p class="wz-help">
                Entrez le code à 6 chiffres reçu par email
              </p>
            </div>
            <div class="wz-actions">
              <button
                type="button"
                class="wz-btn wz-btn--ghost"
                data-focusable
                onClick={() => { setView('login'); setRequires2FA(false); setTempToken(null); setTwoFactorCode(''); setError(null); }}
                disabled={loading}
              >
                <IconArrowLeft />
                Retour
              </button>
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                type="submit"
                class="wz-btn wz-btn--primary"
                data-focusable
                disabled={loading || twoFactorCode.length !== 6}
              >
                {loading ? <Spinner /> : null}
                {loading ? 'Vérification...' : 'Vérifier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Layout TV : Connexion rapide en premier, puis option email */}
      {useUnifiedAuthLayout && view !== '2fa' && !hasSavedConfig && renderTVLayout()}

      {/* Vues Login / Register (mobile uniquement : deux colonnes ou formulaire) */}
      {!useUnifiedAuthLayout && view !== '2fa' && (
        <>
          {/* Tabs */}
          <div class="auth-tab-bar">
            <button
              type="button"
              class={`auth-tab ${view === 'login' ? 'active' : ''}`}
              aria-pressed={view === 'login'}
              onClick={() => { setView('login'); setError(null); }}
            >
              {t('wizard.auth.loginTab')}
            </button>
            <button
              type="button"
              class={`auth-tab ${view === 'register' ? 'active' : ''}`}
              aria-pressed={view === 'register'}
              onClick={() => { setView('register'); setError(null); }}
            >
              {t('wizard.auth.registerTab')}
            </button>
          </div>

          {/* Login */}
          {view === 'login' && (
            <div class="auth-two-col">
              {/* Colonne gauche : formulaire */}
              <div>
                <div class="auth-section-label">Connexion avec email</div>
                {ssoRequired ? (
                  <div style="margin-bottom:20px;"><PocketIdButton emphasize /></div>
                ) : (
                  <div style="margin-bottom:20px;">
                    <PocketIdButton />
                    <div class="wz-divider">{t('loginForm.sso.or')}</div>
                  </div>
                )}
                <form onSubmit={handleLogin}>
                  <div class="auth-field">
                    <label class="wz-label">{t('wizard.auth.email')}</label>
                    <input
                      class="wz-input"
                      type="email"
                      placeholder={t('wizard.auth.emailPlaceholder')}
                      value={loginEmail}
                      onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                      required={!ssoRequired}
                      disabled={loading}
                      autocomplete="email"
                    />
                  </div>
                  {!ssoRequired && (
                  <div class="auth-field">
                    <label class="wz-label">{t('wizard.auth.password')}</label>
                    <input
                      class="wz-input"
                      type="password"
                      placeholder={t('wizard.auth.passwordPlaceholder')}
                      value={loginPassword}
                      onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="current-password"
                  />
                </div>
                  )}
                {!ssoRequired && (
                  <button
                    ref={(el) => { buttonRefs.current[0] = el; }}
                    type="submit"
                    class="wz-btn wz-btn--primary wz-btn--block"
                    data-focusable
                    disabled={loading || !loginEmail || !loginPassword}
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        Connexion...
                      </>
                    ) : (
                      <>
                        Se connecter
                        <IconArrowRight />
                      </>
                    )}
                  </button>
                )}
                </form>

                <div class="auth-switch">
                  <button
                    type="button"
                    class="wz-link wz-link--accent"
                    onClick={() => { setView('register'); setError(null); }}
                  >
                    Pas encore de compte ? S'inscrire
                  </button>
                </div>
              </div>

              {/* Colonne droite : QR code */}
              <div class="auth-qr-side">
                <span class="auth-qr-side__title">Connexion rapide</span>
                <p class="auth-qr-side__desc">
                  Scannez le QR code depuis l'app Popcorn ou popcorn-web
                </p>
                <QuickConnectStep
                  focusedButtonIndex={focusedButtonIndex}
                  buttonRefs={buttonRefs}
                  onNext={onNext}
                  onStatusChange={onStatusChange}
                  compact
                />
              </div>
            </div>
          )}

          {/* Register */}
          {view === 'register' && (
            <div>
              <div class="auth-section-label">Créer un compte</div>
              <div style="margin-bottom:20px;">
                <PocketIdButton />
                <div class="wz-divider">{t('loginForm.sso.or')}</div>
              </div>
              <form onSubmit={handleRegister}>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wz-input"
                    type="email"
                    placeholder={t('wizard.auth.emailPlaceholder')}
                    value={registerEmail}
                    onInput={(e) => setRegisterEmail((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="email"
                    autoFocus
                  />
                </div>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wz-input"
                    type="password"
                    placeholder={t('wizard.auth.passwordMinLengthHint')}
                    value={registerPassword}
                    onInput={(e) => setRegisterPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div class="auth-field">
                  <label class="wz-label">{t('wizard.auth.confirmPassword')}</label>
                  <input
                    class="wz-input"
                    type="password"
                    placeholder={t('wizard.auth.confirmPasswordPlaceholder')}
                    value={registerConfirmPassword}
                    onInput={(e) => setRegisterConfirmPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div class="wz-actions">
                  <button
                    type="button"
                    class="wz-btn wz-btn--ghost"
                    onClick={() => { setView('login'); setError(null); }}
                    disabled={loading}
                  >
                    <IconArrowLeft />
                    Retour
                  </button>
                  <button
                    ref={(el) => { buttonRefs.current[0] = el; }}
                    type="submit"
                    class="wz-btn wz-btn--primary"
                    data-focusable
                    disabled={loading || !registerEmail || !registerPassword}
                  >
                    {loading ? <Spinner /> : null}
                    {loading ? "Inscription..." : "S'inscrire"}
                    {!loading ? <IconArrowRight /> : null}
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
