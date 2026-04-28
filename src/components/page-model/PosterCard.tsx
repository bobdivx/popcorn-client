import type { ContentItem } from '../../lib/client/types';
import { LazyTorrentPoster } from '../dashboard/components/LazyTorrentPoster';

interface PosterCardProps {
  item: ContentItem;
  onNavigate: (item: ContentItem) => void;
}

export function PosterCard({ item, onNavigate }: PosterCardProps) {
  const handleNavigate = () => onNavigate(item);

  return (
    <div
      className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]"
      onClickCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        handleNavigate();
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          handleNavigate();
        }
      }}
    >
      <LazyTorrentPoster item={{ ...item, infoHash: '' }} />
    </div>
  );
}
