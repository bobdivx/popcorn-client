import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

export default function ServerSettings() {
  const [serverUrl, setServerUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Charger la configuration au démarrage
  useEffect(() => {
    const stored = localStorage.getItem('server_url');
    if (stored) {
      setServerUrl(stored);
      setSavedUrl(stored);
      serverApi.setServerUrl(stored);
    } else {
      // Utiliser depuis les variables d'environnement
      const envUrl = import.meta.env.PUBLIC_SERVER_URL;
      if (envUrl) {
        setServerUrl(envUrl);
        setSavedUrl(envUrl);
        serverApi.setServerUrl(envUrl);
      }
    }
  }, []);

  const handleTest = async () => {
    if (!serverUrl.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }

    try {
      setTesting(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(serverUrl);
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

      // Tester la connexion
      serverApi.setServerUrl(serverUrl.trim());
      const response = await serverApi.checkServerHealth();

      if (!response.success) {
        throw new Error(response.message || 'Impossible de se connecter au serveur. Vérifiez que l\'URL est correcte et que le serveur est accessible.');
      }

      setSuccess('Connexion réussie ! Le serveur est accessible.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du test de connexion');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!serverUrl.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Valider l'URL
      try {
        const urlObj = new URL(serverUrl);
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
      serverApi.setServerUrl(serverUrl.trim());
      const response = await serverApi.checkServerHealth();
      setTesting(false);

      if (!response.success) {
        throw new Error(response.message || 'Impossible de se connecter au serveur. Vérifiez que l\'URL est correcte et que le serveur est accessible.');
      }

      // Sauvegarder la configuration
      localStorage.setItem('server_url', serverUrl.trim());
      setSavedUrl(serverUrl.trim());
      setSuccess('Configuration sauvegardée avec succès !');

      // Recharger la page après un court délai pour appliquer la nouvelle configuration
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      setTesting(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('server_url');
    setSavedUrl(null);
    const envUrl = import.meta.env.PUBLIC_SERVER_URL || '';
    setServerUrl(envUrl);
    setError('');
    setSuccess('Configuration réinitialisée. Rechargez la page pour appliquer les changements.');
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

      {/* Configuration actuelle */}
      {savedUrl && (
        <div class="p-4 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p class="text-blue-300">
            <strong>URL actuelle:</strong> {savedUrl}
          </p>
        </div>
      )}

      {/* Carte de configuration */}
      <div class="p-4 sm:p-6 md:p-8 rounded-xl bg-gradient-to-br from-gray-900 to-black border-2 border-gray-800">
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              URL du Serveur
            </label>
            <input
              type="text"
              value={serverUrl}
              onInput={(e) => {
                setServerUrl((e.target as HTMLInputElement).value);
                setError('');
                setSuccess('');
              }}
              placeholder="http://10.1.0.86:4321 ou https://popcorn.briseteia.me"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              disabled={saving || testing}
            />
            <p class="mt-2 text-sm text-gray-400">
              Exemples: http://192.168.1.100:4321 (local) ou https://popcorn.briseteia.me (domaine)
            </p>
            <p class="mt-1 text-xs text-gray-500">
              💡 Pour un domaine, n'incluez pas le port (ex: https://popcorn.briseteia.me)
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleTest}
              disabled={testing || saving || !serverUrl.trim()}
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
              disabled={saving || testing || !serverUrl.trim()}
              class="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 min-h-[48px] focus:outline-none focus:ring-4 focus:ring-red-500 flex-1"
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

            {savedUrl && (
              <button
                onClick={handleReset}
                disabled={saving || testing}
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
            • L'URL du serveur est stockée localement dans votre navigateur
          </p>
          <p>
            • Après modification, la page sera automatiquement rechargée
          </p>
          <p>
            • Assurez-vous que le serveur est accessible depuis votre réseau
          </p>
          <p>
            • Pour les connexions distantes, utilisez HTTPS si possible
          </p>
        </div>
      </div>
    </div>
  );
}
