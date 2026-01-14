import { useState, useEffect } from 'preact/hooks';
import { getBackendUrl, setBackendUrl as saveBackendUrl } from '../../../lib/backend-config.js';

interface ServerUrlStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function ServerUrlStep({ focusedButtonIndex, buttonRefs, onNext }: ServerUrlStepProps) {
  const [backendUrl, setBackendUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Charger l'URL du backend Rust depuis localStorage
    loadBackendUrl();
  }, []);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError(null);
      
      // Récupérer l'URL du backend depuis localStorage
      const url = getBackendUrl();
      setBackendUrl(url);
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      // Valeur par défaut en cas d'erreur
      setBackendUrl('http://127.0.0.1:3000');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL de backend Rust');
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
        }
        throw e;
      }

      // Tester la connexion au backend Rust directement
      const response = await fetch(`${backendUrl.trim()}/api/client/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        setSuccess('Connexion réussie ! Le backend Rust est accessible.');
      } else {
        setError(`Impossible de se connecter au backend Rust (${response.status}). Vérifiez que l'URL est correcte et que le backend Rust est démarré.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL de backend Rust');
      return;
    }

    try {
      setTesting(true);
      setError(null);

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          setError('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
          setTesting(false);
          return;
        }
        throw e;
      }

      // Sauvegarder l'URL dans localStorage
      saveBackendUrl(backendUrl.trim());

      // Continuer au prochain step
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de l'URL du backend Rust</h3>
      
      <p className="text-gray-400">
        Entrez l'adresse du backend Rust auquel le client Astro doit se connecter.
        Cette URL est stockée dans localStorage et utilisée par les routes API du client pour faire le proxy vers le backend Rust.
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

      {loading && (
        <div className="bg-gray-900/30 border border-gray-700 rounded-lg p-4 text-gray-300">
          <span className="loading loading-spinner loading-sm"></span> Chargement de la configuration...
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          URL du Backend Rust
        </label>
        <input
          type="url"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
          placeholder="http://127.0.0.1:3000"
          value={backendUrl}
          onInput={(e) => {
            setBackendUrl((e.target as HTMLInputElement).value);
            setError(null);
            setSuccess(null);
          }}
          disabled={testing || loading}
        />
        <p className="text-sm text-gray-500">
          Format: http://ip:3000 (local) ou http://192.168.1.100:3000 (réseau local)
        </p>
        <p className="text-xs text-gray-600">
          💡 Cette URL est stockée dans localStorage et utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust. Le backend Rust utilise le port 3000 par défaut.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleTest}
          disabled={testing || loading || !backendUrl.trim()}
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
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleNext}
          disabled={testing || loading || !backendUrl.trim()}
        >
          {testing ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Sauvegarde...
            </>
          ) : (
            'Suivant →'
          )}
        </button>
      </div>
    </div>
  );
}
