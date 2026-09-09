/** Sélection de la piste audio préférée (langue UX Popcornn / config lecteur). */

export type AudioTrackLike = {
  id: number;
  lang?: string | null;
  name?: string | null;
  title?: string | null;
  default?: boolean;
};

/** Alias courants (ffprobe ISO 639-2/B/T + titres release). */
const LANG_ALIASES: Record<string, string[]> = {
  fr: ['fr', 'fre', 'fra', 'frc', 'french', 'francais', 'vf', 'vff', 'vfq', 'truefrench'],
  en: ['en', 'eng', 'english'],
};

export function normalizeAudioLangToken(raw?: string | null): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** `auto` / vide → langue UX ; sinon préférence lecteur explicite. */
export function resolvePreferredAudioLanguage(
  playerDefault: string | null | undefined,
  uxLanguage: string | null | undefined,
): string {
  const player = (playerDefault || '').trim().toLowerCase();
  if (player && player !== 'auto' && player !== 'none') {
    return player.split(/[-_]/)[0] || player;
  }
  const ux = (uxLanguage || 'fr').trim().toLowerCase();
  return ux.split(/[-_]/)[0] || 'fr';
}

export function audioTrackMatchesPreferred(
  track: AudioTrackLike,
  preferred: string,
): boolean {
  const preferredNorm = normalizeAudioLangToken(preferred).split(/[-_]/)[0];
  if (!preferredNorm) return false;
  const aliases = LANG_ALIASES[preferredNorm] || [preferredNorm];

  const langCode = normalizeAudioLangToken(track.lang).split(/[-_]/)[0];
  if (langCode && aliases.includes(langCode)) return true;

  const haystack = [track.lang, track.name, track.title]
    .filter(Boolean)
    .map((s) => normalizeAudioLangToken(s as string))
    .join(' ');
  if (!haystack) return false;

  for (const alias of aliases) {
    if (alias.length <= 2) {
      if (new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, 'i').test(haystack)) return true;
    } else if (haystack.includes(alias)) {
      return true;
    }
  }
  return false;
}

/** Retourne l'`id` (index relatif audio) de la piste à sélectionner. */
export function pickPreferredAudioTrackId(
  tracks: AudioTrackLike[],
  preferredLang: string | null | undefined,
): number {
  if (!tracks.length) return 0;
  if (preferredLang) {
    const match = tracks.find((t) => audioTrackMatchesPreferred(t, preferredLang));
    if (match) return match.id;
  }
  const def = tracks.find((t) => t.default);
  if (def) return def.id;
  return tracks[0].id;
}
