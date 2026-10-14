import type { MediaDetailPageProps } from '../types';

export function HeroHeader({
  torrent,
  displayTitle,
}: {
  torrent: MediaDetailPageProps['torrent'];
  /** Titre déjà résolu (TMDB API + champs torrent). */
  displayTitle: string;
  /** @deprecated Langues affichées dans TorrentInfo avec la qualité (évite le doublon Multi). */
  availableLanguages?: string[];
}) {
  const title = displayTitle.trim() || torrent.name;
  const year = torrent.releaseDate ? new Date(torrent.releaseDate).getFullYear() : null;

  // Design éditorial sur toutes les plateformes (web, mobile, TV/webOS).
    return (
      <div className="ed-detail-head ds-stream-cascade mb-10 sm:mb-12">
        {torrent.logoUrl && <img data-stream-item src={torrent.logoUrl} alt="" className="ed-logo drop-shadow-2xl" style={{ maxWidth: 'min(22rem, 80vw)' }} />}
        {year != null && <p data-stream-item className="ed-kicker">{year}</p>}
        <h1 data-stream-item className="ed-title">{title}</h1>
        <span data-stream-item className="ed-rule" aria-hidden />
      </div>
    );
}
