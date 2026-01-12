import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import type { ContentItem } from '../../lib/client/types';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from './components/HeroSection';
import { ResumePoster } from './components/ResumePoster';
import { TorrentPoster } from './components/TorrentPoster';

export default function Dashboard() {
  const { data, loading, error } = useDashboardData();
  const { resumeWatching } = useResumeWatching();

  const handlePlay = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black">
        <span className="loading loading-spinner loading-lg text-white"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="alert alert-error max-w-2xl">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-4">
            Aucune donnée disponible
          </h2>
          <p className="text-gray-400 text-lg">
            Aucun contenu n'est disponible pour le moment.
          </p>
        </div>
      </div>
    );
  }

  // Préparer les données pour le hero (combiner films et séries populaires)
  const heroItems: ContentItem[] = [];
  if (data.hero) {
    heroItems.push(data.hero);
  }
  if (data.popularMovies && data.popularMovies.length > 0) {
    heroItems.push(...data.popularMovies.slice(0, 2));
  }
  if (data.popularSeries && data.popularSeries.length > 0) {
    heroItems.push(...data.popularSeries.slice(0, 2));
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Section Hero avec carousel */}
      {heroItems.length > 0 && (
        <HeroSection items={heroItems} onPlay={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
        {/* Section Reprendre la lecture */}
        {(resumeWatching.length > 0 || (data.continueWatching && data.continueWatching.length > 0)) && (
          <CarouselRow title="Reprendre la lecture">
            {(resumeWatching.length > 0 ? resumeWatching : data.continueWatching || []).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <ResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Films populaires */}
        {data.popularMovies && data.popularMovies.length > 0 && (
          <CarouselRow title="Films populaires">
            {data.popularMovies.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <TorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Séries populaires */}
        {data.popularSeries && data.popularSeries.length > 0 && (
          <CarouselRow title="Séries populaires">
            {data.popularSeries.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <TorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Ajouts récents */}
        {data.recentAdditions && data.recentAdditions.length > 0 && (
          <CarouselRow title="Ajouts récents">
            {data.recentAdditions.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <TorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
      </div>
    </div>
  );
}
