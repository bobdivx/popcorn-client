/**
 * Composant de vérification de connexion serveur
 * Affiche une animation pendant la vérification et redirige selon le résultat
 * Réessaie automatiquement en cas d'erreur
 */

import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { hasBackendUrl } from '../lib/backend-config.js';
import { updateChecker } from '../lib/services/update-checker.js';

type ConnectionStatus = 'checking' | 'connecting' | 'connected' | 'error';

const RETRY_INTERVAL = 3000; // Réessayer toutes les 3 secondes
const DIAG_PATH = '/settings/diagnostics';
const AUDIT_PATH = '/settings/audit';
const SERVER_SETTINGS_PATH = '/settings/server';
const HEALTH_CHECK_CACHE_DURATION = 10000; // Cache de 10 secondes pour éviter les checks répétés

// Cache global pour éviter les checks répétés lors de la navigation
let lastHealthCheck: { timestamp: number; success: boolean } | null = null;

export default function ServerConnectionCheck() {
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
    // Vérifier les mises à jour au démarrage (non-bloquant)
    updateChecker.checkAndNotify().catch((error) => {
      console.error('[ServerConnectionCheck] Erreur lors de la vérification des mises à jour:', error);
    });

    // Ne pas bloquer l'accès aux pages de configuration
    const currentPath = window.location.pathname;
    const allowedPaths = [SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', DIAG_PATH];
    
    // Si on est sur une page de configuration, ne pas afficher l'animation
    // ET ne pas vérifier hasBackendUrl() - ces pages doivent être accessibles même sans URL configurée
    if (allowedPaths.some(path => currentPath.startsWith(path))) {
      setIsVisible(false);
      return;
    }

    // Premier lancement / aucune URL configurée: forcer l'assistant de configuration
    // (sinon l'app reste bloquée sur "En attente du serveur..." avec l'URL par défaut)
    // IMPORTANT: Vérifier hasBackendUrl() APRÈS avoir vérifié les chemins autorisés
    try {
      if (!hasBackendUrl()) {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServerConnectionCheck.tsx:52',message:'No backend URL - redirecting to setup',data:{currentPath},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        setIsVisible(false);
        window.location.href = '/setup';
        return;
      }
    } catch (error) {
      // Si hasBackendUrl() plante (localStorage inaccessible), rediriger vers setup
      console.error('[ServerConnectionCheck] hasBackendUrl() failed:', error);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServerConnectionCheck.tsx:59',message:'hasBackendUrl() error - redirecting to setup',data:{currentPath,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setIsVisible(false);
      window.location.href = '/setup';
      return;
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

    // Nettoyer le timeout lors du démontage
    return () => {
      if (retryIntervalRef.current !== null) {
        clearTimeout(retryIntervalRef.current);
      }
    };
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

    // Sur les pages diagnostics et audit, ne jamais forcer de redirection (le but est de diagnostiquer)
    const p = window.location.pathname;
    if (p === DIAG_PATH || p.startsWith(`${DIAG_PATH}/`) || p === AUDIT_PATH || p.startsWith(`${AUDIT_PATH}/`)) return;
    
    // Vérifier si l'utilisateur est authentifié
    if (!serverApi.isAuthenticated()) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/setup') {
        window.location.href = '/login';
      }
      return;
    }

    const meResponse = await serverApi.getMe();
    if (meResponse.success) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/setup' && !currentPath.startsWith('/setup')) {
        const setupResponse = await serverApi.getSetupStatus();
        if (setupResponse.success && setupResponse.data) {
          // Ne pas forcer /setup si le backend est momentanément indisponible (reboot)
          if (setupResponse.data.backendReachable !== false && setupResponse.data.needsSetup) {
            window.location.href = '/setup';
            return;
          }
        }
      }
      
      const currentPath2 = window.location.pathname;
      if (currentPath2 === '/' || currentPath2 === '/login' || currentPath2 === '/register') {
        window.location.href = '/dashboard';
      }
    } else {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register' && currentPath !== '/setup') {
        window.location.href = '/login';
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
        const allowedPaths = [SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', '/login', '/register', DIAG_PATH];
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
      const allowedPaths = ['/settings/server', '/settings/audit', '/setup', '/disclaimer', '/login', '/register', DIAG_PATH];
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
  const allowedPaths = [SERVER_SETTINGS_PATH, AUDIT_PATH, '/setup', '/disclaimer', DIAG_PATH];
  if (allowedPaths.some(path => currentPath.startsWith(path))) {
    return null;
  }

  if (!isVisible || status === 'connected') {
    return null;
  }

  const openDiagnostics = () => {
    try {
      window.location.href = DIAG_PATH;
    } catch {
      // ignore
    }
  };

  const openServerSettings = () => {
    try {
      window.location.href = SERVER_SETTINGS_PATH;
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center">
      {/* Animation de fond */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)] animate-pulse"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0s', animationDuration: '3s' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s', animationDuration: '3s' }}></div>
      </div>

      {/* Contenu principal */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-8 px-4">
        {/* Logo/Icone animé */}
        <div className="relative">
          <div className="w-24 h-24 md:w-32 md:h-32 relative">
            {/* Cercle externe animé */}
            <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
            <div className="absolute inset-2 border-4 border-purple-500/30 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }}></div>
            
            {/* Icône centrale */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-4xl md:text-6xl animate-bounce" style={{ animationDuration: '2s' }}>
                🍿
              </div>
            </div>
          </div>
        </div>

          {/* Titre */}
          <div className="text-center space-y-4 tv:space-y-6">
            <h1 className="text-3xl md:text-5xl tv:text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-pulse">
              Popcorn Torrent
            </h1>
            
            {/* Message de statut */}
            <p className={`text-lg md:text-xl tv:text-2xl font-medium ${
              status === 'connecting' && retryCount > 0
                ? 'text-yellow-300' 
                : status === 'connecting'
                  ? 'text-yellow-300' 
                  : 'text-gray-300'
            }`}>
              {message}
            </p>
          </div>

        {/* Barre de progression */}
        <div className="w-full max-w-md space-y-2">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${progress > 0 ? progress : 30}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-shimmer"></div>
            </div>
          </div>
          <div className="text-center text-sm text-gray-400">
            {progress > 0 ? `${Math.round(progress)}%` : 'Connexion en cours...'}
          </div>
        </div>

        {/* Message d'erreur si disponible */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400 text-center max-w-md">
            {error}
          </div>
        )}

        {/* Indicateur de réessai */}
        {retryCount > 0 && (
          <div className="text-center text-sm text-gray-500">
            Tentative {retryCount}... Réessai automatique dans quelques secondes
          </div>
        )}

        {/* Actions utiles (pour tous les utilisateurs) */}
        <div className="flex flex-wrap items-center justify-center gap-3 max-w-lg">
          <button className="btn btn-sm btn-outline" onClick={openDiagnostics}>
            Ouvrir diagnostics
          </button>
          <button className="btn btn-sm btn-outline" onClick={openServerSettings}>
            Configurer le serveur
          </button>
        </div>

        {backendUrl && (
          <div className="text-center text-xs text-gray-500 max-w-lg break-all">
            Backend: <span className="text-gray-300">{backendUrl}</span>
          </div>
        )}

        {/* Points de chargement */}
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Styles CSS pour l'animation shimmer */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
