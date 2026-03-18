/**
 * Store partagé pour le statut d'abonnement cloud (subscription/me).
 * Chargé une fois au montage du layout (Navbar) pour que toutes les pages
 * aient accès au cache sans refaire d'appel API.
 */
import { getSubscriptionMe } from './api/popcorn-web';
import type { SubscriptionMe } from './api/popcorn-web';

const CACHE_MS = 5 * 60 * 1000;

let cached: { data: SubscriptionMe | null; at: number } | null = null;

/** Retourne le cache s'il est encore valide. */
export function getCachedSubscription(): SubscriptionMe | null {
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_MS) return null;
  return cached.data;
}

/** Écrit le cache (utilisé après un fetch). */
export function setSubscription(data: SubscriptionMe | null): void {
  cached = { data, at: Date.now() };
}

/**
 * Charge l'abonnement depuis l'API et met à jour le cache.
 * À appeler au montage du layout (ex. Navbar) quand un token cloud est présent.
 */
export async function loadSubscription(): Promise<SubscriptionMe | null> {
  const data = await getSubscriptionMe();
  setSubscription(data);
  return data;
}

/** Indique si l'option streaming torrent est active (lecture depuis le cache). */
export function isStreamingTorrentActive(): boolean {
  const sub = getCachedSubscription();
  return sub?.streamingTorrent === true;
}

/** Indique si l'utilisateur a un abonnement payant actif ou l'option streaming torrent (lecture depuis le cache). */
export function isPayingSubscriber(): boolean {
  const sub = getCachedSubscription();
  return sub?.subscription?.status === 'active' || sub?.streamingTorrent === true;
}
