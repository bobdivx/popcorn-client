import { useEffect } from 'preact/hooks';
import { Languages, Subtitles, X } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { getLanguageName } from '../utils/languageName';

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

interface SubtitleSelectorProps {
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: number;
  currentSubtitleTrack: number;
  showSubtitleSelector: boolean;
  onChangeAudioTrack: (trackId: number) => void;
  onChangeSubtitleTrack: (trackId: number) => void;
  onClose: () => void;
  isTV?: boolean;
  isFullscreen?: boolean;
}

export function SubtitleSelector({
  audioTracks,
  subtitleTracks,
  currentAudioTrack,
  currentSubtitleTrack,
  showSubtitleSelector,
  onChangeAudioTrack,
  onChangeSubtitleTrack,
  onClose,
  isTV = false,
  isFullscreen = false,
}: SubtitleSelectorProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!showSubtitleSelector) return;
    const onKey = (e: KeyboardEvent) => {
      const kc = e.keyCode ?? e.which;
      const isBack =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'Back' ||
        e.key === 'BrowserBack' ||
        kc === 27 ||
        kc === 8 ||
        kc === 461 ||
        kc === 10009;
      if (!isBack) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [showSubtitleSelector, onClose]);

  if (!showSubtitleSelector) return null;

  const buttonSize = isTV ? 'w-12 h-12' : isFullscreen ? 'w-10 h-10' : 'w-9 h-9';
  const textSize = isTV ? 'text-lg' : isFullscreen ? 'text-base' : 'text-sm';
  const titleSize = isTV ? 'text-2xl' : isFullscreen ? 'text-xl' : 'text-lg';
  const pad = isTV ? 'p-8' : isFullscreen ? 'p-6' : 'p-4';
  const itemPad = isTV ? 'p-4' : isFullscreen ? 'p-3' : 'p-2.5';
  const iconSize = isTV ? 'w-6 h-6' : isFullscreen ? 'w-5 h-5' : 'w-4 h-4';

  const TrackBtn = ({
    selected,
    label,
    isDefault,
    onClick,
  }: {
    selected: boolean;
    label: string;
    isDefault?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      class={`w-full text-left ${itemPad} rounded-xl transition-all border ${
        selected
          ? 'bg-white text-black border-white font-semibold'
          : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
      } ${textSize}`}
    >
      {label}
      {isDefault && (
        <span class={`ml-2 ${isTV ? 'text-sm' : 'text-xs'} opacity-60`}>
          ({t('playback.trackDefault')})
        </span>
      )}
    </button>
  );

  return (
    <div class="absolute inset-0 bg-black/92 z-50 flex flex-col backdrop-blur-sm">
      <div class={`flex items-center justify-between ${pad}`}>
        <h2 class={`${titleSize} font-bold text-white`}>{t('playback.languagesAndSubtitles')}</h2>
        <button
          type="button"
          onClick={onClose}
          class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20`}
          aria-label={t('common.close')}
        >
          <X class={`${iconSize} text-white`} />
        </button>
      </div>
      <div
        class={`flex-1 overflow-y-auto ${
          isTV ? 'px-8 pb-8' : isFullscreen ? 'px-6 pb-6' : 'px-4 pb-4'
        }`}
      >
        <div class={`grid gap-8 ${isTV || isFullscreen ? 'md:grid-cols-2' : 'sm:grid-cols-2'}`}>
          {audioTracks.length > 0 && (
            <div>
              <div class="flex items-center gap-3 mb-4">
                <Languages class={`${iconSize} text-white`} />
                <h3
                  class={`${
                    isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-base'
                  } font-semibold text-white`}
                >
                  {t('playback.audioTracks')}
                </h3>
              </div>
              <div class="space-y-2">
                {audioTracks.map((track) => (
                  <TrackBtn
                    key={track.id}
                    selected={currentAudioTrack === track.id}
                    label={getLanguageName(track.lang, track.name)}
                    isDefault={track.default}
                    onClick={() => {
                      onChangeAudioTrack(track.id);
                      onClose();
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <div class="flex items-center gap-3 mb-4">
              <Subtitles class={`${iconSize} text-white`} />
              <h3
                class={`${
                  isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-base'
                } font-semibold text-white`}
              >
                {t('playback.subtitleTracks')}
              </h3>
            </div>
            <div class="space-y-2">
              <TrackBtn
                selected={currentSubtitleTrack === -1}
                label={t('playback.subtitlesOff')}
                onClick={() => {
                  onChangeSubtitleTrack(-1);
                  onClose();
                }}
              />
              {subtitleTracks.map((track) => (
                <TrackBtn
                  key={track.id}
                  selected={currentSubtitleTrack === track.id}
                  label={getLanguageName(track.lang, track.name)}
                  isDefault={track.default}
                  onClick={() => {
                    onChangeSubtitleTrack(track.id);
                    onClose();
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
