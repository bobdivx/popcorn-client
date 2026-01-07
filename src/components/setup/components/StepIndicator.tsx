interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const stepLabels = [
    'Disclaimer',
    'Serveur',
    'Bienvenue',
    'Indexers',
    'TMDB',
    'Téléchargement',
    'Terminé',
  ];

  return (
    <div className="mb-6 sm:mb-8 md:mb-12">
      <div className="flex items-center justify-between relative w-full">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex-1 flex flex-col items-center relative z-10 min-w-0">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center text-base sm:text-lg md:text-xl font-bold transition-all duration-300 flex-shrink-0 ${
              currentStep >= step 
                ? 'bg-red-600 text-white scale-110 shadow-lg ring-2 sm:ring-4 ring-red-600/50' 
                : 'bg-gray-800 text-gray-400'
            }`}>
              {step}
            </div>
            <div className={`mt-1.5 sm:mt-2 md:mt-3 text-[10px] sm:text-xs md:text-sm text-center w-full px-0.5 sm:px-1 truncate ${
              currentStep >= step ? 'text-red-600 font-semibold' : 'text-gray-500'
            }`}>
              {stepLabels[step - 1]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
