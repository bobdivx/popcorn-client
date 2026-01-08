import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { webtorrentClient } from '../../lib/torrent/webtorrent-client';
import type { ClientTorrentStats } from '../../lib/torrent/webtorrent-client';

const REFRESH_INTERVAL = 2000; // Rafraîchir toutes les 2 secondes

export default function DownloadsList() {
  const [torrents, setTorrents] = useState<ClientTorrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMagnetModal, setShowAddMagnetModal] = useState(false);
  const [magnetLink, setMagnetLink] = useState('');
  const [addingTorrent, setAddingTorrent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadTorrents = useCallback(async () => {
    try {
      const list = await webtorrentClient.listTorrents();
      setTorrents(list);
      setError(null);
    } catch (err) {
      console.error('Erreur lors du chargement des téléchargements:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTorrents();

    // Rafraîchir périodiquement
    const interval = setInterval(loadTorrents, REFRESH_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [loadTorrents]);

  const handlePause = async (infoHash: string) => {
    try {
      await webtorrentClient.pauseTorrent(infoHash);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la mise en pause:', err);
    }
  };

  const handleResume = async (infoHash: string) => {
    try {
      await webtorrentClient.resumeTorrent(infoHash);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la reprise:', err);
    }
  };

  const handleRemove = async (infoHash: string, deleteFiles: boolean = false) => {
    if (!confirm(`Voulez-vous supprimer ce torrent${deleteFiles ? ' et ses fichiers' : ''} ?`)) {
      return;
    }

    try {
      await webtorrentClient.removeTorrent(infoHash, deleteFiles);
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
      alert('Erreur lors de la suppression: ' + (err instanceof Error ? err.message : 'Erreur inconnue'));
    }
  };

  const handleFileSelect = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      setAddingTorrent(true);
      setError(null);
      await webtorrentClient.addTorrentFile(file);
      await loadTorrents();
      // Réinitialiser l'input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Erreur lors de l\'ajout du fichier torrent:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout du fichier torrent');
    } finally {
      setAddingTorrent(false);
    }
  };

  const handleAddMagnet = async () => {
    if (!magnetLink.trim()) {
      setError('Veuillez entrer un lien magnet');
      return;
    }

    try {
      setAddingTorrent(true);
      setError(null);
      // Extraire le nom du torrent depuis le magnet link si possible
      const nameMatch = magnetLink.match(/dn=([^&]+)/);
      const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Torrent';
      await webtorrentClient.addMagnetLink(magnetLink.trim(), name);
      await loadTorrents();
      setMagnetLink('');
      setShowAddMagnetModal(false);
    } catch (err) {
      console.error('Erreur lors de l\'ajout du magnet link:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout du magnet link');
    } finally {
      setAddingTorrent(false);
    }
  };

  const handlePauseAll = async () => {
    try {
      for (const torrent of torrents) {
        if (torrent.state !== 'paused' && torrent.state !== 'completed' && torrent.state !== 'seeding') {
          try {
            await webtorrentClient.pauseTorrent(torrent.info_hash);
          } catch (err) {
            console.error(`Erreur lors de la pause du torrent ${torrent.info_hash}:`, err);
          }
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la pause de tous les torrents:', err);
    }
  };

  const handleResumeAll = async () => {
    try {
      for (const torrent of torrents) {
        if (torrent.state === 'paused') {
          try {
            await webtorrentClient.resumeTorrent(torrent.info_hash);
          } catch (err) {
            console.error(`Erreur lors de la reprise du torrent ${torrent.info_hash}:`, err);
          }
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la reprise de tous les torrents:', err);
    }
  };

  const handleRemoveAll = async () => {
    if (!confirm(`Voulez-vous supprimer tous les torrents ?`)) {
      return;
    }

    try {
      for (const torrent of torrents) {
        try {
          await webtorrentClient.removeTorrent(torrent.info_hash, false);
        } catch (err) {
          console.error(`Erreur lors de la suppression du torrent ${torrent.info_hash}:`, err);
        }
      }
      await loadTorrents();
    } catch (err) {
      console.error('Erreur lors de la suppression de tous les torrents:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatETA = (seconds: number | null): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getStateLabel = (state: ClientTorrentStats['state']): string => {
    const labels: Record<ClientTorrentStats['state'], string> = {
      queued: 'En attente',
      downloading: 'Téléchargement',
      seeding: 'Partage',
      paused: 'En pause',
      completed: 'Terminé',
    };
    return labels[state] || state;
  };

  const getStateColor = (state: ClientTorrentStats['state']): string => {
    const colors: Record<ClientTorrentStats['state'], string> = {
      queued: 'text-gray-400',
      downloading: 'text-blue-400',
      seeding: 'text-green-400',
      paused: 'text-yellow-400',
      completed: 'text-green-500',
    };
    return colors[state] || 'text-gray-400';
  };

  if (loading && torrents.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error && torrents.length === 0) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <p className="text-red-400">Erreur: {error}</p>
        <button
          onClick={loadTorrents}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const renderActionsBar = () => (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".torrent"
              onChange={handleFileSelect}
              className="hidden"
              ref={fileInputRef}
              disabled={addingTorrent}
            />
            <span className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors inline-block cursor-pointer ${addingTorrent ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {addingTorrent ? 'Ajout en cours...' : '+ Ajouter fichier .torrent'}
            </span>
          </label>
          
          <button
            onClick={() => setShowAddMagnetModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors"
            disabled={addingTorrent}
          >
            + Ajouter magnet link
          </button>
        </div>

        {torrents.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handlePauseAll}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium transition-colors"
              disabled={torrents.every(t => t.state === 'paused' || t.state === 'completed' || t.state === 'seeding')}
            >
              Pause tous
            </button>
            <button
              onClick={handleResumeAll}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
              disabled={torrents.every(t => t.state !== 'paused')}
            >
              Reprendre tous
            </button>
            <button
              onClick={handleRemoveAll}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
            >
              Supprimer tous
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (torrents.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        {renderActionsBar()}
        
        {/* Modal pour ajouter un magnet link */}
        {showAddMagnetModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Ajouter un magnet link</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Lien magnet:</label>
                  <textarea
                    value={magnetLink}
                    onChange={(e) => setMagnetLink((e.target as HTMLTextAreaElement).value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    rows={3}
                    placeholder="magnet:?xt=urn:btih:..."
                    disabled={addingTorrent}
                  />
                </div>
                {error && (
                  <div className="bg-red-900/20 border border-red-500 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowAddMagnetModal(false);
                      setMagnetLink('');
                      setError(null);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                    disabled={addingTorrent}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleAddMagnet}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                    disabled={addingTorrent || !magnetLink.trim()}
                  >
                    {addingTorrent ? 'Ajout en cours...' : 'Ajouter'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && !showAddMagnetModal && (
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
            <p className="text-yellow-400">Avertissement: {error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-yellow-400 hover:text-yellow-300 text-sm"
            >
              Masquer
            </button>
          </div>
        )}

        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">Aucun téléchargement actif</p>
          <p className="text-gray-500 text-sm mt-2">
            Les torrents que vous ajoutez apparaîtront ici
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions globales */}
      {renderActionsBar()}

      {/* Modal pour ajouter un magnet link */}
      {showAddMagnetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Ajouter un magnet link</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Lien magnet:</label>
                <textarea
                  value={magnetLink}
                  onChange={(e) => setMagnetLink((e.target as HTMLTextAreaElement).value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  rows={3}
                  placeholder="magnet:?xt=urn:btih:..."
                  disabled={addingTorrent}
                />
              </div>
              {error && (
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowAddMagnetModal(false);
                    setMagnetLink('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                  disabled={addingTorrent}
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddMagnet}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                  disabled={addingTorrent || !magnetLink.trim()}
                >
                  {addingTorrent ? 'Ajout en cours...' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && !showAddMagnetModal && (
        <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
          <p className="text-yellow-400">Avertissement: {error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-yellow-400 hover:text-yellow-300 text-sm"
          >
            Masquer
          </button>
        </div>
      )}

      <div className="text-sm text-gray-400 mb-2">
        {torrents.length} téléchargement{torrents.length > 1 ? 's' : ''} actif{torrents.length > 1 ? 's' : ''}
      </div>

      <div className="grid gap-4">
        {torrents.map((torrent) => (
          <div
            key={torrent.info_hash}
            className="bg-gray-900 border border-gray-800 rounded-lg p-6 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-1">{torrent.name || 'Sans nom'}</h3>
                <p className="text-sm text-gray-400 font-mono">{torrent.info_hash}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStateColor(torrent.state)} bg-gray-800`}>
                {getStateLabel(torrent.state)}
              </div>
            </div>

            {/* Barre de progression */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>{formatBytes(torrent.downloaded_bytes)} / {formatBytes(torrent.total_bytes)}</span>
                <span className="font-semibold">{(torrent.progress * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={`width: ${torrent.progress * 100}%`}
                ></div>
              </div>
            </div>

            {/* Statistiques */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-400">Vitesse DL:</span>
                <span className="ml-2 font-semibold">{formatSpeed(torrent.download_speed)}</span>
              </div>
              <div>
                <span className="text-gray-400">Vitesse UL:</span>
                <span className="ml-2 font-semibold">{formatSpeed(torrent.upload_speed)}</span>
              </div>
              <div>
                <span className="text-gray-400">Peers:</span>
                <span className="ml-2 font-semibold">{torrent.peers_connected}</span>
              </div>
              <div>
                <span className="text-gray-400">ETA:</span>
                <span className="ml-2 font-semibold">{formatETA(torrent.eta_seconds)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {torrent.state === 'paused' ? (
                <button
                  onClick={() => handleResume(torrent.info_hash)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
                >
                  Reprendre
                </button>
              ) : torrent.state !== 'completed' && torrent.state !== 'seeding' ? (
                <button
                  onClick={() => handlePause(torrent.info_hash)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium transition-colors"
                >
                  Pause
                </button>
              ) : null}

              <button
                onClick={() => handleRemove(torrent.info_hash, false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
              >
                Supprimer
              </button>

              {(torrent.state === 'completed' || torrent.state === 'seeding') && (
                <button
                  onClick={() => handleRemove(torrent.info_hash, true)}
                  className="px-4 py-2 bg-red-800 hover:bg-red-900 rounded text-sm font-medium transition-colors"
                >
                  Supprimer avec fichiers
                </button>
              )}

              <a
                href={`/torrents?slug=${torrent.info_hash}`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors inline-block"
              >
                Ouvrir
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
