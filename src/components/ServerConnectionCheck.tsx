/**
 * Composant de vérification de connexion serveur
 * Affiche une animation pendant la vérification et redirige selon le résultat
 * Réessaie automatiquement en cas d'erreur
 */

import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { hasBackendUrl } from '../lib/backend-config.js';
import { updateChecker } from '../lib/services/update-checker.js';
import { redirectTo, normalizePath } from '../lib/utils/navigation.js';
import { loadRuntimeConfig, setBackendUrl, hasDeploymentBackend } from '../lib/backend-config.js';
import { getUserConfig } from '../lib/api/popcorn-web.js';
import { TokenManager } from '../lib/client/storage.js';
import { FullScreenLoadingOverlay } from './ui/design-system';
import { useI18n } from '../lib/i18n/useI18n';

type ConnectionStatus = 'checking' | 'connecting' | 'connected' | 'error';

const RETRY_INTERVAL = 3000; // Réessayer toutes les 3 secondes
const DIAG_PATH = '/settings/diagnostics';
const AUDIT_PATH = '/settings/audit';
const SERVER_SETTINGS_PATH = '/settings/server';
const HEALTH_CHECK_CACHE_DURATION = 10000; // Cache de 10 secondes pour éviter les checks répétés

// Cache global pour éviter les checks répétés lors de la navigation
let lastHealthCheck: { timestamp: number; success: boolean } | null = null;

