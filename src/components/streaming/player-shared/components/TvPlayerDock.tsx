import { useEffect } from 'preact/hooks';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, RotateCcw, RotateCw, Settings, SkipBack, SkipForward, Subtitles } from 'lucide-preact';
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

interface TvTrackOption {
  id: number;
  name: string;
  lang?: string;
  default?: boolean;
}

interface TvPlayerDockProps {
  show: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** Titre du média affiché avec les commandes. */
  mediaTitle?: string | null;
  /** Numéro de saison (séries). */
  seriesSeasonNum?: number | null;
  /** Numéro d'épisode (séries). */
  seriesEpisodeNum?: number | null;
  focusedControlId?: string;
  focusedOnScrub?: boolean;
  tvScrubIndex?: number;
  tvScrubBrowsing?: boolean;
  scrubThumbnails?: ScrubThumbnailsMeta | null;
  scrubThumbnailsLoading?: boolean;
  videoFillMode?: 'contain' | 'cover';
  settingsOpen?: boolean;
  audioTracks?: TvTrackOption[];
  subtitleTracks?: TvTrackOption[];
  currentSubtitleTrack?: number;
  onClose?: () => void;
  onPlayPause: () => void;
  onSeekToTime: (timeSeconds: number) => void;
  onToggleFillMode?: () => void;
  onOpenSettings?: () => void;
  onToggleSubtitles?: () => void;
  /** Série : épisode suivant / précédent (masqués en bout de série et pour les films). */
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
}

/** Design éditorial : accent corail unique, traits fins, surfaces sombres translucides sans flou (TV). */
const ED_ACCENT = 'var(--ed-accent, #f2545b)';
const ED_FONT = "var(--ed-font-body, 'Jost', sans-serif)";
const ED_EASE = 'var(--ed-ease, cubic-bezier(0.2, 0.7, 0.2, 1))';
const ICON_STROKE = 1.5;

function dockBtnStyle(focused: boolean): Record<string, string | number> {
  return {
    width: 68,
    height: 68,
    borderRadius: 999,
    background: focused ? ED_ACCENT : 'rgba(12,13,16,0.55)',
    color: '#fff',
    border: focused ? `1px solid ${ED_ACCENT}` : '1px solid rgba(255,255,255,0.22)',
    boxShadow: focused ? '0 0 0 4px rgba(242,84,91,0.28)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transform: focused ? 'scale(1.06)' : 'none',
    transition: `transform var(--ed-dur-1, 160ms) ${ED_EASE}, background-color var(--ed-dur-1, 160ms) ${ED_EASE}, box-shadow var(--ed-dur-1, 160ms) ${ED_EASE}`,
    outline: 'none',
  };
}

/** Libellé court sous une icône (ex. « 10 »), Jost espacé. */
const microLabelStyle: Record<string, string | number> = {
  fontFamily: ED_FONT,
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: '0.18em',
  lineHeight: 1,
  marginTop: 2,
};

/**
 * Bandeau TV en bas de l’écran (pas de calque inset-0). Miniatures, paramètres
 * et zoom restent dans cette bande opaque.
 */
