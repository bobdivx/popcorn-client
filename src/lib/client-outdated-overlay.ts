/**
 * Overlay plein ecran « Mets a jour Popcornn » affiche quand le serveur renvoie 426
 * (client trop ancien pour le gate min-client-version). Lien de telechargement par plateforme.
 * Autonome (injection DOM directe) pour fonctionner sur toutes les pages et sur webOS/Tesla.
 */
import { APP_DOWNLOAD_LINKS } from './app-download-links';
import { getClientPlatform } from './client-identity';

let shown = false;

function linkForPlatform(p: string): string {
  switch (p) {
    case 'android':
      return APP_DOWNLOAD_LINKS.android;
    case 'webos-native':
      return APP_DOWNLOAD_LINKS.webosNative;
    case 'webos-lite':
      return APP_DOWNLOAD_LINKS.webosLite;
    case 'desktop':
      return APP_DOWNLOAD_LINKS.desktop;
    default:
      return APP_DOWNLOAD_LINKS.page;
  }
}

export function showClientOutdatedOverlay(platform?: string): void {
  if (typeof document === 'undefined' || shown) return;
  if (document.getElementById('popcorn-client-outdated')) {
    shown = true;
    return;
  }
  shown = true;
  const p = platform || getClientPlatform();
  const link = linkForPlatform(p);
  const el = document.createElement('div');
  el.id = 'popcorn-client-outdated';
  el.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483647;background:#0c0d10;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5vw;font-family:system-ui,-apple-system,sans-serif;'
  );
  const title = document.createElement('div');
  title.setAttribute('style', 'font-size:clamp(24px,5vw,40px);font-weight:700;margin-bottom:16px;');
  title.textContent = 'Mets à jour Popcornn';
  const desc = document.createElement('div');
  desc.setAttribute('style', 'font-size:clamp(15px,2.5vw,20px);opacity:.85;margin-bottom:28px;max-width:640px;');
  desc.textContent =
    "Cette version de l'application n'est plus compatible avec le serveur. Installe la dernière version pour continuer.";
  const a = document.createElement('a');
  a.setAttribute('href', link);
  a.setAttribute(
    'style',
    'display:inline-block;background:#e50914;color:#fff;text-decoration:none;font-weight:600;font-size:clamp(16px,2.5vw,20px);padding:14px 28px;border-radius:10px;'
  );
  a.textContent = 'Mettre à jour';
  el.appendChild(title);
  el.appendChild(desc);
  el.appendChild(a);
  document.body.appendChild(el);
}
