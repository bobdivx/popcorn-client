import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Languages,
  Maximize2,
  Minimize2,
  Settings,
  Subtitles,
} from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { persistVideoFillMode } from '../hooks/usePlayerConfig';
import { getLanguageName } from '../utils/languageName';

export interface PlayerTrackOption {
  id: number;
  name: string;
  lang?: string;
  default?: boolean;
}

type SettingsPanel = 'root' | 'quality' | 'audio' | 'subtitles' | 'fill';

interface PlayerSettingsMenuProps {
  streamQuality?: number | null;
  showQualitySelector?: boolean;
  onQualityChange?: (height: number | null) => void;
  videoFillMode?: 'contain' | 'cover';
  audioTracks?: PlayerTrackOption[];
  subtitleTracks?: PlayerTrackOption[];
  currentAudioTrack?: number;
  currentSubtitleTrack?: number;
  onChangeAudioTrack?: (trackId: number) => void;
  onChangeSubtitleTrack?: (trackId: number) => void;
  onClose: () => void;
  /** Ancre bas-gauche du bouton Paramètres (position fixed). */
  anchor: { top: number; left: number };
}

const QUALITY_OPTIONS: { value: number | null; labelKey: string }[] = [
  { value: null, labelKey: 'playback.qualityAuto' },
  { value: 1080, labelKey: 'playback.quality1080' },
  { value: 720, labelKey: 'playback.quality720' },
  { value: 480, labelKey: 'playback.quality480' },
  { value: 360, labelKey: 'playback.quality360' },
];

function qualityLabel(
  streamQuality: number | null | undefined,
  t: (key: string) => string,
): string {
  if (streamQuality == null || streamQuality === 0) return t('playback.qualityAuto');
  if (streamQuality === 1080) return t('playback.quality1080');
  if (streamQuality === 720) return t('playback.quality720');
  if (streamQuality === 480) return t('playback.quality480');
  if (streamQuality === 360) return t('playback.quality360');
  return `${streamQuality}p`;
}

