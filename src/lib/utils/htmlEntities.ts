/**
 * Décode les entités HTML fréquentes dans du texte brut (titres TMDB / API parfois échappées).
 */
export function decodeHtmlEntities(input: string): string {
  if (input == null || input === '') return input;
  let s = input;
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => {
    const cp = parseInt(hex, 16);
    return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
  s = s.replace(/&#(\d+);/g, (m, dec: string) => {
    const cp = parseInt(dec, 10);
    return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
  s = s.replace(/&amp;/gi, '&');
  return s;
}
