import { Languages, Subtitles, X } from 'lucide-preact';

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

function getLanguageName(lang?: string, name?: string) {
  if (name) return name;
  if (!lang) return 'Inconnu';
  const langNames: Record<string, string> = {
    fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand',
    it: 'Italien', pt: 'Portugais', ru: 'Russe', ja: 'Japonais',
    zh: 'Chinois', ko: 'Coréen', ar: 'Arabe',
  };
  const langCode = lang.toLowerCase().split('-')[0];
  return langNames[langCode] || lang.toUpperCase();
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
  if (!showSubtitleSelector) return null;

  const buttonSize = isTV ? 'w-12 h-12' : isFullscreen ? 'w-10 h-10' : 'w-9 h-9';
  const textSize = isTV ? 'text-lg' : isFullscreen ? 'text-base' : 'text-sm';
  const titleSize = isTV ? 'text-2xl' : isFullscreen ? 'text-xl' : 'text-lg';
  const pad = isTV ? 'p-8' : isFullscreen ? 'p-6' : 'p-4';
  const itemPad = isTV ? 'p-4' : isFullscreen ? 'p-3' : 'p-2';
  const iconSize = isTV ? 'w-6 h-6' : isFullscreen ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div class="absolute inset-0 bg-black/90 z-50 flex flex-col">
      <div class={`flex items-center justify-between ${pad}`}>
        <h2 class={`${titleSize} font-bold text-white`}>Langues et Sous-titres</h2>
        <button onClick={onClose} class={`flex items-center justify-center ${buttonSize} rounded-full bg-white/10 hover:bg-white/20 transition-all border-2 border-white/20`}>
          <X class={`${iconSize} text-white`} />
        </button>
      </div>
      <div class={`flex-1 overflow-y-auto ${isTV ? 'px-8 pb-8' : isFullscreen ? 'px-6 pb-6' : 'px-4 pb-4'}`}>
        {audioTracks.length > 0 && (
          <div class="mb-8">
            <div class="flex items-center gap-3 mb-4">
              <Languages class={`${iconSize} text-white`} />
              <h3 class={`${isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-base'} font-semibold text-white`}>Pistes Audio</h3>
            </div>
            <div class="space-y-2">
              {audioTracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => { onChangeAudioTrack(track.id); onClose(); }}
                  class={`w-full text-left ${itemPad} rounded-lg transition-all ${currentAudioTrack === track.id ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'} ${textSize}`}
                >
                  {getLanguageName(track.lang, track.name)}
                  {track.default && <span class={`ml-2 ${isTV ? 'text-sm' : 'text-xs'} opacity-75`}>(Par défaut)</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div class="flex items-center gap-3 mb-4">
            <Subtitles class={`${iconSize} text-white`} />
            <h3 class={`${isTV ? 'text-xl' : isFullscreen ? 'text-lg' : 'text-base'} font-semibold text-white`}>Sous-titres</h3>
          </div>
          <div class="space-y-2">
            <button
              onClick={() => { onChangeSubtitleTrack(-1); onClose(); }}
              class={`w-full text-left ${itemPad} rounded-lg transition-all ${currentSubtitleTrack === -1 ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'} ${textSize}`}
            >
              Désactivés
            </button>
            {subtitleTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => { onChangeSubtitleTrack(track.id); onClose(); }}
                class={`w-full text-left ${itemPad} rounded-lg transition-all ${currentSubtitleTrack === track.id ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'} ${textSize}`}
              >
                {getLanguageName(track.lang, track.name)}
                {track.default && <span class={`ml-2 ${isTV ? 'text-sm' : 'text-xs'} opacity-75`}>(Par défaut)</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