export default function ServerConnectionCheck() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [message, setMessage] = useState('Vérification de la connexion au serveur...');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false); // Commencer invisible pour éviter l'affichage lors du hot-reload
  const [retryCount, setRetryCount] = useState(0);
  const retryIntervalRef = useRef<number | null>(null);
  const checkStartTimeRef = useRef<number | null>(null);

  const backendUrl = useMemo(() => {
    try {
      return serverApi.getServerUrl?.() || '';
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // En Docker : charger /config.json (généré depuis PUBLIC_BACKEND_URL) avant toute logique
      const runtimeResult = await loadRuntimeConfig();
      if (cancelled) return;
      // Si l'URL backend a changé (ex. mise à jour des images Docker), invalider la session
      // pour éviter d'envoyer d'anciens tokens au nouveau backend
      if (runtimeResult?.urlChanged) {
        try {
          serverApi.logout();
        } catch {
          // ignore
        }
      }

      // Restaurer l'URL backend depuis la config cloud uniquement si :
      // 1) ce déploiement n'a pas fixé son propre backend (env, config.json, même origine), ET
      // 2) l'URL cloud est sur le même domaine que la page (on n'applique jamais une URL "étrangère"
      //    pour éviter le mélange avec le backend d'un ami).
      if (!hasDeploymentBackend()) {
        try {
          const cloudConfig = await getUserConfig();
          if (cloudConfig?.backendUrl?.trim()) {
            const url = cloudConfig.backendUrl.trim().replace(/\/$/, '');
            try {
              const cloudHost = new URL(url).hostname;
              if (cloudHost === window.location.hostname) {
                setBackendUrl(url);
              }
            } catch {
              // URL cloud invalide, ignorer
            }
          }
        } catch {
          // ignore (utilisateur non connecté au cloud ou CORS)
        }
      }
      if (cancelled) return;

      // Vérifier les mises à jour au démarrage (non-bloquant)
      updateChecker.checkAndNotify().catch((error) => {
        console.error('[ServerConnectionCheck] Erreur lors de la vérification des mises à jour:', error);
      });

      // Ne pas bloquer l'accès aux pages de configuration
      const currentPath = window.location.pathname;
      const allowedPaths = ['/settings', SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', '/login', '/register', DIAG_PATH];

      // Si on est sur une page de configuration ou d'auth, ne pas afficher l'animation
      // ET ne pas rediriger vers /setup (évite de renvoyer vers setup après une déconnexion)
      if (allowedPaths.some(path => currentPath.startsWith(path))) {
        setIsVisible(false);
        return;
      }

      // Premier lancement / aucune URL configurée: forcer l'assistant de configuration
      // (sinon l'app reste bloquée sur "En attente du serveur..." avec l'URL par défaut)
      // Ne pas renvoyer vers /setup si l'utilisateur est déjà authentifié (cloud ou session) —
      // il vient peut‑être de terminer le wizard avec l'URL par défaut sans qu'elle soit en localStorage.
      try {
        if (!hasBackendUrl()) {
          const hasCloudAuth = typeof TokenManager?.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken();
          const hasSession = serverApi.isAuthenticated();
          if (!hasCloudAuth && !hasSession) {
            setIsVisible(false);
            redirectTo('/setup');
            return;
          }
          // Utilisateur authentifié : continuer sans rediriger (getBackendUrl() utilisera l’URL par défaut)
        }
      } catch (error) {
        // Si hasBackendUrl() plante (localStorage inaccessible), rediriger vers setup
        // sauf si l'utilisateur a déjà une session (éviter de casser une session valide)
        const hasAuth = typeof TokenManager?.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken() || serverApi.isAuthenticated();
        if (!hasAuth) {
          console.error('[ServerConnectionCheck] hasBackendUrl() failed:', error);
          setIsVisible(false);
          redirectTo('/setup');
          return;
        }
      }

      // Vérifier rapidement si le serveur est accessible avant d'afficher l'animation
      // Protéger contre les erreurs qui pourraient bloquer le rendu
      try {
        checkConnectionQuick();
      } catch (error) {
        // Si checkConnectionQuick() plante immédiatement (pas async), logger et ne pas bloquer
        console.error('[ServerConnectionCheck] checkConnectionQuick() failed (non-async error):', error);
        setIsVisible(false);
        // Ne pas rediriger automatiquement ici - laisser l'utilisateur voir la page
      }
    })();

    return () => {
      cancelled = true;
      if (retryIntervalRef.current !== null) {
        clearTimeout(retryIntervalRef.current);
      }
    };
  }, []);

  // Quand le backend renvoie 401 alors qu'on avait un token (reboot, session invalide) → redirection /login
  useEffect(() => {
    const handler = () => {
      const p = window.location.pathname || '';
      if (p !== '/login' && !p.startsWith('/login') && p !== '/register' && !p.startsWith('/register') && p !== '/setup' && !p.startsWith('/setup')) {
        redirectTo('/login?reason=session_expired');
      }
    };
    window.addEventListener('popcorn:session-expired', handler);
    return () => window.removeEventListener('popcorn:session-expired', handler);
  }, []);

  // Vérification rapide sans afficher l'animation si le serveur répond rapidement
  const checkConnectionQuick = async () => {
    // Si l'utilisateur est déjà authentifié, c'est une preuve que le backend est accessible
    // Ne pas afficher l'animation dans ce cas
    if (serverApi.isAuthenticated()) {
      // Vérifier rapidement mais sans bloquer l'interface
      try {
        const response = await serverApi.checkServerHealth();
        if (response.success) {
          lastHealthCheck = {
            timestamp: Date.now(),
            success: true,
          };
          setIsVisible(false);
          setStatus('connected');
          return;
        }
      } catch {
        // Si le health check échoue mais que l'utilisateur est authentifié,
        // ne pas bloquer l'interface - le backend est probablement accessible
        setIsVisible(false);
        return;
      }
    }
    
    // Vérifier le cache d'abord
    const now = Date.now();
    if (lastHealthCheck && (now - lastHealthCheck.timestamp) < HEALTH_CHECK_CACHE_DURATION) {
      if (lastHealthCheck.success) {
        // Si le dernier check était réussi et récent, ne pas refaire le check
        setIsVisible(false);
        setStatus('connected');
        return;
      }
      // Si le dernier check a échoué mais est récent, attendre un peu avant de réessayer
      if ((now - lastHealthCheck.timestamp) < 2000) {
        setIsVisible(false);
        return;
      }
    }
    
    checkStartTimeRef.current = Date.now();
    
    try {
      const response = await serverApi.checkServerHealth();
      
      // Mettre à jour le cache
      lastHealthCheck = {
        timestamp: Date.now(),
        success: response.success,
      };
      
      if (response.success) {
        // Si le serveur répond rapidement (moins de 500ms), ne pas afficher l'animation
        const elapsed = Date.now() - (checkStartTimeRef.current || 0);
        if (elapsed < 500) {
          setIsVisible(false);
          handleConnectionSuccess(response);
          return;
        }
      }
      
      // Si le serveur ne répond pas rapidement ou en cas d'erreur, afficher l'animation
      setIsVisible(true);
      checkConnection();
    } catch (err) {
      // Mettre à jour le cache avec l'échec
      lastHealthCheck = {
        timestamp: Date.now(),
        success: false,
      };
      
      // Si l'utilisateur est authentifié, ne pas bloquer même en cas d'erreur
      if (serverApi.isAuthenticated()) {
        setIsVisible(false);
        return;
      }
      
      // En cas d'erreur, afficher l'animation et réessayer
      setIsVisible(true);
      checkConnection();
    }
  };

  const handleConnectionSuccess = async (response: any) => {
    setRetryCount(0);
    setStatus('connected');

    const p = window.location.pathname;
    
    // Sur les pages diagnostics, audit et setup, ne jamais forcer de redirection
    // Le setup doit pouvoir s'exécuter sans être interrompu par des redirections
    if (p === DIAG_PATH || p.startsWith(`${DIAG_PATH}/`) || p === AUDIT_PATH || p.startsWith(`${AUDIT_PATH}/`) || p === '/setup' || p.startsWith('/setup/')) {
      return;
    }
    
    // Vérifier si l'utilisateur est authentifié
    if (!serverApi.isAuthenticated()) {
      const currentPath = window.location.pathname;
      // Ne pas rediriger si on est déjà sur /login, /register ou /setup
      // Cela évite les boucles de redirection
      if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/setup') {
        redirectTo('/login');
      }
      return;
    }

    const meResponse = await serverApi.getMe();
    if (meResponse.success) {
      const currentPath = window.location.pathname;
      // Ne pas vérifier le setup si on est déjà sur /setup (évite les boucles)
      if (currentPath !== '/setup' && !currentPath.startsWith('/setup')) {
        const setupResponse = await serverApi.getSetupStatus();
        if (setupResponse.success && setupResponse.data) {
          // Ne pas forcer /setup si le backend est momentanément indisponible (reboot)
          if (setupResponse.data.backendReachable !== false && setupResponse.data.needsSetup) {
            // Utilisateur authentifié cloud qui vient de terminer le wizard : le backend peut
            // encore avoir 0 users locaux → ne pas le renvoyer sur /setup.
            const hasCloudAuth = typeof TokenManager?.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken();
            if (!hasCloudAuth) {
              redirectTo('/setup');
              return;
            }
          }
        }
      }
      
      const currentPath2 = window.location.pathname;
      if (currentPath2 === '/' || currentPath2 === '/login' || currentPath2 === '/register') {
        redirectTo('/dashboard');
      }
    } else {
      const currentPath = window.location.pathname;
      // Ne pas rediriger si on est déjà sur /login, /register ou /setup
      if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/setup') {
        redirectTo('/login');
      }
    }
  };

  const checkConnection = async () => {
    setStatus('checking');
    setMessage('Vérification de la connexion au serveur...');
    setProgress(20);
    setError(null);

    try {
      // Simuler une progression
      setTimeout(() => setProgress(40), 200);
      setTimeout(() => setProgress(60), 400);

      setStatus('connecting');
      setMessage('Connexion au serveur...');
      setTimeout(() => setProgress(80), 600);

      const response = await serverApi.checkServerHealth();

      // Mettre à jour le cache
      lastHealthCheck = {
        timestamp: Date.now(),
        success: response.success,
      };

      if (response.success) {
        // Nettoyer le timeout si la connexion réussit
        if (retryIntervalRef.current !== null) {
          clearTimeout(retryIntervalRef.current);
          retryIntervalRef.current = null;
        }
        setRetryCount(0);
        setProgress(100);
        setStatus('connected');
        setMessage('Connexion réussie !');
        
        // Vérifier si l'utilisateur est authentifié
        setTimeout(async () => {
          setIsVisible(false);
          try {
            window.dispatchEvent(new CustomEvent('backendReconnected'));
          } catch (_) {}
          handleConnectionSuccess(response);
        }, 500);
      } else {
        // En cas d'erreur, continuer à réessayer automatiquement
        setStatus('connecting');
        setError(response.message || 'Serveur non disponible');
        setMessage('En attente du serveur...');
        setProgress(0);
        setRetryCount(prev => prev + 1);
        
        // Ne pas bloquer l'accès aux pages de configuration en cas d'erreur
        const currentPath = window.location.pathname;
        const allowedPaths = ['/settings', SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', '/login', '/register', DIAG_PATH];
        if (allowedPaths.some(path => currentPath.startsWith(path))) {
          setIsVisible(false);
          return;
        }

        // Programmer un nouveau réessai
        if (retryIntervalRef.current !== null) {
          clearTimeout(retryIntervalRef.current);
        }
        retryIntervalRef.current = window.setTimeout(() => {
          checkConnection();
        }, RETRY_INTERVAL);
      }
    } catch (err) {
      // Mettre à jour le cache avec l'échec
      lastHealthCheck = {
        timestamp: Date.now(),
        success: false,
      };
      
      // En cas d'erreur réseau, continuer à réessayer automatiquement
      setStatus('connecting');
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      setMessage('En attente du serveur...');
      setProgress(0);
      setRetryCount(prev => prev + 1);
      
      // Ne pas bloquer l'accès aux pages de configuration en cas d'erreur
      const currentPath = window.location.pathname;
      const allowedPaths = ['/settings', '/settings/server', '/settings/audit', '/setup', '/disclaimer', '/login', '/register', DIAG_PATH];
      if (allowedPaths.some(path => currentPath.startsWith(path))) {
        setIsVisible(false);
        return;
      }

      // Programmer un nouveau réessai
      if (retryIntervalRef.current !== null) {
        clearTimeout(retryIntervalRef.current);
      }
      retryIntervalRef.current = window.setTimeout(() => {
        checkConnection();
      }, RETRY_INTERVAL);
    }
  };


  // Ne jamais afficher sur les pages de configuration
  const currentPath = window.location.pathname;
  const allowedPaths = ['/settings', SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', DIAG_PATH];
  if (allowedPaths.some(path => currentPath.startsWith(path))) {
    return null;
  }

  if (!isVisible || status === 'connected') {
    return null;
  }

  const openDiagnostics = () => {
    try {
      redirectTo(DIAG_PATH);
    } catch {
      // ignore
    }
  };

  const openServerSettings = () => {
    try {
      redirectTo(SERVER_SETTINGS_PATH);
    } catch {
      // ignore
    }
  };

  return (
    <FullScreenLoadingOverlay
      title={status === 'error' ? 'En attente du serveur...' : 'Connexion au serveur...'}
      descriptionSubtle={message}
      infoMessage={
        retryCount > 0 ? `Tentative ${retryCount}... Réessai automatique dans quelques secondes` : undefined
      }
      onClose={() => setIsVisible(false)}
    >
      <div className="min-h-[4rem] flex items-center justify-center max-w-md mx-auto w-full mb-3">
        {error ? (
          <div className="bg-error/15 border border-error/40 rounded-lg p-4 text-error text-center w-full">
            {error}
          </div>
        ) : (
          <div className="h-full w-full" aria-hidden />
        )}
      </div>

      <p className="text-center text-sm text-base-content/60 mt-2">
        {progress > 0 ? `${Math.round(progress)}%` : 'Connexion en cours...'}
      </p>

      {/* Actions utiles (pour tous les utilisateurs) */}
      <div className="flex flex-wrap items-center justify-center gap-3 max-w-lg mx-auto mt-4">
        <button className="btn btn-sm btn-outline" onClick={openDiagnostics}>
          Ouvrir diagnostics
        </button>
        <button className="btn btn-sm btn-outline" onClick={openServerSettings}>
          Configurer le serveur
        </button>
      </div>

      {backendUrl && (
        <div className="text-center text-xs sm:text-sm text-base-content/50 max-w-lg break-all px-2 mt-3" title={backendUrl}>
          Backend: <span className="text-base-content/80">{backendUrl}</span>
        </div>
      )}
    </FullScreenLoadingOverlay>
  );
}