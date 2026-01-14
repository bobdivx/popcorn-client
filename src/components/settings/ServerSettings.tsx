import { useState, useEffect } from 'preact/hooks';
import { getBackendUrl, setBackendUrl as saveBackendUrl, clearBackendUrl, hasBackendUrl } from '../../lib/backend-config.js';

export default function ServerSettings() {
  const [backendUrl, setBackendUrl] = useState('');
  const [savedBackendUrl, setSavedBackendUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Charger la configuration depuis localStorage au démarrage
  useEffect(() => {
    loadBackendUrl();
  }, []);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError('');
      
      // Récupérer l'URL du backend depuis localStorage
      const url = getBackendUrl();
      setBackendUrl(url);
      
      // Vérifier si une URL est configurée (pas juste la valeur par défaut)
      if (hasBackendUrl()) {
        setSavedBackendUrl(url);
      } else {
        setSavedBackendUrl(null);
      }
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      const defaultUrl = 'http://127.0.0.1:3000';
      setBackendUrl(defaultUrl);
      setSavedBackendUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }

    try {
      setTesting(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        // Vérifier que le protocole est http ou https
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

      if (!response.ok) {
        throw new Error(`Impossible de se connecter au backend Rust (${response.status}). Vérifiez que l'URL est correcte et que le backend Rust est démarré.`);
      }

      setSuccess('Connexion réussie ! Le backend Rust est accessible.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du test de connexion');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        // Vérifier que le protocole est http ou https
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
        }
        throw e;
      }

      // Tester la connexion avant de sauvegarder
      setTesting(true);
      const testResponse = await fetch(`${backendUrl.trim()}/api/client/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      setTesting(false);

      if (!testResponse.ok) {
        throw new Error(`Impossible de se connecter au backend Rust (${testResponse.status}). Vérifiez que l'URL est correcte et que le backend Rust est démarré.`);
      }

      // Sauvegarder la configuration dans localStorage
      saveBackendUrl(backendUrl.trim());

      setSavedBackendUrl(backendUrl.trim());
      setSuccess('Configuration sauvegardée avec succès dans localStorage !');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      setTesting(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    try {
      setSaving(true);
      setError('');
      
      // Réinitialiser à la valeur par défaut
      const defaultUrl = 'http://127.0.0.1:3000';
      clearBackendUrl();
      setBackendUrl(defaultUrl);
      setSavedBackendUrl(null);
      setSuccess('Configuration réinitialisée à la valeur par défaut.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="space-y-6">
      {/* Messages d'erreur et de succès */}
      {error && (
        <div class="p-4 bg-red-900/30 border border-red-600 rounded-lg">
          <span class="text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div class="p-4 bg-green-900/30 border border-green-600 rounded-lg">
          <span class="text-green-300">{success}</span>
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <div class="p-4 bg-gray-900/30 border border-gray-600 rounded-lg">
          <p class="text-gray-300">
            <span class="loading loading-spinner loading-sm"></span> Chargement de la configuration...
          </p>
        </div>
      )}

      {/* Configuration actuelle */}
      {!loading && savedBackendUrl && (
        <div class="p-4 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p class="text-blue-300">
            <strong>URL du backend Rust actuelle:</strong> {savedBackendUrl}
          </p>
          <p class="text-blue-400 text-sm mt-2">
            Cette URL est stockée dans localStorage et utilisée par les routes API du client.
          </p>
        </div>
      )}

      {/* Carte de configuration */}
      <div class="p-4 sm:p-6 md:p-8 rounded-xl bg-gradient-to-br from-gray-900 to-black border-2 border-gray-800">
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              URL du Backend Rust
            </label>
            <input
              type="text"
              value={backendUrl}
              onInput={(e) => {
                setBackendUrl((e.target as HTMLInputElement).value);
                setError('');
                setSuccess('');
              }}
              placeholder="http://127.0.0.1:3000"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={saving || testing || loading}
            />
            <p class="mt-2 text-sm text-gray-400">
              Exemples: http://127.0.0.1:3000 (local) ou http://192.168.1.100:3000 (réseau local)
            </p>
            <p class="mt-1 text-xs text-gray-500">
              💡 Cette URL est stockée dans localStorage et utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust. Le backend Rust utilise le port 3000 par défaut.
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleTest}
              disabled={testing || saving || loading || !backendUrl.trim()}
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-blue-500"
            >
              {testing ? (
                <span class="flex items-center gap-2">
                  <span class="loading loading-spinner loading-sm"></span>
                  Test en cours...
                </span>
              ) : (
                'Tester la connexion'
              )}
            </button>

            <button
              onClick={handleSave}
              disabled={saving || testing || loading || !backendUrl.trim()}
              class="bg-primary hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-primary-500 flex-1"
            >
              {saving ? (
                <span class="flex items-center gap-2">
                  <span class="loading loading-spinner loading-sm"></span>
                  Sauvegarde...
                </span>
              ) : testing ? (
                'Test en cours...'
              ) : (
                'Tester et Sauvegarder'
              )}
            </button>

            {savedBackendUrl && (
              <button
                onClick={handleReset}
                disabled={saving || testing || loading}
                class="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-gray-500"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Informations supplémentaires */}
      <div class="p-4 sm:p-6 md:p-8 rounded-xl bg-gradient-to-br from-gray-900 to-black border-2 border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-4">Informations</h3>
        <div class="space-y-3 text-sm text-gray-400">
          <p>
            • L'URL du backend Rust est stockée dans localStorage (côté client)
          </p>
          <p>
            • Cette URL est utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust
          </p>
          <p>
            • Assurez-vous que le backend Rust est démarré et accessible sur cette URL
          </p>
          <p>
            • Le backend Rust utilise le port 3000 par défaut (configurable via BACKEND_PORT)
          </p>
        </div>
      </div>
    </div>
  );
}
