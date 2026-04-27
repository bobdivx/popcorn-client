import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig } from '../../../lib/api/popcorn-web';
import { PreferencesManager } from '../../../lib/client/storage';
import type { UserConfig } from '../../../lib/api/popcorn-web';
import type { SetupStatus } from '../../../lib/client/types';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';
import { redirectTo } from '../../../lib/utils/navigation.js';
import { setBackendUrl, hasDeploymentBackend } from '../../../lib/backend-config.js';
import { isTVPlatform, isTablet } from '../../../lib/utils/device-detection';
import { QuickConnectStep } from './QuickConnectStep';
import { useI18n } from '../../../lib/i18n';
import { dbgLog } from '../../../lib/debug/debug-store';

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

  // Unifié (QR d'abord, puis email) sur TV, tablette et desktop
  const useUnifiedAuthLayout = isTV || (typeof window !== 'undefined' && isTablet()) || isLargeScreen;

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
        if (savedConfig.backendUrl && !hasDeploymentBackend()) {
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
        const freshStatus = await Promise.resolve(onStatusChange?.()).catch(() => null);
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
        if (response.error === 'CloudUnavailable') {
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
      if (!response.success) { setError(response.message || "Erreur lors de l'inscription"); setLoading(false); return; }
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
      <h2 class="auth-step-tv__title">{t('wizard.auth.title')}</h2>
      <p class="auth-step-tv__subtitle">{t('wizard.auth.description')}</p>

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
          <div class="auth-step-tv__divider">Ou</div>
          <button
            type="button"
            class="auth-step-tv__email-cta"
            data-focusable
            onClick={() => setShowEmailFormExpanded(true)}
          >
            Connexion avec email
          </button>
        </>
      ) : (
        <div class="auth-step-tv__form-block">
          <button
            type="button"
            class="auth-step-tv__back"
            data-focusable
            onClick={() => setShowEmailFormExpanded(false)}
          >
            ← Retour au QR code
          </button>
          {/* Réutiliser les vues login/register avec styles TV */}
          <div class="auth-tab-bar auth-step-tv__tabs">
            <button
              type="button"
              class={`auth-tab ${view === 'login' ? 'active' : ''} auth-step-tv__tab`}
              onClick={() => { setView('login'); setError(null); }}
            >
              {t('wizard.auth.loginTab')}
            </button>
            <button
              type="button"
              class={`auth-tab ${view === 'register' ? 'active' : ''} auth-step-tv__tab`}
              onClick={() => { setView('register'); setError(null); }}
            >
              {t('wizard.auth.registerTab')}
            </button>
          </div>
          {view === 'login' && (
            <div class="auth-step-tv__form">
              <div class="auth-section-label">Connexion avec email</div>
              <form onSubmit={handleLogin}>
                <div class="auth-step-tv__field">
                  <label class="wizard-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wizard-input auth-step-tv__input"
                    type="email"
                    placeholder={t('wizard.auth.emailPlaceholder')}
                    value={loginEmail}
                    onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="email"
                  />
                </div>
                <div class="auth-step-tv__field">
                  <label class="wizard-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wizard-input auth-step-tv__input"
                    type="password"
                    placeholder={t('wizard.auth.passwordPlaceholder')}
                    value={loginPassword}
                    onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="current-password"
                  />
                </div>
                <button
                  ref={(el) => { buttonRefs.current[0] = el; }}
                  type="submit"
                  class="wizard-btn-primary auth-step-tv__submit"
                  disabled={loading || !loginEmail || !loginPassword}
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>
              <button
                type="button"
                class="auth-step-tv__link"
                onClick={() => { setView('register'); setError(null); }}
              >
                Pas encore de compte ? S'inscrire
              </button>
            </div>
          )}
          {view === 'register' && (
            <div class="auth-step-tv__form">
              <div class="auth-section-label">Créer un compte</div>
              <form onSubmit={handleRegister}>
                <div class="auth-step-tv__field">
                  <label class="wizard-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wizard-input auth-step-tv__input"
                    type="email"
                    placeholder={t('wizard.auth.emailPlaceholder')}
                    value={registerEmail}
                    onInput={(e) => setRegisterEmail((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="email"
                  />
                </div>
                <div class="auth-step-tv__field">
                  <label class="wizard-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wizard-input auth-step-tv__input"
                    type="password"
                    placeholder={t('wizard.auth.passwordMinLengthHint')}
                    value={registerPassword}
                    onInput={(e) => setRegisterPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div class="auth-step-tv__field">
                  <label class="wizard-label">{t('wizard.auth.confirmPassword')}</label>
                  <input
                    class="wizard-input auth-step-tv__input"
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
                  class="wizard-btn-primary auth-step-tv__submit"
                  disabled={loading || !registerEmail || !registerPassword}
                >
                  {loading ? "Inscription..." : "S'inscrire"}
                </button>
              </form>
              <button
                type="button"
                class="auth-step-tv__link"
                onClick={() => { setView('login'); setError(null); }}
              >
                Déjà un compte ? Se connecter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div class={`auth-step-desktop-compact ${useUnifiedAuthLayout ? 'auth-step--unified' : ''}`}>
      <style>{`
        .auth-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 640px) {
          .auth-two-col { grid-template-columns: 1fr; }
        }
        /* Desktop : layout compact pour que le QR reste visible sans scroll (mobile/tablette inchangé) */
        @media (min-width: 1024px) {
          .auth-step-desktop-compact > div:first-of-type { margin-bottom: 16px !important; }
          .auth-step-desktop-compact .auth-tab-bar { margin-bottom: 16px; }
          .auth-step-desktop-compact .auth-two-col { gap: 16px; align-items: center; }
          .auth-step-desktop-compact .auth-qr-side { padding: 14px; }
          .auth-step-desktop-compact .auth-section-label { margin-bottom: 8px; }
        }
        .auth-tab-bar {
          display: flex;
          gap: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 24px;
        }
        .auth-tab {
          flex: 1; padding: 8px 12px;
          font-size: 13px; font-weight: 600;
          border-radius: 7px; border: none; cursor: pointer;
          transition: all 0.15s;
          color: rgba(255,255,255,0.45);
          background: transparent;
          text-align: center;
        }
        .auth-tab.active {
          background: rgba(124,58,237,0.2);
          color: #c4b5fd;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .auth-tab:hover:not(.active) { color: rgba(255,255,255,0.7); }
        .auth-section-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
          color: rgba(255,255,255,0.3); text-transform: uppercase;
          margin-bottom: 12px;
        }
        .auth-qr-side {
          background: rgba(124,58,237,0.06);
          border: 1px solid rgba(124,58,237,0.15);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .auth-qr-icon {
          width: 40px; height: 40px;
          background: rgba(124,58,237,0.15);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 10px;
        }
        .auth-2fa-box {
          background: rgba(124,58,237,0.06);
          border: 1px solid rgba(124,58,237,0.2);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .auth-code-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 14px;
          color: #fff;
          font-size: 24px; font-weight: 700;
          text-align: center; letter-spacing: 8px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .auth-code-input:focus {
          border-color: rgba(124,58,237,0.6);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .auth-restore-banner {
          background: rgba(59,130,246,0.07);
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
        }
        /* ─── Layout TV : lisibilité à distance, zones de focus larges ─── */
        .auth-step-tv { max-width: 720px; margin: 0 auto; text-align: center; }
        .auth-step-tv__title { font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 700; color: #fff; margin: 0 0 8px; }
        .auth-step-tv__subtitle { font-size: clamp(0.9rem, 2vw, 1rem); color: rgba(255,255,255,0.5); margin: 0 0 24px; line-height: 1.5; }
        .auth-step-tv__qr-block { margin-bottom: 24px; }
        .auth-step-tv__divider {
          display: flex; align-items: center; gap: 16px; margin: 28px 0;
          color: rgba(255,255,255,0.35); font-size: 1rem; font-weight: 600;
        }
        .auth-step-tv__divider::before, .auth-step-tv__divider::after {
          content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.12);
        }
        .auth-step-tv__email-cta {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 56px; padding: 14px 32px;
          font-size: 1.125rem; font-weight: 600;
          background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.15);
          color: #fff; border-radius: 14px; cursor: pointer;
          transition: background 0.2s, border-color 0.2s, transform 0.1s;
        }
        .auth-step-tv__email-cta:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25); }
        .auth-step-tv__email-cta:focus { outline: none; box-shadow: 0 0 0 4px rgba(124,58,237,0.4); }
        .auth-step-tv__form-block { text-align: left; margin-top: 16px; }
        .auth-step-tv__back {
          margin-bottom: 20px; padding: 10px 0;
          background: none; border: none; color: rgba(167,139,250,0.9);
          font-size: 1rem; font-weight: 600; cursor: pointer;
          min-height: 48px; border-radius: 10px;
          transition: color 0.2s, background 0.2s;
        }
        .auth-step-tv__back:hover { color: #c4b5fd; background: rgba(124,58,237,0.1); }
        .auth-step-tv__back:focus { outline: none; box-shadow: 0 0 0 3px rgba(124,58,237,0.3); }
        .auth-step-tv__tabs { margin-bottom: 20px; }
        .auth-step-tv__tab { font-size: 1rem !important; padding: 12px 16px !important; min-height: 48px; }
        .auth-step-tv__form { max-width: 420px; }
        .auth-step-tv__field { margin-bottom: 18px; }
        .auth-step-tv__input {
          font-size: 1.125rem !important; padding: 14px 18px !important;
          min-height: 52px; border-radius: 12px;
        }
        .auth-step-tv__submit {
          width: 100%; min-height: 52px; font-size: 1.125rem !important;
          margin-top: 8px; margin-bottom: 16px;
        }
        .auth-step-tv__link {
          background: none; border: none; color: rgba(167,139,250,0.85);
          font-size: 1rem; text-decoration: underline; cursor: pointer;
          padding: 8px 0; display: block; width: 100%;
        }
        .auth-step-tv__link:hover { color: #c4b5fd; }
      `}</style>

      {/* En-tête (sur TV, affiché seulement pour 2FA / config sauvegardée ; sinon le layout TV a le sien) */}
      {(!useUnifiedAuthLayout || hasSavedConfig || view === '2fa') && (
        <div style="margin-bottom:28px;">
          <h2 style="font-size:24px;font-weight:700;color:#fff;margin:0 0 8px;">
            {t('wizard.auth.title')}
          </h2>
          <p style="font-size:14px;color:rgba(255,255,255,0.45);margin:0;line-height:1.5;">
            {t('wizard.auth.description')}
          </p>
        </div>
      )}

      {/* Bannière config sauvegardée */}
      {hasSavedConfig && (
        <div class="auth-restore-banner">
          <div style="font-weight:600;color:#93c5fd;margin-bottom:6px;font-size:13.5px;">
            Configuration sauvegardée détectée
          </div>
          <p style="color:rgba(255,255,255,0.55);font-size:13px;margin:0 0 12px;">
            Une configuration précédente a été trouvée dans votre compte.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button
              type="button"
              class="wizard-btn-primary"
              onClick={handleRestoreConfig}
              disabled={restoringConfig}
              style="font-size:13px;padding:9px 18px;"
            >
              {restoringConfig ? 'Restauration...' : 'Restaurer la configuration'}
            </button>
            <button
              type="button"
              class="wizard-btn-secondary"
              onClick={() => { setHasSavedConfig(false); onNext(); }}
              disabled={restoringConfig}
              style="font-size:13px;padding:9px 18px;"
            >
              Passer
            </button>
          </div>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div class="wizard-error" style="margin-bottom:20px;">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <svg style="width:15px;height:15px;flex-shrink:0;margin-top:1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* Vue 2FA */}
      {view === '2fa' && (
        <div>
          <div class="auth-2fa-box">
            <div style="font-weight:600;color:#c4b5fd;margin-bottom:6px;font-size:13.5px;">Code de vérification requis</div>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">
              Un code à 6 chiffres a été envoyé à <strong style="color:rgba(255,255,255,0.75);">{loginEmail}</strong>.
            </p>
          </div>
          <form onSubmit={handleLogin}>
            <div style="margin-bottom:20px;">
              <label class="wizard-label">{t('wizard.auth.verificationCode')}</label>
              <input
                class="auth-code-input"
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
              <p style="font-size:12px;color:rgba(255,255,255,0.3);margin-top:6px;">
                Entrez le code à 6 chiffres reçu par email
              </p>
            </div>
            <div style="display:flex;gap:8px;">
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                type="submit"
                class="wizard-btn-primary"
                disabled={loading || twoFactorCode.length !== 6}
              >
                {loading ? 'Vérification...' : 'Vérifier'}
              </button>
              <button
                type="button"
                class="wizard-btn-secondary"
                onClick={() => { setView('login'); setRequires2FA(false); setTempToken(null); setTwoFactorCode(''); setError(null); }}
                disabled={loading}
              >
                Retour
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
              onClick={() => { setView('login'); setError(null); }}
            >
              {t('wizard.auth.loginTab')}
            </button>
            <button
              type="button"
              class={`auth-tab ${view === 'register' ? 'active' : ''}`}
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
                <form onSubmit={handleLogin}>
                  <div style="margin-bottom:14px;">
                    <label class="wizard-label">{t('wizard.auth.email')}</label>
                    <input
                      class="wizard-input"
                      type="email"
                      placeholder={t('wizard.auth.emailPlaceholder')}
                      value={loginEmail}
                      onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                      required
                      disabled={loading}
                      autocomplete="email"
                    />
                  </div>
                  <div style="margin-bottom:20px;">
                    <label class="wizard-label">{t('wizard.auth.password')}</label>
                    <input
                      class="wizard-input"
                      type="password"
                      placeholder={t('wizard.auth.passwordPlaceholder')}
                      value={loginPassword}
                      onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
                      required
                      disabled={loading}
                      autocomplete="current-password"
                    />
                  </div>
                  <button
                    ref={(el) => { buttonRefs.current[0] = el; }}
                    type="submit"
                    class="wizard-btn-primary"
                    style="width:100%;"
                    disabled={loading || !loginEmail || !loginPassword}
                  >
                    {loading ? (
                      <>
                        <span style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:inline-block;animation:wizard-pulse 0.6s linear infinite;" />
                        Connexion...
                      </>
                    ) : (
                      <>
                        Se connecter
                        <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                <div style="margin-top:16px;text-align:center;">
                  <button
                    type="button"
                    style="background:none;border:none;cursor:pointer;font-size:12.5px;color:rgba(167,139,250,0.7);text-decoration:underline;text-underline-offset:2px;"
                    onClick={() => { setView('register'); setError(null); }}
                  >
                    Pas encore de compte ? S'inscrire
                  </button>
                </div>
              </div>

              {/* Colonne droite : QR code */}
              <div class="auth-qr-side">
                <div class="auth-qr-icon">
                  <svg style="width:20px;height:20px;color:#a78bfa;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <div style="font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.75);margin-bottom:4px;">Connexion rapide</div>
                <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:0 0 14px;line-height:1.5;">
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
              <form onSubmit={handleRegister}>
                <div style="margin-bottom:14px;">
                  <label class="wizard-label">{t('wizard.auth.email')}</label>
                  <input
                    class="wizard-input"
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
                <div style="margin-bottom:14px;">
                  <label class="wizard-label">{t('wizard.auth.password')}</label>
                  <input
                    class="wizard-input"
                    type="password"
                    placeholder={t('wizard.auth.passwordMinLengthHint')}
                    value={registerPassword}
                    onInput={(e) => setRegisterPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div style="margin-bottom:20px;">
                  <label class="wizard-label">{t('wizard.auth.confirmPassword')}</label>
                  <input
                    class="wizard-input"
                    type="password"
                    placeholder={t('wizard.auth.confirmPasswordPlaceholder')}
                    value={registerConfirmPassword}
                    onInput={(e) => setRegisterConfirmPassword((e.target as HTMLInputElement).value)}
                    required
                    disabled={loading}
                    autocomplete="new-password"
                  />
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button
                    type="button"
                    class="wizard-btn-secondary"
                    onClick={() => { setView('login'); setError(null); }}
                    disabled={loading}
                    style="font-size:13px;padding:9px 16px;"
                  >
                    Retour
                  </button>
                  <button
                    ref={(el) => { buttonRefs.current[0] = el; }}
                    type="submit"
                    class="wizard-btn-primary"
                    disabled={loading || !registerEmail || !registerPassword}
                  >
                    {loading ? "Inscription..." : "S'inscrire →"}
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

