/** Libellé lisible pour un code / nom de piste audio ou sous-titre. */
export function getLanguageName(lang?: string, name?: string): string {
  if (name && name.trim() && !/^[a-z]{2}(-[A-Z]{2})?$/i.test(name.trim())) {
    return name;
  }
  const code = (lang || name || '').toLowerCase().split(/[-_]/)[0];
  if (!code) return '—';
  const langNames: Record<string, string> = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    ru: 'Русский',
    ja: '日本語',
    zh: '中文',
    ko: '한국어',
    ar: 'العربية',
    nl: 'Nederlands',
    pl: 'Polski',
    tr: 'Türkçe',
    sv: 'Svenska',
    da: 'Dansk',
    fi: 'Suomi',
    no: 'Norsk',
    cs: 'Čeština',
    hu: 'Magyar',
    ro: 'Română',
    el: 'Ελληνικά',
    he: 'עברית',
    hi: 'हिन्दी',
    th: 'ไทย',
    vi: 'Tiếng Việt',
    uk: 'Українська',
    und: 'Unknown',
  };
  return langNames[code] || (lang || name || code).toUpperCase();
}
