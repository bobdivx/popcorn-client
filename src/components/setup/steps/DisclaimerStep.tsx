import { useState } from 'preact/hooks';

interface DisclaimerStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function DisclaimerStep({ focusedButtonIndex, buttonRefs, onNext }: DisclaimerStepProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Avertissement et Clause de Non-Responsabilité</h3>
      
      <div className="bg-gray-900 rounded-lg p-6 max-h-96 overflow-y-auto border border-yellow-700">
        <div className="space-y-4 text-sm text-gray-300">
          <div>
            <h4 className="font-bold text-white mb-2">1. Nature de l'Application</h4>
            <p>
              Popcorn Client est un outil technique permettant de se connecter à un serveur distant 
              pour la recherche, le téléchargement et la lecture de contenu multimédia via le protocole 
              BitTorrent. Cette application est fournie "en l'état" à des fins éducatives et techniques uniquement.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">2. Responsabilité de l'Utilisateur</h4>
            <p>
              <strong>L'utilisateur est entièrement et exclusivement responsable</strong> de tous les contenus 
              qu'il recherche, télécharge, stocke, ou consulte via cette application. L'utilisateur reconnaît 
              qu'il est de sa seule responsabilité de :
            </p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              <li>Respecter toutes les lois et réglementations applicables dans sa juridiction</li>
              <li>Respecter les droits de propriété intellectuelle (droits d'auteur, marques déposées, etc.)</li>
              <li>Vérifier la légalité du téléchargement et de la consultation de tout contenu</li>
              <li>Obtenir les autorisations nécessaires avant de télécharger ou consulter du contenu protégé</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">3. Non-Responsabilité du Développeur</h4>
            <p>
              Le développeur de cette application décline toute responsabilité concernant :
            </p>
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              <li>Le contenu téléchargé, stocké ou consulté par l'utilisateur</li>
              <li>La légalité des actions effectuées par l'utilisateur via cette application</li>
              <li>Les violations de droits d'auteur ou de propriété intellectuelle</li>
              <li>Les dommages directs, indirects, consécutifs ou accessoires résultant de l'utilisation de l'application</li>
              <li>La perte de données, les interruptions de service, ou les problèmes techniques</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">4. Protection des Données et Confidentialité</h4>
            <p>
              Cette application utilise un chiffrement end-to-end (E2E) pour protéger les données utilisateur. 
              Le développeur n'a <strong>aucun accès</strong> aux données personnelles, aux préférences, 
              aux bibliothèques de contenu, ou à toute autre information stockée par l'utilisateur. 
              Toutes les communications entre le client et le serveur sont chiffrées, et les données 
              sensibles sont stockées localement sur l'appareil de l'utilisateur ou sur un serveur 
              sous le contrôle exclusif de l'utilisateur.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">5. Avertissement Légal</h4>
            <p>
              <strong className="text-warning">ATTENTION :</strong> Le téléchargement et la consultation 
              de contenu protégé par le droit d'auteur sans autorisation peut constituer une violation 
              de la loi dans de nombreuses juridictions. L'utilisateur est seul responsable de s'assurer 
              que ses actions sont légales dans sa juridiction. Le développeur ne peut être tenu responsable 
              des conséquences légales résultant de l'utilisation de cette application.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">6. Utilisation à Vos Risques</h4>
            <p>
              Cette application est fournie "TEL QUELLE", sans garantie d'aucune sorte, expresse ou implicite, 
              y compris mais sans s'y limiter, les garanties de qualité marchande, d'adéquation à un usage 
              particulier, et de non-contrefaçon. L'utilisateur utilise cette application à ses propres risques.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-2">7. Acceptation des Conditions</h4>
            <p>
              En utilisant cette application, l'utilisateur reconnaît avoir lu, compris et accepté 
              les termes de ce disclaimer. Si l'utilisateur n'accepte pas ces conditions, 
              il ne doit pas utiliser cette application.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          className="w-4 h-4 mt-1 text-primary-600 bg-gray-900 border-gray-700 rounded focus:ring-primary-600"
          checked={accepted}
          onChange={(e) => setAccepted((e.target as HTMLInputElement).checked)}
        />
        <span className="text-gray-300 text-sm">
          J'ai lu et j'accepte les termes de ce disclaimer. Je comprends que je suis entièrement 
          responsable de mon utilisation de cette application et de tout contenu que je télécharge ou consulte.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <a
          href="/disclaimer"
          target="_blank"
          className="text-primary-600 hover:text-primary-500 transition-colors text-sm text-center sm:text-left"
        >
          Lire le disclaimer complet →
        </a>
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onNext}
          disabled={!accepted}
        >
          J'accepte et je continue →
        </button>
      </div>
    </div>
  );
}
