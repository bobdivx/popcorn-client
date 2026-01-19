import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { getBackendUrl } from '../lib/backend-config';
import { isTauri } from '../lib/utils/tauri';

const STORAGE_DIAG_ON_BOOT = 'popcorn_diagnostics_on_boot';

export default function IndexRedirect() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Chargement...');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Wrapper externe pour catch toutes les erreurs (imports, module init, etc.)
    let mounted = true;
    const checkAndRedirect = async () => {
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

        // Mode "page de test au démarrage" : si activé, rediriger vers les diagnostics.
        // Important: ne pas l'activer par défaut ici (sinon ça surprend), et ne pas le limiter à Android:
        // ça peut servir sur desktop/web aussi.
        try {
          const shouldDiag = localStorage.getItem(STORAGE_DIAG_ON_BOOT) === '1';
          if (shouldDiag) {
            window.location.href = '/settings/diagnostics';
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }

        setMessage('Vérification du serveur...');
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
              setTimeout(checkAndRedirect, 1000);
              return;
            }
            // Après plusieurs tentatives, basculer vers le setup:
            // c'est l'écran qui permet notamment de configurer l'URL du backend.
            window.location.href = '/setup';
            setLoading(false);
            return;
          }

          console.log('[IndexRedirect] hasUsers:', setupResponse.data.hasUsers);
          // Si pas d'utilisateurs dans la DB (première installation), rediriger vers setup
          // hasUsers est optionnel selon les plateformes; on ne redirige que si le backend indique explicitement "false".
          if ((setupResponse.data as any).hasUsers === false) {
            console.log('[IndexRedirect] DB vide, redirection vers /setup');
            window.location.href = '/setup';
            setLoading(false);
            return;
          }
        }

        // Si la DB contient des utilisateurs, vérifier l'authentification
        // Ne vérifier l'authentification que si on a un token
        if (!serverApi.isAuthenticated()) {
          setMessage('Redirection vers la connexion...');
          window.location.href = '/login';
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est connecté
        setMessage('Validation de la session...');
        const meResponse = await serverApi.getMe();
        
        if (meResponse.success) {
          // Utilisateur connecté, vérifier le setup
          setMessage('Finalisation...');
          const setupResponse2 = await serverApi.getSetupStatus();
          
          if (setupResponse2.success && setupResponse2.data) {
            if (setupResponse2.data.backendReachable !== false && setupResponse2.data.needsSetup) {
              window.location.href = '/setup';
            } else {
              window.location.href = '/dashboard';
            }
          } else {
            // En cas d'erreur, rediriger vers le dashboard (ne pas bloquer l'utilisateur)
            window.location.href = '/dashboard';
          }
        } else {
          // Utilisateur non connecté (token invalide ou expiré)
          setMessage('Redirection vers la connexion...');
          window.location.href = '/login';
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
          window.location.href = '/setup';
        }
        return;
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Exécuter checkAndRedirect avec protection externe
    try {
      checkAndRedirect();
    } catch (outerError) {
      // Erreur lors de l'initialisation du useEffect (très rare, mais possible)
      console.error('[IndexRedirect] Fatal error in useEffect (outer):', outerError);
      setLoading(false);
      // Rediriger vers /setup en cas d'erreur fatale au niveau du useEffect
      try {
        window.location.href = '/setup';
      } catch {
        // Si même window.location échoue, il y a un problème système
        console.error('[IndexRedirect] Cannot redirect to /setup - window.location failed');
      }
    }

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-100">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-base-content">{message}</p>
        </div>
      </div>
    );
  }

  return null;
}
