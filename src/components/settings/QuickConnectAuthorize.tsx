import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { TokenManager } from '../../lib/client/storage';
import { getLocalUsers, type LocalUser } from '../../lib/api/popcorn-web';
import { useI18n } from '../../lib/i18n/useI18n';

export default function QuickConnectAuthorize() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Compte à connecter sur le nouvel appareil : le vôtre ('') ou l'un de vos invités actifs.
  const [guests, setGuests] = useState<LocalUser[]>([]);
  const [targetUserId, setTargetUserId] = useState('');

  useEffect(() => {
    if (TokenManager.getCloudAccessToken() === null) return;
    let cancelled = false;
    getLocalUsers()
      .then((users) => {
        if (!cancelled) setGuests((users || []).filter((u) => u.isActive));
      })
      .catch(() => {
        // Liste des invités indisponible : connexion du compte principal uniquement.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthorize = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!code || code.length !== 6) {
      setError(t('quickConnectAuthorize.codeLengthError'));
      return;
    }

    setLoading(true);

    try {
      const response = await serverApi.authorizeQuickConnect(code, targetUserId || undefined);

      if (!response.success) {
        setError(response.message || t('quickConnectAuthorize.authorizeError'));
        setLoading(false);
        return;
      }

      setSuccess(t('quickConnectAuthorize.success'));
      setCode('');
      
      // Effacer le message de succès après 5 secondes
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      setError(t('quickConnectAuthorize.authorizeError'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-6 sm:mb-8">{t('quickConnectAuthorize.title')}</h2>
      
      <p class="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8">
        {t('quickConnectAuthorize.description')}
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
            {t('quickConnectAuthorize.codeLabel')}
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
            {t('quickConnectAuthorize.codeHint')}
          </p>
        </div>

        {guests.length > 0 && (
          <div>
            <label class="block text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">
              {t('quickConnectAuthorize.accountLabel')}
            </label>
            <select
              class="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white"
              value={targetUserId}
              onChange={(e) => setTargetUserId((e.target as HTMLSelectElement).value)}
              disabled={loading}
            >
              <option value="">{t('quickConnectAuthorize.myAccount')}</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {t('quickConnectAuthorize.guestOption', { name: g.displayName || g.email })}
                </option>
              ))}
            </select>
            <p class="text-gray-400 text-xs sm:text-sm mt-2 sm:mt-3">
              {t('quickConnectAuthorize.guestHint')}
            </p>
          </div>
        )}

        <div class="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4 sm:pt-6">
          <button
            type="submit"
            class="btn btn-primary w-full sm:w-auto"
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <>
                <span class="loading loading-spinner loading-sm"></span>
                {t('quickConnectAuthorize.authorizing')}
              </>
            ) : (
              t('quickConnectAuthorize.submit')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
