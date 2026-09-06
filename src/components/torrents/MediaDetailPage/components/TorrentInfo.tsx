import { useState, useMemo, useEffect } from 'preact/hooks';
import { Info, Trash2 } from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';
import { formatSize } from '../utils/formatSize';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { serverApi } from '../../../../lib/client/server-api';
import { getLibraryDisplayConfig } from '../../../../lib/utils/library-display-config';
import { buildExternalDownloadParams } from '../../../../lib/torrents/externalDownloadParams';
import { Modal } from '../../../ui/Modal';
import { DsLoader } from '../../../ui/DsLoader';
import { handleDeleteMedia, isLocalMedia } from '../actions/delete';

type QualityVariant = {
  id: string;
  quality?: { resolution?: string; codec?: string };
  codec?: string;
  seedCount?: number;
  fileSize?: number;
  indexerName?: string;
  [key: string]: any;
};

interface TorrentInfoProps {
  torrent: MediaDetailPageProps['torrent'];
  seedCount: number;
  leechCount: number;
  fileSize: number;
  showSeederWarning?: boolean;
  /** Série TV : masquer chemin fichier + stats globales (déplacées vers les cartes épisode). */
  isSeries?: boolean;
  sources?: Array<{
    tracker: string;
    seeds: number;
    peers: number;
    quality?: 'Remux' | '4K' | '1080p' | '720p' | '480p';
    codec?: 'x264' | 'x265' | 'AV1';
    fileSize?: number;
  }>;
  allVariants?: QualityVariant[];
  selectedVariantId?: string | null;
  onSelectVariant?: (variant: QualityVariant) => void;
  /** Fichier présent sur disque et/ou torrent dans le client → afficher « Supprimer ». */
  canDelete?: boolean;
  setIsAvailableLocally?: (value: boolean) => void;
  addNotification?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const QUALITY_ORDER: Record<string, number> = { Remux: 6, '4K': 5, '2160p': 5, UHD: 5, '1080p': 4, '720p': 3, '480p': 2 };

function normalizeResolution(raw?: string): string {
  if (!raw) return '';
  const up = raw.toUpperCase();
  if (up.includes('2160') || up === '4K' || up === 'UHD') return '4K';
  if (up.includes('1080')) return '1080p';
  if (up.includes('720')) return '720p';
  if (up.includes('480')) return '480p';
  if (up.includes('REMUX')) return 'Remux';
  return raw;
}

function qualityBadgeClass(_resolution: string, isSelected: boolean): string {
  if (isSelected) {
    return 'backdrop-blur-sm text-white border-violet-400/70 bg-black/55';
  }
  return 'backdrop-blur-sm text-white/80 border-white/20 bg-black/40 hover:text-white hover:border-white/40';
}

export function TorrentInfo({
  torrent,
  seedCount,
  leechCount,
  fileSize,
  showSeederWarning = true,
  isSeries = false,
  sources,
  allVariants,
  selectedVariantId,
  onSelectVariant,
  canDelete = false,
  setIsAvailableLocally,
  addNotification,
}: TorrentInfoProps) {
  const { language, t } = useI18n();
  const [isDownloadingTorrent, setIsDownloadingTorrent] = useState(false);
  const [showTechInfoModal, setShowTechInfoModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMedia, setDeletingMedia] = useState(false);
  const [seederAlertVisible, setSeederAlertVisible] = useState(true);
  const [seederAlertFading, setSeederAlertFading] = useState(false);

  useEffect(() => {
    if (!showSeederWarning || seedCount >= 10) return;
    // Rouge (0 seeders) : 8s, amber : 5s
    const delay = seedCount === 0 ? 8000 : 5000;
    const fadeTimer = window.setTimeout(() => setSeederAlertFading(true), delay);
    const hideTimer = window.setTimeout(() => setSeederAlertVisible(false), delay + 400);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [showSeederWarning, seedCount]);

  // Qualité préférée depuis les paramètres utilisateur
  const preferredQuality = useMemo(() => getLibraryDisplayConfig().preferredQuality ?? '', []);

  // Qualité du torrent courant (fallback si pas de variants groupés)
  const currentQuality = normalizeResolution((torrent as any).quality?.resolution || (torrent as any).format);

  // Grouper les variants par qualité normalisée
  const qualityGroups = useMemo(() => {
    const variants = allVariants && allVariants.length > 0 ? allVariants : null;
    if (!variants) return null;
    const groups = new Map<string, QualityVariant[]>();
    for (const v of variants) {
      const res = normalizeResolution(v.quality?.resolution || v.format);
      const key = res || '';
      if (!key) continue; // ignorer les variants sans qualité connue
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    if (groups.size === 0) return null;
    return [...groups.entries()].sort(([a], [b]) => (QUALITY_ORDER[b] ?? 0) - (QUALITY_ORDER[a] ?? 0));
  }, [allVariants]);

  // Utiliser le synopsis TMDB si disponible, sinon la description
  const description = torrent.synopsis || torrent.description;

  // Formater la date de sortie
  const formatReleaseDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Formater la durée
  const formatRuntime = (runtime: number | null | undefined): string | null => {
    if (!runtime) return null;
    if (torrent.category === 'series') {
      return `${runtime} épisode${runtime > 1 ? 's' : ''}`;
    }
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? `${minutes}min` : ''}`;
    }
    return `${minutes}min`;
  };

  // Récupérer l'indexer depuis le torrent
  const indexerName = (torrent as any).indexerName || (torrent as any).indexer_name || null;
  const minimumRatio = (torrent as any).minimumRatio ?? (torrent as any).minimum_ratio ?? null;
  const trackerName = (torrent as any).tracker ?? null;
  const infoHash = (torrent as any).infoHash || (torrent as any).info_hash || null;
  const filePath = !isSeries ? ((torrent as any).downloadPath as string | undefined) || null : null;
  const showMovieTechInfo =
    !isSeries &&
    !!(filePath || indexerName || minimumRatio != null || trackerName || canDelete);

  const canDownloadTorrentFile = !!infoHash || !!(torrent as any)._externalLink;

  const handleIndexerClick = async () => {
    if (!canDownloadTorrentFile || isDownloadingTorrent) return;
    setIsDownloadingTorrent(true);
    try {
      // 1) Essayer d'abord via le stockage local (reseed) si on a un infoHash
      if (infoHash) {
        const res = await serverApi.downloadTorrentFileForReseed(infoHash as string);
        if (res.success && res.data) {
          const blob = res.data as Blob;
          const name = (torrent as any).mainTitle || torrent.name || infoHash;
          const filename =
            (res as { filename?: string }).filename ||
            `${String(name).replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
      }

      // 2) Fallback : essayer de récupérer le .torrent directement depuis l'indexer
      const externalLink = (torrent as any)._externalLink || null;
      if (!externalLink) {
        const message =
          language === 'fr'
            ? "Aucun fichier .torrent n'est disponible pour ce média (ni en base, ni via l'indexer)."
            : 'No .torrent file is available for this media (neither local nor from indexer).';
        if (typeof window !== 'undefined') {
          window.alert(message);
        }
        return;
      }

      const extParams = buildExternalDownloadParams(torrent as any);

      const resIndexer = await serverApi.downloadTorrentFromIndexer({
        externalLink,
        torrentName: torrent.name,
        indexerId: extParams.indexerId,
        indexerName: indexerName || extParams.indexerName,
        guid: extParams.guid,
        torrentId: extParams.torrentId,
        indexerTypeId: extParams.indexerTypeId,
      });

      if (resIndexer.success && resIndexer.data) {
        const blob = resIndexer.data as Blob;
        const name = (torrent as any).mainTitle || torrent.name || infoHash || '';
        const filename =
          (resIndexer as { filename?: string }).filename ||
          `${String(name || 'torrent').replace(/[^a-zA-Z0-9._-]/g, '_')}.torrent`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const message =
          resIndexer.message ||
          (language === 'fr'
            ? "Impossible de récupérer le fichier .torrent depuis l'indexer."
            : 'Unable to fetch .torrent file from indexer.');
        if (typeof window !== 'undefined') {
          window.alert(message);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : language === 'fr'
          ? 'Erreur lors du téléchargement du fichier .torrent.'
          : 'Error while downloading the .torrent file.';
      if (typeof window !== 'undefined') {
        window.alert(message);
      }
    } finally {
      setIsDownloadingTorrent(false);
    }
  };

  const deleteInfoHash =
    (typeof infoHash === 'string' && infoHash.trim()) ||
    (typeof torrent.infoHash === 'string' && torrent.infoHash.trim()) ||
    '';
  const showDeleteInTechModal = canDelete && !!deleteInfoHash && !!setIsAvailableLocally && !!addNotification;
  const isLocalTorrent = isLocalMedia(deleteInfoHash) || !!(torrent as any).downloadPath;

  const handleConfirmDelete = async () => {
    if (!deleteInfoHash || !setIsAvailableLocally || !addNotification) return;
    setDeletingMedia(true);
    try {
      await handleDeleteMedia(deleteInfoHash, {
        torrent,
        setIsAvailableLocally,
        addNotification,
        skipConfirm: true,
      });
      setShowDeleteConfirm(false);
      setShowTechInfoModal(false);
    } finally {
      setDeletingMedia(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info technique (chemin / indexer) en modal — films. Séries : bouton Info dossier dans ActionButtons. */}
      {(showMovieTechInfo || (isSeries && indexerName) || qualityGroups || currentQuality) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {showMovieTechInfo && (
            <button
              type="button"
              onClick={() => setShowTechInfoModal(true)}
              data-focusable
              tabIndex={0}
              title={t('mediaDetail.techInfoTitle')}
              aria-label={t('mediaDetail.infoButton')}
              className="gtv-icon-btn ds-focus-glow ds-active-glow tv:w-16 tv:h-16"
            >
              <Info className="h-5 w-5 tv:h-7 tv:w-7" aria-hidden />
            </button>
          )}

          {/* Carte indexer — séries uniquement (films : dans la modal Info) */}
          {isSeries && indexerName && (
            <div
              className={
                'inline-flex flex-wrap items-center gap-2 px-4 py-2 bg-black/50 border border-white/20 text-white rounded-lg text-sm font-semibold flex-shrink-0' +
                (canDownloadTorrentFile ? ' cursor-pointer hover:bg-black/65 hover:border-white/30 transition-colors' : '')
              }
              {...(canDownloadTorrentFile
                ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: handleIndexerClick,
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleIndexerClick();
                      }
                    },
                    title: t('mediaDetail.downloadTorrentHint'),
                  }
                : {})}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <span className="text-white/70">{t('mediaDetail.indexerLabel')}:</span>
              <span className="text-white font-bold">{indexerName}</span>
              {minimumRatio != null && (
                <>
                  <span className="text-white/50" aria-hidden="true">·</span>
                  <span title={language === 'fr' ? 'Ratio minimum requis par le tracker' : 'Minimum ratio required by tracker'}>
                    {t('mediaDetail.minimumRatio')} <span className="text-white font-bold">{Number(minimumRatio) === Math.floor(Number(minimumRatio)) ? String(Math.floor(Number(minimumRatio))) : Number(minimumRatio).toFixed(1)}</span>
                  </span>
                </>
              )}
              {trackerName && (
                <>
                  <span className="text-white/50" aria-hidden="true">·</span>
                  <span title={trackerName} className="truncate max-w-[160px]">
                    {t('mediaDetail.tracker')}: <span className="text-white font-bold truncate" title={trackerName}>{trackerName}</span>
                  </span>
                </>
              )}
            </div>
          )}

          {/* Sélecteur de qualité — boutons interactifs si plusieurs variantes, badge informatif sinon */}
          {qualityGroups && qualityGroups.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={language === 'fr' ? 'Choisir la qualité' : 'Choose quality'}>
              {qualityGroups.map(([resolution, variants]) => {
                const isSelected = variants.some((v) => v.id === selectedVariantId);
                const isPreferred = !!preferredQuality && normalizeResolution(preferredQuality) === resolution;
                const canSwitch = !!onSelectVariant && (qualityGroups.length > 1 || variants.length > 1);
                const bestVariant = [...variants].sort((a, b) => (b.seedCount ?? 0) - (a.seedCount ?? 0))[0];
                const totalSeeds = variants.reduce((sum, v) => sum + (v.seedCount ?? 0), 0);
                return (
                  <button
                    key={resolution}
                    type="button"
                    onClick={() => canSwitch && onSelectVariant && onSelectVariant(bestVariant)}
                    title={`${variants.length} source${variants.length > 1 ? 's' : ''} · ${totalSeeds} seeder${totalSeeds !== 1 ? 's' : ''}${isPreferred ? (language === 'fr' ? ' · Qualité préférée' : ' · Preferred quality') : ''}`}
                    className={`relative inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 focus:ring-offset-black/50 ${canSwitch ? 'cursor-pointer' : 'cursor-default'} ${qualityBadgeClass(resolution, isSelected)}`}
                    aria-pressed={isSelected}
                  >
                    {resolution}
                    {variants.length > 1 && (
                      <span className={`text-[10px] font-normal ${isSelected ? 'opacity-80' : 'opacity-50'}`}>
                        ×{variants.length}
                      </span>
                    )}
                    {isPreferred && !isSelected && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-400" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : currentQuality ? (
            /* Badge unique si qualité connue mais pas de groupe interactif */
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-bold ${qualityBadgeClass(currentQuality, true)}`}>
              {currentQuality}
            </span>
          ) : null}
        </div>
      )}

      {/* Ratio / Tracker sans indexer — séries uniquement (films : modal Info) */}
      {isSeries && !indexerName && (minimumRatio != null || trackerName) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
          {minimumRatio != null && (
            <span title={language === 'fr' ? 'Ratio minimum requis par le tracker' : 'Minimum ratio required by tracker'}>
              {t('mediaDetail.minimumRatio')} <strong className="text-white/90">{Number(minimumRatio) === Math.floor(Number(minimumRatio)) ? String(Math.floor(Number(minimumRatio))) : Number(minimumRatio).toFixed(1)}</strong>
            </span>
          )}
          {trackerName && (
            <span title={language === 'fr' ? 'Nom du tracker' : 'Tracker name'}>
              {t('mediaDetail.tracker')}: <strong className="text-white/90 truncate max-w-[200px] inline-block align-bottom" title={trackerName}>{trackerName}</strong>
            </span>
          )}
        </div>
      )}

      {/* Avertissement éphémère si peu de seeders (films uniquement) */}
      {!isSeries && showSeederWarning && seedCount < 10 && seederAlertVisible && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-start gap-3 transition-opacity duration-400 ${
            seederAlertFading ? 'opacity-0' : 'opacity-100'
          } ${
            seedCount === 0
              ? 'bg-red-900/40 border border-red-500/50'
              : 'bg-amber-900/40 border border-amber-500/50'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mt-0.5 flex-shrink-0 ${seedCount === 0 ? 'text-red-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className={`text-sm ${seedCount === 0 ? 'text-red-200' : 'text-amber-200'}`}>
            {seedCount === 0
              ? (language === 'fr'
                  ? 'Aucun seeder disponible. Ce torrent est probablement indisponible.'
                  : 'No seeders available. This torrent is likely unavailable.')
              : (language === 'fr'
                  ? `Seulement ${seedCount} seeder${seedCount > 1 ? 's' : ''} disponible${seedCount > 1 ? 's' : ''}. Le téléchargement pourrait être lent ou échouer.`
                  : `Only ${seedCount} seeder${seedCount > 1 ? 's' : ''} available. Download may be slow or fail.`)
            }
          </div>
        </div>
      )}

      {/* Statistiques globales — films uniquement (séries : par carte épisode) */}
      {!isSeries && (
        <div className="flex flex-wrap gap-6 text-sm mb-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${
              seedCount >= 50 ? 'text-green-500'
              : seedCount >= 10 ? 'text-green-500'
              : seedCount >= 1 ? 'text-amber-500'
              : 'text-red-500'
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`font-semibold ${
              seedCount >= 50 ? 'text-green-500'
              : seedCount >= 10 ? 'text-green-500'
              : seedCount >= 1 ? 'text-amber-500'
              : 'text-red-500'
            }`}>{seedCount}</span>
            <span className="text-white/70">{language === 'fr' ? 'seeders' : 'seeders'}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-yellow-500 font-semibold">{leechCount}</span>
            <span className="text-white/70">{language === 'fr' ? 'leechers' : 'leechers'}</span>
          </div>
          <div className="text-white/70">
            {formatSize(fileSize)}
          </div>
          {torrent.voteAverage && (
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-yellow-400 font-semibold">{torrent.voteAverage.toFixed(1)}</span>
              <span className="text-white/70">/10</span>
            </div>
          )}
        </div>
      )}

      {/* Métadonnées TMDB */}
      {(torrent.releaseDate || torrent.genres || torrent.runtime) && (
        <div className="flex flex-wrap gap-4 text-sm text-white/80 mb-4">
          {torrent.releaseDate && (
            <div>
              <span className="font-semibold text-white/90">Date de sortie:</span> {formatReleaseDate(torrent.releaseDate)}
            </div>
          )}
          {torrent.runtime && (
            <div>
              <span className="font-semibold text-white/90">Durée:</span> {formatRuntime(torrent.runtime)}
            </div>
          )}
          {torrent.genres && torrent.genres.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white/90">Genres:</span>
              <div className="flex flex-wrap gap-2">
                {torrent.genres.map((genre, index) => (
                  <span key={index} className="badge badge-outline badge-sm">
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Synopsis/Description */}
      {description && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2 text-white/90">Synopsis</h3>
          <p className="text-lg text-white/90 leading-relaxed max-w-3xl">
            {description}
          </p>
        </div>
      )}

      {/* Métadonnées techniques */}
      {torrent.createdAt && (
        <div className="text-sm text-white/70">
          <span className="font-semibold">{language === 'fr' ? 'Date d\'ajout:' : 'Added date:'}</span>{' '}
          {new Date(torrent.createdAt * 1000).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      )}

      {showMovieTechInfo && (
        <Modal
          isOpen={showTechInfoModal}
          onClose={() => setShowTechInfoModal(false)}
          title={t('mediaDetail.techInfoTitle')}
          size="lg"
        >
          <div className="space-y-4 pt-2 min-w-0">
            {filePath && (
              <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm">
                <span className="font-semibold text-[var(--ds-text-primary)]">
                  {t('mediaDetail.filePathLabel')}
                </span>
                <code
                  className="break-all font-mono text-xs text-[var(--ds-text-secondary)]"
                  title={filePath}
                >
                  {filePath}
                </code>
              </div>
            )}

            {indexerName && (
              <button
                type="button"
                onClick={() => void handleIndexerClick()}
                disabled={!canDownloadTorrentFile || isDownloadingTorrent}
                data-focusable
                data-autofocus
                tabIndex={0}
                title={canDownloadTorrentFile ? t('mediaDetail.downloadTorrentHint') : undefined}
                className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-4 py-3 text-left text-sm font-semibold text-[var(--ds-text-primary)] transition-colors hover:bg-[var(--ds-surface-overlay)] disabled:cursor-default disabled:opacity-70"
              >
                {isDownloadingTorrent ? (
                  <DsLoader size="xs" className="shrink-0" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                )}
                <span className="text-[var(--ds-text-secondary)]">{t('mediaDetail.indexerLabel')}:</span>
                <span className="font-bold">{indexerName}</span>
                {minimumRatio != null && (
                  <>
                    <span className="text-[var(--ds-text-tertiary)]" aria-hidden="true">·</span>
                    <span>
                      {t('mediaDetail.minimumRatio')}{' '}
                      <span className="font-bold">
                        {Number(minimumRatio) === Math.floor(Number(minimumRatio))
                          ? String(Math.floor(Number(minimumRatio)))
                          : Number(minimumRatio).toFixed(1)}
                      </span>
                    </span>
                  </>
                )}
                {trackerName && (
                  <>
                    <span className="text-[var(--ds-text-tertiary)]" aria-hidden="true">·</span>
                    <span className="max-w-full truncate" title={trackerName}>
                      {t('mediaDetail.tracker')}: <span className="font-bold">{trackerName}</span>
                    </span>
                  </>
                )}
              </button>
            )}

            {!indexerName && (minimumRatio != null || trackerName) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--ds-text-secondary)]">
                {minimumRatio != null && (
                  <span>
                    {t('mediaDetail.minimumRatio')}{' '}
                    <strong className="text-[var(--ds-text-primary)]">
                      {Number(minimumRatio) === Math.floor(Number(minimumRatio))
                        ? String(Math.floor(Number(minimumRatio)))
                        : Number(minimumRatio).toFixed(1)}
                    </strong>
                  </span>
                )}
                {trackerName && (
                  <span className="min-w-0 truncate" title={trackerName}>
                    {t('mediaDetail.tracker')}:{' '}
                    <strong className="text-[var(--ds-text-primary)]">{trackerName}</strong>
                  </span>
                )}
              </div>
            )}

            {showDeleteInTechModal && (
              <div className="border-t border-[var(--ds-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deletingMedia}
                  data-focusable
                  tabIndex={0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-600/15 px-4 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-600/25 hover:text-red-200 disabled:opacity-50"
                >
                  {deletingMedia ? (
                    <DsLoader size="xs" className="shrink-0" />
                  ) : (
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {isLocalTorrent
                    ? t('mediaDetail.deleteLocalFile')
                    : t('mediaDetail.deleteFromDiskAndClient')}
                </button>
                <p className="mt-2 text-xs text-[var(--ds-text-tertiary)]">
                  {t('mediaDetail.deleteFromDiskAndClientHint')}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showDeleteInTechModal && (
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => !deletingMedia && setShowDeleteConfirm(false)}
          title={t('downloads.confirmDeleteTorrentTitle')}
          size="sm"
        >
          <p className="mb-6 text-[var(--ds-text-primary)]">
            {t('downloads.confirmDeleteTorrentMessage')}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deletingMedia}
              className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-5 py-2.5 font-semibold text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-overlay)] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
              data-focusable
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={deletingMedia}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              data-focusable
            >
              {deletingMedia ? (
                <>
                  <DsLoader size="xs" className="mr-2 inline-block" />
                  {t('downloads.removing')}
                </>
              ) : (
                t('common.delete')
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
