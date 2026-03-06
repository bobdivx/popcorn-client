/**
 * Mapping des genres TMDB français -> anglais
 * Utilisé pour traduire les genres stockés en DB lors de l'affichage
 */
const genreMapping: Record<string, { fr: string; en: string }> = {
  'Action': { fr: 'Action', en: 'Action' },
  'Adventure': { fr: 'Aventure', en: 'Adventure' },
  'Animation': { fr: 'Animation', en: 'Animation' },
  'Comedy': { fr: 'Comédie', en: 'Comedy' },
  'Crime': { fr: 'Crime', en: 'Crime' },
  'Documentary': { fr: 'Documentaire', en: 'Documentary' },
  'Drama': { fr: 'Drame', en: 'Drama' },
  'Family': { fr: 'Famille', en: 'Family' },
  'Fantasy': { fr: 'Fantastique', en: 'Fantasy' },
  'History': { fr: 'Histoire', en: 'History' },
  'Horror': { fr: 'Horreur', en: 'Horror' },
  'Music': { fr: 'Musique', en: 'Music' },
  'Mystery': { fr: 'Mystère', en: 'Mystery' },
  'Romance': { fr: 'Romance', en: 'Romance' },
  'Science Fiction': { fr: 'Science-Fiction', en: 'Science Fiction' },
  'TV Movie': { fr: 'Téléfilm', en: 'TV Movie' },
  'Thriller': { fr: 'Thriller', en: 'Thriller' },
  'War': { fr: 'Guerre', en: 'War' },
  'Western': { fr: 'Western', en: 'Western' },
};

/**
 * Traduit un genre selon la langue de l'interface
 */
export function translateGenre(genre: string, language: 'fr' | 'en'): string {
  // Chercher dans le mapping (insensible à la casse)
  const genreLower = genre.trim();
  
  // Chercher une correspondance exacte ou partielle
  for (const [key, translations] of Object.entries(genreMapping)) {
    if (key.toLowerCase() === genreLower.toLowerCase() || 
        translations.fr.toLowerCase() === genreLower.toLowerCase() ||
        translations.en.toLowerCase() === genreLower.toLowerCase()) {
      return translations[language];
    }
  }
  
  // Si pas trouvé, retourner le genre tel quel
  return genre;
}

/**
 * Traduit un tableau de genres
 */
export function translateGenres(genres: string[] | undefined, language: 'fr' | 'en'): string[] {
  if (!genres || !Array.isArray(genres)) {
    return [];
  }
  
  return genres.map(genre => translateGenre(genre, language));
}
