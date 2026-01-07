import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

export default function AccountSettings() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getMe();
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        setError(response.message || 'Erreur lors du chargement des informations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[400px]">
        <span class="loading loading-spinner loading-lg text-white"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
        <span>{error}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div class="text-center py-12">
        <p class="text-gray-400">Aucune information utilisateur disponible</p>
      </div>
    );
  }

  return (
    <div class="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-6 sm:p-8 md:p-12">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6 sm:mb-8">Informations du compte</h2>
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-semibold text-gray-400 mb-2">
            Email
          </label>
          <p class="text-white text-lg">{user.email}</p>
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-400 mb-2">
            ID
          </label>
          <p class="text-gray-300 font-mono text-sm break-all">{user.id}</p>
        </div>
      </div>
    </div>
  );
}
