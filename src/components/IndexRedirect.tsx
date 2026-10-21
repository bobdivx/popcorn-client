import type { ComponentType } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { TokenManager } from '../lib/client/storage.js';
import {
  getBackendUrl,
  isDemoMode,
  setDemoMode,
  loadRuntimeConfig,
  setBackendUrl,
  hasDeploymentBackend,
  isDemoLibraryBackendUrl,
} from '../lib/backend-config';
import {
  EMBEDDED_DESKTOP_BACKEND_URL,
  ensureEmbeddedDesktopBackendUrl,
  isEmbeddedDesktopPlatform,
  startEmbeddedDesktopServer,
  waitForEmbeddedBackend,
} from '../lib/embedded-desktop';
import { isTauri } from '../lib/utils/tauri';
import { redirectTo } from '../lib/utils/navigation.js';
import IntroVideo from './IntroVideo';
import { initNativeSsoListener } from '../lib/auth/native-sso';
import { getCloudDevices, getUserConfig } from '../lib/api/popcorn-web';
import { isTVPlatform, isWebOSTV } from '../lib/utils/device-detection';
import {
  STORAGE_INTRO_SESSION,
  STORAGE_INTRO_SKIPPED,
  shouldShowBootIntro,
} from '../lib/utils/boot-intro';
import {
  HOME_DATA_HOLD,
  HOME_READY_EVENT,
  holdPageLoader,
  isHomeReady,
  releasePageLoader,
  setPageLoaderMessage,
} from '../lib/boot/pageLoader';

const STORAGE_DIAG_ON_BOOT = 'popcorn_diagnostics_on_boot';
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

/** Hold Layout.astro posé sur « / » jusqu'à ce que l'intro ou la destination soit prête. */
const INDEX_BOOT_HOLD = 'index-boot';

function computeShowIntro(): boolean {
  if (typeof window === 'undefined') return false;
  // Android TV / webOS : comportement Netflix — sting marque à chaque ouverture (session).
  const tvBoot = isTVPlatform() || isWebOSTV();
  let sessionSeen = false;
  let foreverSkipped = false;
  try {
    sessionSeen = sessionStorage.getItem(STORAGE_INTRO_SESSION) === '1';
    foreverSkipped = localStorage.getItem(STORAGE_INTRO_SKIPPED) === '1';
  } catch {
    // ignore
  }
  return shouldShowBootIntro({ isTvBoot: tvBoot, sessionSeen, foreverSkipped });
}

/**
 * L'accueil peut-il être monté ici même (sous l'intro), URL réécrite en /dashboard ?
 * Non sous file:// (build webOS packagé : routes = fichiers .html) → redirection classique.
 */
function canRenderHomeInPlace(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;
  if (typeof window.history?.replaceState !== 'function') return false;
  const p = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  return p === '/';
}

