interface CompleteStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onComplete: () => void;
}

export function CompleteStep({ focusedButtonIndex, buttonRefs, onComplete }: CompleteStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-24 h-24 rounded-full bg-green-600 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h3 className="text-3xl font-bold text-white mb-2">Configuration terminée !</h3>
        
        <p className="text-lg text-gray-400 mb-6">
          Votre client Popcorn est maintenant configuré et prêt à l'emploi.
        </p>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <p className="text-white mb-4">
            Vous pouvez maintenant commencer à utiliser Popcorn pour rechercher et regarder vos contenus préférés.
          </p>
          
          <div className="flex justify-center">
            <video
              className="max-w-full h-auto rounded-lg"
              autoPlay
              muted
              playsInline
              onEnded={onComplete}
            >
              <source src="/intro.mp4" type="video/mp4" />
              Votre navigateur ne supporte pas la lecture de vidéos.
            </video>
          </div>
        </div>

        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
          onClick={onComplete}
        >
          Accéder au dashboard
        </button>
      </div>
    </div>
  );
}
