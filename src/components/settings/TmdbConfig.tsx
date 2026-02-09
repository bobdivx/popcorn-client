import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { getUserConfig } from '../../lib/api/popcorn-web';
import { isTmdbKeyMaskedOrInvalid } from '../../lib/utils/tmdb-key';

export default function TmdbConfig() {
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbHasKey, setTmdbHasKey] = useState(false);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const [tmdbTesting, setTmdbTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const cloudFallbackDone = useRef(false);

  useEffect(() => {
    loadTmdbKey();
  }, []);

  const loadTmdbKey = async () => {
    try {
      setTmdbLoading(true);
      const response = await serverApi.getTmdbKey();

      if (response.success && response.data) {
        const hasKey = response.data.hasKey === true || (response.data as any).hasKey === 1;
        setTmdbHasKey(hasKey);

        if (hasKey) {
          setTmdbKey('••••••••••••••••••••••••');
        } else {
          setTmdbKey('');
          // Fallback: si le backend n'a pas de clé, tenter une fois de récupérer depuis le cloud (après reset / import)
          if (!cloudFallbackDone.current) {
            cloudFallbackDone.current = true;
            try {
              const cloudConfig = await getUserConfig();
              if (cloudConfig?.tmdbApiKey && !isTmdbKeyMaskedOrInvalid(cloudConfig.tmdbApiKey)) {
                const res = await serverApi.saveTmdbKey(cloudConfig.tmdbApiKey.trim().replace(/\s+/g, ''));
                if (res.success) {
                  await loadTmdbKey();
                  return;
                }
              }
            } catch {
              // Ignorer (pas de token cloud ou erreur réseau)
            }
          }
        }
      } else {
        setTmdbHasKey(false);
        setTmdbKey('');
      }
    } catch (err) {
      console.error('Erreur lors du chargement du token TMDB:', err);
      setTmdbHasKey(false);
      setTmdbKey('');
    } finally {
      setTmdbLoading(false);
    }
  };

  const saveTmdbKey = async () => {
    const trimmedKey = tmdbKey.trim();
    
    if (!trimmedKey || trimmedKey === '••••••••••••••••••••••••') {
      setError('La clé API TMDB ne peut pas être vide');
      return;
    }

    try {
      setTmdbLoading(true);
      setError('');
      setSuccess('');
      
      const response = await serverApi.saveTmdbKey(trimmedKey);
      
      if (response.success) {
        setSuccess('Token TMDB sauvegardé avec succès');
        await loadTmdbKey();
      } else {
        setError(response.message || 'Erreur lors de la sauvegarde du token TMDB');
      }
    } catch (err) {
      console.error('Erreur lors de la sauvegarde du token TMDB:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde du token TMDB');
    } finally {
      setTmdbLoading(false);
    }
  };

  const testTmdbKey = async () => {
    const trimmedKey = tmdbKey?.trim() || '';
    const isPlaceholder = trimmedKey === '••••••••••••••••••••••••';
    
    // Si c'est le placeholder masqué et qu'une clé existe, tester via le backend
    if (isPlaceholder && tmdbHasKey) {
      try {
        setTmdbTesting(true);
        setError('');
        setSuccess('');
        
        const response = await serverApi.testTmdbKey();
        
        if (response.success && response.data) {
          if (response.data.valid) {
            setSuccess('Clé API TMDB configurée et valide !');
          } else {
            setError(response.data.message || 'La clé API TMDB configurée n\'est pas valide');
          }
        } else {
          setError(response.message || 'Erreur lors du test de la clé TMDB');
        }
      } catch (err) {
        console.error('Erreur lors du test du token TMDB:', err);
        setError(err instanceof Error ? err.message : 'Erreur lors du test du token TMDB');
      } finally {
        setTmdbTesting(false);
      }
      return;
    }
    
    // Sinon, tester la clé saisie directement
    if (!trimmedKey) {
      setError('Veuillez saisir une clé API TMDB pour la tester');
      return;
    }

    try {
      setTmdbTesting(true);
      setError('');
      setSuccess('');
      
      const testUrl = `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(trimmedKey)}`;
      const response = await fetch(testUrl);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Clé API TMDB invalide');
        }
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data) {
        setSuccess('Clé API TMDB valide !');
      }
    } catch (err) {
      console.error('Erreur lors du test du token TMDB:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du test du token TMDB');
    } finally {
      setTmdbTesting(false);
    }
  };

  const deleteTmdbKey = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer le token TMDB ?')) {
      return;
    }

    try {
      setTmdbLoading(true);
      setError('');
      setSuccess('');
      
      const response = await serverApi.deleteTmdbKey();
      
      if (response.success) {
        setSuccess('Token TMDB supprimé avec succès');
        await loadTmdbKey();
      } else {
        setError(response.message || 'Erreur lors de la suppression du token TMDB');
      }
    } catch (err) {
      console.error('Erreur lors de la suppression du token TMDB:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression du token TMDB');
    } finally {
      setTmdbLoading(false);
    }
  };

  return (
    <div class="relative rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
      {/* Image de fond avec overlay */}
      <div 
        class="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/9yBVqNruk6Ykrwc32qrK2TIE5xw.jpg')`,
        }}
      >
        {/* Overlay sombre pour la lisibilité */}
        <div class="absolute inset-0 bg-gradient-to-br from-gray-900/95 via-gray-900/90 to-gray-900/95"></div>
        {/* Overlay avec effet de film */}
        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
      </div>

      {/* Contenu avec position relative */}
      <div class="relative z-10 p-6 sm:p-8 md:p-12">
        {/* En-tête avec logo TMDB */}
        <div class="flex items-center justify-between mb-6 sm:mb-8">
          <div class="flex items-center gap-4">
            {/* Logo TMDB */}
            <div class="flex items-center gap-3">
              <div class="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-3 border border-white/20">
                <svg 
                  width="40" 
                  height="40" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-8 h-8 sm:w-10 sm:h-10"
                >
                  <path 
                    d="M18.5 0H5.5C2.46 0 0 2.46 0 5.5V18.5C0 21.54 2.46 24 5.5 24H18.5C21.54 24 24 21.54 24 18.5V5.5C24 2.46 21.54 0 18.5 0Z" 
                    fill="#0D253F"
                  />
                  <path 
                    d="M12 4L14.5 9.5L20 10L15.5 13.5L17 19L12 15.5L7 19L8.5 13.5L4 10L9.5 9.5L12 4Z" 
                    fill="#01B4E4"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold text-white drop-shadow-lg">
                  Configuration TMDB
                </h2>
                <p class="text-white/80 text-sm sm:text-base mt-1">The Movie Database</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div class="alert alert-error text-sm sm:text-base md:text-lg p-3 sm:p-4 md:p-5 mb-4 bg-red-900/90 backdrop-blur-sm border-red-600/50">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div class="alert alert-success text-sm sm:text-base md:text-lg p-3 sm:p-4 md:p-5 mb-4 bg-green-900/90 backdrop-blur-sm border-green-600/50">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        {/* Carte de contenu avec fond semi-transparent */}
        <div class="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 p-6 sm:p-8 shadow-xl">
          <div class="space-y-4 sm:space-y-6 md:space-y-8">
            <div>
              <label class="label pb-2 sm:pb-3">
                <span class="label-text font-semibold text-sm sm:text-base md:text-lg lg:text-xl text-white drop-shadow-md">Clé API TMDB</span>
                {tmdbHasKey && (
                  <span class="badge badge-success text-xs sm:text-sm md:text-base ml-2 bg-green-600/80 backdrop-blur-sm border-green-400/50">✓ Configurée</span>
                )}
              </label>
              <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4">
                <input
                  type="text"
                  class="input input-bordered flex-1 text-sm sm:text-base md:text-lg lg:text-xl px-3 sm:px-4 md:px-5 py-2 sm:py-3 md:py-4 min-h-[44px] sm:min-h-[48px] md:min-h-[52px] focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 bg-white/10 border-white/20 text-white placeholder:text-white/60 backdrop-blur-sm"
                  placeholder={tmdbHasKey ? "Clé API TMDB configurée (masquée)" : "Entrez votre clé API TMDB"}
                  value={tmdbKey || ''}
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value || '';
                    if (tmdbHasKey && value !== '••••••••••••••••••••••••') {
                      setTmdbKey(value);
                    } else if (!tmdbHasKey) {
                      setTmdbKey(value);
                    }
                  }}
                  onChange={(e) => {
                    const value = (e.target as HTMLInputElement).value || '';
                    if (tmdbHasKey && value !== '••••••••••••••••••••••••') {
                      setTmdbKey(value);
                    } else if (!tmdbHasKey) {
                      setTmdbKey(value);
                    }
                  }}
                  onFocus={(e) => {
                    if (tmdbHasKey && tmdbKey === '••••••••••••••••••••••••') {
                      setTmdbKey('');
                    }
                  }}
                  disabled={tmdbLoading}
                />
                <button
                  class="btn text-sm sm:text-base md:text-lg px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 min-h-[44px] sm:min-h-[48px] md:min-h-[52px] bg-[#01B4E4] hover:bg-[#01A0D0] border-[#01B4E4] text-white shadow-lg"
                  onClick={saveTmdbKey}
                  disabled={tmdbLoading || tmdbTesting || !tmdbKey || tmdbKey.trim().length === 0 || tmdbKey === '••••••••••••••••••••••••'}
                >
                  {tmdbLoading ? (
                    <span class="loading loading-spinner loading-sm"></span>
                  ) : (
                    'Sauvegarder'
                  )}
                </button>
                <button
                  class="btn text-sm sm:text-base md:text-lg px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 min-h-[44px] sm:min-h-[48px] md:min-h-[52px] bg-white/10 hover:bg-white/20 border-white/30 text-white backdrop-blur-sm"
                  onClick={testTmdbKey}
                  disabled={tmdbTesting || tmdbLoading || ((!tmdbKey || (tmdbKey || '').trim().length === 0) && !tmdbHasKey)}
                  title={tmdbHasKey && tmdbKey === '••••••••••••••••••••••••' ? 'Tester la clé configurée via le serveur' : 'Tester la clé saisie'}
                >
                  {tmdbTesting ? (
                    <>
                      <span class="loading loading-spinner loading-sm"></span>
                      Test en cours...
                    </>
                  ) : (
                    'Tester'
                  )}
                </button>
              </div>
            </div>
            {tmdbHasKey && (
              <div class="mt-4 sm:mt-6">
                <button
                  class="btn btn-outline text-sm sm:text-base md:text-lg px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 min-h-[44px] sm:min-h-[48px] md:min-h-[52px] border-red-500/50 text-red-300 hover:bg-red-500/20 backdrop-blur-sm w-full sm:w-auto"
                  onClick={deleteTmdbKey}
                  disabled={tmdbLoading}
                >
                  Supprimer le token TMDB
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