export default function IndexRedirect() {
  // Démarrage unifié : un seul écran de chargement (#popcorn-loading-fallback, Layout.astro) ;
  // les vérifs (auth / setup / serveur) et le pré-rendu de l'accueil tournent PENDANT l'intro.
  const [, setLoading] = useState(true);
  const setMessage = (msg: string) => setPageLoaderMessage(msg);
  const attemptRef = useRef(0);
  const [showIntro, setShowIntro] = useState<boolean>(computeShowIntro);
  const introDoneRef = useRef(!showIntro);
  /** Destination décidée pendant l'intro (appliquée à la fin de l'intro). */
  const pendingPathRef = useRef<string | null>(null);
  const [HomeComponent, setHomeComponent] = useState<ComponentType | null>(null);
  const homeInPlaceRef = useRef(false);

  /** Accueil monté sous l'intro : URL → /dashboard (comme dashboard.astro, même Layout). */
  const mountHomeInPlace = useCallback(() => {
    if (homeInPlaceRef.current) return;
    homeInPlaceRef.current = true;
    try {
      // Conserver history.state (géré par le ClientRouter Astro) pour que Retour reste cohérent.
      window.history.replaceState(window.history.state, '', '/dashboard');
      document.title = 'Tableau de bord - Popcornn';
      window.dispatchEvent(new Event('popcorn-route-changed'));
    } catch {
      // ignore
    }
    // Intro déjà finie (ou absente) : l'écran unique reste jusqu'aux premières données.
    if (introDoneRef.current && !isHomeReady()) holdPageLoader(HOME_DATA_HOLD, 15000);
    releasePageLoader(INDEX_BOOT_HOLD);
    import('./dashboard/Dashboard')
      .then((mod) => setHomeComponent(() => mod.default as ComponentType))
      .catch((err) => {
        console.error('[IndexRedirect] Chargement accueil impossible, redirection:', err);
        homeInPlaceRef.current = false;
        releasePageLoader(HOME_DATA_HOLD);
        holdPageLoader(INDEX_BOOT_HOLD, 15000);
        window.location.href = `${window.location.origin}/dashboard`;
      });
  }, []);

  /** Navigation finale : différée tant que l'intro joue ; l'accueil est pré-rendu dessous. */
  const goTo = useCallback(
    (path: string) => {
      if (path === '/dashboard' && homeInPlaceRef.current) return;
      if (path === '/dashboard' && canRenderHomeInPlace()) {
        mountHomeInPlace();
        return;
      }
      if (!introDoneRef.current) {
        pendingPathRef.current = path;
        return;
      }
      // Rechargement de page : l'écran unique reste affiché jusqu'à la page suivante.
      holdPageLoader(INDEX_BOOT_HOLD, 20000);
      redirectTo(path);
    },
    [mountHomeInPlace],
  );

  /** Destination sans montage sur place (mode démo : DemoExitBar etc. lisent le mode au montage). */
  const goToClassic = useCallback((path: string) => {
    if (!introDoneRef.current) {
      pendingPathRef.current = path;
      return;
    }
    holdPageLoader(INDEX_BOOT_HOLD, 20000);
    redirectTo(path);
  }, []);

  const handleIntroStarted = useCallback(() => {
    // L'intro (noire, plein écran) prend le relais de l'écran de chargement.
    releasePageLoader(INDEX_BOOT_HOLD);
  }, []);

  const handleIntroEnded = () => {
    try {
      localStorage.setItem(STORAGE_INTRO_SKIPPED, '1');
      sessionStorage.setItem(STORAGE_INTRO_SESSION, '1');
    } catch {
      // ignore
    }
    introDoneRef.current = true;
    if (homeInPlaceRef.current) {
      // Accueil pré-rendu sous l'intro : s'il n'a pas encore ses données, écran unique jusque-là.
      if (!isHomeReady()) holdPageLoader(HOME_DATA_HOLD, 15000);
      releasePageLoader(INDEX_BOOT_HOLD);
    } else if (pendingPathRef.current) {
      const dest = pendingPathRef.current;
      pendingPathRef.current = null;
      goTo(dest);
    } else {
      // Vérifications encore en cours : l'écran unique reprend (pas de loader spécifique).
      holdPageLoader(INDEX_BOOT_HOLD, 60000);
    }
    setShowIntro(false);
  };

  // Accueil prêt → libérer l'écran unique (au cas où le hold a été posé après markHomeReady).
  useEffect(() => {
    const onReady = () => releasePageLoader(HOME_DATA_HOLD);
    window.addEventListener(HOME_READY_EVENT, onReady);
    return () => window.removeEventListener(HOME_READY_EVENT, onReady);
  }, []);

  // Signaler que l'app a rendu du contenu (masquer l'écran de chargement initial, évite écran noir webOS)
  useEffect(() => {
    const t = setTimeout(() => {
      window.dispatchEvent(new Event('popcorn-app-ready'));
    }, 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Apps Tauri : retour Pocket ID au démarrage à froid (l'app relancée par le deep link).
    // Traité tout de suite : le ticket expire en 2 min, alors que les vérifications backend
    // ci-dessous peuvent durer longtemps quand aucune URL serveur n'est encore configurée.
    initNativeSsoListener();
  }, []);

  useEffect(() => {
    // Vérifications lancées tout de suite, EN PARALLÈLE de l'intro (plus après).
    // Pré-chargement du code de l'accueil pendant ce temps (http/https uniquement).
    if (canRenderHomeInPlace()) {
      void import('./dashboard/Dashboard').catch(() => {});
    }
    return checkAndRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        const pathname = typeof window !== 'undefined' ? (window.location.pathname || '/').replace(/\/$/, '') || '/' : '/';

        // En déploiement SPA (fallback index.html pour toutes les routes), /player et /player/xxx
        // servent la page d'accueil au lieu de player.astro. Rediriger ici vers /torrents?slug=...
        // pour que les liens /player/conclave-2024 ou /player?id=conclave-2024 affichent la page média.
        const playerMatch = pathname.match(/^\/player(?:\/(.+))?$/);
        if (playerMatch) {
          const idFromPath = playerMatch[1] ?? null;
          const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          const idFromQuery = params?.get('contentId') ?? params?.get('id') ?? params?.get('slug') ?? null;
          const slug = idFromPath ?? idFromQuery;
          if (slug) {
            redirectTo('/torrents?slug=' + encodeURIComponent(slug));
            releasePageLoader(INDEX_BOOT_HOLD);
            return;
          }
        }

        // Ne faire la redirection setup/dashboard que sur la page d'accueil ("/").
        // En déploiement SPA, ce composant peut être monté sur /dashboard, /torrents/xxx, etc. : ne pas rediriger dans ce cas.
        if (pathname !== '/' && pathname !== '/demo' && !pathname.startsWith('/demo/')) {
          setLoading(false);
          releasePageLoader(INDEX_BOOT_HOLD);
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

        // Windows/Linux Tauri : serveur embarqué → démarrer + auto-config URL (pas de saisie manuelle).
        if (isTauri() && !serverStartAttempted && (await isEmbeddedDesktopPlatform())) {
          serverStartAttempted = true;
          setMessage('Démarrage du backend...');
          const started = await startEmbeddedDesktopServer();
          if (started.ok) {
            setMessage('Backend démarré.');
            saveBackendStartResult({ attempted: true, ok: true });
          } else {
            setMessage(`Backend: ${started.error || 'démarrage…'}`);
            saveBackendStartResult({
              attempted: true,
              ok: false,
              error: started.error || 'start_server failed',
            });
          }
          await ensureEmbeddedDesktopBackendUrl();
          setMessage('Connexion au backend local...');
          const ready = await waitForEmbeddedBackend(EMBEDDED_DESKTOP_BACKEND_URL);
          if (ready) {
            setMessage('Backend local prêt.');
            saveBackendStartResult({ attempted: true, ok: true });
          } else if (!started.ok) {
            setMessage(`Backend local injoignable — ${started.error || 'timeout'}`);
          } else {
            setMessage('Backend local : démarré, en attente de disponibilité…');
          }
        }

        // Mode démo : si on est sur /demo ou si le flag démo est déjà set, aller au dashboard sans setup/login.
        if (typeof window !== 'undefined') {
          const path = window.location.pathname || '';
          if (path === '/demo' || path.startsWith('/demo/')) {
            setDemoMode(true);
            goToClassic('/dashboard');
            setLoading(false);
            return;
          }
          if (isDemoMode()) {
            goToClassic('/dashboard');
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
            goTo('/settings/diagnostics');
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }

        // Restaurer l'URL backend depuis la config cloud avant toute vérification,
        // pour que les appareils déjà enregistrés (sauvegarde devices popcorn-web) ne retombent pas sur /setup.
        await loadRuntimeConfig();
        if (!hasDeploymentBackend()) {
          try {
            const cloudConfig = await getUserConfig();
            if (cloudConfig?.backendUrl?.trim()) {
              const url = cloudConfig.backendUrl.trim().replace(/\/$/, '');
              try {
                const cloudHost = new URL(url).hostname;
                if (isDemoLibraryBackendUrl(url)) {
                  // Compte de démonstration (ex. revue Google Play) : bibliothèque de démo intégrée.
                  setBackendUrl(url);
                  goToClassic('/dashboard');
                  setLoading(false);
                  return;
                }
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

        setMessage(`Vérification du serveur... (tentative ${attemptRef.current + 1}/10)`);
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
            attemptRef.current += 1;
            setMessage(`Démarrage du serveur... (réessai ${attemptRef.current}/10)`);
            if (attemptRef.current < 10) {
              setTimeout(checkAndRedirectInternal, 1000);
              return;
            }
            // Après 10 tentatives, basculer vers le setup:
            // c'est l'écran qui permet notamment de configurer l'URL du backend.
            goTo('/setup');
            setLoading(false);
            return;
          }

          console.log('[IndexRedirect] hasUsers:', setupResponse.data.hasUsers);
          // Si pas d'utilisateurs dans la DB (première installation), rediriger vers setup
          // hasUsers est optionnel selon les plateformes; on ne redirige que si le backend indique explicitement "false".
          // IMPORTANT: Ne rediriger QUE si le backend est accessible (évite les boucles)
          if (setupResponse.data.backendReachable !== false && (setupResponse.data as any).hasUsers === false) {
            try {
              const devices = await getCloudDevices();
              const activeDeviceCount =
                devices?.filter((d) => !d.revokedAt && d.lastSeenAt && d.lastSeenAt > 0).length ?? 0;
              if (activeDeviceCount === 0) {
                console.log('[IndexRedirect] DB vide et aucun appareil cloud → redirection vers /setup');
                goTo('/setup');
                setLoading(false);
                return;
              }
              console.log('[IndexRedirect] DB vide mais appareil cloud existant → ne pas forcer /setup');
            } catch (e) {
              console.warn('[IndexRedirect] Impossible de récupérer les appareils cloud, fallback /setup', e);
              console.log('[IndexRedirect] DB vide, redirection vers /setup (fallback)');
              goTo('/setup');
              setLoading(false);
              return;
            }
          }
        }

        // Si la DB contient des utilisateurs, vérifier l'authentification
        // Ne vérifier l'authentification que si on a un token
        if (!serverApi.isAuthenticated()) {
          setMessage('Vérification de l\'authentification...');
          goTo('/login');
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
              const hasCloudAuth = typeof TokenManager?.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken();
              if (!hasCloudAuth) goTo('/setup');
              else goTo('/dashboard');
            } else {
              goTo('/dashboard');
            }
          } else {
            // En cas d'erreur, rediriger vers le dashboard (ne pas bloquer l'utilisateur)
            goTo('/dashboard');
          }
        } else {
          // Utilisateur non connecté (token invalide ou expiré)
          setMessage('Redirection vers la connexion...');
          goTo('/login');
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
          goTo('/setup');
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
        goTo('/setup');
      } catch {
        console.error('[IndexRedirect] Cannot redirect to /setup - redirectTo failed');
      }
    }

    return () => {
      mounted = false;
    };
  };

  // Accueil pré-rendu (sous l'intro tant qu'elle joue) : inerte + masqué à la navigation TV.
  const home = HomeComponent ? (
    <div
      data-boot-home
      aria-hidden={showIntro ? 'true' : undefined}
      {...(showIntro ? ({ inert: true } as Record<string, unknown>) : {})}
    >
      <HomeComponent />
    </div>
  ) : null;

  return (
    <>
      {home}
      {showIntro ? (
        <IntroVideo onEnded={handleIntroEnded} onStarted={handleIntroStarted} variant="brand" />
      ) : null}
    </>
  );
}
