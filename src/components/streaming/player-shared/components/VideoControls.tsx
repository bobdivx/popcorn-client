import { useState } from 'preact/hooks';
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Subtitles, ArrowLeft, RotateCcw, SkipForward, Settings } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { formatTime } from '../utils/formatTime';
import { SubtitleSelector } from './SubtitleSelector';

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
}: VideoControlsProps) {
  const { t } = useI18n();
  const [showQualityMenu, setShowQualityMenu] = useState(false);

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
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = volume * 100;

  const buttonSize = isTV ? 'w-20 h-20' : isFullscreen ? 'w-[4.5rem] h-[4.5rem] min-w-[4.5rem] min-h-[4.5rem]' : 'w-16 h-16 min-w-16 min-h-16';
  const iconSize = isTV ? 'w-10 h-10' : isFullscreen ? 'w-9 h-9' : 'w-8 h-8';
  const progressHeight = isTV ? 'h-3' : isFullscreen ? 'h-2.5' : 'h-2';
  const textSize = isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-base';
  const titleSize = isTV ? 'text-4xl' : isFullscreen ? 'text-3xl md:text-4xl' : 'text-2xl sm:text-3xl';
  const padding = isTV ? 'px-10 pt-10 pb-10' : isFullscreen ? 'px-8 pt-8 pb-8 md:px-12 md:pt-10 md:pb-10' : 'px-6 pt-6 pb-6 sm:px-8 sm:pt-8 sm:pb-8';
  const gap = isTV ? 'gap-8' : isFullscreen ? 'gap-6' : 'gap-5';

  // Indices de focus : back(0 si hasBack), play, mute, fullscreen
  const getFocusClass = (index: number) => {
    if (!isTV || focusedOnProgress) return '';
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
          <div class="absolute inset-0 flex flex-col justify-end px-4 sm:px-6 md:px-10 lg:px-16 pb-12 sm:pb-16 md:pb-20">
            <div class="max-w-5xl xl:max-w-6xl flex flex-col sm:flex-row items-start gap-6 sm:gap-8 md:gap-10 w-full">
              {posterUrl && (
                <div class="flex-shrink-0 w-40 h-56 sm:w-48 sm:h-72 md:w-56 md:h-80 lg:w-64 lg:h-96 rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/20">
                  <img src={posterUrl} alt="" class="w-full h-full object-cover" />
                </div>
              )}
              <div class="flex-1 min-w-0 flex flex-col gap-4">
                {(torrentName || releaseDate) && (
                  <div class="flex items-baseline gap-3 sm:gap-4 flex-wrap">
                    {torrentName && (
                      <h2 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight drop-shadow-2xl">
                        {torrentName}
                      </h2>
                    )}
                    {releaseDate && (
                      <span class="inline-flex items-center justify-center px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-800/90 backdrop-blur-md text-white/95 text-base sm:text-lg font-semibold rounded-lg border border-white/30 shadow-lg">
                        {new Date(releaseDate).getFullYear()}
                      </span>
                    )}
                  </div>
                )}
                {synopsis && (
                  <p class="text-white/95 text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed line-clamp-4 sm:line-clamp-5 md:line-clamp-6 drop-shadow-lg max-w-2xl">
                    {synopsis}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div class={`absolute inset-0 flex flex-col justify-between transition-all duration-300 z-20 ${showControls ? 'opacity-100' : 'opacity-0'} ${showControls ? 'pointer-events-auto' : 'pointer-events-none'}`}>
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
                title="Retour"
                aria-label="Retour"
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
                class={`flex-shrink-0 ${isTV ? 'w-20 h-20 max-h-20' : isFullscreen ? 'w-16 h-16 md:w-20 md:h-20 max-h-20' : 'w-14 h-14 sm:w-16 sm:h-16 max-h-16'} object-contain object-center opacity-95`}
                style="max-width: 12rem;"
              />
            ) : (
              <img 
                src="/popcorn_logo.png" 
                alt="Popcorn" 
                class={`flex-shrink-0 ${isTV ? 'w-20 h-20' : isFullscreen ? 'w-16 h-16 md:w-20 md:h-20' : 'w-14 h-14 sm:w-16 sm:h-16'} object-contain opacity-90`}
              />
            )
          )}
        </div>
        <div class={padding}>
          <div
            ref={progressBarRef}
            tabIndex={0}
            class={`relative ${progressHeight} bg-white/30 rounded-full cursor-pointer group/progress transition-all mb-8 outline-none focus:outline-none ${getProgressFocusClass()}`}
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
              onSeek(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              onSeek(e);
            }}
            onPointerUp={(e) => {
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
              } catch (err) {}
            }}
            onFocus={() => setFocusedOnProgress?.(true)}
            onBlur={() => setFocusedOnProgress?.(false)}
            role="slider"
            aria-label="Position dans la vidéo"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div class="absolute left-0 top-0 h-full bg-white/20 rounded-full" style={{ width: '100%' }} />
            {/* Partie déjà téléchargée par le client torrent : segment vert visible entre position actuelle et fin du téléchargement */}
            {torrentProgress != null && torrentProgress > 0 && (
              <div
                class="absolute left-0 top-0 h-full rounded-full bg-emerald-400/80"
                style={{ width: `${Math.min(100, torrentProgress * 100)}%` }}
                title={t('playback.progressBarDownloaded')}
                aria-hidden
              />
            )}
            <div class="absolute left-0 top-0 h-full bg-purple-600 rounded-full" style={{ width: `${progressPercent}%` }} />
            <div class={`absolute top-1/2 -translate-y-1/2 ${isTV ? 'w-6 h-6' : 'w-4 h-4'} bg-purple-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-all border-2 border-white`} style={{ left: `calc(${progressPercent}% - ${progressPercent > 0 && progressPercent < 100 ? (isTV ? '12px' : '8px') : progressPercent === 100 ? (isTV ? '24px' : '16px') : '0px'})` }} />
          </div>
          {/* Légende : vert = téléchargé par le client (visible quand les contrôles sont affichés) */}
          {torrentProgress != null && torrentProgress > 0 && (
            <p class="text-white/50 text-xs mt-1 mb-1 select-none" aria-hidden="true">
              {t('playback.progressBarDownloaded')}
            </p>
          )}
          <div class={`flex items-center ${gap} relative z-30 overflow-x-auto min-w-0 scrollbar-visible`}>
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
                title="Redémarrer depuis le début"
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
              <span>{formatTime(currentTime)}</span>
              <span class="text-white/50">/</span>
              <span class="text-white/70">{formatTime(duration)}</span>
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
            {showQualitySelector && onQualityChange && (
              <div class="relative flex-shrink-0">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQualityMenu((v) => !v);
                  }} 
                  class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none min-w-[3rem] touch-manipulation`}
                  title={t('playback.quality')}
                  aria-label={t('playback.quality')}
                  aria-expanded={showQualityMenu}
                  aria-haspopup="true"
                >
                  <Settings class={`${iconSize} text-white shrink-0`} />
                </button>
                {showQualityMenu && (
                  <>
                    <div
                      class="fixed inset-0 z-40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowQualityMenu(false);
                      }}
                      aria-hidden="true"
                    />
                    <div
                      class="absolute bottom-full left-0 mb-2 z-50 py-2 rounded-lg bg-black/90 border border-white/20 shadow-xl min-w-[8rem]"
                      role="menu"
                    >
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
                    </div>
                  </>
                )}
              </div>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullscreen();
              }} 
              class={`flex items-center justify-center flex-shrink-0 ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${getFocusClass(hasBackButton ? 3 : 2)}`}
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
