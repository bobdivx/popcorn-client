import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Languages,
  Maximize2,
  Minimize2,
  Settings,
  Subtitles,
  X,
} from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { persistVideoFillMode } from '../hooks/usePlayerConfig';
import { getLanguageName } from '../utils/languageName';
import { isMobileDevice } from '../../../../lib/utils/device-detection';

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
  isTV?: boolean;
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

/**
 * Menu paramètres unifié desktop / TV (panneau latéral).
 * Mobile : feuille bas d’écran responsive.
 */
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
  isTV = false,
}: PlayerSettingsMenuProps) {
  const { t } = useI18n();
  const [panel, setPanel] = useState<SettingsPanel>('root');
  const [focusIndex, setFocusIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = !isTV && isMobileDevice();
  const effectiveFill = videoFillMode ?? 'contain';

  const hasQuality = showQualitySelector && !!onQualityChange;
  const hasFill = videoFillMode !== undefined;
  const showAudio = !!onChangeAudioTrack;
  const showSubs = !!onChangeSubtitleTrack;

  const currentAudioLabel =
    audioTracks.length === 0
      ? t('playback.tracksUnavailable')
      : (() => {
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

  const itemCount = useMemo(() => {
    if (panel === 'root') {
      return (
        (hasQuality ? 1 : 0) +
        (showAudio ? 1 : 0) +
        (showSubs ? 1 : 0) +
        (hasFill ? 1 : 0) +
        1 // close
      );
    }
    if (panel === 'quality') return QUALITY_OPTIONS.length;
    if (panel === 'audio') return Math.max(1, audioTracks.length);
    if (panel === 'subtitles') return 1 + subtitleTracks.length;
    if (panel === 'fill') return 2;
    return 1;
  }, [panel, hasQuality, showAudio, showSubs, hasFill, audioTracks.length, subtitleTracks.length]);

  const activateAt = (index: number) => {
    if (panel === 'root') {
      const actions: Array<() => void> = [];
      if (hasQuality) actions.push(() => setPanel('quality'));
      if (showAudio) actions.push(() => setPanel('audio'));
      if (showSubs) actions.push(() => setPanel('subtitles'));
      if (hasFill) actions.push(() => setPanel('fill'));
      actions.push(onClose);
      actions[index]?.();
      return;
    }
    if (panel === 'quality' && onQualityChange) {
      const opt = QUALITY_OPTIONS[index];
      if (!opt) return;
      onQualityChange(opt.value);
      onClose();
      return;
    }
    if (panel === 'audio' && onChangeAudioTrack) {
      if (audioTracks.length === 0) {
        setPanel('root');
        return;
      }
      const track = audioTracks[index];
      if (!track) return;
      onChangeAudioTrack(track.id);
      onClose();
      return;
    }
    if (panel === 'subtitles' && onChangeSubtitleTrack) {
      if (index === 0) {
        onChangeSubtitleTrack(-1);
        onClose();
        return;
      }
      const track = subtitleTracks[index - 1];
      if (!track) return;
      onChangeSubtitleTrack(track.id);
      onClose();
      return;
    }
    if (panel === 'fill') {
      persistVideoFillMode(index === 0 ? 'contain' : 'cover');
      onClose();
    }
  };

  useEffect(() => {
    setFocusIndex(0);
  }, [panel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode ?? e.which;
      const key = e.key || '';
      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'Back' ||
        key === 'BrowserBack' ||
        kc === 27 ||
        kc === 8 ||
        kc === 461 ||
        kc === 10009;
      const isUp = key === 'ArrowUp' || kc === 38 || kc === 19;
      const isDown = key === 'ArrowDown' || kc === 40 || kc === 20;
      const isConfirm = key === 'Enter' || key === ' ' || kc === 13 || kc === 23 || kc === 66;

      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        if (panel !== 'root') setPanel('root');
        else onClose();
        return;
      }

      if (isUp || isDown) {
        e.preventDefault();
        e.stopPropagation();
        setFocusIndex((i) => {
          if (itemCount <= 0) return 0;
          if (isUp) return (i - 1 + itemCount) % itemCount;
          return (i + 1) % itemCount;
        });
        return;
      }

      if (isConfirm) {
        e.preventDefault();
        e.stopPropagation();
        activateAt(focusIndex);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, focusIndex, itemCount, onClose]);

  useEffect(() => {
    const el = panelRef.current?.querySelector<HTMLElement>(
      `[data-settings-focus="${focusIndex}"]`,
    );
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex, panel]);

  const pad = isMobile ? 'p-3' : isTV ? 'p-6' : 'p-5';
  const titleCls = isMobile ? 'text-base' : isTV ? 'text-2xl' : 'text-xl';
  const rowPad = isMobile ? 'px-3 py-3' : isTV ? 'px-5 py-4' : 'px-4 py-3.5';
  const rowText = isMobile ? 'text-sm' : isTV ? 'text-xl' : 'text-base';
  const rowSub = isMobile ? 'text-xs' : isTV ? 'text-base' : 'text-sm';
  const iconCls = isMobile ? 'w-5 h-5' : isTV ? 'w-7 h-7' : 'w-5 h-5';
  const btnRound = isMobile ? 'w-9 h-9' : isTV ? 'w-12 h-12' : 'w-10 h-10';

  let focusCursor = 0;
  const takeFocus = () => focusCursor++;

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
  }) => {
    const idx = takeFocus();
    const focused = focusIndex === idx;
    return (
      <button
        type="button"
        role="menuitem"
        data-settings-focus={idx}
        tabIndex={focused ? 0 : -1}
        class={`w-full flex items-center gap-3 ${rowPad} text-left transition-colors rounded-xl ${
          focused ? 'bg-white text-black' : 'text-white hover:bg-white/10'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <span class={`flex-shrink-0 ${focused ? 'text-black/70' : 'text-white/80'}`}>{icon}</span>
        <span class="flex-1 min-w-0">
          <span class={`block font-semibold ${rowText}`}>{label}</span>
          <span
            class={`block truncate mt-0.5 ${rowSub} ${focused ? 'text-black/55' : 'text-white/55'}`}
          >
            {value}
          </span>
        </span>
        <ChevronRight
          class={`${iconCls} flex-shrink-0 ${focused ? 'text-black/40' : 'text-white/35'}`}
        />
      </button>
    );
  };

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
  }) => {
    const idx = takeFocus();
    const focused = focusIndex === idx;
    return (
      <button
        type="button"
        role="menuitem"
        data-settings-focus={idx}
        tabIndex={focused ? 0 : -1}
        class={`w-full flex items-center gap-3 ${rowPad} text-left rounded-xl transition-colors ${rowText} ${
          focused
            ? 'bg-white text-black font-semibold'
            : selected
              ? 'bg-white/15 text-white font-medium'
              : 'text-white/90 hover:bg-white/10'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <span class="w-6 flex-shrink-0 flex justify-center">
          {selected ? (
            <Check class={`${iconCls} ${focused ? 'text-black' : 'text-white'}`} />
          ) : null}
        </span>
        <span class="flex-1 min-w-0">
          {label}
          {hint ? (
            <span class={`ml-1.5 ${rowSub} ${focused ? 'text-black/50' : 'text-white/50'}`}>
              {hint}
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  const shellCls = isMobile
    ? 'fixed inset-x-0 bottom-0 z-[9999] max-h-[85vh] rounded-t-2xl border border-white/15 border-b-0 bg-black/95 shadow-2xl backdrop-blur-md flex flex-col safe-area-pb'
    : 'fixed z-[9999] top-0 right-0 h-full w-[min(28rem,92vw)] bg-black/95 border-l border-white/15 shadow-2xl backdrop-blur-md flex flex-col';

  return (
    <>
      <div
        class="fixed inset-0 z-[9998] bg-black/55"
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
        ref={panelRef}
        class={shellCls}
        role="menu"
        aria-label={t('playback.playerSettings')}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={`flex items-center gap-3 ${pad} border-b border-white/10 shrink-0`}>
          {panel !== 'root' ? (
            <button
              type="button"
              class={`flex items-center justify-center ${btnRound} rounded-full hover:bg-white/10 text-white transition-colors`}
              onClick={(e) => {
                e.stopPropagation();
                setPanel('root');
              }}
              aria-label={t('common.back')}
            >
              <ArrowLeft class={iconCls} />
            </button>
          ) : (
            <Settings class={`${iconCls} text-white/70`} />
          )}
          <h3 class={`flex-1 font-semibold text-white tracking-wide ${titleCls}`}>{panelTitle}</h3>
          {panel === 'root' ? (
            <button
              type="button"
              data-settings-focus={itemCount - 1}
              tabIndex={focusIndex === itemCount - 1 ? 0 : -1}
              class={`flex items-center justify-center ${btnRound} rounded-full transition-colors ${
                focusIndex === itemCount - 1
                  ? 'bg-white text-black'
                  : 'hover:bg-white/10 text-white'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={t('common.close')}
            >
              <X class={iconCls} />
            </button>
          ) : (
            <button
              type="button"
              class={`flex items-center justify-center ${btnRound} rounded-full hover:bg-white/10 text-white transition-colors`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={t('common.close')}
            >
              <X class={iconCls} />
            </button>
          )}
        </div>

        <div class={`flex-1 overflow-y-auto ${pad} space-y-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]`}>
          {panel === 'root' && (
            <>
              {hasQuality && (
                <Row
                  icon={<Settings class={iconCls} />}
                  label={t('playback.quality')}
                  value={qualityLabel(streamQuality, t)}
                  onClick={() => setPanel('quality')}
                />
              )}
              {showAudio && (
                <Row
                  icon={<Languages class={iconCls} />}
                  label={t('playback.audioTracks')}
                  value={currentAudioLabel}
                  onClick={() => setPanel('audio')}
                />
              )}
              {showSubs && (
                <Row
                  icon={<Subtitles class={iconCls} />}
                  label={t('playback.subtitleTracks')}
                  value={currentSubLabel}
                  onClick={() => setPanel('subtitles')}
                />
              )}
              {hasFill && (
                <Row
                  icon={
                    effectiveFill === 'cover' ? (
                      <Minimize2 class={iconCls} />
                    ) : (
                      <Maximize2 class={iconCls} />
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
                  opt.value === streamQuality || (opt.value == null && streamQuality == null)
                }
                label={t(opt.labelKey as 'playback.qualityAuto')}
                onClick={() => {
                  onQualityChange!(opt.value);
                  onClose();
                }}
              />
            ))}

          {panel === 'audio' && showAudio && (
            <>
              {audioTracks.length === 0 ? (
                <p class={`px-2 py-4 text-white/60 ${rowText}`}>{t('playback.tracksUnavailable')}</p>
              ) : (
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
                ))
              )}
            </>
          )}

          {panel === 'subtitles' && showSubs && (
            <>
              <OptionBtn
                selected={currentSubtitleTrack === -1}
                label={t('playback.subtitlesOff')}
                onClick={() => {
                  onChangeSubtitleTrack!(-1);
                  onClose();
                }}
              />
              {subtitleTracks.length === 0 ? (
                <p class={`px-2 py-3 text-white/50 ${rowSub}`}>{t('playback.noSubtitleTracks')}</p>
              ) : (
                subtitleTracks.map((track) => (
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
                ))
              )}
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
