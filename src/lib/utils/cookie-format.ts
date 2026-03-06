/**
 * Convertit une chaîne collée par l'utilisateur en chaîne d'en-tête Cookie.
 * Si c'est un JSON tableau (export Cookie-Editor : [{name, value}, ...]),
 * retourne "name=value; name2=value2". Sinon retourne la chaîne telle quelle.
 */
export function normalizeCookieInput(input: string): string {
  const trimmed = input?.trim() ?? '';
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith('[')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return trimmed;
    const parts: string[] = [];
    for (const item of parsed) {
      if (item && typeof item.name === 'string' && typeof item.value === 'string') {
        parts.push(`${item.name}=${item.value}`);
      }
    }
    return parts.length > 0 ? parts.join('; ') : trimmed;
  } catch {
    return trimmed;
  }
}
