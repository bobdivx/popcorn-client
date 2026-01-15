/**
 * Composant de vérification de connexion serveur
 * Affiche une animation pendant la vérification et redirige selon le résultat
 * Réessaie automatiquement en cas d'erreur
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';

type ConnectionStatus = 'checking' | 'connecting' | 'connected' | 'error';

const RETRY_INTERVAL = 3000; // Réessayer toutes les 3 secondes

export default function ServerConnectionCheck() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [message, setMessage] = useState('Vérification de la connexion au serveur...');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false); // Commencer invisible pour éviter l'affichage lors du hot-reload
  const [retryCount, setRetryCount] = useState(0);
  const retryIntervalRef = useRef<number | null>(null);
  const checkStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Ne pas bloquer l'accès aux pages de configuration
    const currentPath = window.location.pathname;
    const allowedPaths = ['/settings/server', '/setup', '/disclaimer'];
    
    // Si on est sur une page de configuration, ne pas afficher l'animation
    if (allowedPaths.some(path => currentPath.startsWith(path))) {
      setIsVisible(false);
      return;
    }

    // Vérifier rapidement si le serveur est accessible avant d'afficher l'animation
    checkConnectionQuick();

    // Nettoyer le timeout lors du démontage
    return () => {
      if (retryIntervalRef.current !== null) {
        clearTimeout(retryIntervalRef.current);
      }
    };
  }, []);

  // Vérification rapide sans afficher l'animation si le serveur répond rapidement
  const checkConnectionQuick = async () => {
    checkStartTimeRef.current = Date.now();
    
    try {
      const response = await serverApi.checkServerHealth();
      
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
      // En cas d'erreur, afficher l'animation et réessayer
      setIsVisible(true);
      checkConnection();
    }
  };

  const handleConnectionSuccess = async (response: any) => {
    setRetryCount(0);
    setStatus('connected');
    
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
        const allowedPaths = ['/settings/server', '/setup', '/disclaimer', '/login', '/register'];
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
      // En cas d'erreur réseau, continuer à réessayer automatiquement
      setStatus('connecting');
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      setMessage('En attente du serveur...');
      setProgress(0);
      setRetryCount(prev => prev + 1);
      
      // Ne pas bloquer l'accès aux pages de configuration en cas d'erreur
      const currentPath = window.location.pathname;
      const allowedPaths = ['/settings/server', '/setup', '/disclaimer', '/login', '/register'];
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
  const allowedPaths = ['/settings/server', '/setup', '/disclaimer'];
  if (allowedPaths.some(path => currentPath.startsWith(path))) {
    return null;
  }

  if (!isVisible || status === 'connected') {
    return null;
  }

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
                : status === 'starting' || status === 'connecting'
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
