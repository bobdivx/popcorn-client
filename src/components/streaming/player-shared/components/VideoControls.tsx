import { useState, useEffect, useRef, useLayoutEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Subtitles, ArrowLeft, RotateCcw, SkipForward, Settings } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { serverApi } from '../../../../lib/client/server-api';
import { formatTime } from '../utils/formatTime';
import { SubtitleSelector } from './SubtitleSelector';
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

  /** Miniatures scrub (type Netflix) — si défini, affiche une vignette au survol de la barre. */
  scrubThumbnails?: { mediaId: string; count: number; durationSeconds?: number; intervalSeconds?: number } | null;
  /**
   * Index de la vignette sélectionnée sur TV (contrôlé par le parent via useTVPlayerNavigation).
   * Si fourni, prend le dessus sur l'état interne. Non défini = mode desktop (état interne).
   */
  tvScrubIndexExternal?: number;
  /** Sur TV : la rangée de vignettes est-elle la zone de focus active ? */
  tvScrubFocused?: boolean;
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
  tvScrubIndexExternal,
  tvScrubFocused = false,
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

  const [scrubHover, setScrubHover] = useState<{
    percent: number;
    time: number;
    url: string;
  } | null>(null);
  const [scrubActive, setScrubActive] = useState(false);
  const scrubHideTimeoutRef = useRef<number | null>(null);

  const scrubEnabled =
    !!scrubThumbnails &&
    !!scrubThumbnails.mediaId &&
    scrubThumbnails.count != null &&
    scrubThumbnails.count > 0;

  const scrubBaseUrl = scrubEnabled
    ? `${serverApi.getServerUrl()}/api/library/scrub-thumbnails/${encodeURIComponent(scrubThumbnails!.mediaId)}`
    : null;

  const getEffectiveDuration = () =>
    duration > 0 ? duration : (scrubThumbnails?.durationSeconds ?? 0);

  const getScrubUrlForIndex = (idx: number) => {
    if (!scrubEnabled || !scrubBaseUrl) return '';
    const count = scrubThumbnails!.count;
    const safe = Math.min(count - 1, Math.max(0, Math.floor(idx)));
    return `${scrubBaseUrl}/${safe}`;
  };

  const timeForScrubIndex = (idx: number) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || effectiveDuration <= 0) return 0;
    const count = scrubThumbnails!.count;
    const safe = Math.min(count - 1, Math.max(0, Math.floor(idx)));
    const interval = scrubThumbnails?.intervalSeconds;
    // Si le backend a généré une image toutes les N secondes, afficher exactement idx*N.
    if (interval != null && Number.isFinite(interval) && interval > 0) {
      return Math.min(effectiveDuration, safe * interval);
    }
    // Fallback (ancien mode): centre de la “cellule” pour éviter les bords (0s / fin).
    return ((safe + 0.5) / count) * effectiveDuration;
  };

  // Index interne (desktop) : navigation par survol/clic/clavier sur la barre.
  const [tvScrubIndexInternal, setTvScrubIndexInternal] = useState<number>(0);
  // Sur TV, l'index est piloté par useTVPlayerNavigation (via tvScrubIndexExternal).
  // Sur desktop, on utilise l'état interne.
  const tvScrubIndex = isTV && tvScrubIndexExternal != null ? tvScrubIndexExternal : tvScrubIndexInternal;
  const setTvScrubIndex = setTvScrubIndexInternal;

  // Desktop (Chrome) : permettre la navigation clavier des vignettes sans dépendre du focus DOM sur la barre.
  // Sur TV, c'est géré par useTVPlayerNavigation.
  useEffect(() => {
    if (isTV) return;
    if (!showControls || !scrubEnabled) return;
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const kc = (e as any).keyCode ?? (e as any).which;
      const key = (e as any).key as string;
      const keyNormalized =
        key ||
        (kc === 37
          ? 'ArrowLeft'
          : kc === 39
            ? 'ArrowRight'
            : kc === 36
              ? 'Home'
              : kc === 35
                ? 'End'
                : kc === 33
                  ? 'PageUp'
                  : kc === 34
                    ? 'PageDown'
                    : kc === 13
                      ? 'Enter'
                      : kc === 32
                        ? ' '
                        : '');

      const isNavKey =
        keyNormalized === 'ArrowLeft' ||
        keyNormalized === 'ArrowRight' ||
        keyNormalized === 'Home' ||
        keyNormalized === 'End' ||
        keyNormalized === 'PageUp' ||
        keyNormalized === 'PageDown';

      if (keyNormalized === 'Enter' || keyNormalized === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const targetTime = timeForScrubIndex(tvScrubIndexInternal);
        onSeekToTime?.(targetTime);
        return;
      }

      if (!isNavKey) return;
      e.preventDefault();
      e.stopPropagation();
      const count = scrubThumbnails!.count;
      setTvScrubIndexInternal((prev) => {
        let nextIdx = prev;
        const step = keyNormalized === 'PageUp' || keyNormalized === 'PageDown' ? 5 : 1;
        if (keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown') nextIdx = Math.max(0, prev - step);
        if (keyNormalized === 'ArrowRight' || keyNormalized === 'PageUp') nextIdx = Math.min(count - 1, prev + step);
        if (keyNormalized === 'Home') nextIdx = 0;
        if (keyNormalized === 'End') nextIdx = count - 1;
        return nextIdx;
      });
    };
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [isTV, showControls, scrubEnabled, scrubThumbnails?.count, onSeekToTime, tvScrubIndexInternal]);

  // Desktop : valider automatiquement la position après 2s sur une vignette (debounce),
  // uniquement quand les contrôles sont visibles et que scrub est actif.
  useEffect(() => {
    if (isTV) return;
    if (!showControls || !scrubEnabled) return;
    if (!onSeekToTime) return;
    const id = window.setTimeout(() => {
      const targetTime = timeForScrubIndex(tvScrubIndexInternal);
      onSeekToTime(targetTime);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [isTV, showControls, scrubEnabled, onSeekToTime, tvScrubIndexInternal]);

  // Sur TV en mode vignettes : la barre de progression reflète la vignette sélectionnée (pas currentTime).
  // Cela synchronise visuellement la barre et le carousel — le curseur indique où on se trouvera après Enter.
  const effectiveDurationForProgress = getEffectiveDuration();
  const progressPercent = (() => {
    if (isTV && scrubEnabled && tvScrubIndexExternal != null && effectiveDurationForProgress > 0) {
      const scrubTime = timeForScrubIndex(tvScrubIndex);
      return (scrubTime / effectiveDurationForProgress) * 100;
    }
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  })();

  const setScrubFromPercent = (percent: number, forceActive = false) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || !scrubBaseUrl || effectiveDuration <= 0) return;
    const p = Math.min(100, Math.max(0, percent));
    const t = (p / 100) * effectiveDuration;
    const count = scrubThumbnails!.count;
    const idx = Math.min(count - 1, Math.max(0, Math.floor((t / effectiveDuration) * count)));
    const url = getScrubUrlForIndex(idx);
    setScrubHover({ percent: p, time: t, url });
    if (forceActive) setScrubActive(true);
  };

  const setScrubFromPointer = (e: any, forceActive = false) => {
    const effectiveDuration = getEffectiveDuration();
    if (!scrubEnabled || !scrubBaseUrl || effectiveDuration <= 0) return;
    const el = e.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    const percent = rect.width > 0 ? (x / rect.width) * 100 : 0;
    setScrubFromPercent(percent, forceActive);
  };

  const scheduleScrubHide = (delayMs: number) => {
    if (scrubHideTimeoutRef.current != null) {
      window.clearTimeout(scrubHideTimeoutRef.current);
      scrubHideTimeoutRef.current = null;
    }
    scrubHideTimeoutRef.current = window.setTimeout(() => {
      setScrubActive(false);
      setScrubHover(null);
    }, delayMs) as unknown as number;
  };

  useEffect(() => {
    return () => {
      if (scrubHideTimeoutRef.current != null) {
        window.clearTimeout(scrubHideTimeoutRef.current);
        scrubHideTimeoutRef.current = null;
      }
    };
  }, []);

  const buttonSize = isTV ? 'w-20 h-20' : isFullscreen ? 'w-[4.5rem] h-[4.5rem] min-w-[4.5rem] min-h-[4.5rem]' : 'w-11 h-11 min-w-11 min-h-11 sm:w-14 sm:h-14 sm:min-w-14 sm:min-h-14 md:w-16 md:h-16 md:min-w-16 md:min-h-16';
  const iconSize = isTV ? 'w-10 h-10' : isFullscreen ? 'w-9 h-9' : 'w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8';
  const progressHeight = isTV ? 'h-3' : isFullscreen ? 'h-2.5' : 'h-2';
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
    return 'ring-4 ring-purple-600 ring-opacity-75 scale-110 z-30';
  };
  const getProgressFocusClass = () => {
    if (!isTV || !focusedOnProgress) return '';
    return 'ring-2 ring-purple-600 ring-opacity-90 ring-inset';
  };

  const showPausedOverlay = !isPlaying && showControls && (posterUrl || synopsis);

  return (
    <>
      <div class={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`} style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 50%, transparent 100%)' }} />
      {/* Overlay pause : poster + synopsis à gauche (style Media Detail) */}
      {showPausedOverlay && (
        <div class="absolute inset-0 flex flex-col justify-end z-15 pointer-events-none">
          <div class="w-full h-full bg-gradient-to-r from-black via-black/90 to-transparent pointer-events-none" aria-hidden="true" />
          {/* Padding bas important pour que synopsis + poster restent au-dessus de la barre de progression et des boutons (pas de chevauchement) */}
          <div class="absolute inset-0 flex flex-col justify-end px-3 sm:px-6 md:px-10 lg:px-16 pb-40 sm:pb-28 md:pb-32 lg:pb-36 xl:pb-44">
            <div class="max-w-5xl xl:max-w-6xl flex flex-col sm:flex-row items-start gap-3 sm:gap-6 md:gap-8 w-full">
              {posterUrl && (
                <div class="flex-shrink-0 w-20 h-28 sm:w-40 sm:h-56 md:w-48 md:h-72 lg:w-56 lg:h-80 xl:w-64 xl:h-96 rounded-lg sm:rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/20 max-h-[25vh] sm:max-h-none">
                  <img src={posterUrl} alt="" class="w-full h-full object-cover" />
                </div>
              )}
              <div class="flex-1 min-w-0 flex flex-col gap-2 sm:gap-4">
                {(torrentName || releaseDate) && (
                  <div class="flex items-baseline gap-2 sm:gap-4 flex-wrap">
                    {torrentName && (
                      <h2 class="text-lg sm:text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight drop-shadow-2xl">
                        {torrentName}
                      </h2>
                    )}
                    {releaseDate && (
                      <span class="inline-flex items-center justify-center px-2 py-1 sm:px-4 sm:py-2 bg-gray-800/90 backdrop-blur-md text-white/95 text-xs sm:text-lg font-semibold rounded-lg border border-white/30 shadow-lg">
                        {new Date(releaseDate).getFullYear()}
                      </span>
                    )}
                  </div>
                )}
                {synopsis && (
                  <p class="text-white/95 text-xs sm:text-base md:text-xl lg:text-2xl leading-relaxed line-clamp-2 sm:line-clamp-4 md:line-clamp-6 drop-shadow-lg max-w-2xl">
                    {synopsis}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div class={`absolute inset-0 flex flex-col justify-between transition-all duration-300 z-20 ${showControls || showQualityMenu ? 'opacity-100' : 'opacity-0'} ${showControls || showQualityMenu ? 'pointer-events-auto' : 'pointer-events-none'}`}>
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
                class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none ${getFocusClass(0)}`}
                title={t('common.back')}
                aria-label={t('common.back')}
              >
                <ArrowLeft class={`${iconSize} text-white`} />
              </button>
            )}
            {torrentName && <h3 class={`${titleSize} font-semibold tracking-wide truncate`}>{torrentName}</h3>}
          </div>
          {showLogo && (
            logoUrl ? (
              <img 
                src={logoUrl} 
                alt="" 
                class={`flex-shrink-0 ${isTV ? 'w-20 h-20 max-h-20' : isFullscreen ? 'w-16 h-16 md:w-20 md:h-20 max-h-20' : 'w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 max-h-16'} object-contain object-center opacity-95`}
                style="max-width: 12rem;"
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
        <div class={padding}>
          <div
            ref={progressBarRef}
            // Sur TV en mode vignettes : la barre ne doit pas être focusable (sinon le focus « part » sur la barre).
            tabIndex={isTV && scrubEnabled ? -1 : 0}
            data-tv-video-progress
            role="slider"
            class={`relative ${progressHeight} bg-white/30 rounded-full cursor-pointer group/progress transition-all mb-4 sm:mb-6 md:mb-8 outline-none focus:outline-none ${getProgressFocusClass()}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSeek(e);
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
              } catch (err) {}
              setScrubFromPointer(e, true);
              onSeek(e);
            }}
            onPointerMove={(e) => {
              if (isTV) return;
              // Seek quand drag (bouton appuyé)
              if (e.buttons === 1) {
                e.preventDefault();
                e.stopPropagation();
                setScrubFromPointer(e, true);
                onSeek(e);
                return;
              }
              // Miniature scrub au survol (expérience Netflix)
              setScrubFromPointer(e, false);
            }}
            onPointerUp={(e) => {
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
              } catch (err) {}
              // Garder un court instant l'aperçu après le drag (comme Netflix), puis cacher.
              scheduleScrubHide(700);
            }}
            onPointerLeave={() => {
              if (isTV) return;
              if (!scrubActive) setScrubHover(null);
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
                setTvScrubIndex(idx);
              } else if (effectiveDuration > 0 && !scrubEnabled && !isTV) {
                const percent = (currentTime / effectiveDuration) * 100;
                setScrubFromPercent(percent, false);
              }
            }}
            onBlur={() => {
              setFocusedOnProgress?.(false);
              setScrubActive(false);
              setScrubHover(null);
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
                  if (onSeekToTime) onSeekToTime(targetTime);
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

                setTvScrubIndex(nextIdx);
                scheduleScrubHide(2500);
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
              const percent = (nextTime / effectiveDuration) * 100;
              setScrubFromPercent(percent, true);

              // Déclencher le seek en simulant un clic sur la barre.
              const el = (progressBarRef as any)?.current as HTMLDivElement | null;
              if (el) {
                const rect = el.getBoundingClientRect();
                const clientX = rect.left + (rect.width * percent) / 100;
                onSeek({
                  currentTarget: el,
                  clientX,
                  preventDefault: () => {},
                  stopPropagation: () => {},
                });
              } else if (onSeekTV) {
                // Fallback si jamais la ref n'est pas attachée.
                onSeekTV(keyNormalized === 'ArrowLeft' || keyNormalized === 'PageDown' ? 'left' : 'right', step);
              }
              // Laisser visible l'aperçu un peu après la dernière touche.
              scheduleScrubHide(900);
            }}
            aria-label={t('playback.positionSlider')}
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* Web/desktop: tooltip vignette au survol/drag */}
            {!isTV && scrubEnabled && scrubHover && (
              <div
                class="absolute -top-24 sm:-top-28 md:-top-32 z-40 pointer-events-none"
                style={{
                  left: `${scrubHover.percent}%`,
                  transform: 'translateX(-50%)',
                }}
                aria-hidden
              >
                <div class="rounded-lg overflow-hidden bg-black/80 backdrop-blur-md border border-white/20 shadow-xl">
                  <img
                    src={scrubHover.url}
                    alt=""
                    class="block w-40 sm:w-48 md:w-56 h-auto object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <div class="px-2 py-1 text-xs text-white/90 bg-black/60">
                    {formatTime(scrubHover.time)}
                  </div>
                </div>
              </div>
            )}

            {/* Bande de miniatures (TV + desktop) : navigation par les captures (clic = seek, flèches + Enter) */}
            {scrubEnabled && showControls && (() => {
              const count = scrubThumbnails!.count;
              const effectiveDuration = getEffectiveDuration();
              // La vignette sélectionnée est pilotée par la navigation (tvScrubIndex),
              // pas par la position de lecture (currentTime).
              // `currentTime` ne sert qu'à initialiser l'index au moment où l'utilisateur entre dans le mode scrub.
              const selectedIndex = Math.min(count - 1, Math.max(0, tvScrubIndex));
              // Afficher moins de vignettes pour qu'elles soient plus grandes.
              const windowSize = 5;
              const half = Math.floor(windowSize / 2);
              const start = Math.max(0, Math.min(count - windowSize, selectedIndex - half));
              const end = Math.min(count - 1, start + windowSize - 1);
              const seekToThumbnail = (idx: number) => {
                const seekTime = timeForScrubIndex(idx);
                setTvScrubIndex(idx);
                setTvScrubVisible(true);
                if (onSeekToTime) onSeekToTime(seekTime);
                else {
                  const percent = effectiveDuration > 0 ? (seekTime / effectiveDuration) * 100 : 0;
                  const el = (progressBarRef as any)?.current as HTMLDivElement | null;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    const clientX = rect.left + (rect.width * percent) / 100;
                    onSeek({
                      currentTarget: el,
                      clientX,
                      preventDefault: () => {},
                      stopPropagation: () => {},
                    });
                  }
                }
              };
              const items = [];
              for (let idx = start; idx <= end; idx++) {
                const selected = idx === selectedIndex;
                const thumbTime = timeForScrubIndex(idx);
                items.push(
                  <button
                    key={idx}
                    type="button"
                    tabIndex={isTV ? -1 : 0}
                    class={`relative rounded-xl overflow-hidden bg-black/70 border ${
                      selected
                        ? (isTV && tvScrubFocused ? 'border-white ring-4 ring-white/95' : 'border-white ring-2 ring-white/90')
                        : 'border-white/20'
                    } shadow-2xl focus:outline-none focus:ring-2 focus:ring-white/80 transition-all ${isTV ? 'cursor-default pointer-events-none' : 'cursor-pointer hover:border-white/50'}`}
                    // Plus large (car on affiche moins de vignettes).
                    style={{ width: '14rem' }}
                    onClick={(e: Event) => {
                      if (isTV) return;
                      e.preventDefault();
                      e.stopPropagation();
                      seekToThumbnail(idx);
                    }}
                    aria-label={t('playback.seekToPosition', { time: formatTime(thumbTime) })}
                  >
                    <img
                      src={getScrubUrlForIndex(idx)}
                      alt=""
                      class="block w-full h-auto object-cover pointer-events-none"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                );
              }
              return (
                <div class="absolute -top-44 left-0 right-0 z-40 flex justify-center gap-5" aria-hidden>
                  {items}
                </div>
              );
            })()}
            <div class="absolute left-0 top-0 h-full bg-white/20 rounded-full" style={{ width: '100%' }} />
            {/* Partie déjà téléchargée par le client torrent : segment visible (couleur assortie au violet) */}
            {torrentProgress != null && torrentProgress > 0 && (
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-cyan-400/80"
                style={{ width: `${Math.min(100, torrentProgress * 100)}%` }}
                title={t('playback.progressBarDownloaded')}
                aria-hidden
              />
            )}
            {/* Barre de progression principale (preview en TV scrub, playback sinon) */}
            <div
              class={`absolute left-0 top-0 h-full rounded-full transition-all ${isTV && scrubEnabled && tvScrubIndexExternal != null ? 'bg-purple-400/80' : 'bg-purple-600'}`}
              style={{ width: `${progressPercent}%` }}
            />
            {/* Sur TV en mode scrub : petit marqueur blanc indiquant la position réelle de lecture */}
            {isTV && scrubEnabled && tvScrubIndexExternal != null && duration > 0 && (
              <div
                class="absolute top-0 h-full w-1 bg-white/50 rounded-full"
                style={{ left: `${(currentTime / duration) * 100}%` }}
                aria-hidden
              />
            )}
            {/* Curseur de position */}
            <div
              class={`absolute top-1/2 -translate-y-1/2 ${isTV ? 'w-6 h-6' : 'w-4 h-4'} bg-purple-600 rounded-full transition-all border-2 border-white ${isTV ? 'opacity-100' : 'opacity-0 group-hover/progress:opacity-100'}`}
              style={{ left: `calc(${progressPercent}% - ${progressPercent > 0 && progressPercent < 100 ? (isTV ? '12px' : '8px') : progressPercent === 100 ? (isTV ? '24px' : '16px') : '0px'})` }}
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
                <div class="hidden group-hover/volume:flex items-center w-24 h-2 bg-white/30 rounded-full cursor-pointer" onClick={onVolumeChange}>
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
              {isTV && scrubEnabled && tvScrubIndexExternal != null ? (
                <>
                  <span class="text-purple-300">{formatTime(timeForScrubIndex(tvScrubIndex))}</span>
                  <span class="text-white/30 text-sm">({formatTime(currentTime)})</span>
                </>
              ) : (
                <span>{formatTime(currentTime)}</span>
              )}
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
