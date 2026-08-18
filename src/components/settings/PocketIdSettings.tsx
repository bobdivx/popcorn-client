import { useEffect, useState } from 'preact/hooks';
import { getOidcLinkStatus, startOidcLink, unlinkOidc } from '../../lib/api/popcorn-web';
import { useI18n } from '../../lib/i18n/useI18n';

export default function PocketIdSettings() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const status = await getOidcLinkStatus();
      setAvailable(status.available);
      setLinked(status.linked);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pocket_id') === 'linked') {
      setSuccess(t('loginForm.sso.linkSuccess'));
    }
    loadStatus();
  }, []);

  const handleLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const redirectUrl = await startOidcLink(window.location.href);
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await unlinkOidc();
      setLinked(false);
      setSuccess(t('loginForm.sso.unlinkSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!available && !linked) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="text-lg font-semibold text-white mb-2">{t('loginForm.sso.settingsTitle')}</h3>
      {error && <p className="text-red-300 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-300 text-sm mb-3">{success}</p>}
      <p className="text-white/70 text-sm mb-4">
        {linked ? t('loginForm.sso.linkedDescription') : t('loginForm.sso.unlinkedDescription')}
      </p>
      {linked ? (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium disabled:opacity-50"
        >
          {busy ? t('common.loading') : t('loginForm.sso.unlink')}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleLink}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-700 text-white font-medium disabled:opacity-50"
        >
          {busy ? t('common.loading') : t('loginForm.sso.link')}
        </button>
      )}
    </section>
  );
}
