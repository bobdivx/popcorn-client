/**
 * Connexion Pocket ID dans les apps natives Tauri (Android, desktop Linux/Windows).
 *
 * Les WebView embarquées (Android WebView, webkitgtk) ne savent pas faire de passkeys (WebAuthn) :
 * Pocket ID affiche « Une erreur inconnue est survenue ». On ouvre donc le flux OIDC dans le
 * navigateur système, et popcorn-web renvoie vers l’app via :
 *   - App Link Android https://popcornn.app/app/auth/callback?sso_ticket=… (si vérifié), sinon
 *   - la page relais popcorn-web qui ouvre popcornn://auth/callback?sso_ticket=… (deep link).
 * L’app recharge alors la page d’origine avec ?sso_ticket=… : LoginForm / AuthStep appellent
 * completeCloudSso(ticket) comme pour le flux web (ticket à usage unique côté popcorn-web).
 *
 * Robustesse (1.4.5) :
 *   - l’écoute est démarrée dès le boot (IndexRedirect / Wizard / LoginForm), pas seulement quand le
 *     bouton Pocket ID est monté : au démarrage à froid, le ticket (TTL 2 min) est traité tout de suite
 *     au lieu d’attendre la fin des vérifications backend (qui peuvent durer longtemps sans URL serveur) ;
 *   - le retour est aussi mémorisé en localStorage (takeSsoReturn) : il survit à un rechargement /
 *     une redirection intermédiaire et le Wizard ne doit pas effacer le stockage dans ce cas ;
 *   - seule la page /setup (assistant) ou /login consomme le ticket : tout autre point de départ
 *     (ex. /register) revient sur /login.
 *
 * Si les plugins Tauri deep-link / opener ne sont pas présents (ancien shell), on retombe sur la
 * navigation classique dans la WebView.
 */
import { isTauri } from '../utils/tauri.js';
import { getOidcStartUrl, getPopcornWebBaseUrl } from '../api/popcorn-web.js';

export const APP_SSO_RETURN_PATH = '/app/auth/callback';

const RETURN_KEY = 'popcornn.nativeSso.returnTo';
const HANDLED_KEY = 'popcornn.nativeSso.handled';
const PENDING_KEY = 'popcornn.nativeSso.pending';
const RETURN_TTL_MS = 15 * 60 * 1000;
/** Ticket popcorn-web valable 2 min : au-delà, inutile de le rejouer. */
const PENDING_TTL_MS = 2 * 60 * 1000;

let supportPromise: Promise<boolean> | null = null;
let listenerStarted = false;

export function getAppSsoReturnUrl(): string {
  return `${getPopcornWebBaseUrl()}${APP_SSO_RETURN_PATH}`;
}

/** true si le shell Tauri expose deep-link + opener (sinon flux WebView classique). */
export function isNativeSsoSupported(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);
  if (!supportPromise) {
    supportPromise = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('plugin:deep-link|get_current');
        return true;
      } catch {
        return false;
      }
    })();
  }
  return supportPromise;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function rememberReturnTarget(href: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(RETURN_KEY, JSON.stringify({ href, at: Date.now() }));
  } catch {
    // ignore
  }
}

/** Pages qui savent consommer ?sso_ticket= (AuthStep de l’assistant, LoginForm). */
function isSsoConsumerPath(pathname: string): boolean {
  const p = (pathname || '/').replace(/\/+$/, '').replace(/\/index\.html$/i, '') || '/';
  return p === '/setup' || p === '/login';
}

function consumeReturnTarget(): URL {
  const fallback = new URL('/login', window.location.origin);
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(RETURN_KEY);
    storage.removeItem(RETURN_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { href?: string; at?: number };
    if (!parsed.href || !parsed.at || Date.now() - parsed.at > RETURN_TTL_MS) return fallback;
    const url = new URL(parsed.href, window.location.origin);
    // Uniquement une page de l’app elle-même, et une page qui traite le ticket.
    if (url.origin !== window.location.origin) return fallback;
    return isSsoConsumerPath(url.pathname) ? url : fallback;
  } catch {
    return fallback;
  }
}

type SsoReturn = { ticket?: string; error?: string };

function savePending(ret: SsoReturn): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(PENDING_KEY, JSON.stringify({ ...ret, at: Date.now() }));
  } catch {
    // ignore
  }
}

function readPending(): SsoReturn | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SsoReturn & { at?: number };
    if (!parsed.at || Date.now() - parsed.at > PENDING_TTL_MS) {
      storage.removeItem(PENDING_KEY);
      return null;
    }
    if (!parsed.ticket && !parsed.error) return null;
    return { ticket: parsed.ticket || undefined, error: parsed.error || undefined };
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    safeStorage()?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * true si un retour Pocket ID est en cours de traitement sur cette page (paramètres d’URL ou
 * retour deep link mémorisé). Le Wizard s’en sert pour ne pas effacer le stockage au montage.
 */
