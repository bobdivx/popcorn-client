/**
 * Donne le focus au premier lien de la barre latérale TV (rail).
 * Utilisé par le bouton « Menu » et les raccourcis télécommande (Menu / ContextMenu).
 */
export function focusTVSidebarFirst(): boolean {
  if (typeof document === 'undefined') return false;
  const link = document.querySelector<HTMLElement>('[data-tv-app-sidebar] nav a[href]');
  if (!link) return false;
  link.focus();
  return true;
}
