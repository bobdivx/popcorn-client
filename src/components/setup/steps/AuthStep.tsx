import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig } from '../../../lib/api/popcorn-web';
import { PreferencesManager } from '../../../lib/client/storage';
import type { UserConfig } from '../../../lib/api/popcorn-web';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { isTmdbKeyMaskedOrInvalid } from '../../../lib/utils/tmdb-key';
import { QuickConnectStep } from './QuickConnectStep';

interface AuthStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
}

export function AuthStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange }: AuthStepProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'quick-connect'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);
  const [restoringConfig, setRestoringConfig] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerInviteCode, setRegisterInviteCode] = useState('');

  // NOTE: l'import cloud est maintenant géré par CloudImportManager
  // et visualisé à l'étape 4 (WelcomeStep).

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      console.log('[AUTH] Tentative de connexion cloud pour:', loginEmail);
      
      // Si on est en mode 2FA, vérifier le code
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
        
        // Connexion réussie avec 2FA, continuer le flow normal
        setRequires2FA(false);
        setTempToken(null);
        setTwoFactorCode('');
        
        // Continuer avec le flow normal (récupération config, etc.)
        const cloudToken = verifyResponse.data?.accessToken || TokenManager.getCloudAccessToken();
        if (cloudToken) {
          try {
            await new Promise(resolve => setTimeout(resolve, 200));
            const savedConfig = await getUserConfig();
            const hasSomething =
              !!(savedConfig?.indexers?.length) ||
              !!savedConfig?.tmdbApiKey ||
              !!savedConfig?.downloadLocation ||
              !!savedConfig?.syncSettings;
            if (savedConfig && hasSomething) {
              console.log('[AUTH] Configuration sauvegardée trouvée:', savedConfig);
              CloudImportManager.startImport(savedConfig).finally(() => {
                Promise.resolve(onStatusChange?.()).catch(() => {});
              });
              onNext();
              return;
            }
          } catch (configError) {
            console.warn('[AUTH] Impossible de vérifier la configuration sauvegardée:', configError);
          }
        }
        
        try {
          const setup = await serverApi.getSetupStatus();
          if (setup.success && setup.data && setup.data.needsSetup === false) {
            redirectTo('/dashboard');
            return;
          }
        } catch {
          // ignore
        }
        
        onNext();
        return;
      }
      
      const response = await serverApi.loginCloud(loginEmail, loginPassword);

      // Vérifier si la 2FA est requise
      if (response.success && (response.data as any)?.requires2FA) {
        const data = response.data as any;
        setRequires2FA(true);
        setTempToken(data.tempToken || null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!response.success) {
        // Messages d'erreur plus détaillés selon le type d'erreur
        let errorMessage = response.message || 'Erreur de connexion cloud';
        
        if (response.error === 'CloudUnavailable') {
          errorMessage = 'Le service cloud est actuellement indisponible. Vérifiez votre connexion internet et réessayez.';
        } else if (response.error === 'CloudLoginError') {
          // Analyser le message pour donner plus de détails
          const msg = response.message || '';
          if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('incorrect')) {
            errorMessage = 'Email ou mot de passe incorrect';
          } else if (msg.includes('timeout') || msg.includes('Timeout')) {
            errorMessage = 'Le service cloud ne répond pas. Vérifiez votre connexion internet.';
          } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
            errorMessage = 'Impossible de contacter le service cloud. Vérifiez votre connexion internet.';
          } else if (msg.includes('Web Crypto API')) {
            // Si c'est une erreur Web Crypto API, on peut quand même continuer
            // car les tokens cloud sont stockés (fallback dans loginCloud)
            // Mais on affiche un avertissement
            console.warn('[AUTH] Web Crypto API bloquée, mais connexion cloud réussie. Continuation du wizard...');
            // Ne pas afficher d'erreur, continuer normalement
            // Le fallback dans loginCloud a déjà géré le cas
          } else {
            errorMessage = `Erreur de connexion: ${msg}`;
          }
        }
        
      console.error('[AUTH] Erreur de connexion cloud:', {
        error: response.error,
        message: response.message,
        fullResponse: response,
        fullResponseString: JSON.stringify(response, null, 2),
      });
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Utiliser le token cloud pour récupérer la configuration depuis popcorn-web
      // Le token cloud est maintenant sauvegardé automatiquement par serverApi.loginCloud
      const cloudToken = response.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
      
      if (cloudToken) {
        // Maintenant que CORS est configuré partout dans popcorn-web, on peut récupérer la config
        // en mode navigateur web aussi (plus besoin de workaround)
        try {
          console.log('[AUTH] Token cloud récupéré, vérification de la configuration sauvegardée...');
          console.log('[AUTH] Token cloud (premiers caractères):', cloudToken.substring(0, 20) + '...');
          console.log('[AUTH] Token cloud (longueur):', cloudToken.length);
          
          // Attendre un peu pour s'assurer que le token est bien sauvegardé
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // getUserConfig utilise maintenant automatiquement le token cloud si aucun token n'est fourni
          const savedConfig = await getUserConfig();
          const hasSomething =
            !!(savedConfig?.indexers?.length) ||
            !!savedConfig?.tmdbApiKey ||
            !!savedConfig?.downloadLocation ||
            !!savedConfig?.syncSettings;
          if (savedConfig && hasSomething) {
            console.log('[AUTH] Configuration sauvegardée trouvée:', savedConfig);
            // Démarrer l'import cloud et avancer vers l'étape suivante
            CloudImportManager.startImport(savedConfig).finally(() => {
              // Rafraîchir le statut du wizard une fois l'import terminé
              Promise.resolve(onStatusChange?.()).catch(() => {});
            });
            onNext();
            return;
          } else {
            console.log('[AUTH] Aucune configuration sauvegardée trouvée');
          }
        } catch (configError) {
          // L'erreur 401 est normale si le token n'est pas valide (problème de secret JWT en production)
          // ou si l'utilisateur n'a pas de configuration sauvegardée
          if (configError instanceof Error && configError.message.includes('401')) {
            console.log('[AUTH] Token non valide ou aucune configuration sauvegardée (normal si première connexion)');
          } else {
            console.warn('[AUTH] Impossible de vérifier la configuration sauvegardée:', configError);
          }
          // Continuer même si on ne peut pas vérifier la config (pas bloquant)
        }
      } else {
        console.warn('[AUTH] Aucun token d\'accès trouvé après la connexion');
      }

      // Si le backend est déjà configuré (sur le serveur), ne pas forcer la poursuite du wizard.
      // Exemple: tu installes l'app Android mais le serveur est déjà configuré sur une machine.
      try {
        const setup = await serverApi.getSetupStatus();
        if (setup.success && setup.data && setup.data.needsSetup === false) {
          redirectTo('/dashboard');
          return;
        }
      } catch {
        // ignore
      }

      // Pas de configuration sauvegardée / setup incomplet, continuer normalement
      onNext();
    } catch (err) {
      // Gestion d'erreur plus détaillée
      let errorMessage = 'Erreur de connexion cloud';
      
      if (err instanceof Error) {
        if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          errorMessage = 'Le service cloud ne répond pas dans le délai imparti. Vérifiez votre connexion internet.';
        } else if (err.message.includes('network') || err.message.includes('fetch') || err.message.includes('Failed to fetch')) {
          errorMessage = 'Impossible de contacter le service cloud. Vérifiez votre connexion internet et que le service est accessible.';
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'Email ou mot de passe incorrect';
        } else {
          errorMessage = `Erreur: ${err.message}`;
        }
      }
      
      console.error('[AUTH] Erreur lors de la connexion cloud:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        errorString: JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
      });
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreConfig = async () => {
    setRestoringConfig(true);
    setError(null);

    try {
      // Avant de restaurer: vérifier que le backend local est joignable.
      // Sinon, les appels createIndexer/saveTmdbKey peuvent rester bloqués et donner un "spinner infini".
      const health = await serverApi.checkServerHealth();
      if (!health.success) {
        setError(
          `Impossible de restaurer: backend non accessible. ` +
          `Vérifie que le backend Rust est démarré et que l'URL backend est correcte. ` +
          `(${health.message || health.error || 'Erreur inconnue'})`
        );
        return;
      }

      // Utiliser le token cloud pour récupérer la configuration depuis popcorn-web
      const cloudToken = TokenManager.getCloudAccessToken();
      if (!cloudToken) {
        setError('Token d\'authentification cloud manquant');
        return;
      }

      // getUserConfig utilise maintenant automatiquement le token cloud si aucun token n'est fourni
      const savedConfig = await getUserConfig();
      if (!savedConfig) {
        setError('Aucune configuration sauvegardée trouvée');
        return;
      }

      // Restaurer les indexers
      if (savedConfig.indexers && savedConfig.indexers.length > 0) {
        let restoredCount = 0;
        for (const indexer of savedConfig.indexers) {
          try {
            const res = await serverApi.createIndexer({
              name: indexer.name,
              baseUrl: indexer.baseUrl,
              apiKey: indexer.apiKey ?? '',
              jackettIndexerName: indexer.jackettIndexerName ?? '',
              isEnabled: indexer.isEnabled !== false,
              isDefault: indexer.isDefault || false,
              priority: indexer.priority || 0,
              indexerTypeId: indexer.indexerTypeId || undefined,
              configJson: indexer.configJson || undefined,
            });
            if (res?.success) {
              restoredCount += 1;
              
              // Restaurer les catégories pour cet indexer si disponibles
              if (savedConfig.indexerCategories && res.data?.id) {
                const indexerId = res.data.id;
                // Chercher les catégories pour cet indexer (par nom ou ID)
                const indexerCategories = savedConfig.indexerCategories[indexerId] || 
                                         savedConfig.indexerCategories[indexer.name];
                
                if (indexerCategories) {
                  try {
                    await serverApi.updateIndexerCategories(indexerId, indexerCategories);
                    console.log(`[AUTH] ✅ Catégories restaurées pour l'indexer ${indexer.name}`);
                  } catch (catError) {
                    console.warn(`[AUTH] ⚠️ Erreur lors de la restauration des catégories pour ${indexer.name}:`, catError);
                  }
                }
              }
            }
          } catch (idxError) {
            console.warn('[AUTH] Erreur lors de la restauration d\'un indexer:', idxError);
          }
        }

        // Si aucun indexer n'a pu être restauré, ne pas "continuer" silencieusement.
        if (savedConfig.indexers.length > 0 && restoredCount === 0) {
          setError(
            'Impossible de restaurer les indexers (aucune restauration réussie). ' +
            'Le backend est peut-être mal configuré ou injoignable.'
          );
          return;
        }
      }

      // Restaurer la clé TMDB (ne jamais envoyer une clé masquée **** au backend)
      if (savedConfig.tmdbApiKey && !isTmdbKeyMaskedOrInvalid(savedConfig.tmdbApiKey)) {
        try {
          await serverApi.saveTmdbKey(savedConfig.tmdbApiKey.trim().replace(/\s+/g, ''));
        } catch (tmdbError) {
          console.warn('[AUTH] Erreur lors de la restauration de la clé TMDB:', tmdbError);
        }
      }

      // Restaurer le download location
      if (savedConfig.downloadLocation) {
        PreferencesManager.setDownloadLocation(savedConfig.downloadLocation);
      }

      // Restaurer les paramètres de synchronisation (backend Rust)
      if (savedConfig.syncSettings) {
        try {
          const s = savedConfig.syncSettings;
          const payload: any = {};
          if (typeof s.syncEnabled === 'boolean') payload.is_enabled = s.syncEnabled ? 1 : 0;
          if (typeof s.syncFrequencyMinutes === 'number') payload.sync_frequency_minutes = s.syncFrequencyMinutes;
          if (typeof s.maxTorrentsPerCategory === 'number') payload.max_torrents_per_category = s.maxTorrentsPerCategory;
          if (typeof s.rssIncrementalEnabled === 'boolean') payload.rss_incremental_enabled = s.rssIncrementalEnabled ? 1 : 0;
          if (Array.isArray(s.syncQueriesFilms)) payload.sync_queries_films = s.syncQueriesFilms;
          if (Array.isArray(s.syncQueriesSeries)) payload.sync_queries_series = s.syncQueriesSeries;
          if (Object.keys(payload).length > 0) {
            await serverApi.updateSyncSettings(payload);
          }
        } catch (syncSettingsErr) {
          console.warn('[AUTH] Erreur lors de la restauration des paramètres de sync:', syncSettingsErr);
        }
      }

      // Configuration restaurée, continuer
      onNext();
    } catch (err) {
      setError('Erreur lors de la restauration de la configuration: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
      console.error('Erreur:', err);
    } finally {
      setRestoringConfig(false);
    }
  };

  const handleSkipRestore = () => {
    setHasSavedConfig(false);
    onNext();
  };

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    setError(null);

    // Validation côté client
    if (registerPassword !== registerConfirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (registerPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setLoading(true);

    try {
      const response = await serverApi.registerCloud(registerEmail, registerPassword, registerInviteCode);

      if (!response.success) {
        setError(response.message || 'Erreur lors de l\'inscription');
        setLoading(false);
        return;
      }

      // Inscription réussie, continuer au prochain step
      onNext();
    } catch (err) {
      setError('Erreur d\'inscription. Vérifiez votre connexion réseau et que l\'API popcorn-web est accessible.');
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Connexion / Inscription</h3>
      
      <p className="text-gray-400">
        Connectez-vous avec un compte existant ou créez un nouveau compte pour synchroniser vos données.
      </p>

      {error && (
        <div className="bg-primary-900/30 border border-primary-700 rounded-lg p-4 text-primary-300">
          <span>{error}</span>
        </div>
      )}

      {/* Proposition de restauration de configuration */}
      {hasSavedConfig && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-2">Configuration sauvegardée détectée</h4>
          <p className="text-gray-300 text-sm mb-4">
            Une configuration précédente a été trouvée dans votre compte. Souhaitez-vous la restaurer ?
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleRestoreConfig}
              disabled={restoringConfig}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoringConfig ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Restauration...
                </>
              ) : (
                'Restaurer la configuration'
              )}
            </button>
            <button
              type="button"
              onClick={handleSkipRestore}
              disabled={restoringConfig}
              className="w-full sm:w-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Passer
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          type="button"
          className={`flex-1 py-3 px-4 text-center font-semibold transition-colors ${
            activeTab === 'login'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('login');
            setError(null);
          }}
        >
          Connexion
        </button>
        <button
          type="button"
          className={`flex-1 py-3 px-4 text-center font-semibold transition-colors ${
            activeTab === 'register'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('register');
            setError(null);
          }}
        >
          Inscription
        </button>
        <button
          type="button"
          className={`flex-1 py-3 px-4 text-center font-semibold transition-colors ${
            activeTab === 'quick-connect'
              ? 'text-primary-600 border-b-2 border-primary-600'
              : 'text-gray-400 hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('quick-connect');
            setError(null);
          }}
        >
          Connexion rapide
        </button>
      </div>

      {/* Login Form */}
      {activeTab === 'login' && !requires2FA && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="votre@email.com"
              value={loginEmail}
              onInput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autocomplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="Votre mot de passe"
              value={loginPassword}
              onInput={(e) => setLoginPassword((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autocomplete="current-password"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-end pt-4">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="submit"
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !loginEmail || !loginPassword}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Connexion...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </div>
        </form>
      )}

      {/* 2FA Code Form */}
      {activeTab === 'login' && requires2FA && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4">
            <h4 className="text-white font-semibold mb-2">Code de vérification requis</h4>
            <p className="text-gray-300 text-sm">
              Un code de vérification à 6 chiffres a été envoyé à votre adresse email ({loginEmail}). 
              Veuillez entrer ce code pour compléter la connexion.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Code de vérification
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent text-center text-2xl tracking-widest"
              placeholder="000000"
              value={twoFactorCode}
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
                setTwoFactorCode(value);
              }}
              required
              disabled={loading}
              autocomplete="one-time-code"
              maxLength={6}
              autoFocus
            />
            <p className="text-gray-400 text-xs mt-2">
              Entrez le code à 6 chiffres reçu par email
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="submit"
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || twoFactorCode.length !== 6}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Vérification...
                </>
              ) : (
                'Vérifier le code'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTempToken(null);
                setTwoFactorCode('');
                setError(null);
              }}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Retour
            </button>
          </div>
        </form>
      )}

      {/* Register Form */}
      {activeTab === 'register' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Code d'invitation
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="Entrez votre code d'invitation"
              value={registerInviteCode}
              onInput={(e) => setRegisterInviteCode((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="votre@email.com"
              value={registerEmail}
              onInput={(e) => setRegisterEmail((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autocomplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="Au moins 8 caractères"
              value={registerPassword}
              onInput={(e) => setRegisterPassword((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autocomplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Confirmer le mot de passe
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="Confirmez votre mot de passe"
              value={registerConfirmPassword}
              onInput={(e) => setRegisterConfirmPassword((e.target as HTMLInputElement).value)}
              required
              disabled={loading}
              autocomplete="new-password"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-end pt-4">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              type="submit"
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !registerEmail || !registerPassword || !registerInviteCode}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Inscription...
                </>
              ) : (
                "S'inscrire"
              )}
            </button>
          </div>
        </form>
      )}

      {/* Quick Connect */}
      {activeTab === 'quick-connect' && (
        <QuickConnectStep
          focusedButtonIndex={focusedButtonIndex}
          buttonRefs={buttonRefs}
          onNext={onNext}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  );
}
