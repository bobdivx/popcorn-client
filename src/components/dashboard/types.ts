export interface Torrent {
  id: string;
  slug?: string | null;
  name: string;
  cleanTitle?: string;
  description?: string | null;
  category?: string;
  imageUrl?: string | null;
  fileSize: number;
  createdAt: number;
  downloadCount: number;
  seedCount: number;
  leechCount: number;
  uploader: string;
  infoHash?: string | null;
  variantCount?: number;
  seasonCount?: number;
  tmdbId?: number | null;
  tmdbType?: string | null;
}

export interface ResumeWatching {
  torrent: Torrent;
  progress: number;
  lastWatched: number;
}
