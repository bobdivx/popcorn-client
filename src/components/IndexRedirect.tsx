import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { getBackendUrl, isDemoMode, setDemoMode } from '../lib/backend-config';
import { isTauri } from '../lib/utils/tauri';
import { redirectTo } from '../lib/utils/navigation.js';
import IntroVideoWithHlsPreload from './IntroVideoWithHlsPreload';
import HLSLoadingSpinner from './ui/HLSLoadingSpinner';

const STORAGE_DIAG_ON_BOOT = 'popcorn_diagnostics_on_boot';
const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';
/** Résultat du démarrage automatique du backend (pour affichage sur /setup). */
export const STORAGE_BACKEND_START_RESULT = 'popcorn_backend_start_result';

/** Une seule tentative de démarrage du serveur local par session (Windows/Linux). */
let serverStartAttempted = false;

export type BackendStartResult = { attempted: true; ok: true } | { attempted: true; ok: false; error: string };

function saveBackendStartResult(result: BackendStartResult) {
  try {
    sessionStorage.setItem(STORAGE_BACKEND_START_RESULT, JSON.stringify(result));
  } catch {
    // ignore
  }
}

export default function IndexRedirect() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Chargement...');
  const [attempt, setAttempt] = useState(0);
  const [showIntro, setShowIntro] = useState(false);

  const handleIntroEnded = () => {
    // Marquer l'intro comme vue
    localStorage.setItem(STORAGE_INTRO_SKIPPED, '1');
    setShowIntro(false);
    // Démarrer le chargement après l'intro
    checkAndRedirect();
  };

  // Signaler que l'app a rendu du contenu (masquer l'écran de chargement initial, évite écran noir webOS)
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('popcorn-app-ready'));
    }, 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Vérifier si l'intro a déjà été vue
    const introSkipped = localStorage.getItem(STORAGE_INTRO_SKIPPED) === '1';
    
    if (!introSkipped) {
      // Afficher l'intro au premier démarrage
      setShowIntro(true);
      return;
    }
    
    // Si l'intro a déjà été vue, continuer avec le chargement normal
    checkAndRedirect();
  }, []);

  const checkAndRedirect = () => {
    // Wrapper externe pour catch toutes les erreurs (imports, module init, etc.)
    let mounted = true;
    const checkAndRedirectInternal = async () => {
      try {
        // Sur Android, attendre un peu avant de faire des requêtes réseau
        // pour laisser le système initialiser les permissions réseau
        if (isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const platform = await invoke('get-platform').catch(() => 'unknown');
            if (platform === 'android') {
              // Délai de 1 seconde pour laisser Android initialiser complètement les permissions réseau
              // et éviter les ANR (Application Not Responding)
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch {
            // Si on ne peut pas détecter la plateforme, continuer quand même
          }
        }
        
        // Logger immédiatement pour diagnostiquer les crashes silencieux
        console.log('[IndexRedirect] Starting checkAndRedirect');

        // Ne faire la redirection que sur la page d'accueil ("/").
        // En déploiement SPA (fallback index.html pour toutes les routes), ce composant
        // peut être monté sur /dashboard, /torrents/xxx, etc. : ne pas rediriger dans ce cas.
        const pathname = typeof window !== 'undefined' ? (window.location.pathname || '/').replace(/\/$/, '') || '/' : '/';
        if (pathname !== '/' && pathname !== '/demo' && !pathname.startsWith('/demo/')) {
          setLoading(false);
          return;
        }

        try {
          if (isTauri()) {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log-message', {
              message: `[popcorn-debug] IndexRedirect mounted: href=${typeof window !== 'undefined' ? window.location.href : ''}`,
            }).catch(() => {
              // Si invoke échoue, continuer quand même
              console.warn('[IndexRedirect] log-message invoke failed');
            });
          }
        } catch (invokeErr) {
          console.warn('[IndexRedirect] Tauri invoke error (non-fatal):', invokeErr);
        }

        // Sur Windows/Linux (Tauri desktop), démarrer le serveur local au lancement de l'app,
        // avant toute vérification, pour que l'utilisateur n'ait pas à le lancer à la main.
        if (isTauri() && !serverStartAttempted) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const platform = await invoke<string>('get-platform').catch(() => '');
            if (platform === 'win32' || platform === 'linux') {
              serverStartAttempted = true;
              setMessage('Démarrage du backend...');
              try {
                await invoke('start_server');
                setMessage('Backend démarré.');
                saveBackendStartResult({ attempted: true, ok: true });
              } catch (startErr: unknown) {
                const errMsg = startErr instanceof Error ? startErr.message : String(startErr);
                setMessage(`Backend: échec — ${errMsg}`);
                saveBackendStartResult({ attempted: true, ok: false, error: errMsg });
              }
              await new Promise((r) => setTimeout(r, 2000));
            }
          } catch {
            // ignorer (ex: get-platform échoue)
          }
        }

        // Mode démo : si on est sur /demo ou si le flag démo est déjà set, aller au dashboard sans setup/login.
        if (typeof window !== 'undefined') {
          const path = window.location.pathname || '';
          if (path === '/demo' || path.startsWith('/demo/')) {
            setDemoMode(true);
            redirectTo('/dashboard');
            setLoading(false);
            return;
          }
          if (isDemoMode()) {
            redirectTo('/dashboard');
            setLoading(false);
            return;
          }
        }

        // Mode "page de test au démarrage" : si activé, rediriger vers les diagnostics.
        // Important: ne pas l'activer par défaut ici (sinon ça surprend), et ne pas le limiter à Android:
        // ça peut servir sur desktop/web aussi.
        try {
          const shouldDiag = localStorage.getItem(STORAGE_DIAG_ON_BOOT) === '1';
          if (shouldDiag) {
            redirectTo('/settings/diagnostics');
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }

        setMessage(`Vérification du serveur... (tentative ${attempt + 1}/10)`);
        // Debug: log la config backend (sans faire de requête réseau pour éviter les blocages)
        // On évite checkServerHealth() ici car il peut bloquer et causer un ANR
        try {
          if (isTauri()) {
            const backendUrl = (() => {
              try {
                return getBackendUrl();
              } catch {
                return '(backend-url-error)';
              }
            })();
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log-message', {
              message: `[popcorn-debug] BackendUrl=${backendUrl}`,
            }).catch(() => {
              // Ignore les erreurs de log
            });
          }
        } catch {
          // ignore
        }

        // D'abord vérifier le statut du setup pour savoir si la DB est vide
        const setupResponse = await serverApi.getSetupStatus();
        
        console.log('[IndexRedirect] Setup response:', setupResponse);
        try {
          if (isTauri()) {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log-message', {
              message: `[popcorn-debug] Setup response: ${JSON.stringify(setupResponse)}`,
            });
          }
        } catch {
          // ignore
        }
        
        if (setupResponse.success && setupResponse.data) {
          // Si le backend n'est pas joignable (ex: reboot), ne pas basculer vers /setup.
          // On réessaie quelques fois et on laisse le composant afficher un spinner.
          if (setupResponse.data.backendReachable === false) {
            setMessage('Démarrage du serveur... (réessai)');
            const next = attempt + 1;
            setAttempt(next);
            if (next < 10) {
              setTimeout(checkAndRedirectInternal, 1000);
              return;
            }
            // Après plusieurs tentatives, basculer vers le setup:
            // c'est l'écran qui permet notamment de configurer l'URL du backend.
            redirectTo('/setup');
            setLoading(false);
            return;
          }

          console.log('[IndexRedirect] hasUsers:', setupResponse.data.hasUsers);
          // Si pas d'utilisateurs dans la DB (première installation), rediriger vers setup
          // hasUsers est optionnel selon les plateformes; on ne redirige que si le backend indique explicitement "false".
          // IMPORTANT: Ne rediriger QUE si le backend est accessible (évite les boucles)
          if (setupResponse.data.backendReachable !== false && (setupResponse.data as any).hasUsers === false) {
            console.log('[IndexRedirect] DB vide, redirection vers /setup');
            redirectTo('/setup');
            setLoading(false);
            return;
          }
        }

        // Si la DB contient des utilisateurs, vérifier l'authentification
        // Ne vérifier l'authentification que si on a un token
        if (!serverApi.isAuthenticated()) {
          setMessage('Vérification de l\'authentification...');
          redirectTo('/login');
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est connecté
        setMessage('Validation de votre session...');
        const meResponse = await serverApi.getMe();
        
        if (meResponse.success) {
          // Utilisateur connecté, vérifier le setup
          setMessage('Vérification de la configuration...');
          const setupResponse2 = await serverApi.getSetupStatus();
          
          if (setupResponse2.success && setupResponse2.data) {
            if (setupResponse2.data.backendReachable !== false && setupResponse2.data.needsSetup) {
              redirectTo('/setup');
            } else {
              redirectTo('/dashboard');
            }
          } else {
            // En cas d'erreur, rediriger vers le dashboard (ne pas bloquer l'utilisateur)
            redirectTo('/dashboard');
          }
        } else {
          // Utilisateur non connecté (token invalide ou expiré)
          setMessage('Redirection vers la connexion...');
          redirectTo('/login');
        }
      } catch (error) {
        // Logger l'erreur de manière visible (console.error apparaît dans logcat WebView)
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('[IndexRedirect] Fatal error in checkAndRedirect:', errorMsg, errorStack || '');
        
        // Essayer de logger via Tauri si disponible (mais ne pas bloquer si ça échoue)
        try {
          if (isTauri()) {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('log-message', {
              message: `[popcorn-debug] IndexRedirect error: ${errorMsg}`,
            }).catch(() => {
              // ignore invoke errors
            });
          }
        } catch {
          // ignore Tauri import/invoke errors
        }

        // En cas d'erreur fatale : rediriger vers /setup (mode "premier démarrage")
        // C'est plus sûr que de rester sur /login si on ne peut pas déterminer l'état
        setLoading(false);
        if (mounted) {
          console.log('[IndexRedirect] Redirecting to /setup due to error');
          redirectTo('/setup');
        }
        return;
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Exécuter checkAndRedirectInternal avec protection externe
    try {
      checkAndRedirectInternal();
    } catch (outerError) {
      // Erreur lors de l'initialisation du useEffect (très rare, mais possible)
      console.error('[IndexRedirect] Fatal error in useEffect (outer):', outerError);
      setLoading(false);
      // Rediriger vers /setup en cas d'erreur fatale au niveau du useEffect
      try {
        redirectTo('/setup');
      } catch {
        console.error('[IndexRedirect] Cannot redirect to /setup - redirectTo failed');
      }
    }

    return () => {
      mounted = false;
    };
  };

  // Afficher l'intro si nécessaire
  // Note: Pour précharger HLS, vous pouvez passer hlsInfoHash, hlsFilePath, etc.
  // Exemple: <IntroVideoWithHlsPreload onEnded={handleIntroEnded} hlsInfoHash="..." hlsFilePath="..." />
  if (showIntro) {
    return <IntroVideoWithHlsPreload onEnded={handleIntroEnded} />;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-100">
        <div className="text-center max-w-md mx-4">
          <HLSLoadingSpinner size="lg" text={message} />
          {message.includes('tentative') && (
            <div className="mt-4 w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (parseInt(message.match(/tentative (\d+)/)?.[1] || '0')) * 10)}%` }}
              ></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