export function hasPendingSsoReturn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sso_ticket') || params.get('sso_error') || params.get('sso_done')) return true;
  } catch {
    // ignore
  }
  return readPending() !== null;
}

/**
 * Récupère (une seule fois) le retour Pocket ID : ?sso_ticket= / ?sso_error= de l’URL, sinon le
 * retour deep link mémorisé. Retire les paramètres de l’URL pour qu’un rechargement ne rejoue pas
 * un ticket déjà consommé (usage unique côté popcorn-web).
 */
export function takeSsoReturn(): SsoReturn | null {
  if (typeof window === 'undefined') return null;
  let ticket: string | undefined;
  let error: string | undefined;
  try {
    const url = new URL(window.location.href);
    ticket = url.searchParams.get('sso_ticket') || undefined;
    error = url.searchParams.get('sso_error') || undefined;
    if (ticket || error) {
      url.searchParams.delete('sso_ticket');
      url.searchParams.delete('sso_error');
      try {
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  const pending = readPending();
  clearPending();
  if (!ticket && !error && pending) {
    ticket = pending.ticket;
    error = pending.error;
  }
  if (!ticket && !error) return null;
  return { ticket, error };
}

/** Reconnaît une URL de retour SSO (App Link https ou schéma popcornn://auth). */
function parseSsoReturnUrl(raw: string): { ticket?: string; error?: string } | null {
  if (typeof raw !== 'string') return null;
  const isCustomScheme = /^popcornn:\/\/auth(\/|\?|$)/i.test(raw);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  let webHost = 'popcornn.app';
  try {
    webHost = new URL(getPopcornWebBaseUrl()).hostname;
  } catch {
    // défaut popcornn.app
  }
  const isAppLink =
    url.protocol === 'https:' &&
    (url.hostname === webHost || url.hostname === 'popcornn.app') &&
    url.pathname.startsWith(APP_SSO_RETURN_PATH.replace(/\/callback$/, ''));
  if (!isCustomScheme && !isAppLink) return null;
  const ticket = url.searchParams.get('sso_ticket') || undefined;
  const error = url.searchParams.get('sso_error') || undefined;
  if (!ticket && !error) return null;
  return { ticket, error };
}

async function logNative(message: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('log-message', { message });
  } catch {
    // ignore
  }
}

function handleDeepLinkUrls(urls: unknown): void {
  const list = Array.isArray(urls) ? urls : typeof urls === 'string' ? [urls] : [];
  for (const raw of list) {
    const parsed = parseSsoReturnUrl(String(raw));
    if (!parsed) continue;
    const marker = parsed.ticket || `err:${parsed.error}`;
    const storage = safeStorage();
    // get_current renvoie la dernière URL tant que l’app vit : ne pas rejouer un retour déjà traité.
    if (storage?.getItem(HANDLED_KEY) === marker) continue;
    try {
      storage?.setItem(HANDLED_KEY, marker);
    } catch {
      // ignore
    }
    // Mémoriser le retour avant de naviguer : survit à un rechargement / une redirection
    // intermédiaire (ex. IndexRedirect au démarrage à froid).
    savePending(parsed.ticket ? { ticket: parsed.ticket } : { error: parsed.error });
    const target = consumeReturnTarget();
    target.searchParams.delete('sso_ticket');
    target.searchParams.delete('sso_error');
    target.searchParams.delete('sso_done');
    if (parsed.ticket) target.searchParams.set('sso_ticket', parsed.ticket);
    else if (parsed.error) target.searchParams.set('sso_error', parsed.error);
    void logNative(`[native-sso] retour deep link (${parsed.ticket ? 'ticket' : 'erreur'}) → ${target.pathname}`);
    window.location.assign(`${target.pathname}${target.search}${target.hash}`);
    return;
  }
}

/**
 * Écoute les deep links de retour SSO (app déjà ouverte) et traite celui qui a lancé l’app
 * (démarrage à froid). Idempotent.
 */
export function initNativeSsoListener(): void {
  if (listenerStarted || !isTauri()) return;
  listenerStarted = true;
  void (async () => {
    if (!(await isNativeSsoSupported())) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string[]>('deep-link://new-url', (event) => handleDeepLinkUrls(event.payload));
    } catch (e) {
      console.warn('[native-sso] écoute deep-link impossible', e);
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const current = await invoke<string[] | null>('plugin:deep-link|get_current');
      if (current) handleDeepLinkUrls(current);
    } catch {
      // ignore
    }
  })();
}

/**
 * Lance Pocket ID dans le navigateur système. Retourne false si non supporté / échec
 * (l’appelant retombe alors sur la navigation dans la WebView).
 */
export async function startNativeSso(currentHref: string): Promise<boolean> {
  if (!(await isNativeSsoSupported())) return false;
  initNativeSsoListener();
  rememberReturnTarget(currentHref);
  const url = getOidcStartUrl(getAppSsoReturnUrl());
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:opener|open_url', { url });
    return true;
  } catch (e) {
    console.warn('[native-sso] ouverture du navigateur système impossible', e);
    return false;
  }
}
