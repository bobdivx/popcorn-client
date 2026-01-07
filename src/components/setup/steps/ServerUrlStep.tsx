import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';

interface ServerUrlStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function ServerUrlStep({ focusedButtonIndex, buttonRefs, onNext }: ServerUrlStepProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Pré-remplir avec la valeur de .env ou localStorage
    const envUrl = import.meta.env.PUBLIC_SERVER_URL || '';
    const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('server_url') : null;
    // Le client se connecte au frontend Astro du serveur (port 4321 par défaut)
    // ou à une URL de domaine (ex: https://popcorn.briseteia.me)
    const initialUrl = storedUrl || envUrl || 'http://localhost:4321';
    setServerUrl(initialUrl);
  }, []);

  const handleTest = async () => {
    if (!serverUrl.trim()) {
      setError('Veuillez entrer une URL de serveur');
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      // Sauvegarder temporairement l'URL pour le test
      serverApi.setServerUrl(serverUrl.trim());
      
      const response = await serverApi.checkServerHealth();
      
      if (response.success) {
        setSuccess('Connexion réussie !');
        // L'URL est déjà sauvegardée dans localStorage par setServerUrl
      } else {
        setError(response.message || 'Impossible de se connecter au serveur');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setTesting(false);
    }
  };

  const handleNext = () => {
    if (!serverUrl.trim()) {
      setError('Veuillez entrer une URL de serveur');
      return;
    }

    // Sauvegarder l'URL
    serverApi.setServerUrl(serverUrl.trim());
    onNext();
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de l'URL du serveur</h3>
      
      <p className="text-gray-400">
        Entrez l'adresse du serveur Popcorn auquel vous souhaitez vous connecter.
        Cette URL sera utilisée pour toutes les communications avec le serveur.
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>{success}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          URL du serveur
        </label>
        <input
          type="url"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
          placeholder="http://10.1.0.86:4321 ou https://popcorn.briseteia.me"
          value={serverUrl}
          onInput={(e) => {
            setServerUrl((e.target as HTMLInputElement).value);
            setError(null);
            setSuccess(null);
          }}
          disabled={testing}
        />
        <p className="text-sm text-gray-500">
          Format: http://ip:port (local) ou https://domaine.com (production)
        </p>
        <p className="text-xs text-gray-600">
          💡 Pour un domaine, n'incluez pas le port (ex: https://popcorn.briseteia.me)
        </p>
      </div>

      <div className="flex gap-4">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleTest}
          disabled={testing || !serverUrl.trim()}
        >
          {testing ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Test en cours...
            </>
          ) : (
            'Tester la connexion'
          )}
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleNext}
          disabled={!serverUrl.trim()}
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