export function TvPlayerDock({
  show,
  isPlaying,
  currentTime,
  duration,
  mediaTitle = null,
  seriesSeasonNum = null,
  seriesEpisodeNum = null,
  focusedControlId = 'playpause',
  focusedOnScrub = false,
  tvScrubIndex = 0,
  tvScrubBrowsing = false,
  scrubThumbnails = null,
  scrubThumbnailsLoading = false,
  videoFillMode = 'cover',
  settingsOpen = false,
  audioTracks = [],
  subtitleTracks = [],
  currentSubtitleTrack = -1,
  onClose,
  onPlayPause,
  onSeekToTime,
  onToggleFillMode,
  onOpenSettings,
  onToggleSubtitles,
  onNextEpisode,
  onPreviousEpisode,
}: TvPlayerDockProps) {
  const { t } = useI18n();
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const tNow = Number.isFinite(currentTime) ? currentTime : 0;
  const title = typeof mediaTitle === 'string' ? mediaTitle.trim() : '';
  const seriesSubtitle =
    seriesSeasonNum != null || seriesEpisodeNum != null
      ? [
          seriesSeasonNum != null ? `${t('mediaDetail.season')} ${seriesSeasonNum}` : null,
          seriesEpisodeNum != null
            ? t('mediaDetail.episodeNumber', { number: seriesEpisodeNum })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
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

  const hasLanguageTracks = audioTracks.length > 0 || subtitleTracks.length > 0;

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

  const btnFocused = (id: string) => !focusedOnScrub && !settingsOpen && focusedControlId === id;

  return (
    <>
      {(title || seriesSubtitle) && (
        <div
          data-tv-player-title="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 65%, transparent 100%)',
            padding: '36px 48px 48px',
            color: '#fff',
            zIndex: 410,
            pointerEvents: 'none',
          }}
        >
          {title ? (
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--ed-font-display, 'Josefin Sans', 'Jost', sans-serif)",
                fontSize: 40,
                fontWeight: 300,
                lineHeight: 1.15,
                letterSpacing: '0.08em',
                textShadow: '0 2px 12px rgba(0,0,0,0.65)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '92%',
              }}
            >
              {title}
            </h2>
          ) : null}
          {seriesSubtitle ? (
            <p
              style={{
                margin: title ? '12px 0 0' : 0,
                fontFamily: ED_FONT,
                fontSize: 18,
                fontWeight: 400,
                lineHeight: 1.3,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'rgba(244,241,236,0.72)',
                textShadow: '0 1px 8px rgba(0,0,0,0.55)',
              }}
            >
              {seriesSubtitle}
            </p>
          ) : null}
        </div>
      )}
    <div
      data-tv-player-dock="true"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to top, rgba(12,13,16,0.94) 0%, rgba(12,13,16,0.74) 55%, transparent 100%)',
        fontFamily: ED_FONT,
        padding: '28px 48px 28px',
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
          height: focusedOnScrub ? 6 : 4,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.18)',
          margin: '14px 0 22px',
          position: 'relative',
          transition: `height var(--ed-dur-1, 160ms) ${ED_EASE}`,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 999,
            background: ED_ACCENT,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            width: focusedOnScrub ? 18 : 14,
            height: focusedOnScrub ? 18 : 14,
            marginLeft: focusedOnScrub ? -9 : -7,
            marginTop: focusedOnScrub ? -9 : -7,
            borderRadius: 999,
            background: ED_ACCENT,
            boxShadow: focusedOnScrub ? '0 0 0 5px rgba(242,84,91,0.3)' : 'none',
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
              background: 'rgba(255,255,255,0.75)',
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
            <ArrowLeft class="w-6 h-6" strokeWidth={ICON_STROKE} />
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
          <RotateCcw class="w-6 h-6" strokeWidth={ICON_STROKE} />
          <span style={microLabelStyle}>10</span>
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
          {isPlaying ? <Pause class="w-6 h-6" strokeWidth={ICON_STROKE} /> : <Play class="w-6 h-6" strokeWidth={ICON_STROKE} />}
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
          <RotateCw class="w-6 h-6" strokeWidth={ICON_STROKE} />
          <span style={microLabelStyle}>10</span>
        </button>
        {onPreviousEpisode && (
          <button
            type="button"
            data-tv-dock-btn="prevepisode"
            data-focusable
            tabIndex={0}
            onClick={activate(onPreviousEpisode)}
            aria-label={t('playback.previousEpisode')}
            title={t('playback.previousEpisode')}
            style={dockBtnStyle(btnFocused('prevepisode'))}
          >
            <SkipBack class="w-6 h-6" strokeWidth={ICON_STROKE} />
          </button>
        )}
        {onNextEpisode && (
          <button
            type="button"
            data-tv-dock-btn="nextepisode"
            data-focusable
            tabIndex={0}
            onClick={activate(onNextEpisode)}
            aria-label={t('playback.nextEpisode')}
            title={t('playback.nextEpisode')}
            style={dockBtnStyle(btnFocused('nextepisode'))}
          >
            <SkipForward class="w-6 h-6" strokeWidth={ICON_STROKE} />
          </button>
        )}
        <span style={{ fontFamily: ED_FONT, fontSize: 20, fontWeight: 400, fontVariantNumeric: 'tabular-nums', marginLeft: 8, letterSpacing: '0.14em', color: 'rgba(244,241,236,0.9)' }}>
          {formatTime(previewTime)}
          {effectiveDur ? ` / ${formatTime(effectiveDur)}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {hasLanguageTracks && onToggleSubtitles && (
          <button
            type="button"
            data-tv-dock-btn="subtitles"
            data-focusable
            tabIndex={0}
            onClick={activate(onToggleSubtitles)}
            aria-label={t('playback.languagesAndSubtitles')}
            title={t('playback.languagesAndSubtitles')}
            style={{
              ...dockBtnStyle(btnFocused('subtitles')),
              ...(currentSubtitleTrack !== -1
                ? { border: `1px solid ${ED_ACCENT}`, color: btnFocused('subtitles') ? '#fff' : ED_ACCENT }
                : null),
            }}
          >
            <Subtitles class="w-6 h-6" strokeWidth={ICON_STROKE} />
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            data-tv-dock-btn="settings"
            data-focusable
            tabIndex={0}
            onClick={activate(onOpenSettings)}
            aria-label={t('playback.playerSettings')}
            style={dockBtnStyle(btnFocused('settings'))}
          >
            <Settings class="w-6 h-6" strokeWidth={ICON_STROKE} />
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
              <Minimize2 class="w-6 h-6" strokeWidth={ICON_STROKE} />
            ) : (
              <Maximize2 class="w-6 h-6" strokeWidth={ICON_STROKE} />
            )}
          </button>
        )}
      </div>
      <p style={{ margin: '16px 0 0', fontFamily: ED_FONT, fontSize: 13, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', lineHeight: 1.5, color: 'rgba(244,241,236,0.5)' }}>
        {t('playback.tvRemoteHint')}
      </p>
    </div>
    </>
  );
}