export function PlayerSettingsMenu({
  streamQuality = null,
  showQualitySelector = false,
  onQualityChange,
  videoFillMode,
  audioTracks = [],
  subtitleTracks = [],
  currentAudioTrack = -1,
  currentSubtitleTrack = -1,
  onChangeAudioTrack,
  onChangeSubtitleTrack,
  onClose,
  anchor,
}: PlayerSettingsMenuProps) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<SettingsPanel>('root');
  const effectiveFill = videoFillMode ?? 'contain';
  const hasAudio = audioTracks.length > 0 && !!onChangeAudioTrack;
  const showSubsSection = !!onChangeSubtitleTrack && subtitleTracks.length > 0;
  const hasQuality = showQualitySelector && !!onQualityChange;
  const hasFill = videoFillMode !== undefined;

  const currentAudioLabel = (() => {
    const track = audioTracks.find((a) => a.id === currentAudioTrack);
    return track ? getLanguageName(track.lang, track.name) : t('playback.qualityAuto');
  })();

  const currentSubLabel =
    currentSubtitleTrack === -1
      ? t('playback.subtitlesOff')
      : (() => {
          const track = subtitleTracks.find((s) => s.id === currentSubtitleTrack);
          return track ? getLanguageName(track.lang, track.name) : t('playback.subtitlesOff');
        })();

  const fillLabel =
    effectiveFill === 'cover'
      ? t('interfaceSettings.videoFillModeCover')
      : t('interfaceSettings.videoFillModeContain');

  const panelTitle =
    panel === 'quality'
      ? t('playback.quality')
      : panel === 'audio'
        ? t('playback.audioTracks')
        : panel === 'subtitles'
          ? t('playback.subtitleTracks')
          : panel === 'fill'
            ? t('interfaceSettings.videoFillMode')
            : t('playback.playerSettings');

  const Row = ({
    icon,
    label,
    value,
    onClick,
  }: {
    icon: ComponentChildren;
    label: string;
    value: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-white hover:bg-white/10 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span class="flex-shrink-0 text-white/80">{icon}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium">{label}</span>
        <span class="block text-xs text-white/55 truncate mt-0.5">{value}</span>
      </span>
      <ChevronRight class="w-4 h-4 text-white/40 flex-shrink-0" />
    </button>
  );

  const OptionBtn = ({
    selected,
    label,
    hint,
    onClick,
  }: {
    selected: boolean;
    label: string;
    hint?: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      class={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${
        selected ? 'bg-white/15 text-white font-medium' : 'text-white/90 hover:bg-white/10'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span class="w-4 flex-shrink-0 flex justify-center">
        {selected ? <Check class="w-4 h-4 text-white" /> : null}
      </span>
      <span class="flex-1 min-w-0">
        {label}
        {hint ? <span class="ml-1.5 text-xs text-white/50">{hint}</span> : null}
      </span>
    </button>
  );

  return (
    <>
      <div
        class="fixed inset-0 z-[9998]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        class="fixed z-[9999] w-[min(18.5rem,calc(100vw-1.5rem))] rounded-xl bg-black/95 border border-white/20 shadow-2xl overflow-hidden backdrop-blur-md"
        role="menu"
        aria-label={t('playback.playerSettings')}
        style={{
          bottom: `${typeof window !== 'undefined' ? window.innerHeight - anchor.top + 8 : 8}px`,
          left: `${Math.max(8, Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 304))}px`,
        }}
      >
        <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/10">
          {panel !== 'root' ? (
            <button
              type="button"
              class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setPanel('root');
              }}
              aria-label={t('common.back')}
            >
              <ArrowLeft class="w-4 h-4" />
            </button>
          ) : (
            <Settings class="w-4 h-4 text-white/70" />
          )}
          <h3 class="text-sm font-semibold text-white tracking-wide">{panelTitle}</h3>
        </div>

        <div class="py-1 max-h-[min(22rem,60vh)] overflow-y-auto">
          {panel === 'root' && (
            <>
              {hasQuality && (
                <Row
                  icon={<Settings class="w-4 h-4" />}
                  label={t('playback.quality')}
                  value={qualityLabel(streamQuality, t)}
                  onClick={() => setPanel('quality')}
                />
              )}
              {hasAudio && (
                <Row
                  icon={<Languages class="w-4 h-4" />}
                  label={t('playback.audioTracks')}
                  value={currentAudioLabel}
                  onClick={() => setPanel('audio')}
                />
              )}
              {showSubsSection && (
                <Row
                  icon={<Subtitles class="w-4 h-4" />}
                  label={t('playback.subtitleTracks')}
                  value={currentSubLabel}
                  onClick={() => setPanel('subtitles')}
                />
              )}
              {hasFill && (
                <Row
                  icon={
                    effectiveFill === 'cover' ? (
                      <Minimize2 class="w-4 h-4" />
                    ) : (
                      <Maximize2 class="w-4 h-4" />
                    )
                  }
                  label={t('interfaceSettings.videoFillMode')}
                  value={fillLabel}
                  onClick={() => setPanel('fill')}
                />
              )}
            </>
          )}

          {panel === 'quality' &&
            hasQuality &&
            QUALITY_OPTIONS.map((opt) => (
              <OptionBtn
                key={opt.value ?? 'auto'}
                selected={
                  (opt.value === streamQuality) || (opt.value == null && streamQuality == null)
                }
                label={t(opt.labelKey as 'playback.qualityAuto')}
                onClick={() => {
                  onQualityChange!(opt.value);
                  onClose();
                }}
              />
            ))}

          {panel === 'audio' &&
            hasAudio &&
            audioTracks.map((track) => (
              <OptionBtn
                key={track.id}
                selected={currentAudioTrack === track.id}
                label={getLanguageName(track.lang, track.name)}
                hint={track.default ? `(${t('playback.trackDefault')})` : undefined}
                onClick={() => {
                  onChangeAudioTrack!(track.id);
                  onClose();
                }}
              />
            ))}

          {panel === 'subtitles' && showSubsSection && (
            <>
              <OptionBtn
                selected={currentSubtitleTrack === -1}
                label={t('playback.subtitlesOff')}
                onClick={() => {
                  onChangeSubtitleTrack!(-1);
                  onClose();
                }}
              />
              {subtitleTracks.map((track) => (
                <OptionBtn
                  key={track.id}
                  selected={currentSubtitleTrack === track.id}
                  label={getLanguageName(track.lang, track.name)}
                  hint={track.default ? `(${t('playback.trackDefault')})` : undefined}
                  onClick={() => {
                    onChangeSubtitleTrack!(track.id);
                    onClose();
                  }}
                />
              ))}
            </>
          )}

          {panel === 'fill' && hasFill && (
            <>
              <OptionBtn
                selected={effectiveFill === 'contain'}
                label={t('interfaceSettings.videoFillModeContain')}
                onClick={() => {
                  persistVideoFillMode('contain');
                  onClose();
                }}
              />
              <OptionBtn
                selected={effectiveFill === 'cover'}
                label={t('interfaceSettings.videoFillModeCover')}
                onClick={() => {
                  persistVideoFillMode('cover');
                  onClose();
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
