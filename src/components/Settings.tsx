import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { PreferencesManager } from '../lib/client/storage';

export default function Settings() {
  const [serverUrl, setServerUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Charger l'URL du serveur depuis le localStorage
    const stored = localStorage.getItem('server_url');
    if (stored) {
      setServerUrl(stored);
      serverApi.setServerUrl(stored);
    } else {
      // Essayer depuis les variables d'environnement
      const envUrl = import.meta.env.PUBLIC_SERVER_URL;
      if (envUrl) {
        setServerUrl(envUrl);
        serverApi.setServerUrl(envUrl);
      }
    }
  }, []);

  const handleSave = () => {
    if (!serverUrl.trim()) {
      setError('URL du serveur requise');
      return;
    }

    try {
      // Valider l'URL
      new URL(serverUrl);
      serverApi.setServerUrl(serverUrl);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError('URL invalide');
    }
  };

  const preferences = PreferencesManager.getPreferences();

  return (
    <div className="max-w-2xl space-y-6">
      {/* Configuration du serveur */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Configuration du serveur</h2>
          <p className="text-sm text-gray-400 mb-4">
            Configurez l'URL du serveur Popcorn auquel se connecter
          </p>
          
          <div className="form-control">
            <label className="label">
              <span className="label-text">URL du serveur</span>
            </label>
            <input
              type="text"
              placeholder="http://localhost:4321"
              className="input input-bordered"
              value={serverUrl}
              onInput={(e) => setServerUrl((e.target as HTMLInputElement).value)}
            />
            <label className="label">
              <span className="label-text-alt text-gray-400">
                Exemple: http://192.168.1.100:4321 ou https://popcorn.example.com
              </span>
            </label>
          </div>

          {error && (
            <div className="alert alert-error mt-4">
              <span>{error}</span>
            </div>
          )}

          {saved && (
            <div className="alert alert-success mt-4">
              <span>Configuration sauvegardée !</span>
            </div>
          )}

          <div className="card-actions justify-end mt-4">
            <button className="btn btn-primary" onClick={handleSave}>
              Sauvegarder
            </button>
          </div>
        </div>
      </div>

      {/* Préférences utilisateur */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Préférences</h2>
          
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text">Thème sombre</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={preferences.theme !== 'light'}
                onChange={(e) => {
                  const theme = (e.target as HTMLInputElement).checked ? 'dark' : 'light';
                  PreferencesManager.updatePreferences({ theme });
                  if (typeof document !== 'undefined') {
                    document.documentElement.dataset.theme = theme;
                  }
                }}
              />
            </label>
          </div>

          <div className="form-control mt-4">
            <label className="label cursor-pointer">
              <span className="label-text">Lecture automatique</span>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={preferences.autoplay || false}
                onChange={(e) => {
                  PreferencesManager.updatePreferences({
                    autoplay: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Informations */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Informations</h2>
          <div className="space-y-2 text-sm">
            <p>
              <strong>Version:</strong> {((import.meta as any).env?.PUBLIC_APP_VERSION as string) || '1.0.1'}
            </p>
            <p>
              <strong>Type:</strong> Client léger
            </p>
            <p className="text-gray-400">
              Cette application est un client léger. Toute la logique métier
              (torrents, indexers, streaming) est gérée par le serveur distant.
            </p>
          </div>
        </div>
      </div>

      {/* Lien vers le disclaimer */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <h2 className="card-title">Informations légales</h2>
          <div className="space-y-2 text-sm">
            <a
              href="/disclaimer"
              target="_blank"
              className="link link-primary"
            >
              Lire l'avertissement et la clause de non-responsabilité →
            </a>
            <p className="text-gray-400 text-xs mt-2">
              Important : Veuillez lire attentivement le disclaimer avant d'utiliser cette application.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
