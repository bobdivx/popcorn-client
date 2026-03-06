interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[]; // Labels optionnels pour les étapes affichées
}

export function StepIndicator({ currentStep, totalSteps, stepLabels }: StepIndicatorProps) {
  // Labels par défaut si non fournis (pour compatibilité)
  const defaultLabels = [
    'Disclaimer',
    'Serveur',
    'Auth',
    'Bienvenue',
    'Indexers',
    'TMDB',
    'Téléchargement',
    'Sync',
    'Terminé',
  ];

  // Utiliser les labels fournis ou les labels par défaut
  // S'assurer que le nombre de labels correspond au nombre d'étapes
  const labels = stepLabels && stepLabels.length === totalSteps 
    ? stepLabels 
    : (stepLabels || defaultLabels).slice(0, totalSteps);
  
  const currentLabel = labels[currentStep - 1] || `Étape ${currentStep}`;
  const progressPct = Math.min(100, Math.max(0, Math.round((currentStep / totalSteps) * 100)));

  return (
    <div className="mb-8 sm:mb-10 md:mb-12">
      {/* Mobile: indicateur compact (évite 9 étapes trop serrées) */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-white">
            Étape {currentStep}/{totalSteps}
          </span>
          <span className="text-xs text-gray-400 truncate" title={currentLabel}>{currentLabel}</span>
        </div>
        <div className="mt-3 w-full bg-gray-800 rounded-full h-2">
          <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Desktop/Tablet */}
      <div className="hidden sm:flex items-start justify-between relative w-full">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step, index) => {
          const isActive = currentStep === step;
          const isCompleted = currentStep > step;
          const isLast = index === totalSteps - 1;

          return (
            <div key={step} className="flex-1 flex flex-col items-center relative z-10 min-w-0">
              {/* Ligne de connexion entre les étapes - positionnée entre les cercles */}
              {!isLast && (
                <div
                  className="absolute top-5 sm:top-6 md:top-7 h-0.5 sm:h-1 md:h-1.5 -z-0 pointer-events-none"
                  style={{
                    left: 'calc(50% + 1.25rem)',
                    width: 'calc(100% - 2.5rem)',
                  }}
                >
                  <div
                    className={`h-full w-full transition-all duration-300 ${isCompleted ? 'bg-primary-600' : 'bg-gray-700'}`}
                  />
                </div>
              )}

              {/* Cercle de l'étape */}
              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-sm sm:text-base md:text-lg font-bold transition-all duration-300 flex-shrink-0 relative z-10 ${
                  isActive
                    ? 'bg-primary-600 text-white scale-110 shadow-primary ring-2 sm:ring-3 ring-primary-600/50'
                    : isCompleted
                      ? 'bg-primary-600/80 text-white'
                      : 'bg-glass text-gray-400 border border-gray-700'
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step
                )}
              </div>

              {/* Label de l'étape */}
              <div
                className={`mt-2 sm:mt-3 md:mt-4 text-[10px] sm:text-xs md:text-sm text-center w-full px-1 sm:px-2 line-clamp-2 ${
                  isActive
                    ? 'text-primary-400 font-semibold'
                    : isCompleted
                      ? 'text-gray-400 font-medium'
                      : 'text-gray-500'
                }`}
              >
                {labels[step - 1] || `Étape ${step}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
