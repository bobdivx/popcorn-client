/**
 * Bibliothèque de démonstration intégrée (comptes de démonstration, ex. compte de revue Google Play).
 *
 * Activée quand l'URL serveur enregistrée dans le compte cloud vaut DEMO_LIBRARY_BACKEND_URL
 * (voir backend-config.ts) : aucun serveur réel n'est contacté, aucun contenu personnel n'est exposé.
 *
 * Contenu exclusivement libre de droits : films ouverts de la Blender Foundation (Creative Commons BY)
 * et classiques du domaine public, diffusés depuis Wikimedia Commons (fichiers transcodés officiels).
 */

export interface DemoLibraryEntry {
  slug: string;
  title: string;
  streamUrl: string;
  imageUrl: string;
  releaseDate: string;
  genres: string[];
  synopsis: string;
  credit: string;
  runtimeMinutes: number;
  sourcePage: string;
}

export const DEMO_LIBRARY_ENTRIES: readonly DemoLibraryEntry[] = [
  {
    slug: "big-buck-bunny",
    title: "Big Buck Bunny",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Big_Buck_Bunny_4K.webm/1280px-seek%3D95-Big_Buck_Bunny_4K.webm.jpg",
    releaseDate: "2008-05-30",
    genres: ["Animation", "Comedy"],
    synopsis: "A giant, gentle rabbit takes comic revenge on three bullies who torment the forest's small creatures.",
    credit: "Blender Foundation | CC BY 3.0",
    runtimeMinutes: 10,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm",
  },
  {
    slug: "elephants-dream",
    title: "Elephants Dream",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/28/Elephants_Dream_%282006%29_1080p24.webm/Elephants_Dream_%282006%29_1080p24.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Elephants_Dream_%282006%29_1080p24.webm/1280px-seek%3D130-Elephants_Dream_%282006%29_1080p24.webm.jpg",
    releaseDate: "2006-03-24",
    genres: ["Animation", "Science Fiction"],
    synopsis: "Two men explore a strange, ever-changing mechanical world. The first Blender open movie.",
    credit: "Orange Open Movie Project / Blender Foundation | CC BY 2.5",
    runtimeMinutes: 11,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Elephants_Dream_(2006)_1080p24.webm",
  },
  {
    slug: "sintel",
    title: "Sintel",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Sintel_movie_4K.webm/1280px-seek%3D250-Sintel_movie_4K.webm.jpg",
    releaseDate: "2010-09-27",
    genres: ["Animation", "Fantasy"],
    synopsis: "A lonely young woman searches the world for the baby dragon she once rescued.",
    credit: "Blender Foundation | CC BY 3.0",
    runtimeMinutes: 15,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm",
  },
  {
    slug: "tears-of-steel",
    title: "Tears of Steel",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/1/10/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm/1280px-seek%3D160-Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm.jpg",
    releaseDate: "2012-09-26",
    genres: ["Science Fiction"],
    synopsis: "In a future Amsterdam, a group of scientists tries to save the world from destructive robots.",
    credit: "Blender Foundation | CC BY 3.0",
    runtimeMinutes: 12,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm",
  },
  {
    slug: "caminandes-llamigos",
    title: "Caminandes 3: Llamigos",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm/1280px-seek%3D40-Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm.jpg",
    releaseDate: "2016-01-30",
    genres: ["Animation", "Comedy"],
    synopsis: "Koro the llama meets a penguin with a taste for the same winter berries.",
    credit: "Blender Institute | CC BY 3.0",
    runtimeMinutes: 3,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm",
  },
  {
    slug: "spring",
    title: "Spring",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a5/Spring_-_Blender_Open_Movie.webm/Spring_-_Blender_Open_Movie.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Spring_-_Blender_Open_Movie.webm/1280px-seek%3D200-Spring_-_Blender_Open_Movie.webm.jpg",
    releaseDate: "2019-04-04",
    genres: ["Animation", "Fantasy"],
    synopsis: "A shepherd girl and her dog face ancient spirits to continue the cycle of life.",
    credit: "Blender Animation Studio | CC BY 4.0",
    runtimeMinutes: 8,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Spring_-_Blender_Open_Movie.webm",
  },
  {
    slug: "a-trip-to-the-moon",
    title: "A Trip to the Moon",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/6d/Le_Voyage_dans_la_Lune_%281902%29.webm/Le_Voyage_dans_la_Lune_%281902%29.webm.1080p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Le_Voyage_dans_la_Lune_%281902%29.webm/1280px-seek%3D330-Le_Voyage_dans_la_Lune_%281902%29.webm.jpg",
    releaseDate: "1902-09-01",
    genres: ["Science Fiction", "Adventure"],
    synopsis: "Georges Melies' classic: astronomers fly a capsule to the Moon and meet its inhabitants.",
    credit: "Georges Melies, 1902 | Public domain",
    runtimeMinutes: 13,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Le_Voyage_dans_la_Lune_(1902).webm",
  },
  {
    slug: "nosferatu",
    title: "Nosferatu",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/7/78/Nosferatu_%281922%29.webm/Nosferatu_%281922%29.webm.480p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Nosferatu_%281922%29.webm/1280px-seek%3D1500-Nosferatu_%281922%29.webm.jpg",
    releaseDate: "1922-03-04",
    genres: ["Horror", "Classic"],
    synopsis: "F. W. Murnau's silent classic about the vampire Count Orlok.",
    credit: "F. W. Murnau, 1922 | Public domain",
    runtimeMinutes: 94,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Nosferatu_(1922).webm",
  },
  {
    slug: "the-general",
    title: "The General",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ee/The_General_%281926%29.webm/The_General_%281926%29.webm.480p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/The_General_%281926%29.webm/1280px-seek%3D1200-The_General_%281926%29.webm.jpg",
    releaseDate: "1926-12-31",
    genres: ["Comedy", "Action"],
    synopsis: "Buster Keaton chases a stolen locomotive in this silent comedy classic.",
    credit: "Buster Keaton, 1926 | Public domain",
    runtimeMinutes: 78,
    sourcePage: "https://commons.wikimedia.org/wiki/File:The_General_(1926).webm",
  },
  {
    slug: "charade",
    title: "Charade",
    streamUrl:
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/dc/Charade_%281963%29.webm/Charade_%281963%29.webm.480p.vp9.webm",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Charade_%281963%29.webm/1280px-seek%3D600-Charade_%281963%29.webm.jpg",
    releaseDate: "1963-12-05",
    genres: ["Thriller", "Comedy"],
    synopsis: "Cary Grant and Audrey Hepburn in a romantic thriller about a missing fortune.",
    credit: "Stanley Donen, 1963 | Public domain (US)",
    runtimeMinutes: 113,
    sourcePage: "https://commons.wikimedia.org/wiki/File:Charade_(1963).webm",
  },
];

/** Entrées au format GET /library (LibraryMedia) : lecture directe via demo_stream_url. */
export function getDemoLibraryMedia(): Record<string, unknown>[] {
  const now = Math.floor(Date.now() / 1000);
  return DEMO_LIBRARY_ENTRIES.map((entry, index) => ({
    info_hash: `local_demo_${entry.slug}`,
    name: entry.title,
    download_path: entry.sourcePage,
    file_size: null,
    exists: true,
    is_file: true,
    is_directory: false,
    slug: `local_demo_${entry.slug}`,
    category: 'FILM',
    tmdb_id: null,
    tmdb_type: 'movie',
    poster_url: entry.imageUrl,
    hero_image_url: entry.imageUrl,
    synopsis: `${entry.synopsis} (${entry.credit} - via Wikimedia Commons)`,
    release_date: entry.releaseDate,
    genres: JSON.stringify(entry.genres),
    vote_average: null,
    runtime: entry.runtimeMinutes,
    quality: null,
    resolution: null,
    video_codec: 'vp9',
    audio_codec: null,
    language: null,
    source_format: 'webm',
    is_local_only: true,
    added_at: now - index * 3600,
    demo_stream_url: entry.streamUrl,
  }));
}
