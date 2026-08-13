export const TV_BROWSE_RESTORE_KEY = 'popcorn:tv-browse-restore';

export type TvBrowseRestore = {
  path: string;
  scrollY: number;
  itemKey: string;
};

const BROWSE_PATHS = new Set([
  '/dashboard',
  '/films',
  '/series',
  '/demandes',
  '/search',
  '/downloads',
]);

export function currentBrowsePath(): string {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

export function isTvBrowsePath(path = currentBrowsePath()): boolean {
  return BROWSE_PATHS.has(path);
}

export function tvBrowseItemKey(item: {
  tmdbId?: number | null;
  type?: string;
  id?: string;
  infoHash?: string;
  info_hash?: string;
}): string {
  if (typeof item.tmdbId === 'number' && item.tmdbId > 0) {
    const type = item.type === 'tv' || item.type === 'series' ? 'tv' : item.type || 'movie';
    return `${type}:${item.tmdbId}`;
  }
  const hash = item.infoHash || item.info_hash;
  if (hash) return `infoHash:${hash}`;
  if (item.id) return `id:${item.id}`;
  return '';
}

export function saveTvBrowseRestoreFromElement(el: HTMLElement | null): void {
  if (!el || typeof window === 'undefined') return;
  const holder = (el.closest('[data-tv-item-key]') as HTMLElement | null) ?? el;
  const itemKey = holder.getAttribute('data-tv-item-key');
  if (!itemKey) return;
  const data: TvBrowseRestore = {
    path: currentBrowsePath(),
    scrollY: window.scrollY,
    itemKey,
  };
  try {
    sessionStorage.setItem(TV_BROWSE_RESTORE_KEY, JSON.stringify(data));
  } catch {
    // quota / navigation privée
  }
}

export function peekTvBrowseRestore(): TvBrowseRestore | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TV_BROWSE_RESTORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as TvBrowseRestore;
    if (!data?.itemKey || data.path !== currentBrowsePath()) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearTvBrowseRestore(): void {
  try {
    sessionStorage.removeItem(TV_BROWSE_RESTORE_KEY);
  } catch {
    // ignore
  }
}

export function findTvBrowseRestoreCard(itemKey: string): HTMLElement | null {
  const cards = document.querySelectorAll<HTMLElement>('[data-tv-item-key]');
  let fallback: HTMLElement | null = null;
  for (const card of cards) {
    if (card.getAttribute('data-tv-item-key') !== itemKey) continue;
    const fromHero = !!card.closest('.hero-dashboard') || card.hasAttribute('data-tv-hero-cycle');
    if (fromHero) {
      fallback = fallback ?? card;
      continue;
    }
    return card;
  }
  return fallback;
}
