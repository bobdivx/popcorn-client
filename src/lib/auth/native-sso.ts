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
 * Si les plugins Tauri deep-link / opener ne sont pas présents (ancien shell), on retombe sur la
 * navigation classique dans la WebView.
 */
import { isTauri } from '../utils/tauri.js';
import { getOidcStartUrl, getPopcornWebBaseUrl } from '../api/popcorn-web.js';

export const APP_SSO_RETURN_PATH = '/app/auth/callback';

const RETURN_KEY = 'popcornn.nativeSso.returnTo';
const HANDLED_KEY = 'popcornn.nativeSso.handled';
const RETURN_TTL_MS = 15 * 60 * 1000;

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
    // Uniquement une page de l’app elle-même.
    return url.origin === window.location.origin ? url : fallback;
  } catch {
    return fallback;
  }
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
    const target = consumeReturnTarget();
    target.searchParams.delete('sso_ticket');
    target.searchParams.delete('sso_error');
    if (parsed.ticket) target.searchParams.set('sso_ticket', parsed.ticket);
    else if (parsed.error) target.searchParams.set('sso_error', parsed.error);
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
