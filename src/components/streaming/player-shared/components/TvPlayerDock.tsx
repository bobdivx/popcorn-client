import { useEffect } from 'preact/hooks';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, Settings, SkipBack, SkipForward } from 'lucide-preact';
import { formatTime } from '../utils/formatTime';
import { useI18n } from '../../../../lib/i18n';
import { serverApi } from '../../../../lib/client/server-api';
import type { ScrubThumbnailsMeta } from '../types/scrubThumbnails';
import { ScrubThumbnailsStrip } from './video-controls/ScrubThumbnailsStrip';
import {
  scrubBaseUrl,
  scrubEffectiveDuration,
  scrubTimeForIndex,
  scrubUrlForIndex,
} from './video-controls/scrubMath';
import { TV_QUALITY_VALUES } from '../hooks/useTVPlayerNavigation';

interface TvPlayerDockProps {
  show: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  focusedControlId?: string;
  focusedOnScrub?: boolean;
  tvScrubIndex?: number;
  tvScrubBrowsing?: boolean;
  scrubThumbnails?: ScrubThumbnailsMeta | null;
  scrubThumbnailsLoading?: boolean;
  videoFillMode?: 'contain' | 'cover';
  streamQuality?: number | null;
  settingsOpen?: boolean;
  settingsFocusIndex?: number;
  onClose?: () => void;
  onPlayPause: () => void;
  onSeekToTime: (timeSeconds: number) => void;
  onToggleFillMode?: () => void;
  onOpenSettings?: () => void;
  onSelectQuality?: (height: number | null) => void;
}

function dockBtnStyle(focused: boolean): Record<string, string | number> {
  return {
    width: 52,
    height: 52,
    borderRadius: 999,
    background: focused ? '#fff' : '#222',
    color: focused ? '#000' : '#fff',
    border: focused ? '3px solid #fff' : '2px solid rgba(255,255,255,0.7)',
    boxShadow: focused ? '0 0 0 3px #000, 0 0 0 6px #fff' : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}

function chipStyle(focused: boolean, selected: boolean): Record<string, string | number> {
  return {
    minWidth: 72,
    height: 40,
    padding: '0 14px',
    borderRadius: 999,
    background: focused || selected ? '#fff' : '#222',
    color: focused || selected ? '#000' : '#fff',
    border: focused ? '3px solid #fff' : selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.4)',
    boxShadow: focused ? '0 0 0 3px #000, 0 0 0 6px #fff' : 'none',
    fontSize: 16,
    fontWeight: 600,
    flexShrink: 0,
  };
}

/**
 * Bandeau TV en bas de l’écran (pas de calque inset-0). Miniatures, paramètres
 * et zoom restent dans cette bande opaque.
 */
