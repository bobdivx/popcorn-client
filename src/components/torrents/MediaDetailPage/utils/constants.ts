export const QUEUED_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
export const QUEUED_LOG_INTERVAL_MS = 10 * 1000; // Logger toutes les 10 secondes si en "Queued"
export const QUEUED_RETRY_RESUME_MS = 5 * 1000; // Essayer de reprendre le torrent toutes les 5 secondes
export const PROGRESS_POLL_INTERVAL_MS = 5000; // Polling de progression toutes les 5 secondes
export const LIST_TORRENTS_POLL_MS = 5000; // Polling listTorrents (page détail / stats)
export const EPISODES_LIBRARY_POLL_MS = 15_000; // Refresh bibliothèque épisodes (moins fréquent)
export const STATS_UPDATE_INTERVAL_MS = 60000; // Mise à jour des stats toutes les 60 secondes
