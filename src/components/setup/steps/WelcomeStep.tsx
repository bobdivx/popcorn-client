interface WelcomeStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function WelcomeStep({ focusedButtonIndex, buttonRefs, onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <p className="text-xl sm:text-2xl md:text-3xl text-white text-center leading-relaxed">
        Bienvenue dans Popcorn Client !
      </p>
      <p className="text-lg sm:text-xl text-gray-400 text-center">
        Ce wizard va vous guider pour configurer votre client.
      </p>
      <div className="bg-gray-900 rounded-xl p-6 sm:p-8 border border-gray-800">
        <p className="text-lg sm:text-xl text-white mb-4 font-semibold">
          Vous devrez configurer :
        </p>
        <ul className="space-y-3 sm:space-y-4 text-gray-300 text-base sm:text-lg">
          <li className="flex items-start">
            <span className="text-red-600 mr-3 text-xl">•</span>
            <span>Au moins un indexer pour récupérer les torrents</span>
          </li>
          <li className="flex items-start">
            <span className="text-red-600 mr-3 text-xl">•</span>
            <span>Une clé API TMDB pour enrichir les métadonnées</span>
          </li>
          <li className="flex items-start">
            <span className="text-red-600 mr-3 text-xl">•</span>
            <span>L'emplacement de téléchargement local</span>
          </li>
        </ul>
      </div>
      <div className="flex justify-end mt-8 sm:mt-12">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-lg"
          onClick={onNext}
        >
          Commencer
        </button>
      </div>
    </div>
  );
}
