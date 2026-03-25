import type { MediaDetailPageProps } from '../types';
import { QualityBadges } from './QualityBadges';

export function HeroHeader({ torrent }: { torrent: MediaDetailPageProps['torrent'] }) {
  const title = torrent.mainTitle || torrent.cleanTitle || torrent.name;
  const year = torrent.releaseDate ? new Date(torrent.releaseDate).getFullYear() : null;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 sm:mb-6">
        {torrent.logoUrl && (
          <img
            src={torrent.logoUrl}
            alt=""
            className="max-h-14 sm:max-h-16 md:max-h-20 lg:max-h-24 xl:max-h-28 w-auto object-contain object-left mb-3 sm:mb-4 drop-shadow-2xl"
            style={{ maxWidth: 'min(24rem, 85vw)' }}
          />
        )}
        <div className="flex items-baseline gap-4 flex-wrap">
          <h1
            className={`font-bold leading-tight ${
              torrent.logoUrl
                ? 'text-lg sm:text-xl md:text-2xl lg:text-3xl text-white/90'
                : 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl text-white'
            }`}
          >
            {title}
          </h1>
          {year != null && (
            <span className="text-white/50 font-normal text-xl sm:text-2xl md:text-3xl lg:text-4xl tabular-nums">
              {year}
            </span>
          )}
        </div>
        {torrent.quality && (
          <div className="mt-3 sm:mt-4">
            <QualityBadges quality={torrent.quality} />
          </div>
        )}
      </div>
    </div>
  );
}

