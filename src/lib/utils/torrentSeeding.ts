import type { ClientTorrentStats } from '../client/types';

/** Torrent en seed avec activité réseau observable (upload ou pairs). */
export function isTorrentActivelySeeding(
  t: Pick<ClientTorrentStats, 'state' | 'upload_speed' | 'peers_connected'>,
): boolean {
  return (
    t.state === 'seeding' &&
    (t.upload_speed > 0 || t.peers_connected > 0)
  );
}
