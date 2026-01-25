import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Subtitles, ArrowLeft, RotateCcw } from 'lucide-preact';
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
  onPlayPause: () => void;
  onSeek: (e: any) => void;
  onVolumeChange: (e: any) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onSeekTV?: (direction: 'left' | 'right') => void;
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
  onClose?: () => void;
  onRestart?: () => void;
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
  onClose,
  onRestart,
}: VideoControlsProps) {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = volume * 100;

  const buttonSize = isTV ? 'w-16 h-16' : isFullscreen ? 'w-14 h-14' : 'w-12 h-12';
  const iconSize = isTV ? 'w-8 h-8' : isFullscreen ? 'w-7 h-7' : 'w-6 h-6';
  const progressHeight = isTV ? 'h-2' : isFullscreen ? 'h-1.5' : 'h-1.5';
  const textSize = isTV ? 'text-lg' : isFullscreen ? 'text-base' : 'text-sm';
  const titleSize = isTV ? 'text-3xl' : isFullscreen ? 'text-2xl' : 'text-lg sm:text-xl';
  const padding = isTV ? 'px-8 pt-8 pb-8' : isFullscreen ? 'px-6 pt-6 pb-6' : 'px-4 pt-4 sm:pt-6 pb-4 sm:pb-6';
  const gap = isTV ? 'gap-6' : isFullscreen ? 'gap-5' : 'gap-4';

  const getFocusClass = (index: number) => {
    if (!isTV || focusedControlIndex !== index) return '';
    return 'ring-4 ring-red-600 ring-opacity-75 scale-110 z-30';
  };

  return (
    <>
      <div class={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`} style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.3) 50%, transparent 100%)' }} />
      <div class={`absolute inset-0 flex flex-col justify-between transition-all duration-300 z-20 ${showControls ? 'opacity-100' : 'opacity-0'} ${showControls ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div class={`flex items-center justify-between ${padding.split(' ')[0]} ${padding.split(' ')[1]}`}>
          <div class="flex items-center gap-3 text-white drop-shadow-2xl">
            {/* Bouton retour */}
            {onClose && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }} 
                class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none`}
                title="Retour"
              >
                <ArrowLeft class={`${iconSize} text-white`} />
              </button>
            )}
            {showLogo && (
              <img 
                src="/popcorn_logo.png" 
                alt="Popcorn" 
                class={`${isTV ? 'w-12 h-12' : isFullscreen ? 'w-10 h-10' : 'w-8 h-8'} object-contain opacity-90`}
              />
            )}
            {torrentName && <h3 class={`${titleSize} font-semibold tracking-wide`}>{torrentName}</h3>}
          </div>
        </div>
        <div class={padding}>
          <div class={`relative ${progressHeight} bg-white/30 rounded-full cursor-pointer group/progress transition-all mb-6`} onClick={onSeek}>
            <div class="absolute left-0 top-0 h-full bg-white/20 rounded-full" style={{ width: '100%' }} />
            <div class="absolute left-0 top-0 h-full bg-purple-600 rounded-full" style={{ width: `${progressPercent}%` }} />
            <div class={`absolute top-1/2 -translate-y-1/2 ${isTV ? 'w-5 h-5' : 'w-3.5 h-3.5'} bg-purple-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-all border-2 border-white`} style={{ left: `calc(${progressPercent}% - ${progressPercent > 0 && progressPercent < 100 ? (isTV ? '10px' : '7px') : progressPercent === 100 ? (isTV ? '20px' : '14px') : '0px'})` }} />
          </div>
          <div class={`flex items-center ${gap} relative z-30`}>
            <button 
              onClick={(e) => { 
                e.preventDefault();
                e.stopPropagation();
                onPlayPause(); 
              }} 
              class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none relative z-40 ${getFocusClass(0)}`}
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
                class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border-2 border-white/20 focus:outline-none`}
                title="Redémarrer depuis le début"
              >
                <RotateCcw class={`${iconSize} text-white`} />
              </button>
            )}
            <div class="flex items-center gap-2 group/volume">
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMute(); }} 
                class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${getFocusClass(1)}`}
              >
                {isMuted || volume === 0 ? <VolumeX class={`${iconSize} text-white`} /> : volume < 0.5 ? <Volume1 class={`${iconSize} text-white`} /> : <Volume2 class={`${iconSize} text-white`} />}
              </button>
              {!isTV && (
                <div class="hidden group-hover/volume:flex items-center w-20 h-1.5 bg-white/30 rounded-full cursor-pointer" onClick={onVolumeChange}>
                  <div class="h-full bg-white rounded-full" style={{ width: `${volumePercent}%` }} />
                </div>
              )}
              {isTV && (
                <div class="flex items-center w-32 h-2 bg-white/30 rounded-full">
                  <div class="h-full bg-white rounded-full" style={{ width: `${volumePercent}%` }} />
                </div>
              )}
            </div>
            <div class={`flex items-center gap-2 text-white ${textSize} font-medium`}>
              <span>{formatTime(currentTime)}</span>
              <span class="text-white/50">/</span>
              <span class="text-white/70">{formatTime(duration)}</span>
            </div>
            <div class="flex-1" />
            {(audioTracks.length > 0 || subtitleTracks.length > 0) && onToggleSubtitleSelector && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtitleSelector();
                }} 
                class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none ${
                  currentSubtitleTrack !== -1 ? 'bg-red-600/30 border-red-500/50' : ''
                }`}
                title="Langues et sous-titres"
              >
                <Subtitles class={`${iconSize} text-white`} />
              </button>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleFullscreen();
              }} 
              class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20 focus:outline-none`}
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
