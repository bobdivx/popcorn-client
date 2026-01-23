import { useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

export default function QuickConnectAuthorize() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAuthorize = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!code || code.length !== 6) {
      setError('Veuillez entrer un code à 6 caractères');
      return;
    }

    setLoading(true);

    try {
      const response = await serverApi.authorizeQuickConnect(code);

      if (!response.success) {
        setError(response.message || 'Erreur lors de l\'autorisation');
        setLoading(false);
        return;
      }

      setSuccess('Code autorisé avec succès ! L\'appareil peut maintenant se connecter.');
      setCode('');
      
      // Effacer le message de succès après 5 secondes
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      setError('Erreur lors de l\'autorisation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body">
        <h2 className="card-title">Connexion rapide</h2>
        
        <p className="text-gray-400 text-sm mb-4">
          Autorisez un nouvel appareil à se connecter en entrant le code de connexion rapide affiché sur cet appareil.
        </p>

        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleAuthorize} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Code de connexion rapide
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent text-center text-2xl font-mono tracking-widest uppercase"
              placeholder="ABC123"
              value={code}
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
                setCode(value);
              }}
              required
              disabled={loading}
              maxLength={6}
              autoFocus
            />
            <p className="text-gray-400 text-xs mt-2">
              Entrez le code à 6 caractères affiché sur le nouvel appareil
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Autorisation...
                </>
              ) : (
                'Autoriser la connexion'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
