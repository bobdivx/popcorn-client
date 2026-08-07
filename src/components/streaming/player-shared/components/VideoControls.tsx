import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Subtitles, ArrowLeft, RotateCcw, SkipForward, Settings } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { formatTime } from '../utils/formatTime';
import { isMobileDevice } from '../../../../lib/utils/device-detection';
import { SubtitleSelector } from './SubtitleSelector';
import type { ScrubThumbnailsMeta } from '../types/scrubThumbnails';
import { useScrubNav } from './video-controls/useScrubNav';
import { ScrubThumbnailsStrip } from './video-controls/ScrubThumbnailsStrip';
import { ScrubThumbnailImage } from './video-controls/ScrubThumbnailImage';
import { persistVideoFillMode } from '../hooks/usePlayerConfig';
import type { SeriesEpisodePickerItem } from '../types/seriesEpisodePicker';

interface AudioTrack {
  id: number;
  name: string;
  lang?: string;
  groupId?: string;
  default?: boolean;
}

interface SubtitleTrack {
  id: number;
  name: string;
  lang?: string;
  groupId?: string;
  default?: boolean;
}

interface VideoControlsProps {
  torrentName?: string;
  showControls: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
  isFullscreen: boolean;
  isTV?: boolean;
  focusedControlIndex?: number;
  /** Sur TV : la barre de progression est-elle focalisée (flèches = seek) */
  focusedOnProgress?: boolean;
  /** Callback pour synchroniser le focus sur la barre (TV / accessibilité) */
  setFocusedOnProgress?: (focused: boolean) => void;
  /** Ref à attacher à la barre de progression (focus télécommande TV) */
  progressBarRef?: { current: HTMLDivElement | null };
  /** Sur TV : le bouton Retour est-il dans le focus ring */
  hasBackButton?: boolean;
  onPlayPause: () => void;
  onSeek: (e: any) => void;
  /** Seek direct (en secondes) pour les vignettes scrub (évite de simuler un clic sur la barre). */
  onSeekToTime?: (timeSeconds: number) => void;
  onVolumeChange: (e: any) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onSeekTV?: (direction: 'left' | 'right', stepSeconds?: number) => void;
  onVolumeChangeTV?: (direction: 'up' | 'down') => void;
  audioTracks?: AudioTrack[];
  subtitleTracks?: SubtitleTrack[];
  currentAudioTrack?: number;
  currentSubtitleTrack?: number;
  showSubtitleSelector?: boolean;
  onChangeAudioTrack?: (trackId: number) => void;
  onChangeSubtitleTrack?: (trackId: number) => void;
  onToggleSubtitleSelector?: () => void;
  onCloseSubtitleSelector?: () => void;
  showLogo?: boolean;
  /** URL du poster (affiche avec synopsis en overlay quand en pause) */
  posterUrl?: string | null;
  /** URL du logo du média (TMDB) — affiché à la place du logo Popcorn si fourni. */
  logoUrl?: string | null;
  /** Synopsis du média (affiche avec poster en overlay quand en pause) */
  synopsis?: string | null;
  /** Année de sortie (badge style Media Detail) */
  releaseDate?: string | null;
  /** Numéro de saison en cours (séries) */
  seriesSeasonNum?: number | null;
  /** Numéro d'épisode en cours (séries) */
  seriesEpisodeNum?: number | null;
  onClose?: () => void;
  onRestart?: () => void;
  /** Afficher le bouton « Épisode suivant » (séries) */
  onPlayNextEpisode?: () => void;
  /** Afficher le sélecteur de qualité stream (HLS). */
  showQualitySelector?: boolean;
  /** Qualité actuelle (hauteur en px ou null = auto). */
  streamQuality?: number | null;
  /** Callback changement de qualité. */
  onQualityChange?: (height: number | null) => void;
  /** Progression du téléchargement torrent (0–1) pour afficher les parties déjà téléchargées sur la barre. */
  torrentProgress?: number | null;
  /** Ref pour ouvrir le menu qualité depuis la télécommande (Enter sur le bouton Paramètres). */
  onOpenQualityMenuRef?: { current: (() => void) | null };
  /** Afficher le bouton « Lancer sur Chromecast ». */
  showCastButton?: boolean;
  /** En cours de lecture sur un Chromecast. */
  isCasting?: boolean;
  /** Clic sur le bouton Cast (lancer la lecture sur le Chromecast). */
  onCastClick?: () => void;
  /** Format d'image actuel (contain = bandes noires, cover = plein écran). Affiche le choix dans le menu Paramètres. */
  videoFillMode?: 'contain' | 'cover';

