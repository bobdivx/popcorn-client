import { useState } from 'preact/hooks';
import { X, Sliders } from 'lucide-preact';

interface FiltersPanelProps {
  codecs?: ('x264' | 'x265' | 'AV1')[];
  selectedCodecs?: ('x264' | 'x265' | 'AV1')[];
  minFileSize?: number; // en bytes
  maxFileSize?: number; // en bytes
  onCodecChange?: (codecs: ('x264' | 'x265' | 'AV1')[]) => void;
  onFileSizeChange?: (min: number | undefined, max: number | undefined) => void;
  onClose?: () => void;
  isOpen?: boolean;
}

/**
 * Panneau de filtres avancés avec effet glassmorphic
 * 
 * Filtres disponibles :
 * - Codec vidéo (x265, AV1, x264)
 * - Taille de fichier (range slider)
 */
export function FiltersPanel({
  codecs = ['x264', 'x265', 'AV1'],
  selectedCodecs = [],
  minFileSize,
  maxFileSize,
  onCodecChange,
  onFileSizeChange,
  onClose,
  isOpen = false,
}: FiltersPanelProps) {
  const [localSelectedCodecs, setLocalSelectedCodecs] = useState<('x264' | 'x265' | 'AV1')[]>(selectedCodecs);
  const [localMinFileSize, setLocalMinFileSize] = useState<number | undefined>(minFileSize);
  const [localMaxFileSize, setLocalMaxFileSize] = useState<number | undefined>(maxFileSize);

  const handleCodecToggle = (codec: 'x264' | 'x265' | 'AV1') => {
    const newCodecs = localSelectedCodecs.includes(codec)
      ? localSelectedCodecs.filter(c => c !== codec)
      : [...localSelectedCodecs, codec];
    setLocalSelectedCodecs(newCodecs);
    onCodecChange?.(newCodecs);
  };

  const handleFileSizeMinChange = (value: number) => {
    setLocalMinFileSize(value || undefined);
    onFileSizeChange?.(value || undefined, localMaxFileSize);
  };

  const handleFileSizeMaxChange = (value: number) => {
    setLocalMaxFileSize(value || undefined);
    onFileSizeChange?.(localMinFileSize, value || undefined);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[45] transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-screen w-96 max-w-[90vw] z-50 transform transition-transform duration-300 ease-out glass-panel-lg border-l border-white/10 shadow-2xl overflow-y-auto">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Sliders className="w-6 h-6 tv:w-7 tv:h-7 text-primary" size={24} />
              <h2 className="text-xl tv:text-2xl font-bold text-white">Filtres Avancés</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-glass-hover rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50"
              aria-label="Fermer les filtres"
              tabIndex={0}
            >
              <X className="w-5 h-5 tv:w-6 tv:h-6" size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Filtres Codec */}
            <div>
              <h3 className="text-lg tv:text-xl font-semibold text-white mb-4">Codec Vidéo</h3>
              <div className="flex flex-wrap gap-3">
                {codecs.map((codec) => {
                  const isSelected = localSelectedCodecs.includes(codec);
                  return (
                    <button
                      key={codec}
                      onClick={() => handleCodecToggle(codec)}
                      className={`px-4 py-2 tv:px-6 tv:py-3 rounded-lg font-semibold text-sm tv:text-base transition-all duration-200 min-h-[40px] tv:min-h-[48px] focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 ${
                        isSelected
                          ? 'bg-primary shadow-primary-lg text-white border border-primary-400/50'
                          : 'bg-glass glass-panel text-gray-300 hover:text-white border border-white/20 hover:bg-glass-hover'
                      }`}
                      tabIndex={0}
                    >
                      {codec === 'x265' ? 'H.265' : codec === 'x264' ? 'H.264' : codec}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtres Taille de Fichier */}
            <div>
              <h3 className="text-lg tv:text-xl font-semibold text-white mb-4">Taille de Fichier</h3>
              <div className="space-y-4">
                {/* Min */}
                <div>
                  <label className="block text-sm tv:text-base text-gray-300 mb-2">Taille minimale (GB)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={localMinFileSize ? (localMinFileSize / (1024 * 1024 * 1024)).toFixed(1) : ''}
                    onChange={(e) => {
                      const value = parseFloat(e.currentTarget.value);
                      handleFileSizeMinChange(value ? value * 1024 * 1024 * 1024 : undefined);
                    }}
                    className="w-full px-4 py-3 tv:px-6 tv:py-4 bg-glass glass-panel border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-base tv:text-lg min-h-[48px] tv:min-h-[56px] transition-all duration-200"
                    placeholder="0.0"
                  />
                </div>

                {/* Max */}
                <div>
                  <label className="block text-sm tv:text-base text-gray-300 mb-2">Taille maximale (GB)</label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="0.1"
                    value={localMaxFileSize ? (localMaxFileSize / (1024 * 1024 * 1024)).toFixed(1) : ''}
                    onChange={(e) => {
                      const value = parseFloat(e.currentTarget.value);
                      handleFileSizeMaxChange(value ? value * 1024 * 1024 * 1024 : undefined);
                    }}
                    className="w-full px-4 py-3 tv:px-6 tv:py-4 bg-glass glass-panel border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-base tv:text-lg min-h-[48px] tv:min-h-[56px] transition-all duration-200"
                    placeholder="50.0"
                  />
                </div>

                {/* Range Slider (optionnel, plus avancé) */}
                <div className="mt-6">
                  <label className="block text-sm tv:text-base text-gray-300 mb-4">Plage de taille</label>
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={localMaxFileSize ? (localMaxFileSize / (1024 * 1024 * 1024)).toFixed(0) : 50}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        handleFileSizeMaxChange(value * 1024 * 1024 * 1024);
                      }}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50"
                    />
                    <div className="flex justify-between text-xs tv:text-sm text-gray-400 mt-2">
                      <span>0 GB</span>
                      <span className="text-primary-400 font-semibold">
                        {localMaxFileSize ? formatFileSize(localMaxFileSize) : '50 GB'}
                      </span>
                      <span>200 GB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Boutons Actions */}
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => {
                  setLocalSelectedCodecs([]);
                  setLocalMinFileSize(undefined);
                  setLocalMaxFileSize(undefined);
                  onCodecChange?.([]);
                  onFileSizeChange?.(undefined, undefined);
                }}
                className="flex-1 px-6 py-3 tv:px-8 tv:py-4 bg-glass hover:bg-glass-hover text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-200 border border-white/20 glass-panel focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
                tabIndex={0}
              >
                Réinitialiser
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 tv:px-8 tv:py-4 bg-primary hover:bg-primary-700 text-white rounded-lg font-semibold text-base tv:text-lg transition-all duration-200 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
                tabIndex={0}
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}