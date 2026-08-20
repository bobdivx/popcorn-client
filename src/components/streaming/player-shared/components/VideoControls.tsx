import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Subtitles, ArrowLeft, RotateCcw, SkipForward, SkipBack, Settings } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { formatTime } from '../utils/formatTime';
import { isMobileDevice } from '../../../../lib/utils/device-detection';
import { SubtitleSelector } from './SubtitleSelector';
import type { ScrubThumbnailsMeta } from '../types/scrubThumbnails';
import { useScrubNav } from './video-controls/useScrubNav';
import { ScrubThumbnailsStrip } from './video-controls/ScrubThumbnailsStrip';
import { ScrubThumbnailImage } from './video-controls/ScrubThumbnailImage';
import { persistVideoFillMode } from '../hooks/usePlayerConfig';

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
  /** Sur TV : l’utilisateur parcourt la timeline (flèches) — afficher le carrousel. */
  tvScrubBrowsing?: boolean;
  /** Réafficher les commandes (flèches avec chrome masqué). */
  onRevealControls?: () => void;
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
  tvScrubBrowsing = false,
  onRevealControls,
  bufferedPercent = 0,
}: VideoControlsProps) {
  const { t } = useI18n();
  const effectiveFillMode = videoFillMode ?? 'contain';
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isHoveringTimeline, setIsHoveringTimeline] = useState(false);
  const qualityButtonRef = useRef<HTMLButtonElement>(null);
  const [qualityMenuRect, setQualityMenuRect] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!showControls) {
      setIsHoveringTimeline(false);
      (progressBarRef as { current?: HTMLElement | null } | undefined)?.current?.blur?.();
    }
  }, [showControls, progressBarRef]);

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
    playheadPercent,
    isDraggingScrub,
    beginScrubDrag,
    updateScrubDrag,
    commitScrubDrag,
    cancelScrubDrag,
    previewTime,
    dragPreviewPercent,
    isBrowsingScrub,
    resetScrubToPlayhead,
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
    onRevealControls,
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
  const padding = isTV
    ? 'px-10 pt-10 pb-10'
    : isFullscreen
      ? 'px-8 pt-8 pb-8 md:px-12 md:pt-10 md:pb-10'
      : isMobile
        ? 'px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
        : 'px-3 pt-3 pb-3 sm:px-6 sm:pt-6 sm:pb-6 md:px-8 md:pt-8 md:pb-8';
  const gap = isTV ? 'gap-8' : isFullscreen ? 'gap-6' : isMobile ? 'gap-1.5' : 'gap-2 sm:gap-4 md:gap-5';

  // Indices de focus : back(0 si hasBack), play, [mute si !TV], [quality], [cast], fullscreen
  const playIndex = hasBackButton ? 1 : 0;
  const muteIndex = isTV ? -1 : playIndex + 1;
  const afterPlay = isTV ? playIndex + 1 : muteIndex + 1;
  const qualityIndex = afterPlay;
  const castIndex =
    showQualitySelector && onQualityChange ? afterPlay + 1 : afterPlay;
  const fullscreenIndex =
    showCastButton && onCastClick ? castIndex + 1 : castIndex;
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

  const chromeVisible = showControls || showQualityMenu;
  /** TV : le carrousel fait partie des commandes (comme le survol timeline sur PC). */
  const showScrubStrip =
    (isTV && chromeVisible && scrubEnabled) ||
    (!isTV && (isDraggingScrub || isHoveringTimeline || isBrowsingScrub));

  return (
    <>
      {/* Gradient : sur TV, display:none (opacity-0 est peu fiable sur webOS WebKit). */}
      {(chromeVisible || !isTV) && (
        <div
          class={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${chromeVisible ? 'opacity-100' : 'opacity-0'}`}
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 50%, transparent 100%)',
            ...(isTV && !chromeVisible ? { display: 'none' } : null),
          }}
          aria-hidden={!chromeVisible}
        />
      )}
      {/* Assombrissement pause (sous les contrôles z-20) */}
      {showPausedChrome && (
        <div
          class="absolute inset-0 z-[19] pointer-events-none bg-gradient-to-b from-black/45 via-black/55 to-black/75 transition-opacity duration-300"
          aria-hidden="true"
        />
      )}
      {/*
        Chrome commandes :
        - TV/webOS : ne pas rendre si masqué (opacity-0 laisse souvent les boutons visibles).
        - Desktop/mobile : transition opacity.
      */}
      {(chromeVisible || !isTV) && (
      <div
        class={`video-controls-chrome absolute inset-0 flex flex-col overflow-hidden z-40 text-white ${
          chromeVisible
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
        style={isTV && !chromeVisible ? { display: 'none', visibility: 'hidden' } : undefined}
        aria-hidden={!chromeVisible}
      >
        <div class={`flex shrink-0 items-center justify-between ${padding.split(' ')[0]} ${padding.split(' ')[1]}`}>
          <div class="flex items-center gap-3 text-white drop-shadow-2xl min-w-0 flex-1">
            {/* Bouton retour */}
            {onClose && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-[opacity,transform,background-color] duration-200 active:scale-95 backdrop-blur-md border-2 border-white/60 focus:outline-none ${getFocusClass(0)}`}
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
            {showLogo && !showPosterSynopsisPause && (
            logoUrl ? (
              <img 
                src={logoUrl} 
                alt="" 
                class={`flex-shrink-0 w-auto object-contain object-center opacity-95 ${
                  isTV
                    ? 'h-24 max-h-24 max-w-[min(92vw,32rem)]'
                    : isFullscreen
                      ? 'h-20 sm:h-24 md:h-28 max-h-28 max-w-[min(92vw,36rem)]'
                      : 'h-8 sm:h-16 md:h-20 lg:h-24 max-h-24 sm:max-h-28 md:max-h-32 max-w-[min(40vw,32rem)]'
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
          <div class="flex-1 min-h-0 max-h-[22%] sm:max-h-[32%] w-full flex flex-col items-start justify-center px-3 sm:px-6 md:px-8 lg:px-12 py-1 overflow-hidden pointer-events-none">
            <div class="flex flex-row items-start justify-start gap-3 sm:gap-8 max-w-5xl xl:max-w-6xl min-h-0">
              {posterUrl && (
                <div class="flex-shrink-0 w-14 h-[5.25rem] sm:w-40 sm:h-56 md:w-48 md:h-72 lg:w-52 lg:h-[22rem] rounded-lg sm:rounded-xl overflow-hidden shadow-2xl ring-1 sm:ring-2 ring-white/20 max-h-[18vh] sm:max-h-[min(50vh,22rem)]">
                  <img src={posterUrl} alt="" class="w-full h-full object-cover" />
                </div>
              )}
              <div class="min-w-0 flex-1 sm:w-auto sm:max-w-md md:max-w-lg lg:max-w-xl flex flex-col gap-1 sm:gap-4 items-start text-left">
                {(torrentName || releaseDate) && (
                  <div class="flex flex-col gap-1">
                    <div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 flex-wrap justify-start">
                      {torrentName && (
                        <h2 class="text-base sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight drop-shadow-2xl break-words line-clamp-2">
                          {torrentName}
                        </h2>
                      )}
                      {releaseDate && (
                        <span class="hidden sm:inline-flex items-center justify-center px-2 py-1 sm:px-4 sm:py-2 bg-gray-800/90 backdrop-blur-md text-white/95 text-xs sm:text-lg font-semibold rounded-lg border border-white/30 shadow-lg">
                          {new Date(releaseDate).getFullYear()}
                        </span>
                      )}
                    </div>
                    {seriesSubtitle && (
                      <p class="text-xs sm:text-lg md:text-xl text-white/60 font-medium drop-shadow-lg">
                        {seriesSubtitle}
                      </p>
                    )}
                  </div>
                )}
                {synopsis && (
                  <p class="hidden sm:block text-white/95 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed line-clamp-3 sm:line-clamp-5 md:line-clamp-6 drop-shadow-lg">
                    {synopsis}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <div class={`mt-auto shrink-0 flex flex-col gap-2 ${padding}`}>
          {/* Colonne barre + carrousel (visible seulement pendant un avance/recul) */}
          <div
            class={`relative flex min-h-0 flex-col gap-2 ${isDraggingScrub || showScrubStrip ? 'z-30' : ''}`}
            onPointerEnter={(e: any) => {
              if (isTV || isMobile || e.pointerType === 'touch') return;
              setIsHoveringTimeline(true);
            }}
            onPointerLeave={(e: any) => {
              if (e.pointerType === 'touch') return;
              setIsHoveringTimeline(false);
              if (!isDraggingScrub && !isBrowsingScrub) resetScrubToPlayhead();
            }}
          >
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
                      ? 'w-[28vw] max-w-[7.5rem] aspect-video'
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
              if (!showControls) return;
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
            {/* Curseur de position (tête de lecture) — glass, suit toujours currentTime */}
            <div
              class={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${isTV ? 'w-6 h-6' : 'w-4 h-4'} rounded-full transition-[opacity,transform] opacity-100 can-hover:opacity-0 can-hover:group-hover/progress:opacity-100 can-hover:group-focus-within/progress:opacity-100 bg-white/25 backdrop-blur-md border border-white/55 shadow-[0_0_12px_rgba(168,85,247,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-purple-400/40`}
              style={{ left: `${playheadPercent}%` }}
              aria-hidden
            />
          </div>
          {/* Carrousel de miniatures (module dédié : ./video-controls/) */}
          <ScrubThumbnailsStrip
            scrubEnabled={scrubEnabled}
            scrubThumbnailsLoading={scrubThumbnailsLoading}
            scrubThumbnails={scrubThumbnails}
            showControls={showControls && showScrubStrip}
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
          <div class={`flex items-center ${gap} relative z-30 min-w-0 shrink-0 rounded-2xl bg-black/50 px-2 py-1.5 ring-1 ring-white/25 ${isMobile ? 'overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`} data-tv-video-controls-row>
            {isTV ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSeekTV?.('left', 10);
                  }}
                  class={`flex flex-col items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white backdrop-blur-md border-2 border-white/60 focus:outline-none ${getFocusClass(tvSkipBackIndex)}`}
                  title={t('playback.skipBack10')}
                  aria-label={t('playback.skipBack10')}
                >
                  <SkipBack class={`${iconSize} text-white`} />
                  <span class="text-xs font-bold text-white/90 -mt-0.5">10</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPlayPause();
                  }}
                  class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white backdrop-blur-md border-2 border-white/60 focus:outline-none relative z-40 ${getFocusClass(playIndex)}`}
                  title={isPlaying ? t('playback.pauseLabel') : t('playback.playLabel')}
                  aria-label={isPlaying ? t('playback.pauseLabel') : t('playback.playLabel')}
                >
                  {isPlaying ? <Pause class={`${iconSize} text-white`} /> : <Play class={`${iconSize} text-white ml-0.5`} />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSeekTV?.('right', 10);
                  }}
                  class={`flex flex-col items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white backdrop-blur-md border-2 border-white/60 focus:outline-none ${getFocusClass(tvSkipFwdIndex)}`}
                  title={t('playback.skipForward10')}
                  aria-label={t('playback.skipForward10')}
                >
                  <SkipForward class={`${iconSize} text-white`} />
                  <span class="text-xs font-bold text-white/90 -mt-0.5">10</span>
                </button>
                <div class={`flex items-center gap-2 text-white ${textSize} font-medium flex-shrink-0`}>
                  <span>{formatTime(currentTime)}</span>
                  <span class="text-white/50">/</span>
                  <span class="text-white/70">{formatTime(duration > 0 ? duration : (scrubThumbnails?.durationSeconds ?? 0))}</span>
                </div>
                <div class="flex-1 min-w-2" />
                {(audioTracks.length > 0 || subtitleTracks.length > 0) && onToggleSubtitleSelector && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubtitleSelector();
                    }}
                    class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white border-2 border-white/60 focus:outline-none ${getFocusClass(tvSubsIndex)} ${
                      currentSubtitleTrack !== -1 ? 'bg-red-600/30 border-red-500/50' : ''
                    }`}
                    title={t('playback.audioAndSubtitles')}
                    aria-label={t('playback.audioAndSubtitles')}
                  >
                    <Subtitles class={`${iconSize} text-white`} />
                  </button>
                )}
              </>
            ) : (
            <>
            <button 
              onClick={(e) => { 
                e.preventDefault();
                e.stopPropagation();
                onPlayPause(); 
              }} 
              class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all backdrop-blur-md border-2 border-white/60 focus:outline-none relative z-40 ${getFocusClass(playIndex)}`}
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
                class={`hidden sm:flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all backdrop-blur-md border-2 border-white/60 focus:outline-none`}
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
                class={`hidden sm:flex items-center justify-center flex-shrink-0 gap-1.5 sm:gap-2 ${buttonSize} sm:!w-auto sm:!h-auto sm:!min-w-0 sm:px-3.5 sm:py-2.5 md:px-4 rounded-full bg-white/35 hover:bg-white/55 text-white transition-all backdrop-blur-md border-2 border-white/60 focus:outline-none`}
                title={t('playback.nextEpisode')}
                aria-label={t('playback.nextEpisode')}
              >
                <SkipForward class={`${iconSize} text-white`} />
                <span class={`hidden sm:inline text-white font-medium ${textSize} whitespace-nowrap`}>
                  {t('playback.nextEpisode')}
                </span>
              </button>
            )}
            {/* Volume : inutile sur TV (télécommande / OS gère le volume système). */}
            {!isTV && (
            <div class="flex items-center gap-2 group/volume flex-shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMute(); }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all border-2 border-white/60 focus:outline-none ${getFocusClass(muteIndex)}`}
              >
                {isMuted || volume === 0 ? <VolumeX class={`${iconSize} text-white`} /> : volume < 0.5 ? <Volume1 class={`${iconSize} text-white`} /> : <Volume2 class={`${iconSize} text-white`} />}
              </button>
              <div
                class="hidden sm:flex items-center w-20 sm:w-24 h-3 sm:h-2 bg-white/30 rounded-full cursor-pointer opacity-100 can-hover:opacity-0 can-hover:group-hover/volume:opacity-100 can-hover:group-focus-within/volume:opacity-100 transition-opacity"
                onClick={onVolumeChange}
                role="slider"
                aria-label={t('playback.volumeLabel') || 'Volume'}
                aria-valuenow={Math.round(volumePercent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div class="h-full bg-white rounded-full" style={{ width: `${volumePercent}%` }} />
              </div>
            </div>
            )}
            <div class={`flex items-center gap-1 sm:gap-2 text-white ${textSize} font-medium flex-shrink-0 tabular-nums`}>
              <span>{formatTime(isDraggingScrub || scrubPreviewActiveDesktop ? previewTime : currentTime)}</span>
              <span class="hidden sm:inline text-white/50">/</span>
              <span class="hidden sm:inline text-white/70">{formatTime(duration > 0 ? duration : (scrubThumbnails?.durationSeconds ?? 0))}</span>
            </div>
            <div class="flex-1 min-w-2" />
            {(audioTracks.length > 0 || subtitleTracks.length > 0) && onToggleSubtitleSelector && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtitleSelector();
                }} 
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all border-2 border-white/60 focus:outline-none ${
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
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all border-2 border-white/60 focus:outline-none ${getFocusClass(castIndex)} ${isCasting ? 'bg-purple-600/40 border-purple-400/50' : ''}`}
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
                  class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all border-2 border-white/60 focus:outline-none min-w-[3rem] touch-manipulation ${getFocusClass(qualityIndex)}`}
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
              class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/35 hover:bg-white/55 text-white transition-all border-2 border-white/60 focus:outline-none ${getFocusClass(fullscreenIndex)}`}
            >
              {isFullscreen ? <Minimize class={`${iconSize} text-white`} /> : <Maximize class={`${iconSize} text-white`} />}
            </button>
            </>
            )}
          </div>
        </div>
      </div>
      )}
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