  /** Miniatures scrub : carrousel sous la barre (pas d'aperçu flottant au survol). */
  scrubThumbnails?: ScrubThumbnailsMeta | null;
  /** Miniatures en cours de génération (placeholder animé). */
  scrubThumbnailsLoading?: boolean;
  /**
   * Index de la vignette sélectionnée sur TV (contrôlé par le parent via useTVPlayerNavigation).
   * Si fourni, prend le dessus sur l'état interne. Non défini = mode desktop (état interne).
   */
  tvScrubIndexExternal?: number;
  /** Sur TV : la rangée de vignettes est-elle la zone de focus active ? */
  tvScrubFocused?: boolean;
  seriesEpisodePickerItems?: SeriesEpisodePickerItem[] | null;
  selectedSeriesEpisodeVariantId?: string | null;
  onSelectSeriesEpisode?: (variantId: string) => void;
  bufferedPercent?: number;
}

export function VideoControls({
  torrentName,
  showControls,
  isPlaying,
  currentTime,
  duration,
  isMuted,
  volume,
  isFullscreen,
  isTV = false,
  focusedControlIndex = 0,
  focusedOnProgress = false,
  setFocusedOnProgress,
  progressBarRef,
  hasBackButton = false,
  onPlayPause,
  onSeek,
  onSeekToTime,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onSeekTV,
  onVolumeChangeTV,
  audioTracks = [],
  subtitleTracks = [],
  currentAudioTrack = -1,
  currentSubtitleTrack = -1,
  showSubtitleSelector = false,
  onChangeAudioTrack,
  onChangeSubtitleTrack,
  onToggleSubtitleSelector,
  onCloseSubtitleSelector,
  showLogo = true,
  posterUrl,
  logoUrl,
  synopsis,
  releaseDate,
  seriesSeasonNum,
  seriesEpisodeNum,
  onClose,
  onRestart,
  onPlayNextEpisode,
  showQualitySelector = false,
  streamQuality = null,
  onQualityChange,
  torrentProgress,
  onOpenQualityMenuRef,
  showCastButton = false,
  isCasting = false,
  onCastClick,
  videoFillMode,
  scrubThumbnails = null,
  scrubThumbnailsLoading = false,
  tvScrubIndexExternal,
  tvScrubFocused = false,
  seriesEpisodePickerItems = null,
  selectedSeriesEpisodeVariantId = null,
  onSelectSeriesEpisode,
  bufferedPercent = 0,
}: VideoControlsProps) {
  const { t } = useI18n();
  const effectiveFillMode = videoFillMode ?? 'contain';
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const qualityButtonRef = useRef<HTMLButtonElement>(null);
  const [qualityMenuRect, setQualityMenuRect] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!onOpenQualityMenuRef) return;
    onOpenQualityMenuRef.current = () => setShowQualityMenu(true);
    return () => {
      onOpenQualityMenuRef.current = null;
    };
  }, [onOpenQualityMenuRef]);

  useLayoutEffect(() => {
    if (!showQualityMenu || !qualityButtonRef.current) {
      setQualityMenuRect(null);
      return;
    }
    const rect = qualityButtonRef.current.getBoundingClientRect();
    setQualityMenuRect({ top: rect.top, left: rect.left });
  }, [showQualityMenu]);

  const qualityLabel =
    streamQuality == null || streamQuality === 0
      ? t('playback.qualityAuto')
      : streamQuality === 1080
        ? t('playback.quality1080')
        : streamQuality === 720
          ? t('playback.quality720')
          : streamQuality === 480
            ? t('playback.quality480')
            : streamQuality === 360
              ? t('playback.quality360')
              : `${streamQuality}p`;

  const qualityOptions: { value: number | null; labelKey: string }[] = [
    { value: null, labelKey: 'playback.qualityAuto' },
    { value: 1080, labelKey: 'playback.quality1080' },
    { value: 720, labelKey: 'playback.quality720' },
    { value: 480, labelKey: 'playback.quality480' },
    { value: 360, labelKey: 'playback.quality360' },
  ];
  const volumePercent = volume * 100;
  const isMobile = !isTV && isMobileDevice();

  const scrubEnabled =
    !!scrubThumbnails &&
    !!scrubThumbnails.mediaId &&
    scrubThumbnails.count != null &&
    scrubThumbnails.count > 0;

  const commitSeekToTime = useCallback(
    (seekTime: number) => {
      if (onSeekToTime) {
        onSeekToTime(seekTime);
        return;
      }
      const effectiveDuration = duration > 0 ? duration : (scrubThumbnails?.durationSeconds ?? 0);
      if (!effectiveDuration) return;
      const pct = (seekTime / effectiveDuration) * 100;
      const el = (progressBarRef as any)?.current as HTMLDivElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = rect.left + (rect.width * pct) / 100;
      onSeek({
        currentTarget: el,
        clientX,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    },
    [onSeekToTime, onSeek, duration, scrubThumbnails, progressBarRef],
  );

  const {
    tvScrubIndex,
    setTvScrubIndexInternal,
    getEffectiveDuration,
    getScrubUrlForIndex,
    timeForScrubIndex,
    setScrubFromPointer,
    setScrubFromPercent,
    stepScrubIndex,
    progressPercent,
    isDraggingScrub,
    beginScrubDrag,
    updateScrubDrag,
    commitScrubDrag,
    cancelScrubDrag,
    previewTime,
    dragPreviewPercent,
  } = useScrubNav({
    scrubEnabled,
    scrubThumbnails: scrubThumbnails ?? null,
    duration,
    currentTime,
    isPlaying,
    isTV,
    showControls,
    tvScrubIndexExternal,
    onSeekToTime: commitSeekToTime,
  });

  /** Aperçu vignettes scrub (desktop/mobile) : temps / barre alignés sur la vignette tant qu’on n’a pas rejoint la tête de lecture. */
  const scrubPreviewTimeDesktop =
    scrubEnabled && !isTV && getEffectiveDuration() > 0 ? timeForScrubIndex(tvScrubIndex) : null;
  const scrubPreviewActiveDesktop =
    isDraggingScrub ||
    (scrubPreviewTimeDesktop != null && Math.abs(scrubPreviewTimeDesktop - currentTime) >= 0.75);

  const buttonSize = isTV ? 'w-20 h-20' : isFullscreen ? 'w-[4.5rem] h-[4.5rem] min-w-[4.5rem] min-h-[4.5rem]' : 'w-11 h-11 min-w-11 min-h-11 sm:w-14 sm:h-14 sm:min-w-14 sm:min-h-14 md:w-16 md:h-16 md:min-w-16 md:min-h-16';
  const iconSize = isTV ? 'w-10 h-10' : isFullscreen ? 'w-9 h-9' : 'w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8';
  const progressHeight = isTV ? 'h-3' : isMobile ? 'h-3.5' : isFullscreen ? 'h-3' : 'h-3 sm:h-2.5';
  const textSize = isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-xs sm:text-sm md:text-base';
  const titleSize = isTV ? 'text-4xl' : isFullscreen ? 'text-3xl md:text-4xl' : 'text-lg sm:text-2xl md:text-3xl';
  const padding = isTV ? 'px-10 pt-10 pb-10' : isFullscreen ? 'px-8 pt-8 pb-8 md:px-12 md:pt-10 md:pb-10' : 'px-3 pt-3 pb-3 sm:px-6 sm:pt-6 sm:pb-6 md:px-8 md:pt-8 md:pb-8';
  const gap = isTV ? 'gap-8' : isFullscreen ? 'gap-6' : 'gap-2 sm:gap-4 md:gap-5';

  // Indices de focus : back(0 si hasBack), play, mute, [quality], [cast], fullscreen
  const qualityIndex = hasBackButton ? 3 : 2;
  const castIndex = (showQualitySelector && onQualityChange ? (hasBackButton ? 4 : 3) : (hasBackButton ? 3 : 2));
  const fullscreenIndex = (showCastButton && onCastClick ? castIndex + 1 : castIndex);
  const getFocusClass = (index: number) => {
    // Quand le focus est sur les vignettes, on n'affiche pas le ring sur les boutons.
    if (!isTV || focusedOnProgress || (scrubEnabled && tvScrubIndexExternal != null && tvScrubFocused)) return '';
    if (focusedControlIndex !== index) return '';
    return 'ring-4 ring-purple-500 ring-offset-2 ring-offset-black/55 shadow-[0_0_20px_rgba(168,85,247,0.7)] border-purple-400 bg-purple-600/20 scale-110 z-30 transition-all duration-200';
  };
  const getProgressFocusClass = () => {
    if (!isTV || !focusedOnProgress) return '';
    return 'ring-4 ring-purple-500/80 ring-offset-2 ring-offset-black/55 shadow-[0_0_20px_rgba(168,85,247,0.7)] bg-purple-600/20 transition-all duration-200';
  };

  const showPosterSynopsisPause = !isPlaying && showControls && (posterUrl || synopsis);
  const showPausedChrome = showPosterSynopsisPause;
  /** Sous-titre saison/épisode formaté (ex. « Saison 1 · Épisode 5 ») */
  const seriesSubtitle =
    seriesSeasonNum != null || seriesEpisodeNum != null
      ? [
          seriesSeasonNum != null ? `${t('mediaDetail.season')} ${seriesSeasonNum}` : null,
          seriesEpisodeNum != null ? t('mediaDetail.episodeNumber', { number: seriesEpisodeNum }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const seekToThumbnail =
    scrubEnabled && scrubThumbnails
      ? (idx: number) => {
          setTvScrubIndexInternal(idx);
          commitSeekToTime(timeForScrubIndex(idx));
        }
      : () => {};

  return (
    <>
      <div class={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`} style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 50%, transparent 100%)' }} />
      {/* Assombrissement pause (sous les contrôles z-20) */}
      {showPausedChrome && (
        <div
          class="absolute inset-0 z-[19] pointer-events-none bg-gradient-to-b from-black/45 via-black/55 to-black/75 transition-opacity duration-300"
          aria-hidden="true"
        />
      )}
      <div class={`video-controls-chrome absolute inset-0 flex flex-col justify-between z-20 transition-[opacity,transform] duration-200 ease-out ${showControls || showQualityMenu ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <div class={`flex items-center justify-between ${padding.split(' ')[0]} ${padding.split(' ')[1]}`}>
          <div class="flex items-center gap-3 text-white drop-shadow-2xl min-w-0 flex-1">
            {/* Bouton retour */}
            {onClose && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-[opacity,transform,background-color] duration-200 active:scale-95 backdrop-blur-md border-2 border-white/20 focus:outline-none ${getFocusClass(0)}`}
                title={t('common.back')}
                aria-label={t('common.back')}
              >
                <ArrowLeft class={`${iconSize} text-white`} />
              </button>
            )}
            {torrentName && !showPosterSynopsisPause && (
              <div class="min-w-0">
                <h3 class={`${titleSize} font-semibold tracking-wide truncate`}>{torrentName}</h3>
                {seriesSubtitle && (
                  <p class={`${isTV ? 'text-xl' : isFullscreen ? 'text-base' : 'text-xs sm:text-sm'} text-white/60 font-medium mt-0.5 truncate`}>
                    {seriesSubtitle}
                  </p>
                )}
              </div>
            )}
          </div>
          {showLogo && (
            logoUrl ? (
              <img 
                src={logoUrl} 
                alt="" 
                class={`flex-shrink-0 w-auto object-contain object-center opacity-95 ${
                  isTV
                    ? 'h-24 max-h-24 max-w-[min(92vw,32rem)]'
                    : isFullscreen
                      ? 'h-20 sm:h-24 md:h-28 max-h-28 max-w-[min(92vw,36rem)]'
                      : 'h-14 sm:h-16 md:h-20 lg:h-24 max-h-24 sm:max-h-28 md:max-h-32 max-w-[min(92vw,32rem)]'
                }`}
              />
            ) : (
              <img 
                src="/popcorn_logo.png" 
                alt="Popcorn" 
                class={`flex-shrink-0 ${isTV ? 'w-20 h-20' : isFullscreen ? 'w-16 h-16 md:w-20 md:h-20' : 'w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16'} object-contain opacity-90`}
              />
            )
          )}
        </div>
        {showPosterSynopsisPause && (
          <div class="flex-1 min-h-0 w-full flex flex-col items-start justify-center px-3 sm:px-6 md:px-8 lg:px-12 py-2 overflow-y-auto pointer-events-none">
            <div class="flex flex-col sm:flex-row items-start justify-start gap-4 sm:gap-8 max-w-5xl xl:max-w-6xl">
              {posterUrl && (
                <div class="flex-shrink-0 w-24 h-36 sm:w-40 sm:h-56 md:w-48 md:h-72 lg:w-52 lg:h-[22rem] rounded-lg sm:rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/20 max-h-[30vh] sm:max-h-[min(50vh,22rem)]">
                  <img src={posterUrl} alt="" class="w-full h-full object-cover" />
                </div>
              )}
              <div class="min-w-0 w-full sm:w-auto sm:max-w-md md:max-w-lg lg:max-w-xl flex flex-col gap-2 sm:gap-4 items-start text-left">
                {(torrentName || releaseDate) && (
                  <div class="flex flex-col gap-1">
                    <div class="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4 flex-wrap justify-start">
                      {torrentName && (
                        <h2 class="text-xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight drop-shadow-2xl break-words">
                          {torrentName}
                        </h2>
                      )}
                      {releaseDate && (
                        <span class="inline-flex items-center justify-center px-2 py-1 sm:px-4 sm:py-2 bg-gray-800/90 backdrop-blur-md text-white/95 text-xs sm:text-lg font-semibold rounded-lg border border-white/30 shadow-lg">
                          {new Date(releaseDate).getFullYear()}
                        </span>
                      )}
                    </div>
                    {seriesSubtitle && (
                      <p class="text-sm sm:text-lg md:text-xl text-white/60 font-medium drop-shadow-lg">
                        {seriesSubtitle}
                      </p>
                    )}
                  </div>
                )}
                {synopsis && (
                  <p class="text-white/95 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed line-clamp-3 sm:line-clamp-5 md:line-clamp-6 drop-shadow-lg">
                    {synopsis}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <div class={padding}>
          {/* Rail d'épisodes (overlay pause, style Netflix) */}
          {seriesEpisodePickerItems && seriesEpisodePickerItems.length > 0 && !isPlaying && showControls && (
            <div class="w-full flex flex-col gap-2 mb-6 relative z-30 pointer-events-auto mt-2">
              <h4 class="text-white/70 font-semibold tracking-wide text-xs sm:text-sm uppercase text-left px-1">
                {t('mediaDetail.episodes') || 'Épisodes'}
              </h4>
              <div class="flex gap-4 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-purple-600/50 scrollbar-track-transparent">
                {seriesEpisodePickerItems.map((item) => {
                  const isCurrent = item.variantId === selectedSeriesEpisodeVariantId;
                  return (
                    <button
                      key={item.variantId}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onSelectSeriesEpisode) {
                          onSelectSeriesEpisode(item.variantId);
                        }
                      }}
                      class={`flex-shrink-0 flex flex-col w-32 sm:w-40 md:w-48 rounded-lg overflow-hidden border text-left bg-black/40 hover:bg-black/60 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer pointer-events-auto backdrop-blur-md ${
                        isCurrent ? 'border-purple-600 ring-2 ring-purple-600/40' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div class="relative w-full aspect-video bg-gray-900 overflow-hidden flex-shrink-0">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            class="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div class="w-full h-full flex items-center justify-center bg-purple-950/20">
                            <Play class="w-6 h-6 text-purple-400 opacity-60" />
                          </div>
                        )}
                        {isCurrent && (
                          <div class="absolute inset-0 bg-purple-900/30 flex items-center justify-center">
                            <span class="px-2 py-0.5 rounded bg-purple-600 text-white font-bold text-[8px] sm:text-[10px]">
                              LECTURE EN COURS
                            </span>
                          </div>
                        )}
                      </div>
                      <div class="p-2 flex flex-col min-w-0">
                        <span class="text-white font-medium text-[10px] sm:text-xs truncate">
                          {item.label}
                        </span>
                        {item.sublabel && (
                          <span class="text-white/50 text-[8px] sm:text-[10px] truncate mt-0.5">
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Colonne barre + carrousel de vignettes scrub (style Netflix : preview au drag, seek au relâchement) */}
          <div class={`relative flex flex-col gap-2 mb-4 sm:mb-6 md:mb-8 ${isDraggingScrub ? 'z-30' : ''}`}>
          {/* Aperçu flottant Netflix pendant le drag */}
          {!isTV && isDraggingScrub && dragPreviewPercent != null && (
            <div
              class="pointer-events-none absolute z-40 -translate-x-1/2 bottom-[calc(100%+0.75rem)] flex flex-col items-center gap-1.5"
              style={{ left: `${Math.min(92, Math.max(8, dragPreviewPercent))}%` }}
              aria-hidden
            >
              {scrubEnabled ? (
                <div
                  class={`relative overflow-hidden rounded-lg border-2 border-white shadow-2xl bg-black ${
                    isMobile
                      ? 'w-[42vw] max-w-[11.5rem] aspect-video'
                      : 'w-44 sm:w-52 aspect-video'
                  }`}
                >
                  <ScrubThumbnailImage
                    src={getScrubUrlForIndex(tvScrubIndex)}
                    loading="eager"
                    fetchPriority="high"
                    retryWhileLoading={scrubThumbnailsLoading}
                  />
                </div>
              ) : null}
              <div class="px-2.5 py-1 rounded-md bg-black/90 text-white text-sm sm:text-base font-semibold tabular-nums shadow-lg">
                {formatTime(previewTime)}
              </div>
            </div>
          )}
          <div
            ref={progressBarRef}
            // Sur TV en mode vignettes : la barre ne doit pas être focusable (sinon le focus « part » sur la barre).
            tabIndex={isTV && scrubEnabled ? -1 : 0}
            data-tv-video-progress
            role="slider"
            class={`relative ${progressHeight} bg-white/30 rounded-full cursor-pointer group/progress transition-[opacity,transform] outline-none focus:outline-none touch-manipulation ${
              isDraggingScrub ? 'scale-y-150' : ''
            } ${getProgressFocusClass()}`}
            onClick={(e) => {
              // Seek géré au pointerup (évite double seek + buffer immédiat).
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              if (isTV) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
              } catch (_) {}
              beginScrubDrag(e);
            }}
            onPointerMove={(e) => {
              if (isTV) return;
              if (e.buttons === 1 || isDraggingScrub) {
                e.preventDefault();
                e.stopPropagation();
                updateScrubDrag(e);
              } else if (scrubEnabled) {
                // Survol desktop : prévisualiser la vignette sans seek.
                setScrubFromPointer(e);
              }
            }}
            onPointerUp={(e) => {
              if (isTV) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
              } catch (_) {}
              if (isDraggingScrub) commitScrubDrag(e);
            }}
            onPointerCancel={() => {
              cancelScrubDrag();
            }}
            onLostPointerCapture={() => {
              if (isDraggingScrub) commitScrubDrag();
            }}
            onFocus={() => {
              // TV + scrub : ne jamais laisser le focus DOM sur la barre.
              if (isTV && scrubEnabled) {
                setFocusedOnProgress?.(false);
                (progressBarRef as any)?.current?.blur?.();
                return;
              }
              setFocusedOnProgress?.(true);
              const effectiveDuration = getEffectiveDuration();
              if (effectiveDuration > 0 && scrubEnabled && !isTV) {
                const count = scrubThumbnails!.count;
                // Desktop : initialiser l'index depuis la position courante à l'entrée dans le mode scrub.
                const idx = Math.min(count - 1, Math.max(0, Math.floor((currentTime / effectiveDuration) * count)));
                setTvScrubIndexInternal(idx);
              }
            }}
            onBlur={() => {
              setFocusedOnProgress?.(false);
            }}
            onKeyDown={(e: KeyboardEvent) => {
              // Sur TV avec miniatures scrub, la navigation est gérée au niveau window (useTVPlayerNavigation).
              // Ne jamais intercepter ici, sinon on bloque la navigation du carousel.
              if (isTV && scrubEnabled) return;
              const key = (e as any).key as string;
              const kc = (e as any).keyCode ?? (e as any).which;
              // Certaines TV (webOS) envoient 412/417 au lieu de ArrowLeft/ArrowRight.
              const keyNormalized =
                key ||
                (kc === 412
                  ? 'ArrowLeft'
                  : kc === 417
                    ? 'ArrowRight'
                    : '');
              const effectiveDuration = getEffectiveDuration();
              if (effectiveDuration <= 0) return;

              const isNavKey =
                keyNormalized === 'ArrowLeft' ||
                keyNormalized === 'ArrowRight' ||
                keyNormalized === 'Home' ||
                keyNormalized === 'End' ||
                keyNormalized === 'PageUp' ||
                keyNormalized === 'PageDown';

              // Mode navigation “miniatures” (TV + desktop) : flèches = déplacer le focus, Enter = seek.
              // Sur TV, la navigation vignettes est gérée par useTVPlayerNavigation (pas ce handler).
              if (scrubEnabled && !isTV) {
                const count = scrubThumbnails!.count;

                if (keyNormalized === 'Enter' || keyNormalized === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  const targetTime = timeForScrubIndex(tvScrubIndex);
                  commitSeekToTime(targetTime);
                  return;
                }

                if (!isNavKey) return;

                e.preventDefault();
                e.stopPropagation();

                let nextIdx = tvScrubIndex;
                const step = keyNormalized === 'PageUp' || keyNormalized === 'PageDown' ? 5 : 1;
                if (keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown') nextIdx = Math.max(0, tvScrubIndex - step);
                if (keyNormalized === 'ArrowRight' || keyNormalized === 'PageUp') nextIdx = Math.min(count - 1, tvScrubIndex + step);
                if (keyNormalized === 'Home') nextIdx = 0;
                if (keyNormalized === 'End') nextIdx = count - 1;

                setTvScrubIndexInternal(nextIdx);
                return;
              }

              // Sans miniatures : clavier = seek direct.
              if (!isNavKey) return;
              e.preventDefault();
              e.stopPropagation();
              const step =
                (e as any).shiftKey ? 30 : (key === 'PageUp' || key === 'PageDown' ? 60 : 10);
              let nextTime = currentTime;
              if (keyNormalized === 'ArrowLeft') nextTime = Math.max(0, currentTime - step);
              if (keyNormalized === 'ArrowRight') nextTime = Math.min(effectiveDuration, currentTime + step);
              if (keyNormalized === 'PageDown') nextTime = Math.max(0, currentTime - step);
              if (keyNormalized === 'PageUp') nextTime = Math.min(effectiveDuration, currentTime + step);
              if (keyNormalized === 'Home') nextTime = 0;
              if (keyNormalized === 'End') nextTime = effectiveDuration;
              commitSeekToTime(nextTime);
            }}
            aria-label={t('playback.positionSlider')}
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div class="absolute left-0 top-0 h-full bg-white/20 rounded-full" style={{ width: '100%' }} />
            {/* Barre de mise en mémoire tampon (buffer) */}
            {bufferedPercent !== undefined && bufferedPercent > 0 && (
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-white/40 transition-all duration-300"
                style={{ width: `${Math.min(100, bufferedPercent)}%` }}
                aria-hidden
              />
            )}
            {/* Partie déjà téléchargée par le client torrent : segment visible (couleur assortie au violet) */}
            {torrentProgress != null && torrentProgress > 0 && (
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-cyan-400/80"
                style={{ width: `${Math.min(100, torrentProgress * 100)}%` }}
                title={t('playback.progressBarDownloaded')}
                aria-hidden
              />
            )}
            {/* Barre de progression principale (aperçu scrub TV ou desktop quand la vignette ne correspond pas encore à la tête de lecture) */}
            <div
              class={`absolute left-0 top-0 h-full rounded-full transition-all ${
                (isTV && scrubEnabled && tvScrubIndexExternal != null) || scrubPreviewActiveDesktop
                  ? 'bg-purple-400/80'
                  : 'bg-purple-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
            {/* Marqueur blanc : position réelle de lecture quand l’aperçu scrub diverge */}
            {((isTV && scrubEnabled && tvScrubIndexExternal != null) || scrubPreviewActiveDesktop) &&
              getEffectiveDuration() > 0 && (
              <div
                class="absolute top-0 h-full w-1 bg-white/50 rounded-full"
                style={{ left: `${(currentTime / getEffectiveDuration()) * 100}%` }}
                aria-hidden
              />
            )}
            {/* Curseur de position */}
            <div
              class={`absolute top-1/2 -translate-y-1/2 ${isTV ? 'w-6 h-6' : 'w-4 h-4'} bg-purple-600 rounded-full transition-[opacity,transform] border-2 border-white opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/progress:opacity-100 [@media(hover:hover)]:group-focus-within/progress:opacity-100`}
              style={{ left: `calc(${progressPercent}% - ${progressPercent > 0 && progressPercent < 100 ? (isTV ? '12px' : '8px') : progressPercent === 100 ? (isTV ? '24px' : '16px') : '0px'})` }}
            />
          </div>
          {/* Carrousel de miniatures (module dédié : ./video-controls/) */}
          <ScrubThumbnailsStrip
            scrubEnabled={scrubEnabled}
            scrubThumbnailsLoading={scrubThumbnailsLoading}
            scrubThumbnails={scrubThumbnails}
            showControls={showControls}
            isTV={isTV}
            isFullscreen={isFullscreen}
            isMobile={isMobile}
            tvScrubFocused={tvScrubFocused}
            tvScrubIndex={tvScrubIndex}
            getScrubUrlForIndex={getScrubUrlForIndex}
            timeForScrubIndex={timeForScrubIndex}
            seekToThumbnail={seekToThumbnail}
            stepScrubIndex={stepScrubIndex}
            seekToPositionLabel={(time) => t('playback.seekToPosition', { time })}
            previousThumbnailLabel={t('playback.scrubPreviousThumbnail')}
            nextThumbnailLabel={t('playback.scrubNextThumbnail')}
          />
          </div>
          <div class={`flex items-center ${gap} relative z-30 overflow-x-auto min-w-0 scrollbar-visible`} data-tv-video-controls-row>
            <button 
              onClick={(e) => { 
                e.preventDefault();
                e.stopPropagation();
                onPlayPause(); 
              }} 
              class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none relative z-40 ${getFocusClass(hasBackButton ? 1 : 0)}`}
            >
              {isPlaying ? <Pause class={`${iconSize} text-white`} /> : <Play class={`${iconSize} text-white ml-0.5`} />}
            </button>
            {/* Bouton redémarrer depuis le début */}
            {onRestart && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRestart();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none`}
                title={t('playback.restartFromBeginning')}
                aria-label={t('playback.restartFromBeginning')}
              >
                <RotateCcw class={`${iconSize} text-white`} />
              </button>
            )}
            {/* Bouton épisode suivant (séries) */}
            {onPlayNextEpisode && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayNextEpisode();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none`}
                title={t('playback.nextEpisode')}
                aria-label={t('playback.nextEpisode')}
              >
                <SkipForward class={`${iconSize} text-white`} />
              </button>
            )}
            <div class="flex items-center gap-2 group/volume flex-shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMute(); }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${getFocusClass(hasBackButton ? 2 : 1)}`}
              >
                {isMuted || volume === 0 ? <VolumeX class={`${iconSize} text-white`} /> : volume < 0.5 ? <Volume1 class={`${iconSize} text-white`} /> : <Volume2 class={`${iconSize} text-white`} />}
              </button>
              {!isTV && (
                <div
                  class="flex items-center w-20 sm:w-24 h-3 sm:h-2 bg-white/30 rounded-full cursor-pointer opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/volume:opacity-100 [@media(hover:hover)]:group-focus-within/volume:opacity-100 transition-opacity"
                  onClick={onVolumeChange}
                  role="slider"
                  aria-label={t('playback.volumeLabel') || 'Volume'}
                  aria-valuenow={Math.round(volumePercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div class="h-full bg-white rounded-full" style={{ width: `${volumePercent}%` }} />
                </div>
              )}
              {isTV && (
                <div class="flex items-center w-40 h-2.5 bg-white/30 rounded-full">
                  <div class="h-full bg-white rounded-full" style={{ width: `${volumePercent}%` }} />
                </div>
              )}
            </div>
            <div class={`flex items-center gap-2 text-white ${textSize} font-medium flex-shrink-0`}>
              <span>{formatTime(isDraggingScrub || scrubPreviewActiveDesktop ? previewTime : currentTime)}</span>
              <span class="text-white/50">/</span>
              <span class="text-white/70">{formatTime(duration > 0 ? duration : (scrubThumbnails?.durationSeconds ?? 0))}</span>
            </div>
            <div class="flex-1 min-w-2" />
            {(audioTracks.length > 0 || subtitleTracks.length > 0) && onToggleSubtitleSelector && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtitleSelector();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${
                  currentSubtitleTrack !== -1 ? 'bg-red-600/30 border-red-500/50' : ''
                }`}
                title="Langues et sous-titres"
              >
                <Subtitles class={`${iconSize} text-white`} />
              </button>
            )}
            {showCastButton && onCastClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCastClick();
                }}
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${getFocusClass(castIndex)} ${isCasting ? 'bg-purple-600/40 border-purple-400/50' : ''}`}
                title={isCasting ? t('playback.casting') : t('playback.castToDevice')}
                aria-label={isCasting ? t('playback.casting') : t('playback.castToDevice')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" class={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                  <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                  <line x1="2" y1="20" x2="2.01" y2="20" />
                </svg>
              </button>
            )}
            {((showQualitySelector && onQualityChange) || videoFillMode !== undefined) && (
              <div class="relative flex-shrink-0 z-40">
                <button
                  ref={qualityButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowQualityMenu((v) => !v);
                  }}
                  class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none min-w-[3rem] touch-manipulation ${getFocusClass(qualityIndex)}`}
                  title={t('playback.quality')}
                  aria-label={t('playback.quality')}
                  aria-expanded={showQualityMenu}
                  aria-haspopup="true"
                >
                  <Settings class={`${iconSize} text-white shrink-0`} />
                </button>
                {showQualityMenu && qualityMenuRect && typeof document !== 'undefined' &&
                  createPortal(
                    <>
                      <div
                        class="fixed inset-0 z-[9998]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowQualityMenu(false);
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowQualityMenu(false);
                        }}
                        aria-hidden="true"
                      />
                      <div
                        class="fixed z-[9999] py-2 rounded-lg bg-black/95 border border-white/20 shadow-xl min-w-[8rem]"
                        role="menu"
                        style={{
                          bottom: `${window.innerHeight - qualityMenuRect.top + 8}px`,
                          left: `${qualityMenuRect.left}px`,
                        }}
                      >
                        {showQualitySelector && onQualityChange && (
                          <>
                            <div class="px-3 py-1.5 text-white/70 text-xs font-medium border-b border-white/10">
                              {t('playback.quality')}
                            </div>
                            {qualityOptions.map((opt) => (
                              <button
                                key={opt.value ?? 'auto'}
                                type="button"
                                role="menuitem"
                                class={`w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors ${
                                  (opt.value === streamQuality) || (opt.value == null && streamQuality == null) ? 'bg-white/15 font-medium' : ''
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQualityChange(opt.value);
                                  setShowQualityMenu(false);
                                }}
                              >
                                {t(opt.labelKey as 'playback.qualityAuto')}
                              </button>
                            ))}
                          </>
                        )}
                        {videoFillMode !== undefined && (
                          <>
                            <div class={`px-3 py-1.5 text-white/70 text-xs font-medium border-b border-white/10 ${showQualitySelector && onQualityChange ? 'mt-1' : ''}`}>
                              {t('interfaceSettings.videoFillMode')}
                            </div>
                            <button
                              type="button"
                              role="menuitem"
                              class={`w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors ${effectiveFillMode === 'contain' ? 'bg-white/15 font-medium' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                persistVideoFillMode('contain');
                                setShowQualityMenu(false);
                              }}
                            >
                              {t('interfaceSettings.videoFillModeContain')}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              class={`w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors ${effectiveFillMode === 'cover' ? 'bg-white/15 font-medium' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                persistVideoFillMode('cover');
                                setShowQualityMenu(false);
                              }}
                            >
                              {t('interfaceSettings.videoFillModeCover')}
                            </button>
                          </>
                        )}
                      </div>
                    </>,
                    document.body
                  )}
              </div>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullscreen();
              }} 
              class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${getFocusClass(fullscreenIndex)}`}
            >
              {isFullscreen ? <Minimize class={`${iconSize} text-white`} /> : <Maximize class={`${iconSize} text-white`} />}
            </button>
          </div>
        </div>
      </div>
      {showSubtitleSelector && (
        <SubtitleSelector
          audioTracks={audioTracks}
          subtitleTracks={subtitleTracks}
          currentAudioTrack={currentAudioTrack}
          currentSubtitleTrack={currentSubtitleTrack}
          showSubtitleSelector={showSubtitleSelector}
          onChangeAudioTrack={onChangeAudioTrack || (() => {})}
          onChangeSubtitleTrack={onChangeSubtitleTrack || (() => {})}
          onClose={onCloseSubtitleSelector || (() => {})}
          isTV={isTV}
          isFullscreen={isFullscreen}
        />
      )}
    </>
  );
}