export function TvPlayerDock({
  show,
  isPlaying,
  currentTime,
  duration,
  focusedControlId = 'playpause',
  focusedOnScrub = false,
  tvScrubIndex = 0,
  tvScrubBrowsing = false,
  scrubThumbnails = null,
  scrubThumbnailsLoading = false,
  videoFillMode = 'cover',
  streamQuality = null,
  settingsOpen = false,
  settingsFocusIndex = 0,
  onClose,
  onPlayPause,
  onSeekToTime,
  onToggleFillMode,
  onOpenSettings,
  onSelectQuality,
}: TvPlayerDockProps) {
  const { t } = useI18n();
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const tNow = Number.isFinite(currentTime) ? currentTime : 0;
  const scrubEnabled = !!(scrubThumbnails?.mediaId && (scrubThumbnails.count ?? 0) > 0);
  const effectiveDur = scrubEffectiveDuration(dur, scrubThumbnails);
  const previewing = scrubEnabled && (focusedOnScrub || tvScrubBrowsing);
  const previewTime = previewing
    ? scrubTimeForIndex(tvScrubIndex, scrubThumbnails!, effectiveDur)
    : tNow;
  const pct =
    effectiveDur > 0 ? Math.min(100, Math.max(0, (previewTime / effectiveDur) * 100)) : 0;
  const playheadPct =
    effectiveDur > 0 ? Math.min(100, Math.max(0, (tNow / effectiveDur) * 100)) : 0;

  const scrubBase =
    scrubEnabled && scrubThumbnails
      ? scrubBaseUrl(serverApi.getServerUrl(), scrubThumbnails.mediaId)
      : '';
  const getScrubUrlForIndex = (idx: number) => {
    if (!scrubEnabled || !scrubThumbnails || !scrubBase) return '';
    return scrubUrlForIndex(scrubBase, scrubThumbnails.count, idx, scrubThumbnails.mediaId);
  };
  const timeForIndex = (idx: number) =>
    scrubThumbnails ? scrubTimeForIndex(idx, scrubThumbnails, effectiveDur) : 0;

  useEffect(() => {
    if (!show || settingsOpen || focusedOnScrub) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tv-dock-btn="${focusedControlId}"]`,
    );
    el?.focus({ preventScroll: true });
  }, [show, focusedControlId, settingsOpen, focusedOnScrub]);

  if (!show) return null;

  const seekBy = (delta: number) => {
    if (!effectiveDur) return;
    onSeekToTime(Math.max(0, Math.min(effectiveDur, tNow + delta)));
  };

  const activate = (fn: () => void) => (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const qualityLabel = (value: number | null) => {
    if (value == null) return t('playback.qualityAuto');
    if (value === 1080) return t('playback.quality1080');
    if (value === 720) return t('playback.quality720');
    if (value === 480) return t('playback.quality480');
    if (value === 360) return t('playback.quality360');
    return `${value}p`;
  };

  const btnFocused = (id: string) => !focusedOnScrub && !settingsOpen && focusedControlId === id;

  return (
    <div
      data-tv-player-dock="true"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#000',
        padding: '10px 16px 16px',
        color: '#fff',
        zIndex: 410,
        pointerEvents: 'auto',
      }}
    >
      {scrubEnabled && (
        <ScrubThumbnailsStrip
          scrubEnabled
          scrubThumbnailsLoading={scrubThumbnailsLoading}
          scrubThumbnails={scrubThumbnails}
          showControls
          isTV
          isFullscreen
          tvScrubFocused={focusedOnScrub}
          tvScrubIndex={tvScrubIndex}
          getScrubUrlForIndex={getScrubUrlForIndex}
          timeForScrubIndex={timeForIndex}
          seekToThumbnail={(idx) => onSeekToTime(timeForIndex(idx))}
          stepScrubIndex={() => {}}
          seekToPositionLabel={(time) => t('playback.seekToPosition', { time })}
          previousThumbnailLabel={t('playback.scrubPreviousThumbnail')}
          nextThumbnailLabel={t('playback.scrubNextThumbnail')}
        />
      )}
      <div
        role="slider"
        aria-valuenow={Math.round(previewTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(effectiveDur)}
        style={{
          height: 8,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.3)',
          margin: '10px 0 14px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: previewing ? '#c4b5fd' : '#fff',
          }}
        />
        {previewing && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${playheadPct}%`,
              width: 2,
              height: '100%',
              background: 'rgba(255,255,255,0.7)',
            }}
          />
        )}
      </div>
      {settingsOpen && onSelectQuality && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {TV_QUALITY_VALUES.map((value, i) => (
            <button
              key={value ?? 'auto'}
              type="button"
              data-tv-dock-settings-opt={i}
              onClick={activate(() => onSelectQuality(value))}
              aria-label={qualityLabel(value)}
              style={chipStyle(settingsFocusIndex === i, streamQuality === value)}
            >
              {qualityLabel(value)}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {onClose && (
          <button
            type="button"
            data-tv-dock-btn="back"
            data-focusable
            tabIndex={0}
            onClick={activate(onClose)}
            aria-label={t('common.back')}
            style={dockBtnStyle(btnFocused('back'))}
          >
            <ArrowLeft class="w-6 h-6" />
          </button>
        )}
        <button
          type="button"
          data-tv-dock-btn="skipback"
          data-focusable
          tabIndex={0}
          onClick={activate(() => seekBy(-10))}
          aria-label={t('playback.skipBack10')}
          style={dockBtnStyle(btnFocused('skipback'))}
        >
          <SkipBack class="w-6 h-6" />
        </button>
        <button
          type="button"
          data-tv-dock-btn="playpause"
          data-focusable
          tabIndex={0}
          onClick={activate(onPlayPause)}
          aria-label={isPlaying ? t('playback.pauseLabel') : t('playback.playLabel')}
          style={dockBtnStyle(btnFocused('playpause'))}
        >
          {isPlaying ? <Pause class="w-6 h-6" /> : <Play class="w-6 h-6" />}
        </button>
        <button
          type="button"
          data-tv-dock-btn="skipforward"
          data-focusable
          tabIndex={0}
          onClick={activate(() => seekBy(10))}
          aria-label={t('playback.skipForward10')}
          style={dockBtnStyle(btnFocused('skipforward'))}
        >
          <SkipForward class="w-6 h-6" />
        </button>
        <span style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>
          {formatTime(previewTime)}
          {effectiveDur ? ` / ${formatTime(effectiveDur)}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {onOpenSettings && onSelectQuality && (
          <button
            type="button"
            data-tv-dock-btn="settings"
            data-focusable
            tabIndex={0}
            onClick={activate(onOpenSettings)}
            aria-label={t('playback.quality')}
            style={dockBtnStyle(btnFocused('settings'))}
          >
            <Settings class="w-6 h-6" />
          </button>
        )}
        {onToggleFillMode && (
          <button
            type="button"
            data-tv-dock-btn="fillmode"
            data-focusable
            tabIndex={0}
            onClick={activate(onToggleFillMode)}
            aria-label={t('interfaceSettings.videoFillMode')}
            title={
              videoFillMode === 'cover'
                ? t('interfaceSettings.videoFillModeContain')
                : t('interfaceSettings.videoFillModeCover')
            }
            style={dockBtnStyle(btnFocused('fillmode'))}
          >
            {videoFillMode === 'cover' ? (
              <Minimize2 class="w-6 h-6" />
            ) : (
              <Maximize2 class="w-6 h-6" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
