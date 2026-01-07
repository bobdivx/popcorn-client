import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { SeriesData } from '../../lib/client/types';

export default function SeriesDashboard() {
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await serverApi.getSeriesData();
      
      if (response.success && response.data) {
        setSeries(response.data);
      } else {
        setError(response.message || 'Erreur lors du chargement des séries');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (serie: SeriesData) => {
    window.location.href = `/player/${serie.id}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-base-100 px-4">
        <div className="alert alert-error max-w-2xl">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 text-base-content p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8">Séries</h1>
      
      {series.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-base-content/70 text-lg">Aucune série disponible</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {series.map((serie) => (
            <div
              key={serie.id}
              className="cursor-pointer group"
              onClick={() => handlePlay(serie)}
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-base-200 mb-2 group-hover:scale-105 transition-transform">
                {serie.poster ? (
                  <img
                    src={serie.poster}
                    alt={serie.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base-content/50 text-2xl">
                    {serie.title.charAt(0)}
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-base-content truncate">{serie.title}</p>
              {serie.firstAirDate && (
                <p className="text-xs text-base-content/60">
                  {new Date(serie.firstAirDate).getFullYear()}
                </p>
              )}
              {serie.rating && (
                <p className="text-xs text-primary">⭐ {serie.rating.toFixed(1)}</p>
              )}
              {serie.numberOfSeasons && (
                <p className="text-xs text-base-content/60">
                  {serie.numberOfSeasons} saison{serie.numberOfSeasons > 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
