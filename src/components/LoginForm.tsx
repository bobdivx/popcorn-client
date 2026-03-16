import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { redirectTo, getPathHref } from '../lib/utils/navigation.js';
import { QuickConnectDisplay } from './ui/QuickConnectDisplay';
import { useI18n } from '../lib/i18n/useI18n';
import { registerCloudDevice } from '../lib/api/popcorn-web';
import { isTauri } from '../lib/utils/tauri';

export default function LoginForm() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'login' | 'quick-connect'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  // Signaler que l'app a rendu (masquer l'écran de chargement initial, évite écran noir webOS)
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('popcorn-app-ready')), 100);
    return () => clearTimeout(t);
  }, []);

  // Afficher le message "session expirée" si redirection après 401
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'session_expired') {
      setSessionExpiredMessage(true);
      // Nettoyer l'URL sans recharger la page
      const url = new URL(window.location.href);
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  // Vérifier si la DB est vide (pas d'utilisateurs) et rediriger vers setup
  useEffect(() => {
    const checkUsers = async () => {
      try {
        const setupResponse = await serverApi.getSetupStatus();
        if (setupResponse.success && setupResponse.data) {
          // Ne rediriger vers /setup QUE si le backend est accessible ET qu'il n'y a pas d'utilisateurs
          // Si le backend n'est pas accessible (timeout), ne pas rediriger (laisser l'utilisateur sur /login)
          if (setupResponse.data.backendReachable !== false && setupResponse.data.hasUsers === false) {
            redirectTo('/setup');
            return;
          }
        }
      } catch (error) {
        // Si getSetupStatus() plante, NE PAS rediriger automatiquement vers /setup
        // Cela peut créer une boucle si le backend n'est pas accessible
        // Laisser l'utilisateur sur /login pour qu'il puisse voir l'erreur
        console.error('[LoginForm] Erreur lors de la vérification des utilisateurs:', error);
        // Ne pas rediriger - laisser l'utilisateur sur /login
      } finally {
        setCheckingUsers(false);
      }
    };

    checkUsers();
  }, []);

  const registerDeviceIfPossible = async () => {
    try {
      const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : '';
      const deviceType = isTauri() ? 'desktop' : 'web';
      const deviceName = 'Popcorn client';
      await registerCloudDevice({
        deviceName,
        deviceType,
        platform,
        clientVersion: (import.meta as any).env?.PUBLIC_APP_VERSION || 'dev',
      });
    } catch {
      // Best effort : ne pas bloquer la navigation
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await serverApi.login(email, password);

      if (!response.success) {
        // Messages d'erreur plus explicites
        let errorMessage = response.message || response.error || t('errors.generic');
        
        if (response.error === 'DatabaseError' || errorMessage.includes('Base de données non configurée')) {
          errorMessage = t('loginForm.errors.dbNotConfigured');
        } else if (response.error === 'InvalidCredentials') {
          errorMessage = t('loginForm.errors.invalidCredentials');
        } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
          errorMessage = t('loginForm.errors.serverError');
        }
        
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      // Connexion réussie - tenter d'enregistrer l'appareil dans le cloud (best effort), puis rediriger vers le dashboard
      void registerDeviceIfPossible();
      redirectTo('/dashboard');
    } catch (err) {
      setError(t('loginForm.errors.networkError'));
      console.error('Erreur:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Afficher un loader pendant la vérification
  if (checkingUsers) {
    return (
      <div className="w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary-500"></span>
          <p className="mt-4 text-white">{t('common.verification')}</p>
        </div>
      </div>
    );
  }

  const handleQuickConnectSuccess = async () => {
    // Connexion réussie via QuickConnect - tenter d'enregistrer l'appareil dans le cloud (non bloquant)
    void registerDeviceIfPossible();
    redirectTo('/dashboard');
  };

  return (
    <div className="w-full max-w-md bg-black/80 backdrop-blur-sm border border-white/20 rounded-lg p-4 sm:p-6 md:p-8 shadow-2xl mx-3 sm:mx-4">
      <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-4 sm:mb-6">{t('loginForm.title')}</h2>

      {sessionExpiredMessage && (
        <div className="mb-4 bg-amber-500/20 border border-amber-500/50 text-amber-200 px-4 py-3 rounded text-sm" role="status">
          {t('loginForm.sessionExpired')}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/20 mb-4 sm:mb-6">
        <button
          type="button"
          data-focusable
          className={`flex-1 py-2.5 sm:py-3 px-3 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors ${
            activeTab === 'login'
              ? 'text-primary-500 border-b-2 border-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('login');
            setError(null);
          }}
        >
          {t('loginForm.emailPassword')}
        </button>
        <button
          type="button"
          data-focusable
          className={`flex-1 py-2.5 sm:py-3 px-3 sm:px-4 text-center font-medium text-sm sm:text-base transition-colors ${
            activeTab === 'quick-connect'
              ? 'text-primary-500 border-b-2 border-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('quick-connect');
            setError(null);
          }}
        >
          {t('loginForm.quickConnect')}
        </button>
      </div>

      {/* Login Form */}
      {activeTab === 'login' && (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-primary-900/20 border border-primary-600 text-primary-400 px-4 py-3 rounded mb-4">
              <span>{error}</span>
            </div>
          )}
          <div className="mb-3 sm:mb-4">
            <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
              {t('loginForm.email')}
            </label>
            <input
              type="email"
              className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder={t('loginForm.emailPlaceholder')}
              required
              autoFocus
              autocomplete="email"
            />
          </div>
          <div className="mb-4 sm:mb-6">
            <label className="block text-white text-sm font-medium mb-1.5 sm:mb-2">
              {t('loginForm.password')}
            </label>
            <input
              type="password"
              className="form-tv-input w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded text-sm sm:text-base focus:outline-none focus:border-white/40 transition-colors"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder={t('loginForm.passwordPlaceholder')}
              required
              autocomplete="current-password"
            />
          </div>
          <button
            type="submit"
            className={`form-tv-button w-full bg-primary hover:bg-primary-700 text-white font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors shadow-primary ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isLoading}
          >
            {isLoading ? t('loginForm.submitting') : t('loginForm.submit')}
          </button>
        </form>
      )}

      {/* Quick Connect */}
      {activeTab === 'quick-connect' && (
        <QuickConnectDisplay
          onConnected={handleQuickConnectSuccess}
          onError={(err) => setError(err)}
          qrSize={200}
          showTitle={false}
          compact={true}
          className="py-2"
        />
      )}

      <div className="text-center mt-6">
        <p className="text-gray-400 text-sm">
          {t('loginForm.noAccount')}{' '}
          <a href={getPathHref('/register')} className="text-white hover:text-primary-400 transition-colors font-medium">
            {t('loginForm.register')}
          </a>
        </p>
      </div>
    </div>
  );
}
