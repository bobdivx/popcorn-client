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
    <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-6 sm:mb-8">Connexion rapide</h2>
      
      <p class="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8">
        Autorisez un nouvel appareil à se connecter en entrant le code de connexion rapide affiché sur cet appareil.
      </p>

      {error && (
        <div class="alert alert-error mb-6">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div class="alert alert-success mb-6">
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleAuthorize} class="space-y-4 sm:space-y-6">
        <div>
          <label class="block text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">
            Code de connexion rapide
          </label>
          <input
            type="text"
            class="w-full px-4 sm:px-6 py-3 sm:py-4 bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent text-center text-xl sm:text-2xl md:text-3xl font-mono tracking-widest uppercase"
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
          <p class="text-gray-400 text-xs sm:text-sm mt-2 sm:mt-3">
            Entrez le code à 6 caractères affiché sur le nouvel appareil
          </p>
        </div>

        <div class="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 sm:pt-6">
          <button
            type="submit"
            class="btn btn-primary w-full sm:w-auto"
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <>
                <span class="loading loading-spinner loading-sm"></span>
                Autorisation...
              </>
            ) : (
              'Autoriser la connexion'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
